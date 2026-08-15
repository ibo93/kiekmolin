#!/usr/bin/env node
'use strict';

// SELBSTPRUEFUNG — "warum geht das nicht?"
//
//   node pruefe.js
//
// Geht alles durch, was noetig ist, und sagt in Klartext, was fehlt und
// was zu tun ist. Gibt NIE Schluessel-Werte aus - nur ob sie da sind.
//
// Wird auch vom Startknopf (start.command) aufgerufen: klemmt etwas,
// steht es im Fenster, bevor der Server ueberhaupt hochfaehrt.

const path = require('path');
const { ladeEnv } = require('./lib/env');
const befehle = require('./lib/befehle');
const p = require('./lib/pruefung');

ladeEnv();

const WURZEL = __dirname;
const PORT = parseInt(process.env.SPRACH_PORT || '3400', 10);

async function main() {
  const liste = [];

  liste.push(p.pruefeNode());
  liste.push(p.pruefeClaude());
  liste.push(p.pruefeWs(WURZEL));
  liste.push(...p.pruefeSchluessel());
  liste.push(...p.pruefeOrdner(befehle.ladeOrdnerKonfig(path.join(WURZEL, '..'))));
  const gefunden = require('./lib/kurani').finde();
  liste.push(gefunden.ordner.length
    ? p.ergebnis('ok', 'Kurani-Unterlagen', gefunden.ordner.length + ' Ordner, ' + gefunden.claudeDateien.length + ' CLAUDE.md')
    : p.ergebnis('hinweis', 'Kurani-Unterlagen', 'Keine gefunden - er arbeitet dann nur im Repository',
      'Ordner "Kurani" im Benutzerordner anlegen, oder Pfad in SPRACH_ZUSATZ_ORDNER eintragen.'));

  liste.push(p.pruefeSchreibrecht(WURZEL));
  liste.push(await p.pruefePort(PORT));

  console.log('');
  console.log('  KURANI · Sprachassistent - Selbstpruefung');
  console.log('  ------------------------------------------------');
  for (const e of liste) {
    console.log(' ' + p.zeichen(e.stufe) + e.name + ': ' + e.text);
    if (e.hilfe && e.stufe !== 'ok') console.log('        -> ' + e.hilfe);
  }

  const f = p.fazit(liste);
  console.log('  ------------------------------------------------');
  console.log('  ' + f.satz);
  console.log('');
  process.exit(f.bereit ? 0 : 1);
}

main().catch((e) => {
  console.error('Pruefung fehlgeschlagen: ' + e.message);
  process.exit(1);
});
