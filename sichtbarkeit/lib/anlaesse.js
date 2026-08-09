'use strict';

// Anlass-Kalender: Was ist in diesem Monat los? Beitraege zum richtigen
// Moment wirken um ein Vielfaches besser als allgemeine Posts - Gaeste
// suchen saisonal ("Gruenkohl essen", "Muttertag Restaurant").
//
// Zwei Sorten Anlaesse:
//   - Termine  (Ostern, Muttertag, Silvester): fester Aufhaenger im Monat
//   - Saisons  (Gruenkohlzeit, Spargel, Krabben): laufen ueber mehrere Monate
//
// EHRLICHKEIT: Wir behaupten NIE, dass ein Betrieb etwas anbietet. Der
// Anlass ist nur der Aufhaenger; ein Gericht wird nur dann genannt, wenn
// es wirklich auf der Speisekarte steht (passendesGericht).

const ANLAESSE = [
  // --- Feste Termine (Monat = Aufhaenger-Monat) ---
  { id: 'valentinstag', monate: [2], typ: 'termin', name: 'Valentinstag',
    aufhaenger: 'Am 14. Februar ist Valentinstag – viele suchen kurzfristig einen Tisch zu zweit.',
    tipp: 'Post ab Anfang Februar. Wer früh sichtbar ist, bekommt die Reservierungen.' },
  { id: 'ostern', monate: [3, 4], typ: 'termin', name: 'Ostern',
    aufhaenger: 'Ostern steht vor der Tür – Familienessen werden jetzt geplant.',
    tipp: 'Zwei Wochen vorher posten, Öffnungszeiten an den Feiertagen nennen.' },
  { id: 'muttertag', monate: [5], typ: 'termin', name: 'Muttertag',
    aufhaenger: 'Am zweiten Sonntag im Mai ist Muttertag – einer der stärksten Restaurant-Tage im Jahr.',
    tipp: 'Spätestens zwei Wochen vorher posten. Tische sind oft schon früh weg.' },
  { id: 'vatertag', monate: [5], typ: 'termin', name: 'Vatertag / Himmelfahrt',
    aufhaenger: 'Vatertag: Gruppen sind unterwegs und suchen unterwegs eine Einkehr.',
    tipp: 'Öffnungszeiten am Feiertag deutlich nennen – danach wird gesucht.' },
  { id: 'sommerferien', monate: [7, 8], typ: 'termin', name: 'Sommerferien an der Nordsee',
    aufhaenger: 'Urlaubszeit an der Küste – täglich neue Gäste, die den Ort noch nicht kennen.',
    tipp: 'Jetzt zählt Sichtbarkeit am meisten: Urlauber suchen fast alles übers Handy.' },
  { id: 'erntedank', monate: [10], typ: 'termin', name: 'Herbstferien',
    aufhaenger: 'Herbstferien: Familien sind unterwegs, das Wetter treibt sie nach drinnen.',
    tipp: 'Gemütlichkeit betonen – wer bei Regen sucht, entscheidet sich schnell.' },
  { id: 'weihnachtsfeiern', monate: [10, 11], typ: 'termin', name: 'Weihnachtsfeiern-Planung',
    aufhaenger: 'Firmen planen ihre Weihnachtsfeiern jetzt – im Oktober und November, nicht im Dezember.',
    tipp: 'Der wichtigste Post des Jahres für Gruppen-Reservierungen. Früh dran sein!' },
  { id: 'weihnachten', monate: [12], typ: 'termin', name: 'Weihnachten & Silvester',
    aufhaenger: 'Zwischen den Feiertagen suchen viele einen Tisch – und alle suchen Öffnungszeiten.',
    tipp: 'Feiertags-Öffnungszeiten posten UND im Profil eintragen. Das wird am meisten gesucht.' },

  // --- Saisons (Ostfriesland / Nordsee) ---
  { id: 'gruenkohl', monate: [11, 12, 1, 2], typ: 'saison', name: 'Grünkohlzeit',
    stichwoerter: ['gruenkohl', 'grünkohl', 'pinkel', 'kohl'],
    aufhaenger: 'Grünkohlzeit in Ostfriesland – die Saison, auf die hier das ganze Jahr gewartet wird.',
    tipp: 'Grünkohl-Touren und Kohlfahrten werden ab Oktober geplant. Sichtbar sein lohnt sich doppelt.' },
  { id: 'spargel', monate: [4, 5, 6], typ: 'saison', name: 'Spargelzeit',
    stichwoerter: ['spargel'],
    aufhaenger: 'Spargelzeit – von April bis Johanni (24. Juni) wird danach gesucht.',
    tipp: 'Wer Spargel auf der Karte hat, sollte es jetzt zeigen. Danach ist die Saison vorbei.' },
  { id: 'krabben', monate: [5, 6, 7, 8, 9], typ: 'saison', name: 'Krabben-Saison',
    stichwoerter: ['krabben', 'granat', 'nordsee'],
    aufhaenger: 'Krabbensaison an der Küste – für viele Urlauber der Grund, überhaupt hier essen zu gehen.',
    tipp: 'Frische betonen. Bei Krabben entscheidet die Herkunft – das ist ein echtes Argument.' },
  { id: 'matjes', monate: [6, 7], typ: 'saison', name: 'Matjes-Saison',
    stichwoerter: ['matjes', 'hering'],
    aufhaenger: 'Matjeszeit – ein Klassiker, nach dem im Sommer gezielt gesucht wird.',
    tipp: 'Kurzer Post reicht: Matjes ist ein Suchbegriff, kein Erklärthema.' },
  { id: 'wattwandern', monate: [5, 6, 7, 8, 9], typ: 'saison', name: 'Wattwander-Saison',
    stichwoerter: [],
    aufhaenger: 'Wattwander-Zeit: Nach der Tour haben alle Hunger – und suchen genau dann ein Lokal.',
    tipp: 'Mit Öffnungszeiten posten. Wer nach dem Watt sucht, will sofort wissen: hat der auf?' },
  { id: 'tee', monate: [1, 2, 11, 12], typ: 'saison', name: 'Ostfriesische Teezeit',
    stichwoerter: ['tee', 'teetied', 'kluntje'],
    aufhaenger: 'Teetied – gerade in der kalten Jahreszeit ein Grund für einen Zwischenstopp.',
    tipp: 'Wer ostfriesischen Tee serviert, sollte das zeigen: Touristen suchen gezielt danach.' }
];

