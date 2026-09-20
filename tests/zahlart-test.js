// "WARUM STEHT CARD_ON_DELIVERY"
//
// Ibo am 14.09.2026, mit einem Foto vom WinOrder-Bon eines Kunden:
// auf der Rechnung stand "Zahlungsart: card_on_delivery".
//
// WAS WIRKLICH DA WAR
// -------------------
// Die Gastseite erzeugt GENAU DREI Werte: cash, card_on_delivery,
// paypal. Uebersetzt wurden sie an VIER Stellen, jede mit eigener
// Liste -- und drei davon kannten card_on_delivery nicht:
//
//   index.html (Bildschirm)  kannte ihn       -> "Kartenzahlung"
//   winorder.js              kannte ihn NICHT -> "card_on_delivery"
//   order-email.js           kannte ihn NICHT -> "Zahlung: card_on_delivery"
//   pos-print.js (Bon)       kannte ihn NICHT -> "CARD_ON_DELIVERY"
//
// Alle drei hatten denselben Rueckfall: "nimm halt den Rohwert". Der
// sieht hilfreich aus und ist das Gegenteil -- er druckt einen
// technischen Code auf die Rechnung eines Gastes, ohne dass irgendwo
// ein Fehler entsteht. Genau die Sorte stiller Ausfall aus Regel 6.
//
// Nebenbei gefunden: die Bestellkarte im Dashboard zeigte fuer JEDE
// Nicht-Bar-Zahlung "Karte" -- auch fuer PayPal.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var Z = require(path.join(KMI, 'netlify', 'functions', 'lib', 'zahlart.js'));
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// ---- 1. Der gemeldete Fall -------------------------------------------
console.log('\n-- Der Fall vom Foto --');
t('card_on_delivery wird zu "Kartenzahlung"', Z.text('card_on_delivery') === 'Kartenzahlung', Z.text('card_on_delivery'));
t('cash wird zu "Barzahlung"', Z.text('cash') === 'Barzahlung', Z.text('cash'));
t('paypal bleibt "PayPal"', Z.text('paypal') === 'PayPal', Z.text('paypal'));

console.log('\n-- Alle drei Werte der Gastseite sind abgedeckt --');
// Welche Werte kann die Gastseite ueberhaupt erzeugen? Aus dem Quelltext
// holen, nicht aus dem Gedaechtnis -- sonst prueft der Test eine Liste,
// die mit der Wirklichkeit nichts zu tun hat.
var ausApp = (h.match(/data-payment="([a-z_]+)"/g) || [])
    .map(function (x) { return x.replace(/data-payment="|"/g, ''); });
t('die Knoepfe im Checkout wurden gefunden', ausApp.length >= 3, ausApp.join(', '));
var unbekannt = ausApp.filter(function (v) { return !Z.bekannt(v); });
t('JEDER Wert, den ein Gast waehlen kann, ist der Bibliothek bekannt',
  unbekannt.length === 0, 'nicht bekannt: ' + unbekannt.join(', '));

console.log('\n-- Unbekanntes wird nicht roh durchgereicht --');
t('ein neuer Code erscheint nicht als Zahlart',
  Z.text('klarna_neu').indexOf('Sonstige Zahlung') === 0, Z.text('klarna_neu'));
t('leer gilt als Barzahlung, nicht als leeres Feld', Z.text('') === 'Barzahlung', Z.text(''));
t('Grossschreibung und Leerzeichen stoeren nicht', Z.text('  CASH ') === 'Barzahlung', Z.text('  CASH '));
t('null stuerzt nicht ab', Z.text(null) === 'Barzahlung', Z.text(null));

console.log('\n-- Muss jemand Geld nehmen? --');
t('bar: ja', Z.kassieren('cash') === true);
t('Karte bei Lieferung: ja -- der Fahrer braucht das Geraet', Z.kassieren('card_on_delivery') === true);
t('das Kartengeraet wird auch als solches erkannt', Z.karte('card_on_delivery') === true && Z.karte('cash') === false);
t('PayPal: nein', Z.kassieren('paypal') === false);
t('schon bezahlt schlaegt alles -- sonst kassiert jemand zweimal',
  Z.kassieren('cash', true) === false, 'kassiert trotz bezahlt');

