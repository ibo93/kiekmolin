'use strict';

// Anruf-Protokolle lesbar machen.
//
// Der Telefon-Retter schreibt pro Anruf eine Datei mit Zeilen wie:
//   2026-08-14T09:12:03.114Z Anruf gestartet von +4915112345 fuer Greetsieler Boerse
//   2026-08-14T09:12:09.882Z GAST: Guten Tag, ich haette gern einen Tisch
//   2026-08-14T09:12:11.204Z AGENT: Sehr gerne! Fuer wie viele Personen?
//
// Fuer den Alltag ist das unbrauchbar - hier wird daraus ein Gespraech,
// das man wie einen Chat liest: wer hat wann was gesagt, wie lange hat es
// gedauert, was kam dabei heraus.
//
// Warum das wichtig ist: Nur wer hoert, WIE die KI redet, traut sich, sie
// auf seine Gaeste loszulassen. Und beim Wirt ist ein vorgelesenes
// Protokoll das ueberzeugendste Verkaufsargument, das es gibt.

// Eine Zeile zerlegen: Zeitstempel + Rolle + Text
const ZEILE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/;

function parseZeile(roh) {
  const treffer = ZEILE.exec(String(roh));
  if (!treffer) return null;
  const zeit = treffer[1];
  const rest = treffer[2];

  if (rest.startsWith('GAST: ')) return { zeit, wer: 'gast', text: rest.slice(6) };
  if (rest.startsWith('AGENT: ')) return { zeit, wer: 'agent', text: rest.slice(7) };
  if (/^FEHLER: |-Fehler: /.test(rest)) return { zeit, wer: 'fehler', text: rest };
  return { zeit, wer: 'system', text: rest };
}

// Aus der Startzeile Anrufer und Restaurant ziehen:
// "Anruf gestartet von +4915112345 fuer Greetsieler Boerse"
function lieszKopf(zeilen) {
  const start = zeilen.find((z) => /^Anruf gestartet von /.test(z.text));
  if (!start) return { anrufer: null, restaurant: null };
  const treffer = /^Anruf gestartet von (.+?) fuer (.+)$/.exec(start.text);
  if (!treffer) return { anrufer: null, restaurant: null };
  return { anrufer: treffer[1].trim(), restaurant: treffer[2].trim() };
}

// Wurde im Gespraech etwas erreicht? Wird aus den Protokollzeilen gelesen,
// NICHT geraten - steht nichts drin, sagen wir das auch.
function erkenneErgebnis(zeilen) {
  const alles = zeilen.map((z) => z.text).join('\n');
  if (/reserviere_tisch|Tisch reserviert|Reservierung angelegt/i.test(alles)) return 'Reservierung';
  if (/bestellung|nehme_bestellung/i.test(alles)) return 'Bestellung';
  if (/rueckruf/i.test(alles)) return 'Rückruf-Wunsch';
  if (zeilen.some((z) => z.wer === 'fehler')) return 'Technischer Fehler';
  if (!zeilen.some((z) => z.wer === 'gast')) return 'Niemand hat gesprochen';
  return 'Gespräch ohne Abschluss';
}

// Ein komplettes Protokoll auswerten
function parseProtokoll(text, datei) {
  const zeilen = String(text || '').split('\n')
    .map(parseZeile)
    .filter(Boolean);

  const gespraech = zeilen.filter((z) => z.wer === 'gast' || z.wer === 'agent');
  const beginn = zeilen.length ? zeilen[0].zeit : null;
  const ende = zeilen.length ? zeilen[zeilen.length - 1].zeit : null;
  const dauer = beginn && ende
    ? Math.max(0, Math.round((new Date(ende) - new Date(beginn)) / 1000))
    : null;

  const kopf = lieszKopf(zeilen);
  return {
    datei: datei || null,
    beginn, ende,
    dauerSekunden: dauer,
    anrufer: kopf.anrufer,
    restaurant: kopf.restaurant,
    saetzeGast: gespraech.filter((z) => z.wer === 'gast').length,
    saetzeAgent: gespraech.filter((z) => z.wer === 'agent').length,
    ergebnis: erkenneErgebnis(zeilen),
    hatFehler: zeilen.some((z) => z.wer === 'fehler'),
    zeilen
  };
}

// Kurzfassung fuer die Liste (ohne den ganzen Gespraechsverlauf)
function kurzfassung(protokoll) {
  const p = protokoll || {};
  return {
    datei: p.datei,
    beginn: p.beginn,
    dauerSekunden: p.dauerSekunden,
    anrufer: p.anrufer,
    restaurant: p.restaurant,
    saetzeGast: p.saetzeGast,
    saetzeAgent: p.saetzeAgent,
    ergebnis: p.ergebnis,
    hatFehler: p.hatFehler
  };
}

// Telefonnummern in der Anzeige kuerzen (Datenschutz: die letzten Stellen
// reichen zum Wiedererkennen, die ganze Nummer muss nicht auf den Schirm).
function nummerKuerzen(nummer) {
  const n = String(nummer || '').trim();
  if (n.length < 6) return n;
  return n.slice(0, 4) + '…' + n.slice(-3);
}

function dauerText(sekunden) {
  if (sekunden == null) return 'unbekannt';
  if (sekunden < 60) return sekunden + ' Sek.';
  return Math.floor(sekunden / 60) + ':' + String(sekunden % 60).padStart(2, '0') + ' Min.';
}

module.exports = { parseZeile, parseProtokoll, kurzfassung, nummerKuerzen, dauerText };
