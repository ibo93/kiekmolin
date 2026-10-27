// "PAYPAL" allein sagt dem Tresen nichts mehr.
//
// Seit dem 20.09.2026 gibt es zwei PayPal-Wege, und sie bedeuten das
// Gegenteil voneinander:
//
//   Zahlung zuerst (zwei Schluessel)  Geld IMMER da -- ohne Zahlung gaebe
//                                     es die Bestellung gar nicht
//   alter Bezahllink                  vielleicht -- bestellt ist bestellt
//
// Auf der Bestellkarte stand bei beiden dasselbe Wort, in 11 Pixel Grau
// bei 50 % Deckkraft. Auf dem Bon stand "[PAYPAL]". payment_status wurde
// geladen (select=*) und NIRGENDS angezeigt.
//
// Daraus werden zwei Arten, Geld zu verlieren: Essen rausgeben, das nie
// bezahlt wurde -- oder einen Gast ein zweites Mal zahlen lassen.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

function hol(von, bis) {
    var a = H.indexOf(von), b = H.indexOf(bis, a);
    if (a === -1 || b === -1) throw new Error('Nicht gefunden: ' + von);
    return H.slice(a, b + bis.length);
}

// Die echten Funktionen ausfuehren, nicht nachbauen.
const welt = { window: {}, console: console };
welt.window = welt;
vm.createContext(welt);
vm.runInContext(hol('function zahlartKurz(', 'window.zahlartStand = zahlartStand;'), welt);

console.log('-- Was der Tresen liest --');
var bezahlt = welt.zahlartStand({ payment_method: 'paypal', payment_status: 'paid' });
t('PayPal mit Zahlung: "bezahlt" steht da',
  /bezahlt/.test(bezahlt.text) && bezahlt.marke === true, bezahlt.text);
t('und es ist gruen', bezahlt.farbe === '#15803d', bezahlt.farbe);

var offen = welt.zahlartStand({ payment_method: 'paypal', payment_status: 'pending' });
t('PayPal ohne Zahlung: "offen" steht da',
  /offen/.test(offen.text) && offen.marke === true, offen.text);
t('und es ist NICHT gruen -- sonst gibt jemand Essen raus, das keiner bezahlt hat',
  offen.farbe !== bezahlt.farbe && /b45309/i.test(offen.farbe), offen.farbe);

// Der haeufigste Fall bei alten Bestellungen: die Spalte ist leer.
var leer = welt.zahlartStand({ payment_method: 'paypal' });
t('fehlt der Status ganz, gilt "offen" -- nicht "bezahlt"',
  /offen/.test(leer.text), leer.text);
t('auch bei null', /offen/.test(welt.zahlartStand({ payment_method: 'paypal', payment_status: null }).text),
  welt.zahlartStand({ payment_method: 'paypal', payment_status: null }).text);
t('und bei einem unbekannten Wert',
  /offen/.test(welt.zahlartStand({ payment_method: 'paypal', payment_status: 'irgendwas' }).text), 'als bezahlt gewertet');
t('PAID in Grossbuchstaben zaehlt trotzdem',
  /bezahlt/.test(welt.zahlartStand({ payment_method: 'paypal', payment_status: 'PAID' }).text), 'Schreibweise zaehlt');

console.log('\n-- Bar und Karte bleiben ruhig --');
// Eine Marke an JEDER Bestellung waere Laerm, und Laerm liest niemand mehr.
['cash', 'card', 'card_on_delivery', ''].forEach(function (m) {
    var st = welt.zahlartStand({ payment_method: m, payment_status: 'pending' });
    t('"' + (m || 'leer') + '" bekommt keine Marke', st.marke === false, JSON.stringify(st));
});
t('und heisst weiter wie bisher',
  welt.zahlartStand({ payment_method: 'cash' }).text === 'Bar', welt.zahlartStand({ payment_method: 'cash' }).text);

