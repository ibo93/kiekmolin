// Kiek mol in — Bewertungs-Nachfass: "Hat's geschmeckt?"-Push nach der Bestellung
//
// Laeuft als Netlify Scheduled Function stuendlich (siehe netlify.toml).
// Findet Bestellungen, die vor 18-48 Stunden abgeschlossen wurden
// (delivered/picked_up, completed_at gesetzt) und schickt dem Kunden EINEN
// Push mit Deep-Link direkt ins Bewertungs-Modal des Restaurants
// (/?r=<restaurant>&review=1). Der Push kommt also erst am NAECHSTEN Tag.
//
// Spam-Schutz:
//   - pro Bestellung genau ein Push (orders.review_push_sent_at)
//   - pro Kunde+Restaurant hoechstens 1x im MONAT
//   - Ruhezeiten 22-10 Uhr wie loyalty-push
//
// EINMALIG in Supabase:
//   ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_push_sent_at timestamptz;
// (Fehlt die Spalte, beendet sich die Function sauber ohne Pushes -- kein Spam.)
//
// ENV-Vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

'use strict';

const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

// Bewusst zurueckhaltend: Der Nachfass kommt erst am NAECHSTEN Tag (nicht noch
// waehrend/kurz nach dem Essen) und pro Kunde+Restaurant hoechstens 1x im Monat.
// Zu fruehe/zu haeufige Bewertungs-Bitten nerven und schaden dem Restaurant.
const MIN_AGE_HOURS = 18;        // fruehestens ~naechster Tag (mit Ruhezeiten: mittags)
const MAX_AGE_HOURS = 48;        // spaetestens 2 Tage danach (sonst wirkt es seltsam)
const PER_CUSTOMER_GAP_DAYS = 30; // pro Kunde+Restaurant max. 1 Nachfass pro Monat
const QUIET_HOURS_START = 22;
const QUIET_HOURS_END = 10;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
  catch (e) { console.warn('VAPID setup failed:', e.message); }
}

function sbHeaders() {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

async function sbGet(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
  if (!res.ok) {
    const t = await res.text();
    const e = new Error('GET ' + path.split('?')[0] + ' -> ' + res.status);
    e.status = res.status; e.body = t;
    throw e;
  }
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(body)
  });
  return res.ok;
}

async function pushTo(sub, payload) {
  try {
    await webpush.sendNotification({
      endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
    }, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, statusCode: err.statusCode, message: err.message };
  }
}

function inQuietHours() {
  const h = new Date().getHours();
  if (QUIET_HOURS_START <= QUIET_HOURS_END) return h >= QUIET_HOURS_START && h < QUIET_HOURS_END;
  return h >= QUIET_HOURS_START || h < QUIET_HOURS_END;
}

exports.handler = async function () {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[review-push] missing ENV');
    return { statusCode: 500, body: 'missing env' };
  }
  if (inQuietHours()) return { statusCode: 200, body: 'quiet hours' };

  const now = Date.now();
  const minIso = new Date(now - MAX_AGE_HOURS * 3600000).toISOString();
  const maxIso = new Date(now - MIN_AGE_HOURS * 3600000).toISOString();

  let orders;
  try {
    orders = await sbGet(
      'orders?status=in.(delivered,picked_up)' +
      '&review_push_sent_at=is.null' +
      '&completed_at=gte.' + encodeURIComponent(minIso) +
      '&completed_at=lte.' + encodeURIComponent(maxIso) +
      '&customer_phone=not.is.null' +
      '&select=id,restaurant_id,restaurant_name,customer_phone,customer_name,order_number,completed_at' +
      '&order=completed_at.asc&limit=100'
    );
  } catch (e) {
    if (e.status === 400 && /review_push_sent_at|completed_at/.test(e.body || '')) {
      console.warn('[review-push] Spalte fehlt (review_push_sent_at?). Bitte einmalig anlegen. Kein Push verschickt.');
      return { statusCode: 200, body: 'column missing - skipped' };
    }
    throw e;
  }
  if (!orders.length) return { statusCode: 200, body: 'no candidates' };

  let sent = 0, skipped = 0;
  const cutoffGap = new Date(now - PER_CUSTOMER_GAP_DAYS * 24 * 3600000).toISOString();

  for (const o of orders) {
    // Spam-Schutz: gleicher Kunde + gleiches Restaurant schon in den letzten
    // 7 Tagen genachfasst? Dann diese Bestellung still als erledigt markieren.
    try {
      const recent = await sbGet(
        'orders?customer_phone=eq.' + encodeURIComponent(o.customer_phone) +
        '&restaurant_id=eq.' + encodeURIComponent(o.restaurant_id) +
        '&review_push_sent_at=gte.' + encodeURIComponent(cutoffGap) +
        '&select=id&limit=1'
      );
      if (recent.length) {
        await sbPatch('orders?id=eq.' + encodeURIComponent(o.id), { review_push_sent_at: new Date().toISOString() });
        skipped++;
        continue;
      }
    } catch (e) { /* Pruefung optional */ }

    // Kunden-Geraete (wie loyalty-push: Match ueber customer_phone)
    let subs;
    try {
      subs = await sbGet(
        'push_subscriptions?customer_phone=eq.' + encodeURIComponent(o.customer_phone) +
        '&select=endpoint,p256dh_key,auth_key,id'
      );
    } catch (e) { skipped++; continue; }

    // Erst markieren, dann senden -- verhindert Doppel-Pushes, falls die
    // Function abbricht. Kann nicht markiert werden, wird nicht gesendet.
    const marked = await sbPatch('orders?id=eq.' + encodeURIComponent(o.id), { review_push_sent_at: new Date().toISOString() });
    if (!marked) { skipped++; continue; }

    if (!subs || !subs.length) { skipped++; continue; }

    const restName = o.restaurant_name || 'deinem Restaurant';
    const payload = {
      title: '⭐ Wie war’s bei ' + restName + '?',
      body: 'Wenn du magst: Eine kurze Bewertung hilft dem Team riesig – dauert 30 Sekunden.',
      icon: '/kiek-logo.png',
      badge: '/kiek-logo.png',
      tag: 'review-ask-' + o.id,
      requireInteraction: false,
      data: { type: 'review_ask', restaurantId: o.restaurant_id, orderId: o.id, url: '/?r=' + encodeURIComponent(o.restaurant_id) + '&review=1' }
    };

    const results = await Promise.all(subs.map(s => pushTo(s, payload)));
    const ok = results.filter(r => r.ok).length;

    // Stale Subscriptions aufraeumen
    for (let i = 0; i < results.length; i++) {
      if (!results[i].ok && (results[i].statusCode === 404 || results[i].statusCode === 410)) {
        try {
          await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + subs[i].id, { method: 'DELETE', headers: sbHeaders() });
        } catch (e) {}
      }
    }

    sent += ok > 0 ? 1 : 0;
    console.log('[review-push] #' + (o.order_number || o.id) + ' ->', String(o.customer_phone).slice(-4), 'devices:', ok, '/', subs.length);
  }

  return { statusCode: 200, body: JSON.stringify({ candidates: orders.length, sent: sent, skipped: skipped }) };
};
