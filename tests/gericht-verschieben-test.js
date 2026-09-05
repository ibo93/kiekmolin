// EIN GERICHT NACH VORNE ZIEHEN -- AUCH AUF DEM HANDY.
//
// Idee von Ibo am 04.09.2026: "wenn der gastronomen ein gericht oder
// menue mehr nach vorne zeigen wie man es besser verkaufen kann".
//
// GEMESSEN, BEVOR ICH GEBAUT HABE: Ziehen zum Sortieren gab es laengst
// -- onItemDragStart, onItemDrop, saveItemOrder, und die Gastseite laedt
// mit order=sort_order. Neu bauen musste man das nicht.
//
// Die Luecke lag woanders: das Ziehen haengt an der HTML5-Drag-
// Schnittstelle, und die reagiert auf einem Touch-Bildschirm NICHT. In
// der ganzen Speisekarten-Liste steht kein einziger touchstart. Ein Wirt
// am Telefon konnte seine Karte also gar nicht umsortieren.
//
// Zwei Pfeile tun dasselbe, funktionieren aber ueberall.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

var a = h.indexOf('function gerichtVerschieben(itemId, catId, richtung) {');
var e = h.indexOf('\n}\n', a) + 3;
t('gerichtVerschieben wurde gefunden', a > 0 && e > a, a + '/' + e);

function bauen() {
    var gesagt = [], gespeichert = [];
    var ctx = {
        menuItems: [
            { id: 'a', name: 'Pizza',   category_id: 'k1', sort_order: 1 },
            { id: 'b', name: 'Pasta',   category_id: 'k1', sort_order: 2 },
            { id: 'c', name: 'Salat',   category_id: 'k1', sort_order: 3 },
            { id: 'x', name: 'Cola',    category_id: 'k2', sort_order: 1 }
        ],
        showToast: function (txt, art) { gesagt.push({ text: txt, art: art }); },
        renderMenuCategories: function () {},
        saveItemOrder: function (bewegt, liste) { gespeichert.push({ bewegt: bewegt.id, liste: liste.map(function (i) { return i.id; }) }); },
        Array: Array, console: console
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(h.slice(a, e), ctx);
    return { ctx: ctx, gesagt: gesagt, gespeichert: gespeichert,
             reihe: function (kat) {
                 return ctx.menuItems.filter(function (i) { return i.category_id === (kat || 'k1'); })
                          .sort(function (p, q) { return p.sort_order - q.sort_order; })
                          .map(function (i) { return i.id; }).join(',');
             } };
}

// ---- 1. Nach oben ----------------------------------------------------
console.log('\n-- Ein Gericht nach vorne --');
var w = bauen();
t('Ausgangslage', w.reihe() === 'a,b,c', w.reihe());
w.ctx.gerichtVerschieben('c', 'k1', -1);
t('Salat steht jetzt vor Pasta', w.reihe() === 'a,c,b', w.reihe());
t('die sort_order ist lueckenlos 1,2,3',
  w.ctx.menuItems.filter(function (i) { return i.category_id === 'k1'; })
    .map(function (i) { return i.sort_order; }).sort().join(',') === '1,2,3',
  w.ctx.menuItems.map(function (i) { return i.sort_order; }).join(','));
t('und es wurde gespeichert', w.gespeichert.length === 1 && w.gespeichert[0].bewegt === 'c',
  JSON.stringify(w.gespeichert));
t('gespeichert wird die GANZE Kategorie, nicht nur das Gericht',
  w.gespeichert[0].liste.join(',') === 'a,c,b', w.gespeichert[0].liste.join(','));
t('und der Wirt erfaehrt den neuen Platz',
  /Platz 2/.test(w.gesagt[w.gesagt.length - 1].text), w.gesagt[w.gesagt.length - 1].text);

// ---- 2. Nach unten ---------------------------------------------------
console.log('\n-- Und zurueck --');
var w2 = bauen();
w2.ctx.gerichtVerschieben('a', 'k1', 1);
t('Pizza steht jetzt an zweiter Stelle', w2.reihe() === 'b,a,c', w2.reihe());

// ---- 3. Die Raender duerfen nicht schweigen --------------------------
console.log('\n-- Oben ist oben --');
var w3 = bauen();
w3.ctx.gerichtVerschieben('a', 'k1', -1);
t('ganz oben bleibt die Reihenfolge gleich', w3.reihe() === 'a,b,c', w3.reihe());
t('es wird NICHT gespeichert', w3.gespeichert.length === 0, w3.gespeichert.length);
// Ein Knopf, der stumm nichts tut, sieht kaputt aus (Regel 6).
t('aber es wird gesagt', w3.gesagt.length === 1 && /ganz oben/.test(w3.gesagt[0].text),
  JSON.stringify(w3.gesagt));

var w4 = bauen();
w4.ctx.gerichtVerschieben('c', 'k1', 1);
t('ganz unten ebenso', w4.reihe() === 'a,b,c' && /ganz unten/.test(w4.gesagt[0].text),
  JSON.stringify(w4.gesagt));

// ---- 4. Die Nachbarkategorie bleibt unberuehrt -----------------------
console.log('\n-- Andere Kategorien --');
var w5 = bauen();
w5.ctx.gerichtVerschieben('c', 'k1', -1);
t('Cola in k2 behaelt ihren Platz', w5.reihe('k2') === 'x', w5.reihe('k2'));
t('und keine Zeile geht verloren', w5.ctx.menuItems.length === 4, w5.ctx.menuItems.length);

// ---- 5. Unbekanntes Gericht -----------------------------------------
var w6 = bauen();
w6.ctx.gerichtVerschieben('gibtsnicht', 'k1', -1);
t('ein unbekanntes Gericht wird gemeldet, nicht verschluckt',
  w6.gesagt.length === 1 && w6.gesagt[0].art === 'error', JSON.stringify(w6.gesagt));

// ---- 6. Die Knoepfe stehen wirklich in der Maske ---------------------
console.log('\n-- Die Knoepfe --');
t('es gibt einen Pfeil nach oben', /gerichtVerschieben\('\$\{item\.id\}','\$\{cat\.id\}',-1\)/.test(h), 'fehlt');
t('und einen nach unten', /gerichtVerschieben\('\$\{item\.id\}','\$\{cat\.id\}',1\)/.test(h), 'fehlt');
t('beide sind fuer Vorleseprogramme beschriftet',
  (h.match(/nach oben"|nach unten"/g) || []).length >= 2, 'kein aria-label');

// ---- 7. Das Ziehen bleibt, wo es geht -------------------------------
t('Ziehen wurde nicht entfernt', /onItemDragStart\(event/.test(h), 'Ziehen ist weg');
t('und beide Wege speichern ueber dieselbe Funktion',
  (h.match(/saveItemOrder\(/g) || []).length >= 3, 'zwei Wahrheiten statt einer');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
