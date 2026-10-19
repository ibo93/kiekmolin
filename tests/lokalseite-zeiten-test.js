// LOKALSEITE: OEFFNUNGSZEITEN, DREI ZUSAGEN, GROSSES BILD.
//
// Ibo, 19.10.2026: "das alte ist gut, nur leicht anpassen: die
// Oeffnungszeiten besser machen ... das grosse Bild noch anpassen" und
// "von den Reservieren paar Ideen nehmen". Ausgefuehrt: lpZeitenHtml,
// lpZusagenHtml.
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

var U = new Function(fn('lpZusagenHtml') + '; return lpZusagenHtml;')();
var ohne = U({ features: [] }), mit = U({ features: JSON.stringify(['auto_confirm_reservations']) });
t('ohne Auto-Bestätigung: KEIN "Sofort bestätigt" (wäre gelogen)', ohne.indexOf('Sofort') === -1 && /Antwort per E-Mail/.test(ohne), '');
t('mit Auto-Bestätigung: "Sofort bestätigt"', /Sofort bestätigt/.test(mit), '');
t('Kostenlos + Absagen immer', /Kostenlos/.test(ohne) && /Absagen/.test(ohne), '');
t('Zusagen stehen NICHT in der schwebenden Leiste', /lpZusagen = noReservations \? '' : lpZusagenHtml\(rest\)/.test(H) && /\$\{lpZusagen \? '<div class="lp-zusagen-platz">'/.test(H) && H.indexOf('bar += lpZusagenHtml') === -1, '');
var inhalt = (H.match(/KIN-SYMBOLSCHRIFT-INHALT:\s*([a-z0-9_,]+)/) || [])[1] || '';
t('Symbole sind in der Symbolschrift (sonst steht das Wort da)', ['savings', 'mark_email_read', 'mark_email_unread', 'event_busy', 'chevron_left', 'chevron_right'].every(function (s) { return inhalt.split(',').indexOf(s) >= 0; }), '');

t('großes Bild "Über uns": auf dem Handy 4:3 statt 4:5, gerade', /class="lp-ueber-bild"/.test(H) && /@media \(max-width: 899px\) \{ \.lp-ueber-bild \{ aspect-ratio: 4 \/ 3 !important; transform: none !important;/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
