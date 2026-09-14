// PAYPAL CHECKOUT: erst die Zahlung, dann die Bestellung.
//
// Ibo am 13.09.2026: "es bei paypal gehen wenn die bestellung mit paypal
// geht und dann kommt die bestellung bei restaurant an wie bei allen
// anderen bestellungen."
//
// Mit einem PayPal.Me-Link ging das nicht -- ein Link hat keinen
// Rueckkanal. Hier laeuft es richtig herum:
//
//   1. anlegen   Der Gast waehlt PayPal. Wir pruefen den Preis GEGEN DIE
//                KARTE und legen bei PayPal eine Zahlung an. Es entsteht
//                noch KEINE Bestellung.
//   2. Gast bezahlt im PayPal-Fenster.
//   3. buchen    Wir holen die Zahlung bei PayPal ab (capture), pruefen
//                Status UND Betrag -- und schreiben erst DANN die
//                Bestellung. Sie kommt beim Wirt an wie jede andere.
//
// Kein Geld, keine Bestellung. Keine Bestellung ohne Geld.
//
// DAS GELD GEHT DIREKT AN DEN WIRT. Wir benutzen die Zugangsdaten SEINES
// Geschaeftskontos, nicht unsere. Damit laeuft nie fremdes Geld ueber
// Kurani Design -- das waere ein Zahlungsdienst und ein eigenes Thema.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY
'use strict';

var preisPruefung = require('./lib/preis-pruefung');
var WARTEZEIT = require('./lib/wartezeit');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf() { return { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY }; }

async function hol(pfad) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: kopf() });
    if (!res.ok) throw new Error(pfad.split('?')[0] + ': HTTP ' + res.status);
    return await res.json();
}

// ---------------------------------------------------------------------
// Das PayPal-Konto des Betriebs. Liegt in einer eigenen Tabelle, die nur
// mit dem Service-Key lesbar ist -- es steht ein Secret drin.
// ---------------------------------------------------------------------
async function konto(restaurantId) {
    var rows = await hol('paypal_konten?restaurant_id=eq.' + encodeURIComponent(restaurantId)
        + '&select=client_id,secret,live&limit=1');
    if (!rows.length) return null;
    var k = rows[0];
    if (!k.client_id || !k.secret) return null;
    k.basis = k.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    return k;
}

