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

// Was hat der Assistent heute gekostet? Wird vor jedem Auftrag geprueft -
// ein Tagesdeckel schuetzt davor, dass eine Endlosschleife oder ein
// missverstandener Satz stundenlang Geld verbrennt.
function tagesKosten(datum) {
  const tag = datum || datumsStempel();
  const datei = path.join(ORDNER, tag + '.jsonl');
  if (!fs.existsSync(datei)) return 0;

  let summe = 0;
  for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
    if (!zeile.trim()) continue;
    try {
      const e = JSON.parse(zeile);
      if (!e.demo) summe += Number(e.kosten) || 0;
    } catch (_e) { /* kaputte Zeile ueberspringen */ }
  }
  return Math.round(summe * 10000) / 10000;
}

module.exports = { schreibe, letzte, tagesKosten, datumsStempel, ORDNER };
