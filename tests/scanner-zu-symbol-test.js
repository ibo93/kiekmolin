// VON DER GEDRUCKTEN KARTE BIS ZUM SYMBOL AM GERICHT -- WIRKLICH DURCHLAUFEN.
//
// GEMELDET WURDE
// --------------
// "der Menüscanner muss die Speisen lesen und so die Icon der Allergen
// einfügen und in den Kasten das richtige schreiben es ist sehr wichtig".
//
// WARUM ES DIESEN TEST ZUSAETZLICH GIBT
// -------------------------------------
// tests/allergen-kette-test.js prueft, dass die vier Glieder derselben
// Sprache sprechen -- aber es liest nur den Quelltext. Das reicht nicht fuer
// eine Sache, bei der ein Fehler jemanden ins Krankenhaus bringen kann.
//
// Hier wird stattdessen AUSGEFUEHRT: eine Zeile, wie sie auf einer echten
// Karte steht ("Pizza Tonno (a,d,g) 1,2"), geht durch die Normalisierung des
// Scanners, das Ergebnis geht durch die Anzeige, und geprueft wird, was der
// Gast am Ende sieht. Kein Regex auf Code, sondern das Ergebnis.
//
// DIE DREI FRAGEN
// ---------------
// 1. Kommt aus "(a,d,g)" wirklich Gluten, Fisch, Milch heraus?
// 2. Steht danach am Gericht fuer JEDES davon ein Symbol?
// 3. Steht im Info-Kasten der richtige VOLLTEXT dazu?
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var KERN = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'lib', 'scan-kern.js'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

function schneide(quelle, name) {
    var i = quelle.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = quelle.indexOf('{', i), d = 0;
    for (var k = j; k < quelle.length; k++) {
        if (quelle[k] === '{') d++;
        else if (quelle[k] === '}') { d--; if (!d) return quelle.slice(i, k + 1); }
    }
    return '';
}
function tabelle(quelle, name, ende) {
    var i = quelle.indexOf('var ' + name + ' = ');
    return i < 0 ? '' : quelle.slice(i, quelle.indexOf(ende, i));
}

// ---------------------------------------------------------------------------
// Glied 1+2: der Scanner. Seine Normalisierung wirklich ausfuehren.
// ---------------------------------------------------------------------------
// Nicht die Normalisierung allein, sondern der ECHTE Zeilenleser des
// Scanners -- parseZeilen. Damit steckt auch das Zerlegen der Klammern mit
// im Test und nicht nur das Uebersetzen der Kuerzel.
var SCAN = (function () {
    function bisSemikolon(v) {
        var i = KERN.indexOf('var ' + v + ' = ');
        if (i < 0) return '';
        var j = i, tiefe = 0;
        for (; j < KERN.length; j++) {
            var c = KERN[j];
            if (c === '{' || c === '[') tiefe++;
            else if (c === '}' || c === ']') tiefe--;
            else if (c === ';' && tiefe === 0) break;
        }
        return KERN.slice(i, j + 1);
    }
    var stuecke = ['ALLERGEN_CODES', 'BUCHSTABE_ZU_CODE', 'WORT_ZU_CODE', 'MERKMAL']
        .map(bisSemikolon).join('\n');
    return new Function(stuecke + '\n'
        + schneide(KERN, 'zerlegeGroessen') + '\n'
        + schneide(KERN, 'normAllergene') + '\n'
        + schneide(KERN, 'normZusatzstoffe') + '\n'
        + schneide(KERN, 'parseZeilen') + '\n'
        + '; return { zeilen: parseZeilen, allergene: normAllergene,'
        + '           codes: ALLERGEN_CODES };')();
})();

t('der Zeilenleser des Scanners laeuft', typeof SCAN.zeilen === 'function');
t('und kennt genau die 14 Pflichtallergene', SCAN.codes.length === 14, SCAN.codes.length);

