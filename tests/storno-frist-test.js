// ABSAGEN NUR BIS X STUNDEN VORHER, DANACH TELEFONISCH (29.10.2026).
// Ibo: "koennen nicht 2 Stunden vor der Reservierung absagen, nur telefonisch"
// / "soll jeder selber machen" / "Bestaetigungs-Mails ... und Erinnerungs-Mail".
// Der Test FUEHRT die Regel, die Absage-Funktion und beide Mails aus.
'use strict';
process.env.TZ = 'Europe/Berlin';
process.env.SUPABASE_SERVICE_KEY = 'dienst';
var path = require('path'), fs = require('fs');
var FN = path.join(__dirname, '..', 'netlify', 'functions');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
var F = require(path.join(FN, 'lib', 'storno-frist.js'));

// ---- 1. Die Regel ----
t('ohne Eintrag: 2 Stunden', F.fristStunden([]) === 2 && F.fristStunden(null) === 2, F.fristStunden([]));
t('eingestellt: 24 Stunden', F.fristStunden(['x', 'storno_frist:24']) === 24, '');
t('0 = jederzeit', F.fristStunden(['storno_frist:0']) === 0, '');
t('Unsinn (999) -> Standard', F.fristStunden(['storno_frist:999']) === 2, '');
t('Winterzeit: 31.10. 19:30 Berlin = 18:30 UTC', new Date(F.berlinZeitpunkt('2026-10-31', '19:30')).toISOString() === '2026-10-31T18:30:00.000Z', '');
t('Sommerzeit: 15.07. 19:30 Berlin = 17:30 UTC', new Date(F.berlinZeitpunkt('2026-07-15', '19:30:00')).toISOString() === '2026-07-15T17:30:00.000Z', '');
var tisch = F.berlinZeitpunkt('2026-10-31', '19:30');
t('3 Std vorher: online ok', F.darfOnline('2026-10-31', '19:30', [], '0151 1', tisch - 3 * 3600000) === true, '');
t('1 Std vorher (Frist 2): nur telefonisch', F.darfOnline('2026-10-31', '19:30', [], '0151 1', tisch - 3600000) === false, '');
t('Frist 0: auch 10 Min vorher online', F.darfOnline('2026-10-31', '19:30', ['storno_frist:0'], '0151 1', tisch - 600000) === true, '');
t('KEINE SACKGASSE: ohne Telefon immer online', F.darfOnline('2026-10-31', '19:30', ['storno_frist:24'], '', tisch - 600000) === true, '');

// ---- 2. Die Absage-Funktion ----
var lokal, reservierung, patches = [];
global.fetch = async function (url, opt) {
    url = String(url); opt = opt || {};
    function a(b) { return { ok: true, status: 200, json: async function () { return b; }, text: async function () { return ''; } }; }
    if (opt.method === 'PATCH') { patches.push(JSON.parse(opt.body)); return a([]); }
    if (/\/reservations\?id=eq\./.test(url)) return a([reservierung]);
    if (/\/restaurants\?id=eq\./.test(url)) return a([lokal]);
    if (/push_subscriptions/.test(url)) return a([]);
    return a([]);
};
var RC = require(path.join(FN, 'res-cancel.js'));
function inStunden(h) {
    var d = new Date(Date.now() + h * 3600000);
    var teile = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).forEach(function (p) { teile[p.type] = p.value; });
    return { reservation_date: teile.year + '-' + teile.month + '-' + teile.day, reservation_time: (teile.hour % 24 < 10 ? '0' : '') + (teile.hour % 24) + ':' + teile.minute + ':00' };
}
var ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
function aufruf(q) { return RC.handler({ queryStringParameters: Object.assign({ id: ID }, q) }); }

