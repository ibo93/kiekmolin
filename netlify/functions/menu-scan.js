// Kiek mol in — KI-Menuescanner (Vision).
// Liest Speisekarten-Bilder (oder Text) und gibt sauber kategorisierte Gerichte
// zurueck. Deutlich besser als reines OCR: erkennt Namen, Preise, Groessen,
// Beschreibungen und ordnet alles in passende Kategorien ein.
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Provider (erster mit gesetztem Key gewinnt):
//   1. ANTHROPIC_API_KEY -> Claude Sonnet (beste Erkennung)
//   2. GEMINI_API_KEY    -> Gemini 2.5 Flash (kostenlos, Vision),
//                           Fallback auf 2.0 Flash falls 2.5 nicht verfuegbar.
//
// Body: { images?: ["data:image/...;base64,..."], text?: "..." }
// Antwort: { ok:true, items:[{name,description,price,category,dish_number,
//            is_vegetarian,is_vegan,is_spicy,is_beef,is_chicken,is_pork,
//            is_fish,is_seafood}] }

'use strict';

var ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_MODEL = 'claude-sonnet-5';
// Reihenfolge = Prioritaet. 2.5 Flash liest Speisekarten DEUTLICH besser als 2.0;
// beide laufen mit demselben GEMINI_API_KEY. Schlaegt 2.5 fehl (404/Quota),
// wird automatisch 2.0 versucht.
var GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

var PROMPT = [
    'Du bist ein praeziser Speisekarten-Parser fuer ein Restaurant-Bestellsystem.',
    'Lies die Speisekarte (Bild oder Text) SORGFAELTIG und extrahiere ALLE Gerichte und Getraenke — wirklich jede Position, nichts auslassen.',
    '',
    'Gib AUSSCHLIESSLICH gueltiges JSON in genau dieser Form zurueck (keine Erklaerung, kein Markdown):',
    '{"items":[{"name":"...","description":"...","price":0.0,"category":"...","dish_number":"",',
    '"is_vegetarian":false,"is_vegan":false,"is_spicy":false,"is_beef":false,"is_chicken":false,',
    '"is_pork":false,"is_fish":false,"is_seafood":false}]}',
    '',
    'REGELN:',
    '- Lies das Bild systematisch: Spalte fuer Spalte, von oben nach unten. Viele Karten haben',
    '  ZWEI oder MEHR SPALTEN — lies erst die linke Spalte komplett, dann die rechte.',
    '- price: Zahl in Euro (z.B. 12.9). Komma als Dezimaltrennzeichen umwandeln (12,90 -> 12.9).',
    '  Preise stehen oft rechtsbuendig in einer eigenen Spalte — ordne jeden Preis der richtigen Zeile zu.',
    '- Hat ein Gericht mehrere Groessen/Preise (z.B. Pizza klein/gross, Getraenke 0,3l/0,5l,',
    '  oder zwei Preisspalten mit Ueberschriften), erzeuge PRO Groesse einen eigenen Eintrag',
    '  und haenge die Groesse an den Namen an, z.B. "Pizza Margherita (klein)" / "Pizza Margherita (gross)",',
    '  "Cola (0,3l)" / "Cola (0,5l)".',
    '- category: passende, saubere deutsche Kategorie, z.B.: Vorspeisen, Salate, Suppen, Pizza, Pasta,',
    '  Hauptgerichte, Fleischgerichte, Fischgerichte, Burger, Doener & Kebab, Beilagen, Desserts,',
    '  Kindergerichte, Alkoholfreie Getraenke, Heissgetraenke, Bier, Weine, Cocktails, Spirituosen.',
    '  Ordne jedes Gericht der besten Kategorie zu. Nutze die Ueberschriften der Karte, wenn vorhanden.',
    '- dish_number: Artikel-/Gerichtnummer falls vorhanden (z.B. "12" oder "12a"), sonst "".',
    '  Nummern stehen meist VOR dem Namen. Verwechsle Nummern nicht mit Preisen.',
    '- description: kurze Beschreibung/Zutaten von der Karte (auch kleingedruckte Zeilen unter dem Namen), sonst "".',
    '  Zusatzstoff-Kennzeichnungen wie "1,2,a,c" NICHT in die Beschreibung uebernehmen.',
    '- is_*-Flags aus Name/Zutaten ableiten (vegetarisch, vegan, scharf; Rind/Huhn/Schwein/Fisch/Meeresfruechte).',
    '- Deutsche Umlaute korrekt schreiben (ä, ö, ü, ß) — auch wenn die Karte GROSSBUCHSTABEN nutzt,',
    '  Namen in normaler Gross-/Kleinschreibung ausgeben ("PIZZA SALAMI" -> "Pizza Salami").',
    '- Erfinde nichts. Nur was wirklich auf der Karte steht. Keine doppelten Eintraege.',
    '- Wenn ein Preis unleserlich ist, lass price 0 und nimm das Gericht trotzdem auf.',
    '- Ueberschriften, Oeffnungszeiten, Adressen, Werbetexte sind KEINE Gerichte — auslassen.',
    '- WICHTIG: Liste WIRKLICH JEDE Position vollstaendig auf — von der ersten bis zur',
    '  allerletzten Zeile der Karte. NICHT kuerzen, NICHT zusammenfassen, NICHT vorzeitig',
    '  aufhoeren. Auch bei sehr vielen Gerichten (50, 100, 200) alle ausgeben.',
    '- Bevor du antwortest: pruefe nochmal, ob du Randbereiche, Fusszeilen, Kaesten und',
    '  die letzte Spalte/Seite erfasst hast.'
].join('\n');

