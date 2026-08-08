// Kiek mol in — Menuescanner, normaler Weg (10 Sekunden Zeitlimit).
//
// Der Kern -- Prompt, Parser, Modellaufruf -- liegt in lib/scan-kern.js und
// wird von menu-scan-background.js mitbenutzt. Zwei Codepfade mit eigenem
// Prompt waeren die schlechteste Loesung: sie laufen auseinander, und ein
// Fehler ist dann mal da und mal nicht.
//
// Diese Datei ist die Rueckfallebene. Der einfache Weg ohne Zeitlimit ist
// menu-scan-background.js; kann Netlify den nicht (aeltere Plaene: HTTP 404),
// nimmt die App diesen hier mit Abschnitten und Runden.

'use strict';

var K = require('./lib/scan-kern');
var ALLERGEN_CODES = K.ALLERGEN_CODES;
var ANTHROPIC_API = K.ANTHROPIC_API;
var ANTHROPIC_MODEL = K.ANTHROPIC_MODEL;
var BUCHSTABE_ZU_CODE = K.BUCHSTABE_ZU_CODE;
var CORS = K.CORS;
var MERKMAL = K.MERKMAL;
var PROMPT = K.PROMPT;
var STUFEN = K.STUFEN;
var WORT_ZU_CODE = K.WORT_ZU_CODE;
var abschnittBlock = K.abschnittBlock;
var baueBody = K.baueBody;
var baueContent = K.baueContent;
var buildPrompt = K.buildPrompt;
var buildPromptVoll = K.buildPromptVoll;
var callAnthropic = K.callAnthropic;
var json = K.json;
var lesePruefung = K.lesePruefung;
var leseStrom = K.leseStrom;
var normAllergene = K.normAllergene;
var normZusatzstoffe = K.normZusatzstoffe;
var normalizeItems = K.normalizeItems;
var ocrAll = K.ocrAll;
var ocrBlock = K.ocrBlock;
var ocrImage = K.ocrImage;
var parseAntwort = K.parseAntwort;
var parseItemsLoose = K.parseItemsLoose;
var parseZeilen = K.parseZeilen;
var preiseNachtragen = K.preiseNachtragen;
var pruefBlock = K.pruefBlock;
var splitDataUrl = K.splitDataUrl;
var stripToJson = K.stripToJson;
var ueberschriftenBlock = K.ueberschriftenBlock;
var weiterBlock = K.weiterBlock;
var zaehlBlock = K.zaehlBlock;
var zerlegeGroessen = K.zerlegeGroessen;

var BUDGET_MS = parseInt(process.env.MENU_SCAN_MS || '8500', 10);

