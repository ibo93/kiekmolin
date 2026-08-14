'use strict';

// Analyse: macht aus den Zahlen eines Monats eine Aussage.
//
// Ein Report voller Prozentzahlen beeindruckt niemanden. Der Wirt will drei
// Dinge wissen:
//   1. Was hat sich veraendert - und warum?
//   2. Was hat mir das gebracht (in Euro)?
//   3. Was mache ich als Naechstes - und was bringt das?
//
// Genau das rechnet dieses Modul aus den vorhandenen Daten aus. Es ist
// reine Auswertung: kein Netz, kein KI-Aufruf, jede Aussage laesst sich
// auf eine Zahl im Report zurueckfuehren.
//
// EHRLICHKEIT ist hier keine Floskel, sondern die Bauvorschrift: Wo Daten
// fehlen, steht das da. Wir behaupten nie eine Wirkung, die wir nicht
// belegen koennen - der Wirt merkt Schoenrederei sofort, und dann ist das
// Vertrauen weg.

function euro(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' €';
}

function zahl(n) {
  return Number(n || 0).toLocaleString('de-DE');
}

// --- 1. Die Kernaussage: EIN Satz, der oben im Report steht ---------------
// Reihenfolge nach Wichtigkeit fuer den Wirt: erst Geld, dann Sichtbarkeit.
function kernaussage({ quote, vormonatQuote, telefon, herkunft, monatLabel }) {
  const t = telefon || {};
  const vorgaenge = (t.reservierungen || 0) + (t.bestellungen || 0);

  if (vorgaenge > 0 && t.gesamtGeschaetzt > 0) {
    const satz = 'Im ' + monatLabel + ' hat der Telefon-Retter ' + zahl(vorgaenge) +
      (vorgaenge === 1 ? ' Vorgang' : ' Vorgänge') + ' angenommen – geschätzter Umsatz daraus: ' +
      euro(t.gesamtGeschaetzt) + '.';
    return t.rueckrufe
      ? satz + ' Dazu ' + zahl(t.rueckrufe) + (t.rueckrufe === 1 ? ' Rückruf-Wunsch' : ' Rückruf-Wünsche') +
        ' – Anrufe, die sonst niemand entgegengenommen hätte.'
      : satz;
  }
  if (herkunft && herkunft.vorgaengeUnser > 0) {
    return 'Im ' + monatLabel + ' kamen ' + zahl(herkunft.vorgaengeUnser) + ' von ' +
      zahl(herkunft.vorgaengeGesamt) + ' Vorgängen über unsere Kanäle – das sind ' +
      herkunft.anteilProzent + ' % und rund ' + euro(herkunft.umsatzUnser) + '.';
  }
  if (quote && quote.prozent != null && vormonatQuote != null && quote.prozent !== vormonatQuote) {
    const rauf = quote.prozent > vormonatQuote;
    return 'Die Sichtbarkeit ist von ' + vormonatQuote + ' % auf ' + quote.prozent + ' % ' +
      (rauf ? 'gestiegen' : 'gefallen') + ' – bei ' + quote.getestet + ' automatisch getesteten Suchfragen.';
  }
  if (quote && quote.prozent != null) {
    return 'Der Betrieb wird bei ' + quote.gefunden + ' von ' + quote.getestet +
      ' getesteten Suchfragen gefunden (' + quote.prozent + ' %). Das ist der Ausgangspunkt für die kommenden Monate.';
  }
  return 'Für den ' + monatLabel + ' liegen noch zu wenige Daten für eine belastbare Aussage vor.';
}

