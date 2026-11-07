// HELLES LOGO IM WEISSEN KREIS (07.11.2026).
// Ein weisses/silbernes Logo verschwand im weissen Kreis der Lokalseite.
// lpLogoPruefen misst die Helligkeit und gibt dem Kreis dann dunklen Grund.
// (Den Farbverlauf im Kopf prueft tests/kopf-verlauf-korb-test.js.)
var fs = require('fs'), h = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + JSON.stringify(x))); }
// Helles Logo im weissen Kreis: die Messung wirklich ausfuehren
var vm = require('vm');
function schnipsel(name) { var a = h.indexOf('function ' + name + '('), i = h.indexOf('{', a), d = 0, j = i; for (; j < h.length; j++) { if (h[j] === '{') d++; else if (h[j] === '}') { d--; if (!d) break; } } return h.slice(a, j + 1); }
var k = {}; vm.createContext(k); vm.runInContext(schnipsel('lpLogoHell'), k);
function pixel(r, g, b, a, anzahl) { var d = []; for (var i = 0; i < anzahl; i++) d.push(r, g, b, a); return d; }
t('Weisses Logo (freigestellt) gilt als hell', vm.runInContext('lpLogoHell(' + JSON.stringify(pixel(250, 250, 250, 255, 50).concat(pixel(0, 0, 0, 0, 200))) + ')', k) === true);
t('Dunkles Logo bleibt auf Weiss', vm.runInContext('lpLogoHell(' + JSON.stringify(pixel(20, 40, 30, 255, 100)) + ')', k) === false);
t('Ganz durchsichtig = nichts aendern', vm.runInContext('lpLogoHell(' + JSON.stringify(pixel(255, 255, 255, 0, 100)) + ')', k) === false);
t('Logo im Kreis ruft die Pruefung auf', /class="lp-logo-kreis"[\s\S]{0,400}onload="lpLogoPruefen\(this\)"/.test(h));
t('Pruefung mit eigener Bildanfrage (angezeigtes Bild haengt nie davon ab)', /probe\.crossOrigin = 'anonymous'/.test(schnipsel('lpLogoPruefen')));
console.log('\n' + ok + '/' + n + (ok === n ? ' grün' : ' ROT'));
process.exit(ok === n ? 0 : 1);
