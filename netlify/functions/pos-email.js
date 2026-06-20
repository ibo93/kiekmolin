// POS via Email — universelle Brücke zum Kassensystem.
// Idee: Praktisch jede Gastro-Kasse (orderbird, Vectron, GastroSoft, Hypersoft,
// Colormetrics-Software, ...) hat schon einen Email-Import-Konnektor für
// Lieferando/Uber Eats. Wir liefern die Bestellung im gleichen klaren Format
// als Email an die vom Gastronom konfigurierte Adresse — die Kasse zieht sie
// automatisch rein. Wenn die Kasse Email nicht importieren kann, kriegt der
// Gastronom die Email aufs Handy und tippt sie in seiner Kasse ab — immer noch
// besser als manuell aus dem Dashboard abzutippen.
//
// Voraussetzung in Netlify: ENV-Var RESEND_API_KEY (von resend.com).
// Free-Tier: 3000 Mails/Monat, reicht locker.

'use strict';

var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var FROM_EMAIL = process.env.POS_EMAIL_FROM || 'bestellungen@kiekmolin.de';

var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
}

function fmtMoney(n) {
    var v = parseFloat(n) || 0;
    return v.toFixed(2).replace('.', ',') + ' €';
}

// Plain-Text-Version — wichtig fuer Kassen-Email-Parser die HTML ignorieren
function buildTextEmail(order, restaurantName) {
    var lines = [];
    lines.push('=========================================');
    lines.push('NEUE BESTELLUNG' + (restaurantName ? ' — ' + restaurantName : ''));
    lines.push('=========================================');
    lines.push('');
    lines.push('Beleg-Nr:      ' + (order.order_number || order.id || ''));
    lines.push('Eingegangen:   ' + new Date(order.created_at || Date.now()).toLocaleString('de-DE'));
    var typeLabel = order.order_type === 'delivery' ? 'LIEFERUNG'
        : order.order_type === 'dine_in' ? 'HIER ESSEN' : 'ABHOLUNG';
    lines.push('Typ:           ' + typeLabel);
    if (order.table_number) lines.push('Tisch:         ' + order.table_number);
    lines.push('');
    lines.push('KUNDE');
    lines.push('-----------------------------------------');
    if (order.customer_name) lines.push('Name:    ' + order.customer_name);
    if (order.customer_phone) lines.push('Telefon: ' + order.customer_phone);
    if (order.customer_email) lines.push('Email:   ' + order.customer_email);
    if (order.delivery_address && typeof order.delivery_address === 'object') {
        var a = order.delivery_address;
        var addr = [a.street, a.house_number].filter(Boolean).join(' ');
        var city = [a.zip, a.city].filter(Boolean).join(' ');
        if (addr) lines.push('Adresse: ' + addr);
        if (city) lines.push('         ' + city);
        if (a.note) lines.push('Notiz:   ' + a.note);
    }
    lines.push('');
    lines.push('ARTIKEL');
    lines.push('-----------------------------------------');
    var items = Array.isArray(order.items) ? order.items : [];
    items.forEach(function(item) {
        var qty = item.quantity || 1;
        var name = item.name || '';
        var price = parseFloat(item.price || item.total_price || 0).toFixed(2).replace('.', ',') + ' €';
        // Format: " 2x  Pizza Margherita ............ 18,00 €"
        var leftPart = ' ' + qty + 'x  ' + name;
        var dots = Math.max(2, 40 - leftPart.length - price.length);
        lines.push(leftPart + ' ' + new Array(dots + 1).join('.') + ' ' + price);
        if (item.options) lines.push('     > ' + item.options);
    });
    lines.push('-----------------------------------------');
    if (order.subtotal) lines.push('Zwischensumme: ' + fmtMoney(order.subtotal));
    if (order.delivery_fee) lines.push('Liefergeb.:    ' + fmtMoney(order.delivery_fee));
    if (order.tip) lines.push('Trinkgeld:     ' + fmtMoney(order.tip));
    if (order.discount) lines.push('Rabatt:        -' + fmtMoney(order.discount));
    lines.push('GESAMT:        ' + fmtMoney(order.total));
    lines.push('Zahlart:       ' + (order.payment_method || '—'));
    lines.push('');
    if (order.customer_notes || order.notes || order.delivery_notes) {
        lines.push('HINWEISE');
        lines.push('-----------------------------------------');
        lines.push(order.customer_notes || order.notes || order.delivery_notes);
        lines.push('');
    }
    lines.push('=========================================');
    lines.push('Bestellung von Kiek mol in — kiekmolin.de');
    return lines.join('\n');
}

