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
const { WebSocketServer } = require('ws');
const { ladeEnv } = require('./lib/env');
const supabase = require('./lib/supabase');
const { AnrufSitzung } = require('./lib/anruf');

ladeEnv();

const PORT = parseInt(process.env.PORT || '3100', 10);
const STUFE = parseInt(process.env.STUFE || '1', 10);

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
      const felder = new URLSearchParams(body);
      const anrufer = felder.get('From') || '';
      console.log('Eingehender Anruf von ' + anrufer);

      // BASE_URL = oeffentliche Adresse dieses Servers (z.B. ngrok oder Server-Domain)
      const basis = (process.env.BASE_URL || ('http://localhost:' + PORT))
        .replace(/^http/, 'ws').replace(/\/$/, '');

      const twiml = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response><Connect><Stream url="' + xmlEscape(basis + '/media') + '">' +
        '<Parameter name="anrufer" value="' + xmlEscape(anrufer) + '"/>' +
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
  new AnrufSitzung({ twilioWs: ws, restaurant, menue, stufe: STUFE, datenquelle: supabase });
});

ladeDaten()
  .then(() => {
    server.listen(PORT, () => {
      console.log('Telefon-Retter laeuft auf Port ' + PORT);
      console.log('Twilio-Webhook (A CALL COMES IN): ' + (process.env.BASE_URL || 'https://DEINE-DOMAIN') + '/anruf');
    });
    // Speisekarte/Restaurant alle 5 Minuten auffrischen
    setInterval(() => ladeDaten().catch((e) => console.warn('Auffrischen fehlgeschlagen: ' + e.message)), 300000);
  })
  .catch((e) => {
    console.error('Start fehlgeschlagen: ' + e.message);
    process.exit(1);
  });
