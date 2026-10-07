// RESERVIERUNGS-UHRZEITEN: FUER DEN GEWAEHLTEN TAG, AUCH UEBER MITTERNACHT.
//
// Am 06.10.2026 fuer eine Shisha-Bar mit der echten Funktion gemessen:
//
//     Shisha-Bar 18:00 - 03:00              -> 0 Uhrzeiten
//     Bar 20:00 - 01:00                     -> 0 Uhrzeiten
//     Lokal bis Mitternacht 17:00 - 00:00   -> 0 Uhrzeiten
//
// Die Schleife lief von Minute 1080 bis Minute 150 -- kein Durchlauf.
// Online keine einzige Reservierung, und der Gast las nur "nichts frei".
//
// Dazu kamen die Zeiten vom falschen Tag: beim Speichern wird opening_time
// aus den MONTAGSzeiten genommen. Montags Ruhetag -> leer -> Standard 11:00
// bis 21:30. Die Bar haette Reservierungen fuer 11:30 angenommen.
//
// DIESER TEST BEWEIST BEIDES UND NOCH EINS: dass sich fuer Restaurants, bei
// denen es vorher stimmte, NICHTS geaendert hat. Die alte Fassung steht
// dafuer unten eingefroren.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - die Kappung bei 23:59 entfernt (Uhrzeiten "24:00", "25:30" ...)
//   - die Mitternachts-Korrektur entfernt (wieder 0 Uhrzeiten)
//   - den Ruhetag nicht mehr beachtet
//   - in loadAvailableSlots das Datum nicht mehr mitgegeben
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

var APP_DATA = { restaurants: [] };
var QUELLE = ['function generateReservationSlots(', 'function reservierSchichtenAm(', 'function subtractMinutes(', 'function parseTime(timeStr)'].map(schneide);
t('alle Funktionen gefunden', QUELLE.every(function (q) { return q.length > 40; }), QUELLE.map(function (q) { return q.length; }));
var gen = new Function('APP_DATA', QUELLE.join('\n') + '\nreturn generateReservationSlots;')(APP_DATA);

// DIE ALTE FASSUNG, eingefroren am 06.10.2026. Fuer Lokale, die vor
// Mitternacht schliessen und deren Zeiten an jedem Tag gleich sind, war sie
// richtig -- dafuer, und nur dafuer, steht sie hier.
function altGen(restaurant) {
    var startTime = '11:00', endTime = '21:30', interval = 30, pauseStart = '14:00', pauseEnd = '17:00', pauseEnabled = true, disabledSlots = [];
    function sub(x, mins) { var p = x.split(':'); var tot = parseInt(p[0]) * 60 + parseInt(p[1]) - mins; if (tot < 0) tot = 0; var h = Math.floor(tot / 60), m = tot % 60; return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m); }
    if (restaurant) {
        startTime = restaurant.opening_time || startTime;
        endTime = restaurant.closing_time ? sub(restaurant.closing_time, 30) : endTime;
        interval = restaurant.slot_interval_minutes || interval;
        if (restaurant.opening_hours) {
            if (restaurant.opening_hours.pause_start) pauseStart = restaurant.opening_hours.pause_start;
            if (restaurant.opening_hours.pause_end) pauseEnd = restaurant.opening_hours.pause_end;
            if (restaurant.opening_hours.pause_enabled === false) pauseEnabled = false;
            if (restaurant.opening_hours.disabled_slots) disabledSlots = restaurant.opening_hours.disabled_slots;
        }
    }
    var slots = [], sp = startTime.split(':'), ep = endTime.split(':');
    var s = parseInt(sp[0]) * 60 + parseInt(sp[1]), e = parseInt(ep[0]) * 60 + parseInt(ep[1]);
    var ps = pauseEnabled ? parseInt(pauseStart.split(':')[0]) * 60 + parseInt(pauseStart.split(':')[1]) : -1;
    var pe = pauseEnabled ? parseInt(pauseEnd.split(':')[0]) * 60 + parseInt(pauseEnd.split(':')[1]) : -1;
    for (var m = s; m <= e; m += interval) {
        if (pauseEnabled && m >= ps && m < pe) continue;
        var h = Math.floor(m / 60), mi = m % 60, ts = (h < 10 ? '0' + h : h) + ':' + (mi < 10 ? '0' + mi : mi);
        if (disabledSlots.indexOf(ts) > -1) continue;
        slots.push(ts);
    }
    return slots;
}

function mit(r) { r.id = 'x'; APP_DATA.restaurants = [r]; return r; }
// Woche ab Montag, 12.10.2026.
var WOCHE = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];

