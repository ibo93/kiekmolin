'use strict';

// Eine Anruf-Sitzung: verbindet Twilio Media Stream (Telefonleitung),
// Deepgram (zuhoeren), die Dialog-Sitzung (denken) und ElevenLabs (sprechen).
//
// Ablauf pro Anruf:
//   Twilio 'start'  -> Deepgram + Dialog starten, Begruessung sprechen
//   Twilio 'media'  -> Audio an Deepgram weiterleiten
//   Deepgram Satz   -> Dialog fragen -> Antwort als Audio zurueck auf die Leitung
//   'gespraech_beenden' -> verabschieden und auflegen

const fs = require('fs');
const path = require('path');
const { DeepgramStrom } = require('./deepgram');
const { spreche, sprecheGecached, inSaetze } = require('./elevenlabs');
const { DialogSitzung } = require('./dialog');

const LOG_ORDNER = path.join(__dirname, '..', 'logs');

// Denk-Fueller: Dauert die Antwort laenger (Verfuegbarkeits-Pruefung, DB),
// entsteht KEINE Totenstille - der Agent sagt kurz Bescheid, wie ein Mensch.
// Werden gecached gesprochen, kosten also nach dem ersten Mal nichts mehr.
const FUELLER = [
  'Einen kleinen Moment bitte.',
  'Moment, ich schaue kurz nach.',
  'Einen Augenblick bitte.'
];
const FUELLER_NACH_MS = parseInt(process.env.FUELLER_NACH_MS || '1300', 10);

class AnrufSitzung {
  constructor({ twilioWs, restaurant, menue, stufe, datenquelle, pruefeToken, holeKontext }) {
    this.ws = twilioWs;
    this.restaurant = restaurant || null;  // fest (Ein-Kunden-Betrieb/Simulator) ...
    this.menue = menue || [];
    this.holeKontext = holeKontext || null; // ... oder pro Anruf aus dem <Parameter> (mandantenfaehig)
    this.stufe = stufe;
    this.datenquelle = datenquelle;
    this.pruefeToken = pruefeToken || null;
    this.streamSid = null;
    this.anrufer = '';
    this.spricht = false;       // gerade eigene Ausgabe auf der Leitung?
    this.denkt = false;         // wartet gerade auf Claude?
    this.logZeilen = [];
    this.dialog = null;
    this.markZaehler = 0;       // eindeutige Marken fuer Twilios Playback-Echo
    this.offeneMark = null;     // Name der zuletzt gesendeten Marke
    this.auflegenNachMark = false; // nach dieser Marke auflegen (Abschied fertig gesprochen)
    this.sprechKette = Promise.resolve(); // Ausgaben strikt nacheinander (Fueller vor Antwort)
    this.fuellerIndex = 0;      // rotiert durch die Denk-Fueller (klingt natuerlicher)

    this.ws.on('message', (roh) => this.twilioNachricht(roh));
    this.ws.on('close', () => this.aufraeumen());

    // Verbindung ohne gueltigen Start binnen 10 s trennen (kein Socket-Parken)
    this.startWaechter = setTimeout(() => {
      if (!this.streamSid) { try { this.ws.close(); } catch (_e) {} }
    }, 10000);
  }

  log(zeile) {
    const eintrag = new Date().toISOString() + ' ' + zeile;
    console.log('[Anruf] ' + zeile);
    this.logZeilen.push(eintrag);
  }

