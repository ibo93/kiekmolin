// Bestell- und Reservierungs-E-Mails an den Kunden (via Resend, https://resend.com).
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Aufrufe vom Frontend (fire-and-forget):
//   POST /.netlify/functions/order-email   Body: { "order_id": "<uuid>" }
//     -> Bestellbestätigung
//   POST /.netlify/functions/order-email   Body: { "reservation_id": "<uuid>", "event": "received" }
//     -> Reservierungsanfrage eingegangen (event auch: "confirmed" | "cancelled")
//
// Verhalten:
//   - OHNE RESEND_API_KEY macht die Function NICHTS (200, {skipped:true}) --
//     gefahrlos deploybar, aktiviert sich erst mit dem Key.
//   - Duplikatschutz über confirmation_email_sent_at (orders bzw. reservations,
//     nur beim Eingang): Spalte wird atomar "beansprucht". Fehlt die Spalte,
//     wird trotzdem gesendet (das Frontend ruft nur einmal pro Ereignis an).
//   - Bestätigt/Abgelehnt-Mails haben keinen Spalten-Schutz -- sie werden
//     durch die explizite Aktion des Gastronomen ausgelöst.
//
// ENV:
//   RESEND_API_KEY   (Pflicht für den Versand; ohne -> still inaktiv)
//   EMAIL_FROM       optional, Default 'Kiek mol in <bestellung@kiekmolin.de>'
//                    -- die Domain muss bei Resend verifiziert sein!
//                    (kiekmolin.de ist seit Juli 2026 verifiziert; EMAIL_FROM in
//                    Netlify steht auf bestellung@kiekmolin.de. Zum Testen ohne
//                    Domain ginge 'onboarding@resend.dev' -- liefert dann NUR an
//                    die eigene Resend-Konto-Adresse.)
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  optional (sonst anon-Fallback)
//
// EMPFOHLEN einmalig in Supabase:
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;
//   ALTER TABLE reservations ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_email_sent_at timestamptz;
//
// Die dritte Spalte gehoert zur Annahme-Mail und braucht eine EIGENE, denn
// sonst haelt sich die Annahme-Mail wegen des Stempels der Eingangs-Mail
// sofort fuer schon versendet. Fehlt die Spalte, wird trotzdem gesendet --
// nur ohne Duplikatschutz.

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
};

function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

