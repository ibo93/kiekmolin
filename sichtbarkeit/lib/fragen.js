'use strict';

// Erzeugt pro Betrieb die Liste typischer Suchfragen (Stadt + Kategorie).
// Genau diese Fragen werden jeden Monat identisch getestet -
// nur so ist der Vergleich zum Vormonat ehrlich.

// Kategorie-Erkennung wie in build-seo-pages.js (gleiche Logik, damit
// App, SEO-Seiten und Report dieselbe Sprache sprechen).
const KATEGORIEN = [
  { schluessel: ['pizza', 'pizzeria', 'italienisch'], label: 'Pizzeria', gericht: 'Pizza',
    nennform: 'eine Pizzeria', superlativ: 'beste pizzeria', empfehlungsfrage: 'Welche Pizzeria' },
  { schluessel: ['doener', 'döner', 'tuerkisch', 'türkisch', 'kebab'], label: 'Döner-Imbiss', gericht: 'Döner',
    nennform: 'ein Döner-Imbiss', superlativ: 'bester döner', empfehlungsfrage: 'Welchen Döner-Imbiss' },
  { schluessel: ['fisch', 'krabben', 'meeresfrüchte', 'meeresfruechte', 'seafood'], label: 'Fischrestaurant', gericht: 'Fisch',
    nennform: 'ein Fischrestaurant', superlativ: 'bestes fischrestaurant', empfehlungsfrage: 'Welches Fischrestaurant' },
  { schluessel: ['griechisch', 'gyros', 'souvlaki', 'taverne'], label: 'Griechisches Restaurant', gericht: 'Gyros',
    nennform: 'ein griechisches Restaurant', superlativ: 'bestes griechisches restaurant', empfehlungsfrage: 'Welches griechische Restaurant' },
  { schluessel: ['cafe', 'café', 'kaffee', 'bistro', 'konditorei', 'eiscafe', 'eiscafé'], label: 'Café', gericht: 'Kuchen',
    nennform: 'ein Café', superlativ: 'bestes café', empfehlungsfrage: 'Welches Café' },
  { schluessel: ['asiatisch', 'sushi', 'china', 'thai', 'vietnam'], label: 'Asiatisches Restaurant', gericht: 'Sushi',
    nennform: 'ein asiatisches Restaurant', superlativ: 'bestes asiatisches restaurant', empfehlungsfrage: 'Welches asiatische Restaurant' }
];

function normalisiere(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

function erkenneKategorie(restaurant) {
  const heuhaufen = [];
  if (restaurant.cuisine) heuhaufen.push(normalisiere(restaurant.cuisine));
  if (Array.isArray(restaurant.cuisine_type)) {
    restaurant.cuisine_type.forEach((c) => c && heuhaufen.push(normalisiere(c)));
  }
  heuhaufen.push(normalisiere(restaurant.name));
  const text = heuhaufen.join(' ');

  for (const kat of KATEGORIEN) {
    if (kat.schluessel.some((k) => text.includes(normalisiere(k)))) return kat;
  }
  return { label: 'Restaurant', gericht: 'Essen', nennform: 'ein Restaurant', superlativ: 'bestes restaurant', empfehlungsfrage: 'Welches Restaurant' };
}

// Die Standard-Fragenliste pro Betrieb. Bewusst kurz (6 Fragen):
// lieber wenige Fragen sauber jeden Monat testen als 50 einmalig.
function suchfragen(restaurant) {
  const stadt = restaurant.city || 'Ostfriesland';
  const kat = erkenneKategorie(restaurant);
  const katKlein = kat.label.toLowerCase();

  const fragen = [
    { id: 'beste-kategorie-stadt', frage: `${kat.superlativ} in ${stadt}` },
    { id: 'kategorie-stadt', frage: `${katKlein} ${stadt}` },
    { id: 'wo-essen', frage: `wo essen in ${stadt}` },
    { id: 'gericht-stadt', frage: `${kat.gericht} in ${stadt} bestellen` },
    { id: 'name-direkt', frage: normalisiere(restaurant.name).includes(normalisiere(stadt)) ? restaurant.name : `${restaurant.name} ${stadt}` },
    { id: 'empfehlung-ki', frage: `${kat.empfehlungsfrage} in ${stadt} kannst du empfehlen?` }
  ];

  return { kategorie: kat.label, fragen };
}

module.exports = { suchfragen, erkenneKategorie };
