// LOKALSEITE: FOTO-KARUSSELL, GROSSANSICHT, HANDY-BREITE.
//
// Ibo, 19.10.2026: "Foto-Karussell einfuegen ... was Schoenes,
// Professionelles" (Seite eines Lokals). Gemessen vorher bei 390 px
// (werkzeug/lokalseite-ansehen.js): Knopfleiste ragte 17 px heraus,
// "KARTE" abgeschnitten; ein Deko-Fleck schob die Seite 8 px seitlich;
// das Raster zeigte hoechstens 4 Fotos. Ausgefuehrt: lpGalerieHtml,
// lpDiashowStarten/Gehe/Zeige.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }

var win = {};
var G = new Function('window', 'escapeHtml', fn('lpGalerieHtml') + '; return lpGalerieHtml;')(win, function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); });
var bilder = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg'];
var h = G(bilder, 'Die <Millis>');
t('alle 6 Fotos im Karussell (vorher höchstens 4)', (h.match(/class="lp-karussell-bild"/g) || []).length === 6, (h.match(/lp-karussell-bild"/g) || []).length);
t('jedes Foto öffnet die Großansicht an seiner Stelle', /onclick="lpLightbox\(5\)"/.test(h) && /6 \/ 6/.test(h), '');
t('Name im alt-Text maskiert', h.indexOf('<Millis>') === -1 && /Die &lt;Millis> – Foto 1/.test(h), '');
t('nur 1 Foto: kein Karussell', G(['a.jpg'], 'x') === '', '');
t('Platzhalter-GIF und Adressen mit Anführungszeichen fliegen raus', G(['data:image/gif;base64,R0', 'a.jpg', 'b"onerror=x.jpg'], 'x') === '', G(['data:image/gif;base64,R0', 'a.jpg', 'b"onerror=x.jpg'], 'x'));
t('die Liste für die Großansicht wird gemerkt', win._lpGalerie && win._lpGalerie.length === 6, '');
t('Lokalseite benutzt das Karussell statt des alten Rasters', /\$\{lpGalerieHtml\(rest\.images \|\| \[\], rest\.name\)\}/.test(H) && H.indexOf('class="lp-bento-grid"') === -1, '');

// Kopf-Diashow: der Reihe nach, Gast blaettert -> Selbstwechsel aus
function el() { return { style: {}, classList: { c: {}, contains: function (k) { return !!this.c[k]; }, remove: function (k) { delete this.c[k]; }, add: function (k) { this.c[k] = 1; } }, innerHTML: '' }; }
var knoepfe = [];
var punkte = el(); var doc = { getElementById: function (id) { return id === 'lpHeroPunkte' ? punkte : (id === 'restaurantLanding' ? {} : null); }, querySelectorAll: function () { return knoepfe; } };
var timer = null;
var D = new Function('document', 'window', 'setTimeout', 'setInterval', 'clearInterval',
    'var _lpDia = null;' + fn('lpDiashowStarten') + fn('lpDiashowGehe') + fn('lpDiashowZeige') + '; return { s: lpDiashowStarten, g: lpDiashowGehe, z: lpDiashowZeige, d: function () { return _lpDia; } };')
    (doc, {}, function (f) { f(); }, function (f) { timer = f; return 1; }, function () {});
var b1 = el(), b2 = el();
D.s(['1.jpg', '2.jpg', '3.jpg'], b1, b2);
t('Punkte: einer pro Foto', (punkte.innerHTML.match(/role="tab"/g) || []).length === 3 && punkte.classList.contains('lp-sichtbar'), punkte.innerHTML);
timer();
t('Selbstwechsel der Reihe nach (nicht zufällig): 1 -> 2', D.d().idx === 1 && /2\.jpg/.test(b2.style.backgroundImage), D.d().idx);
D.g(1);
t('Gast tippt Weiter: Foto 3, Selbstwechsel hält an', D.d().idx === 2 && D.d().selbst === true, JSON.stringify(D.d().idx));
timer();
t('… und springt danach nicht mehr von selbst weiter', D.d().idx === 2, D.d().idx);
D.g(1);
t('Weiter am Ende: zurück zu Foto 1', D.d().idx === 0, D.d().idx);
t('Zufall ist raus (Lokalseite)', !/Math\.random\(\)/.test(fn('showRestaurantLanding')) && !/Math\.random\(\)/.test(fn('lpDiashowStarten') + fn('lpDiashowZeige')), '');

// Handy-Breite (gemessen 19.10.2026)
t('Knopfleiste passt auf 390 px (eigene Regel bis 440 px)', /@media \(max-width: 440px\) \{\s*\.lp-aktionen \{ max-width: calc\(100vw - 32px\);/.test(H) && /class="kmi-glas-leiste kmi-glas-dunkel lp-aktionen"/.test(H), '');
t('Deko-Fleck schiebt die Seite nicht mehr seitlich', /\.lp-ueber-uns-grid \{ overflow-x: clip; \}/.test(H), '');
t('Großansicht schließt mit Escape und hat Schließen-Knopf mit Text', /e\.key === 'Escape'\) zu\(\)/.test(fn('lpLightbox')) && /aria-label="Schließen"/.test(fn('lpLightbox')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
