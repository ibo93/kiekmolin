// DER MINDESTBESTELLWERT IM BEZAHL-SCHRITT.
//
// Ibo am 04.09.2026: "beim bezahlen wenn die auf lieferung klicken es
// muss gezeigt werden und wenn die mindestbestellwert nicht erfuellen
// es soll schreiben mindestbestellwert noch nicht erreicht".
//
// NACHGESEHEN STATT ANGENOMMEN: zwei von drei Stellen gab es schon.
// Im Warenkorb steht ein Hinweis mit Fortschrittsbalken, und
// submitOrder() blockiert die Bestellung. Neu gebaut werden musste
// davon nichts.
//
// Die Luecke war der Schritt dazwischen -- und es ist der schlimmste:
// der Gast waehlt Lieferung, tippt seine Adresse ein, drueckt BEZAHLEN,
// und erst DANN kommt eine Meldung, die nach drei Sekunden weg ist.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var a = h.indexOf('function mindestPruefen(zwischensumme, restaurant, art) {');
var e = h.indexOf('window.mindestSatz = mindestSatz;');
t('die Rechnung wurde gefunden', a > 0 && e > a, a + '/' + e);
var f = new Function('window', h.slice(a, e) + '; return { mindestPruefen: mindestPruefen, mindestSatz: mindestSatz };')({});

// ---- 1. Wann greift er ueberhaupt -----------------------------------
console.log('\n-- Nur bei Lieferung --');
var haus = { min_order_value: 15 };
t('Abholung: greift nicht', f.mindestPruefen(5, haus, 'pickup').greift === false, 'greift');
t('Hier essen: greift nicht', f.mindestPruefen(5, haus, 'dine_in').greift === false, 'greift');
t('Lieferung: greift', f.mindestPruefen(5, haus, 'delivery').greift === true, 'greift nicht');
t('ohne Mindestwert greift nichts', f.mindestPruefen(5, { min_order_value: 0 }, 'delivery').greift === false, 'greift');
t('ohne Restaurant stuerzt nichts ab', f.mindestPruefen(5, null, 'delivery').greift === false, 'Absturz');

// ---- 2. Die Rechnung -------------------------------------------------
console.log('\n-- Was fehlt --');
var p1 = f.mindestPruefen(11.50, haus, 'delivery');
t('bei 11,50 von 15 fehlen 3,50', Math.abs(p1.fehlt - 3.5) < 0.001, p1.fehlt);
t('und es ist nicht erreicht', p1.erreicht === false, 'erreicht');
t('der Balken steht bei 77 %', p1.prozent === 77, p1.prozent);

var p2 = f.mindestPruefen(15, haus, 'delivery');
t('genau 15 ist erreicht', p2.erreicht === true, 'nicht erreicht');
t('und es fehlt nichts', p2.fehlt === 0, p2.fehlt);

// Cent-Rundung: 14,999999 kommt aus Summen mit Rabatten heraus. Wer den
// Gast daran scheitern laesst, hat einen Fehler, den niemand versteht.
var p3 = f.mindestPruefen(14.99999, haus, 'delivery');
t('14,99999 gilt als erreicht', p3.erreicht === true, p3.fehlt);

var p4 = f.mindestPruefen(20, haus, 'delivery');
t('darueber ist erreicht', p4.erreicht === true, 'nicht erreicht');
t('der Balken bleibt bei 100 %', p4.prozent === 100, p4.prozent);

// ---- 3. Der Satz, den der Gast liest ---------------------------------
console.log('\n-- Was da steht --');
var satz = f.mindestSatz(p1);
t('er sagt, dass es nicht erreicht ist', /noch nicht erreicht/.test(satz), satz);
t('er nennt, was fehlt', /3,50 €/.test(satz), satz);
t('und den Mindestwert selbst', /15,00 €/.test(satz), satz);
t('bei erreichtem Wert steht nichts da', f.mindestSatz(p2) === '', f.mindestSatz(p2));
t('bei Abholung auch nicht', f.mindestSatz(f.mindestPruefen(5, haus, 'pickup')) === '', 'sagt etwas');

