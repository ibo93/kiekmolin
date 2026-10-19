// LOKALSEITE: OEFFNUNGSZEITEN, DREI ZUSAGEN, GROSSES BILD.
//
// Ibo, 19.10.2026: "das alte ist gut, nur leicht anpassen: die
// Oeffnungszeiten besser machen ... das grosse Bild noch anpassen" und
// "von den Reservieren paar Ideen nehmen". Ausgefuehrt: lpZeitenHtml.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }

var Z = new Function(fn('lpZeitenHtml') + '; return lpZeitenHtml;')();
var oh = { mo_start: '11:30', mo_end: '22:00', di_start: '11:30', di_end: '22:00', mi_start: '11:30', mi_end: '22:00',
    do_start: '11:30', do_end: '22:00', fr_start: '11:30', fr_end: '23:00', sa_start: '17:00', sa_end: '23:00', sa_start2: '11:30', sa_end2: '14:00', so_start: '12:00', so_end: '21:30' };
var mo = new Date(2026, 9, 19, 12, 0);  // Montag
var h = Z({ opening_hours: oh, rest_day: null }, mo, true, '22:00:00', '11:30');
t('jeder Tag eine eigene Zeile (7)', (h.match(/class="lp-zeit[ "]/g) || []).length === 7, (h.match(/class="lp-zeit[ "]/g) || []).length);
t('heute (Montag) hervorgehoben, nur einmal', /lp-zeit-heute"[^>]*aria-current="date"><span>Montag <b>· heute<\/b>/.test(h) && (h.match(/lp-zeit-heute/g) || []).length === 1, h.slice(0, 300));
t('Stand oben: geöffnet bis 22:00 (ohne Sekunden)', /Jetzt geöffnet · bis 22:00</.test(h), '');
t('zweite Schicht steht dabei', /17:00–23:00<br>11:30–14:00/.test(h), '');
var so = Z({ opening_hours: JSON.stringify(oh), rest_day: 6 }, new Date(2026, 9, 25, 9, 0), false, '', '12:00');
t('Ruhetag schlägt eingetragene Zeit (Al Porto), auch heute', /Sonntag <b>· heute<\/b><\/span><span>Ruhetag/.test(so), so.slice(-300));
t('am Ruhetag kein "öffnet heute"', /Gerade geschlossen</.test(so) && so.indexOf('öffnet heute') === -1, '');
var di = Z({ opening_hours: oh, rest_day: 0 }, new Date(2026, 9, 20, 8, 0), false, '', '11:30');
t('geschlossen, aber heute offen: "öffnet heute 11:30"', /Gerade geschlossen · öffnet heute 11:30/.test(di), '');
t('Ruhetag Montag wird gedimmt, nicht heute', /class="lp-zeit lp-zeit-zu"><span>Montag<\/span><span>Ruhetag/.test(di), '');
t('rest_day 0 ist Montag, nicht "kein Ruhetag"', di.indexOf('Montag</span><span>11:30') === -1, '');
t('keine Zeiten: "Keine Angabe" statt leerer Liste', /Keine Angabe/.test(Z({ opening_hours: {} }, mo, false)) && /Keine Angabe/.test(Z(null, mo, false)), '');
t('Lokalseite benutzt lpZeitenHtml', /\$\{lpZeitenHtml\(APP_DATA\.restaurants\.find/.test(H), '');

// Ibo, 19.10.2026 abends: "das Kostenlos alles [raus] und kein Pfeil und
// Speisekarte mach in Kasten mit Scrollen".
t('Zusagen-Kasten ist wieder raus', H.indexOf('lpZusagenHtml') === -1 && H.indexOf('lp-zusagen') === -1, '');
t('keine Pfeile mehr auf den Fotos (Kopf + großes Foto)', H.indexOf('lp-hero-pfeil') === -1 && H.indexOf('lp-buehne-pfeil') === -1 && H.indexOf('lpHeroZurueck') === -1, '');
// "nicht so, so wie bei Bestellen mit Foto und Gericht"
var esc = function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
var M = new Function('escapeHtml', fn('lpMenuPreis') + fn('lpMenuKastenHtml') + '; return lpMenuKastenHtml;')(esc);
var mk = M([{ name: 'Pizza <Diavola>', description: 'scharf', price: '12.9', image: 'pizza.jpg' }, { name: 'Tiramisù', price: 6.9, image: '' }, { name: 'Burrata', image: 'b.jpg' }], 'r-1"x');
t('Speisekarte: jede Karte wie beim Bestellen (Foto, Name, Preis, Beschreibung)', (mk.match(/class="lp-gk"/g) || []).length === 3 && /<img src="pizza\.jpg"/.test(mk) && /12,90 €/.test(mk) && /<p>scharf<\/p>/.test(mk), mk.slice(0, 300));
t('ohne Foto: Motiv statt leerer Fläche', /lp-gk-bild"><span class="material-symbols-outlined"[^>]*>restaurant</.test(mk), '');
t('Tippen öffnet die Speisekarte des Lokals, Kennung bereinigt', /onclick="openMenuModal\('r-1x'\)"/.test(mk) && mk.indexOf('r-1"x') === -1, '');
t('Name maskiert', mk.indexOf('<Diavola>') === -1, '');
t('beide Wege (sofort + nachgeladen) übergeben die Lokal-Kennung', (H.match(/\}\), rest\.id\)/g) || []).length >= 2, '');
t('Karten scrollen IM Kasten', /\.lp-menu-reihe \{ display: flex; overflow-x: auto;/.test(H), '');
t('Speisekarte steht in einem Kasten', /class="lp-menu-aussen"/.test(H) && /class="lp-menu-kasten"/.test(H) && /\.lp-menu-kasten \{[^}]*overflow: hidden;/.test(H), '');
t('großes Bild "Über uns": auf dem Handy 4:3 statt 4:5, gerade', /class="lp-ueber-bild"/.test(H) && /@media \(max-width: 899px\) \{ \.lp-ueber-bild \{ aspect-ratio: 4 \/ 3 !important; transform: none !important;/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
