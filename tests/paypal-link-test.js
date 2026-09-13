// PAYPAL: DER LINK, DER FAST IMMER KAPUTT WAR.
//
// Ibo am 13.09.2026: "der gastronom bietet paypal, es geht irgendwie
// nicht so gut."
//
// NACHGERECHNET STATT GERATEN. Der Code nahm den eingetippten Wert genau
// so, wie er dastand -- nur .trim(). Bei acht realistischen Eingaben:
//
//   PizzeriaPronto                   -> OK
//   paypal.me/PizzeriaPronto         -> paypal.me/paypal.me/...      KAPUTT
//   https://paypal.me/PizzeriaPronto -> paypal.me/https://...        KAPUTT
//   @PizzeriaPronto                  -> @ mitten im Link             KAPUTT
//   Pizzeria Pronto                  -> Leerzeichen im Link          KAPUTT
//   PizzeriaPronto/                  -> doppelter Schraegstrich      KAPUTT
//
// Sechs von acht. Und in JEDEM Fall meldete das Dashboard gruen
// "PayPal.me gespeichert". Ueber dem Feld steht "PayPal.me LINK" -- wer
// "Link" liest, fuegt einen Link ein. Das laedt dazu ein.
//
// VIER FEHLER, ALLE STILL:
// 1. Kaputter Link, gruene Meldung.
// 2. PayPal einschaltbar OHNE Namen -> der Gast waehlt PayPal, bestellt,
//    und bekommt danach keinen einzigen Bezahlweg zu sehen.
// 3. Der Link stand an genau EINER Stelle: dem Bestaetigungsschirm.
//    Tab zu = Geld weg. Nicht in der Mail, nicht in der Verfolgung.
// 4. Auf dem Bon stand "PAYPAL" -- genauso beruhigend wie "BAR", obwohl
//    niemand weiss, ob bezahlt wurde.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var mail = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'order-email.js'), 'utf8');
var bon = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'pos-print.js'), 'utf8');

function schneide(q, name) {
    var a = q.indexOf('function ' + name + '(');
    if (a < 0) a = q.indexOf('async function ' + name + '(');
    if (a < 0) return '';
    var tiefe = 0, i = q.indexOf('{', a);
    if (i < 0) return '';
    for (var j = i; j < q.length; j++) {
        if (q[j] === '{') tiefe++;
        else if (q[j] === '}') { tiefe--; if (tiefe === 0) return q.slice(a, j + 1); }
    }
    return '';
}

// ---- Das Objekt WIRKLICH ausfuehren -----------------------------------
var a = h.indexOf('var PAYPAL = {');
var e = h.indexOf('window.PAYPAL = PAYPAL;');
t('PAYPAL wurde gefunden', a > 0 && e > a, a + '/' + e);
var P = new Function(h.slice(a, e) + '; return PAYPAL;')();

// ---- 1. Genau die Eingaben, die vorher kaputtgingen -------------------
console.log('\n-- Was der Wirt tatsaechlich eintippt --');
[
  ['PizzeriaPronto', 'PizzeriaPronto'],
  ['paypal.me/PizzeriaPronto', 'PizzeriaPronto'],
  ['https://paypal.me/PizzeriaPronto', 'PizzeriaPronto'],
  ['https://www.paypal.me/PizzeriaPronto', 'PizzeriaPronto'],
  ['PayPal.Me/PizzeriaPronto', 'PizzeriaPronto'],
  ['@PizzeriaPronto', 'PizzeriaPronto'],
  ['PizzeriaPronto/', 'PizzeriaPronto'],
  ['  PizzeriaPronto  ', 'PizzeriaPronto'],
  ['paypal.me/PizzeriaPronto/12.00', 'PizzeriaPronto'],
  ['https://paypal.me/PizzeriaPronto?locale=de', 'PizzeriaPronto']
].forEach(function (f) {
    t('"' + f[0] + '" wird zu "' + f[1] + '"', P.handle(f[0]) === f[1], P.handle(f[0]));
});

