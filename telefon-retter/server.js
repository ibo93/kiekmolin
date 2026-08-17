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

// Fehlende Hilfsprogramme freundlich melden. Node sagt sonst nur
// "Cannot find module 'ws'" mit halbseitigem Stapelspeicher - und wer
// nicht taeglich programmiert, weiss damit nichts anzufangen.
let WebSocketServer;
try {
  ({ WebSocketServer } = require('ws'));
} catch (_e) {
  console.error('\nEs fehlen die Hilfsprogramme fuer den Telefon-Retter.');
  console.error('Einmal ausfuehren, dann laeuft es:\n');
  console.error('   cd ' + __dirname);
  console.error('   npm install\n');
  process.exit(1);
}
const { ladeEnv } = require('./lib/env');
const supabase = require('./lib/supabase');
const { AnrufSitzung } = require('./lib/anruf');

ladeEnv();

const { anrufZugangGueltig, streamTokenErzeugen, streamTokenGueltig } = require('./lib/sicherheit');
const twilioAuth = require('./lib/twilio-auth');

const PORT = parseInt(process.env.PORT || '3100', 10);
const STUFE = parseInt(process.env.STUFE || '1', 10);
// Gespraechs-Protokolle (personenbezogene Daten!) nach N Tagen loeschen (DSGVO)
const LOG_TAGE = parseInt(process.env.LOG_AUFBEWAHRUNG_TAGE || '30', 10);
const LOG_ORDNER = path.join(__dirname, 'logs');

const { ladeKunden, restaurantFuerNummer } = require('./lib/kunden');

// Mandantenfaehig: alle betreuten Restaurants beim Start laden (und
// regelmaessig auffrischen). Die angerufene Nummer waehlt das Restaurant.
let kontexte = new Map();      // restaurantId -> { restaurant, menue }
let nummernZuordnung = {};     // "+49..." -> restaurantId
let standardId = null;         // Fallback aus der .env

async function ladeDaten() {
  const kunden = ladeKunden(__dirname);
  nummernZuordnung = kunden.zuordnung;
  const einstellungen = kunden.einstellungen;
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
    // Eigene Einstellungen dieses Wirts (Stimme, Stufe, Faehigkeiten, Datei)
    const eigen = einstellungen[String(id)] || {};

    // --- Betrieb OHNE Kiek mol in: Daten aus der eigenen Kundendatei -------
    // So ist der Telefon-Retter auch allein verkaufbar. Gespeichert wird
    // lokal, der Wirt wird per SMS/E-Mail sofort informiert.
    if (eigen.datei) {
      try {
        const { ladeExternenKunden } = require('./lib/externe-kunden');
        const { baueAblage } = require('./lib/lokale-ablage');
        const extern = ladeExternenKunden(eigen.datei, __dirname);
        const stufe = eigen.stufe || STUFE;
        neu.set(String(id), {
          restaurant: extern.restaurant,
          menue: extern.menue,
          stimme: eigen.stimme || null,
          stufe,
          kann: eigen.kann || null,
          datenquelle: baueAblage(extern.kunde) // eigene Ablage statt Datenbank
        });
        console.log('Eigener Kunde geladen: ' + extern.restaurant.name +
          (extern.restaurant.city ? ' (' + extern.restaurant.city + ')' : '') +
          ' · ohne Kiek mol in · ' + faehigkeitenText(stufe, eigen.kann) +
          (extern.menue.length ? ' · ' + extern.menue.length + ' Gerichte' : '') +
          (eigen.stimme ? ' · eigene Stimme' : '') +
          ' · Meldung an ' + (extern.kunde.melden.sms || extern.kunde.melden.email ||
            'NIEMANDEN - bitte "melden" in der Kundendatei ergaenzen!'));
      } catch (e) {
        console.warn('Kunde "' + id + '" uebersprungen: ' + e.message);
      }
      continue;
    }

    // --- Kiek-mol-in-Kunde: alles kommt aus der Datenbank ------------------
    const r = await supabase.findeRestaurant(id);
    if (!r) { console.warn('Restaurant ' + id + ' nicht gefunden - wird uebersprungen'); continue; }
    const stufe = eigen.stufe || STUFE;
    // Wer Bestellungen annimmt, braucht die Speisekarte - egal welche Stufe
    const brauchtMenue = stufe >= 2 || (eigen.kann || []).some((k) => /bestell|liefer|info/i.test(k));
    const menue = brauchtMenue ? await supabase.speisekarte(r.id) : [];
    neu.set(String(r.id), {
      restaurant: r, menue, stimme: eigen.stimme || null, stufe, kann: eigen.kann || null
    });
    console.log('Restaurant geladen: ' + r.name + (r.city ? ' (' + r.city + ')' : '') +
      ' · ' + faehigkeitenText(stufe, eigen.kann) +
      (menue.length ? ' · ' + menue.length + ' Gerichte' : '') +
      (eigen.stimme ? ' · eigene Stimme' : ''));
  }
  if (!neu.size) throw new Error('Kein einziges Restaurant konnte geladen werden');
  kontexte = neu;
  if (!standardId || !kontexte.has(standardId)) standardId = [...kontexte.keys()][0];
}

