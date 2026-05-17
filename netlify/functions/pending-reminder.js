// Kiek mol in — Erinnerungs-Push fuer ueberfaellige Pending-Bestellungen/Reservierungen
//
// Laeuft als Netlify Scheduled Function alle 10 Minuten (siehe netlify.toml).
// Schickt Web Push an alle Gastronomen-Devices wenn:
//   - Bestellung Status 'received' oder 'pending' und > 30 Min alt und reminder_sent_at NULL
//   - Reservierung Status 'pending' und > 30 Min alt und reminder_sent_at NULL
// Markiert dann reminder_sent_at = jetzt, damit nicht doppelt gesendet wird.
//
// ENV-Vars noetig: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

'use strict';

const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

const STALE_MINUTES = 30;   // ab wann eine Pending-Sache als ueberfaellig gilt

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
  if (!res.ok) throw new Error('Supabase GET ' + path + ' -> ' + res.status);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Supabase PATCH ' + path + ' -> ' + res.status + ': ' + t.slice(0, 200));
  }
  return res.json();
}

async function pushToSubscription(sub, payload) {
  const pushSub = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
  };
  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, statusCode: err.statusCode, message: err.message };
  }
}

async function handleItem(kind, item, restaurantNameById) {
  // kind: 'order' | 'reservation'
  const restId = item.restaurant_id;
  if (!restId) return;

  // Push-Subscriptions des Restaurants laden (alle Geraete der Gastronomen)
  const subs = await sbGet('push_subscriptions?restaurant_id=eq.' + encodeURIComponent(restId) + '&select=endpoint,p256dh_key,auth_key,id');
  if (!subs || !subs.length) {
    console.log('[reminder] no subs for restaurant', restId, '- skipping', kind, item.id);
    // trotzdem reminder_sent_at setzen, um nicht jede 10 Min neu zu versuchen
    await sbPatch((kind === 'order' ? 'orders' : 'reservations') + '?id=eq.' + item.id, { reminder_sent_at: new Date().toISOString() });
    return;
  }

  const restName = restaurantNameById[restId] || 'dein Restaurant';
  let title, body;
  if (kind === 'order') {
    title = '🍽 Neue Bestellung wartet';
    body = restName + ': Eine Bestellung von ' + (item.customer_name || 'Kunde') + ' wartet seit ' + STALE_MINUTES + ' Min. auf Bestaetigung.';
  } else {
    var when = (item.reservation_date || '') + ' ' + (item.reservation_time || '');
    title = '📅 Reservierung wartet auf Bestaetigung';
    body = restName + ': Reservierung von ' + (item.guest_name || 'Gast') + ' (' + when.trim() + ', ' + (item.party_size || '?') + ' Pers.) wartet seit ' + STALE_MINUTES + ' Min.';
  }

  const payload = {
    title: title,
    body: body,
    icon: '/kiek-logo.png',
    badge: '/kiek-logo.png',
    tag: 'pending-' + kind + '-' + item.id,
    requireInteraction: true,
    data: { type: kind, id: item.id, restaurantId: restId, url: '/' }
  };

  const results = await Promise.all(subs.map(s => pushToSubscription(s, payload)));
  const successful = results.filter(r => r.ok).length;
  console.log('[reminder]', kind, item.id, 'sent to', successful, '/', subs.length, 'devices');

  // Stale-Subscriptions entfernen (HTTP 404/410 = nicht mehr gueltig)
  for (let i = 0; i < results.length; i++) {
    if (!results[i].ok && (results[i].statusCode === 404 || results[i].statusCode === 410)) {
      try {
        await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + subs[i].id, { method: 'DELETE', headers: sbHeaders() });
      } catch (e) {}
    }
  }

  // reminder_sent_at setzen → nicht nochmal pingen
  await sbPatch((kind === 'order' ? 'orders' : 'reservations') + '?id=eq.' + item.id, { reminder_sent_at: new Date().toISOString() });
}

exports.handler = async function() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[reminder] Missing ENV vars. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE.');
    return { statusCode: 500, body: 'missing env' };
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  try {
    // Pending Orders (received/pending, aelter als 30 Min, noch kein Reminder)
    const orders = await sbGet(
      'orders?status=in.(received,pending)' +
      '&created_at=lt.' + encodeURIComponent(cutoff) +
      '&reminder_sent_at=is.null' +
      '&select=id,restaurant_id,customer_name,created_at' +
      '&limit=50'
    );
    // Pending Reservations
    const reservations = await sbGet(
      'reservations?status=eq.pending' +
      '&created_at=lt.' + encodeURIComponent(cutoff) +
      '&reminder_sent_at=is.null' +
      '&select=id,restaurant_id,guest_name,reservation_date,reservation_time,party_size,created_at' +
      '&limit=50'
    );

    console.log('[reminder] stale orders:', orders.length, '· stale reservations:', reservations.length);

    if (orders.length === 0 && reservations.length === 0) {
      return { statusCode: 200, body: 'no stale items' };
    }

    // Restaurant-Namen sammeln fuer Push-Body
    const restIds = Array.from(new Set([
      ...orders.map(o => o.restaurant_id),
      ...reservations.map(r => r.restaurant_id)
    ].filter(Boolean)));

    let nameById = {};
    if (restIds.length) {
      const ids = restIds.map(encodeURIComponent).join(',');
      const restList = await sbGet('restaurants?id=in.(' + ids + ')&select=id,name');
      restList.forEach(r => { nameById[r.id] = r.name; });
    }

    for (const o of orders) {
      try { await handleItem('order', o, nameById); }
      catch (e) { console.error('[reminder] order', o.id, 'failed:', e.message); }
    }
    for (const r of reservations) {
      try { await handleItem('reservation', r, nameById); }
      catch (e) { console.error('[reminder] reservation', r.id, 'failed:', e.message); }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ orders: orders.length, reservations: reservations.length })
    };
  } catch (err) {
    console.error('[reminder] fatal:', err && err.stack ? err.stack : err);
    return { statusCode: 500, body: err.message || 'error' };
  }
};
