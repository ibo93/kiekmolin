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

test('Rückgewinnung: findet Inaktive, zählt Gäste zusammen, rechnet ehrlich', () => {
  const r = require('./lib/rueckgewinnung');
  const heute = new Date('2026-08-05T12:00:00Z');
  const vorTagen = (n) => new Date(heute.getTime() - n * 864e5).toISOString().slice(0, 10);

  // Gleiche Nummer in verschiedenen Schreibweisen = EIN Gast
  assert.strictEqual(r.nummerSchluessel('+49 491 123'), r.nummerSchluessel('0491/123'));
  assert.strictEqual(r.nummerSchluessel(''), '');

  const gaeste = r.fasseGaesteZusammen({
    reservierungen: [
      { guest_name: 'Familie Janssen', guest_phone: '0491 111', reservation_date: vorTagen(150), party_size: 4 },
      { guest_name: 'Familie Janssen', guest_phone: '+49491111', reservation_date: vorTagen(200), party_size: 4 },
      { guest_name: 'Familie Janssen', guest_phone: '0491111', reservation_date: vorTagen(260), party_size: 4 },
      { guest_name: 'Frau Neu', guest_phone: '0491 999', reservation_date: vorTagen(10), party_size: 2 },
      { guest_name: 'Ohne Nummer', guest_phone: '', reservation_date: vorTagen(300), party_size: 2 }
    ],
    bestellungen: [
      { customer_name: 'Herr Bruns', customer_phone: '0491 222', created_at: vorTagen(120) + 'T18:00:00Z', total: 40 }
    ]
  });
  assert.strictEqual(gaeste.length, 3, 'Janssen 3x = ein Gast; ohne Nummer fliegt raus');

  const inaktive = r.findeInaktive(gaeste, { schwelleTage: 90, bonProGast: 25, heute });
  assert.strictEqual(inaktive.length, 2, 'Frau Neu (vor 10 Tagen) ist NICHT inaktiv');
  assert.strictEqual(inaktive[0].name, 'Familie Janssen', 'Stammgast steht oben');
  assert.strictEqual(inaktive[0].stammgast, true);
  assert.strictEqual(inaktive[0].besuche, 3);
  assert.strictEqual(inaktive[0].wert, 100, '4 Personen x 25 € (kein bekannter Bon)');
  const bruns = inaktive.find((g) => g.name === 'Herr Bruns');
  assert.strictEqual(bruns.wert, 40, 'echter Bestellwert schlägt die Schätzung');

  const b = r.bilanz(inaktive);
  assert.strictEqual(b.anzahl, 2);
  assert.strictEqual(b.stammgaeste, 1);
  assert.strictEqual(b.potenzial, 140);

  // Nachricht + Rechtshinweis
  const text = r.baueNachricht({ name: 'Greetsieler Börse', slug: 'greetsieler-boerse' }, { anlass: 'Grünkohlzeit!' });
  assert.ok(text.includes('[NAME]') && text.includes('Greetsieler Börse') && text.includes('kiekmolin.de/greetsieler-boerse'));
  assert.ok(/Einwilligung|zugestimmt/i.test(r.RECHTSHINWEIS), 'Rechtshinweis nennt die Einwilligung');
});

test('Neukunden-Radar: kein-Website-Lead ist heißer, Begründung datengedeckt', () => {
  const { leadScore } = require('./lib/pitch');
  const heiss = leadScore({ name: 'Pizzeria X', category: 'pizzeria', phone: '0491', street: 'Weg 1', website: '' });
  const kalt = leadScore({ name: 'Sternerestaurant', category: 'restaurant', website: 'https://x.de' });
  assert.ok(heiss.score > kalt.score, 'ohne Website + Liefer-Küche = heißer');
  assert.strictEqual(heiss.heat, 'heiss');
  assert.ok(heiss.gruende.some((g) => /Keine eigene Website/.test(g)), 'nennt die Website-Lücke');
  assert.ok(kalt.gruende.some((g) => /Hat eine Website/.test(g)), 'ehrlich auch bei vorhandener Website');
  assert.ok(['heiss', 'warm', 'kalt'].includes(kalt.heat));
});

test('Landing-Seite: Lead-Formular, ehrlich, Handy-tauglich', () => {
  const { baueLandingHtml } = require('./lib/landing');
  const html = baueLandingHtml();
  assert.ok(html.includes('Sichtbarkeits-Check') && html.includes('/api/lead'), 'Check + Formular-Ziel');
  assert.ok(html.includes('name="restaurant"') && html.includes('name="kontakt"'), 'Pflichtfelder Restaurant + Kontakt');
  assert.ok(/kein.*Platz 1|Platz 1.*Versprechen/i.test(html), 'ehrlich – kein Platz-1-Versprechen');
  assert.ok(html.includes('viewport'), 'Handy-tauglich (viewport)');
});

test('Verkaufs-Leitfaden: Ablauf, Einwände, echte Zahlen, ehrlich', () => {
  const { baueVerkaufHtml } = require('./lib/verkauf');
  const html = baueVerkaufHtml({ name: 'Greetsieler Börse', city: 'Greetsiel' },
    { quoteProzent: 13, kiKonkurrenz: [{ name: 'Restaurant Festland', anzahl: 5 }, { name: 'Café Lili', anzahl: 3 }] });
  assert.ok(html.includes('Greetsieler Börse') && html.includes('Greetsiel'), 'personalisiert');
  assert.ok(html.includes('13%'), 'echte Quote im Leitfaden');
  assert.ok(html.includes('Restaurant Festland'), 'echte KI-Konkurrenz im Leitfaden');
  assert.ok(html.includes('Anruf-Demo'), 'Demo als Wow-Moment im Ablauf');
  assert.ok(/Platz 1.*lügt|wer das verspricht, lügt/i.test(html), 'Einwand-Antwort bleibt ehrlich');
  assert.ok(html.includes('noindex'), 'nur für dich, nicht für Suchmaschinen');

  // Ohne Zahlen: kein Absturz, sinnvoller Fallback-Text
  const leer = baueVerkaufHtml({ name: 'X', city: 'Y' }, {});
  assert.ok(leer.includes('ersten Monats-Report') && !leer.includes('undefined') && !leer.includes('null%'));
});

