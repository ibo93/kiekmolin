#!/usr/bin/env node
'use strict';

// KURANI · Einrichtungs-Helfer
//   node schluessel-einrichten.js
//
// Fragt ALLE Schluessel der Agentur nacheinander ab, prueft jeden LIVE beim
// jeweiligen Anbieter (nichts wird blind gespeichert) und schreibt ihn in die
// richtige .env-Datei. Enter ohne Eingabe = Schritt ueberspringen.
// Gebaut, damit niemand mit Texteditoren und sed kaempfen muss.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Eingabe ueber eine eigene Zeilen-Warteschlange: verliert keine Zeile,
// auch wenn Eingaben schneller kommen als Fragen (z.B. eingefuegter Block),
// und beendet sich sauber, wenn die Eingabe zu Ende ist.
const zeilenPuffer = [];
let zeilenWarter = null;
let eingabeZu = false;
rl.on('line', (z) => {
  if (zeilenWarter) { const w = zeilenWarter; zeilenWarter = null; w(z.trim()); }
  else zeilenPuffer.push(z.trim());
});
rl.on('close', () => {
  eingabeZu = true;
  if (zeilenWarter) { const w = zeilenWarter; zeilenWarter = null; w(''); }
});
function frage(text) {
  return new Promise((r) => {
    process.stdout.write(text);
    if (zeilenPuffer.length) r(zeilenPuffer.shift());
    else if (eingabeZu) r('');
    else zeilenWarter = r;
  });
}

// ---------------------------------------------------------------- .env ------
function envPfad(ordner) { return path.join(__dirname, ordner, '.env'); }

function stelleEnvSicher(ordner) {
  const ziel = envPfad(ordner);
  const beispiel = path.join(__dirname, ordner, '.env.example');
  if (!fs.existsSync(ziel) && fs.existsSync(beispiel)) fs.copyFileSync(beispiel, ziel);
}

function leseEnvWert(ordner, name) {
  const ziel = envPfad(ordner);
  if (!fs.existsSync(ziel)) return '';
  const m = fs.readFileSync(ziel, 'utf8').match(new RegExp('^' + name + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
}

function schreibeEnvWert(ordner, name, wert) {
  stelleEnvSicher(ordner);
  const ziel = envPfad(ordner);
  let inhalt = fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : '';
  if (new RegExp('^' + name + '=.*$', 'm').test(inhalt)) {
    inhalt = inhalt.replace(new RegExp('^' + name + '=.*$', 'm'), name + '=' + wert);
  } else {
    inhalt += (inhalt.endsWith('\n') || !inhalt ? '' : '\n') + name + '=' + wert + '\n';
  }
  fs.writeFileSync(ziel, inhalt);
}

function speichere(name, wert, ordnerListe) {
  for (const ordner of ordnerListe) schreibeEnvWert(ordner, name, wert);
  console.log('   GESPEICHERT (' + ordnerListe.map((o) => o + '/.env').join(' + ') + ')  ✓');
}

function maskiere(wert) {
  return wert.length > 14 ? wert.slice(0, 10) + '…' + wert.slice(-4) : wert;
}

// ------------------------------------------------------------- Pruefungen ---
async function pruefeAnthropic(key) {
  const antwort = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
  });
  if (antwort.ok) return { ok: true };
  const text = (await antwort.text()).slice(0, 200);
  if (antwort.status === 400 && /credit/i.test(text)) {
    return { ok: true, hinweis: 'Schluessel ok, aber kein Guthaben - platform.claude.com -> Billing aufladen.' };
  }
  return { ok: false, grund: 'Anthropic sagt ' + antwort.status + ' - Schluessel neu erstellen und KOMPLETT kopieren.' };
}

// Antwort-Text des Anbieters mit anzeigen - dann sieht man den ECHTEN Grund
// (z.B. "email not verified" oder fehlende Berechtigungen) statt nur "401".
async function fehlerText(antwort) {
  try { return ' | Antwort: ' + (await antwort.text()).slice(0, 220); } catch (_e) { return ''; }
}

async function pruefeDeepgram(key) {
  const antwort = await fetch('https://api.deepgram.com/v1/projects', {
    headers: { Authorization: 'Token ' + key }, signal: AbortSignal.timeout(15000)
  });
  return antwort.ok
    ? { ok: true }
    : { ok: false, grund: 'Deepgram sagt ' + antwort.status + await fehlerText(antwort) + '\n       -> Key unter console.deepgram.com -> API Keys neu erstellen.' };
}

