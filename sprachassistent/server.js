#!/usr/bin/env node
'use strict';

// KURANI · SPRACHASSISTENT
// Reden statt tippen: Ibo sagt eine Aufgabe, der Assistent erledigt sie
// auf DIESEM Rechner - mit Claude Code, allen Skills und allen Dateien -
// und antwortet gesprochen.
//
//   node server.js            Echtbetrieb
//   node server.js --demo     Vorfuehrung ohne Schluessel, ohne Kosten
//
// Dann im Browser: http://localhost:3400
//
// Sicherheit: der Server hoert NUR auf 127.0.0.1. Er darf Dateien auf dem
// Rechner aendern - er gehoert deshalb niemals ins offene Netz.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { ladeEnv } = require('./lib/env');
const befehle = require('./lib/befehle');
const kopf = require('./lib/kopf');
const ohr = require('./lib/ohr');
const stimme = require('./lib/stimme');
const protokoll = require('./lib/protokoll');
const { sprechbar } = require('./lib/sprechtext');

ladeEnv();

const DEMO = process.argv.includes('--demo');
const PORT = parseInt(process.env.SPRACH_PORT || '3400', 10);
const HOST = process.env.SPRACH_HOST || '127.0.0.1';
const REPO = path.join(__dirname, '..');
const MODELL = process.env.SPRACH_MODELL || 'sonnet';
const BUDGET = process.env.SPRACH_BUDGET_USD === '' ? '' : (process.env.SPRACH_BUDGET_USD || '3');
const ZEITLIMIT = parseInt(process.env.SPRACH_ZEITLIMIT || '300', 10);
const FREIE_HAND = /^(ja|yes|1|true)$/i.test(process.env.SPRACH_FREIE_HAND || '');
const MAX_SAETZE = parseInt(process.env.SPRACH_MAX_SAETZE || '4', 10);

const ordnerKonfig = befehle.ladeOrdnerKonfig(REPO);

// Gedaechtnis: pro Arbeitsordner eine laufende Claude-Sitzung. So kann Ibo
// nachfragen ("und jetzt auch fuer Mai") ohne alles zu wiederholen -
// und ein Wechsel des Ordners vermischt trotzdem nichts.
const sitzungen = new Map();     // ordnerName -> sessionId
const laufende = new Map();      // auftragsId -> { abbrechen }

// ------------------------------------------------------------- Hilfen -----

function json(res, status, daten) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(daten));
}

function leseBody(req, maxBytes) {
  const grenze = maxBytes || 1024 * 1024;
  return new Promise((erfuellt, abgelehnt) => {
    const teile = [];
    let groesse = 0;
    req.on('data', (t) => {
      groesse += t.length;
      if (groesse > grenze) {
        abgelehnt(new Error('Anfrage zu gross'));
        req.destroy();
        return;
      }
      teile.push(t);
    });
    req.on('end', () => erfuellt(Buffer.concat(teile)));
    req.on('error', abgelehnt);
  });
}