test('Monats-Aufgaben: datengedeckt, priorisiert, mit Hebel + Aufwand', () => {
  const { baueAufgaben, aufgabenBilanz } = require('./lib/aufgaben');
  const ergebnis = {
    basis: { kiekmolin: { status: 'gefunden', jsonLd: true }, website: { status: 'manuell' } },
    fragen: [
      { id: 'a', google: { status: 'nicht-gefunden' }, ki: { status: 'nicht-gefunden' } },
      { id: 'b', google: { status: 'gefunden' }, ki: { status: 'nicht-gefunden' } }
    ]
  };
  const auf = baueAufgaben({ ergebnis });
  assert.ok(auf.length >= 4, 'mehrere Aufgaben');
  assert.ok(auf.some((a) => a.id === 'google-posts' && a.prio === 'hoch'), 'Google-Posts immer dabei (hoch)');
  assert.ok(auf.some((a) => a.id === 'bewertungen-sammeln'), 'Bewertungen sammeln dabei');
  const gbp = auf.find((a) => a.id === 'gbp-optimieren');
  assert.ok(gbp && gbp.warum.includes('1 von 2'), 'GBP-Aufgabe nennt die echte Zahl (1 von 2 nicht in Top 10)');
  const ki = auf.find((a) => a.id === 'ki-inhalte');
  assert.ok(ki && ki.warum.includes('2 von 2'), 'KI-Aufgabe nennt echte Zahl (2 von 2 nicht genannt)');
  assert.ok(auf.some((a) => a.id === 'website-anlegen'), 'fehlende Website wird zur Aufgabe');
  assert.strictEqual(auf[0].prio, 'hoch', 'hohe Prioritaet steht oben');
  assert.ok(auf.every((a) => a.hebel && a.titel && a.warum), 'jede Aufgabe hat Hebel, Titel, Begruendung');

  // Ohne Report: keine Aufgaben (statt erfundener)
  assert.deepStrictEqual(baueAufgaben({ ergebnis: null }).filter((a) => a.id === 'gbp-optimieren'), []);
  assert.strictEqual(aufgabenBilanz(auf).hoch >= 2, true);
});

