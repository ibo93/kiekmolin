// The Chef – Sprachausgabe. Proxyt Text an ElevenLabs Text-to-Speech.
// Der ELEVENLABS_API_KEY bleibt serverseitig (Netlify-Env-Var).
//
// Erwartet POST mit JSON: { text: "...", voiceId?: "..." }
// Antwort: audio/mpeg (base64-kodiert), abspielbar im Frontend.

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Standard-Stimme: warme, natürliche Stimme (Antoni). Über ELEVENLABS_VOICE_ID
// oder das Feld voiceId im Request überschreibbar.
var DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || 'ErXwobaYiN019PkySvjV';
// multilingual_v2: höchste Qualität & natürlichste deutsche Stimme.
var MODEL_ID = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return {
      statusCode: 503,
      headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
      body: JSON.stringify({ error: 'ELEVENLABS_API_KEY nicht gesetzt' })
    };
  }

  var payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
      body: JSON.stringify({ error: 'Ungültiges JSON' })
    };
  }

  var text = (payload.text || '').toString().trim();
  if (!text) {
    return {
      statusCode: 400,
      headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
      body: JSON.stringify({ error: 'Feld "text" fehlt' })
    };
  }
  // ElevenLabs-Limit & Kostenschutz: Text deckeln.
  if (text.length > 800) text = text.slice(0, 800);

  var voiceId = (payload.voiceId || DEFAULT_VOICE).toString();
  var endpoint = 'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId);

  try {
    var res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true }
      })
    });

    if (!res.ok) {
      var errText = await res.text();
      console.error('ElevenLabs error:', res.status, errText);
      return {
        statusCode: res.status,
        headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
        body: JSON.stringify({ error: 'ElevenLabs-Anfrage fehlgeschlagen', detail: errText.slice(0, 300) })
      };
    }

    var audioBuffer = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: Object.assign({ 'Content-Type': 'audio/mpeg' }, CORS_HEADERS),
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('voice error:', msg);
    return {
      statusCode: 500,
      headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
      body: JSON.stringify({ error: 'Sprachausgabe fehlgeschlagen', detail: msg })
    };
  }
};
