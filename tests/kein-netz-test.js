// WENN DAS NETZ FEHLT, MUSS ES JEMAND SAGEN.
//
// GEMELDET WURDE
// --------------
// "die App laedt so komisch ab und zu wenn kein gutes Internet ist".
//
// NACHGESTELLT
// ------------
// Seite ueber einen lokalen Server geladen, alles nach draussen gekappt, und
// dann bei 1,5 / 4 / 9 / 15 Sekunden nachgesehen, was auf dem Bildschirm
// steht:
//
//     1500 ms | Karten  2 | "0 RESTAURANTS" | offline-Hinweis: keiner
//     4000 ms | Karten  2 | "0 RESTAURANTS" | offline-Hinweis: keiner
//     9000 ms | Karten  2 | "0 RESTAURANTS" | offline-Hinweis: keiner
//    15000 ms | Karten  2 | "0 RESTAURANTS" | offline-Hinweis: keiner
//
// Der Gast sieht "0 RESTAURANTS" -- sofort und fuer immer. Nirgends steht,
// dass die Verbindung fehlt. Fuer ihn ist das nicht zu unterscheiden von
// "hier gibt es nichts". Wer das glaubt, kommt nicht wieder.
//
// ZWEI SACHEN DAGEGEN
// -------------------
// 1. Eine Leiste, die sagt, woran man ist. Ausgeloest wird sie vom
//    GEPLATZTEN Aufruf, nicht von navigator.onLine: im Hotel-WLAN mit
//    Anmeldeseite steht dort "online" und es kommt trotzdem nichts an. Die
//    Ereignisse online/offline sind nur die Ergaenzung.
//
// 2. Die zuletzt gesehene Liste zeigen statt gar keiner. Der
//    Zwischenspeicher wurde bisher nur genommen, wenn er keine zehn Minuten
//    alt war. Sind frische Daten nicht in Reichweite, ist eine Liste von
//    gestern deutlich mehr wert als eine leere Seite -- die Leiste sagt ja,
//    woran man ist.
//
// WAS AUSDRUECKLICH NICHT PASSIERT
// ---------------------------------
// Ein "HTTP 400" ist kein fehlendes Netz. Da hat der Server geantwortet und
// uns etwas mitgeteilt -- das ist unser Fehler, nicht seiner, und dafuer gibt
// es die stille Fehlerliste. Wuerde die Leiste auch dabei erscheinen, stuende
// sie irgendwann dauernd da und niemand liest sie mehr.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    throw new Error('nicht zu Ende gelesen: ' + name);
}

// ---- 1. Die Leiste bauen und wieder wegnehmen ------------------------------
// Ausgefuehrt mit einem winzigen Ersatz-DOM: der Test soll die echte Funktion
// laufen lassen, nicht ihren Quelltext lesen.
(function () {
    var angehaengt = [];
    function knoten(tag) {
        return {
            tag: tag, id: '', innerHTML: '', attr: {}, kinder: [], parentNode: null,
            style: { cssText: '' },
            setAttribute: function (k, v) { this.attr[k] = v; },
            appendChild: function (k) { k.parentNode = this; this.kinder.push(k); angehaengt.push(k); return k; },
            removeChild: function (k) {
                var i = this.kinder.indexOf(k); if (i > -1) this.kinder.splice(i, 1);
                var j = angehaengt.indexOf(k); if (j > -1) angehaengt.splice(j, 1);
                k.parentNode = null;
            }
        };
    }
    var body = knoten('body');
    var dok = {
        body: body,
        createElement: knoten,
        getElementById: function (id) {
            return angehaengt.filter(function (k) { return k.id === id; })[0] || null;
        },
        addEventListener: function () {}
    };
    var lauscher = {};
    var fenster = { addEventListener: function (name, fn) { lauscher[name] = fn; } };

    // _netzLeisteAn steht im echten Code VOR der Funktion -- hier ebenso.
    var zeige = new Function('document', 'window', 'navigator',
        'var _netzLeisteAn = false;\n' + schneide('zeigeNetzLeiste') + '\n; return zeigeNetzLeiste;'
    )(dok, fenster, { onLine: true });

    zeige(true);
    var el = dok.getElementById('kinNetzLeiste');
    t('die Leiste wird gebaut', !!el);
    t('sie sagt, was los ist -- ohne Fachwort',
      !!el && /Keine Verbindung/.test(el.innerHTML) && !/HTTP|fetch|Supabase/.test(el.innerHTML),
      el && el.innerHTML.slice(0, 90));
    t('sie liegt ueber allem anderen',
      !!el && /z-index:\s*100[6-9]\d/.test(el.style.cssText), el && el.style.cssText.slice(0, 60));
    // Unten sitzen Cookie-Hinweis, Warenkorb-Leiste und Navigation -- dort lag
    // die Meldung beim ersten Versuch prompt halb darunter.
    t('und oben, nicht unten, wo schon drei andere Leisten sind',
      !!el && /top:\s*0/.test(el.style.cssText) && !/bottom:/.test(el.style.cssText),
      el && el.style.cssText.slice(0, 80));
    t('Vorleseprogramme bekommen sie mit', !!el && el.attr.role === 'status');

    zeige(true);
    t('zweimal einschalten baut keine zweite Leiste',
      dok.body.kinder.length === 1, dok.body.kinder.length + '');

    zeige(false);
    t('ausschalten nimmt sie wieder weg', dok.getElementById('kinNetzLeiste') === null);
})();

