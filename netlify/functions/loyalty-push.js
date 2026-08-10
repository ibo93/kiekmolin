// Kiek mol in — Stempelkarten-Push für Re-Engagement
//
// Läuft als Netlify Scheduled Function (siehe netlify.toml).
// Prüfe Stempelkarten-Status und schickt smart Push-Notifications:
//   - Stempel 9/10  -> "Nur noch 1 bis zur Gratis-Belohnung!"
//   - Stempel 10/10 -> "Deine Belohnung wartet — jetzt einlösen!"
//   - 2 Tage inaktiv + min. 3 Stempel -> "Lust auf was Leckeres?"
//   - 7 Tage inaktiv + min. 3 Stempel -> "Wir vermissen dich!"
//
// Spam-Schutz: last_push_at darf nicht jünger als 5 Tage sein.
//
// ENV-Vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

'use strict';

const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

const MIN_PUSH_GAP_DAYS = 5;       // Mindest-Abstand zwischen Pushes
const INACTIVE_HOURS_NUDGE = 48;   // 2 Tage
const INACTIVE_HOURS_MISS = 168;   // 7 Tage
const MIN_STAMPS_FOR_NUDGE = 3;    // erst ab 3 Stempeln nudgen
const QUIET_HOURS_START = 22;      // ab 22:00 keine Pushes
const QUIET_HOURS_END = 10;        // bis 10:00 keine Pushes

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
  if (!res.ok) throw new Error('GET ' + path + ' -> ' + res.status);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('PATCH ' + path + ' -> ' + res.status + ': ' + t.slice(0, 200));
  }
  return res.json();
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
  // Berliner Zeit, nicht UTC (Lambda läuft mit TZ=UTC). Sonst feuerte der
  // 4-Stunden-Cron im Sommer ausgerechnet um 22:00 deutscher Zeit -- also in
  // der Stunde, die eigentlich gesperrt sein sollte.
  const h = parseInt(new Date().toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false
  }), 10);
  if (QUIET_HOURS_START <= QUIET_HOURS_END) {
    return h >= QUIET_HOURS_START && h < QUIET_HOURS_END;
  }
  return h >= QUIET_HOURS_START || h < QUIET_HOURS_END;
}

function decideMessage(row, restName) {
  // row: { stamps_count, free_meals_earned, free_meals_used, last_order_at, last_push_at }
  const stampsInCard = row.stamps_count % 10;  // 0-9
  const hasFree = (row.free_meals_earned || 0) > (row.free_meals_used || 0);
  const hoursSinceLastOrder = row.last_order_at
    ? (Date.now() - new Date(row.last_order_at).getTime()) / 3600000
    : Infinity;

  // Prio 1: Gratis-Belohnung wartet
  if (hasFree) {
    return {
      title: '🎁 Deine Belohnung wartet!',
      body: 'Bei ' + restName + ' hast du eine Gratis-Mahlzeit gut. Jetzt einlösen!',
      tag: 'loyalty-free-' + row.restaurant_id
    };
  }

  // Prio 2: 9/10 — nur noch 1
  if (stampsInCard === 9) {
    return {
      title: '🍕 Nur noch 1 bis zur Belohnung',
      body: 'Eine Bestellung mehr bei ' + restName + ' und du bekommst eine Gratis-Mahlzeit!',
      tag: 'loyalty-almost-' + row.restaurant_id
    };
  }

  // Prio 3: 7 Tage inaktiv (mit min Stempeln)
  if (hoursSinceLastOrder >= INACTIVE_HOURS_MISS && row.stamps_count >= MIN_STAMPS_FOR_NUDGE) {
    return {
      title: '🥺 Wir vermissen dich!',
      body: 'Lange nicht mehr bei ' + restName + ' bestellt. Schau mal vorbei — deine Stempel warten.',
      tag: 'loyalty-miss-' + row.restaurant_id
    };
  }

  // Prio 4: 2 Tage inaktiv (mit min Stempeln)
  if (hoursSinceLastOrder >= INACTIVE_HOURS_NUDGE && row.stamps_count >= MIN_STAMPS_FOR_NUDGE) {
    return {
      title: '🍽 Hunger?',
      body: 'Heute schon was geplant? Bei ' + restName + ' gibt es was Leckeres.',
      tag: 'loyalty-nudge-' + row.restaurant_id
    };
  }

  return null;
}

