#!/usr/bin/env node
'use strict';

// KURANI · Stimmen-Test
//   cd telefon-retter && node stimmen-test.js
// Laesst die eingestellte ElevenLabs-Stimme einen Begruessungssatz sprechen
// und spielt ihn direkt ab (Mac: afplay). So hoert man die Stimme des
// Telefon-Retters, ohne dass schon eine Telefonnummer eingerichtet ist.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { ladeEnv } = require('./lib/env');

ladeEnv();

const TEXT = process.argv.slice(2).join(' ') ||
  'Moin, hier ist der digitale KI-Assistent der Greetsieler Boerse. ' +
  'Das Team ist gerade nicht am Apparat, aber ich kann gerne fuer Sie reservieren. ' +
  'Fuer wie viele Personen darf es denn sein?';

(async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  const stimme = process.env.ELEVENLABS_VOICE_ID;
  if (!key) { console.log('ELEVENLABS_API_KEY fehlt - bitte "node ../schluessel-einrichten.js" ausfuehren.'); process.exit(1); }
  if (!stimme) { console.log('ELEVENLABS_VOICE_ID fehlt - bitte "node ../schluessel-einrichten.js" ausfuehren (Schritt 3b: Stimme aussuchen).'); process.exit(1); }

  process.stdout.write('Erzeuge Sprache (' + TEXT.length + ' Zeichen)... ');
  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(stimme) + '?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        text: TEXT,
        // Fuer die Vorfuehrung das beste Klang-Modell (multilingual_v2);
        // am Telefon laeuft das schnelle flash-Modell (Latenz zaehlt dort).
        model_id: process.env.ELEVENLABS_MODELL || 'eleven_multilingual_v2',
        voice_settings: {
          stability: parseFloat(process.env.ELEVENLABS_STABILITAET || '0.42'),
          similarity_boost: 0.8
        }
      })
    }
  );
  if (!antwort.ok) {
    console.log('FEHLER ' + antwort.status + ': ' + (await antwort.text()).slice(0, 250));
    console.log('-> Haeufigste Ursache: Key ohne Sprech-Berechtigung. Neuen Key OHNE Einschraenkungen erstellen.');
    process.exit(1);
  }
  const datei = path.join(__dirname, 'stimme-test.mp3');
  fs.writeFileSync(datei, Buffer.from(await antwort.arrayBuffer()));
  console.log('fertig ✓');
  console.log('Gespeichert: ' + datei);

  // Auf dem Mac direkt abspielen; sonst den Pfad nennen.
  execFile('afplay', [datei], (fehler) => {
    if (fehler) console.log('Zum Anhoeren die Datei doppelklicken: ' + datei);
    else console.log('So klingt dein Telefon-Retter! Andere Stimme? -> node ../schluessel-einrichten.js (Schritt 3b).');
  });
})().catch((e) => { console.log('FEHLER: ' + e.message); process.exit(1); });
