// GAESTE-MAILS ANSEHEN -- ohne sie zu verschicken.
//
// Baut jede Gaeste-Mail mit Beispieldaten, legt sie als HTML ab und macht
// Bilder in Handy- und Rechnerbreite. Prueft dabei, was man im Postfach
// sonst erst beim Kunden merkt: Text zu breit fuers Handy, Links ins
// Leere, englische Werte ("birthday"), fehlendes Logo/Lokal-Band.
// AUFRUF   node werkzeug/mails-ansehen.js
'use strict';
var path = require('path'), fs = require('fs');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var WURZEL = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe', 'mails'); fs.mkdirSync(AUS, { recursive: true });
var OE = require(path.join(WURZEL, 'netlify/functions/order-email.js'))._baue;
var ERI = require(path.join(WURZEL, 'netlify/functions/reservation-reminder.js'))._erinnerungsMail;
var REV = require(path.join(WURZEL, 'netlify/functions/review-mail.js'))._baueMail;

var LOKAL = { id: 'x', slug: 'die-millis', name: 'Die Millis', street: 'Auricher Straße 150', city: 'Emden', phone: '04921 9234444', google_maps_url: 'https://maps.google.com/?cid=1', features: [] };
var RES = { id: 'r1', reservation_date: '2026-10-17', reservation_time: '18:30:00', party_size: 3, guest_name: 'Blank', occasion: 'birthday', notes: 'Fensterplatz, wenn möglich' };
var BEST = { order_number: 'KI-261017-4711', order_type: 'pickup', customer_name: 'Ibo', restaurant_name: 'Die Millis', total: 31.4, subtotal: 31.4, payment_method: 'cash', estimated_minutes: 25,
    items: [{ name: 'Pizza Margherita', quantity: 2, price: 19.8 }, { name: 'Tiramisu', quantity: 1, price: 6.9, options: 'extra Kakao' }, { name: 'Cola 0,33', quantity: 1, price: 4.7 }] };

var MAILS = [
    ['reservierung-anfrage', OE.buildReservationEmail(RES, LOKAL, 'received')],
    ['reservierung-bestaetigt', OE.buildReservationEmail(RES, LOKAL, 'confirmed')],
    ['reservierung-abgelehnt', OE.buildReservationEmail(RES, LOKAL, 'cancelled')],
    ['erinnerung', { subject: 'Erinnerung', html: ERI(RES, LOKAL, '18:30') }],
    ['bestellung-eingegangen', OE.buildEmail(BEST, LOKAL)],
    ['bestellung-angenommen', OE.buildAcceptedEmail(BEST, LOKAL)],
    ['bestellung-neue-zeit', OE.buildZeitEmail(Object.assign({}, BEST, { estimated_minutes: 40 }), LOKAL)],
    ['bewertung', { subject: 'Wie war es', html: REV('Thomas Muster', 'Die Millis', 'bei Ihrem Besuch', 'https://kiekmolin.de/?r=die-millis&review=1', LOKAL) }]
];

var n = 0, rot = 0;
function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }

MAILS.forEach(function (m) {
    var h = m[1].html;
    fs.writeFileSync(path.join(AUS, m[0] + '.html'), h);
    pruef(m[0] + ': Wortmarke „Kiek mol in“ im Kopf', /Kiek mol <span[^>]*>in<\/span>/.test(h), 'fehlt');
    pruef(m[0] + ': Lokal-Band mit Link zur Lokalseite', /href="https:\/\/kiekmolin\.de\/\?r=die-millis"[^>]*>Zum Lokal/.test(h), 'fehlt');
    pruef(m[0] + ': kein englischer Anlass, kein "undefined"', !/birthday|undefined|NaN|\[object/.test(h), (h.match(/birthday|undefined|NaN|\[object/) || [])[0]);
    pruef(m[0] + ': Vorschauzeile fürs Postfach', /display:none;max-height:0/.test(h), 'fehlt');
});

var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt -- nur HTML geschrieben: ' + AUS); process.exit(rot ? 1 : 0); }
(async function () {
    var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
    for (var breite of [390, 680]) {
        var s = await b.newPage({ viewport: { width: breite, height: 900 } });
        for (var m of MAILS) {
            await s.setContent(m[1].html, { waitUntil: 'load' });
            var ragt = await s.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
            pruef(m[0] + ' @' + breite + 'px: nichts ragt seitlich heraus', ragt <= 1, ragt + 'px');
            await s.screenshot({ path: path.join(AUS, m[0] + '-' + breite + '.png'), fullPage: true });
        }
        await s.close();
    }
    await b.close();
    console.log('\n' + (rot ? rot + ' von ' + n + ' ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/mails/');
    process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
