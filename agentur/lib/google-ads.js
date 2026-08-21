'use strict';

// Google-Ads-Baukasten: aus den Daten eines Kunden entsteht eine fertige
// Suchkampagne, die Gaeste auf seine Seite bei kiek-mol-in bringt.
//
// Warum in der Agentur-App: Name, Stadt, Kueche und Speisekarte liegen hier
// ohnehin. Daraus lassen sich Keywords, Anzeigengruppen und Anzeigentexte
// ableiten, ohne dass jemand sie abtippt - und ohne die typischen Fehler,
// an denen selbstgebaute Kampagnen scheitern.
//
// Zwei Regeln, die dieser Baukasten hart durchsetzt:
//
//   1. ZEICHENGRENZEN. Google nimmt Ueberschriften bis 30 und Beschreibungen
//      bis 90 Zeichen - laengere lehnt es ab. Deutsche Woerter sind lang,
//      "Griechisches Restaurant Neuharlingersiel" hat 40. Alles, was zu lang
//      ist, fliegt hier raus, statt spaeter in Google als Fehler aufzuschlagen.
//
//   2. KEINE ERFUNDENEN VERSPRECHEN. Rabatte, Lieferzeiten oder Bewertungen
//      werden NUR eingebaut, wenn sie als Tatsache uebergeben werden. Eine
//      Anzeige, die "20% Rabatt" verspricht, obwohl es keinen gibt, kostet
//      Geld, aergert Gaeste und faellt auf den Wirt zurueck.

const { erkenneKategorie } = require('../../sichtbarkeit/lib/fragen');

const MAX_UEBERSCHRIFT = 30;
const MAX_BESCHREIBUNG = 90;

// Kurzformen fuer Anzeigentexte. "Griechisches Restaurant" sprengt jede
// Ueberschrift, sobald noch ein Ortsname dazukommt.
const KURZ = {
  'Pizzeria': 'Pizzeria',
  'Döner-Imbiss': 'Döner',
  'Fischrestaurant': 'Fisch',
  'Griechisches Restaurant': 'Grieche',
  'Café': 'Café',
  'Asiatisches Restaurant': 'Asiate',
  'Restaurant': 'Restaurant'
};

function kurzKategorie(label) {
  return KURZ[label] || 'Restaurant';
}

// Viele Betriebe tragen den Ort schon im Namen ("La Piazza Emden"). Dann
// waere "la piazza emden emden" ein Keyword, das niemand tippt - und
// "La Piazza Emden · Emden" eine Ueberschrift, die dumm aussieht.
function nameEnthaeltStadt(name, stadt) {
  const n = String(name || '').toLowerCase();
  const s = String(stadt || '').toLowerCase().trim();
  return !!s && n.includes(s);
}

