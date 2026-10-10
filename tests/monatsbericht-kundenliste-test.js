// Monatsbericht + Kundenliste mit Quelle + Werbung nur mit Zustimmung.
//
// Ibo, 09.10.2026: "dass deren Name auch in der Kampagne eingetragen wird,
// dass wir es trennen bei Liste und Monatsbericht" -- "ich will Umsatz
// sehen jeden Tag für den Gastronomen".
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }

var M = new Function(['umsatzTag', 'umsatzProTag', 'mbRechnen'].map(fn).join('\n') + '; return mbRechnen;')();
var daten = {
    orders: [
        { created_at: '2026-10-01T10:00:00Z', total: 30, status: 'completed', order_type: 'delivery' },
        { created_at: '2026-10-01T21:30:00Z', total: 20, status: 'completed', order_type: 'pickup' },     // 23:30 dt. Zeit -> 01.10.
        { created_at: '2026-10-02T22:30:00Z', total: 50, status: 'delivered', order_type: 'dine_in' },   // 00:30 -> 03.10.
        { created_at: '2026-10-05T12:00:00Z', total: 99, status: 'cancelled', order_type: 'delivery' }
    ],
    reservierungen: [{ reservation_date: '2026-10-04', party_size: 4 }, { reservation_date: '2026-10-08', party_size: 2 }, { reservation_date: '2026-11-01', party_size: 6 }],
    einw: [
        { quelle: 'bestellung', erstmals_at: '2026-10-01T10:00:00Z' }, { quelle: 'reservierung', erstmals_at: '2026-10-04T18:00:00Z' },
        { quelle: 'reservierung', erstmals_at: '2026-09-20T18:00:00Z', widerrufen_at: '2026-10-06T09:00:00Z' }
    ],
    empf: [
        { quelle: 'bestellung', gesendet_at: '2026-10-06T10:00:00Z', eingeloest_at: '2026-10-07T19:00:00Z', bestell_id: 'b1', umsatz: '42.50' },
        { quelle: 'reservierung', gesendet_at: '2026-10-06T10:01:00Z', eingeloest_at: '2026-10-09T20:00:00Z', bestell_id: null, umsatz: null },
        { quelle: 'bestellung', gesendet_at: '2026-10-06T10:02:00Z' }
    ]
};
var b = M('2026-10', daten, '2026-10-09');
t('Tage bis heute (9 Zeilen), späte Bestellungen am richtigen deutschen Tag', b.tage.length === 9 && b.tage[0].summe === 50 && b.tage[0].anzahl === 2 && b.tage[2].summe === 50 && b.tage[1].summe === 0, JSON.stringify(b.tage.slice(0, 3)));
t('Monatssumme ohne Storno, Ø je Bestellung', b.summe === 100 && b.anzahl === 3 && Math.abs(b.schnitt - 33.333) < 0.01 && b.storno === 1, JSON.stringify({ s: b.summe, a: b.anzahl, st: b.storno }));
t('nach Bestellart getrennt', b.art.delivery === 30 && b.art.pickup === 20 && b.art.dine_in === 50, JSON.stringify(b.art));
t('Reservierungen nur dieses Monats, mit Gästen', b.reservierungen === 2 && b.gaeste === 6, b.reservierungen + '/' + b.gaeste);
t('WhatsApp: neue Zustimmungen getrennt nach Quelle, Abmeldungen im Monat', b.wa.neuBestellung === 1 && b.wa.neuReservierung === 1 && b.wa.abgemeldet === 1, JSON.stringify(b.wa));
t('WhatsApp: verschickt, eingelöst online/im Lokal, Umsatz daraus, getrennt nach Quelle', b.wa.verschickt === 3 && b.wa.eingeloest === 2 && b.wa.online === 1 && b.wa.imLokal === 1 && b.wa.umsatz === 42.5 && b.wa.eingeloestBestellung === 1 && b.wa.eingeloestReservierung === 1, JSON.stringify(b.wa));
var vor = M('2026-09', daten, '2026-10-09');
t('vergangener Monat: alle 30 Tage', vor.tage.length === 30 && vor.summe === 0, vor.tage.length);
var ohne = M('2026-10', { orders: [], reservierungen: [], einw: null, waFehler: 'WhatsApp-Angebote noch nicht eingerichtet (datenbank/42 einspielen).' }, '2026-10-09');
t('ohne SQL 42: WhatsApp-Teil sagt es, statt Nullen zu zeigen (Regel 6)', ohne.wa === null && /datenbank\/42/.test(ohne.waFehler), JSON.stringify(ohne.wa));
t('Bericht ohne Kasse sagt ehrlich: nur App', /Nur was über die App lief\. Die Kasse im Lokal ist nicht enthalten\./.test(H), '');
t('Monatsbericht hängt am Umsatz-Bereich und lädt mit', /id="monatsberichtPanel"/.test(H) && /renderDailyRevenueChart\(\);\n    monatsberichtLaden\(\);/.test(H), '');

// Kundenliste
var lca = fn('loadCustomerAnalytics');
t('Kundenliste: Reservierungen gehören dazu (ohne Storno/Absage/No-Show)', /supabaseGet\('reservations', 'select=guest_name,guest_phone,guest_email,reservation_date,created_at,status'\s*\+ '&status=not\.in\.\(cancelled,rejected,no_show\)/.test(lca), '');
t('Kundenliste: Nummern normiert (ein Gast, nicht zwei)', /var key = waNummer\(phone\) \|\| String\(phone\)\.trim\(\);/.test(lca) && /c\.quellen\.bestellung = true/.test(lca) && /c\.quellen\.reservierung = true/.test(lca), '');
t('Kundenliste: Zustimmungen VOR dem Zeichnen geladen', /await waLaden\(\);/.test(lca), '');
var rmc = fn('renderMarketingCustomers');
t('Kundenliste zeigt Quelle und "WhatsApp-Angebote: ja"', /">Bestellung<\/span>'/.test(rmc) && /">Reservierung<\/span>'/.test(rmc) && /WhatsApp-Angebote: ja/.test(rmc), '');
t('Filter: Bestellung / Reservierung / WhatsApp ja', ['q-bestellung', 'q-reservierung', 'wa-ja'].every(function (f) { return H.indexOf("filterMarketingCustomers('" + f + "')") > 0; }), '');
t('Werbe-Knöpfe nur mit Zustimmung, sonst Hinweis', /if \(_darf\) \{\s*\/\/ WhatsApp Button/.test(rmc) && /keine WhatsApp-Zustimmung/.test(rmc), '');
t('auch die Funktionen selbst sperren ohne Zustimmung und hängen den Abmelde-Link an',
    /if \(!waDarf\(phone\)\)/.test(fn('sendMarketingWhatsApp')) && /if \(!waDarf\(phone\)\)/.test(fn('generateMarketingCoupon')) && /message \+= waAbmeldeZeile\(phone\);/.test(fn('sendMarketingWhatsApp')) && /message \+= waAbmeldeZeile\(phone\);/.test(fn('generateMarketingCoupon')), '');

// waDarf echt
var D = new Function('var _wa = { einw: [{ telefon: "491761234567" }, { telefon: "491769999999", widerrufen_at: "2026-10-01" }] };' + fn('waNummer') + fn('waAktiv') + fn('waDarf') + '; return waDarf;')();
t('waDarf: "0176 1234567" mit Zustimmung ja, abgemeldet nein, fremd nein', D('0176 1234567') === true && D('+49 176 9999999') === false && D('0171 000000') === false, '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
