// PASSEN DIE SYMBOLE IN index.html NOCH ZU DEN SVG-DATEIEN?
//
// WIE ES DAZU KAM
// ---------------
// Die Merkmal-Symbole waren erst Google-Schrift, dann von Hand im Code
// gezeichnet, und beides war nicht gut genug ("die icon sehen nicht gut
// aus"). Jetzt kommen sie aus echten SVG-Dateien unter
// public/icons/allergens/ -- gezeichnet von Ibo, seine eigenen.
//
// Damit gibt es die Sache aber an ZWEI Orten: als Datei und, umgerechnet,
// inline in index.html. Zwei Orte fuer dasselbe laufen auseinander. Wer eine
// Datei aendert und tools/symbole-bauen.js vergisst, sieht in der App die
// alte Fassung -- nichts stuerzt ab, nichts sieht im Code falsch aus.
//
// Deshalb rechnet dieser Test die Umrechnung nach und vergleicht sie mit
// dem, was wirklich in index.html steht.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var werkzeug = require(path.join(WURZEL, 'tools', 'symbole-bauen.js'));

function tabelle(name) {
    var i = H.indexOf('    var ' + name + ' = {');
    if (i < 0) return null;
    var j = H.indexOf('\n    };', i);
    return new Function(H.slice(i, j + 7) + '\n return ' + name + ';')();
}

var SYM = tabelle('KIN_SYMBOLE');
var RAHMEN = tabelle('KIN_RAHMEN');
t('die Symboltabelle steht in index.html', !!SYM);
t('die Ausschnitt-Tabelle auch', !!RAHMEN);
if (!SYM || !RAHMEN) { console.log('\nAbbruch.'); process.exit(1); }

// ---- 1. Jede Quelldatei ist da ---------------------------------------------
var fehlend = Object.keys(werkzeug.HERKUNFT).filter(function (k) {
    return !fs.existsSync(path.join(WURZEL, 'public', 'icons', 'allergens', werkzeug.HERKUNFT[k]));
});
t('zu jedem Symbol gibt es eine SVG-Datei', fehlend.length === 0, fehlend.join(', '));

// ---- 2. DER KERN: erzeugt == eingebaut --------------------------------------
var frisch = werkzeug.baue();
var namen = Object.keys(frisch.symbole);

t('gleich viele Symbole wie Quelldateien',
  Object.keys(SYM).length === namen.length,
  Object.keys(SYM).length + ' eingebaut, ' + namen.length + ' Dateien');

var abweichend = namen.filter(function (k) { return SYM[k] !== frisch.symbole[k]; });
t('jedes Symbol in index.html entspricht seiner Datei',
  abweichend.length === 0,
  abweichend.join(', ') + '  -- Datei geaendert? node tools/symbole-bauen.js');

var rahmenAb = namen.filter(function (k) { return RAHMEN[k] !== frisch.rahmen[k]; });
t('und jeder Ausschnitt ist neu berechnet',
  rahmenAb.length === 0,
  rahmenAb.map(function (k) { return k + ': ' + RAHMEN[k] + ' statt ' + frisch.rahmen[k]; }).join('; '));

// ---- 3. Weiss ist zu Loch geworden -----------------------------------------
// Der eigentliche Grund, warum ueberhaupt umgerechnet wird. In den Dateien
// sind Augen und Nuestern weisse Formen; die App hat einen Dunkelmodus, dort
// staenden weisse Punkte auf dunklem Grund.
(function () {
    var mitWeiss = namen.filter(function (k) {
        var roh = fs.readFileSync(path.join(WURZEL, 'public', 'icons', 'allergens',
                                            werkzeug.HERKUNFT[k]), 'utf8');
        return /(fill|stroke)="#fff"/i.test(roh);
    });
    t('es gibt Symbole mit weissen Teilen -- sonst prueft das hier nichts',
      mitWeiss.length > 5, mitWeiss.length);
    var ohneMaske = mitWeiss.filter(function (k) { return SYM[k].indexOf('<mask') < 0; });
    t('jedes davon bekommt eine Maske', ohneMaske.length === 0, ohneMaske.join(', '));
    var nochWeiss = namen.filter(function (k) {
        // Weiss darf nur noch IN der Maske stehen (dort heisst es "sichtbar"),
        // niemals im gezeichneten Teil.
        var i = SYM[k].indexOf('</mask>');
        return /(fill|stroke)="#fff"/i.test(i < 0 ? SYM[k] : SYM[k].slice(i));
    });
    t('im gezeichneten Teil steht nirgends mehr Weiss -- sonst waere es im '
      + 'Dunkelmodus ein weisser Fleck', nochWeiss.length === 0, nochWeiss.join(', '));
})();

