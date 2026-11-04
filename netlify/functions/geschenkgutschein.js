// Kiek mol in -- GESCHENKGUTSCHEINE (03.11.2026).
//
// Ibo: "ja mach gutschein mit schoenen design". Ein Gast kauft auf der
// Lokalseite einen Gutschein, bezahlt mit PayPal und bekommt einen Code zum
// Verschenken. Der Wirt loest ihn im Lokal ein, auch in Teilbetraegen.
//
// DAS GELD GEHT DIREKT AN DEN WIRT -- mit den Zugangsdaten SEINES PayPal-
// Kontos (paypal_konten), genau wie paypal-zahlung.js. Ueber Kurani Design
// laeuft kein fremdes Geld.
//
// KEIN GUTSCHEIN OHNE GELD, KEIN GELD OHNE GUTSCHEIN:
//   anlegen  -> PayPal-Zahlung anlegen (es entsteht noch kein Gutschein)
//   buchen   -> Zahlung abholen, Status UND Betrag pruefen, DANN Gutschein.
//               Zweimal buchen (Zurueck-Taste) liefert denselben Gutschein.
//               Bezahlt, aber nicht gespeichert -> laut (restaurant_events).
//
// Aktionen (POST, JSON { action, ... }):
//   info       { r }                         -> kann dieses Lokal verkaufen?
//   anlegen    { r, betrag }                  -> { id } (PayPal-Auftrag)
//   buchen     { r, paypal_id, betrag, empfaenger, nachricht, kaeufer_name, kaeufer_email, motiv }
//   ansehen    { code }                       -> Gutschein (ohne Kaeufer-Mail)
//   liste      { r }      (angemeldet, Lokal) -> alle Gutscheine des Lokals
//   einloesen  { r, code, betrag } (angemeldet, Lokal)
//   vorort     { r, betrag, zahlart: bar|karte, empfaenger, nachricht, kaeufer_name, kaeufer_email, motiv }
//              (angemeldet, Lokal) -- der Gast kauft im Lokal und zahlt dort.
//              Kein PayPal, kein Online-Schalter noetig: das Geld hat der Wirt
//              schon in der Kasse. Gleicher Gutschein, gleicher Code, gleiches Einloesen.
//
// Tabelle: datenbank/51-geschenkgutscheine.sql. Tests: tests/geschenkgutschein-test.js.
'use strict';

var crypto = require('crypto');
var ZAHLSPERRE = require('./lib/zahlsperre');
var VERWALTER = require('./lib/verwalter');
var MAIL = require('./lib/mail-rahmen');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var KEY = process.env.SUPABASE_SERVICE_KEY || '';
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';

var BETRAG_MIN = 10, BETRAG_MAX = 300;
var MOTIVE = { klassisch: 1, festlich: 1, geburtstag: 1, danke: 1 };
var FEATURE = 'geschenkgutschein';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf(extra) { return Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY }, extra || {}); }

async function hol(pfad) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: kopf() });
    var t = await res.text();
    if (!res.ok) {
        var e = new Error(pfad.split('?')[0] + ': HTTP ' + res.status);
        e.status = res.status; e.text = t;
        throw e;
    }
    return t ? JSON.parse(t) : [];
}
// Fehlt die Tabelle (SQL 51 nicht eingespielt)? Dann sagen wir es -- und
// kassieren vor allem NICHTS.
function tabelleFehlt(e) { return !!(e && /geschenkgutscheine/.test(String(e.text || '')) && /does not exist|not find|PGRST205/i.test(String(e.text || ''))); }