function sbHeaders(extra) {
    return Object.assign({
        'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json'
    }, extra || {});
}

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function eur(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €'; }

// BITTE UM EINE GOOGLE-BEWERTUNG -- hier, nicht in der App.
//
// In der App sprangen dem Gast NACH dem Bestellen drei Fenster entgegen:
// Sterne nach 60 Sekunden, "Google Bewertung" nach zwei Minuten, dazu noch
// eins 30 Sekunden nach der Bestätigung. Zu dem Zeitpunkt hatte er noch
// nichts gegessen -- er konnte gar nicht bewerten, was er nicht kannte.
//
// In der E-Mail steht die Bitte einmal, ganz unten, und der Gast liest sie,
// wenn es ihm passt. Ohne Link vom Restaurant kommt gar nichts -- eine
// Google-SUCHE nach dem Restaurantnamen wäre geraten und führt oft auf die
// falsche Seite.
function bewertungsBlock(rest, restName) {
    var url = rest && (rest.google_maps_url || rest.googleMapsUrl);
    if (!url || String(url).indexOf('http') !== 0) return '';
    return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">' +
        '<p style="margin:0 0 10px;font-size:14px;color:#374151;">' +
            'Hat es geschmeckt? Eine kurze Bewertung hilft ' + esc(restName || 'dem Restaurant') + ' sehr.' +
        '</p>' +
        '<a href="' + esc(url) + '" style="display:inline-block;background:#ffffff;border:1.5px solid #003d33;color:#003d33;' +
        'text-decoration:none;padding:10px 20px;border-radius:9999px;font-weight:600;font-size:14px;">Bei Google bewerten</a>' +
    '</div>';
}

function buildEmail(o, rest) {
    var typeLabel = o.order_type === 'delivery' ? 'Lieferung'
        : (o.order_type === 'dine_in' ? 'Vor Ort' + (o.table_number ? ' · Tisch ' + esc(o.table_number) : '') : 'Abholung');

    var items = Array.isArray(o.items) ? o.items : [];
    var rows = items.map(function (it) {
        var opts = it.options ? '<br><span style="font-size:12px;color:#6b7280;">' + esc(it.options) + '</span>' : '';
        return '<tr>' +
            '<td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">' + (Number(it.quantity) || 1) + '× ' + esc(it.name) + opts + '</td>' +
            '<td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">' + eur(it.price) + '</td>' +
        '</tr>';
    }).join('');

    function sumRow(label, val, bold) {
        return '<tr><td style="padding:4px 0;' + (bold ? 'font-weight:700;font-size:16px;' : 'color:#6b7280;') + '">' + label +
            '</td><td style="padding:4px 0;text-align:right;white-space:nowrap;' + (bold ? 'font-weight:700;font-size:16px;' : 'color:#6b7280;') + '">' + val + '</td></tr>';
    }
    var sums = '';
    if (Number(o.subtotal) > 0) sums += sumRow('Zwischensumme', eur(o.subtotal));
    if (Number(o.delivery_fee) > 0) sums += sumRow('Liefergebühr', eur(o.delivery_fee));
    if (Number(o.tip) > 0) sums += sumRow('Trinkgeld', eur(o.tip));
    if (Number(o.discount) > 0) sums += sumRow('Rabatt', '−' + eur(o.discount));
    sums += sumRow('Gesamt', eur(o.total), true);

    var addr = '';
    var da = o.delivery_address;
    if (o.order_type === 'delivery' && da && typeof da === 'object') {
        addr = '<p style="margin:16px 0 0;color:#374151;"><strong>Lieferadresse:</strong><br>' +
            esc((da.street || '') + ' ' + (da.house_number || '')) + '<br>' +
            esc((da.zip || '') + ' ' + (da.city || '')) + '</p>';
    }

    var trackUrl = 'https://kiekmolin.de/order/' + encodeURIComponent(o.order_number || '');
    var payLabel = ({ cash: 'Barzahlung', card: 'Kartenzahlung', paypal: 'PayPal', online: 'Online bezahlt', stripe: 'Online bezahlt' })[String(o.payment_method || '').toLowerCase()] || esc(o.payment_method || '');

    var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">' +
        '<h1 style="font-size:20px;margin:0 0 4px;color:#003d33;">Bestellung eingegangen ✅</h1>' +
        '<p style="margin:0 0 16px;color:#6b7280;">#' + esc(o.order_number) + ' · ' + esc(o.restaurant_name || 'Restaurant') + ' · ' + typeLabel + '</p>' +
        '<p style="margin:0 0 16px;">Moin' + (o.customer_name ? ' ' + esc(o.customer_name) : '') + ', deine Bestellung ist beim Restaurant eingegangen. Sobald sie bestätigt wird, siehst du den Live-Status hier:</p>' +
        '<p style="margin:0 0 20px;"><a href="' + trackUrl + '" style="display:inline-block;background:#003d33;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600;">Bestellstatus verfolgen</a></p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">' + sums + '</table>' +
        '<p style="margin:12px 0 0;color:#6b7280;font-size:13px;">Zahlung: ' + payLabel + '</p>' +
        addr +
        (o.delivery_notes ? '<p style="margin:8px 0 0;color:#6b7280;font-size:13px;">Hinweis: ' + esc(o.delivery_notes) + '</p>' : '') +
        bewertungsBlock(rest, o.restaurant_name) +
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
        '<p style="margin:0;color:#9ca3af;font-size:12px;">Diese Bestätigung wurde automatisch von kiekmolin.de verschickt. Fragen zur Bestellung beantwortet das Restaurant' +
        (o.customer_phone ? '' : '') + '.</p>' +
    '</div>';

    return {
        subject: 'Bestellbestätigung #' + (o.order_number || '') + ' – ' + (o.restaurant_name || 'Kiek mol in'),
        html: html
    };
}

// ZWEITE MAIL: DIE BESTELLUNG IST ANGENOMMEN.
//
// Bisher ging genau EINE Mail raus -- beim Bestelleingang ("ist eingegangen,
// wird gleich bestaetigt"). Die Bestaetigung selbst und vor allem die
// Wartezeit bekam der Gast nur zu sehen, wenn er die App offen liess.
//
// Fuer Betriebe, die aus ihrer Kasse arbeiten, ist das der entscheidende
// Punkt: dort nimmt kiekmolin die Bestellung automatisch an, der Wirt
// oeffnet das Dashboard nie -- und ohne diese Mail erfaehrt der Gast nichts.
// Er sitzt vor einer Bestellung, von der er nicht weiss, ob sie jemand
// gesehen hat.
function buildAcceptedEmail(o, rest) {
    var lieferung = o.order_type === 'delivery';
    var typeLabel = lieferung ? 'Lieferung'
        : (o.order_type === 'dine_in' ? 'Vor Ort' + (o.table_number ? ' · Tisch ' + esc(o.table_number) : '') : 'Abholung');

    var min = parseInt(o.estimated_minutes, 10);
    var zeitText = '';
    if (min > 0) {
        // Zusaetzlich die Uhrzeit nennen. "in 45 Minuten" muss der Gast
        // umrechnen, "gegen 19:20 Uhr" nicht -- und wer die Mail zwanzig
        // Minuten spaeter liest, rechnet sonst falsch.
        var uhr = '';
        try {
            var ziel = o.estimated_time ? new Date(o.estimated_time) : new Date(Date.now() + min * 60000);
            uhr = ziel.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        } catch (e) {}
        zeitText = lieferung
            ? 'Deine Bestellung ist in etwa <strong>' + min + ' Minuten</strong> bei dir'
            : 'Du kannst sie in etwa <strong>' + min + ' Minuten</strong> abholen';
        if (uhr) zeitText += ' – also gegen <strong>' + esc(uhr) + ' Uhr</strong>';
        zeitText += '.';
    } else {
        zeitText = 'Das Restaurant bereitet deine Bestellung jetzt zu.';
    }

    var trackUrl = 'https://kiekmolin.de/order/' + encodeURIComponent(o.order_number || '');
    var restName = o.restaurant_name || (rest && rest.name) || 'Restaurant';

    var adresse = '';
    if (!lieferung && rest && (rest.street || rest.city)) {
        adresse = '<p style="margin:16px 0 0;color:#374151;"><strong>Abholadresse:</strong><br>' +
            esc([rest.street, rest.city].filter(Boolean).join(', ')) + '</p>';
    }

    var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">' +
        '<h1 style="font-size:20px;margin:0 0 4px;color:#003d33;">Bestellung bestätigt 👍</h1>' +
        '<p style="margin:0 0 16px;color:#6b7280;">#' + esc(o.order_number) + ' · ' + esc(restName) + ' · ' + typeLabel + '</p>' +
        '<p style="margin:0 0 16px;">Moin' + (o.customer_name ? ' ' + esc(o.customer_name) : '') +
            ', ' + esc(restName) + ' hat deine Bestellung angenommen. ' + zeitText + '</p>' +
        '<p style="margin:0 0 20px;"><a href="' + trackUrl + '" style="display:inline-block;background:#003d33;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600;">Bestellstatus verfolgen</a></p>' +
        adresse +
        (rest && rest.phone ? '<p style="margin:12px 0 0;color:#6b7280;font-size:13px;">Etwas stimmt nicht? Ruf direkt an: ' + esc(rest.phone) + '</p>' : '') +
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
        '<p style="margin:0;color:#9ca3af;font-size:12px;">Automatisch verschickt von kiekmolin.de.</p>' +
    '</div>';

    return {
        subject: 'Bestellung bestätigt #' + (o.order_number || '') +
                 (min > 0 ? ' – ca. ' + min + ' Min' : '') + ' – ' + restName,
        html: html
    };
}

// Reservierungs-E-Mail: r = reservations-Zeile, rest = {name, street, city, phone}
function buildReservationEmail(r, rest, eventType) {
    var restName = (rest && rest.name) || 'das Restaurant';
    var dateStr = r.reservation_date;
    try {
        dateStr = new Date(r.reservation_date + 'T12:00:00').toLocaleDateString('de-DE',
            { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {}
    var timeStr = String(r.reservation_time || '').slice(0, 5);

    var head, intro, color;
    if (eventType === 'confirmed') {
        head = 'Reservierung bestätigt ✅';
        intro = 'gute Nachricht: ' + esc(restName) + ' hat deine Reservierung bestätigt. Wir freuen uns auf dich!';
        color = '#16a34a';
    } else if (eventType === 'cancelled') {
        head = 'Reservierung leider nicht möglich';
        intro = 'leider kann ' + esc(restName) + ' deine Reservierung zu diesem Zeitpunkt nicht annehmen. ' +
            'Versuch es gern mit einer anderen Uhrzeit' + ((rest && rest.phone) ? ' oder ruf direkt an: <a href="tel:' + esc(rest.phone) + '" style="color:#003d33;">' + esc(rest.phone) + '</a>' : '') + '.';
        color = '#b91c1c';
    } else {
        head = 'Reservierungsanfrage eingegangen 📩';
        intro = 'deine Reservierungsanfrage bei ' + esc(restName) + ' ist eingegangen. Das Restaurant bestätigt sie so schnell wie möglich — du bekommst dann noch eine E-Mail.';
        color = '#003d33';
    }

    function row(label, val) {
        return '<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;">' + label + '</td>' +
            '<td style="padding:6px 0;font-weight:600;">' + val + '</td></tr>';
    }
    var details = '<table style="border-collapse:collapse;font-size:14px;margin:16px 0;">' +
        row('Restaurant', esc(restName)) +
        row('Datum', esc(dateStr)) +
        row('Uhrzeit', esc(timeStr) + ' Uhr') +
        row('Personen', esc(r.party_size || 2)) +
        (r.occasion ? row('Anlass', esc(r.occasion)) : '') +
        (r.notes ? row('Hinweis', esc(r.notes)) : '') +
        ((rest && (rest.street || rest.city)) ? row('Adresse', esc(((rest.street || '') + ', ' + (rest.city || '')).replace(/^, |, $/g, ''))) : '') +
    '</table>';

    // Absage-Link SOFORT mitgeben -- nicht erst in der Erinnerungs-Mail.
    // Die kommt nämlich erst am Tag der Reservierung zwischen 9 und 11 Uhr:
    // Wer Montag für Samstag bucht und Mittwoch absagen will, hätte keinen
    // Weg gehabt; wer um 18:00 für 19:30 desselben Tages bucht, bekommt gar
    // keine Erinnerung mehr. Je früher der Gast absagen kann, desto eher
    // kriegt das Restaurant den Tisch noch weitervergeben.
    var cancelBlock = '';
    if (r.id && eventType !== 'cancelled') {
        var cancelUrl = 'https://kiekmolin.de/.netlify/functions/res-cancel?id=' + encodeURIComponent(r.id);
        cancelBlock =
            '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:20px 0;">' +
                '<p style="margin:0 0 10px;font-size:14px;color:#374151;">' +
                    '<strong>Doch etwas dazwischengekommen?</strong><br>' +
                    'Sag uns bitte kurz Bescheid – dann kann ' + esc(restName) + ' den Tisch noch weitergeben.' +
                '</p>' +
                '<a href="' + cancelUrl + '" style="display:inline-block;background:#ffffff;border:1.5px solid #b91c1c;color:#b91c1c;text-decoration:none;padding:10px 20px;border-radius:9999px;font-weight:600;font-size:14px;">Reservierung absagen</a>' +
                ((rest && rest.phone)
                    ? '<p style="margin:10px 0 0;font-size:12px;color:#6b7280;">Oder telefonisch: <a href="tel:' + esc(rest.phone) + '" style="color:#003d33;">' + esc(rest.phone) + '</a></p>'
                    : '') +
            '</div>';
    }

    var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">' +
        '<h1 style="font-size:20px;margin:0 0 16px;color:' + color + ';">' + head + '</h1>' +
        '<p style="margin:0 0 4px;">Moin' + (r.guest_name ? ' ' + esc(r.guest_name) : '') + ',</p>' +
        '<p style="margin:0 0 8px;">' + intro + '</p>' +
        details +
        cancelBlock +
        // Nur bei der BESTAETIGUNG. Bei einer offenen Anfrage war der Gast noch
        // nicht da, und bei einer Absage wäre die Bitte um eine Bewertung
        // schlicht unverschämt.
        (eventType === 'confirmed' ? bewertungsBlock(rest, restName) : '') +
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
        '<p style="margin:0;color:#9ca3af;font-size:12px;">Diese E-Mail wurde automatisch von kiekmolin.de verschickt.' +
        (eventType === 'received' ? ' Die Reservierung ist erst nach Bestätigung durch das Restaurant verbindlich.' : '') + '</p>' +
    '</div>';

    var subjPrefix = eventType === 'confirmed' ? 'Reservierung bestätigt'
        : (eventType === 'cancelled' ? 'Reservierung nicht möglich' : 'Reservierungsanfrage eingegangen');
    return { subject: subjPrefix + ' – ' + restName + ', ' + timeStr + ' Uhr', html: html };
}

async function sendViaResend(to, mail) {
    var res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject: mail.subject, html: mail.html })
    });
    if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) {}
        var err = new Error('Resend ' + res.status + ': ' + t.slice(0, 200));
        err.resend = true;
        throw err;
    }
}

