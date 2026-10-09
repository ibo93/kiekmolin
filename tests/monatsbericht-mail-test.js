// Monatsbericht per Mail am 1. (netlify/functions/monthly-report.js).
// Rechnung und Versand werden AUSGEFÜHRT, mit nachgebautem Supabase + Resend.
'use strict';
var fs = require('fs'), path = require('path');
var R = path.join(__dirname, '..');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function laden() { var p = require.resolve('../netlify/functions/monthly-report.js'); delete require.cache[p]; return require(p); }
var I = laden()._intern;

t('Vormonat: 01.10. -> September, 01.01. -> Dezember Vorjahr', I.vormonat('2026-10-01') === '2026-09' && I.vormonat('2027-01-01') === '2026-12' && I.folgemonat('2026-12') === '2027-01', '');
t('Mitternacht deutscher Zeit mit dem Versatz DIESES Tages (Sommer/Winter)', I.berlinMitternacht('2026-10-01') === '2026-09-30T22:00:00.000Z' && I.berlinMitternacht('2026-11-01') === '2026-10-31T23:00:00.000Z', I.berlinMitternacht('2026-11-01'));

var daten = {
    orders: [
        { restaurant_id: 'r1', total: 30, status: 'completed', created_at: '2026-09-01T10:00:00Z' },
        { restaurant_id: 'r1', total: 20, status: 'completed', created_at: '2026-08-31T22:30:00Z' },   // 00:30 am 01.09. -> September
        { restaurant_id: 'r1', total: 99, status: 'completed', created_at: '2026-09-30T22:30:00Z' },   // 00:30 am 01.10. -> NICHT
        { restaurant_id: 'r1', total: 50, status: 'cancelled', created_at: '2026-09-05T10:00:00Z' },
        { restaurant_id: 'r2', total: 70, status: 'completed', created_at: '2026-09-05T10:00:00Z' }
    ],
    reservierungen: [
        { restaurant_id: 'r1', status: 'confirmed', party_size: 4, reservation_date: '2026-09-12' },
        { restaurant_id: 'r1', status: 'no_show', party_size: 2, reservation_date: '2026-09-13' },
        { restaurant_id: 'r2', status: 'confirmed', party_size: 2, reservation_date: '2026-09-13' }
    ],
    kasse: [{ restaurant_id: 'r1', tag: '2026-09-12', betrag: '1200.00' }, { restaurant_id: 'r1', tag: '2026-09-13', betrag: '800' }, { restaurant_id: 'r2', tag: '2026-09-12', betrag: '5' }],
    einw: [{ restaurant_id: 'r1', quelle: 'bestellung', erstmals_at: '2026-09-02T10:00:00Z' }, { restaurant_id: 'r1', quelle: 'reservierung', erstmals_at: '2026-09-03T10:00:00Z', widerrufen_at: '2026-09-20T10:00:00Z' }],
    empf: [{ restaurant_id: 'r1', gesendet_at: '2026-09-10T10:00:00Z', eingeloest_at: '2026-09-11T19:00:00Z', umsatz: '42.50' }, { restaurant_id: 'r1', gesendet_at: '2026-09-10T10:00:00Z' }]
};
var z = I.monatsZahlen('r1', '2026-09', daten);
t('App-Umsatz nur dieses Hauses, deutscher Tag, ohne Storno', z.app === 50 && z.bestellungen === 2 && z.schnitt === 25, JSON.stringify(z));
t('Kasse + App = Gesamt, Tage gezählt', z.kasse === 2000 && z.kasseTage === 2 && z.gesamt === 2050, JSON.stringify(z));
t('stärkster Tag aus App + Kasse', z.besterTag === '2026-09-12' && z.besterTagBetrag === 1200, z.besterTag);
t('Reservierungen ohne No-Show, mit Gästen', z.reservierungen === 1 && z.gaeste === 4, z.reservierungen);
t('WhatsApp: neue Zustimmungen nach Quelle, abgemeldet, verschickt, eingelöst, Umsatz', z.wa.neuBestellung === 1 && z.wa.neuReservierung === 1 && z.wa.abgemeldet === 1 && z.wa.verschickt === 2 && z.wa.eingeloest === 1 && z.wa.umsatz === 42.5, JSON.stringify(z.wa));
var ohne = I.monatsZahlen('r1', '2026-09', { orders: daten.orders, reservierungen: [], kasse: null, einw: null, empf: null });
t('ohne SQL 43/42: Kasse null (nicht 0), kein WhatsApp-Teil', ohne.kasse === null && ohne.wa === null && ohne.gesamt === 50, JSON.stringify(ohne));
var h = I.mailHtml('Haus <b>', '2026-09', z, []);
t('Mail: Gesamt, davon App, davon Kasse; Name maskiert', /Monatsbericht September 2026/.test(h) && /Umsatz gesamt.*2050,00 €/.test(h) && /davon App.*50,00 €/.test(h) && /davon Kasse.*2000,00 €.*2 Tage eingetragen/.test(h) && /Haus &lt;b&gt;/.test(h) && /Samstag, 12\.09\./.test(h), '');
var h2 = I.mailHtml('Haus', '2026-09', ohne, ['Kassen-Umsatz ist noch nicht eingerichtet – hier steht nur, was über die App lief.']);
t('Mail ohne Kasse: "Umsatz App" + Hinweis, keine Kasse-0', /Umsatz App/.test(h2) && !/davon Kasse/.test(h2) && /noch nicht eingerichtet/.test(h2), '');

