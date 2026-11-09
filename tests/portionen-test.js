// PORTIONEN ZAEHLEN (09.11.2026).
//
// Ibo: "Ja mache" -- statt nur "ausverkauft" stellt die Kueche ein, wie viele
// Portionen es heute noch gibt; jede Bestellung zieht ab, bei 0 ausverkauft.
//
// Diese Datei laesst order-save WIRKLICH laufen (Datenbank nachgebaut) und
// fragt: Was passiert, wenn es nicht reicht, wenn die Funktion fehlt, wenn
// das Speichern danach scheitert? Und: geht der Browser dann einen Notweg?
'use strict';
var fs = require('fs'), path = require('path');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++;
    var d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

process.env.SUPABASE_SERVICE_KEY = 'dienst';
var P = require(path.join(KMI, 'netlify', 'functions', 'lib', 'portionen.js'));
var A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

var welt = { rpc: [], einfuegen: 0, rpcAntwort: null, insertOk: true };
global.fetch = async function (url, o) {
    o = o || {};
    if (/rpc\/kmi_portionen_buchen/.test(url)) {
        var b = JSON.parse(o.body); welt.rpc.push(b);
        var a = welt.rpcAntwort(b);
        return { ok: a.status < 300, status: a.status, text: async function () { return a.text; } };
    }
    if (/\/rest\/v1\/orders/.test(url) && o.method === 'POST') {
        welt.einfuegen++;
        return welt.insertOk
            ? { ok: true, status: 201, json: async function () { return [{ id: 'neu-1' }]; }, text: async function () { return '[{"id":"neu-1"}]'; } }
            : { ok: false, status: 500, json: async function () { return {}; }, text: async function () { return 'kaputt'; } };
    }
    return { ok: true, status: 200, json: async function () { return []; }, text: async function () { return '[]'; } };
};
function antwort(status, obj) { return function () { return { status: status, text: typeof obj === 'string' ? obj : JSON.stringify(obj) }; }; }

