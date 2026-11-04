// GESCHENKGUTSCHEINE (03.11.2026) -- Server.
// Fuehrt netlify/functions/geschenkgutschein.js AUS, mit nachgebautem
// PayPal und nachgebauter Datenbank: kein Gutschein ohne Geld, richtiger
// Betrag, doppelt buchen = derselbe Gutschein, Einloesen nur fuers eigene
// Lokal und nur bis zum Rest.
'use strict';
process.env.SUPABASE_SERVICE_KEY = 'dienst';
process.env.SUPABASE_URL = 'https://db.test';
process.env.RESEND_API_KEY = 'resend';
var path = require('path');
var F = require(path.join(__dirname, '..', 'netlify', 'functions', 'geschenkgutschein.js'));
var T = F._test;
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

// ---- Reine Helfer ----
var c1 = T.neuerCode();
t('Code: KIN-XXXX-XXXX ohne 0/O/1/I/L', /^KIN-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(c1), c1);
var codes = {}; for (var i = 0; i < 2000; i++) codes[T.neuerCode()] = 1;
t('2000 Codes, alle verschieden (Zufall)', Object.keys(codes).length === 2000, Object.keys(codes).length);
t('abgetippt: klein, mit Leerzeichen, ohne Striche -> erkannt', T.codeNormal(' kin abcd 2345 ') === 'KIN-ABCD-2345' && T.codeNormal('ABCD2345') === 'KIN-ABCD-2345', T.codeNormal(' kin abcd 2345 '));
t('falsche Laenge / verbotene Zeichen -> leer', T.codeNormal('KIN-ABCD-234') === '' && T.codeNormal('KIN-AB0D-2345') === '' && T.codeNormal('') === '', '');
t('Betrag: ganze Euro 10-300', T.betragOk(50) && T.betragOk(10) && T.betragOk(300) && !T.betragOk(9) && !T.betragOk(301) && !T.betragOk(25.5) && !T.betragOk('x'), '');
t('gueltig 3 Jahre bis Jahresende', T.gueltigBis(new Date('2026-11-03T12:00:00')) === '2029-12-31', T.gueltigBis(new Date('2026-11-03T12:00:00')));
var oeff = T.oeffentlich({ code: 'KIN-A', betrag: '50.00', rest: '20.00', kaeufer_email: 'geheim@x.de', kaeufer_name: 'Anna', empfaenger_name: 'Opa' }, { id: 'R', name: 'Lokal' });
t('Ansicht per Code verraet die Kaeufer-Mail NICHT', JSON.stringify(oeff).indexOf('geheim') < 0 && oeff.von === 'Anna' && oeff.rest === 20, JSON.stringify(oeff));
var g0 = { status: 'aktiv', rest: '50.00', gueltig_bis: '2029-12-31' };
t('Einloesen 20 von 50 -> Rest 30, aktiv', JSON.stringify(T.einloesePlan(g0, 20, '2026-11-03')) === JSON.stringify({ betrag: 20, alterRest: 50, rest: 30, status: 'aktiv' }), JSON.stringify(T.einloesePlan(g0, 20, '2026-11-03')));
t('Einloesen genau den Rest -> eingeloest', T.einloesePlan(g0, 50, '2026-11-03').status === 'eingeloest', '');
t('mehr als der Rest -> abgelehnt mit Rest im Text', /nur noch 50,00 €/.test(T.einloesePlan(g0, 50.01, '2026-11-03').fehler || ''), T.einloesePlan(g0, 50.01, '2026-11-03').fehler);
t('abgelaufen / eingeloest / 0 € -> abgelehnt', !!T.einloesePlan({ status: 'aktiv', rest: 5, gueltig_bis: '2026-01-01' }, 1, '2026-11-03').fehler && !!T.einloesePlan({ status: 'eingeloest', rest: 0, gueltig_bis: '2029-12-31' }, 1, '2026-11-03').fehler && !!T.einloesePlan(g0, 0, '2026-11-03').fehler, '');
t('verkauft nur mit Schalter "geschenkgutschein"', T.verkauftAn({ features: ['geschenkgutschein'] }) && !T.verkauftAn({ features: ['payment_paypal'] }) && !T.verkauftAn({ features: ['geschenkgutschein'], is_active: false }), '');

