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
const stimmen = require('./lib/stimmen');
const protokoll = require('./lib/protokoll');
const live = require('./lib/live');
const sofort = require('./lib/sofort');
const notizen = require('./lib/notizen');
const wache = require('./lib/wache');
const wissen = require('./lib/wissen');
const bildschirm = require('./lib/bildschirm');
const kurani = require('./lib/kurani');
const crm = require('./lib/crm');
const { sprechbar } = require('./lib/sprechtext');

ladeEnv();

const DEMO = process.argv.includes('--demo');
const PORT = parseInt(process.env.SPRACH_PORT || '3400', 10);
const HOST = process.env.SPRACH_HOST || '127.0.0.1';
const REPO = path.join(__dirname, '..');
// Zwei Modelle statt eines Kompromisses: eins zum Reden (muss schnell
// antworten), eins zum Arbeiten (muss richtig liegen). Welches drankommt,
// entscheidet die Aufgabe - siehe befehle.modellFuer.
const MODELL = process.env.SPRACH_MODELL || 'haiku';
const MODELL_ARBEIT = process.env.SPRACH_MODELL_ARBEIT || 'sonnet';
const BUDGET = process.env.SPRACH_BUDGET_USD === '' ? '' : (process.env.SPRACH_BUDGET_USD || '3');
const ZEITLIMIT = parseInt(process.env.SPRACH_ZEITLIMIT || '300', 10);
const FREIE_HAND = /^(ja|yes|1|true)$/i.test(process.env.SPRACH_FREIE_HAND || '');
const MAX_SAETZE = parseInt(process.env.SPRACH_MAX_SAETZE || '4', 10);
// Weckwort: leer = er reagiert auf jedes Wort (nur sinnvoll, wenn du
// allein im Raum bist). Standard "kurani" - dann schlaeft er, bis sein
// Name faellt, und das Gespraech nebenan bleibt privat.
const WECKWORT = process.env.SPRACH_WECKWORT === '' ? '' : (process.env.SPRACH_WECKWORT || 'kurani');
const NACHLAUF = parseInt(process.env.SPRACH_NACHLAUF || '25', 10);
// Notbremse fuer den Geldbeutel: mehr als so viel Dollar am Tag nicht.
const TAGESLIMIT = parseFloat(process.env.SPRACH_TAGESLIMIT_USD || '10');
// Wache: alle wieviel Minuten wird geprueft, ob kiekmolin.de laeuft?
// 0 schaltet sie ab.
const WACHE_MINUTEN = parseInt(process.env.SPRACH_WACHE_MINUTEN || '10', 10);
// Zusaetzliche Ordner, die der Assistent lesen und anfassen darf - egal in
// welchem Arbeitsordner er gerade steht. SPRACH_ALLES=ja gibt das ganze
// Benutzerverzeichnis frei ("Zugriff auf alles").
const ZUSATZ_ORDNER = (process.env.SPRACH_ZUSATZ_ORDNER || '')
  .split(',').map((p) => p.trim()).filter(Boolean)
  .map((p) => befehle.pfadAusfuellen(p, REPO));
if (/^(ja|yes|1|true)$/i.test(process.env.SPRACH_ALLES || '')) ZUSATZ_ORDNER.push(require('os').homedir());

// Die Kurani-Unterlagen (Kundenordner, Druckdaten, CLAUDE.md-Regeln)
// werden automatisch gesucht und freigegeben - dafuer soll Ibo keine
// Pfade eintippen muessen.
const KURANI = kurani.finde();
for (const ort of KURANI.ordner) {
  if (ZUSATZ_ORDNER.indexOf(ort) === -1) ZUSATZ_ORDNER.push(ort);
}

// Das CM (Ibos eigene Kundenverwaltung, laeuft auf diesem Rechner): der
// Assistent soll hineinschauen koennen, statt nach Dingen zu fragen, die
// dort schon stehen. Der Ordner der Daten wird freigegeben - lesend
// reicht, geaendert wird im CM selbst.
const CRM = crm.finde();
for (const quelle of CRM.quellen) {
  if (quelle.art !== 'datei' && quelle.art !== 'datenbank') continue;
  const ordner = path.dirname(quelle.pfad);
  if (ZUSATZ_ORDNER.indexOf(ordner) === -1) ZUSATZ_ORDNER.push(ordner);
}

