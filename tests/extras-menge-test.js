// EXTRAS: HOECHSTZAHL UND MENGE.
//
// GEMELDET WURDE
// --------------
// Bildschirmfoto von pronto-emden.de: ueber der Extra-Liste steht "(0/2)",
// und neben jedem Extra ein Zaehler mit Minus und Plus. Dazu: "ok mach und
// unsere muss sauber sein und schoen".
//
// WAS VORHER WAR
// --------------
// 1. Die Spalte max_selections gab es in der Datenbank laengst, und seit dem
//    letzten Schritt speichert das Dashboard sie auch (Feld ogMax).
//    AUSGEWERTET wurde sie nie. Der Wirt stellte "hoechstens 2 Saucen" ein,
//    der Gast kreuzte acht an, und in der Kueche lag eine Bestellung, die so
//    nicht gemeint war. Eine Einstellung, die nichts tut, ist schlimmer als
//    keine -- der Wirt glaubt, es sei geregelt.
// 2. Ein Extra ging nur einmal. Wer zwei Portionen Kaese wollte, musste es
//    ins Freitextfeld schreiben, und dann stand es nicht im Preis.
//
// DIE DREI STELLEN, AN DENEN SO ETWAS ERFAHRUNGSGEMAESS BRICHT
// -------------------------------------------------------------
// a) Gezaehlt werden MENGEN, nicht Zeilen. Sonst umgeht man "hoechstens 2"
//    mit einem Tipp auf das Plus daneben.
// b) Der Preis muss die Menge kennen. 2x Kaese kostet zweimal.
// c) Die Menge muss bis zur Kueche durchkommen. Steht auf dem Bon "Kaese"
//    statt "2x Kaese", bezahlt der Gast zwei und bekommt eins -- und niemand
//    sieht, wo es verlorenging.
//
// Der Test fuehrt die echten Funktionen aus. Die Knoepfe werden auf dem
// WIRKLICH GERENDERTEN HTML gedrueckt: renderOptionGroupsHtml laeuft, das
// Ergebnis wird zu einem Baum geparst, und toggleExtra/changeExtraQty
// bekommen Knoten aus genau diesem Baum. Aendert sich das Markup, ohne dass
// die Funktionen mitgehen, wird der Test rot.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('Funktion ' + name + ' nicht gefunden');
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    throw new Error('Funktion ' + name + ' nicht zu Ende gelesen');
}

// ---------------------------------------------------------------------------
// Ein sehr kleiner Baum, gerade genug fuer das, was die Funktionen anfassen:
// classList, getAttribute, querySelector, closest. Kein jsdom -- die
// Testsammlung hier kommt ohne Abhaengigkeiten aus, und ein echter Browser
// waere fuer diese vier Aufrufe die falsche Maschine.
// ---------------------------------------------------------------------------
var LEER = ['br', 'input', 'img', 'hr'];

function parse(html) {
    var wurzel = knoten('#root', {}), jetzt = wurzel;
    var re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g, m;
    while ((m = re.exec(html))) {
        if (m[5] != null) { jetzt.kinder.push(knoten('#text', {}, m[5], jetzt)); continue; }
        if (m[1]) { if (jetzt.eltern) jetzt = jetzt.eltern; continue; }
        var el = knoten(m[2], attribute(m[3]), '', jetzt);
        jetzt.kinder.push(el);
        if (!m[4] && LEER.indexOf(m[2]) < 0) jetzt = el;
    }
    return wurzel;
}

function attribute(s) {
    var a = {}, re = /([a-zA-Z-]+)(?:="([^"]*)")?/g, m;
    while ((m = re.exec(s || ''))) { if (m[1]) a[m[1]] = m[2] == null ? '' : m[2]; }
    return a;
}

