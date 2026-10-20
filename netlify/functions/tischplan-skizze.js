// Kiek mol in — Tischplan aus einer Skizze (20.10.2026).
//
// Ibo: "wenn ich die Skizze der Plan einfüge, so passt sich der Tischplan 3D
// auch an das Lokal an". Der Wirt fotografiert seinen Grundriss (Handzeichnung
// oder Plan vom Architekten), Claude liest daraus Raum, feste Teile und Tische.
// Die App legt das Ergebnis über die Skizze -- der Wirt prüft und korrigiert,
// gespeichert wird erst mit "Fertig". Diese Funktion schreibt NICHTS in die
// Datenbank.
//
// WER DARF
// Nur wer das Lokal verwalten darf (Inhaber oder Superadmin), geprüft über
// die echte Supabase-Sitzung (lib/verwalter.js). Jeder Aufruf kostet Geld --
// ein offener Endpunkt wäre eine Einladung.
//
// WIE SIEHT ES AUS, WENN ES KAPUTT IST?
// Nie eine leere Antwort, die wie "nichts erkannt" aussieht: jeder Fehler kommt
// mit ok:false und einem Satz für den Wirt zurück, auch das Zeitlimit.
//
// ZEIT
// Netlify gibt einer normalen Funktion 10 Sekunden. Das Bild schickt die App
// verkleinert (höchstens 1600 px), Nachdenken ist aus, die Antwort klein
// (JSON, ein paar hundert Zeichen). TISCHPLAN_SKIZZE_MS übersteuert das Budget,
// falls das Limit in Netlify höher gesetzt ist.

'use strict';

var K = require('./lib/scan-kern');
var V = require('./lib/verwalter');

var BUDGET_MS = parseInt(process.env.TISCHPLAN_SKIZZE_MS || '9200', 10);
var MAX_BILD = 6 * 1024 * 1024;   // Zeichen im data:-URL (≈ 4,5 MB Bild)

// Was im Plan als festes Teil existiert (index.html, TEIL). Alles andere
// verwirft der Server, statt es der App unterzuschieben.
var TEILE = ['tuer', 'fenster', 'wand', 'theke', 'kueche', 'wc', 'pflanze', 'saeule', 'treppe', 'raumteiler',
    'kasse', 'kuehlung', 'buffet', 'barhocker', 'garderobe', 'bank', 'sofa', 'kamin', 'buehne', 'tv', 'spielecke',
    'lager', 'schirm', 'strandkorb', 'bankinsel', 'blumenkasten', 'thekenschrank', 'kuchenvitrine', 'fleischtheke'];

var PROMPT = [
    'Du siehst den Grundriss eines Restaurants: eine Handzeichnung oder einen Plan.',
    'Lies daraus den Gastraum so genau wie moeglich und antworte NUR mit einem JSON-Objekt, ohne Erklaerung:',
    '',
    '{',
    '  "breite": Meter (links-rechts im Bild),',
    '  "tiefe": Meter (oben-unten im Bild),',
    '  "massstab": true wenn eine Massangabe im Bild steht, sonst false (dann schaetzen: ein Tisch fuer 4 ist ca. 80 cm breit),',
    '  "form": "rechteck" oder "L",',
    '  "ecke": bei L die FEHLENDE Ecke: "ol" (oben links), "or", "ul", "ur",',
    '  "ausB": bei L Breite der fehlenden Ecke in Metern, "ausT": ihre Tiefe in Metern,',
    '  "teile": [ { "art": eines von ' + TEILE.join(', ') + ',',
    '              "x": Mitte in Prozent der Breite (0-100), "y": Mitte in Prozent der Tiefe (0-100),',
    '              "b": Laenge in Metern, "t": Tiefe in Metern, "dreh": 0 oder 90 } ],',
    '  "tische": [ { "form": "rund", "eckig" oder "lang", "plaetze": Zahl,',
    '               "x": Mitte in Prozent, "y": Mitte in Prozent, "dreh": 0 oder 90,',
    '               "laenge_cm": Zahl, "breite_cm": Zahl } ],',
    '  "rahmen": { "x0", "y0", "x1", "y1" }: wo der Raum (Aussenwaende) im Bild liegt, in Prozent der Bildbreite/-hoehe,',
    '  "unsicher": [ kurze deutsche Stichworte zu allem, was du nicht sicher erkennen konntest ]',
    '}',
    '',
    'Regeln:',
    '- Eingang = "tuer", Fenster = "fenster": beide liegen auf einer Aussenwand (x oder y nahe 0 oder 100).',
    '- Plaetze: gezeichnete Stuehle zaehlen; ohne Stuehle aus der Groesse schaetzen.',
    '- Ein Tisch, der als Zahl im Kreis/Kasten steht, ist trotzdem ein Tisch.',
    '- Lieber etwas in "unsicher" nennen als raten, ohne es zu sagen.',
    '- Ist das Bild kein Grundriss, antworte {"kein_plan": true}.'
].join('\n');

