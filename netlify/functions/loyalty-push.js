// Kiek mol in — Stempelkarten-Push für Re-Engagement
//
// Läuft als Netlify Scheduled Function (siehe netlify.toml).
// Prüfe Stempelkarten-Status und schickt smart Push-Notifications:
//   - Stempel 9/10  -> "Nur noch 1 bis zur Gratis-Belohnung!"
//   - Stempel 10/10 -> "Deine Belohnung wartet — jetzt einlösen!"
//   - 2 Tage inaktiv + min. 3 Stempel -> "Lust auf was Leckeres?"
//   - 7 Tage inaktiv + min. 3 Stempel -> "Wir vermissen dich!"
//
// Spam-Schutz: letzter_push darf nicht jünger als 5 Tage sein.
//
// SEIT 21.10.2026 aus der Tabelle stempelkarten (datenbank/46). Vorher
// loyalty_stamps, die der Browser selbst beschrieb -- und die Erinnerung
// versprach ein Gratis-Essen, das man nirgends einloesen konnte. Ziel und
// Belohnung kommen jetzt vom Lokal (stempel_ziel, stempel_belohnung).
//
// ALLE Kandidaten, seitenweise: vorher holte die Abfrage ohne Reihenfolge
// immer dieselben ersten 200 Zeilen -- wer keine Nachricht bekam, blieb
// vorne stehen, und alle dahinter kamen nie dran.
//
// ENV-Vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

'use strict';

const webpush = require('web-push');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
// OHNE die Ersatz-Adresse lief diese Function nie: SUPABASE_URL steht bei
// Netlify nicht in den Umgebungsvariablen (gemessen 14.10.2026), und die
// Pruefung "ENV fehlt" brach jeden Lauf mit 500 ab -- 29.968 Mal in
// sieben Tagen, kein einziger Push an einen Wirt. Dieselbe Zeile wie in
// mahnung.js, lib/alarm.js, lib/zahlsperre.js. tests/supabase-adresse-test.js.
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

function decideMessage(row, restName, haus) {
  // row: { stempel, guthaben, gesamt, letzte_bestellung } aus stempelkarten
  haus = haus || {};
  const ziel = haus.stempel_ziel || 10;
  const belohnung = haus.stempel_belohnung || 'eine Belohnung';
  const stampsInCard = row.stempel || 0;
  const hasFree = (row.guthaben || 0) > 0;
  const hoursSinceLastOrder = row.letzte_bestellung
    ? (Date.now() - new Date(row.letzte_bestellung).getTime()) / 3600000
    : Infinity;
  row.stamps_count = row.gesamt || 0;

  // Prio 1: Gratis-Belohnung wartet
  if (hasFree) {
    return {
      title: '🎁 Deine Belohnung wartet!',
      body: 'Bei ' + restName + ' wartet ' + belohnung + ' auf dich. Beim nächsten Bestellen im Warenkorb einlösen.',
      tag: 'loyalty-free-' + row.restaurant_id
    };
  }

  // Prio 2: 9/10 — nur noch 1
  if (stampsInCard === ziel - 1) {
    return {
      title: '🍕 Nur noch 1 bis zur Belohnung',
      body: 'Eine Bestellung mehr bei ' + restName + ' und du bekommst ' + belohnung + '!',
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
  // 200 statt 500: bei 500 haelt Netlify den Lauf fuer misslungen und
  // startet ihn neu (siehe CLAUDE.md, Wache) -- am fehlenden Schluessel
  // aendert das nichts. Der Fehler steht im Protokoll.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[loyalty-push] missing ENV');
    return { statusCode: 200, body: 'missing env' };
  }

  // Ruhezeiten respektieren
  if (inQuietHours()) {
    console.log('[loyalty-push] quiet hours — skipping');
    return { statusCode: 200, body: 'quiet hours' };
  }

  try {
    // Alle Stempel-Einträge holen die noch keinen Push hatten oder >5 Tage her
    const cutoff = new Date(Date.now() - MIN_PUSH_GAP_DAYS * 24 * 3600 * 1000).toISOString();
    let rows = [];
    for (let seite = 0; seite < 20; seite++) {
      const teil = await sbGet(
        'stempelkarten?or=(letzter_push.is.null,letzter_push.lt.' + encodeURIComponent(cutoff) + ')&gesamt=gt.0' +
        '&select=telefon,restaurant_id,stempel,guthaben,gesamt,letzte_bestellung' +
        '&order=restaurant_id.asc,telefon.asc&limit=500&offset=' + (seite * 500)
      );
      rows = rows.concat(teil);
      if (teil.length < 500) break;
    }
    if (!rows.length) {
      return { statusCode: 200, body: 'no candidates' };
    }

    // Lokale: Name, Ziel, Belohnung -- und nur die mit eingeschalteter Karte
    const restIds = Array.from(new Set(rows.map(r => r.restaurant_id).filter(Boolean)));
    const restList = restIds.length
      ? await sbGet('restaurants?id=in.(' + restIds.map(encodeURIComponent).join(',') + ')&select=id,name,features,stempel_ziel,stempel_belohnung')
      : [];
    const nameById = {}, hausById = {};
    restList.forEach(r => { nameById[r.id] = r.name; if (JSON.stringify(r.features || []).indexOf('loyalty_points') >= 0) hausById[r.id] = r; });

    // Geraete mit Zustimmung (datenbank/43), Nummer vereinheitlicht wie
    // kmi_tel() in datenbank/46 -- "0491 123" und "+49 491 123" sind derselbe Gast.
    const tel = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0049')) d = '0' + d.slice(4); else if (d.startsWith('49') && d.length >= 10) d = '0' + d.slice(2); return d; };
    let alleSubs;
    try {
      alleSubs = await sbGet('push_subscriptions?customer_phone=not.is.null&angebote=eq.true&select=endpoint,p256dh_key,auth_key,id,customer_phone&limit=5000');
    } catch (e) {
      if (/-> 400/.test(e.message)) { console.warn('[loyalty-push] Spalte angebote fehlt (datenbank/43) -- keine Werbe-Push.'); return { statusCode: 200, body: 'angebote fehlt' }; }
      throw e;
    }
    const subsByTel = {};
    alleSubs.forEach(s => { const k = tel(s.customer_phone); (subsByTel[k] = subsByTel[k] || []).push(s); });

    let sent = 0, skipped = 0;

    for (const row of rows) {
      if (!hausById[row.restaurant_id]) { skipped++; continue; }   // Karte im Lokal aus
      const msg = decideMessage(row, nameById[row.restaurant_id] || 'deinem Restaurant', hausById[row.restaurant_id]);
      if (!msg) { skipped++; continue; }

      const subs = subsByTel[row.telefon] || [];
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
          'stempelkarten?telefon=eq.' + encodeURIComponent(row.telefon) +
          '&restaurant_id=eq.' + encodeURIComponent(row.restaurant_id),
          { letzter_push: new Date().toISOString() }
        );
      } catch (e) {
        console.warn('[loyalty-push] PATCH last_push_at failed:', e.message);
      }

      sent += ok > 0 ? 1 : 0;
      console.log('[loyalty-push]', msg.tag, '->', row.telefon.slice(-4), 'devices:', ok, '/', subs.length);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ candidates: rows.length, sent: sent, skipped: skipped })
    };
  } catch (err) {
    console.error('[loyalty-push] fatal:', err && err.stack ? err.stack : err);
    return { statusCode: 200, body: 'fehler: ' + (err.message || 'error') };
  }
};
