// "KEINE RESTAURANTS GEFUNDEN" UND "LADEN..." -- GLEICHZEITIG, FUER IMMER.
//
// WAS DA STAND
// ------------
// Der Leerzustand der Restaurantliste war eine Meldung fuer alles:
//
//     <h3>Keine Restaurants gefunden</h3>
//     <p>Laden...</p>
//
// Beides zusammen, in einem Kasten. Das ist widerspruechlich (leer ODER es
// laedt, nicht beides) und im haeufigsten Fall schlicht falsch: gefunden
// haben wir nichts, weil wir gar nicht nachsehen konnten. Bei schlechtem
// Netz stand der Kasten so bis in alle Ewigkeit da.
//
// DREI LAGEN, DIE ETWAS VERSCHIEDENES BEDEUTEN
// ---------------------------------------------
//   1. noch nicht nachgesehen      -> es laedt gerade
//   2. nachgesehen, wirklich leer  -> hier ist nichts eingetragen
//   3. Nachsehen gescheitert       -> wir konnten nicht laden, nochmal?
//
// Nur bei 2 darf "keine Restaurants" dastehen. Der Unterschied zwischen 2
// und 3 entscheidet, ob der Gast denkt "hier ist nichts los" (und nicht
// wiederkommt) oder "gleich nochmal versuchen".
//
// DER ZAEHLER AUF DER KARTE
// -------------------------
// Derselbe Denkfehler eine Etage tiefer: dort stand "0 RESTAURANTS". Eine
// Null heisst "wir haben nachgesehen, da ist nichts". Wissen wir das nicht,
// gehoert dort ein Strich hin. Und weil der Ausstieg fuer die leere Liste
// VOR der Stelle lag, an der der Zaehler sonst gesetzt wird, blieb er
// ausgerechnet im leeren Fall auf dem Startwert stehen.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '');

// ---- Den echten Leerzustand ausfuehren -------------------------------------
// Aus renderRestaurants nur den Teil bis zum Ausstieg -- der Rest baut die
// Karten und braucht den halben Datenbestand.
function leerZweig() {
    var i = CODE.indexOf('function renderRestaurants(filter)');
    var block = CODE.slice(i, CODE.indexOf('let html = ', i));
    var von = block.indexOf('if (!APP_DATA.restaurants || APP_DATA.restaurants.length === 0) {');
    if (von < 0) throw new Error('Leer-Zweig nicht gefunden');
    // Bis zur schliessenden Klammer dieses if-Blocks.
    var d = 0, k = block.indexOf('{', von);
    for (; k < block.length; k++) {
        if (block[k] === '{') d++;
        else if (block[k] === '}') { d--; if (!d) break; }
    }
    return block.slice(von, k + 1);
}

function lauf(zustand) {
    var geschrieben = { html: '', zaehler: null };
    var behaelter = { set innerHTML(v) { geschrieben.html = v; }, get innerHTML() { return geschrieben.html; } };
    var zaehlerEl = { textContent: '–' };
    var dok = {
        getElementById: function (id) { return id === 'mapRestCount' ? zaehlerEl : null; }
    };
    var fenster = {
        _restaurantsGeladen: zustand.geladen,
        _restaurantsLadefehler: zustand.fehler
    };
    var t_ = {};
    // Die echten Texte aus dem Stilbogen holen, damit der Test nicht seine
    // eigenen erfindet.
    var deBlock = CODE.slice(CODE.indexOf('\n    de: {'));
    deBlock = deBlock.slice(0, deBlock.indexOf('\n    },'));
    ['noRestaurants', 'noRestaurantsHint', 'loadingRestaurants', 'oneMoment',
     'loadFailed', 'loadFailedHint', 'tryAgain'].forEach(function (k) {
        var m = deBlock.match(new RegExp(k + ":\\s*'([^']*)'"));
        if (m) t_[k] = m[1];
    });

    new Function('APP_DATA', 'container', 't', 'document', 'window',
        leerZweig() + '\n; return null;'
    )({ restaurants: zustand.liste || [] }, behaelter, t_, dok, fenster);

    return { html: geschrieben.html, zaehler: zaehlerEl.textContent, texte: t_ };
}