// ---- Nachgebaute Welt ----
var RID = '11111111-2222-3333-4444-555555555555';
var welt;
function neueWelt() {
    welt = {
        lokal: { id: RID, name: 'Hafenkate', slug: 'hafenkate', city: 'Greetsiel', email: 'wirt@hafenkate.de', features: ['geschenkgutschein'], is_active: true },
        konto: [{ client_id: 'cid', secret: 'sec', live: false }],
        gutscheine: [], events: [], mails: [], tabelle: true,
        capture: { status: 'COMPLETED', value: '50.00', currency: 'EUR' },
        user: 'wirt@hafenkate.de', kunden: { 'wirt@hafenkate.de': [RID] }, insertFehler: 0, patchLeer: false
    };
}
function antwort(status, obj) { var tx = typeof obj === 'string' ? obj : JSON.stringify(obj); return { ok: status < 400, status: status, text: async function () { return tx; }, json: async function () { return JSON.parse(tx); } }; }
global.fetch = async function (url, o) {
    o = o || {}; var m = o.method || 'GET';
    if (/api\.resend\.com/.test(url)) { welt.mails.push(JSON.parse(o.body)); return antwort(200, { id: 'm1' }); }
    if (/\/v1\/oauth2\/token/.test(url)) return antwort(200, { access_token: 'pp' });
    if (/\/v2\/checkout\/orders\/[^/]+\/capture/.test(url)) {
        var c = welt.capture;
        return antwort(201, { id: 'PP1', status: c.status, purchase_units: [{ payments: { captures: [{ id: 'CAP1', amount: { value: c.value, currency_code: c.currency } }] } }] });
    }
    if (/\/v2\/checkout\/orders$/.test(url)) { welt.angelegt = JSON.parse(o.body); return antwort(201, { id: 'PP1' }); }
    if (/\/auth\/v1\/user/.test(url)) return welt.user ? antwort(200, { email: welt.user }) : antwort(401, {});
    var q = decodeURIComponent(url);
    if (/\/rest\/v1\/customers/.test(url)) {
        if (/role=eq\.superadmin|select=role/.test(q)) return antwort(200, []);
        var mail = (/email=ilike\.([^&]+)/.exec(q) || [])[1] || '';
        return antwort(200, (welt.kunden[mail] || []).map(function (r) { return { restaurant_id: r }; }));
    }
    if (/\/rest\/v1\/restaurants\?/.test(url)) return antwort(200, [welt.lokal]);
    if (/\/rest\/v1\/paypal_konten/.test(url)) return antwort(200, welt.konto);
    if (/\/rest\/v1\/restaurant_events/.test(url)) { welt.events.push(JSON.parse(o.body)); return antwort(201, ''); }
    if (/\/rest\/v1\/zahlsperre|zahl_sperre|abo/.test(url)) return antwort(200, []);
    if (/\/rest\/v1\/geschenkgutscheine/.test(url)) {
        if (!welt.tabelle) return antwort(404, { code: 'PGRST205', message: 'Could not find the table public.geschenkgutscheine' });
        if (m === 'POST') {
            if (welt.insertFehler) { welt.insertFehler--; return antwort(500, { message: 'kaputt' }); }
            var z = Object.assign({ id: 'g' + (welt.gutscheine.length + 1), einloesungen: [], erstellt: '2026-11-03T10:00:00Z' }, JSON.parse(o.body));
            welt.gutscheine.push(z); return antwort(201, [z]);
        }
        var f = welt.gutscheine.filter(function (g) {
            var ok2 = true;
            q.replace(/[?&](code|paypal_order_id|restaurant_id|id|status)=eq\.([^&]+)/g, function (_, k, v) { if (String(g[k]) !== v) ok2 = false; });
            var r = /[?&]rest=eq\.([^&]+)/.exec(q); if (r && Number(g.rest) !== Number(r[1])) ok2 = false;
            q.replace(/[?&](\w+)=is\.null/g, function (_, k) { if (g[k] != null) ok2 = false; });
            q.replace(/[?&](\w+)=not\.is\.null/g, function (_, k) { if (g[k] == null) ok2 = false; });
            q.replace(/[?&](\w+)=lte\.([^&]+)/g, function (_, k, v) { if (!(g[k] != null && String(g[k]) <= v)) ok2 = false; });
            q.replace(/[?&](versendet_am)=eq\.([^&]+)/g, function (_, k, v) { if (String(g[k]) !== v) ok2 = false; });
            return ok2;
        });
        if (m === 'PATCH') { if (welt.patchLeer) return antwort(200, []); f.forEach(function (g) { Object.assign(g, JSON.parse(o.body)); }); return antwort(200, f); }
        return antwort(200, f);
    }
    return antwort(200, []);
};
function rufe(body, tok) { return F.handler({ httpMethod: 'POST', headers: tok ? { authorization: 'Bearer ' + tok } : {}, body: JSON.stringify(body) }).then(function (r) { return { code: r.statusCode, j: JSON.parse(r.body) }; }); }

