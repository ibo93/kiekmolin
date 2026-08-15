#!/usr/bin/env node
'use strict';

// STIMME AUSSUCHEN — mit dem Ohr, nicht mit dem Auge.
//
//   node stimmen.js            was auf diesem Rechner zur Verfuegung steht
//   node stimmen.js hoeren     spielt alle deutschen nacheinander vor
//   node stimmen.js probe 4    eine einzelne anhoeren
//   node stimmen.js nimm 4     diese Stimme fest eintragen (.env)
//   node stimmen.js sanft      dieselbe Stimme in drei Ruhestufen hoeren
//   node stimmen.js stil ruhig die ruhigste uebernehmen
//   node stimmen.js browser    zurueck zur eingebauten Browser-Stimme
//
// Der uebliche Weg: einmal "hoeren", die Nummer merken, "nimm <nummer>".
//
// Kein Schluessel noetig: die eingebauten Mac-Stimmen kosten nichts. Mit
// ELEVENLABS_API_KEY kommen die richtig guten dazu.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { ladeEnv } = require('./lib/env');
const stimmen = require('./lib/stimmen');

const fuehreAus = promisify(execFile);
ladeEnv();

const argumente = process.argv.slice(2);
const befehl = (argumente[0] || '').toLowerCase();
const rest = argumente.slice(1).join(' ').trim();

function zeile(s, nummer, aktuell) {
  const marke = aktuell ? ' <- eingestellt' : '';
  const quelle = s.art === 'mac' ? 'Mac ' : 'ElevenLabs ';
  const wo = s.beschreibung ? '  ' + s.beschreibung.slice(0, 60) : '';
  return '  ' + String(nummer).padStart(2) + ')  ' + s.name.padEnd(24) +
    quelle.padEnd(12) + (s.sprache || '').padEnd(8) + wo + marke;
}

function istAktuell(s, a) {
  return !!a && a.art === s.art && String(a.id).toLowerCase() === String(s.id).toLowerCase();
}

// Ton abspielen. Auf dem Mac mit afplay - anderswo geht es nicht, dann
// wird die Datei nur genannt.
async function spielAb(ton, endung) {
  const datei = path.join(os.tmpdir(), 'kurani-probe-' + Date.now() + endung);
  fs.writeFileSync(datei, ton);
  if (!stimmen.AUF_MAC) {
    console.log('     (Abspielen geht nur auf dem Mac - Datei: ' + datei + ')');
    return;
  }
  try {
    await fuehreAus('afplay', [datei], { timeout: 60000 });
  } finally {
    try { fs.unlinkSync(datei); } catch (_e) { /* egal */ }
  }
}

function endungFuer(art) {
  return art === 'audio/wav' ? '.wav' : '.mp3';
}

