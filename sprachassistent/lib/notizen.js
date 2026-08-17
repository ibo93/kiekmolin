'use strict';

// NOTIZEN & ERINNERUNGEN — das Gedaechtnis des Assistenten.
//
// "Merk dir: La Piazza will die Karte bis Freitag."
// "Erinner mich morgen um neun an den Anruf bei der Boerse."
// "Was hab ich mir notiert?"
//
// Zwei Dinge sind hier bewusst anders als beim Rest:
//
// 1. Das laeuft OHNE KI. Eine Notiz anlegen kostet keinen Cent und keine
//    Sekunde Wartezeit - der Server schreibt eine Zeile und sagt "notiert".
//    Eine KI zu fragen, um einen Satz zu speichern, waere Unsinn.
// 2. Alles bleibt lokal in notizen.jsonl (gitignored). Da stehen
//    Kundennamen und Preise drin.

const fs = require('fs');
const path = require('path');

const DATEI = path.join(__dirname, '..', 'notizen.jsonl');

// ------------------------------------------------------- Zeit verstehen ---

const WOCHENTAGE = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6
};
const STANDARD_STUNDE = 9;    // "morgen" ohne Uhrzeit = morgen frueh

function amTag(basis, jahr, monat, tag, stunde, minute) {
  const d = new Date(basis.getTime());
  if (jahr !== undefined) d.setFullYear(jahr);
  if (monat !== undefined) d.setMonth(monat);
  if (tag !== undefined) d.setDate(tag);
  d.setHours(stunde === undefined ? STANDARD_STUNDE : stunde, minute || 0, 0, 0);
  return d;
}

