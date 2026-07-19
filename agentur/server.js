#!/usr/bin/env node
'use strict';

// KURANI · AGENTUR-APP
// Web-Oberflaeche fuer die KI-Agentur: Kunden sehen, Reports per Klick
// erzeugen, Historie durchblaettern, Telefon-Retter im Blick behalten.
//
// Nutzt die Bausteine sichtbarkeit/ und telefon-retter/ als Motor -
// gleiche Logik, keine Kopien. Die Kiek-mol-in-App bleibt unangetastet.
//
//   node server.js            echte Datenbank (liest sichtbarkeit/.env)
//   node server.js --demo     Beispieldaten, ohne Keys/Netz testbar
//
// Dann im Browser: http://localhost:3200

const http = require('http');
const fs = require('fs');
const path = require('path');

// Motor aus dem Sichtbarkeit-Baustein wiederverwenden
const { ladeEnv } = require('../sichtbarkeit/lib/env');
const supabase = require('../sichtbarkeit/lib/supabase');
const { suchfragen } = require('../sichtbarkeit/lib/fragen');
const report = require('../sichtbarkeit/lib/report');
const aufbereitung = require('../sichtbarkeit/lib/aufbereitung');
const { telefonZahlen } = require('../sichtbarkeit/lib/telefonzahlen');
const { sollAutoLaufen, naechsterAutoLauf, werteStatistikAus, istDigestFaellig } = require('./lib/automatik');
const { bauePitchHtml } = require('./lib/pitch');
const { bewerteKunde } = require('./lib/gesundheit');
const versand = require('./lib/versand');
const gbpPosts = require('../sichtbarkeit/lib/gbp-posts');
const { baueKundenUpdate } = require('./lib/kunden-update');
// Rueckruf-Wuensche verwaltet das Telefon-Retter-Datenmodul (eigene Tabelle)
const telefonDb = require('../telefon-retter/lib/supabase');
// Anruf-Demo: das "Denken" des Telefon-Retters direkt im Browser vorfuehren
const { DialogSitzung } = require('../telefon-retter/lib/dialog');

ladeEnv(); // liest sichtbarkeit/.env
// Zusaetzlich telefon-retter/.env: dort liegen die Stimm-Schluessel
// (ElevenLabs/Deepgram) fuer die Sprach-Demo im Browser.
require('../telefon-retter/lib/env').ladeEnv();

const PORT = parseInt(process.env.AGENTUR_PORT || '3200', 10);
const DEMO = process.argv.includes('--demo');
const SICHT_ORDNER = path.join(__dirname, '..', 'sichtbarkeit');
const REPORT_ORDNER = path.join(SICHT_ORDNER, 'reports');
const DATEN_ORDNER = path.join(SICHT_ORDNER, 'data');
const AUFBEREITUNG_ORDNER = path.join(SICHT_ORDNER, 'aufbereitung');
const TELEFON_LOGS = path.join(__dirname, '..', 'telefon-retter', 'logs');
const TELEFON_URL = process.env.TELEFON_URL || 'http://localhost:3100';
// Monats-Automatik: an diesem Monatstag laufen die Reports fuer ALLE Kunden
// von selbst (1-28; 0 = Automatik aus). Der Demo-Modus hat eine EIGENE
// Statusdatei, damit ein Demo-Lauf den echten Monatslauf nicht verschluckt.
const AUTO_TAG = Math.min(28, parseInt(process.env.AUTO_REPORT_TAG || '1', 10) || 0);
const AUTO_DATEI = path.join(DATEN_ORDNER, (DEMO ? 'demo-' : '') + 'auto-lauf.json');
const DIGEST_DATEI = path.join(DATEN_ORDNER, (DEMO ? 'demo-' : '') + 'digest-stand.json');
const PITCH_ORDNER = path.join(__dirname, 'pitches');  // Interessenten-Pitches
const PROSPECTS_DATEI = path.join(__dirname, '..', 'prospects.json');

// ---------------------------------------------------------------- Hilfen ----
function slugVon(restaurant) {
  return restaurant.slug || String(restaurant.name || 'betrieb')
    .toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Im Demo-Modus bekommen Historie & Reports ein 'demo-'-Praefix, damit
// Demo-Ergebnisse NIE mit der echten Kunden-Historie vermischt werden
// (sonst wuerde der erste echte Report gegen Fake-Daten vergleichen).
function effektiverSlug(restaurant) {
  return (DEMO ? 'demo-' : '') + slugVon(restaurant);
}

function json(res, status, daten) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(daten));
}

function leseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (_e) { resolve({}); } });
  });
}

// Rohdaten (z.B. Mikrofon-Aufnahme) einsammeln - mit Groessen-Deckel
function leseRohBody(req, maxBytes) {
  return new Promise((resolve) => {
    const teile = [];
    let gesamt = 0;
    req.on('data', (d) => {
      gesamt += d.length;
      if (gesamt <= (maxBytes || 8 * 1024 * 1024)) teile.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(teile)));
  });
}

// ------------------------------------------------------------ Datenquelle ----
async function ladeKunden() {
  if (DEMO) {
    const demo = JSON.parse(fs.readFileSync(path.join(SICHT_ORDNER, 'demo', 'demo-daten.json'), 'utf8'));
    const boerse = JSON.parse(fs.readFileSync(path.join(SICHT_ORDNER, 'kunden', 'greetsieler-boerse.json'), 'utf8'));
    return [
      demo.restaurant,
      { id: boerse.restaurant_id, name: boerse.name, city: 'Greetsiel', cuisine: 'norddeutsch, fisch', slug: 'greetsieler-boerse' }
    ];
  }
  return supabase.alleRestaurants();
}

async function findeKunde(kennung) {
  const alle = await ladeKunden();
  const s = String(kennung).toLowerCase();
  return alle.find((r) => String(r.id) === String(kennung)) ||
    alle.find((r) => (r.slug || '').toLowerCase() === s) ||
    alle.find((r) => (r.name || '').toLowerCase().includes(s)) || null;
}

// Umsatz-Nachweis des Telefon-Retters fuer einen Kunden und Monat.
// Im Demo-Modus feste Beispielzahlen, damit man die Ansicht ohne Keys sieht.
async function kundenTelefonZahlen(kunde, monat) {
  if (DEMO) {
    const demo = JSON.parse(fs.readFileSync(path.join(SICHT_ORDNER, 'demo', 'demo-daten.json'), 'utf8'));
    return Object.assign({ monat }, demo.telefon || {});
  }
  return telefonZahlen(kunde.id, monat);
}

// Historie + vorhandene Report-Dateien eines Kunden
function kundenHistorie(slug) {
  const eintraege = [];
  const ordner = path.join(DATEN_ORDNER, slug);
  if (fs.existsSync(ordner)) {
    for (const datei of fs.readdirSync(ordner).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().reverse()) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
        eintraege.push({
          monat: d.monat,
          label: report.monatsLabel(d.monat),
          quote: d.quote,
          telefon: d.telefon || null,
          erstellt: d.erstellt,
          html: dateiFallsVorhanden(slug + '-' + d.monat + '.html'),
          pdf: dateiFallsVorhanden(slug + '-' + d.monat + '.pdf')
        });
      } catch (_e) { /* kaputte Datei ueberspringen */ }
    }
  }
  return eintraege;
}

