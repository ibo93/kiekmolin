// DIE SAMMELDATEI ZUM EINSPIELEN -- darf nicht von den Quellen abdriften.
//
// datenbank/ALLES-EINSPIELEN.sql ist aus den einzelnen Skripten
// zusammengesetzt, damit Ibo einmal einfuegen und einmal auf Run
// druecken kann statt viermal.
//
// GENAU DA LIEGT DIE GEFAHR: aendert jemand spaeter 36-zahlsperre.sql
// und vergisst die Sammeldatei, spielt Ibo eine alte Fassung ein -- und
// niemand merkt es, weil beide Dateien fuer sich betrachtet richtig
// aussehen. Ein stiller Ausfall mit Ansage.
//
// Deshalb: die Sammeldatei muss jedes Quellskript WORTGLEICH enthalten.
'use strict';

const fs = require('fs');
const path = require('path');
const KMI = path.join(__dirname, '..');
const DB = path.join(KMI, 'datenbank');
const SAMMEL = fs.readFileSync(path.join(DB, 'ALLES-EINSPIELEN.sql'), 'utf8');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

const TEILE = ['33-bewertungsanfrage.sql', '35-lead-zaehler.sql',
               '36-zahlsperre.sql', '37-mahnung.sql'];

TEILE.forEach(function (datei) {
    const quelle = fs.readFileSync(path.join(DB, datei), 'utf8').trim();
    t(datei + ' steckt wortgleich drin',
      SAMMEL.indexOf(quelle) >= 0,
      'abgedriftet -- Sammeldatei neu bauen');
});

// Die Reihenfolge zaehlt: 36 legt die Spalten an, auf die sich die
// Zahlsperre stuetzt; 37 die Tabellen fuer die Mahnung davor.
t('die Teile stehen in der richtigen Reihenfolge',
  TEILE.every(function (d, i) {
      return i === 0 || SAMMEL.indexOf(d) > SAMMEL.indexOf(TEILE[i - 1]); }),
  'durcheinander');

// ---- NICHTS ZERSTOERERISCHES -------------------------------------------
// Diese Datei laeuft gegen die ECHTE Datenbank mit echten Bestellungen.
// Ein "drop table", das sich einmal hineinschleicht, ist nicht rueckgaengig
// zu machen.
const befehle = SAMMEL.split('\n')
    .filter(function (z) { return !/^\s*--/.test(z); })
    .join('\n');

[['drop table', /drop\s+table/i],
 ['drop column', /drop\s+column/i],
 ['delete from', /delete\s+from/i],
 ['truncate', /truncate/i],
 ['disable row level security', /disable\s+row\s+level\s+security/i],
 ['create policy', /create\s+policy/i],
 ['grant', /^\s*grant\s/im]
].forEach(function (f) {
    t('kein ' + f[0], !f[1].test(befehle), 'steht drin');
});

// ---- UND DER VERTRAG BLEIBT DRAUSSEN -----------------------------------
// 32-vertrag.sql hat noch [[PLATZHALTER]] und ist anwaltlich ungeprueft.
t('32-vertrag.sql ist NICHT mit drin',
  befehle.indexOf('vertrag_fassungen') < 0, 'der ungepruefte Vertrag laeuft mit');
t('und die Datei sagt auch, warum',
  /kein Anwalt/.test(SAMMEL), 'ohne Begruendung weggelassen');

// ---- DIE GEGENPROBE AM ENDE --------------------------------------------
// Im SQL-Editor sieht man nur das Ergebnis des LETZTEN Befehls. Steht die
// Gegenprobe nicht ganz unten, sieht Ibo irgendein Zwischenergebnis und
// haelt es fuer die Antwort.
const letzterSelect = SAMMEL.lastIndexOf('select');
TEILE.forEach(function (d) {
    t('die Gegenprobe steht hinter ' + d, letzterSelect > SAMMEL.indexOf(d), 'zu frueh');
});
['t33_bewertung', 't35_zaehler', 't36_zahlsperre',
 't36_schreibrecht_muss_0_sein', 't37_absender', 't37_mahnungen',
 'regeln_muessen_0_sein'].forEach(function (spalte) {
    t('die Gegenprobe prueft ' + spalte, SAMMEL.indexOf(spalte) >= 0, 'fehlt');
});

// Mehrmals laufen lassen darf nicht scheitern.
t('jede neue Tabelle mit "if not exists"',
  (befehle.match(/create table if not exists/g) || []).length
  === (befehle.match(/create table/g) || []).length, 'eine ohne');
t('und der Absender wird nur angelegt, wenn er fehlt',
  /on conflict \(id\) do nothing/.test(befehle), 'legt doppelt an');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.'
    : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exitCode = 1;
