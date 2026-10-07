// DANKE-BILDSCHIRM NACH DEM ENTWURF "STEMPEL" (07.10.2026).
//
// Vorher: "Vielen Dank für deine Bestellung!", darunter "BESTELLUNG #… · Datum",
// eine Leiste mit 10-px-Beschriftungen in 40 % Deckkraft und darunter ein
// zweiter Kasten, der dasselbe noch einmal sagte. Jetzt: "Danke, Anna!",
// "Bestellung #… · Abholung um 19:15" (Uhrzeit NUR bei Vorbestellung --
// sonst ist sie nicht bekannt), Balken + ein Satz.
//
// Nebenbei gefunden: Browser-Benachrichtigungen zeigten "check Bestätigt!" --
// das Entfernen der Tags liess den Namen des Symbols stehen.
//
// Gegenprobe (jede rot): Vorname nicht abgeschnitten, Uhrzeit ohne
// Vorbestellung erfunden, ocOhneSymbol wieder nur /<[^>]*>/, Satz nicht
// gesetzt, liveStatusBanner wieder sichtbar.
// Den Rest (Kontrast, Balken, dunkel) misst werkzeug/danke-messen.js.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var sb = { String: String, Date: Date, isNaN: isNaN, window: {} };
vm.createContext(sb);
vm.runInContext(fn('ocDankeTitel') + fn('ocDankeZeile') + fn('ocOhneSymbol'), sb);
t('"Anna Janssen" -> "Danke, Anna!"', sb.ocDankeTitel('  Anna Janssen ') === 'Danke, Anna!', sb.ocDankeTitel('Anna Janssen'));
t('ohne Namen -> "Danke für deine Bestellung!"', sb.ocDankeTitel('') === 'Danke für deine Bestellung!', sb.ocDankeTitel(''));
var um = new Date(2026, 9, 7, 19, 15).toISOString();
t('Vorbestellung: "Bestellung #KM-1 · Abholung um 19:15"', sb.ocDankeZeile('KM-1', 'pickup', null, um) === 'Bestellung #KM-1 · Abholung um 19:15', sb.ocDankeZeile('KM-1', 'pickup', null, um));
t('sofort: keine erfundene Uhrzeit', sb.ocDankeZeile('KM-1', 'pickup', null, null) === 'Bestellung #KM-1 · Abholung', sb.ocDankeZeile('KM-1', 'pickup', null, null));
t('Lieferung / am Tisch', sb.ocDankeZeile('KM-1', 'delivery', null, null) === 'Bestellung #KM-1 · Lieferung' && sb.ocDankeZeile('KM-1', 'dine_in', '7', null) === 'Bestellung #KM-1 · Tisch 7', '');
var mit = '<span class="ki"><span class="material-symbols-outlined" style="font-size:24px;color:#16a34a;">check</span></span> Bestätigt!';
var svg = '<span class="ki"><svg viewBox="0 0 24 24"><rect x="5"/><path d="M9 2"/></svg></span> Bestellung eingegangen';
t('Symbol-Wort verschwindet ("check Bestätigt!" -> "Bestätigt!")', sb.ocOhneSymbol(mit) === 'Bestätigt!' && sb.ocOhneSymbol(svg) === 'Bestellung eingegangen', sb.ocOhneSymbol(mit));

var up = fn('updateOrderTrackerUI');
t('Browser-Benachrichtigung ohne Symbol-Wort', /var plainMsg = ocOhneSymbol\(/.test(up) && !/plainMsg = \(statusMessages\[status\] \|\| status\)\.replace\(\/<\[\^>\]\*>\/g/.test(up), '');
t('Satz unter den Balken wird bei jedem Stand gesetzt', /_satz\.textContent = _st;/.test(up) && /'Fertig – du kannst es abholen'/.test(up), '');
t('Balken: Zustand per Klasse, storniert rot', /step\.classList\.toggle\('erreicht', idx <= activeStep\)/.test(up) && /_trk\.classList\.add\('storniert'\)/.test(up) && /#orderStatusTracker\.storniert \.status-step \{ background: #dc2626; \}/.test(H), '');
t('Markup: Kopf mit id, Titel "Stand deiner Bestellung", Satz', /id="ocDankeTitel"/.test(H) && /<div class="oc-stand-titel">Stand deiner Bestellung<\/div>/.test(H) && /id="ocStandSatz" aria-live="polite"/.test(H), '');
t('kein zweiter Kasten mit demselben Text', /#orderConfirmationModal #liveStatusBanner \{ display: none !important; \}/.test(H), '');
t('Beschriftungen bleiben fuer Vorleser (nicht display:none)', /#orderStatusTracker \.status-label \{ position: absolute !important; width: 1px;/.test(H), '');
t('submitOrder fuellt Kopf + Zeile und setzt den Stand zurueck', /_ocTitel\.textContent = ocDankeTitel\(name\)/.test(H) && /ocDankeZeile\(orderNumber, orderType, tableNumber, window\._vorbestellungFuer\)/.test(H) && /_ocSatz0\.textContent = OC_STAND_SATZ\.received/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
