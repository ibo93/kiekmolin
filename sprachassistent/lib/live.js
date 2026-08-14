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
      // Zu kurze Schnipsel ("Ja.") klingen gehackt - die warten auf mehr.
      if (satz.length < 12 && this.puffer.length < 400) { this.puffer = roh.trim() + ' ' + this.puffer; break; }
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
class LiveOhr {
  constructor({ onZwischen, onSatz, onFehler }) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error('DEEPGRAM_API_KEY fehlt');

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
    this.warteschlange = [];
    this.ws = new WebSocket(url, { headers: { Authorization: 'Token ' + key } });

    this.ws.on('open', () => {
      this.offen = true;
      this.warteschlange.forEach((c) => this.ws.send(c));
      this.warteschlange = [];
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

    this.ws.on('error', (e) => onFehler && onFehler(e));
  }

  sendeAudio(brocken) {
    if (this.offen && this.ws.readyState === WebSocket.OPEN) this.ws.send(brocken);
    else if (this.warteschlange.length < 200) this.warteschlange.push(brocken);
  }

  schliessen() {
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
//   spreche(satz)            -> Promise<Buffer|null> (null = Browser spricht)
class LiveSitzung {
  constructor({ senden, starteAuftrag, spreche, maxSaetze }) {
    this.senden = senden;
    this.starteAuftrag = starteAuftrag;
    this.spreche = spreche;
    this.maxSaetze = maxSaetze || 4;

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
  }

  get laeuft() { return !!this.laufend; }

  // Zwischenstand vom Zuhoeren: anzeigen - und ggf. unterbrechen.
  zwischenstand(text) {
    this.senden({ typ: 'zwischen', text: text });
    if (this.laeuft && istUnterbrechung(text)) this.unterbrich('unterbrochen');
  }

  // Fertiger Satz: das ist ein Auftrag.
  gehoert(text, kontext) {
    const satz = String(text || '').trim();
    if (!satz) return;
    this.zuletztGehoert = satz;

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

    if (this.laeuft) this.unterbrich('unterbrochen');   // Nachschlag mitten drin
    this.senden({ typ: 'du', text: satz });
    this._starte(satz, kontext || {});
  }

  // Klappe halten und den laufenden Auftrag fallenlassen.
  unterbrich(grund) {
    this.zug++;
    if (this.laufend) {
      try { this.laufend.abbrechen(); } catch (_e) { /* schon vorbei */ }
      this.laufend = null;
    }
    this.sammler = null;
    this.sprechKette = Promise.resolve();
    this.senden({ typ: 'ruhe', grund: grund || 'ruhe' });
  }

  schliessen() {
    if (this.laufend) { try { this.laufend.abbrechen(); } catch (_e) { /* egal */ } }
    this.laufend = null;
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
  _sprich(satz, zug) {
    this.sprechKette = this.sprechKette.then(async () => {
      if (zug !== this.zug) return;
      let mp3 = null;
      try { mp3 = await this.spreche(satz); } catch (_e) { mp3 = null; }
      if (zug !== this.zug) return;
      this.senden({
        typ: 'stimme',
        text: satz,
        mp3: mp3 ? mp3.toString('base64') : null
      });
    }).catch(() => { /* ein stummer Satz darf das Gespraech nicht killen */ });
  }
}

module.exports = { SatzSammler, istUnterbrechung, LiveOhr, LiveSitzung };
