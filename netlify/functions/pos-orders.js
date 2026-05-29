// POS-Abruf (Pull): Kassensysteme holen sich die Bestellungen eines Restaurants
// im standardisierten JSON-Format ab. Software-unabhaengig — egal welches
// Kassenprogramm, es braucht nur eine URL + einen Zugriffs-Schluessel.
//
// Zwei Modi:
//   1) Bestellungen abrufen (fuer das Kassensystem):
//        GET  /.netlify/functions/pos-orders?restaurant=<id>&key=<pull_key>
//        Optional: &since=<ISO>  &status=<csv>  &limit=<n>
//   2) Zugangsdaten erzeugen/anzeigen (fuer den eingeloggten Gastronomen):
//        GET  /.netlify/functions/pos-orders?action=key[&rotate=1]
//        Header: Authorization: Bearer <supabase-login-token>
//
// ENV-Vars optional: SUPABASE_URL, SUPABASE_SERVICE_KEY (bevorzugt). Fehlen sie,
// nutzt die Funktion automatisch die oeffentlichen anon-Zugangsdaten als Fallback.

'use strict';

var crypto = require('crypto');

// Bevorzugt die Server-Variablen (service_role = voller Zugriff). Falls die auf
// Netlify nicht gesetzt sind, Fallback auf die ohnehin oeffentlichen anon-Daten
// (identisch zu build-seo-pages.js / index.html) — damit die Schnittstelle auch
// ganz ohne Env-Setup laeuft.
var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json'
};

// Bestell-Spalten, die wir liefern (stammen direkt aus der orders-Tabelle).
var ORDER_COLUMNS = [
    'id', 'order_number', 'status', 'order_type', 'created_at', 'requested_time',
    'customer_name', 'customer_phone', 'customer_email',
    'delivery_address', 'delivery_notes', 'customer_notes',
    'items', 'subtotal', 'delivery_fee', 'tip', 'discount', 'coupon_code',
    'total', 'payment_method', 'table_number'
].join(',');

function svcHeaders() {
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
    };
}

async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: svcHeaders() });
    if (!res.ok) {
        var t = await res.text();
        throw new Error('Supabase GET ' + path + ' -> ' + res.status + ': ' + t.slice(0, 200));
    }
    return res.json();
}

async function sbPatch(path, body) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
        method: 'PATCH',
        headers: Object.assign({}, svcHeaders(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        var t = await res.text();
        throw new Error('Supabase PATCH ' + path + ' -> ' + res.status + ': ' + t.slice(0, 200));
    }
}

function json(statusCode, obj) {
    return { statusCode: statusCode, headers: CORS_HEADERS, body: JSON.stringify(obj) };
}

function generateKey() {
    return crypto.randomBytes(24).toString('hex'); // 48 Zeichen
}

// Zeitkonstanter Vergleich (gegen Timing-Angriffe), laengenunabhaengig.
function safeEqual(a, b) {
    var ha = crypto.createHash('sha256').update(String(a)).digest();
    var hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// Login-Token (Supabase JWT) pruefen -> liefert die erlaubten restaurant_ids.
async function restaurantIdsForToken(token) {
    if (!token) return null;
    var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.email) return null;
    var rows = await sbGet('customers?email=eq.' + encodeURIComponent(user.email) +
        '&is_active=eq.true&select=restaurant_id');
    var ids = (rows || []).map(function (r) { return r.restaurant_id; }).filter(Boolean);
    return { email: user.email, restaurantIds: ids };
}

function mapOrder(o) {
    var items = Array.isArray(o.items) ? o.items.map(function (it) {
        return {
            name: it.name || '',
            quantity: it.quantity || 1,
            unit_price: typeof it.unit_price === 'number' ? it.unit_price : (parseFloat(it.unit_price) || 0),
            line_total: typeof it.price === 'number' ? it.price : (parseFloat(it.price) || 0),
            options: it.options || ''
        };
    }) : [];
    return {
        external_reference: o.order_number || o.id,
        order_id: o.id,
        order_number: o.order_number || '',
        status: o.status || '',
        order_type: o.order_type || '',
        created_at: o.created_at || null,
        requested_time: o.requested_time || null,
        customer: {
            name: o.customer_name || '',
            phone: o.customer_phone || '',
            email: o.customer_email || ''
        },
        delivery_address: o.delivery_address || null,
        delivery_notes: o.delivery_notes || '',
        note: o.customer_notes || '',
        table_number: o.table_number || null,
        items: items,
        amounts: {
            subtotal: parseFloat(o.subtotal) || 0,
            delivery_fee: parseFloat(o.delivery_fee) || 0,
            tip: parseFloat(o.tip) || 0,
            discount: parseFloat(o.discount) || 0,
            total: parseFloat(o.total) || 0,
            currency: 'EUR'
        },
        coupon_code: o.coupon_code || null,
        payment_method: o.payment_method || ''
    };
}