(async function () {
    // ---- lib/portionen ----
    var p = P.posten({ items: [{ menu_item_id: A, quantity: 2 }, { menu_item_id: A, quantity: '1' }, { menu_item_id: B }, { menu_item_id: 'kein-uuid', quantity: 9 }, { name: 'ohne id' }] });
    t('Posten: gleiche Gerichte zusammengezaehlt, ohne Menge = 1, fremde IDs raus', JSON.stringify(p) === JSON.stringify([{ id: A, menge: 3 }, { id: B, menge: 1 }]), JSON.stringify(p));
    t('Keine Posten: nichts aufrufen', (await P.buchen('u', 'k', 'r', [], 'pruefen')).leer === true && welt.rpc.length === 0, '');
    welt.rpcAntwort = antwort(200, { ok: false, gericht: 'Lammhaxe', rest: 2 });
    var e1 = await P.buchen('u', 'k', 'r1', p, 'pruefen');
    t('Reicht nicht: ok false mit Gericht und Rest', e1.ok === false && e1.gericht === 'Lammhaxe' && e1.rest === 2, JSON.stringify(e1));
    t('Satz fuer den Gast: Menge im Warenkorb aendern', P.satz(e1) === 'Von „Lammhaxe“ gibt es heute nur noch 2 Portionen. Bitte ändere die Menge im Warenkorb.', P.satz(e1));
    t('Satz bei 0: ausverkauft, aus dem Warenkorb nehmen', /„Lammhaxe“ ist gerade ausverkauft/.test(P.satz({ gericht: 'Lammhaxe', rest: 0 })) && /1 Portion\./.test(P.satz({ gericht: 'X', rest: 1 })), '');
    welt.rpcAntwort = antwort(404, '{"code":"PGRST202","message":"Could not find the function public.kmi_portionen_buchen"}');
    var e2 = await P.buchen('u', 'k', 'r1', p, 'pruefen');
    t('Funktion fehlt (SQL 52): Bestellung geht durch, aber vermerkt', e2.ok === true && e2.fehlt === true && !e2.gebucht, JSON.stringify(e2));
    welt.rpcAntwort = antwort(500, 'boom');
    var e3 = await P.buchen('u', 'k', 'r1', p, 'pruefen');
    t('Datenbank klemmt: geht durch, vermerkt (wie Preis-Schutz)', e3.ok === true && e3.fehler === 'HTTP 500', JSON.stringify(e3));

    // ---- order-save ----
    var OS = require(path.join(KMI, 'netlify', 'functions', 'order-save.js'));
    function bestellung() { return { order_number: 'KI-9-1', restaurant_id: 'r1', status: 'received', items: [{ menu_item_id: A, quantity: 3, name: 'Lammhaxe', price: 10 }], total: 30 }; }
    async function senden() { var r = await OS.handler({ httpMethod: 'POST', body: JSON.stringify({ order: bestellung() }) }); r.d = JSON.parse(r.body); return r; }

    welt.rpc.length = 0; welt.einfuegen = 0;
    welt.rpcAntwort = antwort(200, { ok: false, gericht: 'Lammhaxe', rest: 2 });
    var r = await senden();
    t('Reicht nicht: 409 mit portionen:true und dem Satz', r.statusCode === 409 && r.d.portionen === true && /nur noch 2 Portionen/.test(r.d.error), r.statusCode + ' ' + r.body);
    t('Reicht nicht: Bestellung wird NICHT gespeichert', welt.einfuegen === 0, welt.einfuegen);
    t('Gepruefte Art "pruefen", richtiges Lokal, Mengen', welt.rpc[0].p_art === 'pruefen' && welt.rpc[0].p_restaurant === 'r1' && welt.rpc[0].p_posten[0].menge === 3, JSON.stringify(welt.rpc[0]));

    welt.rpc.length = 0; welt.einfuegen = 0;
    welt.rpcAntwort = antwort(200, { ok: true });
    r = await senden();
    t('Reicht: gespeichert, einmal abgezogen', r.statusCode === 200 && r.d.ok === true && welt.einfuegen === 1 && welt.rpc.length === 1, r.body);

    welt.rpc.length = 0; welt.einfuegen = 0; welt.insertOk = false;
    r = await senden();
    t('Speichern scheitert nach dem Abziehen: wird zurueckgebucht', welt.rpc.length === 2 && welt.rpc[1].p_art === 'zurueck' && welt.rpc[1].p_posten[0].menge === 3, JSON.stringify(welt.rpc.map(function (x) { return x.p_art; })));
    welt.insertOk = true;

    welt.rpc.length = 0; welt.einfuegen = 0;
    welt.rpcAntwort = antwort(404, 'PGRST202');
    r = await senden();
    t('Ohne SQL 52: Bestellung geht ganz normal durch, nichts zurueckgebucht', r.d.ok === true && welt.einfuegen === 1 && welt.rpc.length === 1, r.body);

    // ---- PayPal ----
    var pp = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'paypal-zahlung.js'), 'utf8');
    t('PayPal: nach dem Speichern abziehen, nicht ablehnen (erzwingen)', /PORTIONEN\.buchen\(SUPABASE_URL, KEY, order\.restaurant_id, PORTIONEN\.posten\(nutz\), 'erzwingen'\)/.test(pp)
        && pp.indexOf("'erzwingen'") > pp.indexOf('var ins = await bestellungSchreiben(nutz);'), '');

    // ---- Browser ----
    var sub = fn('submitOrder');
    t('Browser: 409 Portionen -> eigener Zweig, KEIN Notweg', /\} else if \(_srv\.status === 409 && _srvj && _srvj\.portionen\) \{[\s\S]{0,200}_portionenAbgelehnt = _srvj;/.test(sub)
        && /if \(_portionenAbgelehnt\) \{\s*showToast\(_portionenAbgelehnt\.error[\s\S]{0,200}return;\s*\}/.test(sub), '');
    t('Browser: Portionen-Zweig steht VOR dem Notweg (wie Preis-Schutz)', sub.indexOf('if (_portionenAbgelehnt)') > 0 && sub.indexOf('if (_portionenAbgelehnt)') < sub.indexOf('if (_preisAbgelehnt)'), '');

    // Warenkorb-Grenze, wirklich ausgefuehrt
    var add = fn('addItemToCart');
    var grenze = /    var _pRest = parseInt[\s\S]*?\n    \}\n/.exec(add)[0];
    function korb(rest, imKorb, menge) {
        var toasts = [];
        var f = new Function('currentMenuItem', 'orderCart', 'currentItemQty', 'showToast', grenze + ' return "weiter";');
        var r = f({ id: 'm1', portionen_rest: rest }, imKorb ? [{ menu_item_id: 'm1', quantity: imKorb }] : [], menge, function (m) { toasts.push(m); });
        return { r: r, toast: toasts[0] };
    }
    t('Korb: unbegrenzt (null) -> weiter', korb(null, 0, 5).r === 'weiter', '');
    t('Korb: noch 3, will 2 -> weiter', korb(3, 0, 2).r === 'weiter', '');
    var k = korb(3, 2, 2);
    t('Korb: noch 3, 2 drin, will 2 -> gestoppt, "hoechstens 1 mehr"', k.r === undefined && /nur noch 3 – höchstens 1 mehr/.test(k.toast), JSON.stringify(k));
    k = korb(0, 0, 1);
    t('Korb: 0 -> "keine mehr"', k.r === undefined && /keine mehr\.$/.test(k.toast), JSON.stringify(k));

    // Pille "Nur noch N" in der Speisekarte
    var pille = /    var _rest = parseInt\(item && item\.portionen_rest, 10\);\n    if \(_rest > 0 && _rest <= 5\) badges \+= [^\n]+\n/.exec(fn('getMenuBadgeIcons'))[0];
    function b(rest) { return new Function('item', '_t', 'var badges = "";' + pille + 'return badges;')({ portionen_rest: rest }, {}); }
    t('Speisekarte: "Nur noch 3" ab 5 abwaerts, nicht bei 6, nicht bei 0/unbegrenzt', b(3) === '<span class="kin-knapp">Nur noch 3</span>' && b(6) === '' && b(0) === '' && b(null) === '', b(3));

    // ---- Kuechen-Display ----
    t('Kueche: Portionen-Feld je Gericht (leer = unbegrenzt)', /placeholder="∞"[^\n]*onchange="kdsPortionenSetzen\(/.test(fn('kdsAusverkaufOeffnen')), '');
    var setz = fn('kdsPortionenSetzen');
    t('Kueche: >0 setzt Tag, bestellbar; 0 = ausverkauft; leer = Zaehler aus',
        /portionen_rest: nZahl, portionen_am: heute, is_available: true, ausverkauft_am: null/.test(setz)
        && /portionen_rest: 0, portionen_am: heute, is_available: false, ausverkauft_am: heute/.test(setz)
        && /leer \? \{ portionen_rest: null, portionen_am: null \}/.test(setz), '');
    t('Kueche: fehlt SQL 52, sagt sie es', /Portionen zählen braucht einmal datenbank\/52-ausverkauft\.sql/.test(setz), '');
    t('Kueche: "wird knapp" steht gelb unten', /class="kds-chip knapp"/.test(fn('kdsAusverkauftChipsHtml')), '');

    // ---- Nachtlauf + SQL ----
    var Z = require(path.join(KMI, 'netlify', 'functions', 'ausverkauft-zurueck.js'));
    var aufrufe = [];
    global.fetch = async function (url, o) { aufrufe.push([url, JSON.parse(o.body)]); return { ok: true, status: 200, text: async function () { return '[{"id":"x"}]'; } }; };
    var st = await Z._test.freigeben(new Date('2026-11-10T03:10:00Z'));
    t('Nachtlauf: Portionen-Zaehler von gestern zurueck auf unbegrenzt', aufrufe.length === 2 && /portionen_am=lt\.2026-11-10/.test(aufrufe[1][0]) && aufrufe[1][1].portionen_rest === null && aufrufe[1][1].is_available === true && st.portionen_zurueck === 1, JSON.stringify(aufrufe));
    var sql = fs.readFileSync(path.join(KMI, 'datenbank', '52-ausverkauft.sql'), 'utf8');
    t('SQL: Spalten, nie negativ', /add column if not exists portionen_rest integer/.test(sql) && /add column if not exists portionen_am date/.test(sql) && /check \(portionen_rest is null or portionen_rest >= 0\)/.test(sql), '');
    t('SQL: pruefen sperrt die Zeile (for update), bevor abgezogen wird', /for update;\s*\n\s*if v_rest is not null and v_rest < r\.menge then/.test(sql), '');
    t('SQL: nur der Server darf buchen (nicht anon/authenticated)', /revoke all on function public\.kmi_portionen_buchen\(uuid, jsonb, text\) from public, anon, authenticated;/.test(sql) && /grant execute on function public\.kmi_portionen_buchen\(uuid, jsonb, text\) to service_role;/.test(sql), '');
    t('SQL: bei 0 ausverkauft, nie unter 0', /portionen_rest = greatest\(portionen_rest - r\.menge, 0\),\s*\n\s*is_available = \(portionen_rest - r\.menge\) > 0/.test(sql), '');
    var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
    t('sw.js CACHE hochgezaehlt (mind. v135)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 135, '');

    console.log('\n' + ok + '/' + n + ' OK');
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
