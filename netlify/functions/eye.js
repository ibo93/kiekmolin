// The Chef – KI-Auge. Ein Foto -> die KI erkennt selbst, was es ist, und liefert
// die passenden Daten. Der ANTHROPIC_API_KEY bleibt serverseitig.
//
// Erwartet POST: { image, mediaType }
// Antwort: { kind: "beleg"|"lager"|"temperatur"|"unbekannt", lieferant?, items?, value? }

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

const SYSTEM_PROMPT = `Du bist das "Auge" einer Gastronomie-App. Du bekommst ein Foto und
erkennst SELBST, worum es sich handelt, und gibst die passenden Daten zurück.

Mögliche Fälle:
- "beleg": Lieferschein/Rechnung eines Lebensmittel-Lieferanten.
- "lager": Regal/Kühlschrank/Lager-Ablage mit Produkten.
- "temperatur": Thermometer/Display mit einer Temperatur.
- "unbekannt": nichts davon klar erkennbar.

Antworte AUSSCHLIESSLICH mit gültigem JSON in genau einer dieser Formen:
{ "kind":"beleg", "lieferant":"Name oder leer", "items":[{"name":"Artikel","qty":"Menge mit Einheit","price":"Preis oder leer"}] }
{ "kind":"lager", "items":[{"name":"Produkt","count":12}] }
{ "kind":"temperatur", "value":"4.2" }
{ "kind":"unbekannt" }

Regeln:
- Wähle genau EINEN Fall, der am besten passt.
- Namen kurz & sauber auf Deutsch. Bei beleg keine Summen/MwSt/Pfand.
- value: Zahl mit Punkt als Dezimaltrennzeichen, Minus für Minusgrade, ohne Einheit.
- Kein Text vor/nach dem JSON, keine Code-Fences.`;

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
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      output_config: { effort: 'medium' },
      system: [ { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } } ],
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: 'Was ist auf dem Foto? Gib das passende JSON zurück.' }
      ] }]
    });
    const raw = (response.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
    let p;
    try { const s = raw.indexOf('{'), e = raw.lastIndexOf('}'); p = JSON.parse(s !== -1 && e !== -1 ? raw.slice(s, e + 1) : raw); }
    catch (e) { return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ kind: 'unbekannt' }) }; }

    const kind = ['beleg','lager','temperatur'].indexOf(p.kind) !== -1 ? p.kind : 'unbekannt';
    let out = { kind: kind };
    if (kind === 'beleg') {
      out.lieferant = (p.lieferant ? String(p.lieferant) : '').slice(0, 60).trim();
      out.items = Array.isArray(p.items) ? p.items.slice(0, 40).map(function (it) { return { name:(it&&it.name?String(it.name):'').slice(0,80).trim(), qty:(it&&it.qty?String(it.qty):'').slice(0,40).trim(), price:(it&&it.price?String(it.price):'').slice(0,24).trim() }; }).filter(function (it) { return it.name; }) : [];
    } else if (kind === 'lager') {
      out.items = Array.isArray(p.items) ? p.items.slice(0, 60).map(function (it) { let c=parseInt(it&&it.count,10); if(isNaN(c)||c<1)c=1; return { name:(it&&it.name?String(it.name):'').slice(0,80).trim(), count:Math.min(c,9999) }; }).filter(function (it) { return it.name; }) : [];
    } else if (kind === 'temperatur') {
      out.value = (p.value != null ? String(p.value) : '').replace(',', '.').replace(/[^0-9.\-]/g, '').slice(0, 10);
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(out) };
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var msg = err && err.message ? err.message : 'Unbekannter Fehler';
    console.error('eye error:', status, msg);
    return { statusCode: status >= 400 && status < 600 ? status : 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'KI-Auge fehlgeschlagen', detail: msg }) };
  }
};
