// Kiek mol in — Monatsbericht per Mail: am 1. jedes Monats an jeden Gastronomen,
// der ganze Vormonat. Dieselben Zahlen wie im Dashboard (Monatsbericht):
// Umsatz App + Kasse = Gesamt, Bestellungen, stärkster Tag, Reservierungen,
// WhatsApp-Angebote (neue Zustimmungen nach Quelle, verschickt, eingelöst).
//
// Ibo, 09.10.2026: "Monatsbericht automatisch per Mail am 1."
//
// Läuft am 1. um 06:15 UTC (= 08:15 Sommer / 07:15 Winter dt. Zeit).
// Ohne RESEND_API_KEY still inaktiv. Kasse (datenbank/43) und WhatsApp
// (datenbank/42) sind Zusatz: fehlen die Tabellen, geht der Bericht ohne sie
// raus -- und sagt das, statt eine 0 hinzuschreiben.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, EMAIL_FROM (optional)

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';
var MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
var TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function sbHeaders() {
    return { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
}
async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
    if (!res.ok) throw new Error('GET ' + path.split('?')[0] + ' -> ' + res.status);
    return res.json();
}
function eur(n) { return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Tag in deutscher Zeit (YYYY-MM-DD) -- für Zeitstempel aus der Datenbank.
function berlinTag(ts) { return new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
// Mitternacht deutscher Zeit an diesem Tag als ISO. Der Versatz gilt für
// DIESEN Tag (Ende Oktober wechselt er), nicht für heute.
function berlinMitternacht(tag) {
    var mittag = new Date(tag + 'T12:00:00Z');
    var tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' }).formatToParts(mittag)
        .find(function (p) { return p.type === 'timeZoneName'; });
    var m = tz && tz.value.match(/GMT([+-]\d{2}:\d{2})/);
    return new Date(tag + 'T00:00:00' + (m ? m[1] : '+01:00')).toISOString();
}
// Am 1.10. -> '2026-09'; am 1.1. -> Dezember des Vorjahres.
function vormonat(heute) {
    var j = +heute.slice(0, 4), m = +heute.slice(5, 7) - 1;
    if (m === 0) { j--; m = 12; }
    return j + '-' + String(m).padStart(2, '0');
}
function folgemonat(monat) {
    var j = +monat.slice(0, 4), m = +monat.slice(5, 7) + 1;
    if (m === 13) { j++; m = 1; }
    return j + '-' + String(m).padStart(2, '0');
}

// Reine Rechnung je Haus -- im Test ausgeführt.
// daten: { orders, reservierungen, kasse (null = Tabelle fehlt), einw/empf (null = fehlt) }
function monatsZahlen(rid, monat, daten) {
    var imMonat = function (ts) { return !!ts && berlinTag(ts).slice(0, 7) === monat; };
    var ord = (daten.orders || []).filter(function (o) { return o.restaurant_id === rid && o.status !== 'cancelled' && imMonat(o.created_at); });
    var proTag = {}, app = 0;
    ord.forEach(function (o) { var t = berlinTag(o.created_at), b = Number(o.total) || 0; app += b; proTag[t] = (proTag[t] || 0) + b; });
    var kasse = null, kasseTage = 0;
    if (daten.kasse) {
        kasse = 0;
        daten.kasse.forEach(function (k) {
            if (k.restaurant_id !== rid || String(k.tag).slice(0, 7) !== monat) return;
            var b = Number(k.betrag) || 0; kasse += b; kasseTage++; proTag[k.tag] = (proTag[k.tag] || 0) + b;
        });
    }
    var bester = Object.keys(proTag).sort(function (a, b) { return proTag[b] - proTag[a]; })[0] || null;
    var res = (daten.reservierungen || []).filter(function (x) {
        return x.restaurant_id === rid && String(x.reservation_date || '').slice(0, 7) === monat && ['cancelled', 'rejected', 'no_show'].indexOf(x.status) < 0;
    });
    var wa = null;
    if (daten.einw && daten.empf) {
        var neu = daten.einw.filter(function (e) { return e.restaurant_id === rid && imMonat(e.erstmals_at); });
        var empf = daten.empf.filter(function (e) { return e.restaurant_id === rid; });
        var ein = empf.filter(function (e) { return imMonat(e.eingeloest_at); });
        wa = { neuBestellung: neu.filter(function (e) { return e.quelle === 'bestellung'; }).length,
               neuReservierung: neu.filter(function (e) { return e.quelle === 'reservierung'; }).length,
               abgemeldet: daten.einw.filter(function (e) { return e.restaurant_id === rid && imMonat(e.widerrufen_at); }).length,
               verschickt: empf.filter(function (e) { return imMonat(e.gesendet_at); }).length,
               eingeloest: ein.length, umsatz: ein.reduce(function (s, e) { return s + (Number(e.umsatz) || 0); }, 0) };
    }
    return { app: app, bestellungen: ord.length, schnitt: ord.length ? app / ord.length : 0, kasse: kasse, kasseTage: kasseTage,
             gesamt: app + (kasse || 0), besterTag: bester, besterTagBetrag: bester ? proTag[bester] : 0,
             reservierungen: res.length, gaeste: res.reduce(function (s, x) { return s + (parseInt(x.party_size, 10) || 0); }, 0), wa: wa,
             leer: !ord.length && !res.length && !kasseTage };
}

function mailHtml(name, monat, z, hinweise) {
    var titel = MONATE[+monat.slice(5, 7) - 1] + ' ' + monat.slice(0, 4);
    function row(label, val) {
        return '<tr><td style="padding:7px 12px 7px 0;color:#6b7280;white-space:nowrap;">' + label + '</td>' +
            '<td style="padding:7px 0;font-weight:700;text-align:right;">' + val + '</td></tr>';
    }
    var bt = z.besterTag ? TAGE[new Date(z.besterTag + 'T12:00:00Z').getUTCDay()] + ', ' + z.besterTag.slice(8, 10) + '.' + z.besterTag.slice(5, 7) + '.' : '';
    var h = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">' +
        '<h1 style="font-size:20px;margin:0 0 4px;color:#003d33;">Monatsbericht ' + esc(titel) + ' – ' + esc(name) + '</h1>' +
        '<p style="margin:0 0 16px;color:#6b7280;">Der ganze Monat auf einen Blick</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px;">' +
        (z.kasse !== null
            ? row('Umsatz gesamt', eur(z.gesamt)) + row('davon App', eur(z.app)) + row('davon Kasse', eur(z.kasse) + ' <span style="color:#6b7280;font-weight:400;">(' + z.kasseTage + ' Tage eingetragen)</span>')
            : row('Umsatz App', eur(z.app))) +
        row('Bestellungen', String(z.bestellungen) + (z.bestellungen ? ' <span style="color:#6b7280;font-weight:400;">(Ø ' + eur(z.schnitt) + ')</span>' : '')) +
        (bt ? row('Stärkster Tag', esc(bt) + ' <span style="color:#6b7280;font-weight:400;">(' + eur(z.besterTagBetrag) + ')</span>') : '') +
        row('Reservierungen', String(z.reservierungen) + ' <span style="color:#6b7280;font-weight:400;">(' + z.gaeste + ' Gäste)</span>') +
        '</table>';
    if (z.wa) {
        h += '<p style="margin:16px 0 6px;font-weight:700;color:#003d33;">WhatsApp-Angebote</p>' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
            row('Neue Zustimmungen', z.wa.neuBestellung + ' aus Bestellung · ' + z.wa.neuReservierung + ' aus Reservierung') +
            (z.wa.abgemeldet ? row('Abgemeldet', String(z.wa.abgemeldet)) : '') +
            row('Verschickt · eingelöst', z.wa.verschickt + ' · ' + z.wa.eingeloest) +
            (z.wa.umsatz ? row('Umsatz daraus', eur(z.wa.umsatz)) : '') +
            '</table>';
    }
    if (hinweise.length) h += '<p style="margin:16px 0 0;font-size:12px;color:#92400e;">' + hinweise.map(esc).join('<br>') + '</p>';
    h += '<p style="margin:24px 0 0;"><a href="https://kiekmolin.de/?dashboard=statistics" style="display:inline-block;background:#003d33;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600;">Bericht im Dashboard (Tag für Tag, druckbar)</a></p>' +
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
        '<p style="margin:0;color:#9ca3af;font-size:12px;">Automatischer Monatsbericht von kiekmolin.de.</p></div>';
    return h;
}

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

    var heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    var monat = vormonat(heute), naechster = folgemonat(monat);
    var vonIso = berlinMitternacht(monat + '-01'), bisIso = berlinMitternacht(naechster + '-01');

    var daten = {}, restaurants, hinweise = [];
    try {
        restaurants = await sbGet('restaurants?select=id,name,email,is_active&limit=200');
        daten.orders = await sbGet('orders?created_at=gte.' + encodeURIComponent(vonIso) + '&created_at=lt.' + encodeURIComponent(bisIso) +
            '&select=restaurant_id,total,status,created_at&limit=50000');
        daten.reservierungen = await sbGet('reservations?reservation_date=gte.' + monat + '-01&reservation_date=lt.' + naechster + '-01' +
            '&select=restaurant_id,status,party_size,reservation_date&limit=20000');
    } catch (e) {
        console.error('[monthly-report] Laden fehlgeschlagen:', e.message);
        return { statusCode: 500, body: e.message };
    }
    // Zusatz in eigenem try: fehlt eine Tabelle, geht der Bericht ohne sie raus.
    try {
        daten.kasse = await sbGet('kassen_umsatz?tag=gte.' + monat + '-01&tag=lt.' + naechster + '-01&select=restaurant_id,tag,betrag&limit=20000');
    } catch (e) {
        daten.kasse = null; hinweise.push('Kassen-Umsatz ist noch nicht eingerichtet – hier steht nur, was über die App lief.');
        console.warn('[monthly-report] Kasse nicht lesbar (datenbank/43?):', e.message);
    }
    try {
        daten.einw = await sbGet('gast_einwilligungen?select=restaurant_id,quelle,erstmals_at,widerrufen_at&limit=50000');
        daten.empf = await sbGet('wa_kampagnen_empfaenger?select=restaurant_id,gesendet_at,eingeloest_at,umsatz&limit=50000');
    } catch (e) {
        daten.einw = null; daten.empf = null;
        console.warn('[monthly-report] WhatsApp-Zahlen nicht lesbar (datenbank/42?):', e.message);
    }

    var sent = 0, skipped = 0;
    for (var i = 0; i < restaurants.length; i++) {
        var r = restaurants[i];
        if (!r || r.is_active === false || !r.email || String(r.email).indexOf('@') < 1) { skipped++; continue; }
        var z = monatsZahlen(r.id, monat, daten);
        if (z.leer) { skipped++; continue; }
        try {
            await sendMail(r.email, 'Monatsbericht ' + MONATE[+monat.slice(5, 7) - 1] + ': ' + eur(z.gesamt) + ' Umsatz – ' + r.name, mailHtml(r.name, monat, z, hinweise));
            sent++;
        } catch (e) {
            console.error('[monthly-report] Mail an', r.name, 'fehlgeschlagen:', e.message);
            skipped++;
        }
    }
    console.log('[monthly-report] ' + monat + ' sent=' + sent + ' skipped=' + skipped);
    return { statusCode: 200, body: monat + ' sent=' + sent + ' skipped=' + skipped };
};

exports._intern = { vormonat: vormonat, folgemonat: folgemonat, berlinMitternacht: berlinMitternacht, monatsZahlen: monatsZahlen, mailHtml: mailHtml };
