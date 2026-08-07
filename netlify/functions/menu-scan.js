// Kiek mol in — KI-Menuescanner (Vision).
// Liest Speisekarten-Bilder (oder Text) und gibt sauber kategorisierte Gerichte
// zurueck. Deutlich besser als reines OCR: erkennt Namen, Preise, Groessen,
// Beschreibungen und ordnet alles in passende Kategorien ein.
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Modell: ANTHROPIC_API_KEY -> Claude Sonnet 5.
// Hochaufloesende Bilderkennung bis 2576 px Kantenlaenge, liest also auch das
// Kleingedruckte einer Karte. Kostet pro Seite wenige Cent.
//
// BEWUSST OHNE zweiten Anbieter. Ein stiller Rueckfall auf ein schwaecheres
// Modell heisst, dass ein Scan mal gut und mal mittelmaessig ausfaellt, ohne
// dass jemand erkennen kann warum -- und man sucht den Fehler dann bei der
// Karte oder beim Foto. Ein klarer Fehler ist hier mehr wert als ein
// unauffaellig schlechteres Ergebnis: der Scan laesst sich wiederholen,
// eine halb falsche Speisekarte im System merkt niemand.
//
// Bei leerem Ergebnis wird derselbe Aufruf einmal wiederholt -- Vision-Modelle
// sind nicht deterministisch, ein zweiter Versuch rettet haeufig den Scan.
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
    '- category: DU ERFINDEST KEINE KATEGORIEN. Du liest die Ueberschriften der Karte ab.',
    '',
    '  SO FUNKTIONIERT EINE SPEISEKARTE: Eine Ueberschrift steht EINMAL und gilt dann fuer',
    '  ALLE Gerichte darunter, bis die naechste Ueberschrift kommt. Steht "Pizza" als',
    '  Ueberschrift und darunter zwoelf Pizzen, bekommen ALLE ZWOELF die Kategorie "Pizza" --',
    '  nicht nur die erste. Arbeite die Karte von oben nach unten durch und merke dir die',
    '  zuletzt gelesene Ueberschrift; jedes Gericht bekommt diese, bis eine neue auftaucht.',
    '',
    '  Schreibe die Ueberschrift Wort fuer Wort so, wie sie gedruckt ist. Steht "Vom Grill"',
    '  auf der Karte, ist die Kategorie "Vom Grill" und NICHT "Fleischgerichte". Steht',
    '  "Von de Waterkant" da, schreibst du "Von de Waterkant". Uebersetze nicht,',
    '  vereinheitliche nicht, verschoenere nicht. Nur die Gross-/Kleinschreibung darfst du',
    '  normalisieren ("VOM GRILL" -> "Vom Grill").',
    '',
    '  NUR EIN EINZIGER FALL ergibt einen leeren String "": wenn das Bild MITTEN in einem',
    '  Abschnitt beginnt und ueber dem ERSTEN Gericht des Bildes keine Ueberschrift steht,',
    '  weil sie auf der vorigen Seite oder oberhalb des Bildrands liegt. Dann bekommen die',
    '  Gerichte bis zur ersten sichtbaren Ueberschrift "" -- die App ergaenzt das aus der',
    '  vorigen Seite. Rate in diesem Fall NICHT, wie die Ueberschrift geheissen haben koennte.',
    '  Sobald eine Ueberschrift im Bild auftaucht, gilt wieder die Regel oben: sie gilt fuer',
    '  alles darunter. Gib NIEMALS "" zurueck, nur weil ein Gericht nicht unmittelbar unter',
    '  der Ueberschrift steht.',
    '',
    '- Gibt es unten eine Liste VORHANDENER KATEGORIEN und die Ueberschrift der Karte meint',
    '  offensichtlich dasselbe, nimm die vorhandene Schreibweise (Karte "Pizza", vorhanden',
    '  "Pizzen" -> "Pizzen"). Sonst bleibt die Ueberschrift der Karte stehen.',
    '- dish_number: Artikel-/Gerichtnummer falls vorhanden (z.B. "12" oder "12a"), sonst "".',
    '  Nummern stehen meist VOR dem Namen. Verwechsle Nummern nicht mit Preisen.',
    '- description: kurze Beschreibung/Zutaten von der Karte (auch kleingedruckte Zeilen unter dem Namen), sonst "".',
    '  Die Kennzeichnungen in Klammern wie "(1,2,a,c)" gehoeren NICHT in die Beschreibung --',
    '  die wertest du stattdessen aus (siehe ALLERGENE).',
    '',
    'ALLERGENE UND ZUSATZSTOFFE (deutsche Karten kennzeichnen das in Klammern):',
    '- BUCHSTABEN = Allergene nach LMIV. Uebersetze sie in genau diese Codes:',
    '  A=gluten B=krebstiere C=eier D=fisch E=erdnuss F=soja G=milch H=schalenfruechte',
    '  I=sellerie J=senf K=sesam L=sulfite M=lupinen N=weichtiere',
    '  Steht das Allergen ausgeschrieben da ("mit Milch", "enthaelt Nuesse"), nimm denselben Code.',
    '- ZAHLEN = Zusatzstoffe. Gib sie als Ziffern zurueck: "1", "2", "11" ...',
    '- allergens: Liste der Codes, z.B. ["gluten","milch"]. Nichts gekennzeichnet -> leere Liste.',
    '- additives: Liste der Ziffern, z.B. ["1","2"]. Nichts gekennzeichnet -> leere Liste.',
    '- Rate NICHT. Nur was auf der Karte gekennzeichnet ist. Dass Pizza Mehl enthaelt,',
    '  ist kein Grund fuer "gluten", wenn die Karte es nicht kennzeichnet.',
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

