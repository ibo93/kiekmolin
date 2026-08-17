#!/usr/bin/env node
'use strict';

// ANRUF-BRIEFING — zwanzig Sekunden, bevor du auf "Anrufen" drueckst.
//
//   node briefing.js la piazza
//   node briefing.js la piazza --json
//   node briefing.js la piazza --sprich    (eine Zeile, zum Vorlesen)
//
// Traegt zusammen, was ohnehin schon auf der Platte liegt: das CM (wer das
// ist, wann zuletzt Kontakt war), die Agentur-Ampel, die Zahlen des
// letzten Monats und was saisonal ansteht. Vier Antworten daraus: wer,
// welche Zahl du bringen kannst, was schieflaeuft, was du verkaufst.
//
// Lesend. Und ohne zu raten: fehlt eine Zahl, sagt es das.

const { ladeEnv } = require('./lib/env');
const briefing = require('./lib/briefing');

ladeEnv();

const flaggen = ['--json', '--sprich'];
const name = process.argv.slice(2).filter((a) => flaggen.indexOf(a) === -1).join(' ');
const alsJson = process.argv.includes('--json');
const sprich = process.argv.includes('--sprich');

briefing.fuerKunden(name).then((b) => {
  if (!name) {
    console.log('Welchen Kunden rufst du an?  node briefing.js la piazza');
    process.exit(1);
  }
  if (alsJson) console.log(JSON.stringify(b, null, 2));
  else if (sprich) console.log(briefing.briefingSatz(b));
  else console.log(briefing.alsText(b));
}).catch((e) => {
  console.error('Briefing nicht moeglich: ' + e.message);
  process.exit(1);
});