const ordnerKonfig = befehle.ladeOrdnerKonfig(REPO);

// Fertige Werkzeuge, von denen der Assistent wissen muss - sonst baut er
// sich beim naechsten "wie lief das Reel?" eine eigene Loesung zusammen.
const WERKZEUGE = [
  'Fuer Wetter und die Zahlen von heute (Reservierungen, Bestellungen, Rueckrufe, ' +
  'Telefon-Retter, faellige Notizen) gibt es ein fertiges Werkzeug: node ' +
  path.join(__dirname, 'tagesbericht.js') + ' (oder --json, oder "abend" fuer den ' +
  'Rueckblick auf heute). Nutze es, statt selbst Wetterdienste oder die Datenbank anzufragen.',

  'Ibos Merkzettel liegt in node ' + path.join(__dirname, 'notizen.js') +
  ' (liste|heute|merk "..."|erledigt <id>). Wenn er im Gespraech sagt, dass er etwas ' +
  'nicht vergessen will, leg es dort ab - und sag in einem Halbsatz, dass du es notiert hast.',

  'Der Beweis-Zettel (was hat der Kunde fuer sein Geld bekommen): node ' +
  path.join(__dirname, 'beweis.js') + ' [kunde] [--html]. Ohne --html nur Text. ' +
  'Mit --html entsteht ein Blatt zum Ausdrucken - das schreibt Dateien, also vorher fragen.',

  'Fuer Marktfragen (welche Gastro-Art lohnt sich, wen anrufen, wo ist Luft): node ' +
  path.join(__dirname, 'markt.js') + ' bzw. "anrufe [ort]". Grundlage ist prospects.json ' +
  'aus dem OSM-Importer. Die Bewertung je Segment steht offen im Code - nenne sie als ' +
  'Einschaetzung, nicht als Marktforschung.',

  'Vor einem Kundenanruf gibt es ein fertiges Briefing: node ' +
  path.join(__dirname, 'briefing.js') + ' <name> [--sprich|--json]. Das traegt CM, ' +
  'Agentur-Ampel, Monatszahlen und Saison zusammen und nennt Aufhaenger, Warnung und ' +
  'Vorschlag. Sagt Ibo, dass er gleich jemanden anruft, nutze es - bau dir das nicht selbst zusammen.',

  'Ibos eigenes CM (wer ist Kunde, was ist vereinbart, wer ist wiedervorzulegen): node ' +
  path.join(__dirname, 'crm.js') + ' (kunde <name>|faellig|still|liste|quellen|--json). ' +
  'Das liest nur. Frag NICHT nach Kundendaten, die dort schon stehen - guck nach. ' +
  'Eintragen und aendern macht Ibo im CM selbst.',

  'Fuer die KI-Agentur (Kundenampel, fehlende Monats-Reports, Neukunden-Pipeline): node ' +
  path.join(__dirname, 'agentur.js') + ' (oder "kunden", oder --json). Das liest nur. ' +
  'Reports ERZEUGEN laeuft ueber die Agentur-App (cd agentur && node server.js) bzw. ' +
  'cd sichtbarkeit && node sichtbarkeit.js - das kostet Geld und dauert, also vorher fragen.'
];
if (process.env.INSTAGRAM_TOKEN) {
  WERKZEUGE.push(
    'Fuer Instagram gibt es ebenfalls ein Werkzeug: node ' + path.join(__dirname, 'instagram.js') +
    ' konto|beitraege|zahlen|kommentare|antworte|poste. ' +
    'Vor dem Veroeffentlichen eines Reels IMMER den Text vorlesen und bestaetigen lassen.'
  );
}
const WERKZEUG_HINWEIS = WERKZEUGE.join(' ');

