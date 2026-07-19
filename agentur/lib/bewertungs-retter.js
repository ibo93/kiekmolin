'use strict';

// Bewertungs-Retter: prueft eine schlechte Google-Bewertung gegen die
// Google-Richtlinien und liefert fertige Texte - die Dienstleistung
// "Bewertungs-Management", nach der Gastronomen staendig fragen.
//
// Ehrlichkeits-Prinzip: Es gibt KEINE Loesch-Garantie (wer das verspricht,
// ist unserioes). Was es gibt: die richtige Melde-Begruendung fuer echte
// Richtlinien-Verstoesse, den Rechtsweg bei falschen Tatsachenbehauptungen,
// immer eine professionelle Antwort - und die beste Verteidigung: mehr
// echte gute Bewertungen, die eine schlechte "untergehen" lassen.

function bauePruefPrompt(restaurant, bewertungsText) {
  return [
    'Du bist Deutschlands bester Experte fuer Google-Bewertungs-Management in der Gastronomie.',
    'Pruefe die folgende Google-Bewertung fuer das Restaurant "' + (restaurant.name || 'das Restaurant') + '"' +
    (restaurant.city ? ' in ' + restaurant.city : '') + '.',
    '',
    'BEWERTUNG:',
    '"""',
    String(bewertungsText || '').slice(0, 2000),
    '"""',
    '',
    'Pruefe ehrlich gegen die Google-Richtlinien. Moegliche Verstoesse:',
    '- spam_fake: erkennbar unecht, Werbung, Copy-Paste, KI-generiert',
    '- interessenkonflikt: vermutlich Konkurrent, Ex-Mitarbeiter, nie Gast gewesen',
    '- beleidigung: Beleidigungen, Hassrede, Drohungen, obszoene Sprache',
    '- themenfremd: hat nichts mit einem Restaurantbesuch zu tun (Politik, anderes Geschaeft)',
    '- persoenliche_daten: nennt private Daten von Mitarbeitern/Gaesten',
    '- falsche_tatsache: konkrete, nachweislich falsche Tatsachenbehauptung (Rechtsweg moeglich)',
    '- kein_verstoss: harte, aber zulaessige Meinungsaeusserung',
    '',
    'WICHTIG: Sei ehrlich. Eine schlechte, aber echte Meinung ist KEIN Verstoss -',
    'dann ist die professionelle Antwort der richtige Weg. Keine falschen Hoffnungen.',
    'Erkenne auch den KERN der Kritik (z.B. "Wartezeit", "Sauberkeit", "Preis"),',
    'damit der Wirt das Problem im Betrieb wirklich abstellen kann.',
    '',
    'Antworte NUR mit einem JSON-Objekt, ohne Text davor oder danach:',
    '{',
    '  "verstoss": "<einer der Werte oben>",',
    '  "chance": "<hoch|mittel|gering>",',
    '  "dringlichkeit": "<hoch|mittel|niedrig: wie sehr schadet diese Bewertung dem Ruf>",',
    '  "kernproblem": "<1-3 Woerter: worum geht es wirklich, z.B. Wartezeit / Sauberkeit / Service / kein echter Besuch>",',
    '  "begruendung": "<1-2 Saetze: warum diese Einschaetzung>",',
    '  "meldung": "<Falls Verstoss: praezise Begruendung fuer das Google-Meldeformular, 2-4 Saetze, sachlich, auf die konkrete Richtlinie bezogen. Sonst leer.>",',
    '  "antwort_freundlich": "<Oeffentliche Antwort, warmherzig-entschuldigend (auch wenn kein Fehler vorliegt), ohne Schuldeingestaendnis, ohne Gutschein-Versprechen, max. 4 Saetze. Immer ausfuellen.>",',
    '  "antwort_sachlich": "<Oeffentliche Antwort, kurz und sachlich-souveraen, max. 3 Saetze. Immer ausfuellen.>"',
    '}'
  ].join('\n');
}

// Antwort des Modells robust parsen: JSON herausschneiden, Pflichtfelder
// absichern - ein kaputtes Modell-JSON darf die App nicht crashen.
function parsePruefung(text) {
  const roh = String(text || '');
  const start = roh.indexOf('{');
  const ende = roh.lastIndexOf('}');
  let daten = {};
  if (start !== -1 && ende > start) {
    try { daten = JSON.parse(roh.slice(start, ende + 1)); } catch (_e) { daten = {}; }
  }
  const gueltige = ['spam_fake', 'interessenkonflikt', 'beleidigung', 'themenfremd', 'persoenliche_daten', 'falsche_tatsache', 'kein_verstoss'];
  const stufe = (w) => (['hoch', 'mittel', 'niedrig', 'gering'].includes(w) ? w : null);
  return {
    verstoss: gueltige.includes(daten.verstoss) ? daten.verstoss : 'kein_verstoss',
    chance: ['hoch', 'mittel', 'gering'].includes(daten.chance) ? daten.chance : 'gering',
    dringlichkeit: stufe(daten.dringlichkeit) || 'mittel',
    kernproblem: String(daten.kernproblem || '').slice(0, 60),
    begruendung: String(daten.begruendung || 'Keine klare Einschaetzung moeglich - im Zweifel professionell antworten.').slice(0, 500),
    meldung: String(daten.meldung || '').slice(0, 1000),
    antwort_freundlich: String(daten.antwort_freundlich || daten.antwort || '').slice(0, 1000),
    antwort_sachlich: String(daten.antwort_sachlich || '').slice(0, 1000)
  };
}

