// Kiek mol in — Gast sagt Reservierung selbst ab (Link aus der Erinnerungs-Mail).
//
// Aufruf: GET /.netlify/functions/res-cancel?id=<reservierungs-uuid>
// Setzt status='cancelled' und zeigt eine kleine Bestätigungs-Seite.
// Die UUID ist nicht erratbar und wirkt damit als Token; es kann nur
// storniert (nichts gelesen/geändert) werden -- risikoarm.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var webpush = require('web-push');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
var VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

function sbHeaders(extra) {
    return Object.assign({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {});
}

// Das Restaurant SOFORT informieren, wenn ein Gast selbst absagt.
// Vorher passierte hier nichts: Der Gast las "das Team kann den Tisch jetzt
// weitergeben", im Restaurant erfuhr davon aber niemand aktiv. Wer nicht
// zufällig ins Dashboard schaute, hielt den Tisch weiter frei -- am vollen
// Samstagabend bares Geld.
// Fehler hier dürfen die Absage NICHT scheitern lassen: der Gast hat seinen
// Teil getan, die Stornierung steht bereits in der Datenbank.
async function notifyRestaurant(r, restName) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE || !r.restaurant_id) return;
    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
    catch (e) { return; }

    var subs = [];
    try {
        var sr = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?restaurant_id=eq.' +
            encodeURIComponent(r.restaurant_id) + '&select=id,endpoint,p256dh_key,auth_key', { headers: sbHeaders() });
        if (sr.ok) subs = await sr.json();
    } catch (e) { return; }
    if (!Array.isArray(subs) || !subs.length) return;

    var datum = '';
    try {
        var d = new Date(String(r.reservation_date) + 'T12:00:00');
        datum = isNaN(d.getTime()) ? String(r.reservation_date || '')
                                   : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    } catch (e) { datum = String(r.reservation_date || ''); }

    var zeit = String(r.reservation_time || '').slice(0, 5);
    var payload = JSON.stringify({
        title: 'Reservierung abgesagt',
        body: (r.guest_name || 'Ein Gast') + ' hat abgesagt – ' + datum + (zeit ? ' um ' + zeit + ' Uhr' : '') +
              '. Der Tisch ist wieder frei.',
        icon: '/kiek-logo.png',
        badge: '/kiek-logo.png',
        tag: 'res-cancelled-' + r.id,
        requireInteraction: true,
        data: { type: 'reservation_cancelled', reservationId: r.id, url: '/?dashboard=reservations' }
    });

    for (var i = 0; i < subs.length; i++) {
        var s = subs[i];
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } }, payload);
        } catch (err) {
            // Tote Abos aufräumen, damit die Liste nicht zuwächst
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                try {
                    await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + encodeURIComponent(s.id),
                        { method: 'DELETE', headers: sbHeaders({ 'Prefer': 'return=minimal' }) });
                } catch (e2) {}
            }
        }
    }
}

function page(title, text, ok) {
    var color = ok ? '#16a34a' : '#b91c1c';
    var icon = ok ? 'M20 6L9 17l-5-5' : 'M18 6L6 18M6 6l12 12';
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        body: '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>' + title + ' – Kiek mol in</title></head>' +
            '<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f8f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">' +
            '<div style="max-width:420px;width:100%;background:#ffffff;border-radius:24px;padding:36px 28px;text-align:center;box-shadow:0 20px 50px rgba(0,61,51,0.08);">' +
                '<div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:' + (ok ? 'rgba(22,163,74,0.1)' : 'rgba(185,28,28,0.08)') + ';display:flex;align-items:center;justify-content:center;">' +
                    '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + icon + '"/></svg>' +
                '</div>' +
                '<h1 style="font-size:20px;margin:0 0 8px;color:#00251e;">' + title + '</h1>' +
                '<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.5;">' + text + '</p>' +
                '<a href="https://kiekmolin.de" style="display:inline-block;background:#003d33;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:600;font-size:14px;">Zu Kiek mol in</a>' +
            '</div></body></html>'
    };
}

exports.handler = async function (event) {
    var id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!/^[0-9a-f-]{20,}$/i.test(id)) return page('Link ungültig', 'Dieser Absage-Link ist unvollständig. Bitte nutze den Link aus deiner E-Mail.', false);
    if (!SUPABASE_KEY) return page('Gerade nicht möglich', 'Die Absage kann gerade nicht verarbeitet werden. Bitte ruf kurz im Restaurant an.', false);

    try {
        // Reservierung lesen
        var res = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(id) +
            '&select=id,status,guest_name,reservation_date,reservation_time,restaurant_id', { headers: sbHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var rows = await res.json();
        if (!rows.length) return page('Nicht gefunden', 'Diese Reservierung existiert nicht (mehr).', false);
        var r = rows[0];
        var timeStr = String(r.reservation_time || '').slice(0, 5);

        if (r.status === 'cancelled') {
            return page('Schon abgesagt', 'Diese Reservierung wurde bereits storniert. Alles gut – bis zum nächsten Mal!', true);
        }

        // Stornieren
        var upd = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: sbHeaders({ 'Prefer': 'return=minimal' }),
            body: JSON.stringify({ status: 'cancelled' })
        });
        if (!upd.ok) throw new Error('HTTP ' + upd.status);

        // Restaurant-Name für die Bestätigung (optional)
        var restName = 'das Restaurant';
        try {
            var rr = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(r.restaurant_id) + '&select=name', { headers: sbHeaders() });
            if (rr.ok) { var rl = await rr.json(); if (rl[0] && rl[0].name) restName = rl[0].name; }
        } catch (e) {}

        // Restaurant benachrichtigen -- Fehler hier dürfen die Absage nicht kippen
        try { await notifyRestaurant(r, restName); }
        catch (e) { console.error('[res-cancel] Benachrichtigung fehlgeschlagen:', e.message); }

        return page('Reservierung abgesagt',
            'Danke für die Info' + (r.guest_name ? ', ' + String(r.guest_name).replace(/[<>&]/g, '') : '') + '! ' +
            'Dein Tisch' + (timeStr ? ' um ' + timeStr + ' Uhr' : '') + ' bei ' + String(restName).replace(/[<>&]/g, '') +
            ' wurde storniert – das Team kann ihn jetzt weitergeben. Bis zum nächsten Mal!', true);
    } catch (e) {
        console.error('[res-cancel]', e.message);
        return page('Gerade nicht möglich', 'Die Absage konnte nicht verarbeitet werden. Bitte ruf kurz im Restaurant an.', false);
    }
};
