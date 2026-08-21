// DIE GOOGLE-SEITEN WURDEN OHNE GERICHTE UND OHNE BEWERTUNGEN GEBAUT.
//
// Aus den Datenbank-Protokollen (21.08.2026):
//     column menu_items.price does not exist        134 Fehlversuche
//     column reviews.author_name does not exist     128 Fehlversuche
//     column reviews.restaurant_id does not exist     4 Fehlversuche
//
// build-seo-pages.js baut fuer jeden Betrieb eine eigene Seite fuer
// Google. Beide Abfragen -- Speisekarte und Bewertungen -- schlugen mit
// 400 fehl. Und weil beide "fault-tolerant" gebaut sind, kam ein leeres
// Array zurueck und die Seite wurde trotzdem gebaut: OHNE Gerichte,
// OHNE Bewertungen. Kein Fehler, kein Hinweis, monatelang.
//
// Das ist dieselbe Sorte wie bei google_reviews am Vortag: eine
// Abfrage, die immer scheitert, ein Notfall-Zweig, der still
// uebernimmt -- und niemand merkt, dass etwas fehlt.
//
// DIE DRITTE STELLE IST MEIN EIGENER FEHLER.
// Beim Reparieren der Bewertungsfotos habe ich am Vortag
// "restaurant_id=eq..." auf reviews geschrieben. Die Tabelle merkt sich
// ihr Ziel aber als Paar aus target_type und target_id. Ich habe den
// Spaltennamen geraten statt nachgesehen -- beim Beheben genau dieser
// Fehlerart.
//
// tests/spaltennamen-test.js prueft den select-Teil einer Abfrage.
// Diese drei standen im select bzw. im FILTER -- deshalb ist er nicht
// rot geworden. Diese Datei schliesst die Luecke fuer die Stellen, die
// wir kennen.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var seo = fs.readFileSync(KMI + '/build-seo-pages.js', 'utf8');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function ohneKommentar(txt) {
    return txt.split('\n').filter(function (z) { return /^\s*(\/\/|--)/.test(z) === false; }).join('\n');
}
var seoCode = ohneKommentar(seo);
var appCode = ohneKommentar(h);

console.log('\n-- 1. Die Speisekarte fuer Google --');
t('base_price wird geholt', /select=name,description,base_price,image_url/.test(seoCode), 'fehlt');
t('und "price" steht nicht mehr im select',
  /select=[^']*\bprice\b(?!_)/.test(seoCode.replace(/base_price/g, 'XX')) === false, 'noch drin');
// Wer die Spalte im select streicht, muss auch aufhoeren, sie zu lesen.
// Vorsicht bei der Suche: item.priceRange gibt es weiterhin und ist
// etwas anderes (das Preisniveau des Hauses fuer Google).
t('und wird auch nicht mehr gelesen',
  /\b(item|it)\.price(?![A-Za-z_])/.test(seoCode) === false, 'liest eine Spalte, die nicht kommt');
t('gelesen wird base_price', /const p = item\.base_price;/.test(seoCode)
  && /const p = it\.base_price;/.test(seoCode), 'liest etwas anderes');

console.log('\n-- 2. Die Bewertungen fuer Google --');
t('customer_name wird geholt',
  /select=rating,title,comment,customer_name,created_at/.test(seoCode), 'fehlt');
t('author_name steht nicht mehr im select',
  /author_name/.test(seoCode) === false, 'noch drin');
t('und wird auch nicht mehr gelesen',
  /rv\.author_name/.test(seoCode) === false, 'liest eine Spalte, die nicht kommt');
t('der Name kommt aus customer_name',
  /safeText\(rv\.customer_name, 'Gast'\)/.test(seoCode), 'anderer Weg');

console.log('\n-- 3. Bewertungen haben keine restaurant_id --');
// Die Tabelle merkt sich ihr Ziel als Paar: target_type + target_id.
t('der Filter benutzt target_type und target_id',
  /reviews\?select=id&target_type=eq\.restaurant&target_id=eq\./.test(appCode), 'falscher Filter');
t('und nicht mehr restaurant_id',
  /reviews\?select=id&restaurant_id=eq\./.test(appCode) === false, 'noch falsch');
// Der Grund gehoert in den Quelltext, sonst baut es jemand zurueck.
t('warum, steht daneben',
  h.indexOf('MEIN EIGENER FEHLER VOM VORTAG') > -1, 'kommentarlos geaendert');

console.log('\n-- 4. Was still scheitert, faellt sonst nie auf --');
// Beide Abfragen fangen ihren Fehler ab und liefern ein leeres Array.
// Das ist richtig -- eine Seite ohne Gerichte ist besser als keine
// Seite. Aber genau deshalb muss der Test hier stehen: der Bau meldet
// nichts.
t('die Speisekarten-Abfrage faengt Fehler weiterhin ab',
  /async function fetchMenuItems[\s\S]{0,900}?catch/.test(seoCode), 'Bau kippt bei einem Fehler');
t('und der Grund fuer den Test steht in der Datei',
  seo.indexOf('OHNE GERICHTE') > -1 || seo.indexOf('OHNE Gerichte') > -1, 'keine Begruendung');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
