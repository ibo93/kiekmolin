'use strict';

// Sprechen: ElevenLabs Text-to-Speech.
// Wir bestellen das Audio direkt als ulaw_8000 - das Format, das Twilio
// auf der Telefonleitung erwartet. Keine Umwandlung noetig.

async function spreche(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt in .env');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID fehlt in .env (Voice unter elevenlabs.io/voice-library aussuchen)');

  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=ulaw_8000',
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: text,
        model_id: process.env.ELEVENLABS_MODELL || 'eleven_flash_v2_5', // schnell + Deutsch
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    }
  );
  if (!antwort.ok) throw new Error('ElevenLabs ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
  return Buffer.from(await antwort.arrayBuffer());
}

module.exports = { spreche };