exports.handler = async function() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[loyalty-push] missing ENV');
    return { statusCode: 500, body: 'missing env' };
  }

  // Ruhezeiten respektieren
  if (inQuietHours()) {
    console.log('[loyalty-push] quiet hours — skipping');
    return { statusCode: 200, body: 'quiet hours' };
  }

  try {
    // Alle Stempel-Einträge holen die noch keinen Push hatten oder >5 Tage her
    const cutoff = new Date(Date.now() - MIN_PUSH_GAP_DAYS * 24 * 3600 * 1000).toISOString();
    const rows = await sbGet(
      'loyalty_stamps?or=(last_push_at.is.null,last_push_at.lt.' + encodeURIComponent(cutoff) + ')' +
      '&select=customer_phone,restaurant_id,stamps_count,free_meals_earned,free_meals_used,last_order_at,last_push_at' +
      '&limit=200'
    );
    if (!rows.length) {
      return { statusCode: 200, body: 'no candidates' };
    }

    // Restaurant-Namen sammeln
    const restIds = Array.from(new Set(rows.map(r => r.restaurant_id).filter(Boolean)));
    const restList = restIds.length
      ? await sbGet('restaurants?id=in.(' + restIds.map(encodeURIComponent).join(',') + ')&select=id,name')
      : [];
    const nameById = {};
    restList.forEach(r => { nameById[r.id] = r.name; });

    let sent = 0, skipped = 0;

    for (const row of rows) {
      const msg = decideMessage(row, nameById[row.restaurant_id] || 'deinem Restaurant');
      if (!msg) { skipped++; continue; }

      // Subscriptions des Kunden holen (Kunden-Subs haben restaurant_id = NULL,
      // Match via customer_phone)
      let subs;
      try {
        subs = await sbGet(
          'push_subscriptions?customer_phone=eq.' + encodeURIComponent(row.customer_phone) +
          '&select=endpoint,p256dh_key,auth_key,id'
        );
      } catch (e) {
        console.warn('[loyalty-push] subs lookup failed for', row.customer_phone, e.message);
        continue;
      }
      if (!subs || !subs.length) { skipped++; continue; }

      const payload = {
        title: msg.title,
        body: msg.body,
        icon: '/kiek-logo.png',
        badge: '/kiek-logo.png',
        tag: msg.tag,
        requireInteraction: false,
        data: { type: 'loyalty', restaurantId: row.restaurant_id, url: '/?r=' + row.restaurant_id }
      };

      const results = await Promise.all(subs.map(s => pushTo(s, payload)));
      const ok = results.filter(r => r.ok).length;

      // Stale Subs entfernen
      for (let i = 0; i < results.length; i++) {
        if (!results[i].ok && (results[i].statusCode === 404 || results[i].statusCode === 410)) {
          try {
            await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + subs[i].id, { method: 'DELETE', headers: sbHeaders() });
          } catch (e) {}
        }
      }

      // last_push_at setzen
      try {
        await sbPatch(
          'loyalty_stamps?customer_phone=eq.' + encodeURIComponent(row.customer_phone) +
          '&restaurant_id=eq.' + encodeURIComponent(row.restaurant_id),
          { last_push_at: new Date().toISOString() }
        );
      } catch (e) {
        console.warn('[loyalty-push] PATCH last_push_at failed:', e.message);
      }

      sent += ok > 0 ? 1 : 0;
      console.log('[loyalty-push]', msg.tag, '->', row.customer_phone.slice(-4), 'devices:', ok, '/', subs.length);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ candidates: rows.length, sent: sent, skipped: skipped })
    };
  } catch (err) {
    console.error('[loyalty-push] fatal:', err && err.stack ? err.stack : err);
    return { statusCode: 500, body: err.message || 'error' };
  }
};
