#!/usr/bin/env node
'use strict';

// Tests fuer den Sichtbarkeit-Baustein. Laufen ohne Keys/Netz:  node test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { suchfragen, erkenneKategorie } = require('./lib/fragen');
const report = require('./lib/report');
const aufbereitung = require('./lib/aufbereitung');
const demo = require('./demo/demo-daten.json');

let tests = 0;
function test(name, fn) { tests++; fn(); console.log('  ok  ' + name); }

// --- Suchfragen -----------------------------------------------------------------
test('Kategorien + deutsche Grammatik der Fragen', () => {
  const faelle = [
    [{ name: 'La Piazza', city: 'Emden', cuisine: 'italienisch' }, 'beste pizzeria in Emden'],
    [{ name: 'Taverne Rhodos', city: 'Norden', cuisine: 'griechisch' }, 'bestes griechisches restaurant in Norden'],
    [{ name: 'Deichkieker', city: 'Greetsiel', cuisine: 'fisch' }, 'bestes fischrestaurant in Greetsiel'],
    [{ name: 'Ali Baba', city: 'Aurich', cuisine: 'döner' }, 'bester döner in Aurich']
  ];
  for (const [rest, erwartet] of faelle) assert.strictEqual(suchfragen(rest).fragen[0].frage, erwartet);
});
test('Stadt im Namen wird nicht verdoppelt', () => {
  const f = suchfragen({ name: 'La Piazza Emden', city: 'Emden', cuisine: 'italienisch' }).fragen.find((x) => x.id === 'name-direkt');
  assert.strictEqual(f.frage, 'La Piazza Emden');
});
test('Kunden-Override (Greetsieler Boerse) greift per ID und Name, IDs stabil', () => {
  const boerse = { id: '888dc5bc-1649-4762-a8ee-2eb1e5e1dfad', name: 'Greetsieler Börse', city: 'Greetsiel', cuisine: 'deutsch' };
  const sf = suchfragen(boerse);
  assert.ok(sf.fragen.length >= 8 && sf.fragen[0].frage.includes('fischrestaurant'));
  assert.ok(suchfragen({ id: 'x', name: 'greetsieler börse', city: 'Greetsiel' }).fragen.length >= 8);
  assert.strictEqual(suchfragen(boerse).fragen.map((f) => f.id).join(','), sf.fragen.map((f) => f.id).join(','));
  // andere Kunden weiterhin automatisch
  assert.strictEqual(suchfragen({ id: 'y', name: 'La Piazza', city: 'Emden', cuisine: 'italienisch' }).kategorie, 'Pizzeria');
});

// --- Auswertung -------------------------------------------------------------------
test('Quote zaehlt nur automatische Tests', () => {
  const q = report.quote(demo.ergebnis);
  assert.deepStrictEqual({ getestet: q.getestet, gefunden: q.gefunden }, { getestet: 11, gefunden: 8 });
  assert.strictEqual(q.prozent, 73);
});
test('Trend nur bei gleicher Testbasis', () => {
  const html1 = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis,
    vormonat: { monat: '2026-07', quote: { getestet: 11, gefunden: 5, prozent: 45 }, ergebnis: demo.vormonatErgebnis }
  });
  assert.ok(html1.includes('+28 Punkte'), 'Trend bei gleicher Basis fehlt');
  const html2 = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis,
    vormonat: { monat: '2026-07', quote: { getestet: 4, gefunden: 2, prozent: 50 }, ergebnis: demo.vormonatErgebnis }
  });
  assert.ok(html2.includes('Testbasis geändert'), 'Vergleich ueber andere Basis nicht ausgesetzt');
});
test('Historie: Zweitlauf sichert alten Stand als .vorher.json', () => {
  const slug = 'test-' + process.pid;
  const ordner = path.join(__dirname, 'data', slug);
  try {
    report.speichereHistorie(slug, '2026-07', { quote: { prozent: 50 } });
    report.speichereHistorie(slug, '2026-07', { quote: { prozent: 70 } });
    assert.ok(fs.existsSync(path.join(ordner, '2026-07.vorher.json')));
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ordner, '2026-07.vorher.json'))).quote.prozent, 50);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(ordner, '2026-07.json'))).quote.prozent, 70);
    // .vorher.json darf NICHT als Vormonat auftauchen
    assert.strictEqual(report.ladeVormonat(slug, '2026-07'), null);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});