// Aus "4" oder "Anna" die gemeinte Stimme machen.
function waehle(liste, wunsch) {
  const t = String(wunsch || '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return liste[parseInt(t, 10) - 1] || null;
  const flach = t.toLowerCase();
  return liste.find((s) => s.name.toLowerCase() === flach) ||
    liste.find((s) => s.name.toLowerCase().indexOf(flach) > -1) || null;
}

function keineGefunden() {
  console.log('');
  console.log('  Ich finde keine eigenen Stimmen auf diesem Rechner.');
  console.log('');
  if (!stimmen.AUF_MAC) {
    console.log('  Die eingebauten Stimmen gibt es nur auf dem Mac.');
  } else {
    console.log('  Deutsche Stimmen nachladen (dauert einmalig ein paar Minuten):');
    console.log('    Systemeinstellungen -> Bedienungshilfen -> Gesprochene Inhalte');
    console.log('    -> Systemstimme -> Anpassen -> Deutsch -> die mit "Premium" laden.');
  }
  console.log('');
  console.log('  Oder die richtig guten: einen Schluessel von elevenlabs.io holen und');
  console.log('  ELEVENLABS_API_KEY in die .env eintragen. Dann hier nochmal starten.');
  console.log('');
}

async function main() {
  if (befehl === 'browser') {
    stimmen.setzeEnv('SPRACH_STIMME', 'browser');
    console.log('  Eingetragen: der Browser spricht. Server neu starten, dann gilt es.');
    return;
  }

  const alle = await stimmen.alle();
  const { deutsch, rest: fremd } = stimmen.deutschZuerst(alle);
  const liste = deutsch.concat(fremd);
  const a = stimmen.aktuelle();

  if (!liste.length) { keineGefunden(); return; }

  // ---- Liste zeigen -------------------------------------------------------
  if (!befehl || befehl === 'liste') {
    console.log('');
    console.log('  STIMMEN auf diesem Rechner');
    console.log('  ------------------------------------------------------------');
    if (deutsch.length) {
      console.log('  Deutsch:');
      deutsch.forEach((s, i) => console.log(zeile(s, i + 1, istAktuell(s, a))));
    }
    if (fremd.length) {
      console.log('');
      console.log('  Andere Sprachen (' + fremd.length + ') - mit "node stimmen.js liste alle" ansehen');
      if (rest === 'alle') fremd.forEach((s, i) => console.log(zeile(s, deutsch.length + i + 1, istAktuell(s, a))));
    }
    console.log('  ------------------------------------------------------------');
    console.log('  Jetzt gilt: ' + (a ? a.name + ' (' + a.art + ')' : 'die Browser-Stimme'));
    console.log('');
    console.log('  Anhoeren:   node stimmen.js hoeren');
    console.log('  Aussuchen:  node stimmen.js nimm 3');
    console.log('');
    return;
  }

  // ---- Alle deutschen der Reihe nach vorspielen ---------------------------
  if (befehl === 'hoeren') {
    const zuHoeren = deutsch.length ? deutsch : liste;
    console.log('');
    console.log('  Ich spiele ' + zuHoeren.length + ' Stimmen vor. Merk dir die Nummer,');
    console.log('  die dir gefaellt - danach: node stimmen.js nimm <nummer>');
    console.log('');
    for (let i = 0; i < zuHoeren.length; i++) {
      const s = zuHoeren[i];
      process.stdout.write('  ' + String(i + 1).padStart(2) + ')  ' + s.name + ' ... ');
      try {
        const { ton, art } = await stimmen.probe(s);
        console.log('');
        await spielAb(ton, endungFuer(art));
      } catch (e) {
        console.log('geht nicht (' + e.message.slice(0, 60) + ')');
      }
    }
    console.log('');
    console.log('  Fertig. Aussuchen mit: node stimmen.js nimm <nummer>');
    console.log('');
    return;
  }

  // ---- Wie ruhig soll sie sprechen? --------------------------------------
  // Dieselbe Stimme, drei Tempi. Der Unterschied ist groesser, als man
  // denkt - Hektik macht jede Stimme hart, auch eine teure.
  if (befehl === 'sanft' || befehl === 'tempo' || befehl === 'ruhe') {
    const s = waehle(liste, rest) ||
      (a && liste.find((x) => x.art === a.art && String(x.id) === String(a.id))) ||
      (deutsch[0] || liste[0]);

    console.log('');
    console.log('  ' + s.name + ' - dreimal derselbe Satz, unterschiedlich ruhig:');
    console.log('');
    const namen = Object.keys(stimmen.STILE);
    for (let i = 0; i < namen.length; i++) {
      const stil = stimmen.stil(namen[i]);
      console.log('  ' + (i + 1) + ')  ' + namen[i] + '  (' + stil.tempo + ' Woerter pro Minute)');
      try {
        const { ton, art } = await stimmen.probe(s, null, stil);
        await spielAb(ton, endungFuer(art));
      } catch (e) {
        console.log('      geht nicht (' + e.message.slice(0, 60) + ')');
      }
    }
    console.log('');
    console.log('  Uebernehmen mit:  node stimmen.js stil ruhig');
    console.log('');
    return;
  }

  if (befehl === 'stil') {
    const gewuenscht = rest.toLowerCase();
    if (!stimmen.STILE[gewuenscht]) {
      console.log('  Moeglich: ' + Object.keys(stimmen.STILE).join(', ') + '   (Anhoeren: node stimmen.js sanft)');
      process.exit(1);
    }
    stimmen.setzeEnv('SPRACH_STIL', gewuenscht);
    console.log('  Eingetragen: ' + gewuenscht + '. Server neu starten, dann gilt es.');
    return;
  }

  // ---- Eine einzelne anhoeren --------------------------------------------
  if (befehl === 'probe') {
    const s = waehle(liste, rest);
    if (!s) { console.log('  Welche? node stimmen.js probe 3   (oder: probe Anna)'); process.exit(1); }
    console.log('  ' + s.name + ' spricht ...');
    const { ton, art } = await stimmen.probe(s);
    await spielAb(ton, endungFuer(art));
    return;
  }

  // ---- Aussuchen ----------------------------------------------------------
  if (befehl === 'nimm') {
    const s = waehle(liste, rest);
    if (!s) { console.log('  Welche? node stimmen.js nimm 3   (oder: nimm Anna)'); process.exit(1); }

    if (s.art === 'mac') stimmen.setzeEnv('SPRACH_STIMME', 'mac:' + s.id);
    else {
      stimmen.setzeEnv('SPRACH_VOICE_ID', s.id);
      stimmen.setzeEnv('SPRACH_STIMME', '');       // ElevenLabs hat Vorrang
    }

    console.log('');
    console.log('  Eingetragen: ' + s.name + ' (' + s.art + ')');
    console.log('  Server neu starten (Fenster zu, ./start.command), dann spricht er so.');
    console.log('');
    return;
  }

  console.log('  Kenne ich nicht. Moeglich: liste, hoeren, probe <n>, nimm <n>, sanft, stil <name>, browser');
  process.exit(1);
}

main().catch((e) => {
  console.error('  Ging nicht: ' + e.message);
  process.exit(1);
});
