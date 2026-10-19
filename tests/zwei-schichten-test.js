// ZWEI SCHICHTEN AM TAG: "Offen bis" und "oeffnet heute" muessen zur
// laufenden bzw. naechsten Schicht passen.
//
// Gemeldet von Ibo am 19.10.2026, Foto vom Handy um 17:13, Luett Italia:
// "Offen bis 14:30". Offen stimmte (Abendschicht), die Uhrzeit kam aber
// aus der ersten Schicht. Ausgefuehrt mit gestellter Uhr: aktiveSchicht,
// getClosingTimeToday, getOpeningTimeToday, naechsterStartHeute.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }

function mitUhr(jahr, monat, tag, std, min) {
    var Echt = Date;
    function Fake(a) { return arguments.length ? new (Function.prototype.bind.apply(Echt, [null].concat([].slice.call(arguments))))() : new Echt(jahr, monat, tag, std, min); }
    return new Function('Date', 'window', fn('parseTime') + fn('aktiveSchicht') + fn('naechsterStartHeute') + fn('getOpeningTimeToday') + fn('getClosingTimeToday')
        + '; return { zu: getClosingTimeToday, auf: getOpeningTimeToday, offen: function (r) { return !!aktiveSchicht(r, new Date()); } };')(Fake, {});
}
// Montag 19.10.2026
var LUETT = { opening_hours: { mo_start: '11:30', mo_end: '14:30', mo_start2: '17:00', mo_end2: '22:00' }, rest_day: null };

var u = mitUhr(2026, 9, 19, 17, 13);
t('17:13 (Abendschicht): offen', u.offen(LUETT) === true, '');
t('17:13: "Offen bis 22:00", NICHT 14:30 (der gemeldete Fehler)', u.zu(LUETT) === '22:00', u.zu(LUETT));
u = mitUhr(2026, 9, 19, 12, 0);
t('12:00 (Mittagsschicht): bis 14:30', u.offen(LUETT) && u.zu(LUETT) === '14:30', u.zu(LUETT));
u = mitUhr(2026, 9, 19, 15, 30);
t('15:30 (Pause): geschlossen, öffnet heute 17:00 (nicht 11:30)', !u.offen(LUETT) && u.auf(LUETT) === '17:00', u.auf(LUETT));
u = mitUhr(2026, 9, 19, 9, 0);
t('09:00: öffnet heute 11:30', u.auf(LUETT) === '11:30', u.auf(LUETT));
u = mitUhr(2026, 9, 19, 23, 0);
t('23:00: heute öffnet nichts mehr -> leer (vorher "11:30")', u.auf(LUETT) === '', u.auf(LUETT));
t('Ruhetag (rest_day 0 = Montag): nichts', mitUhr(2026, 9, 19, 9, 0).auf({ opening_hours: LUETT.opening_hours, rest_day: 0 }) === '', '');
var EINE = { opening_hours: { mo_start: '11:00', mo_end: '22:00' } };
t('eine Schicht: wie vorher (bis 22:00 / öffnet 11:00)', mitUhr(2026, 9, 19, 18, 0).zu(EINE) === '22:00' && mitUhr(2026, 9, 19, 8, 0).auf(EINE) === '11:00', '');
var BAR = { opening_hours: { so_start: '18:00', so_end: '03:00', mo_start: '18:00', mo_end: '03:00' } };
t('Nachtschicht von gestern (Mo 01:30): bis 03:00', mitUhr(2026, 9, 19, 1, 30).zu(BAR) === '03:00', mitUhr(2026, 9, 19, 1, 30).zu(BAR));
t('Lokalseite "Öffnet heute" nutzt die nächste Schicht', /naechsterStartHeute\(rest, new Date\(\)\)/.test(fn('lpVisitenkarte')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
