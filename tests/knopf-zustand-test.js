// EIN INLINE-STIL SCHLAEGT JEDE ZUSTANDSKLASSE.
//
// GEMELDET WURDE
// --------------
// "Wenn es auf abholen ist es gut übersichtlich der Button, wenn ich auf
//  Lieferung drücke sieht man den Button nicht" -- mit zwei Bildschirmfotos.
//
// WAS PASSIERT WAR
// ----------------
// setOrderType() schaltet nur die Klasse "active" um. Die CSS-Regeln dafuer
// waren vollstaendig und richtig:
//     .order-type-btn        { background: rgba(0,61,51,0.05); opacity: .6 }
//     .order-type-btn.active { background: #003d33; color: white; opacity: 1 }
//     .order-type-btn .material-symbols-outlined       { color: #003d33 }
//     .order-type-btn.active .material-symbols-outlined { color: white }
//
// Im Markup stand derselbe Zustand aber noch einmal als INLINE-Stil -- und
// der schlaegt jede Klasse. Damit fror jeder Knopf in dem Zustand fest, in
// dem er in der Datei steht:
//
//   Lieferung  behielt den hellen Hintergrund und opacity .6. Er sah nie
//              ausgewaehlt aus, auch wenn er es war.
//   Abholung   behielt background:#003D33, verlor mit .active aber die
//              weisse Schrift. Dunkelgruen auf Dunkelgruen: Text und Symbol
//              unsichtbar. Genau das im Bildschirmfoto.
//
// DIESELBE FALLE WIE SCHON EINMAL
// --------------------------------
// Bei der Kategorieleiste stand overflow-x als Inline-Stil und machte die
// Media-Query wirkungslos (siehe katleiste-test.js). Gleiche Ursache,
// anderer Ort. Deshalb prueft dieser Waechter nicht nur die drei Knoepfe,
// sondern die REGEL: wo es eine Zustandsklasse gibt, darf kein Inline-Stil
// dieselbe Eigenschaft setzen.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---- 1. Der Waechter: Zustandsklassen gegen Inline-Stile --------------------
// Alle Regeln der Form ".irgendwas.active { ... }" einsammeln und schauen,
// welche Eigenschaften sie setzen.
var zustandsRegeln = {};
var reRegel = /\.([a-z][\w-]*)\.(active|selected|open|checked)\s*\{([^}]*)\}/gi, m;
while ((m = reRegel.exec(H))) {
    var klasse = m[1];
    var eigenschaften = (m[3].match(/(^|;)\s*([a-z-]+)\s*:/g) || [])
        .map(function (e) { return e.replace(/[;:\s]/g, ''); })
        .filter(function (e) { return /^(background|background-color|color|opacity|border|border-color)$/.test(e); });
    if (!eigenschaften.length) continue;
    zustandsRegeln[klasse] = (zustandsRegeln[klasse] || []).concat(eigenschaften);
}
t('es gibt ueberhaupt Zustandsklassen zum Pruefen',
  Object.keys(zustandsRegeln).length > 0, Object.keys(zustandsRegeln).join(', '));

// Ein Inline-Stil ist nur dann ein Problem, wenn ihn NIEMAND wieder
// anfasst. Die Filter-Chips etwa tragen Hintergrund und Farbe inline --
// aber setFilter() setzt beide Zustaende zur Laufzeit selbst. Das ist
// doppelt gemoppelt, funktioniert aber. Bei den Bestellart-Knoepfen tat das
// niemand: dort wurde nur die Klasse umgeschaltet, und die verlor.
//
// Der Waechter laesst eine Klasse also durch, wenn irgendeine Funktion sie
// anfasst UND dabei .style.<eigenschaft> setzt. Ob das wirklich stimmt,
// prueft der Test weiter unten am konkreten Fall nach -- eine Ausnahme, die
// niemand nachhaelt, waere wieder nur eine Behauptung.
function jsSetztSelbst(klasse, eigenschaft) {
    var camel = eigenschaft.replace(/-([a-z])/g, function (x, c) { return c.toUpperCase(); });
    var reFn = /function\s+\w+\s*\([^)]*\)\s*\{/g, mf;
    while ((mf = reFn.exec(H))) {
        var block = H.slice(mf.index, mf.index + 2500);
        if (block.indexOf(klasse) < 0) continue;
        if (new RegExp('\\.style\\.' + camel + '\\s*=').test(block)) return true;
    }
    return false;
}

var konflikte = [];
Object.keys(zustandsRegeln).forEach(function (klasse) {
    var eig = zustandsRegeln[klasse];
    // Jedes Element im Markup, das diese Klasse traegt.
    var reEl = new RegExp('<[a-z]+[^>]*class="[^"]*\\b' + klasse + '\\b[^"]*"[^>]*>', 'gi'), me;
    while ((me = reEl.exec(H))) {
        var tag = me[0];
        var stil = /style="([^"]*)"/.exec(tag);
        if (!stil) continue;
        eig.forEach(function (e) {
            if (!new RegExp('(^|;)\\s*' + e + '\\s*:').test(stil[1])) return;
            if (jsSetztSelbst(klasse, e)) return;     // JS pflegt es selbst
            konflikte.push(klasse + ' setzt "' + e + '" inline, und kein JS zieht nach: ' + tag.slice(0, 80));
        });
    }
});
t('kein Inline-Stil ueberschreibt eine Zustandsklasse',
  konflikte.length === 0, '\n         ' + konflikte.slice(0, 8).join('\n         '));

