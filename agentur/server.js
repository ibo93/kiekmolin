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
// Echtzeit: der Server meldet Neuigkeiten von sich aus an offene Fenster
const live = require('./lib/live');
const pipeline = require('./lib/pipeline');
const leadCheck = require('./lib/lead-check');
const checks = require('../sichtbarkeit/lib/checks');
const telefonKunden = require('./lib/telefon-kunden');
const demoKunde = require('./lib/demo-kunde');
const verteiler = new live.Verteiler();

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

// Groessen-Deckel, damit ein versehentlich riesiges Foto nicht den
// Arbeitsspeicher auffrisst. 12 MB reichen fuer mehrere Karten-Fotos.
function leseBody(req, maxBytes) {
  const grenze = maxBytes || 12 * 1024 * 1024;
  return new Promise((resolve) => {
    let body = '';
    let zuGross = false;
    req.on('data', (d) => {
      if (zuGross) return;
      body += d;
      if (body.length > grenze) { zuGross = true; body = ''; }
    });
    req.on('end', () => {
      if (zuGross) { resolve({ _zuGross: true }); return; }
      try { resolve(JSON.parse(body || '{}')); } catch (_e) { resolve({}); }
    });
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

      jobs[jobId].schritt = 'Verlauf zusammenstellen';
      let verlauf = report.ladeVerlauf(slug, monat, { quote: report.quote(ergebnis), telefon });
      if (DEMO) {
        const demoV = JSON.parse(fs.readFileSync(path.join(SICHT_ORDNER, 'demo', 'demo-daten.json'), 'utf8')).verlauf;
        if (demoV) verlauf = demoV;
      }
      // Analyse: macht aus den Zahlen eine Aussage und einen Handlungsplan.
      // Faellt sie aus, kommt der Report trotzdem - nur ohne den Kasten oben.
      jobs[jobId].schritt = 'Analyse rechnen (Herkunft, Speisekarte, Rückgewinnung)';
      let analyse = null;
      try {
        analyse = await require('./lib/report-analyse').sammle(kunde, {
          monat, ergebnis, vormonat, telefon, demoDaten: DEMO
        });
      } catch (e) {
        console.warn('Analyse uebersprungen: ' + e.message);
      }

      jobs[jobId].schritt = 'Report rendern';
      const html = report.renderHtml({ restaurant: kunde, kategorie: sf.kategorie, monat, ergebnis, vormonat, telefon, verlauf, analyse });
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
      '- Kunden in Gefahr (rote Ampel): ' + (rot.length ? rot.map((k) => k.name).join(', ') + ' -> heute anrufen!' : 'keine')
    ];

    // Stille-Alarm: bei wem sind die Zahlen dieser Woche eingebrochen?
    // Das gehoert ganz nach oben - da haengt eine Kuendigung dran.
    const einbrueche = [];
    for (const k of kunden) {
      try {
        const w = await fruehwarnungFuer(k);
        if (w.stufe === 'alarm' || w.stufe === 'warnung') einbrueche.push({ name: k.name, warnung: w });
      } catch (_e) { /* ein Kunde ohne Zahlen darf den Digest nicht kippen */ }
    }
    if (einbrueche.length) {
      zeilen.push('', 'STILLE-ALARM (Zahlen diese Woche eingebrochen):');
      for (const e of einbrueche) {
        zeilen.push('', (e.warnung.stufe === 'alarm' ? '!! ' : '! ') + e.name + ':');
        e.warnung.meldungen.forEach((m) => zeilen.push('  - ' + m.text));
        zeilen.push('  -> ' + e.warnung.empfehlung);
      }
    }

    // Offene Aufgaben pro Kunde: die konkreten Handgriffe dieser Woche.
    const offeneJeKunde = [];
    for (const k of kunden) {
      const a = kundenAufgaben(k);
      const offen = (a.aufgaben || []).filter((x) => !x.erledigt);
      if (offen.length) offeneJeKunde.push({ name: k.name, offen });
    }
    if (offeneJeKunde.length) {
      zeilen.push('', 'DIESE WOCHE ZU TUN (die App hat es aus den Reports abgeleitet):');
      for (const e of offeneJeKunde) {
        const hoch = e.offen.filter((x) => x.prio === 'hoch');
        zeilen.push('', e.name + ' (' + e.offen.length + ' offen):');
        (hoch.length ? hoch : e.offen).slice(0, 3).forEach((x) => zeilen.push('  - ' + x.titel));
      }
    }

    // Neukunden-Pipeline: was ist diese Woche faellig? Ohne diese Zeile
    // vergisst man die Wiedervorlagen genau so lange, bis der Lead kalt ist.
    try {
      const interessenten = await baueInteressentenListe();
      zeilen.push('', 'NEUKUNDEN-PIPELINE: ' + pipeline.satzFuerDigest(interessenten));
      const faellig = interessenten.filter((e) => e.faellig).slice(0, 8);
      for (const e of faellig) {
        zeilen.push('  - ' + e.name + (e.stadt ? ' (' + e.stadt + ')' : '') +
          (e.telefon ? ' · ' + e.telefon : '') + (e.notiz ? ' · ' + e.notiz : ''));
      }
    } catch (_e) { /* eine leere Pipeline darf den Digest nicht kippen */ }

    zeilen.push('', 'Details + Abhaken in der Agentur-App (http://localhost:' + PORT + ').');
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
      // Twilio geht mit Auth Token ODER mit API Key + Secret
      telefon: require('../telefon-retter/lib/twilio-auth').istKonfiguriert(),
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

// ------------------------------------------------- Stille-Alarm ----
// Frueherkennung: laufen bei einem Kunden diese Woche deutlich weniger
// Reservierungen/Bestellungen ein als in den Vorwochen? Dann meldet sich
// die Agentur, BEVOR der Wirt selbst merkt, dass es kippt.
// Liest LIVE aus der Kiek-mol-in-Datenbank und speichert nichts.
async function fruehwarnungFuer(kunde, heute) {
  const fw = require('./lib/fruehwarnung');
  const jetzt = heute || new Date();
  // 5 Wochen Blickfeld (aktuelle Woche + 4 Vergleichswochen), 1 Tag Puffer
  const ab = new Date(jetzt.getTime() - 36 * 864e5).toISOString().slice(0, 10);
  let reservierungen = [];
  let bestellungen = [];
  if (DEMO) {
    const t = (tage) => new Date(jetzt.getTime() - tage * 864e5).toISOString().slice(0, 10);
    // Demo: Vorwochen ~7 Reservierungen, diese Woche nur 2 -> Alarm
    const demoTage = [2, 5, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 33];
    reservierungen = demoTage.map((tag) => ({ reservation_date: t(tag) }));
    bestellungen = [3, 6, 12, 14, 18, 21, 26, 30].map((tag) => ({ created_at: t(tag) }));
  } else {
    [reservierungen, bestellungen] = await Promise.all([
      supabase.gaesteReservierungen(kunde.id, ab).catch(() => []),
      supabase.gaesteBestellungen(kunde.id, ab).catch(() => [])
    ]);
  }
  return fw.pruefeKunde({
    reservierungsDaten: reservierungen.map((r) => r.reservation_date),
    bestellDaten: bestellungen.map((b) => b.created_at)
  }, { heute: jetzt });
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

// ------------------------------------------------- Neukunden-Pipeline ------
// Der Gespraechsstand (Stufe, Notiz, Wiedervorlage) liegt neben den Leads.
// Ohne Datei = leerer Stand: die Pipeline funktioniert auch beim ersten Start.
const PIPELINE_DATEI = path.join(DATEN_ORDNER, 'pipeline.json');

function ladePipelineStand() {
  try { return pipeline.leseStand(fs.readFileSync(PIPELINE_DATEI, 'utf8')); } catch (_e) { return {}; }
}

function speicherePipelineStand(stand) {
  fs.mkdirSync(DATEN_ORDNER, { recursive: true });
  fs.writeFileSync(PIPELINE_DATEI, JSON.stringify(stand, null, 2));
}

// ------------------------------------------------- OSM-Import --------------
// Der Import laeuft mehrere Minuten im Hintergrund. Damit man nicht ratlos
// vor einem Knopf sitzt, wird sein Verlauf hier mitgeschrieben und ueber
// /api/osm-import abfragbar - Zeile fuer Zeile, so wie im Terminal.
const osmLauf = { laeuft: false, zeilen: [], fertig: false, fehler: null, gebieteFertig: 0, gebieteGesamt: 0 };

function starteOsmImport() {
  const { spawn } = require('child_process');
  Object.assign(osmLauf, { laeuft: true, zeilen: [], fertig: false, fehler: null, gebieteFertig: 0, gebieteGesamt: 0 });

  const kind = spawn('node', [path.join(__dirname, '..', 'import-osm.js')], { cwd: path.join(__dirname, '..') });
  let rest = '';
  const lies = (stueck) => {
    rest += stueck.toString();
    const teile = rest.split('\n');
    rest = teile.pop();
    for (const zeile of teile) {
      const z = zeile.trim();
      if (!z) continue;
      osmLauf.zeilen.push(z);
      if (osmLauf.zeilen.length > 200) osmLauf.zeilen.shift();
      // "[osm] Norden ... 34 Treffer, 31 neu" bzw. "... FEHLER - ..."
      if (/Treffer|FEHLER/.test(z)) osmLauf.gebieteFertig++;
      const m = z.match(/OSM-Importer fuer (\d+)/);
      if (m) osmLauf.gebieteGesamt = parseInt(m[1], 10);
      console.log('[osm-import] ' + z);
    }
  };
  kind.stdout.on('data', lies);
  kind.stderr.on('data', lies);

  kind.on('error', (e) => {
    osmLauf.laeuft = false;
    osmLauf.fehler = 'Import liess sich nicht starten: ' + e.message;
  });
  kind.on('close', (code) => {
    osmLauf.laeuft = false;
    osmLauf.fertig = true;
    if (code !== 0) {
      // Exit-Code 2 setzt der Importer, wenn kein einziger Betrieb ankam.
      const letzte = osmLauf.zeilen.filter((z) => /ABBRUCH|FEHLER/.test(z)).slice(-3);
      osmLauf.fehler = letzte.length ? letzte.join(' | ') : 'Import mit Code ' + code + ' beendet.';
    }
  });

  // Notbremse: haengt der Import nach 20 Minuten noch, wird er beendet.
  setTimeout(() => { if (osmLauf.laeuft) { kind.kill(); osmLauf.fehler = 'Import nach 20 Minuten abgebrochen.'; } }, 1200000);
}

// ------------------------------------------------- Probeanruf-Demo ---------
// Eine eigene Nummer nur fuer Demos. Ohne sie wuerde eine Demo die Nummer
// eines zahlenden Kunden ueberschreiben - deshalb bricht der Aufbau lieber ab.
function demoNummer() {
  const n = telefonKunden.normalisiereNummer(process.env.TELEFON_DEMO_NUMMER || '');
  if (!n) {
    throw new Error('Keine Demo-Nummer eingerichtet. Trage TELEFON_DEMO_NUMMER=+49... in die .env ein - ' +
      'am besten eine zweite Twilio-Nummer, die nur fuer Probeanrufe da ist.');
  }
  return n;
}

// Was liegt gerade auf der Demo-Nummer? Wird auch gebraucht, um eine
// abgelaufene Demo zu erkennen, bevor jemand sie noch anruft.
function demoStand() {
  let nummer;
  try { nummer = demoNummer(); } catch (e) { return { eingerichtet: false, hinweis: e.message }; }
  let eintrag;
  try { eintrag = telefonKunden.liesNummern()[nummer]; } catch (_e) { eintrag = undefined; }
  if (!eintrag) return { eingerichtet: true, nummer, belegt: false };
  const datei = typeof eintrag === 'object' ? String(eintrag.datei || '') : '';
  if (!datei) return { eingerichtet: true, nummer, belegt: true, fremd: true };
  let kunde = {};
  try {
    kunde = JSON.parse(fs.readFileSync(path.join(telefonKunden.pfade().basis, datei), 'utf8'));
  } catch (_e) { /* Datei weg = wie unbelegt behandeln */ }
  return {
    eingerichtet: true, nummer, belegt: true,
    name: kunde.name || '', fuer: kunde.demoFuer || '',
    gerichte: (kunde.speisekarte || []).length,
    demoBis: kunde.demoBis || '',
    abgelaufen: demoKunde.istAbgelaufen(kunde),
    ansage: demoKunde.ansageFuerIbo(kunde, nummer, (kunde.speisekarte || []).length)
  };
}

// Der Telefon-Retter frischt seine Kundendaten sonst nur alle 5 Minuten auf -
// im Verkaufsgespraech ist das zu lang. Deshalb stupsen wir ihn direkt an.
// Klappt das nicht, ist die Demo trotzdem gebaut, nur eben etwas spaeter live.
async function telefonNeuLaden() {
  try {
    const antwort = await fetch(TELEFON_URL + '/neu-laden', {
      method: 'POST',
      headers: process.env.TELEFON_WEBHOOK_SCHLUESSEL
        ? { 'X-Schluessel': process.env.TELEFON_WEBHOOK_SCHLUESSEL } : {},
      signal: AbortSignal.timeout(8000)
    });
    return antwort.ok;
  } catch (_e) { return false; }
}

// Speisekarte von einer Webseite holen. Frueher steckte das direkt in der
// Route - jetzt braucht es auch der Probeanruf, deshalb steht es hier einmal.
async function importiereWebseite(url) {
  const imp = require('../telefon-retter/lib/webseite-import');
  let ziel = String(url || '').trim();
  if (!ziel) throw new Error('Keine Webseiten-Adresse angegeben.');
  if (!/^https?:\/\//i.test(ziel)) ziel = 'https://' + ziel;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY fehlt - erst "node schluessel-einrichten.js" (Schritt 1).');
  }
  const hole = async (adresse) => {
    const antwort = await fetch(adresse, {
      headers: { 'User-Agent': 'Mozilla/5.0 (kompatibel; KURANI-Import)' },
      signal: AbortSignal.timeout(20000), redirect: 'follow'
    });
    if (!antwort.ok) throw new Error('Die Seite antwortet mit ' + antwort.status);
    return antwort.text();
  };
  const html = await hole(ziel);
  let text = imp.textAusHtml(html);
  for (const link of imp.findeSpeisekartenLinks(html, ziel)) {
    try { text += '\n\n--- ' + link + ' ---\n' + imp.textAusHtml(await hole(link)); } catch (_e) { /* weiter */ }
  }
  const antwort = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01', 'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODELL || 'claude-sonnet-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: imp.baueImportPrompt(text.slice(0, 60000), ziel) }]
    })
  });
  if (!antwort.ok) throw new Error('Anthropic ' + antwort.status);
  const daten = await antwort.json();
  const roh = (daten.content || []).filter((t) => t.type === 'text').map((t) => t.text).join('');
  return Object.assign({ webseite: ziel }, imp.parseImportAntwort(roh));
}

