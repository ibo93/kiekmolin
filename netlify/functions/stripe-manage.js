// Stripe: bestehendes Abo verwalten (kuendigen / pausieren / fortsetzen /
// Kundenportal / Preis aendern).
//
// MUSS im Git-Repo liegen (siehe stripe-create-customer.js).
//
// Aufruf (aus dem Admin / index.html):
//   POST /.netlify/functions/stripe-manage
//   Body: { action, stripeSubscriptionId, stripeCustomerId, newPrice? }
//   action: 'portal' | 'cancel' | 'pause' | 'resume' | 'update-price'
//   Antwort: { success:true, portalUrl? } | { error }
//
// ENV-Vars: STRIPE_SECRET_KEY (Pflicht), URL (Netlify automatisch).

'use strict';

var Stripe = require('stripe');

var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

function json(statusCode, obj) {
    return { statusCode: statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

function siteUrl() {
    return (process.env.URL || 'https://kiekmolin.de').replace(/\/+$/, '');
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

    var secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return json(500, { error: 'STRIPE_SECRET_KEY ist in den Netlify-Env-Vars nicht gesetzt.' });

    var stripe = Stripe(secret);

    var data;
    try { data = JSON.parse(event.body || '{}'); }
    catch (e) { return json(400, { error: 'Ungueltiger JSON-Body' }); }

    var action = data.action;
    var subId = data.stripeSubscriptionId;
    var custId = data.stripeCustomerId;

    try {
        if (action === 'portal') {
            if (!custId) return json(400, { error: 'stripeCustomerId fehlt' });
            var portal = await stripe.billingPortal.sessions.create({
                customer: custId,
                return_url: siteUrl() + '/?stripe=portal'
            });
            return json(200, { success: true, portalUrl: portal.url });
        }

        if (action === 'cancel') {
            if (!subId) return json(400, { error: 'stripeSubscriptionId fehlt' });
            await stripe.subscriptions.cancel(subId);
            return json(200, { success: true });
        }

        if (action === 'pause') {
            if (!subId) return json(400, { error: 'stripeSubscriptionId fehlt' });
            await stripe.subscriptions.update(subId, { pause_collection: { behavior: 'void' } });
            return json(200, { success: true });
        }

        if (action === 'resume') {
            if (!subId) return json(400, { error: 'stripeSubscriptionId fehlt' });
            await stripe.subscriptions.update(subId, { pause_collection: '' });
            return json(200, { success: true });
        }

        if (action === 'update-price') {
            if (!subId) return json(400, { error: 'stripeSubscriptionId fehlt' });
            var newPrice = parseFloat(data.newPrice);
            if (!(newPrice >= 0)) return json(400, { error: 'newPrice ungueltig' });

            var sub = await stripe.subscriptions.retrieve(subId);
            var item = sub.items && sub.items.data && sub.items.data[0];
            if (!item) return json(400, { error: 'Abo hat keine Position' });

            // Neuen Preis fuer dasselbe Produkt anlegen und die Abo-Position umstellen.
            var product = (item.price && item.price.product) ? item.price.product : undefined;
            var priceObj = await stripe.prices.create({
                currency: 'eur',
                unit_amount: Math.round(newPrice * 100),
                recurring: { interval: 'month' },
                product: product,
                product_data: product ? undefined : { name: 'kiekmolin Abo' }
            });
            await stripe.subscriptions.update(subId, {
                items: [{ id: item.id, price: priceObj.id }],
                proration_behavior: 'none'
            });
            return json(200, { success: true });
        }

        return json(400, { error: 'Unbekannte action: ' + action });
    } catch (err) {
        return json(500, { error: (err && err.message) ? err.message : 'Stripe Fehler' });
    }
};
