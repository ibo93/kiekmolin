// JEDER WIRT SEINE FARBE -- UND NIEMAND EINEN UNLESBAREN KNOPF.
//
// Idee von Ibo am 04.09.2026: "das jeder seine eigene farbe benutzen".
//
// Die Gefahr dabei ist nicht Geschmack, sondern Lesbarkeit. Waehlt ein
// Wirt ein helles Gelb, steht weisse Schrift auf Gelb -- und der
// Bestellknopf ist weg. Der Wirt merkt es nicht: er kennt seinen Knopf
// auswendig. Der Gast sieht nur eine Seite, auf der man nichts findet.
//
// Deshalb geht JEDE Farbe durch die Kontrastpruefung (WCAG 2.1, weisse
// Schrift, mindestens 4.5:1). Und wenn wir abdunkeln, wird es GESAGT --
// stillschweigend korrigieren waere Regel 6: es saehe aus, als haette
// der Wirt bekommen, was er wollte.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

var a = h.indexOf('    var MARKE = {');
var e = h.indexOf('window.MARKE = MARKE;');
t('MARKE wurde gefunden', a > 0 && e > a, a + '/' + e);
var MARKE = new Function(h.slice(a, e) + '; return MARKE;')();

// ---- 1. Die Kontrastrechnung selbst ---------------------------------
console.log('\n-- Rechnet die Pruefung richtig? --');
// Bekannte Werte aus der WCAG-Definition.
t('Schwarz auf Weiss ist 21:1', Math.round(MARKE.kontrast('#000000', '#ffffff')) === 21,
  MARKE.kontrast('#000000', '#ffffff'));
t('Weiss auf Weiss ist 1:1', Math.round(MARKE.kontrast('#ffffff', '#ffffff')) === 1,
  MARKE.kontrast('#ffffff', '#ffffff'));
t('die Hausfarbe besteht muehelos', MARKE.kontrast('#003d33', '#ffffff') > 10,
  MARKE.kontrast('#003d33', '#ffffff'));

// ---- 2. Der Fall, um den es geht ------------------------------------
console.log('\n-- Zu helle Farben werden abgedunkelt --');
var gelb = MARKE.lesbar('#ffee00');
t('knalliges Gelb wird nicht durchgelassen', gelb.farbe !== '#ffee00', gelb.farbe);
t('und ist danach lesbar', gelb.kontrast >= 4.5, gelb.kontrast);
t('und es wird als Aenderung gemeldet', gelb.gedunkelt === true, gelb.gedunkelt);

var weiss = MARKE.lesbar('#ffffff');
t('reines Weiss ebenfalls', weiss.kontrast >= 4.5, weiss.kontrast);

// ---- 3. Wer dunkel genug ist, bleibt unangetastet --------------------
console.log('\n-- Dunkle Farben bleiben, wie sie sind --');
['#1d3557', '#8c1c13', '#6d4c1f', '#003d33'].forEach(function (f) {
    var r = MARKE.lesbar(f);
    t(f + ' bleibt unveraendert', r.farbe === f && r.gedunkelt === false, r.farbe + ' / ' + r.gedunkelt);
});

// ---- 4. Unsinn faellt auf die Hausfarbe zurueck ----------------------
console.log('\n-- Was keine Farbe ist --');
['', null, undefined, 'rot', '#12', 'javascript:alert(1)', '#00ff00; background:url(x)'].forEach(function (f) {
    var r = MARKE.lesbar(f);
    t(JSON.stringify(f) + ' -> Hausfarbe', r.farbe === MARKE.STANDARD && r.gueltig === false, r.farbe);
});
t('die Kurzform #abc wird verstanden', MARKE.hex('#abc') === '#aabbcc', MARKE.hex('#abc'));
t('und ohne Raute auch', MARKE.hex('1d3557') === '#1d3557', MARKE.hex('1d3557'));

