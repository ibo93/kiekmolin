#!/usr/bin/env node
'use strict';

// DEIN CM — auf Zuruf, ohne die Kundenverwaltung zu oeffnen.
//
//   node crm.js                    kurzer Stand zum Vorlesen
//   node crm.js kunde la piazza    was das CM ueber einen Kunden weiss
//   node crm.js faellig            offene Wiedervorlagen
//   node crm.js still              Kunden, von denen lange nichts kam
//   node crm.js liste              alle Kunden, eine Zeile je Kunde
//   node crm.js quellen            WO gesucht wurde und was gefunden wurde
//   ... --json                     dasselbe als Daten
//
// Alles lesend. Geaendert wird im CM selbst - eine Stimme, die sich
// verhoert, soll keine Kundenakte umschreiben.
//
// Findet er nichts, sagt "quellen", wo er gesucht hat. Dann traegst du den
// Pfad einmal in sprachassistent/.env ein:  SPRACH_CRM=~/CRM/kunden.json

const { ladeEnv } = require('./lib/env');
const crm = require('./lib/crm');

ladeEnv();

const argumente = process.argv.slice(2).filter((a) => a !== '--json');
const alsJson = process.argv.includes('--json');
const befehl = (argumente[0] || '').toLowerCase();
const rest = argumente.slice(1).join(' ');

function zeile(k) {
  const teile = [k.name];
  if (k.ort) teile.push(k.ort);
  if (k.status) teile.push(k.status);
  if (k.wert) teile.push(Math.round(k.wert).toLocaleString('de-DE') + ' EUR');
  if (k.wiedervorlage) teile.push('WV ' + k.wiedervorlage);
  else if (k.letzterKontakt) teile.push('zuletzt ' + k.letzterKontakt);
  return teile.join(' · ');
}

if (befehl === 'quellen') {
  const q = crm.quellen();
  const brauchbar = q.filter((e) => e.art !== 'fehlt');
  if (alsJson) {
    console.log(JSON.stringify(q, null, 2));
  } else if (!brauchbar.length) {
    q.forEach((e) => console.log('  Eingetragen, aber nicht da: ' + e.pfad));
    console.log('Kein CM gefunden.');
    console.log('');
    console.log('Trag den Pfad einmal in sprachassistent/.env ein, dann findet er es immer:');
    console.log('  SPRACH_CRM=~/Pfad/zu/deinem/CM');
    console.log('');
    console.log('Erlaubt sind: eine Datei (.json, .jsonl, .csv), ein Ordner, eine');
    console.log('SQLite-Datenbank (.db) oder die Adresse deines laufenden CM');
    console.log('(z.B. http://localhost:3000/api/kunden). Mehrere mit Komma trennen.');
  } else {
    q.forEach((e) => {
      console.log('  ' + e.art.padEnd(10) + e.pfad + (e.anzahl ? '  (' + e.anzahl + ' Kunden)' : ''));
    });
  }
  process.exit(0);
}

// Async, weil das CM auch als Programm mit einer Adresse laufen kann
// (SPRACH_CRM=http://localhost:3000/api/kunden).
crm.standAsync().then((s) => {
  if (alsJson) {
    console.log(JSON.stringify(s, null, 2));
  } else if (befehl === 'kunde') {
    const treffer = crm.suche(rest, s.kunden);
    if (!rest) console.log('Welchen Kunden? node crm.js kunde la piazza');
    else if (!treffer.length) console.log('"' + rest + '" steht nicht im CM.');
    else if (treffer.length > 3) console.log('Auf "' + rest + '" passen ' + treffer.length + ' Kunden: ' + treffer.slice(0, 6).map((k) => k.name).join(', '));
    else treffer.forEach((k) => console.log(crm.kundeSatz(k)));
  } else if (befehl === 'faellig') {
    if (!s.faellig.length) console.log('Keine Wiedervorlage faellig.');
    s.faellig.forEach((k) => console.log('  ' + zeile(k) + (k.telefon ? ' · ' + k.telefon : '')));
  } else if (befehl === 'still') {
    if (!s.still.length) console.log('Kein Kunde ist laenger als ' + crm.STILL_AB_TAGEN + ' Tage still.');
    s.still.forEach((k) => console.log('  ' + zeile(k)));
  } else if (befehl === 'liste') {
    if (!s.gesamt) console.log('Keine Kunden gefunden. Wo liegt dein CM? node crm.js quellen');
    s.kunden.forEach((k) => console.log('  ' + zeile(k)));
  } else {
    console.log(crm.crmSatz(s));
  }
}).catch((e) => {
  console.error('CM nicht lesbar: ' + e.message);
  process.exit(1);
});
