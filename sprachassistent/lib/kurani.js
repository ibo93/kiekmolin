'use strict';

// DEIN KURANI-KRAM — wo liegt eigentlich alles?
//
// Der Assistent soll nicht nur dieses Repository kennen, sondern die
// ganze Bude: Kundenordner, Druckdaten, Rohmaterial, Rechnungen - und
// vor allem die CLAUDE.md-Dateien, in denen die Regeln fuer einen Kunden
// oder ein Projekt stehen. Die sind das Gedaechtnis, das Ibo ohnehin
// schon pflegt; der Assistent soll darin lesen und schreiben duerfen,
// statt daneben ein zweites aufzubauen.
//
// Gesucht wird an den Stellen, wo so etwas auf einem Mac liegt. Gefunden
// wird, was existiert - geraten wird nichts.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Ordner, die auf einem Mac (oder Linux) in Frage kommen. Der erste
// Treffer gewinnt; alle Treffer werden freigegeben.
function moeglicheOrte(heim) {
  const h = heim || os.homedir();
  return [
    path.join(h, 'Kurani'),
    path.join(h, 'Documents', 'Kurani'),
    path.join(h, 'Dokumente', 'Kurani'),
    path.join(h, 'Desktop', 'Kurani'),
    path.join(h, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Kurani'),
    path.join(h, 'Library', 'CloudStorage'),          // iCloud/Dropbox-Sammelordner
    path.join(h, 'Kurani Design')
  ];
}

// Alle Kurani-Ordner, die es wirklich gibt.
function ordner(heim) {
  const gefunden = [];
  for (const ort of moeglicheOrte(heim)) {
    try {
      if (fs.existsSync(ort) && fs.statSync(ort).isDirectory()) gefunden.push(ort);
    } catch (_e) { /* keine Leserechte - dann eben nicht */ }
  }
  return gefunden;
}

// CLAUDE.md-Dateien: die Regeln, die Ibo fuer Projekte und Kunden schon
// aufgeschrieben hat. Nur die oberen zwei Ebenen - tiefer wird es zaeh
// und bringt nichts.
function claudeDateien(startOrdner, tiefe) {
  const grenze = tiefe === undefined ? 2 : tiefe;
  const treffer = [];

  const suche = (ort, ebene) => {
    if (ebene > grenze) return;
    let eintraege;
    try { eintraege = fs.readdirSync(ort, { withFileTypes: true }); } catch (_e) { return; }
    for (const e of eintraege) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const voll = path.join(ort, e.name);
      if (e.isFile() && /^claude\.md$/i.test(e.name)) treffer.push(voll);
      else if (e.isDirectory() && ebene < grenze) suche(voll, ebene + 1);
    }
  };

  for (const start of (Array.isArray(startOrdner) ? startOrdner : [startOrdner]).filter(Boolean)) {
    suche(start, 0);
  }
  return treffer;
}

// Was der Assistent ueber die Bude wissen muss - kommt in den System-Prompt.
function systemHinweis(gefunden, claudeMds) {
  if (!gefunden || !gefunden.length) return '';

  const teile = ['Ibos Kurani-Unterlagen liegen in: ' + gefunden.join(', ') +
    '. Du darfst dort lesen und arbeiten.'];

  if (claudeMds && claudeMds.length) {
    teile.push('Dort stehen Regeln in CLAUDE.md-Dateien (' + claudeMds.slice(0, 6).join(', ') +
      (claudeMds.length > 6 ? ' und weitere' : '') + '). LIES die passende, bevor du fuer einen ' +
      'Kunden oder ein Projekt arbeitest - da steht drin, wie es bei ihm laeuft. ' +
      'Sagt Ibo etwas, das dauerhaft fuer diesen Kunden gilt, schreib es dort dazu ' +
      '(anhaengen, nie die Datei neu schreiben) und sag in einem Halbsatz, dass du es eingetragen hast.');
  }

  return teile.join(' ');
}

// Alles auf einmal - fuer Server und Selbstpruefung.
function finde(heim) {
  const gefunden = ordner(heim);
  const mds = claudeDateien(gefunden);
  return { ordner: gefunden, claudeDateien: mds, hinweis: systemHinweis(gefunden, mds) };
}

module.exports = { finde, ordner, claudeDateien, systemHinweis, moeglicheOrte };
