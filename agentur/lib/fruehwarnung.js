'use strict';

// Stille-Alarm: erkennt frueh, wenn bei einem Kunden die Zahlen kippen -
// BEVOR der Wirt selbst merkt, dass es schlechter laeuft.
//
// Warum das der beste Kundenbindungs-Hebel ist: Wer anruft, bevor es weh
// tut, ist Partner statt Dienstleister. Und niemand kuendigt jemandem,
// der sich frueher kuemmert als er selbst.
//
// Reine Statistik, kein KI-Aufruf: schnell, kostenlos, nachvollziehbar.
// EHRLICH: Bei zu duenner Datenlage gibt es KEINEN Alarm, sondern die
// klare Aussage "noch keine Vergleichsbasis" - lieber nichts sagen als
// Panik aus Zufallszahlen.

const TAG_MS = 24 * 60 * 60 * 1000;

// Zaehlt Ereignisse (Datum-Strings) in Wochen-Faechern rueckwaerts ab heute:
// fach 0 = die letzten 7 Tage, fach 1 = die 7 Tage davor, usw.
function zaehleWochen(datumsListe, heute, anzahlWochen) {
  const faecher = new Array(anzahlWochen).fill(0);
  for (const roh of datumsListe || []) {
    const d = new Date(String(roh).slice(0, 10));
    if (isNaN(d.getTime())) continue;
    const tageHer = Math.floor((heute.getTime() - d.getTime()) / TAG_MS);
    if (tageHer < 0) continue; // Zukunft (Vorausreservierung) zaehlt hier nicht
    const fach = Math.floor(tageHer / 7);
    if (fach < anzahlWochen) faecher[fach]++;
  }
  return faecher;
}

// Kern der Bewertung: aktuelle Woche gegen den Schnitt der Vorwochen.
// schwelle = ab welchem Minus gewarnt wird (Standard 30 %).
function bewerteReihe(faecher, optionen) {
  const o = optionen || {};
  const schwelleWarnung = o.schwelleWarnung != null ? o.schwelleWarnung : 0.3;
  const schwelleAlarm = o.schwelleAlarm != null ? o.schwelleAlarm : 0.5;
  const minBasis = o.minBasis != null ? o.minBasis : 4; // so viele Ereignisse muss der Schnitt mind. haben

  const aktuell = faecher[0] || 0;
  const vorwochen = faecher.slice(1).filter((_, i) => i < 4);
  if (!vorwochen.length) return { stufe: 'unklar', grund: 'Noch keine Vergleichswochen.' };

  const schnitt = vorwochen.reduce((s, n) => s + n, 0) / vorwochen.length;
  if (schnitt < minBasis) {
    return { stufe: 'unklar', schnitt, aktuell, grund: 'Zu wenig Daten für eine ehrliche Aussage.' };
  }

  const veraenderung = (aktuell - schnitt) / schnitt; // -0.4 = 40 % weniger
  const prozent = Math.round(veraenderung * 100);
  if (veraenderung <= -schwelleAlarm) {
    return { stufe: 'alarm', schnitt, aktuell, prozent, grund: Math.abs(prozent) + ' % unter dem Schnitt der Vorwochen.' };
  }
  if (veraenderung <= -schwelleWarnung) {
    return { stufe: 'warnung', schnitt, aktuell, prozent, grund: Math.abs(prozent) + ' % unter dem Schnitt der Vorwochen.' };
  }
  if (veraenderung >= 0.3) {
    return { stufe: 'gut', schnitt, aktuell, prozent, grund: '+' + prozent + ' % über dem Schnitt – das ist eine gute Nachricht!' };
  }
  return { stufe: 'ok', schnitt, aktuell, prozent, grund: 'Im normalen Bereich.' };
}

// Komplette Fruehwarnung fuer einen Kunden.
// daten: { reservierungsDaten: [...], bestellDaten: [...] } (Datum-Strings)
function pruefeKunde(daten, optionen) {
  const o = optionen || {};
  const heute = o.heute || new Date();
  const wochen = 5; // aktuelle Woche + 4 Vergleichswochen

  const resiFaecher = zaehleWochen((daten && daten.reservierungsDaten) || [], heute, wochen);
  const bestellFaecher = zaehleWochen((daten && daten.bestellDaten) || [], heute, wochen);

  const resi = bewerteReihe(resiFaecher, o);
  const bestell = bewerteReihe(bestellFaecher, o);

  const meldungen = [];
  if (resi.stufe === 'alarm' || resi.stufe === 'warnung') {
    meldungen.push({ art: 'Reservierungen', stufe: resi.stufe, text: 'Reservierungen: ' + resi.grund + ' (' + resi.aktuell + ' diese Woche, sonst ~' + Math.round(resi.schnitt) + ')' });
  }
  if (bestell.stufe === 'alarm' || bestell.stufe === 'warnung') {
    meldungen.push({ art: 'Bestellungen', stufe: bestell.stufe, text: 'Bestellungen: ' + bestell.grund + ' (' + bestell.aktuell + ' diese Woche, sonst ~' + Math.round(bestell.schnitt) + ')' });
  }
  const gute = [];
  if (resi.stufe === 'gut') gute.push('Reservierungen ' + resi.grund);
  if (bestell.stufe === 'gut') gute.push('Bestellungen ' + bestell.grund);

  const stufe = meldungen.some((m) => m.stufe === 'alarm') ? 'alarm'
    : meldungen.length ? 'warnung'
      : (resi.stufe === 'unklar' && bestell.stufe === 'unklar') ? 'unklar' : 'ok';

  return {
    stufe, meldungen, gute,
    details: { reservierungen: resi, bestellungen: bestell },
    // Konkreter Vorschlag, was zu tun ist - der eigentliche Wert fuer Ibo.
    empfehlung: baueEmpfehlung(stufe, meldungen)
  };
}

function baueEmpfehlung(stufe, meldungen) {
  if (stufe === 'alarm') {
    return 'Heute anrufen! Sag ehrlich: „Mir ist aufgefallen, dass diese Woche deutlich weniger reinkommt – ' +
      'lass uns kurz sprechen, was wir sofort machen können.“ Danach: Anlass-Post raus, Gäste-Rückholung starten.';
  }
  if (stufe === 'warnung') {
    return 'Im Blick behalten. Wenn es nächste Woche nicht besser wird: anrufen. Jetzt schon: Anlass-Post posten ' +
      'und die Rückgewinnungs-Liste durchgehen – das wirkt am schnellsten.';
  }
  if (stufe === 'unklar') {
    return 'Noch keine belastbare Vergleichsbasis – nichts behaupten. Sobald mehr Reservierungen über Kiek mol in laufen, greift die Frühwarnung.';
  }
  return 'Alles im normalen Bereich – nichts zu tun.';
}

module.exports = { zaehleWochen, bewerteReihe, pruefeKunde };
