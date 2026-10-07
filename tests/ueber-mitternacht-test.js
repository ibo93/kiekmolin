// UEBER MITTERNACHT: OFFEN ODER ZU?
//
// Gefunden am 06.10.2026 fuer eine Shisha-Bar (Montag Ruhetag, Di bis So
// 18:00 bis 03:00). Die echte checkIfOpen mit gestellter Uhr:
//
//     Sonntagnacht 01:30 (ist schon Mo)   App sagte: geschlossen   -- Bar offen
//     Montagnacht  01:30 (ist schon Di)   App sagte: offen         -- Bar zu
//
// Die Kasse fragt checkIfOpen und sperrt bei "zu". Der Gast sitzt in der
// Bar, bestellt ueber den Tisch-QR und liest "hat gerade geschlossen".
//
// WAS DIESER TEST BEWEIST -- IN DREI RICHTUNGEN
//   1. Die gemessenen Faelle stimmen jetzt.
//   2. NICHTS ANDERES HAT SICH VERAENDERT: fuer jedes Restaurant OHNE
//      Nachtschicht sagt die neue Fassung zu jeder Viertelstunde einer
//      ganzen Woche dasselbe wie die alte. Die alte steht dafuer unten als
//      eingefrorene Kopie -- fuer genau diese Faelle war sie richtig.
//   3. Fuer Nachtschichten rechnet eine ZWEITE, unabhaengig geschriebene
//      Fassung mit: die Woche als Zeitstrahl, jede Schicht ein Stueck
//      darauf. Wer offen hat, liegt auf einem Stueck. Beide muessen sich
//      zu jeder Viertelstunde einig sein.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - die Nachtschicht von gestern nicht mehr beachtet (der alte Fehler)
//   - den Ruhetag von gestern nicht mehr beachtet
//   - die heutige Nachtschicht schon vor ihrem Beginn gelten lassen
//   - minutenBisEnde fuer die heutige Nachtschicht ohne "+ Ende" gerechnet
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0, still = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

function schneide(kopf) {
    var a = H.indexOf(kopf);
    if (a < 0) return '';
    var i = H.indexOf('{', a), tiefe = 0;
    for (var j = i; j < H.length; j++) {
        if (H[j] === '{') tiefe++;
        else if (H[j] === '}') { tiefe--; if (!tiefe) return H.slice(a, j + 1); }
    }
    return '';
}

var QUELLE = ['function aktiveSchicht(', 'function checkIfOpen(restaurant)', 'function parseTime(',
              'function minutesUntilClose(restaurant)', 'function getClosingTimeToday(restaurant)']
    .map(schneide);
t('alle fuenf Funktionen gefunden', QUELLE.every(function (q) { return q.length > 40; }),
  QUELLE.map(function (q) { return q.length; }));

// Eine Uhr, die steht, wo wir sie hinstellen.
var EchtDate = Date;
var JETZT = new EchtDate(2026, 9, 12, 12, 0);
function UhrDate() {
    if (!arguments.length) return new EchtDate(JETZT.getTime());
    return new (Function.prototype.bind.apply(EchtDate, [null].concat([].slice.call(arguments))))();
}
UhrDate.now = function () { return JETZT.getTime(); };

var ferien = null;
var F = new Function('Date', 'getVacationInfo', 'window',
    QUELLE.join('\n') + '\nreturn { aktiveSchicht: aktiveSchicht, checkIfOpen: checkIfOpen,'
    + ' minutesUntilClose: minutesUntilClose, getClosingTimeToday: getClosingTimeToday };')
    (UhrDate, function () { return ferien; }, {});

// Die ALTE checkIfOpen, eingefroren am 06.10.2026. Fuer Restaurants OHNE
// Nachtschicht war sie richtig -- dafuer, und nur dafuer, ist sie hier.
function altesCheckIfOpen(restaurant, now) {
    var currentDay = now.getDay(), currentTime = now.getHours() * 60 + now.getMinutes();
    function pt(x) { if (!x) return 0; var a = x.split(':').map(Number); return a[0] * 60 + (a[1] || 0); }
    if (restaurant.rest_day !== null && restaurant.rest_day !== undefined) {
        var m = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 };
        if (currentDay === m[restaurant.rest_day]) return false;
    }
    var hours = restaurant.opening_hours;
    if (hours && typeof hours === 'object') {
        var k = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'][currentDay];
        var s1 = false, s2 = false;
        if (hours[k + '_start'] && hours[k + '_end']) {
            var o = pt(hours[k + '_start']), c = pt(hours[k + '_end']);
            s1 = c > o ? (currentTime >= o && currentTime <= c) : (currentTime >= o || currentTime <= c);
        }
        if (hours[k + '_start2'] && hours[k + '_end2']) {
            var o2 = pt(hours[k + '_start2']), c2 = pt(hours[k + '_end2']);
            s2 = c2 > o2 ? (currentTime >= o2 && currentTime <= c2) : (currentTime >= o2 || currentTime <= c2);
        }
        if (hours[k + '_start']) return s1 || s2;
    }
    if (restaurant.opening_time && restaurant.closing_time) {
        var oo = pt(restaurant.opening_time), cc = pt(restaurant.closing_time);
        return cc > oo ? (currentTime >= oo && currentTime <= cc) : (currentTime >= oo || currentTime <= cc);
    }
    return currentTime >= 660 && currentTime <= 1320;
}

