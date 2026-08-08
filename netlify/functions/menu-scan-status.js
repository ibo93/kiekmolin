// Kiek mol in — Stand eines laufenden Scans abfragen.
//
// Gehoert zu menu-scan-background.js: die legt ihr Ergebnis unter einer
// Auftragsnummer ab, weil sie dem Browser nicht mehr antworten kann (der hat
// laengst ein 202 bekommen und die Verbindung ist zu). Die App fragt hier alle
// zwei Sekunden nach.
//
// Antwort:
//   { ok:true, status:'laeuft' }                      -- noch am Arbeiten
//   { ok:true, status:'fertig', items:[...], meta }   -- fertig
//   { ok:true, status:'fehler', fehler:'...' }        -- schiefgegangen
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    // Niemals zwischenspeichern: die Antwort aendert sich ja gerade.
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

    var job = (event.queryStringParameters && event.queryStringParameters.job) || '';
    job = String(job).slice(0, 80);
    if (!job) return json(400, { ok: false, error: 'job fehlt' });
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'SUPABASE_SERVICE_KEY fehlt in Netlify.' });

    try {
        var url = SUPABASE_URL + '/rest/v1/activity_log'
            + '?activity_type=eq.menu_scan_job'
            + '&target_name=eq.' + encodeURIComponent(job)
            + '&select=metadata,created_at&order=created_at.desc&limit=1';
        var res = await fetch(url, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        if (!res.ok) {
            var t = await res.text();
            return json(502, { ok: false, error: 'Datenbank ' + res.status + ': ' + t.slice(0, 160) });
        }
        var rows = await res.json();
        // Noch kein Eintrag = die Function arbeitet noch. Das ist der
        // Normalfall waehrend des Scans, kein Fehler.
        if (!Array.isArray(rows) || !rows.length) return json(200, { ok: true, status: 'laeuft' });

        var m = rows[0].metadata || {};
        if (m.status === 'fertig') {
            return json(200, {
                ok: true, status: 'fertig',
                items: Array.isArray(m.items) ? m.items : [],
                meta: { anzahl: m.anzahl, ms: m.ms, seiten: m.seiten, modell: m.modell,
                        teilweise: !!m.teilweise, fehler: m.fehler || null }
            });
        }
        return json(200, { ok: true, status: 'fehler', fehler: m.fehler || 'unbekannt',
                           meta: { ms: m.ms } });
    } catch (e) {
        return json(502, { ok: false, error: e.message });
    }
};
