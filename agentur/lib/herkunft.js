'use strict';

// Gaeste-Ursprung: Woher kommen die Gaeste eigentlich?
//
// Warum das der wichtigste Beleg fuer dein Honorar ist: Der Wirt zahlt
// jeden Monat - und fragt sich irgendwann "bringt das was?". Diese
// Auswertung beantwortet das mit einer Zahl aus SEINER eigenen Datenbank:
// "Von 40 Reservierungen kamen 23 ueber uns. Das sind 1.150 EUR."
//
// EHRLICH: Wir rechnen NICHT alles uns zu. Was der Wirt selbst eintraegt
// oder was ohne Quelle in der Datenbank steht, zaehlt als "direkt" -
// nicht als unser Verdienst. Lieber eine kleinere, wasserdichte Zahl.

// Die Quellen-Kennungen aus der Kiek-mol-in-Datenbank auf verstaendliche
// Kanaele abbilden. 'unser' = laeuft ueber die Agentur-Bausteine.
const KANAELE = [
  {
    schluessel: 'telefon',
    label: 'Telefon-Retter (KI)',
    unser: true,
    quellen: ['telefon', 'phone_ai', 'voice'],
    erklaerung: 'Anrufe, die die KI angenommen hat – ohne sie waren das verpasste Anrufe.'
  },
  {
    schluessel: 'online',
    label: 'Kiek mol in (online)',
    unser: true,
    quellen: ['web', 'website', 'online', 'kiekmolin', 'app', 'pwa', 'qr'],
    erklaerung: 'Gäste, die euch online gefunden und direkt gebucht haben.'
  },
  {
    schluessel: 'direkt',
    label: 'Direkt im Haus',
    unser: false,
    quellen: ['walk_in', 'vor_ort', 'manual', 'manuell', 'staff', 'telefon_manuell'],
    erklaerung: 'Vom Team selbst eingetragen – das ist eure eigene Arbeit, nicht unsere.'
  }
];

const UNBEKANNT = {
  schluessel: 'unbekannt',
  label: 'Ohne Quelle',
  unser: false,
  erklaerung: 'In der Datenbank steht keine Quelle. Wir rechnen das bewusst NICHT uns an.'
};

function kanalFuer(quelle) {
  const q = String(quelle || '').toLowerCase().trim();
  if (!q) return UNBEKANNT;
  for (const k of KANAELE) {
    if (k.quellen.includes(q)) return k;
  }
  return UNBEKANNT;
}

// Reservierungen + Bestellungen nach Kanal buendeln.
// reservierungen: [{ source, party_size }]  bestellungen: [{ source, total }]
// optionen: { bonProGast (Standard 25) }
function nachKanaelen({ reservierungen, bestellungen }, optionen) {
  const o = optionen || {};
  const bon = Number(o.bonProGast) || 25;
  const eimer = new Map();

  const hole = (kanal) => {
    if (!eimer.has(kanal.schluessel)) {
      eimer.set(kanal.schluessel, {
        schluessel: kanal.schluessel, label: kanal.label, unser: kanal.unser,
        erklaerung: kanal.erklaerung,
        reservierungen: 0, gaeste: 0, bestellungen: 0, bestellwert: 0, umsatz: 0
      });
    }
    return eimer.get(kanal.schluessel);
  };

  for (const r of reservierungen || []) {
    const e = hole(kanalFuer(r.source));
    e.reservierungen++;
    // Ohne Personenzahl vorsichtig mit 2 rechnen statt zu raten
    e.gaeste += Number(r.party_size) > 0 ? Number(r.party_size) : 2;
  }
  for (const b of bestellungen || []) {
    const e = hole(kanalFuer(b.source));
    e.bestellungen++;
    e.bestellwert += Number(b.total) || 0;
  }

  const liste = [...eimer.values()];
  for (const e of liste) {
    // Umsatz = echter Bestellwert + geschaetzter Tisch-Umsatz
    e.umsatz = Math.round((e.bestellwert + e.gaeste * bon) * 100) / 100;
    e.bestellwert = Math.round(e.bestellwert * 100) / 100;
  }
  // Unsere Kanaele zuerst, dann nach Umsatz
  liste.sort((a, b) => (b.unser - a.unser) || (b.umsatz - a.umsatz));
  return liste;
}

// Die eine Zahl fuers Kundengespraech: Welcher Anteil laeuft ueber uns?
function bilanz(kanaele) {
  const liste = kanaele || [];
  const summe = (feld, nurUnser) => liste
    .filter((k) => (nurUnser ? k.unser : true))
    .reduce((s, k) => s + (k[feld] || 0), 0);

  const vorgaengeGesamt = summe('reservierungen') + summe('bestellungen');
  const vorgaengeUnser = summe('reservierungen', true) + summe('bestellungen', true);
  const umsatzGesamt = summe('umsatz');
  const umsatzUnser = summe('umsatz', true);

  return {
    vorgaengeGesamt,
    vorgaengeUnser,
    anteilProzent: vorgaengeGesamt ? Math.round((vorgaengeUnser / vorgaengeGesamt) * 100) : 0,
    umsatzGesamt: Math.round(umsatzGesamt * 100) / 100,
    umsatzUnser: Math.round(umsatzUnser * 100) / 100,
    gaesteUnser: summe('gaeste', true)
  };
}

// Der Satz, den Ibo im Gespraech vorliest bzw. per WhatsApp schickt.
// Ohne belastbare Zahlen sagt er das auch - kein Schoenreden.
function satzFuerWirt(bilanzDaten, monatLabel, honorar) {
  const b = bilanzDaten || {};
  if (!b.vorgaengeGesamt) {
    return 'Für ' + monatLabel + ' liegen noch keine Vorgänge in der Datenbank – ' +
      'sobald Reservierungen und Bestellungen laufen, steht hier schwarz auf weiß, wie viel davon über uns kommt.';
  }
  if (!b.vorgaengeUnser) {
    return 'Im ' + monatLabel + ' kam noch nichts nachweislich über unsere Kanäle rein (' +
      b.vorgaengeGesamt + ' Vorgänge insgesamt). Das ändern wir – daran arbeiten wir diesen Monat.';
  }
  const teile = ['Im ' + monatLabel + ' kamen ' + b.vorgaengeUnser + ' von ' + b.vorgaengeGesamt +
    ' Vorgängen über uns – das sind ' + b.anteilProzent + ' %. ' +
    'Geschätzter Umsatz daraus: ' + euro(b.umsatzUnser) + '.'];
  const h = Number(honorar) || 0;
  if (h > 0 && b.umsatzUnser > 0) {
    const faktor = Math.round((b.umsatzUnser / h) * 10) / 10;
    teile.push(faktor >= 1.5
      ? 'Bei ' + euro(h) + ' Honorar ist das rund das ' + String(faktor).replace('.', ',') + '-Fache zurück.'
      : 'Das liegt noch nah am Honorar von ' + euro(h) + ' – da geht mehr, und genau daran arbeiten wir.');
  }
  return teile.join(' ');
}

function euro(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' €';
}

module.exports = { KANAELE, kanalFuer, nachKanaelen, bilanz, satzFuerWirt };
