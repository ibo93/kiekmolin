// TISCHPLAN: ZEITSCHIEBER (07.10.2026).
//
// Statt fuenf fester Uhrzeit-Knoepfe ein Schieber in 15-Minuten-Schritten,
// darueber je halbe Stunde ein Balken: wie viele Tische des Bereichs sind
// dann reserviert. So sieht man am Nachmittag, wo es abends eng wird.
//
// Die Rechnung (belegtUm, zeitSpanne) laeuft hier wirklich, in einer Sandbox.
// Den Rest -- Ziehen, Balken, Kontrast, iPad hochkant -- misst
// werkzeug/tischplan-messen.js im Browser.
//
// Gegenprobe (jede rot): "T >= a - 30" zu "T >= a", Dauer fest 60 statt
// duration_minutes, Rueckfall 11-23 Uhr entfernt, tp.gezeichnet nicht mehr
// gesetzt, requestAnimationFrame entfernt.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var von = H.indexOf('// ==================== TISCHPLAN (tp3)');
var TP = H.slice(von, H.indexOf('</script>', von));
function inTp(name) { var i = TP.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = TP.indexOf('{', i); for (var k = j; k < TP.length; k++) { if (TP[k] === '{') d++; else if (TP[k] === '}') { d--; if (!d) return TP.slice(i, k + 1); } } return ''; }

var sb = {
  tp: { rid: 'r1', datum: '2026-10-08', bereich: 'main',
        tische: [{ id: 'a', bereich: 'main' }, { id: 'b', bereich: 'main' }],
        res: [{ table_id: 'a', reservation_time: '19:00:00', duration_minutes: 90 }, { table_id: 'b', reservation_time: '20:00:00' }] },
  slots: [],
  Math: Math, String: String
};
sb.generateReservationSlots = function () { return sb.slots; };
vm.createContext(sb);
vm.runInContext("var VERBUND = 'Zusammen mit: ';\n" + ['minuten', 'notizTisch', 'verbundNamen', 'resFuerTisch', 'zeitSpanne', 'belegtUm'].map(inTp).join('\n'), sb);
var L = sb.tp.tische;
t('18:29: noch keiner (Tisch zaehlt ab 30 Min. vorher)', sb.belegtUm(18 * 60 + 29, L) === 0, sb.belegtUm(18 * 60 + 29, L));
t('18:30: Tisch a zaehlt schon', sb.belegtUm(18 * 60 + 30, L) === 1, sb.belegtUm(18 * 60 + 30, L));
t('20:00: beide (a bis 20:30, b ab 19:30)', sb.belegtUm(20 * 60, L) === 2, sb.belegtUm(20 * 60, L));
t('20:30: a ist durch (90 Min.), b noch da', sb.belegtUm(20 * 60 + 30, L) === 1, sb.belegtUm(20 * 60 + 30, L));
t('22:00: b ist durch (ohne Angabe 120 Min.)', sb.belegtUm(22 * 60, L) === 0, sb.belegtUm(22 * 60, L));
var sp = sb.zeitSpanne();
t('ohne Reservierungszeiten: 11 bis 23 Uhr', sp.von === 660 && sp.bis === 1380, JSON.stringify(sp));
sb.slots = ['17:15', '17:30', '21:30'];
sp = sb.zeitSpanne();
t('mit Zeiten 17:15-21:30: Schieber 17:00 bis 23:30 (+2 h Aufenthalt)', sp.von === 1020 && sp.bis === 1410, JSON.stringify(sp));

t('alte Zeit-Knoepfe weg, Schieber in 15-Minuten-Schritten da',
  !/id="tp3Zeiten"/.test(H) && /<input type="range" id="tp3Schieber"[^>]*step="15"[^>]*aria-label="Uhrzeit">/.test(H), '');
t('beim Ziehen hoechstens einmal pro Bild zeichnen', /requestAnimationFrame\(function \(\) \{\s*_schBild = 0;/.test(TP), '');
t('ohne Zustandswechsel nur die Zeitleiste neu (Boden bleibt)', /if \(standJetzt\(\) === tp\.gezeichnet\) \{ zeitenZeichnen\(\); seiteZeichnen\(\); return; \}/.test(TP), '');
t('zeichnen() merkt sich, was der Boden zeigt', /tp\.gezeichnet = tp\.bearbeiten \? null : standJetzt\(\);/.test(inTp('zeichnen')), '');
t('beim Bearbeiten ist die Zeitleiste weg', /\.tp3\[data-bearbeiten="1"\] \.tp3-zeitleiste \{ display: none; \}/.test(H), '');
t('Balken im Dunkeln eigene Farben', /\.dark-mode \.tp3-balken i \{ background: #3b5bab; \}/.test(H) && /\.dark-mode \.tp3-balken i\.eng \{/.test(H), '');
t('Seitenleiste sagt nur "Heute", wenn heute gewaehlt ist', /tp\.datum === heute\(\) \? 'Heute' : esc\(new Date\(tp\.datum/.test(TP), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
