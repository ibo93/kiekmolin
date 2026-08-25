// Kiek mol in — Push an den Wirt, wenn etwas hereinkommt.
//
// Läuft als Netlify Scheduled Function JEDE MINUTE (siehe netlify.toml).
//
// ZWEI STUFEN
//   1. SOFORT   -- alles Offene, das noch nicht gemeldet wurde
//                  (push_sent_at ist leer). Kein Mindestalter.
//   2. ERINNERN -- was nach 20 Minuten immer noch offen ist
//                  (reminder_sent_at ist leer).
//
//
// WARUM DAS UMGEBAUT WURDE
// ------------------------
// Diese Datei war eine reine MAHNUNG: sie meldete sich erst, wenn etwas
// 20 Minuten lang unbeantwortet lag, und lief nur alle 10 Minuten. Eine
// Reservierung um 21 Uhr erreichte den Wirt also fruehestens um 21:20 --
// und nur, wenn er bis dahin nicht reagiert hatte.
//
// Eine Meldung BEIM EINGANG gab es nirgends. Weder reservation-save
// noch order-save schicken einen Push; die Reservierung des Gastes
// entsteht ohnehin direkt aus dem Browser heraus. Im Dashboard sah der
// Wirt sie sofort (Echtzeit-Kanal) -- aber nur, solange das Dashboard
// offen war. Zu Hause auf dem Sofa kam nichts an.
//
// Der Betreiber dazu: "wenn eine bestellung oder resevierung reinkommt
// soll der gastronomen auch das als benachrichtigung auf sein handy
// bekommen ... wenn abends oder morgens eine resevierung reinkommt kann
// er so bestaetigen ... von zuhause".
//
//
// WARUM NICHT DIREKT AUS order-save / reservation-save
// ----------------------------------------------------
// Das waere null Sekunden statt hoechstens sechzig. Aber es waere auch
// derselbe Push-Code an drei Stellen -- und Reservierungen legt der
// Browser direkt in der Datenbank an, da gibt es gar keine Function,
// in die man ihn haengen koennte. Ein Weg, eine Stelle zum Suchen,
// wenn etwas klemmt.
//
//
// WAS DAS NICHT LOEST: IPHONE
// ---------------------------
// Auf dem iPhone kommen Web-Pushs NUR an, wenn die Seite ueber "Zum
// Home-Bildschirm" als App installiert ist (seit iOS 16.4). Im
// Safari-Tab passiert nichts -- kein Fehler, keine Meldung, es kommt
// einfach nie etwas. Das ist der haeufigste Grund fuer "geht bei mir
// nicht". Die App weist im Dashboard darauf hin.
//
// ENV-Vars nötig: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT

'use strict';

const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

const STALE_MINUTES = 20;   // ab wann eine Pending-Sache als ueberfaellig gilt

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

