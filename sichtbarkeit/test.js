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
  // Standard-Report: eigener Platz + Trend ja, fremde Domains nein
  delete process.env.REPORT_MIT_KONKURRENZ;
  const html = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis, vormonat: { monat: '2026-07', quote: demo.vormonatQuote, ergebnis: demo.vormonatErgebnis }
  });
  assert.ok(html.includes('Google-Platzierungen'), 'Platz-Tabelle bleibt im Report');
  assert.ok(html.includes('▲ +3'), 'Platz-Trend bleibt sichtbar');
  assert.ok(!html.includes('yelp.de'), 'fremde Domains standardmaessig NICHT im Kunden-Report');
  // Mit Schalter: volle Radar-Ansicht inkl. ueberholt
  process.env.REPORT_MIT_KONKURRENZ = '1';
  const voll = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis, vormonat: { monat: '2026-07', quote: demo.vormonatQuote, ergebnis: demo.vormonatErgebnis }
  });
  assert.ok(voll.includes('überholt: yelp.de') && voll.includes('niemand – Platz 1!'), 'Schalter zeigt volle Ansicht');
  delete process.env.REPORT_MIT_KONKURRENZ;
});

// --- Google-Business-Posts -----------------------------------------------------------
test('GBP-Posts: 4 Stueck, echtes Gericht, Saison, Antworten ohne Gutschein-Versprechen', () => {
  const { baueGbpPosts, baueBewertungsAntworten, bauePostsMarkdown } = require('./lib/gbp-posts');
  const restaurant = { name: 'La Piazza', city: 'Emden', cuisine: 'italienisch', slug: 'la-piazza-emden', phone: '04921 123456' };
  const menue = [
    { name: 'Pizza Diavola', base_price: 11.5, is_popular: true, menu_categories: { name: 'Pizza' } },
    { name: 'Tiramisu', price: 5.9, menu_categories: { name: 'Dessert' } }
  ];
  const juli = baueGbpPosts(restaurant, menue, { monat: 7 });
  assert.ok(juli.length >= 4, 'mindestens die vier Standard-Posts');
  assert.ok(juli.some((p) => p.text.includes('Pizza Diavola')), 'echtes Gericht im Post');
  const saisonPost = (posts) => posts.find((p) => /^(Sommer|Winter|Frühling|Herbst|Gemütlich)/.test(p.titel));
  assert.notStrictEqual(saisonPost(juli).titel, saisonPost(baueGbpPosts(restaurant, menue, { monat: 1 })).titel,
    'Sommer- und Winter-Post unterscheiden sich');
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
  const mitFloskeln = empfohleneNamen('- **Mein Tipp:** unbedingt reservieren\n- **Geheimtipp** am Hafen\n- **Restaurant Deichkrone** direkt am Deich', 'X');
  assert.deepStrictEqual(mitFloskeln, ['Restaurant Deichkrone'], 'Floskeln wie "Mein Tipp" sind keine Namen: ' + JSON.stringify(mitFloskeln));
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
  // Standard: KEINE Konkurrenten-Namen im Kunden-Report (sorgt fuer Rueckfragen)
  delete process.env.REPORT_MIT_KONKURRENZ;
  const standard = report.renderHtml({ restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08', ergebnis });
  assert.ok(!standard.includes('Wen die KI stattdessen empfiehlt'), 'Sektion standardmaessig NICHT im Kunden-Report');
  assert.ok(!standard.includes('Restaurant Poggenstool'), 'keine Konkurrenten-Namen im Kunden-Report');
  // Per Schalter wieder aktivierbar
  process.env.REPORT_MIT_KONKURRENZ = '1';
  const mit = report.renderHtml({ restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08', ergebnis });
  assert.ok(mit.includes('Wen die KI stattdessen empfiehlt') && mit.includes('Restaurant Poggenstool'), 'mit Schalter sichtbar');
  delete process.env.REPORT_MIT_KONKURRENZ;
  const ohne = report.renderHtml({ restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: { basis: ergebnis.basis, fragen: [{ id: 'a', frage: 'x', google: { status: 'manuell', detail: '' }, ki: { status: 'manuell', detail: '' } }] } });
  assert.ok(!ohne.includes('Wen die KI stattdessen empfiehlt'), 'ohne Daten keine leere Sektion');
});

// --- Anlass-Kalender ---------------------------------------------------------------
test('Anlaesse: richtiger Monat, Gericht nur wenn wirklich auf der Karte', () => {
  const { anlaesseFuerMonat, passendesGericht, besterAnlass } = require('./lib/anlaesse');

  const mai = anlaesseFuerMonat(5).map((a) => a.id);
  assert.ok(mai.includes('muttertag') && mai.includes('spargel'), 'Mai: Muttertag + Spargel');
  const dez = anlaesseFuerMonat(12).map((a) => a.id);
  assert.ok(dez.includes('weihnachten') && dez.includes('gruenkohl'), 'Dezember: Weihnachten + Gruenkohl');
  assert.strictEqual(anlaesseFuerMonat(13).length, 0, 'ungueltiger Monat = leer');
  assert.strictEqual(anlaesseFuerMonat(11)[0].typ, 'termin', 'Termine stehen vor Saisons');

  const karte = [{ name: 'Grünkohl mit Pinkel', base_price: 16.5 }, { name: 'Pizza Salami', base_price: 9 }];
  assert.ok(passendesGericht(karte, ['gruenkohl', 'grünkohl']), 'findet Gruenkohl auf der Karte');
  assert.strictEqual(passendesGericht(karte, ['spargel']), null, 'kein Spargel = null (nichts erfinden)');
  assert.strictEqual(passendesGericht([], ['gruenkohl']), null, 'leere Karte = null');

  // Saison MIT passendem Gericht schlaegt den Termin - der Post wird konkret
  const mitGericht = besterAnlass(12, karte);
  assert.strictEqual(mitGericht.anlass.id, 'gruenkohl');
  assert.strictEqual(mitGericht.gericht.name, 'Grünkohl mit Pinkel');
  // Ohne passendes Gericht: Termin als Aufhaenger, KEIN erfundenes Gericht
  const ohne = besterAnlass(12, [{ name: 'Pizza Salami', base_price: 9 }]);
  assert.strictEqual(ohne.anlass.typ, 'termin');
  assert.strictEqual(ohne.gericht, null);
});

test('Anlass-Post steht ganz oben und erfindet keine Gerichte', () => {
  const { baueGbpPosts } = require('./lib/gbp-posts');
  const restaurant = { name: 'Greetsieler Börse', city: 'Greetsiel', cuisine: 'fisch', slug: 'greetsieler-boerse' };
  const karte = [{ name: 'Grünkohl mit Pinkel', base_price: 16.5, description: 'Hausgemacht' }];

  const dez = baueGbpPosts(restaurant, karte, { monat: 12 });
  assert.strictEqual(dez.length, 5, 'Anlass-Post kommt zu den vier Standard-Posts dazu');
  assert.ok(dez[0].titel.includes('Grünkohl'), 'Anlass-Post steht ganz oben: ' + dez[0].titel);
  assert.ok(dez[0].text.includes('16,50 €'), 'echter Preis aus der Karte');
  assert.ok(/ZUERST posten/.test(dez[0].hinweis), 'Hinweis markiert ihn als zeitkritisch');

  // Karte ohne Saison-Gericht: Anlass bleibt, aber ohne Gericht-Behauptung
  const ohne = baueGbpPosts(restaurant, [{ name: 'Pizza Salami', base_price: 9 }], { monat: 12 });
  assert.ok(!/Grünkohl mit Pinkel/.test(ohne[0].text), 'kein erfundenes Gericht');
  assert.ok(ohne[0].text.length > 50, 'trotzdem ein vollwertiger Post');
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

// --- Analyse ----------------------------------------------------------------
test('Analyse: Kernaussage nennt Geld zuerst und erfindet nichts', () => {
  const { kernaussage } = require('./lib/analyse');
  const basis = { monatLabel: 'August 2026', quote: { prozent: 70, gefunden: 7, getestet: 10 } };

  // Mit Telefon-Umsatz: der zaehlt fuer den Wirt am meisten
  const mitGeld = kernaussage(Object.assign({}, basis, {
    telefon: { reservierungen: 9, bestellungen: 6, gesamtGeschaetzt: 962.4, rueckrufe: 2 }
  }));
  assert.ok(mitGeld.includes('15 Vorgänge'), 'Vorgaenge zusammengefasst');
  assert.ok(mitGeld.includes('962,40 €'), 'Umsatz in Euro');
  assert.ok(mitGeld.includes('Rückruf-Wünsche'), 'Mehrzahl richtig');
  assert.ok(!/Vorgäng /.test(mitGeld), 'kein abgeschnittenes Wort');
  assert.ok(kernaussage(Object.assign({}, basis, {
    telefon: { reservierungen: 1, bestellungen: 0, gesamtGeschaetzt: 75, rueckrufe: 1 }
  })).includes('1 Vorgang angenommen'), 'Einzahl richtig');

  // Ohne Telefon, aber mit Herkunft: dann der Anteil
  assert.ok(kernaussage(Object.assign({}, basis, {
    herkunft: { vorgaengeUnser: 38, vorgaengeGesamt: 57, anteilProzent: 67, umsatzUnser: 1769.1 }
  })).includes('67 %'));

  // Nur Sichtbarkeit: Vergleich zum Vormonat
  assert.ok(kernaussage(Object.assign({}, basis, { vormonatQuote: 55 })).includes('von 55 % auf 70 %'));
  // Gar keine Daten: klare Aussage statt Schoenrederei
  assert.ok(/zu wenige Daten/.test(kernaussage({ monatLabel: 'August 2026' })));
});

test('Analyse: Plan nach Wirkung sortiert, Risiken schlagen gute Nachrichten', () => {
  const { baueAnalyse } = require('./lib/analyse');
  const ergebnis = {
    basis: { kiekmolin: { status: 'gefunden' }, website: { status: 'manuell' } },
    fragen: [
      { id: 'a', frage: 'pizzeria Emden', google: { status: 'gefunden', platz: 3 }, ki: { status: 'nicht-gefunden' } },
      { id: 'b', frage: 'beste pizza', google: { status: 'nicht-gefunden' }, ki: { status: 'gefunden' } }
    ]
  };
  const a = baueAnalyse({
    monatLabel: 'August 2026', ergebnis,
    quote: { prozent: 50, gefunden: 2, getestet: 4 },
    vormonatQuote: 70,
    telefon: { reservierungen: 2, bestellungen: 0, gesamtGeschaetzt: 100, rueckrufe: 3 },
    doktor: {
      befunde: [{
        typ: 'unterpreis', gericht: 'Pizza Margherita', prio: 'hoch', aufwand: '5 Minuten', potenzial: 100,
        text: 'läuft stark, ist aber zu billig.', empfehlung: 'Preis anheben.'
      }]
    },
    rueckgewinnung: { anzahl: 4, potenzial: 200 },
    fruehwarnung: { stufe: 'alarm', meldungen: [{ text: 'Reservierungen 60 % unter dem Schnitt.' }] }
  });

  assert.strictEqual(a.bewertung, 'alarm', 'Alarm hat Vorrang vor guten Zahlen');
  assert.ok(a.risiken.some((r) => /60 %/.test(r.text)), 'Fruehwarnung uebernommen');
  assert.ok(a.risiken.some((r) => /70 % auf 50 %/.test(r.text)), 'Quoten-Absturz als Risiko');
  assert.strictEqual(a.topDrei.length, 3, 'genau drei Schritte - mehr merkt sich niemand');
  assert.strictEqual(a.topDrei[0].wirkung, 3, 'Wirksamstes zuerst');
  assert.strictEqual(a.euroPotenzial, 300, 'Euro-Betraege summiert (100 + 200)');
  // Euro entscheidet bei gleicher Wirkung
  const euroTitel = a.topDrei.filter((c) => c.euro).map((c) => c.euro);
  assert.deepStrictEqual(euroTitel, [...euroTitel].sort((x, y) => y - x), 'groesserer Betrag zuerst');

  // Ohne Zusatzdaten: kein Euro-Versprechen, aber ein Plan
  const schlank = baueAnalyse({ monatLabel: 'August 2026', ergebnis, quote: { prozent: 50, gefunden: 2, getestet: 4 } });
  assert.strictEqual(schlank.euroPotenzial, 0, 'keine erfundenen Betraege');
  assert.ok(schlank.chancen.length >= 2);
  assert.ok(schlank.treiber.length >= 1, 'immer eine Aussage zur Entwicklung');
});

test('Analyse im Report: Kasten steht oben und nur mit Daten', () => {
  const { baueAnalyse } = require('./lib/analyse');
  const analyse = baueAnalyse({
    monatLabel: 'August 2026',
    telefon: { reservierungen: 5, bestellungen: 2, gesamtGeschaetzt: 400, rueckrufe: 0 },
    quote: { prozent: 70, gefunden: 7, getestet: 10 },
    ergebnis: { basis: { kiekmolin: { status: 'gefunden' }, website: { status: 'gefunden' } }, fragen: [] }
  });
  const mit = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08',
    ergebnis: demo.ergebnis, analyse
  });
  assert.ok(mit.includes('Das Wichtigste in Kürze'), 'Analyse-Sektion vorhanden');
  assert.ok(mit.indexOf('Das Wichtigste in Kürze') < mit.indexOf('Wo stehst du'), 'steht VOR den Kacheln');
  assert.ok(mit.includes('400,00 €'));

  const ohne = report.renderHtml({
    restaurant: demo.restaurant, kategorie: 'Pizzeria', monat: '2026-08', ergebnis: demo.ergebnis
  });
  assert.ok(!ohne.includes('Das Wichtigste in Kürze'), 'ohne Analyse kein leerer Kasten');
});

console.log('\n' + tests + ' Tests bestanden.');
