// GLAS: DREI STUFEN, NICHT ZWOELF.
//
// GEMELDET WURDE
// --------------
// "unsere muss sauber sein und schoen und bei manche sachen ist es zu viel
// glass effekt guck mal bitte".
//
// WAS DAS NACHZAEHLEN ERGAB
// -------------------------
// 473 Stellen mit backdrop-filter, und darin ZWOELF verschiedene Staerken:
// 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48 Pixel. Ohne erkennbare Regel --
// dieselbe Art Element hatte mal 12, mal 24, mal 40.
//
// Das ist der Grund, warum es matschig wirkt, und nicht das Glas an sich.
// Wenn jede Flaeche unscharf ist und keine staerker als die andere, sieht
// man keine Ordnung mehr, sondern Nebel. Dazu kostet jede dieser Flaechen
// auf dem Handy Rechenzeit.
//
// Es gab sogar schon eine Marke dafuer (--glass-blur) und die Klassen
// subtle/strong/extra. Benutzt wurde die Marke an 2 von 473 Stellen.
//
// DIE STUFEN
// ----------
//   klein  6 px   Plaketten, Pillen, kleine Knoepfe
//   normal 12 px  Karten, Leisten, Kopfzeilen
//   stark  20 px  was ueber allem liegt: Dialoge, Overlays
//
// Alles zusammen 26 % weniger Unschaerfe, und nichts wurde staerker.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var H_ROH = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Kommentare unkenntlich machen, aber die Laenge behalten.
//
// Der Anlass: in einem HTML-Kommentar stand "Kein backdrop-filter: siehe
// .menu-item-card" -- eine Erklaerung, WARUM dort keiner mehr ist. Der
// Test las das als Glasflaeche ohne Safari-Zwilling und wurde rot.
//
// Ein Test, der Erklaerungen im Code bestraft, erzieht dazu, keine mehr
// zu schreiben. Also zaehlen ab jetzt nur echte Deklarationen.
//
// Ersetzt wird zeichenweise durch Leerzeichen statt herausgeschnitten:
// so bleiben alle Positionen gueltig, und die Block-Suche weiter unten
// findet weiterhin die richtigen Klammern.
function kommentareLeeren(text) {
    return text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, function (k) {
        return k.replace(/[^\n]/g, ' ');
    });
}
var H = kommentareLeeren(H_ROH);

// Nur echte backdrop-filter-Deklarationen. Die normalen filter:blur() fuer
// die Deko-Flaechen im Hintergrund gehen bis 120 px und sind ausdruecklich
// nicht gemeint -- die verwischen ein Farbfeld, nicht den Inhalt dahinter.
var ERLAUBT = [6, 12, 20];
function stufen() {
    var z = {}, re = /(?:-webkit-)?backdrop-filter\s*:\s*([^;}"']*)/g, m;
    while ((m = re.exec(H))) {
        var b = m[1].match(/blur\((\d+(?:\.\d+)?)px\)/g) || [];
        b.forEach(function (x) {
            var v = parseFloat(x.replace(/[^\d.]/g, ''));
            z[v] = (z[v] || 0) + 1;
        });
    }
    return z;
}

var Z = stufen();
var vorhanden = Object.keys(Z).map(Number).sort(function (a, b) { return a - b; });

t('es gibt ueberhaupt Glas -- sonst prueft das hier nichts',
  vorhanden.length > 0 && Object.keys(Z).reduce(function (s, k) { return s + Z[k]; }, 0) > 100,
  vorhanden.join(','));

var fremd = vorhanden.filter(function (v) { return ERLAUBT.indexOf(v) < 0; });
t('jede Glasflaeche benutzt eine der drei Stufen 6, 12 oder 20',
  fremd.length === 0,
  'fremde Staerken: ' + fremd.map(function (v) { return v + 'px (' + Z[v] + 'x)'; }).join(', '));

t('und alle drei kommen wirklich vor -- sonst waeren es in Wahrheit zwei',
  ERLAUBT.every(function (v) { return Z[v] > 0; }),
  JSON.stringify(Z));

// Keine Stufe darf ueber 20 gehen. Genau die 40er und 48er waren es, die
// den Hintergrund zu Brei gemacht haben.
t('nichts ist staerker als 20 px', Math.max.apply(null, vorhanden) <= 20,
  Math.max.apply(null, vorhanden) + 'px');

// ---- Die Marken sind hinterlegt, damit neuer Code sie nimmt ---------------
t('die drei Stufen stehen als Marke im Stilbogen',
  /--glas-klein:\s*blur\(6px\)/.test(H)
  && /--glas-normal:\s*blur\(12px\)/.test(H)
  && /--glas-stark:\s*blur\(20px\)/.test(H));
// Bewusst gegen den ROHTEXT: die Begruendung STEHT ja in einem
// Kommentar. In H sind Kommentare geleert.
t('und warum es sie gibt, steht dabei',
  /zwoelf verschiedene Staerken/.test(H_ROH));

// ---- Safari braucht den Praefix -------------------------------------------
// Auf iPhones mit aelterem iOS kennt Safari backdrop-filter nur mit
// -webkit-. Fehlt der Zwilling, ist dort schlicht kein Glas -- und weil die
// Flaeche halbdurchsichtig bleibt, steht der Text dann auf dem Hintergrund
// statt auf Milchglas. 55 Stellen hatten ihn nicht.
(function () {
    // Geprueft wird DIESELBE REGEL, nicht ein Zeichenfenster.
    //
    // Erst stand hier "schau 260 Zeichen nach links und rechts". Das hat bei
    // der minifizierten Tailwind-Zeile falsch angeschlagen: dort steht der
    // Zwilling korrekt davor, aber sein Wert ist ueber 400 Zeichen lang
    // (var(--tw-backdrop-blur) var(--tw-backdrop-brightness) ...), also lag
    // er ausserhalb des Fensters. Ein groesseres Fenster waere die falsche
    // Antwort gewesen -- dann haette es umgekehrt echte Luecken verdeckt,
    // weil irgendwo in der Naehe schon ein Zwilling steht.
    //
    // Also: Anfang und Ende des umschliessenden Blocks suchen (geschweifte
    // Klammer bei CSS, Anfuehrungszeichen bei style="..." im JS) und nur
    // darin nachsehen.
    function block(pos) {
        var a = pos, b = pos;
        while (a > 0 && '{}"\''.indexOf(H[a - 1]) < 0) a--;
        while (b < H.length && '{}"\''.indexOf(H[b]) < 0) b++;
        return H.slice(a, b);
    }
    var ohne = 0, beispiel = '';
    var re = /(?<!-webkit-)backdrop-filter\s*:/g, m;
    while ((m = re.exec(H))) {
        if (block(m.index).indexOf('-webkit-backdrop-filter') < 0) {
            ohne++;
            if (!beispiel) beispiel = H.slice(m.index - 70, m.index + 60).replace(/\n/g, ' ');
        }
    }
    t('jede Glasflaeche hat den -webkit-Zwilling fuer Safari',
      ohne === 0, ohne + ' ohne, z.B.: ' + beispiel);
})();

// ---- Die Deko-Flaechen bleiben unangetastet --------------------------------
// filter:blur() ohne "backdrop" verwischt eine eigene Farbflaeche, nicht den
// Inhalt dahinter. Die darf und soll gross sein.
t('die grossen Deko-Weichzeichner sind noch da und wurden nicht mitgeaendert',
  /(?<!backdrop-)filter:\s*blur\((?:4[08]|120)px\)/.test(H),
  'Deko-Blur verschwunden -- wurde er versehentlich mitgeaendert?');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