async function pruefeElevenlabs(key) {
  const antwort = await fetch('https://api.elevenlabs.io/v1/user', {
    headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15000)
  });
  if (antwort.ok) return { ok: true };
  let text = '';
  try { text = await antwort.text(); } catch (_e) { /* egal */ }
  // Eingeschraenkter Key (missing_permissions): echt, aber beim Erstellen
  // wurden Rechte abgewaehlt. Reicht er fuer Stimmen+Sprechen, nehmen wir ihn.
  if (/missing_permissions|missing the permission/i.test(text)) {
    const stimmen = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15000)
    });
    if (stimmen.ok) {
      return { ok: true, hinweis: 'Key ist eingeschraenkt, reicht aber fuer die Stimmen. Falls das Sprechen spaeter fehlschlaegt: neuen Key OHNE Einschraenkungen erstellen.' };
    }
    return { ok: false, grund: 'Der Key wurde mit EINGESCHRAENKTEN Rechten erstellt (missing_permissions).\n       -> Neuen Key erstellen und dabei KEINE Berechtigungen abwaehlen (voller Zugriff).' };
  }
  return { ok: false, grund: 'ElevenLabs sagt ' + antwort.status + ' | Antwort: ' + text.slice(0, 220) + '\n       -> Haeufig: E-Mail-Bestaetigung fehlt, oder der Key wurde mit eingeschraenkten Rechten erstellt.' };
}

async function holeStimmen(key) {
  const antwort = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15000)
  });
  if (!antwort.ok) return [];
  const daten = await antwort.json();
  return (daten.voices || []).map((v) => ({
    id: v.voice_id, name: v.name,
    info: [v.labels && v.labels.gender, v.labels && v.labels.age, v.labels && v.labels.accent]
      .filter(Boolean).join(', ')
  }));
}

async function pruefeTwilio(sid, token) {
  const antwort = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '.json', {
    headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64') },
    signal: AbortSignal.timeout(15000)
  });
  return antwort.ok
    ? { ok: true }
    : { ok: false, grund: 'Twilio sagt ' + antwort.status + ' - SID (beginnt mit AC) und Auth Token aus der Console -> Account Info nutzen.' };
}

// Google-Platzierungen kommen ueber Serper.dev (echte Google-Ergebnisse).
// Googles eigene Custom-Search-API ist fuer Neukunden geschlossen (403).
async function pruefeSerper(key) {
  const antwort = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ q: 'restaurant test', gl: 'de', hl: 'de', num: 1 })
  });
  return antwort.ok
    ? { ok: true }
    : { ok: false, grund: 'Serper sagt ' + antwort.status + ' - Key im Dashboard auf serper.dev pruefen/neu kopieren.' };
}

async function pruefeResend(key) {
  const antwort = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(15000)
  });
  return antwort.ok
    ? { ok: true }
    : { ok: false, grund: 'Resend sagt ' + antwort.status + ' - Key unter resend.com -> API Keys pruefen.' };
}

// --------------------------------------------------------------- Ablauf -----
// Ein Schritt: zeigt Stand, fragt ab (Enter = ueberspringen), prueft live,
// speichert. Bis zu 3 Versuche bei Fehlern.
async function schluesselSchritt({ titel, wo, name, ordner, muster, pruefe }) {
  console.log('\n--- ' + titel + ' ---');
  console.log('    ' + wo);
  const vorhanden = leseEnvWert(ordner[0], name);
  if (vorhanden) console.log('    Aktuell gespeichert: ' + maskiere(vorhanden) + '  (Enter = so lassen)');
  else console.log('    Noch nicht eingerichtet.  (Enter = ueberspringen)');

  for (let versuch = 1; versuch <= 3; versuch++) {
    const wert = await frage('    Einfuegen (Cmd+V) und Enter: ');
    if (!wert) { console.log('    -> uebersprungen.'); return vorhanden || null; }
    if (muster && !muster.test(wert)) {
      console.log('    -> Das sieht nicht richtig aus (' + muster.hinweis + '). In der Console den KOPIEREN-Knopf nutzen.');
      continue;
    }
    process.stdout.write('    Pruefe live... ');
    let ergebnis;
    try { ergebnis = await pruefe(wert); } catch (e) { ergebnis = { ok: false, grund: 'Netzwerk: ' + e.message }; }
    if (ergebnis.ok) {
      console.log('GUELTIG ✓' + (ergebnis.hinweis ? '\n    Hinweis: ' + ergebnis.hinweis : ''));
      speichere(name, wert, ordner);
      return wert;
    }
    console.log('FEHLER');
    console.log('    -> ' + ergebnis.grund);
  }
  console.log('    -> 3 Versuche - dieser Schritt wird uebersprungen, spaeter einfach nochmal starten.');
  return vorhanden || null;
}

