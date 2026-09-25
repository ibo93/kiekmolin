// DIE MAHNUNG -- das fehlende Glied vor der Zahlsperre.
//
// Ibo am 25.09.2026, nachdem die Sperre ausgeliefert war:
// "und wo ist das mit mahnungen?" -- und dann:
// "das muss selber was steuern ich kann es dann klicken".
//
// Vorher gab es im ganzen Projekt genau EINE Stelle mit dem Wort
// Mahnung: meinen eigenen Warnsatz in einem Bestaetigungsfenster. Einen
// Satz klickt man weg.
//
// WAS DIESER TEST VERTEIDIGT
// ==========================
//
//   1. Der Betrag kommt von Stripe. Nicht aus dem Browser, nicht aus
//      einem gespeicherten Feld. Keine Messung -> kein Schreiben.
//   2. Kein Schreiben mit Luecken im Absender.
//   3. Die Frist laeuft erst ab dem ZUSTELLEN. Ein misslungener Versand
//      darf nie zu einer abgelaufenen Frist werden.
//   4. Die letzte Stufe kuendigt KEINE Abschaltung an -- dafuer fehlt
//      die Vertragsklausel (32-vertrag.sql, nicht freigeschaltet).
//   5. "Pause" und "Aus" sind verriegelt, bis eine Frist abgelaufen ist.
//      Und bei einer Stoerung bleiben sie zu: hier gilt NICHT
//      "im Zweifel offen".
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const KMI = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
const SQL = fs.readFileSync(path.join(KMI, 'datenbank', '37-mahnung.sql'), 'utf8');
const TOML = fs.readFileSync(path.join(KMI, 'netlify.toml'), 'utf8');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

// Der Dienstschluessel wird beim Laden gelesen -- vor dem require setzen.
process.env.SUPABASE_SERVICE_KEY = 'test-dienst';
process.env.STRIPE_SECRET_KEY = 'sk_test_attrappe';
process.env.RESEND_API_KEY = 'rs_test';
process.env.EMAIL_FROM = 'rechnung@kiekmolin.de';

// Stripe ohne das echte Paket -- der Bauserver hat keines.
let ABO = null, ABO_WIRFT = null;
const STRIPE_ATTRAPPE = function () {
    return { subscriptions: { retrieve: async function () {
        if (ABO_WIRFT) throw new Error(ABO_WIRFT);
        return ABO;
    } } };
};
let attrappeBenutzt = false;
const echtesLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'stripe') { attrappeBenutzt = true; return STRIPE_ATTRAPPE; }
    return echtesLaden.apply(this, arguments);
};

const MA = require(path.join(KMI, 'netlify', 'functions', 'mahnung.js'));
t('laeuft ohne das echte stripe-Paket', attrappeBenutzt === true, 'echtes Paket geladen');

const ABSENDER = {
    firmierung: 'Kurani Design', inhaber: 'Ibrahim Kuran', strasse: 'Musterstr. 1',
    plz: '26624', ort: 'Südbrookmerland', email: 'ibo@kurani.de', telefon: '0170 1234567',
    iban: 'DE00 0000 0000 0000 0000 00', bic: 'GENODEF1XXX', bank: 'Raiffeisenbank',
    kleinunternehmer: true, frist_tage: 14
};
const HEUTE = new Date('2026-09-25T10:00:00Z');
function brief(extra) {
    return MA._briefText(Object.assign({
        stufe: 1, anbieter: ABSENDER,
        empfaenger_name: 'Pizzeria La Piazza', empfaenger_strasse: 'Hafenstr. 5',
        empfaenger_ort: '26736 Greetsiel',
        heute: HEUTE.toISOString(),
        frist_bis: new Date(HEUTE.getTime() + 14 * 86400000).toISOString(),
        betrag: 59.9, rechnung_ref: 'KIN-2026-09-004',
        faellig_seit: '2026-09-10T00:00:00Z'
    }, extra || {}));
}

