#!/usr/bin/env node
'use strict';

// MARKT — wer ist da draussen, und wen rufe ich als Naechstes an?
//
//   node markt.js                Ueberblick: Segmente, Orte, Luecken
//   node markt.js anrufe [ort]   die naechsten 5 Anrufe mit Nummer
//   node markt.js --json         alles als Daten
//
// Grundlage ist prospects.json (OSM-Importer). Ist die leer:
//   node import-osm.js

const { ladeEnv } = require('./lib/env');
const markt = require('./lib/markt');

ladeEnv();

const rest = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const alsJson = process.argv.includes('--json');
const betriebe = markt.lies();
const befehl = (rest[0] || 'ueberblick').toLowerCase();

if (befehl === 'anrufe' || befehl === 'anrufen') {
  const liste = markt.naechsteAnrufe(betriebe, { ort: rest[1], anzahl: 8 });
  if (alsJson) { console.log(JSON.stringify(liste, null, 2)); return; }
  if (!liste.length) { console.log('Keine passenden Betriebe gefunden.'); return; }
  console.log('Die naechsten Anrufe' + (rest[1] ? ' in ' + rest[1] : '') + ':');
  liste.forEach((e, i) => {
    const b = e.betrieb;
    console.log((i + 1) + '. ' + b.name + ' - ' + (b.city || '?') + ' - ' + b.phone);
    console.log('   ' + e.segment.name + ', ' + e.punkte + ' Punkte: ' + e.grund);
  });
  return;
}

const a = markt.auswerten(betriebe);
if (alsJson) { console.log(JSON.stringify(a, null, 2)); return; }

console.log('');
console.log('  MARKT — ' + a.gesamt + ' Betriebe im Verzeichnis');
console.log('  ------------------------------------------------');
if (!a.gesamt) {
  console.log('  Noch keine Daten. Einmal laufen lassen:  node import-osm.js');
} else {
  console.log('  Segment                  Anzahl  ohne Website  KMI  Tel');
  a.segmente.forEach((s) => {
    console.log('  ' + s.name.padEnd(24) + String(s.anzahl).padStart(6) +
      String(s.ohneWebseite).padStart(14) + String(s.kiekmolin).padStart(5) + String(s.telefon).padStart(5));
  });
  console.log('');
  console.log('  Groesste Orte: ' + a.orte.slice(0, 6).map((o) => o.name + ' (' + o.anzahl + ')').join(', '));
  console.log('  Ohne eigene Website: ' + a.ohneWebseite + ' von ' + a.gesamt +
    '  ·  mit Telefonnummer: ' + a.mitTelefon);
  console.log('');
  console.log('  KMI = passt zu Kiek mol in, Tel = passt zum Telefon-Retter (0-3)');
  console.log('  ' + markt.marktSatz(a));
}
console.log('');
