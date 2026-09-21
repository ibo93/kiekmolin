'use strict';

// Was ist bei diesem Kunden noch nicht eingerichtet?
//
// Beim ersten Kunden weiss man alles auswendig. Beim dritten fehlt dann
// die Speisekarte, beim fuenften hat nie jemand den Portal-Link geschickt -
// und keiner merkt es, weil es keinen Ort gibt, an dem stuende, was fehlt.
// Die Knoepfe sind alle da, aber ohne Reihenfolge.
//
// Diese Liste beantwortet fuer EINEN Kunden: Was ist fertig, was fehlt,
// und was ist als Naechstes dran.
//
// Wie ueberall hier: Das Modul entscheidet nichts selbst, es bekommt den
// beobachteten Zustand uebergeben. Damit ist es ohne Datenbank pruefbar -
// und es behauptet nie etwas sei erledigt, weil es "eigentlich" so sein
// muesste.

// Die Schritte in der Reihenfolge, in der sie sinnvoll sind. "pflicht"
// heisst: ohne das kann man den Kunden nicht guten Gewissens betreuen.
const SCHRITTE = [
  {
    id: 'aufbereitung',
    titel: 'Aufbereitung erzeugt',
    pflicht: true,
    warum: 'Maschinenlesbare Daten, Texte und Google-Posts. Ohne das findet ihn keine KI.',
    wie: 'Knopf „Aufbereitung erzeugen (Teil A)" in dieser Ansicht.'
  },
  {
    id: 'report',
    titel: 'Erster Monats-Report',
    pflicht: true,
    warum: 'Der Report ist das, wofür er zahlt – und der Ausgangswert, an dem alles Spätere gemessen wird.',
    wie: 'Knopf „Monats-Report erzeugen".'
  },
  {
    id: 'telefon',
    titel: 'Telefon-Nummer zugeordnet',
    pflicht: false,
    warum: 'Nur nötig, wenn er den Telefon-Retter gebucht hat. Sonst überspringen.',
    wie: 'Abschnitt „Telefon-Kunden" auf der Startseite.'
  },
  {
    id: 'speisekarte',
    titel: 'Speisekarte hinterlegt',
    pflicht: false,
    warum: 'Ohne Karte kann der Telefon-Retter keine Bestellung annehmen – und verspricht es dann auch nicht.',
    wie: 'Beim Anlegen: Webseite, Fotos der Karte oder abtippen.'
  },
  {
    id: 'meldeweg',
    titel: 'Meldeweg eingetragen (SMS oder E-Mail)',
    pflicht: true,
    warum: 'Ohne Meldeweg erfährt der Wirt nichts von seinen Anrufen. Das ist der Fehler, der am meisten Ärger macht.',
    wie: 'Beim Telefon-Kunden „SMS an" oder „E-Mail an" ausfüllen.',
    nurWenn: 'telefon'
  },
  {
    id: 'portal',
    titel: 'Portal-Link an den Wirt geschickt',
    pflicht: true,
    warum: 'Sein eigener Zugang zu den Zahlen. Wer ihn nie bekommt, sieht nie, wofür er zahlt.',
    wie: 'Link oben in der Kopfzeile dieser Ansicht, per WhatsApp schicken.'
  },
  {
    id: 'angebot',
    titel: 'Angebot oder Vereinbarung liegt vor',
    pflicht: true,
    warum: 'Was genau vereinbart ist, muss schriftlich sein – für ihn und für dich.',
    wie: 'Knopf „Angebot erzeugen".'
  }
];

// zustand: { aufbereitung: true, report: false, telefon: true, ... }
// Alles, was nicht ausdruecklich true ist, gilt als offen. Im Zweifel
// lieber einmal zu viel nachhaken als einen Kunden halb eingerichtet
// laufen lassen.
function baueListe(zustand, optionen) {
  const z = zustand || {};
  const o = optionen || {};
  const schritte = [];

  for (const s of SCHRITTE) {
    // Schritte, die nur unter einer Bedingung gelten (z.B. Meldeweg nur,
    // wenn ueberhaupt ein Telefon-Kunde angelegt ist).
    if (s.nurWenn && !z[s.nurWenn]) continue;
    schritte.push({
      id: s.id, titel: s.titel, warum: s.warum, wie: s.wie,
      pflicht: s.pflicht, erledigt: z[s.id] === true
    });
  }

  const offen = schritte.filter((s) => !s.erledigt);
  const offenePflicht = offen.filter((s) => s.pflicht);
  const naechster = offenePflicht[0] || offen[0] || null;

  return {
    schritte,
    fertig: schritte.filter((s) => s.erledigt).length,
    gesamt: schritte.length,
    offenePflicht: offenePflicht.length,
    naechster,
    // Ein Kunde gilt als eingerichtet, wenn nichts Pflichtiges mehr offen
    // ist. Freiwillige Schritte duerfen offen bleiben - nicht jeder Kunde
    // bucht alles.
    eingerichtet: offenePflicht.length === 0,
    satz: satz(schritte.length, schritte.filter((s) => s.erledigt).length, offenePflicht.length, naechster, o.name)
  };
}

function satz(gesamt, fertig, offenePflicht, naechster, name) {
  const wer = name || 'Dieser Kunde';
  if (!offenePflicht) {
    return wer + ' ist vollständig eingerichtet (' + fertig + ' von ' + gesamt + ' Schritten).';
  }
  return wer + ': ' + offenePflicht + ' von ' + gesamt + ' Pflicht-Schritten offen. ' +
    'Als Nächstes: ' + (naechster ? naechster.titel : '–') + '.';
}

module.exports = { SCHRITTE, baueListe };
