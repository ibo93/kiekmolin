// Beleg: unser Logo unten, das des Lokals oben, QR-Code zur Seite des Lokals.
// Ibo, 12.10.2026: "beim Kassenbon muss unser Logo kiekmolin". Entschieden:
// oben bleibt der Verkaeufer (das Lokal), unten Absender + "naechstes Mal
// direkt hier bestellen".
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }
var pb = fn('printOrderBrowser');

// markeHtml ausfuehren: mit und ohne slug
var von = pb.indexOf('var _bestellUrl'), bis = pb.indexOf('let printContent', von);
var code = pb.slice(von, bis);
function marke(slug) { return new Function('restSlug', 'location', 'escapeHtml', code + '; return markeHtml;')(slug, { origin: 'https://kiekmolin.de' }, function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }); }
var m1 = marke('diemillis-emden'), m0 = marke('');
// Schwarz-weiss und ohne Netz: als SVG im Bon selbst (Ibo, 12.10.2026:
// "beim Ausdrucken muss es schon schwarz-weiss sein"). Ein Bild aus dem
// Netz konnte im Druckfenster fehlen und war gruen.
t('unser Logo im Fuß: schwarzes Zeichen mit weißem "Kiek", im Bon selbst (kein Bild aus dem Netz)', /<svg class="marke-logo"[^>]*aria-label="Kiek mol in"><rect [^>]*fill="#000"\/><text [^>]*fill="#fff">Kiek<\/text><\/svg>/.test(m1) && !/kiek-logo\.png/.test(m1), m1.slice(0, 200));
t('QR-Code führt zur Seite GENAU dieses Lokals', /data=https%3A%2F%2Fkiekmolin\.de%2Fdiemillis-emden"/.test(m1) && /Nächstes Mal direkt hier bestellen<br><strong>kiekmolin\.de\/diemillis-emden<\/strong>/.test(m1), m1);
t('ohne Adresse (slug) kein QR-Code ins Leere, Logo bleibt', !/marke-qr/.test(m0) && /marke-logo/.test(m0), m0);
t('der Fuß nutzt markeHtml', /\$\{markeHtml\}/.test(pb) && !/<div class="marke-url">kiekmolin\.de<\/div>\s*<\/div>\s*<\/div>\s*<\/body>/.test(pb), '');
t('oben bleibt das Logo des LOKALS', /<div class="kopf">\s*<div>\s*\$\{logoHtml\}/.test(pb) && /var restLogo = rest \? rest\.logo : null;/.test(pb), '');
t('Gestaltung für Bonrolle UND A4', (pb.match(/\.marke-logo \{/g) || []).length === 2 && (pb.match(/\.marke-qr img \{/g) || []).length === 2, (pb.match(/\.marke-logo \{/g) || []).length);

// ---- EIN Bon (Ibo, 12.10.2026: "Küchenbon brauchen wir nicht ... ein Bon,
// schön, sauber") -----------------------------------------------------------
var kb = fn('printKitchenBon');
t('printKitchenBon druckt im Browser denselben Bon wie für den Gast', /printOrderBrowser\(orderId\);\s*\}$/.test(kb.trim()) && kb.indexOf('KUECHEN-BON') < 0 || /printOrderBrowser\(orderId\);/.test(kb) && !/'KUECHEN-BON'|>KUECHEN-BON</.test(kb), kb.slice(-200));
t('nirgends wird mehr "KUECHEN-BON" gedruckt (auch nicht auf dem Text-Bondrucker)', !/'KUECHEN-BON'|>KUECHEN-BON</.test(H), '');
t('Bestellkarte: nur noch EIN Knopf "Bon", kein "Beleg"', !/> Beleg<\/button>/.test(H) && /aria-label="Bon drucken"/.test(H), '');
t('Tisch statt "Abholung", wenn der Gast vor Ort sitzt', /order\.order_type === 'dine_in' \? 'Tisch ' \+ \(order\.table_number \|\| '\?'\)/.test(pb), '');
t('Hinweis zur Bestellung und Vorbestellzeit stehen umrahmt drauf', /var _hinweis = order\.notes \|\| order\.delivery_notes \|\| '';/.test(pb) && /Hinweis zur Bestellung/.test(pb) && /\$\{hinweisHtml\}/.test(pb) && /\.hinweis \{[^}]*border: 2px solid #000/.test(pb), '');
// Ausgefuehrt: die Positionszeilen mit Groesse (ersetzt den Preis) und Extra.
var iv = pb.indexOf('var itemsHtml = (order.items || []).map('), ib = pb.indexOf("}).join('');", iv) + "}).join('');".length;
var zeilen = new Function('order', 'escapeHtml', 'formatPrice', 'var menuItems = [];' + fn('optionText') + fn('optionAufpreis') + fn('getDishNumber') + fn('bonGerichtNr') + pb.slice(iv, ib) + '; return itemsHtml;')(
    { items: [{ name: 'Pizza', quantity: 1, price: 12, selected_options: [{ group: 'item_sizes', option: 'groß', price: 12, price_type: 'replace' }, { group: 'extra', option: 'Extra Käse', price: 1.5, price_type: 'add' }] }] },
    function (x) { return String(x); }, function (x) { return x.toFixed(2).replace('.', ',') + ' €'; });
// ---- Gerichtnummer (Ibo, 12.10.2026: "mit Nummer der Gerichte muss sein")
function bonZeilen(items, karte) {
    return new Function('order', 'escapeHtml', 'formatPrice', 'menuItems', fn('optionText') + fn('optionAufpreis') + fn('getDishNumber') + fn('bonGerichtNr') + pb.slice(iv, ib) + '; return itemsHtml;')(
        { items: items }, function (x) { return String(x); }, function (x) { return x.toFixed(2).replace('.', ',') + ' €'; }, karte || []);
}
var mitNr = bonZeilen([{ name: 'Grillteller', quantity: 1, price: 12, dish_number: '12' }, { name: 'Ayran', quantity: 2, price: 5 }]);
t('Bon: Nummer vor dem Gericht, ohne Nummer keine leere Box', /<span class="gnr">12<\/span>Grillteller/.test(mitNr) && (mitNr.match(/class="gnr"/g) || []).length === 1, mitNr);
var alt = bonZeilen([{ name: 'Pizza', quantity: 1, price: 9, menu_item_id: 'm7' }], [{ id: 'm7', dish_number: '27' }]);
t('ältere Bestellung ohne Nummer: aus der geladenen Karte nachgeschlagen', /<span class="gnr">27<\/span>Pizza/.test(alt), alt);
t('die Bestellung schickt die Nummer jetzt mit (vorher nur im Warenkorb)', /dish_number: String\(item\.dish_number \|\| getDishNumber\(item\) \|\| ''\)\.slice\(0, 10\),\s*name: item\.name,/.test(H), '');
t('Nachbestellen behält die Nummer', /name: item\.name,\s*dish_number: item\.dish_number \|\| '',\s*quantity: item\.quantity \|\| 1,/.test(H), '');
var esc = fn('generateESCPOS');
t('Text-Bondrucker: "2x [12] Grillteller", Platz für den Preis mitgerechnet', /var _nrText = bonGerichtNr\(item\) \? '\[' \+ bonGerichtNr\(item\) \+ '\] ' : '';/.test(esc) && /_nrText\.length \+ item\.name\.length/.test(esc), '');
t('Größe und Extras je Gericht (Größe ohne Aufpreis, Extra mit)', /→ groß<\/div>/.test(zeilen) && /→ Extra Käse \(\+1,50 €\)/.test(zeilen), zeilen);
t('Rechtstext in einem Satz statt vier Zeilen', /Bestellbestätigung, kein Kassenbon \(§ 146a AO, ohne TSE\)/.test(pb) && pb.indexOf('i.V.m. KassenSichV') < 0, '');
t('Kopf ohne Etikett -- die Bestellart steht jetzt groß bei der Nummer', /<div class="auftrag-rechts">\s*<div class="art-chip">\$\{artText\}<\/div>/.test(pb), '');
t('kein "Bezahlt: Bar" mehr bei Barzahlung -- die Zeile sagt, ob kassiert werden muss', /var zahlZeile = _zst\.marke/.test(pb) && /\$\{escapeHtml\(zahlZeile\)\}/.test(pb) && !/Bezahlt: \$\{zahlartText\}/.test(pb), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
