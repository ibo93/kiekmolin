'use strict';

// Winziger .env-Loader ohne Dependencies.
// Liest sichtbarkeit/.env (falls vorhanden) und fuellt process.env,
// ohne bereits gesetzte Variablen zu ueberschreiben.

const fs = require('fs');
const path = require('path');

function ladeEnv() {
  const envPfad = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPfad)) return;

  const zeilen = fs.readFileSync(envPfad, 'utf8').split('\n');
  for (const zeile of zeilen) {
    const t = zeile.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let wert = t.slice(idx + 1).trim();
    // optionale Anfuehrungszeichen entfernen
    if ((wert.startsWith('"') && wert.endsWith('"')) || (wert.startsWith("'") && wert.endsWith("'"))) {
      wert = wert.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = wert;
  }
}

module.exports = { ladeEnv };
