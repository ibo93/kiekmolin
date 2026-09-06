'use strict';

// Was ist heute dran?
//
// Die Agentur-App kann inzwischen viel - und genau das ist das Problem.
// Alles ist da, aber verteilt: Wiedervorlagen in der Pipeline, Anfragen in
// einem Kasten, rote Ampeln in der Kundenliste, Rueckrufe woanders. Wer
// morgens den Rechner aufklappt, muss erst suchen, was zu tun ist - und
// uebersieht dabei zuverlaessig das Wichtigste.
//
// Dieses Modul bringt alles auf EINE Liste, sortiert nach Dringlichkeit.
// Es entscheidet nichts selbst und holt keine Daten: es bekommt sie
// uebergeben und ordnet sie. Deshalb laesst es sich ohne Netz, ohne
// Datenbank und ohne Schluessel pruefen.
//
// Zwei Grundsaetze:
//
//   1. WAS GELD KOSTET, WENN MAN ES LIEGEN LAESST, steht oben. Ein toter
//      Telefon-Retter schlaegt eine faellige Wiedervorlage, und die schlaegt
//      einen Monats-Report, der noch drei Wochen Zeit hat.
//
//   2. KEINE PFLICHT ERFINDEN. Ist nichts zu tun, steht da "nichts zu tun" -
//      und nicht eine Liste aus Beschaeftigungstherapie. Eine Liste, die
//      immer voll ist, liest nach zwei Wochen niemand mehr.

// Dringlichkeitsstufen, absteigend. Die Reihenfolge hier ist die
// Reihenfolge auf dem Bildschirm.
const STUFEN = ['jetzt', 'heute', 'diese-woche'];

function punkt(stufe, art, titel, text, sprung) {
  return { stufe, art, titel, text, sprung: sprung || null };
}

function mehrzahl(anzahl, eins, viele) {
  return anzahl + ' ' + (anzahl === 1 ? eins : viele);
}