function stripToJson(s) {
    if (!s) return '';
    s = String(s).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    return s;
}

// JSON parsen; wenn die Antwort mitten im Array abgerissen ist (Token-Limit),
// das letzte vollstaendige Objekt retten statt alles zu verwerfen.
function parseItemsLoose(raw) {
    var s = stripToJson(raw);
    try { return JSON.parse(s); } catch (e) {}
    var idx = s.lastIndexOf('},');
    if (idx > 0) {
        try { return JSON.parse(s.slice(0, idx + 1) + ']}'); } catch (e2) {}
    }
    idx = s.lastIndexOf('}');
    if (idx > 0) {
        try { return JSON.parse(s.slice(0, idx + 1) + ']}'); } catch (e3) {}
    }
    return null;
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
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 32000, temperature: 0, messages: [{ role: 'user', content: content }] })
    });
    if (!res.ok) { var t = await res.text(); throw new Error('Anthropic ' + res.status + ': ' + t.slice(0, 200)); }
    var j = await res.json();
    return (j.content && j.content[0] && j.content[0].text) ? j.content[0].text : '';
}

// Striktes Antwort-Schema: zwingt Gemini zu exakt diesem JSON-Format --
// verhindert Halluzinationen im Format und abgeschnittene/kaputte Antworten.
var GEMINI_SCHEMA = {
    type: 'OBJECT',
    properties: {
        items: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    name: { type: 'STRING' },
                    description: { type: 'STRING' },
                    price: { type: 'NUMBER' },
                    category: { type: 'STRING' },
                    dish_number: { type: 'STRING' },
                    is_vegetarian: { type: 'BOOLEAN' },
                    is_vegan: { type: 'BOOLEAN' },
                    is_spicy: { type: 'BOOLEAN' },
                    is_beef: { type: 'BOOLEAN' },
                    is_chicken: { type: 'BOOLEAN' },
                    is_pork: { type: 'BOOLEAN' },
                    is_fish: { type: 'BOOLEAN' },
                    is_seafood: { type: 'BOOLEAN' }
                },
                required: ['name', 'price', 'category']
            }
        }
    },
    required: ['items']
};

