// The Chef – POS-Events lesen. Frontend pollt seit "since" und bucht
// neue Verkaufs-Events. Zugriff per token (gleicher Token wie im Webhook).
//
// GET /.netlify/functions/pos-events?token=<token>&since=<iso-timestamp>
// Antwort: { events: [{ id, type, data, ts }] }

var https = require('https');
var http = require('http');
var url = require('url');

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Supabase nicht konfiguriert' }) };

  var qs = event.queryStringParameters || {};
  var token = String(qs.token || '').trim();
  if (!token || token.length < 16) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'token fehlt' }) };
  var since = String(qs.since || '1970-01-01T00:00:00Z');

  var endpoint = SUPABASE_URL + '/rest/v1/chef_pos_events'
    + '?token=eq.' + encodeURIComponent(token)
    + '&ts=gt.' + encodeURIComponent(since)
    + '&order=ts.asc&limit=100&select=id,type,data,ts';

  try {
    var r = await httpRequest('GET', endpoint, {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Accept': 'application/json'
    }, null);
    if (r.status >= 200 && r.status < 300) {
      var events = [];
      try { events = JSON.parse(r.body) || []; } catch (e) { events = []; }
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ events: events }) };
    }
    console.error('pos-events supabase error:', r.status, r.body.slice(0, 200));
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Lookup fehlgeschlagen' }) };
  } catch (err) {
    console.error('pos-events error:', err && err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Serverfehler' }) };
  }
};
