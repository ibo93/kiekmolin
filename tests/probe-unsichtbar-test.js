// KEINE PROBE IN EINER ECHTEN KUECHE.
//
// Die Gastweg-Wache legt alle 15 Minuten echte Bestellungen an und loescht
// sie Sekunden spaeter. Am 06.10.2026, beim Bau der Tisch-Probe,
// nachgesehen: VIER Stellen holen neue Bestellungen ab und reichen sie an
// echte Geraete weiter -- und keine hat Proben uebersprungen:
//
//   pos-print     Bondrucker, fragt 17 Mal pro Minute
//   pos-orders    Abholstelle fuer Kassensysteme
//   winorder      WinOrder-Kasse
//   index.html    Dashboard: Ton, Hinweis, Vollbild-Alarm, Push
//
// Ob es je passiert ist, ist von hier nicht messbar -- die Protokolle
// enthalten keinen Bestellinhalt. Offen war der Weg seit dem 25.08.2026.
//
// DIE WICHTIGSTE ZUSICHERUNG STEHT IN ABSCHNITT 1:
// Der Name, unter dem die Wache anlegt, muss mit dem Kennzeichen beginnen,
// auf das alle anderen pruefen. Benennt jemand die Probe um ("Wache-Test"),
// ist jede einzelne Sperre gleichzeitig wirkungslos -- und nichts wird rot,
// weil jede Stelle fuer sich ja noch "richtig" prueft.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - PROBE_NAME in lib/probe.js auf "Wache-Probe" umbenannt
//   - istProbe auf indexOf(...) >= 0 gelockert ("Max [Probe]" verliert Bon)
//   - die Sperre in pos-print entfernt
//   - in pos-print nur uebersprungen statt als gedruckt markiert
//   - in winorder VOR dem Markieren gefiltert (Probe bliebe in der Schlange)
//   - im Dashboard die Sperre hinter playOrderSound geschoben
'use strict';
var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var FN = path.join(KMI, 'netlify', 'functions');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }
function lies(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

var P;
try { P = require(path.join(FN, 'lib', 'probe.js')); }
catch (e) { console.log('FAIL | lib/probe.js laesst sich nicht laden  -> ' + e.message); process.exit(1); }

// Dieselben Faelle fuer beide Regeln -- Server und Browser.
var FAELLE = [
    { o: { customer_name: '[Probe] Gastweg-Wache' }, soll: true,  was: 'die Wache-Probe' },
    { o: { customer_name: '[Probe] irgendwas' },     soll: true,  was: 'jede [Probe]' },
    { o: { guest_name: '[Probe] Gastweg-Wache' },    soll: true,  was: 'Reservierungs-Probe (guest_name)' },
    { o: { customer_name: 'Max [Probe]' },           soll: false, was: 'ein Gast, der [Probe] im Namen hat' },
    { o: { customer_name: 'Probe' },                 soll: false, was: 'ein Gast namens Probe' },
    { o: { customer_name: ' [Probe] x' },            soll: false, was: 'Leerzeichen davor -- kein Kennzeichen' },
    { o: { customer_name: null },                    soll: false, was: 'kein Name' },
    { o: {},                                         soll: false, was: 'leere Bestellung' },
    { o: null,                                       soll: false, was: 'gar nichts' },
    { o: 'text',                                     soll: false, was: 'keine Bestellung' }
];

console.log('\n-- 1. Die Wache legt unter dem Namen an, auf den alle pruefen --');
t('der Name beginnt mit dem Kennzeichen', String(P.PROBE_NAME).indexOf(P.KENNZEICHEN) === 0,
  { name: P.PROBE_NAME, kennzeichen: P.KENNZEICHEN });
t('und die Wache erkennt ihre eigene Probe', P.istProbe({ customer_name: P.PROBE_NAME }) === true, P.PROBE_NAME);
t('das Kennzeichen ist "[Probe]" -- darauf pruefen pending-reminder und reservation-guest woertlich',
  P.KENNZEICHEN === '[Probe]', P.KENNZEICHEN);

var W = lies(path.join(FN, 'gastweg-wache.js'));
t('die Wache holt den Namen aus lib/probe.js', /require\('\.\/lib\/probe'\)/.test(W) && /PROBE_NAME = PROBE\.PROBE_NAME/.test(W), null);
t('und schreibt ihn nicht ein zweites Mal selbst hin', W.indexOf("'[Probe] Gastweg-Wache'") < 0, null);

console.log('\n-- 2. Die Regel auf dem Server --');
FAELLE.forEach(function (f) {
    t('Server: ' + f.was + ' -> ' + (f.soll ? 'Probe' : 'echt'), P.istProbe(f.o) === f.soll, P.istProbe(f.o));
});

console.log('\n-- 3. Dieselbe Regel im Browser --');
var H = lies(path.join(KMI, 'index.html'));
var a = H.indexOf('function istWacheProbe(o)');
var b = a < 0 ? -1 : H.indexOf('\n}\n', a);
var istWacheProbe = null;
try { if (a >= 0 && b > a) istWacheProbe = new Function(H.slice(a, b + 2) + '; return istWacheProbe;')(); }
catch (e) { istWacheProbe = null; }
t('die Browser-Regel gibt es und sie laeuft', typeof istWacheProbe === 'function', a);
if (typeof istWacheProbe === 'function') {
    FAELLE.forEach(function (f) {
        t('Browser: ' + f.was + ' -> ' + (f.soll ? 'Probe' : 'echt'), istWacheProbe(f.o) === f.soll, istWacheProbe(f.o));
    });
}

console.log('\n-- 4. Bondrucker --');
var PP = lies(path.join(FN, 'pos-print.js'));
var pSperre = PP.indexOf('if (PROBE.istProbe(order))');
var pBon = PP.indexOf('var xml = generateEposBon(order');
t('pos-print laedt die Regel', /require\('\.\/lib\/probe'\)/.test(PP), null);
t('und prueft VOR dem Bon', pSperre > 0 && pBon > pSperre, { sperre: pSperre, bon: pBon });
var zweig = pSperre > 0 ? PP.slice(pSperre, pBon) : '';
t('markiert die Probe als gedruckt -- sonst blockiert sie die Schlange bis zu 24 h',
  /printed_at:\s*new Date\(\)\.toISOString\(\)/.test(zweig), null);
t('und gibt dem Drucker eine leere Antwort', /return xmlResponse\(emptyEposResponse\(\)\)/.test(zweig), null);

console.log('\n-- 5. Kassen-Abholstelle --');
var PO = lies(path.join(FN, 'pos-orders.js'));
t('pos-orders laedt die Regel', /require\('\.\/lib\/probe'\)/.test(PO), null);
t('und filtert, bevor ausgeliefert wird',
  /\.filter\(function \(o\) \{ return !PROBE\.istProbe\(o\); \}\)\.map\(mapOrder\)/.test(PO), null);
t('customer_name wird dafuer ueberhaupt abgefragt', /'customer_name'/.test(PO), null);

console.log('\n-- 6. WinOrder --');
var WO = lies(path.join(FN, 'winorder.js'));
var wMark = WO.indexOf('{ winorder_sent_at: new Date().toISOString() });\n                if (!marked)');
var wFilter = WO.indexOf('var echte = orders.filter(function (o) { return !PROBE.istProbe(o); });');
t('winorder laedt die Regel', /require\('\.\/lib\/probe'\)/.test(WO), null);
t('filtert die Proben aus der Ausgabe', wFilter > 0 && /Order: echte\.map/.test(WO), wFilter);
t('aber erst NACH dem Markieren -- sonst stuende die Probe ewig in der Schlange',
  wMark > 0 && wFilter > wMark, { markieren: wMark, filtern: wFilter });

console.log('\n-- 7. Dashboard --');
var hr = H.indexOf('function handleRealtimeOrder(payload)');
var hrSperre = H.indexOf('if (istWacheProbe(order)) return;', hr);
var hrTon = H.indexOf('playOrderSound();', hr);
t('die Echtzeit-Meldung bricht bei einer Probe ab', hr > 0 && hrSperre > hr, hrSperre);
t('und zwar VOR Ton und Alarm', hrSperre > 0 && hrTon > hrSperre, { sperre: hrSperre, ton: hrTon });
t('die Bestellliste nimmt Proben gar nicht erst auf',
  /const data = \(await response\.json\(\)\)\.filter\(o => !istWacheProbe\(o\)\);\s*dashboardOrders = data\.map/.test(H), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
