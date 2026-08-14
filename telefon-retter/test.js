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

  // --- No-Show-Schutz (SMS-Erinnerung) ------------------------------------------
  await test('SMS-Erinnerung: Auswahl filtert sauber, Text ist freundlich + mit Absage-Weg', () => {
    const { faelligeErinnerungen, baueErinnerungsText, istAktiv } = require('./lib/erinnerung');
    const resis = [
      { id: 'a', guest_name: 'Meyer', guest_phone: '+49 172 5550123', reservation_time: '19:00:00', party_size: 4 },
      { id: 'b', guest_name: 'Schulz', guest_phone: '', reservation_time: '18:00:00', party_size: 2 },          // keine Nummer
      { id: 'c', guest_name: 'Anrufer (RUECKRUF)', guest_phone: '+49123456', reservation_time: '00:00' },        // Rueckruf-Fallback
      { id: 'd', guest_name: 'Janssen', guest_phone: '+49 4921 99', reservation_time: '20:00:00', party_size: 2 } // Nummer zu kurz? 6+ Ziffern -> ok
    ];
    const faellig = faelligeErinnerungen(resis, ['d']);
    assert.deepStrictEqual(faellig.map((r) => r.id), ['a'], 'nur a: b ohne Nummer, c Rueckruf, d schon erinnert');
    const text = baueErinnerungsText({ name: 'La Piazza', phone: '04921 123456' }, resis[0]);
    assert.ok(text.includes('19:00') && text.includes('La Piazza') && text.includes('4'));
    assert.ok(/absagen|dazwischenkommt|ab\b/.test(text.toLowerCase()), 'Absage-Weg ist der No-Show-Schutz');
    assert.ok(text.length <= 320, 'maximal 2 SMS-Segmente');
    // Opt-in: ohne SMS_ERINNERUNG=1 ist das Feature aus
    delete process.env.SMS_ERINNERUNG;
    assert.strictEqual(istAktiv(), false);
  });

  await test('Stream-Token: frisch ok, manipuliert/abgelaufen nicht', () => {
    const t = streamTokenErzeugen();
    assert.ok(streamTokenGueltig(t));
    assert.ok(!streamTokenGueltig('kaputt'));
    assert.ok(!streamTokenGueltig(t.slice(0, -2) + 'xx'));
    assert.ok(!streamTokenGueltig(streamTokenErzeugen(Date.now() - 6 * 60 * 1000)));
  });

  await test('SatzSammler: meldet Saetze sofort, Abkuerzungen reifen weiter', () => {
    const { SatzSammler } = require('./lib/dialog');
    const raus = [];
    const s = new SatzSammler((satz) => raus.push(satz));
    s.fuettere('Gerne! ');
    assert.deepStrictEqual(raus, ['Gerne!'], 'kurzer Ausruf geht sofort raus');
    s.fuettere('Fuer wie viele Perso');
    assert.strictEqual(raus.length, 1, 'halber Satz wartet');
    s.fuettere('nen darf ich reservieren? Und auf welchen Na');
    assert.deepStrictEqual(raus[1], 'Fuer wie viele Personen darf ich reservieren?');
    s.spuelen();
    assert.strictEqual(raus[2], 'Und auf welchen Na', 'spuelen gibt den Rest frei');
    const kurz = [];
    const s2 = new SatzSammler((satz) => kurz.push(satz));
    s2.fuettere('z.B. am Fenster waere noch frei. Passt das?');
    s2.spuelen();
    assert.ok(!kurz.some((x) => x === 'z.B.'), 'Abkuerzung wird nie allein gesprochen: ' + JSON.stringify(kurz));
  });

  await test('parseSseAntwort: Text-Deltas sofort, Werkzeug-Eingaben komplett', async () => {
    const { parseSseAntwort } = require('./lib/dialog');
    const sse = [
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Einen Moment, "}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ich pruefe das."}}',
      'data: {"type":"content_block_stop","index":0}',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"pruefe_verfuegbarkeit","input":{}}}',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"datum\\":\\"2026-"}}',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"08-01\\",\\"uhrzeit\\":\\"19:00\\",\\"personen\\":4}"}}',
      'data: {"type":"content_block_stop","index":1}',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      ''
    ].join('\n');
    const strom = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); }
    });
    const deltas = [];
    const antwort = await parseSseAntwort(strom, (t) => deltas.push(t));
    assert.strictEqual(deltas.join(''), 'Einen Moment, ich pruefe das.', 'Deltas kommen sofort und vollstaendig');
    assert.strictEqual(antwort.content[0].text, 'Einen Moment, ich pruefe das.');
    assert.strictEqual(antwort.content[1].name, 'pruefe_verfuegbarkeit');
    assert.deepStrictEqual(antwort.content[1].input, { datum: '2026-08-01', uhrzeit: '19:00', personen: 4 }, 'Werkzeug-JSON aus Stuecken zusammengesetzt');
    assert.strictEqual(antwort.stop_reason, 'tool_use');
  });

  await test('inSaetze: teilt fuers fluessige Sprechen, ohne Inhalt zu verlieren', () => {
    const { inSaetze } = require('./lib/elevenlabs');
    assert.deepStrictEqual(
      inSaetze('Gerne! Fuer wie viele Personen darf ich reservieren?'),
      ['Gerne!', 'Fuer wie viele Personen darf ich reservieren?'],
      'erster kurzer Satz geht sofort auf die Leitung');
    assert.strictEqual(inSaetze('Passt das so fuer Sie?').length, 1, 'eine Frage bleibt ein Stueck');
    const original = 'Ihr Tisch ist reserviert. Morgen um 19:30 Uhr fuer 4 Personen. Bis dann!';
    const saetze = inSaetze(original);
    assert.ok(saetze.length >= 2, 'lange Antwort wird geteilt');
    assert.strictEqual(saetze.join(' ').replace(/\s+/g, ' '), original, 'kein Wort geht verloren');
    assert.ok(saetze.every((s) => s.length >= 8), 'keine Mini-Schnipsel (Abkuerzungen kleben am Vorgaenger)');
    assert.deepStrictEqual(inSaetze(''), [], 'leer bleibt leer');
  });

  await test('Twilio-Zugang: API Key ist der Ausweichweg, wenn der Auth Token fehlt', () => {
    const auth = require('./lib/twilio-auth');
    const sicherung = {
      sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN,
      key: process.env.TWILIO_API_KEY, secret: process.env.TWILIO_API_SECRET
    };
    const setze = (o) => {
      for (const [name, wert] of Object.entries(o)) {
        if (wert) process.env[name] = wert; else delete process.env[name];
      }
    };

    try {
      // Gar nichts eingerichtet
      setze({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_API_KEY: '', TWILIO_API_SECRET: '' });
      assert.strictEqual(auth.istKonfiguriert(), false);
      assert.strictEqual(auth.authKopf(), null);

      // Weg A: Auth Token - Benutzer ist die Konto-SID
      setze({ TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'geheim' });
      assert.strictEqual(auth.zugangsdaten().art, 'auth-token');
      assert.strictEqual(auth.zugangsdaten().benutzer, 'AC123');
      assert.strictEqual(auth.kannSignaturPruefen(), true, 'mit Auth Token ist Signatur-Pruefung moeglich');
      assert.strictEqual(auth.authKopf(), 'Basic ' + Buffer.from('AC123:geheim').toString('base64'));

      // Weg B: API Key gewinnt, wenn beides da ist - und geht auch allein
      setze({ TWILIO_API_KEY: 'SK9', TWILIO_API_SECRET: 'sec' });
      assert.strictEqual(auth.zugangsdaten().art, 'api-key');
      assert.strictEqual(auth.authKopf(), 'Basic ' + Buffer.from('SK9:sec').toString('base64'));
      setze({ TWILIO_AUTH_TOKEN: '' });
      assert.strictEqual(auth.istKonfiguriert(), true, 'API Key allein reicht fuer die REST-API');
      assert.strictEqual(auth.kannSignaturPruefen(), false, 'ohne Auth Token KEINE Signatur-Pruefung');

      // Halber API Key zaehlt nicht
      setze({ TWILIO_API_SECRET: '' });
      assert.strictEqual(auth.istKonfiguriert(), false, 'Key ohne Secret ist wertlos');
    } finally {
      setze({
        TWILIO_ACCOUNT_SID: sicherung.sid, TWILIO_AUTH_TOKEN: sicherung.token,
        TWILIO_API_KEY: sicherung.key, TWILIO_API_SECRET: sicherung.secret
      });
    }
  });

  await test('nummern.json: eigene Stimme und Stufe pro Wirt, Kurzform bleibt gueltig', () => {
    const fsm = require('fs');
    const pfad = require('path');
    const { ladeKunden, ladeNummernZuordnung, restaurantFuerNummer } = require('./lib/kunden');
    const ordner = fsm.mkdtempSync(pfad.join(require('os').tmpdir(), 'nummern-'));
    fsm.writeFileSync(pfad.join(ordner, 'nummern.json'), JSON.stringify({
      _kommentar: 'wird ignoriert',
      '+49 4926 111': 'restaurant-a',
      '+494931222': { restaurant: 'restaurant-b', stimme: 'VOICE_B', stufe: 3 },
      '+494931333': { restaurant: 'restaurant-c', stufe: 9 },   // ungueltige Stufe
      '+494931444': { stimme: 'ohne-restaurant' }               // ohne ID -> raus
    }));

    const k = ladeKunden(ordner);
    // Nummern normalisiert: Leerzeichen duerfen egal sein
    assert.strictEqual(k.zuordnung['+494926111'], 'restaurant-a');
    assert.strictEqual(restaurantFuerNummer(k.zuordnung, '+49 4926 111', null), 'restaurant-a');
    assert.strictEqual(Object.keys(k.zuordnung).length, 3, 'Eintrag ohne Restaurant-ID fliegt raus');

    // Kurzform: keine eigenen Einstellungen -> .env gilt
    assert.strictEqual(k.einstellungen['restaurant-a'], undefined);
    // Langform: Stimme und Stufe uebernommen
    assert.deepStrictEqual(k.einstellungen['restaurant-b'], { stimme: 'VOICE_B', stufe: 3 });
    // Unsinnige Stufe wird verworfen, nicht durchgereicht
    assert.strictEqual(k.einstellungen['restaurant-c'], undefined);

    // Alte Funktion liefert weiterhin nur die Zuordnung
    assert.deepStrictEqual(ladeNummernZuordnung(ordner), k.zuordnung);
    // Ohne Datei: leer statt Absturz
    assert.deepStrictEqual(ladeKunden(fsm.mkdtempSync(pfad.join(require('os').tmpdir(), 'leer-'))),
      { zuordnung: {}, einstellungen: {} });
  });

  await test('Faehigkeiten: nur Bestellungen ODER nur Reservierungen', () => {
    const { baueFaehigkeiten, baueTools, baueSystemPrompt } = require('./lib/dialog');
    const namen = (stufe, kann) => baueTools(stufe, kann).map((t) => t.name);

    // Ohne Angabe: wie bisher - Reservierungen ab Stufe 1, Bestellungen ab 3
    assert.deepStrictEqual(baueFaehigkeiten(1, null), { reservierung: true, bestellung: false, infos: false });
    assert.deepStrictEqual(baueFaehigkeiten(3, null), { reservierung: true, bestellung: true, infos: true });
    assert.ok(namen(1, null).includes('reserviere_tisch'));
    assert.ok(!namen(1, null).includes('speichere_bestellung'));

    // NUR Bestellungen (Lieferdienst ohne Tische)
    const nurBestellung = namen(1, ['bestellung']);
    assert.ok(nurBestellung.includes('speichere_bestellung'), 'Bestell-Werkzeug da');
    assert.ok(!nurBestellung.includes('reserviere_tisch'), 'kann keine Tische versprechen');
    assert.ok(!nurBestellung.includes('pruefe_verfuegbarkeit'));
    assert.ok(nurBestellung.includes('speisekarten_frage'), 'Bestellen braucht die Karte');
    assert.ok(nurBestellung.includes('rueckruf_wunsch'), 'Rueckruf immer moeglich');

    // NUR Reservierungen (Restaurant ohne Lieferung)
    const nurResi = namen(3, ['reservierung']);
    assert.ok(nurResi.includes('reserviere_tisch'));
    assert.ok(!nurResi.includes('speichere_bestellung'), 'trotz Stufe 3 keine Bestellungen');

    // Beides
    const beides = namen(1, ['reservierung', 'bestellung']);
    assert.ok(beides.includes('reserviere_tisch') && beides.includes('speichere_bestellung'));

    // Unsinn: wenigstens Rueckrufe, nie stumm
    assert.strictEqual(baueFaehigkeiten(1, ['quatsch']).nurRueckruf, true);
    assert.ok(namen(1, ['quatsch']).includes('rueckruf_wunsch'));

    // Der Prompt darf nichts anbieten, was die Werkzeuge nicht koennen
    const promptBestellung = baueSystemPrompt({ name: 'Test' }, 1, '+49', ['bestellung']);
    assert.ok(/Reservierungen nimmst du NICHT auf/.test(promptBestellung), 'sagt klar: keine Tische');
    assert.ok(/Bestellungen fuer Abholung/.test(promptBestellung));
    const promptResi = baueSystemPrompt({ name: 'Test' }, 3, '+49', ['reservierung']);
    assert.ok(/Bestellungen nimmst du NICHT auf/.test(promptResi));
  });

  await test('Eigene Kunden ohne Kiek mol in: Datei lesen, lokal speichern', async () => {
    const fsm = require('fs');
    const pfad = require('path');
    const { ladeExternenKunden } = require('./lib/externe-kunden');
    const { baueAblage, liesAlle } = require('./lib/lokale-ablage');

    const ordner = fsm.mkdtempSync(pfad.join(require('os').tmpdir(), 'extern-'));
    fsm.writeFileSync(pfad.join(ordner, 'bella.json'), JSON.stringify({
      name: 'Pizzeria Bella', stadt: 'Emden', telefon: '04921 1', oeffnet: '17:00',
      schliesst: '22:00', tische: 5, liefergebuehr: 2.5,
      melden: { sms: '+4915100000' },
      speisekarte: [
        { name: 'Pizza Margherita', preis: 8.5, kategorie: 'Pizza', beschreibung: 'Tomate' },
        { name: '', preis: 9 }   // ohne Name -> raus
      ]
    }));

    const e = ladeExternenKunden('bella.json', ordner);
    assert.strictEqual(e.restaurant.name, 'Pizzeria Bella');
    assert.strictEqual(e.restaurant.city, 'Emden');
    assert.strictEqual(e.restaurant.id, 'bella', 'Dateiname ist die Kennung');
    assert.strictEqual(e.menue.length, 1, 'Gericht ohne Namen fliegt raus');
    assert.strictEqual(e.menue[0].base_price, 8.5);
    assert.strictEqual(e.menue[0].menu_categories.name, 'Pizza');
    assert.strictEqual(e.kunde.melden.sms, '+4915100000');

    // Fehlender Name: laut scheitern, nicht stillschweigend falsch beraten
    fsm.writeFileSync(pfad.join(ordner, 'ohne.json'), JSON.stringify({ stadt: 'Emden' }));
    assert.throws(() => ladeExternenKunden('ohne.json', ordner), /"name" fehlt/);
    assert.throws(() => ladeExternenKunden('gibtsnicht.json', ordner), /nicht gefunden/);

    // Ablage: speichert und liest zurueck, ohne Datenbank
    const slug = 'test-' + process.pid;
    const ablage = baueAblage({ slug, name: 'Pizzeria Bella', tische: 5, melden: {} });
    assert.strictEqual(ablage.extern, true);
    assert.strictEqual(await ablage.anzahlAktiveTische(), 5);

    const r = await ablage.neueReservierung({
      guest_name: 'Familie Janssen', guest_phone: '04926 1',
      reservation_date: '2026-09-01', reservation_time: '19:00:00', party_size: 4
    });
    assert.strictEqual(r.ok, true);
    const amTag = await ablage.reservierungenAm(slug, '2026-09-01');
    assert.strictEqual(amTag.length, 1);
    assert.strictEqual(amTag[0].party_size, 4);
    assert.strictEqual((await ablage.reservierungenAm(slug, '2026-09-02')).length, 0);

    const b = await ablage.neueBestellung({ customer_name: 'Herr Bruns', total: 23.5, items: [{ name: 'Pizza', quantity: 2 }] });
    assert.strictEqual(b.ok, true);
    const alle = liesAlle(slug);
    assert.strictEqual(alle.filter((x) => x.art === 'bestellung').length, 1);
    assert.strictEqual(alle.filter((x) => x.art === 'reservierung').length, 1);

    // Ohne Meldeweg wird gespeichert, aber ehrlich protokolliert
    const meldungen = [];
    const stumm = baueAblage({ slug: slug + '-stumm', name: 'X', melden: {} }, (z) => meldungen.push(z));
    await stumm.neueReservierung({ guest_name: 'A', reservation_date: '2026-09-01', reservation_time: '19:00', party_size: 2 });
    await new Promise((r2) => setTimeout(r2, 30));
    assert.ok(meldungen.some((m) => /NICHT benachrichtigt/.test(m)), 'fehlender Meldeweg fliegt auf');

    // Aufraeumen
    for (const s of [slug, slug + '-stumm']) {
      try { fsm.unlinkSync(require('./lib/lokale-ablage').datei(s)); } catch (_e) { /* egal */ }
    }
  });

  await test('Twilio-Region: Irland-Konto spricht mit dem Irland-Server', () => {
    const auth = require('./lib/twilio-auth');
    const alt = { sid: process.env.TWILIO_ACCOUNT_SID, region: process.env.TWILIO_REGION };
    try {
      process.env.TWILIO_ACCOUNT_SID = 'AC42';
      delete process.env.TWILIO_REGION;
      assert.strictEqual(auth.basisUrl(), 'https://api.twilio.com', 'ohne Angabe: USA/global');
      assert.strictEqual(auth.kontoUrl('/Messages.json'), 'https://api.twilio.com/2010-04-01/Accounts/AC42/Messages.json');

      process.env.TWILIO_REGION = 'ie1';
      assert.strictEqual(auth.basisUrl(), 'https://api.ie1.twilio.com', 'Irland hat eigene Adresse');
      process.env.TWILIO_REGION = 'US1';
      assert.strictEqual(auth.basisUrl(), 'https://api.twilio.com', 'Gross-/Kleinschreibung egal');
      process.env.TWILIO_REGION = 'gibt-es-nicht';
      assert.strictEqual(auth.basisUrl(), 'https://api.twilio.com', 'Unbekanntes faellt auf Standard zurueck');
    } finally {
      if (alt.sid) process.env.TWILIO_ACCOUNT_SID = alt.sid; else delete process.env.TWILIO_ACCOUNT_SID;
      if (alt.region) process.env.TWILIO_REGION = alt.region; else delete process.env.TWILIO_REGION;
    }
  });

  await test('Webhook-Schutz: Signatur zuerst, sonst geheimer Schluessel', () => {
    const crypto = require('crypto');
    const { anrufZugangGueltig } = require('./lib/sicherheit');
    const url = 'https://beispiel.de/anruf';
    const body = 'From=%2B4915112345&To=%2B4915199999';
    const authToken = 'auth-token-geheim';
    const felder = [...new URLSearchParams(body).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let daten = url;
    for (const [n, w] of felder) daten += n + w;
    const echteSignatur = crypto.createHmac('sha1', authToken).update(Buffer.from(daten, 'utf8')).digest('base64');

    // Mit Auth Token entscheidet allein die Signatur
    assert.strictEqual(anrufZugangGueltig({ signaturHeader: echteSignatur, url, body, authToken }).ok, true);
    assert.strictEqual(anrufZugangGueltig({ signaturHeader: 'falsch', url, body, authToken }).ok, false);
    // Ein Schluessel darf eine falsche Signatur NICHT retten
    assert.strictEqual(anrufZugangGueltig({
      signaturHeader: 'falsch', url, body, authToken, schluessel: 'abc', erwarteterSchluessel: 'abc'
    }).ok, false, 'Auth Token hat Vorrang');

    // Ohne Auth Token zaehlt der geheime Schluessel aus der Adresse
    const ohne = (schluessel) => anrufZugangGueltig({ url, body, schluessel, erwarteterSchluessel: 'geheim123' });
    assert.strictEqual(ohne('geheim123').ok, true);
    assert.strictEqual(ohne('geheim124').ok, false);
    assert.strictEqual(ohne('').ok, false, 'leer ist nie gueltig');
    assert.strictEqual(ohne(null).ok, false);
    assert.strictEqual(ohne('geheim123').art, 'schluessel');

    // Weder noch: offen, aber ehrlich benannt (Server warnt beim Start)
    assert.deepStrictEqual(anrufZugangGueltig({ url, body }), { ok: true, art: 'ungeschuetzt' });
  });

  console.log('\n' + tests + ' Tests bestanden.');
})().catch((e) => { console.error('\nTEST FEHLGESCHLAGEN: ' + (e && e.message)); process.exit(1); });