test('Angebots-Seite: drei Pakete, Komplett-Rabatt, Ehrlichkeits-Absatz, .env-Preise', () => {
  const { baueAngebotHtml, preise, bauePakete } = require('./lib/angebot');
  const html = baueAngebotHtml({ name: 'Greetsieler Börse', city: 'Greetsiel' }, { datum: 'Juli 2026' });
  assert.ok(html.includes('Greetsieler Börse') && html.includes('Greetsiel'), 'personalisiert');
  assert.ok(html.includes('KI-Sichtbarkeit') && html.includes('Telefon-Retter') && html.includes('Bewertungs-Management'), 'alle drei Pakete');
  assert.ok(html.includes('Komplett-Paket') && /Sie sparen/.test(html), 'Komplett-Paket mit Ersparnis');
  assert.ok(/Platz 1.*versprechen|niemand kann seriös/i.test(html), 'Ehrlichkeits-Absatz drin');
  assert.ok(html.includes('noindex'), 'nicht fuer Suchmaschinen');
  assert.ok(html.includes('monatlich kündbar') || html.includes('Monatlich kündbar'), 'Konditionen genannt');

  // Standard-Rabatt: Einzelsumme > Komplettpreis
  const p = preise();
  assert.ok(p.sicht + p.telefon + p.bewertung > p.komplett, 'Komplett ist guenstiger als Einzeln');
  assert.strictEqual(p.ersparnis, (p.sicht + p.telefon + p.bewertung) - p.komplett);

  // Preise per .env uebersteuerbar
  process.env.PREIS_SICHTBARKEIT = '120';
  assert.strictEqual(preise().sicht, 120, '.env-Preis greift');
  delete process.env.PREIS_SICHTBARKEIT;
  assert.strictEqual(bauePakete(preise()).length, 3);
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

test('Fruehwarnung: Wochen-Faecher zaehlen rueckwaerts ab heute', () => {
  const { zaehleWochen } = require('./lib/fruehwarnung');
  const heute = new Date('2026-08-09');
  const t = (tage) => new Date(heute.getTime() - tage * 864e5).toISOString().slice(0, 10);
  const faecher = zaehleWochen([t(0), t(3), t(6), t(7), t(10), t(20), t(99)], heute, 5);
  assert.strictEqual(faecher[0], 3, 'letzte 7 Tage');
  assert.strictEqual(faecher[1], 2, 'Woche davor');
  assert.strictEqual(faecher[2], 1);
  assert.strictEqual(faecher.length, 5);
  // Vorausreservierungen (Zukunft) zaehlen in dieser Rueckschau nicht mit
  const zukunft = new Date(heute.getTime() + 5 * 864e5).toISOString().slice(0, 10);
  assert.strictEqual(zaehleWochen([zukunft], heute, 5).reduce((s, n) => s + n, 0), 0);
  // Muell darf nicht knallen
  assert.strictEqual(zaehleWochen([null, 'quatsch', ''], heute, 5)[0], 0);
});

test('Fruehwarnung: warnt erst ab echtem Einbruch - und schweigt bei duenner Datenlage', () => {
  const { bewerteReihe } = require('./lib/fruehwarnung');
  // Vorwochen ~10, diese Woche 3 -> 70 % Minus -> Alarm
  assert.strictEqual(bewerteReihe([3, 10, 10, 10, 10]).stufe, 'alarm');
  // 30 % Minus -> Warnung, aber kein Alarm
  assert.strictEqual(bewerteReihe([7, 10, 10, 10, 10]).stufe, 'warnung');
  // Normale Schwankung -> ok
  assert.strictEqual(bewerteReihe([9, 10, 10, 10, 10]).stufe, 'ok');
  // Deutlich mehr -> gute Nachricht
  assert.strictEqual(bewerteReihe([14, 10, 10, 10, 10]).stufe, 'gut');
  // EHRLICH: bei 2 Reservierungen pro Woche ist ein "Einbruch" Zufall
  assert.strictEqual(bewerteReihe([0, 2, 2, 2, 2]).stufe, 'unklar');
  assert.strictEqual(bewerteReihe([0]).stufe, 'unklar', 'ohne Vergleichswochen keine Aussage');
});

test('Fruehwarnung: pruefeKunde liefert Meldungen und konkrete Empfehlung', () => {
  const { pruefeKunde } = require('./lib/fruehwarnung');
  const heute = new Date('2026-08-09');
  const t = (tage) => new Date(heute.getTime() - tage * 864e5).toISOString().slice(0, 10);
  const viele = (von, bis) => { const a = []; for (let i = von; i <= bis; i++) a.push(t(i)); return a; };

  // Vorwochen je 7 Tage voll, diese Woche nur 1 -> Alarm
  const ergebnis = pruefeKunde({ reservierungsDaten: [t(1)].concat(viele(7, 34)), bestellDaten: [] }, { heute });
  assert.strictEqual(ergebnis.stufe, 'alarm');
  assert.ok(ergebnis.meldungen.some((m) => m.art === 'Reservierungen'), 'sagt WAS eingebrochen ist');
  assert.ok(/anrufen/i.test(ergebnis.empfehlung), 'sagt WAS zu tun ist');

  // Ohne Daten: keine Panik, sondern ehrliche Aussage
  const leer = pruefeKunde({ reservierungsDaten: [], bestellDaten: [] }, { heute });
  assert.strictEqual(leer.stufe, 'unklar');
  assert.strictEqual(leer.meldungen.length, 0, 'kein Alarm ohne Basis');
  assert.ok(/Vergleichsbasis/i.test(leer.empfehlung));

  // Gleichmaessig gut -> nichts melden
  const stabil = pruefeKunde({ reservierungsDaten: viele(0, 34), bestellDaten: [] }, { heute });
  assert.strictEqual(stabil.stufe, 'ok');
  assert.strictEqual(stabil.meldungen.length, 0);
});

test('Gaeste-Ursprung: rechnet ehrlich - ohne Quelle zaehlt NICHT als unser Verdienst', () => {
  const { nachKanaelen, bilanz, kanalFuer } = require('./lib/herkunft');
  assert.strictEqual(kanalFuer('telefon').schluessel, 'telefon');
  assert.strictEqual(kanalFuer('WEB').schluessel, 'online', 'Gross-/Kleinschreibung egal');
  assert.strictEqual(kanalFuer('walk_in').unser, false);
  assert.strictEqual(kanalFuer(null).schluessel, 'unbekannt');
  assert.strictEqual(kanalFuer('irgendwas-neues').unser, false, 'Unbekanntes nie uns anrechnen');

  const kanaele = nachKanaelen({
    reservierungen: [
      { source: 'telefon', party_size: 4 },
      { source: 'web', party_size: 2 },
      { source: 'walk_in', party_size: 6 },
      { party_size: 2 }
    ],
    bestellungen: [{ source: 'telefon', total: 30 }, { source: 'web', total: 20 }]
  }, { bonProGast: 25 });

  const telefon = kanaele.find((k) => k.schluessel === 'telefon');
  assert.strictEqual(telefon.reservierungen, 1);
  assert.strictEqual(telefon.gaeste, 4);
  assert.strictEqual(telefon.umsatz, 130, '4 Gaeste x 25 + 30 EUR Bestellwert');
  assert.strictEqual(kanaele[0].unser, true, 'unsere Kanaele stehen oben');

  const b = bilanz(kanaele);
  assert.strictEqual(b.vorgaengeGesamt, 6);
  assert.strictEqual(b.vorgaengeUnser, 4, 'walk_in und ohne Quelle zaehlen nicht');
  assert.strictEqual(b.anteilProzent, 67);
});

test('Gaeste-Ursprung: Satz fuer den Wirt bleibt bei duenner Lage ehrlich', () => {
  const { nachKanaelen, bilanz, satzFuerWirt } = require('./lib/herkunft');
  assert.ok(/noch keine Vorgänge/i.test(satzFuerWirt(bilanz([]), 'August 2026', 199)));

  const nurDirekt = bilanz(nachKanaelen({
    reservierungen: [{ source: 'walk_in', party_size: 2 }], bestellungen: []
  }, {}));
  assert.ok(/noch nichts nachweislich/i.test(satzFuerWirt(nurDirekt, 'August 2026', 199)), 'kein Schoenreden');

  const stark = bilanz(nachKanaelen({
    reservierungen: Array(20).fill({ source: 'telefon', party_size: 4 }), bestellungen: []
  }, { bonProGast: 25 }));
  const satz = satzFuerWirt(stark, 'August 2026', 199);
  assert.ok(satz.includes('100 %'), 'Anteil genannt');
  assert.ok(/Fache zurück/.test(satz), 'Verhaeltnis zum Honorar genannt');
  // Ohne Honorar-Angabe wird nichts ueber Rentabilitaet behauptet
  assert.ok(!/Fache/.test(satzFuerWirt(stark, 'August 2026', 0)));
});

test('Speisekarten-Doktor: findet versteckten Renner, Unterpreis und Ladenhueter', () => {
  const { analysiere } = require('./lib/speisekarte-doktor');
  const pizza = { menu_categories: { name: 'Pizza' } };
  const karte = [
    Object.assign({ name: 'Pizza Tonno', description: 'Thunfisch', base_price: 13 }, pizza),
    Object.assign({ name: 'Pizza Vegetaria', description: 'Gemüse', base_price: 13 }, pizza),
    Object.assign({ name: 'Pizza Quattro', description: 'Käse', base_price: 14 }, pizza),
    Object.assign({ name: 'Pizza Margherita', description: 'Tomate, Mozzarella', base_price: 8 }, pizza)
  ];
  // Margherita laeuft am besten - steht aber ganz unten und ist am billigsten
  const bestellungen = [];
  for (let i = 0; i < 30; i++) bestellungen.push({ items: [{ name: 'Pizza Margherita', quantity: 2 }] });

  const d = analysiere(karte, bestellungen);
  assert.strictEqual(d.gerichteGesamt, 4);
  assert.strictEqual(d.bestellungenAusgewertet, 30);
  assert.ok(d.genugDaten);

  const versteckt = d.befunde.find((b) => b.typ === 'versteckter-bestseller');
  assert.ok(versteckt && /Margherita/.test(versteckt.gericht), 'Renner steht zu weit unten');

  const preis = d.befunde.find((b) => b.typ === 'unterpreis');
  assert.ok(preis, 'zu billiger Bestseller erkannt');
  assert.ok(preis.potenzial > 0 && d.potenzial > 0, 'Potenzial in Euro beziffert');

  const tot = d.befunde.find((b) => b.typ === 'ladenhueter');
  assert.ok(tot && tot.gerichte.includes('Pizza Tonno'), 'nie bestellte Gerichte gelistet');
  // Wichtigstes zuerst
  assert.strictEqual(d.befunde[0].prio, 'hoch');
});

test('Speisekarten-Doktor: schweigt bei duenner Datenlage, nennt aber Struktur-Fehler', () => {
  const { analysiere } = require('./lib/speisekarte-doktor');
  const karte = [
    { name: 'Pizza Salami', base_price: 10, description: '' },
    { name: 'Pizza Funghi', base_price: 10, description: 'Champignons' }
  ];
  const d = analysiere(karte, [{ items: [{ name: 'Pizza Salami', quantity: 1 }] }]);
  assert.strictEqual(d.genugDaten, false);
  assert.ok(d.befunde.some((b) => b.typ === 'zu-wenig-daten'), 'sagt offen, dass Zahlen fehlen');
  assert.ok(!d.befunde.some((b) => b.typ === 'ladenhueter'), 'kein Ladenhueter-Vorwurf ohne Basis');
  assert.ok(d.befunde.some((b) => b.typ === 'ohne-beschreibung'), 'fehlende Beschreibung sieht man auch ohne Zahlen');

  // Leere Karte darf nicht knallen
  const leer = analysiere([], []);
  assert.strictEqual(leer.gerichteGesamt, 0);
  assert.strictEqual(leer.potenzial, 0);

  // Zu lange Karte wird gemeldet
  const lang = analysiere(Array.from({ length: 45 }, (_v, i) => ({ name: 'Gericht ' + i, base_price: 10, description: 'x' })), []);
  assert.ok(lang.befunde.some((b) => b.typ === 'zu-lang'));
});

test('Echtzeit: Verteiler schickt an alle und wirft tote Verbindungen raus', () => {
  const { Verteiler } = require('./lib/live');
  const v = new Verteiler();
  const empfangen = [];
  const ab = v.anmelden((block) => empfangen.push(block));
  v.anmelden(() => { throw new Error('Browser zugeklappt'); });
  assert.strictEqual(v.anzahl, 2);

  const uebrig = v.sende('rueckruf', { name: 'Frau Ubben' });
  assert.strictEqual(uebrig, 1, 'kaputte Verbindung fliegt raus, Server laeuft weiter');
  assert.ok(empfangen[0].startsWith('event: rueckruf\n'), 'Ereignis-Name im Block');
  assert.ok(empfangen[0].includes('"name":"Frau Ubben"'));
  assert.ok(empfangen[0].endsWith('\n\n'), 'Block sauber abgeschlossen');

  v.herzschlag();
  assert.ok(empfangen[1].startsWith(':'), 'Herzschlag ist ein Kommentar, kein Ereignis');
  ab();
  assert.strictEqual(v.anzahl, 0, 'Abmelden funktioniert');
  assert.strictEqual(v.sende('test', {}), 0, 'ohne Zuhoerer passiert nichts');
});

test('Echtzeit: beim ersten Blick gibt es keinen Alarm fuer alte Eintraege', () => {
  const { neueEintraege, zuwachs, meldungFuerZuwachs } = require('./lib/live');
  const bekannt = new Set();
  const liste = [{ id: 'a' }, { id: 'b' }];

  // Erster Lauf: alles merken, nichts melden - sonst schlaegt der Start Alarm
  assert.deepStrictEqual(neueEintraege(bekannt, liste, 'id', true), []);
  assert.strictEqual(bekannt.size, 2);
  // Danach zaehlt nur noch, was wirklich dazukommt
  assert.deepStrictEqual(neueEintraege(bekannt, liste.concat([{ id: 'c' }]), 'id', false), [{ id: 'c' }]);
  assert.deepStrictEqual(neueEintraege(bekannt, liste, 'id', false), [], 'Bekanntes meldet sich nicht nochmal');
  assert.deepStrictEqual(neueEintraege(bekannt, [{ kein: 'schluessel' }], 'id', false), [], 'ohne ID kein Ereignis');

  // Zahlen: nur Zuwachs melden, damit eine geleerte Datei keinen Alarm ausloest
  assert.deepStrictEqual(zuwachs({ reservierungen: 3 }, { reservierungen: 5 }, ['reservierungen']), { reservierungen: 2 });
  assert.strictEqual(zuwachs({ reservierungen: 5 }, { reservierungen: 2 }, ['reservierungen']), null, 'Rueckgang ist kein Ereignis');
  assert.strictEqual(zuwachs({ reservierungen: 5 }, { reservierungen: 5 }, ['reservierungen']), null);
  assert.strictEqual(zuwachs(null, { reservierungen: 2 }, ['reservierungen']).reservierungen, 2);

  assert.strictEqual(meldungFuerZuwachs({ reservierungen: 1 }), '1 neue Reservierung');
  assert.strictEqual(meldungFuerZuwachs({ reservierungen: 2, bestellungen: 1 }), '2 neue Reservierungen · 1 neue Bestellung');
  assert.strictEqual(meldungFuerZuwachs({ anrufeHeute: 1 }), '1 neuer Anruf', 'ohne Ergebnis wenigstens der Anruf');
});

test('Anruf-Protokoll: aus Log-Zeilen wird ein lesbares Gespraech', () => {
  const { parseProtokoll, kurzfassung, dauerText, nummerKuerzen } = require('./lib/anruf-protokoll');
  const log = [
    '2026-08-14T09:12:00.000Z Anruf gestartet von +4915112345678 fuer Greetsieler Boerse',
    '2026-08-14T09:12:06.000Z GAST: Guten Tag, ich haette gern einen Tisch fuer vier',
    '2026-08-14T09:12:08.000Z AGENT: Sehr gerne! Fuer welchen Tag darf ich reservieren?',
    '2026-08-14T09:12:14.000Z GAST: Samstag um sieben',
    '2026-08-14T09:12:20.000Z Werkzeug reserviere_tisch: ok',
    '2026-08-14T09:12:22.000Z AGENT: Ihr Tisch ist reserviert. Bis Samstag!',
    '2026-08-14T09:12:30.000Z Anruf beendet (Twilio stop)'
  ].join('\n');

  const p = parseProtokoll(log, 'anruf-test.log');
  assert.strictEqual(p.anrufer, '+4915112345678');
  assert.strictEqual(p.restaurant, 'Greetsieler Boerse');
  assert.strictEqual(p.dauerSekunden, 30);
  assert.strictEqual(p.saetzeGast, 2);
  assert.strictEqual(p.saetzeAgent, 2);
  assert.strictEqual(p.ergebnis, 'Reservierung', 'Ergebnis aus dem Protokoll gelesen, nicht geraten');
  assert.strictEqual(p.hatFehler, false);

  const gast = p.zeilen.filter((z) => z.wer === 'gast');
  assert.strictEqual(gast[0].text, 'Guten Tag, ich haette gern einen Tisch fuer vier', 'Rollen-Praefix entfernt');
  assert.ok(p.zeilen.some((z) => z.wer === 'system'), 'technische Zeilen bleiben erhalten');

  // Kurzfassung fuer die Liste enthaelt keinen Gespraechsverlauf
  assert.strictEqual(kurzfassung(p).zeilen, undefined);
  assert.strictEqual(kurzfassung(p).ergebnis, 'Reservierung');

  assert.strictEqual(dauerText(45), '45 Sek.');
  assert.strictEqual(dauerText(95), '1:35 Min.');
  assert.strictEqual(dauerText(null), 'unbekannt');
  assert.strictEqual(nummerKuerzen('+4915112345678'), '+491…678', 'Nummer gekuerzt (Datenschutz)');
});

test('Anruf-Protokoll: ehrlich bei Fehlern und stummen Anrufen', () => {
  const { parseProtokoll } = require('./lib/anruf-protokoll');

  const stumm = parseProtokoll([
    '2026-08-14T09:00:00.000Z Anruf gestartet von unbekannt fuer La Piazza',
    '2026-08-14T09:00:04.000Z Anruf beendet (Twilio stop)'
  ].join('\n'));
  assert.strictEqual(stumm.ergebnis, 'Niemand hat gesprochen');
  assert.strictEqual(stumm.saetzeGast, 0);

  const kaputt = parseProtokoll([
    '2026-08-14T09:00:00.000Z Anruf gestartet von +49123 fuer La Piazza',
    '2026-08-14T09:00:03.000Z GAST: Hallo',
    '2026-08-14T09:00:05.000Z TTS-Fehler: ElevenLabs 401'
  ].join('\n'));
  assert.strictEqual(kaputt.hatFehler, true);
  assert.strictEqual(kaputt.ergebnis, 'Technischer Fehler');

  // Leer und Muell duerfen nicht knallen
  assert.strictEqual(parseProtokoll('').zeilen.length, 0);
  assert.strictEqual(parseProtokoll('kein Zeitstempel hier').zeilen.length, 0);
  assert.strictEqual(parseProtokoll(null).dauerSekunden, null);
});

test('Telefon-Kunden: anlegen schreibt beide Dateien und prueft die Eingaben', () => {
  const fsm = require('fs');
  const pfad = require('path');
  const tk = require('./lib/telefon-kunden');
  const basis = fsm.mkdtempSync(pfad.join(require('os').tmpdir(), 'tk-'));

  // Nummern normalisieren: deutsche Schreibweise wird zu +49
  assert.strictEqual(tk.normalisiereNummer('04921 123456'), '+494921123456');
  assert.strictEqual(tk.normalisiereNummer('+49 4921 123456'), '+494921123456');
  assert.strictEqual(tk.normalisiereNummer('0049 4921 123'), '+494921123');
  assert.strictEqual(tk.normalisiereNummer(''), '');

  // Pflichtangaben werden im Klartext eingefordert
  assert.throws(() => tk.speichereEigenenKunden({ nummer: '+4949211' }, basis), /Name des Betriebs fehlt/);
  assert.throws(() => tk.speichereEigenenKunden({ name: 'X' }, basis), /Twilio-Nummer fehlt/);
  assert.throws(() => tk.speichereEigenenKunden({ name: 'X', nummer: '+4949211234', kann: [] }, basis),
    /Reservierungen, Bestellungen oder beides/);

  const e = tk.speichereEigenenKunden({
    nummer: '04921 123456', name: 'Pizzeria Bella Vista', stadt: 'Emden',
    oeffnet: '7:00', schliesst: 'quatsch', tische: '12', sms: '015112345678',
    kann: ['bestellung', 'unsinn'],
    speisekarte: [
      { name: 'Pizza Margherita', preis: '8,50', kategorie: 'Pizza' },
      { name: '', preis: 5 }
    ]
  }, basis);
  assert.strictEqual(e.slug, 'pizzeria-bella-vista');
  assert.strictEqual(e.nummer, '+494921123456');
  assert.strictEqual(e.gerichte, 1, 'Gericht ohne Namen faellt raus');
  assert.strictEqual(e.warnung, null, 'SMS hinterlegt -> keine Warnung');

  const kunde = JSON.parse(fsm.readFileSync(pfad.join(basis, 'kunden', 'pizzeria-bella-vista.json'), 'utf8'));
  assert.strictEqual(kunde.oeffnet, '07:00', 'Uhrzeit auf HH:MM gebracht');
  assert.strictEqual(kunde.schliesst, undefined, 'unbrauchbare Uhrzeit verworfen');
  assert.strictEqual(kunde.tische, 12);
  assert.strictEqual(kunde.melden.sms, '+4915112345678', 'Handynummer normalisiert');
  assert.strictEqual(kunde.speisekarte[0].preis, 8.5, 'Komma-Preis als Zahl');

  const nummern = JSON.parse(fsm.readFileSync(pfad.join(basis, 'nummern.json'), 'utf8'));
  assert.deepStrictEqual(nummern['+494921123456'], {
    datei: 'kunden/pizzeria-bella-vista.json', kann: ['bestellung']
  }, 'unsinnige Faehigkeit verworfen');

  // Liste zeigt den Kunden mit Gerichte-Zahl
  const liste = tk.listeKunden(basis);
  assert.strictEqual(liste.length, 1);
  assert.strictEqual(liste[0].name, 'Pizzeria Bella Vista');
  assert.strictEqual(liste[0].art, 'eigen');
  assert.strictEqual(liste[0].gerichte, 1);
  assert.strictEqual(liste[0].problem, null);

  // Ohne Meldeweg: gespeichert, aber deutlich gewarnt
  const ohne = tk.speichereEigenenKunden({
    nummer: '+494921999999', name: 'Ohne Meldung', kann: ['reservierung']
  }, basis);
  assert.ok(/erfährt der Wirt nichts von seinen Anrufen/.test(ohne.warnung), 'Warnung: ' + ohne.warnung);
  assert.ok(/Kein Meldeweg/.test(tk.listeKunden(basis).find((k) => k.nummer === '+494921999999').problem));

  // Kommentare und fremde Eintraege bleiben beim Schreiben erhalten
  tk.schreibeNummern(basis, Object.assign(tk.liesNummern(basis), {
    _hinweis: 'Notiz', '+494926111': 'kiekmolin-restaurant-id'
  }));
  tk.speichereEigenenKunden({ nummer: '+494921000000', name: 'Dritter', kann: ['reservierung'] }, basis);
  const danach = tk.liesNummern(basis);
  assert.strictEqual(danach._hinweis, 'Notiz', 'Notizen ueberleben');
  assert.strictEqual(danach['+494926111'], 'kiekmolin-restaurant-id', 'Kiek-mol-in-Kunde bleibt');

  // Kiek-mol-in-Eintraege erscheinen in der Liste, Kommentare nicht
  const alle = tk.listeKunden(basis);
  assert.ok(alle.some((k) => k.nummer === '+494926111' && k.art === 'kiekmolin'));
  assert.ok(!alle.some((k) => String(k.nummer).startsWith('_')));

  // Entfernen loescht nur die Zuordnung
  tk.entferneNummer('+494921999999', basis);
  assert.ok(!tk.liesNummern(basis)['+494921999999']);
  assert.ok(fsm.existsSync(pfad.join(basis, 'kunden', 'ohne-meldung.json')), 'Kundendatei bleibt liegen');
  assert.throws(() => tk.entferneNummer('+490000', basis), /nicht eingetragen/);
});

test('Pipeline: Stufe, Notiz und Wiedervorlage werden gemerkt', () => {
  const pl = require('./lib/pipeline');

  // Kaputte oder fehlende Datei darf die Pipeline nie umwerfen
  assert.deepStrictEqual(pl.leseStand('das ist kein JSON'), {});
  assert.deepStrictEqual(pl.leseStand(''), {});
  assert.deepStrictEqual(pl.leseStand('[1,2]'), {});

  // Derselbe Betrieb muss auch nach einem neuen Import denselben Schluessel haben
  assert.strictEqual(pl.schluesselFuer('Café Löwe', 'Norden'), pl.schluesselFuer('cafe loewe', 'norden'));
  assert.notStrictEqual(pl.schluesselFuer('Pizzeria Roma', 'Norden'), pl.schluesselFuer('Pizzeria Roma', 'Emden'));

  const jetzt = new Date(2026, 7, 14, 10, 0);
  let stand = pl.setzeStand({}, 'pizzeria-roma--norden', { stufe: 'kontaktiert', notiz: 'Chef ab 15 Uhr' }, { jetzt });
  assert.strictEqual(stand['pizzeria-roma--norden'].stufe, 'kontaktiert');
  assert.strictEqual(stand['pizzeria-roma--norden'].verlauf.length, 1, 'Stufenwechsel steht im Verlauf');

  // Nur die Notiz aendern: Stufe bleibt, Verlauf waechst nicht
  stand = pl.setzeStand(stand, 'pizzeria-roma--norden', { notiz: 'doch erst morgen' }, { jetzt });
  assert.strictEqual(stand['pizzeria-roma--norden'].stufe, 'kontaktiert');
  assert.strictEqual(stand['pizzeria-roma--norden'].verlauf.length, 1);

  // Unsinnige Eingaben werden abgewiesen bzw. verworfen
  assert.throws(() => pl.setzeStand(stand, 'x', { stufe: 'quatsch' }), /Unbekannte Stufe/);
  assert.throws(() => pl.setzeStand(stand, '', { stufe: 'neu' }), /Kein Schluessel/);
  assert.strictEqual(pl.datumOderLeer('morgen'), '');
  assert.strictEqual(pl.datumOderLeer('2026-08-20'), '2026-08-20');

  // Nach dem Speichern und Wiederlesen muss alles noch da sein
  const wieder = pl.leseStand(JSON.stringify(stand));
  assert.strictEqual(wieder['pizzeria-roma--norden'].notiz, 'doch erst morgen');
});

test('Pipeline: faellige Wiedervorlagen und eigene Anfragen stehen oben', () => {
  const pl = require('./lib/pipeline');
  const heute = new Date(2026, 7, 14);

  const prospects = [
    { name: 'Pizzeria Roma', city: 'Norden', phone: '04931 1', website: '', category: 'pizzeria', street: 'Weg 1' },
    { name: 'Gasthaus Deich', city: 'Norden', phone: '', website: 'https://deich.de', category: 'restaurant' },
    { name: 'Kalte Kneipe', city: 'Emden', phone: '', website: 'https://kneipe.de', category: 'kneipe' }
  ];
  const leads = [
    { restaurant: 'Gasthaus Deich', ort: 'Norden', kontakt: '04931 999', name: 'Herr Janssen', nachricht: 'Bitte melden', zeit: '2026-08-13T10:00:00.000Z' }
  ];
  const stand = {
    [pl.schluesselFuer('Pizzeria Roma', 'Norden')]: { stufe: 'kontaktiert', notiz: 'nochmal probieren', wiedervorlage: '2026-08-10' },
    [pl.schluesselFuer('Kalte Kneipe', 'Emden')]: { stufe: 'kein-interesse', notiz: '', wiedervorlage: '' }
  };

  const liste = pl.baueListe({ prospects, leads, kundenNamen: [], stand }, { heute });

  // Verzeichnis-Eintrag und eigene Anfrage sind EIN Betrieb, nicht zwei
  assert.strictEqual(liste.length, 3, 'Doppelter Betrieb wird zusammengefuehrt');
  const deich = liste.find((e) => e.name === 'Gasthaus Deich');
  assert.strictEqual(deich.quelle, 'anfrage', 'Die eigene Anfrage gewinnt');
  assert.strictEqual(deich.telefon, '04931 999');
  assert.strictEqual(deich.website, 'https://deich.de', 'Website aus dem Verzeichnis bleibt erhalten');

  // Reihenfolge: faellige Wiedervorlage zuerst, dann die neue Anfrage,
  // Erledigtes ganz ans Ende
  assert.strictEqual(liste[0].name, 'Pizzeria Roma');
  assert.strictEqual(liste[0].faellig, true);
  assert.strictEqual(liste[1].name, 'Gasthaus Deich');
  assert.strictEqual(liste[2].name, 'Kalte Kneipe');
  assert.strictEqual(liste[2].erledigt, true);
  assert.strictEqual(liste[2].faellig, false, 'Erledigtes wird nie faellig');

  // Bestandskunden tauchen gar nicht erst auf
  const ohnePartner = pl.baueListe({ prospects, leads, kundenNamen: ['Pizzeria Roma'], stand }, { heute });
  assert.ok(!ohnePartner.some((e) => e.name === 'Pizzeria Roma'));

  // Zaehler und Digest-Satz
  const u = pl.zaehleStufen(liste);
  assert.strictEqual(u.gesamt, 3);
  assert.strictEqual(u.faellig, 1);
  assert.strictEqual(u.zaehler['kein-interesse'], 1);
  assert.ok(/2 offene Interessenten/.test(pl.satzFuerDigest(liste)), pl.satzFuerDigest(liste));
  assert.ok(/Pipeline ist leer/.test(pl.satzFuerDigest([])));
});


test('Betriebs-Check: liest die Website und findet die echten Luecken', () => {
  const lc = require('./lib/lead-check');

  // Eine typische alte Gastro-Seite: Karte nur als PDF, keine Zeiten,
  // keine Reservierung, nicht fuers Handy, seit Jahren nicht angefasst.
  const alt = [
    '<html><head><title>Pizzeria Roma</title></head><body>',
    '<h1>Herzlich willkommen</h1>',
    '<p>Unsere Speisekarte: <a href="/karte.pdf">hier herunterladen</a></p>',
    '<p>Telefon 04931 12345</p>',
    '<p>Copyright 2019</p>',
    '</body></html>'
  ].join('\n');
  const p1 = lc.pruefeHtml(alt, { url: 'http://roma.de', jahr: 2026 });
  const ids = p1.map((x) => x.id);
  assert.ok(ids.includes('karte-pdf'), 'PDF-Karte erkannt: ' + ids.join(','));
  assert.ok(ids.includes('zeiten-fehlt'));
  assert.ok(ids.includes('reservierung-fehlt'));
  assert.ok(ids.includes('tel-nicht-klickbar'));
  assert.ok(ids.includes('kein-schema'));
  assert.ok(ids.includes('nicht-mobil'));
  assert.ok(ids.includes('veraltet'), 'alte Jahreszahl faellt auf');
  assert.ok(ids.includes('kein-https'), 'http:// wird bemaengelt');

  // Eine gut gemachte Seite darf NICHT schlechtgeredet werden - sonst
  // fliegt man im Gespraech sofort auf.
  const gut = [
    '<html><head><meta name="viewport" content="width=device-width">',
    '<script type="application/ld+json">{"@type":"Restaurant"}</script></head><body>',
    '<h2>Speisekarte</h2><p>Pizza Margherita 9,50 EUR</p>',
    '<p>Öffnungszeiten: Mo - So 11 bis 22 Uhr</p>',
    '<a href="tel:+4949311234">Anrufen</a>',
    '<a href="/reservieren">Tisch reservieren</a>',
    '<a href="https://www.instagram.com/roma">Instagram</a>',
    '<p>Jetzt bestellen</p><p>Stand 2026</p></body></html>'
  ].join('\n');
  const p2 = lc.pruefeHtml(gut, { url: 'https://roma.de', jahr: 2026 });
  const luecken2 = p2.filter((x) => x.art === 'luecke').map((x) => x.id);
  assert.deepStrictEqual(luecken2, [], 'gute Seite hat keine Luecken: ' + luecken2.join(','));
  assert.ok(p2.some((x) => x.id === 'karte-da' && x.art === 'gut'));
});

test('Betriebs-Check: Befund nennt den Satz fuers Telefonat', () => {
  const lc = require('./lib/lead-check');
  const jetzt = new Date(2026, 7, 14);

  // Ohne Website ist das der groesste Hebel - und muss der Aufhaenger sein
  const ohne = lc.baueBefund({ name: 'Imbiss Nord', city: 'Norden', website: '' }, {}, { jetzt });
  assert.strictEqual(ohne.punkte[0].id, 'keine-website');
  assert.strictEqual(ohne.ampel, 'gross', 'gar keine Website ist die groesste Luecke, auch wenn es nur eine ist');
  assert.ok(/eine eigene Website habe ich nicht gefunden/.test(ohne.aufhaenger), ohne.aufhaenger);

  // Mit Website: die PDF-Karte schlaegt die kleineren Punkte
  const mit = lc.baueBefund(
    { name: 'Pizzeria Roma', city: 'Norden', website: 'https://roma.de' },
    {
      webseite: { status: 'gelesen', punkte: lc.pruefeHtml('<html><body>Speisekarte <a href="k.pdf">PDF</a></body></html>', { url: 'https://roma.de', jahr: 2026 }) },
      google: { status: 'nicht-gefunden', vor_dir: ['Pizzeria Bella', 'Da Vinci'] },
      ki: { status: 'nicht-gefunden', empfohlen: ['Pizzeria Bella'] }
    }, { jetzt, frage: 'pizzeria norden' });
  assert.ok(/PDF/.test(mit.aufhaenger), mit.aufhaenger);
  assert.strictEqual(mit.ampel, 'gross');
  assert.ok(mit.punkte.some((x) => x.id === 'ki-weg'));
  assert.ok(mit.punkte.some((x) => x.id === 'google-weg'));

  // Fehlender Schluessel wird ehrlich als "ungeprueft" ausgewiesen,
  // nicht als Erfolg oder Misserfolg geraten
  const offen = lc.baueBefund({ name: 'X', city: 'Y', website: '' },
    { google: { status: 'manuell', detail: 'SERPER_API_KEY nicht gesetzt' } }, { jetzt });
  const g = offen.punkte.find((x) => x.id === 'google-offen');
  assert.ok(g && g.art === 'offen', 'ohne Schluessel wird nichts behauptet');

  // Die Pitch-Seite nimmt den echten Befund statt der Standardsaetze
  const { pitchLuecken } = require('./lib/pitch');
  const echte = pitchLuecken({ name: 'Pizzeria Roma', city: 'Norden', website: 'https://roma.de' }, mit);
  assert.ok(echte.some((l) => /PDF/.test(l.titel)), 'Pitch nutzt den Befund');
  const standard = pitchLuecken({ name: 'Pizzeria Roma', city: 'Norden', website: '' }, null);
  assert.ok(standard.some((l) => /Keine eigene Website/.test(l.titel)), 'ohne Befund die alte Liste');
});


test('Probeanruf: Demo-Kunde bekommt seinen Namen, seine Karte und ein Ablaufdatum', () => {
  const dk = require('./lib/demo-kunde');
  const jetzt = new Date(2026, 7, 14, 10, 0);

  const mitKarte = dk.baueDemoKunde(
    { name: 'Café Löwe', stadt: 'Norden', schluessel: 'cafe-loewe--norden' },
    [{ name: 'Apfelkuchen', preis: 3.5, kategorie: 'Kuchen' }, { name: '', preis: 2 }],
    { jetzt });
  assert.strictEqual(mitKarte.kunde.name, 'Café Löwe', 'sein Name, nicht "Beispiel-Restaurant"');
  assert.strictEqual(mitKarte.gerichte, 1, 'leere Zeilen fliegen raus');
  assert.strictEqual(mitKarte.slug, 'demo-cafe-loewe');
  assert.deepStrictEqual(mitKarte.kann, ['reservierung', 'bestellung']);
  assert.deepStrictEqual(mitKarte.kunde.melden, {}, 'eine Demo meldet nichts an den Wirt');
  assert.strictEqual(mitKarte.kunde.demoBis, new Date(jetzt.getTime() + 48 * 3600 * 1000).toISOString());

  // Ohne Speisekarte darf der Agent keine Bestellungen versprechen -
  // das fiele im Probeanruf sofort auf, und zwar vor dem Kunden.
  const ohne = dk.baueDemoKunde({ name: 'Imbiss Nord', stadt: 'Norden' }, [], { jetzt });
  assert.deepStrictEqual(ohne.kann, ['reservierung']);
  assert.ok(/Reservierungen an/.test(dk.ansageFuerIbo(ohne.kunde, '+494931123', 0)));
  assert.ok(/Ihre Karte/.test(dk.ansageFuerIbo(mitKarte.kunde, '+494931123', 1)));

  assert.throws(() => dk.baueDemoKunde({ name: '' }, [], { jetzt }), /Betriebsnamen/);

  // Ablauf: nach 48 Stunden ist Schluss, sonst nimmt eine vergessene Demo
  // naechsten Monat noch Anrufe entgegen
  assert.strictEqual(dk.istAbgelaufen(mitKarte.kunde, jetzt), false);
  assert.strictEqual(dk.istAbgelaufen(mitKarte.kunde, new Date(2026, 7, 17)), true);
  assert.strictEqual(dk.istAbgelaufen({ name: 'Echter Kunde' }, jetzt), false, 'echte Kunden laufen nie ab');

  // Nummer am Telefon vorlesbar machen
  assert.strictEqual(dk.lesbareNummer('+494931123456'), '04931123456');
});

test('Probeanruf: eine Demo darf niemals die Nummer eines echten Kunden kapern', () => {
  const dk = require('./lib/demo-kunde');
  const n = '+494931999999';

  assert.strictEqual(dk.nummerFrei(n, {}).ok, true, 'freie Nummer ist in Ordnung');
  assert.strictEqual(dk.nummerFrei(n, { [n]: { datei: 'kunden/demo-alt.json' } }).ok, true, 'alte Demo darf ersetzt werden');

  const echt = dk.nummerFrei(n, { [n]: { datei: 'kunden/bella-vista.json' } });
  assert.strictEqual(echt.ok, false, 'echter eigener Kunde ist tabu');
  assert.ok(/echter Kunde/.test(echt.text), echt.text);

  const kiekmolin = dk.nummerFrei(n, { [n]: '888dc5bc-1649-4762-a8ee-2eb1e5e1dfad' });
  assert.strictEqual(kiekmolin.ok, false, 'Kiek-mol-in-Kunde ist genauso tabu');
});

test('Probeanruf: Demo-Kunde wird als Demo gespeichert und ohne Meldeweg-Warnung', () => {
  const tk = require('./lib/telefon-kunden');
  const fsm = require('fs');
  const os = require('os');
  const pfad = require('path');
  const basis = fsm.mkdtempSync(pfad.join(os.tmpdir(), 'demo-test-'));

  const r = tk.speichereEigenenKunden({
    nummer: '+494931000111', slug: 'demo-pizzeria-roma', name: 'Pizzeria Roma',
    stadt: 'Norden', kann: ['reservierung', 'bestellung'],
    speisekarte: [{ name: 'Margherita', preis: 8.5 }],
    demo: true, demoBis: '2026-08-16T10:00:00.000Z', demoFuer: 'pizzeria-roma--norden'
  }, basis);

  assert.strictEqual(r.warnung, null, 'bei einer Demo ist "keine Meldung" gewollt');
  const gespeichert = JSON.parse(fsm.readFileSync(pfad.join(basis, 'kunden', 'demo-pizzeria-roma.json'), 'utf8'));
  assert.strictEqual(gespeichert.demo, true, 'Demo-Kennzeichen ueberlebt das Speichern');
  assert.strictEqual(gespeichert.demoBis, '2026-08-16T10:00:00.000Z');

  // Ein echter Kunde bleibt ungekennzeichnet und wird weiter gewarnt
  const echt = tk.speichereEigenenKunden({
    nummer: '+494931000222', name: 'Echt GmbH', kann: ['reservierung']
  }, basis);
  assert.ok(/erfährt der Wirt nichts/.test(echt.warnung));
  const echtDatei = JSON.parse(fsm.readFileSync(pfad.join(basis, 'kunden', 'echt-gmbh.json'), 'utf8'));
  assert.strictEqual(echtDatei.demo, undefined);
});


console.log('\n' + tests + ' Tests bestanden.');
