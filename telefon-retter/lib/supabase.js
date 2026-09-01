'use strict';

// Zugriff auf die Kiek-mol-in-Datenbank ueber die Supabase-REST-API.
//
// GOLDENE REGEL: Der Kiek-mol-in-Code wird nicht angefasst. Dieses Projekt
// redet NUR ueber die API mit der bestehenden Datenbank und nutzt dieselben
// Tabellen/Felder wie die Online-Reservierung und -Bestellung.
//
// Der anon-Key ist public-safe (steht auch in der App selbst und in
// build-seo-pages.js). Ueber .env laesst er sich austauschen.

const STANDARD_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co';
const STANDARD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';


// WELCHER SCHLUESSEL -- und warum das ab jetzt zaehlt
// ---------------------------------------------------
// Bisher lief hier der anon-Key. Der ist public-safe, das stimmt -- aber
// er ist nur so viel wert, wie die Datenbank ihm erlaubt. Solange die
// RLS-Regeln offen standen, kam dieses Projekt damit ueberall hin.
//
// Genau das wird gerade zugemacht. Nach dem Zumachen von orders und
// reservations liefert der anon-Key hier leere Listen -- keinen Fehler,
// LEERE LISTEN. Ein Bericht saehe dann aus wie "der Betrieb hatte diesen
// Monat keine einzige Bestellung". Das ist die schlimmste Sorte Fehler:
// er sieht aus wie ein Ergebnis.
//
// Dieses Projekt laeuft auf einem Server, nicht im Browser. Es hat keine
// Sitzung und kann auch keine haben -- es arbeitet ja nicht fuer einen
// angemeldeten Menschen, sondern fuer die Agentur. Der richtige Schluessel
// dafuer ist der Dienstschluessel (service role).
//
// Der geht an RLS vorbei und gehoert deshalb NIEMALS in etwas, das ein
// Browser laedt. Er steht in .env (gitignored) und nirgendwo sonst.
// Fehlt er, faellt alles auf den anon-Key zurueck -- dann laeuft es wie
// bisher, bis die Regeln zugehen.
function konfig() {
  return {
    url: process.env.SUPABASE_URL || STANDARD_URL,
    // SUPABASE_SERVICE_KEY zuerst: so heisst er in allen 21 Netlify-Functions
    // dieses Projekts. Zwei Namen fuer denselben Schluessel waeren die Sorte
    // Stolperstein, ueber die man genau einmal faellt -- und dann sucht man
    // eine Stunde, warum die Zahlen leer bleiben.
    // SUPABASE_SERVICE_ROLE_KEY heisst er in Supabases eigener Doku, deshalb
    // gilt er auch.
    key: process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || STANDARD_KEY
  };
}

// Fuer den Selbsttest: laeuft dieses Projekt gerade mit dem Dienstschluessel
// oder noch mit dem oeffentlichen? Liest die Rolle aus dem Token selbst,
// statt sie zu raten.
function schluesselRolle() {
  try {
    const teil = String(konfig().key).split('.')[1];
    if (!teil) return 'unbekannt';
    const nutz = JSON.parse(Buffer.from(teil, 'base64').toString('utf8'));
    return nutz.role || 'unbekannt';
  } catch (_e) {
    return 'unbekannt';
  }
}

function headers() {
  const { key } = konfig();
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
}

async function supabaseGet(pfadMitQuery) {
  const { url } = konfig();
  const antwort = await fetch(url + '/rest/v1/' + pfadMitQuery, { headers: headers() });
  if (!antwort.ok) throw new Error('Supabase-Fehler ' + antwort.status + ' bei ' + pfadMitQuery);
  return antwort.json();
}

