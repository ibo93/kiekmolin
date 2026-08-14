'use strict';

// Mandantenfaehigkeit: EIN Server bedient ALLE Restaurants.
// Die angerufene Twilio-Nummer ("To") entscheidet, welches Restaurant
// gemeint ist. Die Zuordnung pflegst du in telefon-retter/nummern.json:
//
//   {
//     "+4949261234567": "888dc5bc-1649-4762-a8ee-2eb1e5e1dfad",
//
//     "+4949317654321": {
//       "restaurant": "andere-restaurant-id",
//       "stimme": "MGG5Irb57ATHvyIeTEYo",   // eigene Stimme fuer DIESEN Wirt
//       "stufe": 2                           // eigene Ausbaustufe
//     }
//   }
//
// Die kurze Schreibweise (nur die ID) bleibt gueltig - dann gelten Stimme
// und Stufe aus der .env. Gibt es keine nummern.json (oder die Nummer steht
// nicht drin), gilt das Standard-Restaurant aus der .env.
//
// Warum eigene Stimmen: Zwei Wirte im selben Ort wollen nicht dieselbe
// Telefonstimme. Und im Verkaufsgespraech ist "Ihre eigene Stimme, passend
// zu Ihrem Haus" ein Argument, das nichts extra kostet.

const fs = require('fs');
const path = require('path');

// Liest nummern.json und liefert BEIDES: die Nummern-Zuordnung und die
// Einstellungen je Restaurant.
function ladeKunden(basisOrdner) {
  const leer = { zuordnung: {}, einstellungen: {} };
  const pfad = path.join(basisOrdner || path.join(__dirname, '..'), 'nummern.json');
  if (!fs.existsSync(pfad)) return leer;
  let roh;
  try {
    roh = JSON.parse(fs.readFileSync(pfad, 'utf8'));
  } catch (e) {
    console.warn('nummern.json unlesbar (' + e.message + ') - nutze nur das Standard-Restaurant');
    return leer;
  }

  const zuordnung = {};
  const einstellungen = {};
  for (const [nummer, wert] of Object.entries(roh)) {
    if (String(nummer).startsWith('_')) continue; // _kommentar-Felder erlauben
    // Kurzform: "nummer": "restaurant-id"
    // Langform: "nummer": { restaurant, stimme, stufe }
    const istObjekt = wert && typeof wert === 'object' && !Array.isArray(wert);
    const id = String(istObjekt ? (wert.restaurant || wert.restaurant_id || '') : wert).trim();
    if (!id) {
      console.warn('nummern.json: Eintrag "' + nummer + '" hat keine Restaurant-ID - uebersprungen');
      continue;
    }
    zuordnung[normalisiereNummer(nummer)] = id;
    if (istObjekt) {
      const e = {};
      if (wert.stimme) e.stimme = String(wert.stimme).trim();
      const stufe = parseInt(wert.stufe, 10);
      if (stufe >= 1 && stufe <= 3) e.stufe = stufe;
      if (Object.keys(e).length) einstellungen[id] = e;
    }
  }
  return { zuordnung, einstellungen };
}

// Nur die Nummern-Zuordnung (bestehende Aufrufer bleiben unveraendert)
function ladeNummernZuordnung(basisOrdner) {
  return ladeKunden(basisOrdner).zuordnung;
}

function normalisiereNummer(nummer) {
  return String(nummer || '').replace(/[^0-9+]/g, '');
}

// Welches Restaurant ist gemeint? (angerufene Nummer -> ID, sonst Standard)
function restaurantFuerNummer(zuordnung, angerufeneNummer, standardId) {
  const treffer = zuordnung[normalisiereNummer(angerufeneNummer)];
  return treffer || standardId || null;
}

module.exports = { ladeKunden, ladeNummernZuordnung, restaurantFuerNummer, normalisiereNummer };
