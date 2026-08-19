// Die Symbolschrift ins Projekt holen -- nur die Zeichen, die wir benutzen.
//
// WARUM
// =====
// Die App hing an fonts.googleapis.com. Bei schlechtem Netz war das der
// sichtbarste Fehler ueberhaupt: Material Symbols ist eine LIGATURSCHRIFT, im
// HTML steht wirklich das Wort <span ...>location_on</span>. Kommt die Schrift
// nicht an, schreibt der Browser das Wort hin. Der Gast liest dann "menu",
// "search", "open_in_full" -- 991 Stellen, an denen ein Zeichen stehen sollte.
//
// display=block hat nur das LADEN abgedeckt (drei Sekunden nichts zeigen,
// dann tauschen). Gegen einen Ausfall hilft es nicht: kommt die Schrift gar
// nicht, ist nach drei Sekunden trotzdem die Ersatzschrift dran.
//
// Zwei weitere Gruende, die dieselbe Loesung haben:
//   * Google Fonts direkt von Google zu laden schickt die IP jedes Gastes an
//     Google. Das ist in Deutschland abgemahnt worden (LG Muenchen I, 2022).
//   * Eine Anfrage weniger nach draussen ist eine Anfrage weniger, die auf
//     dem Handy im Funkloch haengen bleibt.
//
// WIE
// ===
// Google liefert die Schrift auf Wunsch nur mit den Zeichen, die man nennt
// (Parameter icon_names). Aus 205 benutzten Symbolen werden so 27 KB statt
// mehrerer Megabyte. Die stecken als data:-URL direkt im HTML -- keine
// zusaetzliche Anfrage, sofort da, funktioniert auch offline.
//
// Die FILL-Achse muss variabel bleiben: 81 Stellen setzen 'FILL' 1 fuer die
// ausgefuellte Fassung (gefuellter Stern, gefuelltes Herz). Mit einer festen
// Fassung waeren die alle wieder hohl.
//
// AUFRUF
// ======
//   node tools/symbolschrift-holen.js            schreibt public/fonts/ und index.html
//   node tools/symbolschrift-holen.js --pruefe   sagt nur, ob etwas fehlt
//
// Nach dem Hinzufuegen eines NEUEN Symbols im HTML muss das hier einmal
// laufen, sonst fehlt genau dieses Zeichen. tests/symbolschrift-test.js
// besteht darauf und wird sonst rot -- deshalb faellt es auf.

'use strict';
var fs = require('fs');
var path = require('path');

var WURZEL = path.join(__dirname, '..');
var HTML = path.join(WURZEL, 'index.html');
var WOFF = path.join(WURZEL, 'public', 'fonts', 'material-symbols-kin.woff2');

// Alle Symbolnamen, die im HTML wirklich vorkommen.
function benutzteSymbole(html) {
    var namen = {};
    var re = /material-symbols-outlined[^>]*>\s*([a-z0-9_]{2,})\s*</g, m;
    while ((m = re.exec(html))) namen[m[1]] = true;
    return Object.keys(namen).sort();
}

// Die Zeichen, die in der eingebetteten Schrift tatsaechlich drin sind.
// Gelesen wird die Liste aus dem Kommentar, den diese Datei selbst schreibt --
// die Namen stehen in der woff2 nicht als Klartext.
function eingebauteSymbole(html) {
    var m = html.match(/KIN-SYMBOLSCHRIFT-INHALT:\s*([a-z0-9_,]+)/);
    return m ? m[1].split(',') : [];
}

async function holeSchrift(namen) {
    var url = 'https://fonts.googleapis.com/css2'
        + '?family=' + encodeURIComponent('Material Symbols Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0')
        + '&icon_names=' + encodeURIComponent(namen.join(','))
        + '&display=block';
    // Ohne Browser-Kennung liefert Google eine aeltere Schriftform (ttf).
    var kopf = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' };
    var css = await (await fetch(url, { headers: kopf })).text();
    var treffer = css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/);
    if (!treffer) throw new Error('Keine Schrift-URL in der Antwort von Google');
    var daten = Buffer.from(await (await fetch(treffer[0], { headers: kopf })).arrayBuffer());
    if (daten.slice(0, 4).toString() !== 'wOF2') throw new Error('Das ist kein woff2');
    return daten;
}

