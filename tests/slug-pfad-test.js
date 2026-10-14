// LOKAL-ADRESSEN: /<lokal>/bestellen und Bindestriche.
//
// Gemessen am 14.10.2026 (Supabase edge_logs): ein Gast kam ueber
// kiekmolin.de/rhodos-carolinensiel/bestellen. Gesucht wurde ein Lokal
// "rhodos-carolinensiel/bestellen", und die Abfrage brach mit 500 ab:
// aus "-c" wurde "%c", und "%ca" las der Server als kaputtes Sonderzeichen.
// Ausgefuehrt: checkRestaurantSlugURL und der Datenbank-Rueckfall.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

function oeffnetBei(pfad) {
    var geoeffnet = null;
    var window = { location: { search: '', pathname: pfad } };
    var APP_DATA = { restaurants: [{ id: 'x' }] };
    var f = new Function('window', 'APP_DATA', 'URLSearchParams', 'setInterval', 'clearInterval', 'setTimeout', 'openRestaurantBySlug', 'showOrderBon', 'showTvMenuBoard',
        fn('checkRestaurantSlugURL') + '; return checkRestaurantSlugURL;')(
        window, APP_DATA, URLSearchParams, function (cb) { cb(); return 1; }, function () {}, function () {},
        function (s) { geoeffnet = s; }, function () {}, function () {});
    f();
    return geoeffnet;
}
t('/rhodos-carolinensiel/bestellen öffnet "rhodos-carolinensiel"', oeffnetBei('/rhodos-carolinensiel/bestellen') === 'rhodos-carolinensiel', oeffnetBei('/rhodos-carolinensiel/bestellen'));
t('/luett-italia/speisekarte/ öffnet "luett-italia"', oeffnetBei('/luett-italia/speisekarte/') === 'luett-italia', oeffnetBei('/luett-italia/speisekarte/'));
t('/luett-italia bleibt "luett-italia"', oeffnetBei('/luett-italia') === 'luett-italia', oeffnetBei('/luett-italia'));
t('/impressum/ bleibt Systemseite (kein Lokal)', oeffnetBei('/impressum/') === null, oeffnetBei('/impressum/'));

(async function () {
    var url = null;
    var f = new Function('APP_DATA', 'cachedFetch', 'SUPA_URL', 'SUPA_KEY', 'kmiToken',
        fn('openRestaurantBySlug') + '; return openRestaurantBySlug;')(
        { restaurants: [] }, async function (u) { url = u; return { json: async function () { return []; } }; }, 'https://x.supabase.co', 'k', function () { return 'k'; });
    try { await f('Rhodos-Carolinensiel'); } catch (e) {}
    t('Rückfall-Abfrage ohne "%" (kein "%ca" mehr), Platzhalter "*"', url && url.indexOf('%ca') === -1 && /name\.ilike\.\*rhodos\*carolinensiel\*/.test(url), url);
    url = null;
    try { await f('a,b)(x'); } catch (e) {}
    t('fremde Zeichen fliegen raus (kein Einschleusen in die Abfrage)', url && !/[,()]/.test(decodeURIComponent(url.split('or=')[1]).replace(/^\(|\)&limit=1$/g, '').replace(/,name/, '')), url);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
