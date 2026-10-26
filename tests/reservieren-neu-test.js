// NEUES RESERVIEREN (Ibo, 19.10.2026: Entwurf "BAUEN 1-4" in die App).
//
// Schritt 1: Personen -/+, Kalender, Uhrzeit mit Mittag/Abend-Umschalter,
// flacher Kurve und Knoepfen, Ticket. Schritt 2: Kopf, Ticket, Felder in
// einer Karte, Tippfehler-Hilfe fuer die E-Mail, Anlass als Knoepfe,
// Wunsch, drei Zusagen. Im Browser: werkzeug/reservieren-ansehen.js.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }
var esc = function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };

// ---- Tippfehler in der E-Mail ----
var mv = H.match(/var RES_MAIL_DOMAINS = \[[^\]]+\];/)[0];
var V = new Function(mv + fn('resMailVorschlag') + '; return resMailVorschlag;')();
t('gmial.com -> gmail.com', V('Lena@gmial.com') === 'lena@gmail.com', V('Lena@gmial.com'));
t('gmx.dd -> gmx.de, web.dee -> web.de, t-onlin.de -> t-online.de', V('a@gmx.dd') === 'a@gmx.de' && V('a@web.dee') === 'a@web.de' && V('a@t-onlin.de') === 'a@t-online.de', V('a@gmx.dd') + ' ' + V('a@web.dee'));
t('richtige Adresse: kein Vorschlag', V('a@gmail.com') === '' && V('a@web.de') === '', '');
t('eigene Firmen-Domain: kein Vorschlag (nicht raten)', V('chef@die-millis.de') === '' && V('x@kiekmolin.de') === '', V('chef@die-millis.de'));
t('keine Adresse / unvollständig: nichts', V('') === '' && V('lena') === '' && V('a@') === '', '');