// Demo bauen: Speisekarte holen (Website oder mitgeschickte Liste),
// Demo-Kunden schreiben, Nummer belegen, Telefon-Retter anstupsen.
async function baueDemo(eintrag, mitgeschickteKarte) {
  const nummer = demoNummer();

  // Nie die Nummer eines echten Kunden ueberschreiben.
  const frei = demoKunde.nummerFrei(nummer, telefonKunden.liesNummern());
  if (!frei.ok) throw new Error(frei.text);

  // Speisekarte: entweder von Hand mitgeschickt, sonst von seiner Website.
  // Klappt beides nicht, laeuft die Demo eben nur mit Reservierungen -
  // das ist ehrlicher, als Gerichte zu erfinden.
  let karte = Array.isArray(mitgeschickteKarte) ? mitgeschickteKarte : [];
  let kartenHinweis = karte.length ? 'Speisekarte von Hand übergeben.' : '';
  if (!karte.length && eintrag.website) {
    try {
      const importiert = await importiereWebseite(eintrag.website);
      karte = importiert.speisekarte || [];
      kartenHinweis = karte.length
        ? karte.length + ' Gerichte von seiner Website gelesen.'
        : 'Auf seiner Website war keine lesbare Speisekarte zu finden.';
    } catch (e) {
      kartenHinweis = 'Speisekarte konnte nicht gelesen werden (' + e.message + ').';
    }
  } else if (!karte.length) {
    kartenHinweis = 'Er hat keine Website - für Gerichte bitte die Karte fotografieren.';
  }

  const gebaut = demoKunde.baueDemoKunde(
    { name: eintrag.name, stadt: eintrag.stadt, schluessel: eintrag.schluessel }, karte, {});

  if (DEMO) {
    return {
      ok: true, nummer, simuliert: true, gerichte: gebaut.gerichte,
      kartenHinweis, ansage: demoKunde.ansageFuerIbo(gebaut.kunde, nummer, gebaut.gerichte)
    };
  }

  const gespeichert = telefonKunden.speichereEigenenKunden({
    nummer, slug: gebaut.slug, kann: gebaut.kann,
    name: gebaut.kunde.name, stadt: gebaut.kunde.stadt, tische: gebaut.kunde.tische,
    speisekarte: gebaut.kunde.speisekarte,
    demo: true, demoBis: gebaut.kunde.demoBis, demoFuer: gebaut.kunde.demoFuer
  });

  const live = await telefonNeuLaden();
  return {
    ok: true, nummer, gerichte: gespeichert.gerichte, kartenHinweis,
    demoBis: gebaut.kunde.demoBis,
    live,
    hinweis: live
      ? 'Die Demo ist sofort erreichbar.'
      : 'Der Telefon-Retter hat sich nicht melden lassen. Läuft er? Sonst ist die Demo in spätestens 5 Minuten aktiv.',
    ansage: demoKunde.ansageFuerIbo(gebaut.kunde, nummer, gespeichert.gerichte)
  };
}