// ---------------------------------------------------------- Keyword-Bau ----
// Google-Schreibweise: [exakt] und "wortgruppe". So kann man die Liste
// unveraendert in Google Ads einfuegen.
function formatiere(keyword, matchType) {
  const k = String(keyword || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (matchType === 'Exact') return '[' + k + ']';
  if (matchType === 'Phrase') return '"' + k + '"';
  return k;
}

function kw(text, matchType, intent, begruendung, wettbewerb) {
  return {
    keyword: formatiere(text, matchType), roh: String(text).toLowerCase().trim(),
    matchType, intent, begruendung, wettbewerb
  };
}

// Diese Suchbegriffe kosten Geld und bringen nie eine Bestellung.
// Sie werden gar nicht erst gebucht und stehen spaeter als "aussortiert"
// mit Begruendung in der Uebersicht - damit nachvollziehbar ist, warum.
//
// Achtung bei den Mustern: deutsche Woerter stecken ineinander. "beSTELLEn"
// enthaelt "stelle", "hergeSTELLT" auch - ein Filter auf "stelle" wuerde das
// wertvollste Keyword ueberhaupt wegwerfen. Deshalb stehen bei allen Woertern,
// die in anderen Woertern vorkommen koennen, Wortgrenzen (\b).
const AUSSORTIEREN = [
  { muster: /\brezepte?\b|selber machen|selbst machen|nachkochen|\bzubereiten\b/, grund: 'Sucht ein Rezept, will nicht bestellen' },
  { muster: /\bkalorien\b|\bnaehrwerte?\b|\bnährwerte?\b|\bzutaten\b/, grund: 'Reine Info-Suche, keine Kaufabsicht' },
  { muster: /\bjobs?\b|\bstellen?\b|stellenangebot|stellenanzeige|\bbewerbung\b|\bausbildung\b|\baushilfe\b|\bminijob\b/, grund: 'Sucht Arbeit, nicht Essen' },
  { muster: /\beroeffnen\b|\beröffnen\b|\bfranchise\b|\bgruenden\b|\bgründen\b|businessplan/, grund: 'Will selbst gruenden, ist kein Gast' },
  { muster: /\bkostenlos\b|\bgratis\b|\bumsonst\b/, grund: 'Sucht etwas geschenkt' },
  { muster: /wikipedia|\bgeschichte\b|\bherkunft\b|\bbedeutung\b|\bwas ist\b/, grund: 'Lexikon-Suche' },
  { muster: /\bgebraucht\b|kaufen ebay|\bausstattung\b|kuechengeraet|küchengerät/, grund: 'Sucht Ausstattung, kein Essen' }
];

function pruefeAussortieren(text) {
  const t = String(text || '').toLowerCase();
  for (const a of AUSSORTIEREN) if (a.muster.test(t)) return a.grund;
  return null;
}

// Baut die Keywords eines Kunden. Was er nicht anbietet, wird auch nicht
// gebucht: ohne Speisekarte keine Bestell-Keywords, ohne Reservierung keine
// Reservierungs-Keywords. Sonst zahlt man fuer Klicks auf ein Versprechen,
// das die Seite nicht einloest - der teuerste Fehler ueberhaupt.
function baueKeywords(restaurant, koennen) {
  const r = restaurant || {};
  const k = koennen || {};
  const stadt = String(r.city || '').trim();
  const name = String(r.name || '').trim();
  const kat = erkenneKategorie(r);
  const label = kat.label.toLowerCase();
  const gericht = String(kat.gericht || '').toLowerCase();
  const gruppen = [];

  // 1. Der eigene Name. Das billigste und beste Keyword ueberhaupt: wer den
  //    Betrieb namentlich sucht, will genau dorthin. Exact, damit die Kosten
  //    nicht in fremde Namensvarianten laufen.
  if (name) {
    const marke = [
      kw(name, 'Exact', 'transaktional', 'Namenssuche: hoechste Kaufabsicht, niedrigster Klickpreis. Gehoert immer gebucht - sonst kaufen Portale den Namen weg.', 'niedrig'),
      kw(name + ' speisekarte', 'Phrase', 'transaktional', 'Wer die Karte sucht, ist kurz vor der Bestellung. Phrase, weil Zusaetze wie "aktuell" oder "preise" dazukommen.', 'niedrig')
    ];
    // Nur sinnvoll, wenn der Ort nicht ohnehin im Namen steckt.
    if (stadt && !nameEnthaeltStadt(name, stadt)) {
      marke.splice(1, 0, kw(name + ' ' + stadt, 'Exact', 'transaktional',
        'Name plus Ort - so tippen Ortsfremde und Urlauber.', 'niedrig'));
    }
    if (k.bestellung) marke.push(kw(name + ' bestellen', 'Exact', 'transaktional', 'Name plus Bestellabsicht: das staerkste Signal, das es gibt.', 'niedrig'));
    gruppen.push({ name: 'Marke · ' + name, ausrichtung: 'Kontrolle', keywords: marke });
  }

  // 2. Bestellen. Nur wenn eine Speisekarte hinterlegt ist.
  if (k.bestellung && stadt) {
    gruppen.push({
      name: 'Bestellen · ' + kat.label + ' ' + stadt,
      ausrichtung: 'Kontrolle',
      keywords: [
        kw(gericht + ' bestellen ' + stadt, 'Exact', 'transaktional', 'Money-Keyword: Gericht, Absicht und Ort in einer Suche. Exact, weil hier das meiste Budget hin soll.', 'hoch'),
        kw(gericht + ' ' + stadt + ' bestellen', 'Exact', 'transaktional', 'Gleiche Absicht, andere Wortstellung. Google behandelt das nicht immer gleich, deshalb beide.', 'hoch'),
        kw(gericht + ' bestellen', 'Phrase', 'transaktional', 'Phrase faengt die Varianten ab ("online", "heute", Stadtteile), ohne die Kontrolle zu verlieren. Ortsbezug macht die Standort-Einstellung.', 'hoch'),
        kw(label + ' bestellen ' + stadt, 'Phrase', 'transaktional', 'Kategorie statt Gericht - etwas breiter, gleiche Absicht.', 'mittel'),
        kw('essen bestellen ' + stadt, 'Phrase', 'transaktional', 'Wer noch nicht weiss, was er will, aber bestellen moechte. Phrase wegen der vielen Varianten.', 'hoch'),
        kw('lieferservice ' + stadt, 'Exact', 'transaktional', 'Klassiker mit hohem Volumen. Exact, um die Kosten eng zu halten.', 'hoch'),
        kw('essen liefern lassen ' + stadt, 'Phrase', 'transaktional', 'Long-Tail mit klarer Absicht, aber kleinem Volumen - Phrase holt hier die Reichweite.', 'mittel')
      ]
    });
  }

  // 3. Reservieren. Nur wenn Tische hinterlegt sind.
  if (k.reservierung && stadt) {
    gruppen.push({
      name: 'Reservieren · ' + stadt,
      ausrichtung: 'Kontrolle',
      keywords: [
        kw('tisch reservieren ' + stadt, 'Exact', 'transaktional', 'Eindeutige Handlungsabsicht. Exact, weil das direkt zur Buchung fuehrt.', 'mittel'),
        kw('restaurant reservieren ' + stadt, 'Exact', 'transaktional', 'Gleiche Absicht, anderer Wortlaut.', 'mittel'),
        kw(label + ' reservieren ' + stadt, 'Phrase', 'transaktional', 'Kategorie plus Absicht; Phrase faengt "online", "heute abend", "fuer 4 personen" mit ab.', 'niedrig'),
        kw('tisch buchen ' + stadt, 'Phrase', 'transaktional', 'Kleineres Volumen, gleiche Absicht - Phrase lohnt hier mehr als Exact.', 'niedrig')
      ]
    });
  }

  // 4. Auswahl und Vergleich. Kommerziell, nicht transaktional: der Gast
  //    weiss, dass er essen will, aber noch nicht wo. Bewusst als Phrase -
  //    Exact wuerde hier zu viel Reichweite kosten, Broad zu viel Geld.
  if (stadt) {
    gruppen.push({
      name: 'Auswahl · ' + kat.label + ' ' + stadt,
      ausrichtung: 'Reichweite',
      keywords: [
        kw(label + ' ' + stadt, 'Exact', 'kommerziell', 'Der Suchbegriff der Stadt schlechthin. Exact, weil Volumen und Wettbewerb hoch sind und die Kosten sonst weglaufen.', 'hoch'),
        kw(label + ' ' + stadt, 'Phrase', 'kommerziell', 'Zusaetzlich als Phrase mit NIEDRIGEREM Gebot: faengt "beste", "guenstig", Stadtteile und Umlandorte mit ab. Exact gewinnt bei identischer Suche immer, deshalb stoeren sich die beiden nicht.', 'hoch'),
        kw('beste ' + label + ' ' + stadt, 'Phrase', 'kommerziell', 'Vergleichssuche kurz vor der Entscheidung. Phrase wegen der vielen Formulierungen.', 'mittel'),
        kw(label + ' in der naehe', 'Phrase', 'kommerziell', 'Unterwegs-Suche vom Handy. Der Ortsbezug kommt hier ueber die Standort-Einstellung, nicht ueber das Keyword.', 'hoch'),
        kw('wo essen in ' + stadt, 'Phrase', 'kommerziell', 'Unentschlossen, aber hungrig - gut fuer Urlauberorte.', 'mittel')
      ]
    });
  }

  return gruppen;
}

// ------------------------------------------------------ Negative Keywords --
// Ebene ist wichtig: Was fuer die ganze Kampagne gilt, gehoert auf
// Kampagnen-Ebene. Was nur eine Gruppe stoeren wuerde, bleibt lokal.
function negativeKeywords(restaurant, koennen) {
  const k = koennen || {};
  const liste = [
    { keyword: '"rezept"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Sucht ein Rezept zum Nachkochen, nicht zum Bestellen.' },
    { keyword: '"selber machen"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Will selbst kochen.' },
    { keyword: '"kostenlos"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Sucht etwas geschenkt.' },
    { keyword: '"gratis"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Wie oben.' },
    { keyword: '"job"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Sucht Arbeit. Kostet sonst regelmaessig Klicks.' },
    { keyword: '"stellenangebot"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Wie oben.' },
    { keyword: '"ausbildung"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Wie oben.' },
    { keyword: '"minijob"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Wie oben.' },
    { keyword: '"eröffnen"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Will selbst gruenden, ist kein Gast.' },
    { keyword: '"franchise"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Wie oben.' },
    { keyword: '"kalorien"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Reine Info-Suche.' },
    { keyword: '"gebraucht"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Sucht Ausstattung, kein Essen.' },
    { keyword: '[speisekarte pdf]', matchType: 'Exact', ebene: 'Kampagne', grund: 'Will nur ein PDF herunterladen.' }
  ];
  // Nur ausschliessen, was der Betrieb wirklich nicht anbietet - sonst
  // verschenkt man Gaeste.
  if (!k.bestellung) {
    liste.push({ keyword: '"bestellen"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Dieser Betrieb hat keine Online-Bestellung hinterlegt. Klicks darauf laufen ins Leere.' });
    liste.push({ keyword: '"lieferservice"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Wie oben.' });
  }
  if (!k.reservierung) {
    liste.push({ keyword: '"reservieren"', matchType: 'Phrase', ebene: 'Kampagne', grund: 'Keine Online-Reservierung hinterlegt.' });
  }
  // In der Auswahl-Gruppe stoeren Namenssuchen nach Wettbewerbern nicht -
  // aber die eigene Marke gehoert dort raus, damit sie in ihrer eigenen
  // Gruppe zum niedrigen Klickpreis laeuft.
  if (restaurant && restaurant.name) {
    liste.push({
      keyword: '"' + String(restaurant.name).toLowerCase() + '"',
      matchType: 'Phrase', ebene: 'Anzeigengruppe: Auswahl',
      grund: 'Markensuchen sollen in der Marken-Gruppe landen, nicht hier - dort kosten sie einen Bruchteil.'
    });
  }
  return liste;
}

// -------------------------------------------------------- Anzeigentexte ----
// Kandidaten bauen, dann alles wegwerfen, was zu lang ist. Lieber weniger
// Ueberschriften als eine, die Google ablehnt.
function kuerzeste(kandidaten, grenze, anzahl) {
  const gesehen = new Set();
  const gut = [];
  for (const t of kandidaten) {
    const text = String(t || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > grenze) continue;
    const schluessel = text.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    gut.push(text);
    if (gut.length >= anzahl) break;
  }
  return gut;
}

// Baut eine responsive Suchanzeige. "versprechen" enthaelt NUR Dinge, die
// tatsaechlich stimmen - der Aufrufer muss sie ausdruecklich setzen.
function baueRsa(restaurant, koennen, optionen) {
  const r = restaurant || {};
  const k = koennen || {};
  const o = optionen || {};
  const v = o.versprechen || {};
  const stadt = String(r.city || '').trim();
  const name = String(r.name || '').trim();
  const kat = erkenneKategorie(r);
  const kurz = kurzKategorie(kat.label);
  const gericht = kat.gericht || 'Essen';

  const ueberschriften = [];
  // Zuerst das, was am staerksten zieht: Name, Ort, Handlung.
  if (name) {
    ueberschriften.push(name);
    if (stadt && !nameEnthaeltStadt(name, stadt)) ueberschriften.push(name + ' · ' + stadt);
  }
  // Echte Kaufausloeser kommen direkt danach - ein tatsaechlicher Rabatt
  // schlaegt jeden Standardsatz. Sie stehen bewusst VOR den allgemeinen
  // Texten, sonst fallen sie aus den zehn Ueberschriften heraus.
  // Nur echte Versprechen: ohne Beleg kein Wort davon.
  if (v.rabattText) ueberschriften.push(String(v.rabattText));
  if (v.lieferzeitText) ueberschriften.push(String(v.lieferzeitText));
  if (v.bewertungText) ueberschriften.push(String(v.bewertungText));
  if (stadt) {
    ueberschriften.push(kurz + ' in ' + stadt, gericht + ' in ' + stadt);
    if (k.bestellung) ueberschriften.push(gericht + ' bestellen in ' + stadt, 'Bestellen in ' + stadt);
    if (k.reservierung) ueberschriften.push('Tisch in ' + stadt + ' buchen', 'Reservieren in ' + stadt);
  }
  if (k.bestellung) ueberschriften.push('Jetzt online bestellen', 'Direkt beim Wirt bestellen', 'In 2 Minuten bestellt');
  if (k.reservierung) ueberschriften.push('Tisch online reservieren', 'Jetzt Tisch sichern');
  // Diese Aussagen stimmen fuer jeden Betrieb auf der Plattform.
  ueberschriften.push('Ohne Portal-Provision', 'Original-Speisekarte', 'Direkt beim Wirt', 'Aus deiner Region');
  if (o.gerichte && o.gerichte.length) {
    for (const g of o.gerichte.slice(0, 3)) ueberschriften.push(String(g).slice(0, MAX_UEBERSCHRIFT));
  }
  // Auffuellen, falls Ortsnamen zu lang waren. Diese Saetze sind bewusst
  // neutral: sie duerfen auch bei einem Betrieb ohne Bestellung und ohne
  // Reservierung stehen, ohne etwas zu versprechen, das die Seite nicht kann.
  if (k.bestellung) ueberschriften.push('Hier bestellen');
  if (k.reservierung) ueberschriften.push('Hier reservieren');
  ueberschriften.push('Zur Speisekarte', 'Jetzt ansehen', 'Frisch zubereitet',
    'Lecker essen gehen', 'Karte und Preise', 'Gleich reinschauen');

  const beschreibungen = [];
  if (k.bestellung) {
    beschreibungen.push('Speisekarte ansehen und in zwei Minuten bestellen – direkt beim Wirt, ohne Umweg.');
  }
  if (k.reservierung) {
    beschreibungen.push('Tisch online reservieren, jederzeit – auch wenn im Lokal gerade niemand ans Telefon kann.');
  }
  if (name && stadt) {
    beschreibungen.push(name + ' in ' + stadt + ': echte Karte, echte Preise, direkt vom Betrieb.');
  }
  // "Bestell dort, wo..." darf nur stehen, wenn man dort auch bestellen kann.
  if (k.bestellung) {
    beschreibungen.push('Bestell dort, wo das Geld in der Region bleibt – ohne hohe Portal-Provision.');
  }
  // Diese beiden stimmen fuer jeden Betrieb auf der Plattform.
  beschreibungen.push(
    'Die vollständige Speisekarte mit aktuellen Preisen. Kein PDF, kein Zoomen.',
    'Alle Gerichte auf einen Blick. Direkt vom Betrieb, nicht über ein Portal.',
    'Die Karte kommt vom Wirt selbst – aktuell, vollständig und ohne Zwischenhändler.'
  );
  if (v.rabattSatz) beschreibungen.push(String(v.rabattSatz));

  return {
    ueberschriften: kuerzeste(ueberschriften, MAX_UEBERSCHRIFT, 10),
    beschreibungen: kuerzeste(beschreibungen, MAX_BESCHREIBUNG, 4),
    zielUrl: o.zielUrl || ((process.env.KIEKMOLIN_URL || 'https://kiekmolin.de') + '/' + (r.slug || '')),
    pfad1: kurz.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15),
    pfad2: stadt.toLowerCase().replace(/[^a-z0-9äöüß]/g, '').slice(0, 15)
  };
}

