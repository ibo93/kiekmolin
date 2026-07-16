'use strict';

// Automatik-Helfer der Agentur-App - bewusst reine Funktionen (testbar
// ohne Netz/Uhr): Wann startet die Monats-Routine von selbst, und was
// sagen die Anruf-Statistik-Zeilen des Telefon-Retters?

function monatVon(datum) {
  return datum.getFullYear() + '-' + String(datum.getMonth() + 1).padStart(2, '0');
}

// Soll der automatische Monatslauf JETZT starten?
//   tag             Monatstag (1-28), 0 = Automatik aus
//   letzterLaufMonat 'JJJJ-MM' des letzten automatischen Laufs (oder null)
function sollAutoLaufen(jetzt, letzterLaufMonat, tag) {
  if (!(tag > 0)) return false;
  return jetzt.getDate() >= tag && monatVon(jetzt) !== letzterLaufMonat;
}

// Wann laeuft die Automatik das naechste Mal? -> 'JJJJ-MM-TT' (oder null = aus)
function naechsterAutoLauf(jetzt, letzterLaufMonat, tag) {
  if (!(tag > 0)) return null;
  const diesenMonatFaellig = monatVon(jetzt) !== letzterLaufMonat && jetzt.getDate() < tag;
  const d = diesenMonatFaellig
    ? new Date(jetzt.getFullYear(), jetzt.getMonth(), tag)
    : new Date(jetzt.getFullYear(), jetzt.getMonth() + 1, tag);
  return monatVon(d) + '-' + String(tag).padStart(2, '0');
}

// Wochen-Digest: jeden Montag EINE Mail an den Betreiber mit der Lage.
// Faellig, wenn heute Montag ist und der letzte Digest nicht von heute
// stammt. Kein Nachholen unter der Woche - der naechste Montag kommt.
function istDigestFaellig(jetzt, letzterTag) {
  if (jetzt.getDay() !== 1) return false;
  const heute = jetzt.getFullYear() + '-' +
    String(jetzt.getMonth() + 1).padStart(2, '0') + '-' + String(jetzt.getDate()).padStart(2, '0');
  return heute !== letzterTag;
}

// Zeilen aus telefon-retter/logs/statistik.jsonl auswerten.
// heute = 'JJJJ-MM-TT'; gezaehlt wird der Tag und der laufende Monat.
function werteStatistikAus(zeilen, heute) {
  const monat = String(heute).slice(0, 7);
  const summe = {
    anrufeHeute: 0, anrufeMonat: 0,
    reservierungen: 0, gaeste: 0, bestellungen: 0, bestellwert: 0, rueckrufe: 0
  };
  for (const zeile of zeilen || []) {
    let d;
    try { d = JSON.parse(zeile); } catch (_e) { continue; }
    if (!d || !d.zeit) continue;
    if (String(d.zeit).slice(0, 10) === heute) summe.anrufeHeute++;
    if (String(d.zeit).slice(0, 7) !== monat) continue;
    summe.anrufeMonat++;
    summe.reservierungen += d.reservierungen || 0;
    summe.gaeste += d.gaeste || 0;
    summe.bestellungen += d.bestellungen || 0;
    summe.bestellwert += Number(d.bestellwert) || 0;
    summe.rueckrufe += d.rueckrufe || 0;
  }
  summe.bestellwert = Math.round(summe.bestellwert * 100) / 100;
  return summe;
}

module.exports = { sollAutoLaufen, naechsterAutoLauf, istDigestFaellig, werteStatistikAus, monatVon };
