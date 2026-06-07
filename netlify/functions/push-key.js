// Liefert den öffentlichen VAPID-Key ans Frontend (für pushManager.subscribe).
// Der private Key bleibt serverseitig.

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  var key = process.env.VAPID_PUBLIC || '';
  if (!key) return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'VAPID_PUBLIC nicht gesetzt' }) };
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ key: key }) };
};
