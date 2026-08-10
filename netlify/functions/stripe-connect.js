// Kiek mol in — Online-Zahlung: Restaurant bei Stripe anmelden (Connect).
//
// WOZU
// ----
// Damit ein Gast in der App mit Karte, Apple Pay oder Google Pay bezahlen
// kann, braucht das Restaurant ein eigenes Stripe-Konto. Das Geld geht dann
// DIREKT dorthin.
//
// Das ist kein Umweg, sondern der Kern der Sache: liefe das Geld über das
// Konto der Plattform und würde von dort weitergereicht, wäre Kiek mol in
// rechtlich ein Zahlungsdienstleister -- dafür braucht es in Deutschland eine
// Erlaubnis der BaFin. Mit Connect hält Stripe diese Rolle, die Plattform
// fasst das Geld nie an.
//
// Es werden "Express"-Konten benutzt: das Restaurant trägt Ausweis und IBAN
// bei Stripe ein, nicht bei uns. Wir speichern nur die Konto-Kennung
// (acct_...), sonst nichts.
//
// KEINE PLATTFORMGEBÜHR
// ---------------------
// Bewusste Entscheidung: die Restaurants zahlen bereits einen Monatsbeitrag.
// Eine zusätzliche Gebühr pro Bestellung ist genau das, was Gastronomen an
// den grossen Lieferportalen stört (dort 13-30 %). Es wird deshalb kein
// application_fee_amount gesetzt. Soll sich das ändern, gehört die Gebühr an
// EINE Stelle -- in stripe-pay-start, nicht verteilt über den Code.
//
// SICHERHEIT
// ----------
// Wer diese Function aufruft, muss angemeldet sein UND zu dem Restaurant
// gehören. Ohne diese Prüfung könnte ein Fremder eine Anmeldung für ein
// beliebiges Restaurant starten, sein eigenes Bankkonto hinterlegen -- und ab
// dann landen die Zahlungen bei ihm. Deshalb dieselbe Prüfung wie in
// pos-orders: Supabase-Token -> E-Mail -> customers -> restaurant_id.
//
// Aufrufe:
//   POST /.netlify/functions/stripe-connect   { action:'start',  restaurant:<uuid> }
//   GET  /.netlify/functions/stripe-connect?action=status&restaurant=<uuid>
// beide mit  Authorization: Bearer <supabase access token>
//
// ENV: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
var STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
var BASIS_URL = process.env.URL || 'https://kiekmolin.de';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

function sbKopf() {
    var k = SERVICE_KEY || ANON_KEY;
    return { 'apikey': k, 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' };
}

function token(event) {
    var h = event.headers || {};
    var a = h.authorization || h.Authorization || '';
    return a.indexOf('Bearer ') === 0 ? a.slice(7).trim() : null;
}

// Gehört der Anrufer zu diesem Restaurant? Gibt die E-Mail zurück oder null.
async function darfAn(tok, restaurantId) {
    if (!tok || !restaurantId) return null;
    var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'apikey': ANON_KEY || SERVICE_KEY, 'Authorization': 'Bearer ' + tok }
    });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.email) return null;
    var rows = await fetch(SUPABASE_URL + '/rest/v1/customers?email=eq.'
        + encodeURIComponent(user.email) + '&is_active=eq.true&select=restaurant_id',
        { headers: sbKopf() });
    if (!rows.ok) return null;
    var liste = await rows.json();
    var passt = (liste || []).some(function (r) { return String(r.restaurant_id) === String(restaurantId); });
    return passt ? user.email : null;
}

async function restaurantLesen(id) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(id)
        + '&select=id,name,email,stripe_account_id&limit=1', { headers: sbKopf() });
    if (!res.ok) {
        var txt = await res.text();
        // Die Spalte gibt es vielleicht noch nicht -- dann ohne sie lesen und
        // das dem Dashboard SAGEN, statt still ohne Konto weiterzumachen.
        if (/stripe_account_id/.test(txt)) return { spalteFehlt: true };
        return null;
    }
    var d = await res.json();
    return (d && d[0]) || null;
}

async function kontoMerken(id, acct) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', headers: sbKopf(), body: JSON.stringify({ stripe_account_id: acct })
    });
    if (res.ok) return { ok: true };
    var txt = await res.text();
    return { ok: false, spalteFehlt: /stripe_account_id/.test(txt), text: txt.slice(0, 160) };
}

