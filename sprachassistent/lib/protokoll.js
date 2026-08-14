'use strict';

// Mitschrift: was wurde gesagt, was wurde getan.
//
// Zweck ist nicht Ueberwachung, sondern Nachvollziehbarkeit: wenn der
// Assistent um 7 Uhr morgens "die Rechnung ist raus" sagt, will man
// abends noch nachlesen koennen, welche. Eine Zeile JSON pro Auftrag,
// pro Tag eine Datei. Bleibt lokal (protokoll/ ist gitignored).

const fs = require('fs');
const path = require('path');

const ORDNER = path.join(__dirname, '..', 'protokoll');

function datumsStempel(zeit) {
  const d = zeit || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function schreibe(eintrag) {
  try {
    fs.mkdirSync(ORDNER, { recursive: true });
    const zeile = JSON.stringify(Object.assign({ zeit: new Date().toISOString() }, eintrag)) + '\n';
    fs.appendFileSync(path.join(ORDNER, datumsStempel() + '.jsonl'), zeile);
  } catch (e) {
    // Ein kaputtes Protokoll darf nie den Assistenten stoppen.
    console.error('  ! Protokoll nicht geschrieben: ' + e.message);
  }
}

// Die letzten n Eintraege (neueste zuerst) - fuer die Verlaufs-Ansicht.
function letzte(n) {
  const grenze = n || 30;
  if (!fs.existsSync(ORDNER)) return [];

  const dateien = fs.readdirSync(ORDNER).filter((f) => f.endsWith('.jsonl')).sort().reverse();
  const eintraege = [];
  for (const datei of dateien) {
    const zeilen = fs.readFileSync(path.join(ORDNER, datei), 'utf8').split('\n').filter(Boolean).reverse();
    for (const zeile of zeilen) {
      try { eintraege.push(JSON.parse(zeile)); } catch (_e) { /* kaputte Zeile ueberspringen */ }
      if (eintraege.length >= grenze) return eintraege;
    }
  }
  return eintraege;
}

module.exports = { schreibe, letzte, ORDNER };
