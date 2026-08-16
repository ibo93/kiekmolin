'use strict';

// LIVE-GESPRAECH — reden wie mit einem Menschen.
//
// Unterschied zum Knopf-Betrieb (server.js /api/auftrag):
//   Knopf:  aufnehmen -> abschicken -> warten -> Antwort am Stueck
//   Live:   Mikrofon laeuft durch, Deepgram schickt schon beim Sprechen
//           Text, Claude antwortet in Schnipseln, und der erste Satz wird
//           gesprochen, waehrend der Rest noch entsteht. Wer dazwischen
//           redet, unterbricht - der Assistent haelt sofort die Klappe.
//
// Hier stehen die drei Teile, die das moeglich machen:
//   SatzSammler      Schnipsel -> fertige, sprechbare Saetze
//   istUnterbrechung entscheidet, ob Reden eine Unterbrechung ist
//   LiveOhr          Dauerleitung zu Deepgram (Zwischenstand + Endsatz)
//   LiveSitzung      der Gespraechsfaden pro offenem Fenster

const WebSocket = require('ws');
const { entferneMarkdown } = require('./sprechtext');
const befehle = require('./befehle');
const sofort = require('./sofort');

// ---------------------------------------------------------- SatzSammler ---

// Sammelt Text-Schnipsel und gibt einen Satz heraus, sobald er FERTIG ist.
// Getrennt wird nur bei Satzzeichen + Leerzeichen - "README.md" bleibt heil.
// Code-Bloecke werden nie gesprochen: zwischen ``` und ``` bleibt es still.
class SatzSammler {
  constructor(maxSaetze) {
    this.puffer = '';
    this.gesprochen = 0;
    this.maxSaetze = maxSaetze || 4;
  }

  // Gibt die Saetze zurueck, die durch diesen Schnipsel fertig geworden sind.
  fuettere(schnipsel) {
    this.puffer += String(schnipsel || '');
    const fertige = [];

    while (this.gesprochen < this.maxSaetze) {
      if (this._imCodeblock()) break;          // Code: warten, nicht sprechen
      const treffer = /[.!?…](\s)/.exec(this.puffer);
      if (!treffer) break;

      const schnitt = treffer.index + 1;
      const roh = this.puffer.slice(0, schnitt);
      this.puffer = this.puffer.slice(schnitt).replace(/^\s+/, '');

      const satz = entferneMarkdown(roh).trim();
      if (!satz) continue;                     // war nur Zeichensalat
      // Zu kurze Schnipsel ("Ja.") klingen mittendrin gehackt - die warten
      // auf mehr.
      //
      // ABER NICHT DER ERSTE. Genau da faellt Warten auf: man hat gerade
      // ausgeredet und es passiert nichts. "Moin." darf sofort raus - das
      // ist der Unterschied zwischen "antwortet" und "ueberlegt".
      if (this.gesprochen > 0 && satz.length < 12 && this.puffer.length < 400) {
        this.puffer = roh.trim() + ' ' + this.puffer;
        break;
      }
      fertige.push(satz);
      this.gesprochen++;
    }
    return fertige;
  }

  // Am Ende des Auftrags: was noch im Puffer liegt, einmal herausgeben.
  rest() {
    if (this.gesprochen >= this.maxSaetze) return '';
    const satz = entferneMarkdown(this.puffer).trim();
    this.puffer = '';
    if (!satz) return '';
    this.gesprochen++;
    return satz;
  }

