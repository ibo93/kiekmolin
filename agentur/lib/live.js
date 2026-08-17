'use strict';

// Echtzeit-Leitstand: Die Agentur-App wartet nicht mehr darauf, dass du
// die Seite neu laedst - sie meldet sich von selbst, sobald etwas passiert.
//
// Warum das mehr ist als Bequemlichkeit: Ein Rueckruf-Wunsch ist ein Gast,
// der GERADE angerufen hat. Wer innerhalb von Minuten zurueckruft, hat den
// Tisch. Wer es morgen sieht, hat den Gast verloren. Genau dafuer ist das
// hier da.
//
// Technik bewusst schlicht: Server-Sent Events (SSE). Das ist eine offene
// HTTP-Verbindung, durch die der Server Nachrichten schiebt - kein extra
// Programm, keine zusaetzliche Bibliothek, laeuft in jedem Browser.

const HERZSCHLAG_MS = 25000; // haelt die Verbindung durch Proxys hindurch offen

// --- 1. Verteiler: wer haengt gerade an der Leitung? ----------------------
class Verteiler {
  constructor() {
    this.zuhoerer = new Set();
  }

  // Eine neue Browser-Verbindung aufnehmen. Gibt eine Abmelde-Funktion zurueck.
  anmelden(schreibe) {
    this.zuhoerer.add(schreibe);
    return () => this.zuhoerer.delete(schreibe);
  }

  get anzahl() {
    return this.zuhoerer.size;
  }

  // Nachricht an alle. Kaputte Verbindungen fliegen still raus - ein
  // geschlossener Laptop darf den Server nicht stoeren.
  sende(typ, daten) {
    const block = 'event: ' + typ + '\ndata: ' + JSON.stringify(daten || {}) + '\n\n';
    for (const schreibe of [...this.zuhoerer]) {
      try { schreibe(block); } catch (_e) { this.zuhoerer.delete(schreibe); }
    }
    return this.zuhoerer.size;
  }

  herzschlag() {
    // Kommentar-Zeile: haelt die Leitung offen, ohne ein Ereignis auszuloesen
    for (const schreibe of [...this.zuhoerer]) {
      try { schreibe(': still da\n\n'); } catch (_e) { this.zuhoerer.delete(schreibe); }
    }
  }
}

// --- 2. Wachhund: was hat sich seit dem letzten Blick geaendert? -----------
// Reine Vergleichs-Logik, damit sie ohne Netz und Datenbank testbar bleibt.

// Neue Eintraege in einer Liste finden (z.B. Rueckrufe, Leads).
// bekannteIds wird dabei ergaenzt - beim ersten Lauf gilt NICHTS als neu,
// sonst schlaegt die App beim Start fuer jeden alten Eintrag Alarm.
function neueEintraege(bekannteIds, liste, schluesselFeld, ersterLauf) {
  const neue = [];
  for (const eintrag of liste || []) {
    const id = String((eintrag && eintrag[schluesselFeld]) != null ? eintrag[schluesselFeld] : '');
    if (!id || bekannteIds.has(id)) continue;
    bekannteIds.add(id);
    if (!ersterLauf) neue.push(eintrag);
  }
  return neue;
}

// Zahlen-Vergleich fuer die Telefon-Statistik: was ist dazugekommen?
// Nur Zuwaechse melden - eine gedrehte Log-Datei darf kein Ereignis werfen.
function zuwachs(alt, neu, felder) {
  const ergebnis = {};
  let etwas = false;
  for (const feld of felder) {
    const vorher = Number((alt || {})[feld]) || 0;
    const jetzt = Number((neu || {})[feld]) || 0;
    if (jetzt > vorher) {
      ergebnis[feld] = jetzt - vorher;
      etwas = true;
    }
  }
  return etwas ? ergebnis : null;
}

// Aus einem Zuwachs den Satz bauen, der im Browser aufpoppt.
function meldungFuerZuwachs(zuwachsDaten) {
  const z = zuwachsDaten || {};
  const teile = [];
  if (z.reservierungen) teile.push(z.reservierungen + ' neue Reservierung' + (z.reservierungen === 1 ? '' : 'en'));
  if (z.bestellungen) teile.push(z.bestellungen + ' neue Bestellung' + (z.bestellungen === 1 ? '' : 'en'));
  if (z.rueckrufe) teile.push(z.rueckrufe + (z.rueckrufe === 1 ? ' neuer Rückruf-Wunsch' : ' neue Rückruf-Wünsche'));
  if (!teile.length && z.anrufeHeute) teile.push(z.anrufeHeute + ' neuer Anruf' + (z.anrufeHeute === 1 ? '' : 'e'));
  return teile.join(' · ');
}

module.exports = { Verteiler, neueEintraege, zuwachs, meldungFuerZuwachs, HERZSCHLAG_MS };