// Baut die Liste. Alle Eingaben sind optional - fehlt eine Quelle (etwa
// weil die Datenbank gerade nicht erreichbar ist), faellt nur dieser eine
// Punkt weg, statt dass der ganze Tagesplan leer bleibt.
function baueTagesplan(daten, optionen) {
  const d = daten || {};
  const o = optionen || {};
  const heute = o.heute instanceof Date ? o.heute : new Date();
  const liste = [];

  // --- 1. Laeuft der Betrieb ueberhaupt? ------------------------------------
  // Ganz oben, weil hier waehrend des Wartens echte Anrufe verloren gehen.
  // Aber nur, wenn ueberhaupt jemand betreut wird - waehrend der Einrichtung
  // waere die Meldung nur Laerm.
  if (d.telefon && d.telefon.betreuteKunden > 0 && d.telefon.laeuft === false) {
    liste.push(punkt('jetzt', 'telefon-aus',
      'Der Telefon-Retter läuft nicht',
      'Solange er aus ist, geht bei ' + mehrzahl(d.telefon.betreuteKunden, 'Betrieb', 'Betrieben') +
      ' niemand ans Telefon. Starten: „Agentur starten" doppelklicken.',
      '#s-telefon'));
  }

  // --- 2. Anfragen: jemand hat sich SELBST gemeldet -------------------------
  // Wer von sich aus fragt, hat ein Problem, das gerade weh tut. Da zaehlen
  // Stunden, nicht Tage.
  const neueAnfragen = (d.anfragen || []).filter((a) => !a.stufe || a.stufe === 'neu');
  if (neueAnfragen.length) {
    liste.push(punkt('jetzt', 'anfrage',
      mehrzahl(neueAnfragen.length, 'neue Anfrage', 'neue Anfragen') + ' über die Check-Seite',
      neueAnfragen.slice(0, 3).map((a) => a.name || a.restaurant).filter(Boolean).join(', ') +
      ' – heute zurückrufen. Wer sich selbst meldet, springt sonst wieder ab.',
      '#s-pipeline'));
  }

  // --- 3. Offene Rueckrufe von Gaesten --------------------------------------
  // Die hat der Telefon-Retter aufgenommen, weil er nicht weiterwusste.
  // Dahinter steht ein Gast, der auf einen Rueckruf wartet.
  if (d.offeneRueckrufe > 0) {
    liste.push(punkt('jetzt', 'rueckruf',
      mehrzahl(d.offeneRueckrufe, 'offener Rückruf', 'offene Rückrufe'),
      'Gäste warten auf einen Rückruf – die Nummern stehen unter „Rückrufe".',
      '#s-rueckrufe'));
  }

  // --- 4. Kunden, bei denen die Zahlen einbrechen ---------------------------
  // Ein Kunde, der abrutscht, kuendigt in ein paar Wochen. Ihn heute
  // anzurufen ist billiger, als ihn zurueckzugewinnen.
  for (const k of (d.alarme || [])) {
    liste.push(punkt(k.stufe === 'alarm' ? 'jetzt' : 'heute', 'einbruch',
      k.name + ': Zahlen eingebrochen',
      (k.meldung || 'Die Werte dieser Woche liegen deutlich unter dem Schnitt.') +
      ' Anrufen, bevor er von selbst kündigt.',
      '#' + encodeURIComponent(k.id || '')));
  }

  for (const k of (d.roteAmpeln || [])) {
    liste.push(punkt('heute', 'rote-ampel',
      k.name + ': rote Ampel',
      'Seit längerem kein Report, keine Zahlen oder kein Kontakt. Sich melden, bevor er es tut.',
      '#' + encodeURIComponent(k.id || '')));
  }

  // --- 5. Wiedervorlagen: was ich selbst versprochen habe -------------------
  const faellige = (d.wiedervorlagen || []);
  if (faellige.length) {
    liste.push(punkt('heute', 'wiedervorlage',
      mehrzahl(faellige.length, 'fällige Wiedervorlage', 'fällige Wiedervorlagen'),
      faellige.slice(0, 3).map((w) => w.name).filter(Boolean).join(', ') +
      (faellige.length > 3 ? ' und ' + (faellige.length - 3) + ' weitere' : '') +
      ' – das hast du dir selbst vorgenommen.',
      '#s-pipeline'));
  }

  // --- 6. Monats-Reports ----------------------------------------------------
  // Die haben Zeit bis zum Monatsende, gehoeren aber auf den Schirm, damit
  // sie nicht am 31. alle auf einmal anstehen.
  const offeneReports = Math.max(0, (d.kunden || 0) - (d.reportsMonat || 0));
  if (offeneReports > 0) {
    const tagImMonat = heute.getDate();
    const letzterTag = new Date(heute.getFullYear(), heute.getMonth() + 1, 0).getDate();
    const knapp = letzterTag - tagImMonat <= 5;
    liste.push(punkt(knapp ? 'heute' : 'diese-woche', 'report',
      mehrzahl(offeneReports, 'Monats-Report', 'Monats-Reports') + ' offen',
      knapp
        ? 'Nur noch ' + (letzterTag - tagImMonat) + ' Tage im Monat. Jetzt erzeugen.'
        : 'Läuft am Monatsersten auch von selbst – aber wer vorher anruft, hat den besseren Aufhänger.',
      '#s-kunden'));
  }

  // --- 7. Neukunden-Arbeit --------------------------------------------------
  // Nur wenn nichts Dringenderes ansteht: sonst wird der Tagesplan zur
  // Wunschliste und man arbeitet ihn nicht mehr ab.
  const dringendes = liste.some((p) => p.stufe === 'jetzt' || p.stufe === 'heute');
  if (!dringendes && d.ungeprueft > 0) {
    liste.push(punkt('diese-woche', 'pruefen',
      mehrzahl(d.ungeprueft, 'ungeprüfter Betrieb', 'ungeprüfte Betriebe') + ' in der Pipeline',
      'Prüfen, dann anrufen – der Betriebs-Check liefert dir den ersten Satz.',
      '#s-pipeline'));
  }

  liste.sort((a, b) => STUFEN.indexOf(a.stufe) - STUFEN.indexOf(b.stufe));

  return {
    punkte: liste,
    zaehler: {
      jetzt: liste.filter((p) => p.stufe === 'jetzt').length,
      heute: liste.filter((p) => p.stufe === 'heute').length,
      woche: liste.filter((p) => p.stufe === 'diese-woche').length
    },
    satz: satzFuerDenTag(liste, heute)
  };
}

// Eine Zeile, die man im Vorbeigehen liest. Ehrlich auch dann, wenn
// wirklich nichts ansteht - das ist eine gute Nachricht und keine Luecke.
function satzFuerDenTag(liste, heute) {
  const wochentag = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][heute.getDay()];
  const jetzt = liste.filter((p) => p.stufe === 'jetzt').length;
  const spaeter = liste.length - jetzt;

  if (!liste.length) return 'Nichts liegt an. Guter ' + wochentag + ' – nutz ihn für Neukunden.';
  if (jetzt) {
    // Ganze Woerter statt angehaengter Endungen: "duldet" + "n" ergab
    // "duldetn". Solche Patzer stehen sonst gross auf dem Startbildschirm.
    return wochentag + ': ' + (jetzt === 1
      ? 'eine Sache, die keinen Aufschub duldet'
      : jetzt + ' Sachen, die keinen Aufschub dulden') +
      (spaeter ? ' – dazu ' + spaeter + ' weitere.' : '.');
  }
  return wochentag + ': nichts Dringendes, ' + mehrzahl(liste.length, 'Sache', 'Sachen') + ' auf der Liste.';
}

module.exports = { baueTagesplan, satzFuerDenTag, STUFEN };