// Der System-Zusatz wird bei JEDEM Auftrag frisch gebaut: das dauerhafte
// Wissen kann sich mitten im Gespraech geaendert haben ("merk dir
// dauerhaft ...") und soll dann sofort gelten.
function systemZusatz() {
  const dauerhaft = wissen.alsSystemZusatz();
  return befehle.systemZusatz([WERKZEUG_HINWEIS, KURANI.hinweis, CRM.hinweis, dauerhaft].filter(Boolean).join(' '));
}

// Gedaechtnis: pro Arbeitsordner eine laufende Claude-Sitzung. So kann Ibo
// nachfragen ("und jetzt auch fuer Mai") ohne alles zu wiederholen -
// und ein Wechsel des Ordners vermischt trotzdem nichts.
const sitzungen = new Map();     // ordnerName -> sessionId
const laufende = new Map();      // auftragsId -> { abbrechen }
// Zustand der Sofort-Befehle im Knopf-Betrieb (laufendes Diktat).
const knopfZustand = { diktat: null };

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

// Welche Stimme spricht gerade - fuer die Fusszeile im Fenster und die
// Startmeldung. Bei den Mac-Stimmen ist der Name die Auskunft ("Anna"),
// bei ElevenLabs die Kennung nicht - da reicht der Dienst.
function stimmName() {
  const a = stimmen.aktuelle();
  if (!a || stimmen.welcherWeg() === 'browser') return null;
  return a.art === 'mac' ? a.name : 'ElevenLabs';
}

function stimmText() {
  if (DEMO) return 'Browser (Demo)';
  const weg = stimmen.welcherWeg();
  if (weg === 'mac') return stimmName() + ' (Mac, kostet nichts)';
  if (weg === 'elevenlabs') return 'ElevenLabs';
  return 'Browser - eine bessere aussuchen: node stimmen.js hoeren';
}

function ordnerNach(name) {
  return ordnerKonfig.ordner.find((o) => o.name === name) || null;
}

// Ist das Tagesbudget aufgebraucht? Gibt den Satz zurueck, der dann
// gesprochen wird - oder null, wenn alles in Ordnung ist.
function budgetGesperrt() {
  if (!TAGESLIMIT) return null;
  const heute = protokoll.tagesKosten();
  if (heute < TAGESLIMIT) return null;
  return 'Ich habe heute schon ' + heute.toFixed(2).replace('.', ',') +
    ' Dollar verbraucht und mache erst mal Schluss. Das Tageslimit steht in der Punkt-E-N-V.';
}

// Aus dem Gesagten den Auftrag machen: Schnellbefehle sind fertig
// ausformulierte Aufgaben fuer Saetze, die Ibo jeden Tag sagt.
const WERKZEUG_PFADE = {
  tagesbericht: path.join(__dirname, 'tagesbericht.js'),
  instagram: path.join(__dirname, 'instagram.js'),
  agentur: path.join(__dirname, 'agentur.js'),
  crm: path.join(__dirname, 'crm.js'),
  briefing: path.join(__dirname, 'briefing.js'),
  markt: path.join(__dirname, 'markt.js'),
  saison: path.join(__dirname, 'saison.js'),
  beweis: path.join(__dirname, 'beweis.js')
};

function auftragsText(gesagt, zustand) {
  // "Mach das fertig": aus dem eben Diktierten oder Gesagten wird das
  // richtige Dokument - mit den Skills, im richtigen Kundenordner.
  const u = befehle.willUebergeben(gesagt);
  if (u.uebergeben) {
    return befehle.uebergabeAuftrag({
      quelleDatei: zustand && zustand.letztesDiktat,
      quelleText: zustand && zustand.letzterSatz,
      zusatz: u.zusatz
    });
  }
  const schnell = befehle.schnellbefehl(gesagt, null, WERKZEUG_PFADE);
  return schnell ? schnell.prompt : gesagt;
}

