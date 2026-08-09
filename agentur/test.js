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

console.log('\n' + tests + ' Tests bestanden.');