// Pruefung fuer die Anzeige in der App: Was ist zu lang, was fehlt?
// Google verlangt mindestens 3 Ueberschriften und 2 Beschreibungen.
function pruefeRsa(rsa) {
  const fehler = [];
  const a = (rsa && rsa.ueberschriften) || [];
  const b = (rsa && rsa.beschreibungen) || [];
  a.forEach((t) => { if (t.length > MAX_UEBERSCHRIFT) fehler.push('Überschrift zu lang (' + t.length + '): ' + t); });
  b.forEach((t) => { if (t.length > MAX_BESCHREIBUNG) fehler.push('Beschreibung zu lang (' + t.length + '): ' + t); });
  if (a.length < 3) fehler.push('Zu wenige Überschriften (' + a.length + ', Google verlangt mindestens 3).');
  if (b.length < 2) fehler.push('Zu wenige Beschreibungen (' + b.length + ', Google verlangt mindestens 2).');
  return fehler;
}

// -------------------------------------------------------- Gesamtkampagne ---
function baueKampagne(restaurant, koennen, optionen) {
  const r = restaurant || {};
  const k = koennen || {};
  const o = optionen || {};
  const kat = erkenneKategorie(r);
  const gruppen = baueKeywords(r, k);
  const rsa = baueRsa(r, k, o);

  // Jede Gruppe bekommt ihre eigene Anzeige - der Text soll zum Keyword
  // passen, sonst sinkt die Qualitaet und der Klick wird teurer.
  const mitAnzeige = gruppen.map((g) => {
    const exact = g.keywords.filter((x) => x.matchType === 'Exact').length;
    const phrase = g.keywords.filter((x) => x.matchType === 'Phrase').length;
    return Object.assign({}, g, {
      anzeige: rsa,
      verteilung: { exact, phrase, gesamt: g.keywords.length },
      verteilungText: exact + '× Exact / ' + phrase + '× Phrase – ' +
        (exact >= phrase ? 'auf Kontrolle ausgelegt' : 'auf Reichweite ausgelegt')
    });
  });

  return {
    kampagne: 'Kiek mol in · ' + (r.name || 'Betrieb') + ' · ' + (r.city || ''),
    kategorie: kat.label,
    gruppen: mitAnzeige,
    negative: negativeKeywords(r, k),
    aussortiert: AUSSORTIEREN.map((a) => ({ muster: String(a.muster).replace(/^\/|\/$/g, ''), grund: a.grund })),
    pruefung: pruefeRsa(rsa),
    empfehlung: budgetEmpfehlung(mitAnzeige, k, o)
  };
}

