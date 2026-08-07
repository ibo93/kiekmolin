// Kiek mol in — KI-Menuescanner (Vision).
// Liest Speisekarten-Bilder (oder Text) und gibt sauber kategorisierte Gerichte
// zurueck. Deutlich besser als reines OCR: erkennt Namen, Preise, Groessen,
// Beschreibungen und ordnet alles in passende Kategorien ein.
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Provider-Reihenfolge (Standard: beste Erkennung zuerst):
//   1. ANTHROPIC_API_KEY -> Claude Sonnet 5 (beste Erkennung, kostet pro Scan
//                           wenige Cent; hochaufloesende Bilderkennung bis
//                           2576 px Kantenlaenge -- liest also auch das
//                           Kleingedruckte einer Karte).
//   2. GEMINI_API_KEY    -> Gemini 2.5 Flash (kostenloses Kontingent, Vision),
//                           Fallback auf 2.0 Flash falls 2.5 nicht verfuegbar.
//
// Gemini bleibt bewusst als Notnagel stehen, auch wenn normalerweise Claude
// scannt: faellt Anthropic aus oder ist das Konto leer, laeuft der Scan weiter
// statt zu sterben. Solange Claude funktioniert, wird Gemini nie aufgerufen und
// kostet damit auch nichts.
// Wer es andersherum will (kostenlos vor Qualitaet), setzt in Netlify:
//   MENU_SCAN_PROVIDER=gemini
//
// Body: { images?: ["data:image/...;base64,..."], text?: "..." }
// Antwort: { ok:true, items:[{name,description,price,category,dish_number,
//            is_vegetarian,is_vegan,is_spicy,is_beef,is_chicken,is_pork,
//            is_fish,is_seafood}] }

// OCR-VORSTUFE (optional, empfohlen):
//   GOOGLE_VISION_API_KEY -> Google Cloud Vision, DOCUMENT_TEXT_DETECTION.
// Das ist dieselbe OCR-Maschine, die hinter Google Lens und der Menuekarten-
// Erkennung im Google-Unternehmensprofil steckt. Sie liefert die Zeichen EXAKT,
// mit Position -- ein Vision-Modell allein "liest" das Bild dagegen frei und
// vertut sich vor allem bei Preisen und mehrspaltigen Karten.
// Wir kombinieren beides: die OCR liefert den exakten Wortlaut, das Modell
// bekommt zusaetzlich das Bild fuer die Struktur (Spalten, Ueberschriften,
// welcher Preis zu welchem Gericht gehoert).
// Ohne Schluessel laeuft alles genau wie bisher weiter -- die OCR wird dann
// einfach uebersprungen. Kein Schluessel = kein Risiko.
// Kontingent: 1000 Bilder/Monat kostenlos, danach ca. 1,50 $ pro 1000.

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

// Google Cloud Vision: exakter Text eines Bildes.
// DOCUMENT_TEXT_DETECTION (nicht TEXT_DETECTION) ist auf dichte, mehrspaltige
// Dokumente ausgelegt -- genau der Fall Speisekarte.
async function ocrImage(key, dataUrl) {
    var p = splitDataUrl(dataUrl);
    var res = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [{
                image: { content: p.data },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                imageContext: { languageHints: ['de', 'en'] }
            }]
        })
    });
    if (!res.ok) { var t = await res.text(); throw new Error('Vision ' + res.status + ': ' + t.slice(0, 200)); }
    var j = await res.json();
    var r = j.responses && j.responses[0];
    if (r && r.error && r.error.message) throw new Error('Vision: ' + r.error.message.slice(0, 200));
    var txt = (r && r.fullTextAnnotation && r.fullTextAnnotation.text) || '';
    return String(txt).slice(0, 40000);
}

// OCR fuer alle Bilder -- Fehler sind hier NIE fatal: schlaegt die OCR fehl
// (Schluessel fehlt, API nicht aktiviert, Kontingent leer), scannen wir
// weiter wie bisher nur mit dem Bild.
// Merkt sich pro Function-Instanz, dass ein Schluessel keine Vision-Rechte hat.
// Sonst laeuft bei JEDEM Scan ein von vornherein aussichtsloser Aufruf ins Leere
// (typischer Fall: der Gemini-Schluessel wird mitbenutzt, in dessen Google-Projekt
// die Cloud Vision API gar nicht aktiviert ist). 401/403 = Rechteproblem, das sich
// ohne Zutun nicht aendert; alles andere (Quota, Netz) darf es weiter versuchen.
var _visionDenied = {};

async function ocrAll(key, images) {
    if (!key || !images || !images.length) return '';
    if (_visionDenied[key]) return '';
    var parts = await Promise.all(images.map(function (img) {
        return ocrImage(key, img).catch(function (e) {
            if (/\b(401|403)\b|PERMISSION_DENIED|has not been used|is disabled/i.test(e.message)) {
                _visionDenied[key] = 1;
                console.warn('[menu-scan] OCR dauerhaft aus (kein Zugriff):', e.message);
            } else {
                console.warn('[menu-scan] OCR uebersprungen:', e.message);
            }
            return '';
        });
    }));
    return parts.filter(Boolean).join('\n\n--- naechste Seite ---\n\n');
}

