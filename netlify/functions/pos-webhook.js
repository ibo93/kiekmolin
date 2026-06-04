// The Chef – POS-Webhook. Kassensysteme (oder Zapier/Make) pushen
// Verkaufs-/Umsatz-Events hierhin; wir speichern sie pro Token (Gastronom)
// in der Supabase-Tabelle chef_pos_events. Das Frontend pollt sie und
// bucht den Umsatz in Echtzeit.
//
// POST /.netlify/functions/pos-webhook?token=<dein-token>
// Body (JSON): { type: "sale" | "stock" | "test", data: { umsatz?, items?, ... } }

var https = require('https');
var http = require('http');
var url = require('url');

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function httpRequest(method, targetUrl, headers, body) {
  return new Promise(function (resolve, reject) {
    var parsed = url.parse(targetUrl);
    var lib = parsed.protocol === 'http:' ? http : https;
    var opts = { method: method, hostname: parsed.hostname, port: parsed.port, path: parsed.path, headers: headers || {} };
    var req = lib.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Supabase nicht konfiguriert' }) };

  var qs = event.queryStringParameters || {};
  var token = String(qs.token || '').trim();
  if (!token || token.length < 16) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'token fehlt oder zu kurz' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON' }) }; }

  var type = String(body.type || 'sale').slice(0, 24);
  var data = (body.data && typeof body.data === 'object') ? body.data : {};

  var row = { token: token, type: type, data: data };

  try {
    var r = await httpRequest('POST', SUPABASE_URL + '/rest/v1/chef_pos_events', {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }, JSON.stringify([row]));
    if (r.status >= 200 && r.status < 300) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
    }
    console.error('pos-webhook supabase error:', r.status, r.body.slice(0, 200));
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Speichern fehlgeschlagen' }) };
  } catch (err) {
    console.error('pos-webhook error:', err && err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Serverfehler' }) };
  }
};