// Aufbereitung (Teil A) fuer einen Kunden erzeugen - inkl. der monatlichen
// Google-Business-Beitraege und Bewertungs-Antworten (Marketing to go).
async function erzeugeAufbereitung(kunde) {
  let menue = [];
  if (DEMO) {
    menue = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'telefon-retter', 'demo', 'demo-daten.json'), 'utf8')).speisekarte;
  } else {
    menue = await supabase.speisekarte(kunde.id);
  }
  const slug = effektiverSlug(kunde);
  const ordner = path.join(AUFBEREITUNG_ORDNER, slug);
  fs.mkdirSync(ordner, { recursive: true });
  const jsonLd = aufbereitung.baueJsonLd(kunde, menue);
  fs.writeFileSync(path.join(ordner, 'schema.jsonld'), JSON.stringify(jsonLd, null, 2));
  fs.writeFileSync(path.join(ordner, 'jsonld-snippet.html'),
    '<script type="application/ld+json">\n' + JSON.stringify(jsonLd, null, 2) + '\n</script>\n');
  fs.writeFileSync(path.join(ordner, 'beschreibung.txt'), aufbereitung.baueBeschreibung(kunde) + '\n');
  fs.writeFileSync(path.join(ordner, 'speisekarte.txt'), aufbereitung.baueSpeisekartenText(kunde, menue) + '\n');
  fs.writeFileSync(path.join(ordner, 'google-business-checkliste.md'), aufbereitung.baueGbpCheckliste(kunde));
  fs.writeFileSync(path.join(ordner, 'google-posts.md'),
    gbpPosts.bauePostsMarkdown(Object.assign({}, kunde, { slug: slugVon(kunde) }), menue, { monat: new Date().getMonth() + 1 }));
  return { ok: true, dateien: fs.readdirSync(ordner), ordner: 'sichtbarkeit/aufbereitung/' + slug };
}

// Neuesten Report eines Kunden per E-Mail an den Wirt schicken.
async function sendeNeuestenReport(kunde) {
  if (!versand.istKonfiguriert()) return { ok: false, fehler: 'RESEND_API_KEY fehlt in sichtbarkeit/.env' };
  const an = kunde.email;
  if (!an) return { ok: false, fehler: 'Keine E-Mail-Adresse beim Kunden hinterlegt' };
  const slug = effektiverSlug(kunde);
  const historie = kundenHistorie(slug);
  const neuester = historie[0];
  if (!neuester) return { ok: false, fehler: 'Noch kein Report vorhanden - erst erzeugen' };
  const mail = versand.baueReportMail({
    kunde, monatLabel: neuester.label, quote: neuester.quote, telefon: neuester.telefon
  });
  const pdfPfad = path.join(REPORT_ORDNER, slug + '-' + neuester.monat + '.pdf');
  const htmlPfad = path.join(REPORT_ORDNER, slug + '-' + neuester.monat + '.html');
  const anhang = fs.existsSync(pdfPfad) ? pdfPfad : (fs.existsSync(htmlPfad) ? htmlPfad : null);
  return versand.sendeReportMail({ an, betreff: mail.betreff, text: mail.text, html: mail.html, anhangPfad: anhang });
}

function dateiFallsVorhanden(name) {
  return fs.existsSync(path.join(REPORT_ORDNER, name)) ? '/reports/' + name : null;
}

function dateiInOrdner(ordner, name) {
  return fs.existsSync(path.join(ordner, name));
}

function pitchDateiname(prospect) {
  return String(prospect.name || 'betrieb')
    .toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.html';
}

// "Naechste Schritte" aus dem juengsten Report eines Kunden - dieselbe
// Logik wie im Report selbst, damit App und PDF eine Sprache sprechen.
function naechsteSchritteFuer(slug, kunde) {
  const ordner = path.join(DATEN_ORDNER, slug);
  if (!fs.existsSync(ordner)) return [];
  const dateien = fs.readdirSync(ordner).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
  if (!dateien.length) return [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ordner, dateien[dateien.length - 1]), 'utf8'));
    return d.ergebnis ? report.naechsteSchritte(d.ergebnis, kunde) : [];
  } catch (_e) { return []; }
}

// -------------------------------------------------- Report-Lauf (ein Kunde) ----
// Laufende Jobs, damit die Oberflaeche den Fortschritt anzeigen kann.
// Fertige Jobs werden nach 30 Minuten entsorgt (sonst waechst das Objekt ewig).
const jobs = {};
function jobAbschliessen(jobId, ergebnis) {
  jobs[jobId] = ergebnis;
  setTimeout(() => { delete jobs[jobId]; }, 30 * 60 * 1000);
}

async function starteReport(kunde) {
  const slug = effektiverSlug(kunde);
  const monat = report.monatsSchluessel();
  const jobId = slug + '-' + Date.now();
  jobs[jobId] = { status: 'laeuft', schritt: 'Suchfragen erzeugen', kunde: kunde.name };

  (async () => {
    try {
      const sf = suchfragen(kunde);
      let ergebnis;
      if (DEMO) {
        jobs[jobId].schritt = 'Demo-Ergebnisse laden';
        const demo = JSON.parse(fs.readFileSync(path.join(SICHT_ORDNER, 'demo', 'demo-daten.json'), 'utf8'));
        ergebnis = demo.ergebnis;
      } else {
        jobs[jobId].schritt = 'Checks laufen (Google, KI, Basis) - dauert je nach Keys 1-3 Minuten';
        ergebnis = await report.fuehreChecksAus(kunde, sf.fragen);
      }

      jobs[jobId].schritt = 'Telefon-Retter-Zahlen holen';
      const telefon = await kundenTelefonZahlen(kunde, monat);

      const vormonat = report.ladeVormonat(slug, monat);
      report.speichereHistorie(slug, monat, {
        monat, erstellt: new Date().toISOString(),
        restaurant: { name: kunde.name, city: kunde.city, slug },
        quote: report.quote(ergebnis), telefon, ergebnis
      });

      jobs[jobId].schritt = 'Report rendern';
      let verlauf = report.ladeVerlauf(slug, monat, { quote: report.quote(ergebnis), telefon });
      if (DEMO) {
        const demoV = JSON.parse(fs.readFileSync(path.join(SICHT_ORDNER, 'demo', 'demo-daten.json'), 'utf8')).verlauf;
        if (demoV) verlauf = demoV;
      }
      const html = report.renderHtml({ restaurant: kunde, kategorie: sf.kategorie, monat, ergebnis, vormonat, telefon, verlauf });
      fs.mkdirSync(REPORT_ORDNER, { recursive: true });
      const basis = slug + '-' + monat;
      fs.writeFileSync(path.join(REPORT_ORDNER, basis + '.html'), html);
      const pdfOk = report.htmlZuPdf(path.join(REPORT_ORDNER, basis + '.html'), path.join(REPORT_ORDNER, basis + '.pdf'));

      jobAbschliessen(jobId, {
        status: 'fertig', kunde: kunde.name,
        quote: report.quote(ergebnis),
        html: '/reports/' + basis + '.html',
        pdf: pdfOk ? '/reports/' + basis + '.pdf' : null
      });
    } catch (e) {
      jobAbschliessen(jobId, { status: 'fehler', kunde: kunde.name, fehler: e.message });
    }
  })();

  return jobId;
}

