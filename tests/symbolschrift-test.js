// DIE SYMBOLSCHRIFT LIEGT IM PROJEKT, NICHT BEI GOOGLE.
//
// GEMELDET WURDE
// --------------
// "die App laedt so komisch ab und zu wenn kein gutes Internet ist".
//
// Nachgestellt: Seite ueber einen lokalen Server geladen, alles nach draussen
// gekappt. Ergebnis: ueberall stehen Woerter statt Zeichen -- "menu",
// "search", "location_on", "open_in_full". Das ist der sichtbarste Fehler,
// den die App hat, und er trifft genau die Gaeste mit schlechtem Empfang.
//
// WARUM DAS PASSIERT
// ------------------
// Material Symbols ist eine LIGATURSCHRIFT. Im HTML steht wirklich das Wort:
//     <span class="material-symbols-outlined">location_on</span>
// Erst die Schrift macht daraus ein Zeichen. Kommt sie nicht an, schreibt der
// Browser das Wort hin -- an 991 Stellen.
//
// WARUM display=block NICHT GEREICHT HAT
// ---------------------------------------
// Davor stand hier die Regel "display=block statt swap". Die war richtig und
// hat das LADEN abgedeckt: drei Sekunden nichts zeigen statt sofort die
// Ersatzschrift. Gegen den AUSFALL hilft sie nicht -- kommt die Schrift gar
// nicht, ist nach drei Sekunden trotzdem die Ersatzschrift dran und die
// Woerter stehen da. Deshalb loest erst das Selbst-Ausliefern das Problem.
//
// WIE
// ---
// tools/symbolschrift-holen.js holt bei Google nur die 205 Zeichen, die
// wirklich vorkommen (27 KB statt mehrerer Megabyte) und legt sie als
// data:-URL in den Stilbogen. Keine eigene Anfrage, sofort da, funktioniert
// offline -- und die IP des Gastes geht nicht mehr an Google (das ist in
// Deutschland abgemahnt worden, LG Muenchen I 2022).
//
// DIE FALLE, DIE DIESER TEST BEWACHT
// -----------------------------------
// Wer ein NEUES Symbol ins HTML schreibt und das Werkzeug nicht laufen laesst,
// bekommt genau an dieser einen Stelle wieder ein Wort. Nichts stuerzt ab,
// nichts faellt auf -- bis ein Gast es sieht. Deshalb vergleicht der Test
// unten Zeichen fuer Zeichen, was benutzt wird, mit dem, was drin ist.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var WZ = require(path.join(WURZEL, 'tools', 'symbolschrift-holen.js'));

// ---- 1. Keine Symbolschrift mehr von Google --------------------------------
(function () {
    var links = [];
    var re = /https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s>]+/g, m;
    while ((m = re.exec(H))) links.push(m[0]);

    t('es gibt ueberhaupt noch Schrift-Links (die Textschriften)', links.length >= 2, links.length + '');
    t('aber keinen mehr fuer die Symbolschrift',
      links.filter(function (l) { return /Material\+Symbols/.test(l); }).length === 0,
      links.filter(function (l) { return /Material\+Symbols/.test(l); }).join(' '));

    // Die Textschriften duerfen weiter von Google kommen und sollen swap
    // behalten: bei einer TEXTschrift ist "zeig sofort die Ersatzschrift"
    // richtig -- lieber Text in der falschen Schrift als gar kein Text.
    // Faellt Google aus, liest der Gast trotzdem alles, nur anders gesetzt.
    var text = links.filter(function (l) { return !/Material\+Symbols/.test(l); });
    t('die Textschriften behalten swap -- dort ist swap das Richtige',
      text.length > 0 && text.every(function (l) { return /[?&]display=swap/.test(l); }),
      text.join(' '));
})();

// ---- 2. Die Schrift steckt wirklich in der Seite ---------------------------
(function () {
    t('es gibt eine @font-face-Regel fuer Material Symbols',
      /@font-face\s*\{[^}]*font-family:\s*'Material Symbols Outlined'/.test(H));
    t('und die Schrift liegt als data:-URL drin, nicht als Adresse nach draussen',
      /src:\s*url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{5000,}\)\s*format\('woff2'\)/.test(H));
    t('mit font-display: block -- waehrend des Aufbaus lieber nichts als das Wort',
      /@font-face\s*\{[^}]*font-display:\s*block/.test(H));

    // Ohne diese Klasse waere die Schrift zwar geladen, aber niemand benutzt
    // sie: die Regeln kamen frueher aus dem Stilbogen von Google mit.
    t('die Klasse material-symbols-outlined setzt die Schriftfamilie',
      /\.material-symbols-outlined\s*\{[^}]*font-family:\s*'Material Symbols Outlined'/.test(H));
    t('und schaltet die Ligaturen ein -- ohne sie bleibt es Text',
      /\.material-symbols-outlined\s*\{[^}]*font-feature-settings:\s*'liga'/.test(H));
})();

// ---- 3. Die Datei liegt auch einzeln im Projekt ----------------------------
// Die data:-URL ist die, die zaehlt. Die Datei daneben ist der Beleg, woraus
// sie gemacht wurde -- sonst steht da ein Block Base64, den niemand mehr
// nachvollziehen kann.
(function () {
    var woff = path.join(WURZEL, 'public', 'fonts', 'material-symbols-kin.woff2');
    t('die Schriftdatei liegt im Projekt', fs.existsSync(woff));
    if (fs.existsSync(woff)) {
        var d = fs.readFileSync(woff);
        t('und ist wirklich eine woff2', d.slice(0, 4).toString() === 'wOF2', d.slice(0, 4).toString());
        t('sie ist klein genug, um sie einzubetten (unter 60 KB)',
          d.length < 60000, Math.round(d.length / 1024) + ' KB');
    }
    t('das Werkzeug zum Erneuern ist da',
      fs.existsSync(path.join(WURZEL, 'tools', 'symbolschrift-holen.js')));
})();

// ---- 4. DIE WICHTIGE PRUEFUNG: kein benutztes Zeichen fehlt ----------------
// Wer ein neues Symbol einbaut und das Werkzeug nicht laufen laesst, bekommt
// an dieser Stelle wieder ein Wort. Nichts stuerzt ab -- deshalb muss es hier
// auffallen.
(function () {
    var benutzt = WZ.benutzteSymbole(H);
    var drin = WZ.eingebauteSymbole(H);

    t('die Liste der eingebauten Zeichen steht in der Seite', drin.length > 100, drin.length + '');
    t('es werden ueberhaupt Symbole benutzt', benutzt.length > 100, benutzt.length + '');

    var fehlt = benutzt.filter(function (x) { return drin.indexOf(x) < 0; });
    t('jedes benutzte Symbol ist auch in der Schrift drin',
      fehlt.length === 0,
      fehlt.length + ' fehlen: ' + fehlt.slice(0, 12).join(', ')
      + '  --> node tools/symbolschrift-holen.js');

    // Andersherum ist es kein Fehler, nur Ballast: ein Zeichen, das niemand
    // mehr benutzt, macht die Schrift ein paar Byte groesser.
    var ueber = drin.filter(function (x) { return benutzt.indexOf(x) < 0; });
    t('und es schleppt hoechstens eine Handvoll ungenutzter Zeichen mit',
      ueber.length <= 10, ueber.length + ' ungenutzt: ' + ueber.slice(0, 12).join(', '));
})();

// ---- 5. Warum das so ist, steht dabei --------------------------------------
t('im HTML steht, warum die Schrift nicht mehr von Google kommt',
  /Ligaturschrift/.test(H) && /schlechtem Netz/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