// --- Telefon-Retter-Umsatz-Nachweis -------------------------------------------------
test('Telefon-Zahlen: Rueckrufe raus, stornierte Bestellungen raus, ehrliche Schaetzung', () => {
  const { werteAus, monatsGrenzen } = require('./lib/telefonzahlen');
  const reservierungen = [
    { party_size: 4, guest_name: 'Meyer', notes: '[Telefon]' },
    { party_size: 2, guest_name: 'Schulz', notes: '[Telefon] Terrasse' },
    { party_size: 1, guest_name: 'Anrufer (RUECKRUF)', notes: '[RUECKRUF ERBETEN] Gruppenfeier' }
  ];
  const bestellungen = [
    { total: 33.4, status: 'received' },
    { total: 21.0, status: 'completed' },
    { total: 99.0, status: 'cancelled' }
  ];
  const z = werteAus(reservierungen, bestellungen, 25);
  assert.deepStrictEqual(
    { reservierungen: z.reservierungen, gaeste: z.gaeste, rueckrufe: z.rueckrufe, bestellungen: z.bestellungen },
    { reservierungen: 2, gaeste: 6, rueckrufe: 1, bestellungen: 2 }
  );
  assert.strictEqual(z.bestellwert, 54.4);
  assert.strictEqual(z.reservierungsUmsatz, 150);
  assert.strictEqual(z.gesamtGeschaetzt, 204.4);
  // Monatsgrenzen inkl. Jahreswechsel
  assert.deepStrictEqual(monatsGrenzen('2026-07'), { von: '2026-07-01', bis: '2026-08-01' });
  assert.deepStrictEqual(monatsGrenzen('2026-12'), { von: '2026-12-01', bis: '2027-01-01' });
});
test('Verkaufsschlager: Items aggregiert, Stornos raus, Top 3', () => {
  const { werteAus } = require('./lib/telefonzahlen');
  const bestellungen = [
    { total: 30, status: 'received', items: [{ name: 'Pizza Salami', quantity: 2 }, { name: 'Tiramisu', quantity: 1 }] },
    { total: 20, status: 'completed', items: [{ name: 'Pizza Salami', quantity: 1 }, { name: 'Lasagne', quantity: 1 }] },
    { total: 99, status: 'cancelled', items: [{ name: 'Pizza Salami', quantity: 9 }] }
  ];
  const z = werteAus([], bestellungen, 25);
  assert.deepStrictEqual(z.topGerichte, [
    { name: 'Pizza Salami', menge: 3 }, { name: 'Tiramisu', menge: 1 }, { name: 'Lasagne', menge: 1 }
  ]);
});
test('Entwicklungs-Grafik: ab 2 Monaten, mit Quote- und Umsatz-Balken', () => {
  const verlauf = [
    { monat: '2026-06', quote: { prozent: 55 }, telefon: { gesamtGeschaetzt: 500 } },
    { monat: '2026-07', quote: { prozent: 73 }, telefon: { gesamtGeschaetzt: 962.4 } }
  ];
  const html = report.verlaufSektion(verlauf);
  assert.ok(html.includes('Deine Entwicklung') && html.includes('73%') && html.includes('962 €'));
  assert.strictEqual(report.verlaufSektion([verlauf[0]]), '', 'ein Monat allein ist kein Verlauf');
  const ohneUmsatz = report.verlaufSektion(verlauf.map((v) => ({ monat: v.monat, quote: v.quote, telefon: null })));
  assert.ok(ohneUmsatz.includes('Sichtbarkeits-Quote') && !ohneUmsatz.includes('Umsatz am Telefon'));
});
test('Report zeigt Telefon-Umsatz nur, wenn es etwas zu zeigen gibt', () => {
  const mitZahlen = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis, vormonat: null, telefon: demo.telefon
  });
  assert.ok(mitZahlen.includes('Was der Telefon-Retter gebracht hat'));
  assert.ok(mitZahlen.includes('962,40'), 'geschaetzter Gesamt-Umsatz fehlt');
  const ohneAktivitaet = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis, vormonat: null,
    telefon: { reservierungen: 0, gaeste: 0, bestellungen: 0, bestellwert: 0, rueckrufe: 0 }
  });
  assert.ok(!ohneAktivitaet.includes('Was der Telefon-Retter gebracht hat'), 'leere Sektion darf nicht erscheinen');
  const ganzOhne = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis, vormonat: null
  });
  assert.ok(!ganzOhne.includes('Was der Telefon-Retter gebracht hat'));
});