function knoten(tag, attr, text, eltern) {
    var el = {
        tag: tag, attr: attr, kinder: [], eltern: eltern || null,
        _k: (attr.class || '').split(/\s+/).filter(Boolean)
    };
    el.classList = {
        add: function (c) { if (el._k.indexOf(c) < 0) el._k.push(c); },
        remove: function (c) { var i = el._k.indexOf(c); if (i > -1) el._k.splice(i, 1); },
        contains: function (c) { return el._k.indexOf(c) >= 0; },
        toggle: function (c, an) {
            if (an === undefined) an = el._k.indexOf(c) < 0;
            if (an) el.classList.add(c); else el.classList.remove(c);
            return an;
        }
    };
    el.getAttribute = function (name) { return el.attr[name] == null ? null : el.attr[name]; };
    el.querySelector = function (sel) { return suche(el, sel)[0] || null; };
    el.querySelectorAll = function (sel) { return suche(el, sel); };
    el.closest = function (sel) {
        var p = el;
        while (p) { if (passt(p, sel)) return p; p = p.eltern; }
        return null;
    };
    Object.defineProperty(el, 'textContent', {
        get: function () {
            if (el.tag === '#text') return text;
            return el.kinder.map(function (k) { return k.textContent; }).join('');
        },
        set: function (v) {
            if (el.tag === '#text') { text = v; return; }
            el.kinder = [knoten('#text', {}, String(v), el)];
        }
    });
    return el;
}

function passt(el, sel) {
    if (el.tag === '#text') return false;
    var m = sel.match(/^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)(?:\[([\w-]+)="([^"]*)"\])?$/);
    if (!m) throw new Error('Auswahl nicht unterstuetzt: ' + sel);
    if (m[1] && el.tag !== m[1]) return false;
    var klassen = (m[2] || '').split('.').filter(Boolean);
    for (var i = 0; i < klassen.length; i++) if (!el.classList.contains(klassen[i])) return false;
    if (m[3] && el.getAttribute(m[3]) !== m[4]) return false;
    return true;
}

function suche(el, sel) {
    var raus = [];
    (function geh(k) {
        k.kinder.forEach(function (kind) {
            if (passt(kind, sel)) raus.push(kind);
            geh(kind);
        });
    })(el);
    return raus;
}

// ---------------------------------------------------------------------------
// Die echten Funktionen laden
// ---------------------------------------------------------------------------
function bau() {
    var baum = null;              // wird nach dem Rendern gesetzt
    var toasts = [];
    var preise = [];

    var quelle = [
        schneide('optionText'),
        schneide('optionAufpreis'),
        schneide('renderOptionGroupsHtml'),
        schneide('gruppenAnzahl'),
        schneide('gruppenKasten'),
        schneide('gruppenMax'),
        schneide('frischeGruppenZaehler'),
        schneide('passtNochRein'),
        schneide('toggleExtra'),
        schneide('changeExtraQty'),
        schneide('calculateItemPrice')
    ].join('\n');

    var F = new Function(
        'document', 'translations', 'currentLanguage', 'showToast', 'formatPrice',
        'selectOption', 'updateItemTotalPrice', 'currentMenuItem',
        'var currentItemOptions = [];\n' + quelle
        + '\n; return {'
        + '  optionText: optionText, optionAufpreis: optionAufpreis,'
        + '  render: renderOptionGroupsHtml, toggle: toggleExtra, menge: changeExtraQty,'
        + '  anzahl: gruppenAnzahl, preis: calculateItemPrice,'
        + '  optionen: function () { return currentItemOptions; },'
        + '  leeren: function () { currentItemOptions.length = 0; }'
        + '};'
    )(
        { querySelector: function (sel) { return baum ? baum.querySelector(sel) : null; } },
        { de: { required: 'Pflicht', maxReached: 'Mehr als {n} geht hier nicht' } },
        'de',
        function (text) { toasts.push(text); },
        function (p) { return Number(p).toFixed(2).replace('.', ',') + ' €'; },
        function () { },
        function () { preise.push(true); },
        { base_price: 10 }
    );

    F.toasts = toasts;
    F.setzeBaum = function (b) { baum = b; };
    return F;
}

