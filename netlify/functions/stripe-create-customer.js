// Stripe: Kunden anlegen + Abo-Checkout starten.
//
// WICHTIG: Diese Datei MUSS im Git-Repo liegen. Frueher waren die Stripe-
// Funktionen nur direkt auf Netlify angelegt -> jeder Git-Deploy hat sie
// geloescht ("Verbindung geht beim Deployen verloren"). Im Repo bleiben sie
// bei jedem Deploy erhalten.
//
// Aufruf (aus dem Admin / index.html):
//   POST /.netlify/functions/stripe-create-customer
//   Body: { customerName, customerEmail, monthlyFee, discountPercent, freeMonths, customerId }
//   Antwort: { success:true, checkoutUrl, stripeCustomerId } | { error }
//
// Die Preise/Konditionen kommen aus der App (getCustomerPricingInfo) -> diese
// Funktion fuehrt nur den Stripe-Checkout aus, sie legt keine Preise selbst fest.
//
// ENV-Vars (in Netlify > Site settings > Environment, bleiben ueber Deploys erhalten):
//   STRIPE_SECRET_KEY   (Pflicht)  z.B. sk_test_... / sk_live_...
//                       (seit Juli 2026 auf kiekmolin2 gesetzt -- live aktiv)
//   URL                 (setzt Netlify automatisch = Haupt-Site-URL)

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
    // Netlify setzt process.env.URL auf die Haupt-Site-URL. Fallback fix.
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

    var customerName = data.customerName || '';
    var customerEmail = data.customerEmail || '';
    var monthlyFee = parseFloat(data.monthlyFee);
    var discountPercent = parseFloat(data.discountPercent) || 0;
    var freeMonths = parseInt(data.freeMonths, 10) || 0;
    var customerId = data.customerId || '';

    if (!customerEmail) return json(400, { error: 'customerEmail fehlt' });
    if (!(monthlyFee > 0)) return json(400, { error: 'monthlyFee fehlt oder ist 0' });

    try {
        // 1) Stripe-Kunde anlegen
        var customer = await stripe.customers.create({
            name: customerName || undefined,
            email: customerEmail,
            metadata: { kiekmolin_customer_id: String(customerId) }
        });

        // 2) Optionaler Rabatt -> Coupon (prozentual, dauerhaft)
        var discounts;
        if (discountPercent > 0) {
            var coupon = await stripe.coupons.create({
                percent_off: discountPercent,
                duration: 'forever',
                name: 'kiekmolin Rabatt ' + discountPercent + '%'
            });
            discounts = [{ coupon: coupon.id }];
        }

        // 3) Abo-Daten: Gratismonate -> Trial
        var subscriptionData = { metadata: { kiekmolin_customer_id: String(customerId) } };
        if (freeMonths > 0) subscriptionData.trial_period_days = freeMonths * 30;

        // 4) Checkout-Session (Abo). Preis dynamisch aus der App.
        var session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customer.id,
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: { name: 'kiekmolin Abo' },
                    unit_amount: Math.round(monthlyFee * 100),
                    recurring: { interval: 'month' }
                },
                quantity: 1
            }],
            discounts: discounts,
            subscription_data: subscriptionData,
            client_reference_id: String(customerId),
            metadata: { kiekmolin_customer_id: String(customerId) },
            success_url: siteUrl() + '/?stripe=success&customer=' + encodeURIComponent(customerId),
            cancel_url: siteUrl() + '/?stripe=cancel&customer=' + encodeURIComponent(customerId)
        });

        return json(200, { success: true, checkoutUrl: session.url, stripeCustomerId: customer.id });
    } catch (err) {
        return json(500, { error: (err && err.message) ? err.message : 'Stripe Fehler' });
    }
};
