// Kiek mol in -- Meldungen der Lokale auch auf das Handy des Betreibers.
//
// Ibo, 27.10.2026: "ich will selber alles auch kontrollieren der wirt ist
// selber oft vergesslich" -- und: "es hat nie geklappt".
//
// Die Meldungen selbst schickt pending-reminder.js -- IMMER, ohne
// Schalter ("ich will kein schalter ich will das ich benachrichtigungen
// bekomme"). Hier nur der Beweis, dass sein Handy sie auch bekommt:
//
// GET                 -> { ok, geraete }
// POST { test: true } -> { ok, gesendet, von }   (Test an SEINE Geraete)
//
// "0 Geraete" ist die wahrscheinlichste Antwort und sagt genau, was
// fehlt: das Handy hat sich als Admin nie fuer Push angemeldet.
//
// Nur fuer den Superadmin (lib/verwalter.js). tests/admin-meldungen-test.js.
'use strict';

var webpush = require('web-push');
var VERWALTER = require('./lib/verwalter');
var WIRT = require('./lib/wirt-geraete');
var ADMIN = require('./lib/admin-geraete');

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

async function seineGeraete() {
    return ADMIN.geraete(SUPABASE_URL, SUPABASE_KEY, await WIRT.adminMails(SUPABASE_URL, SUPABASE_KEY));
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur GET/POST' });
    if (!(await VERWALTER.darfVerwalten(event, SUPABASE_KEY))) return json(403, { ok: false, error: 'Nur für den Verwalter' });

    try {
        if (event.httpMethod === 'GET') {
            return json(200, { ok: true, geraete: (await seineGeraete()).length });
        }
        var b; try { b = JSON.parse(event.body || '{}'); } catch (e) { b = {}; }

        if (b.test !== true) return json(400, { ok: false, error: 'test fehlt' });

        var liste = await seineGeraete();
        if (!liste.length) return json(200, { ok: false, gesendet: 0, von: 0, error: 'Auf keinem Gerät angemeldet' });
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json(200, { ok: false, gesendet: 0, von: liste.length, error: 'Push-Schlüssel fehlen auf dem Server' });
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
        var nutzlast = JSON.stringify({
            title: '🔔 Test für dich',
            body: 'Angekommen. So kommen neue Reservierungen und Bestellungen aller Lokale bei dir an.',
            icon: '/kiek-logo.png', badge: '/kiek-logo.png', tag: 'kmi-admin-test',
            data: { type: 'test', url: '/?adminTab=reservations' }
        });
        var gut = 0;
        for (var g of liste) {
            try {
                await webpush.sendNotification({ endpoint: g.endpoint, keys: { p256dh: g.p256dh_key, auth: g.auth_key } }, nutzlast);
                gut++;
            } catch (err) {
                if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                    try {
                        await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + g.id,
                            { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
                    } catch (e) {}
                }
            }
        }
        console.log('[admin-meldungen] Test: ' + gut + '/' + liste.length);
        return json(200, { ok: gut > 0, gesendet: gut, von: liste.length, error: gut ? null : 'Kein Gerät hat angenommen (abgelaufen?)' });
    } catch (e) {
        console.error('[admin-meldungen] ' + e.message);
        return json(502, { ok: false, error: e.message });
    }
};
