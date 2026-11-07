// TESLA-KAUF FUER WIRTE: /starten -> eigene Seite ansehen -> Anmeldung.
//
// Was hier kaputtgehen kann, ohne dass es jemand sieht:
//   - Der Knopf fuehrt ins Leere oder in die Gaeste-Tour statt in die Anmeldung.
//   - Die Auswahl kommt nicht im Formular an (Wirt tippt alles doppelt).
//   - Alte Eingaben von gestern ueberschreiben, was er gerade tippt.
//   - Die Seite zeigt Farben, die er im Dashboard gar nicht waehlen kann,
//     oder einen anderen Preis als die Anmeldung.
// Die Funktionen werden ausgefuehrt, nicht nur als Text verglichen.
var KMI = require('path').join(__dirname, '..');
var fs = require('fs'), vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');
var st = fs.readFileSync(KMI + '/starten.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }
function schnipsel(name) {
    var a = h.indexOf('function ' + name + '(');
    if (a < 0) throw new Error(name + ' nicht gefunden');
    var i = h.indexOf('{', a), tiefe = 0, j = i;
    for (; j < h.length; j++) { if (h[j] === '{') tiefe++; else if (h[j] === '}') { tiefe--; if (tiefe === 0) break; } }
    return h.slice(a, j + 1);
}

console.log('-- 1. Der Weg von /starten in die Anmeldung --');
t('Knopf fuehrt auf /?wirt=starten', /id="los" href="\/\?wirt=starten"/.test(st));
var k = { window: { location: { pathname: '/', search: '?wirt=starten' } }, String: String };
vm.createContext(k); vm.runInContext(schnipsel('_direkterEinstieg'), k);
t('Gaeste-Tour bleibt beim Wirt aus', vm.runInContext('_direkterEinstieg()', k) === true);
k.window.location.search = ''; t('...aber auf der blanken Startseite weiter an', vm.runInContext('_direkterEinstieg()', k) === false);
var lade = h.slice(h.indexOf("Vom Tesla-Kauf (/starten)"), h.indexOf("Vom Tesla-Kauf (/starten)") + 2500);
t('?wirt=starten oeffnet startRestaurantRegistration', /wirt=starten/.test(lade) && /startRestaurantRegistration\(\)/.test(lade), lade.slice(0, 200));
t('Load-Handler fragt _wirtStartenPruefen', /_wirtStartenPruefen\(\)/.test(lade));
// Das Neuladen durch den Service Worker beim ersten Besuch nachspielen
(function () {
    var speicher = {}, jetzt = 1e12;
    var w = { location: { search: '?wirt=starten', pathname: '/' }, history: { replaceState: function () { w.location.search = ''; } },
        sessionStorage: { getItem: function (k) { return k in speicher ? speicher[k] : null; }, setItem: function (k, v) { speicher[k] = v; }, removeItem: function (k) { delete speicher[k]; } },
        Date: { now: function () { return jetzt; } }, String: String, Number: Number };
    vm.createContext(w); vm.runInContext('var KMI_WIRT_STARTEN="kmi_wirt_starten";' + schnipsel('_wirtStartenPruefen'), w);
    var erst = vm.runInContext('_wirtStartenPruefen()', w);
    t('Erster Aufruf: Anmeldung auf, Parameter aus der Adresse', erst === true && w.location.search === '');
    jetzt += 3000;
    t('Neuladen durch Service Worker (3 s spaeter): Anmeldung geht trotzdem auf', vm.runInContext('_wirtStartenPruefen()', w) === true);
    jetzt += 120000;
    t('Neuladen 2 Min. spaeter: keine Anmeldung mehr', vm.runInContext('_wirtStartenPruefen()', w) === false);
    w.sessionStorage = { getItem: function () { throw new Error('privat'); }, setItem: function () { throw new Error('privat'); } };
    w.location.search = '?wirt=starten';
    t('Ohne sessionStorage: Adresse reicht', vm.runInContext('_wirtStartenPruefen()', w) === true);
})();
t('Anmeldung fuellt aus /starten vor', /regVorfuellenAusStarten\(\);\s*\n\s*openModal\('gastroRegistrationModal'\)/.test(schnipsel('startRestaurantRegistration')));
t('Footer "Für Gastronomen" fuehrt auf /starten', /<a href="\/starten"[^>]*>Für Gastronomen<\/a>/.test(h));

console.log('\n-- 2. Vorfuellen wirklich ausfuehren --');
function lauf(gespeichert, felder) {
    var el = {}; ['regRestaurantName', 'regRestaurantCity', 'regRestaurantMessage'].forEach(function (id) { el[id] = { value: (felder || {})[id] || '' }; });
    el.regRestaurantCuisine = { value: '', querySelector: function (q) { return /value="(fisch|italienisch|doener)"/.test(q) ? {} : null; } };
    var c = { localStorage: { getItem: function () { return gespeichert; } }, document: { getElementById: function (id) { return el[id] || null; } }, JSON: JSON, Date: Date, Number: Number, String: String };
    vm.createContext(c); vm.runInContext('var KMI_REG_VORFUELLEN="kmi_reg_vorfuellen";' + schnipsel('regVorfuellenAusStarten') + ';var erg=regVorfuellenAusStarten();', c);
    return { erg: c.erg, el: el };
}
var frisch = JSON.stringify({ name: 'Fischhaus Norddeich', ort: 'Norden', kueche: 'fisch', farbe: 'Petrol', funktionen: ['Abholen', 'Tisch reservieren'], zeit: Date.now() });
var a = lauf(frisch);
t('Name, Ort, Kueche landen im Formular', a.el.regRestaurantName.value === 'Fischhaus Norddeich' && a.el.regRestaurantCity.value === 'Norden' && a.el.regRestaurantCuisine.value === 'fisch', a.el);
t('Ibo sieht die Auswahl in der Nachricht', /Petrol/.test(a.el.regRestaurantMessage.value) && /Tisch reservieren/.test(a.el.regRestaurantMessage.value), a.el.regRestaurantMessage.value);
var b = lauf(frisch, { regRestaurantName: 'Was er gerade tippt' });
t('Ueberschreibt nichts, was schon drinsteht', b.el.regRestaurantName.value === 'Was er gerade tippt');
var c = lauf(JSON.stringify({ name: 'Von gestern', zeit: Date.now() - 3 * 3600e3 }));
t('Alte Auswahl (> 2 Std.) wird ignoriert', c.erg === false && c.el.regRestaurantName.value === '');
t('Kaputter Speicher bricht nichts', lauf('{kaputt').erg === false);
t('Unbekannte Kueche wird nicht gesetzt', lauf(JSON.stringify({ kueche: 'xyz', zeit: Date.now() })).el.regRestaurantCuisine.value === '');

console.log('\n-- 3. Nichts zeigen, was nicht stimmt --');
var pal = h.slice(h.indexOf('PALETTE: ['), h.indexOf(']', h.indexOf('PALETTE: [')));
var stFarben = (st.match(/var FARBEN=\[(.*?)\];/) || [])[1] || '';
var falsch = (stFarben.match(/\['([^']+)','(#[0-9a-f]{6})'\]/g) || []).filter(function (x) { var m = /\['([^']+)','(#[0-9a-f]{6})'\]/.exec(x); return pal.indexOf("'" + m[1] + "'") < 0 || pal.indexOf("'" + m[2] + "'") < 0; });
t('Jede Farbe auf /starten gibt es im Dashboard (MARKE.PALETTE)', stFarben.length > 0 && falsch.length === 0, falsch);
t('Preis auf /starten = Preis in der Anmeldung (59,90 €)', /59,90 ?€/.test(st) && /Jetzt Platz sichern — 59,90(€|&euro;)\/Monat/.test(h));
t('Kein Streichpreis und kein spaeterer Preis auf /starten', !/65,90|79,90|<s>|<del>|line-through/.test(st));
t('"Monatlich kündbar" und "0 % Provision" stehen da', /onatlich kündbar/.test(st) && /0 % Provision/.test(st));
t('Wirte-Dashboard zeigt 59,90 € statt 59 €', !/>59 €<span/.test(h) && />59,90 €<span/.test(h));
t('Admin-Vorgabe fuer neue Kunden ist 59,90 (nicht 29,90)', /id="customerFee" value="59\.90"/.test(h));

t('Foto/Logo bleiben auf dem Geraet (kein fetch, kein FormData, kein Upload)', /createObjectURL/.test(st) && !/fetch\(|FormData|XMLHttpRequest|sendBeacon/.test(st));
t('Alte Bild-URLs werden freigegeben', /revokeObjectURL/.test(st));
t('Kein Bild = Hinweis statt stillem Nichts', /Das ist kein Bild/.test(st));
t('Laptop und Handy zeigen dasselbe (Name, Karte, Adresse als Klassen, zweimal vorhanden)', (st.match(/class="[^"]*\bv-name\b/g) || []).length >= 3 && (st.match(/class="[^"]*\bv-karte\b/g) || []).length === 2 && /alle\('v-name'/.test(st));
t('Am Handy umschaltbar Handy | Laptop', /data-zeige="laptop"/.test(st) && /\.buehne\[data-zeige=handy\] \.laptop/.test(st));
console.log('\n' + ok + '/' + n + (ok === n ? ' grün' : ' ROT'));
process.exit(ok === n ? 0 : 1);
