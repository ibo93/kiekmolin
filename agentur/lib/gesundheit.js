'use strict';

// Kunden-Gesundheits-Ampel - der Churn-Schutz der Agentur.
//
// Grosse Agenturen nennen das "Customer Success" oder "Health Score":
// Wer seinen Nutzen nicht mehr sieht, kuendigt still - deshalb schaut
// die Ampel auf jeden Kunden und meldet frueh, wenn etwas abdriftet.
//
// Bewertet wird AUSSCHLIESSLICH aus den lokal vorhandenen Report-Daten
// (keine extra DB-Abfragen, kein Netz) - schnell genug, um sie fuer die
// komplette Kundenliste bei jedem Seitenaufruf live zu berechnen.
// Reine Funktion, testbar ohne Uhr: der aktuelle Monat kommt als Parameter.

// 'JJJJ-MM' -> fortlaufender Monats-Index (fuer Abstands-Rechnung)
function monatsIndex(monat) {
  const teile = String(monat || '').split('-');
  const jahr = parseInt(teile[0], 10);
  const mon = parseInt(teile[1], 10);
  if (!jahr || !mon) return null;
  return jahr * 12 + (mon - 1);
}

// Hat der Telefon-Retter im Eintrag irgendetwas geleistet?
function telefonAktiv(telefon) {
  if (!telefon) return null; // kein Telefon-Retter angeschlossen
  return (telefon.reservierungen || 0) > 0
    || (telefon.gaeste || 0) > 0
    || (telefon.bestellungen || 0) > 0
    || (Number(telefon.bestellwert) || 0) > 0
    || (telefon.rueckrufe || 0) > 0
    || (Number(telefon.gesamtGeschaetzt) || 0) > 0;
}

// Kunden-Gesundheit bewerten.
//   historie       Report-Historie, neuester Eintrag zuerst (siehe server.js)
//   aktuellerMonat 'JJJJ-MM' - als Parameter, damit die Funktion testbar bleibt
// -> { stufe: 'gruen'|'gelb'|'rot', gruende: [deutsche Klartext-Gruende] }
function bewerteKunde({ historie, aktuellerMonat }) {
  const gruende = [];
  let rot = false;
  let gelb = false;

  const liste = Array.isArray(historie) ? historie : [];

  // ROT: Es gibt noch gar keinen Report - der Kunde hat nie Nutzen gesehen.
  if (liste.length === 0) {
    return {
      stufe: 'rot',
      gruende: ['Noch kein Report erzeugt - Einstieg unvollstaendig']
    };
  }

  const neuester = liste[0];
  const davor = liste[1] || null;
  const jetztIdx = monatsIndex(aktuellerMonat);
  const neuesterIdx = monatsIndex(neuester.monat);
  const luecke = (jetztIdx !== null && neuesterIdx !== null)
    ? jetztIdx - neuesterIdx
    : 0;

  // ROT: Letzter Report ist aelter als der Vormonat (2+ Monate Luecke) -
  // der Kunde bekommt seit Monaten keinen Beleg mehr fuer seinen Nutzen.
  if (luecke >= 2) {
    rot = true;
    gruende.push('Letzter Report von ' + neuester.monat + ' - Kunde sieht seinen Nutzen nicht mehr');
  } else if (luecke === 1) {
    // GELB: Vormonat ist da, nur der aktuelle Monat fehlt noch.
    gelb = true;
    gruende.push('Report fuer diesen Monat steht noch aus');
  }

  // Quote-Vergleich: nur neuester gegen den davor, und nur wenn beide
  // Messungen auf derselben getestet-Basis stehen (sonst Aepfel/Birnen).
  if (neuester.quote && davor && davor.quote
    && neuester.quote.prozent !== null && davor.quote.prozent !== null
    && neuester.quote.getestet === davor.quote.getestet) {
    const vorher = davor.quote.prozent;
    const nachher = neuester.quote.prozent;
    const gefallen = vorher - nachher;
    if (gefallen > 15) {
      // ROT: Sichtbarkeit ist eingebrochen - sofort nachschauen.
      rot = true;
      gruende.push('Sichtbarkeits-Quote deutlich gefallen (' + vorher + ' -> ' + nachher + '%)');
    } else if (gefallen >= 1) {
      // GELB: Leichter Rueckgang - im Auge behalten.
      gelb = true;
      gruende.push('Sichtbarkeits-Quote leicht gefallen (' + vorher + ' -> ' + nachher + '%)');
    }
  }

  // GELB: Telefon-Retter ist angeschlossen, hat aber im neuesten Report
  // nichts geleistet - vielleicht laeuft der Anschluss ins Leere.
  if (telefonAktiv(neuester.telefon) === false) {
    gelb = true;
    gruende.push('Keine Telefon-Aktivitaet im letzten Monat - lohnt sich der Anschluss-Check?');
  }

  // Schlechteste ausgeloeste Stufe gewinnt; ohne Befund: gruen.
  if (rot) return { stufe: 'rot', gruende };
  if (gelb) return { stufe: 'gelb', gruende };
  return { stufe: 'gruen', gruende: ['Alles im gruenen Bereich'] };
}

module.exports = { bewerteKunde };