// Gegenprobe -- sonst waere das gruene Ergebnis oben nichts wert.
(function () {
    var probe = '<button class="order-type-btn" style="background:#003D33;color:white;">x</button>';
    var traegt = /style="([^"]*)"/.exec(probe);
    var faengt = /(^|;)\s*background\s*:/.test(traegt[1]) && /\border-type-btn\b/.test(probe);
    t('Gegenprobe: ein Knopf mit Inline-Hintergrund wuerde gemeldet', faengt === true);
})();

// Die Ausnahme oben nachgeprueft: setFilter MUSS beide Zustaende selbst
// setzen. Faellt das je weg, sind die Chips derselbe Fehler wie die Knoepfe.
var setFilterBlock = H.slice(H.indexOf('function setFilter(filter)'), H.indexOf('function setFilter(filter)') + 900);
t('setFilter setzt den AUSGEWAEHLTEN Zustand selbst',
  /isActive\) \{[\s\S]{0,200}style\.background = '#fed65b'[\s\S]{0,120}style\.color[\s\S]{0,120}style\.borderColor/.test(setFilterBlock));
t('und den NICHT ausgewaehlten ebenso -- sonst blieben Chips haengen',
  /\} else \{[\s\S]{0,200}style\.background = 'white'[\s\S]{0,120}style\.color[\s\S]{0,120}style\.borderColor/.test(setFilterBlock));

// ---- 2. Die drei Bestellart-Knoepfe konkret ---------------------------------
var knoepfe = H.match(/<button class="order-type-btn[^"]*"[^>]*>/g) || [];
t('die drei Bestellart-Knoepfe sind da', knoepfe.length === 3, knoepfe.length);
t('keiner traegt noch Hintergrund, Farbe oder Deckkraft inline',
  knoepfe.every(function (b) { return !/(background|color|opacity)\s*:/.test(b); }),
  knoepfe.filter(function (b) { return /(background|color|opacity)\s*:/.test(b); }).join('\n         '));
t('"Hier essen" darf display:none behalten -- das schaltet JS um',
  /id="dineInBtn" style="display:none;"/.test(H));
t('und wird per style.display = \'\' wieder eingeblendet, faellt also auf die Regel zurueck',
  /dineInBtn\.style\.display = dineInEnabled \? '' : 'none'/.test(H));

// Nur innerhalb der Bestellart-Knoepfe: anderswo ist eine gesetzte Deckkraft
// voellig in Ordnung (ausgegraute Symbole in Leerzustaenden zum Beispiel).
var knopfBlock = H.slice(H.indexOf('<button class="order-type-btn" onclick="setOrderType(\'delivery\''),
                         H.indexOf('</div>', H.indexOf('dineInTableLabel')));
t('auch Symbol und Beschriftung der Knoepfe tragen keine Deckkraft mehr inline',
  !/opacity:/.test(knopfBlock), (knopfBlock.match(/[^;"]*opacity:[^;"]*/g) || []).join(' | '));

t('die runde Form ist in die Regel gezogen, nicht verloren',
  /\.order-type-btn \{[\s\S]{0,400}border-radius: 32px;/.test(H));
t('setOrderType schaltet weiterhin nur die Klasse um -- das ist jetzt richtig so',
  /function setOrderType[\s\S]{0,300}classList\.remove\('active'\)[\s\S]{0,120}classList\.add\('active'\)/.test(H));

// ---- 3. Die Feldbeschriftungen ragten ins Feld ------------------------------
// Im Browser nachgemessen (390px): top:-10px bei 15px Zeilenhoehe heisst
// Unterkante 5px UNTER der Feldoberkante. Auf schmaleren Geraeten brach
// "VOLLSTÄNDIGER NAME" zusaetzlich um und lag dann quer auf dem Namen.
t('die Beschriftung sitzt ueber dem Feld, nicht mit negativem Versatz hinein',
  /\.checkout-floating-label \{[\s\S]{0,400}bottom: 100%;/.test(H));
t('sie hat Abstand nach unten', /\.checkout-floating-label \{[\s\S]{0,400}margin-bottom: 4px;/.test(H));
t('sie bricht nicht mehr um', /\.checkout-floating-label \{[\s\S]{0,500}white-space: nowrap;/.test(H));
t('zu langer Text wird abgeschnitten statt ueberzulaufen',
  /\.checkout-floating-label \{[\s\S]{0,600}text-overflow: ellipsis;/.test(H));
t('kein negatives top mehr', !/\.checkout-floating-label \{[\s\S]{0,300}top: -/.test(H));
t('"Vollständiger Name" ist zu "Name" gekuerzt -- passt in die halbe Spalte',
  /for="checkoutName">Name<\/label>/.test(H) && H.indexOf('>Vollständiger Name</label>') < 0);

// Alle Beschriftungen: keine darf so lang sein, dass sie in der halben
// Spalte nicht mehr hinpasst. 18 Zeichen sind bei 10px und 0.15em
// Laufweite die gemessene Grenze.
var etiketten = (H.match(/class="checkout-floating-label"[^>]*>([^<]+)</g) || [])
    .map(function (e) { return e.replace(/.*>/, ''); });
t('es gibt Beschriftungen zum Pruefen', etiketten.length >= 5, etiketten.length);
var zuLang = etiketten.filter(function (e) { return e.length > 18; });
t('keine Beschriftung ist zu lang fuer die halbe Spalte',
  zuLang.length === 0, zuLang.join(', '));

// ---- 4. Der Grund steht im Quelltext ----------------------------------------
t('warum die Inline-Stile weg mussten, steht in der Datei',
  /der schlaegt jede\s*\n?\s*\/\/ Regel|schlaegt die Regel/.test(H));
t('und warum die Beschriftung verschoben wurde',
  /DIE BESCHRIFTUNG RAGTE INS FELD/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
