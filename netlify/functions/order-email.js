// Bestellbestaetigung per E-Mail an den Kunden (via Resend, https://resend.com).
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Aufruf vom Frontend direkt nach dem Speichern der Bestellung:
//   POST /.netlify/functions/order-email   Body: { "order_id": "<uuid>" }
//
// Verhalten:
//   - OHNE RESEND_API_KEY macht die Function NICHTS (200, {skipped:true}) --
//     gefahrlos deploybar, aktiviert sich erst mit dem Key.
//   - Duplikatschutz ueber orders.confirmation_email_sent_at: die Spalte wird
//     atomar "beansprucht" (PATCH ... where sent_at is null). Fehlt die Spalte,
//     wird trotzdem gesendet (das Frontend ruft nur einmal pro Bestellung an).
//
// ENV:
//   RESEND_API_KEY   (Pflicht fuer den Versand; ohne -> still inaktiv)
//   EMAIL_FROM       optional, Default 'Kiek mol in <bestellung@kiekmolin.de>'
//                    -- die Domain muss bei Resend verifiziert sein!
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  optional (sonst anon-Fallback)
//
// EMPFOHLEN einmalig in Supabase:
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function buildEmail(o) {
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
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
        '<p style="margin:0;color:#9ca3af;font-size:12px;">Diese Bestätigung wurde automatisch von kiekmolin.de verschickt. Fragen zur Bestellung beantwortet das Restaurant' +
        (o.customer_phone ? '' : '') + '.</p>' +
    '</div>';

    return {
        subject: 'Bestellbestätigung #' + (o.order_number || '') + ' – ' + (o.restaurant_name || 'Kiek mol in'),
        html: html
    };
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST' });

    // Ohne Key: bewusst still (kein Fehler im Frontend-Log noetig)
    if (!RESEND_API_KEY) return json(200, { ok: true, skipped: true, reason: 'RESEND_API_KEY nicht gesetzt' });

    var body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) {}
    var orderId = body.order_id || body.orderId || '';
    if (!orderId || !/^[0-9a-f-]{10,}$/i.test(String(orderId))) return json(400, { error: 'order_id fehlt/ungueltig' });

    try {
        // Duplikatschutz: Bestellung atomar beanspruchen. 0 Zeilen zurueck =
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

        var mail = buildEmail(order);
        var sendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject: mail.subject, html: mail.html })
        });
        if (!sendRes.ok) {
            var errText = ''; try { errText = await sendRes.text(); } catch (e) {}
            return json(502, { error: 'Resend ' + sendRes.status + ': ' + errText.slice(0, 200) });
        }
        return json(200, { ok: true, sent: true });
    } catch (e) {
        return json(500, { error: e.message });
    }
};
