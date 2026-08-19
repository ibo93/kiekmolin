// EIN WARENKORB GEHOERT EINEM RESTAURANT.
//
// GEMELDET WURDE
// --------------
// "Der warenkorb speichert noch das Essen von anderen Restaurant, wenn ich
//  auf andere Restaurant gehe bleibt das Gericht drin" -- mit Bildschirmfoto:
// Kopfzeile "Greetsieler Börse", im Korb eine Pizza Margherita von Al Porto.
//
// DIE URSACHE
// -----------
// orderCart ist EINE Variable fuer die ganze Sitzung. openMenuModal() setzt
// beim Wechsel nur currentOrderRestaurant um und fasst den Korb nicht an. Es
// gibt keinen Seitenwechsel, der ihn zuruecksetzen wuerde -- die App ist eine
// einzige Seite. Der Korb ueberlebt also jeden Restaurantwechsel.
//
// WARUM DAS MEHR IST ALS EIN SCHOENHEITSFEHLER
// --------------------------------------------
// Beim Abschicken kommt restaurant_id aus currentOrderRestaurant, also aus
// dem NEUEN Restaurant. Die Pizza von Al Porto waere als Bestellung bei der
// Greetsieler Boerse aufgelaufen: ein Gericht, das es dort nicht gibt, zu
// einem Preis, den dort niemand kennt. Der Gast wartet, die Kueche versteht
// den Bon nicht. Deshalb pruefen die Tests unten nicht nur die Abfrage,
// sondern auch die Sicherung beim Abschicken.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// ---- 1. Wem gehoert der Korb? -----------------------------------------------
function bau(korb, aktuell) {
    return new Function('orderCart', 'currentOrderRestaurant',
        schneide('korbGehoertZu') + '\n' + schneide('korbFremdePositionen')
        + '; return { wem: korbGehoertZu, fremd: korbFremdePositionen };')(korb, aktuell || null);
}
var ALPORTO = { id: 'r-alporto', name: 'Al Porto' };
var BOERSE = { id: 'r-boerse', name: 'Greetsieler Börse' };

var F = bau([{ name: 'Pizza', restaurant_id: 'r-alporto', restaurant_name: 'Al Porto' }], BOERSE);
t('der Korb weiss, dass er zu Al Porto gehoert', F.wem().id === 'r-alporto', JSON.stringify(F.wem()));
t('und kennt auch den Namen dazu', F.wem().name === 'Al Porto', F.wem().name);
t('leerer Korb gehoert niemandem', bau([], BOERSE).wem() === null);

// Ein Korb aus einer Sitzung, die schon offen war, bevor die Kennzeichnung
// existierte -- der Fall aus dem Bildschirmfoto.
var alt = bau([{ name: 'Pizza' }], ALPORTO);
t('Positionen ohne Kennzeichnung gehoeren dem offenen Restaurant',
  alt.wem().id === 'r-alporto', JSON.stringify(alt.wem()));
t('ohne offenes Restaurant und ohne Kennzeichnung: keine Behauptung',
  bau([{ name: 'Pizza' }], null).wem() === null);

// ---- 2. Was ist fremd? -------------------------------------------------------
var gemischt = bau([
    { name: 'Pizza', restaurant_id: 'r-alporto', restaurant_name: 'Al Porto' },
    { name: 'Calamari', restaurant_id: 'r-boerse', restaurant_name: 'Greetsieler Börse' }
], BOERSE);
t('die Pizza von Al Porto faellt bei der Boerse auf',
  gemischt.fremd('r-boerse').length === 1 && gemischt.fremd('r-boerse')[0].name === 'Pizza',
  JSON.stringify(gemischt.fremd('r-boerse')));
t('bei Al Porto faellt umgekehrt die Calamari auf',
  gemischt.fremd('r-alporto').length === 1, JSON.stringify(gemischt.fremd('r-alporto')));
t('ein sauberer Korb hat nichts Fremdes',
  bau([{ name: 'Pizza', restaurant_id: 'r-boerse' }], BOERSE).fremd('r-boerse').length === 0);
t('ohne Restaurant wird niemand verdaechtigt',
  gemischt.fremd(null).length === 0 && gemischt.fremd(undefined).length === 0);
// Nicht gekennzeichnete Positionen duerfen den Gast nicht aussperren --
// sonst kaeme er mit einem alten Korb nirgends mehr zur Kasse.
t('nicht gekennzeichnete Positionen blockieren die Kasse nicht',
  bau([{ name: 'Pizza' }], BOERSE).fremd('r-boerse').length === 0);

