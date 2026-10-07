// CSS UND HTML KUERZEN IM BUILD -- ohne die Bedeutung zu aendern.
//
// minify-build.js kuerzt seit 06.10.2026 auch <style> und das HTML (gemessen
// -54 KB gzip). Die Gefahr dabei ist nicht "zu wenig gekuerzt", sondern
// "etwas anderes gemeint": "A :is(B)" (Nachfahre) ist nicht "A:is(B)"
// (dasselbe Element). Ein frueher Entwurf hat genau das getan.
//
// Gegenprobe: jede der Regeln unten wurde einmal kaputt gemacht und wurde rot.
'use strict';
var path = require('path');
var k = require(path.join(__dirname, '..', 'minify-build.js'));

var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

var css = k.cssKuerzen;
t('Leerzeichen vor :is() bleibt (Nachfahre)', css(':is(html,#kmi-glas) :is(button,.btn){color:red}').indexOf(') :is(') > -1, css(':is(html,#kmi-glas) :is(button,.btn){color:red}'));
t('Leerzeichen vor :hover nach Klasse bleibt', css('.karte :hover { x: 1 }').indexOf('.karte :hover') === 0, css('.karte :hover { x: 1 }'));
t('Leerzeichen um > bleibt erlaubt (Bedeutung gleich)', /\.a ?> ?\.b/.test(css('.a > .b { x: 1 }')), css('.a > .b { x: 1 }'));
t('Kommentare raus', css('/* weg */ .a { x: 1 } /* auch */') === '.a{x: 1}', css('/* weg */ .a { x: 1 } /* auch */'));
t('Leerraum an { } ; weg', css('.a {\n  x: 1;\n  y: 2;\n}\n.b { z: 3 }') === '.a{x: 1;y: 2;}.b{z: 3}', css('.a {\n  x: 1;\n  y: 2;\n}\n.b { z: 3 }'));
t('Inhalt in Anfuehrung mit einfachem Leerzeichen bleibt', css('.a::after{content:"bis 22 Uhr"}').indexOf('"bis 22 Uhr"') > -1, css('.a::after{content:"bis 22 Uhr"}'));

var h = k.cssUndHtmlKuerzen;
var roh = '<div>\n    <!-- Notiz -->\n    <p>Hallo</p>\n</div>\n<script>\n  // bleibt\n  var a = "<!-- kein Kommentar -->";\n</script>\n<pre>\n   Einrueckung\n</pre>\n<!--[if IE]>alt<![endif]-->';
var aus = h(roh);
t('HTML-Kommentar raus', aus.indexOf('Notiz') < 0, aus);
t('Einrueckung am Zeilenanfang raus', aus.indexOf('\n<p>Hallo</p>') > -1, aus);
t('<script> bleibt Zeichen fuer Zeichen', aus.indexOf('<script>\n  // bleibt\n  var a = "<!-- kein Kommentar -->";\n</script>') > -1, aus);
t('<pre> bleibt mit Einrueckung', aus.indexOf('<pre>\n   Einrueckung\n</pre>') > -1, aus);
t('bedingter Kommentar <!--[if bleibt', aus.indexOf('<!--[if IE]>') > -1, aus);
t('<style> wird gekuerzt', h('<style>\n  .a { x: 1 }\n</style>') === '<style>.a{x: 1}</style>', h('<style>\n  .a { x: 1 }\n</style>'));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
