'use strict';

// Sprechen: ElevenLabs Text-to-Speech.
// Wir bestellen das Audio direkt als ulaw_8000 - das Format, das Twilio
// auf der Telefonleitung erwartet. Keine Umwandlung noetig.

async function spreche(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt in .env');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID fehlt in .env (Voice unter elevenlabs.io/voice-library aussuchen)');

  const modell = process.env.ELEVENLABS_MODELL || 'eleven_flash_v2_5'; // schnell + Deutsch
  // flash/turbo koennen die Sprache fest vorgegeben bekommen - verhindert,
  // dass einzelne Woerter englisch ausgesprochen werden.
  const sprachHinweis = /flash|turbo/.test(modell) ? { language_code: 'de' } : {};

  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=ulaw_8000',
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
const audioCache = new Map(); // voiceId|text -> Buffer
async function sprecheGecached(text) {
  const schluessel = (process.env.ELEVENLABS_VOICE_ID || '') + '|' + text;
  if (audioCache.has(schluessel)) return audioCache.get(schluessel);
  const audio = await spreche(text);
  if (audioCache.size >= 100) audioCache.clear(); // Notbremse, kein Speicherleck
  audioCache.set(schluessel, audio);
  return audio;
}

module.exports = { spreche, sprecheGecached, inSaetze };
