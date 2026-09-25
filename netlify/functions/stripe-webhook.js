// Stripe Webhook: schreibt den Abo-Status zurück nach Supabase.
//
// AM 25.09.2026 DAZUGEKOMMEN: invoice.paid und invoice.payment_failed.
//
// Vorher hörte diese Function NUR auf Abo-Ereignisse und schrieb nur
// stripe_status. payment_status -- die Spalte, aus der die Kundenliste
// ihre Farbe nimmt und die drei Zähler auf dem Dashboard ihre Zahl --
// wurde von hier nie angefasst. Auf 'overdue' hat sie nirgends im
// Projekt jemand gesetzt. Der Zähler "Überfällig" stand deshalb immer
// auf 0, und ein einmal von Hand als bezahlt eingetragener Kunde blieb
// für immer grün.
//
// Der Webhook ist der SCHNELLE Weg. Die Wahrheit holt abo-stand.js
// direkt bei Stripe ab -- ob dieser Webhook im Stripe-Fenster überhaupt
// eingerichtet ist, kann von außen niemand nachsehen.
//
// MUSS im Git-Repo liegen (siehe stripe-create-customer.js).
//
// Stripe ruft diese URL nach Ereignissen auf (Checkout abgeschlossen, Abo
// geändert/gekündigt). Wir aktualisieren in der customers-Tabelle:
//   stripe_customer_id, stripe_subscription_id, stripe_status
// -> Genau die Felder, die das Admin-Frontend liest.
//
// EINRICHTUNG (einmalig) im Stripe-Dashboard > Developers > Webhooks:
//   Endpoint:  https://kiekmolin.de/.netlify/functions/stripe-webhook
//   Events:    checkout.session.completed,
//              customer.subscription.updated,
//              customer.subscription.deleted,
//              invoice.paid,
//              invoice.payment_failed
//   Signing secret -> als ENV-Var STRIPE_WEBHOOK_SECRET in Netlify hinterlegen.
//
// ENV-Vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Pflicht),
//           SUPABASE_URL, SUPABASE_SERVICE_KEY (für Schreibzugriff empfohlen).

'use strict';

var Stripe = require('stripe');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

function sbHeaders() {
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    };
}

// PATCH customers ... where <filter>
async function sbPatch(filter, patch) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/customers?' + filter, {
        method: 'PATCH',
        headers: sbHeaders(),
        body: JSON.stringify(patch)
    });
    if (!res.ok) {
        var t = await res.text();
        console.error('[stripe-webhook] Supabase PATCH fehlgeschlagen', res.status, t.slice(0, 200));
    }
}

exports.handler = async function (event) {
    var secret = process.env.STRIPE_SECRET_KEY;
    var whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !whSecret) {
        return { statusCode: 500, body: 'STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET fehlen' };
    }

    var stripe = Stripe(secret);

    // Signaturprüfung braucht den ROHEN Body.
    var rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    var sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

    var stripeEvent;
    try {
        stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
    } catch (err) {
        return { statusCode: 400, body: 'Webhook-Signatur ungueltig: ' + (err && err.message) };
    }

    try {
        var obj = stripeEvent.data.object;

        if (stripeEvent.type === 'checkout.session.completed') {
            var kinId = (obj.metadata && obj.metadata.kiekmolin_customer_id) || obj.client_reference_id;
            var patch = {
                stripe_customer_id: obj.customer || null,
                stripe_subscription_id: obj.subscription || null,
                stripe_status: 'active'
            };
            if (obj.subscription) {
                try {
                    var sub = await stripe.subscriptions.retrieve(obj.subscription);
                    if (sub && sub.status) patch.stripe_status = sub.status; // active | trialing | ...
                } catch (e) {}
            }
            if (kinId) {
                await sbPatch('id=eq.' + encodeURIComponent(kinId), patch);
            } else if (obj.customer) {
                await sbPatch('stripe_customer_id=eq.' + encodeURIComponent(obj.customer), patch);
            }
        } else if (stripeEvent.type === 'customer.subscription.updated') {
            var status = obj.status;
            if (obj.pause_collection) status = 'paused';
            await sbPatch('stripe_subscription_id=eq.' + encodeURIComponent(obj.id), { stripe_status: status });
        } else if (stripeEvent.type === 'customer.subscription.deleted') {
            await sbPatch('stripe_subscription_id=eq.' + encodeURIComponent(obj.id), { stripe_status: 'canceled' });

        // ---- Die Rechnung ist bezahlt -------------------------------
        // Gefiltert wird über stripe_customer_id, nicht über das Abo:
        // eine Rechnung kann auch ohne Abo entstehen, und obj.customer
        // steht immer drin.
        } else if (stripeEvent.type === 'invoice.paid'
                || stripeEvent.type === 'invoice.payment_succeeded') {
            if (obj.customer) {
                var bezahltPatch = { payment_status: 'paid' };
                var heute = new Date();
                bezahltPatch.last_payment_date = heute.toISOString().slice(0, 10);
                // Das nächste Fälligkeitsdatum sagt Stripe selbst -- nicht
                // "heute plus ein Monat" rechnen, das geht bei Jahresabos
                // und verschobenen Perioden daneben.
                if (obj.period_end) {
                    bezahltPatch.next_payment_date = new Date(obj.period_end * 1000).toISOString().slice(0, 10);
                }
                await sbPatch('stripe_customer_id=eq.' + encodeURIComponent(obj.customer), bezahltPatch);
            }

        // ---- Die Zahlung ist fehlgeschlagen --------------------------
        // DAS WAR DER BLINDE FLECK. Genau dieses Ereignis hat bis heute
        // niemand gehört -- deshalb gab es nie einen überfälligen Kunden.
        } else if (stripeEvent.type === 'invoice.payment_failed') {
            if (obj.customer) {
                await sbPatch('stripe_customer_id=eq.' + encodeURIComponent(obj.customer),
                              { payment_status: 'overdue' });
                console.warn('[stripe-webhook] Zahlung fehlgeschlagen bei ' + obj.customer
                    + ' -- Kunde steht jetzt auf overdue.');
            }
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (err) {
        console.error('[stripe-webhook] Fehler', err && err.message);
        // 200 zurück, damit Stripe nicht endlos retried, der Fehler steht im Log.
        return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'handled with error' }) };
    }
};
