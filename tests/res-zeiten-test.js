// RESERVIERUNGSZEITEN: GESPEICHERT, ABER OHNE WIRKUNG.
//
// Ibo, 14.10.2026: "beim reservierungen der zeit ... speichert er nimmt
// nichts an" (Dashboard > Reservierungen > Einstellungen > Reservierungszeiten).
//
// Gemessen (Supabase edge_logs 19:19-19:21 UTC): fuenf Speicher-Versuche
// fuer Lokal a599f99c, angemeldet, Antwort 204 mit content-range 0-0/* --
// die Zeile WURDE geaendert. Die Wirkung fehlte: hat ein Lokal
// Oeffnungszeiten pro Wochentag (mo_start ...), rechnete
// generateReservationSlots NUR damit, Beginn/Ende von hier wurden still
// ignoriert. Ob Luett Italia solche Zeiten hat, ist von hier nicht
// messbar (Supabase fuer dieses Werkzeug gesperrt).
//
// Jetzt: wer hier speichert (opening_hours.res_fenster), begrenzt die
// Uhrzeiten auch an solchen Tagen. Die Karte sagt, was gilt. Und
// "gespeichert" erscheint nur, wenn die Zeile wirklich geaendert wurde.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

var APP_DATA = { restaurants: [] };
var G = new Function('APP_DATA', fn('parseTime') + fn('subtractMinutes') + fn('sonderzeitenVon') + fn('sonderzeitenAm') + fn('reservierSchichtenAm') + fn('generateReservationSlots') + '; return generateReservationSlots;')(APP_DATA);
function lokal(oh) { return { id: 'L', opening_time: '11:00', closing_time: '22:00', slot_interval_minutes: 30, opening_hours: oh }; }
var MONTAG = '2026-10-19', DIENSTAG = '2026-10-20';
var tage = { pause_enabled: false, mo_start: '17:00', mo_end: '23:30' };

APP_DATA.restaurants = [lokal(Object.assign({}, tage))];
var alt = G('L', MONTAG);
t('ohne Speichern hier (alter Stand): Montag nach Öffnungszeit 17:00–23:00', alt[0] === '17:00' && alt[alt.length - 1] === '23:00', alt.join(' '));

APP_DATA.restaurants = [lokal(Object.assign({ res_fenster: true }, tage))];
var neu = G('L', MONTAG);
t('nach Speichern hier (Beginn 11:00, Ende 21:30): Montag nur noch 17:00–21:30', neu[0] === '17:00' && neu[neu.length - 1] === '21:30', neu.join(' '));
APP_DATA.restaurants = [Object.assign(lokal(Object.assign({ res_fenster: true }, tage)), { opening_time: '18:30', closing_time: '21:00' })];
var eng = G('L', MONTAG);
t('Beginn 18:30, Ende 20:30 -> Montag 18:30–20:30 (beides muss passen)', eng.join(' ') === '18:30 19:00 19:30 20:00 20:30', eng.join(' '));
var di = G('L', DIENSTAG);
t('Tag ohne eigene Öffnungszeit: Beginn–Ende von hier wie bisher', di[0] === '18:30' && di[di.length - 1] === '20:30', di.join(' '));
APP_DATA.restaurants = [Object.assign(lokal(Object.assign({ res_fenster: true }, tage)), { opening_time: '12:00', closing_time: '15:00' })];
t('kein Überlapp -> keine Uhrzeiten (nicht still die Öffnungszeit)', G('L', MONTAG).length === 0, G('L', MONTAG).join(' '));

var save = fn('saveResSettings');
t('Speichern setzt res_fenster', /oh\.res_fenster = true;/.test(save), 'fehlt');
t('Speichern mit Antwort (return=representation) statt return=minimal', /'Prefer': 'return=representation'/.test(save) && !/return=minimal/.test(save.replace(/\/\/.*$/gm, '')), 'minimal');
t('leere Antwort (0 Zeilen) -> Fehlermeldung, nicht "gespeichert"', /if \(resp\.ok && \(!Array\.isArray\(_gespeichert\) \|\| !_gespeichert\.length\)\) \{\s*showToast\('Nicht gespeichert/.test(save), 'stiller Erfolg');

var hinweis = new Function('escapeHtml', 'document', fn('resTageHinweis') + '; return resTageHinweis;');
var el = { style: {}, innerHTML: '', textContent: '' };
var TH = hinweis(function (x) { return String(x); }, { getElementById: function () { return el; } });
TH(lokal(Object.assign({}, tage)));
t('Karte zeigt die Wochentags-Zeiten und sagt, dass Beginn–Ende erst nach Speichern gilt', el.style.display === 'block' && /Mo 17:00–23:30/.test(el.innerHTML) && /erst, wenn du einmal auf <b>Speichern<\/b>/.test(el.innerHTML), el.innerHTML);
TH(lokal(Object.assign({ res_fenster: true }, tage)));
t('… nach Speichern: "nur, wo beides passt"', /wo beides passt/.test(el.innerHTML), el.innerHTML);
TH(lokal({ pause_enabled: false }));
t('ohne Wochentags-Zeiten: kein Hinweis', el.style.display === 'none', el.style.display);
t('Hinweis-Feld steht in der Karte und lädt mit', /id="resSettingsTageHinweis"/.test(H) && /resTageHinweis\(restaurant\);\s*\}/.test(fn('loadResSettingsUI')), 'fehlt');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