// Formelle Beschwerde an Google (Rechtsweg-Vorstufe) bei falschen
// Tatsachenbehauptungen - fertig zum Abschicken ueber das Rechts-Formular.
// Kein Anwalts-Ersatz, aber oft reicht die klare, formale Aufforderung.
function baueBeschwerde(restaurant, bewertungsText, pruefung) {
  const name = restaurant.name || 'unser Restaurant';
  return [
    'Betreff: Antrag auf Entfernung einer rechtswidrigen Google-Bewertung – ' + name,
    '',
    'Sehr geehrtes Google-Team,',
    '',
    'als Verantwortliche(r) des Unternehmens ' + name +
    (restaurant.city ? ' in ' + restaurant.city : '') + ' beantrage ich die Entfernung der',
    'nachfolgenden Bewertung wegen einer unwahren Tatsachenbehauptung:',
    '',
    '"' + String(bewertungsText || '').slice(0, 500).trim() + '"',
    '',
    'Die Bewertung enthaelt eine konkrete Tatsachenbehauptung, die nachweislich unzutreffend ist' +
    (pruefung && pruefung.kernproblem ? ' (Kernpunkt: ' + pruefung.kernproblem + ')' : '') + '.',
    'Anders als eine Meinungsaeusserung sind unwahre Tatsachenbehauptungen nicht von der',
    'Meinungsfreiheit gedeckt und verletzen das Unternehmenspersoenlichkeitsrecht.',
    'Ich fordere Sie daher auf, die Bewertung binnen einer Woche zu pruefen und zu entfernen.',
    '',
    'Gerne belege ich den tatsaechlichen Sachverhalt auf Nachfrage.',
    '',
    'Mit freundlichen Gruessen',
    name
  ].join('\n');
}

// Die beste Verteidigung: mehr echte gute Bewertungen. Fertiger Text, den
// der Wirt zufriedenen Gaesten schickt/zeigt (mit direktem Bewertungs-Link,
// falls die place_id bekannt ist - sonst allgemeine Anleitung).
function baueBewertungsAnfrage(restaurant) {
  const name = restaurant.name || 'uns';
  const link = restaurant.google_place_id
    ? 'https://search.google.com/local/writereview?placeid=' + restaurant.google_place_id
    : null;
  const kurz = 'Hat es Ihnen bei ' + name + ' geschmeckt? Ueber eine kurze Google-Bewertung freuen wir uns riesig – ' +
    'das hilft uns mehr als jedes Trinkgeld. Danke! 🙏' + (link ? '\n' + link : '');
  return {
    text: kurz,
    link,
    hinweis: link
      ? 'Diesen Text + Link an zufriedene Gaeste (WhatsApp, Kassenbon-Aufkleber, am Tisch). Jede echte 5-Sterne-Bewertung drueckt eine schlechte nach unten.'
      : 'Diesen Text an zufriedene Gaeste geben. Fuer einen 1-Klick-Bewertungs-Link die Google-place_id des Betriebs hinterlegen (google_place_id).'
  };
}

// Menschlich lesbare Zusammenfassung fuer die Oberflaeche
const VERSTOSS_LABELS = {
  spam_fake: 'Verdacht auf Fake/Spam - meldenswert',
  interessenkonflikt: 'Verdacht auf Interessenkonflikt (Konkurrent/nie Gast) - meldenswert',
  beleidigung: 'Beleidigung/Hassrede - klarer Meldegrund',
  themenfremd: 'Themenfremd - meldenswert',
  persoenliche_daten: 'Persoenliche Daten - klarer Meldegrund',
  falsche_tatsache: 'Falsche Tatsachenbehauptung - melden UND ggf. Rechtsweg',
  kein_verstoss: 'Zulaessige Meinung - loeschen unrealistisch, professionell antworten'
};

// Erlaubte Journal-Status (Server prueft dagegen, UI zeigt sie an)
const JOURNAL_STATUS = ['offen', 'gemeldet', 'geloescht', 'abgelehnt', 'beantwortet'];

// Erfolgs-Bilanz aus dem Journal - der Nachweis fuers Kundengespraech.
function journalBilanz(eintraege) {
  const b = { gesamt: 0, gemeldet: 0, geloescht: 0, abgelehnt: 0, beantwortet: 0, offen: 0 };
  for (const e of eintraege || []) {
    b.gesamt++;
    if (b[e.status] != null) b[e.status]++;
  }
  return b;
}

module.exports = { bauePruefPrompt, parsePruefung, baueBeschwerde, baueBewertungsAnfrage, journalBilanz, JOURNAL_STATUS, VERSTOSS_LABELS };