console.log('\n-- 1. Ueber Mitternacht: nicht mehr null Uhrzeiten --');
[['Shisha-Bar 18:00 - 03:00', '18:00', '03:00', 12],
 ['Bar 20:00 - 01:00', '20:00', '01:00', 8],
 ['Lokal bis Mitternacht 17:00 - 00:00', '17:00', '00:00', 14]].forEach(function (f) {
    mit({ opening_time: f[1], closing_time: f[2], opening_hours: { pause_enabled: false } });
    var sl = gen('x');
    t(f[0] + ': ' + f[3] + ' Uhrzeiten, letzte 23:30', sl.length === f[3] && sl[sl.length - 1] === '23:30', sl);
    t(f[0] + ': keine Uhrzeit ueber 23:59', sl.every(function (x) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(x); }), sl.filter(function (x) { return !/^([01]\d|2[0-3]):/.test(x); }));
});

console.log('\n-- 2. Die Bar, so wie sie gespeichert wuerde --');
// Beim Speichern: opening_time = mo_start, closing_time = mo_end. Montag ist
// Ruhetag, also steht dort nichts -- genau der Fall, der 11:30 erlaubte.
var oh = {};
['di', 'mi', 'do', 'fr', 'sa', 'so'].forEach(function (d) { oh[d + '_start'] = '18:00'; oh[d + '_end'] = '03:00'; });
var BAR = mit({ rest_day: 0, opening_time: oh.mo_start, closing_time: oh.mo_end, opening_hours: oh });
var sa = gen('x', '2026-10-17');
t('Samstag: 18:00 bis 23:30', sa[0] === '18:00' && sa[sa.length - 1] === '23:30' && sa.length === 12, sa);
t('Samstag: keine Uhrzeit vor der Oeffnung', sa.every(function (x) { return x >= '18:00'; }), sa);
t('Montag (Ruhetag): keine Uhrzeiten', gen('x', '2026-10-12').length === 0, gen('x', '2026-10-12'));
var ohneDatum = gen('x');
t('zum Vergleich ohne Datum: der alte Standard 11:00 ... -- genau das war der Fehler',
  ohneDatum.indexOf('11:30') > -1, ohneDatum.slice(0, 3));

console.log('\n-- 3. Zwei Schichten am Tag --');
mit({ opening_hours: { pause_enabled: false, fr_start: '11:00', fr_end: '14:00', fr_start2: '18:00', fr_end2: '01:00' } });
var fr = gen('x', '2026-10-16');
t('Freitag mittags 11:00 bis 13:30', fr[0] === '11:00' && fr.indexOf('13:30') > -1 && fr.indexOf('14:00') === -1, fr);
t('und abends 18:00 bis 23:30', fr.indexOf('18:00') > -1 && fr[fr.length - 1] === '23:30', fr);
t('dazwischen nichts', !fr.some(function (x) { return x > '13:30' && x < '18:00'; }), fr);
t('sortiert und ohne Doppel', fr.join() === fr.slice().sort().join() && new Set(fr).size === fr.length, fr);

console.log('\n-- 4. NICHTS ANDERES VERAENDERT --');
var GLEICH = [
    { name: 'nichts gepflegt', r: {} },
    { name: 'Standardzeiten 11:30-22:00', r: { opening_time: '11:30', closing_time: '22:00' } },
    { name: 'mit eigener Pause', r: { opening_time: '11:00', closing_time: '23:00', opening_hours: { pause_start: '15:00', pause_end: '17:30' } } },
    { name: 'Pause aus, 15-Minuten-Takt', r: { opening_time: '12:00', closing_time: '21:00', slot_interval_minutes: 15, opening_hours: { pause_enabled: false } } },
    { name: 'deaktivierte Uhrzeiten', r: { opening_time: '11:00', closing_time: '22:00', opening_hours: { disabled_slots: ['12:00', '19:30'] } } },
    { name: 'Tageszeiten = Standardzeiten an jedem Tag', r: (function () {
        var o = {}; ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'].forEach(function (d) { o[d + '_start'] = '11:30'; o[d + '_end'] = '22:00'; });
        return { opening_time: '11:30', closing_time: '22:00', opening_hours: o }; })() }
];
GLEICH.forEach(function (fall) {
    mit(fall.r);
    var abw = [];
    t(fall.name + ': ohne Datum wie vorher', JSON.stringify(gen('x')) === JSON.stringify(altGen(fall.r)), { neu: gen('x'), alt: altGen(fall.r) });
    WOCHE.forEach(function (d) { if (JSON.stringify(gen('x', d)) !== JSON.stringify(altGen(fall.r))) abw.push(d); });
    t(fall.name + ': an allen sieben Tagen wie vorher', abw.length === 0, abw);
});

console.log('\n-- 5. Die Gastwege geben das Datum mit --');
t('die Uhrzeit-Auswahl des Gastes', /var allTimes = generateReservationSlots\(restaurantId, date\);/.test(H), null);
t('ihr Notweg', /generateReservationSlots\(restaurantId, _fDatum\)/.test(H), null);
t('die Belegung fuer heute', /generateReservationSlots\(restaurantId, today\)/.test(H), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
