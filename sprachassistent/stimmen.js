#!/usr/bin/env node
'use strict';

// STIMME AUSSUCHEN — mit dem Ohr, nicht mit dem Auge.
//
//   node stimmen.js            was auf diesem Rechner zur Verfuegung steht
//   node stimmen.js hoeren     spielt alle deutschen nacheinander vor
//   node stimmen.js probe 4    eine einzelne anhoeren
//   node stimmen.js nimm 4     diese Stimme fest eintragen (.env)
//   node stimmen.js nimm <VoiceID>  geht auch - die Kennung von elevenlabs.io
//   node stimmen.js tempo      wie schnell? drei Tempi hoeren
//   node stimmen.js tempo 215  schneller sprechen
//   node stimmen.js sanft      wie sanft? drei Stufen hoeren
//   node stimmen.js stil ruhig die sanfteste uebernehmen
//   node stimmen.js deutsch    einfach die beste DEUTSCHE nehmen, fertig
//   node stimmen.js jetzt      was ist eingestellt - und wie klingt es?
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

// Sieht das nach einer ElevenLabs-Kennung aus? Die sind 20 Zeichen lang,
// Buchstaben und Ziffern - auf der Webseite steht sie bei jeder Stimme.
function istKennung(t) {
  return /^[A-Za-z0-9]{18,26}$/.test(String(t || '').trim());
}