// --- Wettbewerbs-Radar ---------------------------------------------------------------
test('Wettbewerber-Extraktion: nur wer VOR dem Betrieb steht, max. 3', () => {
  const { wettbewerberVorDir } = require('./lib/checks');
  const treffer = [
    { title: 'Tripadvisor Top 10', link: 'https://www.tripadvisor.de/x' },
    { title: 'Lieferando Emden', link: 'https://www.lieferando.de/y' },
    { title: 'La Piazza', link: 'https://kiekmolin.de/la-piazza-emden' },
    { title: 'Yelp', link: 'https://yelp.de/z' }
  ];
  assert.deepStrictEqual(wettbewerberVorDir(treffer, 2).map((w) => w.domain), ['tripadvisor.de', 'lieferando.de']);
  assert.deepStrictEqual(wettbewerberVorDir(treffer, 0), []); // Platz 1: niemand davor
  assert.strictEqual(wettbewerberVorDir(treffer, -1).length, 3); // nicht gefunden: Top 3 zeigen
  assert.deepStrictEqual(wettbewerberVorDir([{ title: 'kaputt', link: '::nicht-url::' }], -1), []);
});
test('Radar im Report: Platz-Trend und Ueberholt-Erkennung', () => {
  const radar = report.wettbewerbsRadar(demo.ergebnis, { ergebnis: demo.vormonatErgebnis });
  const beste = radar.find((z) => z.frage === 'beste pizzeria in Emden');
  assert.strictEqual(beste.platz, 3);
  assert.strictEqual(beste.platzTrend, 3, 'von Platz 6 auf 3 = +3');
  assert.deepStrictEqual(beste.ueberholt, ['yelp.de'], 'yelp stand vor uns, jetzt nicht mehr');
  const html = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis, vormonat: { monat: '2026-07', quote: demo.vormonatQuote, ergebnis: demo.vormonatErgebnis }
  });
  assert.ok(html.includes('Wettbewerbs-Radar (Google)'));
  assert.ok(html.includes('überholt: yelp.de'));
  assert.ok(html.includes('niemand – Platz 1!'));
});

// --- Google-Business-Posts -----------------------------------------------------------
test('GBP-Posts: 4 Stueck, echtes Gericht, Saison, Antworten ohne Gutschein-Versprechen', () => {
  const { baueGbpPosts, baueBewertungsAntworten, bauePostsMarkdown } = require('./lib/gbp-posts');
  const restaurant = { name: 'La Piazza', city: 'Emden', cuisine: 'italienisch', slug: 'la-piazza-emden', phone: '04921 123456' };
  const menue = [
    { name: 'Pizza Diavola', base_price: 11.5, is_popular: true, menu_categories: { name: 'Pizza' } },
    { name: 'Tiramisu', price: 5.9, menu_categories: { name: 'Dessert' } }
  ];
  assert.strictEqual(baueGbpPosts(restaurant, menue, { monat: 7 }).length, 4);
  assert.ok(baueGbpPosts(restaurant, menue, { monat: 7 })[0].text.includes('Pizza Diavola'), 'echtes Gericht im Post');
  assert.notStrictEqual(baueGbpPosts(restaurant, menue, { monat: 7 })[1].titel, baueGbpPosts(restaurant, menue, { monat: 1 })[1].titel, 'Sommer- und Winter-Post unterscheiden sich');
  assert.ok(!baueBewertungsAntworten(restaurant)[2].antwort.toLowerCase().includes('gutschein'), 'keine Gutschein-Versprechen bei Beschwerden');
  const md = bauePostsMarkdown(restaurant, menue, { monat: 7 });
  assert.ok(md.includes('Google-Business-Beiträge') && md.includes('kiekmolin.de/la-piazza-emden') && !md.includes('undefined'));
});

// --- Serper (Google-Ergebnisse) -----------------------------------------------------
test('serperZuTreffer: mappt organic-Ergebnisse ins Treffer-Format, leer bleibt leer', () => {
  const { serperZuTreffer } = require('./lib/checks');
  const treffer = serperZuTreffer({ organic: [
    { title: 'Greetsieler Börse', snippet: 'Fisch am Hafen', link: 'https://kiekmolin.de/greetsieler-boerse', position: 1 },
    { title: 'Restaurant Poggenstool', link: 'https://poggenstool.de' }
  ] });
  assert.strictEqual(treffer.length, 2);
  assert.deepStrictEqual(treffer[0], { title: 'Greetsieler Börse', snippet: 'Fisch am Hafen', link: 'https://kiekmolin.de/greetsieler-boerse' });
  assert.strictEqual(treffer[1].snippet, '', 'fehlendes snippet wird leerer String');
  assert.deepStrictEqual(serperZuTreffer({}), [], 'ohne organic leere Liste');
  assert.deepStrictEqual(serperZuTreffer(null), [], 'null vertraegt er auch');
});