(async () => {
  console.log('');
  console.log('=== KURANI · Einrichtungs-Helfer ===');
  console.log('Traegt alle Schluessel der Agentur ein und prueft jeden LIVE.');
  console.log('Enter ohne Eingabe = Schritt ueberspringen. Nichts wird blind gespeichert.');

  // 1. Anthropic (Denken) - Pflicht fuer Reports UND Telefon
  const anthropic = await schluesselSchritt({
    titel: '1/6 · Anthropic (das Denken - Reports + Telefon)',
    wo: 'platform.claude.com -> API-Schluessel -> "+ Schluessel erstellen" -> KOPIEREN',
    name: 'ANTHROPIC_API_KEY', ordner: ['sichtbarkeit', 'telefon-retter'],
    muster: Object.assign(/^sk-ant-api\d\d-/, { hinweis: 'beginnt mit sk-ant-api03-' }),
    pruefe: pruefeAnthropic
  });

  // 2. Deepgram (Zuhoeren)
  await schluesselSchritt({
    titel: '2/6 · Deepgram (das Zuhoeren am Telefon)',
    wo: 'console.deepgram.com -> API Keys -> Create Key -> kopieren',
    name: 'DEEPGRAM_API_KEY', ordner: ['telefon-retter'],
    pruefe: pruefeDeepgram
  });

  // 3. ElevenLabs (Sprechen) - Key + Stimme aussuchen
  const elevenKey = await schluesselSchritt({
    titel: '3/6 · ElevenLabs (die Stimme am Telefon)',
    wo: 'elevenlabs.io -> Profilbild unten links -> API Keys -> Create -> kopieren',
    name: 'ELEVENLABS_API_KEY', ordner: ['telefon-retter'],
    pruefe: pruefeElevenlabs
  });
  if (elevenKey) {
    const aktuelleStimme = leseEnvWert('telefon-retter', 'ELEVENLABS_VOICE_ID');
    console.log('\n--- 3b · Stimme aussuchen ---');
    if (aktuelleStimme) console.log('    Aktuell gespeichert: ' + aktuelleStimme + '  (Enter = so lassen)');
    let stimmen = [];
    try { stimmen = await holeStimmen(elevenKey); } catch (_e) { /* dann eben per ID */ }
    if (stimmen.length) {
      console.log('    Deine verfuegbaren Stimmen:');
      stimmen.slice(0, 12).forEach((v, i) => console.log('      ' + (i + 1) + '. ' + v.name + (v.info ? '  (' + v.info + ')' : '')));
      console.log('    Tipp: mehr deutsche Stimmen unter elevenlabs.io/voice-library ("Add to my voices").');
      const wahl = await frage('    Nummer waehlen ODER Voice-ID einfuegen (Enter = ueberspringen): ');
      if (wahl) {
        const index = parseInt(wahl, 10);
        const stimme = /^\d+$/.test(wahl) && index >= 1 && index <= stimmen.length ? stimmen[index - 1] : null;
        // Nur echte Auswahlen speichern: eine Nummer aus der Liste oder eine
        // Voice-ID (ein Wort, keine Leerzeichen). Versehentlich eingefuegte
        // Befehle o.ae. werden abgelehnt statt gespeichert.
        if (!stimme && !/^[A-Za-z0-9_-]{10,48}$/.test(wahl)) {
          console.log('    -> Das war keine Nummer aus der Liste (1-' + Math.min(stimmen.length, 12) + ') und keine Voice-ID.');
          console.log('       Stimme bleibt unveraendert - Helfer einfach nochmal starten.');
        } else {
          speichere('ELEVENLABS_VOICE_ID', stimme ? stimme.id : wahl, ['telefon-retter']);
          if (stimme) console.log('    Stimme "' + stimme.name + '" eingestellt.');
        }
      } else { console.log('    -> uebersprungen.'); }
    }
  }

  // 4. Twilio (Telefonnummer) - SID + Auth Token gehoeren zusammen
  console.log('\n--- 4/6 · Twilio (die Telefonnummer) ---');
  console.log('    console.twilio.com -> Startseite -> "Account Info": Account SID + Auth Token');
  const twilioSidAlt = leseEnvWert('telefon-retter', 'TWILIO_ACCOUNT_SID');
  if (twilioSidAlt) console.log('    Aktuell gespeichert: ' + maskiere(twilioSidAlt) + '  (Enter = so lassen)');
  else console.log('    Noch nicht eingerichtet.  (Enter = ueberspringen)');
  const sid = await frage('    Account SID (beginnt mit AC) einfuegen: ');
  if (sid) {
    if (!/^AC[0-9a-f]{16,}/i.test(sid)) {
      console.log('    -> Eine SID beginnt mit AC - Schritt uebersprungen, spaeter nochmal.');
    } else {
      const token = await frage('    Auth Token einfuegen: ');
      if (token) {
        process.stdout.write('    Pruefe live... ');
        let e;
        try { e = await pruefeTwilio(sid, token); } catch (fehler) { e = { ok: false, grund: 'Netzwerk: ' + fehler.message }; }
        if (e.ok) {
          console.log('GUELTIG ✓');
          speichere('TWILIO_ACCOUNT_SID', sid, ['telefon-retter']);
          speichere('TWILIO_AUTH_TOKEN', token, ['telefon-retter']);
        } else { console.log('FEHLER\n    -> ' + e.grund); }
      }
    }
  } else { console.log('    -> uebersprungen.'); }

  // 5. Google-Platzierungen ueber Serper.dev (Google-Spalte + Wettbewerbs-Radar)
  await schluesselSchritt({
    titel: '5/6 · Google-Platzierungen via Serper (Google-Spalte + Wettbewerbs-Radar)',
    wo: 'serper.dev -> Sign up (kostenlos, 2500 Suchen frei) -> Dashboard -> API Key kopieren',
    name: 'SERPER_API_KEY', ordner: ['sichtbarkeit'],
    pruefe: pruefeSerper
  });

  // 6. Resend (Reports automatisch per E-Mail)
  const resend = await schluesselSchritt({
    titel: '6/6 · Resend (Reports automatisch per E-Mail)',
    wo: 'resend.com -> API Keys -> Create API Key -> kopieren',
    name: 'RESEND_API_KEY', ordner: ['sichtbarkeit'],
    muster: Object.assign(/^re_/, { hinweis: 'beginnt mit re_' }),
    pruefe: pruefeResend
  });
  if (resend) {
    const von = await frage('    Absender-Adresse (EMAIL_FROM, z.B. reports@deine-domain.de, Enter = ueberspringen): ');
    if (von && von.includes('@')) speichere('EMAIL_FROM', von, ['sichtbarkeit']);
    const anDich = await frage('    Deine Agentur-Adresse fuer den Wochen-Digest (AGENTUR_EMAIL, Enter = ueberspringen): ');
    if (anDich && anDich.includes('@')) speichere('AGENTUR_EMAIL', anDich, ['sichtbarkeit']);
  }

  // ------------------------------------------------------------- Bilanz ----
  console.log('\n=== STAND ===');
  const status = (ordner, name) => (leseEnvWert(ordner, name) ? 'ok ✓' : 'fehlt');
  console.log('  Denken (Anthropic):      ' + status('sichtbarkeit', 'ANTHROPIC_API_KEY'));
  console.log('  Zuhoeren (Deepgram):     ' + status('telefon-retter', 'DEEPGRAM_API_KEY'));
  console.log('  Stimme (ElevenLabs):     ' + status('telefon-retter', 'ELEVENLABS_API_KEY') +
    ' / Stimme: ' + status('telefon-retter', 'ELEVENLABS_VOICE_ID'));
  console.log('  Telefon (Twilio):        ' + status('telefon-retter', 'TWILIO_AUTH_TOKEN'));
  console.log('  Google-Spalte (Serper):  ' + (leseEnvWert('sichtbarkeit', 'SERPER_API_KEY') || leseEnvWert('sichtbarkeit', 'GOOGLE_API_KEY') ? 'ok ✓' : 'fehlt'));
  console.log('  E-Mail-Versand (Resend): ' + status('sichtbarkeit', 'RESEND_API_KEY'));
  console.log('\nJetzt noch: Server neu starten (ctrl+C, dann node server.js) - fertig.');
  console.log('Telefon-Probelauf ohne Nummer:  cd telefon-retter && node simulator.js --demo');
  if (anthropic) console.log('Sobald Twilio-Nummer + BASE_URL stehen: telefon-retter/README.md -> "Echte Telefonnummer".');

  rl.close();
})();
