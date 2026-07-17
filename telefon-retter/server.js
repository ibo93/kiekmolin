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

const { ladeNummernZuordnung, restaurantFuerNummer } = require('./lib/kunden');

// Mandantenfaehig: alle betreuten Restaurants beim Start laden (und
// regelmaessig auffrischen). Die angerufene Nummer waehlt das Restaurant.
let kontexte = new Map();      // restaurantId -> { restaurant, menue }
let nummernZuordnung = {};     // "+49..." -> restaurantId
let standardId = null;         // Fallback aus der .env

async function ladeDaten() {
  nummernZuordnung = ladeNummernZuordnung(__dirname);
  const ids = new Set(Object.values(nummernZuordnung));

  const kennung = process.env.RESTAURANT_ID || process.env.RESTAURANT_NAME;
  if (kennung) {
    const standard = await supabase.findeRestaurant(kennung);
    if (!standard) throw new Error('Restaurant "' + kennung + '" nicht in der Datenbank gefunden');
    standardId = String(standard.id);
    ids.add(standardId);
  }
  if (!ids.size) throw new Error('RESTAURANT_ID/RESTAURANT_NAME in .env setzen oder nummern.json anlegen');

  const neu = new Map();
  for (const id of ids) {
    const r = await supabase.findeRestaurant(id);
    if (!r) { console.warn('Restaurant ' + id + ' nicht gefunden - wird uebersprungen'); continue; }
    const menue = STUFE >= 2 ? await supabase.speisekarte(r.id) : [];
    neu.set(String(r.id), { restaurant: r, menue });
    console.log('Restaurant geladen: ' + r.name + (r.city ? ' (' + r.city + ')' : '') +
      ' · Stufe ' + STUFE + (menue.length ? ' · ' + menue.length + ' Gerichte' : ''));
  }
  if (!neu.size) throw new Error('Kein einziges Restaurant konnte geladen werden');
  kontexte = neu;
  if (!standardId || !kontexte.has(standardId)) standardId = [...kontexte.keys()][0];
}

function xmlEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/health')) {
    const namen = [...kontexte.values()].map((k) => k.restaurant.name);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, restaurant: namen.join(', '), restaurants: namen, stufe: STUFE }));
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
      const angerufen = felder.get('To') || '';
      // Die angerufene Nummer entscheidet, welches Restaurant der Agent vertritt
      const restaurantId = restaurantFuerNummer(nummernZuordnung, angerufen, standardId);
      const kontext = kontexte.get(String(restaurantId));
      console.log('Eingehender Anruf von ' + anrufer + ' fuer ' +
        (kontext ? kontext.restaurant.name : 'UNBEKANNT (' + angerufen + ')'));
      if (!kontext) {
        // Nummer keinem Restaurant zugeordnet -> nicht raten, sauber ablehnen
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>');
        return;
      }

      // BASE_URL = oeffentliche Adresse dieses Servers (z.B. ngrok oder Server-Domain)
      const basis = (process.env.BASE_URL || ('http://localhost:' + PORT))
        .replace(/^http/, 'ws').replace(/\/$/, '');

      // Kurzlebiges Token: nur damit darf sich der Media-Stream verbinden
      const twiml = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response><Connect><Stream url="' + xmlEscape(basis + '/media') + '">' +
        '<Parameter name="anrufer" value="' + xmlEscape(anrufer) + '"/>' +
        '<Parameter name="restaurant" value="' + xmlEscape(String(restaurantId)) + '"/>' +
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
  if (!kontexte.size) { ws.close(); return; }
  new AnrufSitzung({
    twilioWs: ws, stufe: STUFE, datenquelle: supabase,
    // Das Token aus dem TwiML-<Parameter> wird beim 'start'-Event geprueft -
    // Verbindungen ohne gueltiges Token werden sofort getrennt.
    pruefeToken: (token) => streamTokenGueltig(token),
    // Restaurant kommt pro Anruf aus dem <Parameter> (Mandantenfaehigkeit)
    holeKontext: (restaurantId) => kontexte.get(String(restaurantId)) || kontexte.get(standardId) || null
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
    // No-Show-Schutz: morgige Reservierungen per SMS erinnern (Opt-in)
    const { erinnerungsLauf, istAktiv } = require('./lib/erinnerung');
    if (istAktiv()) {
      console.log('SMS-Erinnerung AN: Gaeste mit Reservierung fuer morgen werden ab ' +
        (process.env.ERINNERUNG_AB_STUNDE || 15) + ' Uhr erinnert.');
      setInterval(() => erinnerungsLauf(kontexte, supabase).catch((e) => console.warn('Erinnerung: ' + e.message)), 60 * 60 * 1000);
      setTimeout(() => erinnerungsLauf(kontexte, supabase).catch((e) => console.warn('Erinnerung: ' + e.message)), 30000);
    }
  })
  .catch((e) => {
    console.error('Start fehlgeschlagen: ' + e.message);
    process.exit(1);
  });
