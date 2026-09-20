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
var karte = hol('<!-- Stitch Footer: Order type + Contact + Actions -->', 'kin-order-actions');
t('die Karte fragt zahlartStand', /zahlartStand\(order\)/.test(karte), 'zeigt weiter nur das Wort');
t('und nicht mehr in 11-Pixel-Grau bei 50 Prozent',
  !/font-size:11px;color:rgba\(64,73,70,0\.5\);">\$\{zahlartKurz/.test(karte), 'alte Zeile steht noch da');
t('die Marke wird farbig hinterlegt', /st\.hintergrund/.test(karte), 'nur Text');

console.log('\n-- Der Bon sagt es auch --');
// Der Bon haengt in der Kueche, der Tresen greift danach.
var bonHtml = hol("var zahlStr = '';", 'var printContent');
t('HTML-Bon: BEZAHLT', /PAYPAL - BEZAHLT/.test(bonHtml), 'nur PAYPAL');
t('HTML-Bon: NOCH ZU ZAHLEN', /PAYPAL - NOCH ZU ZAHLEN/.test(bonHtml), 'nur PAYPAL');
var bonCmd = hol("var zahlStr = 'BAR';", "cmd += CENTER + '[' + zahlStr + ']' + LF;");
t('Drucker-Bon: BEZAHLT', /PAYPAL - BEZAHLT/.test(bonCmd), 'nur PAYPAL');
t('Drucker-Bon: NOCH ZU ZAHLEN', /PAYPAL - NOCH ZU ZAHLEN/.test(bonCmd), 'nur PAYPAL');
// Der Bondrucker kann 32 Zeichen pro Zeile. Laenger und es bricht um.
t('der laengste Text passt auf den Bon',
  ('[' + 'PAYPAL - NOCH ZU ZAHLEN' + ']').length <= 32, ('[PAYPAL - NOCH ZU ZAHLEN]').length);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
