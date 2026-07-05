// WinOrder EShop-Schnittstelle (Pull) -- Bestellungen aus kiekmolin direkt in
// die WinOrder-Kasse (z.B. auf Colormetrics-Terminal).
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// WinOrder pollt diese Endpunkte (base = https://kiekmolin.de/wo/<restaurant>/<key>):
//   GET  <base>/GetNewOrders        -> neue Bestellungen als WinOrder-OrderList-JSON
//   POST <base>/SendTrackingStatus  -> WinOrder bestaetigt Empfang (OrderID) ->
//                                       wir markieren die Bestellung als uebertragen
//   PUT  <base>/PreparationTime     -> aktuelle Vorbereitungszeit (optional, wird nur quittiert)
//
// <key> = restaurants.pos_pull_key (derselbe Schluessel wie bei der Abruf-/Druck-Schnittstelle).
//
// EINMALIG in Supabase ausfuehren:
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS winorder_sent_at timestamptz;
//
// ENV optional: SUPABASE_URL, SUPABASE_SERVICE_KEY (sonst anon-Fallback).

'use strict';

var crypto = require('crypto');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json; charset=utf-8'
};

var ORDER_COLUMNS = [
    'id', 'order_number', 'status', 'order_type', 'created_at', 'requested_time',
    'customer_name', 'customer_phone', 'customer_email',
    'delivery_address', 'delivery_notes', 'customer_notes',
    'items', 'subtotal', 'delivery_fee', 'tip', 'discount', 'total', 'payment_method', 'table_number'
].join(',');

function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

function svcHeaders() {
    return { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
}
async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: svcHeaders() });
    if (!res.ok) { var t = await res.text(); var e = new Error('Supabase GET ' + res.status + ': ' + t.slice(0, 200)); e.status = res.status; e.body = t; throw e; }
    return res.json();
}
async function sbPatch(path, body) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
        method: 'PATCH',
        headers: Object.assign(svcHeaders(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(body)
    });
    return res.ok;
}

// Timing-sicherer Vergleich (wie pos-print/pos-orders)
function safeEqual(a, b) {
    a = String(a || ''); b = String(b || '');
    var ha = crypto.createHash('sha256').update(a).digest();
    var hb = crypto.createHash('sha256').update(b).digest();
    try { return crypto.timingSafeEqual(ha, hb); } catch (e) { return false; }
}

// kiekmolin-Bestellung -> WinOrder-Order
function mapOrder(o, rest) {
    var items = Array.isArray(o.items) ? o.items : [];
    var articles = items.map(function (it) {
        var qty = Number(it.quantity) || 1;
        var line = Number(it.price) || 0;            // Zeilensumme aus dem Checkout
        var unit = qty > 0 ? Math.round((line / qty) * 100) / 100 : line;
        var art = { ArticleNo: String(it.sku || ''), ArticleName: String(it.name || 'Artikel'), ArticleSize: String(it.size || ''), Price: unit, Count: qty, Comment: '' };
        if (it.options) {
            var subs = String(it.options).split(',').map(function (s) { return s.trim(); }).filter(Boolean)
                .map(function (opt) { return { ArticleName: opt, Price: 0, Count: 1, Comment: '' }; });
            if (subs.length) art.SubArticleList = { SubArticle: subs };
        }
        return art;
    });

    // Notizen als klar erkennbarer Hinweis-Artikel oben
    var notes = [o.customer_notes, o.delivery_notes].filter(Boolean).join(' | ');
    if (notes) articles.unshift({ ArticleNo: '', ArticleName: 'HINWEIS', ArticleSize: '', Price: 0, Count: 1, Comment: notes });
    // Liefergebuehr als eigener Artikel, damit die Summe in WinOrder stimmt
    if (Number(o.delivery_fee) > 0) articles.push({ ArticleNo: '', ArticleName: 'Liefergebühr', ArticleSize: '', Price: Number(o.delivery_fee), Count: 1, Comment: '' });

    var nameParts = String(o.customer_name || '').trim().split(/\s+/).filter(Boolean);
    var lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : (nameParts[0] || '');
    var firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

    var payMap = { cash: 'Barzahlung', bar: 'Barzahlung', card: 'Kartenzahlung', ec: 'EC-Karte', paypal: 'PayPal', online: 'Online bezahlt', stripe: 'Online bezahlt' };

    return {
        OrderID: String(o.id),
        AddInfo: {
            PaymentType: payMap[String(o.payment_method || '').toLowerCase()] || String(o.payment_method || 'Barzahlung'),
            DiscountPercent: 0,
            Total: Number(o.total) || 0,
            OrderType: o.order_type === 'delivery' ? 'Lieferung' : (o.order_type === 'dine_in' ? 'Vor Ort' : 'Abholung'),
            OrderNumber: String(o.order_number || ''),
            RequestedTime: String(o.requested_time || '')
        },
        ServerData: { CreateDateTime: o.created_at || new Date().toISOString() },
        StoreData: { StoreId: String(rest.id), StoreName: String(rest.name || '') },
        Customer: {
            DeliveryAddress: {
                FirstName: firstName, LastName: lastName,
                Street: String(o.delivery_address || ''), HouseNo: '', Zip: '', City: '', Country: 'DE',
                PhoneNo: String(o.customer_phone || ''), EMail: String(o.customer_email || ''), Company: '', Title: ''
            }
        },
        ArticleList: { Article: articles }
    };
}

