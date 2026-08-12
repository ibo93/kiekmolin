'use strict';

// Absicherung des Telefon-Retters (siehe PRUEFUNG.md, Blocker 1):
//
// 1. Twilio-Signatur: Der /anruf-Webhook akzeptiert nur Anfragen, die Twilio
//    mit dem Auth-Token signiert hat (HMAC-SHA1 ueber URL + sortierte Felder).
//    -> Fremde bekommen kein TwiML und koennen den Webhook nicht fluten.
// 2. Stream-Token: Der Webhook stellt ein kurzlebiges, signiertes Token aus
//    und gibt es als <Parameter> in den Media-Stream. Der /media-Handler
//    laesst nur Verbindungen zu, die ein gueltiges Token mitbringen.
//    -> Fremde koennen nicht direkt WebSocket-Verbindungen oeffnen und auf
//       unsere Kosten Deepgram/Claude/ElevenLabs laufen lassen oder
//       Fake-Reservierungen in die Datenbank schreiben.

const crypto = require('crypto');

// Geheimnis fuers Stream-Token: das Twilio-Auth-Token, sonst das API-Secret,
// sonst ein Zufallswert pro Prozess (Token wird vom selben Prozess
// ausgestellt UND geprueft - ein Zufallswert reicht dafuer voellig).
const STREAM_GEHEIMNIS = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_API_SECRET ||
  crypto.randomBytes(32).toString('hex');
const TOKEN_GUELTIG_MS = 5 * 60 * 1000; // Twilio verbindet den Stream binnen Sekunden

// --- 1. Twilio-Signatur (https://www.twilio.com/docs/usage/security) ------------
// Erwartete Signatur: Base64(HMAC-SHA1(authToken, url + sortierte(name+wert)))
function twilioSignaturGueltig({ signaturHeader, url, body, authToken }) {
  if (!authToken) return true; // nicht konfiguriert -> Pruefung aus (Warnung beim Start)
  if (!signaturHeader) return false;

  const felder = [...new URLSearchParams(body).entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let daten = url;
  for (const [name, wert] of felder) daten += name + wert;

  const erwartet = crypto.createHmac('sha1', authToken).update(Buffer.from(daten, 'utf8')).digest('base64');
  const a = Buffer.from(String(signaturHeader));
  const b = Buffer.from(erwartet);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- 2. Kurzlebiges Stream-Token ---------------------------------------------------
function streamTokenErzeugen(jetztMs) {
  const ts = String(jetztMs != null ? jetztMs : Date.now());
  const sig = crypto.createHmac('sha256', STREAM_GEHEIMNIS).update(ts).digest('hex').slice(0, 32);
  return ts + '.' + sig;
}

function streamTokenGueltig(token, jetztMs) {
  const teile = String(token || '').split('.');
  if (teile.length !== 2) return false;
  const [ts, sig] = teile;
  const alter = (jetztMs != null ? jetztMs : Date.now()) - parseInt(ts, 10);
  if (!(alter >= 0 && alter < TOKEN_GUELTIG_MS)) return false;
  const erwartet = crypto.createHmac('sha256', STREAM_GEHEIMNIS).update(ts).digest('hex').slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(erwartet);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- 3. Webhook-Schluessel (Ausweichweg ohne Auth Token) -------------------
// Wer sich bei Twilio nur mit einem API Key anmelden kann, hat kein Auth
// Token - und ohne das laesst sich die Twilio-Signatur nicht nachrechnen.
// Dann bekommt die Webhook-Adresse eine geheime Zeichenkette angehaengt:
//   https://.../anruf?schluessel=<zufall>
// Die kennt nur Twilio, weil nur dort die Adresse hinterlegt ist.
function zeichenGleich(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Entscheidet, ob eine Anfrage an /anruf durchgelassen wird.
// Reihenfolge: Auth Token (bester Schutz) -> Webhook-Schluessel -> offen.
// "offen" gibt es nur, wenn beides fehlt - dann warnt der Server beim Start.
function anrufZugangGueltig({ signaturHeader, url, body, authToken, schluessel, erwarteterSchluessel }) {
  if (authToken) {
    return {
      ok: twilioSignaturGueltig({ signaturHeader, url, body, authToken }),
      art: 'signatur'
    };
  }
  if (erwarteterSchluessel) {
    return { ok: zeichenGleich(schluessel, erwarteterSchluessel), art: 'schluessel' };
  }
  return { ok: true, art: 'ungeschuetzt' };
}

module.exports = {
  twilioSignaturGueltig, streamTokenErzeugen, streamTokenGueltig, anrufZugangGueltig
};
