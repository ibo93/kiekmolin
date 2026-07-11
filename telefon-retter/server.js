#!/usr/bin/env node
'use strict';

// KURANI · TELEFON-RETTER - Server
//
// Nimmt Twilio-Anrufe entgegen:
//   POST /anruf   Twilio-Webhook -> antwortet mit TwiML, das den Audio-Stream
//                 per WebSocket zu uns verbindet
//   WS   /media   der eigentliche Audio-Stream (eine AnrufSitzung pro Anruf)
//   GET  /health  Lebenszeichen
//
// Start:  node server.js   (Konfiguration in .env, siehe .env.example)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { ladeEnv } = require('./lib/env');
const supabase = require('./lib/supabase');
const { AnrufSitzung } = require('./lib/anruf');

ladeEnv();

const { twilioSignaturGueltig, streamTokenErzeugen, streamTokenGueltig } = require('./lib/sicherheit');

const PORT = parseInt(process.env.PORT || '3100', 10);
const STUFE = parseInt(process.env.STUFE || '1', 10);
// Gespraechs-Protokolle (personenbezogene Daten!) nach N Tagen loeschen (DSGVO)
const LOG_TAGE = parseInt(process.env.LOG_AUFBEWAHRUNG_TAGE || '30', 10);
const LOG_ORDNER = path.join(__dirname, 'logs');

// Beim Start einmal Restaurant + Speisekarte laden (und regelmaessig auffrischen)
let restaurant = null;
let menue = [];

async function ladeDaten() {
  const kennung = process.env.RESTAURANT_ID || process.env.RESTAURANT_NAME;
  if (!kennung) throw new Error('RESTAURANT_ID oder RESTAURANT_NAME in .env setzen');
  const r = await supabase.findeRestaurant(kennung);
  if (!r) throw new Error('Restaurant "' + kennung + '" nicht in der Datenbank gefunden');
  restaurant = r;
  menue = STUFE >= 2 ? await supabase.speisekarte(r.id) : [];
  console.log('Restaurant geladen: ' + r.name + (r.city ? ' (' + r.city + ')' : '') +
    ' · Stufe ' + STUFE + (menue.length ? ' · ' + menue.length + ' Gerichte' : ''));
}

function xmlEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, restaurant: restaurant && restaurant.name, stufe: STUFE }));
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/anruf')) {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      // Nur echte Twilio-Anfragen: Signatur gegen das Auth-Token pruefen
      const webhookUrl = (process.env.BASE_URL || ('http://localhost:' + PORT)).replace(/\/$/, '') + '/anruf';
      const echt = twilioSignaturGueltig({
        signaturHeader: req.headers['x-twilio-signature'],
        url: webhookUrl,
        body,
        authToken: process.env.TWILIO_AUTH_TOKEN
      });
      if (!echt) {
        console.warn('Anfrage an /anruf mit ungueltiger Twilio-Signatur abgewiesen');
        res.writeHead(403);
        res.end('Verboten');
        return;
      }

      const felder = new URLSearchParams(body);
      const anrufer = felder.get('From') || '';
      console.log('Eingehender Anruf von ' + anrufer);

      // BASE_URL = oeffentliche Adresse dieses Servers (z.B. ngrok oder Server-Domain)
      const basis = (process.env.BASE_URL || ('http://localhost:' + PORT))
        .replace(/^http/, 'ws').replace(/\/$/, '');

      // Kurzlebiges Token: nur damit darf sich der Media-Stream verbinden
      const twiml = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response><Connect><Stream url="' + xmlEscape(basis + '/media') + '">' +
        '<Parameter name="anrufer" value="' + xmlEscape(anrufer) + '"/>' +
        '<Parameter name="token" value="' + xmlEscape(streamTokenErzeugen()) + '"/>' +
        '</Stream></Connect></Response>';

      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(twiml);
    });
    return;
  }

  res.writeHead(404);
  res.end('Nicht gefunden');
});

const wss = new WebSocketServer({ server, path: '/media' });
wss.on('connection', (ws) => {
  if (!restaurant) { ws.close(); return; }
  new AnrufSitzung({
    twilioWs: ws, restaurant, menue, stufe: STUFE, datenquelle: supabase,
    // Das Token aus dem TwiML-<Parameter> wird beim 'start'-Event geprueft -
    // Verbindungen ohne gueltiges Token werden sofort getrennt.
    pruefeToken: (token) => streamTokenGueltig(token)
  });
});

// --- Gespraechs-Protokolle automatisch loeschen (DSGVO-Speicherbegrenzung) -----
function alteLogsLoeschen() {
  if (!(LOG_TAGE > 0) || !fs.existsSync(LOG_ORDNER)) return;
  const grenze = Date.now() - LOG_TAGE * 24 * 60 * 60 * 1000;
  let geloescht = 0;
  for (const datei of fs.readdirSync(LOG_ORDNER)) {
    if (!datei.endsWith('.log')) continue;
    try {
      const pfad = path.join(LOG_ORDNER, datei);
      if (fs.statSync(pfad).mtimeMs < grenze) { fs.unlinkSync(pfad); geloescht++; }
    } catch (_e) { /* Datei gerade in Benutzung - naechster Lauf */ }
  }
  if (geloescht) console.log(geloescht + ' Anruf-Protokoll(e) aelter als ' + LOG_TAGE + ' Tage geloescht');
}

ladeDaten()
  .then(() => {
    server.listen(PORT, () => {
      console.log('Telefon-Retter laeuft auf Port ' + PORT);
      console.log('Twilio-Webhook (A CALL COMES IN): ' + (process.env.BASE_URL || 'https://DEINE-DOMAIN') + '/anruf');
      if (!process.env.TWILIO_AUTH_TOKEN) {
        console.warn('WARNUNG: TWILIO_AUTH_TOKEN fehlt in .env - der Webhook prueft KEINE Twilio-Signatur.');
        console.warn('         Fuer den Live-Betrieb unbedingt setzen (Twilio Console -> Account Info -> Auth Token).');
      }
      console.log('Anruf-Protokolle werden nach ' + LOG_TAGE + ' Tagen geloescht (LOG_AUFBEWAHRUNG_TAGE).');
    });
    // Speisekarte/Restaurant alle 5 Minuten auffrischen
    setInterval(() => ladeDaten().catch((e) => console.warn('Auffrischen fehlgeschlagen: ' + e.message)), 300000);
    // Alte Gespraechs-Protokolle beim Start und dann taeglich loeschen
    alteLogsLoeschen();
    setInterval(alteLogsLoeschen, 24 * 60 * 60 * 1000);
  })
  .catch((e) => {
    console.error('Start fehlgeschlagen: ' + e.message);
    process.exit(1);
  });
