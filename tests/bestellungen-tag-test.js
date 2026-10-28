// BESTELLUNGEN: JEDEN TAG WAEHLEN (28.10.2026, Ibo: "will jeden tage haben").
// Vorher gab es nur Heute / Gestern / Woche / Monat / Jahr. Der Test FUEHRT
// die Zeitraum-Rechnung und das Blaettern aus.
'use strict';
// Deutsche Zeit -- in UTC faellt "Mitternacht UTC statt Ortszeit" nicht auf.
process.env.TZ = 'Europe/Berlin';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var geladen = 0, el = {};
function knoten(id) { return el[id] || (el[id] = { id: id, value: '', style: {}, disabled: false, classList: { add: function () {}, remove: function () {} }, remove: function () { delete el[id]; }, focus: function () {} }); }
var dok = {
    getElementById: function (id) { return id === 'ordersTagOption' ? (el[id] || null) : knoten(id); },
    createElement: function () { return { style: {}, remove: function () { delete el.ordersTagOption; } }; }
};
knoten('ordersTimeFilter').insertBefore = function (o) { el.ordersTagOption = o; };
knoten('ordersTimeFilter').querySelector = function () { return null; };
var namen = ['changeOrdersTimeFilter', 'ordersTagVon', 'ordersTagSetzen', 'ordersTagBlaettern', 'ordersTagAnzeigen', 'ordersTagText', 'getTimeFilterStart', 'getTimeFilterEnd'];
var K = new Function('document', 'loadDashboardOrders', 'localDayStr',
    'var ordersTimeFilter = "today";\n' + namen.map(fn).join('\n') + '\nreturn { f: function () { return ordersTimeFilter; }, change: changeOrdersTimeFilter, setzen: ordersTagSetzen, blaettern: ordersTagBlaettern, start: getTimeFilterStart, ende: getTimeFilterEnd, text: ordersTagText };')(
    dok, function () { geladen++; }, function (d) { return d.toLocaleDateString('sv-SE'); });

var s = K.start('tag:2026-10-21'), e = K.ende('tag:2026-10-21');
t('gewählter Tag beginnt um 0 Uhr ORTSZEIT', s.getFullYear() === 2026 && s.getMonth() === 9 && s.getDate() === 21 && s.getHours() === 0, s.toString());
t('… und endet am nächsten Tag um 0 Uhr (genau ein Tag)', e.getDate() === 22 && e.getHours() === 0 && (e - s) >= 23 * 3600000 && (e - s) <= 25 * 3600000, e.toString());
t('Heute/Woche/Monat/Jahr unverändert offen nach hinten', K.ende('today') === null && K.ende('week') === null && K.ende('year') === null, '');

K.setzen('2026-10-21');
t('Tag setzen -> Filter "tag:2026-10-21", Liste lädt neu', K.f() === 'tag:2026-10-21' && geladen === 1, K.f());
t('die Auswahl zeigt den Tag als eigene Zeile (nicht weiter "Heute")', el.ordersTagOption && el.ordersTagOption.value === 'tag:2026-10-21' && /21\.10/.test(el.ordersTagOption.textContent) && el.ordersTimeFilter.value === 'tag:2026-10-21', JSON.stringify(el.ordersTagOption && el.ordersTagOption.textContent));
K.blaettern(-1);
t('‹ blättert einen Tag zurück', K.f() === 'tag:2026-10-20', K.f());
K.blaettern(1); K.blaettern(1);
t('› blättert vor', K.f() === 'tag:2026-10-22', K.f());
K.setzen('kaputt');
t('ungültiges Datum ändert nichts', K.f() === 'tag:2026-10-22', K.f());
K.change('week');
t('zurück auf "Diese Woche" -> Tageszeile verschwindet', K.f() === 'week' && !el.ordersTagOption, K.f());
K.change('tag');
t('"Tag wählen …" allein filtert noch nicht (erst wenn ein Tag gewählt ist)', K.f() === 'week' && el.ordersTimeFilter.value === 'week', K.f());

t('Auswahl hat "Tag wählen …", ein Kalenderfeld und ‹ ›', /<option value="tag">Tag wählen …<\/option>/.test(H) && /id="ordersTagWahl"[^>]*onchange="ordersTagSetzen\(this\.value\)"/.test(H) && /onclick="ordersTagBlaettern\(-1\)"/.test(H), '');
t('Vergleich: abgeschlossener Tag gegen den Tag davor (nicht "jetzt minus Anfang")', /var ende = getTimeFilterEnd\(ordersTimeFilter\);\s*var now = ende \|\| new Date\(\);/.test(fn('loadPeriodComparison')), '');
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