// Die ZWEITE Rechnung, ohne einen Blick in index.html geschrieben: die
// Woche als Zeitstrahl ab Montag 0:00, jede Schicht ein Stueck darauf.
// Eine Nachtschicht ragt in den naechsten Tag -- auch von Sonntag in den
// Montag, deshalb liegt jedes Stueck ein zweites Mal eine Woche frueher.
var WOCHE = 7 * 1440;
function zeitstrahl(r) {
    var TAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];        // ab Montag
    function min(x) { var a = String(x).split(':').map(Number); return a[0] * 60 + (a[1] || 0); }
    var stuecke = [];
    for (var d = 0; d < 7; d++) {
        if (r.rest_day !== null && r.rest_day !== undefined && Number(r.rest_day) === d) continue;
        var k = TAGE[d], liste = [];
        var oh = r.opening_hours;
        if (oh && oh[k + '_start']) {
            if (oh[k + '_start'] && oh[k + '_end']) liste.push([oh[k + '_start'], oh[k + '_end']]);
            if (oh[k + '_start2'] && oh[k + '_end2']) liste.push([oh[k + '_start2'], oh[k + '_end2']]);
        } else if (r.opening_time && r.closing_time) {
            liste.push([r.opening_time, r.closing_time]);
        } else {
            liste.push(['11:00', '22:00']);
        }
        liste.forEach(function (p) {
            var a = d * 1440 + min(p[0]);
            var b = d * 1440 + min(p[1]);
            if (min(p[1]) <= min(p[0])) b += 1440;                  // ueber Mitternacht
            stuecke.push([a, b], [a - WOCHE, b - WOCHE]);
        });
    }
    return function offenUm(wochenMinute) {
        return stuecke.some(function (s) { return wochenMinute >= s[0] && wochenMinute <= s[1]; });
    };
}

function stelle(tagAbMontag, std, min) { JETZT = new EchtDate(2026, 9, 12 + tagAbMontag, std, min); }

// --------------------------------------------------------------------------
console.log('\n-- 1. Die gemessenen Faelle --');
var BAR = { rest_day: 0, opening_hours: {} };     // 0 = Montag Ruhetag
['di', 'mi', 'do', 'fr', 'sa', 'so'].forEach(function (d) { BAR.opening_hours[d + '_start'] = '18:00'; BAR.opening_hours[d + '_end'] = '03:00'; });

[[5, 21, 0, true,  'Samstag 21:00'],
 [6,  1, 30, true, 'Samstagnacht 01:30 (ist schon Sonntag)'],
 [0,  1, 30, true, 'Sonntagnacht 01:30 (ist schon Montag, Ruhetag) -- DER FEHLER'],
 [0, 21, 0, false, 'Montag 21:00, Ruhetag'],
 [1,  1, 30, false,'Montagnacht 01:30 (ist schon Dienstag) -- DER ZWEITE FEHLER'],
 [1, 21, 0, true,  'Dienstag 21:00'],
 [1,  3, 0, false, 'Dienstag 03:00 -- Montag war zu, also keine Nacht'],
 [2,  3, 0, true,  'Mittwoch 03:00 -- letzte Minute der Dienstagsnacht'],
 [2,  3, 1, false, 'Mittwoch 03:01 -- zu'],
 [2, 17, 59, false,'Mittwoch 17:59 -- noch zu'],
 [2, 18, 0, true,  'Mittwoch 18:00 -- auf']
].forEach(function (f) {
    stelle(f[0], f[1], f[2]);
    var ist = F.checkIfOpen(BAR);
    t(f[4] + ' -> ' + (f[3] ? 'offen' : 'zu'), ist === f[3], ist);
});

console.log('\n-- 2. Auch ohne Ruhetag: der naechste Tag schliesst frueh --');
var KNEIPE = { opening_hours: { sa_start: '18:00', sa_end: '03:00', so_start: '14:00', so_end: '22:00' } };
stelle(6, 0, 30);
t('Samstag bis 03:00, Sonntag 14-22 Uhr: Sonntag 00:30 ist OFFEN', F.checkIfOpen(KNEIPE) === true, F.checkIfOpen(KNEIPE));
stelle(6, 13, 0);
t('Sonntag 13:00 ist zu', F.checkIfOpen(KNEIPE) === false, F.checkIfOpen(KNEIPE));

