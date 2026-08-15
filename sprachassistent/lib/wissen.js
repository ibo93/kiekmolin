'use strict';

// DAUERHAFTES WISSEN — was er sich fuer immer merkt.
//
// Notizen sind Aufgaben ("Karte bis Freitag"). Wissen ist etwas anderes:
// Dinge, die dauerhaft gelten und die man einer neuen Aushilfe erklaeren
// wuerde.
//
//   "Merk dir dauerhaft: die Boerse zahlt per Rechnung, nie bar."
//   "Grundsaetzlich: Plakate immer 3 Millimeter Beschnitt."
//   "La Piazza heisst mit Nachnamen Esposito, den Namen richtig schreiben."
//
// Das steht danach in JEDEM Auftrag im System-Prompt. Der Unterschied
// zwischen einem Werkzeug, dem man alles dreimal erklaert, und einem
// Kollegen, der die Bude kennt.
//
// Bewusst als Markdown-Datei: Ibo soll sie aufmachen, lesen und Unsinn
// von Hand rausstreichen koennen. Ein Gedaechtnis, in das man nicht
// reingucken kann, ist unheimlich.

const fs = require('fs');
const path = require('path');

const DATEI = path.join(__dirname, '..', 'wissen.md');
// Grenze, damit der System-Prompt nicht ins Unermessliche waechst (und
// mit ihm die Kosten jedes einzelnen Auftrags).
const MAX_ZEICHEN = 2500;

const KOPF = [
  '# Was der Assistent dauerhaft weiss',
  '',
  'Diese Datei geht bei JEDEM Auftrag mit. Kurz halten, Unsinn rausstreichen.',
  'Angelegt per Sprache: "Merk dir dauerhaft: ..."',
  ''
].join('\n');

function datum(jetzt) {
  const d = jetzt || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function lies() {
  if (!fs.existsSync(DATEI)) return '';
  return fs.readFileSync(DATEI, 'utf8');
}

// Die reinen Wissens-Zeilen (ohne Kopf), neueste zuletzt.
function zeilen() {
  return lies().split('\n')
    .filter((z) => z.trim().startsWith('- '))
    .map((z) => z.trim().slice(2).trim())
    .filter(Boolean);
}

function merke(text, jetzt) {
  const sauber = String(text || '').trim().replace(/\s+/g, ' ');
  if (!sauber) throw new Error('Ohne Text kein Wissen');

  // Schon bekannt? Dann nicht doppelt reinschreiben.
  const vorhanden = zeilen().map((z) => z.replace(/\s*\(seit [\d-]+\)\s*$/, '').toLowerCase());
  if (vorhanden.indexOf(sauber.toLowerCase()) > -1) return { neu: false, text: sauber };

  if (!fs.existsSync(DATEI)) fs.writeFileSync(DATEI, KOPF);
  fs.appendFileSync(DATEI, '- ' + sauber + ' (seit ' + datum(jetzt) + ')\n');
  return { neu: true, text: sauber };
}

// Was davon in den System-Prompt geht. Wird es zu lang, gewinnt das
// NEUESTE - was Ibo zuletzt erklaert hat, gilt am ehesten noch.
function alsSystemZusatz() {
  const liste = zeilen();
  if (!liste.length) return '';

  const genommen = [];
  let laenge = 0;
  for (let i = liste.length - 1; i >= 0; i--) {
    const z = liste[i];
    if (laenge + z.length + 3 > MAX_ZEICHEN) break;
    genommen.unshift(z);
    laenge += z.length + 3;
  }

  return 'Das gilt bei Ibo dauerhaft, richte dich danach: ' + genommen.map((z) => '(' + z + ')').join(' ') +
    (genommen.length < liste.length ? ' (aeltere Punkte stehen in wissen.md)' : '');
}

function vergiss(stichwort) {
  const suche = String(stichwort || '').toLowerCase().trim();
  if (!suche || !fs.existsSync(DATEI)) return null;

  const alle = lies().split('\n');
  const index = alle.findIndex((z) => z.trim().startsWith('- ') && z.toLowerCase().indexOf(suche) > -1);
  if (index === -1) return null;

  const weg = alle[index].trim().slice(2).trim();
  alle.splice(index, 1);
  fs.writeFileSync(DATEI, alle.join('\n'));
  return weg;
}

module.exports = { merke, lies, zeilen, alsSystemZusatz, vergiss, DATEI, MAX_ZEICHEN };
