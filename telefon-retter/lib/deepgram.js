'use strict';

// Zuhoeren: Deepgram Live-Transkription (Sprache -> Text).
// Twilio liefert das Telefon-Audio als mulaw/8000 - genau so schicken wir
// es per WebSocket an Deepgram weiter und bekommen deutschen Text zurueck.

const WebSocket = require('ws');

class DeepgramStrom {
  // onSatz(text) wird aufgerufen, sobald der Gast einen Satz beendet hat.
  constructor({ onSatz, onFehler }) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error('DEEPGRAM_API_KEY fehlt in .env');

    const url = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      language: 'de',
      model: process.env.DEEPGRAM_MODELL || 'nova-2',
      smart_format: 'true',
      interim_results: 'true',
      endpointing: '300',
      utterance_end_ms: '1200'
    }).toString();

    this.puffer = '';
    this.offen = false;
    this.warteschlange = [];

    this.ws = new WebSocket(url, { headers: { Authorization: 'Token ' + key } });
    this.ws.on('open', () => {
      this.offen = true;
      this.warteschlange.forEach((chunk) => this.ws.send(chunk));
      this.warteschlange = [];
    });
    this.ws.on('message', (roh) => {
      let daten;
      try { daten = JSON.parse(roh.toString()); } catch (_e) { return; }

      if (daten.type === 'Results') {
        const alt = daten.channel && daten.channel.alternatives && daten.channel.alternatives[0];
        const text = alt && alt.transcript ? alt.transcript.trim() : '';
        if (daten.is_final && text) this.puffer = (this.puffer + ' ' + text).trim();
        // speech_final = Deepgram ist sicher, dass der Satz zu Ende ist
        if (daten.speech_final && this.puffer) {
          const satz = this.puffer;
          this.puffer = '';
          onSatz(satz);
        }
      } else if (daten.type === 'UtteranceEnd' && this.puffer) {
        // Fallback, falls speech_final nicht kam (z.B. lange Pause)
        const satz = this.puffer;
        this.puffer = '';
        onSatz(satz);
      }
    });
    this.ws.on('error', (e) => onFehler && onFehler(e));
  }

  sendeAudio(mulawBuffer) {
    if (this.offen && this.ws.readyState === WebSocket.OPEN) this.ws.send(mulawBuffer);
    else this.warteschlange.push(mulawBuffer);
  }

  schliessen() {
    try {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      this.ws.close();
    } catch (_e) { /* schon zu */ }
  }
}

module.exports = { DeepgramStrom };