// ---- 3. Jede Position wird gekennzeichnet -----------------------------------
// Fuenf Stellen legen etwas in den Korb. Vergisst eine davon die Kennzeichnung,
// faellt der Wechsel dort still durch.
var pushStellen = (H.match(/orderCart\.push\(/g) || []).length;
t('es gibt fuenf Stellen, die etwas in den Korb legen', pushStellen === 5, pushStellen);
t('so viele Stellen setzen auch restaurant_id',
  (H.match(/restaurant_id: currentOrderRestaurant \? currentOrderRestaurant\.id : null/g) || []).length
  + (H.match(/restaurant_id: rest \? rest\.id : null/g) || []).length === 5,
  (H.match(/restaurant_id: (currentOrderRestaurant \? currentOrderRestaurant|rest \? rest)\.id : null/g) || []).length);
// Die Wiederholung einer alten Bestellung setzt currentOrderRestaurant erst
// NACH der Schleife -- dort waere die Kennzeichnung sonst das alte Restaurant.
t('beim Wiederholen wird "rest" gelesen, nicht das noch alte currentOrderRestaurant',
  /restaurant_id: rest \? rest\.id : null/.test(H));

// ---- 4. Gefragt wird VOR dem Umschalten -------------------------------------
// Danach waere currentOrderRestaurant schon das neue -- und nicht mehr
// feststellbar, woher der Korb kommt.
var oeffnen = schneide('openMenuModal');
var iFrage = oeffnen.indexOf('frageKorbWechsel');
var iSetzen = oeffnen.indexOf('currentOrderRestaurant = restaurant;');
t('die Abfrage steht vor dem Umschalten', iFrage > 0 && iFrage < iSetzen, iFrage + ' / ' + iSetzen);
t('auf die Antwort wird gewartet', /await frageKorbWechsel\(/.test(oeffnen));
t('bei "Nein" wird das neue Restaurant gar nicht erst geoeffnet',
  /if \(!_weiter\) return;/.test(oeffnen));
t('bei "Ja" wird der Korb geleert', /if \(!_weiter\) return;[\s\S]{0,120}orderCart = \[\];/.test(oeffnen));
t('und das Trinkgeld gleich mit -- es gehoerte zum alten Restaurant',
  /orderCart = \[\];\s*\n\s*tipAmount = 1;/.test(oeffnen));
t('der Zaehler am Warenkorb-Symbol zieht mit',
  /tipAmount = 1;\s*\n\s*updateCartBadges\(\);/.test(oeffnen));
t('beim selben Restaurant wird NICHT gefragt',
  /_korbVon\.id !== restaurant\.id/.test(oeffnen));

// ---- 5. Die Abfrage selbst ---------------------------------------------------
function fenster() {
    var el = {}, gezeigt = {};
    ['korbWechselModal', 'korbWechselKlein', 'korbWechselTitel', 'korbWechselText',
     'korbWechselJa', 'korbWechselNein'].forEach(function (id) {
        el[id] = { style: {}, textContent: '' };
    });
    var G = new Function('document', 'orderCart', 'currentLanguage', 'window',
        'var _korbWechselFertig = null;\n'
        + schneide('_korbWechselAntwort') + '\n' + schneide('frageKorbWechsel')
        + '; return { frage: frageKorbWechsel, antwort: _korbWechselAntwort, el: function(){return el;} };');
    return { el: el, mach: G };
}
function frageAuf(korb, sprache) {
    var f = fenster();
    var api = f.mach({ getElementById: function (id) { return f.el[id] || null; } },
                     korb, sprache || 'de',
                     { confirm: function () { return true; } });
    var antwort = api.frage({ id: 'r-alporto', name: 'Al Porto' }, { id: 'r-boerse', name: 'Greetsieler Börse' });
    return { el: f.el, api: api, antwort: antwort };
}

var eins = frageAuf([{ name: 'Pizza', quantity: 1, restaurant_id: 'r-alporto', restaurant_name: 'Al Porto' }]);
t('das Fenster geht auf', eins.el.korbWechselModal.style.display === 'flex',
  eins.el.korbWechselModal.style.display);
t('es nennt das alte Restaurant beim Namen',
  /Al Porto/.test(eins.el.korbWechselText.textContent), eins.el.korbWechselText.textContent);
t('und das neue auch',
  /Greetsieler Börse/.test(eins.el.korbWechselText.textContent), eins.el.korbWechselText.textContent);
t('bei einem Gericht heisst es "1 Gericht", nicht "1 Gerichte"',
  /liegt noch 1 Gericht\b/.test(eins.el.korbWechselText.textContent), eins.el.korbWechselText.textContent);
t('der Zurueck-Knopf nennt das alte Restaurant',
  eins.el.korbWechselNein.textContent === 'Zurück zu Al Porto', eins.el.korbWechselNein.textContent);

var drei = frageAuf([{ name: 'Pizza', quantity: 2, restaurant_id: 'r-alporto' },
                     { name: 'Salat', quantity: 1, restaurant_id: 'r-alporto' }]);
t('Mengen werden addiert, nicht Positionen gezaehlt (2+1 = 3 Gerichte)',
  /liegen noch 3 Gerichte/.test(drei.el.korbWechselText.textContent), drei.el.korbWechselText.textContent);

// Die Antwort muss wirklich ankommen -- sonst haengt openMenuModal fuer immer.
var warte = frageAuf([{ name: 'Pizza', quantity: 1, restaurant_id: 'r-alporto' }]);
var ergebnis = null;
warte.antwort.then(function (v) { ergebnis = v; });
warte.api.antwort(true);
setTimeout(function () {
    t('"Ja" kommt als true zurueck', ergebnis === true, String(ergebnis));
    t('und das Fenster geht wieder zu', warte.el.korbWechselModal.style.display === 'none',
      warte.el.korbWechselModal.style.display);

    var w2 = frageAuf([{ name: 'Pizza', quantity: 1, restaurant_id: 'r-alporto' }]);
    var e2 = null;
    w2.antwort.then(function (v) { e2 = v; });
    w2.api.antwort(false);
    setTimeout(function () {
        t('"Nein" kommt als false zurueck', e2 === false, String(e2));

        // Wegklicken und Escape gelten als "bleiben" -- ein versehentlich
        // geleerter Korb laesst sich nicht wiederherstellen.
        t('Klick auf den Hintergrund heisst "bleiben"',
          /if\(event\.target===this\)_korbWechselAntwort\(false\)/.test(H));
        t('Escape heisst ebenfalls "bleiben"',
          /e\.key === 'Escape' && _korbWechselFertig\) _korbWechselAntwort\(false\)/.test(H));

        // Englisch und Niederlaendisch, weil die Karte dreisprachig ist.
        var en = frageAuf([{ name: 'Pizza', quantity: 1, restaurant_id: 'r-alporto' }], 'en');
        t('auf Englisch steht da Englisch',
          /Your cart still has/.test(en.el.korbWechselText.textContent), en.el.korbWechselText.textContent);
        var nl = frageAuf([{ name: 'Pizza', quantity: 1, restaurant_id: 'r-alporto' }], 'nl');
        t('auf Niederlaendisch Niederlaendisch',
          /winkelmand/.test(nl.el.korbWechselText.textContent), nl.el.korbWechselText.textContent);

        // ---- 6. Die Sicherung beim Abschicken --------------------------------
        var senden = schneide('submitOrder');
        t('vor allem anderen wird auf fremde Positionen geprueft',
          senden.indexOf('korbFremdePositionen') > 0
          && senden.indexOf('korbFremdePositionen') < senden.indexOf('SPAM-SCHUTZ'),
          senden.indexOf('korbFremdePositionen') + ' / ' + senden.indexOf('SPAM-SCHUTZ'));
        t('eine fremde Position stoppt die Bestellung',
          /if \(_fremd\.length\) \{[\s\S]{0,400}return;/.test(senden));
        t('und der Gast erfaehrt, woher sie kommt',
          /_fremd\[0\]\.restaurant_name \|\| 'einem anderen Restaurant'/.test(senden));
        t('der Warenkorb geht dabei auf, damit er sie loeschen kann',
          /openCartPanel\(\);\s*\n\s*return;/.test(senden));

        // ---- 7. Der Grund steht im Quelltext ---------------------------------
        t('warum der Korb einem Restaurant gehoert, steht in der Datei',
          /EIN WARENKORB GEHOERT EINEM RESTAURANT/.test(H));
        t('und was sonst in der fremden Kueche passiert waere',
          /ein Gericht, das es\s*\n?\/\/ dort nicht gibt/.test(H));

        console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
        process.exit(ok === n ? 0 : 1);
    }, 20);
}, 20);
