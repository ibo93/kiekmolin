// The Chef – Speisekarten-Scan. Liest aus dem Foto einer Speisekarte die Gerichte
// samt Preis, schätzt typische Zutaten + Wareneinsatz pro Portion und gibt das als
// JSON zurück – damit daraus direkt Rezepte mit Marge entstehen.
// Der ANTHROPIC_API_KEY bleibt serverseitig.
//
// Erwartet POST: { image, mediaType }
// Antwort: { dishes: [{ name, price, icon, ingredients:[{name, menge, kosten}], tip }] }

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

const SYSTEM_PROMPT = `Du bist ein Speisekarten-Analyst für eine Gastronomie-App.
Du bekommst das Foto einer Speisekarte. Lies ALLE Gerichte/Getränke aus und
leite für jedes die typischen Zutaten pro Portion ab.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau dieser Form:
{
  "dishes": [
    {
      "name": "Gerichtname",
      "price": 12.50,
      "icon": "schnitzel",
      "ingredients": [ { "name": "Zutat", "menge": "200 g", "kosten": 1.20 } ],
      "tip": "kurzer Tipp oder leer"
    }
  ]
}

Regeln:
- name: der Gerichtname wie auf der Karte, kurz und sauber.
- price: Verkaufspreis als Zahl (Punkt als Dezimaltrennzeichen). Wenn keiner lesbar: 0.
- icon: GENAU EINES von "schnitzel","tomate","fisch","salat","pizza","wurst","dessert","kaffee","custom" (das am besten passt).
- ingredients: die typischen Zutaten pro EINER Portion mit realistischer Menge (menge inkl. Einheit, z.B. "200 g", "30 ml", oder "—" wenn unklar).
- kosten: geschätzter Wareneinsatz (Einkauf) dieser Zutat-Menge in EURO als Zahl, realistisch für deutschen Gastro-Großhandel. Wenn unklar: 0.
- Schätze lieber sinnvoll als nichts: gib pro Gericht 3–7 Zutaten an.
- Nur echte Gerichte/Getränke, keine Überschriften/Kategorien/Allergen-Hinweise.
- Wenn das Bild keine Speisekarte ist oder nichts lesbar: { "dishes": [] }.
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

  const ICONS = ['schnitzel','tomate','fisch','salat','pizza','wurst','dessert','kaffee','custom'];
  const mediaBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } };
  const model = ['claude-opus-4-7','claude-sonnet-4-6','claude-haiku-4-5'].indexOf(payload.model) !== -1 ? payload.model : 'claude-opus-4-7';

  try {
    const response = await callClaude({
      model: model,
      max_tokens: 4000,
      output_config: model === 'claude-haiku-4-5' ? undefined : { effort: 'high' },
      system: [ { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } ],
      messages: [{ role: 'user', content: [
        mediaBlock,
        { type: 'text', text: 'Lies diese Speisekarte aus und gib das JSON zurück.' }
      ] }]
    });

    const raw = (response.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
    let parsed;
    try { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); parsed = JSON.parse(s !== -1 && e !== -1 ? raw.slice(s, e + 1) : raw); }
    catch (e) { console.error('scan-menu parse error:', raw.slice(0, 300)); return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Speisekarte konnte nicht ausgewertet werden' }) }; }

    const dishes = Array.isArray(parsed.dishes) ? parsed.dishes.slice(0, 60).map(function (d) {
      let price = parseFloat(d && d.price); if (isNaN(price) || price < 0) price = 0;
      const icon = (d && ICONS.indexOf(d.icon) !== -1) ? d.icon : 'custom';
      const ingredients = Array.isArray(d && d.ingredients) ? d.ingredients.slice(0, 12).map(function (i) {
        let kosten = parseFloat(i && i.kosten); if (isNaN(kosten) || kosten < 0) kosten = 0;
        return { name: (i && i.name ? String(i.name) : '').slice(0, 60).trim(), menge: (i && i.menge ? String(i.menge) : '—').slice(0, 24).trim(), kosten: Math.round(kosten * 100) / 100 };
      }).filter(function (i) { return i.name; }) : [];
      return { name: (d && d.name ? String(d.name) : '').slice(0, 80).trim(), price: Math.round(price * 100) / 100, icon: icon, ingredients: ingredients, tip: (d && d.tip ? String(d.tip) : '').slice(0, 140).trim() };
    }).filter(function (d) { return d.name; }) : [];

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ dishes: dishes, usage: response.usage }) };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('scan-menu error:', status, msg);
    return { statusCode: status >= 400 && status < 600 ? status : 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Speisekarten-Scan fehlgeschlagen', detail: msg }) };
  }
};
