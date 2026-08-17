#!/usr/bin/env node
'use strict';

// NOTIZEN — Gedaechtnis von Hand bedienen (und fuer den Assistenten).
//
//   node notizen.js liste                       offene Notizen
//   node notizen.js merk "Karte bis Freitag"    anlegen (Zeit wird erkannt)
//   node notizen.js erledigt <id|stichwort>     abhaken
//   node notizen.js heute                       was heute faellig ist
//
// Per Sprache geht dasselbe schneller: "Merk dir ...", "Erinner mich
// morgen um neun an ...", "Was hab ich mir notiert?" - das laeuft ohne
// KI und kostet nichts.

const { ladeEnv } = require('./lib/env');
const notizen = require('./lib/notizen');

ladeEnv();

const rest = process.argv.slice(2).filter((a) => a !== '--json');
const alsJson = process.argv.includes('--json');
const befehl = (rest[0] || 'liste').toLowerCase();

function zeigen(liste) {
  if (alsJson) return console.log(JSON.stringify(liste, null, 2));
  if (!liste.length) return console.log('Nichts offen.');
  liste.forEach((n) => {
    const wann = n.faellig ? '  (' + notizen.zeitWort(n.faellig) + ')' : '';
    console.log('- [' + n.id + '] ' + n.text + wann);
  });
}

if (befehl === 'liste' || befehl === 'offen') {
  zeigen(notizen.offene());
} else if (befehl === 'heute') {
  const ende = new Date();
  ende.setHours(23, 59, 59, 999);
  zeigen(notizen.faelligBis(ende));
} else if (befehl === 'merk' || befehl === 'merke' || befehl === 'neu') {
  const text = rest.slice(1).join(' ');
  if (!text) { console.error('So geht es: node notizen.js merk "Text, morgen um 9"'); process.exit(1); }
  const zeit = notizen.deuteZeit(text);
  const n = notizen.merke(zeit.rest || text, { faellig: zeit.faellig });
  console.log('Notiert [' + n.id + ']' + (n.faellig ? ' - faellig ' + notizen.zeitWort(n.faellig) : '') + '.');
} else if (befehl === 'erledigt' || befehl === 'fertig' || befehl === 'abhaken') {
  const weg = notizen.erledige(rest.slice(1).join(' '));
  if (!weg) { console.error('Nicht gefunden.'); process.exit(1); }
  console.log('Abgehakt: ' + weg.text);
} else {
  console.error('Kenne ich nicht: ' + befehl + '. Moeglich: liste, heute, merk, erledigt');
  process.exit(1);
}
