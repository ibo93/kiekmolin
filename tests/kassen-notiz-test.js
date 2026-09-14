// "OHNE TZAZIKI BITTE" KAM NIE BEI DER KASSE AN.
//
// Ibo am 14.09.2026: "hab was gemerkt -- was in den Notizen bei der
// Bestellung steht, steht nicht auf dem Bon."
//
// WAS WIRKLICH DA WAR
// -------------------
// Die Sonderbestellung zum Gericht (item.notes) wurde ueberall
// weitergereicht -- Datenbank, Dashboard, unser eigener epos-Bon --
// nur nicht an die Kassen:
//
//   winorder.js    Comment: ''        <- fest auf leer
//   pos-orders.js  kein notes-Feld    <- gar nicht dabei
//
// Bei winorder war das Feld sogar DA und wurde mit einer leeren
// Zeichenkette belegt. Kein Fehler, keine Meldung: ein leeres Feld
// sieht aus wie "keine Notiz". Und die Kasse druckt den Bon, mit dem
// die Kueche arbeitet -- auf unserem eigenen stand sie brav drauf.
//
// Genau die Sorte stiller Ausfall aus Regel 6: es sieht aus wie eine
// Antwort. Der Koch macht Tzaziki drauf und niemand weiss, warum.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(quelle, kopf) {
    var a = quelle.indexOf(kopf);
    if (a === -1) return '';
    var i = quelle.indexOf('{', a), tiefe = 0;
    for (var j = i; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    return '';
}

var WO = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'winorder.js'), 'utf8');
var PO = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'pos-orders.js'), 'utf8');

var BESTELLUNG = {
    id: 'abc', order_number: 'KI-260914-816449', status: 'received', order_type: 'pickup',
    customer_name: 'Bianca Hildebrandt', customer_phone: '017672235830',
    total: 8, subtotal: 8, payment_method: 'cash',
    items: [
        { name: 'Hähnchen Döner im Brot', quantity: 1, price: 8, notes: 'Ohne Tzaziki bitte',
          options: 'groß, Sauce Hollandaise' },
        { name: 'Pommes', quantity: 1, price: 3 }
    ],
    customer_notes: 'Bitte klingeln'
};

// ---- 1. WinOrder -- der Bon, den Ibo fotografiert hat ------------------
console.log('\n-- WinOrder --');
// Die gemeinsamen Bibliotheken werden ECHT hineingegeben, nicht
// nachgebaut -- ein Nachbau wuerde genau das verdecken, wogegen sie da
// sind: zwei Stellen, zwei Zuordnungen.
var mapOrder = new Function('parseAddress', 'ZAHLART', 'BESTELLART',
    schneide(WO, 'function mapOrder(o, rest)') + '; return mapOrder;')(
    function () { return { street: '', houseNo: '', zip: '', city: '', note: '' }; },
    require(path.join(KMI, 'netlify', 'functions', 'lib', 'zahlart.js')),
    require(path.join(KMI, 'netlify', 'functions', 'lib', 'bestellart.js')));

var wo = mapOrder(BESTELLUNG, { id: 'r1', name: 'Pronto' });
var artikel = wo.ArticleList.Article;
var doener = artikel.filter(function (a) { return /Döner/.test(a.ArticleName); })[0];

t('das Gericht ist dabei', !!doener, JSON.stringify(artikel.map(function (a) { return a.ArticleName; })));
t('die Sonderbestellung steht im Comment-Feld -- vorher war es fest leer',
  !!doener && doener.Comment === 'Ohne Tzaziki bitte', doener && JSON.stringify(doener.Comment));

var unter = (doener && doener.SubArticleList && doener.SubArticleList.SubArticle) || [];
var namen = unter.map(function (u) { return u.ArticleName; });
t('die Extras stehen weiter als Unterzeilen drunter',
  namen.indexOf('groß') >= 0 && namen.indexOf('Sauce Hollandaise') >= 0, namen.join(' | '));
t('und die Sonderbestellung ZUSAETZLICH als eigene Zeile -- Unterzeilen '
  + 'kommen auf dem Kassenbon nachweislich an, das Comment-Feld vielleicht nicht',
  namen.indexOf('** Ohne Tzaziki bitte') >= 0, namen.join(' | '));

var pommes = artikel.filter(function (a) { return a.ArticleName === 'Pommes'; })[0];
t('ein Gericht OHNE Notiz bekommt keine leere Zeile',
  !!pommes && pommes.Comment === '' && !pommes.SubArticleList, JSON.stringify(pommes));

t('die Notiz zur GANZEN Bestellung bleibt der HINWEIS-Artikel',
  artikel.some(function (a) { return a.ArticleName === 'HINWEIS' && /Bitte klingeln/.test(a.Comment); }),
  'Hinweis verloren');

// Leerzeichen-Unsinn darf keine leere Zeile erzeugen.
var leer = mapOrder(Object.assign({}, BESTELLUNG, {
    items: [{ name: 'Pizza', quantity: 1, price: 9, notes: '   ' }]
}), { id: 'r1', name: 'Pronto' });
var pizza = leer.ArticleList.Article.filter(function (a) { return a.ArticleName === 'Pizza'; })[0];
t('eine Notiz aus lauter Leerzeichen erzeugt keine "**"-Zeile',
  !!pizza && !pizza.SubArticleList, JSON.stringify(pizza && pizza.SubArticleList));

// ---- 2. pos-orders -- die offene Kassen-Schnittstelle ------------------
console.log('\n-- pos-orders --');
t('das Feld notes wird ueberhaupt mitgegeben',
  /notes: it\.notes \|\| ''/.test(PO), 'Kasse bekommt die Notiz nicht');
// Der Ausschnitt muss die MAP-Funktion sein, nicht bis zum naechsten
// "return {" -- das steht schon in der Map selbst drin.
var _posVon = PO.indexOf('var items = Array.isArray(o.items)');
var posBlock = PO.slice(_posVon, PO.indexOf('}) : [];', _posVon));
t('der Positions-Block wurde gefunden', posBlock.length > 80 && /it\.name/.test(posBlock), posBlock.length);
t('und zwar bei den POSITIONEN, nicht irgendwo', /notes/.test(posBlock), 'steht woanders');
t('die Extras bleiben daneben erhalten', /options: it\.options \|\| ''/.test(posBlock), 'Extras verloren');

// ---- 3. Unser eigener Bon konnte es schon -- und kann es weiter --------
console.log('\n-- Unser eigener Bon (zur Gegenkontrolle) --');
var V = require(path.join(__dirname, 'bon-vorschau.js'));
var zeilen = V.alsPapier(V.ladeBonBauer()(BESTELLUNG, 'Pronto'));
var nz = zeilen.filter(function (z) { return /Ohne Tzaziki/.test(z.text); })[0];
t('die Notiz steht drauf', !!nz, 'fehlt');
t('gross, wie der Gerichtname', !!nz && (nz.w > 1 || nz.h > 1), 'klein gedruckt');

// ---- 4. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var cm = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!cm, 'keine gefunden');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
