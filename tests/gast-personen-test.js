// MEHR ALS 8 PERSONEN BEIM GAST (Ibo 11.11.2026: "Wenn mehrere Personen
// kommen? Wir müssen die Personenanzahl erhöhen ... auch beim Gast").
//
// Vorher: Plus endete bei 8, angezeigt "8+". Eine Gruppe von 12 kam als 8
// beim Wirt an -- der plante zu kleine Tische, und niemand merkte es.
// Jetzt bis 30; der Server nimmt 1-50 an und prueft die freien Plaetze selbst.
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var S = fs.readFileSync(path.join(__dirname, '..', 'netlify/functions/reservation-guest.js'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, q) {
    q = q || H;
    var i = q.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++; var d = 0, j = q.indexOf('{', i);
    for (var k = j; k < q.length; k++) { if (q[k] === '{') d++; else if (q[k] === '}') { d--; if (!d) return q.slice(i, k + 1); } }
}
function zeichne(gaeste, quelle) {
    var el = { innerHTML: '' };
    var max = /var RES_GAST_MAX = (\d+);/.exec(quelle || H);
    new Function('document', '_resSelectedGuests', (max ? 'var RES_GAST_MAX = ' + max[1] + ';' : '') + fn('resGuestRender', quelle) + 'resGuestRender();')(
        { getElementById: function () { return el; } }, gaeste);
    return el.innerHTML;
}
var max = parseInt((/var RES_GAST_MAX = (\d+);/.exec(H) || [])[1], 10);
t('Grenze beim Gast mindestens 20', max >= 20, String(max));
t('Grenze beim Gast hoechstens so hoch wie der Server erlaubt (50)', max <= 50 && /groesse <= 50/.test(S), String(max));
var h12 = zeichne(12);
t('12 Personen werden als 12 gezeigt (nicht "8+")', /<b id="resGuestZahl">12<\/b>/.test(h12), h12.slice(0, 200));
t('Plus bei 12 fuehrt zu 13', /resGuestSelect\(13\)/.test(h12), '');
var hMax = zeichne(max);
t('Am Maximum ist Plus aus', /res-stepper-plus[^>]*resGuestSelect\(' ?\d*'?\)?"? ?disabled|disabled><span class="material-symbols-outlined">add/.test(hMax), hMax.slice(-300));
t('Zusammenfassung zeigt die echte Zahl', !/'8\+'/.test(fn('resPersonenText')), '');
var alt = H.replace(/var RES_GAST_MAX = \d+;/, 'var RES_GAST_MAX = 8;');
t('Gegenprobe: mit Grenze 8 waere bei 8 Schluss -- Test wird rot', /disabled><span class="material-symbols-outlined">add/.test(zeichne(8, alt)), '');
console.log('\n' + ok + '/' + n + ' OK');
process.exit(ok === n ? 0 : 1);
