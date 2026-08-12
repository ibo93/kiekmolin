'use strict';

// Twilio-Zugangsdaten - ZWEI Wege, weil einer davon oft nicht geht.
//
// Weg A (Standard): Account SID + Auth Token von der Console-Startseite.
// Weg B (Ausweichweg): Account SID + API Key (SK...) + API Secret.
//   Der Auth Token steht nur auf der Console-Startseite - und genau die
//   haengt bei manchen Konten. API Keys liegen auf einer eigenen Seite
//   (console.twilio.com -> Account -> API keys & tokens) und funktionieren
//   fuer die REST-API genauso.
//
// EIN Unterschied bleibt: Die Signatur, mit der Twilio seine Webhooks
// unterschreibt, wird IMMER mit dem Auth Token gebildet - ein API Key kann
// sie nicht pruefen. Deshalb gibt es in dem Fall den Webhook-Schluessel
// (siehe sicherheit.js): eine geheime Zeichenkette in der Webhook-Adresse,
// die nur Twilio kennt. Anders abgesichert, aber abgesichert.

function kontoSid() {
  return process.env.TWILIO_ACCOUNT_SID || '';
}

// Twilio betreibt getrennte Rechenzentren ("Regionen"). Ein Konto in
// Irland hat EIGENE Auth Tokens, die gegen den US-Server 401 ergeben -
// derselbe Wert funktioniert nur gegen den irischen Server. Deshalb
// gehoert die Region zu den Zugangsdaten dazu.
const REGIONEN = {
  '': 'https://api.twilio.com',        // Standard (USA / global)
  us1: 'https://api.twilio.com',
  ie1: 'https://api.ie1.twilio.com',   // Irland
  au1: 'https://api.au1.twilio.com'    // Australien
};

function basisUrl() {
  const region = String(process.env.TWILIO_REGION || '').toLowerCase().trim();
  return REGIONEN[region] || REGIONEN[''];
}

// Fertige Konto-Adresse, an die fast alle Aufrufe gehen
function kontoUrl(pfad) {
  return basisUrl() + '/2010-04-01/Accounts/' + encodeURIComponent(kontoSid()) + (pfad || '');
}

// Gibt die Zugangsdaten zurueck, mit denen die REST-API angesprochen wird.
// API Key hat Vorrang: wer ihn eingerichtet hat, will ihn auch nutzen.
function zugangsdaten() {
  const sid = kontoSid();
  if (!sid) return null;
  const key = process.env.TWILIO_API_KEY || '';
  const secret = process.env.TWILIO_API_SECRET || '';
  if (key && secret) return { kontoSid: sid, benutzer: key, geheimnis: secret, art: 'api-key' };
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (token) return { kontoSid: sid, benutzer: sid, geheimnis: token, art: 'auth-token' };
  return null;
}

function istKonfiguriert() {
  return !!zugangsdaten();
}

// Fertiger Authorization-Kopf fuer fetch(). null = nicht eingerichtet.
function authKopf() {
  const z = zugangsdaten();
  if (!z) return null;
  return 'Basic ' + Buffer.from(z.benutzer + ':' + z.geheimnis).toString('base64');
}

// Nur mit dem Auth Token laesst sich die Twilio-Signatur nachrechnen.
function kannSignaturPruefen() {
  return !!process.env.TWILIO_AUTH_TOKEN;
}

// Klartext fuer Log-Ausgaben und die Einrichtungs-Ampel
function beschreibung() {
  const z = zugangsdaten();
  if (!z) return 'nicht eingerichtet';
  return z.art === 'api-key' ? 'API Key (SK...)' : 'Auth Token';
}

module.exports = {
  kontoSid, zugangsdaten, istKonfiguriert, authKopf, kannSignaturPruefen, beschreibung,
  REGIONEN, basisUrl, kontoUrl
};
