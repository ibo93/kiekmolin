// DASHBOARD: ANMELDUNG ABGELAUFEN -> NICHT STILL LEERE LISTEN ZEIGEN.
//
// Gemessen am 14.10.2026 (Supabase edge_logs): Lokal ebc6ed13 fragte aus
// einem Dashboard 94 Mal Reservierungen OHNE Anmeldung ab (Rolle anon) --
// Antwort 0 Zeilen (content-range */*). Mit Anmeldung: 5 Zeilen. Das
// Geraet zeigte "keine Reservierungen".
//
// kmiAngemeldet() gab es seit dem 26.08. fuer genau diesen Fall -- aufgerufen
// wurde es nirgends. Dieser Test FUEHRT die neue Anmelde-Wache aus.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

function welt() {
    var w = { banner: null, dashSichtbar: true, angemeldet: false, refreshGibt: null, refreshAufrufe: 0, neuGeladen: 0, gemeldet: 0 };
    var body = { appendChild: function (el) { w.banner = el; el.remove = function () { w.banner = null; }; } };
    var document = {
        body: body,
        getElementById: function (id) {
            if (id === 'kmiAbgemeldetBanner') return w.banner;
            if (id === 'dashboardView') return { style: { display: w.dashSichtbar ? '' : 'none' } };
            return null;
        },
        createElement: function () { return { style: {}, setAttribute: function () {} }; }
    };
    var window = {
        supabaseClient: { auth: { refreshSession: async function () { w.refreshAufrufe++; return { data: { session: w.refreshGibt } }; } } },
        resLoadReservations: function () { w.neuGeladen++; }
    };
    var getComputedStyle = function (el) { return { display: el.style.display === 'none' ? 'none' : 'block' }; };
    var kmiAngemeldet = function () { return w.angemeldet; };
    var kmiTokenSetzen = function (s) { if (s && s.access_token) w.angemeldet = true; };
    var meldeFehler = function () { w.gemeldet++; };
    var code = fn('dashboardSichtbar') + fn('dashboardNachAnmeldungNeuLaden') + 'var _anmeldeWacheLaeuft = false;' + fn('dashboardAnmeldungPruefen') + '; return dashboardAnmeldungPruefen;';
    w.pruefen = new Function('document', 'window', 'getComputedStyle', 'kmiAngemeldet', 'kmiTokenSetzen', 'meldeFehler', 'loadReservationsForRestaurant', 'loadOrdersForRestaurant', code)
        (document, window, getComputedStyle, kmiAngemeldet, kmiTokenSetzen, meldeFehler, undefined, undefined);
    return w;
}

(async function () {
    var w = welt();
    w.dashSichtbar = false;
    await w.pruefen();
    t('Gästeseite (kein Dashboard): kein Banner, kein Erneuern', w.banner === null && w.refreshAufrufe === 0, JSON.stringify({ b: !!w.banner, r: w.refreshAufrufe }));

    w = welt(); w.angemeldet = true;
    await w.pruefen();
    t('Dashboard, angemeldet: kein Banner, kein Erneuern', w.banner === null && w.refreshAufrufe === 0, '');

    w = welt(); w.refreshGibt = { access_token: 'neu', expires_in: 3600 };
    await w.pruefen();
    t('Dashboard, abgelaufen, Erneuern klappt: still erneuert, kein Banner', w.banner === null && w.refreshAufrufe === 1 && w.angemeldet === true, JSON.stringify({ b: !!w.banner, r: w.refreshAufrufe }));

    w = welt(); w.refreshGibt = null;
    await w.pruefen();
    t('Dashboard, abgelaufen, Erneuern scheitert: rotes Banner (statt leerer Listen)', w.banner && /Anmeldung abgelaufen/.test(w.banner.innerHTML) && /nicht<\/b> geladen/.test(w.banner.innerHTML), w.banner && w.banner.innerHTML);
    t('… mit Knopf "Neu anmelden", der wirklich abmeldet (nicht nur neu lädt)', w.banner && /onclick="kmiNeuAnmelden\(\)"/.test(w.banner.innerHTML) && /adminLogout\(\)/.test(fn('kmiNeuAnmelden')) && /openModal\('adminLoginModal'\)/.test(fn('kmiNeuAnmelden')), '');
    t('… und meldet es einmal ins Fehlerprotokoll', w.gemeldet === 1, w.gemeldet);
    await w.pruefen();
    t('zweite Prüfung: Banner bleibt einmal, keine zweite Meldung', w.banner && w.gemeldet === 1, w.gemeldet);

    w.refreshGibt = { access_token: 'zurueck', expires_in: 3600 };
    await w.pruefen();
    t('Anmeldung kommt zurück: Banner weg, Listen laden neu', w.banner === null && w.neuGeladen === 1, JSON.stringify({ b: !!w.banner, n: w.neuGeladen }));

    t('läuft jede Minute, beim Zurückkommen in den Tab und beim Fokus',
      /setInterval\(dashboardAnmeldungPruefen, 60000\);/.test(H) && /addEventListener\('visibilitychange', function \(\) \{ if \(!document\.hidden\) dashboardAnmeldungPruefen\(\); \}\);/.test(H) && /addEventListener\('focus', function \(\) \{ dashboardAnmeldungPruefen\(\); \}\);/.test(H), 'fehlt');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
