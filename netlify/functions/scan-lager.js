// The Chef – Lager-Vision. Erkennt und zählt Produkte auf einem Regal-Foto.
// Proxyt das Bild an die Claude Vision API; der ANTHROPIC_API_KEY bleibt
// serverseitig (Netlify-Env-Var) – nie im Frontend.
//
// Erwartet POST mit JSON: { image: "<base64>", mediaType: "image/jpeg" }
// Antwort: { items: [{ name, count }] }


const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function callClaude(body){
  const r = await fetch("https://api.anthropic.com/v1/messages",{ method:"POST", headers:{ "x-api-key":process.env.ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01", "content-type":"application/json" }, body:JSON.stringify(body) });
  if(!r.ok){ const t=await r.text(); const e=new Error(t.slice(0,300)); e.status=r.status; throw e; }
  return r.json();
}

const SYSTEM_PROMPT = `Du bist eine Lager-Erkennung für eine Gastronomie-App.
Du bekommst das Foto eines Regals, Kühlschranks oder einer Lager-Ablage.

Deine Aufgabe: Erkenne die sichtbaren Lebensmittel/Getränke-Produkte und zähle,
wie viele Einheiten du von jedem siehst. Gib das als JSON zurück.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau dieser Form:
{
  "items": [
    { "name": "Produktname", "count": 12 }
  ]
}

Regeln:
- name: kurzer, klarer Produktname auf Deutsch (z.B. "Cola 1L", "Tomaten", "Mehl").
- count: geschätzte Anzahl sichtbarer Einheiten als ganze Zahl (mind. 1).
- Fasse gleiche Produkte zu einer Zeile zusammen.
- Nur echte Waren, keine Regale/Möbel/Deko.
- Wenn nichts Essbares erkennbar ist: { "items": [] }.
- Kein Text vor oder nach dem JSON. Keine Code-Fences.`;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht gesetzt' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON' }) }; }

  const image = (payload.image || '').toString();
  if (!image) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Feld "image" fehlt' }) };
  }
  const mediaType = (payload.mediaType || 'image/jpeg').toString();

  try {
    const response = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'Erkenne und zähle die Produkte auf diesem Bild und gib das JSON zurück.' }
        ]
      }]
    });

    const raw = response.content
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('')
      .trim();

    let parsed;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      parsed = JSON.parse(start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw);
    } catch (e) {
      console.error('scan-lager parse error:', raw.slice(0, 300));
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Bild konnte nicht ausgewertet werden' }) };
    }

    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 60).map(function (it) {
      let count = parseInt(it && it.count, 10);
      if (isNaN(count) || count < 1) count = 1;
      return { name: (it && it.name ? String(it.name) : '').slice(0, 80).trim(), count: Math.min(count, 9999) };
    }).filter(function (it) { return it.name; }) : [];

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ items: items, usage: response.usage }) };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('scan-lager error:', status, msg);
    return { statusCode: status >= 400 && status < 600 ? status : 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Lager-Vision fehlgeschlagen', detail: msg }) };
  }
};
