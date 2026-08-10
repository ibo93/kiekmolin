// Kiek mol in — Feierabend-Report: tägliche Zusammenfassung per E-Mail an
// jeden Gastronomen (Umsatz, Bestellungen, Top-Gerichte, Reservierungen morgen).
//
// Läuft als Netlify Scheduled Function täglich 21:30 UTC (= 23:30 Sommer /
// 22:30 Winter deutscher Zeit), siehe netlify.toml.
//
// Verhalten:
//   - OHNE RESEND_API_KEY macht die Function NICHTS (gefahrlos deploybar).
//   - Nur Restaurants mit hinterlegter E-Mail UND Aktivität (Bestellungen heute
//     oder Reservierungen morgen) bekommen eine Mail -- kein Spam an ruhige Tage.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, EMAIL_FROM (optional)

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';

function sbHeaders() {
    return { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
}

async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
    if (!res.ok) throw new Error('GET ' + path.split('?')[0] + ' -> ' + res.status);
    return res.json();
}

// Datum in deutscher Zeit (YYYY-MM-DD), optional um Tage verschoben
function berlinDateStr(offsetDays) {
    var d = new Date(Date.now() + (offsetDays || 0) * 86400000);
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

// Aktueller UTC-Offset von Berlin, z.B. '+02:00' (CEST) oder '+01:00' (CET)
function berlinOffset() {
    try {
        var parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' }).formatToParts(new Date());
        var tz = (parts.find(function (p) { return p.type === 'timeZoneName'; }) || {}).value || 'GMT+01:00';
        var m = tz.match(/GMT([+-]\d{2}:\d{2})/);
        return m ? m[1] : '+01:00';
    } catch (e) { return '+01:00'; }
}

function eur(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
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
    if (!RESEND_API_KEY) return { statusCode: 200, body: 'RESEND_API_KEY fehlt - skipped' };
    if (!SUPABASE_KEY) return { statusCode: 200, body: 'SUPABASE_SERVICE_KEY fehlt - skipped' };

    var today = berlinDateStr(0);
    var tomorrow = berlinDateStr(1);
    var off = berlinOffset();
    var dayStartIso = new Date(today + 'T00:00:00' + off).toISOString();

    var restaurants, orders, reservations;
    try {
        restaurants = await sbGet('restaurants?select=id,name,email,is_active&limit=200');
        orders = await sbGet('orders?created_at=gte.' + encodeURIComponent(dayStartIso) +
            '&select=restaurant_id,total,tip,items,status,order_type&limit=2000');
        reservations = await sbGet('reservations?reservation_date=eq.' + tomorrow +
            '&status=in.(confirmed,pending)&select=restaurant_id,guest_name,party_size,reservation_time,status,notes' +
            '&order=reservation_time.asc&limit=500');
    } catch (e) {
        console.error('[daily-report] Laden fehlgeschlagen:', e.message);
        return { statusCode: 500, body: e.message };
    }

    var sent = 0, skipped = 0;
    for (var i = 0; i < restaurants.length; i++) {
        var r = restaurants[i];
        if (!r || r.is_active === false || !r.email || String(r.email).indexOf('@') < 1) { skipped++; continue; }

        var ro = orders.filter(function (o) { return o.restaurant_id === r.id; });
        var valid = ro.filter(function (o) { return o.status !== 'cancelled'; });
        var cancelled = ro.length - valid.length;
        var rres = reservations.filter(function (x) { return x.restaurant_id === r.id; });

        // Nichts los heute + nichts morgen -> keine Mail
        if (!valid.length && !rres.length) { skipped++; continue; }

        var revenue = valid.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
        var tips = valid.reduce(function (s, o) { return s + (Number(o.tip) || 0); }, 0);
        var byType = { delivery: 0, pickup: 0, dine_in: 0 };
        valid.forEach(function (o) { if (byType[o.order_type] !== undefined) byType[o.order_type]++; });

        // Top-3-Gerichte aus der items-JSONB-Spalte aggregieren
        var dishCount = {};
        valid.forEach(function (o) {
            (Array.isArray(o.items) ? o.items : []).forEach(function (it) {
                if (!it || !it.name) return;
                dishCount[it.name] = (dishCount[it.name] || 0) + (Number(it.quantity) || 1);
            });
        });
        var top = Object.keys(dishCount).map(function (n) { return { name: n, qty: dishCount[n] }; })
            .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 3);

        var typeParts = [];
        if (byType.delivery) typeParts.push(byType.delivery + '× Lieferung');
        if (byType.pickup) typeParts.push(byType.pickup + '× Abholung');
        if (byType.dine_in) typeParts.push(byType.dine_in + '× vor Ort');

        function row(label, val) {
            return '<tr><td style="padding:7px 12px 7px 0;color:#6b7280;white-space:nowrap;">' + label + '</td>' +
                '<td style="padding:7px 0;font-weight:700;text-align:right;">' + val + '</td></tr>';
        }
        var stats = '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px;">' +
            row('Umsatz heute', eur(revenue)) +
            row('Bestellungen', String(valid.length) + (typeParts.length ? ' <span style="font-weight:400;color:#6b7280;">(' + typeParts.join(', ') + ')</span>' : '')) +
            (tips > 0 ? row('Trinkgeld', eur(tips)) : '') +
            (cancelled > 0 ? row('Storniert', String(cancelled)) : '') +
        '</table>';

        var topHtml = '';
        if (top.length) {
            topHtml = '<p style="margin:16px 0 6px;font-weight:700;color:#003d33;">Top-Gerichte heute</p><ol style="margin:0;padding-left:20px;color:#374151;font-size:14px;">' +
                top.map(function (t) { return '<li style="padding:2px 0;">' + esc(t.name) + ' <span style="color:#6b7280;">(' + t.qty + '×)</span></li>'; }).join('') + '</ol>';
        }

        var resHtml = '';
        if (rres.length) {
            resHtml = '<p style="margin:20px 0 6px;font-weight:700;color:#003d33;">Morgen: ' + rres.length + ' Reservierung' + (rres.length > 1 ? 'en' : '') + '</p>' +
                '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
                rres.slice(0, 12).map(function (x) {
                    var wl = String(x.notes || '').indexOf('[Warteliste]') >= 0;
                    return '<tr>' +
                        '<td style="padding:5px 10px 5px 0;font-weight:700;white-space:nowrap;">' + esc(String(x.reservation_time || '').slice(0, 5)) + '</td>' +
                        '<td style="padding:5px 10px 5px 0;">' + esc(x.guest_name || 'Gast') + (wl ? ' <span style="color:#d97706;font-size:12px;">(Warteliste)</span>' : '') + (x.status === 'pending' ? ' <span style="color:#d97706;font-size:12px;">– noch bestätigen!</span>' : '') + '</td>' +
                        '<td style="padding:5px 0;text-align:right;color:#6b7280;white-space:nowrap;">' + (x.party_size || 2) + ' Pers.</td>' +
                    '</tr>';
                }).join('') +
                (rres.length > 12 ? '<tr><td colspan="3" style="padding:6px 0;color:#6b7280;">… und ' + (rres.length - 12) + ' weitere</td></tr>' : '') +
                '</table>';
        } else {
            resHtml = '<p style="margin:20px 0 0;font-size:14px;color:#6b7280;">Morgen: keine Reservierungen bisher.</p>';
        }

        var dateNice = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' });
        var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">' +
            '<h1 style="font-size:20px;margin:0 0 4px;color:#003d33;">Feierabend-Report – ' + esc(r.name) + '</h1>' +
            '<p style="margin:0 0 16px;color:#6b7280;">' + dateNice + '</p>' +
            stats + topHtml + resHtml +
            '<p style="margin:24px 0 0;"><a href="https://kiekmolin.de/?dashboard=orders" style="display:inline-block;background:#003d33;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600;">Zum Dashboard</a></p>' +
            '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
            '<p style="margin:0;color:#9ca3af;font-size:12px;">Automatischer Tagesbericht von kiekmolin.de.</p>' +
        '</div>';

        try {
            await sendMail(r.email, 'Feierabend-Report: ' + valid.length + ' Bestellungen · ' + eur(revenue) + ' – ' + r.name, html);
            sent++;
        } catch (e) {
            console.error('[daily-report] Mail an', r.name, 'fehlgeschlagen:', e.message);
            skipped++;
        }
    }

    console.log('[daily-report] sent=' + sent + ' skipped=' + skipped);
    return { statusCode: 200, body: 'sent=' + sent + ' skipped=' + skipped };
};
