'use strict';

// DIKTAT — mitschreiben statt ausführen.
//
// Beim Kunden im Laden, im Auto nach dem Termin, auf der Leiter vor dem
// Schaufenster: da will man reden und hinterher den Text haben - und NICHT,
// dass eine KI anfaengt, Sachen zu tun.
//
// "Schreib mit" startet das Diktat. Ab da wandert jeder Satz woertlich in
// eine Datei, ohne dass Claude ueberhaupt gefragt wird - kostet nichts und
// geht sofort. "Diktat Ende" schliesst ab und sagt, wo es liegt.

const fs = require('fs');
const path = require('path');

const ORDNER = path.join(__dirname, '..', 'diktate');

function zeitstempel(jetzt) {
  const d = jetzt || new Date();
  const zwei = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate()) +
    '_' + zwei(d.getHours()) + '-' + zwei(d.getMinutes());
}

// Ein laufendes Diktat. Absichtlich ein Objekt und keine globale Variable:
// jedes Fenster diktiert fuer sich.
class Diktat {
  constructor(titel, jetzt) {
    this.titel = String(titel || '').trim() || 'Notiz';
    this.begonnen = jetzt || new Date();
    this.saetze = [];
  }

  dazu(satz) {
    const t = String(satz || '').trim();
    if (!t) return this.saetze.length;
    this.saetze.push(t);
    return this.saetze.length;
  }

  get woerter() {
    return this.saetze.join(' ').split(/\s+/).filter(Boolean).length;
  }

  // Abschliessen und wegschreiben. Rueckgabe sagt, was zu melden ist.
  speichere() {
    if (!this.saetze.length) return { leer: true, saetze: 0, woerter: 0 };

    fs.mkdirSync(ORDNER, { recursive: true });
    const name = zeitstempel(this.begonnen) + '_' +
      this.titel.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) + '.md';
    const datei = path.join(ORDNER, name);

    const kopf = [
      '# ' + this.titel,
      '',
      'Diktiert am ' + this.begonnen.toLocaleString('de-DE'),
      '',
      ''
    ].join('\n');

    fs.writeFileSync(datei, kopf + this.saetze.map((s) => s + (/[.!?]$/.test(s) ? '' : '.')).join('\n\n') + '\n');
    return { datei: datei, name: name, saetze: this.saetze.length, woerter: this.woerter, leer: false };
  }
}

module.exports = { Diktat, ORDNER, zeitstempel };
