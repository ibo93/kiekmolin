// Kiek mol in — welche Zeiten und Tische sind an einem Tag noch frei?
//
// WOFUER
// ------
// Der Gast waehlt Datum und Uhrzeit. Damit die App freie von belegten
// Zeiten unterscheiden kann, muss sie wissen, was an dem Tag schon
// gebucht ist. Bisher las sie dafuer direkt in reservations:
//
//     reservations?restaurant_id=eq.<...>&reservation_date=eq.<...>
//                 &select=reservation_time,party_size,status,table_id
//
// Personenbezogen war das schon vorher nicht -- Name und Telefon standen
// nicht in der Auswahl. Aber es setzte voraus, dass reservations fuer
// jeden lesbar ist, und wer die Adresse selbst zusammenbaut, haette
// einfach select=* schreiben koennen. Genau das soll aufhoeren.
//
// Hier kommt nur die Belegung heraus: Uhrzeit, Personenzahl, Status,
// Tisch. Kein Name, kein Telefon, keine Notiz, keine Kennung.
//
// Aufruf:  GET /.netlify/functions/res-availability?r=<restaurant-uuid>&d=2026-08-19
// Antwort: { ok:true, belegung:[ {reservation_time, party_size, status, table_id}, ... ] }
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    // Kurz, aber nicht null: waehrend der Gast Uhrzeiten durchklickt,
    // fragt die App mehrfach nach demselben Tag. Dreissig Sekunden sind
    // kurz genug, dass eine frische Reservierung sofort auffaellt.
    'Cache-Control': 'public, max-age=30'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

var UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
var DATUM = /^\d{4}-\d{2}-\d{2}$/;

// Genau die vier Felder, die die Auswahl braucht. Einzeln aufgezaehlt,
// damit eine neue Spalte in reservations nicht eines Tages still
// mitfaehrt.
var FELDER = 'reservation_time,party_size,status,table_id';

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Nur GET' });

    // Ohne Schluessel KEINE leere Belegung zurueckgeben. Eine leere Liste
    // heisst fuer die App "alles frei" -- der Gast wuerde auf einen
    // besetzten Tisch gebucht und stuende vor vollem Haus.
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var q = event.queryStringParameters || {};
    var rid = (q.r || '').trim();
    var datum = (q.d || '').trim();
    if (!UUID.test(rid)) return json(400, { ok: false, error: 'Keine gueltige Betriebskennung' });
    if (!DATUM.test(datum)) return json(400, { ok: false, error: 'Kein gueltiges Datum' });

    try {
        // Storniertes zaehlt nicht als belegt. Alles andere -- bestaetigt,
        // angefragt, gesperrt -- schon; welche Status die Anzeige am Ende
        // beruecksichtigt, entscheidet sie selbst.
        var url = SUPABASE_URL + '/rest/v1/reservations'
            + '?select=' + FELDER
            + '&restaurant_id=eq.' + encodeURIComponent(rid)
            + '&reservation_date=eq.' + encodeURIComponent(datum)
            + '&status=neq.cancelled';
        var res = await fetch(url, {
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
        var reihen = await res.json();
        if (!Array.isArray(reihen)) return json(502, { ok: false, error: 'Unerwartete Antwort' });
        return json(200, { ok: true, belegung: reihen });
    } catch (e) {
        return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
    }
};
