// OHNE SUPABASE_URL BEI NETLIFY MUSS JEDE FUNCTION TROTZDEM LAUFEN.
//
// Gemessen am 14.10.2026 (Netlify-Protokolle, 7 Tage): pending-reminder --
// der Melder, der den Wirt bei einer neuen Reservierung anpingt -- endete
// 29.968 Mal mit 500. Kein einziger Lauf ging durch. Supabase sah nicht eine
// Abfrage von ihm. Ursache: SUPABASE_URL steht bei Netlify NICHT in den
// Umgebungsvariablen, und die Function brach bei "ENV fehlt" sofort ab.
// Dasselbe bei waechter, review-push, loyalty-push, push-send.
//
// Die uebrigen Functions hatten laengst eine Ersatz-Adresse. Dieser Test
// fordert sie fuer ALLE ein -- und fuehrt den Melder ohne SUPABASE_URL aus.
'use strict';
var fs = require('fs'), path = require('path'), Module = require('module');
var FN = path.join(__dirname, '..', 'netlify', 'functions');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

// 1. Keine Function liest SUPABASE_URL ohne Ersatz.
var dateien = fs.readdirSync(FN).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return path.join(FN, f); })
    .concat(fs.readdirSync(path.join(FN, 'lib')).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return path.join(FN, 'lib', f); }));
var ohne = [];
dateien.forEach(function (d) {
    var s; try { s = fs.readFileSync(d, 'utf8'); } catch (e) { return; }
    var re = /process\.env\.SUPABASE_URL(?!\s*\|\|)/g, m;
    while ((m = re.exec(s))) {
        // erlaubt: "basisUrl || process.env.SUPABASE_URL || '...'" -- dann steht danach ein ||
        ohne.push(path.relative(FN, d) + ':' + s.slice(0, m.index).split('\n').length);
    }
});
t('jede Function hat eine Ersatz-Adresse für SUPABASE_URL', ohne.length === 0, ohne.join(', '));

// 2. Der Melder, ausgeführt OHNE SUPABASE_URL (wie bei Netlify).
var echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () { return { statusCode: 201 }; } };
    return echtLaden.apply(this, arguments);
};
delete process.env.SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = 'dienst';
process.env.VAPID_PUBLIC = 'pub';
process.env.VAPID_PRIVATE = 'priv';
var aufrufe = [];
global.fetch = async function (url) {
    aufrufe.push(String(url));
    return { ok: true, status: 200, json: async function () { return []; }, text: async function () { return '[]'; } };
};
(async function () {
    var pfad = path.join(FN, 'pending-reminder.js');
    delete require.cache[require.resolve(pfad)];
    var M = require(pfad);
    var r = await M.handler({});
    t('Melder ohne SUPABASE_URL: läuft durch (200), nicht 500', r.statusCode === 200, r.statusCode + ' ' + r.body);
    t('und fragt die richtige Datenbank', aufrufe.length > 0 && aufrufe.every(function (u) { return u.indexOf('https://mvrgmbdokdzmumdyezha.supabase.co/rest/v1/') === 0; }), aufrufe.slice(0, 2).join(' | '));
    // Eine Adresse MIT /rest/v1 oder Schrägstrich am Ende darf nicht doppelt werden.
    process.env.SUPABASE_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co/rest/v1/';
    aufrufe = [];
    delete require.cache[require.resolve(pfad)];
    await require(pfad).handler({});
    t('SUPABASE_URL mit "/rest/v1/" am Ende wird nicht doppelt', aufrufe.length > 0 && aufrufe.every(function (u) { return (u.match(/rest\/v1/g) || []).length === 1 && u.indexOf('.co/rest/v1/') > 0; }), aufrufe[0]);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