// ---- 2. Browser und Server rechnen gleich ------------------------------
console.log('\n-- Bildschirm und Bon sagen dasselbe --');
var vonW = h.indexOf('function zahlartWort(roh)'), bisW = h.indexOf('window.zahlartWort');
t('zahlartWort steht in index.html', vonW > 0 && bisW > vonW, vonW + '/' + bisW);
var vonT = h.indexOf('var ZAHLART_TEXTE = {'), bisT = h.indexOf('function zahlartWort');
var zahlartWort = new Function(h.slice(vonT, bisT) + h.slice(vonW, bisW) + '; return zahlartWort;')();

var faelle = ['cash', 'bar', 'card_on_delivery', 'card', 'ec', 'paypal', 'online', 'stripe', '', 'klarna_neu', '  CASH '];
var ungleich = faelle.filter(function (v) { return zahlartWort(v) !== Z.text(v); });
t('alle ' + faelle.length + ' Faelle ergeben denselben Text wie auf dem Server',
  ungleich.length === 0, JSON.stringify(ungleich.map(function (v) { return v + ': ' + zahlartWort(v) + ' / ' + Z.text(v); })));

// ---- 3. Die vier Ausgaben benutzen die Bibliothek ----------------------
console.log('\n-- Keine eigene Liste mehr --');
// pos-print schreibt keinen Fliesstext, sondern eine Anweisung ("BAR
// KASSIEREN"). Es benutzt darum kassieren()/karte() statt text() -- die
// Zusicherung lautet fuer alle gleich: KEINE eigene Liste, KEIN
// Rueckfall auf den Rohwert.
[['winorder.js', 'die Kasse (das Foto)', 'text'],
 ['order-email.js', 'die Mail an den Gast', 'text'],
 ['pos-print.js', 'unser Bon', 'kassieren'],
 ['pos-orders.js', 'die Kassen-Schnittstelle', 'text']].forEach(function (f) {
    var q = fs.readFileSync(path.join(KMI, 'netlify', 'functions', f[0]), 'utf8');
    t(f[1] + ' benutzt lib/zahlart', /require\('\.\/lib\/zahlart'\)/.test(q), 'eigene Liste');
    // Der erste Anlauf prueft nur auf "|| String(o.payment_method)". Die
    // Gegenprobe mit "|| esc(o.payment_method)" blieb dadurch gruen --
    // derselbe Fehler, andere Schreibweise. Also wird jetzt gefordert,
    // dass die Bibliothek WIRKLICH aufgerufen wird.
    t(f[1] + ' ruft ZAHLART.' + f[2] + ' auch auf',
      new RegExp('ZAHLART\\.' + f[2] + '\\(').test(q), 'nur eingebunden, nicht benutzt');
    t(f[1] + ' hat KEINEN Rueckfall auf den Rohwert',
      !/\|\|\s*(String|esc)\(o\.payment_method[^)]*\)/.test(q), 'Rohwert kann durchrutschen');
});
// Der Rohwert bleibt fuer Maschinen erhalten -- fremde Kassen lesen ihn.
var po = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'pos-orders.js'), 'utf8');
t('die Kassen-Schnittstelle liefert den Rohwert weiter -- Maschinen lesen ihn',
  /payment_method: o\.payment_method \|\| ''/.test(po), 'Feld verschwunden');
t('und den lesbaren Text DANEBEN', /payment_text: ZAHLART\.text/.test(po), 'kein Text dabei');

