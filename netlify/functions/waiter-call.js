// Kiek mol in — "Bedienung rufen" vom Tisch.
//
// Der Gast scannt den Tisch-QR (/<slug>?tisch=5) und tippt in der App auf
// "Bedienung rufen". Diese Function schickt einen Push an alle Geraete des
// Restaurants: "Tisch 5 ruft".
//
// Aufruf: POST /.netlify/functions/waiter-call
//   Body: { restaurant_id: "<uuid>", table: 5, reason: "service"|"pay" }
// Antwort: { ok:true, sent } | { ok:false, error }
//
// BEWUSST OHNE freien Text: Die Function ist oeffentlich erreichbar (der Gast
// ist ja nicht eingeloggt). Duerfte der Aufrufer Titel und Text bestimmen,
// koennte jeder mit der Restaurant-ID beliebige Meldungen auf die Geraete des
// Personals schicken. Deshalb baut der Server die Nachricht selbst; von aussen
// kommen nur Restaurant-ID, Tischnummer und ein fester Grund aus einer Liste.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

'use strict';

var webpush = require('web-push');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
var VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

function sbHeaders(extra) {
    return Object.assign({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {});
}

// Feste Gruende -- kein Freitext von aussen
var REASONS = {
    service: { title: 'Bedienung gerufen', verb: 'braucht kurz Hilfe' },
    pay:     { title: 'Gast möchte zahlen', verb: 'möchte zahlen' }
};

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST' });
    if (!SUPABASE_KEY) return json(200, { ok: false, error: 'Server nicht eingerichtet' });
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        return json(200, { ok: false, error: 'Push-Schlüssel fehlen – bitte im Restaurant kurz Bescheid geben.' });
    }

    var body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return json(400, { ok: false, error: 'Ungültiger Body' }); }

    var restaurantId = String(body.restaurant_id || '').trim();
    if (!/^[0-9a-f-]{20,}$/i.test(restaurantId)) return json(400, { ok: false, error: 'restaurant_id fehlt' });

    var table = parseInt(body.table, 10);
    if (!(table >= 1 && table <= 200)) return json(400, { ok: false, error: 'Tischnummer ungültig' });

    var reason = REASONS[String(body.reason || 'service')] || REASONS.service;

    // Restaurantname (nur fuer die Meldung; scheitert das, geht es ohne weiter)
    var restName = '';
    try {
        var rr = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(restaurantId) + '&select=name',
            { headers: sbHeaders() });
        if (rr.ok) { var rl = await rr.json(); if (rl[0]) restName = rl[0].name || ''; }
    } catch (e) {}

    // Geraete des Restaurants
    var subs = [];
    try {
        var sr = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?restaurant_id=eq.' +
            encodeURIComponent(restaurantId) + '&select=id,endpoint,p256dh_key,auth_key', { headers: sbHeaders() });
        if (!sr.ok) throw new Error('HTTP ' + sr.status);
        subs = await sr.json();
    } catch (e) {
        return json(200, { ok: false, error: 'Konnte das Personal nicht erreichen' });
    }
    if (!Array.isArray(subs) || !subs.length) {
        // Kein Geraet registriert -> ehrlich sagen, damit der Gast winkt statt zu warten
        return json(200, { ok: false, error: 'Gerade ist kein Gerät im Restaurant erreichbar – bitte kurz winken.' });
    }

    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
    catch (e) { return json(200, { ok: false, error: 'Push-Schlüssel ungültig' }); }

    var payload = JSON.stringify({
        title: reason.title,
        body: 'Tisch ' + table + ' ' + reason.verb + '.' + (restName ? ' (' + restName + ')' : ''),
        icon: '/kiek-logo.png',
        badge: '/kiek-logo.png',
        // Kein festes tag pro Tisch: zwei Rufe kurz hintereinander sollen sich
        // NICHT gegenseitig ueberschreiben, sonst uebersieht das Personal einen.
        tag: 'waiter-' + table + '-' + Date.now(),
        requireInteraction: true,
        data: { type: 'waiter_call', table: table, restaurantId: restaurantId, url: '/?dashboard=orders' }
    });

    var sent = 0;
    for (var i = 0; i < subs.length; i++) {
        var s = subs[i];
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } }, payload);
            sent++;
        } catch (err) {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                try {
                    await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + encodeURIComponent(s.id),
                        { method: 'DELETE', headers: sbHeaders({ 'Prefer': 'return=minimal' }) });
                } catch (e2) {}
            }
        }
    }

    if (!sent) return json(200, { ok: false, error: 'Das Personal konnte nicht erreicht werden – bitte kurz winken.' });
    return json(200, { ok: true, sent: sent });
};