// ---------------------------------------------------------------------------
// Glied 3+4: die Anzeige. Symbole und Info-Kasten wirklich ausfuehren.
// ---------------------------------------------------------------------------
var ZEIGE = (function () {
    var lmiv = CODE.slice(CODE.indexOf('var LMIV_ALLERGENS = ['), CODE.indexOf('window.LMIV_ALLERGENS'));
    var zz = CODE.slice(CODE.indexOf('var ZUSATZSTOFFE = {'), CODE.indexOf('window.ZUSATZSTOFFE'));
    var symTab = CODE.slice(CODE.indexOf('    var KIN_SYMBOLE = {'),
                            CODE.indexOf('window.kinSymbol = kinSymbol;'));
    return new Function('escapeHtml', 'translations', 'currentLanguage', 'autoDetectItemFlags',
        zz + '\n' + lmiv + '\n' + symTab + '\n'
        + schneide(CODE, 'zusatzstoffeVon') + '\n' + schneide(CODE, 'getAllergenLabel') + '\n'
        + schneide(CODE, 'allergenSatz') + '\n' + schneide(CODE, 'gerichtInfoHtml') + '\n'
        + schneide(CODE, 'getMenuBadgeIcons') + '\n'
        + '; return { symbole: getMenuBadgeIcons, kasten: gerichtInfoHtml,'
        + '           einzeln: kinSymbol, tabelle: KIN_SYMBOLE };'
    )(
        function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },
        { de: {} }, 'de',
        function () { /* das Raten ist hier absichtlich wirkungslos */ }
    );
})();

t('die Anzeige laeuft', typeof ZEIGE.symbole === 'function');
t('und kennt 21 Symbole', Object.keys(ZEIGE.tabelle).length === 21,
  Object.keys(ZEIGE.tabelle).length);

// ---------------------------------------------------------------------------
// DIE GANZE KETTE an einem Gericht, wie es auf einer Karte steht.
// ---------------------------------------------------------------------------
// Eine Zeile im Ausgabeformat des Scanners:
//   NR|Name|Beschreibung|Preis|Kategorie|Allergene|Zusatzstoffe|Merkmale
// Genau so liefert das Modell die gelesene Karte ab.
function ausKarte(zeile) {
    var items = SCAN.zeilen(zeile);
    if (!items.length) return null;
    var it = items[0];
    // Genau so legt der Import es in die Datenbank: die Gerichtnummer wandert
    // mit in additives, davor "nr:". Steht in index.html beim Speichern.
    return {
        name: it.name,
        description: it.description,
        allergens: SCAN.allergene(it.allergens),
        additives: (it.dish_number ? ['nr:' + it.dish_number] : []).concat(it.additives)
    };
}

(function () {
    // Eine Zeile, wie das Modell sie nach dem Lesen einer ostfriesischen Karte
    // abliefert. "(a,d,g)" auf der Karte = Gluten, Fisch, Milch.
    var gericht = ausKarte(
        '23|Pizza Tonno|Tomaten, Käse, Thunfisch, Zwiebeln|11.50|Pizzen|a,d,g|1,2|');
    t('die Zeile wird ueberhaupt gelesen', !!gericht && gericht.name === 'Pizza Tonno',
      gericht && gericht.name);
    var erg = gericht;
    t('aus "(a,d,g)" werden Gluten, Fisch und Milch',
      erg.allergens.join(',') === 'gluten,fisch,milch', erg.allergens.join(','));
    t('die Gerichtnummer landet als "nr:23" bei den Zusatzstoffen',
      erg.additives.indexOf('nr:23') === 0, erg.additives.join(','));
    t('und die Zusatzstoffnummern daneben',
      erg.additives.join(',') === 'nr:23,1,2', erg.additives.join(','));
    t('die Beschreibung enthaelt NICHT die Klammer-Kennzeichnung',
      erg.description.indexOf('a,d,g') < 0, erg.description);

    // ---- FRAGE 2: steht fuer jedes ein Symbol am Gericht? ------------------
    var badges = ZEIGE.symbole(gericht);
    erg.allergens.forEach(function (c) {
        t('am Gericht steht ein Symbol fuer ' + c,
          badges.indexOf('viewBox') >= 0 && badges.indexOf(ZEIGE.tabelle[c]) >= 0,
          badges.slice(0, 200));
    });
    t('und nicht mehr Symbole als Allergene (kein geratenes dazu)',
      (badges.match(/<svg /g) || []).length === erg.allergens.length,
      (badges.match(/<svg /g) || []).length + ' Symbole fuer '
        + erg.allergens.length + ' Allergene');

    // ---- FRAGE 3: steht im Kasten der richtige Volltext? -------------------
    var kasten = ZEIGE.kasten(gericht);
    t('der Kasten nennt Gluten im Volltext', /Enthält Glutenhaltiges Getreide/.test(kasten));
    t('Fisch im Volltext', /Enthält Fisch und Erzeugnisse daraus/.test(kasten), kasten);
    t('Milch im Volltext', /Enthält Milch und Erzeugnisse daraus/.test(kasten));
    t('die Zusatzstoffe im Klartext', /Mit Farbstoff/.test(kasten) && /Mit Konservierungsstoff/.test(kasten));
    t('die Gerichtnummer steht NICHT drin', kasten.indexOf('nr:23') < 0);
    t('die Beschreibung des Scanners steht drin', /Thunfisch/.test(kasten));
    t('der Spuren-Hinweis fehlt nicht', /Übergang von Spuren/.test(kasten));

    // Im Kasten steht neben jeder Allergenzeile dasselbe Symbol wie am Gericht.
    t('und neben jeder Allergenzeile steht das Symbol',
      (kasten.match(/<svg /g) || []).length === erg.allergens.length,
      (kasten.match(/<svg /g) || []).length);

    // ---- Die Reihenfolge ist oben wie unten dieselbe -----------------------
    // Sonst muss der Gast zweimal suchen.
    function reihenfolge(html) {
        return ['gluten', 'fisch', 'milch'].map(function (c) {
            return { c: c, i: html.indexOf(ZEIGE.tabelle[c]) };
        }).filter(function (x) { return x.i >= 0; })
          .sort(function (a, b) { return a.i - b.i; })
          .map(function (x) { return x.c; }).join(',');
    }
    t('die Reihenfolge am Gericht und im Kasten ist dieselbe',
      reihenfolge(badges) === reihenfolge(kasten),
      'Gericht: ' + reihenfolge(badges) + ' / Kasten: ' + reihenfolge(kasten));
    t('und sie folgt der Pflichtreihenfolge der Verordnung',
      reihenfolge(badges) === 'gluten,fisch,milch', reihenfolge(badges));
})();

