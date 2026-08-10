// ONLINE-ZAHLUNG, SCHRITT 1: Restaurant bei Stripe anmelden.
//
// WARUM ÜBERHAUPT CONNECT
// -----------------------
// Das Geld muss direkt auf das Konto des Restaurants gehen. Liefe es über das
// Konto der Plattform und würde von dort weitergereicht, wäre Kiek mol in
// rechtlich ein Zahlungsdienstleister -- dafür braucht es in Deutschland eine
// Erlaubnis der BaFin. Mit Connect hält Stripe diese Rolle.
//
// DER GEFÄHRLICHE TEIL
// --------------------
// Wer eine Anmeldung starten darf, entscheidet, WOHIN das Geld fliesst. Ohne
// Prüfung könnte ein Fremder die Anmeldung für ein beliebiges Restaurant
// starten, sein eigenes Bankkonto hinterlegen -- und ab dann landen die
// Zahlungen bei ihm. Das ist kein Schönheitsfehler, das ist Diebstahl per
// HTTP-Anfrage. Die halbe Datei hier prüft genau das.
'use strict';
var Module = require('module');
var fs = require('fs');
var PFAD = '/home/user/kiekmolin/netlify/functions/stripe-connect.js';
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Stripe-Attrappe -- die echte Bibliothek soll hier nichts anlegen.
var stripeRufe = [];
var stripeWelt = {};
var echtesLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'stripe') {
        return function () {
            return {
                accounts: {
                    create: async function (args) {
                        stripeRufe.push(['accounts.create', args]);
                        if (stripeWelt.createFehler) throw new Error(stripeWelt.createFehler);
                        return { id: 'acct_NEU1' };
                    },
                    retrieve: async function (id) {
                        stripeRufe.push(['accounts.retrieve', id]);
                        return stripeWelt.konto || { id: id, charges_enabled: false, payouts_enabled: false,
                                                     requirements: { currently_due: ['individual.id_number'] } };
                    }
                },
                accountLinks: {
                    create: async function (args) {
                        stripeRufe.push(['accountLinks.create', args]);
                        return { url: 'https://connect.stripe.com/setup/x' };
                    }
                }
            };
        };
    }
    return echtesLaden.apply(this, arguments);
};

var RID = '11111111-2222-3333-4444-555555555555';

function machFetch(welt) {
    var patches = [];
    global.fetch = async function (url, opts) {
        var u = String(url);
        if (u.indexOf('/auth/v1/user') >= 0) {
            if (welt.tokenGueltig === false) return { ok: false, json: async function () { return {}; } };
            return { ok: true, json: async function () { return { email: welt.email || 'wirt@pizzeria.de' }; } };
        }
        if (u.indexOf('/rest/v1/customers') >= 0) {
            return { ok: true, json: async function () {
                return (welt.gehoertZu || [RID]).map(function (r) { return { restaurant_id: r }; }); } };
        }
        if (u.indexOf('/rest/v1/restaurants') >= 0 && (!opts || opts.method !== 'PATCH')) {
            if (welt.spalteFehlt) return { ok: false, status: 400,
                text: async function () { return "column restaurants.stripe_account_id does not exist"; } };
            return { ok: true, json: async function () {
                return [{ id: RID, name: 'Pizzeria Pronto', email: 'wirt@pizzeria.de',
                          stripe_account_id: welt.konto_id || null }]; } };
        }
        if (u.indexOf('/rest/v1/restaurants') >= 0 && opts.method === 'PATCH') {
            patches.push(JSON.parse(opts.body));
            if (welt.patchFehlt) return { ok: false, status: 400,
                text: async function () { return "column restaurants.stripe_account_id does not exist"; } };
            return { ok: true, text: async function () { return ''; } };
        }
        throw new Error('unerwarteter Aufruf: ' + u);
    };
    return patches;
}

async function ruf(welt, body, kopf) {
    process.env.STRIPE_SECRET_KEY = welt.keyFehlt ? '' : 'sk_test_x';
    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    process.env.SUPABASE_ANON_KEY = 'anon';
    delete require.cache[require.resolve(PFAD)];
    stripeRufe = []; stripeWelt = welt;
    var patches = machFetch(welt);
    var h = require(PFAD).handler;
    var r = await h({
        httpMethod: body ? 'POST' : 'GET',
        headers: kopf === null ? {} : (kopf || { authorization: 'Bearer tok123' }),
        body: body ? JSON.stringify(body) : null,
        queryStringParameters: body ? {} : (welt.query || { action: 'status', restaurant: RID })
    });
    return { code: r.statusCode, a: JSON.parse(r.body), patches: patches, stripe: stripeRufe };
}