// Aus "4", "Anna" oder einer Voice ID die gemeinte Stimme machen.
function waehle(liste, wunsch) {
  const t = String(wunsch || '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return liste[parseInt(t, 10) - 1] || null;
  const flach = t.toLowerCase();
  return liste.find((s) => String(s.id).toLowerCase() === flach) ||
    liste.find((s) => s.name.toLowerCase() === flach) ||
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

// Laeuft schon ein Server auf dem Port? Dann benutzt DER noch die alte
// Einstellung - die .env wird nur beim Start gelesen. Das ist der
// haeufigste Grund fuer "ich hab doch umgestellt, es klingt aber gleich".
function altenServerPruefen() {
  return new Promise((fertig) => {
    const net = require('net');
    const port = parseInt(process.env.SPRACH_PORT || '3400', 10);
    const server = net.createServer();
    server.once('error', () => fertig(port));                 // belegt
    server.once('listening', () => server.close(() => fertig(0)));
    server.listen(port, '127.0.0.1');
  });
}

// WAS IST GERADE EINGESTELLT - und wie klingt das?
//
// Nicht was in der Liste steht, nicht was zuletzt eingetippt wurde:
// genau der Weg, den der Server nimmt, wenn er gleich antwortet.
async function jetzt(liste) {
  const envPfad = path.join(__dirname, '.env');
  const weg = stimmen.welcherWeg();
  const a = stimmen.aktuelle();
  const s = stimmen.stil();

  console.log('');
  console.log('  WAS GERADE EINGESTELLT IST');
  console.log('  ------------------------------------------------------------');
  console.log('  Einstellungen:  ' + (fs.existsSync(envPfad) ? envPfad : 'keine .env - es gilt der Standard'));
  console.log('  Weg:            ' + weg);
  console.log('  SPRACH_STIMME:  ' + (process.env.SPRACH_STIMME || '(leer)'));
  console.log('  SPRACH_VOICE_ID:' + (process.env.SPRACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || ' (leer)'));
  console.log('  Tempo:          ' + s.tempo + ' Woerter/Minute, Stil ' + s.name);

  if (weg === 'browser') {
    console.log('');
    console.log('  Es spricht die Browser-Stimme. Aussuchen: node stimmen.js hoeren');
    console.log('');
    return;
  }

  // Welche Stimme steckt hinter der Kennung? Das ist der Punkt, an dem
  // sich "franzoesisch" verraet.
  const gefunden = (liste || []).find((x) => x.art === a.art && String(x.id) === String(a.id));
  if (gefunden) {
    console.log('  Name:           ' + gefunden.name);
    console.log('  Sprache:        ' + (gefunden.sprache || 'nicht angegeben'));
    if (!stimmen.istDeutsch(gefunden)) {
      console.log('');
      console.log('  >>> DAS IST DER FEHLER: diese Stimme ist nicht deutsch.');
      console.log('  >>> Sie liest deutschen Text vor, aber mit Akzent.');
      console.log('  >>> Deutsche holen: elevenlabs.io -> Voice Library ->');
      console.log('  >>> Filter "German" -> Add to my voices. Dann: node stimmen.js hoeren');
    }
  } else if (a.art === 'elevenlabs') {
    console.log('  Name:           unbekannt - diese Kennung liegt nicht in deinem Konto.');
    console.log('                  Neu aussuchen: node stimmen.js hoeren');
  }

  const belegt = await altenServerPruefen();
  if (belegt) {
    console.log('');
    console.log('  ACHTUNG: auf Port ' + belegt + ' laeuft noch ein Server.');
    console.log('  Der hat die ALTE Einstellung geladen - die .env wird nur beim');
    console.log('  Start gelesen. Erst beenden, dann neu starten:');
    console.log('    pkill -f "node server.js"  &&  ./start.command');
  }

  console.log('');
  console.log('  So klingt es gleich:');
  try {
    const { ton, art } = await require('./lib/stimme').spreche(stimmen.PROBE);
    await spielAb(ton, endungFuer(art));
  } catch (e) {
    console.log('  Geht nicht: ' + e.message);
  }
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

  if (befehl === 'jetzt' || befehl === 'pruefe') return jetzt(liste);

  // ---- Einfach eine deutsche. Ohne aussuchen. ----------------------------
  if (befehl === 'deutsch') {
    const beste = stimmen.besteDeutsche(liste);
    if (!beste) {
      console.log('');
      console.log('  Auf diesem Rechner ist KEINE deutsche Stimme.');
      console.log('');
      console.log('  Zwei Wege, in zwei Minuten:');
      console.log('');
      console.log('  A) Kostenlos, im Mac eingebaut:');
      console.log('     Systemeinstellungen -> Bedienungshilfen -> Gesprochene Inhalte');
      console.log('     -> Systemstimme -> Anpassen -> Deutsch -> eine mit "Premium" laden.');
      console.log('');
      console.log('  B) Besser, ueber ElevenLabs:');
      console.log('     elevenlabs.io -> Voice Library -> Filter Language: German');
      console.log('     -> bei einer, die dir gefaellt: "Add to my voices".');
      console.log('');
      console.log('  Danach nochmal:  node stimmen.js deutsch');
      console.log('');
      process.exit(1);
    }

    if (beste.art === 'mac') stimmen.setzeEnv('SPRACH_STIMME', 'mac:' + beste.id);
    else {
      stimmen.setzeEnv('SPRACH_VOICE_ID', beste.id);
      stimmen.setzeEnv('SPRACH_STIMME', '');
    }

    console.log('');
    console.log('  Eingetragen: ' + beste.name + '  [deutsch, ' + beste.art + ']');
    console.log('  So klingt sie:');
    try {
      const { ton, art } = await stimmen.probe(beste);
      await spielAb(ton, endungFuer(art));
    } catch (e) {
      console.log('  (Vorspielen ging nicht: ' + e.message.slice(0, 60) + ')');
    }

    const andere = liste.filter(stimmen.istDeutsch).length;
    if (andere > 1) console.log('  Es gibt noch ' + (andere - 1) + ' weitere deutsche: node stimmen.js hoeren');
    console.log('');
    console.log('  Jetzt neu starten:  pkill -f "node server.js" && ./start.command');
    console.log('');
    return;
  }

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
    if (!deutsch.length) {
      console.log('  Achtung: keine der Stimmen ist als DEUTSCH gekennzeichnet.');
      console.log('  Sie lesen deutschen Text vor, aber mit Akzent.');
      console.log('  Deutsche holst du dir auf elevenlabs.io -> Voice Library');
      console.log('  -> nach "German" filtern -> "Add to my voices". Danach');
      console.log('  tauchen sie hier auf.');
      console.log('');
    }
    console.log('  Ich spiele ' + zuHoeren.length + ' Stimmen vor. Merk dir die Nummer,');
    console.log('  die dir gefaellt - danach: node stimmen.js nimm <nummer>');
    console.log('');
    for (let i = 0; i < zuHoeren.length; i++) {
      const s = zuHoeren[i];
      // Die Sprache MIT vorlesen lassen: sonst sucht man sich eine
      // englische Stimme aus, weil sie schoen klingt - und wundert sich
      // hinterher ueber den Akzent.
      const marke = stimmen.istDeutsch(s) ? 'deutsch' : (s.sprache || 'Sprache unbekannt');
      process.stdout.write('  ' + String(i + 1).padStart(2) + ')  ' + s.name + '  [' + marke + '] ... ');
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

  // Welche Stimme ist gerade gemeint? Die genannte, sonst die
  // eingestellte, sonst die erste deutsche.
  const gemeint = () => waehle(liste, rest) ||
    (a && liste.find((x) => x.art === a.art && String(x.id) === String(a.id))) ||
    (deutsch[0] || liste[0]);

  // ---- Wie SCHNELL? ------------------------------------------------------
  // Getrennt von "wie sanft" - das sind zwei verschiedene Sachen. Eine
  // Stimme kann zuegig und trotzdem sanft sein; genau so redet jemand,
  // der weiss, was er sagen will.
  if (befehl === 'tempo') {
    const zahl = parseInt(rest, 10);
    if (isFinite(zahl) && zahl > 0) {
      const s = stimmen.stil(null, zahl);
      stimmen.setzeEnv('SPRACH_TEMPO', String(s.tempo));
      console.log('  Eingetragen: ' + s.tempo + ' Woerter pro Minute. Server neu starten.');
      return;
    }

    const s = gemeint();
    console.log('');
    console.log('  ' + s.name + ' - dreimal derselbe Satz, unterschiedlich schnell:');
    console.log('');
    for (const tempo of [170, 190, 215]) {
      console.log('  ' + tempo + ' Woerter pro Minute' + (tempo === stimmen.TEMPO_NORMAL ? '   <- Standard' : ''));
      try {
        const { ton, art } = await stimmen.probe(s, null, stimmen.stil(null, tempo));
        await spielAb(ton, endungFuer(art));
      } catch (e) {
        console.log('      geht nicht (' + e.message.slice(0, 60) + ')');
      }
    }
    console.log('');
    console.log('  Uebernehmen mit:  node stimmen.js tempo 215');
    console.log('');
    return;
  }

  // ---- Wie SANFT? --------------------------------------------------------
  // Gleiches Tempo, unterschiedlich gleichmaessig betont.
  if (befehl === 'sanft' || befehl === 'ruhe') {
    const s = gemeint();
    console.log('');
    console.log('  ' + s.name + ' - gleiches Tempo, unterschiedlich sanft:');
    console.log('');
    for (const name of Object.keys(stimmen.STILE)) {
      console.log('  ' + name);
      try {
        const { ton, art } = await stimmen.probe(s, null, stimmen.stil(name));
        await spielAb(ton, endungFuer(art));
      } catch (e) {
        console.log('      geht nicht (' + e.message.slice(0, 60) + ')');
      }
    }
    console.log('');
    if (s.art === 'mac') {
      console.log('  Hoerst du keinen Unterschied? Bei den Mac-Stimmen gibt es nur das');
      console.log('  Tempo - sanft einstellen geht erst mit ElevenLabs.');
      console.log('');
    }
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
    let s = waehle(liste, rest);

    // Eine Kennung von der ElevenLabs-Seite, die (noch) nicht im Konto
    // liegt: annehmen, aber vorher wirklich sprechen lassen. Klappt das,
    // ist sie brauchbar - klappt es nicht, wird nichts eingetragen.
    if (!s && istKennung(rest) && process.env.ELEVENLABS_API_KEY) {
      const versuch = { art: 'elevenlabs', id: rest.trim(), name: rest.trim(), sprache: '' };
      process.stdout.write('  Die Kennung kenne ich nicht aus deinem Konto - probiere sie aus ... ');
      try {
        const { ton, art } = await stimmen.probe(versuch, 'Moin Ibo, so klinge ich.');
        console.log('geht');
        await spielAb(ton, endungFuer(art));
        s = versuch;
      } catch (e) {
        console.log('geht nicht');
        console.log('  ' + e.message.slice(0, 140));
        console.log('  Hol sie dir erst ins Konto: Voice Library -> "Add to my voices".');
        process.exit(1);
      }
    }

    if (!s) { console.log('  Welche? node stimmen.js nimm 3   (oder: nimm Anna, oder die Voice ID)'); process.exit(1); }

    if (s.art === 'mac') stimmen.setzeEnv('SPRACH_STIMME', 'mac:' + s.id);
    else {
      stimmen.setzeEnv('SPRACH_VOICE_ID', s.id);
      stimmen.setzeEnv('SPRACH_STIMME', '');       // ElevenLabs hat Vorrang
    }

    console.log('');
    console.log('  Eingetragen: ' + s.name + ' (' + s.art + ')');

    // Eine englische oder franzoesische Stimme SPRICHT zwar deutsch -
    // aber mit Akzent. Das ist der haeufigste Griff daneben.
    if (!stimmen.istDeutsch(s)) {
      console.log('');
      console.log('  ACHTUNG: die ist nicht als deutsch gekennzeichnet' +
        (s.sprache ? ' (' + s.sprache + ')' : '') + '.');
      console.log('  Sie liest deutschen Text vor, aber mit Akzent.');
      console.log('  Deutsche findest du mit:  node stimmen.js hoeren');
    }
    console.log('  Server neu starten (Fenster zu, ./start.command), dann spricht er so.');
    console.log('');
    return;
  }

  console.log('  Kenne ich nicht. Moeglich: liste, hoeren, deutsch, jetzt, probe <n>, nimm <n>, tempo [zahl], sanft, stil <name>, browser');
  process.exit(1);
}

main().catch((e) => {
  console.error('  Ging nicht: ' + e.message);
  process.exit(1);
});