// ---- 1. Es laedt noch --------------------------------------------------------
(function () {
    var r = lauf({ geladen: false, fehler: false });
    t('waehrend des Ladens steht NICHT "keine Restaurants" da',
      r.html.indexOf(r.texte.noRestaurants) < 0, r.html.slice(0, 120));
    t('sondern dass geladen wird',
      r.html.indexOf(r.texte.loadingRestaurants) >= 0, r.html.slice(0, 120));
    t('der Zaehler bleibt ein Strich, solange niemand nachgesehen hat',
      r.zaehler === '–', r.zaehler);
    t('und es gibt keinen Knopf -- es laeuft ja noch',
      r.html.indexOf('<button') < 0);
})();

// ---- 2. Wirklich leer --------------------------------------------------------
(function () {
    var r = lauf({ geladen: true, fehler: false });
    t('nach erfolgreichem Laden darf "keine Restaurants" dastehen',
      r.html.indexOf(r.texte.noRestaurants) >= 0, r.html.slice(0, 120));
    t('und kein Ladehinweis mehr daneben',
      r.html.indexOf(r.texte.loadingRestaurants) < 0
      && r.html.indexOf('Laden...') < 0, r.html.slice(0, 160));
    t('jetzt ist die Null richtig -- wir HABEN nachgesehen',
      r.zaehler === '0', r.zaehler);
})();

// ---- 3. Laden gescheitert ----------------------------------------------------
(function () {
    var r = lauf({ geladen: false, fehler: true });
    t('bei einem Ladefehler steht nicht "keine Restaurants"',
      r.html.indexOf(r.texte.noRestaurants) < 0, r.html.slice(0, 140));
    t('sondern dass die Liste nicht geladen werden konnte',
      r.html.indexOf(r.texte.loadFailed) >= 0, r.html.slice(0, 140));
    t('mit einem Knopf zum nochmal Versuchen',
      /<button[^>]*onclick="initSupabase\(\)"/.test(r.html), r.html.slice(-200));
    t('und der Zaehler behauptet keine Null',
      r.zaehler === '–', r.zaehler);
})();

// ---- 4. Die Merker werden auch wirklich gesetzt ------------------------------
(function () {
    var i = CODE.indexOf('async function initSupabase');
    var block = CODE.slice(i, i + 9000);
    t('nach erfolgreichem Laden wird der Merker gesetzt',
      /window\._restaurantsGeladen = true;/.test(block));
    t('und der Fehler-Merker zurueckgenommen',
      /window\._restaurantsLadefehler = false;/.test(block));
    var fang = block.slice(block.indexOf('} catch (e) {'));
    t('im Fehlerfall andersherum',
      /window\._restaurantsLadefehler = true;/.test(fang.slice(0, 900)));
    // Ohne das Neuzeichnen bliebe der Ladehinweis von vorhin fuer immer
    // stehen -- der Gast wartet auf etwas, das nicht mehr kommt.
    t('und es wird neu gezeichnet, auch wenn gar nichts da ist',
      /else if \(typeof renderRestaurants === 'function'\) \{[\s\S]{0,300}?renderRestaurants\(\);/.test(fang));
})();

// ---- 5. Der Startwert im HTML ------------------------------------------------
t('im HTML steht als Startwert ein Strich, keine Null',
  /<span id="mapRestCount">–<\/span>/.test(H),
  (H.match(/<span id="mapRestCount">[^<]*<\/span>/) || [''])[0]);

// ---- 6. Alle drei Sprachen haben die neuen Texte -----------------------------
['de', 'en', 'nl'].forEach(function (s) {
    var block = CODE.slice(CODE.indexOf('\n    ' + s + ': {'));
    block = block.slice(0, block.indexOf('\n    },'));
    var fehlt = ['noRestaurantsHint', 'loadingRestaurants', 'oneMoment', 'loadFailed', 'loadFailedHint']
        .filter(function (k) { return block.indexOf(k + ':') < 0; });
    t('Sprache ' + s + ': die drei Lagen sind uebersetzt', fehlt.length === 0, fehlt.join(', '));
});

// Doppelte Schluessel im selben Objekt sind still gefaehrlich: der letzte
// gewinnt, und beim Lesen sieht man den ersten. Beim Einbauen ist mir das
// prompt mit tryAgain passiert.
['tryAgain', 'noRestaurants', 'loadFailed'].forEach(function (k) {
    ['de', 'en', 'nl'].forEach(function (s) {
        var block = CODE.slice(CODE.indexOf('\n    ' + s + ': {'));
        block = block.slice(0, block.indexOf('\n    },'));
        var anzahl = (block.match(new RegExp('^\\s{8}' + k + ':', 'gm')) || []).length;
        t('Sprache ' + s + ': "' + k + '" steht genau einmal drin', anzahl === 1, anzahl + 'x');
    });
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
