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
const { spreche } = require('./elevenlabs');
const { DialogSitzung } = require('./dialog');

const LOG_ORDNER = path.join(__dirname, '..', 'logs');

class AnrufSitzung {
  constructor({ twilioWs, restaurant, menue, stufe, datenquelle }) {
    this.ws = twilioWs;
    this.restaurant = restaurant;
    this.menue = menue;
    this.stufe = stufe;
    this.datenquelle = datenquelle;
    this.streamSid = null;
    this.anrufer = '';
    this.spricht = false;       // gerade eigene Ausgabe auf der Leitung?
    this.denkt = false;         // wartet gerade auf Claude?
    this.logZeilen = [];
    this.dialog = null;
    this.markZaehler = 0;       // eindeutige Marken fuer Twilios Playback-Echo
    this.offeneMark = null;     // Name der zuletzt gesendeten Marke
    this.auflegenNachMark = false; // nach dieser Marke auflegen (Abschied fertig gesprochen)

    this.ws.on('message', (roh) => this.twilioNachricht(roh));
    this.ws.on('close', () => this.aufraeumen());
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
      this.streamSid = msg.start.streamSid;
      const params = msg.start.customParameters || {};
      this.anrufer = params.anrufer || '';
      this.log('Anruf gestartet von ' + (this.anrufer || 'unbekannt'));

      this.dialog = new DialogSitzung({
        restaurant: this.restaurant,
        menue: this.menue,
        stufe: this.stufe,
        anrufer: this.anrufer,
        datenquelle: this.datenquelle,
        log: (z) => this.log(z)
      });

      this.deepgram = new DeepgramStrom({
        onSatz: (satz) => this.gastSagte(satz),
        onFehler: (e) => this.log('Deepgram-Fehler: ' + e.message)
      });

      // Begruessung: Fehler abfangen, sonst crasht eine unbehandelte
      // Promise-Rejection (ElevenLabs down) den ganzen Server.
      this.sprich(this.dialog.begruessung()).catch((e) => this.log('Begruessung-Fehler: ' + e.message));
    } else if (msg.event === 'media') {
      if (this.deepgram) this.deepgram.sendeAudio(Buffer.from(msg.media.payload, 'base64'));
    } else if (msg.event === 'mark') {
      // Twilio hat unsere Marke erreicht = die Ausgabe ist wirklich fertig abgespielt.
      // Erst JETZT ist die Leitung frei (nicht schon nach dem Fuellen des Puffers).
      if (msg.mark && msg.mark.name === this.offeneMark) {
        this.spricht = false;
        this.offeneMark = null;
        if (this.auflegenNachMark) { try { this.ws.close(); } catch (_e) {} }
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

    // Waehrend Claude noch denkt, weitere Saetze nicht parallel verarbeiten
    if (this.denkt) { this.log('(verworfen, Antwort laeuft noch)'); return; }
    this.denkt = true;
    try {
      const { text, beenden } = await this.dialog.antwortAuf(satz);
      this.log('AGENT: ' + text);
      if (beenden) this.auflegenNachMark = true; // erst auflegen, wenn der Abschied FERTIG gesprochen ist
      await this.sprich(text);
      // Sicherheitsnetz, falls das mark-Echo ausbleibt (Leitung schon weg)
      if (beenden) setTimeout(() => { try { this.ws.close(); } catch (_e) {} }, 15000);
    } catch (e) {
      this.log('FEHLER: ' + e.message);
      this.auflegenNachMark = true;
      await this.sprich('Entschuldigung, da ist etwas schiefgelaufen. Bitte rufen Sie direkt im Restaurant an' +
        (this.restaurant.phone ? ' unter ' + this.restaurant.phone : '') + '. Auf Wiederhoeren!').catch(() => {});
      setTimeout(() => { try { this.ws.close(); } catch (_e) {} }, 15000);
    } finally {
      this.denkt = false;
    }
  }

  // Text -> ElevenLabs -> in Stuecken als Twilio-media-Events auf die Leitung
  async sprich(text) {
    if (!text || !this.streamSid) return;
    try {
      const audio = await spreche(text);
      this.spricht = true;
      const meineMark = 'm' + (++this.markZaehler);
      this.offeneMark = meineMark;
      const stueckGroesse = 4000; // ~0,5 s pro Nachricht (mulaw 8000 Byte/s)
      for (let i = 0; i < audio.length; i += stueckGroesse) {
        if (!this.spricht) return; // Barge-in: abgebrochen
        this.ws.send(JSON.stringify({
          event: 'media',
          streamSid: this.streamSid,
          media: { payload: audio.subarray(i, i + stueckGroesse).toString('base64') }
        }));
      }
      // spricht bleibt true, bis Twilio diese Marke zurueckmeldet (Playback wirklich
      // fertig) - so greift Barge-in die ganze Abspielzeit ueber, nicht nur beim Puffern.
      this.ws.send(JSON.stringify({ event: 'mark', streamSid: this.streamSid, mark: { name: meineMark } }));
    } catch (e) {
      this.spricht = false;
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
    if (this.logZeilen.length) {
      try {
        fs.mkdirSync(LOG_ORDNER, { recursive: true });
        const name = 'anruf-' + new Date().toISOString().replace(/[:.]/g, '-') + '.log';
        fs.writeFileSync(path.join(LOG_ORDNER, name), this.logZeilen.join('\n') + '\n');
      } catch (_e) { /* Log ist nice-to-have */ }
      this.logZeilen = [];
    }
  }
}

module.exports = { AnrufSitzung };
