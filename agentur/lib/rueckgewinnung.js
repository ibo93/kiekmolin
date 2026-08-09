'use strict';

// Rueckgewinnungs-Motor: findet Gaeste, die frueher da waren und laenger
// nicht mehr - und macht daraus eine konkrete Aktion mit Euro-Wert.
//
// Warum das der staerkste Hebel ist: Einen frueheren Gast zurueckzuholen
// kostet fast nichts, ein neuer Gast kostet Werbung. Und der Wirt sieht
// den Wert sofort in Euro.
//
// DATENSCHUTZ (nicht verhandelbar):
//   - Die Gaeste-Daten gehoeren dem WIRT, nicht der Agentur. Sie werden
//     nur zur Anzeige gelesen und NIE in der Agentur gespeichert.
//   - Die Nachricht verschickt der Wirt selbst an seine eigenen Gaeste.
//     Wir liefern nur den Text - kein automatischer Massenversand.
//   - Rechtlicher Hinweis (UWG §7) wird immer mitgeliefert: Werbe-
//     nachrichten brauchen eine Einwilligung. Kein Spam.

// Telefonnummern normalisieren, damit derselbe Gast nicht mehrfach
// gezaehlt wird (0491/123, +49491123, 0491 123 -> gleicher Schluessel).
function nummerSchluessel(nummer) {
  const roh = String(nummer || '').replace(/[^0-9+]/g, '');
  if (!roh) return '';
  return roh.replace(/^\+49/, '0').replace(/^0049/, '0');
}

function tageSeit(datum, heute) {
  const d = new Date(datum);
  if (isNaN(d.getTime())) return null;
  return Math.floor((heute.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

// Aus Reservierungen + Bestellungen eine Gaeste-Liste bauen:
// pro Gast der LETZTE Besuch, die Anzahl Besuche und der bekannte Umsatz.
function fasseGaesteZusammen({ reservierungen, bestellungen }) {
  const gaeste = new Map();

  const merke = (nummer, name, datum, umsatz, personen) => {
    const schluessel = nummerSchluessel(nummer);
    if (!schluessel || !datum) return; // ohne Kontakt keine Rueckgewinnung
    const vorhanden = gaeste.get(schluessel) || {
      nummer: String(nummer).trim(), name: '', besuche: 0, letzterBesuch: null, umsatz: 0, gaesteZahl: 0
    };
    vorhanden.besuche++;
    vorhanden.umsatz += Number(umsatz) || 0;
    vorhanden.gaesteZahl = Math.max(vorhanden.gaesteZahl, Number(personen) || 0);
    if (name && !vorhanden.name) vorhanden.name = String(name).trim();
    if (!vorhanden.letzterBesuch || datum > vorhanden.letzterBesuch) vorhanden.letzterBesuch = datum;
    gaeste.set(schluessel, vorhanden);
  };

  for (const r of reservierungen || []) {
    merke(r.guest_phone, r.guest_name, r.reservation_date, 0, r.party_size);
  }
  for (const b of bestellungen || []) {
    const datum = String(b.created_at || '').slice(0, 10);
    merke(b.customer_phone, b.customer_name, datum, b.total, 0);
  }
  return [...gaeste.values()];
}

// Die eigentliche Auswertung: wer war laenger nicht da?
// optionen: { schwelleTage (Standard 90), bonProGast (Standard 25), heute }
function findeInaktive(gaeste, optionen) {
  const o = optionen || {};
  const schwelle = Number(o.schwelleTage) || 90;
  const bon = Number(o.bonProGast) || 25;
  const heute = o.heute || new Date();

  const inaktive = [];
  for (const g of gaeste || []) {
    const tage = tageSeit(g.letzterBesuch, heute);
    if (tage == null || tage < schwelle) continue;
    // Der erwartete Wert einer Rueckkehr: bekannter Durchschnitts-Bon des
    // Gastes, sonst die Schaetzung (Personenzahl x Bon pro Gast).
    const schnitt = g.besuche > 0 && g.umsatz > 0 ? g.umsatz / g.besuche : 0;
    const wert = schnitt > 0 ? schnitt : Math.max(1, g.gaesteZahl || 2) * bon;
    inaktive.push({
      name: g.name || 'Gast', nummer: g.nummer, besuche: g.besuche,
      letzterBesuch: g.letzterBesuch, tageHer: tage,
      wert: Math.round(wert * 100) / 100,
      stammgast: g.besuche >= 3
    });
  }
  // Wertvollste zuerst: Stammgaeste vor Einmal-Gaesten, dann nach Wert.
  inaktive.sort((a, b) => (b.stammgast - a.stammgast) || (b.wert - a.wert) || (a.tageHer - b.tageHer));
  return inaktive;
}

function bilanz(inaktive) {
  const liste = inaktive || [];
  const potenzial = liste.reduce((s, g) => s + (g.wert || 0), 0);
  return {
    anzahl: liste.length,
    stammgaeste: liste.filter((g) => g.stammgast).length,
    potenzial: Math.round(potenzial * 100) / 100
  };
}

// Fertige Nachricht fuer den Wirt - mit [NAME]-Platzhalter, kurz genug
// fuer WhatsApp/SMS, mit Anlass wenn vorhanden.
function baueNachricht(restaurant, optionen) {
  const o = optionen || {};
  const name = restaurant.name || 'uns';
  const anlass = o.anlass ? o.anlass + ' ' : '';
  const link = restaurant.slug ? 'kiekmolin.de/' + restaurant.slug : null;
  const zeilen = [
    'Moin [NAME]! Lange nicht gesehen – wir würden uns freuen, Sie mal wieder bei ' + name + ' begrüßen zu dürfen.'
  ];
  if (anlass) zeilen.push(anlass);
  zeilen.push(link
    ? 'Einen Tisch reservieren Sie in 30 Sekunden hier: ' + link
    : 'Melden Sie sich einfach – wir halten Ihnen einen Tisch frei.');
  zeilen.push('Bis bald! Ihr Team von ' + name);
  return zeilen.join(' ');
}

const RECHTSHINWEIS =
  'Wichtig: Werbenachrichten dürfen nur an Gäste gehen, die dem zugestimmt haben ' +
  '(z. B. bei der Reservierung). Der Wirt verschickt selbst – wir liefern nur den Text. ' +
  'Im Zweifel lieber persönlich ansprechen oder beim nächsten Besuch fragen.';

module.exports = {
  nummerSchluessel, fasseGaesteZusammen, findeInaktive, bilanz, baueNachricht, RECHTSHINWEIS
};
