// STARTSEITE: "Jetzt geöffnet" + echte Zahlen im Kopf.
//
// Im Kopf stand fest "2 Restaurants in Greetsiel" und "Italienisch &
// Norddeutsche Kueche" -- kein Skript hat es je angepasst. Jetzt zaehlt
// heuteAbendZeichnen() echte Haeuser; die Leiste zeigt, wer offen hat,
// laufende Aktionen zuerst.
//
// Bewusst KEIN "Tisch frei" in der Leiste: getTableAvailabilityByTime nimmt
// bei Ladefehlern 13 Tische an. Gegenprobe: feste Zahl zurueck, Leiste mit
// geschlossenem Lokal, "Tisch frei" eingebaut -- jedes rot.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

t('keine feste Zahl mehr im Kopf', !/>2 Restaurants in Greetsiel</.test(H) && !/data-i18n="tagline">Italienisch & Norddeutsche Küche/.test(H), '');
t('Leiste "Jetzt geöffnet" vorhanden', /<section id="heuteAbend" class="heute-abend"/.test(H), '');
t('wird nach jeder Liste neu gezeichnet', /try \{ heuteAbendZeichnen\(\); \} catch \(e\)/.test(H), '');

// wirklich ausfuehren
var el = {};
function E(id) { return el[id] || (el[id] = { id: id, textContent: '', innerHTML: '', style: {} }); }
var offen = { r1: true, r2: true, r3: false };
var aktionen = { r2: [{ titel: 'Happy Hour', gilt_fuer: 'alle' }] };
var sb = {
  APP_DATA: { restaurants: [
    { id: 'r1', name: 'Zum Fischkutter', city: 'Greetsiel', cuisine_type: ['Fisch'], is_active: true, image: 'data:image/gif;base64,x', rating: 4.6 },
    { id: 'r2', name: 'Hafenbar', city: 'Greetsiel', cuisine_type: ['Bar'], is_active: true, image: 'https://bild/bar.jpg', rating: 4.2 },
    { id: 'r3', name: 'Teestube', city: 'Greetsiel', cuisine_type: ['Café'], is_active: true, rating: 4.8 },
    { id: 'r4', name: 'Alt', city: 'Norden', is_active: false }
  ] },
  document: { getElementById: E },
  checkIfOpen: function (r) { return !!offen[r.id]; },
  getClosingTimeToday: function () { return '22:00'; },
  kuechenListe: function (r) { return (r.cuisine_type || []).join(', '); },
  kuecheLabel: function (k) { return k; },
  escapeHtml: function (s) { return String(s).replace(/[&<>"']/g, ''); },
  aktionenLaden: function (id) { return Promise.resolve(aktionen[id] || []); },
  aktionLaeuftJetzt: function () { return true; },
  Promise: Promise, Date: Date, Math: Math, String: String, Object: Object, console: console
};
vm.createContext(sb);
vm.runInContext('var _heuteAbendLauf = 0;\n' + fn('heuteAbendZeichnen'), sb);
sb.heuteAbendZeichnen();
t('Kopf zaehlt nur aktive Haeuser und die offenen', E('heroRestCount').textContent === '3 Restaurants in Greetsiel · 2 jetzt offen', E('heroRestCount').textContent);
t('Unterzeile aus echten Kuechen', /Fisch/.test(E('heroTagline').textContent) && /Bar/.test(E('heroTagline').textContent), E('heroTagline').textContent);
var html = E('heuteAbendReihe').innerHTML;
t('nur offene Lokale in der Leiste', /Zum Fischkutter/.test(html) && /Hafenbar/.test(html) && !/Teestube/.test(html), html.slice(0, 120));
t('"Offen bis 22:00" auf der Karte', /Offen bis 22:00/.test(html), '');
t('Platzhalter-GIF wird nicht als Bild gezeigt (Anfangsbuchstabe)', /<b aria-hidden="true">Z<\/b>/.test(html), '');
t('kein "Tisch frei" (koennte erfunden sein)', !/Tisch frei/.test(html) && !/getTableAvailabilityByTime/.test(fn('heuteAbendZeichnen')), '');
setTimeout(function () {
  var h2 = E('heuteAbendReihe').innerHTML;
  t('laufende Aktion: Karte ruckt nach vorn und ist gold', h2.indexOf('Hafenbar') < h2.indexOf('Zum Fischkutter') && /ha-karte aktion/.test(h2) && /Läuft gerade · Happy Hour/.test(h2), h2.slice(0, 160));
  offen = { r1: false, r2: false, r3: false };
  sb.heuteAbendZeichnen();
  t('niemand offen: ehrlicher Satz statt leerer Leiste', /Gerade hat kein Lokal geöffnet/.test(E('heuteAbendReihe').innerHTML), E('heuteAbendReihe').innerHTML);
  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
}, 50);