// Prueft einen Interessenten wirklich nach: Website holen und lesen,
// Google-Platz und KI-Empfehlung testen. Die drei Teile laufen parallel -
// ein langsamer Server des Wirts soll die anderen beiden nicht aufhalten.
// Faellt ein Teil aus (kein Key, kein Netz), steht das ehrlich im Befund.
async function pruefeInteressent(eintrag) {
  const restaurant = { name: eintrag.name, city: eintrag.stadt, cuisine: eintrag.kategorie };
  const { fragen } = require('../sichtbarkeit/lib/fragen').suchfragen(restaurant);
  // Die Standardfrage der Stadt - dieselbe, die auch die Kunden-Reports
  // benutzen. So sind Interessent und Bestandskunde vergleichbar.
  const hauptfrage = (fragen.find((f) => f.id === 'kategorie-stadt') || fragen[0]).frage;
  const empfehlungsfrage = (fragen.find((f) => f.id === 'empfehlung-ki') || fragen[0]).frage;

  const [webseite, google, ki] = await Promise.all([
    eintrag.website ? leadCheck.holeWebsite(eintrag.website, {}) : Promise.resolve(null),
    checks.checkGoogle(hauptfrage, restaurant).catch((e) => ({ status: 'fehler', detail: e.message })),
    checks.checkKI(empfehlungsfrage, restaurant).catch((e) => ({ status: 'fehler', detail: e.message }))
  ]);

  return leadCheck.baueBefund(
    { name: eintrag.name, city: eintrag.stadt, website: eintrag.website, frage: hauptfrage },
    { webseite, google, ki },
    { frage: hauptfrage }
  );
}

async function baueInteressentenListe() {
  let prospects = [];
  try { prospects = JSON.parse(fs.readFileSync(PROSPECTS_DATEI, 'utf8')); } catch (_e) { /* keine Datei = leere Pipeline */ }
  return pipeline.baueListe({
    prospects: Array.isArray(prospects) ? prospects : [],
    leads: ladeLeads(),
    kundenNamen: (await ladeKunden()).map((k) => k.name),
    stand: ladePipelineStand()
  }, {});
}

// ------------------------------------------------- Inbound-Leads ------------
// Leads von der oeffentlichen Landingpage (data/leads.jsonl), neueste zuerst.
function ladeLeads() {
  try {
    return fs.readFileSync(path.join(DATEN_ORDNER, 'leads.jsonl'), 'utf8')
      .split('\n').filter((z) => z.trim())
      .map((z) => { try { return JSON.parse(z); } catch (_e) { return null; } })
      .filter(Boolean).reverse();
  } catch (_e) { return []; }
}

// ------------------------------------------- Monats-Aufgaben ---------------
// Pro Kunde: die konkreten Handgriffe des Monats, abgeleitet aus dem letzten
// Report. Welche abgehakt sind, merken wir pro Monat in data/<slug>/
// aufgaben-<JJJJ-MM>.json - so ist die Liste ein Arbeitsnachweis.
function aufgabenErledigtPfad(slug, monat) {
  return path.join(DATEN_ORDNER, slug, 'aufgaben-' + monat + '.json');
}
function ladeAufgabenErledigt(slug, monat) {
  try { return JSON.parse(fs.readFileSync(aufgabenErledigtPfad(slug, monat), 'utf8')); }
  catch (_e) { return {}; }
}
function speichereAufgabenErledigt(slug, monat, erledigt) {
  if (DEMO) return;
  try {
    const pfad = aufgabenErledigtPfad(slug, monat);
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    fs.writeFileSync(pfad, JSON.stringify(erledigt, null, 2));
  } catch (_e) { /* nice-to-have */ }
}

