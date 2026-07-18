'use strict';

// Bewertungs-Retter: prueft eine schlechte Google-Bewertung gegen die
// Google-Richtlinien und liefert fertige Texte - die Dienstleistung
// "Bewertungs-Management", nach der Gastronomen staendig fragen.
//
// Ehrlichkeits-Prinzip: Es gibt KEINE Loesch-Garantie (wer das verspricht,
// ist unserioes). Was es gibt: die richtige Melde-Begruendung fuer echte
// Richtlinien-Verstoesse, den Hinweis auf den Rechtsweg bei falschen
// Tatsachenbehauptungen - und immer eine professionelle Antwort.

function bauePruefPrompt(restaurant, bewertungsText) {
  return [
    'Du bist Experte fuer Google-Bewertungs-Management in Deutschland.',
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
    '',
    'Antworte NUR mit einem JSON-Objekt, ohne Text davor oder danach:',
    '{',
    '  "verstoss": "<einer der Werte oben>",',
    '  "chance": "<hoch|mittel|gering>",',
    '  "begruendung": "<1-2 Saetze: warum diese Einschaetzung>",',
    '  "meldung": "<Falls Verstoss: praezise Begruendung fuer das Google-Meldeformular, 2-4 Saetze, sachlich, auf die konkrete Richtlinie bezogen. Sonst leer.>",',
    '  "antwort": "<Professionelle oeffentliche Antwort des Restaurants: ruhig, souveraen, ohne Schuldeingestaendnis, ohne Gutschein-Versprechen, max. 4 Saetze. Immer ausfuellen.>"',
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
  return {
    verstoss: gueltige.includes(daten.verstoss) ? daten.verstoss : 'kein_verstoss',
    chance: ['hoch', 'mittel', 'gering'].includes(daten.chance) ? daten.chance : 'gering',
    begruendung: String(daten.begruendung || 'Keine klare Einschaetzung moeglich - im Zweifel professionell antworten.').slice(0, 500),
    meldung: String(daten.meldung || '').slice(0, 1000),
    antwort: String(daten.antwort || '').slice(0, 1000)
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

module.exports = { bauePruefPrompt, parsePruefung, VERSTOSS_LABELS };
