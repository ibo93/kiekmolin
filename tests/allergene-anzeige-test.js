// DIE ALLERGENE STANDEN IN DER DATENBANK UND SAH NIEMAND.
//
// GEMELDET WURDE
// --------------
// Bildschirmfotos eines anderen Bestellportals: kleine Symbole am Gericht und
// ein Info-Kasten mit "Hauptzutaten", "Zusatzstoffe und Allergene" und dem
// Spuren-Hinweis. Dazu: "Aber die Allergen Icon haben wir nicht wie bei den
// anderen die in der Speisekarte zeigt".
//
// WAS DAHINTERSTECKTE -- DREI SACHEN UEBEREINANDER
// ------------------------------------------------
// 1. Die Eingabe gab es laengst: alle 14 Pflichtallergene nach EU-Verordnung
//    1169/2011, sauber mit Kurz- und Langtext, im Dashboard anklickbar. In der
//    Gastansicht wurde davon NICHTS angezeigt -- die Gerichtkarte kannte nur
//    "Beliebt" und "Ausverkauft".
// 2. getMenuBadgeIcons() -- die Funktion fuer die Symbole -- war fertig
//    gebaut und wurde von NIRGENDWO aufgerufen. Dieselbe Familie wie die
//    Tagesangebote und die Optionsgruppen.
// 3. Selbst wenn man sie aufgerufen haette, haette sie nichts gezeigt: sie
//    fragt item.is_gluten und item.contains_wheat ab. Diese Felder gibt es in
//    den Daten nicht. Die echten Angaben stehen in item.allergens.
//
// DIE WICHTIGSTE REGEL
// --------------------
// "keine Angabe" darf niemals aussehen wie "keine Allergene". Ein leerer
// Kasten liest sich als Entwarnung. Genau daran ist der Essensfilter
// gescheitert -- dort war es aergerlich, hier waere es gefaehrlich.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    return '';
}

// Die Funktionen wirklich ausfuehren.
var lmiv = CODE.slice(CODE.indexOf('var LMIV_ALLERGENS = ['), CODE.indexOf('window.LMIV_ALLERGENS'));
var zz = CODE.slice(CODE.indexOf('var ZUSATZSTOFFE = {'), CODE.indexOf('window.ZUSATZSTOFFE'));
var F = new Function('escapeHtml',
    zz + '\n' + lmiv + '\n' + schneide('zusatzstoffeVon') + '\n' + schneide('getAllergenLabel')
    + '\n' + schneide('allergenSatz') + '\n' + schneide('gerichtInfoHtml')
    + '\n; return { zusatzstoffeVon: zusatzstoffeVon, allergenSatz: allergenSatz, gerichtInfoHtml: gerichtInfoHtml };'
)(function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); });

// ---- 1. Die Gerichtnummer darf nicht als Zusatzstoff erscheinen -----------
// additives traegt zweierlei: die Zusatzstoffe UND die Gerichtnummer als
// "nr:37". Wer das roh anzeigt, schreibt dem Gast "nr:37" unter die Allergene.
t('die Gerichtnummer wird herausgefiltert',
  F.zusatzstoffeVon({ additives: ['nr:37', '1'] }).join('|') === 'mit Farbstoff',
  F.zusatzstoffeVon({ additives: ['nr:37', '1'] }).join('|'));
t('nur eine Nummer, sonst nichts: leere Liste',
  F.zusatzstoffeVon({ additives: ['nr:12'] }).length === 0);
t('ohne additives kein Absturz', F.zusatzstoffeVon({}).length === 0 && F.zusatzstoffeVon({ additives: null }).length === 0);
t('kein Array: leere Liste', F.zusatzstoffeVon({ additives: 'kaputt' }).length === 0);

// ---- 2. Zusatzstoff-Nummern in Klartext ------------------------------------
// "1" sagt einem Gast nichts, "mit Farbstoff" schon.
t('Nummer 4 wird zum Geschmacksverstaerker',
  F.zusatzstoffeVon({ additives: ['4'] })[0] === 'mit Geschmacksverstärker');
