'use strict';

// Anfragen von der Check-Seite in die Pipeline bekommen.
//
// Das Problem: Die Netlify-Funktion auf kiekmolin.de verschickt eine E-Mail
// und speichert NICHTS. Das ist Absicht - Anfragen sind persoenliche Daten,
// und was nicht gespeichert wird, kann auch nicht verloren gehen oder in
// falsche Haende geraten. Genau so steht es auch im Datenschutzhinweis der
// Check-Seite.
//
// Die Folge war aber: In der Pipeline tauchte eine echte Anfrage nie auf.
// Ausgerechnet die heisseste Spur - jemand, der sich VON SELBST meldet -
// lag nur im Postfach und war in einer Woche unter hundert anderen Mails
// begraben.
//
// Die Loesung ohne neue Datenbank: Du bekommst die Mail wie bisher, kopierst
// sie einmal komplett und fuegst sie hier ein. Der Rest passiert von selbst.
// Ein Handgriff statt fuenf Feldern abtippen - und nichts liegt irgendwo
// zusaetzlich herum.

// Die Mail hat ein festes Format (siehe netlify/functions/agentur-lead.js):
//
//   Neue Anfrage ueber kiekmolin.de/check
//
//   Betrieb:  Pizzeria Roma
//   Ort:      Norden
//   Name:     Herr Janssen
//   Kontakt:  04931 12345
//   Anliegen: Bitte melden
//
//   Eingegangen: 14.8.2026, 15:04:22
//
// Weitergeleitete Mails bringen Kopfzeilen und ">" am Zeilenanfang mit -
// beides muss weg, bevor ueberhaupt gesucht wird.
const FELDER = [
  { schluessel: 'restaurant', muster: /^betrieb\s*:\s*(.*)$/i },
  { schluessel: 'ort', muster: /^ort\s*:\s*(.*)$/i },
  { schluessel: 'name', muster: /^name\s*:\s*(.*)$/i },
  { schluessel: 'kontakt', muster: /^kontakt\s*:\s*(.*)$/i },
  { schluessel: 'nachricht', muster: /^(?:anliegen|nachricht)\s*:\s*(.*)$/i },
  { schluessel: 'eingegangen', muster: /^eingegangen\s*:\s*(.*)$/i }
];

function saeubere(wert) {
  const t = String(wert || '').trim();
  // Die Mail schreibt "-", wenn ein Feld leer war. Das ist kein Inhalt.
  return t === '-' ? '' : t.slice(0, 300);
}

// "14.8.2026, 15:04:22" (deutsche Schreibweise) -> ISO-Zeitstempel.
// Laesst sich das Datum nicht lesen, wird NICHT geraten, sondern der
// Zeitpunkt des Eintragens genommen - besser eine ehrliche Naeherung als
// ein falsches Datum, nach dem spaeter sortiert wird.
function zeitAus(text, ersatz) {
  const t = String(text || '').trim();
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return (ersatz instanceof Date ? ersatz : new Date()).toISOString();
  const d = new Date(
    parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10),
    parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6] || '0', 10)
  );
  return isNaN(d.getTime()) ? (ersatz instanceof Date ? ersatz : new Date()).toISOString() : d.toISOString();
}

// Liest eine eingefuegte Mail. Wirft mit Klartext, wenn nichts Brauchbares
// drinsteht - eine halb erkannte Anfrage waere schlimmer als gar keine.
function parseAnfrageMail(roh, optionen) {
  const o = optionen || {};
  const text = String(roh || '');
  if (!text.trim()) throw new Error('Da war nichts zum Einlesen. Bitte die ganze E-Mail einfügen.');

  const gefunden = {};
  for (const zeile of text.split(/\r?\n/)) {
    // Weiterleitungs-Zeichen und Anfuehrungen entfernen
    const z = zeile.replace(/^[>\s|]+/, '').trim();
    if (!z) continue;
    for (const f of FELDER) {
      if (gefunden[f.schluessel] !== undefined) continue;
      const m = z.match(f.muster);
      if (m) { gefunden[f.schluessel] = saeubere(m[1]); break; }
    }
  }

  const lead = {
    restaurant: gefunden.restaurant || '',
    ort: gefunden.ort || '',
    name: gefunden.name || '',
    kontakt: gefunden.kontakt || '',
    nachricht: gefunden.nachricht || '',
    zeit: zeitAus(gefunden.eingegangen, o.jetzt),
    status: 'neu',
    quelle: 'mail-eingefuegt'
  };

  if (!lead.restaurant) {
    throw new Error('In dem Text steht keine Zeile "Betrieb:". Bitte die komplette E-Mail einfügen, ' +
      'so wie sie angekommen ist - oder die Felder von Hand ausfüllen.');
  }
  if (!lead.kontakt) {
    throw new Error('Es fehlt die Zeile "Kontakt:" – ohne Rückrufnummer oder E-Mail bringt der Eintrag nichts.');
  }
  return lead;
}

// Von Hand eingetragene Anfrage (wenn jemand anruft oder auf der Strasse fragt).
// Gleiche Form wie die eingelesene Mail, damit die Pipeline keinen Unterschied
// kennt.
function baueAnfrage(daten, optionen) {
  const d = daten || {};
  const o = optionen || {};
  const lead = {
    restaurant: saeubere(d.restaurant), ort: saeubere(d.ort),
    name: saeubere(d.name), kontakt: saeubere(d.kontakt),
    nachricht: saeubere(d.nachricht),
    zeit: (o.jetzt instanceof Date ? o.jetzt : new Date()).toISOString(),
    status: 'neu', quelle: 'von-hand'
  };
  if (!lead.restaurant) throw new Error('Bitte den Namen des Betriebs angeben.');
  if (!lead.kontakt) throw new Error('Bitte eine Rückrufnummer oder E-Mail angeben.');
  return lead;
}

// Steht die Anfrage schon in der Liste? Zweimal dieselbe Mail einzufuegen
// passiert schnell - dann haette man denselben Wirt doppelt in der Pipeline
// und riefe ihn womoeglich zweimal an.
function schonVorhanden(lead, vorhandene) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const name = norm(lead.restaurant);
  const kontakt = norm(lead.kontakt);
  return (vorhandene || []).some((v) =>
    norm(v.restaurant) === name && (!kontakt || norm(v.kontakt) === kontakt));
}

module.exports = { parseAnfrageMail, baueAnfrage, schonVorhanden, zeitAus };
