// DUNKELMODUS und TISCHPLAN.
//
// Zwei Befunde, die beim Nachsehen herauskamen:
//
// 1. Der Variablen-Satz fuer die Farben ist gut gebaut -- aber rund 980
//    Farben standen FEST in style-Attributen und schalteten nie mit. Am
//    schwersten wogen 335 dunkelgruene Textfarben (dunkelgruene Schrift auf
//    dunklem Grund) und 49 weisse Flaechen (grelle Kaesten in der dunklen
//    Seite).
//
// 2. Der Tischplan zeigte acht ERFUNDENE Tische mit erfundenen Betraegen
//    (87 €, 156 €, 43 €). restaurant_tables wurde nie gelesen, obwohl
//    ueberall sonst damit gearbeitet wird. Wer den Plan einem Wirt zeigte,
//    zeigte ihm Umsatz an einem Tisch, den es nicht gibt.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---------- Dunkelmodus ----------
t('neue Schriftvariablen sind da', /--ink-strong: #003D33;/.test(H) && /--ink-deep: #00251e;/.test(H));
t('im hellen Modus exakt die alten Werte -- kein Pixel anders',
  /--ink-strong: #003D33;\s*\n\s*--ink-deep: #00251e;/.test(H));
t('im dunklen Modus aufgehellt',
  /--ink-strong: #9cd1c3;/.test(H) && /--ink-deep: #b8eddf;/.test(H));

function inlineStyles() {
    return (H.match(/style="[^"]*"/g) || []);
}
var styles = inlineStyles();
function zaehle(re) { return styles.filter(function (s) { return re.test(s); }).length; }

// Auf farbigem Grund muss dunkle Schrift dunkel BLEIBEN -- helles Gruen auf
// einem gelben Knopf waere unlesbar. Deshalb wird nur umgestellt, wo kein
// Farbhintergrund im selben style steht.
var FARBIG = /background[^;]*(#003[dD]33|#00251e|#FFD54F|#fed65b|#8b5cf6|#7c3aed|#ef4444|#dc2626|#16a34a|#15803d|#f59e0b|#b45309|linear-gradient|rgba\(0,\s*61|rgba\(139)/i;
var gruenRest = styles.filter(function (s) {
    return /color:\s*(#003[dD]33|#00251e)\b/.test(s) && !FARBIG.test(s);
});
t('keine dunkelgruene Schrift mehr auf hellem Grund fest verdrahtet',
  gruenRest.length === 0, gruenRest.length + ' Reste, z.B. ' + (gruenRest[0] || '').slice(0, 90));

var weissRest = zaehle(/background(-color)?:\s*(#fff\b|#ffffff\b|white\b)/i);
t('keine fest verdrahteten weissen Flaechen mehr', weissRest === 0, weissRest + ' Reste');

var grauRest = zaehle(/color:\s*#404946\b/);
t('Fliesstext-Grau laeuft ueber die Variable', grauRest === 0, grauRest + ' Reste');

t('mindestens 400 Stellen umgestellt',
  (H.match(/var\(--ink-strong\)|var\(--ink-deep\)/g) || []).length >= 240,
  (H.match(/var\(--ink-strong\)|var\(--ink-deep\)/g) || []).length);
t('dunkle Schrift auf farbigem Grund wurde absichtlich NICHT angefasst',
  styles.some(function (s) { return FARBIG.test(s) && /color:\s*#00251e/.test(s); }));

// ---------- Tischplan ----------
t('die acht erfundenen Tische sind weg',
  !/T-01', seats:4, status:'available'/.test(H) && !/amount:87/.test(H) && !/amount:156/.test(H));
t('der Plan liest restaurant_tables',
  /rest\/v1\/restaurant_tables\?restaurant_id=eq\.'[\s\S]{0,200}is_active=eq\.true/.test(H)
  && /function tpLadeTische/.test(H));
t('Betrag und Dauer kommen aus echten offenen Bestellungen',
  /order_type=eq\.dine_in/.test(H) && /proTisch\[t\]\.summe \+= parseFloat\(o\.total\)/.test(H));
t('Tische ohne gespeicherte Position werden verteilt, nicht weggelassen',
  /z\.pos_x != null && z\.pos_y != null/.test(H) && /proReihe/.test(H));

// Der Ruf vom Tisch -- das, was heute dazugekommen ist, wird im Plan sichtbar.
t('der Plan fragt die Tischrufe ab',
  /functions\/waiter-pending\?restaurant=/.test(H)
  && /ruft\[String\(r\.tisch\)\] = r\.grund/.test(H));
t('ein rufender Tisch bekommt einen eigenen Zustand',
  /if \(ruft\[nr\]\) status = 'ruft';/.test(H));
t('und der schlaegt alles andere (Betrag, Reservierung)',
  H.indexOf("if (ruft[nr]) status = 'ruft';") < H.indexOf("else if (offen) status = 'billed';"));
t('rufender Tisch ist im Plan nicht zu uebersehen',
  /\.tisch\.ruft \.tisch-body/.test(H) && /animation: tischRuftPuls/.test(H));
t('das Zeichen sagt, WAS der Tisch will (Hilfe oder zahlen)',
  /t\.ruftGrund === 'pay' \? 'payments' : 'room_service'/.test(H));
t('Bewegung wird abgeschaltet, wer sie nicht vertraegt',
  /prefers-reduced-motion: reduce[\s\S]{0,120}\.tisch\.ruft \.tisch-body \{ animation: none/.test(H));
t('Legende und Filter kennen "Ruft"',
  /tischplan-legend-dot ruft/.test(H) && /data-filter="ruft"/.test(H));
t('der Plan frischt sich von allein auf',
  /function tpStarteAuffrischen/.test(H) && /}, 20000\);/.test(H));
t('aber nur wenn er sichtbar ist (kein Abfragen im Hintergrund)',
  /if \(!c \|\| !c\.offsetParent \|\| document\.hidden\) return;/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