// ---- 2. Was NICHT durchgehen darf -------------------------------------
console.log('\n-- Was abgelehnt werden muss --');
t('Leerzeichen im Namen', P.gueltig('Pizzeria Pronto') === false, 'geht durch');
t('Umlaut im Namen', P.gueltig('Kueche') === true && P.gueltig('Küche') === false, 'falsch bewertet');
t('leer', P.gueltig('') === false, 'geht durch');
t('Schraegstrich', P.gueltig('a/b') === false, 'geht durch');
t('zu lang', P.gueltig('x'.repeat(31)) === false, 'geht durch');
t('normaler Name geht', P.gueltig('PizzeriaPronto') === true, 'abgelehnt');
t('Bindestrich und Unterstrich gehen -- echte Namen nicht ablehnen',
  P.gueltig('Pizzeria-Pronto') === true && P.gueltig('Pizzeria_Pronto') === true, 'abgelehnt');

// ---- 2b. Die PayPal-ADRESSE -- was die meisten Wirte haben -----------
console.log('\n-- Die PayPal-Adresse (Geschaeftskonto) --');
t('eine Adresse wird als Adresse erkannt',
  P.lesen('payment@beispiel-betrieb.de').art === 'mail', P.lesen('payment@beispiel-betrieb.de').art);
t('auch mit mailto: davor',
  P.lesen('mailto:payment@beispiel-betrieb.de').mail === 'payment@beispiel-betrieb.de', 'nicht erkannt');
t('eine halbe Adresse nicht', P.lesen('payment@').art === 'ungueltig', P.lesen('payment@').art);
var ml = P.mailLink('payment@beispiel-betrieb.de', 24.5, 'KI-1');
t('der Zahlungs-Link traegt den Betrag', ml.indexOf('amount=24.50') > 0, ml);
t('und die Waehrung', ml.indexOf('currency_code=EUR') > 0, ml);
t('die Adresse ist kodiert -- ein @ gehoert nicht roh in eine URL',
  ml.indexOf('business=payment%40beispiel-betrieb.de') > 0, ml);
t('die Bestellnummer steht dabei', ml.indexOf('Bestellung%20KI-1') > 0, ml);
t('ohne Adresse kommt kein Link', P.mailLink('quatsch', 10) === '', 'baut trotzdem');

// ---- 2c. PayPals eigene Link-Formen ----------------------------------
console.log('\n-- Was PayPal selbst ausgibt --');
t('paypal.com/paypalme/NAME wird erkannt -- das kopiert der Wirt',
  P.lesen('https://www.paypal.com/paypalme/Pronto').name === 'Pronto',
  P.lesen('https://www.paypal.com/paypalme/Pronto').name);
t('auch ohne www', P.lesen('https://paypal.com/paypalme/Pronto').name === 'Pronto', 'nicht erkannt');
t('ein fremder Bezahllink bleibt ein Link, wird nicht zum Namen verbogen',
  P.lesen('https://sumup.me/pronto').art === 'link', P.lesen('https://sumup.me/pronto').art);
t('http:// wird abgelehnt -- der Browser bricht es ohnehin ab',
  P.lesen('http://beispiel.de/zahlen').art === 'ungueltig', P.lesen('http://beispiel.de/zahlen').art);
t('javascript: kommt nie beim Gast an',
  P.lesen('javascript:alert(1)').art === 'ungueltig', P.lesen('javascript:alert(1)').art);

// ---- 2d. Welcher Weg gewinnt -----------------------------------------
console.log('\n-- Der Weg zum Gast --');
t('Name schlaegt alles -- Betrag ist drin',
  P.gastLink('Pronto', 'https://x.de/y', 24.5, 'a@b.de', 'N1').betragDrin === true, 'falsch gewaehlt');
t('ohne Namen zaehlt die Adresse -- Betrag auch drin',
  P.gastLink('', '', 24.5, 'a@b.de', 'N1').betragDrin === true, 'kein Link');
