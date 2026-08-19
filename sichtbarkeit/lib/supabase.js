'use strict';

// Read-only-Zugriff auf die Kiek-mol-in-Datenbank ueber die Supabase-REST-API.
// GOLDENE REGEL: Dieses Projekt LIEST nur. Es gibt hier bewusst keine
// Funktionen fuer INSERT/UPDATE/DELETE.

// Der anon-Key ist public-safe (steht auch in build-seo-pages.js und in der
// App selbst). Ueber .env laesst er sich trotzdem austauschen.
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

async function supabaseGet(pfadMitQuery) {
  const { url, key } = konfig();
  const antwort = await fetch(url + '/rest/v1/' + pfadMitQuery, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(15000)
  });
  if (!antwort.ok) {
    throw new Error('Supabase-Fehler ' + antwort.status + ' bei ' + pfadMitQuery);
  }
  return antwort.json();
}

// Alle aktiven Betriebe
async function alleRestaurants() {
  return supabaseGet('restaurants?or=(is_active.eq.true,is_active.is.null)&select=*&order=name');
}

// Einen Betrieb per ID, Slug ODER Namens-Teil finden
async function findeRestaurant(suchbegriff) {
  if (/^[0-9a-f-]{36}$/i.test(String(suchbegriff))) {
    const treffer = await supabaseGet('restaurants?id=eq.' + suchbegriff + '&select=*');
    return treffer[0] || null;
  }
  const alle = await alleRestaurants();
  const s = String(suchbegriff).toLowerCase();
  return (
    alle.find((r) => (r.slug || '').toLowerCase() === s) ||
    alle.find((r) => (r.name || '').toLowerCase() === s) ||
    alle.find((r) => (r.name || '').toLowerCase().includes(s)) ||
    null
  );
}

// Speisekarte eines Betriebs (nur verfuegbare Artikel, mit Kategorie-Namen).
// Selbstheilend: Fehlt in der Datenbank eine optionale Spalte oder die
// Kategorien-Verknuepfung, lehnt PostgREST die GANZE Abfrage mit 400 ab -
// dann probieren wir schlankere Varianten, statt leer auszugehen.
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

// --- Telefon-Retter-Ergebnisse (Quelle 'telefon') - weiterhin NUR lesen -------

// Telefon-Reservierungen eines Zeitraums (bisDatum exklusiv)
async function telefonReservierungen(restaurantId, vonDatum, bisDatum) {
  return supabaseGet(
    'reservations?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&source=eq.telefon' +
    '&reservation_date=gte.' + encodeURIComponent(vonDatum) +
    '&reservation_date=lt.' + encodeURIComponent(bisDatum) +
    '&status=in.(confirmed,pending)' +
    '&select=party_size,status,guest_name,notes'
  );
}

// Telefon-Bestellungen eines Zeitraums (bisDatum exklusiv, nach created_at)
async function telefonBestellungen(restaurantId, vonDatum, bisDatum) {
  return supabaseGet(
    'orders?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&source=eq.telefon' +
    '&created_at=gte.' + encodeURIComponent(vonDatum) +
    '&created_at=lt.' + encodeURIComponent(bisDatum) +
    '&select=total,status,items'
  );
}

// --- Gaeste-Historie fuer die Rueckgewinnung (weiterhin NUR lesen) ----------
// Alle Reservierungen bzw. Bestellungen eines Zeitraums MIT Kontaktdaten.
// Wird nur fuer die Rueckgewinnungs-Liste im Browser genutzt und NICHT
// gespeichert - die Daten gehoeren dem Wirt, nicht der Agentur.
async function gaesteReservierungen(restaurantId, abDatum) {
  return supabaseGet(
    'reservations?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&reservation_date=gte.' + encodeURIComponent(abDatum) +
    '&status=in.(confirmed,completed)' +
    '&select=guest_name,guest_phone,reservation_date,party_size' +
    '&order=reservation_date.desc'
  );
}

async function gaesteBestellungen(restaurantId, abDatum) {
  return supabaseGet(
    'orders?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&created_at=gte.' + encodeURIComponent(abDatum) +
    '&status=not.eq.cancelled' +
    '&select=customer_name,customer_phone,created_at,total' +
    '&order=created_at.desc'
  );
}

// --- Gaeste-Ursprung: alle Vorgaenge eines Zeitraums MIT Quelle --------
// Zeigt, welcher Anteil ueber die Agentur-Bausteine reinkommt.
// Selbstheilend: Fehlt die Spalte 'source', antwortet PostgREST mit 400 -
// dann fragen wir ohne sie und alles landet ehrlich unter "ohne Quelle".
async function mitFallback(basis, mitQuelle, ohneQuelle) {
  try {
    return await supabaseGet(basis + mitQuelle);
  } catch (e) {
    if (!/ 400 /.test(e.message)) throw e;
    return supabaseGet(basis + ohneQuelle);
  }
}

async function herkunftReservierungen(restaurantId, vonDatum, bisDatum) {
  const basis = 'reservations?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&reservation_date=gte.' + encodeURIComponent(vonDatum) +
    '&reservation_date=lt.' + encodeURIComponent(bisDatum) +
    '&status=in.(confirmed,completed,pending)';
  return mitFallback(basis, '&select=source,party_size', '&select=party_size');
}

async function herkunftBestellungen(restaurantId, vonDatum, bisDatum) {
  const basis = 'orders?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&created_at=gte.' + encodeURIComponent(vonDatum) +
    '&created_at=lt.' + encodeURIComponent(bisDatum) +
    '&status=not.eq.cancelled';
  return mitFallback(basis, '&select=source,total', '&select=total');
}

// --- Speisekarten-Doktor: bestellte Artikel eines Zeitraums -----------
// Nur die Positionen, nicht die Gaeste-Daten - mehr braucht die Analyse
// nicht. Weiterhin ausschliesslich lesend.
async function bestellArtikel(restaurantId, abDatum) {
  return supabaseGet(
    'orders?restaurant_id=eq.' + encodeURIComponent(restaurantId) +
    '&created_at=gte.' + encodeURIComponent(abDatum) +
    '&status=not.eq.cancelled' +
    '&select=items,created_at'
  );
}

module.exports = {
  schluesselRolle,
  alleRestaurants, findeRestaurant, speisekarte, bestellArtikel,
  telefonReservierungen, telefonBestellungen,
  gaesteReservierungen, gaesteBestellungen,
  herkunftReservierungen, herkunftBestellungen
};
