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
t('scheduled_at wird gesetzt', /orderData\.scheduled_at = window\._vorbestellungFuer;/.test(CODE));
t('und zusaetzlich in die Notiz geschrieben',
  /VORBESTELLUNG für/.test(CODE) && /orderData\.notes = orderData\.notes/.test(CODE));
t('der Grund fuer die Doppelung steht dabei',
  /still verschwunden|ZWEIMAL geschrieben/.test(H));

// ---- 7. Die Kueche sieht es ------------------------------------------------
t('die Bestellkarte zeigt einen Vorbestell-Streifen',
  /if \(order\.scheduled_at\) \{/.test(CODE) && /Vorbestellung' \+ \(_vbZeit/.test(CODE));
t('der Kuechen-Bon druckt VORBESTELLUNG gross',
  /VORBESTELLUNG&#10;<\/text>/.test(POS));
t('mit dem Zeitpunkt darunter', /sd\.toLocaleDateString\('de-DE'/.test(POS));
t('und deutlich abgesetzt', /\*{20,}/.test(POS));

// Die Spalte muss abgefragt werden -- sonst weiss der Bon nichts davon.
t('scheduled_at wird fuer den Drucker mitgelesen', /basis \+ ',scheduled_at'/.test(POS));
// ... aber ein Fehlen darf NICHT den ganzen Druck lahmlegen.
t('fehlt die Spalte, wird ohne sie gedruckt statt gar nicht',
  /catch \(e\) \{[\s\S]{0,200}orders = await sbGet\(basis\);/.test(POS));
t('und der Grund dafuer steht dabei',
  /waere ein Totalausfall geworden/.test(POS));

// ---- 8. Der Schalter fuer den Wirt -----------------------------------------
t('es gibt einen Schalter', /id="preorderToggle"/.test(H));
t('er haengt an toggleFeature', /toggleFeature\('preorder'\)/.test(H));
t('toggleFeature kennt das positive Flag', /feature === 'preorder'/.test(CODE));
t('der Schalterzustand wird beim Laden gesetzt',
  /features\.indexOf\('preorder'\) >= 0\) preorderToggle\.classList\.remove\('off'\)/.test(CODE));
t('der Gast sieht den Banner in der Speisekarte',
  /id="vorbestellBanner"/.test(H) && /zeigeVorbestellBanner\(restaurantId\)/.test(CODE));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
