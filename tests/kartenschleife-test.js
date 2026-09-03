// DIE BILDERSCHLEIFE DER RESTAURANTKARTEN.
//
// Gemeldet am 03.09.2026: "auf dem handy kommt keine bildstoerung nur
// auf dem pc".
//
// Am 02.09. war der harte Schnitt im KOPFBILD dran (bildwechsel-test.js).
// Das war eine ANDERE Schleife. Diese hier, die der Restaurantkarten,
// hatte einen eigenen Fehler -- eine Zeitrechnung, die nicht aufging:
//
//     Einblenden ueber   1500 ms   (transition im cssText)
//     Umschalten nach    1300 ms   (der setTimeout)
//
// Die Ebene wurde also mitten in der Bewegung abgeschnitten, bei rund
// 87 Prozent, und im selben Augenblick das Bild darunter getauscht.
//
// Ab dem ZWEITEN Wechsel passte es zufaellig, weil eine Zeile weiter
// unten die Zeit auf 1200 ms setzte (1200 < 1300). Nur: die Liste wird
// alle 30 Sekunden neu gezeichnet (autoRefreshRestaurants), und jedes
// Neuzeichnen faengt wieder mit dem kaputten ersten Wechsel an.
//
// Warum am Rechner und nicht am Handy: am PC stehen alle Karten
// nebeneinander im Blick.
//
// Geprueft wird deshalb das, worauf es ankommt: die Blendzeit und die
// Tauschzeit muessen aus DERSELBEN Zahl kommen, und getauscht wird nie
// vor dem Ende der Blende.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

var a = h.indexOf('function initCardSlideshows');
var fn = h.slice(a, h.indexOf('\n}\n', a) + 3);

// Die Kommentare erzaehlen den alten Fehler samt seiner Zahlen -- 1300,
// 1.5s. Wer nach denen im ganzen Text sucht, findet die Erklaerung und
// haelt sie fuer den Fehler. Fuer die Zahlen-Pruefungen deshalb der
// Code OHNE Kommentarzeilen.
var code = fn.split('\n').filter(function (z) { return !/^\s*\/\//.test(z); }).join('\n');

t('die Funktion wurde gefunden', fn.length > 500, fn.length);

console.log('\n-- 1. Eine Zahl, nicht zwei --');

t('es gibt eine benannte Blendzeit', /var BLENDE = (\d+);/.test(code),
  code.slice(0, 200));
t('und eine Tauschzeit, die daraus gerechnet wird',
  /var TAUSCH = BLENDE \+ \d+;/.test(code),
  (code.match(/var TAUSCH[^\n]*/) || [])[0]);

var blende = Number((code.match(/var BLENDE = (\d+);/) || [])[1]);
var zuschlag = Number((code.match(/var TAUSCH = BLENDE \+ (\d+);/) || [])[1]);

t('der Tausch kommt NACH der Blende, nicht mittendrin',
  isFinite(blende) && isFinite(zuschlag) && zuschlag > 0,
  'Blende ' + blende + ', Zuschlag ' + zuschlag);

console.log('\n-- 2. Keine festen Millisekunden mehr im Ablauf --');

// Der eigentliche Fehler war eine ZWEITE Zahl. Steht wieder eine da,
// koennen sie wieder auseinanderlaufen.
t('der setTimeout benutzt TAUSCH statt einer Zahl',
  /\}, TAUSCH\);/.test(code), (code.match(/\}, \d+\);/g) || []).join(' | '));
t('die 1300 ist aus dem Code raus', code.indexOf('1300') < 0, '1300 steht noch im Code');
t('die 1.5s im cssText ist weg', code.indexOf('1.5s') < 0, '1.5s steht noch im Code');
t('und die abweichende 1.2s auch', code.indexOf('1.2s') < 0, '1.2s steht noch im Code');

// Beide transition-Zeiten muessen aus BLENDE kommen -- die im cssText
// und die, die nach dem Zuruecksetzen wieder gesetzt wird.
var ausBlende = code.match(/\(BLENDE \/ 1000\)/g) || [];
t('beide Uebergangszeiten kommen aus BLENDE',
  ausBlende.length === 2, ausBlende.length + ' von 2');

console.log('\n-- 3. Der Ablauf stimmt noch --');

t('die Ebene faengt unsichtbar an', /opacity:0;/.test(fn));
t('das neue Bild kommt zuerst in die Ebene',
  fn.indexOf('fadeLayer.style.backgroundImage') < fn.indexOf('fadeLayer.style.opacity = \'1\''));
t('erst danach wird das Bild darunter getauscht',
  fn.indexOf("fadeLayer.style.opacity = '1'") < fn.indexOf('card.style.backgroundImage'));
t('das Zuruecksetzen laeuft ohne Uebergang',
  /transition = 'none'[\s\S]{0,60}opacity = '0'/.test(fn));
t('und der Uebergang kommt danach wieder',
  /setTimeout\(function\(\) \{[\s\S]{0,120}transition = 'opacity ' \+ \(BLENDE \/ 1000\)/.test(fn));

console.log('\n-- 4. Was gleich bleibt --');

t('gewechselt wird weiterhin alle 5 Sekunden', /\}, 5000\);/.test(fn));
t('bei nur einem Bild laeuft nichts', /images\.length < 2\) return;/.test(fn));
t('die Bilder werden vorgeladen', /new Image\(\); img\.src = src;/.test(fn));
t('alte Schleifen werden vorher gestoppt',
  /_cardSlideshows\.forEach\(function\(id\) \{ clearInterval\(id\); \}\)/.test(fn));

console.log('\n-- 5. Und das Kopfbild ist eine ANDERE Schleife --');

// Damit niemand die eine repariert und denkt, die andere sei mit dabei.
t('updateHeroBannerImage gibt es weiterhin getrennt',
  /function updateHeroBannerImage/.test(h));
t('und sie steckt nicht in dieser Funktion',
  fn.indexOf('updateHeroBannerImage') < 0);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
