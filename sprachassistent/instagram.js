#!/usr/bin/env node
'use strict';

// INSTAGRAM-WERKZEUG — das, was der Sprachassistent aufruft, wenn Ibo
// "wie lief das letzte Reel?" oder "poste das Reel" sagt.
//
// Auch von Hand nutzbar:
//
//   node instagram.js konto                     Follower, Anzahl Beitraege
//   node instagram.js beitraege [anzahl]        letzte Beitraege mit Zahlen
//   node instagram.js reel-zahlen               das letzte Reel im Detail
//   node instagram.js kommentare [anzahl]       Kommentare unter dem letzten Beitrag
//   node instagram.js antworte <id> "<text>"    auf einen Kommentar antworten
//   node instagram.js poste <video-url> "<text>"  Reel veroeffentlichen
//
// Zusatz: --json gibt Rohdaten aus (fuer Weiterverarbeitung).
// Ohne INSTAGRAM_TOKEN sagt das Werkzeug klar, was fehlt.

const { ladeEnv } = require('./lib/env');
const ig = require('./lib/instagram');

ladeEnv();

const argumente = process.argv.slice(2);
const alsJson = argumente.includes('--json');
const rest = argumente.filter((a) => a !== '--json');
const befehl = (rest[0] || 'konto').toLowerCase();

function ausgabe(satz, daten) {
  if (alsJson) console.log(JSON.stringify(daten !== undefined ? daten : { text: satz }, null, 2));
  else console.log(satz);
}

async function letzterBeitrag() {
  const liste = await ig.beitraege(1);
  if (!liste.length) throw new Error('Ich finde keinen Beitrag in deinem Konto');
  return liste[0];
}

async function main() {
  if (befehl === 'konto') {
    const k = await ig.konto();
    return ausgabe(ig.satzZuKonto(k), k);
  }

  if (befehl === 'beitraege' || befehl === 'beiträge' || befehl === 'posts') {
    const anzahl = parseInt(rest[1] || '5', 10);
    const liste = await ig.beitraege(anzahl);
    if (alsJson) return ausgabe('', liste);
    liste.forEach((b) => console.log('- ' + ig.satzZuBeitrag(b, null) + ' ' + b.link));
    return;
  }

  if (befehl === 'reel-zahlen' || befehl === 'zahlen') {
    const b = await letzterBeitrag();
    let zahlen = null;
    try { zahlen = await ig.beitragsZahlen(b.id, b.art === 'Reel'); } catch (e) {
      // Insights gibt es nur fuer Profi-Konten und erst ab ein paar Aufrufen.
      if (!alsJson) console.log('(Detailzahlen nicht abrufbar: ' + e.message + ')');
    }
    return ausgabe(ig.satzZuBeitrag(b, zahlen), { beitrag: b, zahlen: zahlen });
  }

  if (befehl === 'kommentare') {
    const anzahl = parseInt(rest[1] || '10', 10);
    const b = await letzterBeitrag();
    const liste = await ig.kommentare(b.id, anzahl);
    if (alsJson) return ausgabe('', { beitrag: b, kommentare: liste });
    if (!liste.length) return console.log('Unter dem letzten Beitrag steht noch nichts.');
    console.log('Unter "' + b.text + '":');
    liste.forEach((k) => console.log('- @' + k.username + ': ' + ig.kurzText(k.text, 120) + '   [' + k.id + ']'));
    return;
  }

  if (befehl === 'antworte') {
    const id = rest[1];
    const text = rest.slice(2).join(' ');
    if (!id || !text) throw new Error('So geht es: node instagram.js antworte <kommentar-id> "<text>"');
    const e = await ig.antworte(id, text);
    return ausgabe('Antwort ist raus.', e);
  }

  if (befehl === 'poste' || befehl === 'reel') {
    const videoUrl = rest[1];
    const text = rest.slice(2).join(' ');
    if (!videoUrl) throw new Error('So geht es: node instagram.js poste <video-url> "<text>"');
    const e = await ig.posteReel({ videoUrl: videoUrl, text: text });
    return ausgabe('Das Reel ist veroeffentlicht.', e);
  }

  throw new Error('Kenne ich nicht: ' + befehl + '. Moeglich: konto, beitraege, zahlen, kommentare, antworte, poste');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