var F = bau();

// ---- 1. Wie eine Option geschrieben wird -----------------------------------
t('ohne Menge steht nur der Name da',
  F.optionText({ option: 'Käse' }) === 'Käse', F.optionText({ option: 'Käse' }));
t('Menge 1 schreibt kein "1×" davor -- das liest sich falsch',
  F.optionText({ option: 'Käse', quantity: 1 }) === 'Käse');
t('ab zwei steht die Menge davor',
  F.optionText({ option: 'Käse', quantity: 2 }) === '2× Käse', F.optionText({ option: 'Käse', quantity: 2 }));
t('der Name wird auch unter option_name gefunden (so heisst er in der gespeicherten Bestellung)',
  F.optionText({ option_name: 'groß', quantity: 3 }) === '3× groß');
t('und unter name (so heisst er bei alten Positionen)',
  F.optionText({ name: 'Pommes' }) === 'Pommes');
t('eine blosse Zeichenkette kommt unveraendert durch',
  F.optionText('Zwiebeln') === 'Zwiebeln');
t('nichts drin, nichts raus', F.optionText(null) === '' && F.optionText({}) === '');

// ---- 2. Was eine Option kostet ---------------------------------------------
t('eine Groesse kommt nicht obendrauf -- sie IST der Preis',
  F.optionAufpreis({ option: 'groß', price: 12, price_type: 'replace' }) === 0);
t('ein Aufschlag ohne Menge kostet einmal',
  F.optionAufpreis({ option: 'Käse', price: 1.5, price_type: 'add' }) === 1.5);
t('ein Aufschlag mit Menge 3 kostet dreimal',
  F.optionAufpreis({ option: 'Käse', price: 1.5, price_type: 'add', quantity: 3 }) === 4.5,
  F.optionAufpreis({ option: 'Käse', price: 1.5, price_type: 'add', quantity: 3 }) + '');
t('auch price_delta wird verstanden (so heisst das Feld auf dem Bon)',
  F.optionAufpreis({ name: 'Käse', price_delta: 2, quantity: 2 }) === 4);

// ---------------------------------------------------------------------------
// Ab hier wird wirklich gerendert und geklickt.
// ---------------------------------------------------------------------------
function gruppe(extra) {
    var g = {
        id: 'g-saucen', name: 'Saucen', type: 'multi', is_required: false,
        choices: [
            { name: 'Knoblauch', price: 0.5 },
            { name: 'Scharf', price: 0.5 },
            { name: 'Cocktail', price: 0.5 }
        ]
    };
    Object.keys(extra || {}).forEach(function (k) { g[k] = extra[k]; });
    return g;
}

function buehne(g) {
    F.leeren();
    F.toasts.length = 0;
    var html = F.render([g], 10);
    var baum = parse(html);
    F.setzeBaum(baum);
    return {
        html: html,
        baum: baum,
        kasten: baum.querySelector('.option-group'),
        zeilen: baum.querySelectorAll('.option-item'),
        zaehler: baum.querySelector('.option-group-count')
    };
}

// ---- 3. Der Zaehler steht nur da, wenn er etwas aussagt --------------------
(function () {
    var b = buehne(gruppe({ max_selections: 2 }));
    t('mit Hoechstzahl steht "0/2" in der Kopfzeile',
      !!b.zaehler && b.zaehler.textContent === '0/2', b.zaehler && b.zaehler.textContent);
    t('und die Hoechstzahl steht am Kasten, wo die Funktionen sie finden',
      b.kasten.getAttribute('data-max') === '2', b.kasten.getAttribute('data-max'));

    var ohne = buehne(gruppe({}));
    t('ohne Hoechstzahl gibt es keinen Zaehler -- eine Zahl ohne Grenze sagt nichts',
      ohne.zaehler === null && ohne.kasten.getAttribute('data-max') === null);

    // Bei einer Groesse nimmt man ohnehin genau eine. "0/1" darueber waere
    // Rauschen, und ein Mengenzaehler an einer Groesse ergibt keinen Sinn.
    var einzel = buehne(gruppe({ type: 'single', max_selections: 1 }));
    t('ueber einer Groessenauswahl steht kein Zaehler',
      einzel.zaehler === null);
    t('und eine Groesse bekommt keinen Mengenzaehler',
      einzel.baum.querySelectorAll('.extra-menge').length === 0);
})();

