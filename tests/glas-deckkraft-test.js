// GLAS: NICHT DIE UNSCHAERFE WAR ZU VIEL, SONDERN DIE DURCHSICHT.
//
// GEMELDET WURDE
// --------------
// "Das Glass Effekt ist ... aber bei manche sind Zuviel Glass es sieht zu
// durchsichtig".
//
// Das ist etwas anderes als die Beschwerde davor. Vorher ging es um die
// Staerke der Unschaerfe (siehe glas-stufen-test.js, drei Stufen 6/12/20).
// Hier geht es um die Deckkraft der Flaeche selbst: wie viel Farbe liegt
// ueberhaupt zwischen dem Hintergrund und dem Text?
//
// WAS DAS NACHMESSEN ERGAB
// ------------------------
// 28 verschiedene Alpha-Werte. Dialoge mit 20 px Unschaerfe hatten teils
// eine Flaeche von 0.04 -- also praktisch nichts. Unscharf allein reicht
// nicht: wenn hinter der Karte ein Foto liegt, bleibt das Foto hell und
// bunt, nur eben verwischt. Der Text darauf wird unlesbar, und es sieht
// nach Nebel aus statt nach Milchglas.
//
// DIE REGEL
// ---------
// Je staerker die Unschaerfe, desto dichter muss die Flaeche sein -- eine
// starke Unschaerfe kommt nur dort vor, wo etwas UEBER allem liegt, und das
// muss decken.
//
//   blur  6 px  ->  mindestens 0.55
//   blur 12 px  ->  mindestens 0.70
//   blur 20 px  ->  mindestens 0.85
//
// Angehoben wurde nur, nie gesenkt: was schon dichter war, blieb dichter.
//
// WARUM HIER AUCH DIE style="..."-STELLEN GEPRUEFT WERDEN
// -------------------------------------------------------
// Beim ersten Durchgang habe ich nur die CSS-Regeln angehoben und danach die
// echte App gerendert -- der Cookie-Banner war immer noch durchsichtig. Der
// Grund: mehr als die Haelfte aller Glasflaechen steht gar nicht im
// Stilbogen, sondern wird in JavaScript als style-Zeichenkette
// zusammengebaut. Genau deshalb zaehlt dieser Test beide Sorten getrennt und
// besteht darauf, dass von beiden etwas da ist.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var BODEN = { 6: 0.55, 12: 0.70, 20: 0.85 };

// Anfang und Ende des umschliessenden Blocks: geschweifte Klammer bei CSS,
// Anfuehrungszeichen bei style="..." im JavaScript. Dasselbe Verfahren wie in
// glas-stufen-test.js -- ein Zeichenfenster waere hier falsch, weil zwischen
// backdrop-filter und background beliebig viel stehen kann.
function block(pos) {
    var a = pos, b = pos;
    while (a > 0 && '{}"\''.indexOf(H[a - 1]) < 0) a--;
    while (b < H.length && '{}"\''.indexOf(H[b]) < 0) b++;
    return { text: H.slice(a, b), start: a, css: H[a - 1] === '{' };
}

// Alle Glasflaechen einsammeln: Stufe, Deckkraft, und woher sie kommt.
function flaechen() {
    var raus = [];
    var re = /(?<!-webkit-)backdrop-filter\s*:\s*([^;}"']*)/g, m;
    while ((m = re.exec(H))) {
        var b = m[1].match(/blur\((\d+(?:\.\d+)?)px\)/);
        if (!b) continue;                       // backdrop-filter: none
        var stufe = parseFloat(b[1]);
        var bl = block(m.index);
        var hg = bl.text.match(/background(?:-color)?\s*:\s*[^;]*/g) || [];
        hg.forEach(function (g) {
            // Verlaeufe bleiben aussen vor: dort steckt die Deckkraft in
            // mehreren Farbstopps und laesst sich nicht auf eine Zahl bringen.
            if (/gradient/.test(g)) return;
            var a = g.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/);
            if (!a) return;                     // deckende Farbe, kein Alpha
            raus.push({
                stufe: stufe,
                alpha: parseFloat(a[1]),
                css: bl.css,
                zeile: H.slice(0, bl.start).split('\n').length,
                text: bl.text.trim().slice(0, 110).replace(/\s+/g, ' ')
            });
        });
    }
    return raus;
}

var F = flaechen();

t('es gibt ueberhaupt halbdurchsichtige Glasflaechen zu pruefen',
  F.length > 250, F.length + ' gefunden');

// ---- Der Boden je Stufe ----------------------------------------------------
Object.keys(BODEN).forEach(function (s) {
    var stufe = Number(s);
    var meine = F.filter(function (f) { return f.stufe === stufe; });
    var zuduenn = meine.filter(function (f) { return f.alpha < BODEN[stufe]; });
    t('blur ' + stufe + ' px: keine Flaeche duenner als ' + BODEN[stufe]
      + ' (' + meine.length + ' Flaechen)',
      meine.length > 0 && zuduenn.length === 0,
      zuduenn.length + ' zu duenn, z.B. Zeile ' + (zuduenn[0] || {}).zeile
      + ' alpha ' + (zuduenn[0] || {}).alpha + ' :: ' + (zuduenn[0] || {}).text);
});

// ---- Beide Sorten sind wirklich abgedeckt ----------------------------------
// Ohne diese zwei Zeilen koennte der Test gruen sein, weil er die halbe App
// gar nicht anschaut -- genau der Fehler, der beim ersten Durchgang passiert
// ist.
var ausCss = F.filter(function (f) { return f.css; });
var ausJs = F.filter(function (f) { return !f.css; });
t('geprueft wurden Flaechen aus dem Stilbogen', ausCss.length > 100, ausCss.length + '');
t('und Flaechen aus style="..." im JavaScript', ausJs.length > 100, ausJs.length + '');

// ---- Nichts wurde gesenkt --------------------------------------------------
// Der Boden war eine Untergrenze, kein Sollwert. Was vorher dichter war,
// blieb dichter. Waere stattdessen stumpf "alles auf den Boden" gesetzt
// worden, laege auf jeder Stufe jede einzige Flaeche exakt auf ihrem Boden.
Object.keys(BODEN).forEach(function (s) {
    var stufe = Number(s);
    var ueber = F.filter(function (f) { return f.stufe === stufe && f.alpha > BODEN[stufe]; });
    t('blur ' + stufe + ' px: dichtere Flaechen wurden nicht auf den Boden heruntergezogen',
      ueber.length >= 10, ueber.length + ' liegen strikt ueber ' + BODEN[stufe]);
});

// ---- Und niemand hat einfach alles undurchsichtig gemacht ------------------
// Wenn jede Flaeche auf 1 stuende, waere der Glaseffekt weg -- dann koennte
// man sich das backdrop-filter auch sparen. Es muss noch etwas durchscheinen.
t('es ist noch Glas und keine Wand -- viele Flaechen liegen unter 0.9',
  F.filter(function (f) { return f.alpha < 0.9; }).length > 100,
  F.filter(function (f) { return f.alpha < 0.9; }).length + ' unter 0.9');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
