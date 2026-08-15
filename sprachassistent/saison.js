#!/usr/bin/env node
'use strict';

// SAISON — was jetzt verkauft werden muss.
//
//   node saison.js           was gerade im Vorlauf ist
//   node saison.js --json    als Daten
//
// Rechnet rueckwaerts: nicht "wann ist Gruenkohl", sondern "ab wann muss
// ich darueber reden, damit der Auftrag nicht weg ist".

const saison = require('./lib/saison');

const liste = saison.anstehend();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(liste, null, 2));
} else if (!liste.length) {
  console.log('Gerade ist nichts im Vorlauf. Naechster Anlass kommt von selbst.');
} else {
  console.log('');
  console.log('  JETZT DRAN (Vorlauf laeuft)');
  console.log('  ------------------------------------------------');
  liste.forEach((a) => {
    console.log('  ' + String(a.wochen + ' Wochen').padEnd(12) + a.name +
      (a.knappWird ? '   << wird knapp' : ''));
    console.log('              ' + a.was);
  });
  console.log('');
}