// ---- 4. Das Dashboard: PayPal stand als "Karte" da ---------------------
console.log('\n-- Die Bestellkarte im Dashboard --');
var vonK = h.indexOf('function zahlartKurz(roh)'), bisK = h.indexOf('window.zahlartKurz');
var kurz = new Function(h.slice(vonK, bisK) + '; return zahlartKurz;')();
t('bar -> Bar', kurz('cash') === 'Bar');
t('Karte -> Karte', kurz('card_on_delivery') === 'Karte');
t('PayPal -> PayPal, NICHT "Karte"', kurz('paypal') === 'PayPal', kurz('paypal'));
t('Unbekanntes -> Sonstige', kurz('klarna_neu') === 'Sonstige', kurz('klarna_neu'));
// Seit dem 20.09.2026 geht die Karte ueber zahlartStand() -- das beantwortet
// zusaetzlich, ob das Geld schon da ist. Die Uebersetzung selbst macht
// weiter zahlartKurz(); geprueft wird die Eigenschaft, nicht der Wortlaut:
// nirgends ein zweiter, eigener Dreisatz.
t('in der Bestellkarte wird die Funktion auch benutzt',
  /var art = zahlartKurz\(order && order\.payment_method\);/.test(h)
  && /zahlartStand\(order\)/.test(h), 'wieder ein eigener Dreisatz');
t('und die Karte uebersetzt nicht selbst',
  !/order\.payment_method === 'paypal' \? 'PayPal'/.test(h), 'eigene Uebersetzung in der Karte');

// ---- 5. Der Bon sagt, was zu tun ist -----------------------------------
console.log('\n-- Der Bon --');
var V = require(path.join(__dirname, 'bon-vorschau.js'));
var bau = V.ladeBonBauer();
function text(o) { return V.alsPapier(bau(o, 'Pronto')).map(function (z) { return z.text; }).join('\n'); }
var basis = { order_number: 'B-1', order_type: 'pickup', total: 13, items: [{ quantity: 1, name: 'Pizza Döner' }] };

t('Karte: "KARTE KASSIEREN" statt CARD_ON_DELIVERY',
  /KARTE KASSIEREN/.test(text(Object.assign({}, basis, { payment_method: 'card_on_delivery' })))
  && !/CARD_ON_DELIVERY/.test(text(Object.assign({}, basis, { payment_method: 'card_on_delivery' }))), 'Rohcode auf dem Bon');
t('und der Hinweis aufs Kartengeraet',
  /Kartengeraet mitnehmen/.test(text(Object.assign({}, basis, { payment_method: 'card_on_delivery' }))), 'fehlt');
t('bar bleibt "BAR KASSIEREN"',
  /BAR KASSIEREN/.test(text(Object.assign({}, basis, { payment_method: 'cash' }))), 'fehlt');
t('bar bekommt KEINEN Kartengeraet-Hinweis',
  !/Kartengeraet/.test(text(Object.assign({}, basis, { payment_method: 'cash' }))), 'falscher Hinweis');
t('bezahltes PayPal: nichts kassieren',
  /nichts kassieren/.test(text(Object.assign({}, basis, { payment_method: 'paypal', payment_status: 'paid' }))), 'fehlt');
// Der erste Anlauf hier war zu grob: er verlangte, dass der Rohcode
// NIRGENDS auf dem Bon steht. Dann wuesste aber niemand mehr, was
// hinterlegt war. Die Zusicherung lautet genauer: gross steht, was zu
// TUN ist -- der Code hoechstens klein darunter.
var unbek = Object.assign({}, basis, { payment_method: 'klarna_neu' });
var grossZeilen = V.alsPapier(bau(unbek, 'Pronto')).filter(function (z) { return z.w > 1 || z.h > 1; });
t('ein unbekannter Code steht NICHT gross als Zahlart auf dem Bon',
  !grossZeilen.some(function (z) { return /klarna_neu/i.test(z.text); }),
  grossZeilen.map(function (z) { return z.text; }).join(' | '));
t('stattdessen steht gross da, was zu tun ist',
  grossZeilen.some(function (z) { return /ZAHLUNG PRUEFEN/.test(z.text); }), 'keine Anweisung');
t('und der Code klein darunter, damit man nachfragen kann',
  /hinterlegt: klarna_neu/.test(text(unbek)), 'Angabe ganz verloren');

// ---- 6. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var cm = sw.match(/kmi-shell-v(\d+)/);
t('sie ist mindestens 37', !!cm && Number(cm[1]) >= 37, cm ? cm[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
