// KARTE NACH DEM ENTWURF (07.10.2026) -- Claude Design "Die Karte".
//
// Laeuft echt in einer Sandbox: karteZustand, Schild, Art, Filter,
// Abendmodus. Den Browser (Nadeln, Kontrast, Zeitregler, Karte unten)
// misst werkzeug/karte-messen.js (72 Pruefungen, hell, Abend, dunkel).
//
// Gegenprobe (jede rot): ohne karteZeitenDa (Annahme 11-22 kaeme zurueck),
// Aktion auch bei "zu", Schild bei "zu", Sonnenrechnung mit falschem
// Vorzeichen, freeTables-Ring zurueck. (Schild bei "zu" ist seit dem
// Nachbau 1:1 gewollt: "Café · zu" im Entwurf.)
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }
var a = H.indexOf('var KARTE_TROPFEN'), b = H.indexOf('function karteArt(');
var sb = { window: {}, Math: Math, Date: Date, String: String, Object: Object, JSON: JSON, isFinite: isFinite,
  getVacationInfo: function () { return null; },
  kuechenListe: function (r) { return { fisch: 'Fisch', shisha: 'Shisha' }[(r.cuisine_type || [])[0]] || ''; },
  escapeHtml: function (s) { return String(s); } };
vm.createContext(sb);
vm.runInContext(H.slice(a, b) + ['karteArt', 'karteZeichen', 'karteZeitenDa', 'aktiveSchicht', 'parseTime', 'karteZustand', 'karteSchild', 'karteNachSonnenuntergang', 'karteFilterPasst', 'aktionLaeuftJetzt', 'aktionPasst', 'aktionMinuten', 'aktionDatumVon', 'aktionWochentag'].map(fn).join('\n') + '\nwindow._karteAktionen = {};', sb);
var tage = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
function oh(v, bis) { var o = {}; tage.forEach(function (x) { o[x + '_start'] = v; o[x + '_end'] = bis; }); return o; }
var um = function (h, m) { var d = new Date(2026, 9, 7, h, m || 0); return d; };
var fisch = { id: 'f', cuisine_type: ['fisch'], opening_hours: oh('11:30', '22:00') };
var z = sb.karteZustand(fisch, um(19));
t('19:00: offen bis 22:00', z.art === 'offen' && z.bis === '22:00', JSON.stringify(z));
t('Schild "Fisch · bis 22"', sb.karteSchild(fisch, z) === 'Fisch · bis 22', sb.karteSchild(fisch, z));
z = sb.karteZustand(fisch, um(23));
// Seit dem Nachbau 1:1 (07.10.2026, Ibo: "ich will die karte ... aus Claude
// Design"): auch "zu" hat ein Schild, grau -- im Entwurf "Café · zu".
t('23:00: zu, Schild "Fisch · zu"', z.art === 'zu' && sb.karteSchild(fisch, z) === 'Fisch · zu', JSON.stringify(z) + ' ' + sb.karteSchild(fisch, z));
var ohne = { id: 'o', cuisine_type: ['cafe'] };
t('ohne Zeiten: "unbekannt" -- nicht die Annahme 11-22 Uhr', sb.karteZustand(ohne, um(15)).art === 'unbekannt' && /nicht eingetragen/.test(sb.karteZustand(ohne, um(15)).text), JSON.stringify(sb.karteZustand(ohne, um(15))));
var bar = { id: 'b', cuisine_type: ['shisha'], opening_hours: oh('18:00', '03:00') };
sb.window._karteAktionen.b = [{ titel: 'Happy Hour', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4, 5, 6], von: '18:00', bis: '21:00' }];
z = sb.karteZustand(bar, um(19, 30));
t('Bar 19:30 mit Happy Hour: Aktion, Schild = Titel', z.art === 'aktion' && sb.karteSchild(bar, z) === 'Happy Hour', JSON.stringify(z));
z = sb.karteZustand(bar, um(1));
t('Bar 01:00 (Nachtschicht von gestern): offen, Happy Hour vorbei', z.art === 'offen' && z.bis === '03:00', JSON.stringify(z));
sb.window._karteAktionen.b = [{ titel: 'Brunch', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4, 5, 6], von: '10:00', bis: '12:00' }];
t('Aktion laeuft, Lokal aber zu: keine Aktion zeigen', sb.karteZustand(bar, um(11)).art === 'zu', JSON.stringify(sb.karteZustand(bar, um(11))));
t('nur fuer Reservierung: keine Aktion auf der Karte', (function () { sb.window._karteAktionen.b = [{ titel: 'X', gilt_fuer: 'reservierung', wochentage: [0, 1, 2, 3, 4, 5, 6] }]; return sb.karteZustand(bar, um(20)).art === 'offen'; })(), '');
t('Art: Fisch, Pizza (italienisch), Bar (shisha), Cafe, sonst Restaurant',
  sb.karteArt(fisch) === 'fisch' && sb.karteArt({ cuisine_type: ['italienisch'] }) === 'pizza' && sb.karteArt(bar) === 'bar' && sb.karteArt(ohne) === 'cafe' && sb.karteArt({ cuisine: 'Steakhouse' }) === 'restaurant', '');
