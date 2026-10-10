// Gästeprofil bei Reservierungen: Besuche, Bestellungen, Umsatz, letzter
// Besuch, Lieblingstisch, Notizen früherer Besuche -- über die Telefonnummer.
// Die Rechnung wird AUSGEFÜHRT (mit der echten waNummer), nicht nur gesucht.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }
var vb = H.match(/var GP_BESUCHT = \{[^}]*\};/); if (!vb) throw new Error('GP_BESUCHT fehlt');
var G = new Function(vb[0] + fn('waNummer') + fn('gastProfil') + fn('gpChipText') + '; return { p: gastProfil, chip: gpChipText };')();

var daten = {
    reservierungen: [
        { guest_phone: '0176 1234567', reservation_date: '2026-09-01', status: 'finished', table_id: 't5', notes: 'Fensterplatz, Allergie Nüsse' },
        { guest_phone: '+49 176 1234567', reservation_date: '2026-09-15', status: 'confirmed', table_id: 't5' },
        { guest_phone: '0049176/1234567', reservation_date: '2026-10-01', status: 'seated', table_id: 't2', notes: 'Geburtstag' },
        { guest_phone: '01761234567', reservation_date: '2026-10-03', status: 'cancelled', notes: 'krank' },
        { guest_phone: '01761234567', reservation_date: '2026-10-05', status: 'no_show' },
        { guest_phone: '01761234567', reservation_date: '2026-10-09', status: 'confirmed', table_id: 't9', notes: 'heute' },   // heute: zählt NICHT
        { guest_phone: '0171 999999', reservation_date: '2026-09-01', status: 'finished', table_id: 't1' }                  // fremder Gast
    ],
    bestellungen: [
        { customer_phone: '0176-1234567', total: '25.50', status: 'delivered' },
        { customer_phone: '491761234567', total: '14.50', status: 'completed' },
        { customer_phone: '0176 1234567', total: '99', status: 'cancelled' },
        { customer_phone: '0171 999999', total: '50', status: 'delivered' }
    ],
    tischNr: { t5: '5', t2: '2', t9: '9', t1: '1' }
};
var p = G.p('0176 / 123 45 67', daten, '2026-10-09');
t('alle Schreibweisen derselben Nummer = ein Gast; fremde Nummer nicht dabei', p.besuche === 3 && p.bestellungen === 2, JSON.stringify(p));
t('Besuche zählen nur stattgefundene, vor heute (nicht Absage/No-Show/heutige)', p.besuche === 3 && p.abgesagt === 1 && p.nichtErschienen === 1, JSON.stringify(p));
t('Umsatz aus App-Bestellungen ohne Storno', p.umsatz === 40, p.umsatz);
t('letzter Besuch und Lieblingstisch (am häufigsten)', p.letzterBesuch === '2026-10-01' && p.lieblingsTisch === '5' && p.lieblingsTischMal === 2, JSON.stringify([p.letzterBesuch, p.lieblingsTisch]));
t('Notizen früherer Besuche, neueste zuerst, höchstens 3, nicht die von heute', p.notizen.length === 3 && p.notizen[0].text === 'krank' && p.notizen[2].text === 'Fensterplatz, Allergie Nüsse' && !p.notizen.some(function (x) { return x.text === 'heute'; }), JSON.stringify(p.notizen));
t('Abzeichen: Stammgast ab 3 Besuchen', p.stamm === true && G.chip(p) === 'Stammgast · 3 Besuche', G.chip(p));
var neu = G.p('0160 5555555', daten, '2026-10-09');
t('Abzeichen: unbekannte Nummer = "Neu"', neu.neu === true && G.chip(neu) === 'Neu', G.chip(neu));
var zweit = G.p('0171 999999', daten, '2026-10-09');
t('Abzeichen: einmal da gewesen = "2. Besuch"', G.chip(zweit) === '2. Besuch' && zweit.bestellungen === 1, G.chip(zweit));
t('ohne Telefonnummer kein Profil (statt falsch zugeordnet)', G.p('', daten, '2026-10-09') === null && G.p(null, daten, '2026-10-09') === null, '');
var nurOnline = G.p('0151 1111111', { reservierungen: [], bestellungen: [1, 2, 3, 4, 5].map(function () { return { customer_phone: '01511111111', total: 10, status: 'delivered' }; }), tischNr: {} }, '2026-10-09');
t('Stammgast auch über 5 Online-Bestellungen', G.chip(nurOnline) === 'Stammgast · 5 Bestellungen', G.chip(nurOnline));

// Einbau in die Reservierungsliste des Wirts
var lr = fn('loadReservationsForRestaurant');
t('Liste: Abzeichen an neuen Anfragen UND bestätigten Reservierungen', (lr.match(/escapeHtml\(r\.guest_name \|\| 'Gast'\) \+ gpChipHtml\(r\)/g) || []).length === 2, '');
t('Liste: Profile werden nach dem Zeichnen geladen', /container\.innerHTML = html;\s*gastProfileLaden\(restaurantId\);/.test(lr), '');
var gl = fn('gastProfileLaden');
t('Laden: nur dieses Lokal (Reservierungen + Bestellungen)', /var q = 'restaurant_id=eq\.' \+ encodeURIComponent\(rid\);/.test(gl) && /supabaseGet\('reservations', q \+/.test(gl) && /supabaseGet\('orders', q \+/.test(gl), '');
t('Tischnummern aus restaurant_tables (dorthin zeigt table_id, SQL 40), ohne Platzhalter gelöschter Tische', /supabaseGet\('restaurant_tables', q \+ '&select=id,table_number'\)/.test(gl) && /String\(t\.table_number\)\.charAt\(0\) !== '-'/.test(gl), '');
t('Laden fehlgeschlagen: Abzeichen sagt "Profil nicht geladen" statt still "Neu" (Regel 6)', /c\.textContent = 'Profil nicht geladen'/.test(gl), '');
t('Abzeichen versteckt bis geladen (kein falsches "Neu" vorab)', /class="kmi-gp-chip"[^>]*style="display:none;/.test(fn('gpChipHtml')), '');
t('Profil-Fenster: Name und Notizen maskiert (Gäste tippen sie selbst)', /escapeHtml\(name \|\| 'Gast'\)/.test(fn('gastProfilZeigen')) && /escapeHtml\(n\.text\)/.test(fn('gastProfilZeigen')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
