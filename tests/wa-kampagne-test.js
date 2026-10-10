// WhatsApp-Kampagne: jeder Gast mit Zustimmung bekommt seinen eigenen Code,
// eingetragen mit Namen und Quelle; Versand Gast für Gast mit Abmelde-Link;
// Einlösung online automatisch (order-save), im Lokal per Knopf.
//
// Ibo, 09.10.2026: "dass deren Name auch in der Kampagne eingetragen wird,
// dass wir es trennen bei Liste und Monatsbericht".
'use strict';
var fs = require('fs'), path = require('path');
var W = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(W, 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }
var block = H.slice(H.indexOf('var _wa = { einw: [], kampagnen: [], empf: [], fehler: \'\', rid: null };'), H.indexOf('window.waLaden = waLaden;'));

function welt() {
    var w = { db: { wa_kampagnen: [], wa_kampagnen_empfaenger: [], coupons: [] }, toasts: [], geoeffnet: [], felder: {}, fehlerBei: null, patches: [] };
    w.fetch = async function (u, o) {
        var m = /\/rest\/v1\/([a-z_]+)/.exec(u)[1], body = o && o.body ? JSON.parse(o.body) : null;
        if (w.fehlerBei && w.fehlerBei(m, body)) return { ok: false, status: 403, json: async function () { return { message: 'verboten' }; } };
        if (o.method === 'PATCH') { w.patches.push({ u: u, body: body }); return { ok: true, status: 200, json: async function () { return [Object.assign({ id: 'x' }, body)]; } }; }
        var zeilen = (Array.isArray(body) ? body : [body]).map(function (z, i) { return Object.assign({ id: m + '-' + (w.db[m].length + i + 1) }, z); });
        w.db[m] = w.db[m].concat(zeilen);
        return { ok: true, status: 201, json: async function () { return zeilen; } };
    };
    w.document = { getElementById: function (id) { if (!w.felder[id]) w.felder[id] = { value: '', textContent: '', style: {}, disabled: false, innerHTML: '' }; return w.felder[id]; } };
    return w;
}
function bauen(w) {
    return new Function('w', 'var fetch = w.fetch, document = w.document, SUPABASE_URL = "https://x.supabase.co", SUPABASE_KEY = "k";'
        + 'var window = { open: function (u) { w.geoeffnet.push(u); }, crypto: undefined }; var crypto;'
        + 'function kmiToken() { return "t"; } function todayStrLocal() { return "2026-10-09"; } function localDayStr(ms) { return "2026-10-23"; }'
        + 'function showToast(m, a) { w.toasts.push([m, a]); } function escapeHtml(x) { return String(x == null ? "" : x); } function formatPrice(p) { return p.toFixed(2) + " €"; }'
        + 'function waNummer(x) { return String(x).replace(/\\D/g, ""); } function closeGenericModal() {} function showGenericModal() {} async function kinConfirm() { return true; }'
        + 'function supabaseGet() { return Promise.resolve([]); } function mktRestaurant() { return { id: "r1", name: "Lounge 7", slug: "lounge7" }; }\n'
        + fn('gutscheinCode') + '\n' + fn('gutscheinAnlegen') + '\n' + block
        + '; return { _wa: _wa, anlegen: waAngebotAnlegen, nachricht: waNachricht, senden: waSenden, imLokal: waImLokal };')(w);
}

