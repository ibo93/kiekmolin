'use strict';

// No-Show-Schutz: Gaeste mit Reservierung fuer MORGEN bekommen am
// Nachmittag eine freundliche Erinnerungs-SMS. Erinnerte Gaeste kommen -
// oder sagen rechtzeitig ab, sodass der Tisch neu vergeben werden kann.
// Beides ist bares Geld fuer den Wirt.
//
// Sicherheits-Regeln:
//   - Bewusst OPT-IN: laeuft NUR mit SMS_ERINNERUNG=1 (SMS kosten Geld).
//   - Jede Reservierung wird hoechstens EINMAL erinnert (logs/erinnerungen.jsonl,
//     dort steht nur die Reservierungs-ID - keine Telefonnummern, DSGVO).
//   - Ohne Twilio-Keys: sauber aus, ehrliche Meldung, kein Crash.

const fs = require('fs');
const path = require('path');
const { lokalesDatum } = require('./verfuegbarkeit');

const LOG_ORDNER = path.join(__dirname, '..', 'logs');
const STAND_DATEI = path.join(LOG_ORDNER, 'erinnerungen.jsonl');

function istAktiv() {
  return process.env.SMS_ERINNERUNG === '1';
}

function smsKonfiguriert() {
  // Auth Token ODER API Key - beides taugt fuer den SMS-Versand
  return !!(require('./twilio-auth').istKonfiguriert() && process.env.TWILIO_SMS_VON);
}

// Reine Auswahl-Logik (testbar): Welche Reservierungen von MORGEN sind
// faellig? Nur mit Telefonnummer, keine Rueckruf-Fallbacks, keine Doppelten.
function faelligeErinnerungen(reservierungen, bereitsErinnerteIds) {
  const schon = new Set(bereitsErinnerteIds || []);
  return (reservierungen || []).filter((r) =>
    r && r.id && !schon.has(String(r.id)) &&
    r.guest_phone && String(r.guest_phone).replace(/[^0-9]/g, '').length >= 6 &&
    !/RUECKRUF/.test(r.guest_name || '')
  );
}

// Kurzer, freundlicher SMS-Text (Sie-Form, mit Absage-Weg - das ist der
// eigentliche No-Show-Schutz: lieber eine Absage als ein leerer Tisch).
function baueErinnerungsText(restaurant, resi) {
  const zeit = String(resi.reservation_time || '').slice(0, 5);
  const name = String(resi.guest_name || '').split(' ')[0];
  return 'Moin' + (name ? ' ' + name : '') + '! Erinnerung: morgen um ' + zeit + ' Uhr ist Ihr Tisch fuer ' +
    (resi.party_size || 2) + ' bei ' + restaurant.name + ' reserviert. Wir freuen uns! ' +
    'Falls etwas dazwischenkommt, sagen Sie bitte kurz ab' +
    (restaurant.phone ? ': ' + restaurant.phone : '.') ;
}

async function sendeSms(an, text) {
  const twilioAuth = require('./twilio-auth');
  const sid = twilioAuth.kontoSid();
  const antwort = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: twilioAuth.authKopf(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: an, From: process.env.TWILIO_SMS_VON, Body: text }).toString()
  });
  if (!antwort.ok) throw new Error('Twilio-SMS ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
}

function liesErinnerteIds() {
  try {
    return fs.readFileSync(STAND_DATEI, 'utf8').split('\n').filter(Boolean)
      .map((z) => { try { return String(JSON.parse(z).reservierung_id); } catch (_e) { return null; } })
      .filter(Boolean);
  } catch (_e) { return []; }
}

function merkeErinnert(restaurantId, reservierungId) {
  try {
    fs.mkdirSync(LOG_ORDNER, { recursive: true });
    fs.appendFileSync(STAND_DATEI, JSON.stringify({
      zeit: new Date().toISOString(), restaurant_id: restaurantId, reservierung_id: String(reservierungId)
    }) + '\n');
  } catch (_e) { /* dann wird notfalls doppelt erinnert - besser als gar nicht */ }
}

// Der stuendliche Lauf (ruft server.js auf): ab ERINNERUNG_AB_STUNDE (15 Uhr)
// alle morgigen Reservierungen der betreuten Restaurants erinnern.
async function erinnerungsLauf(kontexte, datenquelle, log) {
  const melden = log || console.log;
  if (!istAktiv()) return;
  if (!smsKonfiguriert()) {
    melden('SMS-Erinnerung: SMS_ERINNERUNG=1 gesetzt, aber TWILIO_SMS_VON/SID/TOKEN fehlen - keine SMS.');
    return;
  }
  const abStunde = parseInt(process.env.ERINNERUNG_AB_STUNDE || '15', 10);
  if (new Date().getHours() < abStunde) return;

  const morgen = lokalesDatum(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const erinnert = liesErinnerteIds();
  for (const { restaurant } of kontexte.values()) {
    try {
      const alle = await datenquelle.reservierungenFuerErinnerung(restaurant.id, morgen);
      for (const resi of faelligeErinnerungen(alle, erinnert)) {
        await sendeSms(resi.guest_phone, baueErinnerungsText(restaurant, resi));
        merkeErinnert(restaurant.id, resi.id);
        melden('SMS-Erinnerung an Gast fuer morgen ' + String(resi.reservation_time).slice(0, 5) +
          ' Uhr (' + restaurant.name + ') gesendet');
      }
    } catch (e) {
      melden('SMS-Erinnerung fuer ' + restaurant.name + ' fehlgeschlagen: ' + e.message);
    }
  }
}

module.exports = { erinnerungsLauf, faelligeErinnerungen, baueErinnerungsText, istAktiv, smsKonfiguriert };
