// Kiek mol in — Reservierungs-Erinnerung gegen No-Shows.
//
// Läuft stündlich (netlify.toml), sendet aber nur im Vormittags-Fenster
// (9-11 Uhr deutscher Zeit): Alle Gäste mit BESTAETIGTER Reservierung für
// HEUTE bekommen eine freundliche Erinnerung per E-Mail -- mit Absage-Link
// (res-cancel Function), damit das Restaurant den Tisch neu vergeben kann.
//
// Spam-/Fehler-Schutz:
//   - pro Reservierung genau EINE Erinnerung (reservations.reminder_email_sent_at,
//     wird atomar beansprucht; fehlt die Spalte -> Function beendet sich sauber)
//   - erst ab 3 Std nach Buchung (wer heute früh für heute Abend bucht,
//     braucht keine Erinnerung)
//   - nur Zeiten, die noch mindestens 1 Std in der Zukunft liegen
//
// EINMALIG in Supabase:
//   ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminder_email_sent_at timestamptz;
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, EMAIL_FROM (optional)

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';

function sbHeaders(extra) {
    return Object.assign({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {});
}

async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
    if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) {}
        var err = new Error('GET ' + path.split('?')[0] + ' -> ' + res.status);
        err.status = res.status; err.body = t;
        throw err;
    }
    return res.json();
}

function berlinDateStr() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
function berlinHourMin() {
    var s = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false });
    return { h: parseInt(s.slice(0, 2), 10), hm: s.slice(0, 5) };
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function sendMail(to, subject, html) {
    var res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject: subject, html: html })
    });
    if (!res.ok) { var t = ''; try { t = await res.text(); } catch (e) {} throw new Error('Resend ' + res.status + ': ' + t.slice(0, 150)); }
}

exports.handler = async function () {
    if (!RESEND_API_KEY || !SUPABASE_KEY) return { statusCode: 200, body: 'env fehlt - skipped' };

    var now = berlinHourMin();
    // Sende-Fenster: 9-11 Uhr deutscher Zeit (Function läuft stündlich)
    if (now.h < 9 || now.h >= 11) return { statusCode: 200, body: 'ausserhalb Sende-Fenster' };

    var today = berlinDateStr();
    var bookedBefore = new Date(Date.now() - 3 * 3600000).toISOString();

    var list;
    try {
        list = await sbGet('reservations?reservation_date=eq.' + today +
            '&status=eq.confirmed&guest_email=not.is.null&reminder_email_sent_at=is.null' +
            '&created_at=lt.' + encodeURIComponent(bookedBefore) +
            '&select=id,restaurant_id,guest_name,guest_email,party_size,reservation_time&limit=200');
    } catch (e) {
        if (e.status === 400 && /reminder_email_sent_at/.test(e.body || '')) {
            console.warn('[res-reminder] Spalte reminder_email_sent_at fehlt. Bitte einmalig anlegen. Keine Mails verschickt.');
            return { statusCode: 200, body: 'column missing - skipped' };
        }
        throw e;
    }
    if (!list.length) return { statusCode: 200, body: 'keine Kandidaten' };

    // Restaurant-Infos einmal laden
    var restaurants = {};
    try {
        (await sbGet('restaurants?select=id,name,street,city,phone&limit=200')).forEach(function (r) { restaurants[r.id] = r; });
    } catch (e) {}

    var sent = 0, skipped = 0;
    for (var i = 0; i < list.length; i++) {
        var res = list[i];
        var timeStr = String(res.reservation_time || '').slice(0, 5);

        // Nur erinnern, wenn die Zeit noch mind. ~1 Std entfernt ist
        if (timeStr && timeStr <= now.hm) { skipped++; continue; }

        // Atomar beanspruchen -> genau eine Erinnerung pro Reservierung
        var claim = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(res.id) +
            '&reminder_email_sent_at=is.null', {
            method: 'PATCH',
            headers: sbHeaders({ 'Prefer': 'return=representation' }),
            body: JSON.stringify({ reminder_email_sent_at: new Date().toISOString() })
        });
        if (!claim.ok) { skipped++; continue; }
        var claimed = await claim.json();
        if (!claimed.length) { skipped++; continue; }

        var rest = restaurants[res.restaurant_id] || {};
        var restName = rest.name || 'dem Restaurant';
        var cancelUrl = 'https://kiekmolin.de/.netlify/functions/res-cancel?id=' + encodeURIComponent(res.id);
        var addr = [rest.street, rest.city].filter(Boolean).join(', ');

        var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">' +
            '<h1 style="font-size:20px;margin:0 0 12px;color:#003d33;">Heute: Dein Tisch um ' + esc(timeStr) + ' Uhr</h1>' +
            '<p style="margin:0 0 8px;">Moin' + (res.guest_name ? ' ' + esc(res.guest_name) : '') + ',</p>' +
            '<p style="margin:0 0 16px;">kleine Erinnerung: Dein Tisch bei <strong>' + esc(restName) + '</strong> ist heute um <strong>' + esc(timeStr) + ' Uhr</strong> für <strong>' + (res.party_size || 2) + ' Personen</strong> reserviert. Wir freuen uns auf dich!</p>' +
            (addr ? '<p style="margin:0 0 16px;color:#374151;">Adresse: ' + esc(addr) + (rest.phone ? ' · Tel: <a href="tel:' + esc(rest.phone) + '" style="color:#003d33;">' + esc(rest.phone) + '</a>' : '') + '</p>' : '') +
            '<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Du kannst doch nicht kommen? Kein Problem – sag einfach kurz ab, dann kann das Team den Tisch weitergeben:</p>' +
            '<p style="margin:0 0 20px;"><a href="' + cancelUrl + '" style="display:inline-block;background:#ffffff;color:#b91c1c;border:1.5px solid #fca5a5;text-decoration:none;padding:11px 20px;border-radius:9999px;font-weight:600;">Reservierung absagen</a></p>' +
            '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
            '<p style="margin:0;color:#9ca3af;font-size:12px;">Diese Erinnerung wurde automatisch von kiekmolin.de verschickt.</p>' +
        '</div>';

        try {
            await sendMail(res.guest_email, 'Erinnerung: Dein Tisch heute um ' + timeStr + ' Uhr – ' + restName, html);
            sent++;
        } catch (e) {
            console.error('[res-reminder] Mail fehlgeschlagen:', e.message);
            skipped++;
        }
    }

    console.log('[res-reminder] sent=' + sent + ' skipped=' + skipped);
    return { statusCode: 200, body: 'sent=' + sent + ' skipped=' + skipped };
};
