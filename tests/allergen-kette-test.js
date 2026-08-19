// DIE GANZE KETTE: KARTE -> SCANNER -> DATENBANK -> GAST.
//
// WARUM DIESER TEST
// -----------------
// Gewuenscht war "der Menu muss alles lesen". Beim Nachsehen stellte sich
// heraus: der Scanner liest die Allergene und Zusatzstoffe laengst aus den
// Klammern der Karte ("(1,2,a,c)"), und der Import schreibt sie auch in die
// Datenbank. Gefehlt hat nur das letzte Glied -- die Anzeige beim Gast.
//
// Genau deshalb gibt es diesen Test. Die Kette hat vier Glieder, jedes davon
// war einzeln in Ordnung, und trotzdem kam beim Gast nichts an. Ein Test pro
// Glied haette das nie gefunden: er haette in jedem Glied gruen gemeldet.
//
// Hier wird die VERBINDUNG geprueft -- dass die Kuerzel, die der Scanner
// ausgibt, dieselben sind, die die Anzeige versteht.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var KERN = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'lib', 'scan-kern.js'), 'utf8');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '');

// ---- 1. Glied 1: der Scanner fragt danach ----------------------------------
t('der Prompt verlangt ein Allergen-Feld', /\|Allergene\|/.test(KERN));
t('und ein Zusatzstoff-Feld', /\|Zusatzstoffe\|/.test(KERN));
t('die Klammern der Karte werden ausdruecklich dorthin gelenkt',
  /Kennzeichnungen in Klammern[\s\S]{0,160}naechsten beiden Feldern/.test(KERN));
t('das Beispiel im Prompt zeigt beides', /gluten,milch\|1,2\|/.test(KERN));

// ---- 2. Glied 2: der Kern normalisiert -------------------------------------
t('es gibt eine Normalisierung fuer Allergene', /function normAllergene/.test(KERN));
t('und eine fuer Zusatzstoffe', /function normZusatzstoffe/.test(KERN));
t('Buchstaben von der Karte werden auf Codes abgebildet', /BUCHSTABE_ZU_CODE/.test(KERN));
t('Woerter ebenso', /WORT_ZU_CODE/.test(KERN));
t('Ziffern gelten als Zusatzstoff, Buchstaben als Allergen',
  /additives: roheCodes\.filter\(function \(x\) \{ return \/\^\\d\+\$\/\.test\(x\); \}\)/.test(KERN));

// ---- 3. Glied 3: der Import schreibt es in die Datenbank -------------------
t('der Import schreibt allergens',
  /allergens: Array\.isArray\(item\.allergens\) \? item\.allergens : \[\]/.test(CODE));
t('und additives, mit der Gerichtnummer davor',
  /additives: \(item\.dish_number \? \['nr:' \+ item\.dish_number\] : \[\]\)/.test(CODE));
t('die Spaltentypen sind hinterlegt', /allergens: 'text\[\]', additives: 'text\[\]'/.test(CODE));

// ---- 4. Glied 4: die Anzeige liest dieselben Kuerzel -----------------------
// HIER lag der Bruch. Alle Glieder waren einzeln in Ordnung, aber der Gast
// sah nichts -- die Anzeige gab es nicht.
t('es gibt einen Info-Kasten', /function gerichtInfoHtml/.test(CODE));
t('er wird von der Gerichtkarte aus geoeffnet', /openGerichtInfo\(/.test(CODE));
t('die Symbole werden aufgerufen', /getMenuBadgeIcons\(item\)/.test(CODE));

// ---- 5. DIE VERBINDUNG: gleiche Sprache auf beiden Seiten ------------------
// Der eigentliche Zweck dieses Tests. Gibt der Scanner 'milch' aus und die
// Anzeige sucht 'milk', ist jedes Glied fuer sich richtig und die Kette
// trotzdem tot.
(function () {
    var i = KERN.indexOf('ALLERGEN_CODES');
    var block = KERN.slice(i, i + 600);
    var scannerCodes = (block.match(/'([a-zäöü]+)'/g) || []).map(function (s) { return s.replace(/'/g, ''); });

    var j = CODE.indexOf('var LMIV_ALLERGENS = [');
    var lmiv = CODE.slice(j, CODE.indexOf('window.LMIV_ALLERGENS'));
    var anzeigeCodes = (lmiv.match(/code: '([a-zäöü]+)'/g) || []).map(function (s) {
        return s.replace(/code: '/, '').replace(/'/, '');
    });

    t('der Scanner kennt Allergen-Codes', scannerCodes.length >= 10, scannerCodes.length);
    t('die Anzeige kennt 14', anzeigeCodes.length === 14, anzeigeCodes.length);

    var unbekannt = scannerCodes.filter(function (c) { return anzeigeCodes.indexOf(c) < 0; });
    t('JEDER Code des Scanners ist der Anzeige bekannt',
      unbekannt.length === 0, 'unbekannt: ' + unbekannt.join(', '));

    var fehlt = anzeigeCodes.filter(function (c) { return scannerCodes.indexOf(c) < 0; });
    t('und der Scanner deckt alle 14 ab', fehlt.length === 0, 'fehlt beim Scanner: ' + fehlt.join(', '));
})();

// ---- 6. Die Zusatzstoff-Nummern passen zusammen ----------------------------
(function () {
    var i = CODE.indexOf('var ZUSATZSTOFFE = {');
    var tabelle = CODE.slice(i, CODE.indexOf('window.ZUSATZSTOFFE'));
    var nummern = (tabelle.match(/'(\d+)':/g) || []).map(function (s) { return s.replace(/[':]/g, ''); });
    t('die Anzeige kennt die Nummern 1 bis 13',
      nummern.length === 13 && nummern[0] === '1' && nummern[12] === '13', nummern.join(','));
    // Der Scanner gibt Ziffern als Zeichenketten aus -- die Tabelle muss mit
    // Zeichenketten indiziert sein, nicht mit Zahlen.
    t('und ist mit Zeichenketten indiziert, so wie der Scanner sie liefert',
      /'1': 'mit Farbstoff'/.test(tabelle));
})();

// ---- 7. Hauptzutaten: schon abgedeckt --------------------------------------
// Eine eigene Spalte waere Doppelung: der Scanner liest die Zutatenzeile
// unter dem Namen bereits in die Beschreibung.
t('der Scanner liest die Zutatenzeile in die Beschreibung',
  /Beschreibung: die Zutaten-\/Beschreibungszeile unter dem Namen/.test(KERN));
t('und der Info-Kasten zeigt sie an', /item\.description \|\| ''\)\.trim\(\)/.test(CODE));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
