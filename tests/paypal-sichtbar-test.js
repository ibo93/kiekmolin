// PayPal eingerichtet -- und der Gast sieht es nicht.
//
// Am 20.09.2026 hat Ibo fuer Pizzeria Pronto PayPal eingeschaltet und die
// zwei Schluessel hinterlegt. Gemessen: POST auf paypal_konten -> 201 um
// 12:14:02 UTC. Es war wirklich eingerichtet. Der Gast sah trotzdem keine
// PayPal-Zahlart.
//
// Grund: paypalMoeglich() kannte nur die DREI ALTEN Wege -- PayPal.me-Name,
// PayPal-Adresse, eigener Zahlungslink. Der neue Weg "Zahlung zuerst", der
// seit heute der beste ist, kam dort gar nicht vor.
//
// Das ist ein stiller Ausfall nach Regel 6: nichts war rot, nichts fehlte
// sichtbar -- die Zahlart war einfach nicht da.
//
// Geprueft wird durch AUSFUEHREN, mit einem gestellten Browser: die echten
// Funktionen aus index.html laufen wirklich.
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

// Die echten Funktionen aus der Datei holen -- keine Nachbauten.
function hol(von, bis) {
    var a = H.indexOf(von);
    var b = H.indexOf(bis, a);
    if (a === -1 || b === -1) throw new Error('Nicht gefunden: ' + von);
    return H.slice(a, b + bis.length);
}
const QUELLE = [
    hol('var _ppcKontoDa = {};', 'window.ppcKontoPruefen = ppcKontoPruefen;'),
    hol('function zahlarten(restaurant) {', 'window.zahlarten = zahlarten;')
].join('\n');

// Ein Betrieb mit PayPal AN, aber ohne einen der drei alten Wege.
const NUR_SCHLUESSEL = { id: 'r1', features: ['payment_cash', 'payment_paypal'] };
const MIT_ADRESSE    = { id: 'r2', features: ['payment_cash', 'payment_paypal', 'paypal_mail:zahlen@betrieb.de'] };
const OHNE_PAYPAL    = { id: 'r3', features: ['payment_cash'] };

function stube(kontoAntwort) {
    var gefragt = [];
    var welt = {
        PAYPAL: {
            gueltig: function (v) { return !!v; },
            mail: function (v) { return v || ''; }
        },
        PPC: {
            konto: async function (id) { gefragt.push(id); return kontoAntwort; }
        },
        getPaypalMe: function (r) {
            var f = (r.features || []).find(function (x) { return String(x).indexOf('paypal_me:') === 0; });
            return f ? f.slice(10) : '';
        },
        getPaypalMail: function (r) {
            var f = (r.features || []).find(function (x) { return String(x).indexOf('paypal_mail:') === 0; });
            return f ? f.slice(12) : '';
        },
        getZahlungslink: function (r) {
            var f = (r.features || []).find(function (x) { return String(x).indexOf('zahlungslink:') === 0; });
            return f ? f.slice(13) : '';
        },
        window: {}, console: console
    };
    welt.window = welt;
    vm.createContext(welt);
    vm.runInContext(QUELLE, welt);
    welt._gefragt = gefragt;
    return welt;
}

(async function () {
    console.log('-- Der Fall von Pizzeria Pronto --');
    var w = stube({ ok: true, eingerichtet: true, client_id: 'A'.repeat(80), live: true });

    t('vor dem Nachfragen sagt die Anzeige noch nein',
      w.zahlarten(NUR_SCHLUESSEL).paypal === false, 'sagt schon ja, ohne gefragt zu haben');

    var da = await w.ppcKontoPruefen(NUR_SCHLUESSEL);
    t('die Function wird genau einmal gefragt',
      w._gefragt.length === 1 && w._gefragt[0] === 'r1', w._gefragt.join(', '));
    t('und die Antwort lautet ja', da === true, da);
    t('DANACH sieht der Gast PayPal -- das war der Fehler',
      w.zahlarten(NUR_SCHLUESSEL).paypal === true, 'immer noch unsichtbar');

    await w.ppcKontoPruefen(NUR_SCHLUESSEL);
    t('ein zweites Mal wird nicht gefragt', w._gefragt.length === 1, w._gefragt.length);

    console.log('\n-- Was sich NICHT aendern darf --');
    var w2 = stube({ ok: true, eingerichtet: true, client_id: 'A'.repeat(80) });
    t('der alte Weg ueber die PayPal-Adresse gilt weiter, ohne Nachfrage',
      w2.zahlarten(MIT_ADRESSE).paypal === true && w2._gefragt.length === 0,
      'gefragt: ' + w2._gefragt.length);

    var w3 = stube({ ok: true, eingerichtet: false });
    await w3.ppcKontoPruefen(NUR_SCHLUESSEL);
    t('ist NICHTS eingerichtet, bleibt PayPal aus',
      w3.zahlarten(NUR_SCHLUESSEL).paypal === false, 'verspricht etwas, das es nicht gibt');

    var w4 = stube({ ok: true, eingerichtet: true, client_id: 'A'.repeat(80) });
    t('ist PayPal gar nicht eingeschaltet, bleibt es aus',
      w4.zahlarten(OHNE_PAYPAL).paypal === false, 'zeigt PayPal ohne Schalter');
    t('und es wird auch nicht nachgefragt', w4._gefragt.length === 0, w4._gefragt.length);

    console.log('\n-- Ein Netzfehler ist keine Antwort --');
    // "Nicht erreichbar" heisst NICHT "nicht eingerichtet". Wuerden wir das
    // merken, versteckte ein einziger Aussetzer die Zahlart fuer den ganzen
    // Besuch -- und niemand saehe je einen Fehler.
    var w5 = stube({ eingerichtet: false, fehler: 'Failed to fetch' });
    var erg = await w5.ppcKontoPruefen(NUR_SCHLUESSEL);
    t('ein Fehler liefert false', erg === false, erg);
    t('wird aber NICHT gemerkt -- beim naechsten Mal wird neu gefragt',
      w5._ppcKontoDa[NUR_SCHLUESSEL.id] === undefined, w5._ppcKontoDa[NUR_SCHLUESSEL.id]);
    await w5.ppcKontoPruefen(NUR_SCHLUESSEL);
    t('also wirklich ein zweites Mal gefragt', w5._gefragt.length === 2, w5._gefragt.length);

    console.log('\n-- Die Anzeige holt die Antwort auch wirklich ein --');
    var anzeige = hol('function updateCheckoutPaymentMethods() {', '\n}');
    t('updateCheckoutPaymentMethods fragt nach, wenn PayPal an ist aber nichts hinterlegt',
      /ppcKontoPruefen\(/.test(anzeige), 'fragt nie nach');
    t('und zeichnet danach neu -- sonst bliebe die Zahlart trotzdem weg',
      /updateCheckoutPaymentMethods\(\);/.test(anzeige.slice(anzeige.indexOf('ppcKontoPruefen('))),
      'holt die Antwort und tut nichts damit');
    t('gefragt wird nur bei eingeschaltetem PayPal',
      /features\.indexOf\('payment_paypal'\) !== -1/.test(anzeige), 'fragt bei jedem Betrieb');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