// ---- 4. Der Knopf im Bezahl-Schritt ----------------------------------
console.log('\n-- Der Bezahlen-Knopf --');
var b = h.indexOf('function mindestImBezahlen() {');
var bE = h.indexOf('window.mindestImBezahlen = mindestImBezahlen;');
t('mindestImBezahlen wurde gefunden', b > 0 && bE > b, b + '/' + bE);

function bauen(summe, minWert, art) {
    var knopf = { id: 'submitOrderBtn', textContent: 'Jetzt bestellen', disabled: false,
                  style: {}, dataset: {}, parentNode: null };
    var kasten = null;
    var eltern = { firstChild: null, insertBefore: function (k) { kasten = k; } };
    knopf.parentNode = eltern;
    var ctx = {
        orderCart: [{ total_price: summe }],
        currentOrderRestaurant: { min_order_value: minWert },
        orderType: art,
        document: {
            getElementById: function (id) {
                if (id === 'submitOrderBtn') return knopf;
                if (id === 'checkoutMinHint') return kasten;
                return null;
            },
            createElement: function () { return { id: '', style: { cssText: '' }, textContent: '' }; }
        },
        Number: Number, Math: Math, console: console
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(h.slice(a, bE), ctx);
    ctx.mindestImBezahlen();
    return { knopf: knopf, kasten: kasten };
}

var zuWenig = bauen(11.50, 15, 'delivery');
t('der Knopf ist gesperrt', zuWenig.knopf.disabled === true, 'nicht gesperrt');
// Ein grauer Knopf ohne Begruendung ist selbst ein stiller Ausfall.
t('und sagt IM Knopf, was fehlt', /3,50 €/.test(zuWenig.knopf.textContent), zuWenig.knopf.textContent);
t('daneben steht der ganze Satz', /noch nicht erreicht/.test(zuWenig.kasten.textContent), zuWenig.kasten.textContent);

var genug = bauen(20, 15, 'delivery');
t('bei genug ist der Knopf frei', genug.knopf.disabled === false, 'gesperrt');
t('und heisst wieder wie vorher', genug.knopf.textContent === 'Jetzt bestellen', genug.knopf.textContent);

var abholung = bauen(5, 15, 'pickup');
t('bei Abholung ist er frei', abholung.knopf.disabled === false, 'gesperrt');

// ---- 5. Eine Wahrheit, nicht drei ------------------------------------
console.log('\n-- Ueberall dieselbe Rechnung --');
t('submitOrder benutzt dieselbe Funktion',
  /var _mp = mindestPruefen\(cartSubtotal, currentOrderRestaurant, orderType\)/.test(h), 'rechnet selbst');
// Ein gesperrter Knopf im Browser ist keine Sicherheit.
t('und blockiert trotzdem weiter', /if \(_mp\.greift && !_mp\.erreicht\) \{[\s\S]{0,200}return;/.test(h), 'blockiert nicht mehr');
// Nicht mit einem Suchfenster arbeiten: der Aufruf steht am ENDE von
// setOrderType, rund 3000 Zeichen hinter dem Funktionskopf. Mein erster
// Versuch mit {0,1200} war rot, obwohl der Code stimmte -- ein Test, der
// an einer Zahl haengt, prueft die Zahl und nicht die Sache.
var soA = h.indexOf('function setOrderType(type, btn) {');
var soE = h.indexOf('\n}\n', soA);
t('beim Umschalten auf Lieferung wird geprueft',
  soA > 0 && h.slice(soA, soE).indexOf('mindestImBezahlen()') !== -1, 'wird nicht geprueft');
t('und beim Oeffnen des Bezahl-Schritts',
  /function openCheckout\(\)[\s\S]{0,400}mindestImBezahlen\(\)/.test(h), 'wird nicht geprueft');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
