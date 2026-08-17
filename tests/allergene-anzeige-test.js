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
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
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
    t('sie liest jetzt item.allergens', /Array\.isArray\(item && item\.allergens\)/.test(f), f.slice(0, 400));
    t('eingetragenes Gluten setzt das Merkmal', /item\.is_gluten = true/.test(f), f.slice(0, 600));
    t('und hebt "glutenfrei" wieder auf -- beides zugleich waere Unsinn',
      /item\.is_gluten = true; item\.is_gluten_free = false/.test(f));
    t('dasselbe fuer Milch und laktosefrei',
      /item\.is_milk = true; item\.is_lactose_free = false/.test(f));
    t('eingetragene Nuesse ebenso -- Erdnuss zaehlt mit',
      /indexOf\('schalenfruechte'\) >= 0 \|\| _all\.indexOf\('erdnuss'\) >= 0\) item\.is_nuts = true/.test(f));

    // Die falschen Platzhalter-Symbole duerfen nicht zurueckkommen.
    t('"Scharf" ist kein Personen-Symbol mehr', !/badgeSpicy[\s\S]{0,200}>person</.test(f), 'person gefunden');
    t('"Huhn" als Lupe ist weg', f.indexOf('>search<') < 0);
    t('"Rind" als Thermometer ist weg', f.indexOf('>thermostat<') < 0);
    t('"Fisch" als Auge ist weg', f.indexOf('>visibility<') < 0);
    t('"Alkohol" als Download-Pfeil ist weg', f.indexOf('>download<') < 0);
    t('"Vegan" als Keks ist weg', f.indexOf('>cookie<') < 0);
    t('scharf hat ein eigenes Symbol', /'scharf'\)/.test(f) && /scharf:\s+'<path/.test(f));
    t('vegan ebenso', /'vegan'\)/.test(f) && /vegan:\s+'<path/.test(f));

    // FLEISCH UND FISCH: EINGETRAGEN JA, GERATEN NEIN.
    //
    // Frueher stand hier, die Fleischarten seien ganz raus. Das war zu grob.
    // Der Scanner liest die Merkmale r/h/f aus der Karte -- das sind Angaben
    // des Wirts, keine Vermutungen, und die duerfen gezeigt werden.
    //
    // Die Gefahr ist eine andere: autoDetectItemFlags raet dieselben Felder
    // aus dem Namen und laesst bei "Schinkenschnitzel" is_chicken anspringen
    // ("hähn" nicht, aber die Wortliste ist grob). Wird NACH dem Raten
    // gelesen, steht am Schnitzel ein Huhn.
    //
    // Also: gelesen wird VORHER, und das Symbol haengt an der vorher
    // gemerkten Fassung.
    t('Rind, Huhn und Fisch werden VOR dem Raten gemerkt',
      f.indexOf('var _rindEcht') < f.indexOf('autoDetectItemFlags(item)')
      && f.indexOf('var _huhnEcht') < f.indexOf('autoDetectItemFlags(item)')
      && f.indexOf('var _fischEcht') < f.indexOf('autoDetectItemFlags(item)'),
      'nach dem Raten gelesen');
    t('und die Symbole haengen an der gemerkten Fassung, nicht am geratenen Feld',
      /if \(_rindEcht\) badges/.test(f) && /if \(_huhnEcht\) badges/.test(f)
      && /if \(_fischEcht\) badges/.test(f),
      'Symbol haengt am geratenen Feld');
    t('nirgends wird item.is_beef NACH dem Raten abgefragt',
      f.slice(f.indexOf('autoDetectItemFlags(item)')).indexOf('item.is_beef') < 0
      && f.slice(f.indexOf('autoDetectItemFlags(item)')).indexOf('item.is_chicken') < 0,
      'geratenes Fleischfeld wird noch gelesen');
    t('Lamm und Schwein bleiben draussen -- die liest der Scanner zwar, aber '
      + 'ein eigenes Symbol dafuer waere nur noch Gedraenge',
      f.indexOf('is_lamb') < 0 && f.indexOf('is_pork') < 0);
    t('Fisch gilt auch als eingetragen, wenn er im Pflichtallergen steht',
      /_all\.indexOf\('fisch'\) >= 0\) _fischEcht = true/.test(f));
    t('die drei neuen Symbole sind gezeichnet, nicht leer',
      /rind:\s+'<path/.test(f) && /huhn:\s+'<path/.test(f) && /fisch:\s+'<path/.test(f));
    t('vegan und vegetarisch schliessen sich aus -- nicht beide Symbole',
      /if \(_veganEcht\)[\s\S]{0,140}else if \(_vegEcht\)/.test(f));

    // SCHLICHT: eine Farbe, duenne Linie, kein Kasten. Die bunten
    // Signalfarben zogen mehr Aufmerksamkeit als der Gerichtname, und Rot
    // liest sich als Warnung, wo nur "enthaelt Gluten" gemeint ist.
    t('kein Symbol traegt mehr eine eigene Farbe',
      !/color:#[0-9a-f]{6}/i.test(f), (f.match(/color:#[0-9a-f]{6}/ig) || []).join(' '));
    t('insbesondere kein Rot mehr', !/#dc2626|#b91c1c|#ea580c/i.test(f));
    t('die Farbe kommt aus dem Stilbogen, nicht aus dem Code',
      /\.menu-badge \{[\s\S]{0,220}color: var\(--ink-deep\)/.test(H));
    t('die Pastellkaesten hinter den Symbolen sind weg',
      !/\.menu-badge\.(popular|vegan|gluten|fish) \{/.test(H), 'Kasten-Regel gefunden');
    t('jedes Symbol ist auch fuer Vorleseprogramme beschriftet',
      /aria-label="' \+ titel \+ '"/.test(f));

    // KIN DESIGN: eigene Formen, keine Fremdschrift, keine Emojis.
    t('keine Material-Symbols-Schrift mehr in den Merkmalen',
      f.indexOf('material-symbols') < 0, 'Fremdschrift gefunden');
    t('sondern die Haus-Form .ki mit eigenem SVG',
      /<span class="ki ki-sm"><svg viewBox="/.test(f));
    t('currentColor -- die Symbole erben die Textfarbe',
      /fill="currentColor"/.test(f) && /stroke="currentColor"/.test(f));
    t('runde Enden wie im Hausstil', /stroke-linecap="round"/.test(f));

    // GEFUELLTE FLAECHEN, KEINE UMRISSE.
    //
    // Hier stand vorher das Gegenteil ("kein fill, also reine Linien"). Der
    // Test war nicht falsch -- die Entscheidung war es. Umrisse sehen bei
    // 72 Pixeln gut aus und fallen bei 15 auseinander, und am Gericht stehen
    // sie genau in dieser Groesse. Eine Flaeche kann nicht zulaufen.
    t('die Symbole sind gefuellt, nicht nur umrandet',
      /fill="currentColor"/.test(f) && f.indexOf('fill="none"') < 0,
      'noch ein Umriss');
    t('die Kontur ist duenn -- sie rundet nur die Ecken ab',
      /stroke-width="0\.8"/.test(f), (f.match(/stroke-width="[\d.]+"/) || [])[0]);

    // evenodd ist die Voraussetzung dafuer, dass Auge, Nuestern und
    // Kaeseloecher Loecher sind und nicht zweite schwarze Flecken.
    t('fill-rule evenodd ist gesetzt', /fill-rule="evenodd"/.test(f));
    // Kommentare stehen nur in der Rohdatei -- CODE ist von ihnen befreit.
    t('und warum, steht dabei', /zu Loechern statt zu zweiten schwarzen Flecken/.test(H));

    // DIE ZWEI REGELN, an denen sich beim Aendern alles entscheidet. Wer sie
    // nicht kennt, baut sich mit dem naechsten Symbol einen schwarzen Fleck
    // oder ein Loch an der falschen Stelle.
    (function () {
        function block(name) {
            var i = f.indexOf('\n        ' + name + ':');
            if (i < 0) return '';
            var j = f.indexOf("',\n", i);
            return f.slice(i, j < 0 ? f.indexOf('\n    };', i) : j);
        }
        // Regel 1: Loecher im SELBEN Pfad wie die Flaeche.
        //
        // Strukturell geprueft, nicht ueber Koordinaten. Eine frueherere
        // Fassung hielt hier die Pfaddaten fest ("M8 6.4...M10.2 9.15...").
        // Das ging bei der naechsten Umzeichnung kaputt, ohne je einen
        // echten Fehler gefunden zu haben -- ein Test, der nur meldet, dass
        // sich etwas geaendert hat, kostet Zeit und sagt nichts.
        //
        // Woran man ein Loch wirklich erkennt: im selben d="..." steht nach
        // der Flaeche ein zweites M, das einen geschlossenen Kreis zieht.
        function ersterPfad(name) {
            var b = block(name);
            var i = b.indexOf(' d="');
            return i < 0 ? '' : b.slice(i + 4, b.indexOf('"', i + 4));
        }
        [['rind', 4], ['huhn', 1], ['milch', 3], ['fisch', 1], ['nuesse', 2]]
        .forEach(function (paar) {
            var d = ersterPfad(paar[0]);
            var teile = (d.match(/M/g) || []).length - 1;   // erstes M = die Flaeche
            t(paar[0] + ': die ' + paar[1] + ' Loecher stecken im selben Pfad wie die '
              + 'Flaeche -- als eigener Pfad waeren es schwarze Flecken',
              teile === paar[1], teile + ' statt ' + paar[1]);
        });

        // Regel 2: Was sich UEBERLAPPT, muss getrennte Pfade sein -- sonst
        // macht evenodd aus der Ueberlappung ein Loch.
        t('Ohren und Hoerner des Rinds sind eigene Pfade',
          (block('rind').match(/<path /g) || []).length === 5,
          (block('rind').match(/<path /g) || []).length + ' Pfade');
        t('und die Kammkreise des Huhns ebenso',
          (block('huhn').match(/<path /g) || []).length === 6,
          (block('huhn').match(/<path /g) || []).length + ' Pfade');
        t('und der Grund dafuer ist festgehalten',
          /machte evenodd aus\s*\n?\s*(\/\/ )?jeder Ueberlappung ein Loch/.test(H));
    })();
    // Jedes Symbol, das ausgegeben werden kann, muss auch gezeichnet sein --
    // sonst kommt ein leeres Kaestchen heraus. Deshalb nicht nur zaehlen,
    // sondern jeden Namen aus sym(..., 'name') gegen die Tabelle halten.
    (function () {
        var GEZEICHNET = (f.match(/^\s+([a-zäöü]+):\s+'</gm) || [])
            .map(function (s) { return s.trim().replace(/:.*$/, ''); });
        t('elf eigene Symbole sind hinterlegt',
          GEZEICHNET.length === 11, GEZEICHNET.join(','));
        var BENUTZT = (f.match(/, '([a-zäöü]+)'\);/g) || [])
            .map(function (s) { return s.replace(/^, '/, '').replace(/'\);$/, ''); });
        var ohne = BENUTZT.filter(function (x) { return GEZEICHNET.indexOf(x) < 0; });
        t('jedes ausgegebene Symbol ist auch gezeichnet -- sonst leeres Kaestchen',
          BENUTZT.length >= 11 && ohne.length === 0,
          'benutzt: ' + BENUTZT.length + ', ohne Zeichnung: ' + ohne.join(','));
    })();
    t('kein einziges Emoji im Merkmal-Code',
      !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(f), 'Emoji gefunden');

    // Geratenes "vegetarisch" ist eine Zusage, keine Vermutung.
    t('vegetarisch und vegan werden VOR dem Raten festgehalten',
      /_vegEcht = !!\(item && \(item\.is_vegetarian \|\| item\.vegetarian\)\)/.test(f)
      && f.indexOf('_vegEcht') < f.indexOf('autoDetectItemFlags(item)'));
    t('und nur dann gezeigt', /if \(_veganEcht\)[\s\S]{0,120}else if \(_vegEcht\)/.test(f));

    // Wirklich ausfuehren: ein Schnitzel ohne Angabe darf NICHT
    // vegetarisch heissen, nur weil kein Fleisch-Stichwort im Namen steht.
    (function () {
        var lauf = new Function('currentLanguage', 'translations',
            schneide('autoDetectItemFlags') + schneide('getMenuBadgeIcons') + '; return getMenuBadgeIcons;'
        )('de', { de: {} });
        t('ein Schnitzel ohne Angabe bekommt KEIN vegetarisch-Symbol',
          lauf({ name: 'Zigeunerschnitzel' }).indexOf('vegetarian') < 0,
          lauf({ name: 'Zigeunerschnitzel' }));
        t('mit eingetragenem is_vegetarian erscheint es',
          lauf({ name: 'Pizza Verdura', is_vegetarian: true }).indexOf('vegetarian') >= 0);
        t('vegan schlaegt vegetarisch',
          (function () {
              var h = lauf({ name: 'Falafel', is_vegetarian: true, is_vegan: true });
              return h.indexOf('vegan') >= 0 && h.indexOf('vegetarian') < 0;
          })());
    })();
})();

// ---- 7. Und sie wird endlich AUFGERUFEN ------------------------------------
// Der Kern des Ganzen: vorher stand die Funktion da und tat nichts.
(function () {
    var aufrufe = (CODE.match(/getMenuBadgeIcons\(/g) || []).length;
    t('getMenuBadgeIcons wird nicht mehr nur definiert', aufrufe >= 2, aufrufe + ' Vorkommen');

    var i = CODE.indexOf('function renderMenuItemsForGuest');
    var j = CODE.indexOf("container.innerHTML = html;", i);
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