  twilioNachricht(roh) {
    let msg;
    try { msg = JSON.parse(roh.toString()); } catch (_e) { return; }

    if (msg.event === 'start') {
      const params = msg.start.customParameters || {};

      // Nur Streams zulassen, die unser /anruf-Webhook selbst autorisiert hat
      // (kurzlebiges Token im <Parameter>). Alles andere: sofort trennen.
      if (this.pruefeToken && !this.pruefeToken(params.token)) {
        console.warn('[Anruf] Media-Stream ohne gueltiges Token abgewiesen');
        try { this.ws.close(); } catch (_e) {}
        return;
      }

      // Mandantenfaehig: welches Restaurant vertritt dieser Anruf?
      if (this.holeKontext) {
        const kontext = this.holeKontext(params.restaurant);
        if (!kontext) {
          console.warn('[Anruf] Kein Restaurant fuer Stream-Parameter "' + params.restaurant + '" - trenne');
          try { this.ws.close(); } catch (_e) {}
          return;
        }
        this.restaurant = kontext.restaurant;
        this.menue = kontext.menue;
        // Eigene Stimme, Stufe und Faehigkeiten pro Gastronom (nummern.json)
        if (kontext.stimme) this.stimme = kontext.stimme;
        if (kontext.stufe) this.stufe = kontext.stufe;
        if (kontext.kann) this.kann = kontext.kann;
        // Betrieb ohne Kiek mol in: eigene Ablage statt Datenbank
        if (kontext.datenquelle) this.datenquelle = kontext.datenquelle;
      }

      clearTimeout(this.startWaechter);
      this.streamSid = msg.start.streamSid;
      this.startZeit = Date.now();
      this.anrufer = params.anrufer || '';
      this.log('Anruf gestartet von ' + (this.anrufer || 'unbekannt') + ' fuer ' + this.restaurant.name);

      this.dialog = new DialogSitzung({
        restaurant: this.restaurant,
        menue: this.menue,
        stufe: this.stufe,
        anrufer: this.anrufer,
        datenquelle: this.datenquelle,
        kann: this.kann,
        log: (z) => this.log(z)
      });

      this.deepgram = new DeepgramStrom({
        onSatz: (satz) => this.gastSagte(satz),
        onFehler: (e) => this.log('Deepgram-Fehler: ' + e.message)
      });

      // Begruessung: Fehler abfangen, sonst crasht eine unbehandelte
      // Promise-Rejection (ElevenLabs down) den ganzen Server.
      // Gecached: ab dem zweiten Anruf liegt das Audio sofort bereit -
      // der Gast hoert beim Abheben keine Sekunde Stille.
      this.sprich(this.dialog.begruessung(), { cache: true }).catch((e) => this.log('Begruessung-Fehler: ' + e.message));
    } else if (msg.event === 'media') {
      if (this.deepgram) this.deepgram.sendeAudio(Buffer.from(msg.media.payload, 'base64'));
    } else if (msg.event === 'mark') {
      // Twilio hat unsere Marke erreicht = die Ausgabe ist wirklich fertig abgespielt.
      // Erst JETZT ist die Leitung frei (nicht schon nach dem Fuellen des Puffers).
      if (msg.mark && msg.mark.name === this.offeneMark) {
        this.spricht = false;
        this.offeneMark = null;
        if (this.auflegenNachMark) {
          // Erst auflegen, wenn wirklich ALLES gesprochen ist: beim Streaming
          // koennen noch Saetze in der Sprech-Kette warten.
          this.sprechKette.then(() => {
            if (!this.spricht) { try { this.ws.close(); } catch (_e) {} }
          });
        }
      }
    } else if (msg.event === 'stop') {
      this.log('Anruf beendet (Twilio stop)');
      this.aufraeumen();
    }
  }

  async gastSagte(satz) {
    // Nach der Verabschiedung (kurz vor dem Auflegen) kein neues Gespraech starten
    if (this.dialog && this.dialog.beendet) return;
    this.log('GAST: ' + satz);

    // Barge-in: Gast spricht, waehrend wir sprechen -> eigene Ausgabe stoppen
    if (this.spricht) this.stoppeAusgabe();

    // Waehrend Claude noch denkt, nicht parallel verarbeiten - aber die
    // Aeusserung MERKEN (z.B. "Moment, doch 20 Uhr!") und danach anhaengen.
    if (this.denkt) {
      this.wartenderSatz = ((this.wartenderSatz || '') + ' ' + satz).trim();
      this.log('(gemerkt, Antwort laeuft noch: "' + satz + '")');
      return;
    }
    this.denkt = true;
    // Denk-Fueller: kommt die Antwort nicht schnell genug, kurz Bescheid sagen
    // statt schweigen. Faellt weg, sobald die Antwort vorher da ist.
    const fuellerTimer = setTimeout(() => {
      if (this.denkt && !this.spricht) {
        const satzWahl = FUELLER[this.fuellerIndex++ % FUELLER.length];
        this.sprich(satzWahl, { cache: true }).catch(() => { /* Fueller ist nice-to-have */ });
      }
    }, FUELLER_NACH_MS);
    try {
      // Live-Streaming: jeder fertige Satz geht SOFORT auf die Leitung,
      // waehrend Claude den Rest der Antwort noch schreibt.
      const sofortSprechen = (teilSatz) => {
        this.log('AGENT: ' + teilSatz);
        this.sprich(teilSatz).catch((e) => this.log('TTS-Fehler: ' + e.message));
      };
      const { beenden } = await this.dialog.antwortAuf(satz, sofortSprechen);
      clearTimeout(fuellerTimer);
      if (beenden) this.auflegenNachMark = true; // erst auflegen, wenn der Abschied FERTIG gesprochen ist
      await this.sprechKette; // alle gestreamten Saetze sind raus, bevor Neues verarbeitet wird
      // Sicherheitsnetz, falls das mark-Echo ausbleibt (Leitung schon weg)
      if (beenden) setTimeout(() => { try { this.ws.close(); } catch (_e) {} }, 15000);
    } catch (e) {
      clearTimeout(fuellerTimer);
      this.log('FEHLER: ' + e.message);
      this.auflegenNachMark = true;
      await this.sprich('Entschuldigung, da ist etwas schiefgelaufen. Bitte rufen Sie direkt im Restaurant an' +
        (this.restaurant.phone ? ' unter ' + this.restaurant.phone : '') + '. Auf Wiederhören!').catch(() => {});
      setTimeout(() => { try { this.ws.close(); } catch (_e) {} }, 15000);
    } finally {
      this.denkt = false;
      // Hat der Gast waehrenddessen weitergesprochen? Dann jetzt verarbeiten.
      if (this.wartenderSatz && !this.beendetGleich()) {
        const nachzuegler = this.wartenderSatz;
        this.wartenderSatz = null;
        this.gastSagte(nachzuegler);
      }
    }
  }