console.log('\n-- 3. Bestellschluss und "schliesst um" --');
stelle(6, 1, 30);
t('Samstagnacht 01:30: noch 90 Minuten bis Schluss', F.minutesUntilClose(BAR) === 90, F.minutesUntilClose(BAR));
t('und "schliesst um" sagt 03:00, nicht das 22:00 vom Sonntag', F.getClosingTimeToday(KNEIPE) === '03:00', F.getClosingTimeToday(KNEIPE));
stelle(5, 23, 0);
t('Samstag 23:00: noch 240 Minuten (bis 03:00)', F.minutesUntilClose(BAR) === 240, F.minutesUntilClose(BAR));
stelle(5, 23, 0);
var sch = F.aktiveSchicht(BAR, new UhrDate());
t('die laufende Schicht ist die vom Samstag, ueber Nacht',
  !!sch && sch.tag === 'sa' && sch.ueberNacht === true && sch.vonGestern === false, sch);

console.log('\n-- 4. Betriebsferien schliessen weiter alles --');
ferien = { active: true };
stelle(5, 21, 0);
t('Ferien an einem offenen Abend -> zu', F.checkIfOpen(BAR) === false, F.checkIfOpen(BAR));
ferien = null;

console.log('\n-- 5. NICHTS ANDERES VERAENDERT: Restaurants ohne Nachtschicht --');
var OHNE_NACHT = [
    { name: 'nichts gepflegt (11-22)' },
    { name: 'nur Standardzeiten', opening_time: '11:30', closing_time: '21:30' },
    { name: 'Standardzeiten, Montag Ruhetag', opening_time: '12:00', closing_time: '22:00', rest_day: 0 },
    { name: 'Tageszeiten mit Mittagspause', rest_day: 1, opening_hours: {
        mo_start: '11:30', mo_end: '14:30', mo_start2: '17:30', mo_end2: '22:00',
        mi_start: '11:30', mi_end: '14:30', mi_start2: '17:30', mi_end2: '22:00',
        do_start: '11:30', do_end: '22:00', fr_start: '11:30', fr_end: '23:00',
        sa_start: '12:00', sa_end: '23:00', so_start: '12:00', so_end: '21:00' } },
    { name: 'Tageszeiten, Luecke am Dienstag -> Standard', opening_time: '10:00', closing_time: '18:00',
      opening_hours: { mo_start: '09:00', mo_end: '17:00', mi_start: '09:00', mi_end: '17:00' } },
    { name: 'Tag mit Anfang ohne Ende', opening_hours: { fr_start: '11:00' } },
    { name: 'Bis Mitternacht genau (24:00)', opening_hours: { sa_start: '18:00', sa_end: '24:00' } }
];
OHNE_NACHT.forEach(function (r) {
    var abweichungen = [];
    for (var q = 0; q < 7 * 96; q++) {
        stelle(Math.floor(q / 96), Math.floor((q % 96) / 4), (q % 4) * 15);
        var neu = F.checkIfOpen(r), alt = altesCheckIfOpen(r, new UhrDate());
        if (neu !== alt) abweichungen.push(JETZT.toString().slice(0, 21) + ' neu=' + neu + ' alt=' + alt);
    }
    t(r.name + ': alle 672 Viertelstunden wie vorher', abweichungen.length === 0, abweichungen.slice(0, 3));
});

console.log('\n-- 6. Nachtschichten: zwei unabhaengige Rechnungen sind sich einig --');
var MIT_NACHT = [
    { name: 'die Shisha-Bar', r: BAR },
    { name: 'Kneipe Sa bis 3, So 14-22', r: KNEIPE },
    { name: 'Standardzeiten 17:00-02:00, Dienstag Ruhetag', r: { opening_time: '17:00', closing_time: '02:00', rest_day: 1 } },
    { name: 'Sonntagnacht in den Montag', r: { rest_day: 2, opening_hours: { so_start: '20:00', so_end: '04:00', mo_start: '12:00', mo_end: '20:00' } } },
    { name: 'Mittag normal, Abend ueber Nacht', r: { opening_hours: {
        fr_start: '11:00', fr_end: '14:00', fr_start2: '18:00', fr_end2: '01:00',
        sa_start: '11:00', sa_end: '14:00', sa_start2: '18:00', sa_end2: '02:00' } } },
    { name: 'rund um die Uhr (00:00-00:00)', r: { opening_hours: { do_start: '00:00', do_end: '00:00' } } }
];
MIT_NACHT.forEach(function (fall) {
    var offen = zeitstrahl(fall.r), abweichungen = [];
    for (var q = 0; q < 7 * 96; q++) {
        var tag = Math.floor(q / 96), std = Math.floor((q % 96) / 4), mi = (q % 4) * 15;
        stelle(tag, std, mi);
        var soll = offen(tag * 1440 + std * 60 + mi), ist = F.checkIfOpen(fall.r);
        if (soll !== ist) abweichungen.push(JETZT.toString().slice(0, 21) + ' App=' + ist + ' richtig=' + soll);
    }
    t(fall.name + ': alle 672 Viertelstunden richtig', abweichungen.length === 0, abweichungen.slice(0, 3));
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
