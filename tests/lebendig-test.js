// Lebendige Bilder: höchstens 4 je Lokal, nur über echten Fotos.
//
// Ibo, 08.10.2026: "bei Getränke, Shisha und andere Sachen, nur 3-4
// animierte Sachen". Die Rechnungen laufen hier echt; ob sich im Browser
// wirklich etwas bewegt (und still steht, wenn es aus dem Blick ist),
// misst werkzeug/lebendig-messen.js.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }
function zeile(start) { var i = H.indexOf(start); return H.slice(i, H.indexOf(';\n', i) + 1); }

var L = new Function(zeile('var ADDITIVE_MARKIERUNGEN') + zeile('var LEBENDIG_MAX') + zeile('var LEBENDIG_ARTEN') + zeile('var _MOTIV_WOERTER')
    + ['istMarkierung', 'lebendigEintrag', 'lebendigArt', 'lebendigVorschlag', 'lebendigErlaubt', 'lebendigHtml', 'motivFuer'].map(fn).join('\n')
    + '; return { max: LEBENDIG_MAX, art: lebendigArt, vorschlag: lebendigVorschlag, erlaubt: lebendigErlaubt, html: lebendigHtml, markierung: istMarkierung };')();

var foto = 'https://x/y.jpg';
var items = [
    { id: 1, image_url: foto, additives: ['lebendig:perlen'] },
    { id: 2, image_url: foto, additives: ['lebendig:dampf'] },
    { id: 3, image_url: '', additives: ['lebendig:dampf'] },
    { id: 4, image_url: foto, additives: ['lebendig:glanz'] },
    { id: 5, image_url: foto, additives: ['lebendig:perlen'] },
    { id: 6, image_url: foto, additives: ['lebendig:perlen'] }
];
t('höchstens 4 je Lokal', L.max === 4, L.max);
var e = L.erlaubt(items);
t('die ersten 4 MIT Foto bewegen sich, der 5. bleibt still', Object.keys(e).join(',') === '1,2,4,5', Object.keys(e).join(','));
t('ohne Foto keine Bewegung (kein Effekt über dem Platzhalter)', L.art(items[2]) === '', L.art(items[2]));
t('unbekannte Art wird ignoriert', L.art({ image_url: foto, additives: ['lebendig:feuerwerk'] }) === '', '');
t('Vorschlag: Getränk -> Perlen, Shisha -> Dampf, Pizza -> Dampf, Tiramisu -> Schimmer',
    L.vorschlag({ name: 'Mojito', category: 'Cocktails' }) === 'perlen' && L.vorschlag({ name: 'Doppelapfel', category: 'Shisha' }) === 'dampf'
    && L.vorschlag({ name: 'Pizza Salami' }) === 'dampf' && L.vorschlag({ name: 'Tiramisu' }) === 'glanz',
    [L.vorschlag({ name: 'Mojito', category: 'Cocktails' }), L.vorschlag({ name: 'Doppelapfel', category: 'Shisha' }), L.vorschlag({ name: 'Pizza Salami' }), L.vorschlag({ name: 'Tiramisu' })].join(','));
t('Kopfsalat ist kein Shisha-Kopf', L.vorschlag({ name: 'Kopfsalat' }) !== 'dampf', L.vorschlag({ name: 'Kopfsalat' }));
t('"lebendig:" ist eine Markierung, kein Zusatzstoff für den Gast', L.markierung('lebendig:perlen') === true && L.markierung('2') === false, '');
t('Bewegung ist für Vorleser unsichtbar (aria-hidden)', /aria-hidden="true"/.test(L.html('perlen')) && L.html('') === '', L.html('perlen'));

// Gastkarte und Dialog hängen dran
t('Gastkarte zeichnet die Bewegung, nur wenn erlaubt', /if \(!window\._lebendigErlaubt \|\| window\._lebendigErlaubt\[item\.id\]\) html \+= lebendigHtml\(lebendigArt\(item\)\);/.test(H), '');
t('beide Kartenansichten zählen die Grenze und beobachten den Blick', (H.match(/window\._lebendigErlaubt = lebendigErlaubt\(/g) || []).length === 2 && (H.match(/lebendigBeobachten\(container\);/g) || []).length === 2, '');
t('Dialog: Feld "Bild lebendig" und Prüfung beim Speichern', /lebendigFeldHtml\(item\) \+/.test(H) && /lebendigAndere\(currentItem \|\| \{ id: itemId \}\)\.length >= LEBENDIG_MAX/.test(H), '');
t('Speichern ersetzt den alten Eintrag (kein doppeltes lebendig:)', /a\.startsWith\('nr:'\) \|\| a\.startsWith\('ohne:'\) \|\| a\.startsWith\('lebendig:'\)/.test(H), '');

// CSS: Pause muss NACH den Arten stehen (die Kurzform animation: setzt sie sonst zurück)
var css = H.slice(H.indexOf('LEBENDIGE BILDER (08.10.2026)'), H.indexOf('@media (prefers-reduced-motion: reduce) { .kmi-lebendig'));
t('Pause aus dem Blick steht nach allen "animation:"-Kurzformen', css.lastIndexOf('animation: kmi') < css.indexOf('.kmi-lebendig:not(.laeuft) span { animation-play-state: paused; }') && css.indexOf('.kmi-lebendig:not(.laeuft) span') > 0, '');
t('nur transform/opacity bewegt (kein filter: blur, das kostet Akku)', !/filter:\s*blur/.test(css) && !/@keyframes kmi\w+ \{[^}]*(top|left|width|height):/.test(css), '');
t('"weniger Bewegung" am Gerät: nur das Foto', /@media \(prefers-reduced-motion: reduce\) \{ \.kmi-lebendig \{ display: none; \} \}/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
