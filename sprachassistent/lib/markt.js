'use strict';

// DER MARKT — welche Betriebe lohnen sich, und wen ruft man als Naechstes an?
//
// Grundlage sind KEINE Meinungen, sondern prospects.json: die Betriebe, die
// der OSM-Importer fuer ganz Ostfriesland und Friesland eingesammelt hat -
// mit Kategorie, Ort, Telefon und Website.
//
// Zwei Fragen beantwortet das hier:
//   1. Welche Gastro-Art passt zu welchem Produkt? (Bewertung unten,
//      offengelegt - man kann sie diskutieren, statt ihr zu glauben.)
//   2. Wen soll ich als Naechstes anrufen? (Konkrete Namen mit Nummer.)

const fs = require('fs');
const path = require('path');

const PROSPECTS = path.join(__dirname, '..', '..', 'prospects.json');

// --------------------------------------------------------- Die Bewertung ---
//
// 0 bis 3 Punkte je Produkt. Die Begruendung steht dabei, weil eine Zahl
// ohne Begruendung nur so tut, als waere sie objektiv.
//
//   kiekmolin      Tischgeschaeft: lohnt sich Reservierung/Dashboard?
//   telefon        Wie viel Umsatz laeuft ueber das Telefon - und wie oft
//                  kann keiner rangehen?
const SEGMENTE = {
  restaurant: {
    name: 'Restaurants',
    kiekmolin: 3, telefon: 3,
    warum: 'Tischgeschaeft und Telefon-Reservierung, abends niemand am Apparat'
  },
  fischrestaurant: {
    name: 'Fischrestaurants',
    kiekmolin: 3, telefon: 3,
    warum: 'wie Restaurant, dazu Saison und Touristen, die vorher anrufen'
  },
  'griechisches-restaurant': {
    name: 'Griechische Restaurants',
    kiekmolin: 3, telefon: 3,
    warum: 'Tischgeschaeft mit vielen Gruppenbuchungen'
  },
  pizzeria: {
    name: 'Pizzerien',
    kiekmolin: 2, telefon: 3,
    warum: 'Telefonbestellung IST das Geschaeft - jeder verpasste Anruf ist Umsatz weg'
  },
  doener: {
    name: 'Doener und Imbiss',
    kiekmolin: 1, telefon: 2,
    warum: 'Laufkundschaft, kaum Reservierung - aber Vorbestellungen per Telefon'
  },
  cafe: {
    name: 'Cafes',
    kiekmolin: 2, telefon: 2,
    warum: 'Reservierung selten, aber Torten- und Gruppenbestellungen laufen per Telefon'
  }
};

const UNBEKANNT = { name: 'Ohne Kategorie', kiekmolin: 1, telefon: 2, warum: 'Art unklar - vor dem Anruf kurz nachsehen' };

function segmentVon(kategorie) {
  return SEGMENTE[String(kategorie || '').toLowerCase()] || UNBEKANNT;
}

// ------------------------------------------------------------ Einlesen ----

function lies(datei) {
  const pfad = datei || PROSPECTS;
  if (!fs.existsSync(pfad)) return [];
  try {
    const daten = JSON.parse(fs.readFileSync(pfad, 'utf8'));
    return Array.isArray(daten) ? daten : [];
  } catch (_e) {
    return [];
  }
}

// ----------------------------------------------------------- Auswerten ----

// Wie gut ist ein einzelner Betrieb als naechster Anruf?
// Telefon ist Pflicht (ohne Nummer kein Anruf), keine Website ist ein
// PLUS: wer online nichts hat, hat den groessten Nachholbedarf - und
// merkt den Unterschied am deutlichsten.
function bewerteBetrieb(b) {
  const s = segmentVon(b.category);
  if (!b.phone) return { punkte: 0, segment: s, grund: 'keine Telefonnummer hinterlegt' };

  let punkte = s.telefon * 2 + s.kiekmolin;
  const gruende = [s.warum];

  if (!b.website) { punkte += 3; gruende.push('keine eigene Website - online praktisch unsichtbar'); }
  if (b.hours) punkte += 1;                    // gepflegte Daten = jemand kuemmert sich

  return { punkte: punkte, segment: s, grund: gruende.join('; ') };
}