// Batch: Reports fuer ALLE Kunden nacheinander (die Monats-Routine per Klick
// oder per Automatik). mitVersand=true schickt jeden fertigen Report direkt
// per E-Mail an den Wirt - der komplette Monat laeuft dann ohne Handarbeit.
async function starteBatchReport(optionen) {
  const mitVersand = !!(optionen && optionen.mitVersand);
  const jobId = 'alle-' + Date.now();
  jobs[jobId] = { status: 'laeuft', schritt: 'Kundenliste laden', batch: true };

  (async () => {
    try {
      const kunden = await ladeKunden();
      const ergebnisse = [];
      for (let i = 0; i < kunden.length; i++) {
        const kunde = kunden[i];
        jobs[jobId].schritt = 'Kunde ' + (i + 1) + ' von ' + kunden.length + ': ' + kunde.name;
        try {
          const einzelJobId = await starteReport(kunde);
          // auf den Einzel-Job warten (Reports laufen bewusst nacheinander,
          // damit API-Limits und der kleine Server nicht ueberlastet werden)
          while (jobs[einzelJobId] && jobs[einzelJobId].status === 'laeuft') {
            await new Promise((r) => setTimeout(r, 1000));
          }
          const einzel = jobs[einzelJobId] || {};
          let mail = null;
          if (mitVersand && !DEMO && !einzel.fehler) {
            const gesendet = await sendeNeuestenReport(kunde);
            mail = gesendet.ok ? 'gesendet' : gesendet.fehler;
          }
          ergebnisse.push({ kunde: kunde.name, quote: einzel.quote || null, html: einzel.html || null, fehler: einzel.fehler || null, mail });
        } catch (e) {
          ergebnisse.push({ kunde: kunde.name, fehler: e.message });
        }
      }
      jobAbschliessen(jobId, { status: 'fertig', batch: true, ergebnisse });
    } catch (e) {
      jobAbschliessen(jobId, { status: 'fehler', batch: true, fehler: e.message });
    }
  })();

  return jobId;
}

// ------------------------------------------------- Monats-Automatik ----
// Einmal pro Monat (am AUTO_TAG) laufen die Reports fuer alle Kunden von
// selbst. Der letzte Lauf steht in data/auto-lauf.json, damit ein Neustart
// des Servers nicht zu Doppel-Laeufen fuehrt.
function liesAutoStand() {
  try { return JSON.parse(fs.readFileSync(AUTO_DATEI, 'utf8')); } catch (_e) { return {}; }
}

function schreibeAutoStand(stand) {
  try {
    fs.mkdirSync(DATEN_ORDNER, { recursive: true });
    fs.writeFileSync(AUTO_DATEI, JSON.stringify(stand, null, 2));
  } catch (_e) { /* dann laeuft es notfalls doppelt - besser als gar nicht */ }
}

async function pruefeAutomatik() {
  const jetzt = new Date();
  const stand = liesAutoStand();
  if (!sollAutoLaufen(jetzt, stand.letzterLaufMonat || null, AUTO_TAG)) return;
  // Stand SOFORT schreiben (nicht erst nach dem Lauf), sonst startet die
  // stuendliche Pruefung den Batch mehrfach parallel.
  schreibeAutoStand({ letzterLaufMonat: report.monatsSchluessel(jetzt), gestartet: jetzt.toISOString() });
  console.log('Monats-Automatik: starte Reports fuer alle Kunden (' + report.monatsLabel(report.monatsSchluessel(jetzt)) + ')' +
    (versand.istKonfiguriert() ? ' - Versand per E-Mail aktiv' : ' - kein E-Mail-Versand (RESEND_API_KEY fehlt)'));
  try { await starteBatchReport({ mitVersand: true }); } catch (e) { console.warn('Monats-Automatik fehlgeschlagen: ' + e.message); }
}

// ------------------------------------------------- Wochen-Digest ----
// Jeden Montag EINE Mail an dich (AGENTUR_EMAIL): Reports-Stand, Umsatz,
// offene Rueckrufe, Kunden in Gefahr. Du weisst Bescheid, ohne die App
// zu oeffnen - und rote Ampeln landen direkt auf deinem Tisch.
async function pruefeDigest() {
  const an = process.env.AGENTUR_EMAIL;
  if (DEMO || !an || !versand.istKonfiguriert()) return;
  let stand = {};
  try { stand = JSON.parse(fs.readFileSync(DIGEST_DATEI, 'utf8')); } catch (_e) { /* erster Lauf */ }
  const jetzt = new Date();
  if (!istDigestFaellig(jetzt, stand.letzterTag || null)) return;
  const heute = jetzt.getFullYear() + '-' + String(jetzt.getMonth() + 1).padStart(2, '0') + '-' + String(jetzt.getDate()).padStart(2, '0');
  try {
    fs.mkdirSync(DATEN_ORDNER, { recursive: true });
    fs.writeFileSync(DIGEST_DATEI, JSON.stringify({ letzterTag: heute }));
  } catch (_e) { /* dann kommt er notfalls doppelt */ }

  try {
    const u = await baueUebersicht();
    const kunden = await ladeKunden();
    const monat = report.monatsSchluessel();
    const rot = kunden.filter((k) => bewerteKunde({ historie: kundenHistorie(effektiverSlug(k)), aktuellerMonat: monat }).stufe === 'rot');
    const zeilen = [
      'Moin! Deine Agentur-Lage am Montag:',
      '',
      '- Kunden: ' + u.kunden,
      '- Reports diesen Monat: ' + u.reportsMonat + ' von ' + u.kunden + (u.reportsMonat < u.kunden ? ' (Rest kommt per Automatik am ' + u.automatik.tag + '.)' : ' - alle erledigt'),
      '- Telefon-Umsatz diesen Monat (alle Kunden, geschaetzt): ' + u.telefonUmsatz.toFixed(2).replace('.', ',') + ' EUR',
      '- Offene Rueckrufe: ' + u.offeneRueckrufe + (u.offeneRueckrufe ? ' -> heute abarbeiten!' : ''),
      '- Kunden in Gefahr (rote Ampel): ' + (rot.length ? rot.map((k) => k.name).join(', ') + ' -> heute anrufen!' : 'keine'),
      '',
      'Details wie immer in der Agentur-App (http://localhost:' + PORT + ').'
    ];
    const ergebnis = await versand.sendeReportMail({
      an,
      betreff: 'Wochen-Lage deiner Agentur · ' + jetzt.toLocaleDateString('de-DE'),
      text: zeilen.join('\n'),
      html: '<pre style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6">' + zeilen.join('\n') + '</pre>'
    });
    console.log('Wochen-Digest: ' + (ergebnis.ok ? 'gesendet an ' + an : 'fehlgeschlagen - ' + ergebnis.fehler));
  } catch (e) {
    console.warn('Wochen-Digest fehlgeschlagen: ' + e.message);
  }
}

