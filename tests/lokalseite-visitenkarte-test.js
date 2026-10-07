// LOKALSEITE ALS VISITENKARTE -- offen?, wie weit?, anrufen; Platzhalter
// ohne Foto; Selbstcheck meldet fehlendes Foto.
//
// Der Offen-Status wurde auf der Lokalseite berechnet (landingIsOpen ...),
// aber nie angezeigt. Das Logo wurde gebaut (logoHtml), aber nie eingesetzt.
// Ohne Foto zeigte die Seite ein gestrecktes 1x1-GIF.
//
// Die Funktion laeuft hier in einer Sandbox. Gegenprobe: getOpeningTimeToday
// statt der eingetragenen Zeit (erfindet "11:00"), Telefon ungefiltert,
// Platzhalter-GIF als Foto gezaehlt -- jedes rot.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

// Uhr fest auf 09:00: die erfundene "11:00" faellt nur VOR 11 Uhr auf --
// mit der echten Uhr haette der Test abends die Gegenprobe verschlafen.
var NEUN = new Date(); NEUN.setHours(9, 0, 0, 0);
function FesteUhr(a) { return arguments.length ? new Date(a) : new Date(NEUN.getTime()); }
FesteUhr.prototype = Date.prototype;
var sb = { escapeHtml: function (s) { return String(s).replace(/[&<>"']/g, ''); }, Date: FesteUhr, Math: Math, String: String, isFinite: isFinite };
vm.createContext(sb);
vm.runInContext(fn('lpVisitenkarte') + '\n' + fn('getDistanceKm'), sb);
var V = sb.lpVisitenkarte;

t('offen mit Schlusszeit: "Offen bis 22:00"', /Offen bis 22:00/.test(V({}, true, '22:00:00')), V({}, true, '22:00:00'));
t('offen ohne Schlusszeit: "Jetzt geöffnet"', /Jetzt geöffnet/.test(V({}, true, '')), '');
var hhmm = '17:00', tage = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'], oh = {}; oh[tage[NEUN.getDay()] + '_start'] = hhmm;
t('geschlossen, oeffnet spaeter: "Öffnet heute ' + hhmm + '"', V({ opening_hours: oh }, false, '').indexOf('Öffnet heute ' + hhmm) > -1, V({ opening_hours: oh }, false, ''));
t('geschlossen OHNE eingetragene Zeit: keine erfundene Uhrzeit, "Gerade geschlossen"',
  /Gerade geschlossen/.test(V({ opening_hours: null }, false, '')) && !/11:00/.test(V({ opening_hours: null }, false, '')), V({}, false, ''));
t('Telefon: nur Ziffern und + im tel:-Link', /href="tel:\+494926123456"/.test(V({ phone: '+49 (4926) 123-456"><script>' }, true, '')), V({ phone: '+49 (4926) 123-456' }, true, ''));
t('kein Telefon: kein Anrufen-Knopf', !/Anrufen/.test(V({ phone: '' }, true, '')), '');
sb._userLat = 53.505; sb._userLng = 7.105;
t('Standort bekannt, nah: "N Min. zu Fuß"', /\d+ Min\. zu Fuß/.test(V({ lat: 53.5, lng: 7.1 }, true, '')), V({ lat: 53.5, lng: 7.1 }, true, ''));
t('Standort bekannt, weit: km mit Komma', /\d+,\d km/.test(V({ lat: 53.3, lng: 7.4 }, true, '')), V({ lat: 53.3, lng: 7.4 }, true, ''));
sb._userLat = null;
t('Standort unbekannt: keine Entfernung', !/Fuß| km/.test(V({ lat: 53.5, lng: 7.1 }, true, '')), '');

t('Visitenkarte steht unter dem Ort im Kopf der Lokalseite', /\$\{lpVisitenkarte\(rest, landingIsOpen, landingCloseTime\)\}/.test(H), '');
t('Logo wird jetzt eingesetzt (vorher gebaut, nie benutzt)', /\$\{logoHtml\}\s*<div style="display:flex;justify-content:center;gap:4px;margin-bottom:16px;">/.test(H), '');
t('Logo ohne Schatten', /var logoHtml = rest\.logo \? '<div style="[^"]*"/.test(H) && !/var logoHtml = rest\.logo \? '<div style="[^"]*box-shadow/.test(H), '');
t('Platzhalter-GIF zaehlt nicht als Foto (Lokalseite)', /var lpEchtesFoto = !!\(rest\.image && !\/\^data:image\\\/gif\/\.test\(rest\.image\)\);/.test(H), '');
t('ohne Foto: gestalteter Grund mit Anfangsbuchstaben', /class="\$\{lpEchtesFoto \? '' : 'lp-ohne-foto'\}"/.test(H) && /\.lp-ohne-foto span \{/.test(H), '');
t('Diashow blendet das Platzhalter-GIF nicht ein', /imgs = imgs\.filter\(function \(u\) \{ return u && !\/\^data:image\\\/gif\/\.test\(u\); \}\);/.test(H), '');
t('Selbstcheck prueft Foto, Logo, Oeffnungszeiten', /titel: 'Foto, Logo, Öffnungszeiten'/.test(H) && /_hatFoto = !!\(_a\.image_url && !\/\^data:\/\.test\(_a\.image_url\)\)/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
