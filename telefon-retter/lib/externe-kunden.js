'use strict';

// Betriebe OHNE Kiek mol in einlesen.
//
// Ein Wirt mit eigener Webseite legt seine Daten in einer einfachen Datei ab
// (telefon-retter/kunden/<name>.json) - auf Deutsch, ohne Datenbank-Kauderwelsch:
//
//   {
//     "name": "Pizzeria Bella Vista",
//     "stadt": "Emden",
//     "adresse": "Neutorstrasse 12",
//     "telefon": "04921 123456",
//     "oeffnet": "17:00",
//     "schliesst": "22:00",
//     "tische": 12,
//     "liefergebuehr": 2.50,
//     "melden": { "sms": "+4915112345678", "email": "wirt@bella-vista.de" },
//     "speisekarte": [
//       { "name": "Pizza Margherita", "preis": 8.50, "kategorie": "Pizza",
//         "beschreibung": "Tomate, Mozzarella, Basilikum" }
//     ]
//   }
//
// Daraus wird intern dieselbe Form gebaut, die auch aus Kiek mol in kommt -
// der Dialog merkt keinen Unterschied und muss nichts wissen.

const fs = require('fs');
const path = require('path');

function slugAus(pfad, daten) {
  if (daten && daten.slug) return String(daten.slug);
  return path.basename(String(pfad), '.json').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function zahlOderNull(wert) {
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

// Eine Speisekarten-Zeile in die interne Form bringen
function gerichtUmbauen(g) {
  if (!g) return null;
  const name = String(g.name || g.gericht || '').trim();
  if (!name) return null;
  const preis = zahlOderNull(g.preis != null ? g.preis : g.base_price);
  return {
    name,
    description: String(g.beschreibung || g.description || '').trim() || null,
    base_price: preis,
    is_popular: !!(g.beliebt || g.is_popular),
    menu_categories: g.kategorie || g.categorie ? { name: String(g.kategorie || g.categorie) } : null
  };
}

// Liest eine Kundendatei und liefert { restaurant, menue, kunde }.
// Wirft mit klarer Meldung, wenn etwas Wichtiges fehlt - lieber beim Start
// laut scheitern als im Anruf stillschweigend falsche Auskunft geben.
function ladeExternenKunden(pfad, basisOrdner) {
  const voll = path.isAbsolute(pfad) ? pfad : path.join(basisOrdner || path.join(__dirname, '..'), pfad);
  if (!fs.existsSync(voll)) throw new Error('Kundendatei nicht gefunden: ' + voll);

  let daten;
  try {
    daten = JSON.parse(fs.readFileSync(voll, 'utf8'));
  } catch (e) {
    throw new Error('Kundendatei ' + path.basename(voll) + ' ist kein gueltiges JSON: ' + e.message);
  }
  const name = String(daten.name || '').trim();
  if (!name) throw new Error('Kundendatei ' + path.basename(voll) + ': "name" fehlt');

  const slug = slugAus(voll, daten);
  const restaurant = {
    // Die ID ist hier der Slug - sie taucht nur intern und in der Ablage auf
    id: slug,
    slug,
    name,
    city: String(daten.stadt || daten.city || '').trim() || null,
    address: String(daten.adresse || daten.address || '').trim() || null,
    zip: String(daten.plz || daten.zip || '').trim() || null,
    phone: String(daten.telefon || daten.phone || '').trim() || null,
    description: String(daten.beschreibung || daten.description || '').trim() || null,
    opening_time: String(daten.oeffnet || daten.opening_time || '').trim() || null,
    closing_time: String(daten.schliesst || daten.closing_time || '').trim() || null,
    delivery_fee: zahlOderNull(daten.liefergebuehr != null ? daten.liefergebuehr : daten.delivery_fee),
    // Keine Mittagspause annehmen, wenn nichts dasteht
    opening_hours: { pause_enabled: !!daten.pause },
    /* Ruhetage durchreichen. Ohne das kennt die Verfuegbarkeitspruefung sie
       nicht und gibt einen Tisch frei, an dem geschlossen ist. */
    ruhetage: Array.isArray(daten.ruhetage) ? daten.ruhetage : []
  };

  const menue = (Array.isArray(daten.speisekarte) ? daten.speisekarte : [])
    .map(gerichtUmbauen)
    .filter(Boolean);

  const melden = daten.melden || {};
  const kunde = {
    slug,
    name,
    tische: zahlOderNull(daten.tische),
    melden: {
      sms: String(melden.sms || melden.handy || '').trim() || null,
      email: String(melden.email || melden.mail || '').trim() || null
    },
    webseite: String(daten.webseite || daten.website || '').trim() || null
  };

  return { restaurant, menue, kunde };
}

module.exports = { ladeExternenKunden, gerichtUmbauen };