function normalisiere(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

// Alle Anlaesse eines Monats (1-12), Termine zuerst - die sind zeitkritisch.
function anlaesseFuerMonat(monat) {
  if (!Number.isInteger(monat) || monat < 1 || monat > 12) return [];
  const treffer = ANLAESSE.filter((a) => a.monate.includes(monat));
  return treffer.slice().sort((a, b) => (a.typ === b.typ ? 0 : a.typ === 'termin' ? -1 : 1));
}

// Passendes Gericht auf der ECHTEN Speisekarte finden (oder null).
// Nur so darf ein Gericht im Anlass-Post genannt werden.
function passendesGericht(menue, stichwoerter) {
  if (!menue || !menue.length || !stichwoerter || !stichwoerter.length) return null;
  for (const wort of stichwoerter) {
    const w = normalisiere(wort);
    const treffer = menue.find((g) => normalisiere(g.name + ' ' + (g.description || '')).includes(w));
    if (treffer) return treffer;
  }
  return null;
}

// Der beste Anlass des Monats fuer diesen Betrieb: Ein Saison-Anlass mit
// passendem Gericht auf der Karte schlaegt alles - dann ist der Post konkret.
function besterAnlass(monat, menue) {
  const kandidaten = anlaesseFuerMonat(monat);
  if (!kandidaten.length) return null;
  for (const a of kandidaten) {
    if (a.typ === 'saison' && passendesGericht(menue, a.stichwoerter)) {
      return { anlass: a, gericht: passendesGericht(menue, a.stichwoerter) };
    }
  }
  return { anlass: kandidaten[0], gericht: null };
}

module.exports = { ANLAESSE, anlaesseFuerMonat, passendesGericht, besterAnlass };