function getToken(event, q) {
    var auth = event.headers && (event.headers.authorization || event.headers.Authorization);
    if (auth && auth.indexOf('Bearer ') === 0) return auth.slice(7).trim();
    if (q && q.token) return q.token;
    return null;
}

function getPullKey(event, q) {
    if (q && q.key) return q.key;
    var xk = event.headers && (event.headers['x-api-key'] || event.headers['X-API-Key']);
    if (xk) return xk;
    var auth = event.headers && (event.headers.authorization || event.headers.Authorization);
    if (auth && auth.indexOf('Bearer ') === 0) return auth.slice(7).trim();
    return null;
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    var q = event.queryStringParameters || {};

    try {
        // ---- Modus 2: Zugangsdaten erzeugen/anzeigen (eingeloggter Gastronom) ----
        if (q.action === 'key') {
            var auth = await restaurantIdsForToken(getToken(event, q));
            if (!auth) return json(401, { ok: false, error: 'Nicht eingeloggt oder Token ungueltig.' });
            if (!auth.restaurantIds.length) return json(403, { ok: false, error: 'Kein Restaurant mit diesem Konto verknuepft.' });

            var restId = q.restaurant || auth.restaurantIds[0];
            if (auth.restaurantIds.indexOf(restId) === -1) {
                return json(403, { ok: false, error: 'Kein Zugriff auf dieses Restaurant.' });
            }

            var rrows = await sbGet('restaurants?id=eq.' + encodeURIComponent(restId) + '&select=id,name,pos_pull_key');
            if (!rrows || !rrows.length) return json(404, { ok: false, error: 'Restaurant nicht gefunden.' });

            var key = rrows[0].pos_pull_key;
            if (!key || q.rotate === '1') {
                key = generateKey();
                await sbPatch('restaurants?id=eq.' + encodeURIComponent(restId), { pos_pull_key: key });
            }

            var host = (event.headers && (event.headers['x-forwarded-host'] || event.headers.host)) || 'kiekmolin.de';
            var baseUrl = 'https://' + host;
            var pullUrl = baseUrl + '/.netlify/functions/pos-orders?restaurant=' +
                encodeURIComponent(restId) + '&key=' + encodeURIComponent(key);

            return json(200, {
                ok: true,
                restaurant_id: restId,
                restaurant_name: rrows[0].name || '',
                key: key,
                pull_url: pullUrl
            });
        }

        // ---- Modus 1: Bestellungen abrufen (Kassensystem) ----
        var restaurant = q.restaurant;
        var pullKey = getPullKey(event, q);
        if (!restaurant || !pullKey) {
            return json(401, { ok: false, error: 'restaurant und key erforderlich.' });
        }

        var rows = await sbGet('restaurants?id=eq.' + encodeURIComponent(restaurant) + '&select=id,name,pos_pull_key');
        if (!rows || !rows.length) return json(404, { ok: false, error: 'Restaurant nicht gefunden.' });
        if (!rows[0].pos_pull_key) return json(403, { ok: false, error: 'Abruf fuer dieses Restaurant nicht eingerichtet.' });
        if (!safeEqual(pullKey, rows[0].pos_pull_key)) {
            return json(401, { ok: false, error: 'Ungueltiger Schluessel.' });
        }

        var limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
        var since = q.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        var path = 'orders?restaurant_id=eq.' + encodeURIComponent(restaurant) +
            '&created_at=gte.' + encodeURIComponent(since) +
            '&order=created_at.desc&limit=' + limit +
            '&select=' + ORDER_COLUMNS;
        if (q.status) {
            path += '&status=in.(' + encodeURIComponent(q.status) + ')';
        } else {
            path += '&status=not.in.(cancelled,canceled,rejected)';
        }

        var orderRows = await sbGet(path);
        var orders = (orderRows || []).map(mapOrder);

        return json(200, {
            ok: true,
            restaurant_id: restaurant,
            restaurant_name: rows[0].name || '',
            server_time: new Date().toISOString(),
            since: since,
            count: orders.length,
            orders: orders
        });
    } catch (err) {
        console.error('[pos-orders] error:', err && err.stack ? err.stack : err);
        return json(500, { ok: false, error: err.message || 'Serverfehler' });
    }
};