// ------------------------------------------------------- Uebersicht ----
// Das Dashboard der Agentur: Kunden, Reports, Telefon-Umsatz ueber ALLE
// Kunden, offene Rueckrufe. 10 Minuten gecacht (mehrere DB-Abfragen).
let uebersichtCache = { zeit: 0, daten: null };

async function baueUebersicht() {
  if (uebersichtCache.daten && Date.now() - uebersichtCache.zeit < 10 * 60 * 1000) {
    return uebersichtCache.daten;
  }
  const kunden = await ladeKunden();
  const monat = report.monatsSchluessel();
  let reportsMonat = 0;
  let kundenInGefahr = 0;
  for (const k of kunden) {
    const historie = kundenHistorie(effektiverSlug(k));
    if (historie.some((h) => h.monat === monat)) reportsMonat++;
    if (bewerteKunde({ historie, aktuellerMonat: monat }).stufe === 'rot') kundenInGefahr++;
  }

  let telefonUmsatz = 0;
  let rueckrufe = 0;
  if (DEMO) {
    const demo = JSON.parse(fs.readFileSync(path.join(SICHT_ORDNER, 'demo', 'demo-daten.json'), 'utf8'));
    telefonUmsatz = (demo.telefon && demo.telefon.gesamtGeschaetzt) || 0;
    rueckrufe = (demo.telefon && demo.telefon.rueckrufe) || 0;
  } else {
    for (const k of kunden) {
      const z = await telefonZahlen(k.id, monat);
      if (z) telefonUmsatz += z.gesamtGeschaetzt || 0;
    }
    try { rueckrufe = (await telefonDb.offeneRueckrufe()).length; } catch (_e) { /* dann 0 */ }
  }

  const stand = liesAutoStand();
  const daten = {
    monat,
    monatLabel: report.monatsLabel(monat),
    kunden: kunden.length,
    reportsMonat,
    kundenInGefahr,
    telefonUmsatz: Math.round(telefonUmsatz * 100) / 100,
    offeneRueckrufe: rueckrufe,
    emailVersand: versand.istKonfiguriert(),
    // Einrichtungs-Ampel: welche Bausteine sind fertig eingerichtet?
    // (Aendert sich eine .env, zeigt der naechste Server-Start den neuen Stand.)
    bausteine: {
      denken: !!process.env.ANTHROPIC_API_KEY,
      zuhoeren: !!process.env.DEEPGRAM_API_KEY,
      stimme: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
      telefon: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      google: !!(process.env.SERPER_API_KEY || (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID)),
      email: versand.istKonfiguriert()
    },
    automatik: {
      an: AUTO_TAG > 0,
      tag: AUTO_TAG,
      letzterLaufMonat: stand.letzterLaufMonat || null,
      naechsterLauf: naechsterAutoLauf(new Date(), stand.letzterLaufMonat || null, AUTO_TAG)
    }
  };
  uebersichtCache = { zeit: Date.now(), daten };
  return daten;
}

// ------------------------------------------------------- Rueckrufe ----
async function ladeRueckrufe() {
  if (DEMO) {
    return [
      { id: 'demo-1', quelle: 'callbacks', restaurant_id: '00000000-0000-0000-0000-000000000002', restaurant: 'La Piazza Emden', name: 'Familie Janssen', telefon: '+49 172 5550123', anliegen: 'Feier mit 15 Personen am Samstag - bitte zurueckrufen', zeit: new Date(Date.now() - 3600000).toISOString() },
      { id: 'demo-2', quelle: 'reservations', restaurant_id: '888dc5bc-1649-4762-a8ee-2eb1e5e1dfad', restaurant: 'Greetsieler Börse', name: 'Herr de Vries', telefon: '+49 4926 555012', anliegen: 'Frage zur Krabben-Saison - Nummer: +49 4926 555012', zeit: new Date(Date.now() - 7200000).toISOString() }
    ];
  }
  const [rueckrufe, kunden] = await Promise.all([telefonDb.offeneRueckrufe(), ladeKunden()]);
  const namen = new Map(kunden.map((k) => [String(k.id), k.name]));
  return rueckrufe.map((r) => Object.assign({ restaurant: namen.get(String(r.restaurant_id)) || '' }, r));
}

// ------------------------------------------------------- Telefon-Retter ----
// Anruf-Statistik aus telefon-retter/logs/statistik.jsonl (anonym, dauerhaft)
function anrufStatistik() {
  if (DEMO) {
    return { anrufeHeute: 3, anrufeMonat: 24, reservierungen: 9, gaeste: 31, bestellungen: 6, bestellwert: 187.4, rueckrufe: 2 };
  }
  const datei = path.join(TELEFON_LOGS, 'statistik.jsonl');
  let zeilen = [];
  try { zeilen = fs.readFileSync(datei, 'utf8').split('\n').filter(Boolean); } catch (_e) { /* noch keine Anrufe */ }
  return werteStatistikAus(zeilen, new Date().toISOString().slice(0, 10));
}

async function telefonStatus() {
  const status = { laeuft: false, restaurant: null, stufe: null, anrufe: [], statistik: anrufStatistik() };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1500);
    const antwort = await fetch(TELEFON_URL + '/health', { signal: controller.signal });
    clearTimeout(t);
    if (antwort.ok) {
      const d = await antwort.json();
      status.laeuft = true;
      status.restaurant = d.restaurant;
      status.stufe = d.stufe;
    }
  } catch (_e) { /* Server ist aus - kein Fehler */ }

  if (fs.existsSync(TELEFON_LOGS)) {
    status.anrufe = fs.readdirSync(TELEFON_LOGS).filter((f) => f.endsWith('.log')).sort().reverse().slice(0, 10);
  }
  return status;
}