t('nur der eigene Link: Betrag NICHT drin, und das wird gesagt',
  P.gastLink('', 'https://x.de/y', 24.5, '', '').betragDrin === false, 'behauptet Betrag');
t('gar nichts hinterlegt -> gar kein Link',
  P.gastLink('', '', 24.5, '', '').url === '', 'baut etwas zusammen');

// ---- 3. Der fertige Link ----------------------------------------------
console.log('\n-- Der Link --');
t('vollstaendig und mit Waehrung',
  P.link('PizzeriaPronto', 24.5) === 'https://paypal.me/PizzeriaPronto/24.50EUR', P.link('PizzeriaPronto', 24.5));
t('Punkt statt Komma -- PayPal erwartet den Punkt',
  P.link('X', 9.9).indexOf('9.90') > 0, P.link('X', 9.9));
t('ohne gueltigen Namen kommt KEIN Link, nicht etwa ein halber',
  P.link('Pizzeria Pronto', 10) === '' && P.link('', 10) === '', 'baut kaputten Link');
t('Unsinn im Betrag wird nicht zu NaN im Link',
  P.link('X', 'abc') === 'https://paypal.me/X/0.00EUR', P.link('X', 'abc'));
t('negativer Betrag wird nicht durchgereicht',
  P.link('X', -5) === 'https://paypal.me/X/0.00EUR', P.link('X', -5));

// ---- 4. Speichern ------------------------------------------------------
console.log('\n-- Speichern im Dashboard --');
var sp = schneide(h, 'savePaypalMe');
t('savePaypalMe wurde gefunden', sp.length > 400, sp.length + ' Zeichen');
t('die Eingabe wird gelesen und einsortiert', /PAYPAL\.lesen\(roh\)/.test(sp), 'roh gespeichert');
t('Unsinn wird NICHT gespeichert', /gelesen\.art === 'ungueltig'/.test(sp) && /return;/.test(sp), 'speichert Muell');
t('es gilt immer genau EIN Eintrag -- die anderen fliegen raus',
  /paypal_me:'\) !== 0/.test(sp) && /paypal_mail:'\) !== 0/.test(sp) && /zahlungslink:'\) !== 0/.test(sp),
  'zwei Bezahlwege gleichzeitig');
t('ein 204 gilt nicht als Beweis', /'Prefer': 'return=representation'/.test(sp), '204 gilt als Erfolg');
t('und es wird geprueft, dass eine Zeile kam',
  /!Array\.isArray\(_ppZeilen\) \|\| _ppZeilen\.length === 0/.test(sp), 'glaubt dem Status');
t('sonst sagt es, dass NICHT gespeichert wurde', /NICHT gespeichert/.test(sp), 'still');
t('Entfernen wird als Entfernen gemeldet, nicht als Speichern',
  /'PayPal-Angabe entfernt'/.test(sp), 'sagt gespeichert');

// ---- 5. Die Vorschau ---------------------------------------------------
console.log('\n-- Vorschau unter dem Feld --');
t('es gibt einen Platz dafuer', /id="paypalMeVorschau"/.test(h), 'kein Platz');
var vs = schneide(h, 'paypalVorschau');
t('paypalVorschau wurde gefunden', vs.length > 200, vs.length + ' Zeichen');
t('sie zeigt den fertigen Link', /PAYPAL\.link\(gelesen\.name, 24\.5\)/.test(vs), 'zeigt nichts');
t('bei einer Adresse sagt sie, dass Gebuehren anfallen',
  /Käuferschutz für den Gast, PayPal-Gebühren für dich/.test(vs), 'verschweigt die Gebuehr');
t('bei einem fremden Link warnt sie, dass der Betrag fehlt',
  /Betrag kann NICHT vorausgefüllt werden/.test(vs), 'verschweigt es');
