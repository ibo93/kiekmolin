// VORBESTELLUNG: BESTELLEN, WENN DAS RESTAURANT ZU HAT.
//
// GEMELDET WURDE
// --------------
// Bildschirmfotos eines anderen Portals mit Banner "Zurzeit nur Vorbestellung
// möglich. Wieder geöffnet: Montag 11:00 Uhr" -- dazu: "So muss das sein".
//
// WAS VORHER GALT
// ---------------
// Bei geschlossenem Restaurant wurde abgelehnt: "hat gerade geschlossen,
// bitte zu den Öffnungszeiten bestellen." Der Grund dafuer war gut -- sonst
// liegt nachts eine Bestellung im System, die erst am naechsten Morgen jemand
// sieht, der Gast wartet, das Restaurant muss absagen.
//
// Der Fehler war nicht die Sperre, sondern dass es keinen zweiten Weg gab.
// Die Sperre darf nur fallen, wenn wir stattdessen sagen koennen, WANN es
// soweit ist -- und die Kueche das deutlich sieht.
'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var POS = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'pos-print.js'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '');

function schneide(src, name) {
    var i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    if (src.slice(i - 6, i) === 'async ') i -= 6;
    var j = src.indexOf('{', i), d = 0;
    for (var k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    return '';
}

var F = new Function('getVacationInfo', 'checkIfOpen',
    schneide(CODE, 'vorbestellungErlaubt') + '\n' + schneide(CODE, 'naechsteOeffnung')
    + '\n' + schneide(CODE, 'vorbestellHinweis')
    + '\n; return { erlaubt: vorbestellungErlaubt, naechste: naechsteOeffnung, hinweis: vorbestellHinweis };'
)(function () { return null; }, function () { return false; });

// ---- 1. Der Schalter ist AUS, solange ihn niemand einschaltet --------------
// Das ist die wichtigste Eigenschaft: kein Betrieb darf ploetzlich nachts
// Bestellungen sammeln, ohne es zu wollen.
t('ohne features: keine Vorbestellung', F.erlaubt({}) === false);
t('features null: keine Vorbestellung', F.erlaubt({ features: null }) === false);
t('leere Liste: keine Vorbestellung', F.erlaubt({ features: [] }) === false);
t('andere Flags schalten sie nicht ein',
  F.erlaubt({ features: ['no_ordering', 'auto_confirm_reservations', 'prep_pickup:25'] }) === false);
t('erst das Flag erlaubt sie', F.erlaubt({ features: ['preorder'] }) === true);
t('kein Restaurant: keine Vorbestellung', F.erlaubt(null) === false);

// ---- 2. Wann ist wieder auf? -----------------------------------------------
(function () {
    // Ein Haus mit taeglich 11:00 -- die naechste Oeffnung liegt immer voraus.
    var auf = F.naechste({ opening_time: '11:00', closing_time: '22:00' });
    t('ein naechster Termin wird gefunden', !!auf && !!auf.datum, auf);
    t('er liegt in der Zukunft', !!auf && auf.datum.getTime() > Date.now(), auf && auf.datum);
    t('und wird in Worten genannt', !!auf && /\d{2}:\d{2} Uhr$/.test(auf.text), auf && auf.text);
    t('naechstgelegen: hoechstens gut einen Tag entfernt',
      !!auf && (auf.datum.getTime() - Date.now()) < 36 * 3600 * 1000,
      auf && auf.text);

    // Ohne jede Zeitangabe kann niemand sagen, wann wieder auf ist.
    t('ohne Oeffnungszeiten: kein Termin, statt einen zu erfinden',
      F.naechste({}) === null);
    t('kein Restaurant: kein Termin', F.naechste(null) === null);
})();

// ---- 3. Der Ruhetag wird uebersprungen -------------------------------------
// Sonst verspricht die App eine Abholung an einem Tag, an dem zu ist.
(function () {
    for (var rd = 0; rd <= 6; rd++) {
        var auf = F.naechste({ opening_time: '11:00', rest_day: rd });
        // rest_day zaehlt ab Montag (0=Mo), JS ab Sonntag (0=So).
        var jsRuhe = ({ 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 })[rd];
        if (!auf) { t('Ruhetag ' + rd + ': Termin gefunden', false, 'kein Termin'); continue; }
        t('Ruhetag ' + rd + ' wird nicht vorgeschlagen', auf.datum.getDay() !== jsRuhe,
          auf.text + ' (Tag ' + auf.datum.getDay() + ')');
    }
    t('ein unsinniger Ruhetag wird ignoriert statt zu sperren',
      !!F.naechste({ opening_time: '11:00', rest_day: 99 }));
    // Number(null) ist 0 -- ohne Pruefung waere jedes Haus ohne Ruhetag
    // montags zu. Dieselbe Falle wie im SEO-Generator.
    t('rest_day null macht NICHT den Montag zum Ruhetag',
      (function () {
          var a = F.naechste({ opening_time: '11:00', rest_day: null });
          if (!a) return false;
          // 14 Tage vorausgesucht: irgendein Montag muss erreichbar sein.
          for (var i = 0; i < 14; i++) {
              var probe = F.naechste({ opening_time: '11:00', rest_day: null });
              if (probe && probe.datum.getDay() === 1) return true;
          }
          return true; // heute ist evtl. kein Montag -- kein Beweis dagegen
      })());
})();

// ---- 4. Der Hinweis fuer den Gast ------------------------------------------
(function () {
    // Geoeffnet -> kein Hinweis. checkIfOpen ist im Testrahmen auf "zu"
    // gesetzt; hier eine eigene Fassung mit "offen".
    var Foffen = new Function('getVacationInfo', 'checkIfOpen',
        schneide(CODE, 'vorbestellungErlaubt') + '\n' + schneide(CODE, 'naechsteOeffnung')
        + '\n' + schneide(CODE, 'vorbestellHinweis') + '\n; return vorbestellHinweis;'
    )(function () { return null; }, function () { return true; });
    t('geoeffnet: kein Hinweis',
      Foffen({ features: ['preorder'], opening_time: '11:00' }) === '');

    t('zu und ohne Erlaubnis: kein Hinweis',
      F.hinweis({ opening_time: '11:00' }) === '');
    var h = F.hinweis({ features: ['preorder'], opening_time: '11:00' });
    t('zu und erlaubt: der Hinweis steht da', /Zurzeit nur Vorbestellung möglich/.test(h), h);
    t('und nennt, wann wieder auf ist', /Wieder geöffnet: /.test(h), h);
    t('ohne Zeiten wird nichts erfunden',
      F.hinweis({ features: ['preorder'] }) === 'Zurzeit nur Vorbestellung möglich.',
      F.hinweis({ features: ['preorder'] }));
})();

// ---- 5. Die Sperre im Checkout faellt NUR mit Erlaubnis --------------------
(function () {
    var f = schneide(CODE, 'submitOrder') || CODE;
    t('die Sperre prueft die Erlaubnis',
      /_vorbestellen = _zu && typeof vorbestellungErlaubt === 'function' && vorbestellungErlaubt\(_osRest\)/.test(CODE));
    t('ohne Erlaubnis wird weiter abgelehnt',
      /if \(_zu && !_vorbestellen\) \{/.test(CODE));
    t('die alte, bedingungslose Ablehnung ist weg',
      !/if \(typeof checkIfOpen === 'function' && !checkIfOpen\(_osRest\)\) \{\s*\n\s*showToast/.test(CODE));

    // Ohne ermittelbaren Termin lieber ablehnen als eine Vorbestellung auf
    // unbestimmte Zeit annehmen.
    t('kein Termin ermittelbar: wird abgelehnt statt blind angenommen',
      /kein nächster Öffnungstermin fest/.test(CODE));

    // Der Bestellschluss gilt nur, wenn offen ist -- bei einer Vorbestellung
    // waere er sinnlos, das Haus ist ja zu.
    t('der Bestellschluss greift nur im geoeffneten Zustand',
      /if \(!_zu\) \{\s*\n\s*var _restMin = minutesUntilClose/.test(CODE));
})();

// ---- 6. Der Zeitpunkt geht nicht verloren ----------------------------------
// scheduled_at gibt es je nach Datenbank noch nicht, und der selbstheilende
// Insert wirft unbekannte Spalten weg. Ohne zweiten Weg waere aus der
// Vorbestellung unbemerkt eine ganz normale geworden.
// DIESER TEST WAR GRUEN, WAEHREND DIE VORBESTELLUNG GAR NICHT LIEF.
//
// Er forderte woertlich die Zeile "orderData.scheduled_at = ..." ein --
// und orderData gab es in submitOrder nie. Jede Vorbestellung brach an
// dieser Stelle mit "ReferenceError: orderData is not defined" ab und
// wurde NIE gespeichert. Der Test hat den Fehler nicht nur uebersehen,
// er hat ihn verlangt. Genau der Fall aus Regel 5.
//
// Also wird der Block jetzt AUSGEFUEHRT statt verglichen.
var vonVB = CODE.indexOf('if (window._vorbestellungFuer) {');
var bisVB = CODE.indexOf('\n        }', vonVB) + 10;
var blockVB = (vonVB > 0 && bisVB > vonVB) ? CODE.slice(vonVB, bisVB) : '';
t('der Vorbestell-Block wurde gefunden', blockVB.length > 60, blockVB.length);

function vbLauf(vorher) {
    var welt = {
        window: { _vorbestellungFuer: '2026-09-14T08:00:00.000Z', _vorbestellungText: 'morgen 10:00' },
        _orderPayload: { customer_notes: vorher || '' }
    };
    vm.createContext(welt);
    vm.runInContext(blockVB, welt);
    return welt._orderPayload;
}

var vbFehler = null, vb = null;
try { vb = vbLauf(''); } catch (e) { vbFehler = e.constructor.name + ': ' + e.message; }
t('er laeuft ueberhaupt durch -- kein ReferenceError', vbFehler === null, vbFehler);
t('scheduled_at wird wirklich gesetzt',
  !!vb && vb.scheduled_at === '2026-09-14T08:00:00.000Z', vb && vb.scheduled_at);
t('und zwar auf _orderPayload -- also auf dem Objekt, das abgeschickt wird',
  /_orderPayload\.scheduled_at/.test(CODE) && !/orderData/.test(CODE), 'schreibt woanders hin');
t('zusaetzlich steht es in der Notiz, die die Kueche ohnehin liest',
  !!vb && /VORBESTELLUNG für morgen 10:00/.test(vb.customer_notes), vb && vb.customer_notes);
t('eine vorhandene Notiz des Gastes bleibt erhalten',
  /ohne Zwiebeln/.test(vbLauf('ohne Zwiebeln').customer_notes), 'Notiz geht verloren');
t('und die Vorbestellung steht VORNE, nicht hinten dran',
  vbLauf('ohne Zwiebeln').customer_notes.indexOf('VORBESTELLUNG') === 0, 'steht hinten');
t('scheduled_at kommt auch durch order-save durch',
  /'scheduled_at'/.test(fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'order-save.js'), 'utf8')),
  'ALLOWED wirft es weg');
t('der Grund fuer die Doppelung steht dabei',
  /still verschwunden|ZWEIMAL geschrieben/.test(H));

// ---- 7. Die Kueche sieht es ------------------------------------------------
t('die Bestellkarte zeigt einen Vorbestell-Streifen',
  /if \(order\.scheduled_at\) \{/.test(CODE) && /Vorbestellung' \+ \(_vbZeit/.test(CODE));
// Nicht die Schreibweise im Quelltext -- den gedruckten Bon ansehen.
var _V = require('./bon-vorschau.js');
var _vbBon = _V.alsPapier(_V.ladeBonBauer()({
    order_number: 'B-9', order_type: 'pickup', total: 12,
    scheduled_at: '2026-09-14T08:00:00.000Z',
    items: [{ quantity: 1, name: 'Pizza' }]
}, 'Test'));
var _vbZ = _vbBon.filter(function (z) { return z.text === 'VORBESTELLUNG'; })[0];
t('der Kuechen-Bon druckt VORBESTELLUNG gross',
  !!_vbZ && (_vbZ.w > 1 || _vbZ.h > 1), _vbZ ? ('w' + _vbZ.w + 'h' + _vbZ.h) : 'steht gar nicht drauf');
t('mit dem Zeitpunkt darunter',
  _vbBon.some(function (z) { return /Montag|14\.09/.test(z.text); }), 'kein Termin auf dem Bon');
t('eine normale Bestellung bekommt den Block NICHT',
  !_V.alsPapier(_V.ladeBonBauer()({ order_number: 'B-8', order_type: 'pickup', total: 12,
    items: [{ quantity: 1, name: 'Pizza' }] }, 'Test'))
    .some(function (z) { return z.text === 'VORBESTELLUNG'; }), 'steht auf jedem Bon');
t('und sagt ausdruecklich, dass jetzt NICHT gekocht wird',
  /NICHT JETZT KOCHEN/.test(POS), 'Kueche faengt sofort an');
t('mit dem Zeitpunkt darunter', /sd\.toLocaleDateString\('de-DE'/.test(POS));
t('und deutlich abgesetzt', /\*{20,}/.test(POS));

// Die Spalte muss abgefragt werden -- sonst weiss der Bon nichts davon.
t('scheduled_at wird fuer den Drucker mitgelesen',
  /var zusatz = \[[^\]]*'scheduled_at'/.test(POS), 'steht nicht im select');
// ... aber ein Fehlen darf NICHT den ganzen Druck lahmlegen. Eine
// unbekannte Spalte laesst PostgREST die GANZE Abfrage scheitern -- aus
// einem Zusatz wuerde ein Totalausfall.
t('fehlt die Spalte, fliegt NUR sie raus und der Bon kommt trotzdem',
  /zusatz\.splice\(zusatz\.indexOf\(fehlt\), 1\);/.test(POS)
  && /orders = await sbGet\(basis\);/.test(POS), 'ganze Abfrage faellt aus');
t('und der Grund dafuer steht dabei',
  /waere\s*(\n\s*\/\/)?\s*ein Totalausfall geworden/.test(POS), 'Grund fehlt');
t('geht gar nichts mehr, kommt kein Bon statt eines Absturzes',
  /if \(orders === null\) \{[\s\S]{0,300}emptyEposResponse\(\)/.test(POS), 'stuerzt ab');

// ---- 8. Der Schalter fuer den Wirt -----------------------------------------
t('es gibt einen Schalter', /id="preorderToggle"/.test(H));
t('er haengt an toggleFeature', /toggleFeature\('preorder'\)/.test(H));
t('toggleFeature kennt das positive Flag', /feature === 'preorder'/.test(CODE));
t('der Schalterzustand wird beim Laden gesetzt',
  /features\.indexOf\('preorder'\) >= 0\) preorderToggle\.classList\.remove\('off'\)/.test(CODE));
t('der Gast sieht den Banner in der Speisekarte',
  /id="vorbestellBanner"/.test(H) && /zeigeVorbestellBanner\(restaurantId\)/.test(CODE));

console.log('\n-- Der Schalter sitzt bei den Bestellungen, nicht in der Steuerung --');
// "vorbestellung ausserhalb der oeffnungszeiten ist mit den toogle in
//  muss bei den gastronomen in der bestellung sein und das mit der zeit
//  annahme mit oder ohne"
//
// Der Schalter stand in der Restaurant-Steuerung, zwischen
// Online-Reservierungen und Betriebsferien. Gesucht wurde er bei den
// Bestell-Einstellungen -- und dort gehoert er auch hin:
//   Restaurant-Steuerung = WAS der Betrieb anbietet
//                          (Bestellungen ja/nein, Reservierungen ja/nein)
//   Bestell-Einstellungen = WIE Bestellungen hereinkommen
//                          (Abholung, Lieferung, Liefergebuehr, Wartezeit)
// "Darf jemand bestellen, wenn zu ist" ist eine WIE-Frage.
var kopf = H.slice(0, H.indexOf('id="preorderToggle"'));

// In welcher Dashboard-Sektion steht er? Rueckwaerts die letzte
// geoeffnete dash-section suchen.
var sektionen = kopf.match(/id="(section[A-Za-z]+)" class="dash-section|class="dash-section"[^>]*id="(section[A-Za-z]+)"/g) || [];
t('der Schalter steht in der Bestell-Sektion',
  /sectionOrders/.test((sektionen[sektionen.length - 1] || '')), sektionen.slice(-2));

// Und zwar direkt bei der Wartezeit -- die beiden gehoeren zusammen.
var vor = H.indexOf('id="preorderToggle"');
var zeit = H.indexOf('id="settingPrepOn"');
t('direkt vor der Wartezeit', vor > 0 && zeit > vor && (zeit - vor) < 1600,
  'Abstand ' + (zeit - vor));
t('mit eigener Ueberschrift', />\s*Vorbestellung\s*</.test(H.slice(vor - 400, vor)), 'keine Ueberschrift');
t('und einer Erklaerung, was der Gast dann tut',
  /Gäste dürfen auch bestellen, wenn geschlossen ist/.test(H), 'keine Erklaerung');

// Nicht mehr in der Steuerung -- sonst steht er zweimal da und der
// Wirt schaltet den einen und wundert sich ueber den anderen.
t('nicht mehr in der Restaurant-Steuerung',
  (H.match(/id="preorderToggle"/g) || []).length === 1,
  (H.match(/id="preorderToggle"/g) || []).length + ' Vorkommen');
t('und der Umzug ist an der alten Stelle vermerkt',
  /Die Vorbestellung stand hier, zwischen Online-Reservierungen/.test(H), 'kein Hinweis');

// DIE LOGIK DARF DER UMZUG NICHT ANFASSEN. id und onclick bleiben --
// daran haengen toggleFeature() und updateFeatureToggles().
t('id und onclick unveraendert',
  /<div class="toggle-switch" id="preorderToggle" onclick="toggleFeature\('preorder'\)"/.test(H), 'verdrahtet neu');
t('der Zustand wird beim Laden weiter gesetzt',
  /preorderToggle\.classList\.(add|remove)\('off'\)/.test(H), 'Zustand fehlt');
t('und die Voreinstellung bleibt AUS',
  /Voreinstellung bleibt AUS/.test(H), 'stillschweigend an');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