// ---- Die Schreibweisen, die auf echten Karten vorkommen ---------------------
// Buchstaben, Grossbuchstaben, ausgeschriebene Woerter, Leerzeichen.
[
    ['a,c,g',            'gluten,eier,milch'],
    ['A, C, G',          'gluten,eier,milch'],
    ['gluten, milch',    'gluten,milch'],
    ['Weizen',           'gluten'],
    ['Laktose',          'milch'],
    ['Erdnüsse',         'erdnuss']
].forEach(function (paar) {
    // Ueber die ganze Zeile, damit auch das Zerlegen mitgeprueft wird.
    var g = ausKarte('|Testgericht|ohne|1.00|Test|' + paar[0] + '||');
    var raus = g ? g.allergens.join(',') : '(Zeile nicht gelesen)';
    t('"' + paar[0] + '" wird zu ' + paar[1], raus === paar[1], raus);
});

// ---- Und der Fall, der WEHTUT: keine Angabe ---------------------------------
// Ein Gericht ohne Kennzeichnung darf nicht so aussehen, als sei es frei von
// allem. Am Gericht steht dann kein Symbol -- und genau deshalb MUSS der
// Kasten deutlich sagen, dass nichts vorliegt.
(function () {
    var ohne = { name: 'Currywurst Pommes', description: '' };
    t('ohne Angabe steht kein Allergensymbol am Gericht',
      (ZEIGE.symbole(ohne).match(/<svg /g) || []).length === 0);
    var kasten = ZEIGE.kasten(ohne);
    t('aber der Kasten sagt ausdruecklich, dass nichts hinterlegt ist',
      /Keine Angaben hinterlegt/.test(kasten));
    t('und fordert zum Nachfragen auf', /frag im Restaurant nach/.test(kasten));
    t('er behauptet NICHT, das Gericht sei frei davon',
      !/keine Allergene/i.test(kasten) && !/frei von/i.test(kasten));
})();

// ---- Ein Kuerzel, das wir nicht kennen, darf nichts verschlucken ------------
(function () {
    var gericht = { name: 'X', allergens: ['gluten', 'quatsch'] };
    var kasten = ZEIGE.kasten(gericht);
    t('ein unbekanntes Kuerzel steht trotzdem im Kasten',
      /Enthält quatsch/.test(kasten), kasten);
    t('und schiebt die Pflichtangaben nicht nach unten',
      kasten.indexOf('Glutenhaltiges') < kasten.indexOf('quatsch'));
    t('am Gericht bekommt es kein Symbol, weil es keines gibt -- aber die '
      + 'bekannten verlieren ihres nicht',
      (ZEIGE.symbole(gericht).match(/<svg /g) || []).length === 1);
})();

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
