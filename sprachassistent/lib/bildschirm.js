'use strict';

// BILDSCHIRM — "Guck dir das mal an."
//
// Ibo ist Gestalter. Das Wichtigste liegt nicht in einer Datei, ueber die
// man reden kann, sondern auf dem Schirm: das Plakat in Canva, der Schnitt
// in der Timeline, die Karte im Layout. Ein Assistent, der das nicht sehen
// kann, ist bei genau der Arbeit blind, um die es geht.
//
// Also: Foto vom Bildschirm machen, Claude sieht es sich an, Antwort kommt
// gesprochen zurueck. Auf dem Mac kann das Betriebssystem das von Haus aus
// (screencapture) - kein Zusatzprogramm noetig.
//
// Datenschutz: die Bilder bleiben lokal in bildschirm/ (gitignored), und
// es werden nur die letzten paar behalten. Ein Foto entsteht NUR, wenn Ibo
// ausdruecklich danach fragt - nichts laeuft im Hintergrund mit.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ORDNER = path.join(__dirname, '..', 'bildschirm');
const BEHALTEN = 8;

function zeitstempel(jetzt) {
  const d = jetzt || new Date();
  const zwei = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + zwei(d.getMonth() + 1) + zwei(d.getDate()) + '-' + zwei(d.getHours()) + zwei(d.getMinutes()) + zwei(d.getSeconds());
}

// Welches Programm macht hier Bildschirmfotos?
//   -x = ohne Ton, sonst klickt es bei jedem Foto.
function werkzeugFuer(plattform) {
  if (plattform === 'darwin') return { befehl: 'screencapture', args: (ziel) => ['-x', ziel] };
  if (plattform === 'linux') return { befehl: 'import', args: (ziel) => ['-window', 'root', ziel] };
  if (plattform === 'win32') return null;
  return null;
}

function machFoto(optionen) {
  const o = optionen || {};
  const werkzeug = werkzeugFuer(o.plattform || process.platform);
  if (!werkzeug) {
    return Promise.reject(new Error('Bildschirmfotos kann ich auf diesem System nicht machen'));
  }

  fs.mkdirSync(ORDNER, { recursive: true });
  const ziel = path.join(ORDNER, 'schirm-' + zeitstempel(o.jetzt) + '.png');

  return new Promise((erfuellt, abgelehnt) => {
    execFile(werkzeug.befehl, werkzeug.args(ziel), { timeout: 15000 }, (fehler) => {
      if (fehler) {
        return abgelehnt(new Error(fehler.code === 'ENOENT'
          ? 'Das Programm "' + werkzeug.befehl + '" gibt es hier nicht'
          : 'Bildschirmfoto ging nicht: ' + fehler.message));
      }
      if (!fs.existsSync(ziel) || fs.statSync(ziel).size < 1000) {
        // Auf dem Mac passiert genau das, wenn die Freigabe fehlt.
        return abgelehnt(new Error('Das Foto ist leer geblieben - fehlt die Bildschirmaufnahme-Freigabe fuer das Terminal? ' +
          '(Systemeinstellungen, Datenschutz & Sicherheit, Bildschirmaufnahme)'));
      }
      aufraeumen();
      erfuellt(ziel);
    });
  });
}

// Alte Bildschirmfotos wegwerfen - es sammelt sich sonst der halbe
// Arbeitstag in Bildern.
function aufraeumen() {
  try {
    const dateien = fs.readdirSync(ORDNER).filter((f) => f.endsWith('.png')).sort();
    for (const alt of dateien.slice(0, Math.max(0, dateien.length - BEHALTEN))) {
      fs.unlinkSync(path.join(ORDNER, alt));
    }
  } catch (_e) { /* nicht so wichtig */ }
}

// Alternative: das letzte Bildschirmfoto, das Ibo selbst gemacht hat
// (Mac legt die per Standard auf den Schreibtisch). Damit geht auch
// "guck dir den Screenshot an, den ich gerade gemacht habe".
function letztesEigenes(ordner) {
  const suchOrt = ordner || path.join(os.homedir(), 'Desktop');
  if (!fs.existsSync(suchOrt)) return null;

  let bestes = null;
  for (const datei of fs.readdirSync(suchOrt)) {
    if (!/\.(png|jpg|jpeg)$/i.test(datei)) continue;
    const voll = path.join(suchOrt, datei);
    let stat;
    try { stat = fs.statSync(voll); } catch (_e) { continue; }
    if (!bestes || stat.mtimeMs > bestes.zeit) bestes = { pfad: voll, zeit: stat.mtimeMs };
  }
  return bestes ? bestes.pfad : null;
}

module.exports = { machFoto, letztesEigenes, werkzeugFuer, aufraeumen, ORDNER, BEHALTEN };
