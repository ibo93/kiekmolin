// Kiek mol in — Wochenreport: montags morgens eine Mail an jeden Gastronomen
// mit der kompletten Vorwoche: Umsatz (vs. Woche davor), Bestellungen,
// stärkster Tag, Top-5-Gerichte, Reservierungen.
//
// Läuft montags 06:30 UTC (= 08:30 Sommer / 07:30 Winter dt. Zeit).
// Ohne RESEND_API_KEY still inaktiv. Nur Restaurants mit E-Mail + Aktivität.
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

function berlinOffset() {
    try {
        var parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' }).formatToParts(new Date());
        var tz = (parts.find(function (p) { return p.type === 'timeZoneName'; }) || {}).value || 'GMT+01:00';
        var m = tz.match(/GMT([+-]\d{2}:\d{2})/);
        return m ? m[1] : '+01:00';
    } catch (e) { return '+01:00'; }
}
function berlinDateStr(offsetDays) {
    var d = new Date(Date.now() + (offsetDays || 0) * 86400000);
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
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
    if (!RESEND_API_KEY || !SUPABASE_KEY) return { statusCode: 200, body: 'env fehlt - skipped' };

    // Heute ist Montag (Cron). Vorwoche = Mo(-7) 00:00 bis heute Mo 00:00 Berlin.
    var off = berlinOffset();
    var todayStr = berlinDateStr(0);
    var weekStartIso = new Date(berlinDateStr(-7) + 'T00:00:00' + off).toISOString();
    var weekEndIso = new Date(todayStr + 'T00:00:00' + off).toISOString();
    var prevStartIso = new Date(berlinDateStr(-14) + 'T00:00:00' + off).toISOString();

    var restaurants, orders, prevOrders, reservations;
    try {
        restaurants = await sbGet('restaurants?select=id,name,email,is_active&limit=200');
        orders = await sbGet('orders?created_at=gte.' + encodeURIComponent(weekStartIso) +
            '&created_at=lt.' + encodeURIComponent(weekEndIso) +
            '&select=restaurant_id,total,items,status,created_at&limit=5000');
        prevOrders = await sbGet('orders?created_at=gte.' + encodeURIComponent(prevStartIso) +
            '&created_at=lt.' + encodeURIComponent(weekStartIso) +
            '&select=restaurant_id,total,status&limit=5000');
        reservations = await sbGet('reservations?reservation_date=gte.' + berlinDateStr(-7) +
            '&reservation_date=lt.' + todayStr +
            '&select=restaurant_id,status&limit=2000');
    } catch (e) {
        console.error('[weekly-report] Laden fehlgeschlagen:', e.message);
        return { statusCode: 500, body: e.message };
    }

    var sent = 0, skipped = 0;
    for (var i = 0; i < restaurants.length; i++) {
        var r = restaurants[i];
        if (!r || r.is_active === false || !r.email || String(r.email).indexOf('@') < 1) { skipped++; continue; }

        var ro = orders.filter(function (o) { return o.restaurant_id === r.id && o.status !== 'cancelled'; });
        var po = prevOrders.filter(function (o) { return o.restaurant_id === r.id && o.status !== 'cancelled'; });
        var rres = reservations.filter(function (x) { return x.restaurant_id === r.id && x.status !== 'cancelled' && x.status !== 'no_show'; });
        if (!ro.length && !rres.length) { skipped++; continue; }

        var revenue = ro.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
        var prevRevenue = po.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
        var diffHtml = '';
        if (prevRevenue > 0) {
            var pct = Math.round(((revenue - prevRevenue) / prevRevenue) * 100);
            diffHtml = pct >= 0
                ? ' <span style="color:#16a34a;font-weight:700;">▲ +' + pct + '%</span>'
                : ' <span style="color:#b91c1c;font-weight:700;">▼ ' + pct + '%</span>';
            diffHtml += ' <span style="color:#6b7280;font-weight:400;">vs. Vorwoche</span>';
        }

        // Stärkster Tag (nach Umsatz, deutscher Wochentag)
        var byDay = {};
        ro.forEach(function (o) {
            var day = new Date(o.created_at).toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' });
            byDay[day] = (byDay[day] || 0) + (Number(o.total) || 0);
        });
        var bestDay = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0] || '';

        // Top-5-Gerichte
        var dishCount = {};
        ro.forEach(function (o) {
            (Array.isArray(o.items) ? o.items : []).forEach(function (it) {
                if (!it || !it.name) return;
                dishCount[it.name] = (dishCount[it.name] || 0) + (Number(it.quantity) || 1);
            });
        });
        var top = Object.keys(dishCount).map(function (n) { return { name: n, qty: dishCount[n] }; })
            .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);

        function row(label, val) {
            return '<tr><td style="padding:7px 12px 7px 0;color:#6b7280;white-space:nowrap;">' + label + '</td>' +
                '<td style="padding:7px 0;font-weight:700;text-align:right;">' + val + '</td></tr>';
        }
        var html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">' +
            '<h1 style="font-size:20px;margin:0 0 4px;color:#003d33;">Dein Wochenrückblick – ' + esc(r.name) + '</h1>' +
            '<p style="margin:0 0 16px;color:#6b7280;">Letzte Woche auf einen Blick</p>' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px;">' +
                row('Umsatz', eur(revenue) + diffHtml) +
                row('Bestellungen', String(ro.length)) +
                (bestDay ? row('Stärkster Tag', esc(bestDay) + ' <span style="color:#6b7280;font-weight:400;">(' + eur(byDay[bestDay]) + ')</span>') : '') +
                row('Reservierungen', String(rres.length)) +
            '</table>' +
            (top.length ? '<p style="margin:16px 0 6px;font-weight:700;color:#003d33;">Top-Gerichte der Woche</p><ol style="margin:0;padding-left:20px;color:#374151;font-size:14px;">' +
                top.map(function (t) { return '<li style="padding:2px 0;">' + esc(t.name) + ' <span style="color:#6b7280;">(' + t.qty + '×)</span></li>'; }).join('') + '</ol>' : '') +
            '<p style="margin:24px 0 0;"><a href="https://kiekmolin.de/?dashboard=statistics" style="display:inline-block;background:#003d33;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600;">Alle Statistiken ansehen</a></p>' +
            '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
            '<p style="margin:0;color:#9ca3af;font-size:12px;">Automatischer Wochenbericht von kiekmolin.de.</p>' +
        '</div>';

        try {
            await sendMail(r.email, 'Wochenrückblick: ' + eur(revenue) + ' Umsatz · ' + ro.length + ' Bestellungen – ' + r.name, html);
            sent++;
        } catch (e) {
            console.error('[weekly-report] Mail an', r.name, 'fehlgeschlagen:', e.message);
            skipped++;
        }
    }

    console.log('[weekly-report] sent=' + sent + ' skipped=' + skipped);
    return { statusCode: 200, body: 'sent=' + sent + ' skipped=' + skipped };
};
