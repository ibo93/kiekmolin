// EXTRAS AUS PDF: RICHTIGES RESTAURANT (26.10.2026)
//
// Ibo: "Die Extras machen Probleme ... ich will einfügen, er nimmt nichts an,
// er sagt kein Restaurant gewählt". Ursache: "Diese Extras anlegen" nahm das
// Restaurant aus dem Bereich SPEISEKARTE (menuRestaurantWahl), nicht aus
// "Optionen & Extras". Gemessen: am 26.10. kein Schreiben auf menu_option_groups.

var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = H.indexOf('{', i), tiefe = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') tiefe++;
        else if (H[k] === '}') { tiefe--; if (tiefe === 0) return H.slice(i, k + 1); }
    }
    return '';
}
function welt(wahlExtras, wahlKarte, gastro) {
    var W = { _gastroOnlyRestaurantId: gastro || null, currentMenuRestaurant: wahlKarte || null };
    var doc = { getElementById: function (id) { return id === 'optionsRestaurantSelect' ? { value: wahlExtras || '' } : null; } };
    return new Function('window', 'document', fn('extrasRestaurantWahl') + '; return extrasRestaurantWahl;')(W, doc);
}
t('Admin wählt in "Optionen & Extras" Haus A -> A', welt('A', null)() === 'A');
t('auch wenn in der Speisekarte Haus B offen ist -> A, nicht B', welt('A', 'B')() === 'A');
t('nichts gewählt -> keins (nicht still das Speisekarten-Haus)', welt('', 'B')() === null);
t('Wirt: sein eigenes Haus', welt('', null, 'W')() === 'W');
var ueb = fn('extrasPdfUebernehmen');
t('Anlegen nutzt die Extras-Wahl', /var rid = extrasRestaurantWahl\(\);/.test(ueb) && !/var rid = menuRestaurantWahl/.test(ueb));
t('Hinweis sagt, wo man wählt', /bitte oben bei „Restaurant" eins wählen/.test(ueb));
t('Öffnen fragt zuerst nach dem Restaurant', /if \(!extrasRestaurantWahl\(\)\) \{ showToast\('Bitte zuerst oben ein Restaurant wählen'/.test(fn('oeffneExtrasAusPdf')));
console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