// "Guck dir das an": erst ein Foto vom Bildschirm, dann geht der Auftrag
// MIT dem Bild an Claude. Das Foto entsteht nur auf diese Ansage hin.
async function mitBildschirm(gesagt) {
  const wunsch = befehle.willBildschirm(gesagt);
  if (!wunsch.bildschirm) return { text: gesagt, bild: null };

  try {
    const pfad = await bildschirm.machFoto();
    return {
      bild: pfad,
      text: 'Sieh dir das Bildschirmfoto an: ' + pfad + '\n\n' +
        'Ibo sagt dazu: "' + gesagt + '"\n\n' +
        'Geht es um Gestaltung (Layout, Schrift, Abstaende, Farben), nimm den ' +
        'Skill kurani-taste und sag die zwei, drei Sachen, die es am meisten ' +
        'heben - konkret, nicht allgemein. Geht es um etwas anderes (Fehlermeldung, ' +
        'Zahlen, ein Programm), beantworte einfach, was er wissen will. ' +
        'Hoechstens drei Saetze, gesprochen.'
    };
  } catch (e) {
    return { text: gesagt, bild: null, fehler: e.message };
  }
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

  // Notiz, Liste, Diktat: das macht der Server selbst - ohne KI, ohne
  // Kosten, ohne Wartezeit.
  const direkt = sofort.behandle(text, knopfZustand);
  if (!direkt) knopfZustand.letzterSatz = text;   // Anknuepfung fuer "mach das fertig"
  if (direkt) {
    if (direkt.still) {
      sende({ art: 'fertig', text: '', sprich: '', still: true });
    } else {
      protokoll.schreibe({ frage: text, antwort: direkt.antwort, ordner: '-', stufe: direkt.art, kosten: 0, sekunden: 0, demo: DEMO });
      sende({ art: 'fertig', text: direkt.antwort, sprich: direkt.antwort, kosten: 0, sekunden: 0 });
    }
    return res.end();
  }

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

  const gesperrt = DEMO ? null : budgetGesperrt();
  if (gesperrt) {
    sende({ art: 'fehler', text: gesperrt, sprich: gesperrt });
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

  // "Guck dir das an": erst das Bildschirmfoto, dann der Auftrag mit Bild.
  const wunschBild = befehle.willBildschirm(text).bildschirm;
  if (wunschBild) sende({ art: 'werkzeug', text: 'macht ein Bildschirmfoto' });

  const starte = (prompt) => kopf.starteAuftrag({
    prompt: prompt,
    ordner: ordner.pfad,
    stufe: stufe,
    sitzung: sitzungen.get(ordner.name) || null,
    system: systemZusatz(),
    modell: befehle.modellFuer(text, {
      uebergeben: befehle.willUebergeben(text).uebergeben,
      bildschirm: wunschBild,
      schnellbefehl: !!befehle.schnellbefehl(text, null, WERKZEUG_PFADE)
    }, MODELL, MODELL_ARBEIT),
    budget: BUDGET,
    zeitlimit: ZEITLIMIT,
    zusatzOrdner: ZUSATZ_ORDNER,
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

  // Ohne Bildwunsch sofort los; mit Bild erst das Foto, dann der Auftrag.
  let lauf;
  if (wunschBild) {
    let echt = null;
    let abgesagt = false;
    lauf = { abbrechen() { abgesagt = true; if (echt) echt.abbrechen(); } };
    mitBildschirm(text).then((vorbereitet) => {
      if (abgesagt) return;
      if (vorbereitet.fehler) {
        laufende.delete(auftragsId);
        sende({ art: 'fehler', text: vorbereitet.fehler, sprich: vorbereitet.fehler });
        return res.end();
      }
      echt = starte(vorbereitet.text);
    });
  } else {
    lauf = starte(auftragsText(text, knopfZustand));
  }

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

// ---------------------------------------------------------- Live-Modus ----

// Ein offenes Fenster im Live-Modus: Mikrofon laeuft durch, Deepgram
// schickt laufend Text, Claude antwortet in Schnipseln, gesprochen wird
// Satz fuer Satz. Alles ueber EINE WebSocket-Leitung.
function liveVerbindung(ws, req) {
  if (!vonHier(req)) return ws.close(1008, 'Nur vom eigenen Rechner');

  const senden = (n) => {
    try { if (ws.readyState === 1) ws.send(JSON.stringify(n)); } catch (_e) { /* Fenster zu */ }
  };
  const einstellung = { ordner: null, stufe: 'arbeiten' };

  const sitzung = new live.LiveSitzung({
    senden: senden,
    maxSaetze: MAX_SAETZE,
    weckwort: WECKWORT,
    nachlauf: NACHLAUF,
    spreche: async (satz) => {
      if (DEMO || stimmen.welcherWeg() === 'browser') return null;   // Browser spricht
      return stimme.spreche(satz);
    },
    starteAuftrag: (o) => {
      const gewaehlt = einstellung.ordner ? ordnerNach(einstellung.ordner) : null;
      const ordner = gewaehlt || befehle.waehleOrdner(o.prompt, ordnerKonfig);
      const stufenName = befehle.stufeAufloesen(einstellung.stufe, FREIE_HAND);
      senden({ typ: 'ordner', name: ordner.name, stufe: stufenName });

      const gesperrt = DEMO ? null : budgetGesperrt();
      if (gesperrt) {
        setTimeout(() => o.onEreignis({ art: 'fehler', text: gesperrt }), 0);
        return { abbrechen() {} };
      }

      if (!fs.existsSync(ordner.pfad)) {
        setTimeout(() => o.onEreignis({
          art: 'fehler',
          text: 'Den Ordner ' + ordner.name + ' finde ich nicht. Trag den richtigen Pfad in ordner.json ein.'
        }), 0);
        return { abbrechen() {} };
      }

      const beginn = Date.now();
      const weiter = (e) => {
        if (e.art === 'start') sitzungen.set(ordner.name, e.sitzung);
        if (e.art === 'fertig') {
          protokoll.schreibe({
            frage: o.prompt, antwort: e.text || '', ordner: ordner.name, stufe: stufenName,
            kosten: e.kosten || 0, sekunden: Math.round((Date.now() - beginn) / 1000),
            live: true, demo: DEMO
          });
        }
        o.onEreignis(e);
      };

      if (DEMO) return demoAuftrag(o.prompt, ordner, weiter);

      const bauen = (prompt) => kopf.starteAuftrag({
        prompt: prompt,
        ordner: ordner.pfad,
        stufe: befehle.STUFEN[stufenName],
        sitzung: sitzungen.get(ordner.name) || null,
        system: systemZusatz(),
        // Im Gespraech zaehlt, dass die Antwort KOMMT. Erst wenn wirklich
        // gearbeitet wird, lohnt das gruendliche Modell. Erkannt wird das
        // am gesprochenen Satz - o.prompt ist hier noch das Original.
        modell: befehle.modellFuer(o.prompt, {
          uebergeben: befehle.willUebergeben(o.prompt).uebergeben,
          hintergrund: o.live === false,        // Hintergrund-Auftraege: keiner wartet
          bildschirm: befehle.willBildschirm(o.prompt).bildschirm,
          schnellbefehl: !!befehle.schnellbefehl(o.prompt, null, WERKZEUG_PFADE)
        }, MODELL, MODELL_ARBEIT),
        budget: BUDGET,
        zeitlimit: ZEITLIMIT,
        zusatzOrdner: ZUSATZ_ORDNER,
        live: true,
        onEreignis: weiter
      });

      // "Guck dir das an": erst das Foto, dann der Auftrag mit Bild.
      if (!befehle.willBildschirm(o.prompt).bildschirm) return bauen(auftragsText(o.prompt, sitzung.eigenerZustand));

      senden({ typ: 'werkzeug', text: 'macht ein Bildschirmfoto' });
      let echt = null;
      let abgesagt = false;
      mitBildschirm(o.prompt).then((vorbereitet) => {
        if (abgesagt) return;
        if (vorbereitet.fehler) return weiter({ art: 'fehler', text: vorbereitet.fehler });
        echt = bauen(vorbereitet.text);
      });
      return { abbrechen() { abgesagt = true; if (echt) echt.abbrechen(); } };
    }
  });

  let ohrLeitung = null;
  if (!DEMO && process.env.DEEPGRAM_API_KEY) {
    try {
      ohrLeitung = new live.LiveOhr({
        onZwischen: (t) => sitzung.zwischenstand(t),
        onSatz: (t) => sitzung.gehoert(t),
        onFehler: (e) => senden({ typ: 'fehler', text: 'Zuhoeren gestoert: ' + e.message }),
        onLage: (l) => senden({ typ: 'leitung', lage: l })
      });
    } catch (e) {
      senden({ typ: 'fehler', text: e.message });
    }
  }

  senden({
    typ: 'bereit',
    hoeren: ohrLeitung ? 'deepgram' : 'browser',
    demo: DEMO,
    weckwort: WECKWORT,
    schlaeft: !!WECKWORT
  });

  ws.on('message', (daten, istBinaer) => {
    if (istBinaer) {                       // Mikrofon-Schnipsel
      if (ohrLeitung) ohrLeitung.sendeAudio(daten);
      return;
    }
    let n;
    try { n = JSON.parse(daten.toString()); } catch (_e) { return; }

    if (n.typ === 'einstellung') {
      if ('ordner' in n) einstellung.ordner = n.ordner || null;
      if (n.stufe) einstellung.stufe = n.stufe;
      return;
    }
    // Getippt ist immer gewollt - kein Weckwort noetig.
    if (n.typ === 'text') {
      sitzung.schlaeft = false;
      sitzung.wachHalten();
      return sitzung.gehoert(n.text);
    }
    // Gehoert (Browser-Spracherkennung): laeuft durch dieselbe Weckwort-
    // Pruefung wie Deepgram - sonst wuerde ohne Deepgram jedes Wort im
    // Raum zum Auftrag.
    if (n.typ === 'gehoert') return sitzung.gehoert(n.text);
    if (n.typ === 'schlafen') return sitzung.einschlafen();
    if (n.typ === 'aufwachen') { sitzung.schlaeft = false; sitzung.wachHalten(); return senden({ typ: 'wach' }); }
    if (n.typ === 'zwischen') return sitzung.zwischenstand(n.text);
    if (n.typ === 'unterbrechung') return sitzung.unterbrich('unterbrochen');
    if (n.typ === 'stopp') return sitzung.unterbrich('gestoppt');
    if (n.typ === 'neu') { sitzungen.clear(); return senden({ typ: 'neu' }); }
  });

  // Wache: laeuft kiekmolin.de noch? Gemeldet wird nur die AENDERUNG -
  // "alles gut" alle zehn Minuten will keiner hoeren.
  let wacheStand = null;
  const wacheTakt = WACHE_MINUTEN ? setInterval(async () => {
    try {
      const ergebnis = await wache.pruefe();
      const meldung = wache.meldungBeiAenderung(wacheStand, ergebnis);
      wacheStand = ergebnis.ok;
      if (meldung) {
        senden({ typ: 'wache', text: meldung, ok: ergebnis.ok });
        sitzung.melde(meldung);
      }
    } catch (_e) { /* Netz weg - beim naechsten Mal wieder */ }
  }, WACHE_MINUTEN * 60000) : null;

  // Faellige Erinnerungen von selbst melden. Einmal pro Minute reicht -
  // und jede Erinnerung genau einmal, sonst nervt sie im Minutentakt.
  const erinnerungsTakt = setInterval(() => {
    let faellig;
    try { faellig = notizen.faelligBis().filter((n) => !n.erinnert); } catch (_e) { return; }
    if (!faellig.length) return;
    notizen.alsErinnertMarkieren(faellig.map((n) => n.id));
    const satz = faellig.length === 1
      ? 'Erinnerung: ' + faellig[0].text + '.'
      : 'Zwei Erinnerungen: ' + faellig.slice(0, 2).map((n) => n.text).join('. ') + '.';
    senden({ typ: 'erinnerung', text: satz });
    sitzung.melde(satz);
  }, 60000);

  ws.on('close', () => {
    clearInterval(erinnerungsTakt);
    if (wacheTakt) clearInterval(wacheTakt);
    sitzung.schliessen();
    if (ohrLeitung) ohrLeitung.schliessen();
  });
}

// Vorfuehr-Auftrag fuer den Live-Modus: schickt die Antwort in Schnipseln,
// damit sich der Ablauf ohne Schluessel und ohne Kosten anfuehlen laesst.
function demoAuftrag(prompt, ordner, onEreignis) {
  const antwort = demoAntwort(prompt, ordner);
  const teile = antwort.split(/(?<=\s)/);       // wortweise, mit Leerzeichen
  let i = 0;
  let tot = false;
  const takt = setInterval(() => {
    if (tot) return;
    if (i < teile.length) { onEreignis({ art: 'happen', text: teile[i++] }); return; }
    clearInterval(takt);
    onEreignis({ art: 'fertig', text: antwort, kosten: 0 });
  }, 60);
  setTimeout(() => { if (!tot) onEreignis({ art: 'werkzeug', text: 'liest Notizen (Demo)' }); }, 80);
  return { abbrechen() { tot = true; clearInterval(takt); } };
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
        stimme: DEMO ? 'browser' : stimmen.welcherWeg(),
        stimmeName: DEMO ? null : stimmName(),
        modell: MODELL,
        freieHand: FREIE_HAND,
        live: liveBereit,
        weckwort: WECKWORT,
        tageslimit: TAGESLIMIT,
        alles: ZUSATZ_ORDNER.length > 0,
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
      const gesprochen = await stimme.spreche(String(text).slice(0, 1200));
      res.writeHead(200, { 'Content-Type': gesprochen.art, 'Content-Length': gesprochen.ton.length });
      return res.end(gesprochen.ton);
    }

    if (req.method === 'GET' && pfad === '/api/kosten') {
      const heute = protokoll.tagesKosten();
      return json(res, 200, {
        heute: heute,
        limit: TAGESLIMIT,
        gesperrt: !!(TAGESLIMIT && heute >= TAGESLIMIT)
      });
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

// Live-Leitung anhaengen. Fehlt das ws-Paket, laeuft alles andere weiter -
// dann eben nur der Knopf-Betrieb.
let liveBereit = false;
try {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ server: server, path: '/live', maxPayload: 4 * 1024 * 1024 });
  wss.on('connection', liveVerbindung);
  liveBereit = true;
} catch (e) {
  console.error('  ! Live-Modus aus: ' + e.message + '  (im Ordner sprachassistent: npm install)');
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  KURANI · Sprachassistent' + (DEMO ? '  (Demo)' : ''));
  console.log('  ------------------------------------------------');
  console.log('  Fenster:  http://localhost:' + PORT);
  console.log('  Hoeren:   ' + ((!DEMO && process.env.DEEPGRAM_API_KEY) ? 'Deepgram' : 'Browser (kein Schluessel noetig)'));
  console.log('  Stimme:   ' + stimmText());
  console.log('  Modell:   ' + MODELL + ' zum Reden, ' + MODELL_ARBEIT + ' zum Arbeiten' +
    (BUDGET ? '  (max. ' + BUDGET + ' USD pro Auftrag)' : ''));
  console.log('  Live:     ' + (liveBereit ? 'an (durchgehend zuhoeren, unterbrechen)' : 'aus - npm install fehlt'));
  console.log('  Ordner:   ' + ordnerKonfig.ordner.map((o) => o.name).join(', '));
  if (ZUSATZ_ORDNER.length) console.log('  Zugriff:  zusaetzlich ' + ZUSATZ_ORDNER.join(', '));
  if (KURANI.ordner.length) {
    console.log('  Kurani:   ' + KURANI.ordner.length + ' Ordner, ' + KURANI.claudeDateien.length + ' CLAUDE.md gefunden');
  }
  if (FREIE_HAND) console.log('  ! Freie Hand ist erlaubt: der Assistent darf alles ausfuehren.');
  if (!NUR_HIER) console.log('  ! Achtung: erreichbar unter ' + HOST + ' - dieser Server darf Dateien aendern.');
  console.log('');
});

module.exports = { server, demoAntwort };
