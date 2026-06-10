// Coach-Stimme: wandelt kurze Texte per ElevenLabs in Sprache um.
// ELEVENLABS_API_KEY bleibt serverseitig; ohne Key antwortet die Function
// mit 503 und die App bleibt einfach stumm (Feature ist optional).

async function verifyUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Nur POST erlaubt' }) };
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Sprachausgabe nicht konfiguriert' }) };
  }
  const user = await verifyUser(event.headers.authorization);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Nicht eingeloggt' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ungültiger Request-Body' }) };
  }
  const text = (payload.text || '').trim();
  if (!text || text.length > 400) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Text fehlt oder ist zu lang (max. 400 Zeichen)' }) };
  }

  // Stimme: vom Client gewählt (nur saubere IDs zulassen), sonst Default
  const gewuenscht = payload.voice_id;
  const voiceId = (typeof gewuenscht === 'string' && /^[A-Za-z0-9]{16,32}$/.test(gewuenscht))
    ? gewuenscht
    : (process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM');

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2', // unterstützt Deutsch
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      console.error('ElevenLabs-Fehler:', res.status, await res.text());
      return { statusCode: 502, body: JSON.stringify({ error: 'Sprachausgabe fehlgeschlagen' }) };
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
      body: audio.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('TTS-Fehler:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Sprachausgabe fehlgeschlagen' }) };
  }
};