// Selbst-heilender Insert - GLEICHES Muster wie in der App (index.html):
// Fehlt eine Spalte in der Tabelle, lehnt PostgREST den ganzen Datensatz ab.
// Wir lesen den Spaltennamen aus der Fehlermeldung, lassen die Spalte weg
// und versuchen erneut. So bleibt z.B. das Feld 'source' optional.
async function resilienterInsert(tabelle, payload) {
  const { url } = konfig();
  const body = Object.assign({}, payload);
  let letzterStatus = 0;
  let letzterText = '';
  for (let versuch = 0; versuch < 18; versuch++) {
    const antwort = await fetch(url + '/rest/v1/' + tabelle, {
      method: 'POST',
      headers: Object.assign({ Prefer: 'return=representation' }, headers()),
      body: JSON.stringify(body)
    });
    if (antwort.ok) {
      let daten = null;
      try { daten = await antwort.json(); } catch (_e) { /* leer ist ok */ }
      return { ok: true, daten: Array.isArray(daten) ? daten[0] : daten };
    }
    letzterStatus = antwort.status;
    try { letzterText = await antwort.text(); } catch (_e) { letzterText = ''; }
    const m = letzterText.match(/Could not find the '([^']+)'/) ||
      letzterText.match(/'([^']+)' column/) ||
      letzterText.match(/column "?([a-zA-Z_]+)"? .*does not exist/i);
    if (antwort.status === 400 && m && m[1] && Object.prototype.hasOwnProperty.call(body, m[1])) {
      delete body[m[1]];
      continue;
    }
    break;
  }
  return { ok: false, status: letzterStatus, text: letzterText };
}

// --- Lesen ---------------------------------------------------------------------
async function findeRestaurant(idOderName) {
  if (/^[0-9a-f-]{36}$/i.test(String(idOderName))) {
    const treffer = await supabaseGet('restaurants?id=eq.' + idOderName + '&select=*');
    return treffer[0] || null;
  }
  const alle = await supabaseGet('restaurants?or=(is_active.eq.true,is_active.is.null)&select=*&order=name');
  const s = String(idOderName).toLowerCase();
  return (
    alle.find((r) => (r.slug || '').toLowerCase() === s) ||
    alle.find((r) => (r.name || '').toLowerCase() === s) ||
    alle.find((r) => (r.name || '').toLowerCase().includes(s)) ||
    null
  );
}

// Speisekarte - selbstheilend wie in sichtbarkeit/lib/supabase.js:
// fehlt eine optionale Spalte oder die Kategorien-Verknuepfung (400),
// werden schlankere Select-Varianten probiert.
const SPEISEKARTE_SELECTS = [
  'name,description,base_price,price,is_popular,menu_categories(name)',
  'name,description,base_price,is_popular,menu_categories(name)',
  'name,description,base_price,price,is_popular',
  'name,description,base_price,is_popular',
  'name,description,base_price',
  'name,base_price'
];

async function speisekarte(restaurantId) {
  let letzterFehler = null;
  for (const auswahl of SPEISEKARTE_SELECTS) {
    try {
      return await supabaseGet(
        'menu_items?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
        '&is_available=eq.true' +
        '&select=' + auswahl +
        '&order=sort_order'
      );
    } catch (e) {
      letzterFehler = e;
      if (!/ 400 /.test(e.message)) throw e; // echte Fehler nicht verschlucken
    }
  }
  throw letzterFehler;
}

// Reservierungen eines Tages - GLEICHE Status-Menge wie die Online-Pruefung
// (confirmed, pending, blocked), damit Telefon und App dieselbe Wahrheit sehen.
async function reservierungenAm(restaurantId, datum) {
  return supabaseGet(
    'reservations?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&reservation_date=eq.' + encodeURIComponent(datum) +
    '&status=in.(confirmed,pending,blocked)' +
    '&select=reservation_time,status,table_id,party_size'
  );
}

// Bestaetigte Reservierungen eines Tages MIT Kontaktdaten - nur fuer die
// SMS-Erinnerung (No-Show-Schutz). Rueckruf-Fallback-Eintraege bleiben
// draussen (guest_name-Markierung).
/* Was wir ueber diesen Anrufer wissen. Nicht um ihn zu durchleuchten,
   sondern damit der Assistent ihn beim Namen nennen kann und nicht zum
   zwoelften Mal fragt, wie er heisst.

   Die Nummer liegt beim Anruf ohnehin vor, die Reservierungen gehoeren dem
   Wirt. Gelesen wird nur, was fuer dieses Gespraech gebraucht wird: Name,
   Anzahl der Besuche, uebliche Personenzahl. Keine Speisen, keine Betraege,
   nichts aus anderen Betrieben. */
