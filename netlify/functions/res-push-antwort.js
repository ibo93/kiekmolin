// Kiek mol in -- "Annehmen" / "Ablehnen" aus der Benachrichtigung.
//
// Ibo, 14.10.2026: Wirte nehmen am Ruhetag Reservierungen von zu Hause an,
// "aber es geht nicht so 100%". Jetzt traegt die Push des Melders
// (pending-reminder.js) zwei Knoepfe. Der Service Worker (sw.js) schickt
// den Knopfdruck hierher -- ohne Anmeldung, aber mit einem Schluessel, der
// nur fuer diese eine Reservierung gilt (lib/push-antwort.js).
//
// Was passiert, ist dasselbe wie im Dashboard (updateReservationStatus):
//   annehmen -> status 'confirmed' + Bestaetigungs-Mail an den Gast
//   ablehnen -> status 'cancelled' + Absage-Mail an den Gast
// Nur wenn die Reservierung noch OFFEN ist (pending). Hat jemand sie
// inzwischen im Dashboard bearbeitet, bleibt sie, wie sie ist, und die
// Antwort sagt, wie sie steht -- zwei Handys duerfen sich nicht
// gegenseitig ueberschreiben.
//
// Aufruf:  POST { id, r, exp, t, aktion: 'annehmen' | 'ablehnen' }
// Antwort: { ok:true, status, gast, wann }              -- erledigt
//          { ok:true, schon:'confirmed', gast, wann }    -- war schon bearbeitet
//          { ok:false, error }                           -- Schluessel falsch/abgelaufen
//
// tests/push-antwort-test.js.
'use strict';

var PA = require('./lib/push-antwort');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf(extra) {
    return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {});
}
function wann(r) {
    var d = String(r.reservation_date || '');
    try {
        var x = new Date(d + 'T12:00:00');
        if (!isNaN(x.getTime())) d = x.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
    } catch (e) {}
    var z = String(r.reservation_time || '').slice(0, 5);
    return d + (z ? ' ' + z : '') + (r.party_size ? ', ' + r.party_size + ' Pers.' : '');
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST' });
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var b;
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltiges JSON' }); }
    var aktion = b.aktion === 'annehmen' ? 'confirmed' : b.aktion === 'ablehnen' ? 'cancelled' : null;
    if (!aktion) return json(400, { ok: false, error: 'aktion muss annehmen oder ablehnen sein' });
    if (!PA.pruefen(b, SUPABASE_KEY)) {
        console.warn('[push-antwort] Schluessel abgelehnt fuer ' + String(b.id || '').slice(0, 8));
        return json(403, { ok: false, error: 'Link abgelaufen oder ungueltig -- bitte im Dashboard bestaetigen' });
    }

    try {
        // Nur aus "offen" heraus -- in EINEM Schritt, damit zwei Handys
        // nicht beide gewinnen.
        var upd = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(b.id)
            + '&restaurant_id=eq.' + encodeURIComponent(b.r) + '&status=eq.pending'
            + '&select=id,status,guest_name,reservation_date,reservation_time,party_size', {
            method: 'PATCH',
            headers: kopf({ Prefer: 'return=representation' }),
            body: JSON.stringify({ status: aktion })
        });
        if (!upd.ok) throw new Error('HTTP ' + upd.status);
        var zeilen = await upd.json();

        if (!Array.isArray(zeilen) || !zeilen.length) {
            var jetzt = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(b.id)
                + '&restaurant_id=eq.' + encodeURIComponent(b.r)
                + '&select=status,guest_name,reservation_date,reservation_time,party_size', { headers: kopf() });
            var stand = jetzt.ok ? ((await jetzt.json()) || [])[0] : null;
            if (!stand) return json(404, { ok: false, error: 'Reservierung nicht gefunden' });
            return json(200, { ok: true, schon: stand.status, gast: stand.guest_name || '', wann: wann(stand) });
        }

        var r = zeilen[0];
        console.log('[push-antwort] ' + String(b.id).slice(0, 8) + ' -> ' + aktion);

        // Mail an den Gast -- derselbe Weg wie aus dem Dashboard. Scheitert
        // sie, bleibt der Status trotzdem gesetzt (der Wirt hat entschieden).
        try {
            var mail = require('./order-email');
            await mail.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ reservation_id: b.id, event: aktion }) });
        } catch (e) {
            console.warn('[push-antwort] Gast-Mail nicht gesendet: ' + e.message);
        }

        return json(200, { ok: true, status: aktion, gast: r.guest_name || '', wann: wann(r) });
    } catch (e) {
        console.error('[push-antwort] ' + e.message);
        return json(502, { ok: false, error: 'Nicht gespeichert -- bitte im Dashboard bestaetigen' });
    }
};
