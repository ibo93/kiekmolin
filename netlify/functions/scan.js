// The Chef – Beleg-Scan. Extrahiert Artikel aus einem Lieferschein-Foto.
// Proxyt das Bild an die Claude Vision API; der ANTHROPIC_API_KEY bleibt
// serverseitig (Netlify-Env-Var) – nie im Frontend.
//
// Erwartet POST mit JSON: { image: "<base64>", mediaType: "image/jpeg" }
// Antwort: { lieferant: "...", items: [{ name, qty, price }] }


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

// Frozen prompt – identisch über alle Requests, damit Prompt-Caching greift.
const SYSTEM_PROMPT = `Du bist ein Beleg-Scanner für eine Gastronomie-App.
Du bekommst das Foto eines Lieferscheins oder einer Rechnung von einem
Lebensmittel-Lieferanten (z.B. Metro, Aldi, Lidl, Großhandel).

Deine Aufgabe: Lies die Belegpositionen aus und gib sie als JSON zurück.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau dieser Form:
{
  "lieferant": "Name des Lieferanten oder leerer String",
  "items": [
    { "name": "Artikelname", "qty": "Menge mit Einheit, z.B. 5 kg", "price": "Preis, z.B. €12,50 oder leerer String", "gruppe": "Warengruppe", "lager": "Lagerort" }
  ]
}

Regeln:
- name: kurz und sauber (z.B. "Tomaten frisch", nicht die komplette Belegzeile).
- qty: Menge inkl. Einheit, so wie auf dem Beleg. Wenn unklar: leerer String.
- price: Einzel- oder Positionspreis falls erkennbar, sonst leerer String.
- gruppe: ordne den Artikel GENAU EINER dieser Warengruppen zu:
  "Fleisch/Fisch", "Gemüse/Obst", "Molkerei", "Getränke", "Trockenware", "Tiefkühl", "Non-Food", "Sonstiges".
- lager: wohin der Artikel gehört, GENAU EINES von:
  "Kühlung", "Tiefkühl", "Trockenlager", "Getränkelager", "Sonstiges".
  (frisches Fleisch/Fisch/Molkerei/frisches Gemüse -> "Kühlung"; TK-Ware -> "Tiefkühl";
   Mehl/Öl/Konserven/Gewürze/Nudeln -> "Trockenlager"; Getränke -> "Getränkelager".)
- lieferant: Name des Lieferanten/Großhändlers (Belegkopf/Logo), sonst leerer String.
- Nur echte Warenpositionen, keine Zwischensummen, MwSt-Zeilen, Pfand-Summen.
- Lies ALLE Positionen, auch mehrspaltig oder eng gedruckt – lass nichts aus.
- Wenn das Bild kein Beleg ist oder nichts lesbar ist: { "lieferant": "", "items": [] }.
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
  const mediaBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } };
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
          mediaBlock,
          { type: 'text', text: 'Lies diesen Beleg aus und gib das JSON zurück.' }
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
      // Defensive: evtl. doch Code-Fences oder Text drumherum entfernen.
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      parsed = JSON.parse(start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw);
    } catch (e) {
      console.error('scan parse error:', raw.slice(0, 300));
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Beleg konnte nicht ausgewertet werden' })
      };
    }

    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 60).map(function (it) {
      return {
        name: (it && it.name ? String(it.name) : '').slice(0, 80).trim(),
        qty: (it && it.qty ? String(it.qty) : '').slice(0, 40).trim(),
        price: (it && it.price ? String(it.price) : '').slice(0, 24).trim(),
        gruppe: (it && it.gruppe ? String(it.gruppe) : '').slice(0, 24).trim(),
        lager: (it && it.lager ? String(it.lager) : '').slice(0, 24).trim()
      };
    }).filter(function (it) { return it.name; }) : [];

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        lieferant: (parsed.lieferant ? String(parsed.lieferant) : '').slice(0, 60).trim(),
        items: items,
        usage: response.usage
      })
    };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('scan error:', status, msg);
    return {
      statusCode: status >= 400 && status < 600 ? status : 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Beleg-Scan fehlgeschlagen', detail: msg })
    };
  }
};
