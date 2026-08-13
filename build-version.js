// WELCHER STAND IST EIGENTLICH LIVE?
//
// Diese Frage hat einen halben Tag gekostet. Auf main stand die fertige
// Fassung, alle Tests gruen, der Merge war durch -- und auf kiekmolin.de stand
// trotzdem noch der alte Text: "Renner und Penner", die erfundenen
// Oeffnungszeiten, kein Angebots-Abzeichen. Es sah nach einem misslungenen
// Merge aus. Es war aber ein fehlender Deploy: Netlify hatte seit dem Merge
// gar nicht mehr gebaut.
//
// Warum das so schwer zu sehen war: ein alter Deploy meldet genau dasselbe
// "ready" wie ein frischer. Weder die Netlify-Uebersicht noch die Seite selbst
// verraten, aus welchem Commit sie stammt. Man kann raten oder Text
// vergleichen -- beides ist langsam und beides fuehrt in die Irre.
//
// version.txt beendet das Raten:
//
//     kiekmolin.de/version.txt
//
// Steht dort derselbe Commit wie auf main, ist alles draussen. Steht dort ein
// aelterer, fehlt ein DEPLOY -- nicht ein Merge. Zwei verschiedene Probleme mit
// zwei verschiedenen Loesungen, und ab jetzt in fuenf Sekunden unterscheidbar.
//
// EIGENES SKRIPT, MIT ABSICHT.
// Der Stempel stand zuerst am Ende von minify-build.js. Das war falsch: dieses
// Skript braucht terser, und wenn terser fehlt oder ein Block nicht parst,
// bricht es ab -- und dann gaebe es ausgerechnet in dem Moment keinen Ausweis,
// in dem man ihn am dringendsten braucht. Der Ausweis darf von nichts
// abhaengen. Er liest nur Umgebungsvariablen und schreibt eine Textdatei.
'use strict';
const fs = require('fs');
const path = require('path');

// Zielordner wie bei den uebrigen Build-Schritten per Umgebung umbiegbar,
// damit Tests nicht ins echte Projekt schreiben.
const OUT_DIR = process.env.SEO_OUT_DIR || __dirname;

// COMMIT_REF, BRANCH und DEPLOY_ID setzt Netlify beim Bauen selbst. Lokal sind
// sie leer -- dann steht "lokal" da. Eine leere Zeile waere schlimmer als eine
// ehrliche Angabe: sie sieht aus wie ein Fehler und sagt nichts.
const zeilen = [
  'commit:   ' + (process.env.COMMIT_REF || 'lokal'),
  'branch:   ' + (process.env.BRANCH || 'lokal'),
  'deploy:   ' + (process.env.DEPLOY_ID || 'lokal'),
  'gebaut:   ' + new Date().toISOString()
];

const ziel = path.join(OUT_DIR, 'version.txt');
fs.writeFileSync(ziel, zeilen.join('\n') + '\n', 'utf8');
console.log('[version] ' + ziel + ' -> ' + zeilen[0].replace(/\s+/g, ' '));