(async function () {
    neueWelt();
    var r = await rufe({ action: 'info', r: RID });
    t('info: Lokal mit Schalter + PayPal -> aktiv, mit Client-ID', r.j.aktiv === true && r.j.client_id === 'cid', JSON.stringify(r.j));
    welt.lokal.features = [];
    r = await rufe({ action: 'info', r: RID });
    t('info: ohne Schalter -> nicht aktiv (Wirt muss es wollen)', r.j.aktiv === false && r.j.grund === 'aus', JSON.stringify(r.j));
    neueWelt(); welt.konto = [];
    r = await rufe({ action: 'info', r: RID });
    t('info: ohne PayPal-Konto -> nicht aktiv', r.j.aktiv === false && r.j.grund === 'kein_paypal', JSON.stringify(r.j));
    neueWelt(); welt.tabelle = false;
    r = await rufe({ action: 'info', r: RID });
    t('info: ohne SQL 51 -> nicht aktiv, sagt "sql51"', r.j.aktiv === false && r.j.grund === 'sql51', JSON.stringify(r.j));
    r = await rufe({ action: 'anlegen', r: RID, betrag: 50 });
    t('anlegen ohne SQL 51 -> abgelehnt, NICHTS bei PayPal angelegt', r.code === 409 && !welt.angelegt, JSON.stringify(r.j));

    neueWelt();
    welt.lokal.features = [];
    r = await rufe({ action: 'anlegen', r: RID, betrag: 50 });
    t('anlegen bei ausgeschaltetem Schalter -> 409, NICHTS bei PayPal', r.code === 409 && !welt.angelegt, JSON.stringify(r.j));
    welt.lokal.features = ['geschenkgutschein'];
    r = await rufe({ action: 'anlegen', r: RID, betrag: 25.5 });
    t('anlegen: krummer Betrag -> 400', r.code === 400, r.code);
    r = await rufe({ action: 'anlegen', r: RID, betrag: 50 });
    t('anlegen: PayPal-Auftrag ueber genau 50.00 EUR', r.j.ok && welt.angelegt.purchase_units[0].amount.value === '50.00' && welt.angelegt.purchase_units[0].amount.currency_code === 'EUR', JSON.stringify(welt.angelegt && welt.angelegt.purchase_units));

    var kauf = { action: 'buchen', r: RID, paypal_id: 'PP1', betrag: 50, empfaenger: 'Oma Gerda', nachricht: 'Frohe Weihnachten!', kaeufer_name: 'Anna', kaeufer_email: 'Anna@Example.de', motiv: 'festlich' };
    r = await rufe(kauf);
    var g = welt.gutscheine[0];
    t('buchen: bezahlt -> Gutschein mit Code, 50 € Rest, gueltig 3 Jahre', r.j.ok && g && /^KIN-/.test(g.code) && g.rest === 50 && g.betrag === 50 && /-12-31$/.test(g.gueltig_bis) && r.j.gutschein.code === g.code, JSON.stringify(r.j));
    t('buchen: Gruss, Empfaenger, Motiv gespeichert; Mail klein geschrieben', g.nachricht === 'Frohe Weihnachten!' && g.empfaenger_name === 'Oma Gerda' && g.motiv === 'festlich' && g.kaeufer_email === 'anna@example.de', JSON.stringify(g));
    t('Mail an den Kaeufer mit Code und Link', welt.mails.length === 1 && welt.mails[0].to[0] === 'anna@example.de' && welt.mails[0].html.indexOf(g.code) > -1 && welt.mails[0].html.indexOf('?gutschein=' + encodeURIComponent(g.code)) > -1 && r.j.mail === true, JSON.stringify(welt.mails[0] && welt.mails[0].to));
    t('Antwort an den Gast verraet keine Kaeufer-Mail', JSON.stringify(r.j).indexOf('anna@example.de') < 0, '');
    r = await rufe(kauf);
    t('zweimal buchen (Zurueck-Taste) -> derselbe Gutschein, kein zweiter', r.j.ok && r.j.doppelt === true && welt.gutscheine.length === 1 && r.j.gutschein.code === g.code, JSON.stringify(r.j));

    neueWelt(); welt.capture.value = '5.00';
    r = await rufe(kauf);
    t('bezahlt 5 €, erwartet 50 € -> KEIN Gutschein, Meldung mit PayPal-Nummer', !r.j.ok && welt.gutscheine.length === 0 && /PP1/.test(r.j.error), JSON.stringify(r.j));
    neueWelt(); welt.capture.status = 'PENDING';
    r = await rufe(kauf);
    t('Zahlung nicht COMPLETED -> KEIN Gutschein', r.code === 402 && welt.gutscheine.length === 0, JSON.stringify(r.j));
    neueWelt(); welt.insertFehler = 9;
    r = await rufe(kauf);
    t('bezahlt, aber nicht gespeichert -> laut: restaurant_events + Nummer fuer den Gast', r.code === 500 && r.j.bezahlt === true && welt.events.length === 1 && welt.events[0].type === 'gutschein_bezahlt_ohne_gutschein', JSON.stringify(r.j));

    // ---- Ansehen ----
    neueWelt();
    await rufe(kauf); g = welt.gutscheine[0];
    r = await rufe({ action: 'ansehen', code: g.code.toLowerCase().replace(/-/g, ' ') });
    t('ansehen per Code (auch klein/ohne Striche) -> Betrag, Lokal, Gruss', r.j.ok && r.j.gutschein.betrag === 50 && r.j.gutschein.lokal.name === 'Hafenkate' && r.j.gutschein.nachricht === 'Frohe Weihnachten!', JSON.stringify(r.j));
    r = await rufe({ action: 'ansehen', code: 'KIN-ZZZZ-ZZZZ' });
    t('unbekannter Code -> 404', r.code === 404, r.code);

    // ---- Einloesen ----
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 });
    t('einloesen ohne Anmeldung -> 403', r.code === 403, r.code);
    welt.user = 'fremd@x.de';
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 }, 'tok');
    t('einloesen von fremdem Lokal-Konto -> 403', r.code === 403, r.code);
    welt.user = 'anderer@wirt.de'; welt.kunden['anderer@wirt.de'] = ['99999999-2222-3333-4444-555555555555'];
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 }, 'tok');
    t('Wirt eines ANDEREN Lokals -> 403, nichts abgebucht', r.code === 403 && g.rest === 50, r.code);
    welt.user = 'wirt@hafenkate.de';
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 }, 'tok');
    t('Wirt loest 20 € ein -> Rest 30, Buchung protokolliert', r.j.ok && r.j.rest === 30 && g.rest === 30 && g.einloesungen.length === 1 && g.einloesungen[0].betrag === 20, JSON.stringify(r.j));
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 40 }, 'tok');
    t('mehr als der Rest -> abgelehnt, Rest bleibt 30', r.code === 409 && g.rest === 30 && /30,00/.test(r.j.error), JSON.stringify(r.j));
    welt.patchLeer = true;
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 10 }, 'tok');
    t('gleichzeitig woanders geaendert (0 Zeilen) -> NICHT als eingeloest gemeldet', r.code === 409 && /nicht eingelöst/i.test(r.j.error), JSON.stringify(r.j));
    welt.patchLeer = false;
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 30 }, 'tok');
    t('Rest ganz einloesen -> Status eingeloest', r.j.ok && g.status === 'eingeloest' && g.rest === 0, JSON.stringify(g));
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 1 }, 'tok');
    t('danach nochmal -> "schon ganz eingelöst"', r.code === 409 && /schon ganz eingelöst/.test(r.j.error), JSON.stringify(r.j));
    // ---- Vor Ort verkaufen ----
    neueWelt(); welt.konto = []; welt.lokal.features = [];   // ohne PayPal und ohne Online-Schalter
    r = await rufe({ action: 'vorort', r: RID, betrag: '12,50', zahlart: 'bar', empfaenger: 'Mia' });
    t('vor Ort ohne Anmeldung -> 403', r.code === 403 && !welt.gutscheine.length, r.code);
    r = await rufe({ action: 'vorort', r: RID, betrag: 50, zahlart: '' }, 'tok');
    t('vor Ort ohne Zahlart -> 400, nichts angelegt', r.code === 400 && !welt.gutscheine.length && /bar oder Karte/.test(r.j.error), JSON.stringify(r.j));
    r = await rufe({ action: 'vorort', r: RID, betrag: 3, zahlart: 'bar' }, 'tok');
    t('vor Ort 3 € -> 400', r.code === 400 && !welt.gutscheine.length, r.code);
    r = await rufe({ action: 'vorort', r: RID, betrag: '12,50', zahlart: 'bar', empfaenger: 'Mia', motiv: 'geburtstag' }, 'tok');
    var gv = welt.gutscheine[0];
    t('vor Ort bar 12,50 € (ohne PayPal, ohne Schalter) -> Gutschein, gleicher Code-Typ', r.j.ok && gv && gv.betrag === 12.5 && gv.rest === 12.5 && gv.verkauft_ueber === 'bar' && !gv.paypal_order_id && /^KIN-/.test(gv.code) && gv.motiv === 'geburtstag', JSON.stringify(gv));
    t('vor Ort ohne E-Mail -> keine Mail', welt.mails.length === 0 && r.j.mail === null, welt.mails.length);
    r = await rufe({ action: 'vorort', r: RID, betrag: 40, zahlart: 'karte', kaeufer_email: 'gast@x.de', empfaenger: 'Jan' }, 'tok');
    t('vor Ort mit E-Mail -> Mail mit dem Gutschein, "Bezahlt im Lokal"', r.j.mail === true && welt.mails.length === 1 && /Bezahlt im Lokal/.test(welt.mails[0].html) && welt.mails[0].html.indexOf(welt.gutscheine[1].code) > -1, JSON.stringify(r.j));
    r = await rufe({ action: 'einloesen', r: RID, code: welt.gutscheine[0].code, betrag: 10 }, 'tok');
    t('vor Ort verkaufter Gutschein laesst sich normal einloesen', r.j.ok && r.j.rest === 2.5, JSON.stringify(r.j));
    neueWelt(); await rufe(kauf);
    t('Mail (online): Geschenk-Kopf "Für Oma Gerda", Karte mit Betrag/Code/gueltig bis, Weiterleiten-Tipp, "per PayPal"', /GUTSCHEIN/.test(welt.mails[0].html) && />50<span[^>]*>&nbsp;€</.test(welt.mails[0].html) && /gültig bis<br>31\.12\./.test(welt.mails[0].html) && /Für <i>Oma Gerda<\/i>/.test(welt.mails[0].html) && /Ein Geschenk für Oma Gerda/.test(welt.mails[0].subject) && /Zum Weiterschenken: Mail weiterleiten/.test(welt.mails[0].html) && /Bezahlt per PayPal an Hafenkate/.test(welt.mails[0].html), welt.mails[0].html.slice(0, 160));
    t('Hilfe: Betrag vor Ort mit Komma, 5-500 €', F._test.betragVorOrt('12,50') === 12.5 && F._test.betragVorOrt(4.99) === null && F._test.betragVorOrt(501) === null, '');
    // ---- Direkt an den Beschenkten ----
    var heute = F._intern.heuteBerlin();
    neueWelt();
    r = await rufe(Object.assign({}, kauf, { empfaenger_email: 'Oma@Example.de', versand_am: '' }));
    var an = welt.mails.filter(function (m) { return m.to[0] === 'oma@example.de'; })[0];
    t('direkt, ohne Tag -> Geschenk-Mail sofort an den Beschenkten', r.j.ok && !!an && r.j.zustellung && r.j.zustellung.gesendet === true && !!welt.gutscheine[0].versendet_am, JSON.stringify(r.j.zustellung));
    t('Geschenk-Mail: "Anna schenkt dir einen Abend bei Hafenkate", Karte, Knopf -- ohne Weiterleiten-Tipp und ohne PayPal', !!an && /^🎁 Anna schenkt dir einen Abend bei Hafenkate$/.test(an.subject) && /Für <i>Oma Gerda<\/i>/.test(an.html) && an.html.indexOf(welt.gutscheine[0].code) > -1 && /Meinen Gutschein ansehen/.test(an.html) && !/weiterleiten|PayPal/i.test(an.html), an && an.subject);
    var beleg = welt.mails.filter(function (m) { return m.to[0] === 'anna@example.de'; })[0];
    t('Kaeufer-Mail: "Zustellung ... jetzt ... an oma@" statt Weiterschenken-Hinweis', !!beleg && /Zustellung:/.test(beleg.html) && /<b>jetzt<\/b>/.test(beleg.html) && /oma@example\.de/.test(beleg.html) && !/Zum Weiterschenken/.test(beleg.html), beleg && beleg.html.slice(-600));
    t('Antwort an den Gast verraet die Empfaenger-Mail nicht im Gutschein', JSON.stringify(r.j.gutschein).indexOf('oma@') < 0, '');
    var morgen = new Date(Date.now() + 2 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    neueWelt();
    r = await rufe(Object.assign({}, kauf, { empfaenger_email: 'oma@example.de', versand_am: morgen }));
    t('direkt am Wunschtag -> jetzt KEINE Geschenk-Mail, Tag gespeichert', r.j.ok && r.j.zustellung.am === morgen && r.j.zustellung.gesendet === false && !welt.mails.some(function (m) { return m.to[0] === 'oma@example.de'; }) && welt.gutscheine[0].versand_am === morgen && !welt.gutscheine[0].versendet_am, JSON.stringify(r.j.zustellung));
    t('Kaeufer-Mail nennt den Wunschtag', /am <b>\d\d\.\d\d\.\d{4}<\/b> ab 8 Uhr/.test(welt.mails[0].html), '');
    neueWelt();
    r = await rufe(Object.assign({}, kauf, { empfaenger_email: 'kaputt', versand_am: '' }));
    t('kaputte Empfaenger-Adresse -> Gutschein trotzdem da, Hinweis statt Zustellung', r.j.ok && welt.gutscheine.length === 1 && !welt.gutscheine[0].empfaenger_email && /sah nicht richtig aus/.test(r.j.zustellung.fehler), JSON.stringify(r.j.zustellung));
    t('Wunschtag: Vergangenheit / ueber 1 Jahr / Unsinn -> sofort', F._test.versandTag('2020-01-01', heute) === null && F._test.versandTag('2099-01-01', heute) === null && F._test.versandTag('morgen', heute) === null && F._test.versandTag(heute, heute) === heute, '');

    // ---- Stuendlicher Versand ----
    var V = require(path.join(__dirname, '..', 'netlify', 'functions', 'gutschein-versand.js'));
    neueWelt();
    welt.gutscheine.push({ id: 'v1', code: 'KIN-AAAA-BBBB', restaurant_id: RID, betrag: 50, rest: 50, status: 'aktiv', empfaenger_email: 'oma@example.de', empfaenger_name: 'Oma', kaeufer_name: 'Anna', versand_am: heute, versendet_am: null, gueltig_bis: '2029-12-31', motiv: 'klassisch' });
    welt.gutscheine.push({ id: 'v2', code: 'KIN-CCCC-DDDD', restaurant_id: RID, betrag: 25, rest: 25, status: 'aktiv', empfaenger_email: 'spaeter@example.de', versand_am: morgen, versendet_am: null, gueltig_bis: '2029-12-31', motiv: 'festlich' });
    var stunde = F._intern.stundeBerlin;
    F._intern.stundeBerlin = function () { return 7; };
    var v = JSON.parse((await V.handler({})).body);
    t('Versand vor 8 Uhr -> wartet, keine Mail', v.warten === 'vor 8 Uhr' && welt.mails.length === 0, JSON.stringify(v));
    F._intern.stundeBerlin = function () { return 9; };
    var vr = await V.handler({}); v = JSON.parse(vr.body);
    t('Versand um 9 Uhr -> faellige Geschenk-Mail raus, versendet_am gesetzt, Antwort 200', vr.statusCode === 200 && v.verschickt === 1 && welt.mails.length === 1 && !!welt.gutscheine[0].versendet_am, JSON.stringify(v));
    t('Geschenk fuer uebermorgen bleibt liegen', !welt.mails.some(function (m) { return m.to[0] === 'spaeter@example.de'; }) && !welt.gutscheine[1].versendet_am, '');
    var doppelt = await F._intern.zustellen(welt.gutscheine[0], welt.lokal);
    t('dasselbe Geschenk noch einmal zustellen (z. B. gleichzeitig) -> keine zweite Mail', doppelt === false && welt.mails.length === 1, welt.mails.length);
    v = JSON.parse((await V.handler({})).body);
    t('naechste Stunde -> nicht noch einmal', v.faellig === 0 && welt.mails.length === 1, JSON.stringify(v));
    F._intern.stundeBerlin = stunde;

    welt.user = 'wirt@hafenkate.de';
    r = await rufe({ action: 'liste', r: RID }, 'tok');
    t('liste fuer den Wirt -> seine Gutscheine', r.j.ok && r.j.gutscheine.length === welt.gutscheine.length && r.j.gutscheine.length > 0, JSON.stringify(r.j).slice(0, 120));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
