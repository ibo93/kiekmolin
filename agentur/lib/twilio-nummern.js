'use strict';

// ============================================================
//  Twilio-Nummern
//
//  Fuer jeden Betrieb braucht es eine eigene Rufnummer - der
//  Assistent erkennt am Ziel des Anrufs, wen er vertritt. Das
//  von Hand zu machen sind zehn Minuten Klickarbeit pro Kunde:
//  suchen, kaufen, Webhook eintragen, im CRM verknuepfen.
//
//  Hier passiert dasselbe in einem Aufruf.
//
//  Achtung Geld: Jede gekaufte Nummer kostet ab dem Kauf
//  monatlich. Deshalb wird nie automatisch gekauft - immer nur
//  auf ausdrueckliche Auswahl einer konkreten Nummer.
// ============================================================

const BASIS = 'https://api.twilio.com/2010-04-01';

function zugang() {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID oder TWILIO_AUTH_TOKEN fehlt in der .env');
  return { sid, kopf: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64') };
}

async function twilio(pfad, optionen) {
  const { sid, kopf } = zugang();
  const antwort = await fetch(BASIS + '/Accounts/' + sid + pfad, Object.assign({
    headers: { Authorization: kopf, 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(20000)
  }, optionen || {}));

  const text = await antwort.text();
  let daten = null;
  try { daten = JSON.parse(text); } catch (_e) { /* Twilio antwortet immer mit JSON */ }

  if (!antwort.ok) {
    /* Twilios Fehlermeldungen sind brauchbar - durchreichen statt
       verschlucken. "Not authorized" heisst etwas anderes als
       "requires an address". */
    const grund = (daten && (daten.message || daten.detail)) || text.slice(0, 200);
    const e = new Error(grund);
    e.status = antwort.status;
    e.code = daten && daten.code;
    throw e;
  }
  return daten;
}

/* Freie Nummern suchen. Sucht NUR, kauft nichts. */
async function sucheNummern({ land, vorwahl, enthaelt }) {
  const p = new URLSearchParams({ VoiceEnabled: 'true', PageSize: '12' });
  if (vorwahl) p.set('AreaCode', String(vorwahl).replace(/\D/g, ''));
  if (enthaelt) p.set('Contains', String(enthaelt));

  const d = await twilio('/AvailablePhoneNumbers/' + encodeURIComponent(land || 'DE')
                         + '/Local.json?' + p.toString());
  return (d.available_phone_numbers || []).map((n) => ({
    nummer: n.phone_number,
    ort: n.locality || n.region || '',
    stimme: !!(n.capabilities && n.capabilities.voice),
    sms: !!(n.capabilities && n.capabilities.SMS)
  }));
}

/* Eine konkrete Nummer kaufen und gleich den Webhook setzen. Ohne den
   Webhook waere die Nummer stumm: Twilio wuesste nicht, wen es fragen
   soll, wenn jemand anruft. */
async function kaufeNummer({ nummer, webhook, name }) {
  if (!nummer) throw new Error('Keine Nummer angegeben');
  if (!webhook) throw new Error('Kein Webhook angegeben - die Nummer waere stumm');

  const koerper = new URLSearchParams({
    PhoneNumber: nummer,
    VoiceUrl: webhook,
    VoiceMethod: 'POST'
  });
  if (name) koerper.set('FriendlyName', String(name).slice(0, 64));

  const d = await twilio('/IncomingPhoneNumbers.json', { method: 'POST', body: koerper });
  return { nummer: d.phone_number, sid: d.sid, webhook: d.voice_url };
}

/* Was gehoert uns schon? Zeigt auch, welche Nummer auf welchen Webhook
   zeigt - eine falsch eingetragene faellt sonst erst auf, wenn ein Gast
   ins Leere telefoniert. */
async function eigeneNummern() {
  const d = await twilio('/IncomingPhoneNumbers.json?PageSize=50');
  return (d.incoming_phone_numbers || []).map((n) => ({
    nummer: n.phone_number,
    name: n.friendly_name || '',
    webhook: n.voice_url || '',
    sid: n.sid
  }));
}

/* Webhook einer vorhandenen Nummer korrigieren. */
async function setzeWebhook(sid, webhook) {
  const d = await twilio('/IncomingPhoneNumbers/' + encodeURIComponent(sid) + '.json', {
    method: 'POST',
    body: new URLSearchParams({ VoiceUrl: webhook, VoiceMethod: 'POST' })
  });
  return { nummer: d.phone_number, webhook: d.voice_url };
}

module.exports = { sucheNummern, kaufeNummer, eigeneNummern, setzeWebhook };
