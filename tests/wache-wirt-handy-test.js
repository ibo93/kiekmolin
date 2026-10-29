// DIE WACHE PRUEFT, OB DER WIRT VON SEINEN GAESTEN ERFAEHRT (27.10.2026).
// Gemessen an dem Tag: kein Lokal hatte ein Handy fuer Meldungen, die
// Wache war gruen. Der Test FUEHRT die Pruefung aus.
'use strict';
var path = require('path');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
process.env.SUPABASE_SERVICE_KEY = 'dienst';

var A = 'aaaaaaaa-0000-0000-0000-000000000000', B = 'bbbbbbbb-0000-0000-0000-000000000000', P = 'cccccccc-0000-0000-0000-000000000000';
var netz;
global.fetch = async function (url) {
    url = String(url);
    for (var i = 0; i < netz.length; i++) if (netz[i][0].test(url)) {
        var a = netz[i][1];
        return { ok: a !== 500, status: a === 500 ? 500 : 200, json: async function () { return a; } };
    }
    return { ok: true, status: 200, json: async function () { return []; } };
};
var W = require(path.join(__dirname, '..', 'netlify', 'functions', 'gastweg-wache.js'))._intern;

(async function () {
    t('die Prüfung steht in der Liste der Wache', W.PRUEFUNGEN.some(function (p) { return p.kennung === 'wache-wirt-handy' && p.fn === W.pruefeWirtGeraete; }), '');

    netz = [
        [/reservations\?created_at=gte/, [{ restaurant_id: A, guest_name: 'Meier' }, { restaurant_id: P, guest_name: '[Probe] Gastweg-Wache' }]],
        [/orders\?created_at=gte/, [{ restaurant_id: B, customer_name: 'Kaya' }]],
        [/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]],
        // A hat nur das Handy des Betreibers, B ein Wirte-Handy
        [/push_subscriptions\?restaurant_id=in/, [{ restaurant_id: A, customer_email: 'IBO@kiekmolin.de' }, { restaurant_id: B, customer_email: null }]],
        [/restaurants\?id=in/, [{ id: A, name: 'Lütt Italia', is_active: true }]]
    ];
    var m = await W.pruefeWirtGeraete();
    t('Lokal ohne Wirte-Handy wird gemeldet, mit Namen', typeof m === 'string' && /Lütt Italia/.test(m) && /1 Lokal/.test(m), m);
    t('… das Handy des Betreibers zählt nicht als Wirte-Handy', typeof m === 'string' && /Lütt Italia/.test(m), m);
    t('… Lokal mit Handy wird nicht gemeldet', typeof m === 'string' && m.indexOf(B.slice(0, 8)) < 0, m);
    t('… die Probe der Wache macht kein Lokal zum "Betrieb"', typeof m === 'string' && m.indexOf(P.slice(0, 8)) < 0, m);

    // Seiten: Supabase gibt hoechstens 1000 Zeilen je Abfrage. Ein Lokal, das
    // erst in der zweiten Seite vorkommt, muss trotzdem geprueft werden.
    var netzAlt = netz, voll = []; for (var i = 0; i < 1000; i++) voll.push({ restaurant_id: B, customer_name: 'X' });
    netz = [
        [/reservations\?created_at=gte/, []],
        [/orders\?created_at=gte.*offset=0(&|$)/, voll],
        [/orders\?created_at=gte.*offset=1000(&|$)/, [{ restaurant_id: A, customer_name: 'Spät' }]],
        [/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]],
        [/push_subscriptions\?restaurant_id=in/, [{ restaurant_id: B, customer_email: null }]],
        [/restaurants\?id=in/, [{ id: A, name: 'Lütt Italia', is_active: true }]]
    ];
    var m2 = await W.pruefeWirtGeraete();
    t('Lokal erst nach 1000 Zeilen wird trotzdem geprueft (Seiten, nicht stilles Abschneiden)', typeof m2 === 'string' && /Lütt Italia/.test(m2), m2);
    netz = netzAlt;

    netz[3] = [/push_subscriptions\?restaurant_id=in/, [{ restaurant_id: A, customer_email: 'koch@a.de' }, { restaurant_id: B, customer_email: null }]];
    t('alle haben ein Handy -> kein Mangel', (await W.pruefeWirtGeraete()) === null, '');

    netz[3] = [/push_subscriptions\?restaurant_id=in/, 500];
    var u = await W.pruefeWirtGeraete();
    t('Geräteliste nicht lesbar -> "nicht prüfbar", NICHT grün', u !== null && typeof u === 'string' && !/Kein Handy/.test(u), u);

    netz = [[/reservations\?created_at=gte/, []], [/orders\?created_at=gte/, []]];
    t('nichts los in 14 Tagen -> kein Mangel', (await W.pruefeWirtGeraete()) === null, '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
