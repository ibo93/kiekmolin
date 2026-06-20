// Bon-Druck via Epson Server Direct Print.
// Der Epson-Bondrucker (TM-Serie mit ePOS Server Direct) wird so konfiguriert,
// dass er regelmaessig (alle 5-15 Sek) bei dieser URL nachfragt. Wir liefern
// dann die naechste ungedruckte Bestellung im ePOS-Print-XML-Format aus und
// markieren sie als gedruckt.
//
// Modi:
//   GET/POST /.netlify/functions/pos-print?restaurant=<id>&key=<pull_key>
//     -> liefert XML mit der naechsten ungedruckten Bestellung (oder leer)
//     -> markiert die Bestellung als gedruckt
//
//   POST /.netlify/functions/pos-print?action=reprint&order=<id>
//        Header: Authorization: Bearer <supabase-login-token>
//     -> setzt printed_at zurueck, damit der Drucker den Bon nochmal holt
//
// ENV-Vars optional: SUPABASE_URL, SUPABASE_SERVICE_KEY (bevorzugt).
// Fehlen sie, fallen wir auf die oeffentlichen anon-Zugangsdaten zurueck.

'use strict';

var crypto = require('crypto');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
};

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

function safeEqual(a, b) {
    var ha = crypto.createHash('sha256').update(String(a)).digest();
    var hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function xmlEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Empty-Response damit der Drucker beim naechsten Poll wieder fragt.
function emptyEposResponse() {
    return '<?xml version="1.0" encoding="utf-8"?>' +
           '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
           '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/>' +
           '</s:Body></s:Envelope>';
}

// Bon-XML — identisches Format wie die bestehende generateEposXML im Frontend
function generateEposBon(order, restaurantName) {
    var belegNr = order.order_number || ('B-' + (order.id || '').substring(0, 8).toUpperCase());
    var datum = new Date(order.created_at || Date.now());
    var zeit = datum.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    var date = datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    var orderTypeLabel = order.order_type === 'dine_in' ? 'HIER ESSEN'
        : order.order_type === 'delivery' ? 'LIEFERUNG' : 'ABHOLUNG';

    var xml = '<?xml version="1.0" encoding="utf-8"?>';
    xml += '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">';
    xml += '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">';
    xml += '<text lang="de" smooth="true"/>';

    // Restaurant-Header gross — wichtig fuer Laeden ohne separate Kasse,
    // weil der Bon dann das primaere Beleg-Dokument ist.
    if (restaurantName) {
        xml += '<text align="center" width="2" height="2">' + xmlEscape(restaurantName) + '&#10;</text>';
        xml += '<text>&#10;</text>';
    }

    xml += '<text align="center" font="font_a" width="2" height="2">' + xmlEscape(belegNr) + '&#10;</text>';
    xml += '<text align="center">' + date + ' ' + zeit + '&#10;&#10;</text>';
    xml += '<text align="center" width="2" height="2">' + orderTypeLabel + '&#10;</text>';

    if (order.table_number) {
        xml += '<text align="center" width="2" height="2">Tisch ' + xmlEscape(order.table_number) + '&#10;</text>';
    }

    xml += '<text>&#10;</text><text>================================&#10;</text>';

    var items = Array.isArray(order.items) ? order.items : [];
    items.forEach(function (item) {
        var qty = item.quantity || 1;
        var name = item.name || '';
        // Items in doppelter Hoehe — besser lesbar in der Kueche
        xml += '<text width="1" height="2">' + xmlEscape(qty + 'x ' + name) + '&#10;</text>';
        if (item.options) xml += '<text>  &gt; ' + xmlEscape(item.options) + '&#10;</text>';
    });

    xml += '<text>================================&#10;</text>';
    xml += '<text>&#10;</text>';

    // Total — extra gross (3x), damit's nicht zu uebersehen ist
    var total = parseFloat(order.total || 0).toFixed(2).replace('.', ',');
    xml += '<text align="right" width="3" height="3">' + total + ' EUR&#10;</text>';
    xml += '<text align="right">GESAMT&#10;</text>';
    xml += '<text>&#10;</text>';

    // Zahlart prominent
    if (order.payment_method) {
        var pm = order.payment_method === 'cash' ? 'BAR' : String(order.payment_method).toUpperCase();
        xml += '<text align="center" width="2" height="2">' + xmlEscape(pm) + '&#10;</text>';
        xml += '<text>&#10;</text>';
    }

    if (order.customer_name) xml += '<text>Kunde:   ' + xmlEscape(order.customer_name) + '&#10;</text>';
    if (order.customer_phone) xml += '<text>Telefon: ' + xmlEscape(order.customer_phone) + '&#10;</text>';
    if (order.delivery_address && typeof order.delivery_address === 'object') {
        var addr = order.delivery_address;
        var addrLine = [addr.street, addr.house_number].filter(Boolean).join(' ');
        var cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
        if (addrLine) xml += '<text>Adresse: ' + xmlEscape(addrLine) + '&#10;</text>';
        if (cityLine) xml += '<text>         ' + xmlEscape(cityLine) + '&#10;</text>';
    }
    if (order.customer_notes || order.delivery_notes) {
        xml += '<text>&#10;</text>';
        xml += '<text width="1" height="2">Hinweis:&#10;</text>';
        xml += '<text width="1" height="2">' + xmlEscape(order.customer_notes || order.delivery_notes) + '&#10;</text>';
    }

    xml += '<feed unit="30"/>';
    xml += '<text align="center">--- Vielen Dank! ---&#10;</text>';
    xml += '<text align="center">kiekmolin.de&#10;</text>';
    xml += '<feed unit="36"/><cut type="feed"/>';
    xml += '</epos-print></s:Body></s:Envelope>';
    return xml;
}

function xmlResponse(body, status) {
    return {
        statusCode: status || 200,
        headers: Object.assign({}, CORS_HEADERS, { 'Content-Type': 'text/xml; charset=utf-8' }),
        body: body
    };
}

function jsonResponse(status, obj) {
    return {
        statusCode: status,
        headers: Object.assign({}, CORS_HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(obj)
    };
}

// Login-Token validieren (fuer Reprint-Aktion vom Dashboard)
async function authedRestaurantIds(token) {
    if (!token) return null;
    var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.email) return null;
    var rows = await sbGet('customers?email=eq.' + encodeURIComponent(user.email) +
        '&is_active=eq.true&select=restaurant_id');
    return (rows || []).map(function (r) { return r.restaurant_id; }).filter(Boolean);
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    var q = event.queryStringParameters || {};

    try {
        // ---- Reprint-Aktion (vom Dashboard) ----
        if (q.action === 'reprint') {
            var auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
            var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
            var allowedIds = await authedRestaurantIds(token);
            if (!allowedIds) return jsonResponse(401, { ok: false, error: 'Nicht eingeloggt.' });

            var orderId = q.order;
            if (!orderId) return jsonResponse(400, { ok: false, error: 'Order-ID fehlt.' });

            // Restaurant der Bestellung pruefen
            var orderRows = await sbGet('orders?id=eq.' + encodeURIComponent(orderId) +
                '&select=id,restaurant_id');
            if (!orderRows.length) return jsonResponse(404, { ok: false, error: 'Bestellung nicht gefunden.' });
            if (allowedIds.indexOf(orderRows[0].restaurant_id) === -1) {
                return jsonResponse(403, { ok: false, error: 'Kein Zugriff auf diese Bestellung.' });
            }

            await sbPatch('orders?id=eq.' + encodeURIComponent(orderId), { printed_at: null });
            return jsonResponse(200, { ok: true, message: 'Bon wird beim naechsten Poll erneut gedruckt.' });
        }

        // ---- Druck-Abruf vom Drucker ----
        var restaurant = q.restaurant;
        var key = q.key || (event.headers && (event.headers['x-api-key'] || event.headers['X-API-Key']));
        if (!restaurant || !key) {
            // Empty fuer den Drucker (keine 4xx -> Drucker meldet sonst Fehler)
            return xmlResponse(emptyEposResponse());
        }

        // Restaurant + pull_key validieren
        var rrows = await sbGet('restaurants?id=eq.' + encodeURIComponent(restaurant) +
            '&select=id,name,pos_pull_key');
        if (!rrows.length || !rrows[0].pos_pull_key) {
            return xmlResponse(emptyEposResponse());
        }
        if (!safeEqual(key, rrows[0].pos_pull_key)) {
            return xmlResponse(emptyEposResponse());
        }

        // Aelteste ungedruckte Bestellung (letzte 24h, nicht storniert)
        var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        var orderPath = 'orders?restaurant_id=eq.' + encodeURIComponent(restaurant) +
            '&printed_at=is.null' +
            '&created_at=gte.' + encodeURIComponent(since) +
            '&status=not.in.(cancelled,canceled,rejected)' +
            '&order=created_at.asc&limit=1' +
            '&select=id,order_number,status,order_type,created_at,table_number,' +
                    'customer_name,customer_phone,customer_notes,delivery_address,delivery_notes,' +
                    'items,total';
        var orders = await sbGet(orderPath);

        if (!orders.length) {
            return xmlResponse(emptyEposResponse());
        }

        var order = orders[0];
        var xml = generateEposBon(order, rrows[0].name);

        // Sofort als gedruckt markieren (in v1 vertrauen wir dem Drucker).
        // Bei Druckfehler kann der Gastronom im Dashboard "Nachdrucken" klicken.
        try {
            await sbPatch('orders?id=eq.' + encodeURIComponent(order.id), {
                printed_at: new Date().toISOString()
            });
        } catch (e) {
            console.warn('[pos-print] printed_at konnte nicht gesetzt werden:', e.message);
        }

        return xmlResponse(xml);
    } catch (err) {
        console.error('[pos-print] error:', err && err.stack ? err.stack : err);
        // Drucker erwartet IMMER eine XML-Antwort, sonst Fehler-LED
        return xmlResponse(emptyEposResponse(), 200);
    }
};
