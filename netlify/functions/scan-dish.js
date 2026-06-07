// The Chef – Gericht-Kalkulator. Erkennt ein Gericht auf einem Teller-Foto,
// schätzt Zutaten + Mengen + EK-Preis pro Zutat. ANTHROPIC_API_KEY bleibt server.
//
// Erwartet POST mit JSON: { image: "<base64>", mediaType: "image/jpeg", model? }
// Antwort: { dish, ingredients:[{ name, menge, ek }], cost, vk_vorschlag, hinweis }

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

const SYSTEM_PROMPT = `Du bist Wareneinsatz-Kalkulator für eine Gastronomie-App.
Du bekommst das Foto eines fertigen Gerichts auf einem Teller.

Deine Aufgabe:
1. Benenne das Gericht möglichst genau (Deutsch).
2. Schätze die Zutaten dieser einen Portion mit realistischen Mengen.
3. Schätze für jede Zutat den Wareneinsatz-Preis (EK) in Euro – mit gastronomischen Einkaufspreisen Deutschland (nicht Endkundenpreise).
4. Schätze einen marktüblichen Brutto-Verkaufspreis (VK) in einem typischen Gastro-Restaurant.

Antworte AUSSCHLIESSLICH mit gültigem JSON, kein Text außenrum, keine Code-Fences:
{
  "dish": "Gerichtname",
  "ingredients": [
    { "name": "Zutat", "menge": "150 g", "ek": 1.20 }
  ],
  "vk_vorschlag": 18.50,
  "hinweis": "Kurzer 1-Satz-Tipp zur Kalkulation oder Marge."
}

Regeln:
- name: kurz und klar (z.B. "Wildlachs-Filet", "Basmati-Reis", "Olivenöl").
- menge: Zahl + Einheit als String ("g", "ml", "Stk", "EL").
- ek: Wareneinsatz dieser Menge in Euro als Zahl (mit Dezimalpunkt). Kleinmengen wie Gewürze als 0.05–0.30.
- Berücksichtige auch unsichtbare Standardzutaten (Öl, Salz, Gewürze, Beilagen-Sauce).
- 4–12 Zutaten typisch, nicht übertreiben.
- vk_vorschlag: realistischer Brutto-VK (inkl. 19% MwSt) für ein normales Restaurant.
- hinweis: kurzer, konkreter Satz zu Marge oder Verbesserungsidee.
- Wenn auf dem Foto kein Gericht erkennbar ist: { "dish": "", "ingredients": [], "vk_vorschlag": 0, "hinweis": "Kein Gericht erkannt." }`;

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
  const model = ['claude-opus-4-7','claude-sonnet-4-6','claude-haiku-4-5'].indexOf(payload.model) !== -1 ? payload.model : 'claude-opus-4-7';

  try {
    const response = await callClaude({
      model: model,
      max_tokens: 2000,
      output_config: model === 'claude-haiku-4-5' ? undefined : { effort: 'high' },
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: 'Analysiere dieses Gericht und gib das JSON zurück.' }
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
      console.error('scan-dish parse error:', raw.slice(0, 300));
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Bild konnte nicht ausgewertet werden' }) };
    }

    const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients.slice(0, 20).map(function (it) {
      let ek = parseFloat(it && it.ek);
      if (isNaN(ek) || ek < 0) ek = 0;
      return {
        name: (it && it.name ? String(it.name) : '').slice(0, 60).trim(),
        menge: (it && it.menge ? String(it.menge) : '').slice(0, 20).trim(),
        ek: Math.round(ek * 100) / 100
      };
    }).filter(function (it) { return it.name; }) : [];

    const cost = ingredients.reduce(function (s, i) { return s + (Number(i.ek) || 0); }, 0);
    let vk = parseFloat(parsed.vk_vorschlag);
    if (isNaN(vk) || vk < 0) vk = 0;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        dish: (parsed.dish ? String(parsed.dish) : '').slice(0, 80).trim(),
        ingredients: ingredients,
        cost: Math.round(cost * 100) / 100,
        vk_vorschlag: Math.round(vk * 100) / 100,
        hinweis: (parsed.hinweis ? String(parsed.hinweis) : '').slice(0, 240).trim(),
        usage: response.usage
      })
    };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('scan-dish error:', status, msg);
    return { statusCode: status >= 400 && status < 600 ? status : 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Gericht-Kalkulator fehlgeschlagen', detail: msg }) };
  }
};