// ===========================================================================
console.log('\n-- 1. Was in einem Mahnschreiben stehen MUSS --');
// ===========================================================================
const b = brief();
[['Firmierung des Absenders', 'Kurani Design'],
 ['Inhaber', 'Ibrahim Kuran'],
 ['Anschrift des Absenders', '26624 Südbrookmerland'],
 ['Empfaenger', 'Pizzeria La Piazza'],
 ['Datum', '25.09.2026'],
 ['Betrag', '59,90 €'],
 ['Rechnungsnummer', 'KIN-2026-09-004'],
 ['Faelligkeit', '10.09.2026'],
 ['Frist mit konkretem Datum', '09.10.2026'],
 ['IBAN', 'DE00 0000 0000 0000 0000 00'],
 ['Verwendungszweck', 'Verwendungszweck: KIN-2026-09-004'],
 ['Anrede', 'Sehr geehrte'],
 ['Gruss', 'Mit freundlichen Grüßen']
].forEach(function (f) {
    t(f[0] + ' steht drin', b.indexOf(f[1]) >= 0, f[1]);
});

t('Kleinunternehmer-Hinweis nach § 19 UStG',
  /§ 19 UStG/.test(b) && /keine Umsatzsteuer/.test(b), 'fehlt');
t('und er fehlt, wenn der Schalter aus ist',
  !/§ 19 UStG/.test(brief({ anbieter: Object.assign({}, ABSENDER, { kleinunternehmer: false }) })),
  'steht trotzdem drin');

// Der Satz, der eine peinliche Mahnung entschaerft: wer gerade
// ueberwiesen hat, soll nicht das Gefuehl haben, beschuldigt zu werden.
t('der Ueberschneidungs-Satz ist dabei',
  /gegenstandslos/.test(b), 'fehlt');

console.log('\n-- 2. Die drei Stufen --');
t('Stufe 1 heisst Zahlungserinnerung',
  /Zahlungserinnerung/.test(brief({ stufe: 1 })), MA._STUFEN[1].betreff);
t('Stufe 2 heisst 1. Mahnung', /1\. Mahnung/.test(brief({ stufe: 2 })));
t('Stufe 3 heisst Letzte Mahnung', /Letzte Mahnung/.test(brief({ stufe: 3 })));
t('ab Stufe 2 wird auf die vorherige Erinnerung Bezug genommen',
  /vorangegangene Zahlungserinnerung/.test(brief({ stufe: 2 })), 'fehlt');
t('Stufe 1 tut das NICHT -- es gab ja noch keine',
  !/vorangegangene Zahlungserinnerung/.test(brief({ stufe: 1 })), 'behauptet eine');

// DIE WICHTIGSTE ZUSICHERUNG DIESER GRUPPE.
// Die Leistung wegen offener Rechnung auszusetzen setzt eine Klausel im
// Vertrag voraus (§ 320 BGB). 32-vertrag.sql ist nicht freigeschaltet --
// [[PLATZHALTER]] drin, kein Anwalt drueber. Etwas anzukuendigen, wozu
// der Vertrag nicht berechtigt, waere selbst eine Pflichtverletzung.
['1', '2', '3'].forEach(function (st) {
    var x = brief({ stufe: Number(st) });
    t('Stufe ' + st + ' droht NICHT mit Abschaltung',
      !/abschalt|sperr|deaktivier|einstellen der Leistung|Leistung aus/i.test(x),
      (x.match(/.{0,40}(abschalt|sperr|deaktivier)/i) || [''])[0]);
});
t('und der Grund dafuer steht als Kommentar im Quelltext',
  /§ 320 BGB/.test(fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'mahnung.js'), 'utf8')),
  'nicht begruendet');

console.log('\n-- 3. Kein Schreiben mit Luecken im Absender --');
t('fehlt alles, werden alle Pflichtfelder genannt',
  MA._fehlendeFelder(null).length === MA._ABSENDER_PFLICHT.length,
  String(MA._fehlendeFelder(null).length));
