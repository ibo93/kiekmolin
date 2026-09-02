'use strict';

// Sprechen: ElevenLabs Text-to-Speech.
// Wir bestellen das Audio direkt als ulaw_8000 - das Format, das Twilio
// auf der Telefonleitung erwartet. Keine Umwandlung noetig.

// optionen.stimme: eigene Voice-ID fuer DIESEN Anruf. So bekommt jeder
// Gastronom seine eigene Stimme (Zuordnung in nummern.json) - ohne
// Angabe gilt die Standard-Stimme aus der .env.
async function spreche(text, optionen) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = (optionen && optionen.stimme) || process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt in .env');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID fehlt in .env (Voice unter elevenlabs.io/voice-library aussuchen)');

  const modell = process.env.ELEVENLABS_MODELL || 'eleven_flash_v2_5'; // schnell + Deutsch
  // flash/turbo koennen die Sprache fest vorgegeben bekommen - verhindert,
  // dass einzelne Woerter englisch ausgesprochen werden.
  const sprachHinweis = /flash|turbo/.test(modell) ? { language_code: 'de' } : {};

  // Am Telefon braucht Twilio ulaw_8000. Ein Browser kann das NICHT abspielen -
  // fuer die Hoerprobe im CRM muss deshalb MP3 kommen, sonst klickt man ins
  // Leere und hoert nichts, ohne dass irgendwo ein Fehler auftaucht.
  const format = (optionen && optionen.format) === 'mp3' ? 'mp3_44100_128' : 'ulaw_8000';

  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=' + format,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify(Object.assign({
        text: text,
        model_id: modell,
        // Etwas niedrigere Stabilitaet = lebendigere, menschlichere Betonung.
        // Ueber .env feinjustierbar: 0 = sehr lebendig, 1 = sehr gleichmaessig.
        voice_settings: {
          stability: parseFloat(process.env.ELEVENLABS_STABILITAET || '0.42'),
          similarity_boost: 0.8
        }
      }, sprachHinweis))
    }
  );
  if (!antwort.ok) throw new Error('ElevenLabs ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
  return Buffer.from(await antwort.arrayBuffer());
}

// --- Sprechen, waehrend noch gesprochen wird ---------------------------------

// Gemessen am 02.09.2026: Auf die fertige Audiodatei zu warten kostet rund
// 480 ms, der erste Ton aus dem Stream kommt nach 167 ms. Das ist ein Drittel
// der Wartezeit - und am Telefon ist genau diese erste Pause das, was ein
// Gespraech kuenstlich wirken laesst.
//
// Gestreamt wird nur der ERSTE Satz. Die uebrigen entstehen ohnehin parallel
// und sind laengst fertig, wenn der erste zu Ende gesprochen ist; sie noch
// stueckweise nachzuziehen braechte nichts und macht den Abbruch bei
// Barge-in unnoetig kompliziert.
async function spricheStroemend(text, optionen, aufStueck) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = (optionen && optionen.stimme) || process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt in .env');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID fehlt in .env');

  const modell = process.env.ELEVENLABS_MODELL || 'eleven_flash_v2_5';
  const sprachHinweis = /flash|turbo/.test(modell) ? { language_code: 'de' } : {};
  const format = (optionen && optionen.format) === 'mp3' ? 'mp3_44100_128' : 'ulaw_8000';

  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId)
      + '/stream?output_format=' + format,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify(Object.assign({
        text: text,
        model_id: modell,
        voice_settings: {
          stability: parseFloat(process.env.ELEVENLABS_STABILITAET || '0.42'),
          similarity_boost: 0.8
        }
      }, sprachHinweis))
    }
  );
  if (!antwort.ok) {
    throw new Error('ElevenLabs ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
  }

  const leser = antwort.body.getReader();
  let rest = Buffer.alloc(0);

  /* Zwei Stueckgroessen, und das ist der ganze Trick: Wartet man auch beim
     ERSTEN Paket auf volle 4000 Bytes (0,5 s Audio), ist der Vorsprung des
     Stroemens wieder verspielt - gemessen 418 ms statt 369 ms, also nichts
     gewonnen. Das erste Paket geht deshalb schon nach 800 Bytes raus (0,1 s
     Audio); ab dann sind groessere Pakete sparsamer, weil jede WebSocket-
     Nachricht Aufwand kostet. Der Gast hoert die Stimme, waehrend der Rest
     noch entsteht. */
  const ERSTES = 800;
  const WEITERE = 4000;
  let schwelle = ERSTES;

  while (true) {
    const { done, value } = await leser.read();
    if (done) break;
    rest = Buffer.concat([rest, Buffer.from(value)]);
    while (rest.length >= schwelle) {
      const STUECK = schwelle;
      schwelle = WEITERE;
      /* Gibt der Aufrufer false zurueck, ist der Gast dazwischengegangen -
         dann sofort aufhoeren und die Verbindung schliessen, statt den Rest
         noch herunterzuladen. */
      if (aufStueck(rest.subarray(0, STUECK)) === false) {
        try { await leser.cancel(); } catch (_e) { /* schon zu */ }
        return false;
      }
      rest = rest.subarray(STUECK);
    }
  }
  if (rest.length && aufStueck(rest) === false) return false;
  return true;
}

// --- Fluessig wie ein Live-Gespraech -----------------------------------------

// Saetze einzeln erzeugen: der erste Satz geht schon auf die Leitung,
// waehrend der Rest noch bei ElevenLabs entsteht. Zu kurze Schnipsel
// (Abkuerzungen wie "z.B.", einzelne Zahlen) kleben am Vorgaenger.
function inSaetze(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const teile = (t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [t]).map((s) => s.trim()).filter(Boolean);
  const saetze = [];
  for (const teil of teile) {
    if (saetze.length && (teil.length < 12 || /^\d/.test(teil))) saetze[saetze.length - 1] += ' ' + teil;
    else saetze.push(teil);
  }
  return saetze;
}

// Audio-Cache fuer Standardsaetze (Begruessung, Denk-Fueller): die kommen in
// jedem Anruf gleich - einmal erzeugen, danach liegt das Audio sofort bereit.
// Der Schluessel enthaelt die Stimme - sonst bekaeme Kunde B die
// zwischengespeicherte Begruessung von Kunde A zu hoeren.
const audioCache = new Map(); // voiceId|text -> Buffer
async function sprecheGecached(text, optionen) {
  const stimme = (optionen && optionen.stimme) || process.env.ELEVENLABS_VOICE_ID || '';
  const schluessel = stimme + '|' + text;
  if (audioCache.has(schluessel)) return audioCache.get(schluessel);
  const audio = await spreche(text, optionen);
  if (audioCache.size >= 100) audioCache.clear(); // Notbremse, kein Speicherleck
  audioCache.set(schluessel, audio);
  return audio;
}

module.exports = { spreche, spricheStroemend, sprecheGecached, inSaetze };
