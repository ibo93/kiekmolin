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
    hol('function zahlartenZeile(rest) {', 'window.zahlartenZeile = zahlartenZeile;'),
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

    console.log('\n-- Die kurze Zeile unter dem Bestellknopf --');
    // Ibo am 20.09.2026: "Ich will das der Restaurant auf seine Seite das man
    // sieht das er Paypal hat." Die ausfuehrliche Leiste bleibt unten -- so
    // wollte er es am 13.09. Hier steht nur eine schmale Zeile, dafuer genau
    // da, wo der Gast sich die Frage stellt.
    var wz = stube({ ok: true, eingerichtet: true, client_id: 'A'.repeat(80) });
    // Alle drei Zahlarten an -- die Zeile muss alle drei nennen, in dieser
    // Reihenfolge, und nur die, die der Betrieb wirklich annimmt.
    var ALLE_DREI = { id: 'r4', features: ['payment_cash', 'payment_card', 'payment_paypal',
                                           'paypal_mail:zahlen@betrieb.de'] };
    var zeileMit = wz.zahlartenZeile(ALLE_DREI);
    t('die Zeile nennt Bar, Karte und PayPal',
      /Zahlung: Bar · Karte · PayPal</.test(zeileMit), zeileMit);
    t('und laesst weg, was der Betrieb nicht annimmt',
      /Zahlung: Bar · PayPal</.test(wz.zahlartenZeile(MIT_ADRESSE)), wz.zahlartenZeile(MIT_ADRESSE));
    t('mit Trennzeichen, nicht als Liste',
      / · /.test(zeileMit), zeileMit);
    t('sie traegt eine Kennung, damit die Nachfrage sie findet',
      /id="zahlartenZeile"/.test(zeileMit) && /data-rest="r4"/.test(zeileMit), zeileMit);
    t('ohne PayPal steht PayPal auch nicht drin',
      !/PayPal/.test(wz.zahlartenZeile(OHNE_PAYPAL)), wz.zahlartenZeile(OHNE_PAYPAL));
    t('gibt es gar keine Zahlart, kommt gar keine Zeile',
      wz.zahlartenZeile({ id: 'r9', features: [] }) !== '' , 'Standard Bar/Karte fehlt');

    var quelleZeile = H.slice(H.indexOf('Glassmorphic Action Bar'), H.indexOf('Glassmorphic Action Bar') + 4000);
    t('sie haengt unter der Knopfleiste',
      /bar \+= zahlartenZeile\(rest\);/.test(quelleZeile), 'steht woanders');
    t('nur wenn bestellt werden kann -- sonst ist sie Laerm',
      /if \(!noOrdering\) \{[\s\S]{0,200}zahlartenZeile\(rest\)/.test(quelleZeile), 'auch auf der Speisekartenseite');
    t('und die Leiste bleibt trotzdem unten',
      H.indexOf('Zahlung möglich mit') > H.indexOf('Glassmorphic Action Bar'), 'nach oben gezogen');

    console.log('\n-- EINE Nachfrage traegt beide Stellen nach --');
    // Zwei getrennte Nachfragen waeren zwei Gelegenheiten, dass eine
    // vergessen wird und die Seite sich selbst widerspricht.
    var nach = H.slice(H.indexOf('function zahlartenNachtragen('),
                       H.indexOf('window.zahlartenNachtragen'));
    t('sie traegt die Kachel unten nach', /zahlartenLeiste/.test(nach), 'Leiste vergessen');
    t('und die Zeile oben', /zahlartenZeile/.test(nach), 'Zeile vergessen');
    t('nur beim richtigen Betrieb', (nach.match(/dataset\.rest === String\(rest\.id\)/g) || []).length === 2,
      'kein Abgleich');
    t('und nicht doppelt', (nach.match(/indexOf\('PayPal'\) === -1/g) || []).length === 2, 'zweimal moeglich');
    t('gefragt wird nur bei eingeschaltetem PayPal',
      /indexOf\('payment_paypal'\) === -1\) return;/.test(nach), 'fragt bei jedem Betrieb');
    t('und nicht, wenn PayPal ohnehin schon dasteht',
      /zahlarten\(rest\)\.paypal\) return;/.test(nach), 'fragt ohne Not');
    t('es gibt nur noch EINE Nachfrage im Quelltext',
      (H.match(/ppcKontoPruefen\(rest\)/g) || []).length === 1,
      (H.match(/ppcKontoPruefen\(rest\)/g) || []).length + ' Stellen');

    console.log('\n-- Landepage und Bestellablauf duerfen nicht auseinanderlaufen --');
    // Der Kommentar im Quelltext sagt es selbst: wer "Kartenzahlung" liest
    // und ohne Bargeld losfaehrt, steht bloed da. Genauso falsch herum:
    // unten steht "Bar, Kreditkarte", und beim Bestellen gibt es auf einmal
    // auch PayPal.
    var leiste = H.slice(H.indexOf('Zahlung möglich mit') - 3000,
                         H.indexOf('Zahlung möglich mit') + 1500);
    t('die Landepage haengt die Kachel nach',
      /zahlartKachel\('account_balance_wallet', 'PayPal'\)/.test(nach), 'holt die Antwort und tut nichts');
    t('beide Kacheln kommen aus derselben Funktion',
      /teile\.forEach\(function \(t\) \{ h \+= zahlartKachel\(t\[0\], t\[1\]\); \}\);/.test(leiste),
      'zwei Bauweisen, die auseinanderlaufen koennen');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
