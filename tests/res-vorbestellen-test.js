// ESSEN MIT DER RESERVIERUNG VORBESTELLEN (30.10.2026). Ibo: "ja mach 1".
// Der Test FUEHRT die Bausteine aus und prueft, dass submitOrder sie nutzt.
'use strict';
process.env.TZ = 'Europe/Berlin';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var fenster = {}, nurKarte = false, gesperrt = false;
var X = new Function('window', 'nurSpeisekarte', 'zahlsperreBestellenAus', 'currentOrderRestaurant',
    'var RES_VORBEST = "res_vorbestellen";\n' + ['resVorbestAn', 'resVorbestMoeglich', 'resVorbestZeitpunkt', 'resVorbestKuechenText', 'resVorbestAktiv'].map(fn).join('\n')
    + '; return { an: resVorbestAn, moeglich: resVorbestMoeglich, zeit: resVorbestZeitpunkt, text: resVorbestKuechenText, aktiv: function (r) { currentOrderRestaurant = r; return resVorbestAktiv(); } };')(
    fenster, function () { return nurKarte; }, function () { return gesperrt; }, null);

// ---- Der Wirt entscheidet ----
t('ohne Eintrag: aus (keiner bekommt Vorbestellungen, die er nicht wollte)', X.an({ features: [] }) === false && X.an({}) === false, '');
t('eingeschaltet: an', X.an({ features: ['x', 'res_vorbestellen'] }) === true, '');
t('Knopf nur, wenn auch bestellt werden kann ("Nur Speisekarte" -> kein Knopf)', X.moeglich({ features: ['res_vorbestellen'] }) === true && (nurKarte = true, !X.moeglich({ features: ['res_vorbestellen'] })), '');
nurKarte = false;
t('… Zahlsperre -> kein Knopf', (gesperrt = true, !X.moeglich({ features: ['res_vorbestellen'] })), '');
gesperrt = false;

// ---- Zeitpunkt und Kuechen-Text ----
t('Zeitpunkt = Uhrzeit des Tisches (deutsche Zeit, Winter)', X.zeit('2026-10-31', '19:00') === '2026-10-31T18:00:00.000Z', X.zeit('2026-10-31', '19:00'));
t('… Sommerzeit', X.zeit('2026-07-15', '19:30:00') === '2026-07-15T17:30:00.000Z', X.zeit('2026-07-15', '19:30:00'));
t('… kaputte Angaben -> nichts', X.zeit('', '19:00') === null && X.zeit('2026-10-31', '') === null, '');
var kt = X.text({ date: '2026-10-31', time: '19:00:00', partySize: '4', guestName: 'Meyer' });
t('Kuechen-Text mit festem Datum (nicht "morgen"), Uhrzeit, Personen, Name', kt === 'Reservierung Sa., 31.10., 19:00 Uhr · 4 Personen · Meyer', kt);

// ---- Nur fuer das richtige Lokal, nicht fuer alte Reservierungen ----
fenster._resVorbest = { restaurantId: 'r1', iso: new Date(Date.now() + 86400000).toISOString(), text: 'x' };
t('gilt im Lokal der Reservierung', X.aktiv({ id: 'r1' }) === fenster._resVorbest, '');
t('… nicht in einem anderen Lokal', X.aktiv({ id: 'r2' }) === null, '');
fenster._resVorbest = { restaurantId: 'r1', iso: new Date(Date.now() - 5 * 3600000).toISOString(), text: 'x' };
t('Reservierung von vorhin (vorbei) traegt keine Vorbestellung mehr', X.aktiv({ id: 'r1' }) === null && fenster._resVorbest === null, '');

// ---- Einbau ----
var so = fn('submitOrder');
t('submitOrder: zur Reservierung immer "Hier essen"', /var _resVb = \(typeof resVorbestAktiv === 'function'\) \? resVorbestAktiv\(\) : null;\s*if \(_resVb\) orderType = 'dine_in';/.test(so), '');
t('… "jetzt zu"/Bestellschluss gilt nicht (Zeit steht fest)', /if \(_osRest && _hasHours && !_resVb\)/.test(so), '');
t('… Zeitpunkt + Text gehen in die vorhandene Vorbestellung (scheduled_at + Notiz)', /if \(_resVb\) \{\s*window\._vorbestellungFuer = _resVb\.iso;\s*window\._vorbestellungText = _resVb\.text;/.test(so) && /_orderPayload\.scheduled_at = window\._vorbestellungFuer;/.test(so), '');
t('… kein alter QR-Tisch', /var tableNumber = _resVb \? null :/.test(so), '');
t('… erst NACH dem Speichern geloest (scheitert es, bleibt die Vorbestellung)', so.indexOf('if (_resVb) { window._resVorbest = null;') > so.indexOf('zeigeBestellungFehlgeschlagen(_saveErr);'), '');
t('Bestaetigung zeigt den Knopf nur, wenn moeglich', /\(resVorbestMoeglich\(r\) \? '<button type="button" class="kmi-resok-vorbest" onclick="resVorbestStarten\(\);/.test(fn('showReservationConfirmation')), '');
t('Speisekarte zeigt den Hinweis mit "Doch nicht"', /resVorbestBanner\(\);/.test(fn('openMenuModal')) && /onclick="resVorbestAbbrechen\(\)">Doch nicht/.test(fn('resVorbestBanner')), '');
t('Einstellung unter "Zeiten": Aus/An, speichert mit Rueckmeldung', /id="resVorbestWahl"[^>]*onchange="resVorbestSpeichern\(this\.value === 'an'\)"/.test(H) && /NICHT gespeichert – die Datenbank hat die Änderung nicht übernommen/.test(fn('resVorbestSpeichern')) && /resVorbestAnzeigen\(restaurant\)/.test(fn('loadResSettingsUI')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
