#!/usr/bin/env node
'use strict';

// AGENTUR-STAND — auf Zuruf, ohne die Agentur-App zu oeffnen.
//
//   node agentur.js              kurzer Stand zum Vorlesen
//   node agentur.js --json       Daten (Kunden, Ampel, Pipeline)
//   node agentur.js kunden       Liste mit Ampel je Kunde
//
// Lesend und ohne Netz: die Bewertung kommt aus den Report-Daten, die
// ohnehin unter sichtbarkeit/data liegen. Reports ERZEUGEN macht weiter
// die Agentur-App (oder Claude auf Zuruf) - das kostet Geld und soll
// nicht aus Versehen passieren.

const { ladeEnv } = require('./lib/env');
const agentur = require('./lib/agentur');

ladeEnv();

const rest = process.argv.slice(2).filter((a) => a !== '--json');
const alsJson = process.argv.includes('--json');
const s = agentur.stand();

if (alsJson) {
  console.log(JSON.stringify(s, null, 2));
} else if ((rest[0] || '').toLowerCase() === 'kunden') {
  if (!s.kunden.length) console.log('Keine Kundendaten gefunden.');
  s.kunden.forEach((k) => {
    const zeichen = k.stufe === 'rot' ? '!!' : (k.stufe === 'gelb' ? '! ' : '  ');
    const report = k.reportDiesenMonat ? 'Report ' + s.monat + ' liegt vor' : 'Report ' + s.monat + ' FEHLT';
    console.log(zeichen + ' ' + k.name + ' - ' + report + (k.gruende.length ? ' - ' + k.gruende[0] : ''));
  });
} else {
  console.log(agentur.agenturSatz(s));
}
