// The Chef – Kassenbericht-Scan. Liest aus einem Tagesbericht / Z-Bon der Kasse,
// welche Gerichte wie oft verkauft wurden. Proxyt das Bild an die Claude Vision
// API; der ANTHROPIC_API_KEY bleibt serverseitig (Netlify-Env-Var) – nie im Frontend.
//
// Erwartet POST mit JSON: { image: "<base64>", mediaType: "image/jpeg" }
// Antwort: { items: [{ name, qty }] }


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

So liest du den Bericht sicher:
- Die Stückzahl steht oft in einer eigenen Spalte – meist LINKS vom Namen
  ("12 Schnitzel", "12x Schnitzel") oder RECHTS ("Schnitzel ........ 12").
  Verwechsle die Stückzahl NICHT mit dem Preis (€-Beträge, Beträge mit Komma/Punkt
  und Nachkommastellen sind Preise, KEINE Stückzahlen).
- Erkenne auch Spaltenüberschriften wie "Anz", "Anzahl", "Menge", "Stk", "Qty".
- Fasse mehrfach auftauchende, gleiche Artikel zu EINER Zeile zusammen und addiere
  die Stückzahlen.
- Lies auch leicht schräge, gedruckte ODER handschriftliche Berichte so gut wie möglich.

Regeln:
- name: der Artikel-/Gerichtsname so wie auf dem Bon (z.B. "Schnitzel Wiener Art").
- qty: die VERKAUFTE Stückzahl als ganze Zahl (nicht der Preis!). Wenn wirklich keine
  Stückzahl erkennbar ist: 1.
- Nur echte Verkaufspositionen (Speisen/Getränke). KEINE Summen, Zwischensummen,
  Gesamt/Total, MwSt-/Steuer-Zeilen, Trinkgeld, Rabatt, Storno- oder Zahlungszeilen
  (Bar, EC, Karte), keine Tisch-/Bon-Nummern.
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
