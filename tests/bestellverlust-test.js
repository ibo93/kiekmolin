// NICHT GESPEICHERT HEISST NICHT BESTELLT.
//
// GEFUNDEN BEIM DURCHSEHEN
// ------------------------
// In submitOrder() wurde ein fehlgeschlagenes Speichern in _saveErr
// geschrieben, ein Toast ging kurz auf -- und danach lief die Funktion
// einfach weiter bis openModal('orderConfirmationModal'). Zwischen der
// Fehlerstelle und der Bestaetigung stand kein einziges return, und _saveErr
// wurde nie wieder gelesen.
//
// WAS DER GAST SAH
// ----------------
// Drei Sekunden einen Toast, danach eine Bestaetigungsseite mit
// Bestellnummer. Er ging davon aus, dass das Essen kommt. In der Kueche war
// nie etwas angekommen.
//
// WARUM DAS DER TEUERSTE FEHLER DER APP WAR
// ------------------------------------------
// Der Gast wird nicht auf die App sauer, sondern auf das Restaurant. Er
// sitzt vierzig Minuten, fragt nach, und der Wirt muss sagen "bei uns ist
// nichts angekommen". Das ist der Abend, nach dem ein Betrieb kuendigt.
//
// Die Tests unten pruefen deshalb nicht nur, dass eine Meldung erscheint,
// sondern vor allem, dass die Bestaetigung NICHT mehr erscheint und der
// Warenkorb stehen bleibt.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// ---- 1. Der Abbruch steht zwischen Fehler und Bestaetigung ------------------
var senden = schneide('submitOrder');
var iGuard = senden.indexOf('if (!_saveOk) {');
// Der ECHTE Aufruf, nicht die Erwaehnung im Kommentar darueber: gesucht wird
// die Anweisung am Zeilenanfang. (Beim ersten Anlauf fiel dieser Test auf den
// eigenen Kommentar herein und meldete den Guard faelschlich als zu spaet.)
var mBest = /\n\s*openModal\('orderConfirmationModal'\);/.exec(senden);
var iBestaetigung = mBest ? mBest.index : -1;
t('es gibt ueberhaupt einen Abbruch bei nicht gespeicherter Bestellung', iGuard > 0, iGuard);
t('er steht VOR der Bestaetigungsseite -- sonst waere er wirkungslos',
  iGuard > 0 && iBestaetigung > 0 && iGuard < iBestaetigung, iGuard + ' / ' + iBestaetigung);
t('und er kehrt wirklich zurueck, statt nur zu melden',
  /if \(!_saveOk\) \{[\s\S]{0,900}\n        return;\n    \}/.test(senden));