async function handleReservation(resvId, eventType) {
    var resv = null;
    if (eventType === 'received') {
        // Duplikatschutz wie bei Bestellungen: atomar beanspruchen
        var claimRes = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(resvId) +
            '&confirmation_email_sent_at=is.null', {
            method: 'PATCH',
            headers: sbHeaders({ 'Prefer': 'return=representation' }),
            body: JSON.stringify({ confirmation_email_sent_at: new Date().toISOString() })
        });
        if (claimRes.ok) {
            var claimed = await claimRes.json();
            if (!claimed.length) return json(200, { ok: true, skipped: true, reason: 'schon versendet' });
            resv = claimed[0];
        }
    }
    if (!resv) {
        var rows = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(resvId) + '&select=*', { headers: sbHeaders() });
        if (!rows.ok) return json(500, { error: 'Reservierung nicht lesbar (' + rows.status + ')' });
        var data = await rows.json();
        if (!data.length) return json(404, { error: 'Reservierung nicht gefunden' });
        resv = data[0];
    }

    var to = String(resv.guest_email || '').trim();
    if (!to || to.indexOf('@') < 1) return json(200, { ok: true, skipped: true, reason: 'keine Gast-E-Mail' });

    var rest = null;
    if (resv.restaurant_id) {
        try {
            var rres = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(resv.restaurant_id) + '&select=name,street,city,phone,google_maps_url', { headers: sbHeaders() });
            if (rres.ok) { var rl = await rres.json(); rest = rl[0] || null; }
        } catch (e) {}
    }

    await sendViaResend(to, buildReservationEmail(resv, rest, eventType));
    return json(200, { ok: true, sent: true });
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

    // ---- Selbst-Test per Browser-Link (GET) ------------------------------
    // Aufruf:  /.netlify/functions/order-email?test=1
    //   -> sagt, ob RESEND_API_KEY gesetzt ist.
    // Aufruf:  /.netlify/functions/order-email?test=1&to=deine@mail.de
    //   -> versucht eine Test-E-Mail zu senden und zeigt das genaue Ergebnis
    //      (inkl. Resend-Fehler, falls z.B. die Absender-Domain nicht verifiziert ist).
    if (event.httpMethod === 'GET') {
        var q = event.queryStringParameters || {};
        if (!q.test) {
            return json(200, { ok: true, hinweis: 'E-Mail-Funktion aktiv. Test: ?test=1 (Key-Check) bzw. ?test=1&to=deine@mail.de (Test-Versand).' });
        }
        if (!RESEND_API_KEY) {
            return json(200, {
                ok: false, key_gesetzt: false,
                hinweis: 'RESEND_API_KEY ist in Netlify NICHT gesetzt -> es werden derzeit KEINE E-Mails verschickt. In Netlify unter Site configuration > Environment variables eintragen und neu deployen.'
            });
        }
        var to = String(q.to || '').trim();
        if (!to || to.indexOf('@') < 1) {
            return json(200, {
                ok: true, key_gesetzt: true, absender: EMAIL_FROM,
                hinweis: 'Key ist gesetzt. Fuer einen echten Test-Versand ?to=deine@mail.de anhaengen.'
            });
        }
        try {
            await sendViaResend(to, {
                subject: 'Kiek mol in – Test-E-Mail ✅',
                html: '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;">' +
                    '<h1 style="font-size:20px;color:#003d33;margin:0 0 12px;">Test erfolgreich ✅</h1>' +
                    '<p style="margin:0;">Wenn du diese E-Mail siehst, funktioniert der Versand von kiekmolin.de. ' +
                    'Bestell- und Reservierungsbestaetigungen kommen jetzt an.</p></div>'
            });
            return json(200, { ok: true, key_gesetzt: true, gesendet: true, an: to, absender: EMAIL_FROM });
        } catch (e) {
            return json(200, {
                ok: false, key_gesetzt: true, gesendet: false, absender: EMAIL_FROM, fehler: e.message,
                hinweis: 'Resend hat den Versand abgelehnt. Haeufigste Ursache: die Absender-Domain (' + EMAIL_FROM + ') ist bei Resend nicht verifiziert.'
            });
        }
    }
    // ----------------------------------------------------------------------

    if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST' });

    // Ohne Key: bewusst still (kein Fehler im Frontend-Log nötig)
    if (!RESEND_API_KEY) return json(200, { ok: true, skipped: true, reason: 'RESEND_API_KEY nicht gesetzt' });

    var body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) {}

    // Reservierungs-Zweig: {reservation_id, event: received|confirmed|cancelled}
    var resvId = body.reservation_id || body.reservationId || '';
    if (resvId) {
        if (!/^[0-9a-f-]{10,}$/i.test(String(resvId))) return json(400, { error: 'reservation_id ungueltig' });
        var evType = String(body.event || 'received').toLowerCase();
        if (['received', 'confirmed', 'cancelled'].indexOf(evType) < 0) evType = 'received';
        try {
            return await handleReservation(resvId, evType);
        } catch (e) {
            return json(e.resend ? 502 : 500, { error: e.message });
        }
    }

    var orderId = body.order_id || body.orderId || '';
    if (!orderId || !/^[0-9a-f-]{10,}$/i.test(String(orderId))) return json(400, { error: 'order_id fehlt/ungueltig' });

    // Zweig "angenommen": eigene Mail mit der Wartezeit.
    //
    // Bewusst getrennt vom Eingangs-Zweig darunter, und mit EIGENEM
    // Duplikatschutz -- sonst wuerde die Annahme-Mail den Stempel der
    // Eingangs-Mail sehen und sich fuer schon versendet halten.
    if (String(body.event || '').toLowerCase() === 'accepted') {
        try {
            // Genauso beanspruchen wie unten. Fehlt die Spalte, antwortet
            // PostgREST mit 400 -- dann lesen wir normal und senden trotzdem.
            // Lieber eine Mail doppelt als gar keine.
            var aClaim = await fetch(SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(orderId) +
                '&accepted_email_sent_at=is.null', {
                method: 'PATCH',
                headers: sbHeaders({ 'Prefer': 'return=representation' }),
                body: JSON.stringify({ accepted_email_sent_at: new Date().toISOString() })
            });
            var aOrder = null;
            if (aClaim.ok) {
                var aRows = await aClaim.json();
                if (!aRows.length) return json(200, { ok: true, skipped: true, reason: 'schon versendet' });
                aOrder = aRows[0];
            } else {
                var aRead = await fetch(SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(orderId) + '&select=*', { headers: sbHeaders() });
                if (!aRead.ok) return json(500, { error: 'Bestellung nicht lesbar (' + aRead.status + ')' });
                var aData = await aRead.json();
                if (!aData.length) return json(404, { error: 'Bestellung nicht gefunden' });
                aOrder = aData[0];
            }

            var aTo = String(aOrder.customer_email || '').trim();
            if (!aTo || aTo.indexOf('@') < 1) return json(200, { ok: true, skipped: true, reason: 'keine Kunden-E-Mail' });

            var aRest = null;
            if (aOrder.restaurant_id) {
                try {
                    var arres = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.'
                        + encodeURIComponent(aOrder.restaurant_id) + '&select=name,street,city,phone',
                        { headers: sbHeaders() });
                    if (arres.ok) { var arl = await arres.json(); aRest = arl[0] || null; }
                } catch (e) {}
            }

            await sendViaResend(aTo, buildAcceptedEmail(aOrder, aRest));
            return json(200, { ok: true, sent: true, event: 'accepted' });
        } catch (e) {
            return json(e.resend ? 502 : 500, { error: e.message });
        }
    }

    try {
        // Duplikatschutz: Bestellung atomar beanspruchen. 0 Zeilen zurück =
        // schon versendet. 400 = Spalte fehlt -> trotzdem senden (Frontend
        // ruft nur einmal pro Bestellung an).
        var claimRes = await fetch(SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(orderId) +
            '&confirmation_email_sent_at=is.null', {
            method: 'PATCH',
            headers: sbHeaders({ 'Prefer': 'return=representation' }),
            body: JSON.stringify({ confirmation_email_sent_at: new Date().toISOString() })
        });
        var order = null;
        if (claimRes.ok) {
            var claimed = await claimRes.json();
            if (!claimed.length) return json(200, { ok: true, skipped: true, reason: 'schon versendet' });
            order = claimed[0];
        } else {
            // Spalte fehlt (oder anderes Problem) -> Bestellung normal lesen
            var rows = await fetch(SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(orderId) + '&select=*', { headers: sbHeaders() });
            if (!rows.ok) return json(500, { error: 'Bestellung nicht lesbar (' + rows.status + ')' });
            var data = await rows.json();
            if (!data.length) return json(404, { error: 'Bestellung nicht gefunden' });
            order = data[0];
        }

        var to = String(order.customer_email || '').trim();
        if (!to || to.indexOf('@') < 1) return json(200, { ok: true, skipped: true, reason: 'keine Kunden-E-Mail' });

        // Das Restaurant dazuholen -- ohne seinen Google-Link bleibt der
        // Bewertungs-Block leer. Schlägt es fehl, geht die Bestätigung
        // trotzdem raus: eine Bestellbestätigung darf nie an einer
        // Nebensache scheitern.
        var restOrder = null;
        if (order.restaurant_id) {
            try {
                var orres = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.'
                    + encodeURIComponent(order.restaurant_id) + '&select=name,google_maps_url',
                    { headers: sbHeaders() });
                if (orres.ok) { var orl = await orres.json(); restOrder = orl[0] || null; }
            } catch (e) {}
        }

        await sendViaResend(to, buildEmail(order, restOrder));
        return json(200, { ok: true, sent: true });
    } catch (e) {
        return json(e.resend ? 502 : 500, { error: e.message });
    }
};
