// KLEINE MOMENTE -- Stempel nach der Bestellung, "Bis Freitag, 19:00!",
// saubere Kalender-Datei, Knoepfe geben nach.
//
// Die Kalender-Datei wird hier nicht nur gelesen, sondern ERZEUGT: die
// Funktion laeuft in einer Sandbox, Blob und Download werden abgefangen.
// So steht fest, was beim Gast im Kalender ankommt.
//
// Gegenprobe: UID entfernt, Escape entfernt, Moment ohne Erfolgspruefung,
// "transform" statt "scale", reduce-motion-Klammer entfernt -- jedes rot.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

// ---------- Kalender-Datei wirklich erzeugen ----------
var inhalt = null, toast = null;
var sb = {
  APP_DATA: { restaurants: [{ id: 'r1', name: 'Fisch, Bar; Grill', address: 'Am Hafen 3', zip: '26736', city: 'Greetsiel' }] },
  Blob: function (teile) { inhalt = teile.join(''); },
  URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
  document: { createElement: function () { return { click: function () {} }; }, body: { appendChild: function () {}, removeChild: function () {} } },
  showToast: function (m) { toast = m; }, setTimeout: function () {}, Math: Math, Date: Date, String: String, parseInt: parseInt
};
vm.createContext(sb);
vm.runInContext(fn('icsText') + '\n' + fn('addReservationToCalendar') + '\n' + fn('reservierungWann'), sb);
sb.addReservationToCalendar('Fisch, Bar; Grill', '2026-11-13', '19:00', 4, 'r1');
var z = (inhalt || '').split('\r\n');
t('Kalender-Datei wird erzeugt', !!inhalt && z[0] === 'BEGIN:VCALENDAR', inhalt && inhalt.slice(0, 40));
t('UID vorhanden (Pflicht, sonst lehnt Outlook ab)', z.some(function (l) { return /^UID:.+@kiekmolin\.de$/.test(l); }), z.join(' | '));
t('DTSTAMP vorhanden, in UTC', z.some(function (l) { return /^DTSTAMP:\d{8}T\d{6}Z$/.test(l); }), '');
t('Beginn 19:00, Ende zwei Stunden spaeter', z.indexOf('DTSTART:20261113T190000') > -1 && z.indexOf('DTEND:20261113T210000') > -1, z.filter(function (l) { return /^DT/.test(l); }).join(' '));
t('Komma und Semikolon im Namen maskiert', z.indexOf('SUMMARY:Reservierung Fisch\\, Bar\\; Grill') > -1, z.filter(function (l) { return /^SUMMARY/.test(l); })[0]);
t('"Tisch für 4" mit Leerzeichen, Zeilenumbruch als \\n', z.some(function (l) { return /^DESCRIPTION:Tisch für 4 Personen.*\\nGebucht/.test(l); }), z.filter(function (l) { return /^DESCRIPTION/.test(l); })[0]);
t('Adresse im Ort', z.some(function (l) { return /^LOCATION:.*Am Hafen 3\\, 26736 Greetsiel$/.test(l); }), z.filter(function (l) { return /^LOCATION/.test(l); })[0]);
t('Abend ueber Mitternacht: Ende am naechsten Tag', (function () { sb.addReservationToCalendar('X', '2026-11-13', '23:00', 2, 'r1'); return inhalt.indexOf('DTEND:20261114T010000') > -1; })(), '');
t('Knopf holt die Reservierung aus einer Variable, nicht aus einem onclick-Text mit Namen',
  /onclick="kalenderFuerLetzteReservierung\(\);/.test(H) && !/addReservationToCalendar\(\\'' \+ \(reservation\.restaurantName/.test(H), '');

// ---------- "Bis Freitag, 19:00!" ----------
function tagIn(d) { var x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString('sv-SE'); }
t('heute', sb.reservierungWann(tagIn(0), '19:00:00') === 'heute, 19:00', sb.reservierungWann(tagIn(0), '19:00:00'));
t('morgen', sb.reservierungWann(tagIn(1), '19:30') === 'morgen, 19:30', sb.reservierungWann(tagIn(1), '19:30'));
t('in drei Tagen: Wochentag', /^[A-ZÄÖÜ][a-zäöü]+tag|^Mittwoch|^Samstag|^Sonnabend/.test(sb.reservierungWann(tagIn(3), '20:00')) && /, 20:00$/.test(sb.reservierungWann(tagIn(3), '20:00')), sb.reservierungWann(tagIn(3), '20:00'));
t('Bestaetigung sagt "Bis ...!" statt "Vielen Dank!"', /\(isPending \? 'Anfrage gesendet!' : 'Bis ' \+ escapeHtml\(wann\) \+ '!'\)/.test(H), '');
var conf = fn('showReservationConfirmation');
t('Bestaetigung bleibt stehen (kein Auto-Schliessen nach 8 s mehr)', conf.length > 1000 && !/setTimeout/.test(conf), '');
t('kein Push-Knopf in der Bestaetigung -- erinnert wird per E-Mail', !/renderPushOptInBanner/.test(conf), '');
t('Erinnerungs-Satz nur fuer bestaetigt + E-Mail + spaeteren Tag', /!isPending && gueltig && String\(reservation\.date\) > localDayStr\(new Date\(\)\)/.test(conf) && /reservation\.guestEmail\s*\?/.test(conf), '');
t('Route und Kalender in der Bestaetigung', /In den Kalender/.test(conf) && /google\.com\/maps\/dir\/\?api=1&destination=/.test(conf), '');
t('Restaurantname in der Bestaetigung escaped', /escapeHtml\(reservation\.restaurantName \|\| 'Das Restaurant'\)/.test(H), '');

// ---------- Stempel-Moment ----------
var alp = fn('addLoyaltyPoint');
t('addLoyaltyPoint meldet Erfolg (true) und Rueckfall aufs Geraet (false)', /return true;\s*\} catch\(e\)/.test(alp) && /return false;\s*\}\s*\}$/.test(alp.trim()), '');
t('Moment nur, wenn die Datenbank den Stempel angenommen hat',
  /addLoyaltyPoint\(phone, _lpRid\)\.then\(function \(ok\) \{ if \(ok\) stempelMoment\(phone, _lpRid, _lpName\); \}\)/.test(H), '');
