// POS-Proxy: Server-seitiger Vermittler für externe Kassensystem-APIs.
// Wird vom Browser angerufen, weil die Upstream-Endpoints in der Regel
// kein CORS für unsere Domain erlauben. Empfängt {system, apiKey, apiUrl,
// endpoint, method, payload} und gibt {ok, status, body} zurück.

var https = require('https');
var http = require('http');
var url = require('url');

var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

function buildTarget(system, apiKey, apiUrl, endpoint) {
    endpoint = endpoint || '';
    switch (system) {
        case 'gastrofix':
            return {
                target: 'https://api.gastrofix.com' + endpoint,
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
            };
        case 'ready2order':
            return {
                target: 'https://api.ready2order.com' + endpoint,
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
            };
        case 'lightspeed':
            var lsBase = apiUrl || 'https://api.lightspeedhq.com/restaurant';
            return {
                target: lsBase + endpoint,
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }
            };
        case 'orderbird':
            return {
                target: 'https://api.orderbird.com' + endpoint,
                headers: { 'Authorization': 'Token ' + apiKey, 'Content-Type': 'application/json' }
            };
        case 'webhook':
            // Bei Webhook ist apiKey die volle URL; endpoint optional als Suffix.
            return {
                target: (apiKey || '') + (endpoint || ''),
                headers: { 'Content-Type': 'application/json' }
            };
        case 'multidata':
            // Multidata: User gibt eigene API-URL + API-Key vor.
            // Default-Auth: Bearer; falls API X-API-Key braucht, einfach ändern.
            var mdBase = apiUrl || '';
            return {
                target: mdBase + endpoint,
                headers: {
                    'Authorization': 'Bearer ' + (apiKey || ''),
                    'X-API-Key': apiKey || '',
                    'Content-Type': 'application/json'
                }
            };
        default:
            return null;
    }
}

function doRequest(target, method, headers, payload) {
    return new Promise(function(resolve) {
        var parsed;
        try { parsed = url.parse(target); } catch (e) {
            resolve({ ok: false, status: 0, body: 'Invalid target URL: ' + e.message });
            return;
        }
        if (!parsed.protocol || !parsed.host) {
            resolve({ ok: false, status: 0, body: 'Invalid target URL' });
            return;
        }
        var lib = parsed.protocol === 'http:' ? http : https;
        var body = (method === 'GET' || method === 'HEAD' || payload == null)
            ? null
            : (typeof payload === 'string' ? payload : JSON.stringify(payload));
        var reqHeaders = Object.assign({}, headers || {});
        if (body) reqHeaders['Content-Length'] = Buffer.byteLength(body);

        var opts = {
            method: method || 'POST',
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
            path: parsed.path,
            headers: reqHeaders
        };
        var req = lib.request(opts, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                var text = Buffer.concat(chunks).toString('utf8');
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: text });
            });
        });
        req.on('error', function(e) {
            resolve({ ok: false, status: 0, body: 'Upstream error: ' + e.message });
        });
        // 12s Timeout — Netlify Free hat 10s Hard Limit, lieber abbrechen als hängen.
        req.setTimeout(12000, function() {
            req.destroy(new Error('Upstream timeout'));
        });
        if (body) req.write(body);
        req.end();
    });
}

exports.handler = async function(event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, status: 405, body: 'Method not allowed' }) };
    }
    var input;
    try { input = JSON.parse(event.body || '{}'); }
    catch (e) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, status: 400, body: 'Invalid JSON' }) };
    }
    var system = input.system;
    var apiKey = input.apiKey;
    var apiUrl = input.apiUrl;
    var endpoint = input.endpoint;
    var method = (input.method || 'POST').toUpperCase();
    var payload = input.payload;

    if (!system) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, status: 400, body: 'Missing system' }) };
    }
    var t = buildTarget(system, apiKey, apiUrl, endpoint);
    if (!t) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, status: 400, body: 'Unknown system: ' + system }) };
    }

    var result = await doRequest(t.target, method, t.headers, payload);
    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(result)
    };
};