console.log('\n-- Die Bestellkarte benutzt es auch wirklich --');
// Seit dem neuen Design (27.10.2026) baut die Karte die Zahlart in
// renderDashboardOrders zwischen "KARTE WIE IM ENTWURF" und "var _html".
var karte = hol('// KARTE WIE IM ENTWURF', 'var _html = `');
t('die Karte fragt zahlartStand', /var _zahl = zahlartStand\(order\);/.test(karte), 'zeigt weiter nur das Wort');
// AUSGEFUEHRT, nicht gelesen: der Block, der die Zahlart fuer die Karte baut.
var zb = hol('var _zahl = zahlartStand(order);', "escapeHtml(_zahl.text || '');");
function kartenZahl(o) {
    welt.order = o; welt.escapeHtml = function (x) { return String(x); };
    vm.runInContext(zb + '; this._zh = _zahlHtml;', welt); return welt._zh;
}
var zOffen = kartenZahl({ payment_method: 'paypal', payment_status: 'pending' });
t('OFFEN wird farbig hinterlegt', /kin-zahl-marke/.test(zOffen) && /b45309/.test(zOffen) && /offen/.test(zOffen), zOffen);
var zBez = kartenZahl({ payment_method: 'paypal', payment_status: 'paid' });
t('bezahlt steht als Wort da ("bezahlt mit PayPal")', zBez === 'bezahlt mit PayPal', zBez);
t('Bar bleibt ruhig', kartenZahl({ payment_method: 'cash' }) === 'Bar', kartenZahl({ payment_method: 'cash' }));
t('und nicht mehr in 11-Pixel-Grau bei 50 Prozent',
  !/font-size:11px;color:rgba\(64,73,70,0\.5\)/.test(karte), 'alte Zeile steht noch da');
t('die Zahlart steht auf der Karte (Neu: neben der Summe, Fertig: in der Zeile)',
  /kin-summe-zeile"><span>' \+ _zahlHtml/.test(karte) && /' · ' \+ _zahlHtml \+ ' · '/.test(karte), 'fehlt');

console.log('\n-- Der Bon sagt es auch --');
// Der Bon haengt in der Kueche, der Tresen greift danach.
// Seit 12.10.2026 gibt es nur noch EINEN Bon (printOrderBrowser). Die
// Zahlungszeile wird hier AUSGEFUEHRT, mit der echten zahlartStand.
var zz = hol('var _zst = zahlartStand(order);', ": 'Zu zahlen: ' + zahlartText;");
function zeile(o) { welt.order = o; welt.zahlartText = welt.zahlartKurz(o.payment_method); vm.runInContext(zz + '; this._z = zahlZeile;', welt); return welt._z; }
t('Bon: PayPal bezahlt -> "PAYPAL - BEZAHLT"', zeile({ payment_method: 'paypal', payment_status: 'paid' }) === 'PAYPAL - BEZAHLT', zeile({ payment_method: 'paypal', payment_status: 'paid' }));
t('Bon: PayPal offen -> "PAYPAL - NOCH ZU ZAHLEN"', zeile({ payment_method: 'paypal', payment_status: 'pending' }) === 'PAYPAL - NOCH ZU ZAHLEN', zeile({ payment_method: 'paypal' }));
t('Bon: Bar steht NICHT als "bezahlt" da', zeile({ payment_method: 'cash' }) === 'Zu zahlen: Bar', zeile({ payment_method: 'cash' }));
var bonCmd = hol("var zahlStr = 'BAR';", "cmd += CENTER + '[' + zahlStr + ']' + LF;");
t('Drucker-Bon: BEZAHLT', /PAYPAL - BEZAHLT/.test(bonCmd), 'nur PAYPAL');
t('Drucker-Bon: NOCH ZU ZAHLEN', /PAYPAL - NOCH ZU ZAHLEN/.test(bonCmd), 'nur PAYPAL');
// Der Bondrucker kann 32 Zeichen pro Zeile. Laenger und es bricht um.
t('der laengste Text passt auf den Bon',
  ('[' + 'PAYPAL - NOCH ZU ZAHLEN' + ']').length <= 32, ('[PAYPAL - NOCH ZU ZAHLEN]').length);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
