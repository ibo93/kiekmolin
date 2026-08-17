// DIE SYMBOLSCHRIFT DARF NICHT "swap" LADEN.
//
// WAS ZU SEHEN WAR
// ----------------
// Beim Rendern der echten App standen in der Kopfzeile und ueber der
// Speisekarte Woerter statt Zeichen: "menu", "explore", "location_on",
// "open_in_full".
//
// WARUM
// -----
// Material Symbols ist eine Ligaturschrift. Im HTML steht wirklich das Wort
// <span class="material-symbols-outlined">location_on</span>, und erst die
// Schrift macht daraus ein Zeichen. Solange die Schrift nicht da ist, gibt
// es nichts, was das Wort ersetzt.
//
// display=swap sagt dem Browser: zeig den Text sofort in der Ersatzschrift
// und tausche spaeter. Bei einer Textschrift ist das genau richtig -- lieber
// Text in der falschen Schrift als eine leere Seite. Bei einer Symbolschrift
// ist es genau verkehrt, denn die Ersatzschrift kann die Ligatur nicht und
// schreibt den Namen aus.
//
// Verschaerft wird es dadurch, dass der Stilbogen absichtlich spaet geladen
// wird (media="print" bis onload) -- das macht die Seite schneller sichtbar
// und verlaengert zugleich genau das Fenster, in dem die Woerter dastehen.
//
// display=block: bis zu drei Sekunden gar nichts zeigen, dann tauschen. Eine
// kurz leere Stelle ist besser als "open_in_full" mitten in der Karte.
//
// Die Textschriften (Epilogue, Inter) behalten swap -- dort ist swap richtig.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Alle Schrift-Links einsammeln, samt ihrer Familien und ihres display-Werts.
var links = [];
var re = /https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s>]+/g, m;
while ((m = re.exec(H))) {
    var u = m[0];
    var d = u.match(/[?&]display=([a-z]+)/);
    links.push({
        url: u,
        symbol: /Material\+Symbols/.test(u),
        display: d ? d[1] : '(keiner)'
    });
}

t('die Schrift-Links stehen ueberhaupt in der Seite', links.length >= 2, links.length + '');

var symbol = links.filter(function (l) { return l.symbol; });
var text = links.filter(function (l) { return !l.symbol; });

// Es sind zwei: der normale Link und der in <noscript>. Beide muessen
// stimmen -- der noscript-Zwilling wurde bei frueheren Aenderungen schon
// einmal vergessen.
t('die Symbolschrift ist zweimal verlinkt (normal und im noscript)',
  symbol.length === 2, symbol.length + '');

t('die Symbolschrift laedt mit display=block, nicht mit swap',
  symbol.length > 0 && symbol.every(function (l) { return l.display === 'block'; }),
  symbol.map(function (l) { return l.display; }).join(', '));

t('die Textschriften behalten swap -- dort ist es richtig',
  text.length > 0 && text.every(function (l) { return l.display === 'swap'; }),
  text.map(function (l) { return l.display; }).join(', '));

// Ohne display-Angabe waere der Standard "auto", und der verhaelt sich in den
// meisten Browsern wie block-mit-kurzer-Frist -- aber eben nicht ueberall
// gleich. Also muss der Wert dastehen.
t('kein Schrift-Link laesst display weg',
  links.every(function (l) { return l.display !== '(keiner)'; }),
  links.filter(function (l) { return l.display === '(keiner)'; }).map(function (l) { return l.url; }).join(' '));

t('und warum block statt swap, steht als Begruendung daneben',
  /display=block, NICHT swap/.test(H) && /Ligatur/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