(async function () {
    lokal = { name: 'Lütt Italia', phone: '04941 12345', features: ['storno_frist:2'] };
    reservierung = Object.assign({ id: ID, status: 'confirmed', guest_name: 'Meyer', restaurant_id: 'r1' }, inStunden(1));
    patches = [];
    var r = await aufruf({ format: 'json' }), j = JSON.parse(r.body);
    t('1 Std vorher: NICHT abgesagt, nur telefonisch, mit Nummer', j.abgesagt === false && j.nurTelefon === true && j.telefon === '04941 12345' && patches.length === 0, r.body);
    r = await aufruf({});
    t('… aus der Mail: Seite mit Anruf-Knopf (tel:)', /Bitte kurz anrufen/.test(r.body) && /href="tel:0494112345"/.test(r.body) && patches.length === 0, '');
    t('… warme Funktion: nach einem JSON-Aufruf kommt wieder HTML (page nicht ueberschrieben)', /^<!doctype html>/.test(r.body), r.body.slice(0, 40));

    reservierung = Object.assign({ id: ID, status: 'confirmed', guest_name: 'Meyer', restaurant_id: 'r1' }, inStunden(5));
    r = await aufruf({ format: 'json', pruefen: '1' }); j = JSON.parse(r.body);
    t('Pruefen (App): geht noch, nichts storniert', j.nurTelefon === false && j.abgesagt === false && patches.length === 0, r.body);
    r = await aufruf({ format: 'json' }); j = JSON.parse(r.body);
    t('5 Std vorher: abgesagt (und gespeichert)', j.abgesagt === true && patches.length === 1 && patches[0].status === 'cancelled', r.body);

    lokal = { name: 'Ohne Nummer', phone: '', features: ['storno_frist:24'] };
    reservierung = Object.assign({ id: ID, status: 'confirmed', restaurant_id: 'r1' }, inStunden(1)); patches = [];
    j = JSON.parse((await aufruf({ format: 'json' })).body);
    t('ohne Telefonnummer: trotzdem online abgesagt (keine Sackgasse)', j.abgesagt === true && patches.length === 1, JSON.stringify(j));

    // ---- 3. Mails ----
    var OE = require(path.join(FN, 'order-email.js'));
    var L = { name: 'Lütt Italia', phone: '04941 12345', features: ['storno_frist:2'], street: 'Markt 1', city: 'Leer' };
    var weit = OE._baue.buildReservationEmail(Object.assign({ id: 'r1', party_size: 2, guest_name: 'A' }, inStunden(48)), L, 'confirmed').html;
    t('Bestätigung (Tisch in 2 Tagen): Absage-Knopf + "Online absagen geht bis …"', /res-cancel\?id=r1/.test(weit) && /Online absagen geht bis/.test(weit), '');
    var knapp = OE._baue.buildReservationEmail(Object.assign({ id: 'r2', party_size: 2, guest_name: 'A' }, inStunden(1)), L, 'confirmed').html;
    t('Bestätigung (Tisch in 1 Std): kein Absage-Link, Anruf-Knopf', !/res-cancel\?id=r2/.test(knapp) && /Anrufen: 04941 12345/.test(knapp), '');
    var rem = fs.readFileSync(path.join(FN, 'reservation-reminder.js'), 'utf8');
    t('Erinnerung: Absage-Kasten rechnet mit derselben Frist', /function absageKasten\(res, rest, cancelUrl, jetzt\)/.test(rem) && /FRIST\.spaetestens\(res\.reservation_date, res\.reservation_time, rest\.features, rest\.phone\)/.test(rem) && /reservation_date,reservation_time&limit=200/.test(rem) && /logo_url,features&limit=200/.test(rem), '');

    // ---- 4. App + Einstellung ----
    var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    t('App fragt VOR dem Grund-Dialog, ob online noch geht', /res-cancel\?format=json&pruefen=1&id=/.test(H) && H.indexOf('res-cancel?format=json&pruefen=1') < H.indexOf('var wahl = await absageGrundFragen();'), '');
    t('App meldet "abgesagt" nur, wenn der Server es sagt (nicht bloss HTTP 200)', /if \(!j \|\| j\.abgesagt !== true\) throw new Error/.test(H), '');
    t('Einstellung unter "Zeiten": jederzeit / 1 / 2 / 4 / 12 / 24 / 48 Std, speichert mit Rueckmeldung', /id="resStornoFrist"[^>]*onchange="stornoFristSpeichern\(this\.value\)"/.test(H) && /features\.push\('storno_frist:' \+ h\)/.test(H) && /Frist NICHT gespeichert/.test(H), '');
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