// Aus "erinner mich morgen um 9 an den Anruf" wird
// { faellig: <morgen 9 Uhr>, rest: "an den Anruf" }.
// Findet sich keine Zeitangabe, bleibt faellig null - dann ist es eine
// Notiz ohne Termin, und die ist auch in Ordnung.
function deuteZeit(text, jetzt) {
  const basis = jetzt || new Date();
  let rest = ' ' + String(text || '') + ' ';
  let tagTreffer = null;
  let stunde;
  let minute;

  // Uhrzeit: "um 9", "um 9 Uhr", "um 14:30", "9:15 Uhr"
  const zeit = /\b(?:um\s+)?(\d{1,2})(?::(\d{2}))?\s*uhr\b|\bum\s+(\d{1,2})(?::(\d{2}))?\b/i.exec(rest);
  if (zeit) {
    stunde = parseInt(zeit[1] || zeit[3], 10);
    minute = parseInt(zeit[2] || zeit[4] || '0', 10);
    rest = rest.replace(zeit[0], ' ');
  }

  // Datum: "am 20.", "am 20.9.", "20.09.2026"
  const datum = /\b(?:am\s+)?(\d{1,2})\.\s*(\d{1,2})?\.?\s*(\d{4})?/.exec(rest);

  if (/\bmorgen\b/i.test(rest) && !/\buebermorgen|übermorgen\b/i.test(rest)) {
    tagTreffer = amTag(basis, undefined, undefined, basis.getDate() + 1, stunde, minute);
    rest = rest.replace(/\bmorgen\b/i, ' ');
  } else if (/\b(uebermorgen|übermorgen)\b/i.test(rest)) {
    tagTreffer = amTag(basis, undefined, undefined, basis.getDate() + 2, stunde, minute);
    rest = rest.replace(/\b(uebermorgen|übermorgen)\b/i, ' ');
  } else if (/\bheute\b/i.test(rest)) {
    // "heute abend" ohne Uhrzeit: 18 Uhr ist gemeint, nicht 9 Uhr frueh.
    const abend = /\bheute\s+abend\b/i.test(rest);
    tagTreffer = amTag(basis, undefined, undefined, basis.getDate(), stunde !== undefined ? stunde : (abend ? 18 : basis.getHours() + 1), minute);
    rest = rest.replace(/\bheute(\s+abend)?\b/i, ' ');
  } else if (/\b(naechste|nächste)\s+woche\b/i.test(rest)) {
    tagTreffer = amTag(basis, undefined, undefined, basis.getDate() + 7, stunde, minute);
    rest = rest.replace(/\b(naechste|nächste)\s+woche\b/i, ' ');
  } else {
    const inX = /\bin\s+(\d+|einer|einem|zwei|drei|vier|fuenf|fünf)\s+(minuten?|stunden?|tagen?|wochen?)\b/i.exec(rest);
    if (inX) {
      const zahlen = { einer: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, fünf: 5 };
      const anzahl = parseInt(inX[1], 10) || zahlen[inX[1].toLowerCase()] || 1;
      const d = new Date(basis.getTime());
      if (/minute/i.test(inX[2])) d.setMinutes(d.getMinutes() + anzahl);
      else if (/stunde/i.test(inX[2])) d.setHours(d.getHours() + anzahl);
      else if (/tag/i.test(inX[2])) { d.setDate(d.getDate() + anzahl); d.setHours(stunde === undefined ? STANDARD_STUNDE : stunde, minute || 0, 0, 0); }
      else { d.setDate(d.getDate() + anzahl * 7); d.setHours(stunde === undefined ? STANDARD_STUNDE : stunde, minute || 0, 0, 0); }
      tagTreffer = d;
      rest = rest.replace(inX[0], ' ');
    } else {
      // Wochentag: "am Freitag", "Freitag"
      const wochentag = /\b(?:am\s+)?(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend)\b/i.exec(rest);
      if (wochentag) {
        const ziel = WOCHENTAGE[wochentag[1].toLowerCase()];
        const d = new Date(basis.getTime());
        let abstand = (ziel - d.getDay() + 7) % 7;
        if (abstand === 0) abstand = 7;              // "Freitag" am Freitag = naechster
        d.setDate(d.getDate() + abstand);
        d.setHours(stunde === undefined ? STANDARD_STUNDE : stunde, minute || 0, 0, 0);
        tagTreffer = d;
        rest = rest.replace(wochentag[0], ' ');
      } else if (datum && datum[2]) {
        // Nur mit Monat: "am 20.9." - eine nackte "20." waere zu oft eine
        // Hausnummer oder ein Preis.
        const tag = parseInt(datum[1], 10);
        const monat = parseInt(datum[2], 10) - 1;
        const jahr = datum[3] ? parseInt(datum[3], 10) : basis.getFullYear();
        tagTreffer = amTag(basis, jahr, monat, tag, stunde, minute);
        if (!datum[3] && tagTreffer < basis) tagTreffer.setFullYear(jahr + 1);
        rest = rest.replace(datum[0], ' ');
      } else if (stunde !== undefined) {
        // Nur Uhrzeit: heute, wenn sie noch kommt, sonst morgen.
        const d = amTag(basis, undefined, undefined, basis.getDate(), stunde, minute);
        if (d <= basis) d.setDate(d.getDate() + 1);
        tagTreffer = d;
      }
    }
  }

  rest = rest.replace(/\s+/g, ' ').trim().replace(/^(an|dass|daran|dran|,|:)\s+/i, '').trim();
  // Wo die Zeitangabe rausgeschnitten wurde, bleibt sonst ein Woertchen
  // haengen: aus "die Karte bis Freitag" wurde "die Karte bis".
  rest = rest.replace(/[\s,]+(bis|am|um|zum|zur|fuer|für|gegen|ab|vor)\s*$/i, '').trim();
  return { faellig: tagTreffer ? tagTreffer.toISOString() : null, rest: rest };
}

// ------------------------------------------------------------ Speichern ---

function id() {
  return Math.random().toString(36).slice(2, 8);
}

