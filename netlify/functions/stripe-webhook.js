// Stripe Webhook: schreibt den Abo-Status zurueck nach Supabase.
//
// MUSS im Git-Repo liegen (siehe stripe-create-customer.js).
//
// Stripe ruft diese URL nach Ereignissen auf (Checkout abgeschlossen, Abo
// geaendert/gekuendigt). Wir aktualisieren in der customers-Tabelle:
//   stripe_customer_id, stripe_subscription_id, stripe_status
// -> Genau die Felder, die das Admin-Frontend liest.
//
// EINRICHTUNG (einmalig) im Stripe-Dashboard > Developers > Webhooks:
//   Endpoint:  https://kiekmolin.de/.netlify/functions/stripe-webhook
//   Events:    checkout.session.completed,
//              customer.subscription.updated,
//              customer.subscription.deleted
//   Signing secret -> als ENV-Var STRIPE_WEBHOOK_SECRET in Netlify hinterlegen.
//
// ENV-Vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (Pflicht),
//           SUPABASE_URL, SUPABASE_SERVICE_KEY (fuer Schreibzugriff empfohlen).

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

    // Signaturpruefung braucht den ROHEN Body.
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
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (err) {
        console.error('[stripe-webhook] Fehler', err && err.message);
        // 200 zurueck, damit Stripe nicht endlos retried, der Fehler steht im Log.
        return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'handled with error' }) };
    }
};
