// Kiek mol in -- Kommen die Benachrichtigungen an? Und: Test senden.
//
// Gemessen am 14.10.2026: der Melder (pending-reminder) lief 29.968 Mal mit
// Fehler, sieben Tage lang, und niemand hat es gesehen -- weil es nirgends
// stand. Ein Wirt sah nur: keine Push. Das sieht genauso aus wie "keine
// Reservierung" (CLAUDE.md Regel 6: stille Ausfaelle).
//
// Jetzt steht im Dashboard: "aktiv auf 2 Geraeten · letzte Meldung 18:42"
// und ein Knopf "Test senden".
//
// GET  ?r=<restaurant>        -> { ok, geraete, letzte, vapid }
// POST { r, test:true }       -> { ok, gesendet, von }
//
// Nur fuer den Inhaber des Hauses oder den Superadmin (lib/verwalter.js
// darfLokal). Gezaehlt und angepingt werden nur die WIRTE-Geraete -- das
// Handy des Betreibers ist nie dabei (lib/wirt-geraete.js).
//
// tests/push-antwort-test.js.
'use strict';

var webpush = require('web-push');
var VERWALTER = require('./lib/verwalter');
var WIRT = require('./lib/wirt-geraete');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
var VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf() { return { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }; }

async function geraete(rid) {
    var r = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?restaurant_id=eq.' + encodeURIComponent(rid)
        + '&select=id,endpoint,p256dh_key,auth_key,customer_email', { headers: kopf() });
    if (!r.ok) throw new Error('Geraete nicht lesbar (' + r.status + ')');
    return WIRT.nurWirte(await r.json(), await WIRT.adminMails(SUPABASE_URL, SUPABASE_KEY));
}

async function letzteMeldung(rid) {
    var spaet = null;
    for (var t of ['reservations', 'orders']) {
        try {
            var r = await fetch(SUPABASE_URL + '/rest/v1/' + t + '?restaurant_id=eq.' + encodeURIComponent(rid)
                + '&push_sent_at=not.is.null&order=push_sent_at.desc&limit=1&select=push_sent_at', { headers: kopf() });
            if (!r.ok) continue;
            var z = ((await r.json()) || [])[0];
            if (z && z.push_sent_at && (!spaet || z.push_sent_at > spaet)) spaet = z.push_sent_at;
        } catch (e) {}
    }
    return spaet;
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var rid, test = false;
    if (event.httpMethod === 'GET') {
        rid = String((event.queryStringParameters || {}).r || '');
    } else if (event.httpMethod === 'POST') {
        var b; try { b = JSON.parse(event.body || '{}'); } catch (e) { b = {}; }
        rid = String(b.r || ''); test = b.test === true;
    } else {
        return json(405, { ok: false, error: 'Nur GET/POST' });
    }
    if (!(await VERWALTER.darfLokal(event, rid, SUPABASE_KEY))) return json(403, { ok: false, error: 'Kein Zugriff auf dieses Lokal' });

    try {
        var liste = await geraete(rid);
        if (!test) {
            return json(200, { ok: true, geraete: liste.length, letzte: await letzteMeldung(rid), vapid: !!(VAPID_PUBLIC && VAPID_PRIVATE) });
        }
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json(200, { ok: false, error: 'Push-Schluessel fehlen auf dem Server', gesendet: 0, von: liste.length });
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
        var nutzlast = JSON.stringify({
            title: '🔔 Test von Kiek mol in',
            body: 'Benachrichtigungen funktionieren. So kommt jede neue Reservierung an.',
            icon: '/kiek-logo.png', badge: '/kiek-logo.png', tag: 'kmi-test',
            data: { type: 'test', url: '/?adminTab=reservations' }
        });
        var gut = 0;
        for (var g of liste) {
            try {
                await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh_key, auth: g.auth_key } }, nutzlast);
                gut++;
            } catch (err) {
                // Abgelaufene Geraete gleich wegraeumen -- sonst zaehlt die
                // Anzeige Geraete, die nie wieder etwas bekommen.
                if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                    try { await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + g.id, { method: 'DELETE', headers: kopf() }); } catch (e) {}
                }
            }
        }
        console.log('[push-status] Test ' + rid.slice(0, 8) + ': ' + gut + '/' + liste.length);
        return json(200, { ok: gut > 0, gesendet: gut, von: liste.length });
    } catch (e) {
        console.error('[push-status] ' + e.message);
        return json(502, { ok: false, error: e.message });
    }
};