t('Nummer 2 zum Konservierungsstoff',
  F.zusatzstoffeVon({ additives: ['2'] })[0] === 'mit Konservierungsstoff');
t('alle dreizehn sind hinterlegt',
  (zz.match(/'\d+':/g) || []).length === 13, (zz.match(/'\d+':/g) || []).length);
t('eine unbekannte Angabe wird durchgereicht statt verschluckt',
  F.zusatzstoffeVon({ additives: ['mit Sojalecithin'] })[0] === 'mit Sojalecithin');

// ---- 3. Allergene im Volltext ----------------------------------------------
t('"milch" wird zum ganzen Satz',
  F.allergenSatz('milch') === 'Enthält Milch und Erzeugnisse daraus (einschl. Laktose)',
  F.allergenSatz('milch'));
t('"gluten" ebenso', /^Enthält Glutenhaltiges Getreide$/.test(F.allergenSatz('gluten')), F.allergenSatz('gluten'));
t('ein unbekanntes Kuerzel liefert trotzdem einen Satz',
  F.allergenSatz('xyz') === 'Enthält xyz');
t('alle 14 Pflichtallergene sind hinterlegt',
  (lmiv.match(/\{ code:/g) || []).length === 14, (lmiv.match(/\{ code:/g) || []).length);

// ---- 4. DER KASTEN -- der Fall mit Angaben ---------------------------------
(function () {
    var html = F.gerichtInfoHtml({
        name: 'Zigeunerschnitzel',
        description: 'Hähnchenschnitzel mit Paprikasauce',
        allergens: ['gluten', 'milch', 'eier'],
        additives: ['nr:37', '1', '4']
    });
    t('die Beschreibung steht drin', /Hähnchenschnitzel mit Paprikasauce/.test(html));
    t('die Ueberschrift "Zusatzstoffe und Allergene" steht drin', /Zusatzstoffe und Allergene/.test(html));
    t('Weizen/Gluten im Volltext', /Enthält Glutenhaltiges Getreide/.test(html));
    t('Milch im Volltext', /Enthält Milch und Erzeugnisse daraus/.test(html));
    t('Eier im Volltext', /Enthält Eier und Erzeugnisse daraus/.test(html));
    t('Farbstoff steht dabei', /Mit Farbstoff/.test(html), html.slice(0, 300));
    t('Geschmacksverstärker ebenso', /Mit Geschmacksverstärker/.test(html));
    t('die Gerichtnummer steht NICHT im Kasten', html.indexOf('nr:37') < 0);
    t('der Spuren-Hinweis fehlt nicht', /Übergang von Spuren/.test(html));
    t('und es steht KEIN Warnkasten da, wenn Angaben vorhanden sind',
      html.indexOf('Keine Angaben hinterlegt') < 0);
})();

// ---- 5. DER KASTEN -- der gefaehrliche Fall ohne Angaben -------------------
// Hier entscheidet sich, ob der Kasten hilft oder schadet.
(function () {
    var leer = F.gerichtInfoHtml({ name: 'Pizza Margherita' });
    t('ohne Angaben steht ausdruecklich da, dass nichts vorliegt',
      /Keine Angaben hinterlegt/.test(leer), leer);
    t('und der Gast wird zum Nachfragen aufgefordert',
      /frag im Restaurant nach/.test(leer));
    t('es wird NICHT behauptet, das Gericht sei frei von Allergenen',
      !/keine Allergene/i.test(leer) && !/frei von/i.test(leer), leer);
    t('der Spuren-Hinweis steht auch hier', /Übergang von Spuren/.test(leer));

    // Gegenprobe: ein Gericht mit leerer Allergenliste ist NICHT dasselbe wie
    // eines mit Angaben. Beide muessen den Warnkasten bekommen.
    var leer2 = F.gerichtInfoHtml({ name: 'X', allergens: [], additives: ['nr:5'] });
    t('leere Liste zaehlt ebenfalls als "keine Angabe"',
      /Keine Angaben hinterlegt/.test(leer2));
})();

// ---- 6. Die Symbole haengen an echten Daten, nicht nur an Stichwoertern ----
(function () {
    var f = schneide('getMenuBadgeIcons');
    t('getMenuBadgeIcons ist gefunden worden', f.length > 500, f.length);
    t('sie liest item.allergens', /Array\.isArray\(item && item\.allergens\)/.test(f), f.slice(0, 400));

    // VEGETARISCH UND VEGAN NUR, WENN ES DRINSTEHT.
    //
    // autoDetectItemFlags setzt is_vegetarian, sobald im Namen kein
    // Fleisch-Stichwort vorkommt. Bei "Zigeunerschnitzel" kommt dabei
    // "vegetarisch" heraus. Als Symbol am Gericht ist das keine Vermutung
    // mehr, sondern eine Zusage -- und ein Vegetarier bestellt danach.
    t('vegetarisch und vegan werden VOR dem Raten festgehalten',
      f.indexOf('var _vegEcht') < f.indexOf('autoDetectItemFlags(item)')
      && f.indexOf('var _veganEcht') < f.indexOf('autoDetectItemFlags(item)'));
    t('und nur dann gezeigt', /if \(_veganEcht\)[\s\S]{0,140}else if \(_vegEcht\)/.test(f));

    // Dasselbe fuer Rind und Huhn: der Scanner liest die Merkmale r/h
    // wirklich aus der Karte, das sind Angaben. Was autoDetectItemFlags
    // daraus macht, zaehlt nicht -- "Schinken" laesst is_chicken anspringen.
    t('Rind und Huhn werden ebenfalls VOR dem Raten gemerkt',
      f.indexOf('var _rindEcht') < f.indexOf('autoDetectItemFlags(item)')
      && f.indexOf('var _huhnEcht') < f.indexOf('autoDetectItemFlags(item)'));
    t('und die Symbole haengen an der gemerkten Fassung',
      /if \(_rindEcht\) badges/.test(f) && /if \(_huhnEcht\) badges/.test(f));
    t('nach dem Raten wird kein Fleischfeld mehr abgefragt',
      f.slice(f.indexOf('autoDetectItemFlags(item)')).indexOf('item.is_beef') < 0
      && f.slice(f.indexOf('autoDetectItemFlags(item)')).indexOf('item.is_chicken') < 0);

    // ---- ALLE VIERZEHN PFLICHTALLERGENE -----------------------------------
    //
    // Vorher standen am Gericht hoechstens drei: Gluten, Milch, Nuesse. Fuer
    // die anderen elf gab es kein Symbol, also stand dort nichts -- auch
    // wenn der Wirt sie eingetragen hatte.
    t('die Allergene werden ueber LMIV_ALLERGENS durchgegangen',
      /LMIV_ALLERGENS\.forEach/.test(f), f.slice(-700));
    t('und nur gezeigt, was in item.allergens wirklich drinsteht',
      /_all\.indexOf\(a\.code\) < 0 \|\| !KIN_SYMBOLE\[a\.code\]/.test(f));
    t('die geratenen Einzelabfragen sind raus',
      f.indexOf("sym('gluten'") < 0 && f.indexOf("sym('milk'") < 0 && f.indexOf("sym('nuts'") < 0,
      'alte Einzelabfrage noch da');
    t('warum bei Allergenen NICHT geraten wird, steht dabei',
      /geratenes Symbol schlimmer als gar keines/.test(H));

    // Zu jedem der 14 Codes muss es auch ein Symbol geben -- sonst faellt
    // eines still unter den Tisch.
    (function () {
        var werkzeug = require('../tools/symbole-bauen.js');
        var codes = (lmiv.match(/code: '([a-zäöü]+)'/g) || [])
            .map(function (s) { return s.replace(/code: '/, '').replace(/'/, ''); });
        var ohne = codes.filter(function (c) { return !werkzeug.HERKUNFT[c]; });
        t('alle 14 Pflichtallergene haben ein eigenes Symbol',
          codes.length === 14 && ohne.length === 0, 'ohne Symbol: ' + ohne.join(', '));
    })();

    // KIN DESIGN: eigene Dateien, keine Fremdschrift, keine Emojis.
    t('keine Material-Symbols-Schrift mehr in den Merkmalen',
      f.indexOf('material-symbols') < 0, 'Fremdschrift gefunden');
    // sym() steht seit dem Umbau NEBEN getMenuBadgeIcons, nicht mehr darin --
    // damit auch der Info-Kasten an die Symbole kommt.
    var symf = schneide('sym');
    t('sym() steht ausserhalb von getMenuBadgeIcons',
      symf.length > 100 && f.indexOf('function sym(') < 0, symf.length);
    t('sondern die Haus-Form .ki mit eigenem SVG',
      /<span class="ki ki-sm"><svg viewBox="/.test(symf));
    t('currentColor -- die Symbole erben die Textfarbe', /fill="currentColor"/.test(symf));
    t('und es gibt ein einzelnes Symbol fuer den Info-Kasten',
      /function kinSymbol\(name, px\)/.test(CODE) && /window\.kinSymbol/.test(CODE));
    t('kein einziges Emoji im Merkmal-Code',
      !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(f), 'Emoji gefunden');
    t('jedes Symbol ist fuer Vorleseprogramme beschriftet',
      /aria-label="' \+ titel \+ '"/.test(symf));
    t('die Farbe kommt aus dem Stilbogen, nicht aus dem Code',
      /\.menu-badge \{[\s\S]{0,220}color: var\(--ink-deep\)/.test(H));
    t('kein Symbol traegt eine eigene Farbe',
      !/color:#[0-9a-f]{6}/i.test(f), (f.match(/color:#[0-9a-f]{6}/ig) || []).join(' '));
})();
// ---- 7. Und sie wird endlich AUFGERUFEN ------------------------------------
// Der Kern des Ganzen: vorher stand die Funktion da und tat nichts.
(function () {
    var aufrufe = (CODE.match(/getMenuBadgeIcons\(/g) || []).length;
    t('getMenuBadgeIcons wird nicht mehr nur definiert', aufrufe >= 2, aufrufe + ' Vorkommen');

    // Die Kartenerzeugung liegt seit dem Umbau auf Durchscroll in einer
    // eigenen Funktion -- sie hat jetzt zwei Aufrufer: die flache Liste
    // (Suche) und die Ansicht nach Kategorien.
    var i = CODE.indexOf('function gerichtKartenHtml');
    var j = CODE.indexOf('return html;', i);
    var karte = i >= 0 && j > i ? CODE.slice(i, j) : '';
    t('die Gerichtkarte ruft die Symbole auf', /getMenuBadgeIcons\(item\)/.test(karte), karte.length);
    t('und hat einen Info-Knopf', /openGerichtInfo\(/.test(karte));
    t('der Knopf oeffnet nicht versehentlich die Bestellung mit',
      /event\.stopPropagation\(\);openGerichtInfo/.test(karte));
    t('er ist fuer Vorleseprogramme beschriftet',
      /aria-label="Informationen über das Gericht"/.test(karte));
})();

// ---- 8. Der Grund steht im Quelltext ---------------------------------------
t('warum die Abfrage vorher ins Leere lief, ist festgehalten',
  /Diese Felder gibt es in den Daten nicht/.test(H));
t('und dass die Symbole Platzhalter waren, die nie jemand sah',
  /Platzhalter, die nie jemand gesehen hat/.test(H));
t('und warum ein leerer Kasten gefaehrlich waere',
  /liest sich als Entwarnung/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