// Der Markt in Zahlen: je Segment und je Ort.
function auswerten(betriebe) {
  const liste = betriebe || lies();
  const segmente = {};
  const orte = {};

  for (const b of liste) {
    const s = segmentVon(b.category);
    const schluessel = s.name;
    if (!segmente[schluessel]) {
      segmente[schluessel] = { name: s.name, anzahl: 0, mitTelefon: 0, ohneWebseite: 0, kiekmolin: s.kiekmolin, telefon: s.telefon, warum: s.warum };
    }
    segmente[schluessel].anzahl++;
    if (b.phone) segmente[schluessel].mitTelefon++;
    if (!b.website) segmente[schluessel].ohneWebseite++;

    const ort = b.city || 'ohne Ort';
    if (!orte[ort]) orte[ort] = { name: ort, anzahl: 0, ohneWebseite: 0 };
    orte[ort].anzahl++;
    if (!b.website) orte[ort].ohneWebseite++;
  }

  const nachAnzahl = (a, b) => b.anzahl - a.anzahl;
  return {
    gesamt: liste.length,
    segmente: Object.values(segmente).sort(nachAnzahl),
    orte: Object.values(orte).sort(nachAnzahl),
    ohneWebseite: liste.filter((b) => !b.website).length,
    mitTelefon: liste.filter((b) => b.phone).length
  };
}

// Die naechsten Anrufe: beste Punktzahl zuerst, ohne die, die schon Kunde sind.
function naechsteAnrufe(betriebe, optionen) {
  const o = optionen || {};
  const schonKunde = new Set((o.kunden || []).map((k) => String(k).toLowerCase().trim()));
  const liste = (betriebe || lies())
    .filter((b) => b.phone && !schonKunde.has(String(b.name || '').toLowerCase().trim()))
    .filter((b) => !o.ort || String(b.city || '').toLowerCase().indexOf(String(o.ort).toLowerCase()) > -1)
    .map((b) => Object.assign({ betrieb: b }, bewerteBetrieb(b)))
    .filter((e) => e.punkte > 0)
    .sort((a, b) => b.punkte - a.punkte);

  return liste.slice(0, o.anzahl || 5);
}

// ---------------------------------------------------- Fuer die Stimme -----

function marktSatz(a) {
  if (!a || !a.gesamt) {
    return 'Ich finde keine Marktdaten. Lass einmal den Importer laufen: node import-osm.js';
  }

  const top = a.segmente.slice(0, 3).map((s) => s.anzahl + ' ' + s.name).join(', ');
  const besteFuerTelefon = a.segmente.slice().sort((x, y) => (y.telefon * y.anzahl) - (x.telefon * x.anzahl))[0];

  return 'Im Verzeichnis stehen ' + a.gesamt + ' Betriebe, davon ' + top + '. ' +
    a.ohneWebseite + ' haben keine eigene Website - das sind die dankbarsten Gespraeche. ' +
    'Fuer den Telefon-Retter lohnen sich am meisten ' + besteFuerTelefon.name + ': ' + besteFuerTelefon.warum + '.';
}

function anrufSatz(liste) {
  if (!liste || !liste.length) return 'Ich finde gerade keinen passenden Betrieb zum Anrufen.';
  const erste = liste.slice(0, 3).map((e) => {
    const b = e.betrieb;
    return b.name + ' in ' + (b.city || 'unbekannt') + ' (' + b.phone + ')';
  });
  return 'Ich wuerde heute anrufen: ' + erste.join(', ') + '. ' +
    'Beim ersten: ' + liste[0].grund + '.';
}

module.exports = {
  lies, auswerten, naechsteAnrufe, bewerteBetrieb, segmentVon,
  marktSatz, anrufSatz, SEGMENTE, PROSPECTS
};