// ---- 4. Der Mengenzaehler ist im Markup und stiehlt den Klick nicht --------
(function () {
    var b = buehne(gruppe({}));
    t('jedes Extra bringt einen Mengenzaehler mit',
      b.baum.querySelectorAll('.extra-menge').length === 3,
      b.baum.querySelectorAll('.extra-menge').length + '');
    t('darin steht anfangs die Eins',
      b.baum.querySelector('.extra-anzahl').textContent === '1');
    // Ohne stopPropagation waere jeder Tipp auf "+" zugleich ein Tipp auf die
    // Zeile -- das Extra flöge im selben Moment wieder raus.
    var plus = b.baum.querySelectorAll('button')[1];
    t('Plus und Minus halten den Klick auf, bevor er die Zeile umschaltet',
      b.baum.querySelectorAll('button').every(function (k) {
          return (k.getAttribute('onclick') || '').indexOf('event.stopPropagation()') === 0;
      }), (plus && plus.getAttribute('onclick')) || '');
})();

// ---- 5. Ankreuzen und wieder abwaehlen -------------------------------------
(function () {
    var b = buehne(gruppe({ max_selections: 2 }));
    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    t('nach dem Antippen ist die Zeile gewaehlt', b.zeilen[0].classList.contains('selected'));
    t('und die Option steht mit Menge 1 im Warenkorb',
      JSON.stringify(F.optionen()) === JSON.stringify([{ group: 'g-saucen', option: 'Knoblauch', price: 0.5, price_type: 'add', quantity: 1 }]),
      JSON.stringify(F.optionen()));
    t('der Zaehler springt auf 1/2', b.zaehler.textContent === '1/2', b.zaehler.textContent);
    t('und der Kasten ist noch nicht voll', !b.kasten.classList.contains('voll'));

    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    t('nochmal antippen nimmt es wieder heraus',
      F.optionen().length === 0 && !b.zeilen[0].classList.contains('selected'));
    t('und der Zaehler geht zurueck auf 0/2', b.zaehler.textContent === '0/2');
})();

// ---- 6. Die Hoechstzahl haelt wirklich -------------------------------------
(function () {
    var b = buehne(gruppe({ max_selections: 2 }));
    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    F.toggle(b.zeilen[1], 'g-saucen', 'Scharf', 0.5);
    t('bei zwei von zwei ist der Kasten als voll markiert',
      b.kasten.classList.contains('voll') && b.zaehler.textContent === '2/2',
      b.zaehler.textContent);

    F.toggle(b.zeilen[2], 'g-saucen', 'Cocktail', 0.5);
    t('die dritte Sauce kommt nicht mehr dazu', F.anzahl('g-saucen') === 2,
      JSON.stringify(F.optionen()));
    t('und die Zeile sieht auch nicht gewaehlt aus -- sonst stimmt Bild und Bestellung nicht ueberein',
      !b.zeilen[2].classList.contains('selected'));
    t('der Gast erfaehrt warum, statt auf einen toten Knopf zu tippen',
      F.toasts.length === 1 && F.toasts[0] === 'Mehr als 2 geht hier nicht',
      JSON.stringify(F.toasts));

    // Abwaehlen macht wieder Platz.
    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    F.toggle(b.zeilen[2], 'g-saucen', 'Cocktail', 0.5);
    t('nach dem Abwaehlen passt die dritte Sauce hinein',
      b.zeilen[2].classList.contains('selected') && F.anzahl('g-saucen') === 2);
})();

