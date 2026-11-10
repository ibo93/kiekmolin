// GERICHTNUMMER AUF DER BESTELLKARTE UND IM KUECHEN-DISPLAY.
//
// Ibo am 10.11.2026: "Wichtig die Gericht ohne Nummer drauf wie koennen wir
// es mit Nummern machen".
//
// Die Nummer wird seit 12.10.2026 mit jeder Bestellung gespeichert
// (orders.items[].dish_number) und stand auf dem Bon. Auf der Karte im
// Dashboard und im Kuechen-Display fehlte sie, weil:
//  1. das Laden der Bestellungen nur name/quantity/options/... uebernahm --
//     dish_number fiel dort weg;
//  2. die Zeilen aus order_items die Nummer gar nicht haben. Sie steht nur in
//     der JSON-Liste der Bestellung.
//
// Wie es kaputt aussaehe: "2× Pizza Margherita" ohne "31" -- kein Fehler,
// keine Meldung. Deshalb prueft der Test das ERGEBNIS (HTML), nicht nur, ob
// ein Wort im Quelltext steht.

var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, q) {
    q = q || H;
    var i = q.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++;
    var d = 0, j = q.indexOf('{', i);
    for (var k = j; k < q.length; k++) { if (q[k] === '{') d++; else if (q[k] === '}') { d--; if (!d) return q.slice(i, k + 1); } }
}
var esc = function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

function bauen(quelle) {
    return new Function('escapeHtml', 'formatPrice', 'optionText',
        'var GANG_TEXT = {0:"Getränke",1:"Vorspeise",2:"Hauptgang",3:"Nachtisch"}; var menuItems = [];'
        + fn('getDishNumber', quelle) + fn('bonGerichtNr', quelle) + fn('posNummernErgaenzen', quelle) + fn('posNrHtml', quelle)
        + fn('gangGruppen', quelle) + fn('gangJetzt', quelle) + fn('bestellExtrasText', quelle)
        + fn('bestellPosHtml', quelle) + fn('bestellPosKurz', quelle) + fn('kdsPosHtml', quelle)
        + '; return { erg: posNummernErgaenzen, pos: bestellPosHtml, kurz: bestellPosKurz, kds: kdsPosHtml, nr: posNrHtml };'
    )(esc, function (x) { return x + ' €'; }, function (o) { return typeof o === 'string' ? o : (o && (o.option || o.name)) || ''; });
}
var F = bauen();

// ---- Anzeige --------------------------------------------------------------
var pos = F.pos([{ name: 'Pizza Margherita', quantity: 2, price: 16, dish_number: '31' }], true);
t('Karte: Nummer 31 vor dem Gericht', /<b>2×<\/b> <span class="kin-nr">31<\/span> Pizza Margherita/.test(pos), pos);
t('Karte ohne Nummer: kein leeres Schild', !/kin-nr/.test(F.pos([{ name: 'Cola', quantity: 1, price: 2 }], true)), '');
t('Kurzzeile: Nummer dabei', /<span class="kin-nr">7<\/span> Lahmacun/.test(F.kurz([{ name: 'Lahmacun', quantity: 1, dish_number: '7' }])), F.kurz([{ name: 'Lahmacun', quantity: 1, dish_number: '7' }]));
var kds = F.kds({ item_name: 'Gyros-Teller', quantity: 1, dish_number: '45' });
t('Kuechen-Display: Nummer dabei', /1× <span class="kin-nr">45<\/span> Gyros-Teller/.test(kds), kds);
t('Nummer wird maskiert', /&lt;b&gt;/.test(F.nr({ dish_number: '<b>' })), F.nr({ dish_number: '<b>' }));

// ---- Nachtragen aus der JSON-Liste ---------------------------------------
var zeilen = [{ item_name: 'Pizza Salami', quantity: 1 }, { item_name: 'Cola', quantity: 2, menu_item_id: 'm-cola' }];
var json = [{ name: 'Pizza Salami', dish_number: '32' }, { name: 'Cola 0,33', menu_item_id: 'm-cola', dish_number: '90' }];
var e = F.erg(zeilen, json);
t('order_items: gleiche Stelle + gleicher Name -> 32', e[0].dish_number === '32', JSON.stringify(e[0]));
t('order_items: anderer Name, gleiche menu_item_id -> 90', e[1].dish_number === '90', JSON.stringify(e[1]));
t('Original-Zeile bleibt unveraendert (Kopie)', !('dish_number' in zeilen[0]), JSON.stringify(zeilen[0]));
var falsch = F.erg([{ item_name: 'Pizza Hawaii' }], [{ name: 'Pizza Salami', dish_number: '32' }]);
t('Andere Pizza an derselben Stelle: KEINE fremde Nummer', !falsch[0].dish_number, JSON.stringify(falsch[0]));
t('Ohne JSON-Liste: nichts Geratenes', !F.erg([{ item_name: 'X' }], null)[0].dish_number, '');

// ---- Gegenproben: den Fehler wieder einbauen ------------------------------
var M1 = bauen(H.replace("(typeof posNrHtml === 'function' ? posNrHtml(it) : '') + escapeHtml(it.name || '') + '</span>'", "escapeHtml(it.name || '') + '</span>'"));
t('Gegenprobe: ohne Nummer in der Karte wird der Test rot',
    !/kin-nr/.test(M1.pos([{ name: 'Pizza', quantity: 1, dish_number: '31' }], true)), '');
var M2 = bauen(H.replace("var q = (json[i] && json[i].name === name) ? json[i]", "var q = json[i] ? json[i]"));
t('Gegenprobe: nur nach Stelle (ohne Namen) gaebe der Hawaii die 32 -- Test wird rot',
    M2.erg([{ item_name: 'Pizza Hawaii' }], [{ name: 'Pizza Salami', dish_number: '32' }])[0].dish_number === '32', '');

// ---- Laden im Dashboard -----------------------------------------------------
t('Laden: JSON-Weg uebernimmt dish_number', /menu_item_id: item\.menu_item_id \|\| null,\s*dish_number: item\.dish_number \|\| '',\s*gang: item\.gang/.test(H), '');
t('Laden: order_items-Weg wird aus orders.items ergaenzt', /items: posNummernErgaenzen\(\(order\.order_items && order\.order_items\.length > 0\)/.test(H) && /\}\)\), order\.items\),\n\s*subtotal: order\.subtotal,/.test(H), '');
t('Kuechen-Display ergaenzt order_items ebenso', /posNummernErgaenzen\(o\.order_items, o\.items\)/.test(fn('_kdsRenderCard')), '');
t('Bestellung speichert die Nummer weiter (Gast-Weg)', /dish_number: String\(item\.dish_number \|\| getDishNumber\(item\) \|\| ''\)\.slice\(0, 10\)/.test(H), '');
t('Dunkelmodus fuer das Schild', /\.dark-mode \.kin-nr \{/.test(H) && /\.dark-mode \.kds2 \.kin-nr \{/.test(H), '');

console.log('\n' + ok + '/' + n + ' OK');
process.exit(ok === n ? 0 : 1);
