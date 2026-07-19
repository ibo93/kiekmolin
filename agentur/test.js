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

test('WhatsApp-Kunden-Update: Quote-Trend, Telefon-Zahlen, ehrlich ohne Aktivitaet', () => {
  const { baueKundenUpdate } = require('./lib/kunden-update');
  const voll = baueKundenUpdate({
    kunde: { name: 'Greetsieler Börse' },
    monatLabel: 'Juli 2026',
    historie: [
      { monat: '2026-07', quote: { prozent: 25, gefunden: 2, getestet: 8 } },
      { monat: '2026-06', quote: { prozent: 13, gefunden: 1, getestet: 8 } }
    ],
    telefon: { reservierungen: 3, gaeste: 8, bestellungen: 2, bestellwert: 62.4, rueckrufe: 1, gesamtGeschaetzt: 262.4 },
    portalUrl: 'https://agentur.example/portal/abc'
  });
  assert.ok(voll.includes('Greetsieler Börse') && voll.includes('Juli 2026'), 'Name und Monat drin');
  assert.ok(voll.includes('25 %') && voll.includes('+12 Punkte'), 'Quote mit Trend zum Vormonat');
  assert.ok(voll.includes('3 Reservierungen (8 Gäste)') && voll.includes('262,40 €'), 'Telefon-Zahlen drin');
  assert.ok(voll.includes('geschätzt'), 'Umsatz ehrlich als geschaetzt markiert');
  assert.ok(voll.includes('https://agentur.example/portal/abc'), 'Portal-Link drin');

  const leer = baueKundenUpdate({ kunde: { name: 'X' }, monatLabel: 'Juli 2026', historie: [], telefon: {} });
  assert.ok(leer.includes('erste Messlauf'), 'ohne Historie ehrlicher Hinweis statt Fantasie-Zahlen');
  assert.ok(!leer.includes('Telefon-Assistent'), 'ohne Telefon-Aktivitaet keine Telefon-Zeile');
  assert.ok(!leer.includes('undefined') && !leer.includes('NaN'), 'keine kaputten Platzhalter');
});

test('Bewertungs-Retter: Prompt ehrlich, Parser robust, zwei Antwort-Toene', () => {
  const { bauePruefPrompt, parsePruefung, VERSTOSS_LABELS } = require('./lib/bewertungs-retter');
  const prompt = bauePruefPrompt({ name: 'Greetsieler Börse', city: 'Greetsiel' }, 'Essen kalt, nie wieder!');
  assert.ok(prompt.includes('Greetsieler Börse') && prompt.includes('Essen kalt'), 'Restaurant und Bewertung im Prompt');
  assert.ok(prompt.includes('KEIN Verstoss') || prompt.includes('Keine falschen Hoffnungen'), 'Ehrlichkeits-Regel im Prompt');
  assert.ok(prompt.includes('kernproblem') && prompt.includes('dringlichkeit'), 'Kern + Dringlichkeit werden abgefragt');

  const ok = parsePruefung('Hier: {"verstoss":"interessenkonflikt","chance":"hoch","dringlichkeit":"hoch","kernproblem":"kein echter Besuch","begruendung":"Nie Gast gewesen.","meldung":"Der Verfasser...","antwort_freundlich":"Vielen Dank...","antwort_sachlich":"Danke."}');
  assert.strictEqual(ok.verstoss, 'interessenkonflikt');
  assert.strictEqual(ok.dringlichkeit, 'hoch');
  assert.strictEqual(ok.kernproblem, 'kein echter Besuch');
  assert.ok(ok.antwort_freundlich && ok.antwort_sachlich, 'beide Antwort-Toene');
  assert.ok(VERSTOSS_LABELS[ok.verstoss].includes('meldenswert'));

  // Alt-Feld "antwort" wird auf antwort_freundlich gemappt (Rueckwaerts-kompat.)
  const alt = parsePruefung('{"verstoss":"kein_verstoss","antwort":"Danke fuer Ihr Feedback."}');
  assert.strictEqual(alt.antwort_freundlich, 'Danke fuer Ihr Feedback.');

  const kaputt = parsePruefung('kein json hier');
  assert.strictEqual(kaputt.verstoss, 'kein_verstoss', 'kaputtes JSON faellt sicher zurueck');
  assert.strictEqual(kaputt.chance, 'gering');
  assert.strictEqual(kaputt.dringlichkeit, 'mittel');

  const erfunden = parsePruefung('{"verstoss":"alles_loeschen","chance":"mega","dringlichkeit":"extrem"}');
  assert.strictEqual(erfunden.verstoss, 'kein_verstoss', 'erfundene Kategorien werden nicht durchgereicht');
  assert.strictEqual(erfunden.dringlichkeit, 'mittel', 'erfundene Dringlichkeit faellt zurueck');
});

test('Bewertungs-Retter: Beschwerde-Brief + Bewertungs-Anfrage', () => {
  const { baueBeschwerde, baueBewertungsAnfrage } = require('./lib/bewertungs-retter');
  const brief = baueBeschwerde({ name: 'Greetsieler Börse', city: 'Greetsiel' }, 'Die haben mich vergiftet!', { kernproblem: 'Lebensmittel' });
  assert.ok(brief.includes('Greetsieler Börse') && /unwahre.*Tatsach|Tatsachenbehauptung/i.test(brief), 'formeller Beschwerde-Brief');
  assert.ok(brief.includes('Meinungsfreiheit'), 'Rechts-Argument drin');

  const mitLink = baueBewertungsAnfrage({ name: 'La Piazza', google_place_id: 'ChIJ123' });
  assert.ok(mitLink.link.includes('ChIJ123') && mitLink.text.includes('La Piazza'), 'direkter Bewertungs-Link bei place_id');
  const ohneLink = baueBewertungsAnfrage({ name: 'La Piazza' });
  assert.strictEqual(ohneLink.link, null);
  assert.ok(ohneLink.hinweis.includes('place_id'), 'Hinweis auf place_id wenn Link fehlt');
});

test('Bewertungs-Journal: Erfolgs-Bilanz zaehlt Status korrekt', () => {
  const { journalBilanz, JOURNAL_STATUS } = require('./lib/bewertungs-retter');
  const b = journalBilanz([
    { status: 'geloescht' }, { status: 'geloescht' }, { status: 'gemeldet' },
    { status: 'abgelehnt' }, { status: 'beantwortet' }, { status: 'offen' }
  ]);
  assert.strictEqual(b.gesamt, 6);
  assert.strictEqual(b.geloescht, 2);
  assert.strictEqual(b.gemeldet, 1);
  assert.deepStrictEqual(journalBilanz([]), { gesamt: 0, gemeldet: 0, geloescht: 0, abgelehnt: 0, beantwortet: 0, offen: 0 });
  assert.ok(JOURNAL_STATUS.includes('geloescht') && JOURNAL_STATUS.includes('gemeldet'));
});

console.log('\n' + tests + ' Tests bestanden.');