// ---- 7. Mengen zaehlen gegen die Hoechstzahl -------------------------------
// Der Weg, auf dem sich die Grenze am leichtesten umgehen liesse: einmal
// ankreuzen, dann auf das Plus daneben tippen.
(function () {
    var b = buehne(gruppe({ max_selections: 2 }));
    var plus = b.zeilen[0].querySelectorAll('button')[1];
    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    F.menge(plus, 'g-saucen', 'Knoblauch', 0.5, 1);
    t('zweimal dieselbe Sauce zaehlt als zwei', F.anzahl('g-saucen') === 2);
    t('der Zaehler zeigt 2/2 und der Kasten ist voll',
      b.zaehler.textContent === '2/2' && b.kasten.classList.contains('voll'),
      b.zaehler.textContent);
    t('am Extra steht die Zwei',
      b.zeilen[0].querySelector('.extra-anzahl').textContent === '2');

    F.menge(plus, 'g-saucen', 'Knoblauch', 0.5, 1);
    t('ein drittes Mal geht nicht -- sonst waere die Grenze mit einem Tipp umgangen',
      F.optionen()[0].quantity === 2, JSON.stringify(F.optionen()));

    F.toggle(b.zeilen[1], 'g-saucen', 'Scharf', 0.5);
    t('und eine zweite Sauce passt daneben auch nicht mehr hinein',
      F.anzahl('g-saucen') === 2 && F.optionen().length === 1);
})();

// ---- 8. Minus bei eins nimmt das Extra ganz heraus -------------------------
// Eine Null stehen zu lassen waere eine Zeile, die gewaehlt aussieht und
// nichts bewirkt.
(function () {
    var b = buehne(gruppe({}));
    var minus = b.zeilen[0].querySelectorAll('button')[0];
    var plus = b.zeilen[0].querySelectorAll('button')[1];
    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    F.menge(plus, 'g-saucen', 'Knoblauch', 0.5, 1);
    F.menge(minus, 'g-saucen', 'Knoblauch', 0.5, -1);
    t('von zwei auf eins bleibt das Extra drin',
      F.optionen().length === 1 && F.optionen()[0].quantity === 1);
    t('und die Anzeige geht auf 1 zurueck',
      b.zeilen[0].querySelector('.extra-anzahl').textContent === '1');

    F.menge(minus, 'g-saucen', 'Knoblauch', 0.5, -1);
    t('von eins auf null nimmt es ganz heraus', F.optionen().length === 0);
    t('die Zeile ist danach nicht mehr gewaehlt',
      !b.zeilen[0].classList.contains('selected'));

    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    t('und beim naechsten Anwaehlen faengt es wieder bei eins an',
      F.optionen()[0].quantity === 1
      && b.zeilen[0].querySelector('.extra-anzahl').textContent === '1');
})();

// ---- 9. Der Preis kennt die Menge ------------------------------------------
(function () {
    var b = buehne(gruppe({}));
    var plus = b.zeilen[0].querySelectorAll('button')[1];
    F.toggle(b.zeilen[0], 'g-saucen', 'Knoblauch', 0.5);
    t('Grundpreis plus ein Extra', F.preis() === 10.5, F.preis() + '');
    F.menge(plus, 'g-saucen', 'Knoblauch', 0.5, 1);
    t('zweimal dasselbe Extra kostet auch zweimal', F.preis() === 11, F.preis() + '');
    F.menge(plus, 'g-saucen', 'Knoblauch', 0.5, 1);
    t('und dreimal dreimal', F.preis() === 11.5, F.preis() + '');
})();

