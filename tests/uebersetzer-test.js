// ÜBERSETZUNG DER SPEISEKARTE (DE -> EN/NL)
//
// DREI FEHLER, DIE ZUSAMMEN DAFUER GESORGT HABEN, DASS ES NACH NICHTS AUSSAH
// --------------------------------------------------------------------------
// 1. GERICHTNAMEN WURDEN UEBERSETZT. "Döner Teller" wurde zu "Doner Plate".
//    Der Gast sucht dann einen Namen, den es an der Theke nicht gibt, und das
//    Personal versteht die Bestellung nicht. Echte mehrsprachige Karten machen
//    es andersherum: Name bleibt, Beschreibung wird übersetzt.
//
// 2. DAS WOERTERBUCH KANNTE DIE KARTE NICHT. Von 123 Zutatenwörtern der
//    echten Karte standen 38 drin. Der Rest blieb deutsch stehen -- mitten im
//    englischen Satz.
//
// 3. 142 GLEICHZEITIGE ANFRAGEN. Für jedes Gericht ging sofort eine Anfrage
//    an MyMemory raus, einen kostenlosen Dienst mit hartem Limit. Nach den
//    ersten paar kam nur noch "MYMEMORY WARNING" zurück -- im Quelltext steht
//    sogar schon eine Aufräumroutine für genau diesen Müll im Cache.
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
var dictQuelle = (function () {
    var i = H.indexOf('var GASTRO_DICT = {');
    return H.slice(i, H.indexOf('\n};', i) + 3);
})();

function bau(fetchAttrappe, cache) {
    var speicher = {};
    var quelle = dictQuelle + '\n'
        + 'var _menuTransCache = ' + JSON.stringify(cache || {}) + ';\n'
        + schneide('translateByDict') + '\n'
        + schneide('translateViaAPI') + '\n'
        + schneide('getTranslatedItem') + '\n'
        + schneide('_woerterbuchLuecken') + '\n'
        + H.slice(H.indexOf('var _uebersetzerGesperrt ='), H.indexOf('function _uebersetzerAbarbeiten')) + '\n'
        + schneide('_uebersetzerAbarbeiten') + '\n'
        + schneide('translateItemAsync') + '\n'
        + 'return { dict: GASTRO_DICT, byDict: translateByDict, item: getTranslatedItem,'
        + ' luecken: _woerterbuchLuecken, async: translateItemAsync, cache: function(){return _menuTransCache;},'
        + ' gesperrt: function(){return _uebersetzerGesperrt;}, offen: function(){return _uebersetzerWarteschlange.length;} };';
    return new Function('fetch', 'localStorage', quelle)(fetchAttrappe, {
        getItem: function (k) { return speicher[k] || null; },
        setItem: function (k, v) { speicher[k] = v; },
        removeItem: function (k) { delete speicher[k]; }
    });
}

var U = bau(async function () { throw new Error('darf hier nicht gefragt werden'); });

// ============ 1. DER NAME BLEIBT ============
var doener = { id: 'x1', name: 'Döner Teller', description: 'Kalbfleisch, Salat, Tzatziki' };
['en', 'nl'].forEach(function (l) {
    t('Gerichtname bleibt unangetastet (' + l + ')',
      U.item(doener, l).name === 'Döner Teller', U.item(doener, l).name);
});
t('auf Deutsch sowieso', U.item(doener, 'de').name === 'Döner Teller');

// Namen, die das Wörterbuch früher zerlegt hätte
[['Pizza Emden', 'en'], ['Hähnchenschnitzel mit Pommes', 'en'], ['Gemischter Salat', 'nl']].forEach(function (p) {
    var it = { id: 'n' + p[0], name: p[0], description: '' };
    t('"' + p[0] + '" bleibt "' + p[0] + '"', U.item(it, p[1]).name === p[0], U.item(it, p[1]).name);
});

// Alte Caches tragen noch übersetzte Namen mit sich herum.
var U2 = bau(async function () { throw new Error('nein'); },
    { x1: { en: { name: 'Doner Plate', description: 'veal, salad', _apiDone: true } } });
t('ein alter Cache mit uebersetztem Namen wird nicht mehr benutzt',
  U2.item(doener, 'en').name === 'Döner Teller', U2.item(doener, 'en').name);
t('die gecachte Beschreibung wird aber weiter verwendet',
  U2.item(doener, 'en').description === 'veal, salad', U2.item(doener, 'en').description);

// ============ 2. DIE BESCHREIBUNG WIRD UEBERSETZT ============
t('Beschreibung kommt uebersetzt zurueck',
  /Tzatziki/i.test(U.item(doener, 'en').description) && /salad/i.test(U.item(doener, 'en').description),
  U.item(doener, 'en').description);
t('Zutaten auf Niederlaendisch',
  /sla|salade/i.test(U.item(doener, 'nl').description), U.item(doener, 'nl').description);

// ============ 3. DAS WOERTERBUCH KENNT DIE ECHTE KARTE ============
var SEITEN = JSON.parse(fs.readFileSync('/home/user/kiekmolin/tests/daten/pronto-pdfjs.json', 'utf8'));
var vor = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);
var leser = new Function('SEITEN', vor + '\n'
    + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems', '_nrWert', 'sortiereNachNummer'].map(schneide).join('\n')
    + '\nvar txt = SEITEN.map(function (s) { return pdfSeiteZuText(s.items, s.w); }).join("\\n");'
    + '\nreturn pdfGerichteZuItems(parseKartenText(txt));');
