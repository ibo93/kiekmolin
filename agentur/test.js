#!/usr/bin/env node
'use strict';

// Tests fuer die Agentur-App-Automatik. Laufen ohne Keys/Netz:  node test.js

const assert = require('assert');
const { sollAutoLaufen, naechsterAutoLauf, werteStatistikAus } = require('./lib/automatik');

let tests = 0;
function test(name, fn) { tests++; fn(); console.log('  ok  ' + name); }

test('Monats-Automatik: startet am Stichtag, aber nur einmal pro Monat', () => {
  const t = (j, m, tag) => new Date(j, m - 1, tag, 9, 0);
  // vor dem Stichtag: nicht starten
  assert.strictEqual(sollAutoLaufen(t(2026, 7, 1), null, 2), false);
  // am Stichtag: starten
  assert.strictEqual(sollAutoLaufen(t(2026, 7, 2), null, 2), true);
  // nach dem Stichtag, noch nicht gelaufen (Server war aus): nachholen
  assert.strictEqual(sollAutoLaufen(t(2026, 7, 15), '2026-06', 2), true);
  // diesen Monat schon gelaufen: nicht nochmal
  assert.strictEqual(sollAutoLaufen(t(2026, 7, 15), '2026-07', 2), false);
  // Automatik aus (tag 0): nie
  assert.strictEqual(sollAutoLaufen(t(2026, 7, 15), null, 0), false);
});

test('Naechster Lauf: diesen Monat wenn noch faellig, sonst naechsten', () => {
  const t = (j, m, tag) => new Date(j, m - 1, tag, 9, 0);
  assert.strictEqual(naechsterAutoLauf(t(2026, 7, 1), '2026-06', 2), '2026-07-02');
  assert.strictEqual(naechsterAutoLauf(t(2026, 7, 15), '2026-07', 2), '2026-08-02');
  // Jahreswechsel
  assert.strictEqual(naechsterAutoLauf(t(2026, 12, 20), '2026-12', 1), '2027-01-01');
  assert.strictEqual(naechsterAutoLauf(t(2026, 7, 1), null, 0), null);
});

test('Anruf-Statistik: heute vs. Monat, kaputte Zeilen ueberspringen', () => {
  const zeilen = [
    JSON.stringify({ zeit: '2026-07-16T10:00:00Z', reservierungen: 1, gaeste: 4, bestellungen: 0, bestellwert: 0, rueckrufe: 0 }),
    JSON.stringify({ zeit: '2026-07-15T19:42:00Z', reservierungen: 0, gaeste: 0, bestellungen: 1, bestellwert: 26.9, rueckrufe: 0 }),
    JSON.stringify({ zeit: '2026-06-30T12:00:00Z', reservierungen: 1, gaeste: 2, bestellungen: 0, bestellwert: 0, rueckrufe: 1 }),
    'kaputte zeile {{{'
  ];
  const s = werteStatistikAus(zeilen, '2026-07-16');
  assert.deepStrictEqual(s, {
    anrufeHeute: 1, anrufeMonat: 2,
    reservierungen: 1, gaeste: 4, bestellungen: 1, bestellwert: 26.9, rueckrufe: 0
  });
  // leere Datei -> alles null, kein Fehler
  assert.strictEqual(werteStatistikAus([], '2026-07-16').anrufeMonat, 0);
});

test('Bewertungs-Tischkarte: QR, Kurzlink, druckfertig', () => {
  const { baueTischkarte, bewertungsUrl } = require('./lib/bewertungskit');
  const kunde = { name: 'La Piazza', slug: 'la-piazza-emden' };
  assert.strictEqual(bewertungsUrl(kunde), 'https://kiekmolin.de/la-piazza-emden');
  const html = baueTischkarte(kunde);
  assert.ok(html.includes('api.qrserver.com'), 'QR-Bild eingebunden');
  assert.ok(html.includes('kiekmolin.de%2Fla-piazza-emden'), 'QR zeigt auf die Profilseite');
  assert.ok(html.includes('Hat es geschmeckt?'));
  assert.ok(html.includes('@media print'), 'Druck-Styles vorhanden');
  assert.strictEqual((html.match(/class="karte"/g) || []).length, 2, 'zwei Karten pro A4-Blatt');
});

test('Pitch-Seite: Luecken datengedeckt, ohne leere Versprechen', () => {
  const { pitchLuecken, bauePitchHtml } = require('./lib/pitch');
  const ohneWebsite = pitchLuecken({ name: 'Pizzeria Castello', city: 'Norden', category: 'pizzeria', website: '' });
  assert.ok(ohneWebsite.some((l) => l.titel.includes('Keine eigene Website')));
  const mitWebsite = pitchLuecken({ name: 'X', city: 'Norden', website: 'https://x.de' });
  assert.ok(!mitWebsite.some((l) => l.titel.includes('Keine eigene Website')), 'Website vorhanden -> Luecke entfaellt');
  const html = bauePitchHtml({ name: 'Pizzeria Castello', city: 'Norden', category: 'pizzeria', website: '' }, { datum: 'Juli 2026' });
  assert.ok(html.includes('Pizzeria Castello') && html.includes('Sichtbarkeits-Schnellcheck'));
  assert.ok(html.includes('Niemand kann seriös „Platz 1 bei Google" versprechen'), 'Ehrlichkeits-Absatz drin');
  assert.ok(html.includes('noindex'), 'Pitch-Seiten sind nicht fuer Suchmaschinen');
});

console.log('\n' + tests + ' Tests bestanden.');
