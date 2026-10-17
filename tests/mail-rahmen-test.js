// GAESTE-MAILS: EIN RAHMEN (Logo, Lokal-Band, Link zur Lokalseite).
//
// Ibo, 17.10.2026: "koennen wir die E-Mails besser machen ... Kiek-mol-in-
// Logo, Links zur Seite vom Restaurant". Ausgefuehrt: lib/mail-rahmen.js und
// die echten Mail-Bauer. Gefunden dabei: "Anlass: birthday" (Screenshot
// Resend, Reservierung Die Millis, 17.10. 13:59).
'use strict';
var path = require('path'), fs = require('fs');
var R = path.join(__dirname, '..', 'netlify', 'functions');
var M = require(path.join(R, 'lib', 'mail-rahmen.js'));
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

t('Anlass: birthday -> Geburtstag, celebration -> Feier, Unbekanntes bleibt', M.anlassText('birthday') === 'Geburtstag' && M.anlassText('celebration') === 'Feier' && M.anlassText('Hochzeit') === 'Hochzeit', M.anlassText('birthday'));
t('Lokalseite: /?r=<slug>, sonst id', M.lokalUrl({ slug: 'die-millis', id: 'x' }) === 'https://kiekmolin.de/?r=die-millis' && M.lokalUrl({ id: 'a b' }) === 'https://kiekmolin.de/?r=a%20b', M.lokalUrl({ slug: 'die-millis' }));
var k = M.kalenderUrl({ reservation_date: '2026-12-31', reservation_time: '23:00:00', party_size: 4 }, { name: 'Lütt Italia', street: 'Markt 1', city: 'Norden' });
t('Kalender: 2 Stunden, über Mitternacht ins neue Jahr, deutsche Zeit', /dates=20261231T230000\/20270101T010000&ctz=Europe\/Berlin/.test(k), k);
t('Kalender ohne Uhrzeit: kein Link', M.kalenderUrl({ reservation_date: '2026-12-31' }, {}) === '', '');

var h = M.rahmen({ lokal: { name: '<b>Böse</b> "Pizza"', city: 'Emden', slug: 'x', logo_url: 'javascript:alert(1)' }, titel: 'T', inhalt: 'I', vorschau: 'V' });
t('Lokalname wird maskiert (kein HTML aus der Datenbank)', h.indexOf('<b>Böse</b>') === -1 && h.indexOf('&lt;b&gt;Böse&lt;/b&gt; &quot;Pizza&quot;') > -1, '');
t('Logo nur mit https -- sonst Anfangsbuchstabe', h.indexOf('javascript:') === -1 && />&lt;<\/td>/.test(h), '');
var h2 = M.rahmen({ lokal: { name: 'Rhodos', logo_url: 'https://x.supabase.co/logo.png' } });
t('mit https-Logo: Bild im Band', /<img src="https:\/\/x\.supabase\.co\/logo\.png"/.test(h2), '');
t('Wortmarke als Text (kein Bild, das blockiert wird)', /Kiek mol <span style="color:#fcd34d;">in<\/span>/.test(h), '');
t('Band hat „Zum Lokal“ mit Link', /href="https:\/\/kiekmolin\.de\/\?r=x"[^>]*>Zum Lokal/.test(h), '');
t('ohne Lokal / Lokal ohne Namen: kein leeres Band', !/Zum Lokal/.test(M.rahmen({ titel: 'x' })) && !/Zum Lokal|undefined/.test(M.rahmen({ titel: 'x', lokal: { slug: 'y' } })), '');

// Die echten Mails benutzen den Rahmen
var OE = require(path.join(R, 'order-email.js'))._baue;
var L = { slug: 'die-millis', name: 'Die Millis', street: 'Auricher Straße 150', city: 'Emden', phone: '04921 9234444' };
var r = OE.buildReservationEmail({ id: 'r1', reservation_date: '2026-10-17', reservation_time: '18:30:00', party_size: 3, guest_name: 'Blank', occasion: 'birthday' }, L, 'confirmed');
t('Reservierung bestätigt: Rahmen, Lokal-Link, Geburtstag statt birthday', /Zum Lokal/.test(r.html) && /Geburtstag/.test(r.html) && !/birthday/.test(r.html), '');
t('… Route und Kalender als Verweise', /google\.com\/maps\/search/.test(r.html) && /calendar\.google\.com/.test(r.html), '');
t('… Absagen-Link bleibt', /res-cancel\?id=r1/.test(r.html), '');
var ab = OE.buildReservationEmail({ id: 'r1', reservation_date: '2026-10-17', reservation_time: '18:30:00' }, L, 'cancelled');
t('Abgelehnt: „Andere Uhrzeit wählen“ führt zur Lokalseite, kein Absagen-Knopf', /href="https:\/\/kiekmolin\.de\/\?r=die-millis"[^>]*>Andere Uhrzeit/.test(ab.html) && !/res-cancel/.test(ab.html), '');
var b = OE.buildEmail({ order_number: '7', order_type: 'pickup', total: 10, items: [] }, L);
t('Bestellung: Rahmen mit Lokal-Band', /Zum Lokal/.test(b.html) && /Bestellstatus verfolgen/.test(b.html), '');
var eri = require(path.join(R, 'reservation-reminder.js'))._erinnerungsMail({ id: 'r1', party_size: 2 }, L, '19:00');
t('Erinnerung: Rahmen, Absagen, Route', /Zum Lokal/.test(eri) && /res-cancel\?id=r1/.test(eri) && /google\.com\/maps/.test(eri), '');
var rev = require(path.join(R, 'review-mail.js'))._baueMail('Thomas', 'Rhodos', 'bei Ihrem Besuch', 'https://kiekmolin.de/?r=rhodos&review=1', { name: 'Rhodos', slug: 'rhodos' });
t('Bewertung: Rahmen, Text unverändert, Knopf', /Zum Lokal/.test(rev) && /hat es geschmeckt bei Ihrem Besuch bei <b>Rhodos<\/b>/.test(rev) && /review=1/.test(rev), '');
t('Bewertungs-Mail schickt jetzt auch eine Textfassung (Spamfilter)', /text: nurText\(html\)/.test(fs.readFileSync(path.join(R, 'review-mail.js'), 'utf8')), '');
t('keine Gäste-Mail baut mehr ihr eigenes <div style="font-family', ['order-email.js', 'reservation-reminder.js', 'review-mail.js'].every(function (f) { return fs.readFileSync(path.join(R, f), 'utf8').indexOf('<div style="font-family:-apple-system') === -1; }), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