function buildHtmlEmail(order, restaurantName) {
    var items = Array.isArray(order.items) ? order.items : [];
    var rows = items.map(function(item) {
        var qty = item.quantity || 1;
        var name = escapeHtml(item.name || '');
        var price = fmtMoney(item.price || item.total_price || 0);
        var opt = item.options ? '<br><span style="color:#666;font-size:12px;">› ' + escapeHtml(item.options) + '</span>' : '';
        return '<tr>' +
            '<td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:600;">' + qty + '×</td>' +
            '<td style="padding:4px 8px;border-bottom:1px solid #eee;">' + name + opt + '</td>' +
            '<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">' + price + '</td>' +
        '</tr>';
    }).join('');

    var typeLabel = order.order_type === 'delivery' ? 'LIEFERUNG'
        : order.order_type === 'dine_in' ? 'HIER ESSEN' : 'ABHOLUNG';

    var addr = '';
    if (order.delivery_address && typeof order.delivery_address === 'object') {
        var a = order.delivery_address;
        var line1 = [a.street, a.house_number].filter(Boolean).join(' ');
        var line2 = [a.zip, a.city].filter(Boolean).join(' ');
        addr = escapeHtml(line1) + (line2 ? '<br>' + escapeHtml(line2) : '');
        if (a.note) addr += '<br><em style="color:#666;">' + escapeHtml(a.note) + '</em>';
    }

    return '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222;">' +
        '<div style="background:#003d33;color:#fff;padding:16px;border-radius:8px 8px 0 0;">' +
            '<div style="font-size:12px;opacity:0.8;">' + (restaurantName ? escapeHtml(restaurantName) : 'Neue Bestellung') + '</div>' +
            '<div style="font-size:22px;font-weight:700;margin-top:4px;">' +
                'Beleg #' + escapeHtml(order.order_number || (order.id || '').substring(0, 8)) +
                ' · <span style="background:#f59e0b;color:#000;padding:2px 8px;border-radius:4px;font-size:14px;">' + typeLabel + '</span>' +
            '</div>' +
            '<div style="font-size:12px;margin-top:4px;opacity:0.85;">' + new Date(order.created_at || Date.now()).toLocaleString('de-DE') + '</div>' +
        '</div>' +
        '<div style="border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;padding:16px;">' +
            (order.customer_name || order.customer_phone || addr ?
                '<div style="margin-bottom:12px;font-size:13px;">' +
                    (order.customer_name ? '<strong>' + escapeHtml(order.customer_name) + '</strong>' : '') +
                    (order.customer_phone ? ' · <a href="tel:' + escapeHtml(order.customer_phone) + '" style="color:#003d33;">' + escapeHtml(order.customer_phone) + '</a>' : '') +
                    (order.table_number ? ' · Tisch ' + escapeHtml(order.table_number) : '') +
                    (addr ? '<br><span style="color:#555;">' + addr + '</span>' : '') +
                '</div>' : '') +
            '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">' + rows + '</table>' +
            '<div style="text-align:right;font-size:18px;font-weight:700;padding-top:8px;border-top:2px solid #003d33;">' +
                'GESAMT: ' + fmtMoney(order.total) +
                (order.payment_method ? '<div style="font-size:12px;color:#555;font-weight:400;margin-top:2px;">Zahlart: ' + escapeHtml(order.payment_method) + '</div>' : '') +
            '</div>' +
            (order.customer_notes || order.notes || order.delivery_notes ?
                '<div style="margin-top:12px;padding:8px 12px;background:#fef3c7;border-left:3px solid #f59e0b;font-size:13px;">' +
                    '<strong>Hinweis:</strong> ' + escapeHtml(order.customer_notes || order.notes || order.delivery_notes) +
                '</div>' : '') +
        '</div>' +
        '<div style="text-align:center;color:#999;font-size:11px;margin-top:16px;">' +
            'Automatisch übermittelt von kiekmolin.de' +
        '</div>' +
    '</body></html>';
}

function json(status, obj) {
    return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

exports.handler = async function(event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return json(405, { ok: false, error: 'Method not allowed' });
    }
    if (!RESEND_API_KEY) {
        return json(500, { ok: false, error: 'RESEND_API_KEY ist nicht in Netlify konfiguriert.' });
    }

    var input;
    try { input = JSON.parse(event.body || '{}'); }
    catch (e) { return json(400, { ok: false, error: 'Invalid JSON' }); }

    var toEmail = input.to;
    var order = input.order;
    var restaurantName = input.restaurant_name || '';
    var test = input.test === true;

    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
        return json(400, { ok: false, error: 'Ziel-Email fehlt oder ungültig.' });
    }
    if (!order && !test) {
        return json(400, { ok: false, error: 'order fehlt.' });
    }

    if (test) {
        order = {
            order_number: 'TEST-001',
            id: 'test-test-test',
            order_type: 'pickup',
            created_at: new Date().toISOString(),
            customer_name: 'Max Mustermann',
            customer_phone: '+49 176 12345678',
            items: [
                { quantity: 1, name: 'Pizza Margherita', price: 9.50, options: 'klein, Knoblauch extra' },
                { quantity: 2, name: 'Coca-Cola 0,33l', price: 5.80 }
            ],
            subtotal: 15.30,
            total: 15.30,
            payment_method: 'Bar',
            customer_notes: 'Bitte ohne Zwiebeln. (Testbestellung — bitte ignorieren)'
        };
    }

    var subject = '🍽 Neue Bestellung #' + (order.order_number || order.id || '').toString().substring(0, 8) +
                  ' — ' + fmtMoney(order.total);
    var textBody = buildTextEmail(order, restaurantName);
    var htmlBody = buildHtmlEmail(order, restaurantName);

    try {
        var resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + RESEND_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: toEmail,
                subject: subject,
                text: textBody,
                html: htmlBody,
                tags: [
                    { name: 'type', value: 'pos-order' },
                    { name: 'restaurant', value: (restaurantName || 'unknown').slice(0, 40) }
                ]
            })
        });
        var resendData = await resendRes.json().catch(function() { return {}; });
        if (!resendRes.ok) {
            return json(resendRes.status >= 400 && resendRes.status < 500 ? resendRes.status : 502, {
                ok: false,
                error: 'Resend-Fehler: ' + (resendData.message || resendData.name || ('HTTP ' + resendRes.status)),
                resend: resendData
            });
        }
        return json(200, { ok: true, message_id: resendData.id || null });
    } catch (err) {
        console.error('[pos-email] error:', err && err.stack ? err.stack : err);
        return json(500, { ok: false, error: 'Verbindungsfehler: ' + err.message });
    }
};
