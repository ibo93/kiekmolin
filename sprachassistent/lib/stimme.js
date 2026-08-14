'use strict';

// Die Stimme: Text -> MP3 fuer den Browser (ElevenLabs).
//
// Unterschied zum Telefon-Retter: dort wird ulaw_8000 fuer die Telefon-
// leitung bestellt, hier mp3 in guter Qualitaet fuer die Lautsprecher.
// Der Schluessel ist derselbe (telefon-retter/.env wird mitgelesen).
//
// Ohne ELEVENLABS_API_KEY spricht der Browser selbst (eingebaute Stimme) -
// kostet nichts und funktioniert offline.

async function spreche(text, optionen) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = (optionen && optionen.stimme) || process.env.SPRACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt - der Browser spricht dann selbst');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID fehlt (Stimme auf elevenlabs.io aussuchen)');

  const modell = process.env.ELEVENLABS_MODELL || 'eleven_flash_v2_5';
  const sprachHinweis = /flash|turbo/.test(modell) ? { language_code: 'de' } : {};

  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(20000),
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
  return Buffer.from(await antwort.arrayBuffer());
}

module.exports = { spreche };
