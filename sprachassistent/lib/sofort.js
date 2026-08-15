'use strict';

// SOFORT — was der Assistent ohne KI erledigt.
//
// Notiz anlegen, Liste vorlesen, abhaken, Diktat mitschreiben: dafuer
// braucht es kein Modell. Das hier antwortet in Millisekunden, kostet
// nichts und funktioniert auch, wenn das Netz weg ist.
//
// Beide Wege (Knopf-Betrieb und Live-Modus) benutzen dieselbe Funktion,
// damit sich die Befehle nie unterschiedlich verhalten.

const befehle = require('./befehle');
const notizen = require('./notizen');
const wissen = require('./wissen');
const { Diktat } = require('./diktat');

// zustand: { diktat: Diktat|null } - lebt pro Fenster.
// Rueckgabe: { art, antwort, still? } oder null (dann uebernimmt Claude).
function behandle(text, zustand, jetzt) {
  const t = String(text || '').trim();
  if (!t) return null;
  const z = zustand || {};
  const befehl = befehle.direktBefehl(t);

  // Laeuft ein Diktat, geht ALLES in die Mitschrift - ausser dem
  // Schlusswort. Sonst wuerde mitten im Diktieren eine Notiz angelegt,
  // nur weil der Satz mit "merk dir" anfing.
  if (z.diktat) {
    if (befehl && befehl.art === 'diktatEnde') {
      const ergebnis = z.diktat.speichere();
      z.diktat = null;
      // Merken, woran "mach das fertig" gleich anknuepfen kann.
      if (!ergebnis.leer) z.letztesDiktat = ergebnis.datei;
      if (ergebnis.leer) return { art: 'diktat', antwort: 'Das Diktat war leer, ich habe nichts gespeichert.' };
      return {
        art: 'diktat',
        antwort: 'Diktat gespeichert: ' + ergebnis.saetze + ' Saetze, ' + ergebnis.woerter +
          ' Woerter, in diktate ' + ergebnis.name + '.'
      };
    }
    const anzahl = z.diktat.dazu(t);
    return { art: 'diktatSatz', antwort: '', still: true, saetze: anzahl };
  }

  if (!befehl) return null;

  if (befehl.art === 'merken') {
    const zeit = notizen.deuteZeit(befehl.text, jetzt);
    const inhalt = zeit.rest || befehl.text;
    if (!inhalt) return { art: 'notiz', antwort: 'Was soll ich mir merken?' };
    const notiz = notizen.merke(inhalt, { faellig: zeit.faellig });
    if (!notiz.faellig) return { art: 'notiz', antwort: 'Notiert.' };
    // zeitWort endet manchmal selbst auf einem Punkt ("am 21.8.") - dann
    // klingt "am 21.8.." beim Vorlesen nach Schluckauf.
    const wann = notizen.zeitWort(notiz.faellig, jetzt);
    return {
      art: 'notiz',
      antwort: 'Notiert. Ich erinnere dich ' + wann + (/[.!?]$/.test(wann) ? '' : '.')
    };
  }

  // Dauerhaftes Wissen: gilt ab sofort in jedem Auftrag.
  if (befehl.art === 'wissen') {
    if (!befehl.text) return { art: 'wissen', antwort: 'Was soll dauerhaft gelten?' };
    const w = wissen.merke(befehl.text, jetzt);
    return {
      art: 'wissen',
      antwort: w.neu ? 'Gemerkt. Das gilt ab jetzt immer.' : 'Wusste ich schon.'
    };
  }

  if (befehl.art === 'wissenVergessen') {
    const weg = wissen.vergiss(befehl.text);
    return { art: 'wissen', antwort: weg ? 'Gestrichen: ' + weg : 'Dazu weiss ich nichts.' };
  }

  if (befehl.art === 'wissenListe') {
    const liste = wissen.zeilen();
    if (!liste.length) return { art: 'wissen', antwort: 'Dauerhaft weiss ich noch nichts. Sag "merk dir dauerhaft" und dann die Sache.' };
    const kurz = liste.slice(-5).map((z) => z.replace(/\s*\(seit [\d-]+\)\s*$/, ''));
    const wieviel = liste.length === 1 ? 'eine Sache' : liste.length + ' Sachen';
    return {
      art: 'wissen',
      antwort: 'Ich weiss ' + wieviel + ' dauerhaft' +
        (liste.length === 1 ? ': ' : ', zuletzt: ') + kurz.join('. ') + '.'
    };
  }

  if (befehl.art === 'liste') {
    return { art: 'notiz', antwort: notizen.formuliere(notizen.offene(), jetzt) };
  }

  if (befehl.art === 'erledigt') {
    if (!befehl.text) return { art: 'notiz', antwort: 'Was soll ich abhaken?' };
    const weg = notizen.erledige(befehl.text);
    return {
      art: 'notiz',
      antwort: weg ? 'Abgehakt: ' + weg.text + '.' : 'Das finde ich nicht auf deiner Liste.'
    };
  }

  if (befehl.art === 'diktatStart') {
    z.diktat = new Diktat(befehl.text, jetzt);
    return {
      art: 'diktat',
      antwort: 'Ich schreibe mit. Sag "Diktat Ende", wenn du fertig bist.'
    };
  }

  if (befehl.art === 'diktatEnde') {
    return { art: 'diktat', antwort: 'Es lief gar kein Diktat.' };
  }

  return null;
}

module.exports = { behandle };