// Der fertige Befehl, falls die Spalte fehlt -- so wie bei den Grössen und
// den Extras. Raten muss hier niemand.
var SPALTEN_SQL =
    'alter table restaurants add column if not exists stripe_account_id text;';

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (!STRIPE_SECRET_KEY) {
        return json(200, { ok: false, error: 'STRIPE_SECRET_KEY ist in Netlify nicht gesetzt.' });
    }

    var q = event.queryStringParameters || {};
    var body = {};
    if (event.body) { try { body = JSON.parse(event.body); } catch (e) {} }
    var aktion = body.action || q.action || 'status';
    var restaurantId = String(body.restaurant || q.restaurant || '').trim();

    if (!/^[0-9a-f-]{20,}$/i.test(restaurantId)) {
        return json(400, { ok: false, error: 'Restaurant fehlt.' });
    }

    var email = await darfAn(token(event), restaurantId);
    if (!email) {
        return json(401, { ok: false, error: 'Nicht angemeldet oder dieses Restaurant gehört nicht zu deinem Konto.' });
    }

    var Stripe;
    try { Stripe = require('stripe'); } catch (e) {
        return json(200, { ok: false, error: 'Stripe-Bibliothek fehlt auf dem Server.' });
    }
    var stripe = Stripe(STRIPE_SECRET_KEY);

    var rest = await restaurantLesen(restaurantId);
    if (rest && rest.spalteFehlt) {
        return json(200, { ok: false, spalteFehlt: true, sql: SPALTEN_SQL,
            error: 'In der Datenbank fehlt die Spalte stripe_account_id.' });
    }
    if (!rest) return json(404, { ok: false, error: 'Restaurant nicht gefunden.' });

    try {
        // ---- Status abfragen -------------------------------------------------
        if (aktion === 'status') {
            if (!rest.stripe_account_id) return json(200, { ok: true, angemeldet: false });
            var konto = await stripe.accounts.retrieve(rest.stripe_account_id);
            return json(200, {
                ok: true,
                angemeldet: true,
                konto: konto.id,
                bereit: !!konto.charges_enabled,
                auszahlung: !!konto.payouts_enabled,
                // Was Stripe noch braucht -- damit im Dashboard nicht nur
                // "noch nicht bereit" steht, sondern auch WARUM.
                offen: ((konto.requirements && konto.requirements.currently_due) || []).slice(0, 8)
            });
        }

        // ---- Anmeldung starten / fortsetzen ----------------------------------
        if (aktion === 'start') {
            var acct = rest.stripe_account_id;
            if (!acct) {
                var neu = await stripe.accounts.create({
                    type: 'express',
                    country: 'DE',
                    email: rest.email || undefined,
                    business_type: 'company',
                    business_profile: {
                        name: rest.name || undefined,
                        product_description: 'Speisen und Getränke, bestellt über Kiek mol in'
                    },
                    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
                    metadata: { kiekmolin_restaurant_id: restaurantId }
                });
                acct = neu.id;
                var gemerkt = await kontoMerken(restaurantId, acct);
                if (!gemerkt.ok) {
                    // Das Konto existiert jetzt bei Stripe, wir können es aber
                    // nicht zuordnen. Das MUSS man sehen -- sonst legt der
                    // nächste Klick ein zweites Konto an.
                    return json(200, { ok: false, konto: acct, spalteFehlt: gemerkt.spalteFehlt,
                        sql: gemerkt.spalteFehlt ? SPALTEN_SQL : undefined,
                        error: 'Stripe-Konto angelegt, konnte aber nicht gespeichert werden: ' + gemerkt.text });
                }
            }
            var link = await stripe.accountLinks.create({
                account: acct,
                refresh_url: BASIS_URL + '/?stripe_connect=neu',
                return_url: BASIS_URL + '/?stripe_connect=fertig',
                type: 'account_onboarding'
            });
            return json(200, { ok: true, url: link.url, konto: acct });
        }

        return json(400, { ok: false, error: 'Unbekannte Aktion: ' + aktion });
    } catch (err) {
        var m = (err && err.message) || String(err);
        console.error('[stripe-connect]', aktion, m);
        return json(200, { ok: false, error: m.slice(0, 200) });
    }
};