function alle() {
  if (!fs.existsSync(DATEI)) return [];
  const liste = [];
  for (const zeile of fs.readFileSync(DATEI, 'utf8').split('\n')) {
    if (!zeile.trim()) continue;
    try { liste.push(JSON.parse(zeile)); } catch (_e) { /* kaputte Zeile ueberspringen */ }
  }
  return liste;
}

function schreibeAlle(liste) {
  fs.writeFileSync(DATEI, liste.map((n) => JSON.stringify(n)).join('\n') + (liste.length ? '\n' : ''));
}

function merke(text, optionen) {
  const o = optionen || {};
  const sauber = String(text || '').trim();
  if (!sauber) throw new Error('Ohne Text keine Notiz');

  const notiz = {
    id: id(),
    text: sauber,
    angelegt: new Date().toISOString(),
    faellig: o.faellig || null,
    erledigt: null,
    erinnert: false
  };
  fs.appendFileSync(DATEI, JSON.stringify(notiz) + '\n');
  return notiz;
}

function offene() {
  return alle().filter((n) => !n.erledigt);
}

// Was heute dran ist (alles, was heute oder frueher faellig war).
function faelligBis(zeitpunkt) {
  const grenze = zeitpunkt ? new Date(zeitpunkt) : new Date();
  return offene().filter((n) => n.faellig && new Date(n.faellig) <= grenze);
}

// Erledigen: per Kennung oder per Stichwort ("die Sache mit La Piazza").
function erledige(kennung) {
  const suche = String(kennung || '').toLowerCase().trim();
  if (!suche) return null;
  const liste = alle();
  const treffer = liste.find((n) => !n.erledigt && (n.id === suche || n.text.toLowerCase().indexOf(suche) > -1));
  if (!treffer) return null;
  treffer.erledigt = new Date().toISOString();
  schreibeAlle(liste);
  return treffer;
}

// Als erinnert markieren, damit dieselbe Erinnerung nicht alle 60 Sekunden
// wieder losgeht.
function alsErinnertMarkieren(ids) {
  const menge = new Set(ids);
  const liste = alle();
  let geaendert = false;
  for (const n of liste) {
    if (menge.has(n.id) && !n.erinnert) { n.erinnert = true; geaendert = true; }
  }
  if (geaendert) schreibeAlle(liste);
}

// ---------------------------------------------------- Fuer die Stimme -----

function zeitWort(iso, jetzt) {
  if (!iso) return '';
  const d = new Date(iso);
  const basis = jetzt || new Date();
  const tage = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
    new Date(basis.getFullYear(), basis.getMonth(), basis.getDate())) / 86400000);
  const uhr = d.getHours() + (d.getMinutes() ? ':' + String(d.getMinutes()).padStart(2, '0') : '') + ' Uhr';

  if (tage === 0) return 'heute um ' + uhr;
  if (tage === 1) return 'morgen um ' + uhr;
  if (tage === -1) return 'seit gestern faellig';
  if (tage < -1) return 'seit ' + Math.abs(tage) + ' Tagen faellig';
  if (tage < 7) return ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d.getDay()] + ' um ' + uhr;
  return 'am ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
}

// Ein vorlesbarer Satz aus einer Liste Notizen.
function formuliere(liste, jetzt) {
  if (!liste || !liste.length) return 'Auf deiner Liste steht nichts.';
  const teile = liste.slice(0, 5).map((n) => {
    const wann = zeitWort(n.faellig, jetzt);
    return n.text + (wann ? ' (' + wann + ')' : '');
  });
  const kopf = liste.length === 1 ? 'Eine Sache: ' : (liste.length + ' Sachen: ');
  const schwanz = liste.length > 5 ? ' Und ' + (liste.length - 5) + ' weitere.' : '';
  return kopf + teile.join('. ') + '.' + schwanz;
}

module.exports = {
  merke, alle, offene, faelligBis, erledige, alsErinnertMarkieren,
  deuteZeit, formuliere, zeitWort, DATEI
};
