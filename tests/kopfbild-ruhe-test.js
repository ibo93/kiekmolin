// Prueft, dass das Kopfbild die Seite nicht mehr zum Zittern bringt.
//
// Der Fehler: Der Ken-Burns-Zoom lief ueber background-size, von 110 % auf
// 120 %, acht Sekunden lang, alle sieben Sekunden neu. background-size ist
// eine MAL-Eigenschaft -- der Browser kann sie nicht der Grafikkarte
// ueberlassen und rastert das ganze Bild in jedem Einzelbild neu.
//
// Auf einem 520 Pixel hohen Vollbild reisst das die ganze Seite mit: der
// Hauptfaden ist mit Malen beschaeftigt, waehrend niemand etwas tut. Genau
// so wurde es gemeldet -- "beim Nichtstun, die Bilder und die App".
//
// transform macht dieselbe Bewegung auf der Grafikkarte, ohne eine einzige
// Neuzeichnung.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- Nichts animiert mehr eine Mal-Eigenschaft --');

// Der Kern. Faellt dieser Test, ist das Zittern zurueck.
t('nirgends ein Uebergang auf background-size',
  (h.match(/transition[^;"']*background-size/g) || []).length === 0,
  (h.match(/transition[^;"']*background-size/g) || [])[0]);
// Hier stand zuerst eine Suche ueber die ganze Datei nach Uebergaengen auf
// width/height/top/left. Die fand .tide-wave (transition: height 1s) -- das
// ist zwar auch eine Mal-Eigenschaft, laeuft aber nur, wenn sich der Pegel
// aendert, und nicht im Dauerlauf. Der gemeldete Fehler war "beim Nichtstun".
// Geprueft wird deshalb genau das, was ohne Zutun laeuft: das Kopfbild.
var heroCss = h.slice(h.indexOf('#heroBanner'), h.indexOf('#heroBanner') + 1200);
t('auch im Kopfbild-CSS kein Uebergang auf eine Mal-Eigenschaft',
  !/transition:[^;"']*\b(width|height|top|left|background-size)\b\s+\d/.test(heroCss),
  heroCss.slice(0, 200));

console.log('\n-- Die beiden Bildebenen --');

var bg1 = h.slice(h.indexOf('id="heroBannerBg"'));
bg1 = bg1.slice(0, bg1.indexOf('>'));
var bg2 = h.slice(h.indexOf('id="heroBannerBg2"'));
bg2 = bg2.slice(0, bg2.indexOf('>'));

[['heroBannerBg', bg1], ['heroBannerBg2', bg2]].forEach(function (p) {
    t(p[0] + ': das Bild fuellt fest (cover), es wird nicht mehr skaliert',
      /background-size:cover/.test(p[1]), p[1].slice(0, 140));
    t(p[0] + ': dem Browser ist angekuendigt, was sich bewegt',
      /will-change:transform,opacity/.test(p[1]));
});

console.log('\n-- Die Bewegung --');

var fn = h.slice(h.indexOf('function updateHeroBannerImage'));
fn = fn.slice(0, fn.indexOf('\nvar _searchDebounce'));

t('gezoomt wird ueber transform', /transform 8s ease-in-out/.test(fn), fn.slice(0, 200));
t('und nicht mehr ueber background-size', !/backgroundSize = '1[12]0%'/.test(fn));
t('der Zoom bleibt klein genug fuer den Rahmen', /scale\(1\.0[0-9]\)/.test(fn));

// Ohne das Zuruecksetzen OHNE Uebergang zoomt das naechste Bild sichtbar
// rueckwaerts, bevor es vorwaerts geht.
t('vor dem naechsten Bild wird ohne Uebergang zurueckgesetzt',
  /transition = 'none'[\s\S]{0,80}transform = 'scale\(1\)'/.test(fn), fn.slice(fn.indexOf('ebeneVorbereiten'), fn.indexOf('ebeneVorbereiten') + 400));

// Ein einzelnes requestAnimationFrame reicht nicht: der Browser fasst
// Anfangs- und Endwert im selben Bild zusammen und springt.
t('zwei Bilder Vorlauf, damit der Uebergang wirklich laeuft',
  (fn.match(/requestAnimationFrame/g) || []).length === 2, (fn.match(/requestAnimationFrame/g) || []).length);

console.log('\n-- Wer Ruhe eingestellt hat, bekommt Ruhe --');

t('prefers-reduced-motion wird gefragt', /prefers-reduced-motion: reduce/.test(fn));
t('und dann gar nicht gezoomt', /if \(RUHE\) return;/.test(fn), fn.slice(fn.indexOf('function zoomStarten'), fn.indexOf('function zoomStarten') + 200));

console.log('\n-- Was gleich bleibt --');

t('das Bild wechselt weiterhin alle 7 Sekunden', /\}, 7000\);/.test(fn));
t('bei nur einem Bild laeuft keine Slideshow', /if \(imgs\.length <= 1\) return;/.test(fn));
t('das naechste Bild ist nie dasselbe', /while \(nextIndex === currentIndex/.test(fn));
t('die Bilder werden weiterhin vorgeladen', /new Image\(\); img\.src = src;/.test(fn));
t('eine laufende Slideshow wird vorher gestoppt (kein Stapeln)',
  /clearInterval\(window\._heroSlideshow\)/.test(fn));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
