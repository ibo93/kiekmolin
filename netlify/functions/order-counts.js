// Kiek mol in — "X Bestellungen heute" auf den Restaurantkarten.
//
// WOFUER
// ------
// Die Startseite zeigt pro Betrieb, wie viel heute schon bestellt wurde.
// Das ist ein Zaehler, mehr nicht -- aber die App holte sich dafuer
// SAEMTLICHE Bestellungen des Tages in den Browser:
//
//     orders?select=restaurant_id&created_at=gte.<heute>
//
// Personenbezogen war das nicht (nur die Betriebskennung kam mit), aber
// es setzte voraus, dass orders fuer jeden lesbar ist. Genau das soll
// aufhoeren. Hier zaehlt jetzt der Server und gibt nur die Summen heraus.
//
// Aufruf:  GET /.netlify/functions/order-counts
// Antwort: { ok:true, zaehler: { "<restaurant_id>": 7, ... } }
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    // Ein Zaehler darf eine Minute alt sein. Das nimmt der Datenbank die
    // Last, wenn viele Gaeste gleichzeitig auf der Startseite stehen.
    'Cache-Control': 'public, max-age=60'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Nur GET' });

    // Ohne Schluessel lieber gar keine Zahl als eine falsche: ein leeres
    // Ergebnis wuerde als "heute noch nichts los" auf den Karten landen.
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    // Tagesbeginn in deutscher Zeit, nicht in UTC. Im Sommer liegen die
    // zwei Stunden dazwischen genau in der Zeit, in der noch bestellt
    // wird -- ein UTC-Schnitt haette den Abend dem Vortag zugeschlagen.
    var jetzt = new Date();
    var berlin = new Date(jetzt.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    var versatz = jetzt.getTime() - berlin.getTime();
    berlin.setHours(0, 0, 0, 0);
    var abISO = new Date(berlin.getTime() + versatz).toISOString();

    try {
        // Nur die Betriebskennung, nichts sonst. Storniertes zaehlt nicht --
        // sonst zeigte eine zurueckgezogene Bestellung Betrieb an.
        var res = await fetch(SUPABASE_URL + '/rest/v1/orders'
            + '?select=restaurant_id&status=neq.cancelled&created_at=gte.' + encodeURIComponent(abISO), {
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
        var reihen = await res.json();
        if (!Array.isArray(reihen)) return json(502, { ok: false, error: 'Unerwartete Antwort' });

        var zaehler = {};
        reihen.forEach(function (r) {
            if (!r || !r.restaurant_id) return;
            zaehler[r.restaurant_id] = (zaehler[r.restaurant_id] || 0) + 1;
        });
        return json(200, { ok: true, zaehler: zaehler });
    } catch (e) {
        return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
    }
};