function zahl(v, min, max, std) {
    var n = parseFloat(v);
    if (!isFinite(n)) return std;
    return Math.max(min, Math.min(max, n));
}

// Antwort des Modells -> sauberes Raum-Objekt im Format von restaurants.tischplan_raum
// (datenbank/41-tischplan-raum.sql) plus eine Liste Tische. Exportiert für den Test.
function pruefen(roh) {
    var d = roh && typeof roh === 'object' ? roh : {};
    if (d.kein_plan) return { kein_plan: true };
    var breite = Math.round(zahl(d.breite, 3, 60, 12) * 2) / 2;
    var tiefe = Math.round(zahl(d.tiefe, 3, 60, 9) * 2) / 2;
    var raum = { breite: breite, tiefe: tiefe, form: d.form === 'L' ? 'L' : 'rechteck', teile: [] };
    if (raum.form === 'L') {
        raum.ecke = ['ol', 'or', 'ul', 'ur'].indexOf(d.ecke) >= 0 ? d.ecke : 'or';
        raum.ausB = Math.round(zahl(d.ausB, 1, breite - 1, breite * 0.4) * 2) / 2;
        raum.ausT = Math.round(zahl(d.ausT, 1, tiefe - 1, tiefe * 0.45) * 2) / 2;
    }
    (Array.isArray(d.teile) ? d.teile : []).slice(0, 40).forEach(function (t, i) {
        if (!t || TEILE.indexOf(t.art) < 0) return;
        raum.teile.push({ id: 's' + i, art: t.art, x: zahl(t.x, 0, 100, 50), y: zahl(t.y, 0, 100, 50),
            b: zahl(t.b, 0.1, 30, 1), t: zahl(t.t, 0.05, 30, 0.5), dreh: +t.dreh === 90 ? 90 : 0 });
    });
    var tische = [];
    (Array.isArray(d.tische) ? d.tische : []).slice(0, 80).forEach(function (t) {
        if (!t) return;
        var form = ['rund', 'eckig', 'lang'].indexOf(t.form) >= 0 ? t.form : 'eckig';
        tische.push({ form: form, plaetze: Math.round(zahl(t.plaetze, 1, 30, 4)),
            x: zahl(t.x, 0, 100, 50), y: zahl(t.y, 0, 100, 50), dreh: +t.dreh === 90 ? 90 : 0,
            laenge_cm: Math.round(zahl(t.laenge_cm, 40, 600, 0)) || null,
            breite_cm: Math.round(zahl(t.breite_cm, 40, 300, 0)) || null });
    });
    // Wo der Raum im Foto liegt -- damit die App die Skizze genau unter den Plan legt.
    var rahmen = null, q = d.rahmen;
    if (q && typeof q === 'object') {
        var x0 = zahl(q.x0, 0, 100, 0), y0 = zahl(q.y0, 0, 100, 0), x1 = zahl(q.x1, 0, 100, 100), y1 = zahl(q.y1, 0, 100, 100);
        if (x1 - x0 >= 10 && y1 - y0 >= 10) rahmen = { x0: x0, y0: y0, x1: x1, y1: y1 };
    }
    var unsicher = (Array.isArray(d.unsicher) ? d.unsicher : []).map(function (x) { return String(x).slice(0, 60); }).filter(Boolean).slice(0, 8);
    return { raum: raum, tische: tische, massstab: d.massstab === true, rahmen: rahmen, unsicher: unsicher };
}