  _imCodeblock() {
    const zaehler = (this.puffer.match(/```/g) || []).length;
    return zaehler % 2 === 1;
  }
}

// Lange Texte auf einen Satz eindampfen - fuer Meldungen ueber Auftraege,
// die nebenher liefen.
function kurzfassung(text) {
  const t = entferneMarkdown(text || '').trim();
  if (!t) return 'ohne Ergebnis';
  const ende = /[.!?](\s|$)/.exec(t);
  const satz = ende ? t.slice(0, ende.index + 1) : t;
  return satz.length > 160 ? satz.slice(0, 157) + '...' : satz;
}

// ------------------------------------------------------- Unterbrechung ----

// Reden waehrend der Assistent spricht: echte Unterbrechung oder nur das
// Mikrofon, das die Lautsprecher hoert? Ein einzelnes Wort reicht nicht -
// sonst schneidet sich der Assistent bei jedem Echo selbst das Wort ab.
function istUnterbrechung(text) {
  const t = String(text || '').trim();
  if (t.length < 6) return false;
  const woerter = t.split(/\s+/).filter((w) => w.length > 1);
  return woerter.length >= 2;
}

// -------------------------------------------------------------- LiveOhr ---

// Dauerleitung zu Deepgram: Audio rein, Text raus - Zwischenstand waehrend
// des Sprechens, Endsatz sobald der Satz zu Ende ist.
// Ein abgelehnter Schluessel ist KEIN Netz-Huepfer. Wer 401 bekommt,
// bekommt beim siebten Versuch auch 401 - und in der Zwischenzeit sieht
// Ibo sechsmal dieselbe Fehlermeldung und hoert nichts. Solche Fehler
// werden deshalb erkannt, gemeldet und dann wird aufgegeben, damit der
// Browser uebernehmen kann.
const ENDGUELTIG = /\b(401|403|Unauthorized|Forbidden|invalid.{0,12}(key|token)|payment|quota)\b/i;

function warumEndgueltig(nachricht) {
  const t = String(nachricht || '');
  if (/401|Unauthorized|invalid.{0,12}(key|token)/i.test(t)) {
    return 'Deepgram weist den Schluessel ab (401). Er ist falsch, abgelaufen oder geloescht. ' +
      'Neuen holen auf deepgram.com und in die .env eintragen.';
  }
  if (/403|Forbidden/i.test(t)) return 'Deepgram sperrt den Zugang (403). Konto oder Rechte pruefen.';
  if (/payment|quota/i.test(t)) return 'Deepgram meldet ein Konto-Problem (Guthaben oder Limit).';
  return null;
}

class LiveOhr {
  constructor({ onZwischen, onSatz, onFehler, onLage, onAufgeben }) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error('DEEPGRAM_API_KEY fehlt');

    this.rueckrufe = { onZwischen, onSatz, onFehler, onLage, onAufgeben };
    this.geschlossen = false;      // absichtlich beendet?
    this.aufgegeben = false;       // endgueltiger Fehler - nicht weiter versuchen
    this.versuche = 0;
    this._verbinde();
  }

  // Endgueltig Schluss: einmal sagen warum, dann nie wieder versuchen.
  _aufgeben(grund) {
    if (this.aufgegeben) return;
    this.aufgegeben = true;
    this.geschlossen = true;
    clearInterval(this.puls);
    try { this.ws.close(); } catch (_e) { /* war schon zu */ }
    if (this.rueckrufe.onAufgeben) this.rueckrufe.onAufgeben(grund);
  }

  _verbinde() {
    const key = process.env.DEEPGRAM_API_KEY;
    const { onZwischen, onSatz, onFehler, onLage } = this.rueckrufe;

    // Kein encoding/sample_rate: der Browser schickt webm/opus im Container,
    // das erkennt Deepgram von selbst.
    const url = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
      language: 'de',
      model: process.env.DEEPGRAM_MODELL || 'nova-2',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: process.env.SPRACH_PAUSE_MS || '400',
      utterance_end_ms: '1000'
    }).toString();

    this.puffer = '';
    this.offen = false;
    this.warteschlange = this.warteschlange || [];
    this.ws = new WebSocket(url, { headers: { Authorization: 'Token ' + key } });

    this.ws.on('open', () => {
      this.offen = true;
      this.versuche = 0;
      this.warteschlange.forEach((c) => this.ws.send(c));
      this.warteschlange = [];
      // Ruhe im Laden: ohne Lebenszeichen macht Deepgram nach kurzer Zeit zu.
      clearInterval(this.puls);
      this.puls = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          try { this.ws.send(JSON.stringify({ type: 'KeepAlive' })); } catch (_e) { /* egal */ }
        }
      }, 8000);
      if (onLage) onLage('offen');
    });

    // Verbindung weg? Von selbst neu aufbauen - ein Netz-Huepfer darf das
    // Gespraech nicht beenden, ohne dass es jemand merkt.
    this.ws.on('close', () => {
      this.offen = false;
      clearInterval(this.puls);
      if (this.geschlossen || this.aufgegeben) return;
      this.versuche++;
      if (this.versuche > 6) {
        if (onFehler) onFehler(new Error('Die Verbindung zum Zuhoeren kommt nicht zurueck'));
        return;
      }
      const wartezeit = Math.min(8000, 500 * Math.pow(2, this.versuche - 1));
      if (onLage) onLage('verbindet neu');
      setTimeout(() => { if (!this.geschlossen) this._verbinde(); }, wartezeit);
    });

    this.ws.on('message', (roh) => {
      let d;
      try { d = JSON.parse(roh.toString()); } catch (_e) { return; }

      if (d.type === 'Results') {
        const alt = d.channel && d.channel.alternatives && d.channel.alternatives[0];
        const text = alt && alt.transcript ? alt.transcript.trim() : '';
        if (!text && !d.speech_final) return;
        if (d.is_final && text) this.puffer = (this.puffer + ' ' + text).trim();
        else if (text && onZwischen) onZwischen((this.puffer + ' ' + text).trim());

        if (d.speech_final && this.puffer) {
          const satz = this.puffer;
          this.puffer = '';
          onSatz(satz);
        }
      } else if (d.type === 'UtteranceEnd' && this.puffer) {
        const satz = this.puffer;
        this.puffer = '';
        onSatz(satz);
      }
    });

    this.ws.on('error', (e) => {
      // Abgelehnter Schluessel: einmal erklaeren und aufhoeren. Sonst
      // laufen sechs Versuche durch und Ibo liest sechsmal dasselbe.
      const grund = ENDGUELTIG.test(e && e.message) ? warumEndgueltig(e.message) : null;
      if (grund) return this._aufgeben(grund);
      if (onFehler) onFehler(e);
    });
  }

  sendeAudio(brocken) {
    if (this.offen && this.ws.readyState === WebSocket.OPEN) this.ws.send(brocken);
    else if (this.warteschlange.length < 200) this.warteschlange.push(brocken);
  }

  schliessen() {
    this.geschlossen = true;
    clearInterval(this.puls);
    try {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      this.ws.close();
    } catch (_e) { /* schon zu */ }
  }
}

// ---------------------------------------------------------- LiveSitzung ---

// Der Gespraechsfaden eines offenen Fensters. Alles, was von aussen kommt
// (Deepgram, Claude, ElevenLabs), wird hereingereicht - dadurch laesst sich
// der Ablauf testen, ohne ein einziges Netz-Paket.
//
//   senden(nachricht)        -> ans Fenster (JSON)
//   starteAuftrag(optionen)  -> Claude Code, liefert { abbrechen() }
//   spreche(satz)            -> Promise<{ton,art}|null> (null = Browser spricht)
//   sprecheStrom(satz, onStueck, signal) -> Promise (optional, siehe _sprich)
class LiveSitzung {
  constructor({ senden, starteAuftrag, spreche, sprecheStrom, maxSaetze, weckwort, nachlauf }) {
    this.senden = senden;
    this.starteAuftrag = starteAuftrag;
    this.spreche = spreche;
    this.sprecheStrom = sprecheStrom || null;
    this.maxSaetze = maxSaetze || 4;

    // Weckwort: ohne es schlaeft der Assistent und hoert nur zu, ob sein
    // Name faellt. Damit kann das Mikrofon offen bleiben, ohne dass jedes
    // Wort im Laden oder am Telefon bei der KI landet.
    this.weckwort = weckwort || '';
    this.schlaeft = !!weckwort;
    // Nach einer Antwort bleibt er kurz wach, damit Nachfragen ohne
    // erneutes "Kurani" gehen.
    this.nachlauf = (nachlauf || 25) * 1000;
    this.wachBis = 0;
    // Eigener Zustand fuer die Befehle ohne KI (laufendes Diktat).
    this.eigenerZustand = { diktat: null };
    // Auftraege, die nebenher laufen (nummer -> { frage, lauf }).
    this.hintergrund = new Map();
    this.hintergrundZaehler = 0;
    // Meldungen, die warten mussten, weil er gerade geredet hat.
    this.meldungen = [];

    this.laufend = null;      // aktueller Claude-Auftrag
    this.sammler = null;
    this.sprechKette = Promise.resolve();
    this.antwort = '';
    this.zuletztGehoert = '';
    // Zug-Zaehler: jede Unterbrechung zaehlt hoch. Alles, was noch aus einem
    // alten Zug eintrudelt (Text von Claude, fertiges Audio), wird dadurch
    // erkannt und verworfen - sonst redet der Assistent nach dem
    // Unterbrechen noch den alten Satz zu Ende.
    this.zug = 0;

    // Ton im Strom: laufende Nummer, damit das Fenster die Stuecke dem
    // richtigen Satz zuordnen kann, und ein Abbrecher fuers Dazwischenreden.
    this.tonZaehler = 0;
    this.tonAbbruch = null;
    // Einmal ohne Erfolg gestroemt (Konto kann es nicht, Endpunkt fehlt)?
    // Dann nicht bei jedem Satz aufs Neue vergeblich anklopfen.
    this.stromKaputt = false;
  }

  get laeuft() { return !!this.laufend; }

  // Zwischenstand vom Zuhoeren: anzeigen - und ggf. unterbrechen.
  // Im Schlaf wird nichts angezeigt: was im Laden geredet wird, gehoert
  // nicht auf den Bildschirm, nur weil das Mikrofon offen ist.
  zwischenstand(text) {
    if (!this.istWach) return;
    this.senden({ typ: 'zwischen', text: text });
    if (this.laeuft && istUnterbrechung(text)) this.unterbrich('unterbrochen');
  }

  // Schlaeft er gerade? (Nach einer Antwort bleibt er kurz wach.)
  get istWach() {
    if (!this.weckwort) return true;
    if (!this.schlaeft) return true;
    return Date.now() < this.wachBis;
  }

  wachHalten() { if (this.weckwort) this.wachBis = Date.now() + this.nachlauf; }

  // Dauergespraech: solange das Fenster offen ist, kein Weckwort und kein
  // Einschlafen - so, wie man mit einem Menschen redet, dem man nicht vor
  // jedem Satz den Namen sagt.
  //
  // Warum es das Weckwort trotzdem gibt: das Mikrofon laeuft durch. Im
  // Laden, im Buero mit anderen Leuten, beim Telefonieren soll nicht jeder
  // Satz bei der KI landen. Deshalb umschaltbar statt einfach weg.
  dauergespraech(an, weckwort) {
    if (an) {
      this.weckwort = '';
      this.schlaeft = false;
    } else {
      this.weckwort = weckwort || '';
      // Nicht sofort zufallen lassen: der Nachlauf laeuft normal aus.
      this.schlaeft = !!this.weckwort;
      this.wachHalten();
    }
    return { typ: 'dauergespraech', an: !this.weckwort };
  }

  einschlafen() {
    if (!this.weckwort) return;
    this.schlaeft = true;
    this.wachBis = 0;
    this.senden({ typ: 'schlaeft' });
  }

  // Fertiger Satz: das ist ein Auftrag.
  gehoert(text, kontext) {
    let satz = String(text || '').trim();
    if (!satz) return;
    this.zuletztGehoert = satz;

    // Schlafend: nur der eigene Name weckt ihn.
    if (this.weckwort && !this.istWach) {
      const geweckt = befehle.weckwortTreffer(satz, this.weckwort);
      if (!geweckt.geweckt) { this.senden({ typ: 'ueberhoert', text: satz }); return; }

      this.schlaeft = false;
      this.wachHalten();
      this.senden({ typ: 'wach' });
      if (!geweckt.auftrag) {
        // Nur gerufen, noch kein Auftrag: kurz melden und zuhoeren.
        this.senden({ typ: 'du', text: satz });
        this._sprich('Ja?', ++this.zug);
        return;
      }
      satz = geweckt.auftrag;
    } else if (this.weckwort) {
      // Im Nachlauf: ein vorangestelltes "Kurani" stoert nicht.
      const geweckt = befehle.weckwortTreffer(satz, this.weckwort);
      if (geweckt.geweckt && geweckt.auftrag) satz = geweckt.auftrag;
      this.wachHalten();
    }

    // Was ohne KI geht (Notiz, Liste, Diktat), macht der Server selbst -
    // sofort und kostenlos.
    const direkt = sofort.behandle(satz, this.eigenerZustand);
    if (direkt) {
      this.wachHalten();
      this.senden({ typ: 'du', text: satz });
      if (direkt.still) { this.senden({ typ: 'mitschrift', saetze: direkt.saetze }); return; }
      this.senden({ typ: 'fertig', text: direkt.antwort, kosten: 0, sekunden: 0 });
      this._sprich(direkt.antwort, this.zug);
      return;
    }

    const steuer = befehle.steuerwort(satz);
    if (steuer === 'leer') return;
    if (steuer === 'stopp') {
      this.unterbrich('gestoppt');
      this.senden({ typ: 'du', text: satz });
      return;
    }
    if (steuer === 'neu') {
      this.unterbrich('gestoppt');
      this.senden({ typ: 'du', text: satz });
      this.senden({ typ: 'neu' });
      return;
    }

    // "Was laeuft gerade?" - ohne KI zu beantworten.
    if (/^(was l(ae|ä)uft|l(ae|ä)uft (noch )?(was|etwas)|status)\b/i.test(satz)) {
      this.senden({ typ: 'du', text: satz });
      const stand = this.hintergrundStand();
      this.senden({ typ: 'fertig', text: stand, kosten: 0, sekunden: 0 });
      this._sprich(stand, this.zug);
      return;
    }

    // Nebenbei erledigen? Dann blockiert es das Gespraech nicht.
    const nebenbei = befehle.istHintergrund(satz);
    if (nebenbei.hintergrund && nebenbei.text) {
      this.senden({ typ: 'du', text: satz });
      return this._starteHintergrund(nebenbei.text);
    }

    if (this.laeuft) this.unterbrich('unterbrochen');   // Nachschlag mitten drin
    // Anknuepfung fuer "mach das fertig": woran haben wir zuletzt gearbeitet?
    if (!befehle.willUebergeben(satz).uebergeben) this.eigenerZustand.letzterSatz = satz;
    this.senden({ typ: 'du', text: satz });
    this._starte(satz, kontext || {});
  }

  // Von sich aus etwas sagen (faellige Erinnerung, fertiger Hintergrund-
  // Auftrag, Stoerung der Plattform). Mitten in eine laufende Antwort zu
  // quatschen waere unhoeflich - also wartet die Meldung, bis er fertig
  // ist. Verlorengehen darf sie nicht: eine Erinnerung, die niemand
  // hoert, ist keine.
  melde(satz) {
    if (this.laeuft) { this.meldungen.push(satz); return false; }
    this._sprich(satz, this.zug);
    return true;
  }

  _meldungenNachreichen() {
    if (!this.meldungen.length) return;
    const offen = this.meldungen.splice(0, this.meldungen.length);
    for (const satz of offen) {
      this.senden({ typ: 'meldung', text: satz });
      this._sprich(satz, this.zug);
    }
  }

  // Klappe halten und den laufenden Auftrag fallenlassen.
  unterbrich(grund) {
    this.zug++;
    if (this.laufend) {
      try { this.laufend.abbrechen(); } catch (_e) { /* schon vorbei */ }
      this.laufend = null;
    }
    // Ton, der gerade gebaut wird, sofort fallenlassen. Ihn fertig bauen
    // zu lassen kostet Geld fuer etwas, das niemand mehr hoert - und die
    // Leitung, die der naechste Satz gleich braucht.
    if (this.tonAbbruch) {
      try { this.tonAbbruch.abort(); } catch (_e) { /* schon vorbei */ }
      this.tonAbbruch = null;
    }
    this.sammler = null;
    this.sprechKette = Promise.resolve();
    this.senden({ typ: 'ruhe', grund: grund || 'ruhe' });
  }

  schliessen() {
    if (this.laufend) { try { this.laufend.abbrechen(); } catch (_e) { /* egal */ } }
    this.laufend = null;
    // Hintergrund-Auftraege gehoeren zum Fenster: ist es zu, hoert niemand
    // mehr die Meldung - und weiterlaufen wuerde nur Geld kosten.
    for (const eintrag of this.hintergrund.values()) {
      try { if (eintrag.lauf) eintrag.lauf.abbrechen(); } catch (_e) { /* egal */ }
    }
    this.hintergrund.clear();
  }

  // Auftrag, der nebenher laeuft: er blockiert das Gespraech nicht und
  // meldet sich, wenn er fertig ist. Fuer alles, was dauert - Reel
  // schneiden, Reports bauen, grosse Umbauten.
  _starteHintergrund(satz) {
    const nummer = ++this.hintergrundZaehler;
    const beginn = Date.now();
    const eintrag = { nummer: nummer, frage: satz, lauf: null };
    this.hintergrund.set(nummer, eintrag);
    this.senden({ typ: 'hintergrundStart', nummer: nummer, text: satz });

    eintrag.lauf = this.starteAuftrag({
      prompt: satz,
      live: false,                       // kein Wort-Streaming: keiner hoert zu
      onEreignis: (e) => {
        if (e.art === 'werkzeug') return this.senden({ typ: 'hintergrundTut', nummer: nummer, text: e.text });
        if (e.art !== 'fertig' && e.art !== 'fehler' && e.art !== 'abgebrochen') return;

        this.hintergrund.delete(nummer);
        const minuten = Math.round((Date.now() - beginn) / 60000);
        const dauer = minuten >= 1 ? ' Hat ' + minuten + ' Minuten gedauert.' : '';
        const meldung = e.art === 'fertig'
          ? 'Der Auftrag im Hintergrund ist fertig: ' + kurzfassung(e.text) + dauer
          : 'Der Auftrag im Hintergrund ist schiefgegangen: ' + kurzfassung(e.text);
        this.senden({ typ: 'hintergrundFertig', nummer: nummer, text: e.text || '', art: e.art });
        this.melde(meldung);
      }
    });

    const antwort = 'Alles klar, ich mach das nebenbei und sage Bescheid.';
    this.senden({ typ: 'fertig', text: antwort, kosten: 0, sekunden: 0 });
    this._sprich(antwort, this.zug);
  }

  // Was laeuft gerade im Hintergrund?
  hintergrundStand() {
    const liste = [...this.hintergrund.values()];
    if (!liste.length) return 'Im Hintergrund laeuft gerade nichts.';
    if (liste.length === 1) return 'Im Hintergrund laeuft: ' + kurzfassung(liste[0].frage) + '.';
    return 'Im Hintergrund laufen ' + liste.length + ' Sachen: ' +
      liste.map((e) => kurzfassung(e.frage)).join('; ') + '.';
  }

  _starte(satz, kontext) {
    const zug = ++this.zug;
    this.sammler = new SatzSammler(this.maxSaetze);
    this.antwort = '';
    const beginn = Date.now();

    this.senden({ typ: 'arbeitet', ordner: kontext.ordnerName || '' });

    this.laufend = this.starteAuftrag({
      prompt: satz,
      live: true,
      onEreignis: (e) => {
        if (zug !== this.zug) return;                      // alter Zug, verworfen
        if (e.art === 'start') { this.senden({ typ: 'sitzung', sitzung: e.sitzung }); return; }
        if (e.art === 'werkzeug') { this.senden({ typ: 'werkzeug', text: e.text }); return; }

        if (e.art === 'happen') {
          if (!this.sammler) return;                       // schon unterbrochen
          this.senden({ typ: 'happen', text: e.text });
          for (const fertig of this.sammler.fuettere(e.text)) this._sprich(fertig, zug);
          return;
        }

        if (e.art === 'fertig') {
          this.antwort = e.text || '';
          if (this.sammler) {
            const rest = this.sammler.rest();
            if (rest) this._sprich(rest, zug);
          }
          this.laufend = null;
          this.sammler = null;
          this.wachHalten();      // Nachfragen gehen ohne erneutes Weckwort
          setTimeout(() => this._meldungenNachreichen(), 0);   // Wartendes nachholen
          this.senden({
            typ: 'fertig',
            text: this.antwort,
            kosten: e.kosten || 0,
            sekunden: Math.round((Date.now() - beginn) / 1000),
            hinweis: e.fehlerText || null
          });
          return;
        }

        if (e.art === 'fehler' || e.art === 'abgebrochen') {
          this.laufend = null;
          this.sammler = null;
          this.senden({ typ: e.art === 'fehler' ? 'fehler' : 'abgebrochen', text: e.text });
        }
      }
    });
  }

  // Saetze streng der Reihe nach sprechen - sonst reden zwei durcheinander.
  // Wurde inzwischen unterbrochen (neuer Zug), faellt der Satz unter den
  // Tisch, auch wenn das Audio schon fertig war.
  //
  // Zwei Wege, und der erste ist der schnellere:
  //
  //   STROM   die Stuecke gehen raus, waehrend der Satz noch gebaut wird.
  //           Das Fenster faengt an zu spielen, sobald das erste Stueck da
  //           ist - rund eine halbe Sekunde frueher als am Stueck.
  //   STUECK  erst fertig bauen, dann schicken. Der alte, sichere Weg -
  //           und der einzige fuer die Mac-Stimme, die keine Stuecke kennt.
  //
  // Geht der Strom schief, BEVOR etwas angekommen ist, wird still auf den
  // alten Weg zurueckgefallen. Lieber einmal langsamer als einmal stumm.
  _sprich(satz, zug) {
    this.sprechKette = this.sprechKette.then(async () => {
      if (zug !== this.zug) return;
      if (this.sprecheStrom && !this.stromKaputt && await this._stromen(satz, zug)) return;
      if (zug !== this.zug) return;

      let gesprochen = null;
      try { gesprochen = await this.spreche(satz); } catch (_e) { gesprochen = null; }
      if (zug !== this.zug) return;
      this.senden({
        typ: 'stimme',
        text: satz,
        // Der Ton kommt je nach Weg als MP3 (ElevenLabs) oder WAV (Mac) -
        // die Art muss mit, sonst spielt der Browser sie nicht ab.
        ton: gesprochen ? gesprochen.ton.toString('base64') : null,
        tonArt: gesprochen ? gesprochen.art : null
      });
    }).catch(() => { /* ein stummer Satz darf das Gespraech nicht killen */ });
  }

  // true = erledigt, false = bitte den alten Weg nehmen.
  async _stromen(satz, zug) {
    const nr = ++this.tonZaehler;
    const abbruch = new AbortController();
    this.tonAbbruch = abbruch;
    let angefangen = false;

    try {
      await this.sprecheStrom(satz, (stueck) => {
        if (zug !== this.zug) return;
        if (!angefangen) {
          angefangen = true;
          this.senden({ typ: 'stimmeStart', nr: nr, text: satz, tonArt: 'audio/mpeg' });
        }
        this.senden({ typ: 'stimmeStueck', nr: nr, ton: stueck.toString('base64') });
      }, abbruch.signal);
    } catch (e) {
      // Dazwischengeredet: nichts nachreichen, nichts nachbauen.
      if (e && e.name === 'AbortError') return true;
      if (angefangen) {
        // Mittendrin abgerissen: was da ist, darf gesprochen werden.
        this.senden({ typ: 'stimmeEnde', nr: nr, abgerissen: true });
        return true;
      }
      // Gar nichts gekommen: dieser Rechner kann offenbar keinen Strom.
      this.stromKaputt = true;
      return false;
    } finally {
      if (this.tonAbbruch === abbruch) this.tonAbbruch = null;
    }

    if (zug !== this.zug) return true;
    if (!angefangen) { this.stromKaputt = true; return false; }
    this.senden({ typ: 'stimmeEnde', nr: nr });
    return true;
  }
}

module.exports = { SatzSammler, istUnterbrechung, LiveOhr, LiveSitzung, warumEndgueltig, ENDGUELTIG };