// Der Weg ueber den catch-Block muss genauso enden. Frueher setzte der catch
// nur einen Toast und lief weiter -- _saveErr blieb dort sogar leer.
t('auch ein geworfener Fehler landet in _saveErr (nicht nur im Toast)',
  /catch\(e\) \{[\s\S]{0,200}_saveErr = \{ status: 0/.test(senden));
t('_saveOk bleibt in beiden Fehlerwegen false',
  (senden.match(/_saveOk = true/g) || []).length === 1,
  (senden.match(/_saveOk = true/g) || []).length + 'x auf true gesetzt');

// ---- 2. Was der Gast behalten muss ------------------------------------------
// Der Warenkorb wird erst NACH dem Abbruch geleert -- sonst stuende der Gast
// nach einem Netzfehler vor einem leeren Korb und muesste alles neu klicken.
var iLeeren = senden.indexOf('orderCart = [];');
t('der Warenkorb wird erst nach dem Abbruch geleert',
  iLeeren > iGuard, 'Guard ' + iGuard + ', Leeren ' + iLeeren);
// Genauso das Rate-Limit: drei Fehlversuche duerfen den Gast nicht fuer zehn
// Minuten aussperren.
t('ein Fehlversuch zaehlt nicht aufs Bestell-Limit',
  senden.indexOf("orderTimes.push(Date.now())") > iGuard);
t('die Bestellung wird geparkt, bevor abgebrochen wird',
  /kmi_offene_bestellung[\s\S]{0,600}return;/.test(senden));
t('nach erfolgreicher Bestellung wird die Parkstelle geraeumt',
  /localStorage\.removeItem\('kmi_offene_bestellung'\)/.test(senden));

// ---- 3. Die Meldung selbst ---------------------------------------------------
function fenster(korb, versuche, online, tisch, restaurant) {
    var ids = ['bestellFehlerModal', 'bfText', 'bfKorbHinweis', 'bfGrund', 'bfNochmal', 'bfKlein', 'bfTitel'];
    var el = {};
    ids.forEach(function (id) { el[id] = { style: {}, textContent: '' }; });
    var getoastet = [], korbAuf = 0;
    var api = new Function('document', 'orderCart', 'navigator', 'window', 'showToast',
        'openCartPanel', 'currentOrderRestaurant', 'closeModal', 'submitOrder',
        'var _bfVersuche = ' + (versuche - 1) + ';\n'
        + schneide('zeigeBestellungFehlgeschlagen') + '\n'
        + schneide('_kmiIstAmTisch') + '\n'
        + schneide('bestellungNochmalVersuchen')
        + '; return { zeig: zeigeBestellungFehlgeschlagen, nochmal: bestellungNochmalVersuchen,'
        + ' amTisch: _kmiIstAmTisch, stand: function(){ return _bfVersuche; } };')(
        { getElementById: function (id) { return el[id] || null; } },
        korb,
        { onLine: online },
        { _kmiTischNr: tisch ? '7' : null },
        function (m, a) { getoastet.push([m, a]); },
        function () { korbAuf++; },
        restaurant || null,
        function () {},
        function () {});
    return { el: el, api: api, toasts: getoastet, korbAuf: function () { return korbAuf; } };
}
var KORB2 = [{ quantity: 1 }, { quantity: 2 }];

var f = fenster(KORB2, 1, true, false, { name: 'Al Porto' });
f.api.zeig({ status: 500, hint: 'Server-Fehler 500.' });
t('das Fenster geht auf', f.el.bestellFehlerModal.style.display === 'flex',
  f.el.bestellFehlerModal.style.display);
t('es sagt klar, dass NICHT abgeschickt wurde',
  /nicht abgeschickt/.test(f.el.bfText.textContent), f.el.bfText.textContent);
t('und dass nichts bezahlt wurde -- die zweite Sorge des Gastes',
  /nichts bezahlt/.test(f.el.bfText.textContent), f.el.bfText.textContent);
t('der Warenkorb-Hinweis nennt die richtige Menge (1+2 = 3)',
  /Deine 3 Gerichte/.test(f.el.bfKorbHinweis.textContent), f.el.bfKorbHinweis.textContent);
t('und verspricht, dass nichts verloren geht',
  /nichts verloren/.test(f.el.bfKorbHinweis.textContent));
t('der technische Grund steht klein dabei, nicht in der Hauptmeldung',
  f.el.bfGrund.textContent === 'Grund: Server-Fehler 500.', f.el.bfGrund.textContent);

var eins = fenster([{ quantity: 1 }], 1, true, false, null);
eins.api.zeig({ status: 500, hint: 'x' });
t('bei einem Gericht heisst es "Dein Gericht", nicht "Deine 1 Gerichte"',
  /^Dein Gericht liegt/.test(eins.el.bfKorbHinweis.textContent), eins.el.bfKorbHinweis.textContent);

// Netz weg wird anders formuliert als ein Server-Fehler -- der Gast kann im
// einen Fall selbst etwas tun, im anderen nicht.
var offline = fenster(KORB2, 1, false, false, null);
offline.api.zeig({ status: 0, hint: 'Netzwerkfehler' });
t('bei fehlender Verbindung steht das auch so da',
  /Verbindung hat nicht gereicht/.test(offline.el.bfText.textContent), offline.el.bfText.textContent);

// ---- 4. Nicht stur denselben Knopf anbieten ---------------------------------
var amTisch = fenster(KORB2, 3, true, true, null);
amTisch.api.zeig({ status: 0, hint: 'Netzwerkfehler' });
t('ab dem dritten Versuch am Tisch: Hinweis auf die Bedienung',
  /Bedienung/.test(amTisch.el.bfText.textContent), amTisch.el.bfText.textContent);
t('und der Knopf gibt zu, dass es bisher nicht klappte',
  amTisch.el.bfNochmal.textContent === 'Trotzdem nochmal versuchen', amTisch.el.bfNochmal.textContent);

var vonZuhause = fenster(KORB2, 3, true, false, { name: 'Al Porto', phone: '04976 123456' });
vonZuhause.api.zeig({ status: 0, hint: 'Netzwerkfehler' });
t('von zuhause aus wird stattdessen die Telefonnummer genannt',
  /04976 123456/.test(vonZuhause.el.bfText.textContent), vonZuhause.el.bfText.textContent);
var ohneNummer = fenster(KORB2, 3, true, false, { name: 'Al Porto' });
ohneNummer.api.zeig({ status: 0, hint: 'Netzwerkfehler' });
t('ohne hinterlegte Nummer wird keine erfunden',
  !/undefined|null/.test(ohneNummer.el.bfText.textContent), ohneNummer.el.bfText.textContent);
t('beim ersten Versuch steht der Zusatz noch nicht da',
  !/Bedienung|ruf am besten/.test(f.el.bfText.textContent), f.el.bfText.textContent);

// ---- 5. Ohne Fenster trotzdem keine falsche Bestaetigung --------------------
var ohneMarkup = new Function('document', 'orderCart', 'navigator', 'window', 'showToast',
    'openCartPanel', 'currentOrderRestaurant', 'closeModal', 'submitOrder',
    'var _bfVersuche = 0;\n' + schneide('zeigeBestellungFehlgeschlagen') + '\n' + schneide('_kmiIstAmTisch')
    + '; return zeigeBestellungFehlgeschlagen;');
var gemeldet = [], geoeffnet = 0;
ohneMarkup({ getElementById: function () { return null; } }, KORB2, { onLine: true }, {},
           function (m, a) { gemeldet.push([m, a]); }, function () { geoeffnet++; }, null,
           function () {}, function () {})({ status: 500, hint: 'x' });
t('fehlt das Fenster, kommt wenigstens eine Fehlermeldung',
  gemeldet.length === 1 && gemeldet[0][1] === 'error', JSON.stringify(gemeldet));
t('und der Warenkorb geht auf statt einer Bestaetigung', geoeffnet === 1, geoeffnet);

// ---- 6. Der Wiederholversuch --------------------------------------------------
var w = fenster(KORB2, 1, true, false, null);
w.api.nochmal();
t('der Wiederholversuch setzt den Spam-Zeitstempel zurueck',
  /window\._checkoutOpenedAt = 0;/.test(schneide('bestellungNochmalVersuchen')));
t('sonst wuerde der eigene Spam-Schutz den zweiten Versuch abweisen',
  /_checkoutOpenedAt[\s\S]{0,80}< 3000/.test(senden));
t('und er ruft submitOrder wirklich wieder auf',
  /if \(typeof submitOrder === 'function'\) submitOrder\(\);/.test(schneide('bestellungNochmalVersuchen')));

// ---- 7. Der Grund steht im Quelltext -----------------------------------------
t('warum hier abgebrochen wird, steht in der Datei',
  /NICHT GESPEICHERT HEISST NICHT BESTELLT/.test(H));
t('inklusive dem, was der Gast frueher faelschlich sah',
  /Bestaetigungsseite samt Bestellnummer|Bestaetigungsseite mit\s*\n?\/\/ Bestellnummer/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