// --- 2. Treiber: WAS hat sich veraendert - mit Beleg ----------------------
function treiber({ ergebnis, vormonat, quote, vormonatQuote }) {
  const liste = [];
  const fragen = (ergebnis && ergebnis.fragen) || [];
  const vorFragen = (vormonat && vormonat.ergebnis && vormonat.ergebnis.fragen) || [];
  const vorher = (id) => vorFragen.find((v) => v.id === id) || null;

  const neuGefunden = [];
  const verloren = [];
  for (const f of fragen) {
    const v = vorher(f.id);
    if (!v) continue;
    for (const seite of ['google', 'ki']) {
      const a = (v[seite] || {}).status;
      const b = (f[seite] || {}).status;
      if (a === 'nicht-gefunden' && b === 'gefunden') neuGefunden.push(f.frage);
      if (a === 'gefunden' && b === 'nicht-gefunden') verloren.push(f.frage);
    }
  }
  if (neuGefunden.length) {
    liste.push({
      richtung: 'gut',
      text: 'Neu sichtbar bei ' + neuGefunden.length + ' Test' + (neuGefunden.length === 1 ? '' : 's') +
        ': „' + neuGefunden.slice(0, 2).join('“, „') + '“' + (neuGefunden.length > 2 ? ' u. a.' : '') + '.'
    });
  }
  if (verloren.length) {
    liste.push({
      richtung: 'schlecht',
      text: 'Sichtbarkeit verloren bei ' + verloren.length + ' Test' + (verloren.length === 1 ? '' : 's') +
        ': „' + verloren.slice(0, 2).join('“, „') + '“' + (verloren.length > 2 ? ' u. a.' : '') + '.'
    });
  }

  // Google-Platzierungen: echte Plaetze sind der handfesteste Beleg
  let besser = 0;
  let schlechter = 0;
  for (const f of fragen) {
    const jetzt = (f.google || {}).platz;
    const v = vorher(f.id);
    const alt = v && (v.google || {}).platz;
    if (!jetzt || !alt) continue;
    if (jetzt < alt) besser++;
    else if (jetzt > alt) schlechter++;
  }
  if (besser) liste.push({ richtung: 'gut', text: 'Bei ' + besser + ' Suchfrage(n) auf Google nach vorn gerückt.' });
  if (schlechter) liste.push({ richtung: 'schlecht', text: 'Bei ' + schlechter + ' Suchfrage(n) auf Google zurückgefallen – dort schauen wir zuerst hin.' });

  if (!liste.length) {
    liste.push(vormonatQuote == null
      ? { richtung: 'neutral', text: 'Erster Report – ab dem nächsten Monat steht hier, was sich verändert hat.' }
      : { richtung: 'neutral', text: 'Keine nennenswerten Verschiebungen gegenüber dem Vormonat – die Lage ist stabil.' });
  }
  return liste;
}

// --- 3. Chancen: was zu tun ist, sortiert nach Wirkung --------------------
// wirkung: 1-3 (3 = am meisten Umsatz), aufwand als Klartext.
function chancen({ ergebnis, telefon, doktor, rueckgewinnung, herkunft }) {
  const liste = [];
  const b = (ergebnis && ergebnis.basis) || {};
  const fragen = (ergebnis && ergebnis.fragen) || [];

  if (b.kiekmolin && b.kiekmolin.status !== 'gefunden') {
    liste.push({
      titel: 'Profil auf kiekmolin.de sichtbar machen',
      warum: 'Der Betrieb ist dort aktuell nicht auffindbar. Das ist die Grundlage – ohne sie wirkt alles andere nur halb.',
      wirkung: 3, aufwand: '15 Minuten'
    });
  }
  if (b.website && (b.website.status === 'manuell' || b.website.status === 'fehler')) {
    liste.push({
      titel: 'Eigene Seite hinterlegen bzw. reparieren',
      warum: 'KI-Assistenten lesen bevorzugt eigene Seiten. Ohne erreichbare Website fehlt die wichtigste Quelle.',
      wirkung: 3, aufwand: '1 Stunde'
    });
  }

  // Speisekarten-Befunde: die einzigen Punkte mit echtem Euro-Betrag
  for (const bef of (doktor && doktor.befunde) || []) {
    if (bef.typ === 'zu-wenig-daten') continue;
    liste.push({
      titel: bef.typ === 'unterpreis' ? 'Preis anpassen: ' + bef.gericht
        : bef.typ === 'versteckter-bestseller' ? 'Karte umsortieren: ' + bef.gericht
          : bef.typ === 'ladenhueter' ? 'Tote Gerichte von der Karte nehmen'
            : bef.typ === 'ohne-beschreibung' ? 'Beschreibungen ergänzen'
              : 'Karte kürzen',
      warum: bef.text + ' ' + bef.empfehlung,
      wirkung: bef.prio === 'hoch' ? 3 : 2,
      aufwand: bef.aufwand,
      euro: bef.potenzial || 0
    });
  }

  if (rueckgewinnung && rueckgewinnung.anzahl > 0) {
    liste.push({
      titel: zahl(rueckgewinnung.anzahl) + ' frühere Gäste zurückholen',
      warum: 'Diese Gäste waren schon da und länger nicht mehr. Eine persönliche Nachricht kostet nichts – ein neuer Gast kostet Werbung.',
      wirkung: 3, aufwand: '30 Minuten', euro: rueckgewinnung.potenzial || 0
    });
  }

  const googleFehlt = fragen.filter((f) => (f.google || {}).status === 'nicht-gefunden').length;
  if (googleFehlt) {
    liste.push({
      titel: 'Google-Profil auffüllen (Fotos, Beiträge, Kategorien)',
      warum: 'Bei ' + googleFehlt + ' von ' + fragen.length + ' Suchfragen noch nicht in den Top 10. Genau dort suchen Gäste zuerst.',
      wirkung: 2, aufwand: '20 Minuten im Monat'
    });
  }
  const kiFehlt = fragen.filter((f) => (f.ki || {}).status === 'nicht-gefunden').length;
  if (kiFehlt) {
    liste.push({
      titel: 'Texte maschinenlesbar machen',
      warum: 'Bei ' + kiFehlt + ' KI-Frage(n) wird der Betrieb nicht genannt. Beschreibung, Speisekarte als Text und Schema.org ändern das.',
      wirkung: 2, aufwand: '1 Stunde einmalig'
    });
  }
  if (telefon && telefon.rueckrufe > 0) {
    liste.push({
      titel: zahl(telefon.rueckrufe) + (telefon.rueckrufe === 1 ? ' Rückruf-Wunsch' : ' Rückruf-Wünsche') + ' abarbeiten',
      warum: 'Diese Gäste wollten etwas und haben ihre Nummer hinterlassen. Wer schnell zurückruft, bekommt den Tisch.',
      wirkung: 3, aufwand: '5 Minuten pro Anruf'
    });
  }
  if (herkunft && herkunft.vorgaengeGesamt > 0 && herkunft.anteilProzent < 30) {
    liste.push({
      titel: 'Mehr Gäste auf den Online-Weg bringen',
      warum: 'Nur ' + herkunft.anteilProzent + ' % der Vorgänge laufen über die gemessenen Kanäle. Ein Hinweis auf der Rechnung und in der Telefon-Ansage verschiebt das spürbar.',
      wirkung: 2, aufwand: '15 Minuten'
    });
  }

  // Wirkung zuerst, bei Gleichstand der groessere Euro-Betrag
  liste.sort((a, x) => (x.wirkung - a.wirkung) || ((x.euro || 0) - (a.euro || 0)));
  return liste;
}

