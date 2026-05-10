// Server-Endpoint fuer echte Web Push (auch bei geschlossenem Browser/Handy).
// Wird vom Frontend aufgerufen wenn sich Order-/Reservierungs-Status aendert.

var webpush = require('web-push');
var https = require('https');
var http = require('http');
var url = require('url');

var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

var VAPID_PUBLIC = process.env.VAPID_PUBLIC;
var VAPID_PRIVATE = process.env.VAPID_PRIVATE;
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';
var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
    catch (e) { console.warn('VAPID setup failed:', e.message); }
}

function httpRequest(method, targetUrl, headers, body) {
    return new Promise(function(resolve, reject) {
        var parsed = url.parse(targetUrl);
        var lib = parsed.protocol === 'http:' ? http : https;
        var opts = {
            method: method,
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.path,
            headers: headers || {}
        };
        var req = lib.request(opts, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function supabaseSelect(table, query) {
    var u = SUPABASE_URL + '/rest/v1/' + table + '?' + query;
    return httpRequest('GET', u, {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Accept': 'application/json'
    }, null).then(function(r) {
        if (r.status >= 200 && r.status < 300) {
            try { return JSON.parse(r.body); } catch (e) { return []; }
        }
        return [];
    });
}

function supabaseDelete(table, query) {
    var u = SUPABASE_URL + '/rest/v1/' + table + '?' + query;
    return httpRequest('DELETE', u, {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
    }, null).catch(function() { return null; });
}

exports.handler = async function(event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.warn('push-send: missing env vars (VAPID_PUBLIC/VAPID_PRIVATE/SUPABASE_URL/SUPABASE_SERVICE_KEY)');
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Server not configured' }) };
    }

    var body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    var to = body.to || {};
    var payload = body.payload || {};
    if (!to.phone && !to.email) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'to.phone or to.email required' }) };
    }

    // Subscriptions per phone und/oder email holen, dedupliziert per endpoint
    var subs = [];
    var seen = {};
    try {
        if (to.phone) {
            var byPhone = await supabaseSelect('push_subscriptions', 'customer_phone=eq.' + encodeURIComponent(to.phone) + '&select=*');
            byPhone.forEach(function(s) { if (!seen[s.endpoint]) { seen[s.endpoint] = 1; subs.push(s); } });
        }
        if (to.email) {
            var byEmail = await supabaseSelect('push_subscriptions', 'customer_email=eq.' + encodeURIComponent(to.email) + '&select=*');
            byEmail.forEach(function(s) { if (!seen[s.endpoint]) { seen[s.endpoint] = 1; subs.push(s); } });
        }
    } catch (e) {
        console.warn('Supabase select failed:', e.message);
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Lookup failed' }) };
    }

    if (subs.length === 0) {
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ sent: 0, failed: 0, total: 0, note: 'no subscriptions' }) };
    }

    var pushPayload = JSON.stringify({
        title: payload.title || 'Kiek mol in',
        body: payload.body || '',
        url: payload.url || '/',
        tag: payload.tag || ('kmi-' + Date.now()),
        requireInteraction: payload.requireInteraction === true,
        type: payload.type || 'general',
        orderId: payload.orderId || null,
        actions: payload.actions || []
    });

    var sent = 0, failed = 0;
    var deletions = [];

    await Promise.all(subs.map(function(sub) {
        var subscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
        };
        return webpush.sendNotification(subscription, pushPayload)
            .then(function() { sent++; })
            .catch(function(err) {
                failed++;
                var sc = err && err.statusCode;
                if (sc === 404 || sc === 410) {
                    // Subscription stale -> aus DB entfernen
                    deletions.push(supabaseDelete('push_subscriptions', 'endpoint=eq.' + encodeURIComponent(sub.endpoint)));
                } else {
                    console.warn('webpush failed (' + sc + '):', err && err.body);
                }
            });
    }));

    if (deletions.length) { try { await Promise.all(deletions); } catch (e) {} }

    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ sent: sent, failed: failed, total: subs.length })
    };
};