t('Platz fuer den Moment in der Bestellbestaetigung', /<div id="ocStempelMoment" aria-live="polite"><\/div>/.test(H), '');
var sm = fn('stempelMoment');
t('Vibrieren nur ohne "Bewegung reduzieren"', /prefers-reduced-motion: reduce/.test(sm) && /if \(!ruhig && navigator\.vibrate\)/.test(sm), '');
// Moment wirklich rendern
var box = { innerHTML: '' };
var sb2 = { document: { getElementById: function () { return box; } }, getLoyaltyData: function () { return { orders: 13 }; }, window: {}, navigator: {} };
vm.createContext(sb2); vm.runInContext(sm, sb2); sb2.stempelMoment('0491', 'r1', 'Zum <b>Kutter</b>');
t('13. Bestellung: "Neuer Stempel! 3 von 10", drei volle Felder, das dritte neu, Geschenk auf Feld 10',
  /Neuer Stempel! 3 von 10/.test(box.innerHTML) && (box.innerHTML.match(/ voll/g) || []).length === 3 && /voll neu/.test(box.innerHTML)
  && /Noch 7 Bestellungen bis/.test(box.innerHTML) && /kmi-stempel-punkt ziel/.test(box.innerHTML) && /<b>9<\/b>/.test(box.innerHTML), box.innerHTML.slice(0, 160));
t('Lokalname im Kopf, ohne HTML', /<em>Zum bKutter\/b<\/em>/.test(box.innerHTML) && !/<b>Kutter/.test(box.innerHTML), (box.innerHTML.match(/<em>.*?<\/em>/) || [''])[0]);
sb2.getLoyaltyData = function () { return { orders: 19 }; }; sb2.stempelMoment('0491', 'r1');
t('19. Bestellung: "Noch 1 Bestellung" (Einzahl)', /Noch 1 Bestellung bis/.test(box.innerHTML), '');
sb2.getLoyaltyData = function () { return { orders: 20 }; }; sb2.stempelMoment('0491', 'r1');
t('20. Bestellung: "Geschafft", alle 10 voll, kein Geschenk-Platzhalter mehr', /Geschafft/.test(box.innerHTML) && (box.innerHTML.match(/ voll/g) || []).length === 10 && !/ziel/.test(box.innerHTML), box.innerHTML.slice(0, 120));

// ---------- Knoepfe ----------
t('Knoepfe geben nach -- mit "scale", nicht "transform" (verschiebt sonst zentrierte Knoepfe)',
  /:is\(button, \.btn, \[role="button"\]\):not\(:disabled\):active \{ scale: 0\.97; \}/.test(H), '');
t('... und nur ohne "Bewegung reduzieren"',
  /@media \(prefers-reduced-motion: no-preference\) \{\s*:is\(button, \.btn, \[role="button"\]\):not\(:disabled\):active/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
