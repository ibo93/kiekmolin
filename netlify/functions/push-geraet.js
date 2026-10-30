// Kiek mol in -- ein Handy fuer Benachrichtigungen anmelden, MIT Lokal.
//
// GEMESSEN AM 27.10.2026: jede Abfrage "Geraete dieses Lokals" kam leer
// zurueck ([] = 2 Bytes), obwohl sich Handys anmeldeten (16:06, iPhone,
// 200). Der Grund steht im Protokoll derselben Anmeldung:
//     request.sb.jwt.authorization.payload.role = anon
// Die App schickte die Zeile mit dem OEFFENTLICHEN Schluessel, nicht mit
// der Sitzung des Wirts. Der Ausloeser kmi_push_schuetzen (datenbank/15)
// sieht dann niemanden und setzt -- richtig so -- restaurant_id und
// customer_email auf NULL. Das Handy stand namenlos in der Liste, kein
// Melder fand es. Keine Fehlermeldung, nirgends.
//
// Und mit der Sitzung allein ginge es auch nicht: ein Handy, das schon
// einmal (namenlos) eingetragen ist, muesste GEAENDERT werden -- das darf
// laut Regel nur der Superadmin.
//
// Deshalb hier, auf dem Server: Sitzung pruefen (lib/verwalter.js), das
// Lokal nur eintragen, wenn der Angemeldete wirklich dazugehoert, die
// E-Mail aus der Sitzung nehmen -- nie aus dem Browser.
//
// POST { geraet: PushSubscription.toJSON(), r?: restaurant_id, telefon?, angebote? }
//   -> { ok, lokal: bool }
//
// tests/push-geraet-test.js.
'use strict';

var VERWALTER = require('./lib/verwalter');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

async function sitzungsMail(event) {
    var tok = VERWALTER.token(event);
    if (!tok) return '';
    try {
        var u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + tok } });
        if (!u.ok) return '';
        var n = await u.json();
        return n && n.email ? String(n.email).trim().toLowerCase() : '';
    } catch (e) { return ''; }
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST' });
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var b; try { b = JSON.parse(event.body || '{}'); } catch (e) { b = {}; }
    var g = b.geraet || {}, keys = g.keys || {};
    if (!/^https:\/\//.test(String(g.endpoint || '')) || !keys.p256dh || !keys.auth) return json(400, { ok: false, error: 'Gerät unvollständig' });

    var mail = await sitzungsMail(event);
    if (!mail) return json(401, { ok: false, error: 'Nicht angemeldet' });

    var rid = String(b.r || '');
    var lokal = !!rid && await VERWALTER.darfLokal(event, rid, SUPABASE_KEY);

    var zeile = {
        endpoint: String(g.endpoint),
        p256dh_key: String(keys.p256dh),
        auth_key: String(keys.auth),
        customer_email: mail,
        user_agent: String((event.headers || {})['user-agent'] || '').slice(0, 300) || null
    };
    // Nur setzen, was feststeht: ein fremdes Lokal wird NICHT eingetragen,
    // ein vorhandenes aber auch nicht geloescht.
    if (lokal) zeile.restaurant_id = rid;
    if (b.telefon) zeile.customer_phone = String(b.telefon).slice(0, 40);
    if (typeof b.angebote === 'boolean') { zeile.angebote = b.angebote; zeile.angebote_at = b.angebote ? new Date().toISOString() : null; }

    try {
        var h = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json',
                  Prefer: 'resolution=merge-duplicates,return=representation' };
        var r = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: h, body: JSON.stringify(zeile) });
        if (!r.ok && r.status === 400 && 'angebote' in zeile) {
            // Spalte angebote fehlt (datenbank/43 nicht eingespielt) -- ohne nochmal.
            delete zeile.angebote; delete zeile.angebote_at;
            r = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: h, body: JSON.stringify(zeile) });
        }
        if (!r.ok) return json(502, { ok: false, error: 'Nicht gespeichert (' + r.status + ': ' + (await r.text()).slice(0, 120) + ')' });
        var z = (await r.json()) || [];
        if (!z.length) return json(502, { ok: false, error: 'Nicht gespeichert (leere Antwort)' });
        console.log('[push-geraet] gespeichert' + (lokal ? ' fuer Lokal ' + rid.slice(0, 8) : (rid ? ' -- Lokal ' + rid.slice(0, 8) + ' NICHT erlaubt' : ' ohne Lokal')));
        return json(200, { ok: true, lokal: lokal, lokalVerweigert: !!rid && !lokal });
    } catch (e) {
        console.error('[push-geraet] ' + e.message);
        return json(502, { ok: false, error: e.message });
    }
};