var karte = leser(SEITEN);
var alle = {}, gedeckt = 0;
karte.forEach(function (it) {
    (it.description || '').toLowerCase().split(/[^a-zäöüß]+/).forEach(function (w) { if (w.length > 2) alle[w] = 1; });
});
Object.keys(alle).forEach(function (w) { if (U.dict[w]) gedeckt++; });
var quote = Math.round(gedeckt / Object.keys(alle).length * 100);
t('das Woerterbuch deckt die echte Karte zu mindestens 90 % ab',
  quote >= 90, quote + ' % (' + gedeckt + '/' + Object.keys(alle).length + ')');

// Früher blieben diese hier stehen -- Wort für Wort nachgesehen.
[['Putenschinken', 'en', /turkey/i], ['Gurken', 'en', /cucumber/i], ['Sahnesauce', 'nl', /roomsaus/i],
 ['Fladenbrot', 'en', /flatbread/i], ['Rotkrautsalat', 'nl', /rodekool/i]].forEach(function (p) {
    t('"' + p[0] + '" wird uebersetzt (' + p[1] + ')', p[2].test(U.byDict(p[0], p[1])), U.byDict(p[0], p[1]));
});

// ============ 4. KEINE ANFRAGE, WENN DAS WOERTERBUCH REICHT ============
t('vollstaendig bekannte Beschreibung hat null Luecken',
  U.luecken('Tomaten, Käse, Salami', 'en') === 0, U.luecken('Tomaten, Käse, Salami', 'en'));
t('unbekanntes Wort wird als Luecke gezaehlt',
  U.luecken('Tomaten mit Wunderkraut', 'en') === 1, U.luecken('Tomaten mit Wunderkraut', 'en'));
t('kurze Fuellwoerter zaehlen nicht als Luecke',
  U.luecken('mit und von', 'en') === 0, U.luecken('mit und von', 'en'));

var gefragt = 0;
var U3 = bau(async function () { gefragt++; return { json: async function () { return { responseData: { translatedText: 'x' } }; } }; });
U3.async({ id: 'a', name: 'Pizza', description: 'Tomaten, Käse, Salami' }, 'en', null, null);
t('bekannte Beschreibung fragt die API GAR NICHT (das Limit ist begrenzt)',
  gefragt === 0 && U3.offen() === 0, gefragt + ' Anfragen');

U3.async({ id: 'b', name: 'Pizza', description: 'Tomaten mit Wunderkraut' }, 'en', null, null);
t('unbekanntes Wort fuehrt sehr wohl zur Anfrage', gefragt === 1, gefragt);

// ============ 5. NICHT 142 AUF EINMAL ============
var gleichzeitig = 0, hoechstens = 0, aufloesen = [];
var U4 = bau(function () {
    gleichzeitig++; hoechstens = Math.max(hoechstens, gleichzeitig);
    return new Promise(function (fertig) {
        aufloesen.push(function () {
            gleichzeitig--;
            fertig({ json: async function () { return { responseData: { translatedText: 'ok' } }; } });
        });
    });
});
for (var i = 0; i < 20; i++) {
    U4.async({ id: 'q' + i, name: 'X', description: 'Wunderkraut Zauberpilz ' + i }, 'en', null, null);
}
setTimeout(function () {
    t('hoechstens zwei Anfragen gleichzeitig, nicht alle auf einmal',
      hoechstens <= 2 && hoechstens > 0, 'hoechstens ' + hoechstens);
    t('der Rest wartet in der Schlange statt loszurennen',
      U4.offen() >= 15, U4.offen() + ' warten');

    // ============ 6. LIMIT ERREICHT -> AUFHOEREN ============
    var nachSperre = 0;
    var U5 = bau(async function () {
        nachSperre++;
        return { json: async function () { return { responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' } }; } };
    });
    U5.async({ id: 'z1', name: 'X', description: 'Wunderkraut Zauberpilz' }, 'en', null, null);
    setTimeout(function () {
        t('die Limit-Meldung sperrt den Uebersetzer', U5.gesperrt() === true, String(U5.gesperrt()));
        var vorher = nachSperre;
        U5.async({ id: 'z2', name: 'Y', description: 'Wunderkraut Zauberpilz zwei' }, 'en', null, null);
        setTimeout(function () {
            t('danach geht keine einzige Anfrage mehr raus',
              nachSperre === vorher, nachSperre + ' statt ' + vorher);
            t('die Limit-Meldung landet nie im Cache',
              !JSON.stringify(U5.cache()).toLowerCase().includes('mymemory warning'), JSON.stringify(U5.cache()).slice(0, 120));

            // ============ 7. Ist es auch eingebaut? ============
            t('die Gastansicht nimmt den Namen aus getTranslatedItem',
              /var _tr = getTranslatedItem\(item, currentLanguage\)/.test(H));
            t('im Cache wird kein Name mehr abgelegt',
              !/_menuTransCache\[cacheKey\]\[lang\] = \{ name:/.test(H));
            t('der Grund steht im Quelltext, nicht nur hier',
              /GERICHTNAMEN WERDEN NICHT ÜBERSETZT/.test(H));

            console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
            process.exit(ok === n ? 0 : 1);
        }, 30);
    }, 30);
}, 30);
