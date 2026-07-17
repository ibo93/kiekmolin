#!/usr/bin/env node
'use strict';

// Tests fuer die Agentur-App-Automatik. Laufen ohne Keys/Netz:  node test.js

const assert = require('assert');
const { sollAutoLaufen, naechsterAutoLauf, werteStatistikAus, istDigestFaellig } = require('./lib/automatik');

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

test('Wochen-Digest: nur montags, nur einmal pro Tag', () => {
  const montag = new Date(2026, 6, 20, 9, 0);   // 20.07.2026 ist ein Montag
  const dienstag = new Date(2026, 6, 21, 9, 0);
  assert.strictEqual(istDigestFaellig(montag, null), true, 'erster Montag: faellig');
  assert.strictEqual(istDigestFaellig(montag, '2026-07-20'), false, 'heute schon gesendet');
  assert.strictEqual(istDigestFaellig(montag, '2026-07-13'), true, 'letzte Woche gesendet -> wieder faellig');
  assert.strictEqual(istDigestFaellig(dienstag, null), false, 'Dienstag: nie');
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
    anrufeHeute: 1, anrufeMonat: 2, ohneErgebnis: 0, abschlussQuote: 100,
    reservierungen: 1, gaeste: 4, bestellungen: 1, bestellwert: 26.9, rueckrufe: 0
  });
  // Qualitaets-Schleife: Anruf ohne jedes Ergebnis drueckt die Abschlussquote
  const mitLeer = werteStatistikAus(zeilen.concat(JSON.stringify({ zeit: '2026-07-10T12:00:00Z', reservierungen: 0, bestellungen: 0, rueckrufe: 0 })), '2026-07-16');
  assert.strictEqual(mitLeer.ohneErgebnis, 1);
  assert.strictEqual(mitLeer.abschlussQuote, 67, '2 von 3 mit Ergebnis');
  // leere Datei -> alles null, kein Fehler
  assert.strictEqual(werteStatistikAus([], '2026-07-16').anrufeMonat, 0);
  assert.strictEqual(werteStatistikAus([], '2026-07-16').abschlussQuote, null);
});

test('Kunden-Portal: Token stabil + geheim, Seite zeigt Zahlen, ohne Secret aus', () => {
  delete process.env.PORTAL_SECRET;
  const pfad = require.resolve('./lib/portal');
  delete require.cache[pfad];
  let portal = require('./lib/portal');
  assert.strictEqual(portal.istAktiv(), false, 'ohne PORTAL_SECRET aus');
  process.env.PORTAL_SECRET = 'test-geheimnis';
  assert.strictEqual(portal.istAktiv(), true);
  const t1 = portal.portalToken('la-piazza-emden');
  assert.strictEqual(t1, portal.portalToken('la-piazza-emden'), 'Token ist stabil');
  assert.notStrictEqual(t1, portal.portalToken('greetsieler-boerse'), 'je Kunde anders');
  assert.strictEqual(t1.length, 32);
  const html = portal.bauePortalHtml({
    kunde: { name: 'La Piazza' }, token: t1,
    zahlen: { gesamtGeschaetzt: 962.4, reservierungen: 9, gaeste: 31, bestellungen: 6, bestellwert: 187.4 },
    historie: [{ monat: '2026-07', label: 'Juli 2026', quote: { prozent: 73 }, html: '/x' }, { monat: '2026-06', label: 'Juni 2026', quote: { prozent: 64 }, html: null }]
  });
  assert.ok(html.includes('962,40 €') && html.includes('La Piazza') && html.includes('noindex'));
  assert.ok(html.includes('/portal/' + t1 + '/report/2026-07'), 'Report-Link laeuft durchs Portal');
  delete process.env.PORTAL_SECRET;
});

test('Pipeline-Filter: Bestandskunden fliegen raus (Umlaut-tolerant)', () => {
  const { istSchonPartner } = require('./lib/pitch');
  const kunden = ['La Piazza Emden', 'Greetsieler Börse'];
  assert.strictEqual(istSchonPartner({ name: 'La Piazza' }, kunden), true, 'Teilname matcht');
  assert.strictEqual(istSchonPartner({ name: 'Greetsieler Boerse' }, kunden), true, 'ohne Umlaute matcht');
  assert.strictEqual(istSchonPartner({ name: 'Pizzeria Castello' }, kunden), false);
  assert.strictEqual(istSchonPartner({ name: '' }, kunden), false);
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

test('Report-Mail: Betreff, Umsatz-Satz, Konfigurations-Check', () => {
  const versand = require('./lib/versand');
  const m1 = versand.baueReportMail({ kunde: { name: 'Gasthof Adler' }, monatLabel: 'Juni 2026' });
  assert.ok(m1.betreff.includes('Juni 2026') && m1.betreff.includes('Gasthof Adler'), 'Betreff enthaelt Monat und Name');
  const m2 = versand.baueReportMail({ kunde: { name: 'X' }, monatLabel: 'Juni 2026', telefon: { gesamtGeschaetzt: 1080.5, reservierungen: 12, gaeste: 34, bestellungen: 5, bestellwert: 230.5, rueckrufe: 0 } });
  assert.ok(m2.text.includes('1.080,50 €'), 'Text enthaelt geschaetzten Mehrumsatz');
  const vorher = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  assert.strictEqual(versand.istKonfiguriert(), false, 'ohne Key nicht konfiguriert');
  if (vorher) process.env.RESEND_API_KEY = vorher;
});

test('Gesundheits-Ampel: rot bei Luecke, gelb bei fehlendem Monat, gruen bei Aktivitaet', () => {
  const { bewerteKunde } = require('./lib/gesundheit');
  assert.strictEqual(bewerteKunde({ historie: [], aktuellerMonat: '2026-07' }).stufe, 'rot');
  assert.strictEqual(bewerteKunde({ historie: [{ monat: '2026-05', quote: { prozent: 80, gefunden: 8, getestet: 10 }, telefon: null }], aktuellerMonat: '2026-07' }).stufe, 'rot');
  assert.strictEqual(bewerteKunde({ historie: [{ monat: '2026-06', quote: { prozent: 80, gefunden: 8, getestet: 10 }, telefon: { reservierungen: 2, gaeste: 4, bestellungen: 1, bestellwert: 20, rueckrufe: 0, gesamtGeschaetzt: 120 } }], aktuellerMonat: '2026-07' }).stufe, 'gelb');
  assert.strictEqual(bewerteKunde({ historie: [
    { monat: '2026-07', quote: { prozent: 80, gefunden: 8, getestet: 10 }, telefon: { reservierungen: 3, gaeste: 7, bestellungen: 2, bestellwert: 54.5, rueckrufe: 1, gesamtGeschaetzt: 250 } },
    { monat: '2026-06', quote: { prozent: 78, gefunden: 7, getestet: 10 }, telefon: { reservierungen: 1, gaeste: 2, bestellungen: 0, bestellwert: 0, rueckrufe: 0, gesamtGeschaetzt: 80 } }
  ], aktuellerMonat: '2026-07' }).stufe, 'gruen');
});

console.log('\n' + tests + ' Tests bestanden.');
