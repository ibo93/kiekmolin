// The Chef – Foto-Caption. Schreibt einen Social-Media-Post auf Basis eines
// echten Gericht-Fotos (Claude Vision). Der ANTHROPIC_API_KEY bleibt serverseitig.
//
// Erwartet POST: { image, mediaType, dish, restaurant, type, platform }
// Antwort: { reply: "<fertiger Post>" }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function callClaude(body){
  const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{ 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01', 'content-type':'application/json' }, body:JSON.stringify(body) });
  if(!r.ok){ const t=await r.text(); const e=new Error(t.slice(0,300)); e.status=r.status; throw e; }
  return r.json();
}

const SYSTEM_PROMPT = `Du bist Social-Media-Texter für die Gastronomie.
Du bekommst ein Foto eines Gerichts und ein paar Eckdaten.
Schreibe einen fertigen, mitreißenden Post auf Deutsch, der konkret auf das
eingeht, was auf dem Foto zu sehen ist (Optik, Zutaten, Stimmung).

Antworte NUR mit dem fertigen Post: eine kurze, appetitliche Caption,
danach 6-8 passende Hashtags. Kein Vorwort, keine Erklärung, keine Code-Fences.`;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht gesetzt' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON' }) }; }

  const image = (payload.image || '').toString();
  if (!image) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Feld "image" fehlt' }) };
  const mediaType = (payload.mediaType || 'image/jpeg').toString();
  const dish = (payload.dish || '').toString().slice(0, 80);
  const restaurant = (payload.restaurant || '').toString().slice(0, 80);
  const type = (payload.type || '').toString().slice(0, 40);
  const platform = (payload.platform || 'Instagram').toString().slice(0, 30);

  const ctx = 'Plattform: ' + platform + '\nRestaurant: ' + (restaurant || 'unbekannt') + (type ? ' (' + type + ')' : '') + '\nGericht: ' + (dish || 'auf dem Foto') + '\nSchreib den Post zu diesem Foto.';

  try {
    const response = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      output_config: { effort: 'low' },
      system: [ { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } ],
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: ctx }
      ] }]
    });
    const reply = (response.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim();
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ reply: reply || '' }) };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('caption error:', status, msg);
    return { statusCode: status >= 400 && status < 600 ? status : 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Caption fehlgeschlagen', detail: msg }) };
  }
};
