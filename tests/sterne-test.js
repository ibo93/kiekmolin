// STERNE NUR MIT ECHTEN BEWERTUNGEN DAHINTER.
//
// GEFRAGT WURDE
// -------------
// "hast du den problem gelösst mit den 4,8 sterne bei al porto oldersum"
//
// Antwort war: halb. Ein frueherer Durchgang (Commit "Erfundene
// Bewertungssterne raus") hat die fest eingetragene "4,8 ***** (56)" aus
// dem Schema in index.html entfernt und die 4,5-Vorgabewerte auf 0 gesetzt.
//
// build-seo-pages.js -- das Skript, das die oeffentlichen Landingpages baut,
// also genau die Seiten, die Google indexiert -- war NICHT dabei. Dort stand
// an zwei Stellen:
//
//     'ratingCount': Math.max(1, Math.round(rest.rating_count || 5))
//
// Das "|| 5" ist der Kern: ein Restaurant, dessen Bewertung jemand von Hand
// eingetragen hat (4.8) und das keine einzige echte Bewertung besitzt, bekam
// damit FUENF erfundene. Google zeigt daraufhin Sterne unter dem Treffer --
// hinter denen nichts steht. Dazu kam die sichtbare Sterneleiste auf der
// Karte, die schon bei einem blossen Zahlenwert erschien.
//
// DIE REGEL, DIE DIESE DATEI DURCHSETZT
// -------------------------------------
// Kein aggregateRating und keine Sterne ohne belegte Anzahl. Eine Zahl im
// Feld "rating" ist keine Bewertung.
'use strict';
var fs = require('fs');
var S = fs.readFileSync('/home/user/kiekmolin/build-seo-pages.js', 'utf8');
var A = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = S.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = S.indexOf('{', i), d = 0;
    for (var k = j; k < S.length; k++) { if (S[k] === '{') d++; else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); } }
}
var echt = new Function(schneide('echteBewertungen') + '; return echteBewertungen;')();

// Ohne Kommentare pruefen: die erklaeren, was frueher dastand, und wuerden
// den Waechter auf sich selbst hereinfallen lassen.
var S_CODE = S.replace(/^[ \t]*\/\/.*$/gm, '');

// ---- 1. Der gemeldete Fall --------------------------------------------------
t('ein Haus mit Bewertung 4.8 und ohne Bewertungen zaehlt als 0',
  echt({ rating: 4.8 }) === 0, echt({ rating: 4.8 }));
t('rating_count 0 bleibt 0', echt({ rating: 4.8, rating_count: 0 }) === 0);
t('rating_count null bleibt 0', echt({ rating: 4.8, rating_count: null }) === 0);
t('kein Restaurant uebergeben: 0 statt Absturz', echt(null) === 0 && echt(undefined) === 0);
t('Unsinn im Feld wird nicht zu einer Bewertung',
  echt({ rating_count: -3 }) === 0 && echt({ rating_count: 'viele' }) === 0,
  echt({ rating_count: -3 }) + ' / ' + echt({ rating_count: 'viele' }));
t('echte Bewertungen zaehlen', echt({ rating: 4.8, rating_count: 12 }) === 12);
t('eine Zahl als Text zaehlt auch', echt({ rating_count: '7' }) === 7);
t('Nachkommastellen werden gerundet', echt({ rating_count: 2.6 }) === 3);

// ---- 2. Nirgends mehr eine erfundene Anzahl ---------------------------------
t('kein "|| 5" mehr als Bewertungszahl',
  S_CODE.indexOf('rating_count) || 5') < 0 && S_CODE.indexOf('rating_count || 5') < 0,
  (S_CODE.match(/rating_count[^\n]{0,20}\|\| 5/g) || []).join(' | '));
t('keine Untergrenze von 1 mehr -- die war schon eine erfundene Bewertung',
  !/ratingCount': Math\.max\(1,/.test(S),
  (S.match(/ratingCount': Math\.max\(1,[^\n]*/g) || []).join(' | '));

// Jede Stelle, die aggregateRating setzt, muss vorher die Anzahl pruefen.
var stellen = [];
var re = /item\.aggregateRating = \{/g, m;
while ((m = re.exec(S_CODE))) {
    // Grosszuegiges Fenster: der ehrliche Zweig prueft realReviews.length
    // schon einige Zeilen weiter oben, am Anfang des if-Blocks.
    var davor = S_CODE.slice(Math.max(0, m.index - 1200), m.index);
    if (!/echteBewertungen\(|realReviews\.length/.test(davor)) {
        stellen.push(S_CODE.slice(m.index - 120, m.index + 60).replace(/\s+/g, ' '));
    }
}
t('jede Schema-Bewertung ist an echte Bewertungen gekoppelt',
  stellen.length === 0, '\n         ' + stellen.join('\n         '));

t('auch die sichtbaren Sterne auf der Karte',
  /\(r && echteBewertungen\(rest\)\) \?/.test(S));
t('und sie nennen die Anzahl mit -- Google will sie wissen',
  /itemprop="ratingCount" content="' \+ echteBewertungen\(rest\)/.test(S));

t('der ehrliche Zweig blaeht die Zahl nicht mehr auf',
  /'ratingCount': Math\.max\(realReviews\.length, echteBewertungen\(rest\)\)/.test(S));

// ---- 3. Was der fruehere Durchgang schon erledigt hat -----------------------
// Damit es nicht zurueckkommt: die App selbst darf ebenfalls keine
// Bewertung erfinden.
t('index.html zeichnet weiterhin keine aggregateRating aus',
  /KEINE aggregateRating-Auszeichnung/.test(A) && !/item\.aggregateRating|schema\.aggregateRating/.test(A));
t('kein 4,5 als Vorgabewert mehr in der App',
  !/rating[^\n]{0,20}\|\|\s*4\.5/.test(A),
  (A.match(/rating[^\n]{0,20}\|\|\s*4\.5[^\n]{0,30}/g) || []).join(' | '));
t('ohne echte Bewertung steht ein Strich, keine Zahl',
  /rating > 0\) \? Number\(r\.rating\)\.toFixed\(1\) : '–'/.test(A));

// ---- 4. Gegenprobe -----------------------------------------------------------
t('Gegenprobe: mit "|| 5" wuerde der Waechter anschlagen',
  /rating_count \|\| 5/.test("'ratingCount': Math.max(1, Math.round(rest.rating_count || 5))"));

// ---- 5. Der Grund steht im Quelltext ----------------------------------------
t('warum eine Zahl im Feld keine Bewertung ist, steht in der Datei',
  /Ein Sternewert allein ist keine Bewertung/.test(S));
t('und was das bei Google angerichtet hat',
  /Sterne anzeigen, hinter denen nichts steht/.test(S));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