function baueBlock(daten, namen) {
    return '    <!-- Die Symbolschrift liegt IM Projekt, nicht bei Google.\n'
        + '         Material Symbols ist eine Ligaturschrift: im HTML steht wirklich\n'
        + '         das Wort "location_on", erst die Schrift macht ein Zeichen daraus.\n'
        + '         Kommt sie nicht an, liest der Gast das Wort. Bei schlechtem Netz\n'
        + '         war genau das der sichtbarste Fehler der App.\n'
        + '         display=block deckte nur das Laden ab, nicht den Ausfall.\n'
        + '         Hier stecken nur die Zeichen, die wirklich vorkommen -- 27 KB statt\n'
        + '         mehrerer Megabyte, als data:-URL ohne eigene Anfrage. Damit ist es\n'
        + '         sofort da, funktioniert offline, und die IP des Gastes geht nicht\n'
        + '         mehr an Google (LG Muenchen I, 2022).\n'
        + '         Erzeugt von tools/symbolschrift-holen.js -- nach einem NEUEN Symbol\n'
        + '         einmal laufen lassen, sonst fehlt genau dieses Zeichen.\n'
        + '         KIN-SYMBOLSCHRIFT-INHALT: ' + namen.join(',') + ' -->\n'
        + '    <style>\n'
        + '    @font-face {\n'
        + "      font-family: 'Material Symbols Outlined';\n"
        + '      font-style: normal;\n'
        + '      font-weight: 400;\n'
        + '      font-display: block;\n'
        + "      src: url(data:font/woff2;base64," + daten.toString('base64') + ") format('woff2');\n"
        + '    }\n'
        + '    .material-symbols-outlined {\n'
        + "      font-family: 'Material Symbols Outlined';\n"
        + '      font-weight: normal;\n'
        + '      font-style: normal;\n'
        + '      font-size: 24px;\n'
        + '      line-height: 1;\n'
        + '      letter-spacing: normal;\n'
        + '      text-transform: none;\n'
        + '      display: inline-block;\n'
        + '      white-space: nowrap;\n'
        + '      word-wrap: normal;\n'
        + '      direction: ltr;\n'
        + "      -webkit-font-feature-settings: 'liga';\n"
        + '      -webkit-font-smoothing: antialiased;\n'
        + '    }\n'
        + '    </style>';
}

// Den alten Block (Kommentare + die beiden Google-Links) durch den neuen
// ersetzen -- oder, wenn schon umgestellt, den bestehenden austauschen.
function ersetze(html, block) {
    var vorhanden = /    <!-- Die Symbolschrift liegt IM Projekt[\s\S]*?<\/style>/;
    if (vorhanden.test(html)) return html.replace(vorhanden, block);

    var alt = /    <!-- Material Symbols Outlined[\s\S]*?<noscript><link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Material\+Symbols[^>]*><\/noscript>/;
    if (!alt.test(html)) throw new Error('Der alte Schrift-Block war nicht zu finden');
    return html.replace(alt, block);
}

async function haupt() {
    var nurPruefen = process.argv.indexOf('--pruefe') >= 0;
    var html = fs.readFileSync(HTML, 'utf8');
    var namen = benutzteSymbole(html);
    var drin = eingebauteSymbole(html);
    var fehlend = namen.filter(function (x) { return drin.indexOf(x) < 0; });
    var ueberzaehlig = drin.filter(function (x) { return namen.indexOf(x) < 0; });

    console.log('benutzt: ' + namen.length + ', eingebaut: ' + drin.length
        + ', fehlt: ' + fehlend.length + ', ueberfluessig: ' + ueberzaehlig.length);
    if (fehlend.length) console.log('  fehlt: ' + fehlend.join(', '));
    if (ueberzaehlig.length) console.log('  ueberfluessig: ' + ueberzaehlig.join(', '));

    if (nurPruefen) {
        process.exit(fehlend.length ? 1 : 0);
    }

    var daten = await holeSchrift(namen);
    fs.mkdirSync(path.dirname(WOFF), { recursive: true });
    fs.writeFileSync(WOFF, daten);
    fs.writeFileSync(HTML, ersetze(html, baueBlock(daten, namen)));
    console.log('geschrieben: ' + (daten.length / 1024).toFixed(0) + ' KB Schrift, '
        + namen.length + ' Zeichen, eingebettet in index.html');
}

if (require.main === module) haupt().catch(function (e) { console.error(e.message); process.exit(1); });
module.exports = { benutzteSymbole: benutzteSymbole, eingebauteSymbole: eingebauteSymbole, baueBlock: baueBlock, ersetze: ersetze };
