// The Chef – Kassenbericht-Scan. Liest aus einem Tagesbericht / Z-Bon der Kasse,
// welche Gerichte wie oft verkauft wurden. Proxyt das Bild an die Claude Vision
// API; der ANTHROPIC_API_KEY bleibt serverseitig (Netlify-Env-Var) – nie im Frontend.
//
// Erwartet POST mit JSON: { image: "<base64>", mediaType: "image/jpeg" }
// Antwort: { items: [{ name, qty }] }

const Anthropic = require('@anthropic-ai/sdk');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Frozen prompt – identisch über alle Requests, damit Prompt-Caching greift.
const SYSTEM_PROMPT = `Du bist ein Kassenbericht-Scanner für eine Gastronomie-App.
Du bekommst das Foto eines Tagesberichts, Z-Bons oder einer Verkaufsübersicht
aus einem Kassensystem (z.B. Vectron, Orderbird, Lightspeed, Gastronovi).

Deine Aufgabe: Lies aus, welche Gerichte/Artikel wie oft verkauft wurden, und
gib das als JSON zurück.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau dieser Form:
{
  "items": [
    { "name": "Name des Gerichts wie auf dem Bon", "qty": 12 }
  ]
}

Regeln:
- name: der Artikel-/Gerichtsname so wie auf dem Bon (z.B. "Schnitzel Wiener Art").
- qty: die verkaufte Stückzahl als ganze Zahl. Wenn keine Zahl erkennbar: 1.
- Nur echte Verkaufspositionen (Speisen/Getränke). KEINE Summen, Zwischensummen,
  MwSt-Zeilen, Trinkgeld, Storno- oder Zahlungszeilen.
- Wenn das Bild kein Kassenbericht ist oder nichts lesbar: { "items": [] }.
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
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON' }) };
  }

  const image = (payload.image || '').toString();
  if (!image) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Feld "image" fehlt' }) };
  }
  const mediaType = (payload.mediaType || 'image/jpeg').toString();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'Lies diesen Kassenbericht aus und gib das JSON zurück.' }
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
      console.error('scan-sales parse error:', raw.slice(0, 300));
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Kassenbericht konnte nicht ausgewertet werden' })
      };
    }

    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 60).map(function (it) {
      let qty = parseInt(it && it.qty, 10);
      if (isNaN(qty) || qty < 0) qty = 1;
      return {
        name: (it && it.name ? String(it.name) : '').slice(0, 80).trim(),
        qty: Math.min(qty, 999)
      };
    }).filter(function (it) { return it.name; }) : [];

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ items: items, usage: response.usage })
    };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('scan-sales error:', status, msg);
    return {
      statusCode: status >= 400 && status < 600 ? status : 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Kassenbericht-Scan fehlgeschlagen', detail: msg })
    };
  }
};
