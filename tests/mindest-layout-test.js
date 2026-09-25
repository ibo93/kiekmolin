// "ES IST SO DRAUFGEKLATSCHT, IST UNSAUBER"
//
// Ibo am 20.09.2026, mit einem Bildschirmfoto der Kasse auf dem Handy:
// der orange Mindestbestellwert-Kasten steckte MITTEN in der Knopfzeile,
// neben Gesamtbetrag und Bestellknopf. Diese Zeile ist ein display:flex --
// also quetschten sich drei Dinge in eine Reihe, der gelbe Knopf brach um
// und lief rechts aus dem Bild.
//
// Der Grund stand in einer Zeile:
//     knopf.parentNode.insertBefore(kasten, knopf.parentNode.firstChild)
// Der Kasten wurde IN die Zeile gesetzt statt DARUEBER.
//
// Im echten Chromium gemessen, 390 Pixel:
//     vorher   Kasten und Knopf in derselben Zeile   -> true
//     nachher                                        -> false
//
// Dazu stand dieselbe Zahl zweimal da: im Kasten UND im Knopf.
//
// Geprueft wird durch AUSFUEHREN -- die echte Funktion aus index.html mit
// einem gestellten DOM. Ein Textvergleich sieht kein Layout.
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

// ---- Ein DOM, das nur kann, was diese Funktion braucht ----------------
function Element(id) {
    return {
        id: id || '', kinder: [], parentNode: null,
        style: { cssText: '' }, dataset: {},
        _text: '', _html: '',
        get textContent() { return this._text; },
        set textContent(v) { this._text = String(v); this._html = String(v); },
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = String(v); this._text = String(v).replace(/<[^>]*>/g, ''); },
        get firstChild() { return this.kinder[0] || null; },
        insertBefore: function (neu, vor) {
            var i = vor ? this.kinder.indexOf(vor) : this.kinder.length;
            if (i < 0) i = this.kinder.length;
            this.kinder.splice(i, 0, neu);
            neu.parentNode = this;
            return neu;
        }
    };
}

function buehne(mitGrosselternzeile) {
    var wurzel = Element('wurzel');
    var zeile = Element('zeile');            // display:flex -- Betrag + Knopf
    var betrag = Element('betrag');
    var knopf = Element('submitOrderBtn');
    // So steht es wirklich in index.html: ein span mit data-i18n im Knopf.
    knopf.innerHTML = '<span data-i18n="placeOrderNow">Bestellen und bezahlen</span>';
    zeile.insertBefore(betrag, null);
    zeile.insertBefore(knopf, null);
    if (mitGrosselternzeile) wurzel.insertBefore(zeile, null);

    var welt = {
        document: {
            getElementById: function (id) {
                if (id === 'submitOrderBtn') return knopf;
                if (id === 'checkoutMinHint') return welt._kasten || null;
                return null;
            },
            createElement: function () { var e = Element(); welt._kasten = e; return e; }
        },
        console: console, Number: Number, Math: Math, String: String, window: {}
    };
    welt.window = welt;
    vm.createContext(welt);
    vm.runInContext(H.slice(H.indexOf('function mindestPruefen('),
                            H.indexOf('window.mindestImBezahlen = mindestImBezahlen;')), welt);
    return { welt: welt, wurzel: wurzel, zeile: zeile, knopf: knopf, betrag: betrag };
}

function lauf(b, summe, min) {
    b.welt.orderCart = [{ total_price: summe }];
    b.welt.orderType = 'delivery';
    b.welt.currentOrderRestaurant = { min_order_value: min };
    return b.welt.mindestImBezahlen();
}

console.log('-- Wohin der Kasten gehoert --');
var b = buehne(true);
lauf(b, 11, 18);
var kasten = b.welt._kasten;
t('der Kasten entsteht', !!kasten, 'kein Kasten');
t('er haengt NICHT in der Knopfzeile -- das war der Fehler',
  b.zeile.kinder.indexOf(kasten) === -1, 'steckt wieder in der Zeile');
t('sondern darueber, als eigene Zeile',
  b.wurzel.kinder.indexOf(kasten) === 0 && b.wurzel.kinder.indexOf(b.zeile) === 1,
  b.wurzel.kinder.map(function (k) { return k.id || 'kasten'; }).join(' | '));
t('ueber die ganze Breite', /width:100%/.test(kasten.style.cssText), kasten.style.cssText);
t('und mit box-sizing -- sonst schiebt das Innenmass ihn ueber den Rand',
  /box-sizing:border-box/.test(kasten.style.cssText), kasten.style.cssText);

console.log('\n-- Die Zahl steht nur noch EINMAL ausgeschrieben --');
t('der Kasten erklaert es ganz',
  /Mindestbestellwert noch nicht erreicht/.test(kasten.textContent) && /18,00/.test(kasten.textContent),
  kasten.textContent);
t('der Knopf nennt nur den Betrag', b.knopf.textContent === 'Noch 7,00 €', b.knopf.textContent);
t('und wiederholt nicht den ganzen Satz',
  !/Mindestbestellwert/.test(b.knopf.textContent), b.knopf.textContent);
t('der Knopf ist gesperrt', b.knopf.disabled === true, b.knopf.disabled);

console.log('\n-- Der Knopf kommt heil zurueck --');
// Frueher wurde mit textContent gesichert und zurueckgeschrieben. Damit war
// das <span data-i18n> nach dem ersten Mal WEG -- die Sprachumstellung haette
// den Knopf nicht mehr gefunden, und niemand haette einen Fehler gesehen.
lauf(b, 20, 18);
t('bei erreichtem Mindestwert ist der Knopf wieder frei',
  b.knopf.disabled === false, b.knopf.disabled);
t('und das data-i18n im Knopf hat ueberlebt',
  /data-i18n="placeOrderNow"/.test(b.knopf.innerHTML), b.knopf.innerHTML);
t('der Kasten ist weg', kasten.style.display === 'none', kasten.style.display);
t('die Schriftgroesse ist zurueckgesetzt', b.knopf.style.fontSize === '', b.knopf.style.fontSize);

console.log('\n-- Ohne Lieferung greift gar nichts --');
var b2 = buehne(true);
b2.welt.orderCart = [{ total_price: 5 }];
b2.welt.orderType = 'pickup';
b2.welt.currentOrderRestaurant = { min_order_value: 18 };
var pr = b2.welt.mindestImBezahlen();
t('bei Abholung kein Mindestwert', pr.greift === false, JSON.stringify(pr));
t('und der Knopf bleibt frei', b2.knopf.disabled === false, b2.knopf.disabled);

console.log('\n-- Rueckfallebene, falls die Zeile ganz oben haengt --');
var b3 = buehne(false);          // zeile ohne parentNode
lauf(b3, 11, 18);
t('es stuerzt nicht ab und der Kasten ist trotzdem da',
  !!b3.welt._kasten && b3.welt._kasten.textContent.length > 10, 'kein Kasten');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
