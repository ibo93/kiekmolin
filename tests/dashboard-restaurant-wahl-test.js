// RESTAURANT WÄHLEN IM DASHBOARD (Admin, 26.10.2026)
//
// Ibo: "beim dashboard kann ich doch kein restaurant waehlen? kannst du es
// einfuegen?" -- Die Schalter der Restaurant-Steuerung (Ferien, ausgebucht,
// Bestellungen an/aus ...) schrieben fuer den Admin unsichtbar auf das Lokal,
// das unter "Bestellungen" gewaehlt war, sonst aufs erste der Liste.
//
// Die Funktionen werden aus index.html gezogen und ECHT ausgefuehrt.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = H.indexOf('{', i), tiefe = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') tiefe++;
        else if (H[k] === '}') { tiefe--; if (tiefe === 0) return H.slice(i, k + 1); }
    }
    return '';
}

// Kleine Welt: zwei Restaurants, Bestellungen-Auswahl steht auf A.
function welt(admin) {
    var el = {
        dashRestaurantWahl: { style: { display: 'none' } },
        dashRestaurantSelect: { innerHTML: '', value: '' },
        ordersRestaurantSelect: { value: 'a' }
    };
    var W = {}, gesetzt = [];
    var APP_DATA = { restaurants: [
        { id: 'a', name: 'Zum Anker', city: 'Emden', features: ['no_ordering'] },
        { id: 'b', name: 'Bella Pizza', city: 'Aurich', features: [] }
    ] };
    var document = { getElementById: function (id) { return el[id] || null; } };
    var f = new Function('window', 'document', 'APP_DATA', 'currentAdmin', 'escapeHtml', 'showToast', 'updateFeatureToggles', 'zahlsperreBalkenPflegen',
        fn('getControlRestaurantId') + '\n' + fn('initFeatureToggles') + '\n' + fn('dashRestaurantWahlFuellen') + '\n' + fn('dashRestaurantWaehlen')
        + '; return { fuellen: dashRestaurantWahlFuellen, waehlen: dashRestaurantWaehlen, ziel: getControlRestaurantId };');
    var api = f(W, document, APP_DATA, admin, function (s) { return String(s).replace(/</g, '&lt;'); }, function () {},
        function (feat) { gesetzt.push(feat); }, function () {});
    return { el: el, W: W, api: api, gesetzt: gesetzt };
}

console.log('\n-- 1. ADMIN SIEHT DIE AUSWAHL --');
var a = welt({ isAdmin: true });
a.api.fuellen();
t('Auswahl sichtbar', a.el.dashRestaurantWahl.style.display === 'flex', a.el.dashRestaurantWahl.style.display);
t('beide Restaurants mit Ort, alphabetisch', /Bella Pizza – Aurich[\s\S]*Zum Anker – Emden/.test(a.el.dashRestaurantSelect.innerHTML), a.el.dashRestaurantSelect.innerHTML);
t('vorgewählt ist, worauf die Schalter gerade schreiben', /value="a" selected/.test(a.el.dashRestaurantSelect.innerHTML));

console.log('\n-- 2. WÄHLEN WIRKT AUF DIE SCHALTER --');
a.api.waehlen('b');
t('Schalter schreiben danach auf B, nicht mehr auf die Bestellungen-Auswahl', a.api.ziel() === 'b', a.api.ziel());
t('Schalter zeigen den Stand von B', a.gesetzt.length === 1 && a.gesetzt[0].length === 0, JSON.stringify(a.gesetzt));

console.log('\n-- 3. DER WIRT SIEHT SIE NICHT --');
var w = welt({ isAdmin: false, restaurant_id: 'a' });
w.api.fuellen();
t('Wirt: keine Auswahl', w.el.dashRestaurantWahl.style.display === 'none');
t('Wirt bleibt bei seinem eigenen Lokal', w.api.ziel() === 'a');
var g = welt(null); g.W._gastroOnlyRestaurantId = 'a'; g.api.fuellen();
t('Gastro-Zugang: keine Auswahl', g.el.dashRestaurantWahl.style.display === 'none');

console.log('\n-- 4. EINGEBAUT --');
var dash = H.slice(H.indexOf('<div id="sectionDashboard"'), H.indexOf('<div id="sectionReservations"'));
t('Auswahl steht im Dashboard', /id="dashRestaurantSelect"[^>]*onchange="dashRestaurantWaehlen\(this\.value\)"/.test(dash));
var ud = fn('updateDashboard');
t('wird beim Aufbau gefüllt, VOR den Schaltern', ud.indexOf('dashRestaurantWahlFuellen()') > 0 && ud.indexOf('dashRestaurantWahlFuellen()') < ud.indexOf('initFeatureToggles()'));
t('getControlRestaurantId liest die Auswahl vor der Bestellungen-Auswahl',
    fn('getControlRestaurantId').indexOf('window.currentRestaurantId') < fn('getControlRestaurantId').indexOf('ordersRestaurantSelect'));
var sw = fs.readFileSync(KMI + '/sw.js', 'utf8'), wa = fs.readFileSync(KMI + '/netlify/functions/gastweg-wache.js', 'utf8');
var vSw = +(/kmi-shell-v(\d+)/.exec(sw) || [])[1], vW = +(/CACHE_MINDESTENS = (\d+)/.exec(wa) || [])[1];
t('neue Fassung für die Geräte (sw v104+, Wache gleich)', vSw >= 104 && vW === vSw, vSw + ' / ' + vW);

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