// ---- 4. Die Reihenfolge des Uebermalens bleibt erhalten --------------------
// Beim Rind liegen die Nuestern INNERHALB des weissen Muffels. Wer nur die
// weissen Teile in die Maske schreibt, loescht die Punkte mit weg.
(function () {
    var m = /<mask[^>]*>([\s\S]*?)<\/mask>/.exec(SYM.rind || '');
    t('die Maske des Rinds ist da', !!m);
    if (!m) return;
    var inhalt = m[1];
    t('der Muffel deckt zu (schwarz in der Maske)',
      /<ellipse cx="32" cy="47"[^>]*fill="#000"/.test(inhalt), inhalt);
    t('die Nuestern holen sich die Flaeche zurueck (weiss in der Maske) -- '
      + 'genau daran ist die erste Fassung gescheitert',
      (inhalt.match(/<circle cx="(28|36)" cy="47"[^>]*fill="#fff"/g) || []).length === 2,
      inhalt);
    t('und sie werden auch wirklich gezeichnet',
      (SYM.rind.slice(SYM.rind.indexOf('</mask>')).match(/<circle cx="(28|36)" cy="47"/g) || []).length === 2);
})();

// ---- 5. Kein doppeltes Attribut ---------------------------------------------
// Eine frueherere Fassung liess die alten Mal-Angaben stehen und haengte die
// neuen an: <path stroke-width="4" ... stroke-width="4">. Das ist ungueltiges
// XML, und der Browser hat das ganze Symbol verweigert.
(function () {
    var kaputt = [];
    namen.forEach(function (k) {
        (SYM[k].match(/<[a-z]+\b[^>]*>/g) || []).forEach(function (el) {
            var seen = {}, re = /([a-zA-Z-]+)\s*=\s*"/g, m2;
            while ((m2 = re.exec(el))) { if (seen[m2[1]]) kaputt.push(k + ': ' + m2[1]); seen[m2[1]] = 1; }
        });
    });
    t('kein Attribut steht zweimal im selben Element', kaputt.length === 0, kaputt.join(', '));
})();

// ---- 6. Alle gleich gross und mittig ---------------------------------------
(function () {
    var schief = [], unrund = [];
    namen.forEach(function (k) {
        var r = RAHMEN[k].trim().split(/\s+/).map(Number);
        if (r.length !== 4 || r.some(isNaN)) { unrund.push(k); return; }
        if (Math.abs(r[2] - r[3]) > 0.01) schief.push(k + ' ' + r[2] + 'x' + r[3]);
    });
    t('jeder Ausschnitt ist lesbar', unrund.length === 0, unrund.join(', '));
    t('und quadratisch -- sonst verzerrt er die Zeichnung', schief.length === 0, schief.join(', '));
    t('die Zeichnung fuellt ueberall denselben Anteil',
      werkzeug.ANTEIL > 0.8 && werkzeug.ANTEIL < 1, werkzeug.ANTEIL);
})();

// ---- 7. Der Einbau benutzt beides -------------------------------------------
t('sym() setzt den Ausschnitt des Symbols ein',
  /viewBox="' \+ \(KIN_RAHMEN\[form\] \|\| '0 0 64 64'\) \+ '"/.test(H));
t('sym() legt KEINE eigene Kontur mehr darueber -- die Zeichnungen bringen '
  + 'ihre eigene mit',
  !/stroke-width="0\.8"/.test(H), 'alte Kontur noch da');
(function () {
    var i = H.indexOf('function sym(klasse');
    // Kommentare raus -- der Kommentar in sym() ERKLAERT, warum dort kein
    // fill-rule mehr steht, und wuerde sonst selbst als Treffer zaehlen.
    var rumpf = H.slice(i, H.indexOf('\n    }', i)).replace(/^[ \t]*\/\/.*$/gm, '');
    t('und kein fill-rule, das aus jeder Ueberlappung ein Loch machen wuerde',
      rumpf.indexOf('fill-rule') < 0, rumpf.slice(0, 200));
})();
t('ein unbekannter Name liefert nichts statt eines leeren Kaestchens',
  /if \(!KIN_SYMBOLE\[form\]\) return '';/.test(H));
t('warum das Werkzeug existiert, steht darin',
  /Zwei Orte fuer dieselbe Sache laufen auseinander/.test(
      fs.readFileSync(path.join(WURZEL, 'tools', 'symbole-bauen.js'), 'utf8')));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
