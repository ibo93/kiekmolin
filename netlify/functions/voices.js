// The Chef – Stimmen-Liste. Holt alle verfügbaren Stimmen aus dem
// ElevenLabs-Konto, damit der Wirt in den Einstellungen eine auswählen kann.
// Der ELEVENLABS_API_KEY bleibt serverseitig (Netlify-Env-Var).
//
// Erwartet GET. Antwort: { voices: [{ id, name, category }] }

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ELEVENLABS_API_KEY nicht gesetzt' }) };
  }

  try {
    var res = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Accept': 'application/json' }
    });
    if (!res.ok) {
      var errText = await res.text();
      console.error('ElevenLabs voices error:', res.status, errText);
      return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Stimmen konnten nicht geladen werden' }) };
    }
    var data = await res.json();
    var voices = Array.isArray(data.voices) ? data.voices.map(function (v) {
      return {
        id: String(v.voice_id || ''),
        name: String(v.name || 'Stimme').slice(0, 60),
        category: String(v.category || 'premade')
      };
    }).filter(function (v) { return v.id; }) : [];
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ voices: voices }) };
  } catch (err) {
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('voices error:', msg);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Stimmen-Abruf fehlgeschlagen', detail: msg }) };
  }
};