// ---------------------------------------------------------------------
// Reine Helfer (im Test ausgefuehrt)
// ---------------------------------------------------------------------
// Ohne 0/O/1/I/L: wird vorgelesen und abgetippt. 31 Zeichen ^ 8 = rund 40 Bit
// -- raten ist aussichtslos (eine Billion Moeglichkeiten).
var ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function neuerCode(zufall) {
    zufall = zufall || function (n) { return crypto.randomInt(n); };
    var s = '';
    for (var i = 0; i < 8; i++) s += ZEICHEN.charAt(zufall(ZEICHEN.length));
    return 'KIN-' + s.slice(0, 4) + '-' + s.slice(4);
}
// Was der Wirt eintippt: klein, mit Leerzeichen, ohne Striche, O statt 0 ...
function codeNormal(roh) {
    var s = String(roh || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('KIN') === 0) s = s.slice(3);
    if (s.length !== 8 || /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/.test(s)) return '';
    return 'KIN-' + s.slice(0, 4) + '-' + s.slice(4);
}
function betragOk(b) {
    var z = Number(b);
    return isFinite(z) && Math.round(z) === z && z >= BETRAG_MIN && z <= BETRAG_MAX;
}
function betragStr(n) { var z = Number(n); if (!isFinite(z) || z < 0) z = 0; return z.toFixed(2); }
// 3 Jahre bis Jahresende (Regelverjaehrung).
function gueltigBis(jetzt) {
    var j = (jetzt || new Date()).getFullYear() + 3;
    return j + '-12-31';
}
function text(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function mailOk(e) { return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/.test(e) && e.length <= 120; }
// Was ein Gast ueber einen Code erfaehrt: nie die Kaeufer-Mail.
function oeffentlich(g, rest) {
    return {
        code: g.code, betrag: Number(g.betrag), rest: Number(g.rest), status: g.status,
        empfaenger: g.empfaenger_name || '', nachricht: g.nachricht || '', von: g.kaeufer_name || '',
        motiv: g.motiv || 'klassisch', gueltig_bis: g.gueltig_bis, erstellt: g.erstellt,
        lokal: rest ? { id: rest.id, name: rest.name, slug: rest.slug || '', city: rest.city || '', logo_url: rest.logo_url || '' } : null
    };
}
// Einloesen: neuer Rest und Status. Fehler als Text, sonst null.
function einloesePlan(g, betrag, heute) {
    var b = Math.round(Number(betrag) * 100) / 100;
    if (!g) return { fehler: 'Diesen Gutschein gibt es bei euch nicht.' };
    if (g.status === 'storniert') return { fehler: 'Dieser Gutschein wurde storniert.' };
    if (g.status === 'eingeloest' || Number(g.rest) <= 0) return { fehler: 'Dieser Gutschein ist schon ganz eingelöst.' };
    if (String(g.gueltig_bis) < heute) return { fehler: 'Dieser Gutschein ist abgelaufen (gültig bis ' + g.gueltig_bis + ').' };
    if (!isFinite(b) || b <= 0) return { fehler: 'Bitte einen Betrag eingeben.' };
    var rest = Math.round(Number(g.rest) * 100) / 100;
    if (b > rest) return { fehler: 'Auf dem Gutschein sind nur noch ' + betragStr(rest).replace('.', ',') + ' € – mehr geht nicht.' };
    var neu = Math.round((rest - b) * 100) / 100;
    return { betrag: b, alterRest: rest, rest: neu, status: neu <= 0 ? 'eingeloest' : 'aktiv' };
}

// ---------------------------------------------------------------------
// PayPal -- das Konto des Lokals (gleiche Tabelle wie paypal-zahlung.js)
// ---------------------------------------------------------------------
async function konto(rid) {
    var rows = await hol('paypal_konten?restaurant_id=eq.' + encodeURIComponent(rid) + '&select=client_id,secret,live&limit=1');
    if (!rows.length || !rows[0].client_id || !rows[0].secret) return null;
    var k = rows[0];
    k.basis = k.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    return k;
}
async function ppToken(k) {
    var res = await fetch(k.basis + '/v1/oauth2/token', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(k.client_id + ':' + k.secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
    });
    var t = await res.text();
    if (!res.ok) throw new Error('PayPal-Anmeldung fehlgeschlagen (' + res.status + ')');
    return JSON.parse(t).access_token;
}

async function lokal(rid) {
    var r = await hol('restaurants?id=eq.' + encodeURIComponent(rid) + '&select=id,name,slug,city,street,email,logo_url,features,is_active&limit=1');
    return r[0] || null;
}
function verkauftAn(rest) {
    return !!(rest && rest.is_active !== false && Array.isArray(rest.features) && rest.features.indexOf(FEATURE) >= 0);
}

// Wer ist angemeldet, und zu welchen Lokalen gehoert er? (Superadmin: alle)
async function darfLokal(event, rid) {
    var tok = VERWALTER.token(event);
    if (!tok) return false;
    if (await VERWALTER.istSuperadmin(tok, KEY)) return true;
    var u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + tok } });
    if (!u.ok) return false;
    var n = await u.json();
    if (!n || !n.email) return false;
    var rows = await hol('customers?email=ilike.' + encodeURIComponent(String(n.email).trim()) + '&is_active=eq.true&select=restaurant_id');
    return rows.some(function (z) { return z.restaurant_id === rid; });
}