(async function () {
    var w = welt(), A = bauen(w);
    A._wa.rid = 'r1';
    A._wa.einw = [
        { id: 'e1', telefon: '491761111111', name: 'Ayse Yilmaz', quelle: 'bestellung', abmelde_token: 'tok-1' },
        { id: 'e2', telefon: '491762222222', name: 'Jan', quelle: 'reservierung', abmelde_token: 'tok-2' },
        { id: 'e3', telefon: '491763333333', name: 'Tim', quelle: 'bestellung', abmelde_token: 'tok-3', widerrufen_at: '2026-10-01T10:00:00Z' }
    ];
    w.felder.waTitel = { value: 'Schnitzeltag' }; w.felder.waText = { value: 'Freitag alle Schnitzel 12,90 €.' };
    w.felder.waRabatt = { value: '15' }; w.felder.waBis = { value: '2026-10-23' };
    var einwProbe = A._wa.einw.slice();
    await A.anlegen();
    A._wa.einw = einwProbe;   // anlegen lädt neu; die Attrappe liefert dabei []
    var k = w.db.wa_kampagnen[0], e = w.db.wa_kampagnen_empfaenger, c = w.db.coupons;
    t('Angebot angelegt mit Titel, Text, Rabatt, Datum', k && k.titel === 'Schnitzeltag' && k.rabatt_prozent === 15 && k.gueltig_bis === '2026-10-23', JSON.stringify(k));
    t('nur Gäste MIT gültiger Zustimmung (abgemeldeter Tim fehlt)', e.length === 2 && e.every(function (x) { return x.telefon !== '491763333333'; }), e.length);
    t('je Gast ein eigener Code in coupons (einmal einlösbar, 15 %)', c.length === 2 && c.every(function (x) { return x.max_uses === 1 && x.value === 15 && x.restaurant_id === 'r1'; }) && e[0].code === c[0].code && e[0].code !== e[1].code, JSON.stringify(c.map(function (x) { return x.code; })));
    t('Name und Quelle stehen beim Empfänger (für Liste und Monatsbericht)', e[0].name === 'Ayse Yilmaz' && e[0].quelle === 'bestellung' && e[1].quelle === 'reservierung' && e[0].einwilligung_id === 'e1', JSON.stringify(e[1]));

    var m = A.nachricht(k, e[0], A._wa.einw[0], { name: 'Lounge 7', slug: 'lounge7' });
    t('Nachricht: Vorname, Text, persönlicher Code, Bestell-Link, Absender, Abmelde-Link', /^Hallo Ayse!\n/.test(m) && /Freitag alle Schnitzel/.test(m) && m.indexOf('*' + e[0].code + '*') > 0 && /15 % Rabatt, gültig bis 23\.10\.2026/.test(m)
        && /kiekmolin\.de\/lounge7/.test(m) && /Lounge 7/.test(m) && /Keine Angebote mehr\? https:\/\/kiekmolin\.de\/abmelden\?t=tok-1$/.test(m), m);

    A._wa.kampagnen = [Object.assign({}, k)]; A._wa.empf = e.map(function (x) { return Object.assign({}, x); });
    await A.senden(A._wa.empf[0].id);
    t('Senden öffnet WhatsApp an die Nummer und hakt "verschickt" ab', /^https:\/\/wa\.me\/491761111111\?text=/.test(w.geoeffnet[0] || '') && w.patches.some(function (p) { return 'gesendet_at' in p.body; }), w.geoeffnet[0]);
    A._wa.einw[1].widerrufen_at = '2026-10-09T12:00:00Z';
    var vorher = w.geoeffnet.length;
    await A.senden(A._wa.empf[1].id);
    t('hat sich der Gast inzwischen abgemeldet: KEIN WhatsApp, Meldung', w.geoeffnet.length === vorher && /abgemeldet/.test(w.toasts[w.toasts.length - 1][0]), JSON.stringify(w.toasts[w.toasts.length - 1]));
    await A.imLokal(A._wa.empf[0].id);
    t('"im Lokal eingelöst" trägt eingeloest_at ein', w.patches.some(function (p) { return 'eingeloest_at' in p.body; }), '');

    // Fehler mitten im Anlegen: nicht still
    var w2 = welt(), B = bauen(w2);
    B._wa.rid = 'r1'; B._wa.einw = [{ id: 'e1', telefon: '491761111111', name: 'A', quelle: 'bestellung' }];
    w2.felder.waTitel = { value: 'X' }; w2.felder.waText = { value: 'Y' }; w2.felder.waRabatt = { value: '10' }; w2.felder.waBis = { value: '2026-10-23' };
    w2.fehlerBei = function (tab) { return tab === 'wa_kampagnen_empfaenger'; };
    await B.anlegen();
    t('Datenbank weist Empfänger ab: Meldung im Fenster, Knopf wieder frei', /Angebot angelegt, aber HTTP 403/.test(w2.felder.waFortschritt.textContent) && w2.felder.waAnlegenBtn.disabled === false, w2.felder.waFortschritt.textContent);

    // Server: Einlösung
    var os = fs.readFileSync(path.join(W, 'netlify/functions/order-save.js'), 'utf8');
    t('order-save: Code einer Bestellung -> eingelöst, Bestellung, Umsatz (nur einmal, nur dieses Lokal)', /await kampagneEingeloest\(order, id\);/.test(os) && /wa_kampagnen_empfaenger\?code=eq\.' \+ encodeURIComponent\(code\)\s*\+ '&restaurant_id=eq\.' \+ encodeURIComponent\(order\.restaurant_id\) \+ '&eingeloest_at=is\.null'/.test(os) && /umsatz: parseFloat\(order\.total\) \|\| 0/.test(os), '');
    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    delete require.cache[require.resolve(path.join(W, 'netlify/functions/order-save'))];
    t('Panel: fehlende Tabelle wird gesagt (SQL 42), nicht "noch niemand"', /WhatsApp-Angebote sind noch nicht eingerichtet: <b>datenbank\/42-whatsapp-angebote\.sql<\/b>/.test(H), '');
    t('alte Auto-Kampagnen-Tafel (nur Browser, nie verschickt) ist weg', !/id="marketingCampaigns"/.test(H) && /id="waPanel"/.test(H), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
