// GERADE BEI UNS (07.10.2026): ruhig / ca. 30 Min. / voll -- vom Wirt per
// Tipp, Gaeste sehen es auf Karte, Leiste "Jetzt geoeffnet" und Lokalseite.
//
// Hier laeuft der echte Code in einer Sandbox:
//   - der Eintrag laeuft nach 2 Stunden von selbst ab
//   - bei geschlossenem Lokal sieht der Gast nichts
//   - Speichern ohne Recht (RLS: 200 mit leerer Liste) ist ein FEHLER
//   - andere features (Ferien, no_reservations) bleiben beim Speichern stehen
//
// Gegenprobe (jede rot): Ablauf-Pruefung "bis <= jetzt" entfernt,
// checkIfOpen-Pruefung entfernt, Leer-Pruefung nach dem PATCH entfernt,
// Filter auf "andrang:" entfernt (doppelte Eintraege).
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; if (H.slice(i - 6, i) === 'async ') i -= 6; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }
var kopf = H.slice(H.indexOf('var ANDRANG = {'), H.indexOf('function andrangInfo('));

var offen = true, el = {}, toast = null, db = { features: ['no_reservations', 'vacation:2026-12-24:2026-12-26'] }, rlsLeer = false, gepatcht = null;
function E(id) { return el[id] || (el[id] = { textContent: '', querySelectorAll: function () { return []; } }); }
var sb = {
  window: {}, document: { getElementById: E, addEventListener: function () {} },
  checkIfOpen: function () { return offen; },
  APP_DATA: { restaurants: [{ id: 'r1', features: [] }] },
  SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k', kmiToken: function () { return 'k'; },
  getControlRestaurantId: function () { return 'r1'; },
  showToast: function (m) { toast = m; },
  sbRead: function () { return Promise.resolve({ json: function () { return Promise.resolve([{ features: db.features.slice() }]); } }); },
  fetch: function (u, o) {
    gepatcht = JSON.parse(o.body).features;
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(rlsLeer ? [] : [{ id: 'r1', features: gepatcht }]); } });
  },
  Array: Array, Date: Date, String: String, JSON: JSON, Promise: Promise, Error: Error, isNaN: isNaN
};
vm.createContext(sb);
vm.runInContext(kopf + fn('andrangInfo') + '\n' + fn('andrangHtml') + '\n' + fn('andrangUI') + '\n' + fn('andrangSetzen'), sb);

var in1h = new Date(Date.now() + 3600000).toISOString(), vor1m = new Date(Date.now() - 60000).toISOString();
var a = sb.andrangInfo({ features: ['no_ordering', 'andrang:voll:' + in1h] });
t('"voll" fuer die naechste Stunde wird erkannt', a && a.stufe === 'voll' && /voll/.test(a.text), JSON.stringify(a));
t('abgelaufen (vor 1 Minute) -> nichts', sb.andrangInfo({ features: ['andrang:voll:' + vor1m] }) === null, '');
t('kaputtes Datum -> nichts (statt fuer immer)', sb.andrangInfo({ features: ['andrang:voll:morgen'] }) === null, '');
t('unbekannte Stufe -> nichts', sb.andrangInfo({ features: ['andrang:egal:' + in1h] }) === null, '');
t('Gast sieht "Gerade voll – lieber reservieren"', /kmi-andrang voll/.test(sb.andrangHtml({ features: ['andrang:voll:' + in1h] }, false)) && /Gerade voll – lieber reservieren/.test(sb.andrangHtml({ features: ['andrang:voll:' + in1h] }, false)), '');
t('kurze Form fuer die kleine Karte', /ca\. 30 Min\. warten/.test(sb.andrangHtml({ features: ['andrang:warten:' + in1h] }, true)), '');
t('ohne Reservierung kein "lieber reservieren"', /Gerade voll<\/span>$/.test(sb.andrangHtml({ features: ['no_reservations', 'andrang:voll:' + in1h] }, false)), sb.andrangHtml({ features: ['no_reservations', 'andrang:voll:' + in1h] }, false));
offen = false;
t('Lokal geschlossen -> Gast sieht nichts', sb.andrangHtml({ features: ['andrang:ruhig:' + in1h] }, false) === '', '');
offen = true;

(async function () {
  var vorher = Date.now();
  var erg = await sb.andrangSetzen('warten');
  var neu = (gepatcht || []).filter(function (f) { return /^andrang:/.test(f); });
  t('Speichern: genau ein Eintrag, andere features bleiben', erg === true && neu.length === 1 && gepatcht.indexOf('no_reservations') > -1 && gepatcht.indexOf('vacation:2026-12-24:2026-12-26') > -1, JSON.stringify(gepatcht));
  var bis = new Date(neu[0].split(':').slice(2).join(':')).getTime();
  t('gilt zwei Stunden', Math.abs(bis - vorher - 120 * 60000) < 5000, new Date(bis).toISOString());
  t('Dashboard sagt, was Gaeste sehen und bis wann', /Gäste sehen: „Gerade ca\. 30 Min\. Wartezeit“ – bis \d\d:\d\d Uhr/.test(E('andrangStand').textContent), E('andrangStand').textContent);
  db.features = gepatcht.slice();
  await sb.andrangSetzen('voll');
  t('Umschalten ersetzt den alten Eintrag (kein doppelter)', gepatcht.filter(function (f) { return /^andrang:/.test(f); }).length === 1 && /andrang:voll:/.test(gepatcht.join()), JSON.stringify(gepatcht));
  db.features = gepatcht.slice();
  await sb.andrangSetzen('');
  t('"Normal" entfernt den Eintrag', !gepatcht.some(function (f) { return /^andrang:/.test(f); }) && E('andrangStand').textContent === 'Gäste sehen nichts Besonderes.', JSON.stringify(gepatcht));
  rlsLeer = true; toast = null;
  erg = await sb.andrangSetzen('voll');
  t('ohne Recht (leere Antwort): FEHLER, nicht "gespeichert"', erg === false && /Nicht gespeichert/.test(E('andrangStand').textContent) && /nicht gespeichert/.test(toast || ''), E('andrangStand').textContent);

  t('Karte, Leiste und Lokalseite zeigen es', /andrangHtml\(r, false\); return _a \? '<div class="card-andrang">'/.test(H) && /andrangHtml\(r, true\)/.test(fn('heuteAbendZeichnen')) && /andrangHtml\(rest, false, 'lp-fakt'\)/.test(fn('lpVisitenkarte')), '');
  t('Dashboard pflegt den Stand beim Laden mit', /if \(typeof andrangUI === 'function'\) andrangUI\(features\);/.test(H), '');
  // Die Symbolschrift ist eine Teilmenge: ein Zeichen, das nicht drin ist,
  // erscheint als WORT ("HOURGLASS_TOP"). Gemessen am 07.10.2026 genau so.
  var inhalt = (H.match(/KIN-SYMBOLSCHRIFT-INHALT: ([a-z_0-9,]+)/) || [, ''])[1].split(',');
  var fehlt = Object.keys(sb.ANDRANG).map(function (k) { return sb.ANDRANG[k].icon; }).concat(['groups']).filter(function (i) { return inhalt.indexOf(i) < 0; });
  t('alle Symbole stecken in der eingebauten Symbolschrift', inhalt.length > 100 && !fehlt.length, fehlt.join(', '));
  t('Farben im Dunkeln eigene Regeln', /\.dark-mode \.kmi-andrang\.voll \{/.test(H) && /\.dark-mode \.kmi-andrang\.warten \{/.test(H) && /\.dark-mode \.kmi-andrang\.ruhig \{/.test(H), '');

  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
