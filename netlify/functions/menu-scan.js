// Kiek mol in — KI-Menuescanner (Vision).
// Liest Speisekarten-Bilder (oder Text) und gibt sauber kategorisierte Gerichte
// zurueck. Deutlich besser als reines OCR: erkennt Namen, Preise, Groessen,
// Beschreibungen und ordnet alles in passende Kategorien ein.
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Provider (erster mit gesetztem Key gewinnt):
//   1. ANTHROPIC_API_KEY -> Claude (beste Erkennung)
//   2. GEMINI_API_KEY    -> Gemini 2.0 Flash (kostenlos, Vision)
//
// Body: { images?: ["data:image/...;base64,..."], text?: "..." }
// Antwort: { ok:true, items:[{name,description,price,category,dish_number,
//            is_vegetarian,is_vegan,is_spicy,is_beef,is_chicken,is_pork,
//            is_fish,is_seafood}] }

'use strict';

var ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_MODEL = 'claude-sonnet-4-6';
var GEMINI_MODEL = 'gemini-2.0-flash';
var GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

var PROMPT = [
    'Du bist ein praeziser Speisekarten-Parser fuer ein Restaurant-Bestellsystem.',
    'Lies die Speisekarte (Bild oder Text) und extrahiere ALLE Gerichte und Getraenke — wirklich jede Position, nichts auslassen.',
    '',
    'Gib AUSSCHLIESSLICH gueltiges JSON in genau dieser Form zurueck (keine Erklaerung, kein Markdown):',
    '{"items":[{"name":"...","description":"...","price":0.0,"category":"...","dish_number":"",',
    '"is_vegetarian":false,"is_vegan":false,"is_spicy":false,"is_beef":false,"is_chicken":false,',
    '"is_pork":false,"is_fish":false,"is_seafood":false}]}',
    '',
    'REGELN:',
    '- price: Zahl in Euro (z.B. 12.9). Komma als Dezimaltrennzeichen umwandeln (12,90 -> 12.9).',
    '- Hat ein Gericht mehrere Groessen/Preise (z.B. Pizza klein/gross), erzeuge PRO Groesse einen eigenen Eintrag',
    '  und haenge die Groesse an den Namen an, z.B. "Pizza Margherita (klein)" / "Pizza Margherita (gross)".',
    '- category: passende, saubere deutsche Kategorie, z.B.: Vorspeisen, Salate, Suppen, Pizza, Pasta,',
    '  Hauptgerichte, Fleischgerichte, Fischgerichte, Burger, Doener & Kebab, Beilagen, Desserts,',
    '  Kindergerichte, Alkoholfreie Getraenke, Heissgetraenke, Bier, Weine, Cocktails, Spirituosen.',
    '  Ordne jedes Gericht der besten Kategorie zu. Nutze die Ueberschriften der Karte, wenn vorhanden.',
    '- dish_number: Artikel-/Gerichtnummer falls vorhanden (z.B. "12"), sonst "".',
    '- description: kurze Beschreibung/Zutaten von der Karte, sonst "".',
    '- is_*-Flags aus Name/Zutaten ableiten (vegetarisch, vegan, scharf; Rind/Huhn/Schwein/Fisch/Meeresfruechte).',
    '- Erfinde nichts. Nur was wirklich auf der Karte steht. Keine doppelten Eintraege.',
    '- Wenn ein Preis unleserlich ist, lass price 0 und nimm das Gericht trotzdem auf.',
    '- WICHTIG: Liste WIRKLICH JEDE Position vollstaendig auf — von der ersten bis zur',
    '  allerletzten Zeile der Karte. NICHT kuerzen, NICHT zusammenfassen, NICHT vorzeitig',
    '  aufhoeren. Auch bei sehr vielen Gerichten (50, 100, 200) alle ausgeben.'
].join('\n');

function stripToJson(s) {
    if (!s) return '';
    s = String(s).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    return s;
}

