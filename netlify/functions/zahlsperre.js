// WENN EINE RECHNUNG OFFEN BLEIBT -- drei Stufen, von Hand.
//
// Ibo am 24.09.2026: "wenn Kunden nicht bezahlen, dass ich mit einem Knopf
// es schliesse, nur der Admin ... ich will es selber steuern".
//
//     keine     alles normal
//     hinweis   roter Balken im Dashboard, nur der Wirt sieht ihn
//     pause     der Gast kann nicht mehr bestellen; Reservierungen laufen
//               weiter, das Dashboard bleibt offen
//     aus       Bestellen und Reservieren zu
//
// VON HAND, NIE AUTOMATISCH. Eine Automatik, die nach 14 Tagen selbst
// abschaltet, sperrt irgendwann einen Kunden aus, der laengst ueberwiesen
// hat und bei dem nur die Buchung fehlte. Den verliert man dann.
//
// WER DARF: nur die Rolle 'superadmin' aus customers -- geprueft ueber
// die echte Supabase-Sitzung, nicht ueber ein Kennzeichen im Browser.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var KEY = process.env.SUPABASE_SERVICE_KEY || '';

var VERWALTER = require('./lib/verwalter');

var STUFEN = ['keine', 'hinweis', 'pause', 'aus'];

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf() { return { apikey: KEY, Authorization: 'Bearer ' + KEY }; }

// Die Pruefung, wer verwalten darf, steht seit dem 25.09.2026 in
// lib/verwalter.js -- abo-stand.js braucht sie genauso. Zwei Fassungen
// einer Sicherheitspruefung heissen: eine wird nachgebessert und die
// andere nicht.

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, fehler: 'Nur POST' });
    if (!KEY) return json(500, { ok: false, fehler: 'Server nicht eingerichtet (SUPABASE_SERVICE_KEY fehlt).' });

    var body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) {
        return json(400, { ok: false, fehler: 'Konnte die Anfrage nicht lesen.' });
    }

    if (!(await VERWALTER.darfVerwalten(event, KEY))) {
        return json(403, { ok: false, fehler: 'Nur der Verwalter darf das.' });
    }

    var aktion = (event.queryStringParameters || {}).action || body.action || 'setzen';

    // -------- Liste: welche Betriebe stehen gerade auf welcher Stufe? ----
    if (aktion === 'liste') {
        try {
            var l = await fetch(SUPABASE_URL + '/rest/v1/restaurants'
                + '?select=id,name,slug,zahlsperre,zahlsperre_seit,zahlsperre_notiz'
                + '&zahlsperre=neq.keine&order=zahlsperre_seit.desc', { headers: kopf() });
            if (!l.ok) return json(200, { ok: true, betriebe: [], hinweis: await spaltenHinweis(l) });
            return json(200, { ok: true, betriebe: await l.json() });
        } catch (e) {
            return json(200, { ok: true, betriebe: [], hinweis: 'nicht erreichbar' });
        }
    }

    // -------- Setzen -----------------------------------------------------
    var rid = String(body.restaurant_id || '');
    var stufe = String(body.stufe || '');
    if (!rid) return json(400, { ok: false, fehler: 'restaurant_id fehlt.' });
    if (STUFEN.indexOf(stufe) === -1) {
        return json(400, { ok: false, fehler: 'Unbekannte Stufe. Erlaubt: ' + STUFEN.join(', ') });
    }

    var feld = {
        zahlsperre: stufe,
        // Bei "keine" die Spuren mit wegraeumen -- sonst steht spaeter ein
        // Datum da, zu dem es keine Sperre mehr gibt, und jemand deutet es.
        zahlsperre_seit: stufe === 'keine' ? null : new Date().toISOString(),
        zahlsperre_notiz: stufe === 'keine' ? null : (String(body.notiz || '').slice(0, 300) || null)
    };

    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(rid)
            + '&select=id,name,zahlsperre', {
            method: 'PATCH',
            headers: Object.assign({}, kopf(), {
                'Content-Type': 'application/json',
                // return=representation: ein 204 kaeme auch dann, wenn die
                // Zeile gar nicht getroffen wurde. Bei einer Abschaltung ist
                // "vielleicht gesetzt" nicht gut genug.
                Prefer: 'return=representation'
            }),
            body: JSON.stringify(feld)
        });
        var text = await res.text();
        if (!res.ok) {
            var h = spaltenText(text);
            if (h) return json(500, { ok: false, fehler: h });
            console.error('zahlsperre: Supabase ' + res.status + ' - ' + text.slice(0, 200));
            return json(500, { ok: false, fehler: 'Konnte nicht gespeichert werden (' + res.status + ').' });
        }
        var zeilen = null;
        try { zeilen = JSON.parse(text); } catch (e) { zeilen = null; }
        if (!Array.isArray(zeilen) || zeilen.length === 0) {
            return json(500, { ok: false, fehler: 'Nicht gesetzt: diesen Betrieb gibt es nicht, '
                + 'oder die Datenbank hat die Änderung ohne Fehlermeldung verworfen.' });
        }
        return json(200, { ok: true, betrieb: zeilen[0], stufe: stufe });
    } catch (e) {
        console.error('zahlsperre: ' + (e && e.message));
        return json(500, { ok: false, fehler: 'Nicht erreichbar.' });
    }
};

function spaltenText(text) {
    if (/zahlsperre/i.test(text) && /(does not exist|schema cache)/i.test(text)) {
        return 'Die Spalte zahlsperre fehlt noch in der Datenbank (SQL 36).';
    }
    return '';
}
async function spaltenHinweis(res) {
    try { return spaltenText(await res.text()) || 'HTTP ' + res.status; }
    catch (e) { return 'HTTP ' + res.status; }
}

exports._STUFEN = STUFEN;
