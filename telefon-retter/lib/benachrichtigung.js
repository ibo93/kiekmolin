'use strict';

// Den Wirt erreichen - fuer Betriebe OHNE Kiek mol in.
//
// Bei Kiek-mol-in-Kunden landet die Reservierung in der App, die der Wirt
// sowieso offen hat. Ein Betrieb mit eigener Webseite hat das nicht: Wenn
// die Bestellung nur in einer Datei auf dem Server liegt, erfaehrt niemand
// davon - und der Gast wartet umsonst auf sein Essen.
//
// Deshalb geht jede Buchung SOFORT raus: per SMS (kommt auch an, wenn kein
// Rechner laeuft) und/oder per E-Mail. Beides ist optional; was nicht
// eingerichtet ist, wird uebersprungen und protokolliert.

async function smsAn(nummer, text) {
  const twilioAuth = require('./twilio-auth');
  const von = process.env.TWILIO_SMS_VON;
  if (!twilioAuth.istKonfiguriert() || !von) {
    return { ok: false, grund: 'SMS nicht eingerichtet (TWILIO_SMS_VON fehlt)' };
  }
  try {
    const antwort = await fetch(twilioAuth.kontoUrl('/Messages.json'), {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: twilioAuth.authKopf(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: nummer, From: von, Body: text }).toString()
    });
    if (!antwort.ok) return { ok: false, grund: 'Twilio ' + antwort.status };
    return { ok: true };
  } catch (e) {
    return { ok: false, grund: e.message };
  }
}

async function mailAn(adresse, betreff, text) {
  const key = process.env.RESEND_API_KEY;
  const von = process.env.EMAIL_FROM;
  if (!key || !von) return { ok: false, grund: 'E-Mail nicht eingerichtet (RESEND_API_KEY/EMAIL_FROM fehlt)' };
  try {
    const antwort = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: von, to: [adresse], subject: betreff, text: text
      })
    });
    if (!antwort.ok) return { ok: false, grund: 'Resend ' + antwort.status };
    return { ok: true };
  } catch (e) {
    return { ok: false, grund: e.message };
  }
}

// Schickt an alle hinterlegten Wege und meldet zurueck, was geklappt hat.
// Ein fehlender Weg ist kein Fehler - nur ein Hinweis im Protokoll.
async function melde({ sms, email }, betreff, text) {
  const ergebnisse = [];
  if (sms) ergebnisse.push(Object.assign({ weg: 'SMS an ' + sms }, await smsAn(sms, text)));
  if (email) ergebnisse.push(Object.assign({ weg: 'E-Mail an ' + email }, await mailAn(email, betreff, text)));
  if (!ergebnisse.length) {
    return { ok: false, wege: [], grund: 'Kein Benachrichtigungsweg hinterlegt (sms/email in der Kundendatei)' };
  }
  return { ok: ergebnisse.some((e) => e.ok), wege: ergebnisse };
}

module.exports = { smsAn, mailAn, melde };