t('bei Unsinn wird es rot und sagt NICHT gespeichert',
  /#b91c1c/.test(vs) && /NICHT gespeichert/.test(vs), 'stille Ablehnung');
t('sie wird beim Laden mitgezogen', /paypalVorschau\(PAYPAL\.lesen\(input\.value\), input\.value\)/.test(h), 'erst beim Tippen');
t('als Text gesetzt, nicht als HTML',
  /kasten\.textContent =/.test(vs) && !/kasten\.innerHTML/.test(vs), 'XSS-Weg offen');

// ---- 6. Was der Gast zu sehen bekommt ---------------------------------
console.log('\n-- Beim Gast --');
t('PayPal wird nur angeboten, wenn ein Bezahlweg hinterlegt ist',
  /&& paypalMoeglich\(currentOrderRestaurant\);/.test(h), 'haengt weiter allein am Schalter');
t('es gibt genau EINE Stelle, die das beantwortet',
  /function paypalMoeglich\(restaurant\)/.test(h), 'Anzeige und Knopf koennen auseinanderlaufen');
t('das Banner baut den Link ueber PAYPAL.gastLink',
  /PAYPAL\.gastLink\(_ppName, _ppEigen, total, _ppMail, _ppNr\)/.test(h), 'baut ihn selbst zusammen');
t('die Bestellnummer kommt aus der echten Variablen',
  /typeof orderNumber !== 'undefined'/.test(h) && !/lastOrderNumber/.test(h), 'undefinierte Variable');
t('steht der Betrag nicht im Link, wird es dem Gast gesagt',
  /dieser Link kann den Betrag nicht mitbringen/.test(h), 'Gast ueberweist irgendwas');
t('fehlt der Weg doch, bleibt der Gast nicht ohne Wort',
  /der PayPal-Link des Betriebs ist nicht hinterlegt/.test(h), 'stiller Ausfall');
t('und es wird protokolliert', /'paypal_ohne_link'/.test(h), 'niemand erfaehrt es');

// ---- 7. Der Link ueberlebt die Bestellung -----------------------------
console.log('\n-- In der Bestaetigungs-Mail --');
t('die Mail laedt die features des Restaurants',
  /select=name,google_maps_url,features/.test(mail), 'kennt den Namen nicht');
t('sie baut einen PayPal-Bezahlknopf', /https:\/\/paypal\.me\/' \+ ppName \+ '\/' \+ ppBetrag \+ 'EUR'/.test(mail), 'kein Knopf');
t('sie kann auch die PayPal-Adresse', /cmd=_xclick/.test(mail) && /business=' \+ encodeURIComponent\(ppMail\)/.test(mail), 'nur paypal.me');
t('und einen eigenen Link -- aber nur https',
  /\^https:\\\/\\\/\/i\.test\(ppEigen\)/.test(mail), 'javascript: koennte durchgehen');
t('der Link wird escaped, bevor er in die Mail geht', /esc\(ppUrl\)/.test(mail), 'roh eingesetzt');
t('mit derselben Pruefung wie im Browser',
  /\^\[A-Za-z0-9_-\]\{1,30\}\$/.test(mail), 'andere Regel -- laeuft auseinander');
t('fehlt der Name, steht das drin statt gar nichts',
  /noch kein PayPal-Link hinterlegt/.test(mail), 'still');
t('der Block steht wirklich in der Mail',
  /paypalBlock \+/.test(mail), 'gebaut, aber nie eingesetzt');
t('nur bei PayPal-Bestellungen',
  /String\(o\.payment_method \|\| ''\)\.toLowerCase\(\) === 'paypal'/.test(mail), 'bei jeder Bestellung');

// ---- 8. Der Bon --------------------------------------------------------
console.log('\n-- Auf dem Bon --');
t('PAYPAL ist nicht mehr so beruhigend wie BAR',
  /PAYPAL - ZAHLUNG PRUEFEN/.test(bon), 'sieht aus wie bezahlt');
t('BAR bleibt BAR', /'cash' \? 'BAR'/.test(bon), 'Barzahlung veraendert');

// ---- 9. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 29', !!m && Number(m[1]) >= 29, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