// ------------------------------------------------------ Gebote und Budget --
// Bewusst zurueckhaltend: Ziel-ROAS braucht Conversion-Historie. Wer ihn zu
// frueh einschaltet, bekommt eine Automatik, die auf zu wenig Daten raet.
function budgetEmpfehlung(gruppen, koennen, optionen) {
  const o = optionen || {};
  const start = [];
  start.push({
    schritt: 'Woche 1–3',
    strategie: 'Klicks maximieren mit Klickpreis-Obergrenze (0,60 € vorschlagen)',
    grund: 'Am Anfang fehlen Conversion-Daten. Automatiken raten dann - die Obergrenze verhindert, dass ein einzelner Klick 3 € kostet.'
  });
  start.push({
    schritt: 'ab ca. 15 Conversions im Monat',
    strategie: 'Conversions maximieren',
    grund: 'Erst ab dieser Menge hat die Automatik genug Daten, um besser zu sein als ein festes Gebot.'
  });
  start.push({
    schritt: 'ab ca. 30 Conversions im Monat und stabilem Bestellwert',
    strategie: 'Ziel-ROAS',
    grund: 'Vorher schwankt der ROAS so stark, dass das Ziel die Kampagne ausbremst statt sie zu steuern.'
  });

  const rang = [];
  for (const g of gruppen) {
    if (/^Marke/.test(g.name)) rang.push({ gruppe: g.name, anteil: 'klein, aber immer an', grund: 'Billigste Klicks und beste Abschlussquote. Braucht wenig Budget, darf aber nie aus sein - sonst kauft ein Portal den Namen.' });
    else if (/^Bestellen/.test(g.name)) rang.push({ gruppe: g.name, anteil: 'grösster Anteil', grund: 'Hier steckt die direkte Kaufabsicht - das ist die Gruppe, die Umsatz macht.' });
    else if (/^Reservieren/.test(g.name)) rang.push({ gruppe: g.name, anteil: 'mittel', grund: 'Klare Absicht, aber weniger Volumen als Bestellungen.' });
    else rang.push({ gruppe: g.name, anteil: 'klein, zum Testen', grund: 'Vergleichssuchen sind teurer und schliessen seltener ab. Erst hochdrehen, wenn die Zahlen es hergeben.' });
  }

  const hoechstesGebot = [];
  for (const g of gruppen) {
    for (const x of g.keywords) {
      if (x.matchType === 'Exact' && /bestellen|lieferservice|reservieren/.test(x.roh)) hoechstesGebot.push(x.keyword);
    }
  }

  return {
    tagesbudget: o.tagesbudget || 'Start mit 8–12 € am Tag pro Betrieb. Weniger als 5 € liefert zu wenig Daten, um überhaupt etwas zu erkennen.',
    strategie: start,
    reihenfolge: rang,
    hoechstesGebot: hoechstesGebot.slice(0, 5),
    hinweise: [
      'Standort im Kampagnen-Setup auf den Ort plus 15–20 km einstellen. Das ersetzt den Ortsnamen in vielen Keywords.',
      'Conversion-Messung MUSS vor dem ersten Euro stehen. Ohne sie optimiert man ins Blaue.',
      'Broad Match bleibt aus. Ohne Conversion-Historie verteilt Broad das Budget auf Suchanfragen, die niemand geprüft hat.',
      'Suchbegriffe-Bericht in den ersten zwei Wochen alle zwei Tage durchsehen und Fehltreffer als Negative nachtragen.'
    ]
  };
}