// --- KI-Konkurrenz-Analyse ----------------------------------------------------------
test('empfohleneNamen: zieht Namen aus Listen und Fettdruck, filtert eigenen Namen und Fuellwoerter', () => {
  const { empfohleneNamen } = require('./lib/checks');
  const antwort = [
    'Hier sind gute Optionen in Greetsiel:',
    '1. **Restaurant Poggenstool** – direkt am Hafen, bekannt für Krabben',
    '2. Zur alten Fischerhütte - gemütlich, norddeutsche Küche',
    '- Greetsieler Börse: Fisch und Terrasse',
    '* **Restaurant Poggenstool** (nochmal genannt)',
    'Hinweis: Alle Angaben ohne Gewähr.'
  ].join('\n');
  const namen = empfohleneNamen(antwort, 'Greetsieler Börse');
  assert.ok(namen.includes('Restaurant Poggenstool'), 'Fettdruck-Name gefunden');
  assert.ok(namen.includes('Zur alten Fischerhütte'), 'Listen-Name gefunden');
  assert.ok(!namen.some((n) => n.toLowerCase().includes('börse')), 'eigener Name fliegt raus');
  assert.ok(!namen.some((n) => /^hinweis/i.test(n)), 'Fuellwoerter fliegen raus');
  assert.strictEqual(namen.filter((n) => n === 'Restaurant Poggenstool').length, 1, 'Doppelte werden dedupliziert');
  assert.deepStrictEqual(empfohleneNamen('', 'X'), [], 'leere Antwort = leere Liste');
});

test('kiKonkurrenz: aggregiert ueber alle Fragen und zaehlt Mehrfach-Nennungen, Sektion im Report', () => {
  const ergebnis = {
    basis: { kiekmolin: { status: 'gefunden', detail: '' }, website: { status: 'gefunden', detail: '' } },
    fragen: [
      { id: 'a', frage: 'wo essen?', google: { status: 'manuell', detail: '' }, ki: { status: 'nicht-gefunden', detail: '', empfohlen: ['Restaurant Poggenstool', 'Zur alten Fischerhütte'] } },
      { id: 'b', frage: 'bestes fischrestaurant?', google: { status: 'manuell', detail: '' }, ki: { status: 'nicht-gefunden', detail: '', empfohlen: ['restaurant poggenstool'] } }
    ]
  };
  const top = report.kiKonkurrenz(ergebnis);
  assert.strictEqual(top[0].anzahl, 2, 'Poggenstool 2x genannt (Gross/Klein egal)');
  assert.strictEqual(top.length, 2);
  const html = report.renderHtml({ restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08', ergebnis });
  assert.ok(html.includes('Wen die KI stattdessen empfiehlt'), 'Sektion im Report');
  assert.ok(html.includes('Restaurant Poggenstool'), 'Konkurrent im Report sichtbar');
  const ohne = report.renderHtml({ restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: { basis: ergebnis.basis, fragen: [{ id: 'a', frage: 'x', google: { status: 'manuell', detail: '' }, ki: { status: 'manuell', detail: '' } }] } });
  assert.ok(!ohne.includes('Wen die KI stattdessen empfiehlt'), 'ohne Daten keine leere Sektion');
});

// --- Aufbereitung -----------------------------------------------------------------
test('JSON-LD mit Menue-Sektionen und Beschreibung', () => {
  const menue = [
    { name: 'Pizza Margherita', base_price: 8.5, menu_categories: { name: 'Pizza' } },
    { name: 'Tiramisu', price: 5.9, menu_categories: { name: 'Dessert' } }
  ];
  const ld = aufbereitung.baueJsonLd(demo.restaurant, menue);
  assert.strictEqual(ld['@type'], 'Restaurant');
  assert.strictEqual(ld.hasMenu.hasMenuSection.length, 2);
  assert.ok(aufbereitung.baueBeschreibung(demo.restaurant).startsWith('La Piazza Emden ist eine Pizzeria in Emden.'));
});

console.log('\n' + tests + ' Tests bestanden.');