var inhalt = (H.match(/KIN-SYMBOLSCHRIFT-INHALT: ([a-z_0-9,]+)/) || [, ''])[1].split(',');
t('Nadel-Zeichen sind SVG aus dem Entwurf (kein Schrift-Symbol, das als WORT erscheinen kann); Herz steckt in der Schrift',
  Object.keys(sb.KARTE_ZEICHEN).length === 6 && !/material-symbols/.test(fn('karteNadel')) && inhalt.indexOf('favorite') > -1, '');
// Abendmodus: 21. Juni 22:30 MESZ (20:30 UTC) noch hell? Sonnenuntergang Greetsiel ~22:05 MESZ -> dunkel.
t('Abendmodus: 7. Okt 20:00 MESZ dunkel, 14:00 hell', sb.karteNachSonnenuntergang(new Date(Date.UTC(2026, 9, 7, 18, 0))) === true && sb.karteNachSonnenuntergang(new Date(Date.UTC(2026, 9, 7, 12, 0))) === false, '');
t('Abendmodus: 21. Juni 21:30 MESZ noch hell, 22:45 dunkel', sb.karteNachSonnenuntergang(new Date(Date.UTC(2026, 5, 21, 19, 30))) === false && sb.karteNachSonnenuntergang(new Date(Date.UTC(2026, 5, 21, 20, 45))) === true, '');
sb.window._karteFilter = 'offen';
t('Filter "Jetzt offen": offen und Aktion ja, zu und ohne Zeiten nein', sb.karteFilterPasst(fisch, { art: 'offen' }) && sb.karteFilterPasst(bar, { art: 'aktion' }) && !sb.karteFilterPasst(fisch, { art: 'zu' }) && !sb.karteFilterPasst(ohne, { art: 'unbekannt' }), '');
sb.window._karteFilter = 'teetied';
t('Teetied: Cafes und Baeckereien, die nicht zu sind', sb.karteFilterPasst(ohne, { art: 'unbekannt' }) && !sb.karteFilterPasst(fisch, { art: 'offen' }), '');
function ohneKommentar(x) { return x.split('\n').filter(function (z) { return !/^\s*\/\//.test(z); }).join('\n'); }
var mm = ohneKommentar(fn('updateMapMarkers')), fm = ohneKommentar(fn('updateFullscreenMarkers')), card = ohneKommentar(fn('_updateMapFloatingCard'));
t('keine freeTables-Ampel mehr an den Nadeln', !/freeTables/.test(mm) && !/freeTables/.test(fm) && /karteNadel\(r, karteZustand\(r\), false\)/.test(mm), '');
t('Karte unten: kein erfundener Satz, kein "Tische frei", Bestellen/Reservieren nach features', !/frische Gerichte|Tische frei/.test(card) && /no_reservations/.test(card) && /no_ordering/.test(card), '');
t('alte 9-px-Regeln fuer die Karte unten sind weg', !/#mapCardMeta \{\s*font-size: 9px/.test(H) && !/#mapCardReserveBtn, #mapCardOrderBtn \{\s*padding: 10px 8px !important;\s*font-size: 10px/.test(H), '');
t('Kartenbild: nie src = "" (sonst bleibt der Fehler-Stil am naechsten Foto haengen), Fehler -> Anfangsbuchstabe',
  !/img\.src = echt \? r\.image : ''/.test(card) && /img\.removeAttribute\('src'\)/.test(card) && /img\.style\.objectFit = ''/.test(card) && /img\.onerror = function/.test(card), '');
t('Messwerkzeug liegt bei', fs.existsSync(path.join(__dirname, '..', 'werkzeug', 'karte-messen.js')), '');
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