// --- 4. Risiken: was gerade weh tut oder bald weh tut ---------------------
function risiken({ fruehwarnung, quote, vormonatQuote, radarZeilen }) {
  const liste = [];
  if (fruehwarnung && (fruehwarnung.stufe === 'alarm' || fruehwarnung.stufe === 'warnung')) {
    for (const m of fruehwarnung.meldungen || []) liste.push({ stufe: fruehwarnung.stufe, text: m.text });
  }
  if (quote && quote.prozent != null && vormonatQuote != null && quote.prozent < vormonatQuote - 5) {
    liste.push({
      stufe: 'warnung',
      text: 'Die Sichtbarkeits-Quote ist von ' + vormonatQuote + ' % auf ' + quote.prozent + ' % gefallen.'
    });
  }
  const ueberholt = (radarZeilen || []).filter((z) => z.platzTrend != null && z.platzTrend < 0).length;
  if (ueberholt) {
    liste.push({ stufe: 'warnung', text: 'Bei ' + ueberholt + ' Suchfrage(n) sind andere Betriebe vorbeigezogen.' });
  }
  return liste;
}

// --- 5. Alles zusammen ----------------------------------------------------
function baueAnalyse(daten) {
  const d = daten || {};
  const k = kernaussage(d);
  const t = treiber(d);
  const c = chancen(d);
  const r = risiken(d);

  // Gesamtbild: Risiken schlagen gute Nachrichten - lieber warnen als loben.
  const bewertung = r.some((x) => x.stufe === 'alarm') ? 'alarm'
    : r.length ? 'achtung'
      : t.some((x) => x.richtung === 'gut') ? 'gut' : 'stabil';

  const euroSumme = c.reduce((s, x) => s + (x.euro || 0), 0);
  return {
    kernaussage: k,
    treiber: t,
    chancen: c,
    risiken: r,
    bewertung,
    euroPotenzial: Math.round(euroSumme * 100) / 100,
    // Die drei wichtigsten Punkte - mehr merkt sich niemand aus einem Report.
    topDrei: c.slice(0, 3)
  };
}

module.exports = { baueAnalyse, kernaussage, treiber, chancen, risiken };