// ------------------------------------------------- Bewertungs-Journal --------
// Nachweis der Arbeit: jede bearbeitete Bewertung als Journal-Eintrag mit
// eigener ID, damit man ihren Status verfolgen kann (gemeldet -> geloescht/
// abgelehnt). Datensparsam: nur Kategorie, kurzer Auszug (fuers Wiedererkennen),
// Zeit, Status - kein voller Bewertungstext.
function bewertungProtokollPfad(slug) {
  return path.join(DATEN_ORDNER, slug, 'bewertungen.jsonl');
}
function bewertungProtokoll(slug, verstoss, auszug) {
  if (DEMO) return null; // Demo-Laeufe nichts mitschreiben
  try {
    const pfad = bewertungProtokollPfad(slug);
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    const eintrag = {
      id: require('crypto').randomBytes(6).toString('hex'),
      zeit: new Date().toISOString(),
      verstoss,
      auszug: String(auszug || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      status: verstoss === 'kein_verstoss' ? 'beantwortet' : 'offen'
    };
    fs.appendFileSync(pfad, JSON.stringify(eintrag) + '\n');
    return eintrag;
  } catch (_e) { return null; }
}
function bewertungJournal(slug) {
  try {
    return fs.readFileSync(bewertungProtokollPfad(slug), 'utf8')
      .split('\n').filter((z) => z.trim())
      .map((z) => { try { return JSON.parse(z); } catch (_e) { return null; } })
      .filter(Boolean).reverse(); // neueste zuerst
  } catch (_e) { return []; }
}
function bewertungAnzahl(slug) {
  return bewertungJournal(slug).length;
}
// Status eines Journal-Eintrags aendern (gemeldet/geloescht/abgelehnt/...).
// Wir schreiben die Datei neu - bei den ueblichen Mengen (Dutzende) unkritisch.
function bewertungStatusSetzen(slug, id, status) {
  const alle = bewertungJournal(slug).slice().reverse(); // wieder chronologisch
  let gefunden = false;
  for (const e of alle) { if (e.id === id) { e.status = status; gefunden = true; } }
  if (!gefunden) return false;
  try {
    fs.writeFileSync(bewertungProtokollPfad(slug), alle.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return true;
  } catch (_e) { return false; }
}

// ------------------------------------------------------- Anruf-Demo ----------
// Verkaufs-Werkzeug: der Telefon-Retter als Text-Chat im Browser - mit dem
// ECHTEN Restaurant und der ECHTEN Speisekarte, aber ohne einen einzigen
// Schreibzugriff. Reservierungen/Bestellungen landen nur im Speicher der
// Demo-Sitzung. Perfekt, um einem Wirt am Laptop zu zeigen, wie sein
// Telefon kuenftig klingt.
const anrufDemos = new Map(); // sitzungsId -> { dialog, zuletzt }
const DEMO_SITZUNG_TTL = 30 * 60 * 1000;

function anrufDemoDatenquelle() {
  const neue = []; // nur im Speicher - NIE in der echten Datenbank
  return {
    async reservierungenAm(rid, datum) {
      let echte = [];
      if (!DEMO) { try { echte = await telefonDb.reservierungenAm(rid, datum); } catch (_e) { /* Demo laeuft auch offline */ } }
      return echte.concat(neue.filter((r) => r.reservation_date === datum));
    },
    async anzahlAktiveTische(rid) {
      if (!DEMO) {
        try {
          const n = await telefonDb.anzahlAktiveTische(rid);
          if (n > 0) return n;
        } catch (_e) { /* s.o. */ }
      }
      return 8; // Betrieb ohne gepflegte Tische: Demo soll trotzdem vorfuehrbar sein
    },
    async neueReservierung(p) { neue.push(p); return { ok: true, daten: Object.assign({ id: 'demo-' + neue.length }, p) }; },
    async neueBestellung(p) { return { ok: true, daten: Object.assign({ id: 'demo-bestellung' }, p) }; },
    async neuerBestellArtikel() { return { ok: true }; }
    // Kein resilienterInsert -> Rueckruf-Wuensche landen im Speicher-Fallback
  };
}

// Sprach-Demo: zuhoeren (Deepgram, fertige Aufnahme) und mit Stimme
// antworten (ElevenLabs, bestes Klang-Modell). Faellt ohne Schluessel
// einfach auf die Text-Demo zurueck - nie ein harter Fehler.
async function demoHoere(audioBuffer, mime) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { fehler: 'DEEPGRAM_API_KEY fehlt - einmal "node schluessel-einrichten.js" ausfuehren.' };
  const antwort = await fetch(
    'https://api.deepgram.com/v1/listen?language=de&smart_format=true&model=' +
    encodeURIComponent(process.env.DEEPGRAM_MODELL || 'nova-2'),
    {
      method: 'POST',
      headers: { Authorization: 'Token ' + key, 'Content-Type': mime || 'audio/webm' },
      body: audioBuffer,
      signal: AbortSignal.timeout(30000)
    }
  );
  if (!antwort.ok) return { fehler: 'Deepgram sagt ' + antwort.status };
  const daten = await antwort.json();
  const alt = daten.results && daten.results.channels && daten.results.channels[0] &&
    daten.results.channels[0].alternatives && daten.results.channels[0].alternatives[0];
  return { text: ((alt && alt.transcript) || '').trim() };
}

async function demoSpreche(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  const stimme = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !stimme || !text) return null;
  try {
    const antwort = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(stimme) + '?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: parseFloat(process.env.ELEVENLABS_STABILITAET || '0.42'),
            similarity_boost: 0.8
          }
        })
      }
    );
    if (!antwort.ok) return null;
    return Buffer.from(await antwort.arrayBuffer()).toString('base64');
  } catch (_e) { return null; /* dann eben nur Text */ }
}

async function starteAnrufDemo(kunde) {
  let menue = [];
  if (DEMO) {
    menue = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'telefon-retter', 'demo', 'demo-daten.json'), 'utf8')).speisekarte;
  } else {
    try { menue = await supabase.speisekarte(kunde.id); } catch (_e) { /* ohne Karte: Stufe 1 */ }
  }
  const dialog = new DialogSitzung({
    restaurant: kunde,
    menue,
    stufe: menue.length ? 3 : 1,
    anrufer: '+49 0000 000000 (Browser-Demo)',
    datenquelle: anrufDemoDatenquelle()
  });
  const id = require('crypto').randomBytes(8).toString('hex');
  anrufDemos.set(id, { dialog, zuletzt: Date.now() });
  return { sitzung: id, text: dialog.begruessung(), beenden: false };
}

