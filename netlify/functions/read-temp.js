// The Chef – HACCP Temperatur-Leser. Liest die angezeigte Temperatur von einem
// Foto eines Thermometers/Displays. Der ANTHROPIC_API_KEY bleibt serverseitig.
//
// Erwartet POST mit JSON: { image: "<base64>", mediaType: "image/jpeg" }
// Antwort: { value: "<zahl als string, z.B. 4.2 oder -18>" }

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

const SYSTEM_PROMPT = `Du liest Temperaturwerte von Fotos ab (Kühlthermometer, Display, Messgerät).
Gib AUSSCHLIESSLICH gültiges JSON in genau dieser Form zurück:
{ "value": "4.2" }
Regeln:
- value: die abgelesene Temperatur als Zahl-String, Punkt als Dezimaltrennzeichen, Minus für Minusgrade (z.B. "-18.4").
- Ohne Einheit, ohne "°C".
- Wenn keine Zahl klar erkennbar ist: { "value": "" }.
- Kein Text vor oder nach dem JSON. Keine Code-Fences.`;

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

  try {
    const response = await callClaude({
      model: 'claude-opus-4-7',
      max_tokens: 200,
      output_config: { effort: 'high' },
      system: [ { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } ],
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: 'Lies die Temperatur ab und gib das JSON zurück.' }
      ] }]
    });
    const raw = (response.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
    let parsed;
    try { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); parsed = JSON.parse(s !== -1 && e !== -1 ? raw.slice(s, e + 1) : raw); }
    catch (e) { return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Wert konnte nicht gelesen werden' }) }; }
    const value = (parsed.value != null ? String(parsed.value) : '').replace(',', '.').replace(/[^0-9.\-]/g, '').slice(0, 10);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ value: value }) };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('read-temp error:', status, msg);
    return { statusCode: status >= 400 && status < 600 ? status : 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Temperatur-Lesen fehlgeschlagen', detail: msg }) };
  }
};
