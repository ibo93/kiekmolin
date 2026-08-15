#!/usr/bin/env node
'use strict';

// SCHLUESSEL EINTRAGEN — aber nur, wenn er wirklich funktioniert.
//
//   node schluessel.js            zeigt, welche da sind und ob sie gehen
//   node schluessel.js deepgram   einen eintragen (fragt danach)
//   node schluessel.js elevenlabs
//   node schluessel.js anthropic
//
// Warum ein eigenes Werkzeug: einen Schluessel in eine Datei zu schreiben
// ist leicht - aber wenn er falsch ist, merkt man das erst Stunden
// spaeter an einer Fehlermeldung, die nach etwas ganz anderem aussieht
// ("Zuhoeren gestoert: 401"). Und hat man ihn per Zwischenablage
// eingefuegt, steht am Ende womoeglich ein Dateipfad drin statt eines
// Schluessels.
//
// Deshalb hier: erst FRAGEN, dann PRUEFEN, und nur bei gruenem Licht
// eintragen. Ein kaputter Schluessel kommt gar nicht erst in die Datei.
//
// Der Schluessel wird beim Tippen nicht angezeigt und nie ausgegeben -
// weder in der Konsole noch im Protokoll.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ladeEnv } = require('./lib/env');
const stimmen = require('./lib/stimmen');

ladeEnv();

const ENV = path.join(__dirname, '.env');

// Je Dienst: wie heisst der Schluessel, wo prueft man ihn, und was tut er?
const DIENSTE = {
  deepgram: {
    name: 'Deepgram',
    schluessel: 'DEEPGRAM_API_KEY',
    wofuer: 'Zuhoeren (versteht deutlich besser als der Browser)',
    holen: 'deepgram.com -> Settings -> API Keys -> Create a New API Key (Rolle: Member)',
    pruefe: async (k) => {
      const a = await fetch('https://api.deepgram.com/v1/projects', {
        headers: { Authorization: 'Token ' + k }, signal: AbortSignal.timeout(15000)
      });
      return a.status;
    }
  },
  elevenlabs: {
    name: 'ElevenLabs',
    schluessel: 'ELEVENLABS_API_KEY',
    wofuer: 'die gute Stimme',
    holen: 'elevenlabs.io -> Profil -> API Keys',
    pruefe: async (k) => {
      const a = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': k }, signal: AbortSignal.timeout(15000)
      });
      return a.status;
    }
  },
  anthropic: {
    name: 'Anthropic',
    schluessel: 'ANTHROPIC_API_KEY',
    wofuer: 'sofort antworten statt vier Sekunden warten',
    holen: 'console.anthropic.com -> API Keys',
    pruefe: async (k) => {
      const a = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(20000)
      });
      return a.status;
    }
  }
};

// Was der Rueckgabe-Code bedeutet - in Worten, nicht als Nummer.
function urteil(code) {
  if (code >= 200 && code < 300) return { gut: true, text: 'funktioniert' };
  if (code === 401) return { gut: false, text: 'wird abgelehnt (401) - falsch, abgelaufen oder geloescht' };
  if (code === 403) return { gut: false, text: 'gesperrt (403) - Konto oder Rechte pruefen' };
  if (code === 402) return { gut: false, text: 'Guthaben aufgebraucht (402)' };
  if (code === 429) return { gut: true, text: 'gueltig, aber gerade am Limit (429)' };
  return { gut: false, text: 'Antwort ' + code };
}

// Ohne Echo einlesen: beim Einfuegen soll nichts auf dem Bildschirm
// stehenbleiben, was hinterher in einem Screenshot landet.
function fragLeise(frage) {
  return new Promise((fertig) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const ausgabe = rl.output;
    let still = false;
    ausgabe.write(frage);
    // Alles, was nach der Frage getippt wird, nicht anzeigen.
    const alt = ausgabe.write.bind(ausgabe);
    ausgabe.write = (t) => { if (!still) alt(t); return true; };
    still = true;
    rl.question('', (antwort) => {
      still = false;
      ausgabe.write = alt;
      ausgabe.write('\n');
      rl.close();
      fertig(String(antwort || '').trim());
    });
  });
}

