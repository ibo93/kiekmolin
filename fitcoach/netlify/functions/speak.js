// Coach-Stimme: wandelt kurze Texte per ElevenLabs in Sprache um.
// ELEVENLABS_API_KEY bleibt serverseitig; ohne Key antwortet die Function
// mit 503 und die App bleibt einfach stumm (Feature ist optional).

// Einfacher App-Schlüssel statt Login: Der Client schickt x-app-key,
// das muss zur Netlify-Variable APP_KEY passen.
function autorisiert(event) {
  const key = event.headers['x-app-key'];
  return Boolean(key && process.env.APP_KEY && key === process.env.APP_KEY);
}

// Beide Schreibweisen akzeptieren – robust gegen Tippfehler beim Eintragen
const TTS_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABELS_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-key',
};

exports.handler = async (event) => {
  // Preflight (kommt z. B. von der Standalone-Testdatei)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { headers: CORS, statusCode: 405, body: JSON.stringify({ error: 'Nur POST erlaubt' }) };
  }
  if (!TTS_KEY) {
    return { headers: CORS, statusCode: 503, body: JSON.stringify({ error: 'Sprachausgabe nicht konfiguriert' }) };
  }
  if (!autorisiert(event)) {
    return { headers: CORS, statusCode: 401, body: JSON.stringify({ error: 'App-Schlüssel fehlt oder falsch' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { headers: CORS, statusCode: 400, body: JSON.stringify({ error: 'Ungültiger Request-Body' }) };
  }
  const text = (payload.text || '').trim();
  if (!text || text.length > 400) {
    return { headers: CORS, statusCode: 400, body: JSON.stringify({ error: 'Text fehlt oder ist zu lang (max. 400 Zeichen)' }) };
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
        'xi-api-key': TTS_KEY,
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
      return { headers: CORS, statusCode: 502, body: JSON.stringify({ error: 'Sprachausgabe fehlgeschlagen' }) };
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
      body: audio.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('TTS-Fehler:', err);
    return { headers: CORS, statusCode: 502, body: JSON.stringify({ error: 'Sprachausgabe fehlgeschlagen' }) };
  }
};