function parseBody(event) {
    var raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) {}
    var out = {}; // x-www-form-urlencoded Fallback
    raw.split('&').forEach(function (pair) {
        var kv = pair.split('='); if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
    return out;
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

    // Pfad zerlegen. Je nach Netlify-Konfiguration bekommt die Funktion entweder
    // den ORIGINAL-Pfad (/wo/<restaurant>/<key>/<action>) ODER den umgeschriebenen
    // (/.netlify/functions/winorder/<restaurant>/<key>/<action>). Beide unterstuetzen:
    // hinter dem bekannten Praefix ('winorder' oder 'wo') alles als Segmente nehmen,
    // sonst den kompletten Pfad verwenden.
    var parts = String(event.rawUrl ? new URL(event.rawUrl).pathname : (event.path || '')).split('/').filter(Boolean);
    var idx = parts.indexOf('winorder');
    if (idx < 0) idx = parts.indexOf('wo');
    var seg = idx >= 0 ? parts.slice(idx + 1) : parts.slice();
    var qs = event.queryStringParameters || {};

    var KNOWN = { getneworders: 'GetNewOrders', sendtrackingstatus: 'SendTrackingStatus', preparationtime: 'PreparationTime' };
    var restaurant = '', key = '', action = '';

    var last = seg.length ? seg[seg.length - 1].toLowerCase() : '';
    if (KNOWN[last]) {
        action = last;
        if (seg.length >= 3) { restaurant = seg[seg.length - 3]; key = seg[seg.length - 2]; }
    } else if (seg.length >= 2) {
        restaurant = seg[0]; key = seg[1];
    }
    restaurant = restaurant || qs.restaurant || qs.store || '';
    key = key || qs.key || '';
    if (!action) {
        action = String(qs.action || '').toLowerCase()
            || (event.httpMethod === 'PUT' ? 'preparationtime' : (event.httpMethod === 'POST' ? 'sendtrackingstatus' : 'getneworders'));
    }

    if (!restaurant || !key) return json(401, { error: 'restaurant/key fehlt in der URL' });

    // Auth: Schluessel gegen restaurants.pos_pull_key pruefen
    var rest;
    try {
        var rows = await sbGet('restaurants?id=eq.' + encodeURIComponent(restaurant) + '&select=id,name,pos_pull_key');
        if (!rows.length || !rows[0].pos_pull_key || !safeEqual(key, rows[0].pos_pull_key)) {
            return json(401, { error: 'Ungueltiger Schluessel' });
        }
        rest = rows[0];
    } catch (e) {
        return json(500, { error: 'Auth-Pruefung fehlgeschlagen: ' + e.message });
    }

    try {
        if (action === 'getneworders') {
            var orders;
            try {
                orders = await sbGet('orders?restaurant_id=eq.' + encodeURIComponent(restaurant) +
                    '&winorder_sent_at=is.null&status=neq.cancelled&order=created_at.asc&limit=50&select=' + ORDER_COLUMNS);
            } catch (e) {
                if (e.status === 400 && /winorder_sent_at/.test(e.body || '')) {
                    return json(500, { error: 'Spalte winorder_sent_at fehlt. Bitte einmalig ausfuehren: ALTER TABLE orders ADD COLUMN IF NOT EXISTS winorder_sent_at timestamptz;' });
                }
                throw e;
            }
            // WICHTIG gegen Endlos-Flut: Bestellungen SOFORT beim Ausliefern als
            // uebertragen markieren (nicht erst auf SendTrackingStatus warten -- das
            // wird von WinOrder nicht zuverlaessig geschickt). Nur was erfolgreich
            // markiert werden konnte, wird ueberhaupt ausgeliefert. Kann nicht markiert
            // werden (z.B. Schreibrecht fehlt), liefern wir NICHTS -> keine Wiederholung.
            if (orders.length) {
                var ids = orders.map(function (o) { return o.id; });
                var marked = await sbPatch('orders?id=in.(' + ids.map(encodeURIComponent).join(',') + ')',
                    { winorder_sent_at: new Date().toISOString() });
                if (!marked) {
                    return json(200, { OrderList: { CreateDateTime: new Date().toISOString(), Order: [] } });
                }
            }
            var out = { OrderList: { CreateDateTime: new Date().toISOString(), Order: orders.map(function (o) { return mapOrder(o, rest); }) } };
            return json(200, out);
        }

        if (action === 'sendtrackingstatus') {
            var body = parseBody(event);
            var oid = body.OrderID || body.orderID || body.orderid || qs.OrderID || qs.orderid;
            if (oid) {
                await sbPatch('orders?id=eq.' + encodeURIComponent(oid), { winorder_sent_at: new Date().toISOString() });
            }
            return json(200, { Result: 'OK', trackingstatus: 0 });
        }

        if (action === 'preparationtime') {
            // WinOrder meldet die aktuelle Vorbereitungszeit -> nur quittieren.
            return json(200, { Result: 'OK' });
        }

        return json(400, { error: 'Unbekannte Aktion: ' + action });
    } catch (e) {
        return json(500, { error: e.message });
    }
};
