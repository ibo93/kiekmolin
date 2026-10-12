// Beleg: unser Logo unten, das des Lokals oben, QR-Code zur Seite des Lokals.
// Ibo, 12.10.2026: "beim Kassenbon muss unser Logo kiekmolin". Entschieden:
// oben bleibt der Verkaeufer (das Lokal), unten Absender + "naechstes Mal
// direkt hier bestellen".
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }
var pb = fn('printOrderBrowser');

// markeHtml ausfuehren: mit und ohne slug
var von = pb.indexOf('var _bestellUrl'), bis = pb.indexOf('let printContent', von);
var code = pb.slice(von, bis);
function marke(slug) { return new Function('restSlug', 'location', 'escapeHtml', code + '; return markeHtml;')(slug, { origin: 'https://kiekmolin.de' }, function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }); }
var m1 = marke('diemillis-emden'), m0 = marke('');
t('unser Logo im Fuß, als volle Adresse (Druckfenster hat keine eigene)', /<img class="marke-logo" src="https:\/\/kiekmolin\.de\/kiek-logo\.png" alt="Kiek mol in">/.test(m1), m1.slice(0, 160));
t('QR-Code führt zur Seite GENAU dieses Lokals', /data=https%3A%2F%2Fkiekmolin\.de%2Fdiemillis-emden"/.test(m1) && /Nächstes Mal direkt hier bestellen<br><strong>kiekmolin\.de\/diemillis-emden<\/strong>/.test(m1), m1);
t('ohne Adresse (slug) kein QR-Code ins Leere, Logo bleibt', !/marke-qr/.test(m0) && /marke-logo/.test(m0), m0);
t('der Fuß nutzt markeHtml', /\$\{markeHtml\}/.test(pb) && !/<div class="marke-url">kiekmolin\.de<\/div>\s*<\/div>\s*<\/div>\s*<\/body>/.test(pb), '');
t('oben bleibt das Logo des LOKALS', /<div class="kopf">\s*<div>\s*\$\{logoHtml\}/.test(pb) && /var restLogo = rest \? rest\.logo : null;/.test(pb), '');
t('Gestaltung für Bonrolle UND A4', (pb.match(/\.marke-logo \{/g) || []).length === 2 && (pb.match(/\.marke-qr img \{/g) || []).length === 2, (pb.match(/\.marke-logo \{/g) || []).length);
t('das Logo-Bild liegt im Repo', fs.existsSync(path.join(__dirname, '..', 'kiek-logo.png')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
