// LAEUFT GERADE -- WAS DER GAST AM TISCH JETZT WISSEN MUSS.
//
// Gebaut am 06.10.2026. Wer per Tisch-QR kommt, landet direkt in der
// Speisekarte und sieht die Lokalseite nie. Die Happy Hour stand also
// ueberall -- nur nicht dort, wo der Gast sitzt und bestellt.
//
// WAS SCHIEFGEHEN KANN, UND WIE ES DANN AUSSAEHE
//   - Ueber Mitternacht: aktionPasst sagt fuer Freitag 01:00 zur Ladies
//     Night vom Donnerstag "nein" (richtig fuer eine Reservierung). Haette
//     ich es fuer "laeuft jetzt?" benutzt, waere der Streifen um 0:00
//     verschwunden -- mitten in der Ladies Night.
//   - "Nur bei Online-Reservierung" in der Karte: der Gast am Tisch fragt
//     nach 10 %, die er nicht bekommt.
//   - Text aus der Datenbank per innerHTML: der Wirt (oder wer seinen
//     Zugang hat) koennte Skript in jede Gastkarte schreiben.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - den Vortag-Teil in aktionLaeuftJetzt entfernt
//   - den gilt_fuer-Filter in aktionenJetztFuerTisch entfernt
//   - den Aufruf in openMenuModal entfernt
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }
function schneide(kopf) {
    var a = H.indexOf(kopf); if (a < 0) return '';
    var i = H.indexOf('{', a), tiefe = 0;
    for (var j = i; j < H.length; j++) { if (H[j] === '{') tiefe++; else if (H[j] === '}') { tiefe--; if (!tiefe) return H.slice(a, j + 1); } }
    return '';
}
var F = new Function(['function aktionMinuten(', 'function aktionWochentag(', 'function aktionPasst(', 'function aktionDatumVon(',
    'function aktionLaeuftJetzt(', 'function aktionenJetztFuerTisch('].map(schneide).join('\n')
    + '\nreturn { laeuft: aktionLaeuftJetzt, tisch: aktionenJetztFuerTisch };')();

// Oktober 2026: Di 6., Mi 7., Do 8., Fr 9., Sa 10., So 11.
function um(tag, h, m) { return new Date(2026, 9, tag, h, m || 0); }
var LADIES = { titel: 'Ladies Night', gilt_fuer: 'alle', wochentage: [3], von: '21:00', bis: '03:00', aktiv: true };
var HAPPY  = { titel: 'Happy Hour', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4], von: '17:00', bis: '19:00', aktiv: true };
var PARTY  = { titel: 'Party', gilt_fuer: 'alle', datum: '2026-10-10', von: '22:00', bis: null, aktiv: true };
var ONLINE = { titel: 'Online', gilt_fuer: 'reservierung', wochentage: [0, 1, 2, 3, 4, 5, 6], aktiv: true };

console.log('\n-- 1. Laeuft sie jetzt? --');
[
    ['Ladies Night, Donnerstag 22:00', LADIES, um(8, 22), true],
    ['Ladies Night, Freitag 01:00 -- laeuft vom Donnerstag noch', LADIES, um(9, 1), true],
    ['Ladies Night, Freitag 03:00 -- letzte Minute', LADIES, um(9, 3), true],
    ['Ladies Night, Freitag 03:30 -- vorbei', LADIES, um(9, 3, 30), false],
    ['Ladies Night, Donnerstag 20:00 -- noch nicht', LADIES, um(8, 20), false],
    ['Ladies Night, Donnerstag 01:00 -- da lief die vom Mittwoch, und die gibt es nicht', LADIES, um(8, 1), false],
    ['Ladies Night, Freitag 22:00 -- falscher Tag', LADIES, um(9, 22), false],
    ['Happy Hour, Dienstag 18:00', HAPPY, um(6, 18), true],
    ['Happy Hour, Dienstag 19:30', HAPPY, um(6, 19, 30), false],
    ['Happy Hour, Samstag 18:00', HAPPY, um(10, 18), false],
    ['Party ab 22:00, Samstag 23:00', PARTY, um(10, 23), true],
    ['Party ab 22:00 ohne Ende, Sonntag 01:00 -- ohne Ende kein Weiterlaufen', PARTY, um(11, 1), false],
    ['ausgeschaltete Aktion laeuft nie', Object.assign({}, HAPPY, { aktiv: false }), um(6, 18), false],
    ['Ladies Night bis 08.10. gueltig: Freitag 01:00 laeuft die letzte noch', Object.assign({}, LADIES, { gueltig_bis: '2026-10-08' }), um(9, 1), true],
    ['Ladies Night erst ab 09.10.: Freitag 01:00 gehoert zum 08. -- nein', Object.assign({}, LADIES, { gueltig_ab: '2026-10-09' }), um(9, 1), false]
].forEach(function (f) { t(f[0], F.laeuft(f[1], f[2]) === f[3], { erwartet: f[3] }); });