// Nichts, was aus lesbar() kommt, darf je etwas anderes als eine
// Hex-Farbe sein -- es landet direkt in einem style-Attribut.
console.log('\n-- Nichts Fremdes kommt in den style --');
['#ffee00', 'rot', '#abc', '#00ff00; background:url(x)', '<script>', null].forEach(function (f) {
    var r = MARKE.lesbar(f);
    t('lesbar(' + JSON.stringify(f) + ') gibt reines Hex', /^#[0-9a-f]{6}$/.test(r.farbe), r.farbe);
});

// ---- 5. von() -- was die Seite wirklich benutzt ----------------------
console.log('\n-- Was die Landepage nimmt --');
t('ohne eigene Farbe die Hausfarbe', MARKE.von({}) === MARKE.STANDARD, MARKE.von({}));
t('ohne Restaurant auch', MARKE.von(null) === MARKE.STANDARD, MARKE.von(null));
t('mit eigener Farbe die eigene', MARKE.von({ brand_color: '#1d3557' }) === '#1d3557',
  MARKE.von({ brand_color: '#1d3557' }));
t('mit zu heller Farbe die abgedunkelte',
  MARKE.von({ brand_color: '#ffee00' }) !== '#ffee00', MARKE.von({ brand_color: '#ffee00' }));

// ---- 6. Der Weg durch die App ---------------------------------------
console.log('\n-- Kommt die Farbe ueberhaupt an? --');
t('brand_color steht in BEIDEN Abbildungen',
  (h.match(/brand_color: r\.brand_color \|\| null,/g) || []).length === 2,
  (h.match(/brand_color: r\.brand_color \|\| null,/g) || []).length + ' statt 2');
// DIESE ZEILE FORDERTE BIS ZUM 04.09.2026 DEN FEHLER EIN.
//
// Sie verlangte  landing.style.setProperty('--marke', _marke)  -- also
// genau die Form, die zwei Zeilen spaeter von cssText geloescht wurde.
// Der Test war gruen, waehrend die Seite grau blieb. Ein Test, der eine
// Schreibweise bewacht statt einer Wirkung, prueft nichts (Regel 5).
//
// Was wirklich zaehlt, steht weiter unten: der Abschnitt wird
// ausgefuehrt und danach nachgesehen, ob die Farbe noch da ist.
t('die Farbe wird zusammen mit dem cssText gesetzt, nicht daneben',
  /cssText = '--marke:' \+ _marke \+ ';--marke-dunkel:'/.test(h),
  'steht wieder neben dem cssText und wird geloescht');
t('und holt sie ueber MARKE.von', /var _marke = .*MARKE\.von\(rest\)/.test(h), 'nicht gefunden');
t('die Knoepfe benutzen die Variable',
  (h.match(/var\(--marke,#003d33\)/g) || []).length >= 4,
  (h.match(/var\(--marke,#003d33\)/g) || []).length);
t('gespeichert wird mit return=representation',
  /select=id,brand_color[\s\S]{0,400}return=representation/.test(h), 'nicht abgesichert');
t('das Feld wird beim Laden gefuellt', /markeEl\.value = geprueftM\.farbe/.test(h), 'fehlt');
t('es gibt die SQL-Datei dazu',
  fs.existsSync(path.join(KMI, 'datenbank', '24-markenfarbe.sql')), 'fehlt');

// ---- 7. Die Abdunklung muss sichtbar sein ---------------------------
console.log('\n-- Stille Korrektur waere der Fehler --');
t('es gibt einen Hinweiskasten', /id="markeHinweis"/.test(h), 'fehlt');
t('und eine Vorschau, die zeigt was der Gast sieht', /id="markeVorschau"/.test(h), 'fehlt');
t('der Hinweis nennt beide Farben',
  /war zu hell[\s\S]{0,200}Der Gast sieht/.test(h), 'sagt nicht, was daraus wurde');

// ---- 8. Der ausgesuchte Farbsatz ------------------------------------
console.log('\n-- Die ausgesuchten Farben --');
//
// Ibo am 04.09.2026: "a ist besser aber andere farben", danach "nimm
// mehre farben". Der Satz ist der Kern der Sache -- ein freier Waehler
// laedt zu Neonpink ein.
t('es gibt einen Farbsatz', Array.isArray(MARKE.PALETTE), typeof MARKE.PALETTE);
t('mit mindestens zehn Farben', MARKE.PALETTE.length >= 10, MARKE.PALETTE.length);

// DAS ist der Punkt: die ausgesuchten Farben duerfen NICHT erst
// abgedunkelt werden muessen. Muss eine, ist sie falsch gewaehlt.
var muessenDunkeln = MARKE.PALETTE.filter(function (f) { return MARKE.lesbar(f.farbe).gedunkelt; });
t('keine davon muss abgedunkelt werden', muessenDunkeln.length === 0,
  muessenDunkeln.map(function (f) { return f.name; }).join(', '));

MARKE.PALETTE.forEach(function (f) {
    t(f.name + ' ist reines Hex und traegt weisse Schrift',
      /^#[0-9a-f]{6}$/.test(f.farbe) && MARKE.kontrast(f.farbe, '#ffffff') >= 4.5,
      f.farbe + ' / ' + MARKE.kontrast(f.farbe, '#ffffff').toFixed(2));
});

var doppelt = MARKE.PALETTE.map(function (f) { return f.farbe; })
    .filter(function (f, i, alle) { return alle.indexOf(f) !== i; });
t('keine Farbe doppelt', doppelt.length === 0, doppelt.join(', '));
t('jede hat einen Namen', MARKE.PALETTE.every(function (f) { return f.name && f.name.length > 2; }), 'Name fehlt');

// ---- 9. Der Verlauf, der den ersten Entwurf billig aussehen liess ----
console.log('\n-- Der Verlauf in der Gericht-Kachel --');
//
// Er ging vorher IMMER von KIN-Dunkelgruen aus. Bei Gelb sah das aus wie
// Moos, bei Rot wie Rost. Das war der Grund, nicht die Farbwahl.
t('dunkler() gibt reines Hex', /^#[0-9a-f]{6}$/.test(MARKE.dunkler('#6b1220')), MARKE.dunkler('#6b1220'));
t('und ist wirklich dunkler',
  MARKE.kontrast(MARKE.dunkler('#6b1220'), '#ffffff') > MARKE.kontrast('#6b1220', '#ffffff'),
  MARKE.dunkler('#6b1220'));
t('bei Unsinn faellt es auf die Hausfarbe zurueck',
  /^#[0-9a-f]{6}$/.test(MARKE.dunkler('rot')), MARKE.dunkler('rot'));
t('Schwarz bleibt Schwarz statt negativ zu werden',
  MARKE.dunkler('#000000') === '#000000', MARKE.dunkler('#000000'));
t('die Kachel startet bei der EIGENEN Farbe, nicht bei KIN-Gruen',
  /linear-gradient\(135deg,var\(--marke-dunkel,#00251e\),var\(--marke,#003d33\)\)/.test(h),
  'startet noch bei #00251e');
t('und die dunklere Fassung gleich mit',
  /--marke-dunkel:' \+ MARKE\.dunkler\(_marke\)/.test(h), 'fehlt im cssText');

// ---- 10. Die Maske zeigt den Satz -----------------------------------
console.log('\n-- Die Auswahl im Dashboard --');
t('es gibt ein Feld fuer die Farbfelder', /id="markePalette"/.test(h), 'fehlt');
t('sie werden aus MARKE.PALETTE gebaut', /MARKE\.PALETTE\.forEach/.test(h), 'von Hand aufgezaehlt');
t('die gewaehlte Farbe ist zu erkennen', /gewaehlt \?/.test(h), 'kein Ring am gewaehlten Feld');
t('eine eigene Farbe geht weiterhin', /id="settingBrandColor"/.test(h), 'kein eigener Waehler mehr');

// ---- 11. Die Felder duerfen nie leer bleiben ------------------------
console.log('\n-- Eine leere Auswahl sieht aus wie eine kaputte --');
//
// Gemeldet am 04.09.2026: "ich gib die farben ein es passiert nichts".
// Der Ladepfad haengte an "markeEl && restaurant". Ohne Restaurant --
// Liste noch nicht da, Auswahl leer -- blieben die Farbfelder leer: eine
// Karte mit Ueberschrift und nichts darin. Man tippt hinein, nichts
// passiert, und niemand sagt warum (Regel 6).
t('die Farbfelder haengen NICHT am geladenen Restaurant',
  /var markeEl = document\.getElementById\('settingBrandColor'\);\s*\n\s*if \(markeEl\) \{/.test(h),
  'haengt noch an "markeEl && restaurant"');
t('ohne Restaurant wird die Hausfarbe genommen',
  /MARKE\.lesbar\(\(restaurant && restaurant\.brand_color\) \|\| MARKE\.STANDARD\)/.test(h),
  'wuerde bei fehlendem Restaurant stolpern');
t('und ein fehlender Farbsatz wird gemeldet, nicht verschwiegen',
  /Farben konnten nicht geladen werden/.test(h), 'stellt einen leeren Kasten hin');

// ---- 12. cssText loescht alles, was daneben gesetzt wurde ------------
console.log('\n-- Ueberlebt die Farbe den Aufbau der Seite? --');
//
// Gemeldet am 04.09.2026: "es ist alles da nur die lande page aendert
// die farbe nicht." Im Dashboard ging alles -- nur die Seite blieb
// gruen.
//
// Der Grund: die Variablen wurden mit setProperty gesetzt und zwei
// Zeilen spaeter von "landing.style.cssText = '...'" wieder geloescht.
// Eine Zuweisung an cssText ersetzt den KOMPLETTEN Inline-Stil.
//
// Ein Textvergleich haette das nie gefunden -- beide Zeilen sahen
// einzeln richtig aus. Dieser Test baut cssText so nach, wie der
// Browser es tut, und laesst den echten Abschnitt laufen.
var la = h.indexOf("var landing = document.createElement('div');");
var le = h.indexOf('landing.innerHTML =', la);
t('der Aufbau-Abschnitt wurde gefunden', la > 0 && le > la, la + '/' + le);

function styleAttrappe() {
    var eigen = {};
    var o = {
        setProperty: function (k, v) { eigen[k] = String(v); },
        getPropertyValue: function (k) { return eigen[k] || ''; }
    };
    Object.defineProperty(o, 'cssText', {
        get: function () { return o._t || ''; },
        set: function (txt) {
            // Genau das tut der Browser: alles Bisherige ist weg.
            eigen = {};
            o._t = txt;
            String(txt).split(';').forEach(function (paar) {
                var i = paar.indexOf(':');
                if (i > 0) eigen[paar.slice(0, i).trim()] = paar.slice(i + 1).trim();
            });
        }
    });
    return o;
}

var gebaut = null;
var welt2 = {
    _marke: '#6b1220',
    MARKE: MARKE,
    document: {
        createElement: function () {
            gebaut = { id: '', style: styleAttrappe(), appendChild: function () {} };
            return gebaut;
        },
        getElementById: function () { return null; },
        body: { appendChild: function () {} }
    },
    console: console
};
var vm2 = require('vm');
vm2.createContext(welt2);
try {
    vm2.runInContext(h.slice(la, le), welt2);
    t('nach dem Aufbau steht --marke noch da',
      gebaut && gebaut.style.getPropertyValue('--marke') === '#6b1220',
      gebaut ? ('"' + gebaut.style.getPropertyValue('--marke') + '"') : 'kein Element');
    t('und --marke-dunkel ebenfalls',
      gebaut && /^#[0-9a-f]{6}$/.test(gebaut.style.getPropertyValue('--marke-dunkel')),
      gebaut ? ('"' + gebaut.style.getPropertyValue('--marke-dunkel') + '"') : 'kein Element');
    t('die Grundeigenschaften stehen auch noch',
      gebaut && gebaut.style.getPropertyValue('position') === 'fixed',
      gebaut ? gebaut.style.getPropertyValue('position') : '-');
} catch (e) {
    t('nach dem Aufbau steht --marke noch da', false, e.message);
    t('und --marke-dunkel ebenfalls', false, e.message);
    t('die Grundeigenschaften stehen auch noch', false, e.message);
}

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