// Versand mit nachgebautem Server: Vormonat von HEUTE
async function lauf(antworten) {
    process.env.RESEND_API_KEY = 'x'; process.env.SUPABASE_SERVICE_KEY = 'x';
    var F = laden(), mails = [], urls = [], alt = global.fetch, w = console.warn, l = console.log;
    console.warn = function () {}; console.log = function () {};
    global.fetch = function (url, o) {
        if (/api\.resend\.com/.test(url)) { mails.push(JSON.parse(o.body)); return Promise.resolve({ ok: true }); }
        urls.push(decodeURIComponent(url));
        var tab = url.split('/rest/v1/')[1].split('?')[0], a = antworten[tab];
        if (typeof a === 'number') return Promise.resolve({ ok: false, status: a, json: function () { return Promise.resolve({}); } });
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(a || []); } });
    };
    var erg; try { erg = await F.handler(); } finally { global.fetch = alt; console.warn = w; console.log = l; }
    return { mails: mails, urls: urls, erg: erg };
}
(async function () {
    var heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }), vm = I.vormonat(heute);
    var mitte = vm + '-15T12:00:00Z';
    var basis = { restaurants: [{ id: 'r1', name: 'Haus', email: 'a@b.de' }, { id: 'r2', name: 'Leer', email: 'c@d.de' }, { id: 'r3', name: 'Ohne Mail', email: '' }],
                  orders: [{ restaurant_id: 'r1', total: 40, status: 'completed', created_at: mitte }], reservations: [],
                  kassen_umsatz: [{ restaurant_id: 'r1', tag: vm + '-15', betrag: '960' }], gast_einwilligungen: [], wa_kampagnen_empfaenger: [] };
    var a = await lauf(basis);
    t('Versand: nur Häuser mit Zahlen und Mail-Adresse; Betreff mit Gesamt', a.mails.length === 1 && a.mails[0].to[0] === 'a@b.de' && /1000,00 €/.test(a.mails[0].subject) && a.erg.statusCode === 200, JSON.stringify(a.mails.map(function (m) { return m.subject; })));
    t('Versand: lädt genau den Vormonat (deutsche Mitternacht bis Mitternacht)', a.urls.some(function (u) { return u.indexOf('orders?created_at=gte.' + I.berlinMitternacht(vm + '-01') + '&created_at=lt.' + I.berlinMitternacht(I.folgemonat(vm) + '-01')) >= 0; }), a.urls.join('\n'));
    var b = await lauf(Object.assign({}, basis, { kassen_umsatz: 404, gast_einwilligungen: 404 }));
    t('ohne SQL 42/43: Mail geht trotzdem raus, mit Hinweis', b.mails.length === 1 && /noch nicht eingerichtet/.test(b.mails[0].html) && !/WhatsApp-Angebote/.test(b.mails[0].html), b.mails.length);
    var c = await lauf(Object.assign({}, basis, { orders: 500 }));
    t('Bestellungen nicht ladbar: keine halbe Mail, Fehler gemeldet', c.mails.length === 0 && c.erg.statusCode === 500, JSON.stringify(c.erg));
    var toml = fs.readFileSync(path.join(R, 'netlify.toml'), 'utf8');
    t('Zeitplan: am 1. jedes Monats', /\[functions\."monthly-report"\]\s*\n\s*schedule = "15 6 1 \* \*"/.test(toml), '');
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