// ---- 10. Die Menge kommt bis zur Kueche durch ------------------------------
// Der Text wird an sieben Stellen gebaut: Warenkorb, Bestelluebersicht,
// Kuechenansicht, Bon, Druckerdaten, Mail. Jede hatte die Namenskette
// ("option" oder "option_name" oder "name") einzeln nachgeschrieben, und an
// einer stand sie einmal falsch herum -- da las die Kueche den Gerichtnamen
// statt der Groesse. Jetzt gibt es eine Funktion, und keine Stelle darf die
// Kette wieder selbst bauen.
(function () {
    var kette = /o(?:pt)?\.option\s*\|\|\s*o(?:pt)?\.option_name|o(?:pt)?\.option_name\s*\|\|\s*o(?:pt)?\.option/g;
    var uebrig = (CODE.match(kette) || []).length;
    // Die eine erlaubte Stelle ist optionText selbst.
    t('die Namenskette steht nur noch in optionText und nirgends sonst',
      uebrig === 1, uebrig + ' Stellen gefunden');

    var benutzer = (CODE.match(/optionText/g) || []).length;
    t('und optionText wird an allen Anzeigestellen wirklich benutzt',
      benutzer >= 8, benutzer + ' Erwaehnungen');
})();

// ---- 11. Das Haekchen im Kaestchen -----------------------------------------
// Es war ein Zeichen der Symbolschrift mit font-size:3px -- in einem 22 px
// grossen Kaestchen praktisch nicht vorhanden; gewaehlt erkannte man nur an
// der Fuellung. Groesser stellen allein war nicht die Antwort: Material
// Symbols ist eine Ligaturschrift, und wenn sie nicht laedt, steht das WORT
// "check" im Kaestchen. Also wieder ein gezeichnetes Haekchen -- das braucht
// keine Schrift und keine Verbindung.
(function () {
    var b = buehne(gruppe({}));
    var kasten = b.zeilen[0].querySelector('.option-checkbox');
    t('im Kaestchen steckt ein gezeichnetes Haekchen', !!kasten.querySelector('svg'));
    t('und kein Zeichen aus der Symbolschrift, das ohne Schrift zum Wort wird',
      b.html.indexOf('material-symbols-outlined') < 0
      && b.html.indexOf('>check<') < 0);
    t('es ist gross genug, um es zu sehen',
      parseInt(kasten.querySelector('svg').getAttribute('width'), 10) >= 12,
      kasten.querySelector('svg').getAttribute('width'));

    // Ohne diese beiden Regeln stuende in JEDEM Kaestchen ein Haekchen, auch
    // in den nicht gewaehlten.
    t('ungewaehlt ist das Haekchen unsichtbar',
      /\.option-checkbox svg,\s*\.option-radio svg \{\s*opacity: 0;/.test(H));
    t('und erscheint erst mit der Auswahl',
      /\.option-item\.selected \.option-checkbox svg,\s*\.option-item\.selected \.option-radio svg \{\s*opacity: 1;/.test(H));
})();

// ---- 12. Was das Dashboard speichert, wertet die Gastseite auch aus --------
t('das Dashboard speichert die Hoechstzahl aus dem Feld ogMax',
  /max_selections:\s*type === 'single' \? 1 : \(parseInt\(_ogMaxWert\(\)/.test(CODE));
t('und die Gastseite liest max_selections aus der Gruppe',
  /parseInt\(group\.max_selections, 10\)/.test(CODE));

// ---- 13. "Bitte ohne" hat jetzt auch eine Uebersetzung ---------------------
// Der Schluessel wurde beim Bauen schon benutzt, war aber nirgends
// hinterlegt -- auf Englisch und Niederlaendisch stand deutsch da.
['de', 'en', 'nl'].forEach(function (s) {
    var block = CODE.slice(CODE.indexOf('\n    ' + s + ': {'));
    block = block.slice(0, block.indexOf('\n    },'));
    t('Sprache ' + s + ': pleaseWithout und maxReached sind hinterlegt',
      /pleaseWithout:/.test(block) && /maxReached:/.test(block));
    t('Sprache ' + s + ': in maxReached steckt der Platzhalter {n}',
      /maxReached:\s*'[^']*\{n\}[^']*'/.test(block));
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
