// Serverseitiges Speichern einer Bestellung -- der NORMALE Weg. Der direkte
// Insert aus dem Browser (öffentlicher anon-Key) ist nur noch der Notweg,
// falls diese Function nicht erreichbar ist.
//
// Umgedreht wurde das wegen der Preise: hier wird gegengerechnet (siehe
// lib/preis-pruefung.js), und eine Prüfung, an der man vorbeigehen kann, ist
// keine. Vorher liefen die Bestellungen direkt in die Datenbank und diese
// Function war der Fallback bei RLS.
//
// MUSS im Git-Repo liegen (sonst beim Deploy weg).
//
// Nutzt den SUPABASE_SERVICE_KEY (umgeht RLS). Ist der nicht gesetzt, fällt es
// auf den anon-Key zurück -- dann hilft es bei RLS allerdings nicht und meldet
// den Fehler klar zurück.
//
// Aufruf: POST /.netlify/functions/order-save   Body: { "order": { ...felder... } }
// Antwort: { ok:true, id } | { ok:false, status, error }

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var KEY = SERVICE_KEY || SUPABASE_ANON_KEY;

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
};

function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

// Nur bekannte/sichere Felder übernehmen -- keine willkürlichen Spalten
// aus dem Browser durchreichen.
var ALLOWED = [
    'order_number', 'restaurant_id', 'restaurant_name', 'status', 'order_type',
    'customer_name', 'customer_phone', 'customer_email',
    'delivery_address', 'delivery_notes', 'customer_notes',
    'items', 'subtotal', 'delivery_fee', 'tip', 'discount', 'total',
    'payment_method', 'table_number', 'coupon_code', 'requested_time', 'created_at'
];

// Selbst-heilender Insert: fehlt eine Spalte in der Tabelle, entfernen und erneut.
async function resilientInsert(payload) {
    var body = {};
    ALLOWED.forEach(function (k) { if (payload[k] !== undefined) body[k] = payload[k]; });
    var lastStatus = 0, lastText = '';
    for (var i = 0; i < 15; i++) {
        var res = await fetch(SUPABASE_URL + '/rest/v1/orders', {
            method: 'POST',
            headers: {
                'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
                'Content-Type': 'application/json', 'Prefer': 'return=representation'
            },
            body: JSON.stringify(body)
        });
        if (res.ok) { var data = null; try { data = await res.json(); } catch (e) {} return { ok: true, data: data }; }
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

// ---------------------------------------------------------------------------
// Preisprüfung: die Kartendaten holen und gegenrechnen.
// ---------------------------------------------------------------------------
var preisPruefung = require('./lib/preis-pruefung');

function kopf() {
    return { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
}

async function hol(pfad) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: kopf() });
    if (!res.ok) throw new Error(pfad.split('?')[0] + ': HTTP ' + res.status);
    return await res.json();
}

// Gibt { ok, gruende, ... } zurück, oder { ok:true, unpruefbar:'grund' },
// wenn die Kartendaten nicht zu holen waren.
//
// Fällt die Datenbankabfrage aus, geht die Bestellung DURCH. Das ist Absicht:
// eine Störung beim Nachschlagen darf keine echten Bestellungen verhindern --
// dann stünde der Wirt am Freitagabend ohne Bestellungen da, weil eine
// Nebenabfrage klemmt. Der Fall wird in der Antwort vermerkt, damit er in den
// Netlify-Logs sichtbar ist und nicht still bleibt.
async function preisCheck(order) {
    var daten = {};
    try {
        var rid = encodeURIComponent(order.restaurant_id);
        var ergebnisse = await Promise.all([
            hol('restaurants?id=eq.' + rid + '&select=id,delivery_fee&limit=1'),
            hol('menu_items?restaurant_id=eq.' + rid + '&select=id,name,base_price,price,sizes'),
            // Aktionspreise sind von Hand angelegte Paare, davon gibt es
            // wenige. Ohne Filter geholt, weil die Spalte restaurant_id dort
            // nicht existiert und eine id-Liste die URL sprengen würde.
            hol('menu_cross_sells?select=target_item_id,cross_sell_price&limit=2000').catch(function () { return []; })
        ]);
        daten.restaurant = (ergebnisse[0] || [])[0] || null;
        daten.menuItems = ergebnisse[1] || [];
        daten.crossSells = ergebnisse[2] || [];

        if (order.coupon_code) {
            daten.coupon = (await hol('coupons?code=eq.' + encodeURIComponent(order.coupon_code)
                                      + '&select=code,type,value&limit=1').catch(function () { return []; }))[0] || null;
        }
    } catch (e) {
        return { ok: true, unpruefbar: e.message };
    }
    if (!daten.menuItems.length) return { ok: true, unpruefbar: 'keine Karte gefunden' };
    return preisPruefung.pruefe(order, daten);
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST' });

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltiges JSON' }); }
    var order = body.order || body;
    if (!order || typeof order !== 'object' || !order.order_number) {
        return json(400, { ok: false, error: 'order/order_number fehlt' });
    }
    if (!order.restaurant_id) {
        return json(400, { ok: false, error: 'restaurant_id fehlt' });
    }

    try {
        var pruefung = await preisCheck(order);
        if (!pruefung.ok) {
            // 422 und NICHT 200: der Browser darf danach nicht auf den
            // direkten Insert ausweichen, sonst wäre die Prüfung umsonst.
            console.warn('[order-save] Preis abgelehnt', order.order_number, pruefung.gruende.join(' | '));
            return {
                statusCode: 422,
                headers: CORS,
                body: JSON.stringify({
                    ok: false,
                    preis_abgelehnt: true,
                    error: 'Der Preis dieser Bestellung stimmt nicht mit der Karte überein.',
                    gruende: pruefung.gruende,
                    mindestens: pruefung.mindestens,
                    gemeldet: pruefung.gemeldet
                })
            };
        }
        if (pruefung.unpruefbar) {
            console.warn('[order-save] Preis ungeprueft durchgelassen', order.order_number, pruefung.unpruefbar);
        } else if (pruefung.ungeprueft && pruefung.ungeprueft.length) {
            console.warn('[order-save] nicht in der Karte gefunden', order.order_number, pruefung.ungeprueft.join(', '));
        }

        var r = await resilientInsert(order);
        if (r.ok) {
            var id = (r.data && r.data[0] && r.data[0].id) || null;
            return json(200, { ok: true, id: id, via: SERVICE_KEY ? 'service' : 'anon' });
        }
        return json(200, {
            ok: false,
            status: r.status,
            error: String(r.text || '').slice(0, 400),
            service_key_gesetzt: !!SERVICE_KEY
        });
    } catch (e) {
        return json(500, { ok: false, error: e.message });
    }
};