// OCR-Text so einbetten, dass das Modell ihn als Beleg nutzt statt ihn
// blind abzuschreiben: die Zeichen stimmen, die Lesereihenfolge nicht immer.
function ocrBlock(ocr) {
    if (!ocr) return '';
    return '\n\nOCR-TEXT (maschinell aus demselben Bild gelesen — die ZEICHEN und vor allem die ZAHLEN\n' +
           'sind exakt, die Reihenfolge kann bei mehrspaltigen Karten durcheinander sein):\n' +
           '"""\n' + ocr + '\n"""\n' +
           'Nutze das Bild fuer die STRUKTUR (Spalten, Ueberschriften, welcher Preis zu welcher Zeile gehoert)\n' +
           'und den OCR-Text fuer die exakte SCHREIBWEISE und die PREISE. Weichen Bild und OCR bei einer Zahl\n' +
           'voneinander ab, gilt der OCR-Text. Steht ein Gericht im OCR-Text, muss es auch in deiner Liste stehen.';
}

// Prompt zusammensetzen. Nutzertext (eingetippte Karte) und OCR-Text sind zwei
// verschiedene Dinge und bekommen deshalb getrennte, klar benannte Abschnitte --
// sonst haelt das Modell den OCR-Auszug fuer die vom Wirt eingegebene Karte.
function buildPrompt(text, extra) {
    return PROMPT + (text ? ('\n\nSPEISEKARTE-TEXT:\n' + text) : '') + (extra || '');
}

async function callAnthropic(key, images, text, extra) {
    var content = [{ type: 'text', text: buildPrompt(text, extra) }];
    (images || []).forEach(function (d) {
        var p = splitDataUrl(d);
        content.push({ type: 'image', source: { type: 'base64', media_type: p.media, data: p.data } });
    });
    var res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 32000,
            // KEIN temperature: Claude Sonnet 5 lehnt temperature/top_p/top_k mit
            // HTTP 400 ab. Genau daran ist hier bisher JEDER Claude-Aufruf
            // gescheitert -- gescannt hat in Wahrheit immer Gemini.
            //
            // Denkschritte aus: sie zaehlen gegen dieselben max_tokens wie die
            // Antwort. Bei einer langen Karte frisst das Nachdenken das Budget
            // auf und die Gerichteliste reisst mittendrin ab. Fuer stures
            // Abtippen einer Karte -- noch dazu mit OCR-Text daneben -- bringt
            // Nachdenken nichts und kostet nur Zeit und Tokens.
            thinking: { type: 'disabled' },
            messages: [{ role: 'user', content: content }]
        })
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

async function callGeminiModel(key, model, images, text, extra) {
    var parts = [{ text: buildPrompt(text, extra) }];
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

async function callGemini(key, images, text, extra) {
    var lastErr = null;
    for (var i = 0; i < GEMINI_MODELS.length; i++) {
        try {
            return await callGeminiModel(key, GEMINI_MODELS[i], images, text, extra);
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

    // Reihenfolge der Anbieter. Claude zuerst = beste Erkennung.
    // Gemini laeuft nur, wenn Claude gar nichts liefert -- und kostet dann nichts.
    var providers = [];
    if (anthropicKey) providers.push({ name: 'Claude', call: function (i, t, x) { return callAnthropic(anthropicKey, i, t, x); } });
    if (geminiKey)    providers.push({ name: 'Gemini', call: function (i, t, x) { return callGemini(geminiKey, i, t, x); } });
    if (String(process.env.MENU_SCAN_PROVIDER || '').toLowerCase() === 'gemini') providers.reverse();

    // Ein Satz Bilder (oder Text) -> normalisierte Items.
    // Jeder Anbieter wird der Reihe nach probiert. Gibt es nur einen, bekommt er
    // einen zweiten Versuch -- Vision-Modelle sind nicht deterministisch, ein
    // Wiederholen rettet haeufig einen kompletten Scan.
    //
    // Wichtig: ein LEERES Ergebnis zaehlt hier wie ein Fehler. Vorher wurde bei
    // 0 Gerichten derselbe Anbieter noch einmal gefragt und der zweite nie --
    // die Ausweichmoeglichkeit lief also nur bei einer echten Exception an.
    async function runModel(imgs, txt, extra) {
        var order = providers.length === 1 ? [providers[0], providers[0]] : providers;
        var lastErr = null;
        for (var i = 0; i < order.length; i++) {
            try {
                var items = normalizeItems(parseItemsLoose(await order[i].call(imgs, txt, extra)));
                if (items.length) return items;
                console.warn('[menu-scan] ' + order[i].name + ' lieferte 0 Gerichte');
            } catch (e) {
                lastErr = e;
                console.warn('[menu-scan] ' + order[i].name + ' fehlgeschlagen:', e.message);
            }
        }
        if (lastErr) throw lastErr;
        return [];
    }

    // OCR-Vorstufe. Eigener Schluessel bevorzugt; ist keiner gesetzt, wird der
    // Gemini-Schluessel probiert (funktioniert, wenn im selben Google-Projekt die
    // Cloud Vision API aktiviert und der Schluessel nicht eingeschraenkt ist).
    // Klappt beides nicht, laeuft der Scan ohne OCR weiter -- wie bisher.
    var visionKey = process.env.GOOGLE_VISION_API_KEY || geminiKey || '';

    try {
        var all = [];
        if (images.length > 1) {
            // Jede Seite/jedes Bild EINZELN scannen -> kein Abriss durch Token-Limit,
            // danach zusammenfuehren. So werden auch lange/mehrseitige Karten komplett erfasst.
            // OCR laeuft pro Seite, damit der Text zum jeweiligen Bild passt.
            var perImage = await Promise.all(images.map(async function (img) {
                var ocr = await ocrAll(visionKey, [img]);
                return runModel([img], '', ocrBlock(ocr)).catch(function () { return []; });
            }));
            perImage.forEach(function (list) { all = all.concat(list); });
        } else {
            var ocrOne = await ocrAll(visionKey, images);
            all = await runModel(images, text, ocrBlock(ocrOne));
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