// Klartext fuer die Start-Ausgabe: was nimmt dieser Agent an?
function faehigkeitenText(stufe, kann) {
  const { baueFaehigkeiten } = require('./lib/dialog');
  const f = baueFaehigkeiten(stufe, kann);
  const teile = [];
  if (f.reservierung) teile.push('Reservierungen');
  if (f.bestellung) teile.push('Bestellungen');
  if (f.infos && !f.bestellung) teile.push('Infos');
  return (teile.length ? teile.join(' + ') : 'nur Rueckrufe') + ' (Stufe ' + stufe + ')';
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

  // Kundendaten sofort neu einlesen. Sonst dauert es bis zu 5 Minuten, bis
  // ein neu angelegter Kunde erreichbar ist - im Verkaufsgespraech zu lang,
  // wenn der Wirt gleich seinen Probeanruf machen soll.
  //
  // Geschuetzt wie die Anruf-Route: mit TELEFON_WEBHOOK_SCHLUESSEL, wenn
  // gesetzt. Ohne Schluessel nur vom selben Rechner - von aussen koennte
  // sonst jeder den Server in eine Neuladeschleife schicken.
  if (req.method === 'POST' && req.url.startsWith('/neu-laden')) {
    const erwartet = process.env.TELEFON_WEBHOOK_SCHLUESSEL || '';
    const mitgeschickt = String(req.headers['x-schluessel'] || '');
    const vonHier = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const erlaubt = erwartet
      ? anrufZugangGueltig({ schluessel: mitgeschickt, erwarteterSchluessel: erwartet }).ok
      : vonHier;
    if (!erlaubt) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, fehler: 'Nicht erlaubt' }));
      return;
    }
    ladeDaten()
      .then(() => {
        const namen = [...kontexte.values()].map((k) => k.restaurant.name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, restaurants: namen }));
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, fehler: e.message }));
      });
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/anruf')) {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      // Nur echte Twilio-Anfragen. Mit Auth Token: Signatur pruefen.
      // Ohne Auth Token (API-Key-Konto): geheimer Schluessel in der Adresse.
      // Die Adresse muss inklusive Query-Teil in die Signatur - genau so,
      // wie Twilio sie aufgerufen hat.
      const webhookUrl = (process.env.BASE_URL || ('http://localhost:' + PORT)).replace(/\/$/, '') + req.url;
      const zugang = anrufZugangGueltig({
        signaturHeader: req.headers['x-twilio-signature'],
        url: webhookUrl,
        body,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        schluessel: new URL(req.url, 'http://x').searchParams.get('schluessel'),
        erwarteterSchluessel: process.env.TELEFON_WEBHOOK_SCHLUESSEL
      });
      if (!zugang.ok) {
        console.warn('Anfrage an /anruf abgewiesen (' + zugang.art + ' stimmt nicht)');
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
      if (process.env.TWILIO_AUTH_TOKEN) {
        console.log('Webhook-Schutz: Twilio-Signatur (Auth Token) ✓');
      } else if (process.env.TELEFON_WEBHOOK_SCHLUESSEL) {
        console.log('Webhook-Schutz: geheimer Schluessel in der Adresse ✓  (API-Key-Konto ohne Auth Token)');
        console.log('   Webhook-Adresse: ' + (process.env.BASE_URL || 'https://DEINE-DOMAIN') +
          '/anruf?schluessel=' + process.env.TELEFON_WEBHOOK_SCHLUESSEL);
      } else {
        console.warn('WARNUNG: Weder TWILIO_AUTH_TOKEN noch TELEFON_WEBHOOK_SCHLUESSEL gesetzt -');
        console.warn('         der Webhook laesst JEDE Anfrage durch. Fuer den Live-Betrieb: node telefon-start.js');
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
