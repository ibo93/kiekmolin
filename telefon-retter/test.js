#!/usr/bin/env node
'use strict';

// Tests fuer die deterministische Kernlogik des Telefon-Retters.
// Laufen ohne Keys/Netz:  node test.js
// Werden bei jedem Push automatisch ausgefuehrt (GitHub Actions).

const assert = require('assert');
const crypto = require('crypto');
const { slotsFuer, pruefeSlot, normalisiereUhrzeit, lokalesDatum } = require('./lib/verfuegbarkeit');
const { DialogSitzung } = require('./lib/dialog');
const { twilioSignaturGueltig, streamTokenErzeugen, streamTokenGueltig } = require('./lib/sicherheit');
const demo = require('./demo/demo-daten.json');

const morgenDatum = lokalesDatum(new Date(Date.now() + 86400000));
let tests = 0;
function test(name, fn) { tests++; return Promise.resolve().then(fn).then(() => console.log('  ok  ' + name)); }

(async () => {
  // --- Verfuegbarkeit (1:1 aus der App portiert) --------------------------------
  await test('Slots respektieren Oeffnung, Pause und Ende', () => {
    const slots = slotsFuer(demo.restaurant);
    assert.strictEqual(slots[0], '11:30');
    assert.strictEqual(slots[slots.length - 1], '21:30');
    assert.ok(!slots.includes('15:00') && !slots.includes('16:30'), 'Pause fehlt');
  });
  await test('freier Slot / voll belegt / Alternativen', () => {
    assert.ok(pruefeSlot(demo.restaurant, [], 8, morgenDatum, '19:00').frei);
    const acht = Array.from({ length: 8 }, () => ({ reservation_time: '19:00', status: 'confirmed', table_id: null }));
    const e = pruefeSlot(demo.restaurant, acht, 8, morgenDatum, '19:00');
    assert.ok(!e.frei && e.alternativen.length > 0 && !e.alternativen.includes('19:00'));
  });
  await test('Tages- und Slot-Sperren', () => {
    assert.ok(!pruefeSlot(demo.restaurant, [{ reservation_time: '00:00', status: 'blocked', table_id: null }], 8, morgenDatum, '19:00').frei);
    assert.ok(!pruefeSlot(demo.restaurant, [{ reservation_time: '19:00', status: 'blocked', table_id: null }], 8, morgenDatum, '19:00').frei);
    assert.ok(pruefeSlot(demo.restaurant, [{ reservation_time: '19:00', status: 'blocked', table_id: null }], 8, morgenDatum, '19:30').frei);
  });
  await test('Uhrzeit-Normalisierung', () => {
    assert.strictEqual(normalisiereUhrzeit('9:00'), '09:00');
    assert.strictEqual(normalisiereUhrzeit('19.30'), '19:30');
    assert.strictEqual(normalisiereUhrzeit('19'), '19:00');
    assert.strictEqual(normalisiereUhrzeit('19:00:00'), '19:00');
  });
  await test('lokales Datum ist lokal, nicht UTC', () => {
    assert.strictEqual(lokalesDatum(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  });

  // --- Dialog-Werkzeuge -----------------------------------------------------------
  const neuerDialog = (quelle) => new DialogSitzung({
    restaurant: demo.restaurant, menue: demo.speisekarte, stufe: 3, anrufer: '+49123', datenquelle: quelle || {}
  });
  await test('Bestellung: Summe inkl. Liefergebuehr', () => {
    const e = neuerDialog().toolPruefeBestellung({ typ: 'lieferung', artikel: [
      { name: 'pizza salami', menge: 2, extras: 'ohne Zwiebeln' }, { name: 'aglio e olio', menge: 1 }
    ]});
    assert.ok(e.ok && e.zum_vorlesen.gesamtsumme === '33,40 Euro', JSON.stringify(e));
  });
  await test('Bestellung: unbekannt -> ablehnen, mehrdeutig -> nachfragen', () => {
    const d = neuerDialog();
    assert.ok(!d.toolPruefeBestellung({ typ: 'abholung', artikel: [{ name: 'Pizza Hawaii', menge: 1 }] }).ok);
    const m = d.toolPruefeBestellung({ typ: 'abholung', artikel: [{ name: 'Pizza', menge: 1 }] });
    assert.ok(!m.ok && m.probleme[0].kandidaten.length > 1);
  });
  await test('Bestaetigungs- und Adresspflicht', async () => {
    const d = neuerDialog();
    const ohneBestaetigung = await d.toolSpeichereBestellung({ typ: 'abholung', artikel: [{ name: 'Pizza Salami', menge: 1 }], kunde_name: 'T', telefon: '1', vorgelesen_und_bestaetigt: false });
    assert.ok(!ohneBestaetigung.gespeichert && /vorlesen/.test(ohneBestaetigung.fehler));
    const ohneAdresse = await d.toolSpeichereBestellung({ typ: 'lieferung', artikel: [{ name: 'Pizza Salami', menge: 1 }], kunde_name: 'T', telefon: '1', vorgelesen_und_bestaetigt: true });
    assert.ok(!ohneAdresse.gespeichert && /Adresse/.test(ohneAdresse.fehler));
  });
  await test('Buchungslimit pro Anruf + KI-Offenlegung', async () => {
    const resis = [];
    const quelle = {
      async reservierungenAm() { return resis; },
      async anzahlAktiveTische() { return 8; },
      async neueReservierung(p) { resis.push(p); return { ok: true, daten: { id: 'x' } }; }
    };
    const d = neuerDialog(quelle);
    d.maxBuchungen = 2;
    assert.ok((await d.toolReserviereTisch({ gast_name: 'A', telefon: '1', datum: morgenDatum, uhrzeit: '19:00', personen: 2 })).gespeichert);
    assert.ok((await d.toolReserviereTisch({ gast_name: 'B', telefon: '1', datum: morgenDatum, uhrzeit: '19:30', personen: 2 })).gespeichert);
    const r3 = await d.toolReserviereTisch({ gast_name: 'C', telefon: '1', datum: morgenDatum, uhrzeit: '20:00', personen: 2 });
    assert.ok(!r3.gespeichert && /Limit/.test(r3.fehler));
    assert.ok(d.begruessung().includes('KI-Assistent'));
    assert.ok(resis.every((r) => r.source === 'telefon'));
  });
  await test('Zusatzverkauf: EIN passender Vorschlag, nur einmal pro Anruf', () => {
    const d = neuerDialog();
    const e1 = d.toolPruefeBestellung({ typ: 'abholung', artikel: [{ name: 'Pizza Salami', menge: 1 }] });
    assert.ok(e1.ok && e1.zusatz_vorschlag, 'erster Check schlaegt Zusatz vor');
    assert.ok(e1.zusatz_vorschlag.artikel.includes('Tiramisu'), 'Dessert-Kategorie bevorzugt: ' + e1.zusatz_vorschlag.artikel);
    const e2 = d.toolPruefeBestellung({ typ: 'abholung', artikel: [{ name: 'Pizza Salami', menge: 1 }] });
    assert.ok(e2.ok && !e2.zusatz_vorschlag, 'zweiter Check schlaegt NICHT nochmal vor');
    // Bestellt der Gast das Dessert schon selbst, wird nichts Doppeltes vorgeschlagen
    const d2 = neuerDialog();
    const e3 = d2.toolPruefeBestellung({ typ: 'abholung', artikel: [{ name: 'Tiramisu', menge: 2 }] });
    assert.ok(e3.ok && (!e3.zusatz_vorschlag || !e3.zusatz_vorschlag.artikel.includes('Tiramisu')));
  });
  await test('Anruf-Statistik zaehlt Reservierungen, Gaeste und Bestellwert', async () => {
    const quelle = {
      async reservierungenAm() { return []; },
      async anzahlAktiveTische() { return 8; },
      async neueReservierung() { return { ok: true, daten: { id: 'r1' } }; },
      async neueBestellung() { return { ok: true, daten: { id: 'b1' } }; },
      async neuerBestellArtikel() { return { ok: true }; },
      async resilienterInsert() { return { ok: true }; }
    };
    const d = neuerDialog(quelle);
    await d.toolReserviereTisch({ gast_name: 'A', telefon: '1', datum: morgenDatum, uhrzeit: '19:00', personen: 4 });
    await d.toolSpeichereBestellung({ typ: 'abholung', artikel: [{ name: 'Pizza Salami', menge: 2 }], kunde_name: 'B', telefon: '1', vorgelesen_und_bestaetigt: true });
    await d.toolRueckruf({ telefon: '1', anliegen: 'Gruppenfeier' });
    assert.deepStrictEqual(d.statistik, { reservierungen: 1, gaeste: 4, bestellungen: 1, bestellwert: 21, rueckrufe: 1 });
  });
  await test('Doppel-Booking-Schutz direkt vor dem Schreiben', async () => {
    const voll = Array.from({ length: 8 }, () => ({ reservation_date: morgenDatum, reservation_time: '19:00', status: 'confirmed', table_id: null }));
    const quelle = {
      async reservierungenAm() { return voll; },
      async anzahlAktiveTische() { return 8; },
      async neueReservierung() { throw new Error('DARF NICHT AUFGERUFEN WERDEN'); }
    };
    const r = await neuerDialog(quelle).toolReserviereTisch({ gast_name: 'T', telefon: '1', datum: morgenDatum, uhrzeit: '19:00', personen: 2 });
    assert.ok(!r.gespeichert && r.alternative_uhrzeiten.length > 0);
  });

  // --- Sicherheit -------------------------------------------------------------------
  await test('Twilio-Signatur: gueltig/gefaelscht/fehlend/Pruefung-aus', () => {
    const authToken = '12345';
    const url = 'https://mycompany.com/anruf';
    const body = new URLSearchParams({ CallSid: 'CA1', From: '+491', To: '+492' }).toString();
    const daten = url + 'CallSid' + 'CA1' + 'From' + '+491' + 'To' + '+492';
    const sig = crypto.createHmac('sha1', authToken).update(Buffer.from(daten, 'utf8')).digest('base64');
    assert.ok(twilioSignaturGueltig({ signaturHeader: sig, url, body, authToken }));
    assert.ok(!twilioSignaturGueltig({ signaturHeader: 'falsch', url, body, authToken }));
    assert.ok(!twilioSignaturGueltig({ signaturHeader: null, url, body, authToken }));
    assert.ok(twilioSignaturGueltig({ signaturHeader: null, url, body, authToken: '' }));
  });
  // --- Mandantenfaehigkeit --------------------------------------------------------
  await test('Nummern-Zuordnung: Treffer, Normalisierung, Fallback', () => {
    const { restaurantFuerNummer, normalisiereNummer } = require('./lib/kunden');
    const zuordnung = { '+4949261234567': 'boerse-id', '+4949317654321': 'piazza-id' };
    assert.strictEqual(restaurantFuerNummer(zuordnung, '+4949261234567', 'std'), 'boerse-id');
    assert.strictEqual(restaurantFuerNummer(zuordnung, '+49 4926 123 45 67', 'std'), 'boerse-id'); // Leerzeichen egal
    assert.strictEqual(restaurantFuerNummer(zuordnung, '+491111111', 'std'), 'std'); // unbekannt -> Standard
    assert.strictEqual(restaurantFuerNummer({}, '', null), null);
    assert.strictEqual(normalisiereNummer('+49 (4926) 12-34'), '+4949261234');
  });
  await test('AnrufSitzung loest Restaurant pro Anruf auf (holeKontext)', () => {
    const { AnrufSitzung } = require('./lib/anruf');
    const EventEmitter = require('events');
    class FakeWs extends EventEmitter { send() {} close() { this.zu = true; } }
    const kontexte = new Map([['id-1', { restaurant: { name: 'Boerse' }, menue: [] }]]);
    // bekanntes Restaurant -> Kontext gesetzt
    const ws1 = new FakeWs();
    const s1 = new AnrufSitzung({ twilioWs: ws1, stufe: 1, datenquelle: {}, holeKontext: (id) => kontexte.get(id) || null });
    try { ws1.emit('message', JSON.stringify({ event: 'start', start: { streamSid: 'MZ1', customParameters: { restaurant: 'id-1', anrufer: '+49' } } })); } catch (_e) { /* Deepgram-Key fehlt - ok */ }
    assert.strictEqual(s1.restaurant.name, 'Boerse');
    // unbekanntes Restaurant -> Verbindung wird getrennt
    const ws2 = new FakeWs();
    new AnrufSitzung({ twilioWs: ws2, stufe: 1, datenquelle: {}, holeKontext: () => null });
    ws2.emit('message', JSON.stringify({ event: 'start', start: { streamSid: 'MZ2', customParameters: { restaurant: 'gibt-es-nicht' } } }));
    assert.ok(ws2.zu);
  });

  await test('Stream-Token: frisch ok, manipuliert/abgelaufen nicht', () => {
    const t = streamTokenErzeugen();
    assert.ok(streamTokenGueltig(t));
    assert.ok(!streamTokenGueltig('kaputt'));
    assert.ok(!streamTokenGueltig(t.slice(0, -2) + 'xx'));
    assert.ok(!streamTokenGueltig(streamTokenErzeugen(Date.now() - 6 * 60 * 1000)));
  });

  console.log('\n' + tests + ' Tests bestanden.');
})().catch((e) => { console.error('\nTEST FEHLGESCHLAGEN: ' + (e && e.message)); process.exit(1); });