t('die IBAN ist Pflicht',
  MA._fehlendeFelder(Object.assign({}, ABSENDER, { iban: '' })).join() === 'IBAN',
  MA._fehlendeFelder(Object.assign({}, ABSENDER, { iban: '' })).join());
t('Leerzeichen zaehlen nicht als ausgefuellt',
  MA._fehlendeFelder(Object.assign({}, ABSENDER, { ort: '   ' })).join() === 'Ort',
  MA._fehlendeFelder(Object.assign({}, ABSENDER, { ort: '   ' })).join());
t('vollstaendig heisst leer',
  MA._fehlendeFelder(ABSENDER).length === 0, MA._fehlendeFelder(ABSENDER).join());
// Telefon und BIC sind KEINE Pflicht -- wer sie verlangt, blockiert
// jemanden, der ohne sie auskommt.
t('Telefon, BIC, Bank und Steuernummer sind nicht Pflicht',
  MA._fehlendeFelder(Object.assign({}, ABSENDER,
      { telefon: '', bic: '', bank: '', steuernummer: '' })).length === 0, 'zu streng');

// ===========================================================================
console.log('\n-- 4. Der Betrag kommt von Stripe --');
// ===========================================================================
const echtesFetch = global.fetch;
let GESENDETE_MAILS = [];
let GESCHRIEBENE_ZEILEN = [];
let MAIL_ANTWORT = { ok: true };
let SCHREIBEN_ANTWORT = { ok: true };

function welt(kunde, absender, bisherigeMahnungen) {
    return async function (url, opt) {
        url = String(url);
        if (url.indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'ibo@x.de' }) };
        if (url.indexOf('role=eq.superadmin') >= 0) return { ok: true, json: async () => [{ email: 'ibo@x.de' }] };
        if (url.indexOf('api.resend.com') >= 0) {
            GESENDETE_MAILS.push(JSON.parse(opt.body));
            return MAIL_ANTWORT.ok ? { ok: true, json: async () => ({ id: 'mail_1' }) }
                                   : { ok: false, status: 422, text: async () => 'domain not verified' };
        }
        if (url.indexOf('/rest/v1/anbieter') >= 0) {
            if (opt && opt.method === 'PATCH') return { ok: true, text: async () => JSON.stringify([absender]) };
            return { ok: true, json: async () => (absender ? [absender] : []) };
        }
        if (url.indexOf('/rest/v1/customers') >= 0) return { ok: true, json: async () => (kunde ? [kunde] : []) };
        if (url.indexOf('/rest/v1/restaurants') >= 0) {
            return { ok: true, json: async () => [{ name: 'Pizzeria La Piazza', street: 'Hafenstr. 5', zip: '26736', city: 'Greetsiel' }] };
        }
        if (url.indexOf('/rest/v1/mahnungen') >= 0) {
            if (opt && opt.method === 'POST') {
                if (!SCHREIBEN_ANTWORT.ok) return { ok: false, status: 500, text: async () => 'kaputt' };
                var z = JSON.parse(opt.body); GESCHRIEBENE_ZEILEN.push(z);
                return { ok: true, json: async () => [Object.assign({ id: 'm1' }, z)] };
            }
            // Den Filter WIRKLICH anwenden. Eine Attrappe, die jede
            // Abfrage gleich beantwortet, macht jede Zusicherung ueber
            // die Abfrage wertlos.
            var zeilen = (bisherigeMahnungen || []).slice();
            if (url.indexOf('versendet_am=not.is.null') >= 0) {
                zeilen = zeilen.filter(function (m) { return !!m.versendet_am; });
            }
            if (url.indexOf('order=stufe.desc') >= 0) {
                zeilen.sort(function (a2, b2) { return (b2.stufe || 0) - (a2.stufe || 0); });
            }
            return { ok: true, json: async () => zeilen };
        }
        return { ok: false, status: 404, text: async () => '' };
    };
}
function ereignis(body) {
    return { httpMethod: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify(body || {}) };
}
async function ruf(aktion, body, fetchImpl) {
    global.fetch = fetchImpl;
    try { return await MA.handler(ereignis(Object.assign({ action: aktion }, body || {}))); }
    finally { global.fetch = echtesFetch; }
}

