// Serverseitiges Geocoding (OpenStreetMap/Nominatim). Zuverlässiger als direkt
// aus dem Browser (kein CORS/Service-Worker/Netzwerk-Block). Wird vom Menü-/
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

    // 1. Versuch: Nominatim (OpenStreetMap)
    try {
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=' + encodeURIComponent(q);
        var res = await fetch(url, {
            headers: {
                // Nominatim verlangt einen identifizierenden User-Agent.
                'User-Agent': 'kiekmolin/1.0 (+https://kiekmolin.de)',
                'Accept': 'application/json'
            }
        });
        if (res.ok) {
            var data = await res.json();
            if (data && data[0] && data[0].lat && data[0].lon) {
                return json(200, { ok: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), source: 'nominatim' });
            }
        }
    } catch (e) {}

    // 2. Versuch: Photon (komoot) -- Nominatim blockiert Anfragen von
    // Cloud-/Server-IPs gelegentlich komplett; Photon ist da toleranter.
    try {
        var purl = 'https://photon.komoot.io/api/?limit=1&lang=de&q=' + encodeURIComponent(q);
        var pres = await fetch(purl, { headers: { 'Accept': 'application/json' } });
        if (pres.ok) {
            var pj = await pres.json();
            var f = pj && pj.features && pj.features[0];
            var cc = f && f.properties && f.properties.countrycode;
            if (f && f.geometry && Array.isArray(f.geometry.coordinates) && (!cc || cc === 'DE')) {
                return json(200, { ok: true, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], source: 'photon' });
            }
        }
    } catch (e) {}

    return json(200, { ok: false });
};