// ------------------------------------------------------------------ Server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pfad = url.pathname;

  try {
    // Oberflaeche
    if (req.method === 'GET' && (pfad === '/' || pfad === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
      return;
    }

    // Erzeugte Reports ausliefern
    if (req.method === 'GET' && pfad.startsWith('/reports/')) {
      const datei = path.join(REPORT_ORDNER, path.basename(pfad));
      if (!fs.existsSync(datei)) { res.writeHead(404); res.end('Nicht gefunden'); return; }
      const istPdf = datei.endsWith('.pdf');
      res.writeHead(200, { 'Content-Type': istPdf ? 'application/pdf' : 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(datei));
      return;
    }

    // API: Kundenliste inkl. Historie-Kurzinfo + Gesundheits-Ampel
    if (req.method === 'GET' && pfad === '/api/kunden') {
      const kunden = await ladeKunden();
      const monat = report.monatsSchluessel();
      json(res, 200, kunden.map((k) => {
        const slug = effektiverSlug(k);
        const historie = kundenHistorie(slug);
        return {
          id: k.id, name: k.name, stadt: k.city || '', slug,
          kategorie: suchfragen(k).kategorie,
          fragenAnzahl: suchfragen(k).fragen.length,
          reports: historie.length,
          letzterReport: historie[0] || null,
          gesundheit: bewerteKunde({ historie, aktuellerMonat: monat })
        };
      }));
      return;
    }

    // API: Detail eines Kunden (Historie + Fragen + Aufbereitung)
    if (req.method === 'GET' && pfad.startsWith('/api/kunde/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const slug = effektiverSlug(kunde);
      const aufOrdner = path.join(AUFBEREITUNG_ORDNER, slug);
      const historie = kundenHistorie(slug);
      // KI-Konkurrenz aus dem neuesten Monats-Lauf: Wen empfiehlt die KI
      // stattdessen? Inklusive Bewegung zum Vormonat (neu/mehr/weniger) und
      // der wichtigsten Zahl: Wie oft wird DEIN Kunde selbst genannt?
      const ladeErgebnis = (monat) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(DATEN_ORDNER, slug, monat + '.json'), 'utf8')).ergebnis || null;
        } catch (_e) { return null; }
      };
      const aktuellErg = historie[0] ? ladeErgebnis(historie[0].monat) : null;
      const vorherErg = historie[1] ? ladeErgebnis(historie[1].monat) : null;
      const vorherListe = vorherErg ? report.kiKonkurrenz(vorherErg) : [];
      const vorherMap = new Map(vorherListe.map((t) => [String(t.name).toLowerCase(), t.anzahl]));
      const kiKonkurrenz = (aktuellErg ? report.kiKonkurrenz(aktuellErg) : []).map((t) => Object.assign({}, t, {
        vorher: vorherMap.has(String(t.name).toLowerCase()) ? vorherMap.get(String(t.name).toLowerCase()) : null
      }));
      const zaehleKiNennungen = (erg) => {
        if (!erg || !Array.isArray(erg.fragen)) return null;
        const gewertet = erg.fragen.filter((f) => f.ki && (f.ki.status === 'gefunden' || f.ki.status === 'nicht-gefunden'));
        return { genannt: gewertet.filter((f) => f.ki.status === 'gefunden').length, getestet: gewertet.length };
      };
      json(res, 200, {
        id: kunde.id, name: kunde.name, stadt: kunde.city || '', slug,
        adresse: kunde.address || '', telefon: kunde.phone || '',
        kategorie: suchfragen(kunde).kategorie,
        fragen: suchfragen(kunde).fragen.map((f) => f.frage),
        historie,
        kiKonkurrenz,
        kiNennungen: { aktuell: zaehleKiNennungen(aktuellErg), vormonat: zaehleKiNennungen(vorherErg) },
        bewertungsJournal: bewertungJournal(slug),
        naechsteSchritte: naechsteSchritteFuer(slug, kunde),
        portalLink: require('./lib/portal').istAktiv() ? '/portal/' + require('./lib/portal').portalToken(slug) : null,
        aufbereitung: fs.existsSync(aufOrdner) ? fs.readdirSync(aufOrdner) : []
      });
      return;
    }

    // API: Batch - Reports fuer alle Kunden
    if (req.method === 'POST' && pfad === '/api/report-alle') {
      const jobId = await starteBatchReport();
      json(res, 200, { jobId });
      return;
    }

    // API: Report starten
    if (req.method === 'POST' && pfad === '/api/report') {
      const { kennung } = await leseBody(req);
      const kunde = await findeKunde(kennung);
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const jobId = await starteReport(kunde);
      json(res, 200, { jobId });
      return;
    }

    // API: Job-Status (Oberflaeche fragt alle 2 Sekunden nach)
    if (req.method === 'GET' && pfad.startsWith('/api/job/')) {
      const job = jobs[pfad.split('/').pop()];
      json(res, job ? 200 : 404, job || { fehler: 'Unbekannter Job' });
      return;
    }

    // API: Aufbereitung (Teil A) erzeugen
    if (req.method === 'POST' && pfad === '/api/aufbereitung') {
      const { kennung } = await leseBody(req);
      const kunde = await findeKunde(kennung);
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const ergebnis = await erzeugeAufbereitung(kunde);
      json(res, 200, ergebnis);
      return;
    }

    // Aufbereitungs-Dateien ansehen
    if (req.method === 'GET' && pfad.startsWith('/api/aufbereitung/')) {
      const teile = pfad.split('/');
      const datei = path.join(AUFBEREITUNG_ORDNER, path.basename(teile[3] || ''), path.basename(teile[4] || ''));
      if (!fs.existsSync(datei)) { res.writeHead(404); res.end('Nicht gefunden'); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(datei));
      return;
    }

    // API: OSM-Import anstossen - fuellt die Pipeline mit allen Betrieben
    // der Region (import-osm.js, Overpass API). Laeuft im Hintergrund.
    if (req.method === 'POST' && pfad === '/api/osm-import') {
      if (DEMO) { json(res, 200, { ok: true, hinweis: 'Demo-Modus: Import nur simuliert.' }); return; }
      const { execFile } = require('child_process');
      execFile('node', [path.join(__dirname, '..', 'import-osm.js')], { timeout: 180000 }, (fehler, stdout) => {
        console.log('[osm-import] ' + (fehler ? 'FEHLER: ' + fehler.message : String(stdout).trim().split('\n').pop()));
      });
      json(res, 200, { ok: true, hinweis: 'Import laeuft (1-2 Minuten) - danach Seite neu laden.' });
      return;
    }

    // API: Interessenten (Neukunden-Pipeline aus prospects.json).
    // Bestandskunden werden per Namens-Abgleich rausgefiltert.
    if (req.method === 'GET' && pfad === '/api/interessenten') {
      let liste = [];
      try { liste = JSON.parse(fs.readFileSync(PROSPECTS_DATEI, 'utf8')); } catch (_e) { /* keine Datei = leere Pipeline */ }
      const kundenNamen = (await ladeKunden()).map((k) => k.name);
      const { istSchonPartner } = require('./lib/pitch');
      liste = liste.filter((p) => !istSchonPartner(p, kundenNamen));
      json(res, 200, liste.map((p) => ({
        name: p.name || '', stadt: p.city || '', kategorie: p.category || 'restaurant',
        telefon: p.phone || '', website: p.website || '',
        pitch: dateiInOrdner(PITCH_ORDNER, pitchDateiname(p)) ? '/api/pitch-seite/' + pitchDateiname(p) : null
      })));
      return;
    }

    // API: Pitch-Seite fuer einen Interessenten erzeugen
    if (req.method === 'POST' && pfad === '/api/pitch') {
      const { name } = await leseBody(req);
      let liste = [];
      try { liste = JSON.parse(fs.readFileSync(PROSPECTS_DATEI, 'utf8')); } catch (_e) { /* s.o. */ }
      const prospect = liste.find((p) => String(p.name || '').toLowerCase() === String(name || '').toLowerCase());
      if (!prospect) { json(res, 404, { fehler: 'Interessent nicht in prospects.json gefunden' }); return; }
      fs.mkdirSync(PITCH_ORDNER, { recursive: true });
      const datei = pitchDateiname(prospect);
      const datum = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      fs.writeFileSync(path.join(PITCH_ORDNER, datei), bauePitchHtml(prospect, { datum }));
      json(res, 200, { ok: true, link: '/api/pitch-seite/' + datei });
      return;
    }
    if (req.method === 'GET' && pfad.startsWith('/api/pitch-seite/')) {
      const datei = path.join(PITCH_ORDNER, path.basename(pfad));
      if (!fs.existsSync(datei)) { res.writeHead(404); res.end('Nicht gefunden'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(datei));
      return;
    }

    // API: Onboarding - Neukunde komplett einrichten (ein Klick)
    if (req.method === 'POST' && pfad === '/api/onboarding') {
      const { kennung } = await leseBody(req);
      const kunde = await findeKunde(kennung);
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const schritte = [];
      try {
        const auf = await erzeugeAufbereitung(kunde);
        schritte.push({ schritt: 'Aufbereitung (JSON-LD, Texte, Google-Posts)', ok: true, detail: auf.dateien.length + ' Dateien' });
      } catch (e) { schritte.push({ schritt: 'Aufbereitung', ok: false, detail: e.message }); }
      const jobId = await starteReport(kunde);
      schritte.push({ schritt: 'Erster Monats-Report', ok: true, detail: 'laeuft im Hintergrund' });
      schritte.push({
        schritt: 'Report-Versand per E-Mail',
        ok: versand.istKonfiguriert() && !!kunde.email,
        detail: versand.istKonfiguriert()
          ? (kunde.email ? 'eingerichtet (' + kunde.email + ')' : 'keine E-Mail-Adresse beim Kunden hinterlegt')
          : 'RESEND_API_KEY fehlt in sichtbarkeit/.env'
      });
      json(res, 200, { jobId, schritte });
      return;
    }

    // API: Neuesten Report per E-Mail an den Wirt senden
    if (req.method === 'POST' && pfad === '/api/report-senden') {
      const { kennung } = await leseBody(req);
      const kunde = await findeKunde(kennung);
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      if (DEMO) { json(res, 200, { ok: true, hinweis: 'Demo-Modus: E-Mail nur simuliert' }); return; }
      const ergebnis = await sendeNeuestenReport(kunde);
      json(res, ergebnis.ok ? 200 : 400, ergebnis);
      return;
    }

    // Kunden-Portal (Magic-Link): oeffentlich teilbare Ergebnis-Seite je
    // Wirt. Nur aktiv mit PORTAL_SECRET. Token identifiziert den Kunden.
    if (req.method === 'GET' && pfad.startsWith('/portal/')) {
      const portal = require('./lib/portal');
      if (!portal.istAktiv()) { res.writeHead(404); res.end('Portal nicht aktiviert (PORTAL_SECRET fehlt)'); return; }
      const teile = pfad.split('/').filter(Boolean); // ['portal', token, ('report', monat)?]
      const kunden = await ladeKunden();
      const kunde = kunden.find((k) => portal.portalToken(effektiverSlug(k)) === teile[1]);
      if (!kunde) { res.writeHead(404); res.end('Unbekannter Link'); return; }
      const slug = effektiverSlug(kunde);
      if (teile[2] === 'report' && /^\d{4}-\d{2}$/.test(teile[3] || '')) {
        const datei = path.join(REPORT_ORDNER, slug + '-' + teile[3] + '.html');
        if (!fs.existsSync(datei)) { res.writeHead(404); res.end('Report nicht gefunden'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(datei));
        return;
      }
      const html = portal.bauePortalHtml({
        kunde, token: teile[1],
        zahlen: await kundenTelefonZahlen(kunde, report.monatsSchluessel()),
        historie: kundenHistorie(slug)
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // API: Uebersicht (Dashboard-Kopf)
    if (req.method === 'GET' && pfad === '/api/uebersicht') {
      json(res, 200, await baueUebersicht());
      return;
    }

    // API: offene Rueckruf-Wuensche (alle Kunden)
    if (req.method === 'GET' && pfad === '/api/rueckrufe') {
      json(res, 200, await ladeRueckrufe());
      return;
    }

    // API: Anruf-Demo - ein Gespraechsschritt (oder Start ohne Sitzung).
    // Schreibt NIE in die echte Datenbank (siehe anrufDemoDatenquelle).
    if (req.method === 'POST' && pfad === '/api/anruf-demo') {
      if (!process.env.ANTHROPIC_API_KEY) {
        json(res, 400, { fehler: 'ANTHROPIC_API_KEY fehlt - einmal "node schluessel-einrichten.js" im Hauptordner ausfuehren.' });
        return;
      }
      const { kennung, sitzung, text, mitStimme } = await leseBody(req);
      const jetzt = Date.now();
      for (const [id, s] of anrufDemos) { if (jetzt - s.zuletzt > DEMO_SITZUNG_TTL) anrufDemos.delete(id); }

      const eintrag = sitzung ? anrufDemos.get(sitzung) : null;
      if (!eintrag) {
        const kunde = await findeKunde(kennung);
        if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
        const start = await starteAnrufDemo(kunde);
        if (mitStimme) start.audio = await demoSpreche(start.text);
        json(res, 200, start);
        return;
      }
      eintrag.zuletzt = jetzt;
      const antwort = await eintrag.dialog.antwortAuf(String(text || '').slice(0, 500));
      if (antwort.beenden) anrufDemos.delete(sitzung);
      json(res, 200, {
        sitzung, text: antwort.text, beenden: antwort.beenden,
        audio: mitStimme ? await demoSpreche(antwort.text) : null
      });
      return;
    }

    // API: Sprach-Demo - Mikrofon-Aufnahme rein, gesprochene Antwort raus.
    // Wie ChatGPT-Live im Browser: zuhoeren -> denken -> mit Stimme antworten.
    if (req.method === 'POST' && pfad === '/api/anruf-demo-sprache') {
      const sitzungId = url.searchParams.get('sitzung') || '';
      const eintrag = anrufDemos.get(sitzungId);
      if (!eintrag) { json(res, 404, { fehler: 'Demo-Sitzung abgelaufen - bitte neu starten.' }); return; }
      const roh = await leseRohBody(req);
      if (!roh.length) { json(res, 400, { fehler: 'Kein Audio angekommen' }); return; }
      const gehoert = await demoHoere(roh, req.headers['content-type']);
      if (gehoert.fehler) { json(res, 400, { fehler: gehoert.fehler }); return; }
      if (!gehoert.text) {
        json(res, 200, { gehoert: '', text: null, hinweis: 'Ich habe nichts verstanden - bitte noch einmal sprechen.' });
        return;
      }
      eintrag.zuletzt = Date.now();
      const antwort = await eintrag.dialog.antwortAuf(gehoert.text.slice(0, 500));
      if (antwort.beenden) anrufDemos.delete(sitzungId);
      json(res, 200, {
        gehoert: gehoert.text,
        text: antwort.text,
        audio: await demoSpreche(antwort.text),
        beenden: antwort.beenden
      });
      return;
    }

    // API: Bewertungs-Retter - schlechte Google-Bewertung pruefen und
    // fertige Texte liefern (Melde-Begruendung + professionelle Antwort).
    // Ehrlich: keine Loesch-Garantie, aber der richtige Weg fuer jeden Fall.
    if (req.method === 'POST' && pfad === '/api/bewertung-pruefen') {
      if (!process.env.ANTHROPIC_API_KEY) {
        json(res, 400, { fehler: 'ANTHROPIC_API_KEY fehlt - einmal "node schluessel-einrichten.js" ausfuehren.' });
        return;
      }
      const { kennung, text } = await leseBody(req);
      if (!String(text || '').trim()) { json(res, 400, { fehler: 'Bitte die Bewertung einfuegen.' }); return; }
      const kunde = await findeKunde(kennung);
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const retter = require('./lib/bewertungs-retter');
      try {
        const antwort = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          signal: AbortSignal.timeout(45000),
          body: JSON.stringify({
            model: process.env.KI_MODELL || 'claude-sonnet-5',
            max_tokens: 900,
            messages: [{ role: 'user', content: retter.bauePruefPrompt(kunde, text) }]
          })
        });
        if (!antwort.ok) throw new Error('Claude-API ' + antwort.status);
        const daten = await antwort.json();
        const ergebnis = retter.parsePruefung((daten.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
        ergebnis.label = retter.VERSTOSS_LABELS[ergebnis.verstoss];
        // Bei falschen Tatsachen: fertige formelle Beschwerde mitliefern
        if (ergebnis.verstoss === 'falsche_tatsache') {
          ergebnis.beschwerde = retter.baueBeschwerde(kunde, text, ergebnis);
        }
        // Beste Verteidigung immer mitgeben: mehr echte gute Bewertungen
        ergebnis.bewertungsAnfrage = retter.baueBewertungsAnfrage(kunde);
        // Track-Record: Journal-Eintrag pro Kunde (Nachweis der Arbeit).
        // Kurzer Auszug zum Wiedererkennen, KEIN voller Bewertungstext.
        bewertungProtokoll(effektiverSlug(kunde), ergebnis.verstoss, text);
        ergebnis.bearbeitetGesamt = bewertungAnzahl(effektiverSlug(kunde));
        json(res, 200, ergebnis);
      } catch (e) {
        json(res, 502, { fehler: 'Pruefung fehlgeschlagen: ' + e.message });
      }
      return;
    }

    // API: Status eines Bewertungs-Journal-Eintrags setzen (gemeldet ->
    // geloescht/abgelehnt). So wird aus dem Nachweis eine echte Erfolgs-Bilanz.
    if (req.method === 'POST' && pfad === '/api/bewertung-status') {
      const { kennung, id, status } = await leseBody(req);
      const erlaubt = ['offen', 'gemeldet', 'geloescht', 'abgelehnt', 'beantwortet'];
      if (!id || !erlaubt.includes(status)) { json(res, 400, { fehler: 'id oder status fehlt/ungueltig' }); return; }
      const kunde = await findeKunde(kennung);
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      if (DEMO) { json(res, 200, { ok: true }); return; }
      const ok = bewertungStatusSetzen(effektiverSlug(kunde), id, status);
      json(res, ok ? 200 : 404, ok ? { ok: true } : { fehler: 'Eintrag nicht gefunden' });
      return;
    }

    // Angebots-Seite: ausdruckbare/teilbare Seite mit den drei Paketen +
    // Preisen fuers Kundengespraech. Personalisiert auf den Betrieb.
    if (req.method === 'GET' && pfad.startsWith('/angebot/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { res.writeHead(404); res.end('Kunde nicht gefunden'); return; }
      const datum = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(require('./lib/angebot').baueAngebotHtml(kunde, { datum }));
      return;
    }

    // API: WhatsApp-Kunden-Update - fertige Nachricht mit den Monats-Zahlen
    if (req.method === 'GET' && pfad.startsWith('/api/kunden-update/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const slug = effektiverSlug(kunde);
      const portal = require('./lib/portal');
      const basis = (process.env.BASE_URL || 'http://localhost:' + PORT).replace(/\/$/, '');
      json(res, 200, {
        text: baueKundenUpdate({
          kunde,
          monatLabel: report.monatsLabel(report.monatsSchluessel()),
          historie: kundenHistorie(slug),
          telefon: await kundenTelefonZahlen(kunde, report.monatsSchluessel()),
          portalUrl: portal.istAktiv() ? basis + '/portal/' + portal.portalToken(slug) : null
        })
      });
      return;
    }

    // API: Rueckruf als erledigt markieren (nur callbacks-Eintraege)
    if (req.method === 'POST' && pfad === '/api/rueckruf-erledigt') {
      const { id, quelle } = await leseBody(req);
      if (!id) { json(res, 400, { fehler: 'id fehlt' }); return; }
      if (quelle !== 'callbacks') {
        json(res, 400, { fehler: 'Dieser Eintrag liegt als offene Anfrage im Kiek-mol-in-Dashboard des Wirts - dort erledigen.' });
        return;
      }
      if (DEMO) { json(res, 200, { ok: true }); return; }
      const ergebnis = await telefonDb.rueckrufErledigt(id);
      json(res, ergebnis.ok ? 200 : 500, ergebnis.ok ? { ok: true } : { fehler: 'Konnte nicht gespeichert werden (' + ergebnis.status + ')' });
      return;
    }

    // API: Umsatz-Nachweis des Telefon-Retters (aktueller Monat) je Kunde
    if (req.method === 'GET' && pfad.startsWith('/api/telefonzahlen/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const monat = url.searchParams.get('monat') || report.monatsSchluessel();
      const zahlen = await kundenTelefonZahlen(kunde, monat);
      json(res, 200, zahlen || { monat, keineDaten: true });
      return;
    }

    // API: Telefon-Retter-Status + Anruf-Protokolle
    if (req.method === 'GET' && pfad === '/api/telefon') {
      json(res, 200, await telefonStatus());
      return;
    }
    if (req.method === 'GET' && pfad.startsWith('/api/telefon-log/')) {
      const datei = path.join(TELEFON_LOGS, path.basename(pfad));
      if (!fs.existsSync(datei)) { res.writeHead(404); res.end('Nicht gefunden'); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(datei));
      return;
    }

    res.writeHead(404);
    res.end('Nicht gefunden');
  } catch (e) {
    json(res, 500, { fehler: e.message });
  }
});

server.listen(PORT, () => {
  console.log('KURANI Agentur-App' + (DEMO ? ' (DEMO-MODUS)' : '') + ':  http://localhost:' + PORT);
  if (AUTO_TAG > 0) {
    const stand = liesAutoStand();
    console.log('Monats-Automatik: Reports laufen am ' + AUTO_TAG + '. jeden Monats von selbst' +
      ' (naechster Lauf: ' + naechsterAutoLauf(new Date(), stand.letzterLaufMonat || null, AUTO_TAG) + ').' +
      ' Abschalten: AUTO_REPORT_TAG=0');
  } else if (!DEMO) {
    console.log('Monats-Automatik ist AUS (AUTO_REPORT_TAG=0) - Reports nur per Klick.');
  }
});

// Monats-Automatik: kurz nach dem Start pruefen, danach stuendlich.
// Laeuft der Rechner am Stichtag nicht, holt der naechste Start den Lauf nach.
if (AUTO_TAG > 0) {
  setTimeout(() => pruefeAutomatik().catch((e) => console.warn('Automatik-Pruefung: ' + e.message)), 15000);
  setInterval(() => pruefeAutomatik().catch((e) => console.warn('Automatik-Pruefung: ' + e.message)), 60 * 60 * 1000);
}
// Wochen-Digest (Montags-Mail an AGENTUR_EMAIL) - gleiche stuendliche Pruefung
setTimeout(() => pruefeDigest().catch((e) => console.warn('Digest-Pruefung: ' + e.message)), 20000);
setInterval(() => pruefeDigest().catch((e) => console.warn('Digest-Pruefung: ' + e.message)), 60 * 60 * 1000);
