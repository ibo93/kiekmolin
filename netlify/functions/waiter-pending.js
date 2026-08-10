// Kiek mol in — offene Tischrufe abholen (fürs Dashboard).
//
// WARUM ES DIESE DATEI GIBT
// -------------------------
// waiter-call.js legt jeden Ruf in activity_log ab. Das Dashboard könnte
// dort direkt nachsehen -- aber nur mit dem öffentlichen Schlüssel, und ob
// der activity_log LESEN darf, hängt an den Zeilen-Regeln (RLS) in Supabase.
// Schreiben ist erlaubt, Lesen nicht unbedingt. Fällt das Lesen still auf
// eine leere Liste zurück, ist der Knopf beim Gast grün und im Restaurant
// passiert trotzdem nichts -- genau das Fehlerbild, das gemeldet wurde.
//
// Diese Function liest mit dem Dienstschlüssel. Der geht an den Zeilen-Regeln
// vorbei, also hängt der Alarm nicht mehr an einer Datenbank-Einstellung, die
// niemand sieht.
//
// Aufruf: GET /.netlify/functions/waiter-pending?restaurant=<uuid>&seit=<ISO>
// Antwort: { ok:true, rufe:[{ id, tisch, grund, zeit }] }
//
// Absichtlich sparsam: nur Tischnummer, Grund und Zeit. Keine Gastdaten, keine
// Bestellungen -- die Function ist öffentlich erreichbar. Mehr als "an Tisch 7
// wurde gerufen" ist hier nicht zu holen, und älter als 10 Minuten gibt es
// gar nichts.
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
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

// Älteres wird nie zurückgegeben: ein Ruf von vor einer Stunde ist erledigt,
// und ein Alarm dafür wäre nur noch Lärm.
var MAX_ALTER_MS = 10 * 60 * 1000;

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Nur GET' });
    if (!SUPABASE_KEY) return json(200, { ok: false, error: 'Server nicht eingerichtet' });

    var q = event.queryStringParameters || {};
    var rid = String(q.restaurant || '').trim();
    if (!/^[0-9a-f-]{20,}$/i.test(rid)) return json(400, { ok: false, error: 'restaurant fehlt' });

    var frueheste = new Date(Date.now() - MAX_ALTER_MS);
    var seit = frueheste;
    if (q.seit) {
        var d = new Date(String(q.seit));
        // Nur nach vorn verschieben -- ein weit zurückliegendes "seit" vom
        // Aufrufer darf das Fenster nicht aufreissen.
        if (!isNaN(d.getTime()) && d > frueheste) seit = d;
    }

    try {
        var url = SUPABASE_URL + '/rest/v1/activity_log'
            + '?activity_type=eq.waiter_call'
            + '&target_id=eq.' + encodeURIComponent(rid)
            + '&created_at=gt.' + encodeURIComponent(seit.toISOString())
            + '&select=id,metadata,created_at&order=created_at.asc&limit=20';
        var res = await fetch(url, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        if (!res.ok) {
            var txt = await res.text();
            return json(200, { ok: false, error: 'Datenbank ' + res.status + ': ' + txt.slice(0, 120) });
        }
        var rows = await res.json();
        if (!Array.isArray(rows)) rows = [];
        return json(200, {
            ok: true,
            rufe: rows.map(function (r) {
                var m = r.metadata || {};
                return {
                    id: r.id,
                    tisch: m.table || null,
                    grund: m.reason === 'pay' ? 'pay' : 'service',
                    zeit: r.created_at
                };
            })
        });
    } catch (e) {
        return json(200, { ok: false, error: e.message });
    }
};