async function fragen(key, bild, frist, mitEinstellungen) {
    var p = K.splitDataUrl(bild);
    var body = {
        model: K.ANTHROPIC_MODEL, max_tokens: 3000,
        messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: p.media, data: p.data } },
            { type: 'text', text: PROMPT }
        ] }]
    };
    // Wie beim Menüscanner: Nachdenken aus, wenig Aufwand -- sonst reicht die
    // Zeit nicht. Lehnt das Modell die Einstellung ab (400), ohne sie nochmal.
    if (mitEinstellungen) { body.thinking = { type: 'disabled' }; body.output_config = { effort: 'low' }; }
    var ac = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, Math.max(500, frist - Date.now()));
    try {
        var res = await fetch(K.ANTHROPIC_API, {
            method: 'POST', signal: ac.signal,
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });
        var text = await res.text();
        return { status: res.status, text: text };
    } catch (e) {
        if (ac.signal.aborted) return { status: 0, zeit: true };
        throw e;
    } finally { clearTimeout(timer); }
}

exports.pruefen = pruefen;
exports.PROMPT = PROMPT;

exports.handler = async function (event) {
    var frist = Date.now() + BUDGET_MS;
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Object.assign({}, K.CORS, { 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }), body: '' };
    if (event.httpMethod !== 'POST') return K.json(405, { ok: false, fehler: 'Nur POST.' });

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return K.json(400, { ok: false, fehler: 'Anfrage nicht lesbar.' }); }
    var bild = String(body.bild || '');
    if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(bild)) return K.json(400, { ok: false, fehler: 'Bitte ein Foto oder Bild der Skizze wählen (JPG oder PNG).' });
    if (bild.length > MAX_BILD) return K.json(413, { ok: false, fehler: 'Das Bild ist zu groß.' });

    if (!(await V.darfLokal(event, body.restaurant_id))) return K.json(403, { ok: false, fehler: 'Keine Berechtigung für dieses Lokal. Bitte neu anmelden.' });

    var key = process.env.ANTHROPIC_API_KEY;
    if (!key) return K.json(500, { ok: false, fehler: 'Die Skizzen-Erkennung ist auf dem Server nicht eingerichtet (ANTHROPIC_API_KEY fehlt).' });

    try {
        var a = await fragen(key, bild, frist, true);
        if (a.status === 400 && !a.zeit) a = await fragen(key, bild, frist, false);
        if (a.zeit) return K.json(504, { ok: false, fehler: 'Das Lesen hat zu lange gedauert. Bitte ein schärferes oder kleineres Foto versuchen.' });
        if (a.status === 429 || a.status === 529) return K.json(503, { ok: false, fehler: 'Die Erkennung ist gerade ausgelastet. Bitte in einer Minute nochmal.' });
        if (a.status < 200 || a.status >= 300) {
            console.warn('[tischplan-skizze] Anthropic ' + a.status + ': ' + String(a.text || '').slice(0, 300));
            return K.json(502, { ok: false, fehler: 'Die Skizze konnte nicht gelesen werden (Fehler ' + a.status + ').' });
        }
        var antwort = JSON.parse(a.text);
        var roh = ((antwort.content || []).filter(function (c) { return c.type === 'text'; })[0] || {}).text || '';
        var daten;
        try { daten = JSON.parse(K.stripToJson(roh)); } catch (e) {
            console.warn('[tischplan-skizze] keine JSON-Antwort: ' + roh.slice(0, 300));
            return K.json(502, { ok: false, fehler: 'Die Skizze konnte nicht gelesen werden. Bitte ein deutlicheres Foto versuchen.' });
        }
        var erg = pruefen(daten);
        if (erg.kein_plan) return K.json(422, { ok: false, fehler: 'Auf dem Bild ist kein Grundriss zu erkennen.' });
        return K.json(200, Object.assign({ ok: true }, erg));
    } catch (e) {
        console.warn('[tischplan-skizze] ' + (e && e.message));
        return K.json(502, { ok: false, fehler: 'Die Skizze konnte nicht gelesen werden: ' + String(e && e.message || e).slice(0, 120) });
    }
};
