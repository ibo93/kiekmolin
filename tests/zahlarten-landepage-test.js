// WAS DER BETRIEB ANNIMMT -- UNTEN AUF DER LANDEPAGE.
//
// Ibo am 13.09.2026: "auf der Landepage muss zeigen, dass der Restaurant
// auch PayPal und Kartenzahlung und Bar anbietet ... am besten unten in
// der Landepage."
//
// DAS IST EINE ZUSAGE AN DEN GAST, UND EINE FALSCHE KOSTET IHN DEN ABEND.
// Wer "Kartenzahlung" liest und ohne Bargeld losfaehrt, steht blöd da.
// Darum gibt es GENAU EINE Stelle, die entscheidet, was gilt -- und die
// Bestellseite benutzt dieselbe. Zwei Listen, die auseinanderlaufen,
// waeren schlimmer als gar keine Anzeige.
//
// Der Sonderfall, der leicht untergeht: hat der Wirt NICHTS eingestellt,
// gelten Bar und Karte. So macht es die Bestellseite seit jeher.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// ---- Die Funktion wirklich ausfuehren --------------------------------
var a = h.indexOf('function zahlarten(restaurant) {');
var e = h.indexOf('window.zahlarten = zahlarten;');
t('zahlarten wurde gefunden', a > 0 && e > a, a + '/' + e);
// paypalMoeglich wird hineingereicht, damit die Regel echt geprueft wird.
function bauZahlarten(paypalGeht) {
    return new Function('paypalMoeglich', h.slice(a, e) + '; return zahlarten;')(function () { return paypalGeht; });
}
var Z = bauZahlarten(true);
var Zohne = bauZahlarten(false);

console.log('\n-- Was gilt --');
t('nichts eingestellt -> Bar und Karte, wie auf der Bestellseite',
  JSON.stringify(Z({ features: [] })) === JSON.stringify({ bar: true, karte: true, paypal: false }),
  JSON.stringify(Z({ features: [] })));
t('ohne features-Feld genauso',
  JSON.stringify(Z({})) === JSON.stringify({ bar: true, karte: true, paypal: false }), JSON.stringify(Z({})));
t('nur Bar -> nur Bar. Karte wird NICHT dazuerfunden',
  JSON.stringify(Z({ features: ['payment_cash'] })) === JSON.stringify({ bar: true, karte: false, paypal: false }),
  JSON.stringify(Z({ features: ['payment_cash'] })));
t('nur Karte -> nur Karte',
  JSON.stringify(Z({ features: ['payment_card'] })) === JSON.stringify({ bar: false, karte: true, paypal: false }),
  JSON.stringify(Z({ features: ['payment_card'] })));
t('alle drei',
  JSON.stringify(Z({ features: ['payment_cash', 'payment_card', 'payment_paypal'] }))
    === JSON.stringify({ bar: true, karte: true, paypal: true }), 'falsch');

console.log('\n-- PayPal nur mit echtem Bezahlweg --');
t('Schalter an, aber nichts hinterlegt -> KEIN PayPal auf der Seite',
  Zohne({ features: ['payment_paypal'] }).paypal === false, 'verspricht PayPal');
t('und dann greift der Standard NICHT nachtraeglich',
  JSON.stringify(Zohne({ features: ['payment_paypal'] })) === JSON.stringify({ bar: false, karte: false, paypal: false }),
  JSON.stringify(Zohne({ features: ['payment_paypal'] })));
t('Schalter an und Weg hinterlegt -> PayPal',
  Z({ features: ['payment_paypal'] }).paypal === true, 'fehlt');

console.log('\n-- Eine Stelle, zwei Leser --');
t('die Bestellseite benutzt dieselbe Funktion',
  /var _za = zahlarten\(currentOrderRestaurant\);/.test(h), 'eigene Liste -- laeuft auseinander');
t('und baut ihre Liste nicht mehr selbst',
  !/var hasCash = features\.indexOf\('payment_cash'\)/.test(h), 'zweite Liste steht noch da');
t('die Landepage auch', /var z = zahlarten\(rest\);/.test(h), 'eigene Liste');

console.log('\n-- Wo es steht --');
t('der Kasten steht vor dem Powered-by-Fuss, also ganz unten',
  h.indexOf('Zahlung möglich mit') > 0
  && h.indexOf('Zahlung möglich mit') < h.indexOf('<!-- Powered by Footer -->'), 'steht woanders');
t('und nach den Bewertungen -- nicht mitten in die Stimmung',
  h.indexOf('Auf Google ansehen') < h.indexOf('Zahlung möglich mit'), 'zu weit oben');
t('ohne Zahlart kommt gar kein Kasten',
  /if \(!teile\.length\) return '';/.test(h), 'leerer Kasten');
t('die Symbole gibt es in der Schrift',
  /'payments', 'Bar'/.test(h) && /'credit_card', 'Kreditkarte'/.test(h)
  && /'account_balance_wallet', 'PayPal'/.test(h), 'anderes Symbol');
t('die Beschriftung heisst wie in der Bestellung -- Kreditkarte, nicht "Karte"',
  /'credit_card', 'Kreditkarte'/.test(h), 'zwei Woerter fuer dieselbe Sache');
t('es traegt die Farbe des Betriebs', /color:var\(--marke,#003d33\);">'\s*\n?\s*\+ t\[0\]/.test(h), 'feste Farbe');

// ---- Auslieferung ------------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 32', !!m && Number(m[1]) >= 32, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
