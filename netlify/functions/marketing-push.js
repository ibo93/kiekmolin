// Kiek mol in — Marketing-Push: "Angebot an alle Gaeste senden".
//
// Der Gastronom schreibt im Marketing-Bereich Titel + Text; diese Function
// schickt den Push an ALLE Push-Abonnenten, die schon einmal bei diesem
// Restaurant bestellt haben (Match: orders.customer_phone -> push_subscriptions).
//
// Schutz gegen Nerv-Faktor:
//   - nur 9-21 Uhr deutscher Zeit
//   - max. 1 Kampagne pro Restaurant alle 3 Tage (Marker im features-Array:
//     "last_push_campaign:YYYY-MM-DD" -- keine DB-Aenderung noetig)
//   - nur mit gueltigem Supabase-Login-Token (eingeloggter Gastronom/Admin)
//
// Aufruf: POST /.netlify/functions/marketing-push
//   Header: Authorization: Bearer <supabase-login-token>
//   Body: { restaurant_id, title, message }
// Antwort: { ok:true, sent, recipients } | { ok:false, error }
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

'use strict';

const webpush = require('web-push');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
var VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

var CAMPAIGN_GAP_DAYS = 3; // max. 1 Kampagne pro Restaurant alle 3 Tage

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

function sbHeaders(extra) {
    var key = SERVICE_KEY || SUPABASE_ANON_KEY;
    return Object.assign({ 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {});
}
async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
    if (!res.ok) throw new Error('GET ' + path.split('?')[0] + ' -> ' + res.status);
    return res.json();
}

function berlinHour() {
    return parseInt(new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }), 10);
}
function berlinDateStr() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST' });

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        return json(200, { ok: false, error: 'Push-Schlüssel fehlen in Netlify (VAPID_PUBLIC / VAPID_PRIVATE setzen + neu deployen).' });
    }
    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
    catch (e) { return json(200, { ok: false, error: 'Push-Schlüssel ungültig: ' + e.message }); }

    // Auth: gueltiger Supabase-Login noetig (Gastronom/Admin im Dashboard)
    var token = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { ok: false, error: 'Bitte einloggen (kein Token).' });
    try {
        var uRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
        });
        if (!uRes.ok) return json(401, { ok: false, error: 'Login abgelaufen – bitte neu einloggen.' });
    } catch (e) {
        return json(401, { ok: false, error: 'Login-Prüfung fehlgeschlagen.' });
    }

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungültiger Body' }); }
    var restaurantId = String(body.restaurant_id || '').trim();
    var title = String(body.title || '').trim().slice(0, 60);
    var message = String(body.message || '').trim().slice(0, 180);
    if (!restaurantId) return json(400, { ok: false, error: 'restaurant_id fehlt' });
    if (!title || !message) return json(400, { ok: false, error: 'Titel und Text angeben' });

    // Sende-Fenster 9-21 Uhr deutscher Zeit
    var h = berlinHour();
    if (h < 9 || h >= 21) {
        return json(200, { ok: false, error: 'Push-Kampagnen nur zwischen 9 und 21 Uhr (niemand mag Werbung nachts).' });
    }

    // Restaurant + Kampagnen-Sperre pruefen
    var rest;
    try {
        var rl = await sbGet('restaurants?id=eq.' + encodeURIComponent(restaurantId) + '&select=id,name,slug,features');
        rest = rl[0];
    } catch (e) { return json(500, { ok: false, error: 'Restaurant nicht lesbar' }); }
    if (!rest) return json(404, { ok: false, error: 'Restaurant nicht gefunden' });

    var features = Array.isArray(rest.features) ? rest.features.slice() : [];
    var marker = features.map(String).find(function (f) { return f.indexOf('last_push_campaign:') === 0; });
    if (marker) {
        var lastDate = marker.split(':')[1];
        var diffDays = Math.floor((new Date(berlinDateStr()) - new Date(lastDate)) / 86400000);
        if (isFinite(diffDays) && diffDays < CAMPAIGN_GAP_DAYS) {
            return json(200, { ok: false, error: 'Letzte Kampagne war am ' + lastDate + '. Frühestens alle ' + CAMPAIGN_GAP_DAYS + ' Tage – schützt vor genervten Gästen.' });
        }
    }

    // Empfaenger: Telefonnummern aller bisherigen Besteller dieses Restaurants,
    // geschnitten mit den Push-Abonnenten
    var phones = {};
    try {
        var orders = await sbGet('orders?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
            '&customer_phone=not.is.null&select=customer_phone&limit=5000');
        orders.forEach(function (o) { if (o.customer_phone) phones[String(o.customer_phone).trim()] = 1; });
    } catch (e) { return json(500, { ok: false, error: 'Bestellungen nicht lesbar' }); }

    var subs;
    try {
        subs = await sbGet('push_subscriptions?select=id,endpoint,p256dh_key,auth_key,customer_phone&limit=5000');
    } catch (e) { return json(500, { ok: false, error: 'Push-Abonnenten nicht lesbar' }); }

    var targets = (subs || []).filter(function (s) {
        return s.customer_phone && phones[String(s.customer_phone).trim()];
    });
    if (!targets.length) {
        return json(200, { ok: false, error: 'Noch keine Push-Abonnenten unter den Gästen dieses Restaurants. (Gäste aktivieren Push nach einer Bestellung.)' });
    }

    var payload = JSON.stringify({
        title: title,
        body: message,
        icon: '/kiek-logo.png',
        badge: '/kiek-logo.png',
        tag: 'campaign-' + restaurantId + '-' + Date.now(),
        data: { type: 'campaign', restaurantId: restaurantId, url: '/?r=' + encodeURIComponent(rest.slug || rest.id) }
    });

    var sent = 0, failed = 0;
    for (var i = 0; i < targets.length; i++) {
        var s = targets[i];
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } }, payload);
            sent++;
        } catch (err) {
            failed++;
            // Tote Abos aufraeumen
            if (err.statusCode === 404 || err.statusCode === 410) {
                try {
                    await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + encodeURIComponent(s.id), {
                        method: 'DELETE', headers: sbHeaders({ 'Prefer': 'return=minimal' })
                    });
                } catch (e2) {}
            }
        }
    }

    // Kampagnen-Marker setzen (max. 1 alle X Tage)
    try {
        features = features.filter(function (f) { return String(f).indexOf('last_push_campaign:') !== 0; });
        features.push('last_push_campaign:' + berlinDateStr());
        await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(restaurantId), {
            method: 'PATCH', headers: sbHeaders({ 'Prefer': 'return=minimal' }),
            body: JSON.stringify({ features: features })
        });
    } catch (e) {}

    return json(200, { ok: true, sent: sent, failed: failed, recipients: targets.length });
};
