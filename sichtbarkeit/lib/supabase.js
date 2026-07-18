'use strict';

// Read-only-Zugriff auf die Kiek-mol-in-Datenbank ueber die Supabase-REST-API.
// GOLDENE REGEL: Dieses Projekt LIEST nur. Es gibt hier bewusst keine
// Funktionen fuer INSERT/UPDATE/DELETE.

// Der anon-Key ist public-safe (steht auch in build-seo-pages.js und in der
// App selbst). Ueber .env laesst er sich trotzdem austauschen.
const STANDARD_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co';
const STANDARD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';

function konfig() {
  return {
    url: process.env.SUPABASE_URL || STANDARD_URL,
    key: process.env.SUPABASE_ANON_KEY || STANDARD_KEY
  };
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

module.exports = {
  alleRestaurants, findeRestaurant, speisekarte,
  telefonReservierungen, telefonBestellungen
};