function normalizeItems(parsed) {
    var arr = (parsed && Array.isArray(parsed.items)) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
    var out = [];
    arr.forEach(function (it) {
        if (!it || !it.name) return;
        var price = it.price;
        if (typeof price === 'string') price = parseFloat(price.replace(',', '.').replace(/[^0-9.]/g, ''));
        price = Number(price); if (!isFinite(price) || price < 0) price = 0;
        out.push({
            name: String(it.name).trim().slice(0, 120),
            description: String(it.description || '').trim().slice(0, 300),
            price: Math.round(price * 100) / 100,
            category: String(it.category || 'Sonstiges').trim().slice(0, 60) || 'Sonstiges',
            dish_number: String(it.dish_number || it.dishNumber || '').trim().slice(0, 10),
            selected: true,
            is_vegetarian: !!it.is_vegetarian, is_vegan: !!it.is_vegan, is_spicy: !!it.is_spicy,
            is_beef: !!it.is_beef, is_chicken: !!it.is_chicken, is_pork: !!it.is_pork,
            is_fish: !!it.is_fish, is_seafood: !!it.is_seafood,
            is_gluten: !!it.is_gluten
        });
    });
    return out;
}

function splitDataUrl(d) {
    var m = String(d || '').match(/^data:([^;]+);base64,(.*)$/);
    if (m) return { media: m[1], data: m[2] };
    return { media: 'image/jpeg', data: String(d || '').replace(/^data:[^,]*,/, '') };
}

async function callAnthropic(key, images, text) {
    var content = [{ type: 'text', text: PROMPT + (text ? ('\n\nSPEISEKARTE-TEXT:\n' + text) : '') }];
    (images || []).forEach(function (d) {
        var p = splitDataUrl(d);
        content.push({ type: 'image', source: { type: 'base64', media_type: p.media, data: p.data } });
    });
    var res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 16000, temperature: 0, messages: [{ role: 'user', content: content }] })
    });
    if (!res.ok) { var t = await res.text(); throw new Error('Anthropic ' + res.status + ': ' + t.slice(0, 200)); }
    var j = await res.json();
    return (j.content && j.content[0] && j.content[0].text) ? j.content[0].text : '';
}

async function callGemini(key, images, text) {
    var parts = [{ text: PROMPT + (text ? ('\n\nSPEISEKARTE-TEXT:\n' + text) : '') }];
    (images || []).forEach(function (d) {
        var p = splitDataUrl(d);
        parts.push({ inlineData: { mimeType: p.media, data: p.data } });
    });
    var res = await fetch(GEMINI_API + '?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: parts }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 16384 }
        })
    });
    if (!res.ok) { var t = await res.text(); throw new Error('Gemini ' + res.status + ': ' + t.slice(0, 200)); }
    var j = await res.json();
    var cand = j.candidates && j.candidates[0];
    return (cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text) || '';
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltiger JSON-Body' }); }
    var images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    var text = body.text ? String(body.text).slice(0, 20000) : '';
    if (!images.length && !text) return json(400, { ok: false, error: 'Kein Bild und kein Text uebergeben' });

    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    var geminiKey = process.env.GEMINI_API_KEY;
    if (!anthropicKey && !geminiKey) {
        return json(503, { ok: false, error: 'Keine KI konfiguriert (ANTHROPIC_API_KEY oder GEMINI_API_KEY in Netlify setzen).' });
    }

    // Provider-Aufruf fuer EINEN Satz Bilder (oder Text) -> normalisierte Items
    async function runModel(imgs, txt) {
        var raw = anthropicKey ? await callAnthropic(anthropicKey, imgs, txt) : await callGemini(geminiKey, imgs, txt);
        try { return normalizeItems(JSON.parse(stripToJson(raw))); } catch (e) { return []; }
    }

    try {
        var all = [];
        if (images.length > 1) {
            // Jede Seite/jedes Bild EINZELN scannen -> kein Abriss durch Token-Limit,
            // danach zusammenfuehren. So werden auch lange/mehrseitige Karten komplett erfasst.
            var perImage = await Promise.all(images.map(function (img) {
                return runModel([img], '').catch(function () { return []; });
            }));
            perImage.forEach(function (list) { all = all.concat(list); });
        } else {
            all = await runModel(images, text);
        }

        // Duplikate entfernen (gleicher Name + Preis + Kategorie)
        var seen = {}, deduped = [];
        all.forEach(function (it) {
            var k = (it.name + '|' + it.price + '|' + it.category).toLowerCase();
            if (!seen[k]) { seen[k] = 1; deduped.push(it); }
        });

        if (!deduped.length) return json(502, { ok: false, error: 'Keine Gerichte erkannt' });
        return json(200, { ok: true, items: deduped, count: deduped.length });
    } catch (e) {
        return json(502, { ok: false, error: e.message });
    }
};