async function gastHistorie(restaurantId, telefon) {
  const nummer = String(telefon || '').replace(/[^0-9+]/g, '');
  if (!nummer || !restaurantId) return null;

  /* Die Nummer steht mal als +49491..., mal als 0491... in der Datenbank.
     Beide Schreibweisen abfragen, sonst erkennt man denselben Gast nicht. */
  const varianten = [nummer];
  if (nummer.startsWith('+49')) varianten.push('0' + nummer.slice(3));
  else if (nummer.startsWith('0')) varianten.push('+49' + nummer.slice(1));

  const filter = 'guest_phone=in.(' + varianten.map((v) => '"' + v + '"').join(',') + ')';
  const zeilen = await supabaseGet(
    'reservations?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&' + filter +
    '&select=guest_name,party_size,reservation_date,status' +
    '&order=reservation_date.desc&limit=20'
  );
  if (!Array.isArray(zeilen) || !zeilen.length) return null;

  /* Abgesagte zaehlen nicht als Besuch - sonst begruesst der Assistent
     jemanden als Stammgast, der dreimal abgesagt hat. */
  const echte = zeilen.filter((z) => z.status !== 'cancelled');
  if (!echte.length) return null;

  const zahlen = echte.map((z) => parseInt(z.party_size, 10)).filter(Boolean);
  const haeufigste = zahlen.length
    ? Number(Object.entries(zahlen.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {}))
        .sort((a, b) => b[1] - a[1])[0][0])
    : null;

  return {
    name: (echte.find((z) => z.guest_name) || {}).guest_name || '',
    besuche: echte.length,
    zuletzt: echte[0].reservation_date || '',
    uebliche_personenzahl: haeufigste
  };
}

async function reservierungenFuerErinnerung(restaurantId, datum) {
  return supabaseGet(
    'reservations?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&reservation_date=eq.' + encodeURIComponent(datum) +
    '&status=eq.confirmed' +
    '&select=id,guest_name,guest_phone,reservation_time,party_size'
  );
}

async function anzahlAktiveTische(restaurantId) {
  const tische = await supabaseGet(
    'restaurant_tables?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&is_active=eq.true&select=id'
  );
  return Array.isArray(tische) ? tische.length : 0;
}

// --- Schreiben (nur reservations / orders / order_items - wie online) -----------
async function neueReservierung(payload) {
  return resilienterInsert('reservations', payload);
}

async function neueBestellung(payload) {
  return resilienterInsert('orders', payload);
}

async function neuerBestellArtikel(payload) {
  return resilienterInsert('order_items', payload);
}

// --- Rueckruf-Wuensche (fuer die Agentur-App) ------------------------------------
// Offene Rueckrufe aus der eigenen callbacks-Tabelle PLUS die Fallback-Eintraege,
// die als pending-Reservierung mit RUECKRUF-Markierung gespeichert wurden.
async function offeneRueckrufe() {
  let callbacks = [];
  try {
    callbacks = (await supabaseGet('callbacks?status=eq.open&select=*&order=created_at.desc')).map((c) => ({
      id: c.id, quelle: 'callbacks', restaurant_id: c.restaurant_id,
      name: c.name || '', telefon: c.phone || '', anliegen: c.topic || '', zeit: c.created_at || null
    }));
  } catch (_e) { /* Tabelle gibt es evtl. (noch) nicht - dann nur der Fallback */ }

  let fallback = [];
  try {
    fallback = (await supabaseGet(
      'reservations?source=eq.telefon&status=eq.pending&guest_name=like.*RUECKRUF*&select=id,restaurant_id,guest_name,guest_phone,notes,created_at&order=created_at.desc'
    )).map((r) => ({
      id: r.id, quelle: 'reservations', restaurant_id: r.restaurant_id,
      name: String(r.guest_name || '').replace(/\s*\(RUECKRUF\)\s*/, ''),
      telefon: r.guest_phone || '',
      anliegen: String(r.notes || '').replace(/^\[RUECKRUF ERBETEN\]\s*/, ''),
      zeit: r.created_at || null
    }));
  } catch (_e) { /* dann eben nur callbacks */ }

  return callbacks.concat(fallback);
}

// Rueckruf als erledigt markieren. NUR fuer die eigene callbacks-Tabelle -
// Fallback-Eintraege in reservations verwaltet der Wirt in seinem Dashboard.
async function rueckrufErledigt(id) {
  const { url } = konfig();
  const antwort = await fetch(url + '/rest/v1/callbacks?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ status: 'done' })
  });
  return { ok: antwort.ok, status: antwort.status };
}

module.exports = {
  schluesselRolle,
  findeRestaurant, speisekarte, reservierungenAm, anzahlAktiveTische,
  reservierungenFuerErinnerung, gastHistorie,
  neueReservierung, neueBestellung, neuerBestellArtikel, resilienterInsert,
  offeneRueckrufe, rueckrufErledigt
};