// ---- 2. Ausgeloest wird sie vom geplatzten Aufruf --------------------------
(function () {
    var lese = schneide('sbRead');
    t('sbRead faengt einen geplatzten fetch ueberhaupt ab',
      /try \{\s*res = await fetch\(url, options\);\s*\} catch/.test(lese), lese.slice(0, 120));
    t('und zeigt dann die Leiste',
      /catch \(netzFehler\) \{[\s\S]{0,400}?zeigeNetzLeiste\(true\)/.test(lese));
    t('kam etwas an, verschwindet sie wieder',
      /zeigeNetzLeiste\(false\);\s*\n\s*if \(!res\.ok\)/.test(lese));

    // Der Fehler muss weitergereicht werden -- sonst denkt der Aufrufer, es
    // sei alles gut, und arbeitet mit undefined weiter.
    t('der Fehler wird trotzdem weitergereicht',
      /catch \(netzFehler\) \{[\s\S]{0,400}?throw netzFehler;/.test(lese));

    // navigator.onLine ist die Ergaenzung, nicht der Ausloeser.
    t('online/offline des Browsers wird zusaetzlich beachtet',
      /addEventListener\('offline'[\s\S]{0,120}zeigeNetzLeiste\(true\)/.test(CODE)
      && /addEventListener\('online'[\s\S]{0,120}zeigeNetzLeiste\(false\)/.test(CODE));
    t('und warum das allein nicht reicht, steht dabei',
      /Hotel-WLAN|Anmeldeseite/.test(H));
})();

// ---- 3. Der Ladefehler der Restaurantliste ---------------------------------
(function () {
    var i = CODE.indexOf('async function initSupabase');
    var block = CODE.slice(i, i + 9000);
    var fang = block.slice(block.indexOf('} catch (e) {'));

    t('beim gescheiterten Laden erscheint die Leiste',
      /zeigeNetzLeiste\(true\)/.test(fang.slice(0, 1200)));
    // Genau die Unterscheidung, die verhindert, dass die Leiste zum Dauergast
    // wird: hat der Server geantwortet, ist es kein Netzproblem.
    t('aber NICHT, wenn der Server geantwortet hat (HTTP 400 und Verwandte)',
      /!\/\^HTTP \\d\/\.test\(String\(e && e\.message\)\)/.test(fang.slice(0, 1200)),
      fang.slice(0, 300));

    t('und die zuletzt gesehene Liste wird gezeigt statt gar keiner',
      /kmi_restaurants_cache/.test(fang.slice(0, 2500))
      && /APP_DATA\.restaurants = alt\.data\.map/.test(fang.slice(0, 2500)));
    t('aber nur, wenn wirklich nichts da ist -- frische Daten haben Vorrang',
      /if \(!APP_DATA\.restaurants \|\| APP_DATA\.restaurants\.length === 0\)/.test(fang.slice(0, 2500)));
})();

// ---- 4. Das Symbol dafuer ist in der eingebauten Schrift -------------------
// Sonst stuende in der Leiste, die ueber das fehlende Netz informiert,
// ausgerechnet das Wort "wifi_off".
(function () {
    var drin = (H.match(/KIN-SYMBOLSCHRIFT-INHALT:\s*([a-z0-9_,]+)/) || [])[1] || '';
    t('das Zeichen wifi_off ist in der Schrift drin',
      drin.split(',').indexOf('wifi_off') >= 0);
})();

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