console.log('\n-- 2. Was am Tisch angezeigt wird --');
var amTisch = F.tisch([LADIES, HAPPY, ONLINE], um(8, 18));
t('Donnerstag 18:00: Happy Hour ja', amTisch.indexOf(HAPPY) >= 0, amTisch.map(function (a) { return a.titel; }));
t('"nur bei Online-Reservierung" steht nicht am Tisch', amTisch.indexOf(ONLINE) < 0, amTisch.map(function (a) { return a.titel; }));
t('nichts Kaputtes bei leerer oder fehlender Liste', F.tisch(null, um(8, 18)).length === 0 && F.tisch([], um(8, 18)).length === 0, null);

console.log('\n-- 3. Eingebaut --');
var mm = schneide('async function openMenuModal(');
t('die Speisekarte ruft zeigeAktionenJetztInKarte', /zeigeAktionenJetztInKarte\(restaurantId\)/.test(mm), null);
var streifen = schneide('function aktionenStreifenSetzen(');
t('der Streifen setzt Text aus der Datenbank nur per textContent', streifen.indexOf('innerHTML') < 0 && /textContent = 'Läuft gerade: '/.test(streifen), null);
t('der Streifen zeigt nur, was fuer den Tisch gilt', /aktionenJetztFuerTisch\(liste, new Date\(\)\)/.test(streifen), null);
t('eine Antwort fuer ein anderes Haus wird verworfen', /if \(haus !== restaurantId\) return 0;/.test(streifen), null);
var uhr = schneide('function zeigeAktionenJetztInKarte(');
t('alle fuenf Minuten neu, solange die Karte offen ist', /5 \* 60 \* 1000/.test(uhr) && /clearInterval\(_aktionJetztUhr\)/.test(uhr), null);
var lp = schneide('function renderRestaurantAktionen(');
t('Lokalseite: was laeuft, steht vorn und ist markiert', /aktionLaeuftJetzt\(a, jetzt\)/.test(lp) && /aktionKarteHtml\(e\.a, e\.laeuft\)/.test(lp), null);

console.log('\n-- 4. Lesbar, hell und dunkel --');
function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function drauf(v, a, h) { return v.map(function (x, i) { return x * a + h[i] * (1 - a); }); }
function leucht(c) { var f = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
function k(a, b) { var x = leucht(a), y = leucht(b); return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100; }
var hell = H.match(/\.menu-aktion-jetzt \{[^}]*background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6});/i);
var dunkel = H.match(/\.dark-mode \.menu-aktion-jetzt \{\s*background: rgba\((\d+),(\d+),(\d+),([\d.]+)\); color: (#[0-9a-f]{6});/i);
t('Farben fuer hell und dunkel stehen im CSS', !!hell && !!dunkel, null);
if (hell && dunkel) {
    var kh = k(rgb(hell[2]), rgb(hell[1]));
    t('hell: ' + kh + ' : 1', kh >= 4.5, kh);
    [[14, 14, 14], [26, 29, 28]].forEach(function (grund) {
        var g = drauf([+dunkel[1], +dunkel[2], +dunkel[3]], +dunkel[4], grund);
        var kd = k(rgb(dunkel[5]), g);
        t('dunkel auf rgb(' + grund + '): ' + kd + ' : 1', kd >= 4.5, kd);
    });
}

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