async function token(k) {
    var res = await fetch(k.basis + '/v1/oauth2/token', {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(k.client_id + ':' + k.secret).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    var t = await res.text();
    if (!res.ok) throw new Error('PayPal-Anmeldung fehlgeschlagen (' + res.status + '): ' + t.slice(0, 200));
    return JSON.parse(t).access_token;
}

function betragStr(n) {
    var z = Number(n);
    if (!isFinite(z) || z < 0) z = 0;
    return z.toFixed(2);
}

// ---------------------------------------------------------------------
// Preisprüfung -- DIESELBE wie bei jeder anderen Bestellung.
//
// Absichtlich lib/preis-pruefung und kein zweiter Satz Regeln: ein
// zweiter Weg in die Tabelle orders, der die Pruefung nicht macht, waere
// eine offene Tuer. Wer bei PayPal bezahlt, soll denselben Schutz haben.
// ---------------------------------------------------------------------
async function preisCheck(order) {
    try {
        var rid = encodeURIComponent(order.restaurant_id);
        var teile = await Promise.all([
            hol('menu_items?restaurant_id=eq.' + rid + '&select=id,name,base_price,sizes'),
            hol('menu_cross_sells?select=*').catch(function () { return []; }),
            hol('restaurants?id=eq.' + rid + '&select=id,delivery_fee,free_delivery_from,min_order_value&limit=1')
                .catch(function () { return []; })
        ]);
        return preisPruefung.pruefe(order, {
            menuItems: teile[0], crossSells: teile[1], restaurant: (teile[2] || [])[0] || null
        });
    } catch (e) {
        // Klemmt das Nachschlagen, darf das keine Zahlung verhindern --
        // aber es wird vermerkt, damit es nicht still bleibt.
        console.warn('[paypal-zahlung] Preis nicht pruefbar:', e.message);
        return { ok: true, unpruefbar: e.message };
    }
}

// ---------------------------------------------------------------------
// Die Bestellung schreiben -- erst nach bestaetigter Zahlung.
// ---------------------------------------------------------------------
var ALLOWED = [
    'order_number', 'restaurant_id', 'restaurant_name', 'status', 'order_type',
    'customer_name', 'customer_phone', 'customer_email',
    'delivery_address', 'delivery_notes', 'customer_notes',
    'items', 'subtotal', 'delivery_fee', 'tip', 'discount', 'total',
    'payment_method', 'table_number', 'coupon_code', 'requested_time', 'created_at', 'scheduled_at',
    'payment_status', 'payment_reference',
    // Sofort-Bestaetigung -- dieselben Felder wie in order-save.
    'accepted_at', 'estimated_minutes', 'estimated_time'
];

// Selbst-heilender Insert: fehlt eine Spalte, raus damit und erneut.
// payment_status und payment_reference gibt es vielleicht noch nicht --
// die Bestellung darf daran nicht scheitern, das Geld ist schon da.
async function bestellungSchreiben(payload) {
    var body = {};
    ALLOWED.forEach(function (k) { if (payload[k] !== undefined) body[k] = payload[k]; });
    var lastStatus = 0, lastText = '';
    for (var i = 0; i < 15; i++) {
        var res = await fetch(SUPABASE_URL + '/rest/v1/orders', {
            method: 'POST',
            headers: Object.assign({}, kopf(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
            body: JSON.stringify(body)
        });
        if (res.ok) { var d = null; try { d = await res.json(); } catch (e) {} return { ok: true, data: d }; }
        lastStatus = res.status;
        try { lastText = await res.text(); } catch (e) { lastText = ''; }
        var m = lastText.match(/Could not find the '([^']+)'/)
             || lastText.match(/'([^']+)' column/)
             || lastText.match(/column "?([a-zA-Z_]+)"? .*does not exist/i);
        if (res.status === 400 && m && m[1] && Object.prototype.hasOwnProperty.call(body, m[1])) {
            delete body[m[1]];
            continue;
        }
        break;
    }
    return { ok: false, status: lastStatus, text: lastText };
}

// Schon gebucht? Eine zweite Abholung darf keine zweite Bestellung
// erzeugen -- der Gast drueckt zurueck, laedt neu, klickt zweimal.
async function schonGebucht(paypalId) {
    try {
        var rows = await hol('orders?payment_reference=eq.' + encodeURIComponent(paypalId)
            + '&select=id,order_number&limit=1');
        return rows.length ? rows[0] : null;
    } catch (e) {
        // Gibt es die Spalte nicht, koennen wir es nicht wissen. Dann
        // lieber durchlassen als die bezahlte Bestellung zu verlieren.
        console.warn('[paypal-zahlung] Doppelpruefung nicht moeglich:', e.message);
        return null;
    }
}

// ---------------------------------------------------------------------
// WER DARF DAS PAYPAL-KONTO EINES BETRIEBS SETZEN?
//
// Nur wer bei genau diesem Betrieb angemeldet ist. Ohne diese Pruefung
// koennte jeder mit einem einzigen Aufruf die Zugangsdaten eines fremden
// Restaurants ueberschreiben und dessen Einnahmen umleiten. Dieselbe
// Pruefung wie beim Nachdruck-Knopf in pos-print.js.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// IST DER ZWEITE TEIL VON SQL 30 AUCH ANGEKOMMEN?
//
// Das Skript legt zuerst die Tabelle paypal_konten an und aendert ERST
// DANACH orders. Bricht es dazwischen ab, gibt es die Tabelle -- und die
// beiden Spalten nicht.
//
// Von allein merkt das niemand: bestellungSchreiben() wirft eine
// fehlende Spalte absichtlich raus, damit eine bereits bezahlte
// Bestellung nicht verloren geht. Die Bestellung kommt also an --
// aber ohne Beleg der Zahlung, und ohne den Riegel gegen
// Doppelbuchungen. Zweimal Zurueck im Browser, zwei Bestellungen,
// einmal Geld.
//
// Genau die Sorte stiller Ausfall aus Regel 6. Darum wird nachgesehen.
//
// Rueckgabe: true = da, false = fehlt (gemessen), null = nicht messbar.
// null ist ausdruecklich nicht false -- nicht erreichbar heisst nicht
// "fehlt", und das Dashboard behauptet dann auch nichts.
// ---------------------------------------------------------------------
async function spaltenDa() {
    try {
        var res = await fetch(SUPABASE_URL
            + '/rest/v1/orders?select=payment_status,payment_reference&limit=1', { headers: kopf() });
        if (res.ok) return true;
        // 400 mit PGRST204/"does not exist" heisst: die Spalte fehlt.
        // Jeder andere Fehler heisst nur, dass wir es nicht wissen.
        var t = '';
        try { t = await res.text(); } catch (e) { t = ''; }
        if (res.status === 400 && /payment_(status|reference)/.test(t)) return false;
        console.warn('[paypal-zahlung] Spaltenpruefung unklar:', res.status, t.slice(0, 200));
        return null;
    } catch (e) {
        return null;
    }
}

async function angemeldeteBetriebe(token) {
    if (!token) return null;
    var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.email) return null;
    try {
        var rows = await hol('customers?email=eq.' + encodeURIComponent(user.email)
            + '&is_active=eq.true&select=restaurant_id');
        return (rows || []).map(function (r) { return r.restaurant_id; }).filter(Boolean);
    } catch (e) { return null; }
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST.' });
    if (!KEY) return json(500, { ok: false, error: 'Server nicht eingerichtet (SUPABASE_SERVICE_KEY fehlt).' });

    var body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltige Anfrage.' }); }

    var aktion = (event.queryStringParameters || {}).action || body.action || '';
    var order = body.order || {};

    try {
        // ---------------- Zugangsdaten setzen (aus dem Dashboard) -------
        //
        // Damit muss niemand mehr SQL anfassen -- und die Schluessel
        // laufen nie ueber Ibos Rechner. Sie gehen direkt vom Browser
        // des Wirts in die geschuetzte Tabelle.
        if (aktion === 'speichern') {
            var auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
            var tok = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
            var erlaubt = await angemeldeteBetriebe(tok);
            if (!erlaubt) return json(401, { ok: false, error: 'Nicht angemeldet.' });

            var ridS = String(body.restaurant_id || '');
            if (!ridS) return json(400, { ok: false, error: 'restaurant_id fehlt.' });
            if (erlaubt.indexOf(ridS) === -1) {
                return json(403, { ok: false, error: 'Kein Zugriff auf dieses Restaurant.' });
            }

            // Loeschen ist ausdruecklich erlaubt -- wer aufhoeren will,
            // muss das auch koennen, ohne uns zu fragen.
            if (body.entfernen === true) {
                var del = await fetch(SUPABASE_URL + '/rest/v1/paypal_konten?restaurant_id=eq.' + encodeURIComponent(ridS), {
                    method: 'DELETE',
                    headers: Object.assign({}, kopf(), { 'Prefer': 'return=minimal' })
                });
                if (!del.ok) return json(500, { ok: false, error: 'Konnte nicht entfernt werden (' + del.status + ').' });
                return json(200, { ok: true, eingerichtet: false });
            }

            var cid = String(body.client_id || '').trim();
            var sec = String(body.secret || '').trim();
            var live = body.live === true;
            // PayPal-Schluessel sind lang und haben keine Leerzeichen.
            // Ein abgeschnittenes Copy-Paste faellt hier auf -- und nicht
            // erst beim ersten Gast, der bezahlen will.
            if (!/^[A-Za-z0-9_-]{20,120}$/.test(cid)) {
                return json(400, { ok: false, error: 'Die Client-ID sieht nicht richtig aus. Sie ist lang und enthält keine Leerzeichen — bitte vollständig kopieren.' });
            }
            if (!/^[A-Za-z0-9_-]{20,200}$/.test(sec)) {
                return json(400, { ok: false, error: 'Das Secret sieht nicht richtig aus. Es ist lang und enthält keine Leerzeichen — bitte vollständig kopieren.' });
            }

            // Bevor gespeichert wird: einmal bei PayPal anmelden. Falsche
            // Schluessel jetzt zu merken ist unendlich viel besser, als
            // sie beim ersten zahlenden Gast zu merken.
            try {
                await token({ client_id: cid, secret: sec, basis: live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com' });
            } catch (e) {
                return json(400, {
                    ok: false,
                    error: 'PayPal nimmt diese Zugangsdaten nicht an. Bitte prüfen: sind es die Schlüssel aus '
                         + (live ? 'dem LIVE-Bereich' : 'der SANDBOX') + '? Beides wird getrennt vergeben.'
                });
            }

            var up = await fetch(SUPABASE_URL + '/rest/v1/paypal_konten?on_conflict=restaurant_id', {
                method: 'POST',
                headers: Object.assign({}, kopf(), {
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=representation'
                }),
                body: JSON.stringify({
                    restaurant_id: ridS, client_id: cid, secret: sec, live: live,
                    aktualisiert: new Date().toISOString()
                })
            });
            var upTxt = await up.text();
            if (!up.ok) {
                console.error('[paypal-zahlung] speichern fehlgeschlagen:', up.status, upTxt.slice(0, 300));
                if (/paypal_konten/i.test(upTxt) && /does not exist/i.test(upTxt)) {
                    return json(500, { ok: false, error: 'Die Tabelle paypal_konten fehlt noch in der Datenbank (SQL 30).' });
                }
                return json(500, { ok: false, error: 'Konnte nicht gespeichert werden (' + up.status + ').' });
            }
            var upZeilen = null;
            try { upZeilen = JSON.parse(upTxt); } catch (e) { upZeilen = null; }
            if (!Array.isArray(upZeilen) || upZeilen.length === 0) {
                return json(500, { ok: false, error: 'Nicht gespeichert: die Datenbank hat die Änderung ohne Fehlermeldung verworfen.' });
            }
            // Das Secret geht NICHT zurueck. Es hat den Browser einmal
            // verlassen und kommt nie wieder heraus.
            return json(200, { ok: true, eingerichtet: true, live: live, geprueft: true });
        }

        // ---------------- 0. Ist PayPal eingerichtet? ----------------
        //
        // Die Client-ID ist oeffentlich -- sie steht in jedem PayPal-Knopf
        // der Welt. Das SECRET geht nie hier heraus.
        if (aktion === 'konto') {
            var rid0 = String(body.restaurant_id || '');
            if (!rid0) return json(400, { ok: false, error: 'restaurant_id fehlt.' });
            var k0 = await konto(rid0);
            var antwort0 = k0
                ? { ok: true, eingerichtet: true, client_id: k0.client_id, live: !!k0.live }
                : { ok: true, eingerichtet: false };
            // Nur das Dashboard fragt danach. Den Gast kostet das eine
            // Anfrage, die ihm an der Kasse nichts nuetzt.
            if (body.pruefen === true) antwort0.spalten = await spaltenDa();
            return json(200, antwort0);
        }

        // ---------------- 1. Zahlung anlegen ----------------
        if (aktion === 'anlegen') {
            if (!order.restaurant_id) return json(400, { ok: false, error: 'restaurant_id fehlt.' });
            var betrag = Number(order.total);
            if (!isFinite(betrag) || betrag <= 0) return json(400, { ok: false, error: 'Betrag fehlt.' });

            var k = await konto(order.restaurant_id);
            if (!k) return json(409, { ok: false, error: 'Für dieses Restaurant ist PayPal nicht eingerichtet.', code: 'kein_konto' });

            // Preis gegen die Karte. Stimmt er nicht, wird gar nicht erst
            // kassiert -- sonst haetten wir Geld fuer eine Bestellung, die
            // wir nachher ablehnen muessen.
            var pr = await preisCheck(order);
            if (pr && pr.ok === false) {
                return json(422, { ok: false, error: 'Der Preis stimmt nicht mit der Karte überein. Bitte die Seite neu laden.', gruende: pr.gruende || [] });
            }

            var zugang = await token(k);
            var res = await fetch(k.basis + '/v2/checkout/orders', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + zugang, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intent: 'CAPTURE',
                    purchase_units: [{
                        amount: { currency_code: 'EUR', value: betragStr(betrag) },
                        description: ('Bestellung bei ' + (order.restaurant_name || 'Restaurant')).slice(0, 127)
                    }],
                    payment_source: {
                        paypal: {
                            experience_context: {
                                shipping_preference: 'NO_SHIPPING',
                                user_action: 'PAY_NOW',
                                brand_name: String(order.restaurant_name || 'Kiek mol in').slice(0, 127)
                            }
                        }
                    }
                })
            });
            var txt = await res.text();
            if (!res.ok) {
                console.error('[paypal-zahlung] anlegen fehlgeschlagen:', res.status, txt.slice(0, 400));
                return json(502, { ok: false, error: 'PayPal hat die Zahlung nicht angenommen (' + res.status + ').' });
            }
            var pp = JSON.parse(txt);
            return json(200, { ok: true, id: pp.id, betrag: betragStr(betrag) });
        }

        // ---------------- 2. Zahlung abholen, dann Bestellung ----------------
        if (aktion === 'buchen') {
            var ppId = String(body.paypal_id || '');
            if (!ppId) return json(400, { ok: false, error: 'paypal_id fehlt.' });
            if (!order.restaurant_id) return json(400, { ok: false, error: 'restaurant_id fehlt.' });

            // Zweiter Klick, Zurueck-Taste, Neuladen: die Bestellung gibt
            // es dann schon. Nicht noch einmal anlegen.
            var da = await schonGebucht(ppId);
            if (da) return json(200, { ok: true, doppelt: true, order_number: da.order_number, id: da.id });

            var k2 = await konto(order.restaurant_id);
            if (!k2) return json(409, { ok: false, error: 'Für dieses Restaurant ist PayPal nicht eingerichtet.', code: 'kein_konto' });

            var zugang2 = await token(k2);
            var cap = await fetch(k2.basis + '/v2/checkout/orders/' + encodeURIComponent(ppId) + '/capture', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + zugang2, 'Content-Type': 'application/json' }
            });
            var capTxt = await cap.text();
            var capObj = null;
            try { capObj = JSON.parse(capTxt); } catch (e) { capObj = null; }

            // PayPal meldet einen schon abgeholten Auftrag als Fehler.
            // Das ist KEIN Grund, die Bestellung zu verlieren -- es heisst,
            // dass das Geld da ist und wir zweimal gefragt haben.
            var schonAbgeholt = !cap.ok && /ORDER_ALREADY_CAPTURED/i.test(capTxt);
            if (!cap.ok && !schonAbgeholt) {
                console.error('[paypal-zahlung] buchen fehlgeschlagen:', cap.status, capTxt.slice(0, 400));
                return json(402, { ok: false, error: 'Die Zahlung wurde von PayPal nicht abgeschlossen. Es wurde nichts abgebucht.' });
            }

            // Status UND Betrag pruefen. "Es kam eine Antwort" ist kein
            // Beweis dafuer, dass der richtige Betrag bezahlt wurde.
            var status = capObj && capObj.status;
            var einheit = capObj && capObj.purchase_units && capObj.purchase_units[0];
            var zahlung = einheit && einheit.payments && einheit.payments.captures && einheit.payments.captures[0];
            var bezahlt = zahlung && zahlung.amount && zahlung.amount.value;
            var waehrung = zahlung && zahlung.amount && zahlung.amount.currency_code;
            var soll = betragStr(order.total);

            if (!schonAbgeholt) {
                if (status !== 'COMPLETED') {
                    console.error('[paypal-zahlung] Status ist nicht COMPLETED:', status);
                    return json(402, { ok: false, error: 'Die Zahlung ist bei PayPal nicht abgeschlossen (' + (status || 'ohne Status') + ').' });
                }
                if (waehrung !== 'EUR' || betragStr(bezahlt) !== soll) {
                    console.error('[paypal-zahlung] Betrag weicht ab: bezahlt', bezahlt, waehrung, 'erwartet', soll, 'EUR');
                    return json(409, {
                        ok: false,
                        error: 'Der bezahlte Betrag passt nicht zur Bestellung. Bitte melde dich beim Restaurant — es wurde ' + bezahlt + ' ' + waehrung + ' gebucht.'
                    });
                }
            }

            // Preis noch einmal gegen die Karte -- zwischen anlegen und
            // buchen koennte der Warenkorb im Browser veraendert worden
            // sein. Der bezahlte Betrag steht fest; hier geht es darum,
            // dass die POSITIONEN dazu passen.
            var pr2 = await preisCheck(order);
            var preisHinweis = (pr2 && pr2.ok === false) ? (pr2.gruende || ['Preis weicht ab']) : null;

            var nutz = Object.assign({}, order, {
                payment_method: 'paypal',
                payment_status: 'paid',
                payment_reference: ppId,
                status: order.status || 'pending'
            });

            // Sofort bestaetigen, wenn der Wirt das eingeschaltet hat --
            // genau wie in order-save. Ohne diese Zeilen waere PayPal der
            // eine Weg in die Tabelle, auf dem der Gast keine Zusage
            // bekommt, obwohl er schon bezahlt hat.
            //
            // konto() liest nur die PayPal-Schluessel, darum hier eine
            // eigene Abfrage. Faellt sie aus, wird NICHT bestaetigt: das
            // Geld ist da, die Bestellung geht durch, der Wirt nimmt sie
            // von Hand an.
            try {
                var featsPP = await hol('restaurants?id=eq.' + encodeURIComponent(order.restaurant_id)
                    + '&select=features&limit=1');
                var zusagePP = WARTEZEIT.zusage((featsPP[0] && featsPP[0].features) || [],
                    order.order_type, !!(order.requested_time || order.scheduled_at));
                if (zusagePP) Object.keys(zusagePP).forEach(function (k) { nutz[k] = zusagePP[k]; });
            } catch (e) {
                console.warn('[paypal-zahlung] features nicht ladbar, keine Sofort-Bestaetigung:', e.message);
            }
            var ins = await bestellungSchreiben(nutz);
            if (!ins.ok) {
                // DER SCHLIMMSTE FALL: Geld ist weg, Bestellung nicht da.
                // Das muss laut sein -- der Waechter liest restaurant_events.
                console.error('[paypal-zahlung] BEZAHLT ABER NICHT GESPEICHERT:', ppId, ins.status, String(ins.text).slice(0, 300));
                try {
                    await fetch(SUPABASE_URL + '/rest/v1/restaurant_events', {
                        method: 'POST',
                        headers: Object.assign({}, kopf(), { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
                        body: JSON.stringify({
                            restaurant_id: order.restaurant_id,
                            type: 'paypal_bezahlt_ohne_bestellung',
                            message: 'Ein Gast hat per PayPal bezahlt, die Bestellung konnte aber NICHT gespeichert werden. '
                                   + 'Bitte sofort prüfen und den Gast anrufen. PayPal-Vorgang: ' + ppId,
                            payload: { paypal_id: ppId, http: ins.status, betrag: soll }
                        })
                    });
                } catch (e) {}
                return json(500, {
                    ok: false, bezahlt: true, paypal_id: ppId,
                    error: 'Deine Zahlung ist angekommen, aber die Bestellung konnte nicht gespeichert werden. '
                         + 'Das Restaurant wurde benachrichtigt — bitte ruf kurz an und nenne diese Nummer: ' + ppId
                });
            }

            var neu = (ins.data && ins.data[0]) || {};
            return json(200, {
                ok: true,
                order_number: neu.order_number || order.order_number,
                id: neu.id || null,
                bezahlt: true,
                preis_hinweis: preisHinweis
            });
        }

        return json(400, { ok: false, error: 'Unbekannte Aktion.' });
    } catch (err) {
        console.error('[paypal-zahlung] Fehler:', err && err.stack ? err.stack : err);
        return json(500, { ok: false, error: 'Unerwarteter Fehler bei der Zahlung. Es wurde nichts abgebucht.' });
    }
};
