'use strict';

// Winziger .env-Loader ohne Dependencies (gleicher Bauplan wie im
// Telefon-Retter). Besonderheit hier: der Sprachassistent liest NACHEINANDER
// mehrere .env-Dateien und nimmt den ersten Treffer je Schluessel:
//
//   1. sprachassistent/.env   (eigene Einstellungen)
//   2. telefon-retter/.env    (DEEPGRAM_API_KEY, ELEVENLABS_API_KEY)
//   3. sichtbarkeit/.env      (ANTHROPIC_API_KEY & Co.)
//
// So braucht Ibo KEINE neuen Schluessel: die Ohren und die Stimme des
// Telefon-Retters funktionieren hier direkt weiter.

const fs = require('fs');
const path = require('path');

function leseDatei(envPfad) {
  if (!fs.existsSync(envPfad)) return;

  const zeilen = fs.readFileSync(envPfad, 'utf8').split('\n');
  for (const zeile of zeilen) {
    const t = zeile.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let wert = t.slice(idx + 1).trim();
    if ((wert.startsWith('"') && wert.endsWith('"')) || (wert.startsWith("'") && wert.endsWith("'"))) {
      wert = wert.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = wert;
  }
}

function ladeEnv() {
  const hier = path.join(__dirname, '..');
  leseDatei(path.join(hier, '.env'));
  leseDatei(path.join(hier, '..', 'telefon-retter', '.env'));
  leseDatei(path.join(hier, '..', 'sichtbarkeit', '.env'));
}

module.exports = { ladeEnv };
