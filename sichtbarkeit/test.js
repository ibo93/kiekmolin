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
