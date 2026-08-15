#!/usr/bin/env node
'use strict';

// BEWEIS-ZETTEL — "was hat mein Geld gebracht?"
//
//   node beweis.js                  Kurzfassung fuer alle Kunden
//   node beweis.js <kunde>          ein Kunde, zum Vorlesen
//   node beweis.js <kunde> --html   Blatt zum Ausdrucken/Verschicken
//   node beweis.js --alle --html    Blaetter fuer alle Kunden schreiben
//
// Grundlage sind die Monats-Reports unter sichtbarkeit/data. Was nicht
// dasteht, wird nicht geschaetzt - es fehlt dann eben.

const { ladeEnv } = require('./lib/env');
const beweis = require('./lib/beweis');

ladeEnv();

const rest = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const alsHtml = process.argv.includes('--html');
const alle = process.argv.includes('--alle') || !rest.length;

if (alle) {
  const liste = beweis.fuerAlle();
  if (!liste.length) {
    console.log('Keine Report-Daten gefunden. Lief schon ein Monats-Report? (agentur/ oder sichtbarkeit/)');
    process.exit(0);
  }
  if (alsHtml) {
    liste.forEach((b) => console.log('geschrieben: ' + beweis.schreibe(b)));
  } else {
    liste.forEach((b) => {
      console.log('');
      console.log('  ' + b.name + ' (' + b.monatWort + ')');
      beweis.saetze(b).forEach((z) => console.log('    ' + z));
    });
    console.log('');
  }
  process.exit(0);
}

// Ein Kunde - Name oder Slug, beides erlaubt.
const gesucht = rest.join(' ').toLowerCase();
const treffer = beweis.fuerAlle().find((b) =>
  b.slug === gesucht || b.name.toLowerCase().indexOf(gesucht) > -1);

if (!treffer) {
  console.error('Kunde nicht gefunden: ' + rest.join(' '));
  process.exit(1);
}

if (alsHtml) console.log('geschrieben: ' + beweis.schreibe(treffer));
else console.log(beweis.alsText(treffer));