// Neuen Gutschein speichern -- mit frischem Code; bei doppeltem Code (sehr
// selten) noch einmal. Rueckgabe { zeile } oder { fehler, status, text }.
async function einfuegen(neu) {
    var letzter = '', status = 0;
    for (var v = 0; v < 4; v++) {
        neu.code = neuerCode();
        var ins = await fetch(SUPABASE_URL + '/rest/v1/geschenkgutscheine', {
            method: 'POST', headers: kopf({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(neu)
        });
        letzter = await ins.text(); status = ins.status;
        if (ins.ok) { var z = null; try { z = JSON.parse(letzter)[0]; } catch (e) {} return z ? { zeile: z } : { fehler: true, status: status, text: 'leere Antwort' }; }
        if (ins.status !== 409 || /paypal_order_id/.test(letzter)) break;
    }
    return { fehler: true, status: status, text: letzter };
}
// Vor Ort: Betrag in Euro und Cent, 5 bis 500.
function betragVorOrt(b) { var z = Math.round(Number(String(b == null ? '' : b).replace(',', '.')) * 100) / 100; return isFinite(z) && z >= 5 && z <= 500 ? z : null; }

// Der Gutschein IN der Mail: Tabellen und Inline-Farben (Outlook/Gmail),
// Farben wie auf der Karte. Motiv Geburtstag/Danke: helle Karte, dunkle Schrift.
var MAIL_MOTIV = {
    klassisch: ['#003d33', '#fbf6e9', '#e9c866', 'rgba(251,246,233,0.75)'],
    festlich: ['#5b1a1a', '#fff6ea', '#e9c866', 'rgba(255,246,234,0.78)'],
    geburtstag: ['#f6c544', '#00251e', '#00483c', 'rgba(0,37,30,0.72)'],
    danke: ['#f3ecdc', '#00251e', '#8a6a1c', 'rgba(0,37,30,0.66)']
};
function mailKarte(g, rest) {
    var f = MAIL_MOTIV[g.motiv] || MAIL_MOTIV.klassisch, E = MAIL.esc, serif = "Georgia,'Times New Roman',serif", sans = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
    var betrag = betragStr(g.betrag).replace('.', ',').replace(',00', '') + '&nbsp;€';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:separate;"><tr>'
        + '<td bgcolor="' + f[0] + '" style="background:' + f[0] + ';border-radius:16px;padding:0;border:1px solid ' + f[2] + ';">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="padding:22px 22px 20px;vertical-align:top;">'
        + '<div style="font-family:' + sans + ';font-size:11px;font-weight:700;letter-spacing:4px;color:' + f[2] + ';">GUTSCHEIN</div>'
        + '<div style="font-family:' + sans + ';font-size:11px;font-weight:700;letter-spacing:2px;color:' + f[3] + ';margin-top:3px;">' + E(String(rest.name || '').toUpperCase()) + '</div>'
        + '<div style="font-family:' + serif + ';font-size:52px;line-height:1;font-weight:700;color:' + f[1] + ';margin-top:16px;">' + betrag + '</div>'
        + (g.empfaenger_name ? '<div style="font-family:' + serif + ';font-size:18px;font-style:italic;color:' + f[1] + ';margin-top:10px;">für <b style="font-style:normal;">' + E(g.empfaenger_name) + '</b></div>' : '')
        + (g.nachricht ? '<div style="font-family:' + serif + ';font-size:14px;font-style:italic;color:' + f[3] + ';margin-top:6px;">„' + E(g.nachricht) + '“' + (g.kaeufer_name ? '<br>– ' + E(g.kaeufer_name) : '') + '</div>' : '')
        + '</td>'
        + '<td width="150" style="width:150px;padding:18px 14px;border-left:2px dashed ' + f[3] + ';text-align:center;vertical-align:middle;">'
        + '<div style="font-family:' + serif + ';font-size:40px;font-weight:700;color:' + f[2] + ';line-height:1;">' + E(String(rest.name || 'K').trim().charAt(0).toUpperCase()) + '</div>'
        + '<div style="font-family:' + sans + ';font-size:9px;font-weight:700;letter-spacing:3px;color:' + f[3] + ';margin-top:12px;">CODE</div>'
        + '<div style="font-family:Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:' + f[1] + ';margin-top:4px;">' + E(g.code) + '</div>'
        + '<div style="font-family:' + sans + ';font-size:10px;color:' + f[3] + ';margin-top:8px;">gültig bis ' + E(g.gueltig_bis.split('-').reverse().join('.')) + '</div>'
        + '</td></tr></table></td></tr></table>';
}
async function mailSchicken(g, rest) {
    if (!RESEND_API_KEY || !g.kaeufer_email) return false;
    var url = MAIL.SITE + '/?gutschein=' + encodeURIComponent(g.code);
    var betrag = betragStr(g.betrag).replace('.', ',') + ' €';
    var vorOrt = g.verkauft_ueber === 'bar' || g.verkauft_ueber === 'karte';
    var inhalt = '<p style="margin:0 0 4px;">' + (vorOrt ? 'Danke für deinen Besuch bei ' + MAIL.esc(rest.name) + '!' : 'Danke für deinen Kauf!') + ' Hier ist dein Gutschein'
        + (g.empfaenger_name ? ' für <b>' + MAIL.esc(g.empfaenger_name) + '</b>' : '') + ' – zum Ausdrucken (21 × 10 cm) oder Weiterschicken.</p>'
        + mailKarte(g, rest)
        + MAIL.knopf('Gutschein ansehen, drucken &amp; teilen', url, 'voll')
        + MAIL.kasten('<b>So löst du ihn ein:</b> Bei ' + MAIL.esc(rest.name) + ' den Code zeigen oder sagen. Der Betrag wird von der Rechnung abgezogen – was übrig bleibt, gilt für den nächsten Besuch. '
            + (vorOrt ? 'Bezahlt im Lokal.' : 'Bezahlt per PayPal an ' + MAIL.esc(rest.name) + '.'), 'gruen');
    var body = Object.assign(MAIL.versandKopf(rest, EMAIL_FROM), {
        to: [g.kaeufer_email],
        subject: 'Dein Gutschein für ' + rest.name + ' (' + betrag + ')',
        html: MAIL.rahmen({ lokal: rest, titel: 'Dein Gutschein über ' + betrag, inhalt: inhalt, vorschau: 'Code ' + g.code + ' · gültig bis ' + g.gueltig_bis, titelText: 'Gutschein' })
    });
    try {
        var res = await MAIL.senden(RESEND_API_KEY, body, EMAIL_FROM);
        if (!res.ok) { console.error('[gutschein] Mail nicht verschickt: HTTP ' + res.status); return false; }
        return true;
    } catch (e) { console.error('[gutschein] Mail-Fehler: ' + e.message); return false; }
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST.' });
    if (!KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet.' });
    var b = {};
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungültige Anfrage.' }); }
    var aktion = String(b.action || '');
    var rid = String(b.r || '');

    try {
        // ---------------- Gutschein per Code ansehen (Gast, Empfaenger) ----------------
        if (aktion === 'ansehen') {
            var c = codeNormal(b.code);
            if (!c) return json(400, { ok: false, error: 'Dieser Code sieht nicht richtig aus.' });
            var gs = await hol('geschenkgutscheine?code=eq.' + encodeURIComponent(c) + '&select=*&limit=1');
            if (!gs.length) return json(404, { ok: false, error: 'Diesen Gutschein gibt es nicht.' });
            var rest0 = await lokal(gs[0].restaurant_id);
            return json(200, { ok: true, gutschein: oeffentlich(gs[0], rest0) });
        }

        if (!/^[0-9a-f-]{20,}$/i.test(rid)) return json(400, { ok: false, error: 'Lokal fehlt.' });

        // ---------------- Kann dieses Lokal Gutscheine verkaufen? ----------------
        if (aktion === 'info') {
            var r1 = await lokal(rid);
            if (!verkauftAn(r1)) return json(200, { ok: true, aktiv: false, grund: 'aus' });
            var k1 = await konto(rid);
            if (!k1) return json(200, { ok: true, aktiv: false, grund: 'kein_paypal' });
            try { await hol('geschenkgutscheine?select=id&limit=1'); }
            catch (e) { if (tabelleFehlt(e)) return json(200, { ok: true, aktiv: false, grund: 'sql51' }); throw e; }
            return json(200, { ok: true, aktiv: true, client_id: k1.client_id, live: !!k1.live, min: BETRAG_MIN, max: BETRAG_MAX, lokal: { name: r1.name, city: r1.city || '' } });
        }

        // ---------------- 1. PayPal-Zahlung anlegen ----------------
        if (aktion === 'anlegen') {
            if (!betragOk(b.betrag)) return json(400, { ok: false, error: 'Bitte einen Betrag von ' + BETRAG_MIN + ' bis ' + BETRAG_MAX + ' € in ganzen Euro wählen.' });
            var r2 = await lokal(rid);
            if (!verkauftAn(r2)) return json(409, { ok: false, error: 'Dieses Lokal verkauft gerade keine Gutscheine.' });
            var sperre = await ZAHLSPERRE.pruefe(rid, 'bestellen', KEY);
            if (!sperre.erlaubt) return ZAHLSPERRE.abweisung(sperre, CORS);
            try { await hol('geschenkgutscheine?select=id&limit=1'); }
            catch (e) { if (tabelleFehlt(e)) return json(409, { ok: false, error: 'Gutscheine sind bei diesem Lokal noch nicht eingerichtet. Es wurde nichts abgebucht.' }); throw e; }
            var k2 = await konto(rid);
            if (!k2) return json(409, { ok: false, error: 'Für dieses Lokal ist PayPal nicht eingerichtet.', code: 'kein_konto' });
            var tk = await ppToken(k2);
            var res = await fetch(k2.basis + '/v2/checkout/orders', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intent: 'CAPTURE',
                    purchase_units: [{ amount: { currency_code: 'EUR', value: betragStr(b.betrag) }, description: ('Gutschein ' + r2.name).slice(0, 127) }],
                    payment_source: { paypal: { experience_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', brand_name: String(r2.name || 'Kiek mol in').slice(0, 127) } } }
                })
            });
            var t2 = await res.text();
            if (!res.ok) { console.error('[gutschein] anlegen: ' + res.status + ' ' + t2.slice(0, 300)); return json(502, { ok: false, error: 'PayPal hat die Zahlung nicht angenommen (' + res.status + ').' }); }
            return json(200, { ok: true, id: JSON.parse(t2).id });
        }

        // ---------------- 2. Zahlung abholen, DANN Gutschein ----------------
        if (aktion === 'buchen') {
            var pid = String(b.paypal_id || '');
            if (!pid) return json(400, { ok: false, error: 'paypal_id fehlt.' });
            if (!betragOk(b.betrag)) return json(400, { ok: false, error: 'Betrag fehlt.' });
            // Zweiter Aufruf (Zurueck-Taste, Neuladen): denselben Gutschein zurueck.
            var da = await hol('geschenkgutscheine?paypal_order_id=eq.' + encodeURIComponent(pid) + '&select=*&limit=1');
            var r3 = await lokal(rid);
            if (da.length) return json(200, { ok: true, doppelt: true, gutschein: oeffentlich(da[0], r3) });
            var k3 = await konto(rid);
            if (!k3) return json(409, { ok: false, error: 'Für dieses Lokal ist PayPal nicht eingerichtet.' });
            var tk3 = await ppToken(k3);
            var cap = await fetch(k3.basis + '/v2/checkout/orders/' + encodeURIComponent(pid) + '/capture', {
                method: 'POST', headers: { Authorization: 'Bearer ' + tk3, 'Content-Type': 'application/json' }
            });
            var capTxt = await cap.text(), capObj = null;
            try { capObj = JSON.parse(capTxt); } catch (e) {}
            if (!cap.ok) {
                // Schon abgeholt: nachsehen statt raten -- erst dann gilt der Betrag.
                if (/ORDER_ALREADY_CAPTURED/i.test(capTxt)) {
                    var chk = await fetch(k3.basis + '/v2/checkout/orders/' + encodeURIComponent(pid), { headers: { Authorization: 'Bearer ' + tk3 } });
                    capObj = chk.ok ? await chk.json() : null;
                } else {
                    console.error('[gutschein] buchen: ' + cap.status + ' ' + capTxt.slice(0, 300));
                    return json(402, { ok: false, error: 'Die Zahlung wurde von PayPal nicht abgeschlossen. Es wurde nichts abgebucht.' });
                }
            }
            var einheit = capObj && capObj.purchase_units && capObj.purchase_units[0];
            var zahlung = einheit && einheit.payments && einheit.payments.captures && einheit.payments.captures[0];
            if (!capObj || capObj.status !== 'COMPLETED' || !zahlung) return json(402, { ok: false, error: 'Die Zahlung ist bei PayPal nicht abgeschlossen.' });
            if (zahlung.amount.currency_code !== 'EUR' || betragStr(zahlung.amount.value) !== betragStr(b.betrag)) {
                console.error('[gutschein] Betrag weicht ab: bezahlt ' + zahlung.amount.value + ' ' + zahlung.amount.currency_code + ', erwartet ' + betragStr(b.betrag));
                return json(409, { ok: false, bezahlt: true, paypal_id: pid, error: 'Der bezahlte Betrag (' + zahlung.amount.value + ' ' + zahlung.amount.currency_code + ') passt nicht zum Gutschein. Bitte melde dich beim Lokal und nenne: ' + pid });
            }
            var email = text(b.kaeufer_email, 120).toLowerCase();
            var neu = {
                restaurant_id: rid, betrag: Number(betragStr(zahlung.amount.value)), rest: Number(betragStr(zahlung.amount.value)), status: 'aktiv',
                kaeufer_name: text(b.kaeufer_name, 60) || null, kaeufer_email: mailOk(email) ? email : null,
                empfaenger_name: text(b.empfaenger, 60) || null, nachricht: text(b.nachricht, 200) || null,
                motiv: MOTIVE[b.motiv] ? b.motiv : 'klassisch', paypal_order_id: pid, paypal_capture_id: zahlung.id || null,
                gueltig_bis: gueltigBis()
            };
            neu.verkauft_ueber = 'online';
            var erg = await einfuegen(neu), zeile = erg.zeile || null, letzter = erg.text || '';
            if (!zeile && erg.status === 409 && /paypal_order_id/.test(letzter)) {
                var d2 = await hol('geschenkgutscheine?paypal_order_id=eq.' + encodeURIComponent(pid) + '&select=*&limit=1');
                if (d2.length) return json(200, { ok: true, doppelt: true, gutschein: oeffentlich(d2[0], r3) });
            }
            if (!zeile) {
                // DER SCHLIMMSTE FALL: Geld ist da, Gutschein nicht. Laut.
                console.error('[gutschein] BEZAHLT ABER NICHT GESPEICHERT: ' + pid + ' ' + letzter.slice(0, 300));
                try {
                    await fetch(SUPABASE_URL + '/rest/v1/restaurant_events', {
                        method: 'POST', headers: kopf({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
                        body: JSON.stringify({ restaurant_id: rid, type: 'gutschein_bezahlt_ohne_gutschein',
                            message: 'Ein Gast hat einen Gutschein über ' + betragStr(b.betrag) + ' € per PayPal bezahlt, der Gutschein konnte aber NICHT gespeichert werden. PayPal-Vorgang: ' + pid,
                            payload: { paypal_id: pid, betrag: betragStr(b.betrag), email: neu.kaeufer_email } })
                    });
                } catch (e) {}
                return json(500, { ok: false, bezahlt: true, paypal_id: pid, error: 'Deine Zahlung ist angekommen, aber der Gutschein konnte nicht gespeichert werden. Das Lokal wurde benachrichtigt – bitte nenne diese Nummer: ' + pid });
            }
            var gemailt = await mailSchicken(zeile, r3);
            return json(200, { ok: true, gutschein: oeffentlich(zeile, r3), mail: gemailt });
        }

        // ---------------- Ab hier nur fuer Leute dieses Lokals ----------------
        if (aktion === 'liste' || aktion === 'einloesen' || aktion === 'vorort') {
            if (!(await darfLokal(event, rid))) return json(403, { ok: false, error: 'Nicht angemeldet oder kein Zugriff auf dieses Lokal.' });
            if (aktion === 'vorort') {
                var bv = betragVorOrt(b.betrag);
                if (bv == null) return json(400, { ok: false, error: 'Bitte einen Betrag von 5 bis 500 € eingeben.' });
                var zahlart = b.zahlart === 'bar' || b.zahlart === 'karte' ? b.zahlart : '';
                if (!zahlart) return json(400, { ok: false, error: 'Bitte angeben, wie der Gast bezahlt hat (bar oder Karte).' });
                var mv = text(b.kaeufer_email, 120).toLowerCase();
                var rv = await lokal(rid);
                var erg2 = await einfuegen({
                    restaurant_id: rid, betrag: bv, rest: bv, status: 'aktiv', verkauft_ueber: zahlart,
                    kaeufer_name: text(b.kaeufer_name, 60) || null, kaeufer_email: mailOk(mv) ? mv : null,
                    empfaenger_name: text(b.empfaenger, 60) || null, nachricht: text(b.nachricht, 200) || null,
                    motiv: MOTIVE[b.motiv] ? b.motiv : 'klassisch', gueltig_bis: gueltigBis()
                });
                if (!erg2.zeile) {
                    console.error('[gutschein] vor Ort nicht gespeichert: ' + erg2.status + ' ' + String(erg2.text).slice(0, 200));
                    if (/verkauft_ueber|geschenkgutscheine/.test(String(erg2.text))) return json(409, { ok: false, sqlFehlt: true, error: 'Bitte einmal datenbank/51-geschenkgutscheine.sql in Supabase einspielen.' });
                    return json(502, { ok: false, error: 'Nicht gespeichert (' + erg2.status + ') – bitte noch einmal versuchen.' });
                }
                var gm = erg2.zeile.kaeufer_email ? await mailSchicken(erg2.zeile, rv) : null;
                return json(200, { ok: true, gutschein: oeffentlich(erg2.zeile, rv), mail: gm });
            }
            var liste;
            try {
                if (aktion === 'liste') {
                    liste = await hol('geschenkgutscheine?restaurant_id=eq.' + encodeURIComponent(rid) + '&select=*&order=erstellt.desc&limit=500');
                    return json(200, { ok: true, gutscheine: liste });
                }
                var c2 = codeNormal(b.code);
                if (!c2) return json(400, { ok: false, error: 'Dieser Code sieht nicht richtig aus (Form: KIN-XXXX-XXXX).' });
                liste = await hol('geschenkgutscheine?code=eq.' + encodeURIComponent(c2) + '&restaurant_id=eq.' + encodeURIComponent(rid) + '&select=*&limit=1');
            } catch (e) {
                if (tabelleFehlt(e)) return json(409, { ok: false, sqlFehlt: true, error: 'Bitte einmal datenbank/51-geschenkgutscheine.sql in Supabase einspielen.' });
                throw e;
            }
            var g = liste[0];
            var heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
            var plan = einloesePlan(g, b.betrag, heute);
            if (plan.fehler) return json(409, { ok: false, error: plan.fehler, gutschein: g ? { code: g.code, rest: Number(g.rest), betrag: Number(g.betrag), status: g.status } : null });
            var buchung = (Array.isArray(g.einloesungen) ? g.einloesungen : []).concat([{ betrag: plan.betrag, rest: plan.rest, zeit: new Date().toISOString() }]);
            // In EINEM Schritt, nur wenn der Rest noch der alte ist -- zwei
            // Kassen gleichzeitig koennen nicht beide abbuchen.
            var up = await fetch(SUPABASE_URL + '/rest/v1/geschenkgutscheine?id=eq.' + encodeURIComponent(g.id) + '&rest=eq.' + betragStr(plan.alterRest) + '&status=eq.aktiv', {
                method: 'PATCH', headers: kopf({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
                body: JSON.stringify({ rest: plan.rest, status: plan.status, einloesungen: buchung, geaendert: new Date().toISOString() })
            });
            var upZ = []; try { upZ = await up.json(); } catch (e) {}
            if (!up.ok || !Array.isArray(upZ) || !upZ.length) return json(409, { ok: false, error: 'Nicht eingelöst – der Gutschein wurde gerade woanders geändert. Bitte noch einmal versuchen.' });
            return json(200, { ok: true, eingeloest: plan.betrag, rest: plan.rest, status: plan.status, code: g.code });
        }

        return json(400, { ok: false, error: 'Unbekannte Aktion.' });
    } catch (e) {
        console.error('[gutschein] ' + (e && e.stack || e));
        if (tabelleFehlt(e)) return json(409, { ok: false, sqlFehlt: true, error: 'Gutscheine sind noch nicht eingerichtet (SQL 51). Es wurde nichts abgebucht.' });
        return json(500, { ok: false, error: 'Gerade nicht möglich. Es wurde nichts abgebucht.' });
    }
};

exports._test = { betragVorOrt: betragVorOrt, neuerCode: neuerCode, codeNormal: codeNormal, betragOk: betragOk, gueltigBis: gueltigBis, oeffentlich: oeffentlich, einloesePlan: einloesePlan, verkauftAn: verkauftAn };
