#!/usr/bin/env node
'use strict';

// KURANI · KI-SICHTBARKEIT
// Ein Befehl pro Kunde:
//
//   node sichtbarkeit.js liste                  alle aktiven Betriebe anzeigen
//   node sichtbarkeit.js report <name|slug>     Monats-Report erzeugen (Teil B)
//   node sichtbarkeit.js report --demo          Beispiel-Report mit Demo-Daten
//   node sichtbarkeit.js aufbereitung <name>    JSON-LD, Texte & GBP-Checkliste (Teil A)
//
// Regeln: Supabase wird NUR gelesen. Secrets liegen in .env (siehe .env.example).

const fs = require('fs');
const path = require('path');
const { ladeEnv } = require('./lib/env');
const supabase = require('./lib/supabase');
const { suchfragen } = require('./lib/fragen');
const aufbereitung = require('./lib/aufbereitung');
const report = require('./lib/report');
const { telefonZahlen } = require('./lib/telefonzahlen');

ladeEnv();

const REPORT_ORDNER = path.join(__dirname, 'reports');
const AUFBEREITUNG_ORDNER = path.join(__dirname, 'aufbereitung');

function slugVon(restaurant) {
  return restaurant.slug || String(restaurant.name || 'betrieb')
    .toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function cmdListe() {
  const alle = await supabase.alleRestaurants();
  console.log('\nAktive Betriebe (' + alle.length + '):\n');
  for (const r of alle) {
    console.log('  ' + (r.slug || slugVon(r)).padEnd(32) + (r.name || '') + (r.city ? '  ·  ' + r.city : ''));
  }
  console.log('\nReport erzeugen:  node sichtbarkeit.js report <slug>\n');
}

async function cmdReport(suchbegriff, optionen) {
  let restaurant, ergebnis, vormonat, kategorie, telefon;
  const monat = optionen.monat || report.monatsSchluessel();

  if (optionen.demo) {
    // Demo-Modus: kein Netz noetig, zeigt den fertigen Report mit Beispieldaten
    const demo = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo', 'demo-daten.json'), 'utf8'));
    restaurant = demo.restaurant;
    kategorie = suchfragen(restaurant).kategorie;
    ergebnis = demo.ergebnis;
    const vor = new Date();
    vor.setDate(1);
    vor.setMonth(vor.getMonth() - 1);
    vormonat = { monat: report.monatsSchluessel(vor), quote: demo.vormonatQuote, ergebnis: demo.vormonatErgebnis };
    telefon = demo.telefon || null;
    console.log('Demo-Modus: Beispieldaten fuer "' + restaurant.name + '"');
  } else {
    if (!suchbegriff) {
      console.error('Bitte Betrieb angeben:  node sichtbarkeit.js report <name|slug>   (oder --demo)');
      process.exit(1);
    }
    restaurant = await supabase.findeRestaurant(suchbegriff);
    if (!restaurant) {
      console.error('Betrieb "' + suchbegriff + '" nicht gefunden. Alle Betriebe: node sichtbarkeit.js liste');
      process.exit(1);
    }
    await reportFuerRestaurant(restaurant, monat);
    return;
  }

  const demoDaten = optionen.demo ? JSON.parse(fs.readFileSync(path.join(__dirname, 'demo', 'demo-daten.json'), 'utf8')) : null;
  const verlauf = demoDaten && demoDaten.verlauf ? demoDaten.verlauf : undefined;
  const html = report.renderHtml({ restaurant, kategorie, monat, ergebnis, vormonat, telefon, verlauf });
  fs.mkdirSync(REPORT_ORDNER, { recursive: true });
  const basisName = slugVon(restaurant) + '-' + monat;
  const htmlPfad = path.join(REPORT_ORDNER, basisName + '.html');
  fs.writeFileSync(htmlPfad, html);
  console.log('\nReport geschrieben: ' + htmlPfad);

  const pdfPfad = path.join(REPORT_ORDNER, basisName + '.pdf');
  if (report.htmlZuPdf(htmlPfad, pdfPfad)) {
    console.log('PDF geschrieben:    ' + pdfPfad);
  } else {
    console.log('Kein Chrome/Chromium gefunden - HTML im Browser oeffnen und mit Strg+P als PDF sichern.');
  }

  const q = report.quote(ergebnis);
  console.log('\nSichtbarkeits-Quote: ' + (q.prozent == null ? 'keine automatischen Tests gelaufen' : q.prozent + '% (' + q.gefunden + '/' + q.getestet + ')'));
}

// Kompletter Report-Lauf fuer EINEN echten Betrieb (Checks -> Historie -> HTML/PDF)
async function reportFuerRestaurant(restaurant, monat) {
  const sf = suchfragen(restaurant);
  console.log('\nReport fuer: ' + restaurant.name + (restaurant.city ? ' (' + restaurant.city + ')' : '') + ' · ' + report.monatsLabel(monat) + '\n');
  const ergebnis = await report.fuehreChecksAus(restaurant, sf.fragen);
  const vormonat = report.ladeVormonat(slugVon(restaurant), monat);
  // Umsatz-Nachweis: was der Telefon-Retter diesen Monat gebracht hat
  const telefon = await telefonZahlen(restaurant.id, monat);

  // Historie speichern - Grundlage fuer den Vormonats-Vergleich
  report.speichereHistorie(slugVon(restaurant), monat, {
    monat,
    erstellt: new Date().toISOString(),
    restaurant: { name: restaurant.name, city: restaurant.city, slug: slugVon(restaurant) },
    quote: report.quote(ergebnis),
    telefon,
    ergebnis
  });

  const verlauf = report.ladeVerlauf(slugVon(restaurant), monat, { quote: report.quote(ergebnis), telefon });
  const html = report.renderHtml({ restaurant, kategorie: sf.kategorie, monat, ergebnis, vormonat, telefon, verlauf });
  fs.mkdirSync(REPORT_ORDNER, { recursive: true });
  const basisName = slugVon(restaurant) + '-' + monat;
  const htmlPfad = path.join(REPORT_ORDNER, basisName + '.html');
  fs.writeFileSync(htmlPfad, html);
  console.log('Report geschrieben: ' + htmlPfad);

  const pdfPfad = path.join(REPORT_ORDNER, basisName + '.pdf');
  if (report.htmlZuPdf(htmlPfad, pdfPfad)) console.log('PDF geschrieben:    ' + pdfPfad);
  else console.log('Kein Chrome/Chromium gefunden - HTML im Browser oeffnen und als PDF drucken.');

  const q = report.quote(ergebnis);
  console.log('Sichtbarkeits-Quote: ' + (q.prozent == null ? 'keine automatischen Tests gelaufen' : q.prozent + '% (' + q.gefunden + '/' + q.getestet + ')'));
  return q;
}

// Batch: Monats-Reports fuer ALLE aktiven Betriebe (die Monats-Routine der Agentur)
async function cmdReportAlle(optionen) {
  const monat = optionen.monat || report.monatsSchluessel();
  const alle = await supabase.alleRestaurants();
  console.log('Batch-Lauf: ' + alle.length + ' Betriebe · ' + report.monatsLabel(monat));
  const zusammenfassung = [];
  for (const restaurant of alle) {
    try {
      const q = await reportFuerRestaurant(restaurant, monat);
      zusammenfassung.push({ name: restaurant.name, quote: q.prozent });
    } catch (e) {
      console.error('FEHLER bei "' + restaurant.name + '": ' + e.message + ' - weiter mit dem naechsten.');
      zusammenfassung.push({ name: restaurant.name, fehler: e.message });
    }
  }
  console.log('\n===== Zusammenfassung ' + report.monatsLabel(monat) + ' =====');
  for (const z of zusammenfassung) {
    console.log('  ' + z.name.padEnd(36) + (z.fehler ? 'FEHLER: ' + z.fehler : (z.quote == null ? 'keine autom. Tests' : z.quote + '%')));
  }
  console.log('\nAlle Reports liegen in: ' + REPORT_ORDNER);
}

async function cmdAufbereitung(suchbegriff) {
  if (!suchbegriff) {
    console.error('Bitte Betrieb angeben:  node sichtbarkeit.js aufbereitung <name|slug>');
    process.exit(1);
  }
  const restaurant = await supabase.findeRestaurant(suchbegriff);
  if (!restaurant) {
    console.error('Betrieb "' + suchbegriff + '" nicht gefunden. Alle Betriebe: node sichtbarkeit.js liste');
    process.exit(1);
  }
  const menue = await supabase.speisekarte(restaurant.id);
  const ordner = path.join(AUFBEREITUNG_ORDNER, slugVon(restaurant));
  fs.mkdirSync(ordner, { recursive: true });

  const jsonLd = aufbereitung.baueJsonLd(restaurant, menue);
  fs.writeFileSync(path.join(ordner, 'schema.jsonld'), JSON.stringify(jsonLd, null, 2));
  fs.writeFileSync(path.join(ordner, 'jsonld-snippet.html'),
    '<script type="application/ld+json">\n' + JSON.stringify(jsonLd, null, 2) + '\n</script>\n');
  fs.writeFileSync(path.join(ordner, 'beschreibung.txt'), aufbereitung.baueBeschreibung(restaurant) + '\n');
  fs.writeFileSync(path.join(ordner, 'speisekarte.txt'), aufbereitung.baueSpeisekartenText(restaurant, menue) + '\n');
  fs.writeFileSync(path.join(ordner, 'google-business-checkliste.md'), aufbereitung.baueGbpCheckliste(restaurant));
  const gbpPosts = require('./lib/gbp-posts');
  fs.writeFileSync(path.join(ordner, 'google-posts.md'),
    gbpPosts.bauePostsMarkdown(Object.assign({}, restaurant, { slug: slugVon(restaurant) }), menue, { monat: new Date().getMonth() + 1 }));

  console.log('\nAufbereitung fuer "' + restaurant.name + '" liegt in: ' + ordner);
  console.log('  schema.jsonld                  maschinenlesbare Betriebsdaten');
  console.log('  jsonld-snippet.html            fertig zum Einbau in jede Website (<head>)');
  console.log('  beschreibung.txt               klare Betriebsbeschreibung');
  console.log('  speisekarte.txt                Speisekarte als lesbarer Text (' + menue.length + ' Artikel)');
  console.log('  google-business-checkliste.md  personalisierte GBP-Checkliste');
  console.log('  google-posts.md                4 fertige Google-Beitraege + Bewertungs-Antworten');
}

// --- Argumente parsen -----------------------------------------------------------
(async function main() {
  const argv = process.argv.slice(2);
  const befehl = argv[0];
  const optionen = { demo: argv.includes('--demo') };
  const positional = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--monat') { optionen.monat = argv[i + 1]; i++; continue; }
    if (argv[i].startsWith('--')) continue;
    positional.push(argv[i]);
  }
  const suchbegriff = positional.join(' ') || null;

  try {
    if (befehl === 'liste') await cmdListe();
    else if (befehl === 'report' && argv.includes('--alle')) await cmdReportAlle(optionen);
    else if (befehl === 'report') await cmdReport(suchbegriff, optionen);
    else if (befehl === 'aufbereitung') await cmdAufbereitung(suchbegriff);
    else {
      console.log('KURANI · KI-Sichtbarkeit\n');
      console.log('  node sichtbarkeit.js liste                  alle aktiven Betriebe');
      console.log('  node sichtbarkeit.js report <name|slug>     Monats-Report (HTML + PDF)');
      console.log('  node sichtbarkeit.js report --alle          Monats-Reports fuer ALLE Betriebe (Batch)');
      console.log('  node sichtbarkeit.js report --demo          Beispiel-Report ohne Keys/Netz');
      console.log('  node sichtbarkeit.js aufbereitung <name>    JSON-LD, Texte, GBP-Checkliste');
    }
  } catch (e) {
    console.error('\nFehler: ' + e.message);
    process.exit(1);
  }
})();