exports.handler = async function (event) {
    var T0 = Date.now();
    var frist = T0 + BUDGET_MS;          // ab hier wird abgebrochen, nicht abgewartet

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltiger JSON-Body' }); }
    var images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
    var kategorien = Array.isArray(body.categories)
        ? body.categories.filter(function (k) { return k && typeof k === 'string'; }).slice(0, 40)
        : [];
    var text = body.text ? String(body.text).slice(0, 20000) : '';
    // Nur diesen einen Abschnitt lesen (fuer das gleichzeitige Lesen).
    var abschnitt = body.abschnitt ? String(body.abschnitt).slice(0, 60) : '';
    // Pruefmodus: die App schickt das bereits Gelesene zurueck und will wissen,
    // was daran nicht stimmt. Eigene Anfrage, eigenes Zeitbudget.
    var pruefen = Array.isArray(body.pruefen)
        ? body.pruefen.filter(function (z) { return z && typeof z === 'string'; }).slice(0, 300)
        : null;
    // Fortsetzung: die App sagt, wie weit sie schon ist.
    var weiter = null;
    if (body.weiter && body.weiter.anzahl) {
        weiter = {
            anzahl: Math.min(2000, parseInt(body.weiter.anzahl, 10) || 0),
            letzte: Array.isArray(body.weiter.letzte) ? body.weiter.letzte.slice(-8).map(String) : [],
            kategorie: String(body.weiter.kategorie || '').slice(0, 60)
        };
    }
    if (!images.length && !text) return json(400, { ok: false, error: 'Kein Bild und kein Text uebergeben' });

    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
        return json(503, { ok: false, error: 'Menuescanner nicht eingerichtet: ANTHROPIC_API_KEY fehlt in Netlify.' });
    }

    var visionKey = process.env.GOOGLE_VISION_API_KEY || process.env.GEMINI_API_KEY || '';

    // --- Nur zaehlen ---
    if (body.zaehlen && images.length) {
        try {
            var z = await callAnthropic(anthropicKey, images, '', zaehlBlock(body.zaehlen),
                                        kategorien, null, frist, true);
            var zahl = parseInt(String(z.roh || '').replace(/[^0-9]/g, '').slice(0, 4), 10);
            return json(200, { ok: true, anzahl: isFinite(zahl) ? zahl : null,
                               meta: { modell: ANTHROPIC_MODEL, ms: Date.now() - T0 } });
        } catch (e) {
            // Ohne Sollzahl laeuft alles wie bisher -- nur ohne die Absicherung.
            return json(200, { ok: true, anzahl: null, meta: { fehler: e.message, ms: Date.now() - T0 } });
        }
    }

    // --- Nur die Ueberschriften ---
    // Winzige Ausgabe, ein bis zwei Sekunden. Danach weiss die App, in wie viele
    // Abschnitte sie die Karte zerlegen und gleichzeitig lesen kann.
    if (body.ueberschriften && images.length) {
        try {
            var u = await callAnthropic(anthropicKey, images, '', ueberschriftenBlock(),
                                        kategorien, null, frist, true);
            var liste = String(u.roh || '').split('\n')
                .map(function (z) { return z.replace(/^[-*\d.)\s]+/, '').trim(); })
                .filter(function (z) { return z && z.length < 60; })
                .filter(function (z, i, a) { return a.indexOf(z) === i; })
                .slice(0, 30);
            return json(200, { ok: true, abschnitte: liste,
                               meta: { modell: ANTHROPIC_MODEL, ms: Date.now() - T0 } });
        } catch (e) {
            // Kein Grund, den Scan zu verlieren: ohne Abschnitte liest die App
            // die Seite wie bisher am Stueck.
            return json(200, { ok: true, abschnitte: [],
                               meta: { fehler: e.message, ms: Date.now() - T0 } });
        }
    }

    // --- Pruefdurchgang ---
    if (pruefen && pruefen.length && images.length) {
        try {
            var pr = await callAnthropic(anthropicKey, images, '', pruefBlock(pruefen),
                                      kategorien, null, frist, true);
            var erg = lesePruefung(pr.roh);
            return json(200, {
                ok: true, korrekturen: erg.korr, fehlend: erg.fehlt,
                meta: {
                    modell: ANTHROPIC_MODEL, ms: Date.now() - T0,
                    geprueft: pruefen.length, abgebrochen: !!pr.abgebrochen,
                    // "OK" heisst: das Modell hat nichts zu beanstanden.
                    sauber: /^\s*OK\s*$/i.test(String(pr.roh || '').trim())
                }
            });
        } catch (e) {
            // Eine gescheiterte Pruefung darf den Scan NICHT kippen -- das
            // Gelesene ist ja da. Die App behaelt es dann einfach ungeprueft.
            return json(200, { ok: true, korrekturen: [], fehlend: [], meta: { fehler: e.message, ms: Date.now() - T0 } });
        }
    }

    try {
        // OCR-Vorstufe nur in der ERSTEN Runde und nur, wenn dafuer noch reichlich
        // Budget da ist. In einer Fortsetzung waere sie verschenkte Zeit: das
        // Modell hat das Bild ohnehin im Zwischenspeicher.
        var ocr = '';
        if (!weiter && visionKey && (frist - Date.now()) > 5000) {
            ocr = await ocrAll(visionKey, images);
        }

        var zusatz = ocrBlock(ocr) + (abschnitt ? abschnittBlock(abschnitt) : '');
        var r = await callAnthropic(anthropicKey, images, text, zusatz, kategorien, weiter, frist);
        var alle = normalizeItems(parseAntwort(r.roh));

        // Ein einziger Wiederholversuch -- aber nur, wenn wirklich NICHTS kam und
        // noch genug Zeit ist. Frueher wurde hier IMMER ein zweites Mal gefragt;
        // das hat schlicht das Zeitbudget halbiert.
        if (!alle.length && !r.abgebrochen && (frist - Date.now()) > 4000) {
            console.warn('[menu-scan] 0 Gerichte, ein zweiter Versuch');
            r = await callAnthropic(anthropicKey, images, text, zusatz, kategorien, weiter, frist);
            alle = normalizeItems(parseAntwort(r.roh));
        }

        // Fehlende Preise nachschlagen, solange Zeit ist.
        var _nachgetragen = 0;
        var _ohnePreis = alle.filter(function (it) { return !it.price; });
        if (_ohnePreis.length) {
            _nachgetragen = await preiseNachtragen(anthropicKey, images, _ohnePreis, kategorien, frist);
        }

        // Duplikat-Schluessel.
        //
        // Er enthaelt die GERICHTNUMMER, und das ist kein Detail: auf der echten
        // Karte von Pronto Pronto stehen "114. Roma Spezial" (Haehnchen) und
        // "115. Roma Spezial" (Rind) -- gleicher Name, gleicher Preis, zwei
        // verschiedene Gerichte. Ohne die Nummer im Schluessel verschwindet eines
        // davon stillschweigend, und im Menue fehlt ein Gericht, das auf der
        // Karte steht.
        // Die Duplikate, gegen die dieser Schluessel wirklich hilft (dasselbe
        // Gericht aus zwei Runden oder zwei ueberlappenden Bildhaelften), tragen
        // dieselbe Nummer -- die werden weiterhin sauber zusammengefasst.
        // Kategorie bewusst NICHT im Schluessel: zwei Runden kategorisieren
        // dasselbe Gericht sonst leicht unterschiedlich und es erscheint doppelt.
        // Im Abschnittsmodus wird die Kategorie ERZWUNGEN, nicht erbeten.
        //
        // Der Prompt sagt es zwar, aber eine Bitte ist keine Garantie -- und
        // genau hier ist es schiefgegangen: 48 Pizzen kamen als
        // "Fleischgerichte" zurueck. Wenn die App sagt "lies den Abschnitt
        // Pizza", dann ist die Kategorie Pizza. Punkt.
        if (abschnitt) {
            alle.forEach(function (it) { it.category = abschnitt; });
        }

        var seen = {}, deduped = [];
        alle.forEach(function (it) {
            var k = (it.name + '|' + it.price + '|' + (it.dish_number || '')).toLowerCase().replace(/\s+/g, ' ');
            if (!seen[k]) { seen[k] = 1; deduped.push(it); }
        });

        // Ist die Karte an dieser Stelle zu Ende?
        // NUR wenn das Modell von selbst fertig geworden ist. Abgebrochen (Zeit)
        // oder am Token-Limit heisst: da kommt noch was, die App fragt weiter.
        var fertig = !r.abgebrochen && r.stopReason !== 'max_tokens';

        // Anker fuer die naechste Runde: die letzten Namen und die zuletzt
        // gueltige Ueberschrift. Ohne die faengt das Modell wieder oben an.
        var letzte = deduped.slice(-8).map(function (x) {
            return (x.dish_number ? x.dish_number + ' ' : '') + x.name + (x.price ? ' ' + x.price : '');
        });
        var letzteKategorie = '';
        for (var i = deduped.length - 1; i >= 0; i--) { if (deduped[i].category) { letzteKategorie = deduped[i].category; break; } }

        if (!deduped.length && !weiter && !abschnitt) {
            return json(502, {
                ok: false,
                error: r.abgebrochen ? 'Zeitlimit erreicht, bevor ein Gericht gelesen war' : 'Keine Gerichte erkannt',
                meta: { ms: Date.now() - T0, abgebrochen: !!r.abgebrochen, zeichen: (r.roh || '').length }
            });
        }

        return json(200, {
            ok: true,
            items: deduped,
            count: deduped.length,
            fertig: fertig,
            letzte: letzte,
            letzteKategorie: letzteKategorie,
            meta: {
                modell: ANTHROPIC_MODEL,
                stufe: r.stufe,
                ms: Date.now() - T0,
                budget: BUDGET_MS,
                abgebrochen: !!r.abgebrochen,
                stopReason: r.stopReason || '',
                fortsetzung: !!weiter,
                abschnitt: abschnitt,
                bilder: images.length,
                roh: alle.length,
                duplikate: alle.length - deduped.length,
                ocr: ocr.length > 0,
                ocrZeichen: ocr.length,
                ohneKategorie: deduped.filter(function (x) { return !x.category; }).length,
                ohnePreis: deduped.filter(function (x) { return !x.price; }).length,
                preiseNachgetragen: _nachgetragen
            }
        });
    } catch (e) {
        return json(502, { ok: false, error: e.message, kontingent: !!e.kontingent,
                           meta: { ms: Date.now() - T0 } });
    }
};