// GERAETE DES SUPERADMINS.
//
// Er hat keinen eigenen Betrieb -- restaurant_id ist bei ihm NULL --
// und wuerde von der Suche nach restaurant_id nie gefunden. Er will
// aber alles mitbekommen: "für mich wäre es auch gut ... damit ich es
// alles verfolgen kann".
//
// Wer Superadmin ist, entscheidet die Datenbank, nicht der Browser. Die
// App speichert beim Anmelden nur die E-Mail mit; hier wird sie gegen
// customers geprueft. Ein Haekchen "ich bin Admin" aus dem Browser
// waere zu leicht zu faelschen -- der oeffentliche Schluessel steht im
// Seitenquelltext.
//
// Einmal pro Durchlauf geholt, nicht einmal pro Meldung.
let _adminGeraete = null;
async function adminGeraete() {
  if (_adminGeraete) return _adminGeraete;
  _adminGeraete = [];
  try {
    const admins = await sbGet('customers?role=eq.superadmin&select=email');
    const mails = (admins || []).map(a => a && a.email).filter(Boolean);
    if (!mails.length) return _adminGeraete;
    const liste = mails.map(m => '"' + String(m).replace(/"/g, '') + '"').join(',');
    _adminGeraete = await sbGet('push_subscriptions?customer_email=in.(' + encodeURIComponent(liste) +
      ')&select=endpoint,p256dh_key,auth_key,id') || [];
  } catch (e) {
    console.error('[melder] Admin-Geraete nicht ladbar:', e.message);
    _adminGeraete = [];
  }
  return _adminGeraete;
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

// stufe: 'sofort' (etwas ist hereingekommen) oder 'erinnerung' (liegt
// seit 20 Minuten unbeantwortet).
async function handleItem(kind, item, restaurantNameById, stufe) {
  // kind: 'order' | 'reservation'

  // DIE PROBE DER WACHE IST KEINE RESERVIERUNG.
  // gastweg-wache.js legt alle 15 Minuten eine an und loescht sie
  // sofort wieder. Zwischen Anlegen und Loeschen liegen Millisekunden --
  // aber wenn dieser Melder ausgerechnet dazwischen laeuft, bekaeme der
  // Wirt eine Meldung ueber einen Gast, den es nie gab. Ein Waechter,
  // der falschen Alarm ausloest, wird nach der dritten Nacht
  // abgeschaltet, und dann ueberwacht gar nichts mehr.
  if (String(item.guest_name || '').indexOf('[Probe]') === 0) return;

  const restId = item.restaurant_id;
  if (!restId) return;
  const tabelle = (kind === 'order' ? 'orders' : 'reservations');
  const spalte = (stufe === 'sofort' ? 'push_sent_at' : 'reminder_sent_at');
  const jetzt = new Date().toISOString();

  // Push-Subscriptions des Restaurants laden (alle Geräte der Gastronomen)
  const eigene = await sbGet('push_subscriptions?restaurant_id=eq.' + encodeURIComponent(restId) + '&select=endpoint,p256dh_key,auth_key,id') || [];
  const admins = await adminGeraete();
  // Zusammenlegen, aber kein Geraet doppelt: ist der Superadmin
  // zugleich Wirt dieses Hauses, stuende es sonst in beiden Listen und
  // sein Handy klingelte zweimal fuer dieselbe Sache.
  const gesehen = {};
  const subs = eigene.concat(admins).filter(function (x) {
    if (!x || !x.endpoint || gesehen[x.endpoint]) return false;
    gesehen[x.endpoint] = true;
    return true;
  });
  if (!subs.length) {
    console.log('[melder] keine Geraete fuer Betrieb', restId, '- uebersprungen:', kind, item.id);
    // Trotzdem abhaken -- sonst versucht es die Funktion jede Minute neu.
    // Meldet sich der Wirt spaeter mit einem Geraet an, bekommt er die
    // alten Sachen nicht nachtraeglich; er sieht sie im Dashboard.
    await sbPatch(tabelle + '?id=eq.' + item.id, { [spalte]: jetzt });
    return;
  }

  const restName = restaurantNameById[restId] || 'dein Restaurant';
  const zeitStr = (item.reservation_time || '').slice(0, 5);
  let title, body;
  if (stufe === 'sofort') {
    if (kind === 'order') {
      title = '🍽 Neue Bestellung';
      body = restName + ': ' + (item.customer_name || 'Ein Kunde') + ' hat bestellt. Zum Bestaetigen antippen.';
    } else {
      let datumStr = String(item.reservation_date || '');
      try {
        const d = new Date(datumStr + 'T12:00:00');
        if (!isNaN(d.getTime())) datumStr = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      } catch (e) {}
      title = '📅 Neue Reservierung';
      body = restName + ': ' + (item.guest_name || 'Ein Gast') + ', ' + datumStr
           + (zeitStr ? ' um ' + zeitStr + ' Uhr' : '') + ', ' + (item.party_size || '?')
           + ' Pers. Zum Bestaetigen antippen.';
    }
  } else if (kind === 'order') {
    title = '🍽 Bestellung wartet noch';
    body = restName + ': Eine Bestellung von ' + (item.customer_name || 'Kunde') + ' wartet seit ' + STALE_MINUTES + ' Min. auf Bestaetigung.';
  } else {
    var when = (item.reservation_date || '') + ' ' + zeitStr;
    title = '📅 Reservierung wartet noch';
    body = restName + ': Reservierung von ' + (item.guest_name || 'Gast') + ' (' + when.trim() + ', ' + (item.party_size || '?') + ' Pers.) wartet seit ' + STALE_MINUTES + ' Min.';
  }

  // URL für Klick aus der Notification (öffnet passenden Dashboard-Tab)
  const targetUrl = kind === 'order' ? '/?adminTab=orders' : '/?adminTab=reservations';
  const payload = {
    title: title,
    body: body,
    icon: '/kiek-logo.png',
    badge: '/kiek-logo.png',
    // Eigener Kennzeichner je Stufe -- sonst ersetzt die Erinnerung die
    // Sofortmeldung auf dem Sperrbildschirm, und der Wirt haelt sie fuer
    // dieselbe Sache, die er schon gesehen hat.
    tag: stufe + '-' + kind + '-' + item.id,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 300],
    data: {
      type: kind,
      orderId: kind === 'order' ? item.id : null,
      reservationId: kind === 'reservation' ? item.id : null,
      restaurantId: restId,
      url: targetUrl
    }
  };

  const results = await Promise.all(subs.map(s => pushToSubscription(s, payload)));
  const successful = results.filter(r => r.ok).length;
  console.log('[melder]', stufe, kind, item.id, '->', successful, 'von', subs.length, 'Geraeten');

  // Stale-Subscriptions entfernen (HTTP 404/410 = nicht mehr gültig)
  for (let i = 0; i < results.length; i++) {
    if (!results[i].ok && (results[i].statusCode === 404 || results[i].statusCode === 410)) {
      try {
        await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + subs[i].id, { method: 'DELETE', headers: sbHeaders() });
      } catch (e) {}
    }
  }

  // Abhaken -- nicht nochmal melden
  await sbPatch(tabelle + '?id=eq.' + item.id, { [spalte]: jetzt });
}

// NEUE GASTRONOM-ANMELDUNG -- geht nur an den Superadmin.
//
// Eine Anmeldung landete bisher stumm in der Datenbank. Sichtbar war
// sie nur im Verwaltungsbereich unter "offene Anmeldungen", und die
// Liste sieht man nur, wenn man hinschaut. Wer sich nachts anmeldet,
// liegt bis zum naechsten Blick.
//
// Kein eigener Betrieb, also auch keine Wirte-Geraete: das hier geht
// ausschliesslich an die Geraete des Superadmins.
async function meldeAnmeldung(zeile) {
  const subs = await adminGeraete();
  const jetzt = new Date().toISOString();
  if (!subs.length) {
    await sbPatch('customers?id=eq.' + zeile.id, { gemeldet_at: jetzt });
    return;
  }
  const payload = {
    title: '🏠 Neue Gastronom-Anmeldung',
    body: (zeile.name || 'Ein Betrieb') + (zeile.email ? ' (' + zeile.email + ')' : '')
        + ' möchte mitmachen. Zum Freischalten antippen.',
    icon: '/kiek-logo.png',
    badge: '/kiek-logo.png',
    tag: 'anmeldung-' + zeile.id,
    requireInteraction: true,
    vibrate: [300, 120, 300],
    data: { type: 'gastro_registration', customerId: zeile.id, url: '/?adminTab=customers' }
  };
  const ergebnisse = await Promise.all(subs.map(s => pushToSubscription(s, payload)));
  console.log('[melder] anmeldung', zeile.id, '->',
              ergebnisse.filter(r => r.ok).length, 'von', subs.length, 'Geraeten');
  await sbPatch('customers?id=eq.' + zeile.id, { gemeldet_at: jetzt });
}

exports.handler = async function() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('[melder] ENV-Variablen fehlen. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE.');
    return { statusCode: 500, body: 'missing env' };
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  // Was in beiden Stufen gebraucht wird.
  const FELDER_BESTELLUNG   = 'id,restaurant_id,customer_name,created_at';
  const FELDER_RESERVIERUNG = 'id,restaurant_id,guest_name,reservation_date,reservation_time,party_size,created_at';

  try {
    // ---- STUFE 1: SOFORT ----------------------------------------
    // Alles Offene, das noch nicht gemeldet wurde. Kein Mindestalter --
    // genau das ist der Unterschied zu vorher.
    const neueBestellungen = await sbGet(
      'orders?status=in.(received,pending)' +
      '&push_sent_at=is.null' +
      '&select=' + FELDER_BESTELLUNG +
      '&limit=50'
    );
    const neueReservierungen = await sbGet(
      'reservations?status=eq.pending' +
      '&push_sent_at=is.null' +
      '&select=' + FELDER_RESERVIERUNG +
      '&limit=50'
    );

    // ---- STUFE 2: ERINNERUNG ------------------------------------
    const alteBestellungen = await sbGet(
      'orders?status=in.(received,pending)' +
      '&created_at=lt.' + encodeURIComponent(cutoff) +
      '&reminder_sent_at=is.null' +
      '&select=' + FELDER_BESTELLUNG +
      '&limit=50'
    );
    const alteReservierungen = await sbGet(
      'reservations?status=eq.pending' +
      '&created_at=lt.' + encodeURIComponent(cutoff) +
      '&reminder_sent_at=is.null' +
      '&select=' + FELDER_RESERVIERUNG +
      '&limit=50'
    );

    // ---- STUFE 3: NEUE GASTRONOM-ANMELDUNGEN --------------------
    let neueAnmeldungen = [];
    try {
      neueAnmeldungen = await sbGet(
        'customers?role=eq.restaurant' +
        '&is_active=eq.false' +
        '&gemeldet_at=is.null' +
        '&select=id,name,email,created_at' +
        '&limit=20'
      );
    } catch (e) {
      // Fehlt die Spalte noch (Schritt 15 nicht gelaufen), soll das den
      // Rest nicht aufhalten -- Bestellungen sind wichtiger.
      console.error('[melder] Anmeldungen nicht ladbar:', e.message);
    }

    const gesamt = neueBestellungen.length + neueReservierungen.length
                 + alteBestellungen.length + alteReservierungen.length
                 + neueAnmeldungen.length;
    if (gesamt === 0) return { statusCode: 200, body: 'nichts zu melden' };

    console.log('[melder] neu:', neueBestellungen.length, '/', neueReservierungen.length,
                '· ueberfaellig:', alteBestellungen.length, '/', alteReservierungen.length);

    // Restaurant-Namen sammeln fuer den Text der Meldung
    const restIds = Array.from(new Set([
      ...neueBestellungen.map(o => o.restaurant_id),
      ...neueReservierungen.map(r => r.restaurant_id),
      ...alteBestellungen.map(o => o.restaurant_id),
      ...alteReservierungen.map(r => r.restaurant_id)
    ].filter(Boolean)));

    let nameById = {};
    if (restIds.length) {
      const ids = restIds.map(encodeURIComponent).join(',');
      const restList = await sbGet('restaurants?id=in.(' + ids + ')&select=id,name');
      restList.forEach(r => { nameById[r.id] = r.name; });
    }

    // Ein Fehler bei einer Sache darf die anderen nicht aufhalten -- sonst
    // haengt eine kaputte Zeile die ganze Meldekette auf.
    async function alle(kind, liste, stufe) {
      for (const eintrag of liste) {
        try { await handleItem(kind, eintrag, nameById, stufe); }
        catch (e) { console.error('[melder]', stufe, kind, eintrag.id, 'fehlgeschlagen:', e.message); }
      }
    }

    // Sofortmeldungen zuerst -- die sind die dringenden.
    await alle('order', neueBestellungen, 'sofort');
    await alle('reservation', neueReservierungen, 'sofort');
    await alle('order', alteBestellungen, 'erinnerung');
    await alle('reservation', alteReservierungen, 'erinnerung');

    for (const a of neueAnmeldungen) {
      try { await meldeAnmeldung(a); }
      catch (e) { console.error('[melder] anmeldung', a.id, 'fehlgeschlagen:', e.message); }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        sofort:     { bestellungen: neueBestellungen.length, reservierungen: neueReservierungen.length },
        erinnerung: { bestellungen: alteBestellungen.length, reservierungen: alteReservierungen.length },
        anmeldungen: neueAnmeldungen.length
      })
    };
  } catch (err) {
    console.error('[melder] schwerer Fehler:', err && err.stack ? err.stack : err);
    return { statusCode: 500, body: err.message || 'error' };
  }
};
