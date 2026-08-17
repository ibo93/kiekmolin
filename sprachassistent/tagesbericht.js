#!/usr/bin/env node
'use strict';

// TAGESBERICHT — Wetter und die Zahlen von heute, in einem Rutsch.
//
// Das ruft der Sprachassistent auf, wenn Ibo "Moin" oder "Tagesbericht"
// sagt. Was hier steht, kann Claude nicht wissen: das Wetter von heute
// und der aktuelle Stand in der Datenbank. Roadmap und offene Rechnungen
// holt er sich danach selbst ueber seine Skills.
//
//   node tagesbericht.js            kurzer Text zum Vorlesen
//   node tagesbericht.js --json     dasselbe als Daten
//
// Laeuft auch ohne Supabase-Schluessel und ohne Netz - dann fehlt eben
// die jeweilige Zeile, statt dass alles ausfaellt.

const { ladeEnv } = require('./lib/env');
const bericht = require('./lib/tagesbericht');

ladeEnv();

// "abend" fragt nicht, was kommt, sondern was war - fuer Stundenzettel
// und Rechnungen am Feierabend.
if (process.argv.includes('abend') || process.argv.includes('--abend')) {
  const b = bericht.abendBericht();
  console.log(process.argv.includes('--json') ? JSON.stringify(b, null, 2) : bericht.abendText(b));
  return;
}

bericht.sammle().then((b) => {
  if (process.argv.includes('--json')) console.log(JSON.stringify(b, null, 2));
  else console.log(bericht.alsText(b));
}).catch((e) => {
  console.error('Tagesbericht fehlgeschlagen: ' + e.message);
  process.exit(1);
});