// ---- Zusagen: nichts versprechen, was nicht stimmt ----
var Z = new Function('window', fn('resZusagenHtml') + '; return resZusagenHtml;');
var zOhne = Z({})({ features: [] }), zMit = Z({})({ features: ['auto_confirm_reservations'] }), zAnfrage = Z({ _resNurAnfrage: true })({ features: ['auto_confirm_reservations'] });
t('ohne Auto-Bestätigung: KEIN "Sofort bestätigt"', zOhne.indexOf('Sofort') === -1 && /Antwort per E-Mail/.test(zOhne), '');
t('mit Auto-Bestätigung: "Sofort bestätigt"', /Sofort bestätigt/.test(zMit), '');
t('Nur-Anfrage (Belegung nicht prüfbar): auch mit Auto NICHT sofort', zAnfrage.indexOf('Sofort') === -1, '');
t('Zusagen stehen erst in Schritt 2, unter dem Knopf', /<div id="resZusagen"><\/div>/.test(H) && /#reservationModal:not\(\.res-schritt2\) #resZusagen \{ display: none !important; \}/.test(H.replace(/,\n\s*/g, ' ').replace(/#reservationModal:not\(\.res-schritt2\) \.res-footer-summary #reservationModal:not\(\.res-schritt2\) #resAb18 /, '')) || /#reservationModal:not\(\.res-schritt2\) #resZusagen/.test(H), '');

// ---- Uhrzeit-Knoepfe + Kurve ----
var S = new Function('nochTischeHtml', fn('resSlotLast') + fn('resSlotsHtml') + '; return resSlotsHtml;')(function (s) { return s.nochTische ? '<span class="slot-noch">noch ' + s.nochTische + '</span>' : ''; });
var h = S([{ time: '18:00', last: 0.1 }, { time: '19:00', last: 0.75, nochTische: 1 }, { time: '19:30', voll: true, last: 1 }]);
t('je Uhrzeit ein Knopf mit selectSlot (bestehende Logik bleibt)', (h.match(/class="slot-btn res-slot/g) || []).length === 3 && /onclick="selectSlot\(this, '18:00:00', null, ''\)"/.test(h), h.slice(0, 200));
t('volle Zeit: steht da, durchgestrichen, NICHT wählbar', /data-time="19:30"[^>]*disabled aria-label="19:30, ausgebucht"[^>]*res-slot-voll/.test(h) && h.indexOf("selectSlot(this, '19:30:00'") === -1, '');
t('fast voll (ab 70 %): orange, sagt es auch dem Screenreader', /aria-label="19:00, fast voll"/.test(h) && /res-slot-knapp/.test(h), '');
t('"noch N Tische" bleibt', /noch 1<\/span>/.test(h), '');
t('Kurve ist nur Bild (aria-hidden), Höhe aus echter Belegung', /<div class="res-kurve" aria-hidden="true">/.test(h) && /data-time="18:00" style="height:15px;"/.test(h) && /data-time="19:30" style="height:64px;"/.test(h), h.match(/height:\d+px/g));
var R = fn('renderSlotsWithSuggestions');
t('Abend beginnt um 15:00 (vorher fielen 15:00–16:59 still heraus)', /s\.time >= '15:00'/.test(R) && R.indexOf("'17:00'") === -1, '');
t('keine freie Zeit -> "Ausgebucht" + Anruf-Knopf (ohne Nummer Warteliste)', /if \(!frei\.length\) \{/.test(R) && /kmi-res-ausgebucht/.test(R) && /ausgebuchtAngebotSetzen\(/.test(R), '');
var L = fn('loadAvailableSlots');
t('volle Zeiten bleiben in der Liste (voll: !available), vergangene fliegen raus', /voll: !available/.test(L) && /\.filter\(function\(s\) \{ return s !== null; \}\)/.test(L) && /slotM <= currentMin\)\) return null;/.test(L), '');
t('neuer Tag: alte Uhrzeit wird gelöscht und Schritt 1 gezeigt', /document\.getElementById\('reservationTime'\)\.value = '';\s*resSchritt\(1\);/.test(L), '');

// ---- Personen ----
var gridEl = { innerHTML: '' };
var G = new Function('document', '_resSelectedGuests', fn('resGuestRender') + '; return resGuestRender;');
G({ getElementById: function () { return gridEl; } }, 1)();
t('Personen 1: Minus gesperrt, Plus geht auf 2', /res-stepper-minus"[^>]*disabled/.test(gridEl.innerHTML) && /resGuestSelect\(2\)/.test(gridEl.innerHTML) && /1<\/b> Person</.test(gridEl.innerHTML), gridEl.innerHTML);
G({ getElementById: function () { return gridEl; } }, 8)();
t('Personen 8: "8+", Plus gesperrt (Grenze wie vorher)', /8\+<\/b> Personen/.test(gridEl.innerHTML) && /res-stepper-plus"[^>]*disabled/.test(gridEl.innerHTML), '');

// ---- Ablauf ----
var sel = fn('selectSlot');
t('Uhrzeit wählen öffnet NICHT sofort Schritt 2, sondern das Ticket', sel.indexOf("getElementById('reservationStep2').style.display = 'block'") === -1 && /selectedSlotDisplay'\)\.style\.display = 'block'/.test(sel) && sel.indexOf("getElementById('guestName').focus()") === -1, '');
var w = fn('resWeiter');
t('"Weiter" nur mit Datum + Uhrzeit, Knopf nennt die Zeit', /if \(!zeit \|\| !datum\) return;/.test(w) && /'Tisch für ' \+ zeit\.substring\(0, 5\) \+ ' reservieren'/.test(w), '');
t('Öffnen beginnt immer bei Schritt 1', /window\._resTeil = null;\s*if \(typeof resSchritt === 'function'\) resSchritt\(1\);/.test(fn('openReservation')), '');
t('Anlass-Knöpfe schreiben ins bestehende <select> (submitReservation liest occasion)', /sel\.value = sel\.value === v \? '' : v;/.test(fn('resAnlassWaehlen')) && /id="reservationOccasion"[^>]*style="display:none;"/.test(H) && /occasion: document\.getElementById\('reservationOccasion'\)\?\.value/.test(H), '');
t('Ab 18 + Zusagen + Absenden erst in Schritt 2', /#reservationModal:not\(\.res-schritt2\) #resAb18/.test(H) && /#reservationModal:not\(\.res-schritt2\) \.res-footer-summary/.test(H), '');
var inhalt = ((H.match(/KIN-SYMBOLSCHRIFT-INHALT:\s*([a-z0-9_,]+)/) || [])[1] || '').split(',');
t('alle neuen Symbole sind in der Symbolschrift', ['group', 'remove', 'add', 'light_mode', 'dark_mode', 'confirmation_number', 'arrow_forward', 'person', 'call', 'mail', 'cake', 'favorite', 'work', 'local_bar', 'star', 'savings', 'mark_email_read', 'mark_email_unread', 'event_busy', 'schedule', 'hourglass_top'].every(function (s) { return inhalt.indexOf(s) >= 0; }),
  ['group', 'remove', 'add', 'light_mode', 'dark_mode', 'confirmation_number', 'arrow_forward', 'person', 'call', 'mail', 'cake', 'favorite', 'work', 'local_bar', 'star', 'savings', 'mark_email_read', 'mark_email_unread', 'event_busy', 'schedule', 'hourglass_top'].filter(function (s) { return inhalt.indexOf(s) < 0; }));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