const KUNDE = { id: 'k1', name: 'La Piazza', email: 'wirt@lapiazza.de',
                restaurant_id: 'r1', stripe_subscription_id: 'sub_1' };
const jetztS = Math.floor(Date.now() / 1000);
const OFFENE_RECHNUNG = {
    status: 'past_due',
    latest_invoice: { status: 'open', amount_due: 5990, number: 'KIN-0004',
                      due_date: jetztS - 9 * 86400 }
};

(async function () {
    // ---- Nur der Verwalter ------------------------------------------
    let a = await ruf('vorschau', { customer_id: 'k1' }, async function (url) {
        if (String(url).indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'gast@x.de' }) };
        return { ok: true, json: async () => [] };
    });
    t('ein Nicht-Verwalter bekommt 403', a.statusCode === 403, String(a.statusCode));

    // ---- Stripe nicht erreichbar -> KEIN Schreiben -------------------
    ABO = OFFENE_RECHNUNG; ABO_WIRFT = 'Stripe down';
    a = await ruf('vorschau', { customer_id: 'k1' }, welt(KUNDE, ABSENDER));
    let j = JSON.parse(a.body);
    ABO_WIRFT = null;
    t('Stripe stumm -> kein Schreiben', a.statusCode === 409 && j.ok === false, a.statusCode + ' ' + j.ok);
    t('und der Grund nennt Stripe', /Stripe/.test(j.fehler), j.fehler);

    // ---- Rechnung ist bezahlt -> nichts zu mahnen --------------------
    ABO = { status: 'active', latest_invoice: { status: 'paid', amount_due: 5990 } };
    a = await ruf('vorschau', { customer_id: 'k1' }, welt(KUNDE, ABSENDER));
    j = JSON.parse(a.body);
    t('bezahlte Rechnung -> keine Mahnung', j.ok === false && /BEZAHLT/i.test(j.fehler), j.fehler);

    // ---- Kein Abo hinterlegt ----------------------------------------
    ABO = OFFENE_RECHNUNG;
    a = await ruf('vorschau', { customer_id: 'k1' },
        welt(Object.assign({}, KUNDE, { stripe_subscription_id: null }), ABSENDER));
    j = JSON.parse(a.body);
    t('ohne Stripe-Abo -> keine Mahnung', j.ok === false && /Abo/.test(j.fehler), j.fehler);

    // ---- Absender unvollstaendig ------------------------------------
    a = await ruf('vorschau', { customer_id: 'k1' },
        welt(KUNDE, Object.assign({}, ABSENDER, { iban: '', ort: '' })));
    j = JSON.parse(a.body);
    t('unvollstaendiger Absender -> kein Schreiben', j.ok === false, String(j.ok));
    t('und es wird gesagt, WELCHE Felder fehlen',
      j.absender_unvollstaendig === true && j.fehlende_felder.join() === 'Ort,IBAN',
      JSON.stringify(j.fehlende_felder));

    // ---- Und wenn alles da ist --------------------------------------
    a = await ruf('vorschau', { customer_id: 'k1' }, welt(KUNDE, ABSENDER));
    j = JSON.parse(a.body);
    t('vollstaendig -> es gibt einen Brief', a.statusCode === 200 && j.ok === true, String(a.statusCode));
    t('mit dem Betrag aus Stripe, in Euro', j.betrag === 59.9, String(j.betrag));
    t('mit der Rechnungsnummer aus Stripe', j.rechnung_ref === 'KIN-0004', String(j.rechnung_ref));
    t('Stufe 1, weil noch nichts gesendet wurde', j.stufe === 1, String(j.stufe));
    var sollFrist = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    t('die Frist liegt 14 Tage in der Zukunft',
      j.frist_bis === sollFrist, j.frist_bis + ' statt ' + sollFrist);
    t('und der Brief traegt den echten Betrag', /59,90 €/.test(j.text), 'Betrag fehlt');

    // ===================================================================
    console.log('\n-- 5. Die Frist laeuft erst ab dem ZUSTELLEN --');
    // ===================================================================
    GESENDETE_MAILS = []; GESCHRIEBENE_ZEILEN = [];
    MAIL_ANTWORT = { ok: true }; SCHREIBEN_ANTWORT = { ok: true };
    a = await ruf('senden', { customer_id: 'k1' }, welt(KUNDE, ABSENDER));
    j = JSON.parse(a.body);
    t('senden gelingt', a.statusCode === 200 && j.ok === true, a.statusCode + ' ' + JSON.stringify(j.fehler));
    t('eine Mail ging raus, an den Wirt',
      GESENDETE_MAILS.length === 1 && GESENDETE_MAILS[0].to[0] === 'wirt@lapiazza.de',
      JSON.stringify(GESENDETE_MAILS.map(m => m.to)));
    t('die Mail traegt denselben Text wie die Vorschau',
      GESENDETE_MAILS[0].text.indexOf('59,90 €') >= 0, 'Text weicht ab');
    t('es wurde genau eine Zeile protokolliert', GESCHRIEBENE_ZEILEN.length === 1, String(GESCHRIEBENE_ZEILEN.length));
    t('mit versendet_am UND frist_bis',
      !!GESCHRIEBENE_ZEILEN[0].versendet_am && !!GESCHRIEBENE_ZEILEN[0].frist_bis,
      JSON.stringify(GESCHRIEBENE_ZEILEN[0]));

    // Der Fall, auf den es ankommt.
    GESENDETE_MAILS = []; GESCHRIEBENE_ZEILEN = [];
    MAIL_ANTWORT = { ok: false };
    a = await ruf('senden', { customer_id: 'k1' }, welt(KUNDE, ABSENDER));
    j = JSON.parse(a.body);
    t('geht die Mail nicht raus, meldet die Function 502',
      a.statusCode === 502 && j.ok === false, String(a.statusCode));
    t('die Zeile wird trotzdem geschrieben -- als Spur',
      GESCHRIEBENE_ZEILEN.length === 1, String(GESCHRIEBENE_ZEILEN.length));
    t('ABER OHNE frist_bis -- ein misslungener Versand setzt keine Frist',
      !GESCHRIEBENE_ZEILEN[0].frist_bis && !GESCHRIEBENE_ZEILEN[0].versendet_am,
      JSON.stringify(GESCHRIEBENE_ZEILEN[0]));
    t('und der Fehler steht in der Zeile',
      /Resend/.test(GESCHRIEBENE_ZEILEN[0].versand_fehler || ''), GESCHRIEBENE_ZEILEN[0].versand_fehler);

    // Mail raus, Protokoll nicht -- das muss er erfahren.
    GESENDETE_MAILS = []; GESCHRIEBENE_ZEILEN = [];
    MAIL_ANTWORT = { ok: true }; SCHREIBEN_ANTWORT = { ok: false };
    a = await ruf('senden', { customer_id: 'k1' }, welt(KUNDE, ABSENDER));
    j = JSON.parse(a.body);
    SCHREIBEN_ANTWORT = { ok: true };
    t('Mail raus, Protokoll misslungen -> es wird gemeldet, nicht verschwiegen',
      a.statusCode === 500 && j.gesendet === true && /Frist/.test(j.fehler), j.fehler);

    // ---- Die Stufe zaehlt nur GESENDETE mit --------------------------
    MAIL_ANTWORT = { ok: true };
    a = await ruf('vorschau', { customer_id: 'k1' },
        welt(KUNDE, ABSENDER, [{ stufe: 2, versendet_am: '2026-09-01T10:00:00Z' }]));
    j = JSON.parse(a.body);
    t('nach einer gesendeten Stufe 2 kommt Stufe 3', j.stufe === 3, String(j.stufe));
    a = await ruf('vorschau', { customer_id: 'k1' },
        welt(KUNDE, ABSENDER, [{ stufe: 3, versendet_am: '2026-09-01T10:00:00Z' }]));
    j = JSON.parse(a.body);
    t('und ueber 3 geht es nicht hinaus', j.stufe === 3, String(j.stufe));

    // DER FALL, DEN DIE ERSTE FASSUNG DIESES TESTS NICHT GEPRUEFT HAT:
    // eine Stufe 3, die NIE rausging, darf nicht mitzaehlen. Sonst
    // springt der naechste Versuch von 1 auf 3 -- und der Wirt bekommt
    // eine "Letzte Mahnung", ohne je eine erste gesehen zu haben.
    a = await ruf('vorschau', { customer_id: 'k1' }, welt(KUNDE, ABSENDER, [
        { stufe: 1, versendet_am: '2026-09-01T10:00:00Z' },
        { stufe: 3, versendet_am: null, versand_fehler: 'Resend 422' }
    ]));
    j = JSON.parse(a.body);
    t('eine NICHT gesendete Stufe 3 zaehlt nicht mit -- naechste ist 2',
      j.stufe === 2, String(j.stufe));

    // ---- Frist-Grenzen ----------------------------------------------
    a = await ruf('absender-speichern', { frist_tage: 3 }, welt(KUNDE, ABSENDER));
    t('eine Frist von 3 Tagen wird abgelehnt (unangemessen kurz)',
      a.statusCode === 400, String(a.statusCode));
    a = await ruf('absender-speichern', { frist_tage: 60 }, welt(KUNDE, ABSENDER));
    t('und 60 Tage auch', a.statusCode === 400, String(a.statusCode));
    a = await ruf('absender-speichern', { frist_tage: 14 }, welt(KUNDE, ABSENDER));
    t('14 Tage gehen', a.statusCode === 200, String(a.statusCode));

    // ===================================================================
    console.log('\n-- 6. Von Hand. Kein Zeitplan --');
    // ===================================================================
    t('mahnung steht in keinem Netlify-Zeitplan', !/mahnung/i.test(TOML), 'steht drin');

    // ===================================================================
    console.log('\n-- 7. Die Datenbank --');
    // ===================================================================
    t('anbieter hat genau eine Zeile erzwungen',
      /check \(id = 1\)/.test(SQL), 'mehrere Absender moeglich');
    t('mahnungen wird nur angehaengt -- kein delete im Skript',
      !/delete from public\.mahnungen/i.test(SQL), 'loescht');
    t('beide Tabellen mit RLS und OHNE Policy',
      /alter table public\.anbieter enable row level security/.test(SQL)
      && /alter table public\.mahnungen enable row level security/.test(SQL)
      && !/create policy/i.test(SQL), 'offen');
    t('die Gegenprobe prueft, dass es keine Policy gibt',
      /policies_muessen_0_sein/.test(SQL), 'ungeprueft');

    // ===================================================================
    console.log('\n-- 8. Die Verriegelung im Browser --');
    // ===================================================================
    const w = { window: {}, console: console, APP_DATA: { restaurants: [] } };
    w.window = w;
    w.escapeHtml = function (x) { return String(x == null ? '' : x)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    w.zahlsperreStufe = function () { return 'keine'; };
    w.istVerwalter = function () { return true; };
    vm.createContext(w);
    vm.runInContext(H.slice(H.indexOf('var ZAHLSPERRE_KNOEPFE = ['),
                            H.indexOf('function zahlsperreKartenZeile(')), w);
    vm.runInContext(H.slice(H.indexOf('function zahlsperreBeimKunden(c) {'),
                            H.indexOf('function renderCustomers()')), w);

    const kunde = { id: 'k1', restaurant_id: 'r1', _aboStand: { stand: 'ueberfaellig' } };
    t('bei einem BEZAHLTEN Kunden erscheint gar keine Zeile',
      w.zahlsperreBeimKunden({ id: 'k2', restaurant_id: 'r2', _aboStand: { stand: 'bezahlt' } }) === '',
      'Abschaltknoepfe beim zahlenden Kunden');

    w._mahnStand = {};
    let html = w.zahlsperreBeimKunden(kunde);
    let zu = (html.match(/<button disabled/g) || []).length;
    t('ohne Mahnung sind ZWEI Knoepfe zu (Pause und Aus)', zu === 2, String(zu));
    t('und der Grund steht im title', /Erst eine Mahnung/.test(html), 'kein Grund');
    t('"Offen" und "Hinweis" bleiben erreichbar',
      !/<button disabled[^>]*>Offen/.test(html) && !/<button disabled[^>]*>Hinweis/.test(html),
      'auch die sind zu');

    w._mahnStand = { k1: { stufe: 1, frist_bis: '2099-01-01', abgelaufen: false } };
    html = w.zahlsperreBeimKunden(kunde);
    t('laufende Frist: weiter verriegelt',
      (html.match(/<button disabled/g) || []).length === 2,
      String((html.match(/<button disabled/g) || []).length));
    t('und es steht da, bis wann', /Frist läuft noch bis 2099-01-01/.test(html), 'ohne Datum');

    w._mahnStand = { k1: { stufe: 2, frist_bis: '2020-01-01', abgelaufen: true } };
    html = w.zahlsperreBeimKunden(kunde);
    t('abgelaufene Frist: die Knoepfe sind frei',
      (html.match(/<button disabled/g) || []).length === 0,
      String((html.match(/<button disabled/g) || []).length));
    t('und die Zeile sagt, dass die Frist abgelaufen ist',
      /abgelaufen am/.test(html), 'kein Hinweis');

    w._mahnStand = { k1: { stufe: 1, frist_bis: null, abgelaufen: false } };
    html = w.zahlsperreBeimKunden(kunde);
    t('misslungener Versand haelt die Knoepfe zu',
      (html.match(/<button disabled/g) || []).length === 2
      && /nicht raus/.test(html), 'aufgemacht');

    t('der Mahnung-Knopf steht immer da', /mahnungOeffnen/.test(html), 'fehlt');

    // BEI EINER STOERUNG BLEIBT ZU. Hier gilt ausdruecklich NICHT
    // "im Zweifel offen" wie bei der Zahlsperre selbst: dort geht es um
    // einen Gast, der bestellen will, hier um das Abschalten eines
    // Betriebs.
    const holen = H.slice(H.indexOf('async function mahnStaendeHolen()'),
                          H.indexOf('window.mahnStaendeHolen'));
    t('faellt der Ruf aus, bleibt der Stand LEER (und damit verriegelt)',
      /_mahnStand = \{\};/.test(holen) && /NICHT "im Zweifel offen"/.test(holen),
      'oeffnet bei Stoerung');

    // ---- Die Staende werden VOR dem Zeichnen geholt ------------------
    t('beim Laden der Kundenliste zuerst der Mahnungs-Stand',
      /await mahnStaendeHolen\(\); \} catch \(e\) \{\}\s*\n\s*renderCustomers\(\)/.test(H),
      'erst zeichnen, dann holen');
    t('und beim Stripe-Abruf auch',
      /await mahnStaendeHolen\(\);\s*\n\s*\n\s*renderCustomers\(\)/.test(H), 'fehlt');

    // ---- EIN Ruf, nicht einer je Zeile ------------------------------
    t('alle Staende kommen in EINEM Ruf',
      /action=' \+ encodeURIComponent\(aktion\)/.test(H) && /'staende'/.test(H),
      'je Zeile ein Ruf');

    // ---- Barrierefreiheit -------------------------------------------
    t('das Textfeld der Mahnung hat einen Namen',
      /id="mahnText"[^>]*aria-label=/.test(H), 'ohne aria-label');
    t('die Absender-Felder auch',
      /aria-label="' \+ escapeHtml\(name\)/.test(H), 'ohne aria-label');

    console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.'
        : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    if (n - ok > 0) process.exitCode = 1;
})();
