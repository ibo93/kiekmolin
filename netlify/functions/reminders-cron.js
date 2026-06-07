// Geplante Funktion (Netlify Scheduled Function): prüft alle paar Minuten,
// welche Gastronomen jetzt eine Erinnerung fällig haben, und schickt echten
// Web-Push – auch bei komplett geschlossener App.
// Zeitplan steht in netlify.toml ([functions."reminders-cron"] schedule).

var webpush = require('web-push');
var https = require('https');
var http = require('http');
var url = require('url');

var VAPID_PUBLIC = process.env.VAPID_PUBLIC;
var VAPID_PRIVATE = process.env.VAPID_PRIVATE;
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';
var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
  catch (e) { console.warn('VAPID setup failed:', e.message); }
}

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

function sbHeaders(extra) {
  var h = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

// Lokales Datum (YYYY-MM-DD) und Uhrzeit (HH:MM) in der Zeitzone der Reihe.
function localParts(tz) {
  try {
    var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    var p = {};
    fmt.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    var hour = p.hour === '24' ? '00' : p.hour;
    return { date: p.year + '-' + p.month + '-' + p.day, hm: hour + ':' + p.minute };
  } catch (e) {
    var d = new Date();
    return { date: d.toISOString().slice(0, 10), hm: String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') };
  }
}

function patchRow(endpoint, patch) {
  return httpRequest('PATCH', SUPABASE_URL + '/rest/v1/chef_reminders?endpoint=eq.' + encodeURIComponent(endpoint),
    sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }), JSON.stringify(patch)).catch(function () { return null; });
}

function deleteRow(endpoint) {
  return httpRequest('DELETE', SUPABASE_URL + '/rest/v1/chef_reminders?endpoint=eq.' + encodeURIComponent(endpoint),
    sbHeaders({ 'Prefer': 'return=minimal' }), null).catch(function () { return null; });
}

function sendPush(row, title, bodyText) {
  var subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
  var payload = JSON.stringify({ title: title, body: bodyText, url: '/', tag: 'chef-reminder', requireInteraction: false });
  return webpush.sendNotification(subscription, payload)
    .then(function () { return true; })
    .catch(function (err) {
      var sc = err && err.statusCode;
      if (sc === 404 || sc === 410) return deleteRow(row.endpoint).then(function () { return false; });
      console.warn('push failed (' + sc + ')');
      return false;
    });
}

exports.handler = async function () {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('reminders-cron: env vars fehlen');
    return { statusCode: 200, body: 'not configured' };
  }

  var rows = [];
  try {
    var r = await httpRequest('GET', SUPABASE_URL + '/rest/v1/chef_reminders?reminders_on=eq.true&select=*', sbHeaders({ 'Accept': 'application/json' }), null);
    if (r.status >= 200 && r.status < 300) rows = JSON.parse(r.body) || [];
  } catch (e) {
    console.warn('reminders-cron select failed:', e && e.message);
    return { statusCode: 200, body: 'select failed' };
  }

  var jobs = [];
  rows.forEach(function (row) {
    var lp = localParts(row.tz);
    if (row.morning && lp.hm >= row.morning && row.last_m !== lp.date) {
      jobs.push(sendPush(row, 'Guten Morgen, Chef!', 'HACCP-Temperaturen eintragen nicht vergessen.').then(function (ok) {
        if (ok) return patchRow(row.endpoint, { last_m: lp.date });
      }));
    }
    if (row.evening && lp.hm >= row.evening && row.last_e !== lp.date) {
      jobs.push(sendPush(row, 'Feierabend naht', 'Tagesabschluss machen & Beleg scannen?').then(function (ok) {
        if (ok) return patchRow(row.endpoint, { last_e: lp.date });
      }));
    }
  });

  try { await Promise.all(jobs); } catch (e) {}
  return { statusCode: 200, body: JSON.stringify({ checked: rows.length, fired: jobs.length }) };
};