// ------------------------------------------------------------ CSV-Export ---
// Getrennte Dateien, weil der Google Ads Editor Keywords, Negative und
// Anzeigen jeweils einzeln importiert.
function csvZeile(felder) {
  return felder.map((f) => {
    const t = String(f == null ? '' : f);
    return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }).join(',');
}

function alsCsvKeywords(kampagne) {
  const zeilen = [csvZeile(['Campaign', 'Ad Group', 'Keyword', 'Criterion Type'])];
  for (const g of kampagne.gruppen) {
    for (const k of g.keywords) {
      // Ohne Klammern/Anfuehrungszeichen - der Match Type steht in der Spalte.
      zeilen.push(csvZeile([kampagne.kampagne, g.name, k.roh, k.matchType]));
    }
  }
  return zeilen.join('\n') + '\n';
}

function alsCsvNegative(kampagne) {
  const zeilen = [csvZeile(['Campaign', 'Ad Group', 'Keyword', 'Criterion Type'])];
  for (const n of kampagne.negative) {
    const gruppe = n.ebene.startsWith('Anzeigengruppe')
      ? (kampagne.gruppen.find((g) => g.name.startsWith(n.ebene.split(': ')[1])) || {}).name || ''
      : '';
    zeilen.push(csvZeile([
      kampagne.kampagne, gruppe,
      n.keyword.replace(/^[["]|[\]"]$/g, ''),
      'Negative ' + n.matchType
    ]));
  }
  return zeilen.join('\n') + '\n';
}

function alsCsvAnzeigen(kampagne) {
  const kopf = ['Campaign', 'Ad Group', 'Ad type', 'Final URL', 'Path 1', 'Path 2'];
  for (let i = 1; i <= 10; i++) kopf.push('Headline ' + i);
  for (let i = 1; i <= 4; i++) kopf.push('Description ' + i);
  const zeilen = [csvZeile(kopf)];
  for (const g of kampagne.gruppen) {
    const a = g.anzeige;
    const felder = [kampagne.kampagne, g.name, 'Responsive search ad', a.zielUrl, a.pfad1, a.pfad2];
    for (let i = 0; i < 10; i++) felder.push(a.ueberschriften[i] || '');
    for (let i = 0; i < 4; i++) felder.push(a.beschreibungen[i] || '');
    zeilen.push(csvZeile(felder));
  }
  return zeilen.join('\n') + '\n';
}

module.exports = {
  MAX_UEBERSCHRIFT, MAX_BESCHREIBUNG, AUSSORTIEREN,
  formatiere, kurzKategorie, pruefeAussortieren,
  baueKeywords, negativeKeywords, baueRsa, pruefeRsa, baueKampagne,
  budgetEmpfehlung, alsCsvKeywords, alsCsvNegative, alsCsvAnzeigen
};
