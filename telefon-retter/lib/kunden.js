'use strict';

// Mandantenfaehigkeit: EIN Server bedient ALLE Restaurants.
// Die angerufene Twilio-Nummer ("To") entscheidet, welches Restaurant
// gemeint ist. Die Zuordnung pflegst du in telefon-retter/nummern.json:
//
//   {
//     "+4949261234567": "888dc5bc-1649-4762-a8ee-2eb1e5e1dfad",
//     "+4949317654321": "andere-restaurant-id"
//   }
//
// Gibt es keine nummern.json (oder die Nummer steht nicht drin), gilt das
// Standard-Restaurant aus der .env (RESTAURANT_ID/RESTAURANT_NAME) -
// so laeuft der Ein-Kunden-Betrieb exakt wie bisher.

const fs = require('fs');
const path = require('path');

function ladeNummernZuordnung(basisOrdner) {
  const pfad = path.join(basisOrdner || path.join(__dirname, '..'), 'nummern.json');
  if (!fs.existsSync(pfad)) return {};
  try {
    const roh = JSON.parse(fs.readFileSync(pfad, 'utf8'));
    // Nummern normalisiert ablegen, damit "+49 4926 123" und "+494926123" matchen
    const sauber = {};
    for (const [nummer, restaurantId] of Object.entries(roh)) {
      if (String(nummer).startsWith('_')) continue; // _kommentar-Felder erlauben
      sauber[normalisiereNummer(nummer)] = String(restaurantId);
    }
    return sauber;
  } catch (e) {
    console.warn('nummern.json unlesbar (' + e.message + ') - nutze nur das Standard-Restaurant');
    return {};
  }
}

function normalisiereNummer(nummer) {
  return String(nummer || '').replace(/[^0-9+]/g, '');
}

// Welches Restaurant ist gemeint? (angerufene Nummer -> ID, sonst Standard)
function restaurantFuerNummer(zuordnung, angerufeneNummer, standardId) {
  const treffer = zuordnung[normalisiereNummer(angerufeneNummer)];
  return treffer || standardId || null;
}

module.exports = { ladeNummernZuordnung, restaurantFuerNummer, normalisiereNummer };