// Buchstaben-Kennzeichnung der Karte -> Codes, die die App kennt.
// Sicherheitsnetz: das Modell soll die Codes schon liefern, aber wenn doch
// "A, C" oder "milch" zurueckkommt, landet es trotzdem richtig.
var ALLERGEN_CODES = ['gluten','krebstiere','eier','fisch','erdnuss','soja','milch',
                      'schalenfruechte','sellerie','senf','sesam','sulfite','lupinen','weichtiere'];
var BUCHSTABE_ZU_CODE = { a:'gluten', b:'krebstiere', c:'eier', d:'fisch', e:'erdnuss',
                          f:'soja', g:'milch', h:'schalenfruechte', i:'sellerie', j:'senf',
                          k:'sesam', l:'sulfite', m:'lupinen', n:'weichtiere' };
// Haeufige Schreibweisen, die keine Codes sind
var WORT_ZU_CODE = { weizen:'gluten', getreide:'gluten', laktose:'milch', milchprodukte:'milch',
                     nuesse:'schalenfruechte', nuss:'schalenfruechte', 'nüsse':'schalenfruechte',
                     ei:'eier', schwefel:'sulfite', sulfit:'sulfite', erdnuesse:'erdnuss',
                     'erdnüsse':'erdnuss', sojabohnen:'soja', meeresfruechte:'weichtiere' };

function normAllergene(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (x) {
        var t = String(x || '').trim().toLowerCase().replace(/[().,;:]/g, '');
        if (!t) return;
        var code = null;
        if (ALLERGEN_CODES.indexOf(t) >= 0) code = t;
        else if (t.length === 1 && BUCHSTABE_ZU_CODE[t]) code = BUCHSTABE_ZU_CODE[t];
        else if (WORT_ZU_CODE[t]) code = WORT_ZU_CODE[t];
        if (code && out.indexOf(code) < 0) out.push(code);
    });
    return out.slice(0, 14);
}