(async function () {
    // ================= SICHERHEIT =================
    var r = await ruf({}, null, null);
    t('ohne Anmeldung geht gar nichts', r.code === 401, r.code + ' ' + JSON.stringify(r.a));
    t('und es wird kein Stripe-Konto angelegt', r.stripe.length === 0, JSON.stringify(r.stripe));

    r = await ruf({ tokenGueltig: false });
    t('ungültiger Token wird abgewiesen', r.code === 401, r.code);

    // DER KERNFALL: angemeldet, aber FREMDES Restaurant.
    r = await ruf({ gehoertZu: ['99999999-8888-7777-6666-555555555555'] },
                  { action: 'start', restaurant: RID });
    t('fremdes Restaurant wird abgewiesen', r.code === 401, r.code + ' ' + JSON.stringify(r.a));
    t('für ein fremdes Restaurant entsteht KEIN Stripe-Konto',
      r.stripe.length === 0, JSON.stringify(r.stripe));
    t('die Meldung sagt auch warum',
      /gehört nicht zu deinem Konto/.test(r.a.error || ''), r.a.error);

    r = await ruf({}, { action: 'start', restaurant: 'abc' });
    t('unsinnige Restaurant-Kennung wird abgewiesen', r.code === 400, r.code);

    // ================= ANMELDUNG =================
    r = await ruf({}, { action: 'start', restaurant: RID });
    t('mit Berechtigung wird ein Konto angelegt',
      r.a.ok === true && r.stripe[0][0] === 'accounts.create', JSON.stringify(r.a));
    var args = r.stripe[0][1];
    t('als Express-Konto in Deutschland', args.type === 'express' && args.country === 'DE',
      args.type + '/' + args.country);
    t('mit Kartenzahlung und Auszahlung',
      !!args.capabilities.card_payments && !!args.capabilities.transfers);
    t('das Restaurant ist am Konto vermerkt',
      args.metadata.kiekmolin_restaurant_id === RID, JSON.stringify(args.metadata));
    t('die Konto-Kennung wird gespeichert',
      r.patches.length === 1 && r.patches[0].stripe_account_id === 'acct_NEU1', JSON.stringify(r.patches));
    t('und ein Anmelde-Link zurückgegeben',
      /connect\.stripe\.com/.test(r.a.url || ''), r.a.url);

    // Zweiter Aufruf: KEIN zweites Konto. Sonst hat ein Restaurant zwei, und
    // das Geld landet auf dem falschen.
    r = await ruf({ konto_id: 'acct_ALT9' }, { action: 'start', restaurant: RID });
    t('bei zweitem Aufruf entsteht kein zweites Konto',
      !r.stripe.some(function (x) { return x[0] === 'accounts.create'; }), JSON.stringify(r.stripe));
    t('stattdessen ein neuer Link für das vorhandene Konto',
      r.a.konto === 'acct_ALT9' && !!r.a.url, JSON.stringify(r.a));

    // ================= STATUS =================
    r = await ruf({ konto_id: null });
    t('ohne Konto: nicht angemeldet', r.a.ok === true && r.a.angemeldet === false, JSON.stringify(r.a));

    r = await ruf({ konto_id: 'acct_1',
                    konto: { id: 'acct_1', charges_enabled: true, payouts_enabled: true, requirements: {} } });
    t('freigeschaltetes Konto meldet "bereit"', r.a.bereit === true, JSON.stringify(r.a));

    r = await ruf({ konto_id: 'acct_1' });   // Standard-Attrappe: noch nicht bereit
    t('unvollständiges Konto ist NICHT bereit', r.a.bereit === false, JSON.stringify(r.a));
    t('und sagt, was Stripe noch braucht',
      (r.a.offen || []).indexOf('individual.id_number') >= 0, JSON.stringify(r.a.offen));

    // ================= WENN ETWAS FEHLT =================
    r = await ruf({ keyFehlt: true });
    t('ohne Stripe-Schlüssel kommt eine klare Ansage',
      r.a.ok === false && /STRIPE_SECRET_KEY/.test(r.a.error), JSON.stringify(r.a));

    r = await ruf({ spalteFehlt: true });
    t('fehlende Datenbank-Spalte wird erkannt', r.a.spalteFehlt === true, JSON.stringify(r.a));
    t('mit fertigem Befehl zum Kopieren',
      /alter table restaurants add column if not exists stripe_account_id text;/.test(r.a.sql || ''), r.a.sql);

    // Konto angelegt, aber nicht speicherbar -- das MUSS man sehen, sonst legt
    // der nächste Klick ein zweites Konto an.
    r = await ruf({ patchFehlt: true }, { action: 'start', restaurant: RID });
    t('nicht speicherbares Konto wird gemeldet, nicht verschluckt',
      r.a.ok === false && r.a.konto === 'acct_NEU1', JSON.stringify(r.a));

    // ================= KEINE PLATTFORMGEBÜHR =================
    // Bewusste Entscheidung: die Restaurants zahlen schon monatlich. Eine
    // Gebühr pro Bestellung ist genau das, was an den grossen Lieferportalen
    // stört.
    var quelle = fs.readFileSync(PFAD, 'utf8');
    t('es wird keine Plattformgebühr einbehalten',
      quelle.indexOf('application_fee') < 0 || /nicht gesetzt|KEINE PLATTFORMGEBÜHR/.test(quelle));

    // ================= DASHBOARD =================
    t('der Knopf steht bei den Zahlungsarten',
      /onclick="stripeConnectStarten\(\)"/.test(H) && /Online-Zahlung einrichten/.test(H));
    t('der Status wird beim Öffnen geholt',
      /setTimeout\(stripeConnectStatus, 300\)/.test(H));
    t('ohne Anmeldung im Browser wird gar nicht erst gefragt',
      /if \(!tok\) \{ _scZeige\('nicht angemeldet'/.test(H));
    t('"unvollständig" wird als eigener Zustand gezeigt, nicht als Fehler',
      /_scZeige\('unvollständig', 'warn'/.test(H) && /Stripe braucht noch Angaben/.test(H));
    t('fehlende Spalte zeigt den SQL-Befehl auch im Dashboard',
      /if \(j\.spalteFehlt\)/.test(H) && /SQL Editor/.test(H));
    t('nach der Rückkehr von Stripe wird der Status neu geholt',
      /stripe_connect/.test(H) && /history\.replaceState/.test(H));
    t('dem Gastronom wird gesagt, dass das Geld direkt zu ihm geht',
      /direkt auf dein Konto/.test(H) && /keine Gebühr pro Bestellung/.test(H));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
