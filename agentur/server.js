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

ladeEnv(); // liest sichtbarkeit/.env

const PORT = parseInt(process.env.AGENTUR_PORT || '3200', 10);
const DEMO = process.argv.includes('--demo');
const SICHT_ORDNER = path.join(__dirname, '..', 'sichtbarkeit');
const REPORT_ORDNER = path.join(SICHT_ORDNER, 'reports');
const DATEN_ORDNER = path.join(SICHT_ORDNER, 'data');
const AUFBEREITUNG_ORDNER = path.join(SICHT_ORDNER, 'aufbereitung');
const TELEFON_LOGS = path.join(__dirname, '..', 'telefon-retter', 'logs');
const TELEFON_URL = process.env.TELEFON_URL || 'http://localhost:3100';

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
          erstellt: d.erstellt,
          html: dateiFallsVorhanden(slug + '-' + d.monat + '.html'),
          pdf: dateiFallsVorhanden(slug + '-' + d.monat + '.pdf')
        });
      } catch (_e) { /* kaputte Datei ueberspringen */ }
    }
  }
  return eintraege;
}

function dateiFallsVorhanden(name) {
  return fs.existsSync(path.join(REPORT_ORDNER, name)) ? '/reports/' + name : null;
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

      const vormonat = report.ladeVormonat(slug, monat);
      report.speichereHistorie(slug, monat, {
        monat, erstellt: new Date().toISOString(),
        restaurant: { name: kunde.name, city: kunde.city, slug },
        quote: report.quote(ergebnis), ergebnis
      });

      jobs[jobId].schritt = 'Report rendern';
      const html = report.renderHtml({ restaurant: kunde, kategorie: sf.kategorie, monat, ergebnis, vormonat });
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

// Batch: Reports fuer ALLE Kunden nacheinander (die Monats-Routine per Klick)
async function starteBatchReport() {
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
          ergebnisse.push({ kunde: kunde.name, quote: einzel.quote || null, html: einzel.html || null, fehler: einzel.fehler || null });
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

// ------------------------------------------------------- Telefon-Retter ----
async function telefonStatus() {
  const status = { laeuft: false, restaurant: null, stufe: null, anrufe: [] };
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

    // API: Kundenliste inkl. Historie-Kurzinfo
    if (req.method === 'GET' && pfad === '/api/kunden') {
      const kunden = await ladeKunden();
      json(res, 200, kunden.map((k) => {
        const slug = effektiverSlug(k);
        const historie = kundenHistorie(slug);
        return {
          id: k.id, name: k.name, stadt: k.city || '', slug,
          kategorie: suchfragen(k).kategorie,
          fragenAnzahl: suchfragen(k).fragen.length,
          reports: historie.length,
          letzterReport: historie[0] || null
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
      json(res, 200, {
        id: kunde.id, name: kunde.name, stadt: kunde.city || '', slug,
        adresse: kunde.address || '', telefon: kunde.phone || '',
        kategorie: suchfragen(kunde).kategorie,
        fragen: suchfragen(kunde).fragen.map((f) => f.frage),
        historie: kundenHistorie(slug),
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
      json(res, 200, { ok: true, dateien: fs.readdirSync(ordner), ordner: 'sichtbarkeit/aufbereitung/' + slug });
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
});