// Zusatzstoffe sind reine Ziffern 1-13. Alles andere fliegt raus, damit keine
// Buchstaben-Allergene versehentlich als Zusatzstoff landen.
function normZusatzstoffe(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (x) {
        var t = String(x || '').replace(/[^0-9]/g, '');
        if (!t) return;
        var n = parseInt(t, 10);
        if (n >= 1 && n <= 13 && out.indexOf(String(n)) < 0) out.push(String(n));
    });
    return out.slice(0, 13);
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
            // Leer bleibt leer: "" heisst "auf diesem Bild war keine Ueberschrift
            // zu sehen". Die App fuellt das anschliessend aus der vorigen Seite
            // auf. Wuerden wir hier "Sonstiges" einsetzen, waere die Information
            // weg und genau die falsche Kategorie stuende fest.
            category: String(it.category || '').trim().slice(0, 60),
            dish_number: String(it.dish_number || it.dishNumber || '').trim().slice(0, 10),
            selected: true,
            is_vegetarian: !!it.is_vegetarian, is_vegan: !!it.is_vegan, is_spicy: !!it.is_spicy,
            is_beef: !!it.is_beef, is_chicken: !!it.is_chicken, is_pork: !!it.is_pork,
            is_fish: !!it.is_fish, is_seafood: !!it.is_seafood,
            is_gluten: !!it.is_gluten,
            allergens: normAllergene(it.allergens),
            additives: normZusatzstoffe(it.additives)
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
function buildPrompt(text, extra, kategorien) {
    var kat = '';
    if (Array.isArray(kategorien) && kategorien.length) {
        // Zeichengenau auflisten -- das Modell soll abschreiben, nicht uebersetzen.
        kat = '\n\nVORHANDENE KATEGORIEN DIESES RESTAURANTS (bitte genau so verwenden):\n' +
              kategorien.slice(0, 40).map(function (k) { return '- ' + String(k).slice(0, 60); }).join('\n') +
              '\nNur wenn ein Gericht in KEINE davon passt, eine neue Kategorie waehlen.';
    }
    return PROMPT + kat + (text ? ('\n\nSPEISEKARTE-TEXT:\n' + text) : '') + (extra || '');
}

// Festes Antwortschema fuer Claude.
// Ohne das wird Claude nur GEBETEN, JSON zu schreiben: reisst die Antwort ab
// oder rutscht ein Kommentar hinein, muss parseItemsLoose den Rest retten und
// die letzten Gerichte fehlen. Mit Schema ist gueltiges JSON garantiert.
// Alle Felder sind Pflicht -- fehlende Angaben kommen als "" bzw. false, das
// raeumt normalizeItems ohnehin auf.
var ANTHROPIC_SCHEMA = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    price: { type: 'number' },
                    category: { type: 'string' },
                    dish_number: { type: 'string' },
                    is_vegetarian: { type: 'boolean' },
                    is_vegan: { type: 'boolean' },
                    is_spicy: { type: 'boolean' },
                    is_beef: { type: 'boolean' },
                    is_chicken: { type: 'boolean' },
                    is_pork: { type: 'boolean' },
                    is_fish: { type: 'boolean' },
                    is_seafood: { type: 'boolean' },
                    allergens: { type: 'array', items: { type: 'string' } },
                    additives: { type: 'array', items: { type: 'string' } }
                },
                required: ['name', 'description', 'price', 'category', 'dish_number',
                           'is_vegetarian', 'is_vegan', 'is_spicy', 'is_beef',
                           'is_chicken', 'is_pork', 'is_fish', 'is_seafood',
                           'allergens', 'additives'],
                additionalProperties: false
            }
        }
    },
    required: ['items'],
    additionalProperties: false
};

async function callAnthropic(key, images, text, extra, ohneSchema, kategorien) {
    var content = [{ type: 'text', text: buildPrompt(text, extra, kategorien) }];
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
            // KEIN temperature: Claude Sonnet 5 lehnt temperature/top_p/top_k
            // mit HTTP 400 ab. Genau daran ist hier lange JEDER Aufruf
            // gescheitert, ohne dass es auffiel.
            //
            // Denkschritte aus: sie zaehlen gegen dieselben max_tokens wie die
            // Antwort. Bei einer langen Karte frisst das Nachdenken das Budget
            // auf und die Gerichteliste reisst mittendrin ab. Fuer stures
            // Abtippen einer Karte -- noch dazu mit OCR-Text daneben -- bringt
            // Nachdenken nichts und kostet nur Zeit und Tokens.
            thinking: { type: 'disabled' },
            messages: [{ role: 'user', content: content }],
            output_config: ohneSchema ? undefined : { format: { type: 'json_schema', schema: ANTHROPIC_SCHEMA } }
        })
    });
    if (!res.ok) {
        var t = await res.text();
        // Sollte das Schema aus irgendeinem Grund abgelehnt werden, lieber ohne
        // Schema weitermachen als den Scan verlieren -- vorher ging es ja auch.
        if (!ohneSchema && res.status === 400 && /output_config|json_schema|schema/i.test(t)) {
            console.warn('[menu-scan] Antwortschema abgelehnt, versuche ohne:', t.slice(0, 160));
            return callAnthropic(key, images, text, extra, true, kategorien);
        }
        throw new Error('Anthropic ' + res.status + ': ' + t.slice(0, 200));
    }
    var j = await res.json();
    return (j.content && j.content[0] && j.content[0].text) ? j.content[0].text : '';
}