  beendetGleich() {
    return (this.dialog && this.dialog.beendet) || this.auflegenNachMark;
  }

  // Ausgaben laufen strikt nacheinander durch eine Kette - so kann ein
  // Denk-Fueller nie MITTEN in die eigentliche Antwort platzen.
  sprich(text, optionen) {
    const auftrag = this.sprechKette.then(() => this.sprichJetzt(text, optionen));
    this.sprechKette = auftrag.catch(() => { /* Kette lebt weiter */ });
    return auftrag;
  }

  // Text -> ElevenLabs -> in Stuecken als Twilio-media-Events auf die Leitung.
  // Fluessig wie ein Live-Gespraech: der Text wird in Saetze geteilt, ALLE
  // Saetze werden parallel erzeugt, und der erste geht schon auf die Leitung,
  // waehrend die restlichen noch entstehen. Kaum noch Anlauf-Pause.
  async sprichJetzt(text, optionen) {
    if (!text || !this.streamSid) return;
    const cache = optionen && optionen.cache;
    // Stimme dieses Kunden (aus nummern.json), sonst die Standard-Stimme
    const stimmOptionen = this.stimme ? { stimme: this.stimme } : undefined;
    const audios = inSaetze(text).map((s) => {
      const p = cache ? sprecheGecached(s, stimmOptionen) : spreche(s, stimmOptionen);
      p.catch(() => {}); // falls wir per Barge-in abbrechen: Fehler gilt als behandelt
      return p;
    });
    const meineMark = 'm' + (++this.markZaehler);
    try {
      this.spricht = true;
      this.offeneMark = meineMark;
      const stueckGroesse = 4000; // ~0,5 s pro Nachricht (mulaw 8000 Byte/s)
      for (const audioVersprechen of audios) {
        const audio = await audioVersprechen;
        for (let i = 0; i < audio.length; i += stueckGroesse) {
          // Barge-in oder neuere Ausgabe? Dann diese hier sofort abbrechen.
          if (!this.spricht || this.offeneMark !== meineMark) return;
          this.ws.send(JSON.stringify({
            event: 'media',
            streamSid: this.streamSid,
            media: { payload: audio.subarray(i, i + stueckGroesse).toString('base64') }
          }));
        }
      }
      if (!this.spricht || this.offeneMark !== meineMark) return;
      // spricht bleibt true, bis Twilio diese Marke zurueckmeldet (Playback wirklich
      // fertig) - so greift Barge-in die ganze Abspielzeit ueber, nicht nur beim Puffern.
      this.ws.send(JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name: meineMark } }));
    } catch (e) {
      if (this.offeneMark === meineMark) { this.spricht = false; this.offeneMark = null; }
      this.log('TTS-Fehler: ' + e.message);
      throw e;
    }
  }

  stoppeAusgabe() {
    this.spricht = false;
    this.offeneMark = null; // abgebrochene Ausgabe soll nicht faelschlich auflegen
    if (this.streamSid) {
      // 'clear' leert Twilios Abspielpuffer sofort - Gast hat Vorrang
      this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
    }
  }

  aufraeumen() {
    if (this.deepgram) { this.deepgram.schliessen(); this.deepgram = null; }
    this.statistikSchreiben();
    if (this.logZeilen.length) {
      try {
        fs.mkdirSync(LOG_ORDNER, { recursive: true });
        const name = 'anruf-' + new Date().toISOString().replace(/[:.]/g, '-') + '.log';
        fs.writeFileSync(path.join(LOG_ORDNER, name), this.logZeilen.join('\n') + '\n');
      } catch (_e) { /* Log ist nice-to-have */ }
      this.logZeilen = [];
    }
  }

  // Ergebnis des Anrufs anonym festhalten (logs/statistik.jsonl) - OHNE
  // personenbezogene Daten, darf also dauerhaft bleiben. Grundlage fuer den
  // Umsatz-Nachweis in Agentur-App und Monats-Report: jeder angenommene
  // Anruf waere ohne den Telefon-Retter womoeglich ein verlorener Gast gewesen.
  statistikSchreiben() {
    if (!this.dialog || this.statistikGeschrieben) return;
    this.statistikGeschrieben = true;
    try {
      fs.mkdirSync(LOG_ORDNER, { recursive: true });
      const s = this.dialog.statistik || {};
      fs.appendFileSync(path.join(LOG_ORDNER, 'statistik.jsonl'), JSON.stringify({
        zeit: new Date().toISOString(),
        restaurant_id: this.restaurant && this.restaurant.id || null,
        restaurant: this.restaurant && this.restaurant.name || null,
        dauer_s: this.startZeit ? Math.round((Date.now() - this.startZeit) / 1000) : null,
        reservierungen: s.reservierungen || 0,
        gaeste: s.gaeste || 0,
        bestellungen: s.bestellungen || 0,
        bestellwert: Math.round((s.bestellwert || 0) * 100) / 100,
        rueckrufe: s.rueckrufe || 0
      }) + '\n');
    } catch (_e) { /* Statistik ist nice-to-have */ }
  }
}

module.exports = { AnrufSitzung };
