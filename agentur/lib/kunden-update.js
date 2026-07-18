'use strict';

// WhatsApp-Kunden-Update: eine fertige, kurze Nachricht mit den
// Monats-Zahlen eines Kunden - zum Kopieren und direkt an den Wirt schicken.
// Kundenbindung mit einem Klick: Der Wirt spuert jeden Monat, dass gearbeitet
// wird, ohne dass Ibo eine Nachricht formulieren muss.
//
// Ehrlichkeits-Regeln wie ueberall: keine geschoenten Zahlen, Umsatz immer
// als "geschaetzt" markiert, kein Versprechen auf Platzierungen.

function euro(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' €';
}

function quoteZeile(aktuell, vorher) {
  if (!aktuell || !aktuell.quote || aktuell.quote.prozent == null) {
    return '📊 Sichtbarkeit: Der erste Messlauf läuft gerade – die Zahlen kommen im nächsten Update.';
  }
  const q = aktuell.quote;
  let zeile = '📊 Sichtbarkeits-Quote: ' + q.prozent + ' % (' + q.gefunden + ' von ' + q.getestet + ' Tests mit Treffer)';
  if (vorher && vorher.quote && vorher.quote.prozent != null) {
    const diff = q.prozent - vorher.quote.prozent;
    if (diff > 0) zeile += ' – 📈 +' + diff + ' Punkte zum Vormonat!';
    else if (diff < 0) zeile += ' – ' + diff + ' Punkte zum Vormonat, daran arbeiten wir.';
    else zeile += ' – stabil zum Vormonat.';
  } else {
    zeile += ' – erster Messmonat, ab jetzt vergleichen wir jeden Monat.';
  }
  return zeile;
}

function telefonZeilen(telefon) {
  const t = telefon || {};
  const aktiv = (t.reservierungen || 0) + (t.bestellungen || 0) + (t.rueckrufe || 0);
  if (!aktiv) return [];
  const zeilen = [];
  const teile = [];
  if (t.reservierungen) teile.push(t.reservierungen + ' Reservierung' + (t.reservierungen > 1 ? 'en' : '') + ' (' + (t.gaeste || 0) + ' Gäste)');
  if (t.bestellungen) teile.push(t.bestellungen + ' Bestellung' + (t.bestellungen > 1 ? 'en' : ''));
  if (teile.length) {
    zeilen.push('📞 Telefon-Assistent: ' + teile.join(', ') +
      (t.gesamtGeschaetzt ? ' – rund ' + euro(t.gesamtGeschaetzt) + ' Umsatz am Telefon (geschätzt)' : ''));
  }
  if (t.rueckrufe) {
    zeilen.push('✅ Kein Anruf verloren: ' + t.rueckrufe + ' ' + (t.rueckrufe > 1 ? 'Rückruf-Wünsche' : 'Rückruf-Wunsch') + ' sauber notiert');
  }
  return zeilen;
}

// historie: absteigend sortiert (neuester Monat zuerst), wie kundenHistorie().
function baueKundenUpdate({ kunde, monatLabel, historie, telefon, portalUrl }) {
  const aktuell = (historie && historie[0]) || null;
  const vorher = (historie && historie[1]) || null;

  const zeilen = [
    'Moin! Kurzes Update von Kurani zu ' + (kunde.name || 'Ihrem Betrieb') + ' (' + monatLabel + '):',
    '',
    quoteZeile(aktuell, vorher)
  ];
  zeilen.push(...telefonZeilen(telefon));
  zeilen.push('');
  zeilen.push(portalUrl
    ? 'Alle Details jederzeit hier: ' + portalUrl
    : 'Der komplette Monats-Report kommt wie gewohnt dazu.');
  zeilen.push('');
  zeilen.push('Bei Fragen einfach hier antworten – Ibo, Kurani Design');
  return zeilen.join('\n');
}

module.exports = { baueKundenUpdate };