// Aufgaben eines Kunden fuer den aktuellen Monat (aus dem letzten Report-Lauf)
function kundenAufgaben(kunde) {
  const slug = effektiverSlug(kunde);
  const monat = report.monatsSchluessel();
  let ergebnis = null;
  const historie = kundenHistorie(slug);
  if (historie[0]) {
    try {
      ergebnis = JSON.parse(fs.readFileSync(path.join(DATEN_ORDNER, slug, historie[0].monat + '.json'), 'utf8')).ergebnis || null;
    } catch (_e) { /* alte Historie ohne ergebnis */ }
  }
  const aufgaben = require('./lib/aufgaben').baueAufgaben({
    ergebnis,
    monatsZahl: parseInt(monat.split('-')[1], 10) // fuer die Anlaesse des Monats
  });
  const erledigt = ladeAufgabenErledigt(slug, monat);
  return { monat, monatLabel: report.monatsLabel(monat), aufgaben: aufgaben.map((a) => Object.assign({}, a, { erledigt: !!erledigt[a.id] })) };
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
      if (osmLauf.laeuft) { json(res, 200, { ok: true, hinweis: 'Import laeuft bereits.' }); return; }
      starteOsmImport();
      json(res, 200, { ok: true, hinweis: 'Import laeuft (4-7 Minuten, 45 Gebiete).' });
      return;
    }

    // API: Wie weit ist der Import - und was meldet er? Ohne das sah man
    // nur einen Knopf, der irgendwann aufhoerte, sich zu drehen.
    if (req.method === 'GET' && pfad === '/api/osm-import') {
      json(res, 200, {
        laeuft: osmLauf.laeuft, zeilen: osmLauf.zeilen.slice(-12),
        letzte: osmLauf.zeilen[osmLauf.zeilen.length - 1] || '',
        fertig: osmLauf.fertig, fehler: osmLauf.fehler,
        gebieteFertig: osmLauf.gebieteFertig, gebieteGesamt: osmLauf.gebieteGesamt
      });
      return;
    }

    // API: Interessenten (Neukunden-Pipeline). Verzeichnis-Betriebe aus
    // prospects.json und Inbound-Anfragen der Check-Seite laufen in EINER
    // Liste zusammen, angereichert um den gemerkten Gespraechsstand.
    // Bestandskunden werden per Namens-Abgleich rausgefiltert.
    if (req.method === 'GET' && pfad === '/api/interessenten') {
      const liste = await baueInteressentenListe();
      json(res, 200, {
        stufen: pipeline.STUFEN,
        uebersicht: pipeline.zaehleStufen(liste),
        liste: liste.map((e) => Object.assign({}, e, {
          pitch: dateiInOrdner(PITCH_ORDNER, pitchDateiname({ name: e.name }))
            ? '/api/pitch-seite/' + pitchDateiname({ name: e.name }) : null
        }))
      });
      return;
    }

    // API: Betriebs-Check fuer EINEN Interessenten. Holt seine Website,
    // liest sie, prueft Google- und KI-Sichtbarkeit - und legt den Befund
    // in der Pipeline ab. Das ist der Unterschied zwischen "steht im
    // Verzeichnis" und "ich weiss, worueber ich mit dem rede".
    if (req.method === 'POST' && pfad === '/api/interessent-pruefen') {
      const body = await leseBody(req);
      const eintrag = (await baueInteressentenListe())
        .find((e) => e.schluessel === String(body.schluessel || ''));
      if (!eintrag) { json(res, 404, { fehler: 'Interessent nicht gefunden' }); return; }
      try {
        const befund = await pruefeInteressent(eintrag);
        if (!DEMO) {
          speicherePipelineStand(pipeline.setzeStand(ladePipelineStand(), eintrag.schluessel, { befund }));
        }
        json(res, 200, { ok: true, befund });
      } catch (e) {
        json(res, 500, { fehler: e.message });
      }
      return;
    }

    // API: Anfrage von der Check-Seite in die Pipeline eintragen.
    // Entweder die E-Mail komplett eingefuegt ({text}) oder die Felder von
    // Hand ({restaurant, ort, ...}). Die Netlify-Funktion speichert bewusst
    // nichts - deshalb kommt der Weg in die Pipeline von hier.
    if (req.method === 'POST' && pfad === '/api/anfrage-eintragen') {
      const body = await leseBody(req);
      const anfrage = require('./lib/anfrage-lesen');
      try {
        const lead = body.text
          ? anfrage.parseAnfrageMail(body.text)
          : anfrage.baueAnfrage(body);
        const vorhandene = ladeLeads();
        if (anfrage.schonVorhanden(lead, vorhandene)) {
          json(res, 409, { fehler: '"' + lead.restaurant + '" steht schon in der Liste. Nicht doppelt eingetragen.' });
          return;
        }
        if (!DEMO) {
          fs.mkdirSync(DATEN_ORDNER, { recursive: true });
          fs.appendFileSync(path.join(DATEN_ORDNER, 'leads.jsonl'), JSON.stringify(lead) + '\n');
        }
        json(res, 200, { ok: true, lead });
      } catch (e) {
        json(res, 400, { fehler: e.message });
      }
      return;
    }

    // API: Das Check-Ergebnis an den Wirt schicken, der danach gefragt hat.
    //
    // WICHTIG - und deshalb hier hart eingebaut: Das geht NUR an Betriebe,
    // die sich selbst gemeldet haben. Wer nur im Verzeichnis steht, hat uns
    // nicht um irgendetwas gebeten; eine Mail an ihn waere Kaltakquise per
    // E-Mail und in Deutschland ohne Einwilligung unzulaessig (§ 7 UWG).
    // Das darf keine Frage der Selbstbeherrschung im Alltag sein - der
    // Knopf muss es schlicht verweigern.
    if (req.method === 'POST' && pfad === '/api/anfrage-ergebnis-senden') {
      const body = await leseBody(req);
      const eintrag = (await baueInteressentenListe())
        .find((e) => e.schluessel === String(body.schluessel || ''));
      if (!eintrag) { json(res, 404, { fehler: 'Interessent nicht gefunden' }); return; }

      const erlaubt = require('./lib/anfrage-lesen')
        .darfErgebnisSenden(eintrag, { versandBereit: DEMO || versand.istKonfiguriert() });
      if (!erlaubt.ok) {
        json(res, erlaubt.grund === 'nicht-gefragt' ? 403 : 400, { fehler: erlaubt.text });
        return;
      }
      const empfaenger = erlaubt.empfaenger;

      const prospect = {
        name: eintrag.name, city: eintrag.stadt,
        category: eintrag.kategorie, phone: eintrag.telefon, website: eintrag.website
      };
      const datum = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      const html = bauePitchHtml(prospect, { datum, befund: eintrag.befund });

      if (DEMO) { json(res, 200, { ok: true, an: empfaenger, simuliert: true }); return; }

      const ergebnis = await versand.sendeReportMail({
        an: empfaenger,
        betreff: 'Ihr Sichtbarkeits-Check: ' + eintrag.name,
        text: 'Moin,\n\nSie hatten über kiekmolin.de/check nach einer Einschätzung gefragt. ' +
          'Hier ist sie.\n\n' + eintrag.befund.aufhaenger + '\n\n' +
          'Die vollständige Auswertung steht in dieser E-Mail (HTML-Ansicht). ' +
          'Rückfragen jederzeit – einfach antworten.\n\nViele Grüße\nIbrahim Kuran · KURANI',
        html
      });
      if (!ergebnis.ok) { json(res, 502, { fehler: ergebnis.fehler || 'Versand fehlgeschlagen.' }); return; }

      // Gesendet ist ein Kontakt: Stufe und Notiz gleich mitziehen, damit man
      // nicht am naechsten Tag denselben Wirt nochmal anschreibt.
      try {
        const stand = ladePipelineStand();
        const alt = stand[eintrag.schluessel] || {};
        speicherePipelineStand(pipeline.setzeStand(stand, eintrag.schluessel, {
          stufe: alt.stufe === 'neu' || !alt.stufe ? 'kontaktiert' : alt.stufe,
          notiz: ((alt.notiz ? alt.notiz + ' · ' : '') + 'Check-Ergebnis per Mail geschickt').slice(0, 2000)
        }));
      } catch (_e) { /* die Mail ist raus - das ist das Wichtige */ }

      json(res, 200, { ok: true, an: empfaenger });
      return;
    }

    // API: Probeanruf-Demo fuer einen Interessenten bauen.
    // Aus seiner Website (wenn vorhanden) wird die Speisekarte gezogen,
    // daraus ein befristeter Demo-Kunde auf der Demo-Nummer. Danach kann
    // der Wirt anrufen und SEINEN Laden ans Telefon gehen hoeren.
    if (req.method === 'POST' && pfad === '/api/demo-bauen') {
      const body = await leseBody(req);
      const eintrag = (await baueInteressentenListe())
        .find((e) => e.schluessel === String(body.schluessel || ''));
      if (!eintrag) { json(res, 404, { fehler: 'Interessent nicht gefunden' }); return; }
      try {
        json(res, 200, await baueDemo(eintrag, body.speisekarte));
      } catch (e) {
        json(res, 400, { fehler: e.message });
      }
      return;
    }

    // API: Demo wieder von der Nummer nehmen.
    if (req.method === 'POST' && pfad === '/api/demo-beenden') {
      if (DEMO) { json(res, 200, { ok: true }); return; }
      try {
        const nummer = demoNummer();
        telefonKunden.entferneNummer(nummer);
        await telefonNeuLaden();
        json(res, 200, { ok: true, nummer });
      } catch (e) {
        json(res, 400, { fehler: e.message });
      }
      return;
    }

    // API: Liegt gerade eine Demo auf der Nummer - und fuer wen?
    if (req.method === 'GET' && pfad === '/api/demo') {
      json(res, 200, demoStand());
      return;
    }

    // API: Gespraechsstand eines Interessenten setzen (Stufe, Notiz,
    // Wiedervorlage). Das ist das Gedaechtnis der Pipeline.
    if (req.method === 'POST' && pfad === '/api/interessent-status') {
      const body = await leseBody(req);
      if (DEMO) { json(res, 200, { ok: true }); return; }
      try {
        const stand = pipeline.setzeStand(ladePipelineStand(), body.schluessel, {
          stufe: body.stufe, notiz: body.notiz, wiedervorlage: body.wiedervorlage
        });
        speicherePipelineStand(stand);
        const liste = await baueInteressentenListe();
        json(res, 200, { ok: true, uebersicht: pipeline.zaehleStufen(liste) });
      } catch (e) {
        json(res, 400, { fehler: e.message });
      }
      return;
    }

    // API: Pitch-Seite fuer einen Interessenten erzeugen
    if (req.method === 'POST' && pfad === '/api/pitch') {
      const { name } = await leseBody(req);
      let liste = [];
      try { liste = JSON.parse(fs.readFileSync(PROSPECTS_DATEI, 'utf8')); } catch (_e) { /* s.o. */ }
      let prospect = liste.find((p) => String(p.name || '').toLowerCase() === String(name || '').toLowerCase());
      // Der Befund aus dem Betriebs-Check macht die Pitch-Seite persoenlich:
      // dann steht dort, was auf SEINER Seite fehlt, statt der Standardliste.
      const ausPipeline = (await baueInteressentenListe())
        .find((e) => e.name.toLowerCase() === String(name || '').toLowerCase());
      // Anfragen von der Check-Seite stehen nicht in prospects.json - fuer die
      // bauen wir den Pitch aus dem, was der Wirt selbst angegeben hat.
      if (!prospect && ausPipeline) {
        prospect = {
          name: ausPipeline.name, city: ausPipeline.stadt, category: ausPipeline.kategorie,
          phone: ausPipeline.telefon, website: ausPipeline.website
        };
      }
      if (!prospect) { json(res, 404, { fehler: 'Interessent nicht gefunden' }); return; }
      fs.mkdirSync(PITCH_ORDNER, { recursive: true });
      const datei = pitchDateiname(prospect);
      const datum = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      fs.writeFileSync(path.join(PITCH_ORDNER, datei),
        bauePitchHtml(prospect, { datum, befund: ausPipeline && ausPipeline.befund }));
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

    // API: Rueckgewinnung - welche Gaeste waren lange nicht mehr da?
    // Liest LIVE aus der Kiek-mol-in-Datenbank, speichert nichts.
    if (req.method === 'GET' && pfad.startsWith('/api/rueckgewinnung/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const rueck = require('./lib/rueckgewinnung');
      const schwelle = Math.max(30, parseInt(url.searchParams.get('tage'), 10) || 90);
      const heute = new Date();
      // Blickfeld: die letzten 12 Monate - aeltere Gaeste holt man selten zurueck
      const ab = new Date(heute.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      try {
        let reservierungen = [];
        let bestellungen = [];
        if (DEMO) {
          const t = (tage) => new Date(heute.getTime() - tage * 864e5).toISOString().slice(0, 10);
          reservierungen = [
            { guest_name: 'Familie Janssen', guest_phone: '04926 111', reservation_date: t(150), party_size: 4 },
            { guest_name: 'Familie Janssen', guest_phone: '04926 111', reservation_date: t(210), party_size: 4 },
            { guest_name: 'Familie Janssen', guest_phone: '04926 111', reservation_date: t(280), party_size: 5 },
            { guest_name: 'Herr Bruns', guest_phone: '04926 222', reservation_date: t(120), party_size: 2 },
            { guest_name: 'Frau Ubben', guest_phone: '04926 333', reservation_date: t(20), party_size: 2 }
          ];
          bestellungen = [
            { customer_name: 'Herr Bruns', customer_phone: '04926 222', created_at: t(130), total: 48.5 }
          ];
        } else {
          [reservierungen, bestellungen] = await Promise.all([
            supabase.gaesteReservierungen(kunde.id, ab).catch(() => []),
            supabase.gaesteBestellungen(kunde.id, ab).catch(() => [])
          ]);
        }
        const gaeste = rueck.fasseGaesteZusammen({ reservierungen, bestellungen });
        const inaktive = rueck.findeInaktive(gaeste, {
          schwelleTage: schwelle,
          bonProGast: parseFloat(process.env.BON_PRO_GAST) || 25,
          heute
        });
        // Anlass des Monats als Aufhaenger in die Nachricht
        const anlaesse = require('../sichtbarkeit/lib/anlaesse').anlaesseFuerMonat(heute.getMonth() + 1);
        json(res, 200, {
          schwelleTage: schwelle,
          bilanz: rueck.bilanz(inaktive),
          gaeste: inaktive.slice(0, 50),
          nachricht: rueck.baueNachricht(kunde, { anlass: anlaesse.length ? anlaesse[0].aufhaenger : '' }),
          rechtshinweis: rueck.RECHTSHINWEIS
        });
      } catch (e) {
        json(res, 502, { fehler: 'Gäste-Daten nicht abrufbar: ' + e.message });
      }
      return;
    }

    // Echtzeit-Leitung: eine offene Verbindung, durch die der Server
    // Neuigkeiten schiebt (Rueckrufe, Telefon-Zahlen, neue Anfragen).
    if (req.method === 'GET' && pfad === '/api/live') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no' // hinter einem Proxy nicht zwischenpuffern
      });
      const schreibe = (block) => res.write(block);
      const abmelden = verteiler.anmelden(schreibe);
      schreibe('event: bereit\ndata: {"ok":true}\n\n');
      req.on('close', abmelden);
      req.on('error', abmelden);
      return;
    }

    // API: Stille-Alarm - kippen die Zahlen dieser Woche?
    if (req.method === 'GET' && pfad.startsWith('/api/fruehwarnung/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      try {
        json(res, 200, await fruehwarnungFuer(kunde));
      } catch (e) {
        json(res, 502, { fehler: 'Zahlen nicht abrufbar: ' + e.message });
      }
      return;
    }

    // API: Gaeste-Ursprung - welcher Anteil kommt ueber uns rein?
    // Der Beleg fuers Honorar, gerechnet aus der Datenbank des Wirts.
    if (req.method === 'GET' && pfad.startsWith('/api/herkunft/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const herkunft = require('./lib/herkunft');
      const { monatsGrenzen, bonProGast } = require('../sichtbarkeit/lib/telefonzahlen');
      const monat = url.searchParams.get('monat') || report.monatsSchluessel();
      const { von, bis } = monatsGrenzen(monat);
      try {
        let reservierungen = [];
        let bestellungen = [];
        if (DEMO) {
          reservierungen = [
            ...Array(9).fill({ source: 'telefon', party_size: 3 }),
            ...Array(12).fill({ source: 'web', party_size: 2 }),
            ...Array(14).fill({ source: 'walk_in', party_size: 2 }),
            ...Array(5).fill({ party_size: 2 })
          ];
          bestellungen = [
            ...Array(6).fill({ source: 'telefon', total: 31.2 }),
            ...Array(11).fill({ source: 'web', total: 27.9 })
          ];
        } else {
          [reservierungen, bestellungen] = await Promise.all([
            supabase.herkunftReservierungen(kunde.id, von, bis).catch(() => []),
            supabase.herkunftBestellungen(kunde.id, von, bis).catch(() => [])
          ]);
        }
        const kanaele = herkunft.nachKanaelen({ reservierungen, bestellungen }, { bonProGast: bonProGast() });
        const b = herkunft.bilanz(kanaele);
        json(res, 200, {
          monat,
          monatLabel: report.monatsLabel(monat),
          kanaele,
          bilanz: b,
          satz: herkunft.satzFuerWirt(b, report.monatsLabel(monat), kunde.honorar || process.env.HONORAR_MONAT)
        });
      } catch (e) {
        json(res, 502, { fehler: 'Herkunft nicht abrufbar: ' + e.message });
      }
      return;
    }

    // API: Speisekarten-Doktor - wo bleibt auf der Karte Geld liegen?
    // API: Google-Ads-Kampagne fuer einen Kunden. Bringt Gaeste auf SEINE
    // Seite bei kiek mol in. Was der Betrieb nicht anbietet, wird auch nicht
    // beworben - sonst zahlt man fuer Klicks auf ein leeres Versprechen.
    if (req.method === 'GET' && pfad.startsWith('/api/google-ads/')) {
      const teile = pfad.split('/').filter(Boolean);          // api, google-ads, kennung[, csv-art]
      const kunde = await findeKunde(decodeURIComponent(teile[2] || ''));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const ads = require('./lib/google-ads');

      // Kann-Felder aus den echten Daten ableiten, nicht raten.
      let gerichte = [];
      try { gerichte = DEMO ? [] : await telefonDb.speisekarte(kunde.id); } catch (_e) { gerichte = []; }
      let tische = 0;
      try { tische = DEMO ? 8 : await telefonDb.anzahlAktiveTische(kunde.id); } catch (_e) { tische = 0; }
      const koennen = { bestellung: DEMO ? true : gerichte.length > 0, reservierung: tische > 0 };

      const kampagne = ads.baueKampagne(kunde, koennen, {
        gerichte: gerichte.slice(0, 3).map((g) => g.name).filter(Boolean)
      });

      // Download als CSV fuer den Google Ads Editor
      const art = teile[3];
      if (art) {
        const bauer = { keywords: ads.alsCsvKeywords, negative: ads.alsCsvNegative, anzeigen: ads.alsCsvAnzeigen }[art];
        if (!bauer) { json(res, 400, { fehler: 'Unbekannte CSV-Art' }); return; }
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="google-ads-' + art + '-' + effektiverSlug(kunde) + '.csv"'
        });
        res.end('﻿' + bauer(kampagne));   // BOM, damit Excel die Umlaute richtig anzeigt
        return;
      }
      json(res, 200, Object.assign({ koennen }, kampagne));
      return;
    }

    if (req.method === 'GET' && pfad.startsWith('/api/speisekarte-doktor/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      const doktor = require('./lib/speisekarte-doktor');
      const tage = Math.min(365, Math.max(30, parseInt(url.searchParams.get('tage'), 10) || 90));
      const ab = new Date(Date.now() - tage * 864e5).toISOString().slice(0, 10);
      try {
        let karte = [];
        let bestellungen = [];
        if (DEMO) {
          // Beispiel-Karte mit genau den Fehlern, die es in echt gibt:
          // Renner steht unten, ist zu billig, zwei Gerichte laufen nie.
          const pizza = { menu_categories: { name: 'Pizza' } };
          const pasta = { menu_categories: { name: 'Pasta' } };
          karte = [
            Object.assign({ name: 'Pizza Tonno', description: 'mit Thunfisch und Zwiebeln', base_price: 11.5 }, pizza),
            Object.assign({ name: 'Pizza Quattro Formaggi', description: '', base_price: 13.5 }, pizza),
            Object.assign({ name: 'Pizza Vegetaria', description: 'Gemüse der Saison', base_price: 12 }, pizza),
            Object.assign({ name: 'Pasta Arrabiata', description: '', base_price: 10.5 }, pasta),
            Object.assign({ name: 'Pasta Frutti di Mare', description: 'mit Meeresfrüchten', base_price: 15.5 }, pasta),
            Object.assign({ name: 'Pizza Salami', description: 'Salami und Mozzarella', base_price: 9.5 }, pizza),
            Object.assign({ name: 'Pizza Margherita', description: '', base_price: 8.5 }, pizza)
          ];
          bestellungen = [];
          for (let i = 0; i < 40; i++) {
            const name = i % 2 ? 'Pizza Margherita' : (i % 3 ? 'Pizza Salami' : 'Pizza Tonno');
            bestellungen.push({ items: [{ name, quantity: 1 + (i % 2) }] });
          }
        } else {
          [karte, bestellungen] = await Promise.all([
            supabase.speisekarte(kunde.id).catch(() => []),
            supabase.bestellArtikel(kunde.id, ab).catch(() => [])
          ]);
        }
        json(res, 200, Object.assign({ zeitraumTage: tage }, doktor.analysiere(karte, bestellungen)));
      } catch (e) {
        json(res, 502, { fehler: 'Speisekarte nicht abrufbar: ' + e.message });
      }
      return;
    }

    // API: Monats-Aufgaben eines Kunden (die konkreten Handgriffe)
    if (req.method === 'GET' && pfad.startsWith('/api/aufgaben/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      json(res, 200, kundenAufgaben(kunde));
      return;
    }

    // API: Aufgabe abhaken / Haken entfernen (pro Monat gemerkt)
    if (req.method === 'POST' && pfad === '/api/aufgabe-erledigt') {
      const { kennung, id, erledigt } = await leseBody(req);
      if (!id) { json(res, 400, { fehler: 'id fehlt' }); return; }
      const kunde = await findeKunde(kennung);
      if (!kunde) { json(res, 404, { fehler: 'Kunde nicht gefunden' }); return; }
      if (DEMO) { json(res, 200, { ok: true }); return; }
      const slug = effektiverSlug(kunde);
      const monat = report.monatsSchluessel();
      const stand = ladeAufgabenErledigt(slug, monat);
      if (erledigt) stand[id] = new Date().toISOString(); else delete stand[id];
      speichereAufgabenErledigt(slug, monat, stand);
      json(res, 200, { ok: true });
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

    // Oeffentliche Landingpage: kostenloser KI-Sichtbarkeits-Check als
    // Lead-Koeder. Wirte tragen ihr Restaurant + Kontakt ein und landen
    // als Inbound-Lead in der Pipeline. Kein Login, oeffentlich teilbar.
    if (req.method === 'GET' && (pfad === '/check' || pfad === '/check/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(require('./lib/landing').baueLandingHtml());
      return;
    }

    // Lead-Eingang von der Landingpage (oeffentlich). Speichert nach
    // data/leads.jsonl - kommt als heisser Inbound-Lead ins Dashboard.
    if (req.method === 'POST' && pfad === '/api/lead') {
      const body = await leseBody(req);
      const rein = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
      const lead = {
        restaurant: rein(body.restaurant), ort: rein(body.ort), name: rein(body.name),
        kontakt: rein(body.kontakt), nachricht: rein(body.nachricht),
        zeit: new Date().toISOString(), status: 'neu'
      };
      if (!lead.restaurant || !lead.kontakt) { json(res, 400, { fehler: 'Restaurant und Kontakt sind Pflicht.' }); return; }
      if (!DEMO) {
        try {
          fs.mkdirSync(DATEN_ORDNER, { recursive: true });
          fs.appendFileSync(path.join(DATEN_ORDNER, 'leads.jsonl'), JSON.stringify(lead) + '\n');
        } catch (_e) { /* nicht kritisch fuer den Wirt */ }
      }
      // Sofort per E-Mail an Ibo, wenn Versand konfiguriert ist
      if (!DEMO && process.env.AGENTUR_EMAIL && versand.istKonfiguriert()) {
        versand.sendeReportMail({
          an: process.env.AGENTUR_EMAIL,
          betreff: 'Neuer Lead: ' + lead.restaurant + (lead.ort ? ' (' + lead.ort + ')' : ''),
          text: 'Neuer Inbound-Lead über den Sichtbarkeits-Check:\n\n' +
            'Restaurant: ' + lead.restaurant + '\nOrt: ' + lead.ort + '\nName: ' + lead.name +
            '\nKontakt: ' + lead.kontakt + '\nNachricht: ' + lead.nachricht + '\n\nJetzt zurückrufen!'
        }).catch(() => {});
      }
      json(res, 200, { ok: true });
      return;
    }

    // Inbound-Leads fuers Dashboard (neueste zuerst). Gezeigt wird nur, was
    // noch niemand angefasst hat - sobald die Anfrage in der Pipeline auf
    // "Angerufen" steht, verschwindet der rote Kasten von allein.
    if (req.method === 'GET' && pfad === '/api/leads') {
      const stand = ladePipelineStand();
      json(res, 200, ladeLeads().filter((l) => {
        const e = stand[pipeline.schluesselFuer(l.restaurant, l.ort)];
        return !e || e.stufe === 'neu';
      }));
      return;
    }

    // Verkaufs-Leitfaden: Gespraechs-Spickzettel fuer Ibo, personalisiert
    // mit echten Zahlen (Quote, KI-Konkurrenz) des Betriebs.
    if (req.method === 'GET' && pfad.startsWith('/leitfaden/')) {
      const kunde = await findeKunde(decodeURIComponent(pfad.split('/').pop()));
      if (!kunde) { res.writeHead(404); res.end('Kunde nicht gefunden'); return; }
      const slug = effektiverSlug(kunde);
      const historie = kundenHistorie(slug);
      let quoteProzent = null;
      let kiKonkurrenz = [];
      if (historie[0]) {
        if (historie[0].quote && historie[0].quote.prozent != null) quoteProzent = historie[0].quote.prozent;
        try {
          const letzter = JSON.parse(fs.readFileSync(path.join(DATEN_ORDNER, slug, historie[0].monat + '.json'), 'utf8'));
          if (letzter.ergebnis) kiKonkurrenz = report.kiKonkurrenz(letzter.ergebnis);
        } catch (_e) { /* alte Historie */ }
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(require('./lib/verkauf').baueVerkaufHtml(kunde, { quoteProzent, kiKonkurrenz }));
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

    // --- Telefon-Kunden verwalten (auch Betriebe OHNE Kiek mol in) --------
    // Frueher hiess das: zwei JSON-Dateien im Texteditor bearbeiten. Hier
    // schreibt die App beide zusammen und prueft, was fehlt.
    if (req.method === 'GET' && pfad === '/api/telefon-kunden') {
      const tk = require('./lib/telefon-kunden');
      try {
        json(res, 200, { kunden: tk.listeKunden() });
      } catch (e) {
        json(res, 500, { fehler: e.message });
      }
      return;
    }

    if (req.method === 'POST' && pfad === '/api/telefon-kunde') {
      const tk = require('./lib/telefon-kunden');
      try {
        json(res, 200, Object.assign({ ok: true }, tk.speichereEigenenKunden(await leseBody(req))));
      } catch (e) {
        json(res, 400, { fehler: e.message });
      }
      return;
    }

    if (req.method === 'POST' && pfad === '/api/telefon-kunde-entfernen') {
      const tk = require('./lib/telefon-kunden');
      try {
        json(res, 200, Object.assign({ ok: true }, tk.entferneNummer((await leseBody(req)).nummer)));
      } catch (e) {
        json(res, 400, { fehler: e.message });
      }
      return;
    }

    // API: Speisekarte + Stammdaten von der Webseite des Wirts holen.
    // Fuellt das Formular vor - abtippen entfaellt.
    if (req.method === 'POST' && pfad === '/api/webseite-lesen') {
      const { url } = await leseBody(req);
      const imp = require('../telefon-retter/lib/webseite-import');
      let ziel = String(url || '').trim();
      if (!ziel) { json(res, 400, { fehler: 'Bitte eine Webseiten-Adresse angeben.' }); return; }
      try {
        const ergebnis = await importiereWebseite(ziel);
        json(res, 200, Object.assign({ ok: true }, ergebnis));
      } catch (e) {
        json(res, 502, { fehler: e.message });
      }
      return;
    }

    // API: Speisekarte lesen - fuer Betriebe OHNE Webseite.
    // Entweder Fotos der Papierkarte oder abgetippter/eingefuegter Text.
    if (req.method === 'POST' && pfad === '/api/speisekarte-lesen') {
      const koerper = await leseBody(req);
      if (koerper._zuGross) {
        json(res, 413, { fehler: 'Die Bilder sind zusammen zu groß. Bitte weniger oder kleinere Fotos.' });
        return;
      }
      const imp = require('../telefon-retter/lib/webseite-import');
      const text = String(koerper.text || '').trim().slice(0, 60000);
      const bilder = (Array.isArray(koerper.bilder) ? koerper.bilder : []).slice(0, 6);
      if (!text && !bilder.length) {
        json(res, 400, { fehler: 'Bitte Text einfügen oder ein Foto der Karte hochladen.' });
        return;
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        json(res, 400, { fehler: 'ANTHROPIC_API_KEY fehlt – erst "node schluessel-einrichten.js" (Schritt 1).' });
        return;
      }
      try {
        // Bilder kommen als data:-URL aus dem Browser -> in das Format
        // bringen, das Anthropic erwartet (Typ + reines Base64).
        const inhalt = [];
        for (const b of bilder) {
          const treffer = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i.exec(String(b || ''));
          if (!treffer) continue;
          inhalt.push({
            type: 'image',
            source: { type: 'base64', media_type: treffer[1].toLowerCase(), data: treffer[2] }
          });
        }
        if (!inhalt.length && !text) {
          json(res, 400, { fehler: 'Die Bilder konnten nicht gelesen werden (nur JPG, PNG, WEBP).' });
          return;
        }
        inhalt.push({ type: 'text', text: imp.baueKartenPrompt(text) });

        const antwort = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01', 'content-type': 'application/json'
          },
          signal: AbortSignal.timeout(180000),
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODELL || 'claude-sonnet-5',
            max_tokens: 16000,
            messages: [{ role: 'user', content: inhalt }]
          })
        });
        if (!antwort.ok) throw new Error('Anthropic ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
        const daten = await antwort.json();
        const roh = (daten.content || []).filter((t) => t.type === 'text').map((t) => t.text).join('');
        json(res, 200, Object.assign({ ok: true }, imp.parseKarte(roh)));
      } catch (e) {
        json(res, 502, { fehler: e.message });
      }
      return;
    }

    // API: Liste der letzten Anrufe - wer, wie lange, was kam dabei raus
    if (req.method === 'GET' && pfad === '/api/anrufe') {
      const prot = require('./lib/anruf-protokoll');
      const grenze = Math.min(50, Math.max(1, parseInt(url.searchParams.get('anzahl'), 10) || 20));
      const anrufe = [];
      if (fs.existsSync(TELEFON_LOGS)) {
        const dateien = fs.readdirSync(TELEFON_LOGS)
          .filter((f) => f.startsWith('anruf-') && f.endsWith('.log'))
          .sort().reverse().slice(0, grenze);
        for (const datei of dateien) {
          try {
            const text = fs.readFileSync(path.join(TELEFON_LOGS, datei), 'utf8');
            anrufe.push(prot.kurzfassung(prot.parseProtokoll(text, datei)));
          } catch (_e) { /* eine kaputte Datei darf die Liste nicht kippen */ }
        }
      }
      json(res, 200, { anrufe, aufbewahrungTage: parseInt(process.env.LOG_AUFBEWAHRUNG_TAGE || '30', 10) });
      return;
    }

    // API: ein einzelnes Gespraech, aufbereitet wie ein Chat-Verlauf
    if (req.method === 'GET' && pfad.startsWith('/api/anruf/')) {
      const prot = require('./lib/anruf-protokoll');
      const name = path.basename(decodeURIComponent(pfad.slice('/api/anruf/'.length)));
      const datei = path.join(TELEFON_LOGS, name);
      if (!/^anruf-.+\.log$/.test(name) || !fs.existsSync(datei)) {
        json(res, 404, { fehler: 'Protokoll nicht gefunden' });
        return;
      }
      json(res, 200, prot.parseProtokoll(fs.readFileSync(datei, 'utf8'), name));
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

// ----------------------------------------------- Echtzeit-Wachhund ----
// Schaut regelmaessig nach, ob etwas Neues passiert ist, und schiebt es
// sofort in alle offenen Browser-Fenster. Der Browser fragt nicht mehr -
// er wird benachrichtigt.
const WACHE_MS = Math.max(3000, parseInt(process.env.LIVE_INTERVALL_MS, 10) || 8000);
const wacheStand = {
  ersterLauf: true,
  rueckrufIds: new Set(),
  leadIds: new Set(),
  statistik: null
};

async function wachhundLauf() {
  if (!verteiler.anzahl) return; // niemand schaut hin - keine Arbeit machen
  const ersterLauf = wacheStand.ersterLauf;
  wacheStand.ersterLauf = false;

  // 1. Rueckruf-Wuensche: der eiligste Fall ueberhaupt
  try {
    const rueckrufe = await ladeRueckrufe();
    const neue = live.neueEintraege(wacheStand.rueckrufIds, rueckrufe, 'id', ersterLauf);
    for (const r of neue) {
      verteiler.sende('rueckruf', {
        name: r.name || 'Gast', restaurant: r.restaurant || '', anliegen: r.anliegen || '',
        telefon: r.telefon || '', offen: rueckrufe.length
      });
    }
    if (neue.length) uebersichtCache = { zeit: 0, daten: null };
  } catch (_e) { /* Datenbank kurz weg - naechster Lauf */ }

  // 2. Telefon-Zahlen: neue Reservierungen/Bestellungen ueber die Leitung
  try {
    const jetzt = anrufStatistik();
    const felder = ['anrufeHeute', 'reservierungen', 'bestellungen', 'rueckrufe'];
    const mehr = ersterLauf ? null : live.zuwachs(wacheStand.statistik, jetzt, felder);
    wacheStand.statistik = jetzt;
    if (mehr) {
      verteiler.sende('telefon', { zuwachs: mehr, meldung: live.meldungFuerZuwachs(mehr), statistik: jetzt });
      uebersichtCache = { zeit: 0, daten: null };
    }
  } catch (_e) { /* Statistik-Datei gerade in Arbeit */ }

  // 3. Neue Anfragen von der oeffentlichen /check-Seite
  try {
    const neue = live.neueEintraege(wacheStand.leadIds, ladeLeads(), 'zeit', ersterLauf);
    for (const l of neue) {
      verteiler.sende('lead', { name: l.name || '', betrieb: l.betrieb || '', ort: l.ort || '' });
    }
  } catch (_e) { /* keine Leads-Datei */ }
}

setTimeout(() => wachhundLauf().catch(() => {}), 2000);
setInterval(() => wachhundLauf().catch(() => {}), WACHE_MS);
setInterval(() => verteiler.herzschlag(), live.HERZSCHLAG_MS);

// Monats-Automatik: kurz nach dem Start pruefen, danach stuendlich.
// Laeuft der Rechner am Stichtag nicht, holt der naechste Start den Lauf nach.
if (AUTO_TAG > 0) {
  setTimeout(() => pruefeAutomatik().catch((e) => console.warn('Automatik-Pruefung: ' + e.message)), 15000);
  setInterval(() => pruefeAutomatik().catch((e) => console.warn('Automatik-Pruefung: ' + e.message)), 60 * 60 * 1000);
}
// Wochen-Digest (Montags-Mail an AGENTUR_EMAIL) - gleiche stuendliche Pruefung
setTimeout(() => pruefeDigest().catch((e) => console.warn('Digest-Pruefung: ' + e.message)), 20000);
setInterval(() => pruefeDigest().catch((e) => console.warn('Digest-Pruefung: ' + e.message)), 60 * 60 * 1000);