async function callGeminiModel(key, model, images, text) {
    var parts = [{ text: PROMPT + (text ? ('\n\nSPEISEKARTE-TEXT:\n' + text) : '') }];
    (images || []).forEach(function (d) {
        var p = splitDataUrl(d);
        parts.push({ inlineData: { mimeType: p.media, data: p.data } });
    });
    var genCfg = {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_SCHEMA,
        // 2.5 Flash kann sehr lange Antworten; 2.0 Flash ist auf 8192 gedeckelt.
        maxOutputTokens: model.indexOf('2.5') >= 0 ? 32768 : 8192
    };
    if (model.indexOf('2.5') >= 0) {
        // "Thinking" wuerde vom Output-Budget abgehen und lange Karten abreissen lassen.
        genCfg.thinkingConfig = { thinkingBudget: 0 };
    }
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: parts }],
            generationConfig: genCfg
        })
    });
    if (!res.ok) { var t = await res.text(); throw new Error('Gemini(' + model + ') ' + res.status + ': ' + t.slice(0, 200)); }
    var j = await res.json();
    var cand = j.candidates && j.candidates[0];
    var out = '';
    if (cand && cand.content && Array.isArray(cand.content.parts)) {
        cand.content.parts.forEach(function (pt) { if (pt && pt.text) out += pt.text; });
    }
    return out;
}

async function callGemini(key, images, text) {
    var lastErr = null;
    for (var i = 0; i < GEMINI_MODELS.length; i++) {
        try {
            return await callGeminiModel(key, GEMINI_MODELS[i], images, text);
        } catch (e) { lastErr = e; }
    }
    throw (lastErr || new Error('Gemini nicht erreichbar'));
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltiger JSON-Body' }); }
    var images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
    var text = body.text ? String(body.text).slice(0, 20000) : '';
    if (!images.length && !text) return json(400, { ok: false, error: 'Kein Bild und kein Text uebergeben' });

    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    var geminiKey = process.env.GEMINI_API_KEY;
    if (!anthropicKey && !geminiKey) {
        return json(503, { ok: false, error: 'Keine KI konfiguriert (ANTHROPIC_API_KEY oder GEMINI_API_KEY in Netlify setzen).' });
    }

    // Provider-Aufruf fuer EINEN Satz Bilder (oder Text) -> normalisierte Items.
    // Bei leerem Ergebnis EINMAL wiederholen (Vision-Modelle sind nicht deterministisch;
    // ein zweiter Versuch rettet haeufig einen kompletten Scan).
    async function runModel(imgs, txt) {
        for (var attempt = 0; attempt < 2; attempt++) {
            try {
                var raw;
                if (anthropicKey) {
                    // Claude bevorzugt; schlaegt er fehl (Quota/Netz/Modell),
                    // sofort auf Gemini ausweichen statt den Scan zu verlieren.
                    try {
                        raw = await callAnthropic(anthropicKey, imgs, txt);
                    } catch (ae) {
                        if (!geminiKey) throw ae;
                        console.warn('[menu-scan] Anthropic fehlgeschlagen, weiche auf Gemini aus:', ae.message);
                        raw = await callGemini(geminiKey, imgs, txt);
                    }
                } else {
                    raw = await callGemini(geminiKey, imgs, txt);
                }
                var items = normalizeItems(parseItemsLoose(raw));
                if (items.length) return items;
            } catch (e) {
                if (attempt === 1) throw e;
            }
        }
        return [];
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

        // Duplikate entfernen (gleicher Name + Preis) — Kategorie bewusst NICHT im
        // Schluessel: ueberlappende Bild-Streifen kategorisieren dasselbe Gericht
        // sonst leicht unterschiedlich und es erscheint doppelt.
        var seen = {}, deduped = [];
        all.forEach(function (it) {
            var k = (it.name + '|' + it.price).toLowerCase().replace(/\s+/g, ' ');
            if (!seen[k]) { seen[k] = 1; deduped.push(it); }
        });

        if (!deduped.length) return json(502, { ok: false, error: 'Keine Gerichte erkannt' });
        return json(200, { ok: true, items: deduped, count: deduped.length });
    } catch (e) {
        return json(502, { ok: false, error: e.message });
    }
};