function schonDa(name) {
  const wert = process.env[name];
  return wert ? wert.trim() : '';
}

async function zeigen() {
  console.log('');
  console.log('  SCHLUESSEL');
  console.log('  ------------------------------------------------------------');
  for (const [kennung, d] of Object.entries(DIENSTE)) {
    const wert = schonDa(d.schluessel);
    if (!wert) {
      console.log('  --  ' + d.name.padEnd(12) + 'fehlt        ' + d.wofuer);
      console.log('      eintragen mit:  node schluessel.js ' + kennung);
      continue;
    }
    process.stdout.write('  ..  ' + d.name.padEnd(12) + 'pruefe ... ');
    let code;
    try { code = await d.pruefe(wert); } catch (e) { code = 0; }
    const u = code ? urteil(code) : { gut: false, text: 'nicht erreichbar (kein Netz?)' };
    console.log('\r  ' + (u.gut ? 'ok' : '!!') + '  ' + d.name.padEnd(12) + u.text.padEnd(52) + (u.gut ? '' : ''));
    if (!u.gut) console.log('      neuen holen: ' + d.holen + '\n      dann:  node schluessel.js ' + kennung);
  }
  console.log('  ------------------------------------------------------------');
  console.log('');
}

// Eine Zeile in der .env ersetzen oder anhaengen. Alles andere bleibt
// unangetastet - da stehen die anderen Schluessel drin.
function eintragen(name, wert) {
  stimmen.setzeEnv(name, wert, ENV);
}

async function setzen(kennung) {
  const d = DIENSTE[kennung];
  console.log('');
  console.log('  ' + d.name + ' - ' + d.wofuer);
  console.log('  Holen: ' + d.holen);
  console.log('');

  const k = await fragLeise('  Schluessel einfuegen (Cmd+V) und Enter: ');
  if (!k) { console.log('  Nichts eingegeben - abgebrochen.\n'); process.exit(1); }

  // Der haeufigste Unfall: die Zwischenablage enthielt etwas anderes.
  if (/\s/.test(k) || k.length < 20) {
    console.log('');
    console.log('  Das sieht nicht nach einem Schluessel aus (' + k.length + ' Zeichen' +
      (/\s/.test(k) ? ', mit Leerzeichen' : '') + ').');
    console.log('  Nicht eingetragen. Nochmal kopieren und neu versuchen.');
    console.log('');
    process.exit(1);
  }

  process.stdout.write('  Pruefe bei ' + d.name + ' ... ');
  let code;
  try { code = await d.pruefe(k); } catch (e) { code = 0; }
  const u = code ? urteil(code) : { gut: false, text: 'nicht erreichbar (kein Netz?)' };
  console.log(u.text);

  if (!u.gut) {
    console.log('');
    console.log('  NICHT eingetragen - ein kaputter Schluessel macht nur Aerger.');
    console.log('  Neuen holen: ' + d.holen);
    console.log('');
    process.exit(1);
  }

  eintragen(d.schluessel, k);
  console.log('');
  console.log('  Eingetragen und geprueft. Jetzt neu starten:');
  console.log('    lsof -ti:3400 | xargs kill -9 2>/dev/null; node server.js');
  console.log('');
}

const wunsch = (process.argv[2] || '').toLowerCase();

if (!wunsch) zeigen().catch((e) => { console.error('  Ging nicht: ' + e.message); process.exit(1); });
else if (DIENSTE[wunsch]) setzen(wunsch).catch((e) => { console.error('  Ging nicht: ' + e.message); process.exit(1); });
else {
  console.log('  Welchen? ' + Object.keys(DIENSTE).join(', '));
  process.exit(1);
}
