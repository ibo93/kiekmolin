#!/usr/bin/env node
'use strict';

// KURANI · Schluessel-Einrichtung
// Fuehrt Schritt fuer Schritt durch das Eintragen des Anthropic-Schluessels:
//   node schluessel-einrichten.js
// Prueft den Schluessel LIVE bei Anthropic (Format, Gueltigkeit, Guthaben)
// und schreibt ihn in sichtbarkeit/.env UND telefon-retter/.env.
// Gebaut, damit niemand mit Texteditoren und sed kaempfen muss.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const frage = (text) => new Promise((r) => rl.question(text, (a) => r(a.trim())));

async function testeSchluessel(key) {
  try {
    const antwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
    });
    if (antwort.ok) return { ok: true };
    return { ok: false, status: antwort.status, text: (await antwort.text()).slice(0, 250) };
  } catch (e) {
    return { ok: false, status: 0, text: e.message };
  }
}

function schreibeEnv(ordner, key) {
  const beispiel = path.join(__dirname, ordner, '.env.example');
  const ziel = path.join(__dirname, ordner, '.env');
  if (!fs.existsSync(ziel) && fs.existsSync(beispiel)) fs.copyFileSync(beispiel, ziel);
  let inhalt = fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : '';
  if (/^ANTHROPIC_API_KEY=.*$/m.test(inhalt)) {
    inhalt = inhalt.replace(/^ANTHROPIC_API_KEY=.*$/m, 'ANTHROPIC_API_KEY=' + key);
  } else {
    inhalt += (inhalt.endsWith('\n') || !inhalt ? '' : '\n') + 'ANTHROPIC_API_KEY=' + key + '\n';
  }
  fs.writeFileSync(ziel, inhalt);
}

(async () => {
  console.log('');
  console.log('=== KURANI · Schluessel-Einrichtung ===');
  console.log('Neuen Schluessel erstellen: platform.claude.com -> API-Schluessel');
  console.log('-> "+ Schluessel erstellen" -> auf KOPIEREN klicken (beginnt mit sk-ant-api03-)');
  console.log('');

  for (let versuch = 1; versuch <= 5; versuch++) {
    const key = await frage('Schluessel jetzt einfuegen (Cmd+V) und Enter druecken: ');

    if (!key) {
      console.log('-> Da kam nichts an. Erst in der Console auf KOPIEREN klicken, dann hier Cmd+V.\n');
      continue;
    }
    if (!key.startsWith('sk-ant-api03-') || key.length < 40) {
      console.log('-> Das ist kein vollstaendiger Schluessel (muss mit sk-ant-api03- beginnen und lang sein).');
      console.log('   Bitte in der Console den KOPIEREN-Knopf nutzen, nicht von Hand markieren.\n');
      continue;
    }

    process.stdout.write('Pruefe Schluessel live bei Anthropic... ');
    const test = await testeSchluessel(key);

    if (test.ok) {
      console.log('GUELTIG ✓');
      schreibeEnv('sichtbarkeit', key);
      schreibeEnv('telefon-retter', key);
      console.log('');
      console.log('GESPEICHERT in sichtbarkeit/.env UND telefon-retter/.env  ✓');
      console.log('');
      console.log('Jetzt noch:');
      console.log('  1. Im Server-Terminal: ctrl+C druecken, dann:  node server.js');
      console.log('  2. Browser neu laden -> Kunde -> "Monats-Report erzeugen"');
      console.log('  -> Im Terminal laeuft dann "KI: gefunden / nicht-gefunden" durch. Fertig!');
      break;
    }

    if (test.status === 401) {
      console.log('UNGUELTIG (401)');
      console.log('-> Dieser Schluessel wird von Anthropic abgelehnt. Neuen erstellen und KOMPLETT kopieren.\n');
    } else if (test.status === 400 && /credit/i.test(test.text)) {
      console.log('KEIN GUTHABEN (400)');
      console.log('-> Schluessel ist ok, aber das Konto hat kein Guthaben: platform.claude.com -> Billing -> aufladen.');
      console.log('   (Der Schluessel wird trotzdem gespeichert - nach dem Aufladen einfach Report erzeugen.)');
      schreibeEnv('sichtbarkeit', key);
      schreibeEnv('telefon-retter', key);
      break;
    } else {
      console.log('FEHLER ' + test.status);
      console.log('-> Antwort: ' + test.text + '\n');
    }
  }

  rl.close();
})();