;

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltiger JSON-Body' }); }
    var images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
    // Vorhandene Kategorien des Restaurants -- damit der Scanner sie benutzt,
    // statt daneben eigene anzulegen ("Pizza" neben "Pizzen").
    var kategorien = Array.isArray(body.categories)
        ? body.categories.filter(function (k) { return k && typeof k === 'string'; }).slice(0, 40)
        : [];
    var text = body.text ? String(body.text).slice(0, 20000) : '';
    if (!images.length && !text) return json(400, { ok: false, error: 'Kein Bild und kein Text uebergeben' });

    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
        return json(503, { ok: false, error: 'Menuescanner nicht eingerichtet: ANTHROPIC_API_KEY fehlt in Netlify.' });
    }

    var providers = [
        { name: 'Claude', call: function (i, t, x) { return callAnthropic(anthropicKey, i, t, x, false, kategorien); } }
    ];

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

    // OCR-Vorstufe. Eigener Schluessel bevorzugt.
    // Google Cloud Vision ist ein ANDERER Dienst als das Gemini-Modell, auch
    // wenn beide von Google sind -- deshalb steht der GEMINI_API_KEY hier noch
    // als zweite Chance, obwohl das Gemini-Modell aus dem Scanner raus ist:
    // er gehoert zu einem Google-Cloud-Projekt und funktioniert mit, falls in
    // dem Projekt die Cloud Vision API aktiviert ist.
    // Klappt beides nicht, laeuft der Scan ohne OCR weiter.
    var visionKey = process.env.GOOGLE_VISION_API_KEY || process.env.GEMINI_API_KEY || '';

    try {
        var _ocrZeichen = 0;
        var all = [];
        if (images.length > 1) {
            // Jede Seite/jedes Bild EINZELN scannen -> kein Abriss durch Token-Limit,
            // danach zusammenfuehren. So werden auch lange/mehrseitige Karten komplett erfasst.
            // OCR laeuft pro Seite, damit der Text zum jeweiligen Bild passt.
            var perImage = await Promise.all(images.map(async function (img) {
                var ocr = await ocrAll(visionKey, [img]);
                _ocrZeichen += ocr.length;
                return runModel([img], '', ocrBlock(ocr)).catch(function () { return []; });
            }));
            perImage.forEach(function (list) { all = all.concat(list); });
        } else {
            var ocrOne = await ocrAll(visionKey, images);
            _ocrZeichen += ocrOne.length;
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
        // meta: rein zur Fehlersuche. Ohne diese Angaben laesst sich hinterher
        // nicht sagen, ob die OCR lief, wie viele Rohtreffer es gab oder wie
        // viele Duplikate weggefallen sind -- und man raet wieder.
        return json(200, {
            ok: true, items: deduped, count: deduped.length,
            meta: {
                modell: ANTHROPIC_MODEL,
                bilder: images.length,
                roh: all.length,
                duplikate: all.length - deduped.length,
                ocr: _ocrZeichen > 0,
                ocrZeichen: _ocrZeichen,
                ohneKategorie: deduped.filter(function (x) { return !x.category; }).length
            }
        });
    } catch (e) {
        return json(502, { ok: false, error: e.message });
    }
};
