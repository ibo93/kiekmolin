// Serverseitiges Geocoding (OpenStreetMap/Nominatim). Zuverlaessiger als direkt
// aus dem Browser (kein CORS/Service-Worker/Netzwerk-Block). Wird vom Menue-/
// Restaurant-Anlegen genutzt, damit Restaurants an ihrer ECHTEN Adresse auf der
// Karte landen (statt pauschal Greetsiel).
//
// Aufruf: GET /.netlify/functions/geocode?q=<Adresse>
// Antwort: { ok:true, lat, lng } | { ok:false }

'use strict';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

    var q = (event.queryStringParameters && event.queryStringParameters.q) || '';
    if (!q && event.body) {
        try { q = (JSON.parse(event.body) || {}).q || ''; } catch (e) {}
    }
    q = String(q || '').trim();
    if (q.length < 3) return json(400, { ok: false, error: 'q fehlt' });

    try {
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=' + encodeURIComponent(q);
        var res = await fetch(url, {
            headers: {
                // Nominatim verlangt einen identifizierenden User-Agent.
                'User-Agent': 'kiekmolin/1.0 (+https://kiekmolin.de)',
                'Accept': 'application/json'
            }
        });
        if (!res.ok) return json(200, { ok: false });
        var data = await res.json();
        if (data && data[0] && data[0].lat && data[0].lon) {
            return json(200, { ok: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        }
        return json(200, { ok: false });
    } catch (e) {
        return json(200, { ok: false, error: e.message });
    }
};
