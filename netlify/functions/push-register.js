// Speichert ein Push-Abo + die Erinnerungs-Zeiten eines Gastronomen.
// Upsert in die Tabelle chef_reminders (per Supabase Service-Key, umgeht RLS).
//
// Erwartet POST: { subscription:{endpoint, keys:{p256dh, auth}}, morning, evening, tz, on }

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

function hhmm(v, fallback) {
  var s = String(v == null ? '' : v).trim();
  return /^\d{1,2}:\d{2}$/.test(s) ? s : fallback;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Supabase nicht konfiguriert' }) };

  var body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ungültiges JSON' }) }; }

  var sub = body.subscription || {};
  var keys = sub.keys || {};
  if (!sub.endpoint || !keys.p256dh || !keys.auth) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'subscription unvollständig' }) };
  }

  var row = {
    endpoint: String(sub.endpoint),
    p256dh: String(keys.p256dh),
    auth: String(keys.auth),
    morning: hhmm(body.morning, '08:30'),
    evening: hhmm(body.evening, '21:00'),
    tz: String(body.tz || 'Europe/Berlin').slice(0, 60),
    reminders_on: body.on !== false,
    updated_at: new Date().toISOString()
  };

  try {
    var r = await httpRequest('POST', SUPABASE_URL + '/rest/v1/chef_reminders?on_conflict=endpoint', {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    }, JSON.stringify([row]));
    if (r.status >= 200 && r.status < 300) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
    }
    console.error('push-register supabase error:', r.status, r.body.slice(0, 200));
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Speichern fehlgeschlagen' }) };
  } catch (err) {
    console.error('push-register error:', err && err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Serverfehler' }) };
  }
};