// Schutz vor Zugriffen aus dem Netz (auch per DNS-Trick): nur der eigene
// Rechner darf diesen Server bedienen. Wer SPRACH_HOST bewusst auf eine
// andere Adresse stellt (z.B. um das Handy als Mikrofon zu nutzen), hat
// sich dafuer entschieden - dann wird nicht mehr geprueft.
const NUR_HIER = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
function vonHier(req) {
  if (!NUR_HIER) return true;
  const host = String(req.headers.host || '').split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function ordnerNach(name) {
  return ordnerKonfig.ordner.find((o) => o.name === name) || null;
}

// ------------------------------------------------------------ Auftrag -----

// Der Kern: gesprochene Aufgabe -> Claude Code -> gesprochene Antwort.
// Meldet den Fortschritt live per Server-Sent-Events ans Fenster.
function fuehreAus(res, wunsch) {
  const text = String(wunsch.text || '').trim();
  const auftragsId = crypto.randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  const sende = (daten) => {
    try { res.write('data: ' + JSON.stringify(daten) + '\n\n'); } catch (_e) { /* Fenster zu */ }
  };

  // Steuerworte wirken sofort, ohne die KI zu bemuehen.
  const steuer = befehle.steuerwort(text);
  if (steuer === 'leer') {
    sende({ art: 'fertig', text: '', sprich: '', still: true });
    return res.end();
  }
  if (steuer === 'neu') {
    sitzungen.clear();
    sende({ art: 'fertig', text: 'Alles klar, wir fangen neu an.', sprich: 'Alles klar, wir fangen neu an.' });
    return res.end();
  }
  if (steuer === 'stopp') {
    for (const [, lauf] of laufende) lauf.abbrechen();
    laufende.clear();
    sende({ art: 'fertig', text: 'Gestoppt.', sprich: 'Gestoppt.' });
    return res.end();
  }

  // Wohin gehoert die Aufgabe? Ausdrueckliche Wahl im Fenster gewinnt.
  const gewaehlt = wunsch.ordner ? ordnerNach(wunsch.ordner) : null;
  const ordner = gewaehlt || befehle.waehleOrdner(text, ordnerKonfig);
  const stufenName = befehle.stufeAufloesen(wunsch.stufe, FREIE_HAND);
  const stufe = befehle.STUFEN[stufenName];

  if (!fs.existsSync(ordner.pfad)) {
    const hinweis = 'Den Ordner ' + ordner.name + ' finde ich nicht. Trag den richtigen Pfad in ordner.json ein.';
    sende({ art: 'fehler', text: hinweis, sprich: hinweis });
    return res.end();
  }

  sende({ art: 'angenommen', id: auftragsId, ordner: ordner.name, pfad: ordner.pfad, stufe: stufenName });

  const beginn = Date.now();
  const fertigMachen = (ereignis) => {
    const antwort = ereignis.text || '';
    const gesprochen = sprechbar(antwort, { maxSaetze: MAX_SAETZE });
    laufende.delete(auftragsId);
    protokoll.schreibe({
      frage: text,
      antwort: antwort,
      ordner: ordner.name,
      stufe: stufenName,
      kosten: ereignis.kosten || 0,
      sekunden: Math.round((Date.now() - beginn) / 1000),
      demo: DEMO
    });
    sende({
      art: 'fertig',
      text: antwort,
      sprich: gesprochen.text,
      gekuerzt: gesprochen.gekuerzt,
      kosten: ereignis.kosten || 0,
      sekunden: Math.round((Date.now() - beginn) / 1000),
      hinweis: ereignis.fehlerText || null
    });
    res.end();
  };

  if (DEMO) {
    const antwort = demoAntwort(text, ordner);
    setTimeout(() => sende({ art: 'werkzeug', text: 'liest Notizen (Demo)' }), 250);
    setTimeout(() => fertigMachen({ text: antwort, kosten: 0 }), 900);
    return;
  }

  const lauf = kopf.starteAuftrag({
    prompt: text,
    ordner: ordner.pfad,
    stufe: stufe,
    sitzung: sitzungen.get(ordner.name) || null,
    system: befehle.systemZusatz(),
    modell: MODELL,
    budget: BUDGET,
    zeitlimit: ZEITLIMIT,
    onEreignis: (e) => {
      if (e.art === 'start') {
        sitzungen.set(ordner.name, e.sitzung);
        return;
      }
      if (e.art === 'fertig') return fertigMachen(e);
      if (e.art === 'fehler' || e.art === 'abgebrochen') {
        laufende.delete(auftragsId);
        // Haengt es an einer alten Sitzung, die es nicht mehr gibt?
        // Dann Gedaechtnis fuer diesen Ordner leeren - der naechste
        // Versuch faengt sauber neu an, statt immer wieder zu scheitern.
        if (e.art === 'fehler' && /session|resume/i.test(e.text || '')) sitzungen.delete(ordner.name);
        sende({ art: e.art, text: e.text, sprich: e.art === 'abgebrochen' ? 'Abgebrochen.' : e.text });
        return res.end();
      }
      sende(e);  // 'werkzeug' und 'text' laufen direkt durch
    }
  });

  laufende.set(auftragsId, lauf);
  res.on('close', () => {
    // Fenster zu / Seite neu geladen: keinen verwaisten Auftrag weiterlaufen
    // lassen (der wuerde weiter Geld kosten und Dateien anfassen).
    if (laufende.has(auftragsId)) {
      lauf.abbrechen();
      laufende.delete(auftragsId);
    }
  });
}

// Vorfuehr-Antworten: zeigen den Ablauf, ohne einen einzigen Schluessel.
function demoAntwort(text, ordner) {
  const t = text.toLowerCase();
  if (/rechnung|kostenvoranschlag|angebot/.test(t)) {
    return 'Demo: Ich haette jetzt die Rechnung im Kurani-Format geschrieben und im Ordner ' + ordner.name + ' abgelegt.';
  }
  if (/was steht an|aufgabe|woche|roadmap/.test(t)) {
    return 'Demo: Diese Woche stehen der Probeanruf beim Piloten und zwei Reels an. Der Rest kann warten.';
  }
  if (/fehler|bug|app/.test(t)) {
    return 'Demo: Ich haette die Stelle in der App gesucht und dir gesagt, was da schiefgeht.';
  }
  return 'Demo-Modus: Ich habe dich verstanden - "' + text.slice(0, 80) + '". Im Echtbetrieb wuerde ich das jetzt im Ordner ' + ordner.name + ' erledigen.';
}

// ------------------------------------------------------------- Routen -----

const server = http.createServer(async (req, res) => {
  if (!vonHier(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Nur vom eigenen Rechner erreichbar.');
  }

  const url = new URL(req.url, 'http://localhost');
  const pfad = url.pathname;

  try {
    if (req.method === 'GET' && (pfad === '/' || pfad === '/index.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && pfad === '/api/konfig') {
      return json(res, 200, {
        demo: DEMO,
        hoeren: (!DEMO && process.env.DEEPGRAM_API_KEY) ? 'deepgram' : 'browser',
        stimme: (!DEMO && process.env.ELEVENLABS_API_KEY && (process.env.SPRACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID)) ? 'elevenlabs' : 'browser',
        modell: MODELL,
        freieHand: FREIE_HAND,
        standard: ordnerKonfig.standard,
        ordner: ordnerKonfig.ordner.map((o) => ({
          name: o.name,
          pfad: o.pfad,
          beschreibung: o.beschreibung,
          da: fs.existsSync(o.pfad)
        }))
      });
    }

    if (req.method === 'POST' && pfad === '/api/hoeren') {
      const audio = await leseBody(req, 20 * 1024 * 1024);
      const text = await ohr.hoere(audio, req.headers['content-type']);
      return json(res, 200, { text: text });
    }

    if (req.method === 'POST' && pfad === '/api/auftrag') {
      const roh = await leseBody(req, 256 * 1024);
      let wunsch;
      try { wunsch = JSON.parse(roh.toString('utf8') || '{}'); } catch (_e) { return json(res, 400, { fehler: 'Kaputte Anfrage' }); }
      return fuehreAus(res, wunsch);
    }

    if (req.method === 'POST' && pfad === '/api/stopp') {
      for (const [, lauf] of laufende) lauf.abbrechen();
      laufende.clear();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pfad === '/api/neu') {
      sitzungen.clear();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && pfad === '/api/stimme') {
      const roh = await leseBody(req, 64 * 1024);
      const { text } = JSON.parse(roh.toString('utf8') || '{}');
      if (!text || !String(text).trim()) return json(res, 400, { fehler: 'Kein Text' });
      const mp3 = await stimme.spreche(String(text).slice(0, 1200));
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': mp3.length });
      return res.end(mp3);
    }

    if (req.method === 'GET' && pfad === '/api/protokoll') {
      return json(res, 200, { eintraege: protokoll.letzte(parseInt(url.searchParams.get('anzahl') || '30', 10)) });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden');
  } catch (e) {
    if (!res.headersSent) return json(res, 500, { fehler: e.message });
    try { res.end(); } catch (_e2) { /* egal */ }
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  KURANI · Sprachassistent' + (DEMO ? '  (Demo)' : ''));
  console.log('  ------------------------------------------------');
  console.log('  Fenster:  http://localhost:' + PORT);
  console.log('  Hoeren:   ' + ((!DEMO && process.env.DEEPGRAM_API_KEY) ? 'Deepgram' : 'Browser (kein Schluessel noetig)'));
  console.log('  Stimme:   ' + ((!DEMO && process.env.ELEVENLABS_API_KEY) ? 'ElevenLabs' : 'Browser (kein Schluessel noetig)'));
  console.log('  Modell:   ' + MODELL + (BUDGET ? '  (max. ' + BUDGET + ' USD pro Auftrag)' : ''));
  console.log('  Ordner:   ' + ordnerKonfig.ordner.map((o) => o.name).join(', '));
  if (FREIE_HAND) console.log('  ! Freie Hand ist erlaubt: der Assistent darf alles ausfuehren.');
  if (!NUR_HIER) console.log('  ! Achtung: erreichbar unter ' + HOST + ' - dieser Server darf Dateien aendern.');
  console.log('');
});

module.exports = { server, demoAntwort };
