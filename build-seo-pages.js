#!/usr/bin/env node
/**
 * Kiek mol in - SEO Landing Pages Generator
 *
 * Build-Time-Skript: erstellt statische HTML-Seiten fuer lokale Suchen wie
 *   "Pizzeria Emden", "Doener Norden", "Restaurant Greetsiel"
 *
 * Laeuft bei jedem Netlify-Deploy ueber netlify.toml.
 * Keine npm-Dependencies - nur Node 18+ Built-ins (fetch, fs, path).
 *
 * Fault-tolerant: Wenn Supabase nicht erreichbar ist, exit 0 + Warnung,
 * damit der Deploy trotzdem durchgeht.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================

const SITE_URL = 'https://kiekmolin.de';
const BRAND = 'Kiek mol in';
const PRIMARY_COLOR = '#003d33';
const ACCENT_COLOR = '#f59e0b';

// Aus index.html, Zeile 402-403 - public-safe (anon key)
const SUPABASE_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';

// Zielordner der generierten Seiten; fuer Tests per SEO_OUT_DIR umbiegbar
const OUT_DIR = process.env.SEO_OUT_DIR || __dirname;

const CITIES = [
  { slug: 'greetsiel',     name: 'Greetsiel',     zipPrefix: '267', region: 'Krummhörn' },
  { slug: 'norddeich',     name: 'Norddeich',     zipPrefix: '267', region: 'Norden' },
  { slug: 'norden',        name: 'Norden',        zipPrefix: '267', region: 'Ostfriesland' },
  { slug: 'aurich',        name: 'Aurich',        zipPrefix: '267', region: 'Ostfriesland' },
  { slug: 'emden',         name: 'Emden',         zipPrefix: '267', region: 'Ostfriesland' },
  { slug: 'carolinensiel', name: 'Carolinensiel', zipPrefix: '264', region: 'Wittmund' },
  { slug: 'leer',          name: 'Leer',          zipPrefix: '267', region: 'Ostfriesland' },
  { slug: 'wittmund',      name: 'Wittmund',      zipPrefix: '264', region: 'Harlingerland' },
  { slug: 'esens',         name: 'Esens',         zipPrefix: '264', region: 'Harlingerland' },
  { slug: 'jever',         name: 'Jever',         zipPrefix: '264', region: 'Friesland' },
  // Inseln -- touristisch die kaufkraeftigsten Suchen ("Restaurant Norderney",
  // "essen bestellen Borkum") und bisher komplett ohne eigene Seite.
  { slug: 'norderney',     name: 'Norderney',     zipPrefix: '265', region: 'Ostfriesische Inseln' },
  { slug: 'borkum',        name: 'Borkum',        zipPrefix: '267', region: 'Ostfriesische Inseln' },
  { slug: 'juist',         name: 'Juist',         zipPrefix: '265', region: 'Ostfriesische Inseln' },
  { slug: 'langeoog',      name: 'Langeoog',      zipPrefix: '264', region: 'Ostfriesische Inseln' },
  { slug: 'spiekeroog',    name: 'Spiekeroog',    zipPrefix: '264', region: 'Ostfriesische Inseln' },
  { slug: 'baltrum',       name: 'Baltrum',       zipPrefix: '265', region: 'Ostfriesische Inseln' },
  { slug: 'wangerooge',    name: 'Wangerooge',    zipPrefix: '264', region: 'Ostfriesische Inseln' },
  // Weitere Orte des Einzugsgebiets (stehen laengst in areaServed der Startseite)
  { slug: 'wiesmoor',      name: 'Wiesmoor',      zipPrefix: '266', region: 'Ostfriesland' },
  { slug: 'krummhoern',    name: 'Krummhörn',     zipPrefix: '267', region: 'Krummhörn' },
  { slug: 'pewsum',        name: 'Pewsum',        zipPrefix: '267', region: 'Krummhörn' },
  { slug: 'marienhafe',    name: 'Marienhafe',    zipPrefix: '265', region: 'Brookmerland' },
  { slug: 'dornum',        name: 'Dornum',        zipPrefix: '265', region: 'Ostfriesland' },
  { slug: 'hage',          name: 'Hage',          zipPrefix: '265', region: 'Ostfriesland' },
  { slug: 'grossefehn',    name: 'Großefehn',     zipPrefix: '266', region: 'Ostfriesland' },
  { slug: 'suedbrookmerland', name: 'Südbrookmerland', zipPrefix: '266', region: 'Ostfriesland' },
  { slug: 'ihlow',         name: 'Ihlow',         zipPrefix: '266', region: 'Ostfriesland' },
  { slug: 'weener',        name: 'Weener',        zipPrefix: '268', region: 'Rheiderland' },
  { slug: 'papenburg',     name: 'Papenburg',     zipPrefix: '268', region: 'Emsland' }
];

const CATEGORIES = [
  {
    slug: 'pizzeria',
    label: 'Pizzeria',
    plural: 'Pizzerien',
    labelEn: 'Pizzeria',
    pluralEn: 'Pizzerias',
    keywords: ['pizza', 'pizzeria', 'italienisch'],
    description: 'frische Pizza und italienische Spezialitäten',
    descriptionDe: 'frische Pizza und italienische Spezialitäten',
    descriptionEn: 'fresh pizza and Italian specialties'
  },
  {
    slug: 'doener',
    label: 'Döner',
    plural: 'Döner-Imbisse',
    labelEn: 'Kebab',
    pluralEn: 'Kebab places',
    keywords: ['doener', 'döner', 'türkisch', 'turkish', 'kebab'],
    description: 'Döner Kebab und türkische Gerichte',
    descriptionDe: 'Döner Kebab und türkische Gerichte',
    descriptionEn: 'doner kebab and Turkish dishes'
  },
  {
    slug: 'fischrestaurant',
    label: 'Fischrestaurant',
    plural: 'Fischrestaurants',
    labelEn: 'Fish restaurant',
    pluralEn: 'Fish restaurants',
    keywords: ['fisch', 'fischrestaurant', 'meeresfrüchte', 'meeresfruechte', 'krabben', 'seafood'],
    description: 'frischer Fisch und Krabben aus der Nordsee',
    descriptionDe: 'frischer Fisch und Krabben aus der Nordsee',
    descriptionEn: 'fresh fish and North Sea shrimp'
  },
  {
    slug: 'griechisches-restaurant',
    label: 'Griechisches Restaurant',
    plural: 'Griechische Restaurants',
    labelEn: 'Greek restaurant',
    pluralEn: 'Greek restaurants',
    keywords: ['griechisch', 'greek', 'gyros', 'souvlaki', 'rhodos', 'taverne'],
    description: 'griechische Klassiker vom Grill',
    descriptionDe: 'griechische Klassiker vom Grill – Gyros, Souvlaki, Bifteki und frische Salate',
    descriptionEn: 'Greek classics from the grill – gyros, souvlaki, bifteki and fresh salads'
  },
  {
    slug: 'cafe',
    label: 'Café',
    plural: 'Cafés',
    labelEn: 'Café',
    pluralEn: 'Cafés',
    keywords: ['cafe', 'café', 'kaffee', 'coffee', 'bistro', 'konditorei', 'baeckerei', 'bäckerei', 'eiscafe', 'eiscafé'],
    description: 'Kaffee, Kuchen und gemütliche Cafés',
    descriptionDe: 'Kaffee, hausgemachter Kuchen und gemütliche Cafés',
    descriptionEn: 'coffee, homemade cake and cozy cafés'
  },
  {
    slug: 'restaurant',
    label: 'Restaurant',
    plural: 'Restaurants',
    labelEn: 'Restaurant',
    pluralEn: 'Restaurants',
    keywords: [],   // leer => matcht alle
    description: 'gemütliche Restaurants mit deutscher und internationaler Küche',
    descriptionDe: 'gemütliche Restaurants mit deutscher und internationaler Küche',
    descriptionEn: 'cozy restaurants with German and international cuisine'
  }
];

// ==================== UTILS ====================

function normalize(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function jsonEscape(obj) {
  // safe JSON for embedding into <script type="application/ld+json">
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function cityMatches(rest, city) {
  if (!rest || !rest.city) return false;
  return normalize(rest.city) === normalize(city.name);
}

function categoryMatches(rest, cat) {
  if (!cat.keywords || cat.keywords.length === 0) return true;   // restaurant -> alle
  if (!rest) return false;

  const haystack = [];
  if (rest.cuisine) haystack.push(normalize(rest.cuisine));
  if (Array.isArray(rest.cuisine_type)) {
    rest.cuisine_type.forEach(function(c) { if (c) haystack.push(normalize(c)); });
  }
  const blob = haystack.join(' ');
  return cat.keywords.some(function(kw) { return blob.indexOf(normalize(kw)) !== -1; });
}

function ratingStars(rating) {
  const r = Number(rating) || 0;
  const full = Math.floor(r);
  const half = (r - full) >= 0.5;
  let out = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) out += '★';
    else if (i === full && half) out += '★';
    else out += '☆';
  }
  return out;
}

// WIE VIELE ECHTE BEWERTUNGEN GIBT ES?
//
// Ein Sternewert allein ist keine Bewertung. In der Datenbank kann rating
// von Hand eingetragen sein -- dann steht dort etwa 4.8, ohne dass je
// jemand etwas geschrieben haette. Wer daraus eine aggregateRating baut,
// laesst Google Sterne anzeigen, hinter denen nichts steht.
//
// Diese Funktion liefert nur, was belegbar ist: die Zahl echter
// Bewertungen. Ist sie 0, wird keine Bewertung ausgezeichnet -- weder im
// Schema noch sichtbar auf der Karte.
function echteBewertungen(rest) {
    if (!rest) return 0;
    var n = Number(rest.rating_count);
    return (isFinite(n) && n > 0) ? Math.round(n) : 0;
}

function fmtRating(rating) {
  const r = Number(rating);
  if (!r || isNaN(r)) return '';
  return r.toFixed(1).replace('.', ',');
}

function safeText(s, fallback) {
  if (s == null || s === '') return fallback || '';
  return String(s);
}

// ==================== DATA FETCH ====================

async function fetchRestaurants() {
  const url = SUPABASE_URL + '/rest/v1/restaurants?or=(is_active.eq.true,is_active.is.null)&select=*';
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error('Supabase HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200));
  }
  return await res.json();
}

async function fetchMenuItems(restaurantId) {
  // Bis zu 30 verfügbare Items, populaere zuerst, dann nach sort_order
  // Fault-tolerant: bei Fehler leeres Array zurueck, Page wird trotzdem gebaut
  if (!restaurantId) return [];
  const url = SUPABASE_URL + '/rest/v1/menu_items'
    + '?restaurant_id=eq.' + encodeURIComponent(restaurantId)
    + '&is_available=eq.true'
    // "price" gibt es nicht -- die Spalte heisst base_price.
    //
    // Mit dem falschen Namen antwortete PostgREST mit 400, der
    // Fault-tolerant-Zweig sprang an und lieferte ein leeres Array. Die
    // Seite wurde also gebaut, nur OHNE GERICHTE. Google sah eine
    // Restaurantseite ohne Speisekarte, und niemandem fiel es auf, weil
    // hier kein Fehler geworfen wird.
    //
    // 134 Fehlversuche in knapp einem Tag -- fuer jeden Betrieb bei
    // jedem Bau.
    + '&select=name,description,base_price,image_url,is_popular,menu_categories(name)'
    + '&order=is_popular.desc,sort_order.asc'
    + '&limit=30';
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function fetchReviews(targetId) {
  // Bis zu 10 freigegebene Bewertungen mit Text, neueste zuerst.
  // Speist die einzelnen Review-Schemas auf der Restaurant-Seite ->
  // damit Google echte Bewertungen (mit Text) zeigt, nicht nur den
  // aggregierten Durchschnitt. Fault-tolerant: bei Fehler leeres Array.
  if (!targetId) return [];
  const url = SUPABASE_URL + '/rest/v1/reviews'
    + '?target_type=eq.restaurant'
    + '&target_id=eq.' + encodeURIComponent(targetId)
    + '&is_approved=eq.true'
    // "author_name" gibt es nicht -- der Name des Gastes steht in
    // customer_name. Dieselbe Geschichte wie oben: 400, leeres Array,
    // Seite ohne Bewertungen. Google bekam vom Restaurant nur den
    // Durchschnitt zu sehen, nie einen echten Satz.
    + '&select=rating,title,comment,customer_name,created_at'
    + '&order=created_at.desc'
    + '&limit=10';
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

function fmtPrice(item) {
  const p = item.base_price;
  if (p == null || p === '') return '';
  const n = Number(p);
  if (isNaN(n)) return '';
  return n.toFixed(2).replace('.', ',') + ' €';
}

// ==================== CONTENT ====================

function buildIntro(city, cat, count) {
  // ~200-300 Woerter, einzigartig pro (city, cat)
  const cityName = city.name;
  const region = city.region || 'Ostfriesland';
  const plural = cat.plural;
  const desc = cat.descriptionDe || cat.description;

  const isRestaurant = cat.slug === 'restaurant';
  const isFish = cat.slug === 'fischrestaurant';
  const isPizza = cat.slug === 'pizzeria';
  const isDoener = cat.slug === 'doener';

  let regionText;
  if (region === 'Krummhörn' || region === 'Krummhörn') {
    regionText = 'Greetsiel ist eines der malerischsten Fischerdörfer der Krummhörn an der ostfriesischen Nordseeküste. Zwischen Zwillingsmühlen und Hafen findet sich hier eine überraschend dichte Auswahl an Gastronomie.';
  } else if (cityName === 'Norddeich') {
    regionText = 'Norddeich ist das Tor zu Juist und Norderney – direkt am Wattenmeer gelegen. Wer hier gegessen hat, weiß: Frische Nordsee-Produkte sind keine Werbung, sondern Standard.';
  } else if (cityName === 'Norden') {
    regionText = 'Norden ist das gastronomische Herz der nordwestlichen Ostfriesischen Halbinsel. Vom historischen Marktplatz bis zur Teemuseums-Nähe gibt es hier Gerichte für jeden Geschmack.';
  } else if (cityName === 'Aurich') {
    regionText = 'Aurich, die heimliche Hauptstadt Ostfrieslands, vereint norddeutsche Gemütlichkeit mit kulinarischer Vielfalt – vom traditionellen Wirtshaus bis zur modernen Küche.';
  } else if (cityName === 'Emden') {
    regionText = 'Emden, die größte Stadt Ostfrieslands und Hafenstadt mit Charakter, bietet eine überraschend bunte Gastronomie-Szene zwischen Delft, Ratsdelft und Innenstadt.';
  } else {
    regionText = cityName + ' liegt mitten in ' + region + ' und bietet ostfriesische Gastlichkeit mit echtem Charakter.';
  }

  let categoryText;
  if (isPizza) {
    categoryText = 'Italienische Küche gehört in ' + cityName + ' längst zum Alltag. Von dünner römischer Pizza über neapolitanischen Steinofen bis zur klassischen Familienpizzeria mit Holzofen – die Auswahl ist größer als viele denken. Viele Pizzerien liefern auch nach Hause oder ins Ferienhaus an der Küste.';
  } else if (isDoener) {
    categoryText = 'Döner Kebab gibt es in ' + cityName + ' in jeder Variante – vom klassischen Kalbsdöner bis zum vegetarischen Falafel-Wrap. Viele Imbisse haben bis spät abends geöffnet und liefern auch ins Umland.';
  } else if (isFish) {
    categoryText = 'Frischer Fisch und Krabben aus der Nordsee – das ist DIE kulinarische Spezialität von ' + cityName + '. Viele Fischrestaurants beziehen ihren Fang direkt aus dem Hafen, und die Krabbenbrötchen sind oft in einer Liga, die Tagesgäste sich gar nicht vorstellen können.';
  } else {
    categoryText = 'Von deftiger ostfriesischer Hausmannskost über moderne Bistro-Küche bis zu internationalen Spezialitäten: Die Restaurants in ' + cityName + ' decken jeden Geschmack ab. Viele bieten auch Reservierung online und Lieferung an.';
  }

  const countText = count > 0
    ? 'Aktuell findest du auf ' + BRAND + ' <strong>' + count + ' ' + (count === 1 ? cat.label : plural) + '</strong> in ' + cityName + ', die online verfügbar sind. Du kannst direkt die Speisekarte ansehen, online bestellen und – wo verfügbar – einen Tisch reservieren. Alles ohne versteckte Gebuehren.'
    : '';

  return '<p>' + escapeHtml(regionText) + ' ' + escapeHtml(categoryText) + '</p>' +
         '<p>' + countText + '</p>' +
         '<p>' + BRAND + ' ist die ostfriesische Gastro-Plattform – wir verbinden Gäste mit lokalen Wirten und Wirtinnen, ohne Ketten, ohne Konzern, ohne hohe Provisionen. Wenn du bei einem ' + escapeHtml(cat.label) + ' in ' + escapeHtml(cityName) + ' bestellst, bleibt das Geld in der Region.</p>';
}

// Die Empfehlungs-Frage ist GENAU die Frage, die Gaeste (und KI-Assistenten
// mit Web-Suche) stellen. Die Antwort nennt die Betriebe beim Namen -
// ehrlich nach Bewertung sortiert, nur echte Daten.
function buildEmpfehlungsFaq(cityName, plural, matched, isEn) {
  if (!matched || !matched.length) return null;
  const top = matched.slice().sort(function(a, b) {
    return (Number(b.rating) || 0) - (Number(a.rating) || 0);
  }).slice(0, 3);
  const namen = top.map(function(r) {
    const rating = Number(r.rating);
    return r.name + (rating >= 4 ? (isEn ? ' (' + fmtRating(rating) + ' of 5 stars)' : ' (' + fmtRating(rating) + ' von 5 Sternen)') : '');
  });
  if (isEn) {
    return {
      q: 'Which ' + plural + ' in ' + cityName + ' are recommended?',
      a: 'Popular with guests on ' + BRAND + ' right now: ' + namen.join(', ') + '. ' +
         'All with a current menu, real guest reviews and free online table booking on ' + BRAND + '.'
    };
  }
  return {
    q: 'Welche ' + plural + ' in ' + cityName + ' sind zu empfehlen?',
    a: 'Bei Gästen auf ' + BRAND + ' aktuell beliebt: ' + namen.join(', ') + '. ' +
       'Alle mit aktueller Speisekarte, echten Gäste-Bewertungen und kostenloser Online-Tischreservierung auf ' + BRAND + '.'
  };
}

function buildFaqs(city, cat, matched) {
  const cityName = city.name;
  const plural = cat.plural;
  const label = cat.label;
  const empfehlung = buildEmpfehlungsFaq(cityName, plural, matched, false);

  return (empfehlung ? [empfehlung] : []).concat([
    {
      q: 'Welche ' + plural + ' liefern in ' + cityName + '?',
      a: 'Auf ' + BRAND + ' siehst du direkt, welche ' + plural + ' in ' + cityName + ' aktuell liefern. Filter nach "Lieferung" und du bekommst alle Optionen, die in dein Postleitzahl-Gebiet liefern – inklusive Mindestbestellwert und Lieferzeit.'
    },
    {
      q: 'Was kostet ' + label + ' in ' + cityName + '?',
      a: 'Die Preise variieren je nach Anbieter. Auf den Speisekarten der einzelnen ' + plural + ' findest du tagesaktuelle Preise. ' + BRAND + ' nimmt keine Preisaufschläge – du zahlst genau das, was auch im Restaurant ausgezeichnet ist.'
    },
    {
      q: 'Welche ' + plural + ' haben heute geöffnet?',
      a: 'Die Oeffnungszeiten findest du auf jedem Restaurant-Profil. ' + BRAND + ' zeigt dir live, welche ' + plural + ' in ' + cityName + ' gerade geöffnet haben und Bestellungen annehmen.'
    },
    {
      q: 'Kann ich bei ' + plural + ' in ' + cityName + ' reservieren?',
      a: 'Ja – viele ' + plural + ' in ' + cityName + ' bieten online Tisch-Reservierung an. Klick einfach auf das gewuenschte Restaurant und wähle Datum, Uhrzeit und Personenzahl. Bestätigung kommt sofort.'
    }
  ]);
}

// ==================== ENGLISCHE VARIANTEN ====================

function buildIntroEn(city, cat, count) {
  const cityName = city.name;
  const region = city.region || 'East Frisia';
  const plural = cat.pluralEn || cat.plural;
  const label = cat.labelEn || cat.label;
  const desc = cat.descriptionEn || cat.description;

  const isRestaurant = cat.slug === 'restaurant';
  const isFish = cat.slug === 'fischrestaurant';
  const isPizza = cat.slug === 'pizzeria';
  const isDoener = cat.slug === 'doener';

  let regionText;
  if (region === 'Krummhörn' || region === 'Krummhörn') {
    regionText = 'Greetsiel is one of the most picturesque fishing villages of the Krummhörn on the East Frisian North Sea coast. Between the twin windmills and the harbour you will find a surprisingly dense selection of places to eat.';
  } else if (cityName === 'Norddeich') {
    regionText = 'Norddeich is the gateway to the islands of Juist and Norderney — right by the Wadden Sea. Anyone who has eaten here knows: fresh North Sea produce is not marketing here, it is standard.';
  } else if (cityName === 'Norden') {
    regionText = 'Norden is the culinary heart of the north-western East Frisian peninsula. From the historic market square to the Tea Museum quarter you will find dishes for every taste.';
  } else if (cityName === 'Aurich') {
    regionText = 'Aurich, the unofficial capital of East Frisia, combines North German coziness with a colourful culinary scene — from traditional inns to modern kitchens.';
  } else if (cityName === 'Emden') {
    regionText = 'Emden, the largest city in East Frisia and a harbour town with character, offers a surprisingly diverse gastronomy scene between Delft, Ratsdelft and the city centre.';
  } else {
    regionText = cityName + ' lies in the heart of ' + region + ' and offers East Frisian hospitality with real character.';
  }

  let categoryText;
  if (isPizza) {
    categoryText = 'Italian cuisine has long been part of daily life in ' + cityName + '. From thin Roman pizza to Neapolitan wood-fired ovens to the classic family pizzeria — the choice is wider than many people think. Many pizzerias also deliver to your home or holiday house on the coast.';
  } else if (isDoener) {
    categoryText = 'Doner kebab in ' + cityName + ' comes in every variation — from the classic veal kebab to vegetarian falafel wraps. Many shops are open late and also deliver to the surrounding area.';
  } else if (isFish) {
    categoryText = 'Fresh fish and North Sea shrimp are THE culinary specialty of ' + cityName + '. Many fish restaurants source their catch directly from the harbour, and the shrimp sandwiches are often in a league that day visitors simply cannot imagine.';
  } else {
    categoryText = 'From hearty East Frisian home cooking to modern bistro food to international specialties: the restaurants in ' + cityName + ' cover every taste. Many also offer online reservation and delivery.';
  }

  const countText = count > 0
    ? 'Right now ' + BRAND + ' lists <strong>' + count + ' ' + (count === 1 ? label : plural) + '</strong> in ' + cityName + ' that are available online. You can view the menu, order online and — where available — book a table directly. No hidden fees.'
    : '';

  return '<p>' + escapeHtml(regionText) + ' ' + escapeHtml(categoryText) + '</p>' +
         '<p>' + countText + '</p>' +
         '<p>' + BRAND + ' is the East Frisian gastronomy platform — we connect guests directly with local hosts, with no chains, no corporations and no high commissions. When you order from a ' + escapeHtml(label) + ' in ' + escapeHtml(cityName) + ', the money stays in the region.</p>';
}

function buildFaqsEn(city, cat, matched) {
  const cityName = city.name;
  const plural = cat.pluralEn || cat.plural;
  const label = cat.labelEn || cat.label;
  const empfehlung = buildEmpfehlungsFaq(cityName, plural, matched, true);

  return (empfehlung ? [empfehlung] : []).concat([
    {
      q: 'Which ' + plural + ' deliver in ' + cityName + '?',
      a: 'On ' + BRAND + ' you can see which ' + plural + ' in ' + cityName + ' currently deliver. Filter by "Delivery" and you get every option that delivers to your postcode — including minimum order value and delivery time.'
    },
    {
      q: 'How much does a ' + label.toLowerCase() + ' cost in ' + cityName + '?',
      a: 'Prices vary by restaurant. You can find up-to-date prices on the menu of each ' + plural.toLowerCase() + '. ' + BRAND + ' does not add any mark-ups — you pay exactly what is listed in the restaurant.'
    },
    {
      q: 'Which ' + plural + ' are open today?',
      a: 'Opening hours are shown on each restaurant profile. ' + BRAND + ' shows you live which ' + plural + ' in ' + cityName + ' are open right now and accepting orders.'
    },
    {
      q: 'Can I book a table at ' + plural + ' in ' + cityName + '?',
      a: 'Yes — many ' + plural + ' in ' + cityName + ' offer online table reservations. Click the restaurant of your choice and pick the date, time and number of guests. Confirmation is instant.'
    }
  ]);
}

// ==================== TEMPLATE ====================

function pageCss() {
  return `
    *,*::before,*::after{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;font-family:'Inter','Epilogue',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#fafaf7;line-height:1.6;-webkit-font-smoothing:antialiased}
    a{color:${PRIMARY_COLOR};text-decoration:none}
    a:hover{text-decoration:underline}
    img{max-width:100%;height:auto;display:block}
    .container{max-width:1200px;margin:0 auto;padding:0 20px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .fade{animation:fadeUp .5s ease both}
    .fade.d1{animation-delay:.06s}.fade.d2{animation-delay:.12s}.fade.d3{animation-delay:.18s}
    header.site{background:${PRIMARY_COLOR};color:#fff;padding:14px 0;position:sticky;top:0;z-index:50;box-shadow:0 2px 12px rgba(0,0,0,.12)}
    header.site .row{display:flex;align-items:center;justify-content:space-between;gap:16px}
    header.site .logo{font-weight:800;font-size:21px;color:#fff;text-decoration:none;letter-spacing:-.02em}
    header.site .logo span{color:${ACCENT_COLOR}}
    header.site nav a{color:#fff;margin-left:18px;font-size:14px;opacity:.92}
    header.site nav a:hover{opacity:1}
    .breadcrumb{font-size:13px;color:#666;padding:14px 0 0}
    .breadcrumb a{color:#666}
    .breadcrumb .sep{margin:0 6px;color:#bbb}
    h1{font-size:clamp(28px,4.5vw,42px);line-height:1.15;margin:18px 0 8px;color:${PRIMARY_COLOR};font-weight:800;letter-spacing:-.02em}
    .subtitle{font-size:18px;color:#555;margin:0 0 28px}
    .intro{background:#fff;border-radius:14px;padding:24px;margin:0 0 32px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .intro p{margin:0 0 12px}
    .intro p:last-child{margin-bottom:0}
    h2{font-size:26px;margin:36px 0 18px;color:${PRIMARY_COLOR};font-weight:700;letter-spacing:-.01em}
    .grid{display:grid;grid-template-columns:1fr;gap:18px}
    @media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}
    @media(min-width:960px){.grid{grid-template-columns:repeat(3,1fr)}}
    .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s;display:flex;flex-direction:column}
    .card:hover{transform:translateY(-4px);box-shadow:0 12px 28px rgba(0,40,30,.12)}
    .card .img{aspect-ratio:16/10;background:#eee linear-gradient(135deg,#e6f0ee,#cfe0dc);background-size:cover;background-position:center;transition:transform .3s}
    .card:hover .img{transform:scale(1.04)}
    .card .body{padding:16px;flex:1;display:flex;flex-direction:column;gap:8px}
    .card h3{margin:0;font-size:18px;color:${PRIMARY_COLOR};font-weight:700}
    .card .stars{color:${ACCENT_COLOR};font-size:15px;letter-spacing:1px}
    .card .stars .num{color:#666;font-size:13px;margin-left:6px;letter-spacing:0}
    .card .addr{color:#666;font-size:14px;margin:0}
    .card .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:6px}
    .card .tag{font-size:11px;background:#eef5f3;color:${PRIMARY_COLOR};padding:3px 9px;border-radius:99px;font-weight:500}
    .card .btn{margin-top:10px;display:inline-block;background:${PRIMARY_COLOR};color:#fff;padding:10px 14px;border-radius:8px;text-align:center;font-weight:600;font-size:14px}
    .card .btn:hover{background:#002a23;text-decoration:none;color:#fff}
    /* Restaurant-Hero */
    .hero{position:relative;border-radius:20px;overflow:hidden;margin:18px 0 22px;min-height:300px;display:flex;align-items:flex-end;box-shadow:0 8px 30px rgba(0,40,30,.14)}
    .hero .bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.02)}
    .hero .ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,40,33,.12) 0%,rgba(0,40,33,.55) 55%,rgba(0,40,33,.86) 100%)}
    .hero .inner{position:relative;padding:28px 26px;color:#fff;width:100%}
    .hero .inner h1{color:#fff;margin:0 0 8px}
    .hero .meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;font-size:15px;font-weight:500}
    .hero .meta .hstars{color:${ACCENT_COLOR};font-size:17px;letter-spacing:1px}
    .hero .meta .dot{opacity:.5}
    .hero-fallback{background:linear-gradient(135deg,${PRIMARY_COLOR},#00574a)}
    /* Trust-Badges */
    .trust{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 28px}
    .trust .b{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #e8efed;border-radius:99px;padding:8px 15px;font-size:13px;font-weight:600;color:${PRIMARY_COLOR};box-shadow:0 1px 2px rgba(0,0,0,.03)}
    .trust .b .i{font-size:15px}
    /* CTA-Buttons */
    .cta-primary{display:inline-flex;align-items:center;gap:8px;background:${PRIMARY_COLOR};color:#fff;padding:15px 30px;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 6px 18px rgba(0,40,30,.22);transition:transform .15s,box-shadow .15s}
    .cta-primary:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,40,30,.3);text-decoration:none;color:#fff}
    .cta-ghost{display:inline-flex;align-items:center;gap:8px;background:#fff;color:${PRIMARY_COLOR};border:2px solid ${PRIMARY_COLOR};padding:12px 26px;border-radius:12px;font-weight:700;font-size:15px;transition:background .15s,color .15s}
    .cta-ghost:hover{background:${PRIMARY_COLOR};color:#fff;text-decoration:none}
    /* Reviews */
    .reviews-seo .rv{background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);border:1px solid #f0f3f1}
    /* Sticky mobile bestellen-Leiste */
    .sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:60;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-top:1px solid #e6ece9;padding:10px 16px;display:none;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 -4px 20px rgba(0,0,0,.08)}
    .sticky-cta .lbl{font-size:13px;font-weight:700;color:${PRIMARY_COLOR};line-height:1.2}
    .sticky-cta .lbl small{display:block;font-weight:500;color:#888;font-size:11px}
    .sticky-cta a{flex-shrink:0}
    @media(max-width:760px){.sticky-cta{display:flex}main.container{padding-bottom:80px}}
    .crosslinks{background:#fff;border-radius:14px;padding:22px;margin:32px 0}
    .crosslinks h3{margin:0 0 10px;font-size:16px;color:${PRIMARY_COLOR}}
    .crosslinks .links{display:flex;flex-wrap:wrap;gap:8px}
    .crosslinks .links a{display:inline-block;background:#eef5f3;color:${PRIMARY_COLOR};padding:6px 12px;border-radius:99px;font-size:14px;transition:background .15s,color .15s}
    .crosslinks .links a:hover{background:${PRIMARY_COLOR};color:#fff;text-decoration:none}
    details.faq{background:#fff;border-radius:10px;padding:14px 18px;margin:0 0 8px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
    details.faq summary{cursor:pointer;font-weight:600;color:${PRIMARY_COLOR};list-style:none}
    details.faq summary::-webkit-details-marker{display:none}
    details.faq summary::after{content:'+';float:right;font-size:20px;color:${PRIMARY_COLOR};font-weight:300}
    details.faq[open] summary::after{content:'−'}
    details.faq p{margin:10px 0 0;color:#444}
    footer.site{background:${PRIMARY_COLOR};color:#fff;padding:30px 0;margin-top:50px;font-size:14px}
    footer.site a{color:#fff;text-decoration:underline}
    footer.site .row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px}
    .empty{padding:30px;text-align:center;color:#666;background:#fff;border-radius:14px}
  `.replace(/\n\s+/g, '');
}

function renderCard(rest) {
  const slug = rest.slug || rest.id;
  const link = '/' + encodeURIComponent(slug);
  const name = escapeHtml(safeText(rest.name, 'Restaurant'));
  const img = rest.image || rest.logo || '';
  const imgStyle = img ? 'background-image:url(' + escapeAttr(img) + ')' : '';
  const r = fmtRating(rest.rating);
  const stars = ratingStars(rest.rating);
  const street = rest.street ? escapeHtml(rest.street) + ', ' : '';
  const zip = rest.zip ? escapeHtml(rest.zip) + ' ' : '';
  const city = escapeHtml(safeText(rest.city, ''));
  const addr = (street + zip + city).trim();
  const tagSet = new Set();
  if (rest.cuisine) tagSet.add(String(rest.cuisine));
  if (Array.isArray(rest.cuisine_type)) rest.cuisine_type.forEach(function(c) { if (c) tagSet.add(String(c)); });
  const tags = Array.from(tagSet).slice(0, 3).map(function(t) {
    return '<span class="tag">' + escapeHtml(t) + '</span>';
  }).join('');

  return '' +
    '<article class="card" itemscope itemtype="https://schema.org/Restaurant">' +
      '<a href="' + escapeAttr(link) + '" aria-label="' + name + ' Speisekarte ansehen">' +
        '<div class="img" style="' + imgStyle + '" role="img" aria-label="' + name + '"></div>' +
      '</a>' +
      '<div class="body">' +
        '<h3 itemprop="name"><a href="' + escapeAttr(link) + '">' + name + '</a></h3>' +
        // Sterne nur, wenn echte Bewertungen dahinterstehen. Ein von Hand
        // eingetragener Wert ohne eine einzige Bewertung ist keine.
        ((r && echteBewertungen(rest)) ? '<div class="stars" itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">' +
              stars + '<span class="num"><span itemprop="ratingValue">' + r + '</span> / 5</span>'
              + '<meta itemprop="ratingCount" content="' + echteBewertungen(rest) + '"></div>' : '') +
        (addr ? '<p class="addr" itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">' +
                  '<span itemprop="streetAddress">' + escapeHtml(safeText(rest.street, '')) + '</span> ' +
                  '<span itemprop="postalCode">' + escapeHtml(safeText(rest.zip, '')) + '</span> ' +
                  '<span itemprop="addressLocality">' + city + '</span>' +
                '</p>' : '') +
        '<div class="tags">' + tags + '</div>' +
        '<a class="btn" href="' + escapeAttr(link) + '">Speisekarte ansehen</a>' +
      '</div>' +
    '</article>';
}

function buildItemListJsonLd(restaurants, pageUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'itemListElement': restaurants.slice(0, 10).map(function(rest, idx) {
      const slug = rest.slug || rest.id;
      const item = {
        '@type': 'Restaurant',
        '@id': SITE_URL + '/' + slug,
        'name': safeText(rest.name, 'Restaurant'),
        'url': SITE_URL + '/' + slug
      };
      if (rest.image) item.image = rest.image;
      if (rest.phone) item.telephone = rest.phone;
      if (rest.street || rest.zip || rest.city) {
        item.address = {
          '@type': 'PostalAddress',
          'streetAddress': safeText(rest.street, ''),
          'postalCode': safeText(rest.zip, ''),
          'addressLocality': safeText(rest.city, ''),
          'addressCountry': 'DE'
        };
      }
      if (rest.lat && rest.lng) {
        item.geo = {
          '@type': 'GeoCoordinates',
          'latitude': rest.lat,
          'longitude': rest.lng
        };
      }
      // Nur mit echten Bewertungen. Hier stand "rating_count || 5" -- ein
      // Restaurant ohne eine einzige Bewertung bekam damit fuenf erfundene.
      var _anz = echteBewertungen(rest);
      if (rest.rating && _anz > 0) {
        item.aggregateRating = {
          '@type': 'AggregateRating',
          'ratingValue': Number(rest.rating),
          'bestRating': 5,
          'ratingCount': _anz
        };
      }
      const cuisines = [];
      if (rest.cuisine) cuisines.push(rest.cuisine);
      if (Array.isArray(rest.cuisine_type)) rest.cuisine_type.forEach(function(c) { if (c) cuisines.push(c); });
      if (cuisines.length) item.servesCuisine = cuisines;
      item.priceRange = '€€';
      return {
        '@type': 'ListItem',
        'position': idx + 1,
        'item': item
      };
    })
  };
}

function buildBreadcrumbJsonLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': crumbs.map(function(c, i) {
      return {
        '@type': 'ListItem',
        'position': i + 1,
        'name': c.name,
        'item': c.url
      };
    })
  };
}

function buildFaqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map(function(f) {
      return {
        '@type': 'Question',
        'name': f.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
      };
    })
  };
}

function renderHeader(activeCity, activeCat) {
  return '' +
    '<header class="site"><div class="container row">' +
      '<a class="logo" href="/">Kiek mol <span>in</span></a>' +
      '<nav><a href="/">Zur Hauptseite</a></nav>' +
    '</div></header>';
}

function renderFooter() {
  return '' +
    '<footer class="site"><div class="container row">' +
      '<div>&copy; ' + new Date().getFullYear() + ' Kiek mol in – Ostfrieslands Gastro-Plattform</div>' +
      '<div>' +
        '<a href="/">Startseite</a> · ' +
        '<a href="/?page=impressum">Impressum</a> · ' +
        '<a href="/?page=datenschutz">Datenschutz</a> · ' +
        '<a href="/?page=kontakt">Kontakt</a>' +
      '</div>' +
    '</div></footer>';
}

function renderBreadcrumb(crumbs) {
  return '<div class="breadcrumb container">' +
    crumbs.map(function(c, i) {
      const last = i === crumbs.length - 1;
      const sep = i > 0 ? '<span class="sep">›</span>' : '';
      if (last) return sep + '<span aria-current="page">' + escapeHtml(c.name) + '</span>';
      return sep + '<a href="' + escapeAttr(c.url.replace(SITE_URL, '')) + '">' + escapeHtml(c.name) + '</a>';
    }).join('') +
    '</div>';
}

// Slugs, die in diesem Build wirklich als Datei entstehen. Wird in main()
// VOR dem Generieren gefuellt (buildAvailableSlugs). Solange das Set leer ist,
// verhaelt sich alles wie frueher.
const AVAILABLE_SLUGS = new Set();
let AVAILABLE_SLUGS_READY = false;

function slugExists(slug) {
  // Solange die Liste nicht ermittelt wurde (z.B. Aufruf ausserhalb von main),
  // verhalten wir uns wie frueher. Ist sie ermittelt, gilt sie strikt -- auch
  // wenn sie leer ist (dann gibt es schlicht keine verlinkbaren Seiten).
  if (!AVAILABLE_SLUGS_READY) return true;
  return AVAILABLE_SLUGS.has(slug);
}

// Vorab ermitteln, welche Ort-/Kategorie-Seiten ueberhaupt gebaut werden.
// Dieselben Filter wie in den Generatoren -- eine Seite entsteht nur, wenn
// mindestens ein Partner-Restaurant passt.
function buildAvailableSlugs(restaurants) {
  AVAILABLE_SLUGS.clear();
  AVAILABLE_SLUGS_READY = true;
  CITIES.forEach(function(city) {
    if (restaurants.some(function(r) { return cityMatches(r, city); })) {
      AVAILABLE_SLUGS.add('restaurants-' + city.slug);
    }
    CATEGORIES.forEach(function(cat) {
      if (cat.slug === 'restaurant') return; // wird bewusst nie gebaut
      if (restaurants.some(function(r) { return cityMatches(r, city) && categoryMatches(r, cat); })) {
        AVAILABLE_SLUGS.add(cat.slug + '-' + city.slug);
      }
    });
  });
  CATEGORIES.forEach(function(cat) {
    if (cat.slug === 'restaurant') return;
    if (restaurants.some(function(r) { return categoryMatches(r, cat); })) {
      AVAILABLE_SLUGS.add(cat.slug + '-ostfriesland');
    }
  });
  return AVAILABLE_SLUGS;
}

function renderCrossLinks(currentCity, currentCat) {
  const otherCats = CATEGORIES.filter(function(c) { return c.slug !== currentCat.slug; });
  const otherCities = CITIES.filter(function(c) { return c.slug !== currentCity.slug; });

  // NUR auf Seiten verlinken, die es wirklich gibt. Vorher wurde blind ueber
  // alle Kategorien x Orte iteriert -- von 16 Links existierte teils einer.
  // Weil der Catch-All in netlify.toml jede unbekannte URL mit Status 200 als
  // Startseite ausliefert, sah Google dutzende Seiten mit gleichem Inhalt
  // (Soft-404-Cluster) statt sauberer 404 -- das verbrennt Crawl-Budget und
  // drueckt die Bewertung der ganzen Domain.
  const catLinks = otherCats.filter(function(c) { return slugExists(c.slug + '-' + currentCity.slug); });
  const cityLinks = otherCities.filter(function(c) { return slugExists(currentCat.slug + '-' + c.slug); });
  const hasRegion = slugExists(currentCat.slug + '-ostfriesland');

  if (!catLinks.length && !cityLinks.length && !hasRegion) return '';

  let html = '<section class="crosslinks">';
  if (catLinks.length) {
    html += '<h3>Auch beliebt in ' + escapeHtml(currentCity.name) + '</h3>';
    html += '<div class="links">';
    catLinks.forEach(function(c) {
      html += '<a href="/' + c.slug + '-' + currentCity.slug + '">' + escapeHtml(c.label) + ' in ' + escapeHtml(currentCity.name) + '</a>';
    });
    html += '</div>';
  }

  if (cityLinks.length || hasRegion) {
    html += '<h3 style="margin-top:18px">' + escapeHtml(currentCat.plural) + ' in der Region</h3>';
    html += '<div class="links">';
    cityLinks.forEach(function(c) {
      html += '<a href="/' + currentCat.slug + '-' + c.slug + '">' + escapeHtml(currentCat.label) + ' in ' + escapeHtml(c.name) + '</a>';
    });
    if (hasRegion) html += '<a href="/' + currentCat.slug + '-ostfriesland">Alle ' + escapeHtml(currentCat.plural) + ' in Ostfriesland</a>';
    html += '</div>';
  }
  html += '</section>';
  return html;
}

function renderFaqAccordion(faqs) {
  return faqs.map(function(f) {
    return '<details class="faq"><summary>' + escapeHtml(f.q) + '</summary><p>' + escapeHtml(f.a) + '</p></details>';
  }).join('');
}

function buildPage(opts) {
  // opts: { title, description, canonical, h1, intro, restaurants, faqs, breadcrumbs, city, category }
  const itemList = buildItemListJsonLd(opts.restaurants || [], opts.canonical);
  const breadcrumb = buildBreadcrumbJsonLd(opts.breadcrumbs || []);
  const faqLd = buildFaqJsonLd(opts.faqs || []);

  const grid = (opts.restaurants && opts.restaurants.length)
    ? '<div class="grid">' + opts.restaurants.slice(0, 10).map(renderCard).join('') + '</div>'
    : '<div class="empty">Aktuell keine passenden Restaurants gelistet. Schau später wieder vorbei oder besuche <a href="/">die Hauptseite</a>.</div>';

  const crossLinks = (opts.city && opts.category) ? renderCrossLinks(opts.city, opts.category) : '';
  const lang = opts.lang || 'de';
  // hreflang-Paare fuer Google: jede Seite verlinkt auf ihre andersprachige
  // Variante. canonical zeigt auf die Sprachversion der aktuellen Seite.
  const hreflangBlock = opts.altDe || opts.altEn
    ? (opts.altDe ? '<link rel="alternate" hreflang="de" href="' + escapeAttr(opts.altDe) + '">\n' : '') +
      (opts.altEn ? '<link rel="alternate" hreflang="en" href="' + escapeAttr(opts.altEn) + '">\n' : '') +
      '<link rel="alternate" hreflang="x-default" href="' + escapeAttr(opts.altDe || opts.altEn) + '">\n'
    : '';

  return '<!DOCTYPE html>\n<html lang="' + lang + '">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + escapeHtml(opts.title) + '</title>\n' +
    '<meta name="description" content="' + escapeAttr(opts.description) + '">\n' +
    '<link rel="canonical" href="' + escapeAttr(opts.canonical) + '">\n' +
    hreflangBlock +
    '<meta name="robots" content="index,follow,max-image-preview:large">\n' +
    '<meta name="geo.region" content="DE-NI">\n' +
    '<meta name="geo.placename" content="' + escapeAttr(opts.city ? opts.city.name : 'Ostfriesland') + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + escapeAttr(opts.title) + '">\n' +
    '<meta property="og:description" content="' + escapeAttr(opts.description) + '">\n' +
    '<meta property="og:url" content="' + escapeAttr(opts.canonical) + '">\n' +
    '<meta property="og:locale" content="' + (lang === 'en' ? 'en_GB' : 'de_DE') + '">\n' +
    '<meta property="og:site_name" content="' + BRAND + '">\n' +
    // Vorschaubild: Ohne og:image zeigt ein geteilter Link in WhatsApp,
    // Facebook & Co. gar nichts -- obwohl twitter:card
    // "summary_large_image" verspricht.
    '<meta property="og:image" content="' + SITE_URL + '/og-image.png">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:image" content="' + SITE_URL + '/og-image.png">\n' +
    '<meta name="twitter:title" content="' + escapeAttr(opts.title) + '">\n' +
    '<meta name="twitter:description" content="' + escapeAttr(opts.description) + '">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n' +
    '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">\n' +
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n' +
    '<style>' + pageCss() + '</style>\n' +
    '<script type="application/ld+json">' + jsonEscape(breadcrumb) + '</script>\n' +
    (opts.restaurants && opts.restaurants.length ? '<script type="application/ld+json">' + jsonEscape(itemList) + '</script>\n' : '') +
    '<script type="application/ld+json">' + jsonEscape(faqLd) + '</script>\n' +
    '</head>\n<body>\n' +
    renderHeader() + '\n' +
    renderBreadcrumb(opts.breadcrumbs || []) + '\n' +
    '<main class="container">\n' +
    '<h1>' + escapeHtml(opts.h1) + '</h1>\n' +
    (opts.subtitle ? '<p class="subtitle">' + escapeHtml(opts.subtitle) + '</p>\n' : '') +
    '<div class="intro">' + opts.intro + '</div>\n' +
    '<h2>' + escapeHtml(opts.gridHeading || 'Top-Empfehlungen') + '</h2>\n' +
    grid + '\n' +
    crossLinks + '\n' +
    '<h2 id="faq">Häufig gestellte Fragen</h2>\n' +
    renderFaqAccordion(opts.faqs || []) + '\n' +
    '</main>\n' +
    renderFooter() + '\n' +
    '</body></html>\n';
}

function buildRestaurantJsonLd(rest, reviews) {
  const slug = rest.slug || rest.id;
  const item = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': SITE_URL + '/' + slug,
    'name': safeText(rest.name, 'Restaurant'),
    'url': SITE_URL + '/' + slug
  };
  // image ist fuer LocalBusiness-Rich-Results faktisch Pflicht -- ohne Bild
  // zeigt Google gar kein Rich Result. Daher immer ein Fallback setzen.
  item.image = rest.image || (SITE_URL + '/og-image.png');
  if (rest.logo) item.logo = rest.logo;
  if (rest.phone) item.telephone = rest.phone;
  if (rest.email) item.email = rest.email;
  if (rest.website) item.sameAs = [rest.website];
  if (rest.description) item.description = String(rest.description).slice(0, 300);
  if (rest.street || rest.zip || rest.city) {
    item.address = {
      '@type': 'PostalAddress',
      'streetAddress': safeText(rest.street, ''),
      'postalCode': safeText(rest.zip, ''),
      'addressLocality': safeText(rest.city, ''),
      'addressCountry': 'DE'
    };
  }
  if (rest.lat && rest.lng) {
    item.geo = {
      '@type': 'GeoCoordinates',
      'latitude': Number(rest.lat),
      'longitude': Number(rest.lng)
    };
  }
  // Einzelne echte Bewertungen mit Text -> Google kann Sterne + Snippets
  // zeigen. AggregateRating MUSS durch echte Reviews gedeckt sein, sonst
  // ignoriert/abstraft Google die Sterne. Daher: nur wenn Reviews da sind.
  const realReviews = Array.isArray(reviews)
    ? reviews.filter(function(rv) { return rv && Number(rv.rating) > 0; })
    : [];
  if (realReviews.length) {
    item.review = realReviews.slice(0, 10).map(function(rv) {
      const r = {
        '@type': 'Review',
        'reviewRating': {
          '@type': 'Rating',
          'ratingValue': Number(rv.rating),
          'bestRating': 5,
          'worstRating': 1
        },
        'author': {
          '@type': 'Person',
          'name': safeText(rv.customer_name, 'Gast')
        }
      };
      const body = safeText(rv.comment || rv.title, '');
      if (body) r.reviewBody = String(body).slice(0, 500);
      if (rv.created_at) r.datePublished = String(rv.created_at).slice(0, 10);
      return r;
    });
    // ratingCount auf die Zahl echter Bewertungen stuetzen (ehrlich).
    const ratingVals = realReviews.map(function(rv) { return Number(rv.rating); });
    const avg = ratingVals.reduce(function(a, b) { return a + b; }, 0) / ratingVals.length;
    item.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': Number((rest.rating ? Number(rest.rating) : avg).toFixed(1)),
      'bestRating': 5,
      'reviewCount': realReviews.length,
      // Nicht ueber das hinaus, was wirklich da ist: Math.max mit
      // rating_count haette einen zu hoch eingetragenen Wert uebernommen.
      'ratingCount': Math.max(realReviews.length, echteBewertungen(rest))
    };
  } else if (rest.rating && echteBewertungen(rest) > 0) {
    // Kein Bewertungstext, aber eine belegte Anzahl -- dann nur der
    // aggregierte Wert, mit der ECHTEN Anzahl.
    //
    // Hier stand vorher "best effort" mit ratingCount: rating_count || 5.
    // Das war der Grund, warum unter dem Google-Treffer Sterne standen,
    // hinter denen keine einzige Bewertung lag.
    item.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': Number(rest.rating),
      'bestRating': 5,
      'ratingCount': echteBewertungen(rest)
    };
  }
  const cuisines = [];
  if (rest.cuisine) cuisines.push(rest.cuisine);
  if (Array.isArray(rest.cuisine_type)) rest.cuisine_type.forEach(function(c) { if (c) cuisines.push(c); });
  if (cuisines.length) item.servesCuisine = cuisines;
  item.priceRange = rest.price_range || '€€';
  item.currenciesAccepted = 'EUR';
  item.acceptsReservations = kannReservieren(rest);
  if (rest.lat && rest.lng) {
    item.hasMap = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(Number(rest.lat) + ',' + Number(rest.lng));
  } else if (rest.street && rest.city) {
    item.hasMap = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent([rest.name, rest.street, rest.city].filter(Boolean).join(' '));
  }
  // Bestellen/Reservieren als Aktionen auszeichnen -- genau diese loesen in
  // Google die Buttons "Online bestellen" bzw. "Tisch reservieren" aus. Auf
  // der Startseite standen sie laengst, auf den Detailseiten fehlten sie.
  // Nur die Aktionen auszeichnen, die es auch gibt. Eine ReserveAction bei
  // einem Haus ohne Reservierung ist eine Falschaussage an Google.
  const aktionen = [];
  if (kannBestellen(rest)) aktionen.push(
    {
      '@type': 'OrderAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': SITE_URL + '/?r=' + encodeURIComponent(slug),
        'inLanguage': 'de-DE',
        'actionPlatform': [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform'
        ]
      },
      'deliveryMethod': ['http://purl.org/goodrelations/v1#DeliveryModePickUp',
                         'http://purl.org/goodrelations/v1#DeliveryModeOwnFleet']
    });
  if (kannReservieren(rest)) aktionen.push(
    {
      '@type': 'ReserveAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': SITE_URL + '/?r=' + encodeURIComponent(slug) + '&action=reserve',
        'inLanguage': 'de-DE',
        'actionPlatform': [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform'
        ]
      },
      'result': { '@type': 'FoodEstablishmentReservation', 'name': 'Tischreservierung' }
    });
  if (aktionen.length) item.potentialAction = aktionen;
  const oeff = parseOeffnungszeiten(rest);
  if (oeff.specs.length) item.openingHours = oeff.specs;
  return item;
}

// Oeffnungszeiten aus BEIDEN Datenformaten lesen:
//  a) opening_hours als Objekt pro Wochentag ({mon:{open,close},...})
//  b) opening_time/closing_time + Pause (das Format der Kiek-mol-in-App)
// Liefert schema.org-Specs ('Mo-Su 11:30-22:00') UND einen lesbaren Text -
// beides speist JSON-LD, sichtbare Seite und FAQ aus EINER Quelle.
// DER RUHETAG STAND AUF DER GOOGLE-SEITE NICHT DRIN.
//
// Gemeldet: "Die Öffnungszeiten ist auch falsch". Unter dem Treffer stand
// "hat täglich 11:00–22:00 Uhr geöffnet" -- Al Porto hat aber einen
// Ruhetag. Google selbst zeigt fuer denselben Betrieb "Öffnet heute um
// 16:00 Uhr".
//
// Die Ursache ist dieselbe wie schon einmal in der App: der Ruhetag steht
// in einer EIGENEN Spalte (rest_day, 0=Mo .. 6=So), die Uhrzeiten getrennt
// davon. Wer nur die Uhrzeiten liest, macht aus zwei Feldern ein
// Versprechen fuer sieben Tage. Die App liest beides -- der Erzeuger der
// oeffentlichen Seiten las nur die Uhrzeiten. Das Wort "täglich" war damit
// eine Behauptung, die die Daten nicht hergeben, und sie stand auch in der
// Auszeichnung fuer Google.
const WOCHENTAGE = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WOCHENTAGE_DE = ['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'];
const WOCHENTAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function grossErstes(w) {
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}

// WAS KANN DIESES HAUS UEBERHAUPT?
//
// Der Generator hat die Schalter nie gelesen -- das Wort "features" kam in
// dieser Datei kein einziges Mal vor. Also stand auf JEDER Restaurantseite
// dasselbe: "Online bestellen", "Tisch reservieren", und in den strukturierten
// Daten acceptsReservations:true samt beider Aktionen. Auch bei Haeusern, die
// weder das eine noch das andere anbieten.
//
// Fuer den Gast heisst das: klicken, nichts finden, wegklicken. Fuer Google
// heisst es: Titel und Seite versprechen etwas, das die Seite nicht einloest.
// Beides schadet mehr, als ein fehlendes Wort im Titel je genutzt haette.
//
// Die Gast-App wertet dieselben Schalter laengst aus (siehe index.html,
// features.indexOf('no_ordering') / 'no_reservations'). Nur der Erzeuger der
// oeffentlichen Seiten nicht.
//
// ABWESENHEIT heisst "kann es". Die Schalter sind Ausschluesse, keine
// Freigaben -- ein Restaurant ohne gesetzte Flags kann beides. Andersherum
// waeren mit einem Schlag alle Bestell-Knoepfe verschwunden.
function featureListe(rest) {
  let f = rest && rest.features;
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch (e) { f = f.split(','); } }
  if (!Array.isArray(f)) return [];
  return f.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
}
function kannBestellen(rest) { return featureListe(rest).indexOf('no_ordering') < 0; }
function kannReservieren(rest) { return featureListe(rest).indexOf('no_reservations') < 0; }

function ruhetagIndex(rest) {
  if (!rest) return -1;
  const roh = rest.rest_day;
  // ACHTUNG: Number(null) ist 0 und Number('') auch -- ein Haus OHNE
  // Ruhetag haette damit montags geschlossen. Erst pruefen, ob ueberhaupt
  // etwas eingetragen ist.
  if (roh === null || roh === undefined || roh === '') return -1;
  const n = Number(roh);
  return (Number.isInteger(n) && n >= 0 && n <= 6) ? n : -1;
}

function parseOeffnungszeiten(rest) {
  const leer = { specs: [], text: '' };
  const hhmm = function (t) { return String(t || '').slice(0, 5); };
  const ruhetag = ruhetagIndex(rest);

  let oh = rest && rest.opening_hours;
  if (typeof oh === 'string') { try { oh = JSON.parse(oh); } catch (e) { oh = null; } }
  if (oh && typeof oh !== 'object') oh = null;

  // DAS FORMAT, DAS DAS DASHBOARD WIRKLICH SCHREIBT.
  //
  // Die Eingabemaske speichert die Zeiten FLACH, mit deutschen Kuerzeln und
  // einer optionalen zweiten Schicht fuer die Mittagspause:
  //
  //     { mo_start: '12:00', mo_end: '14:00',
  //       mo_start2: '17:00', mo_end2: '21:30', di_start: ... }
  //
  // Hier stand eine Zuordnung auf "mon"/"montag" mit verschachteltem
  // { open, close }. Dieses Format schreibt niemand -- der Zweig traf nie
  // zu. Danach fiel alles auf opening_time/closing_time zurueck, also auf
  // zwei Felder fuer die ganze Woche, und daraus wurde "täglich 11:00-22:00".
  // Deshalb standen auf jeder Google-Seite dieselben erfundenen Zeiten.
  //
  // Die App selbst liest das flache Format korrekt (checkIfOpen,
  // getOpeningTimeToday) -- nur der Erzeuger der oeffentlichen Seiten nicht.
  const KUERZEL = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
  const flach = oh && KUERZEL.some(function (k) { return Object.prototype.hasOwnProperty.call(oh, k + '_start'); });

  if (flach) {
    // Pro Tag die Schichten sammeln. Ein Tag ohne Start- oder Endzeit ist
    // geschlossen -- so traegt die Maske einen Ruhetag ein.
    const tage = KUERZEL.map(function (k, i) {
      if (i === ruhetag) return { i: i, schichten: [] };
      const schichten = [];
      if (oh[k + '_start'] && oh[k + '_end']) schichten.push(hhmm(oh[k + '_start']) + '-' + hhmm(oh[k + '_end']));
      if (oh[k + '_start2'] && oh[k + '_end2']) schichten.push(hhmm(oh[k + '_start2']) + '-' + hhmm(oh[k + '_end2']));
      return { i: i, schichten: schichten };
    });

    if (tage.some(function (t) { return t.schichten.length; })) {
      // Gleiche Tage zusammenfassen: "Mo-Fr 12:00-14:00 und 17:00-21:30"
      // liest sich besser als sieben Zeilen -- und ist dieselbe Angabe.
      const bloecke = [];
      tage.forEach(function (t) {
        const schluessel = t.schichten.join('|');
        const letzter = bloecke[bloecke.length - 1];
        if (letzter && letzter.schluessel === schluessel && letzter.bis === t.i - 1) letzter.bis = t.i;
        else bloecke.push({ von: t.i, bis: t.i, schluessel: schluessel, schichten: t.schichten });
      });

      const specs = [];
      const teile = [];
      bloecke.forEach(function (b) {
        const tageText = b.von === b.bis
          ? WOCHENTAGE_LANG[b.von]
          : WOCHENTAGE_LANG[b.von] + '–' + WOCHENTAGE_LANG[b.bis];
        if (!b.schichten.length) {
          teile.push(tageText + ': geschlossen');
          return;
        }
        const codes = b.von === b.bis
          ? WOCHENTAGE[b.von]
          : WOCHENTAGE.slice(b.von, b.bis + 1).join(',');
        b.schichten.forEach(function (sch) { specs.push(codes + ' ' + sch); });
        teile.push(tageText + ' ' + b.schichten.map(function (sch) { return sch.replace('-', '–'); }).join(' und ') + ' Uhr');
      });
      return { specs: specs, text: teile.join(', ') };
    }
  }

  // Aeltere Datensaetze: pro Wochentag verschachtelt { mon: {open, close} }.
  if (oh) {
    const dayMap = {
      mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su',
      monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th',
      friday: 'Fr', saturday: 'Sa', sunday: 'Su',
      montag: 'Mo', dienstag: 'Tu', mittwoch: 'We', donnerstag: 'Th',
      freitag: 'Fr', samstag: 'Sa', sonntag: 'Su'
    };
    const specs = [];
    Object.keys(oh).forEach(function (day) {
      const code = dayMap[String(day).toLowerCase()];
      const v = oh[day];
      // Am Ruhetag stehen die Uhrzeiten trotzdem in der Tabelle -- sie
      // werden beim Setzen des Ruhetags nicht geleert. Also hier raus.
      if (code && WOCHENTAGE.indexOf(code) === ruhetag) return;
      if (code && v && v.open && v.close) specs.push(code + ' ' + hhmm(v.open) + '-' + hhmm(v.close));
    });
    if (specs.length) {
      const zusatz = ruhetag >= 0 ? ', ' + WOCHENTAGE_LANG[ruhetag] + ': geschlossen' : '';
      return { specs: specs, text: specs.join(', ').replace(/-/g, '–') + ' Uhr' + zusatz };
    }
  }

  // Letzter Rueckfall: zwei Felder fuer die ganze Woche. Das ist eine grobe
  // Angabe und wird auch als solche geschrieben -- nicht als Tagesplan.
  if (rest && rest.opening_time && rest.closing_time) {
    const auf = hhmm(rest.opening_time);
    const zu = hhmm(rest.closing_time);
    const pause = oh && oh.pause_enabled !== false && oh.pause_start && oh.pause_end
      ? { von: hhmm(oh.pause_start), bis: hhmm(oh.pause_end) }
      : null;
    const offeneTage = WOCHENTAGE.filter(function (t, i) { return i !== ruhetag; });
    const spanne = ruhetag >= 0 ? offeneTage.join(',') : 'Mo-Su';
    const wann = ruhetag >= 0 ? 'täglich ausser ' + WOCHENTAGE_DE[ruhetag] : 'täglich';
    const nachsatz = ruhetag >= 0 ? ', ' + WOCHENTAGE_LANG[ruhetag] + ': geschlossen' : '';
    if (pause && pause.von > auf && pause.bis < zu) {
      return {
        specs: [spanne + ' ' + auf + '-' + pause.von, spanne + ' ' + pause.bis + '-' + zu],
        text: wann + ' ' + auf + '–' + pause.von + ' und ' + pause.bis + '–' + zu + ' Uhr' + nachsatz
      };
    }
    return { specs: [spanne + ' ' + auf + '-' + zu], text: wann + ' ' + auf + '–' + zu + ' Uhr' + nachsatz };
  }
  return leer;
}

// FAQ fuer die Restaurant-Seite - beantwortet exakt die Fragen, die Leute
// (und Sprachassistenten) googeln: "hat X geöffnet", "kann man bei X
// reservieren", "liefert X". NUR Antworten, die durch echte Daten gedeckt
// sind - keine erfundenen Angaben.
function buildRestaurantFaqs(rest, name, cityRaw, catLabel, menuItems) {
  const faqs = [];
  const oeff = parseOeffnungszeiten(rest);

  if (oeff.text) {
    faqs.push({
      q: 'Wann hat ' + name + ' in ' + cityRaw + ' geöffnet?',
      a: name + ' hat ' + oeff.text + ' geöffnet. Ob gerade offen ist und ob Bestellungen angenommen werden, zeigt das Live-Profil auf ' + BRAND + '.'
    });
  }
  faqs.push({
    q: 'Kann man bei ' + name + ' online einen Tisch reservieren?',
    a: 'Ja – auf ' + BRAND + ' reservierst du kostenlos und ohne Anmeldung einen Tisch bei ' + name + ': Datum, Uhrzeit und Personenzahl wählen, Bestätigung kommt sofort per E-Mail.'
  });
  if (menuItems.length) {
    const beliebt = menuItems.filter(function(it) { return it.is_popular; }).slice(0, 3)
      .map(function(it) { return safeText(it.name, ''); }).filter(function(n) { return n; });
    faqs.push({
      q: 'Was steht bei ' + name + ' auf der Speisekarte?',
      a: 'Die Speisekarte von ' + name + ' umfasst online ' + menuItems.length + ' Gerichte' +
        (beliebt.length ? ' – besonders beliebt: ' + beliebt.join(', ') + '.' : '.') +
        ' Alle Preise und Optionen stehen auf der Profilseite bei ' + BRAND + '.'
    });
    faqs.push({
      q: 'Kann man bei ' + name + ' in ' + cityRaw + ' online bestellen?',
      a: 'Ja – Bestellungen zur Abholung' + (rest.delivery_fee != null ? ' oder Lieferung' : '') + ' gehen direkt online über ' + BRAND + ', ohne App-Download und ohne Preisaufschlag.'
    });
  }
  if (rest.street || rest.zip) {
    faqs.push({
      q: 'Wo finde ich ' + name + ' in ' + cityRaw + '?',
      a: name + ' liegt in ' + [safeText(rest.street, ''), safeText(rest.zip, ''), cityRaw].filter(function(s) { return s; }).join(', ') +
        (rest.phone ? '. Telefonisch erreichbar unter ' + rest.phone + '.' : '.')
    });
  }
  return faqs;
}

// Sichtbare Oeffnungszeiten auf der Restaurant-Seite (gleiche Quelle wie
// das JSON-LD - Google mag es, wenn Markup und Seite dasselbe sagen).
// DIE OEFFNUNGSZEITEN WAREN DER GOOGLE-AUSSCHNITT.
//
// Gemeldet: unter dem Treffer stand woertlich
//
//     "La Piazza hat täglich 12:00–14:00 und 17:00–21:30 Uhr geöffnet.
//      Feiertage und Betriebsferien können abweichen – das Live-Profil
//      zeigt, ob gerade geöffnet ist."
//
// Das war ein Fliesstext-Absatz, der fuer sich allein steht und wie eine
// fertige Antwort aussieht -- genau so etwas nimmt Google als Ausschnitt,
// auch wenn eine Meta-Beschreibung da ist. Der zweite Satz hat es noch
// verstaerkt: er rundet den Absatz ab, gehoert aber niemandem zur
// Entscheidung.
//
// Die Zeiten bleiben auf der Seite -- der Gast braucht sie, und die
// Auszeichnung fuer Google zieht sie ohnehin aus derselben Quelle. Sie
// stehen nur nicht mehr als zitierfaehiger Absatz da, sondern als Liste.
// Aus einer Liste baut Google selten einen Ausschnitt.
function renderOeffnungszeitenHtml(rest, name) {
  const oeff = parseOeffnungszeiten(rest);
  if (!oeff.text) return '';
  const ruhetag = ruhetagIndex(rest);
  return '<h2>Öffnungszeiten von ' + escapeHtml(name) + '</h2>\n' +
    '<ul class="oeffnungszeiten">\n' +
    '<li>' + escapeHtml(oeff.text.replace(/ \(.*$/, '')) + '</li>\n' +
    // "montags" ohne das s ist der Wochentag -- und der wird grossgeschrieben.
    (ruhetag >= 0 ? '<li>' + escapeHtml(grossErstes(WOCHENTAGE_DE[ruhetag].replace(/s$/, '')) + ': Ruhetag') + '</li>\n' : '') +
    '</ul>\n';
}

function detectCategoryForRest(rest) {
  for (const c of CATEGORIES) {
    if (c.slug !== 'restaurant' && categoryMatches(rest, c)) return c;
  }
  return CATEGORIES[CATEGORIES.length - 1];
}

function buildMenuJsonLd(rest, menuItems) {
  if (!menuItems || !menuItems.length) return null;
  const slug = rest.slug || rest.id;
  // Items nach Kategorie gruppieren fuer schoene Section-Struktur
  const sections = {};
  menuItems.forEach(function(it) {
    const catName = (it.menu_categories && it.menu_categories.name) || 'Speisekarte';
    if (!sections[catName]) sections[catName] = [];
    sections[catName].push(it);
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    'name': 'Speisekarte ' + safeText(rest.name, 'Restaurant'),
    'url': SITE_URL + '/' + slug,
    'hasMenuSection': Object.keys(sections).map(function(secName) {
      return {
        '@type': 'MenuSection',
        'name': secName,
        'hasMenuItem': sections[secName].map(function(it) {
          const item = {
            '@type': 'MenuItem',
            'name': safeText(it.name, 'Gericht')
          };
          if (it.description) item.description = String(it.description).slice(0, 200);
          const p = it.base_price;
          if (p != null && !isNaN(Number(p))) {
            item.offers = {
              '@type': 'Offer',
              'price': Number(p).toFixed(2),
              'priceCurrency': 'EUR'
            };
          }
          if (it.image_url) item.image = it.image_url;
          return item;
        })
      };
    })
  };
}

function renderMenuListHtml(menuItems) {
  if (!menuItems || !menuItems.length) return '';
  // In Sections nach Kategorie
  const sections = {};
  menuItems.forEach(function(it) {
    const catName = (it.menu_categories && it.menu_categories.name) || 'Speisekarte';
    if (!sections[catName]) sections[catName] = [];
    sections[catName].push(it);
  });

  let html = '<div class="menu-list" style="background:#fff;border-radius:14px;padding:24px;margin:0 0 32px;box-shadow:0 1px 3px rgba(0,0,0,.04);">';
  Object.keys(sections).forEach(function(secName) {
    html += '<h3 style="margin:18px 0 12px;color:' + PRIMARY_COLOR + ';font-size:18px;font-weight:700;border-bottom:2px solid #eef5f3;padding-bottom:6px;">' + escapeHtml(secName) + '</h3>';
    html += '<ul style="list-style:none;padding:0;margin:0;">';
    sections[secName].forEach(function(it) {
      const itName = escapeHtml(safeText(it.name, 'Gericht'));
      const itDesc = it.description ? escapeHtml(String(it.description).slice(0, 140)) : '';
      const itPrice = escapeHtml(fmtPrice(it));
      html += '<li style="padding:10px 0;border-bottom:1px solid #f4f4f0;display:flex;justify-content:space-between;gap:14px;align-items:flex-start;">';
      html +=   '<div style="flex:1;min-width:0;">';
      html +=     '<div style="font-weight:600;color:#1a1a1a;font-size:15px;">' + itName + (it.is_popular ? ' <span style="background:' + ACCENT_COLOR + ';color:#fff;font-size:10px;padding:2px 6px;border-radius:99px;font-weight:700;margin-left:6px;">BELIEBT</span>' : '') + '</div>';
      if (itDesc) html += '<div style="color:#666;font-size:13px;margin-top:2px;line-height:1.4;">' + itDesc + '</div>';
      html +=   '</div>';
      if (itPrice) html += '<div style="font-weight:700;color:' + PRIMARY_COLOR + ';font-size:15px;white-space:nowrap;">' + itPrice + '</div>';
      html += '</li>';
    });
    html += '</ul>';
  });
  html += '</div>';
  return html;
}

function renderStars(rating) {
  const n = Math.round(Number(rating) || 0);
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
  return s;
}

function renderReviewsHtml(rest, reviews) {
  // Sichtbarer Bewertungs-Block. Muss zum Review-Schema passen (Google
  // verlangt, dass strukturierte Daten sichtbaren Inhalt widerspiegeln).
  const real = (Array.isArray(reviews) ? reviews : []).filter(function(rv) {
    return rv && Number(rv.rating) > 0 && (rv.comment || rv.title);
  });
  if (!real.length) return '';
  const name = escapeHtml(safeText(rest.name, 'Restaurant'));
  const avg = real.reduce(function(a, rv) { return a + Number(rv.rating); }, 0) / real.length;

  let html = '<h2 id="bewertungen">Bewertungen für ' + name + '</h2>\n';
  html += '<p style="margin:0 0 16px;color:#666;"><strong style="color:' + ACCENT_COLOR + ';font-size:18px;">' +
    renderStars(avg) + '</strong> ' + avg.toFixed(1).replace('.', ',') + ' von 5 · ' +
    real.length + ' ' + (real.length === 1 ? 'Bewertung' : 'Bewertungen') + '</p>\n';
  html += '<div class="reviews-seo" style="display:grid;gap:12px;margin:0 0 32px;">';
  real.slice(0, 10).forEach(function(rv) {
    const author = escapeHtml(safeText(rv.customer_name, 'Gast'));
    const text = escapeHtml(String(rv.comment || rv.title).slice(0, 500));
    const dateStr = rv.created_at
      ? new Date(rv.created_at).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    html += '<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:10px;">';
    html += '<strong style="color:#1a1a1a;font-size:14px;">' + author + '</strong>';
    html += '<span style="color:' + ACCENT_COLOR + ';font-size:15px;white-space:nowrap;">' + renderStars(rv.rating) + '</span>';
    html += '</div>';
    if (rv.title && rv.comment) html += '<div style="font-weight:600;color:#1a1a1a;font-size:14px;margin-bottom:4px;">' + escapeHtml(String(rv.title).slice(0, 120)) + '</div>';
    html += '<p style="color:#555;font-size:14px;line-height:1.5;margin:0;">' + text + '</p>';
    if (dateStr) html += '<div style="color:#999;font-size:12px;margin-top:8px;">' + escapeHtml(dateStr) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderRestaurantHero(rest, name, cityRaw, catLabel, menuItems, slug) {
  const img = rest.image || rest.logo || '';
  const ratingTxt = fmtRating(rest.rating);
  const stars = ratingTxt ? renderStars(rest.rating) : '';
  const metaParts = [];
  if (ratingTxt) metaParts.push('<span class="hstars">' + stars + '</span> ' + ratingTxt + ' / 5');
  metaParts.push(escapeHtml(catLabel) + ' in ' + escapeHtml(cityRaw));
  if (rest.cuisine) metaParts.push(escapeHtml(rest.cuisine));
  if (menuItems.length) metaParts.push(menuItems.length + ' Gerichte online');
  const meta = metaParts.join('<span class="dot"> · </span>');

  return '<section class="hero' + (img ? '' : ' hero-fallback') + ' fade">' +
    (img ? '<div class="bg" style="background-image:url(' + escapeAttr(img) + ')"></div>' : '') +
    '<div class="ov"></div>' +
    '<div class="inner">' +
      '<h1>' + escapeHtml(name) + '</h1>' +
      '<div class="meta">' + meta + '</div>' +
      // Nur anbieten, was das Haus wirklich kann -- ein Knopf ins Leere ist
      // schlimmer als kein Knopf.
      '<div style="margin-top:18px;display:flex;flex-wrap:wrap;gap:10px;">' +
        (kannBestellen(rest) ? '<a class="cta-primary" href="/?r=' + escapeAttr(slug) + '">🍽️ Online bestellen</a>' : '') +
        (kannReservieren(rest) ? '<a class="cta-ghost" style="background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.5);" href="/?r=' + escapeAttr(slug) + '&action=reserve">Tisch reservieren</a>' : '') +
        (!kannBestellen(rest) && !kannReservieren(rest)
          ? '<a class="cta-primary" href="/?r=' + escapeAttr(slug) + '">🍽️ Speisekarte ansehen</a>' : '') +
      '</div>' +
    '</div>' +
  '</section>';
}

function renderTrustBadges(rest, menuItems) {
  const badges = [];
  badges.push({ i: '✓', t: 'Kostenlos bestellen' });
  badges.push({ i: '⚡', t: 'Ohne App-Download' });
  if (menuItems.length) badges.push({ i: '📋', t: menuItems.length + ' Gerichte' });
  badges.push({ i: '📍', t: 'Aus ' + escapeHtml(safeText(rest.city, 'der Region')) });
  badges.push({ i: '🤝', t: 'Faire Provision' });
  return '<div class="trust fade d2">' + badges.map(function(b) {
    return '<span class="b"><span class="i">' + b.i + '</span>' + b.t + '</span>';
  }).join('') + '</div>';
}

function generateRestaurantPage(rest, menuItems, reviews) {
  const slug = rest.slug;
  if (!slug || typeof slug !== 'string' || slug.length < 2) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;   // safe filename only

  menuItems = menuItems || [];
  reviews = reviews || [];

  const name = safeText(rest.name, 'Restaurant');
  const cityRaw = safeText(rest.city, 'Ostfriesland');
  const url = SITE_URL + '/' + slug;
  const cat = detectCategoryForRest(rest);
  const catLabel = cat.label;

  // Stadt-Slug fuer Breadcrumb-Link
  const cityObj = CITIES.find(function(c) { return normalize(c.name) === normalize(cityRaw); });
  const citySlug = cityObj ? cityObj.slug : normalize(cityRaw).replace(/[^a-z0-9]/g, '');

  // DIE UEBERSCHRIFT IM GOOGLE-TREFFER.
  //
  // Hier stand: name + ' ' + cityRaw + ' – Online bestellen & Tisch
  // reservieren | ' + catLabel. Bei Al Porto ergab das
  //
  //     "Pizzeria Al Porto Oldersum Oldersum – Online bestellen &
  //      Tisch reservieren | Pizzeria"
  //
  // 85 Zeichen, "Oldersum" doppelt, "Pizzeria" doppelt. Google schneidet
  // bei etwa 60 ab und ersetzt Titel, die sich wiederholen, durch einen
  // eigenen -- deshalb stand im Treffer "Pizzeria Al Porto Oldersum -
  // Kiek mol in" und von Bestellen war nichts zu sehen.
  //
  // Jetzt: Ort und Betriebsart nur, wenn sie nicht schon im Namen stecken.
  const imNamen = function (wort) {
    return wort && normalize(name).indexOf(normalize(wort)) >= 0;
  };
  const titelName = imNamen(cityRaw) ? name : name + ' ' + cityRaw;

  // DER TITEL SAGT NUR ZU, WAS ES WIRKLICH GIBT.
  //
  // Vorher stand ueberall "Speisekarte & online bestellen" -- auch bei
  // Haeusern ohne Online-Bestellung. Ein Titel, der etwas verspricht, das die
  // Seite nicht einloest, kostet Vertrauen beim Gast und Rang bei Google.
  //
  // LAENGE: Google zeigt rund 55-60 Zeichen. Ist der Name lang, waere der
  // lange Zusatz abgeschnitten -- dann lieber ein kuerzerer, der ganz
  // dasteht, als ein langer, der mitten im Wort endet.
  const title = (function () {
    const b = kannBestellen(rest);
    const r = kannReservieren(rest);
    const lang = b && r ? 'Speisekarte, bestellen & reservieren'
      : b ? 'Speisekarte & online bestellen'
      : r ? 'Speisekarte & Tisch reservieren'
      : 'Speisekarte & Öffnungszeiten';
    const kurz = b && r ? 'Bestellen & reservieren'
      : b ? 'Online bestellen'
      : r ? 'Tisch reservieren'
      : 'Speisekarte';
    const voll = titelName + ' – ' + lang;
    return voll.length <= 60 ? voll : titelName + ' – ' + kurz;
  })();

  // Meta-Description mit Menü-Items wenn vorhanden (genau wie ostfriesland.app)
  let description;
  if (menuItems.length >= 3) {
    const sampleItems = menuItems.slice(0, 5).map(function(it) { return safeText(it.name, ''); }).filter(function(n) { return n; });
    description = name + ' ' + cityRaw + ': ' + sampleItems.join(' · ') + '. Online bestellen, Speisekarte ansehen & Tisch reservieren.';
  } else {
    description = name + ' in ' + cityRaw + ' – Speisekarte ansehen, online bestellen & Tisch reservieren.';
    if (rest.cuisine) description += ' ' + rest.cuisine + '.';
  }
  if (description.length > 160) description = description.slice(0, 157) + '...';

  const restJsonLd = buildRestaurantJsonLd(rest, reviews);
  // Menu in Restaurant-JSON einhaengen wenn Items vorhanden
  if (menuItems.length) {
    restJsonLd.menu = SITE_URL + '/' + slug + '#speisekarte';
    restJsonLd.hasMenu = SITE_URL + '/' + slug + '#speisekarte';
  }
  const menuJsonLd = buildMenuJsonLd(rest, menuItems);
  const faqs = buildRestaurantFaqs(rest, name, cityRaw, catLabel, menuItems);
  const faqLd = buildFaqJsonLd(faqs);
  const breadcrumbCrumbs = [
    { name: 'Startseite', url: SITE_URL + '/' },
    { name: cityRaw, url: SITE_URL + '/restaurants-' + citySlug },
    { name: name, url: url }
  ];
  const breadcrumbLd = buildBreadcrumbJsonLd(breadcrumbCrumbs);

  const addrLine = [
    rest.street ? escapeHtml(rest.street) : '',
    rest.zip ? escapeHtml(rest.zip) : '',
    escapeHtml(cityRaw)
  ].filter(function(s) { return s; }).join(' ');

  // SEO-Inhalt (statisch fuer Crawler), echte Nutzer werden via JS direkt in die SPA geleitet
  const html = '<!DOCTYPE html>\n<html lang="de">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + escapeHtml(title) + '</title>\n' +
    '<meta name="description" content="' + escapeAttr(description) + '">\n' +
    '<link rel="canonical" href="' + escapeAttr(url) + '">\n' +
    '<meta name="robots" content="index,follow,max-image-preview:large">\n' +
    '<meta name="geo.region" content="DE-NI">\n' +
    '<meta name="geo.placename" content="' + escapeAttr(cityRaw) + '">\n' +
    '<meta property="og:type" content="restaurant.restaurant">\n' +
    '<meta property="og:title" content="' + escapeAttr(title) + '">\n' +
    '<meta property="og:description" content="' + escapeAttr(description) + '">\n' +
    '<meta property="og:url" content="' + escapeAttr(url) + '">\n' +
    // Restaurantfoto, sonst das Marken-Bild -- ein Share ohne Bild bekommt
    // deutlich weniger Klicks.
    '<meta property="og:image" content="' + escapeAttr(rest.image || (SITE_URL + '/og-image.png')) + '">\n' +
    '<meta property="og:locale" content="de_DE">\n' +
    '<meta property="og:site_name" content="' + BRAND + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + escapeAttr(title) + '">\n' +
    '<meta name="twitter:description" content="' + escapeAttr(description) + '">\n' +
    '<meta name="twitter:image" content="' + escapeAttr(rest.image || (SITE_URL + '/og-image.png')) + '">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n' +
    '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">\n' +
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n' +
    '<style>' + pageCss() + '</style>\n' +
    '<script type="application/ld+json">' + jsonEscape(restJsonLd) + '</script>\n' +
    '<script type="application/ld+json">' + jsonEscape(breadcrumbLd) + '</script>\n' +
    (menuJsonLd ? '<script type="application/ld+json">' + jsonEscape(menuJsonLd) + '</script>\n' : '') +
    (faqs.length ? '<script type="application/ld+json">' + jsonEscape(faqLd) + '</script>\n' : '') +
    // WICHTIG: Query-String und Anker MITNEHMEN. Der Tisch-QR-Code zeigt auf
    // /<slug>?tisch=5 -- ohne Uebergabe ging die Tischnummer bei der
    // Weiterleitung verloren und der Gast sass 'an keinem Tisch'.
    // Echte Besucher direkt in die App leiten; Crawler (Google/Bing/...)
    // sehen den statischen Inhalt und indexieren ihn. Mit ?preview oder ?seo
    // laesst sich die Weiterleitung zum Anschauen ueberspringen.
    //
    // BEWUSSTE ENTSCHEIDUNG DES BETREIBERS (Juli 2026): Gaeste sollen ohne
    // Zwischenseite in der App-Landingpage landen -- es soll nur EINE
    // Landingpage geben, nicht zwei verschieden aussehende unter derselben
    // Adresse. Die Weiterleitung wurde zwischenzeitlich entfernt (Google
    // wertet "Bot sieht A, Besucher sieht B" als Cloaking) und auf Wunsch
    // wieder eingebaut. Falls die Google Search Console eine manuelle
    // Massnahme wegen Cloaking meldet, ist DAS hier die Stelle.
    '<script>(function(){try{if(typeof navigator==="undefined")return;if(/[?&](preview|seo)\\b/i.test(location.search))return;var ua=navigator.userAgent||"";if(/bot|crawl|slurp|spider|search|google|bing|yandex|duckduck|baidu|facebookexternalhit|whatsapp|linkedinbot|twitterbot|telegrambot/i.test(ua))return;location.replace("/?r=" + encodeURIComponent(' + JSON.stringify(slug) + ') + (location.search ? "&" + location.search.slice(1) : "") + (location.hash || ""));}catch(e){}})();</script>\n' +

    '</head>\n<body>\n' +
    renderHeader() + '\n' +
    renderBreadcrumb(breadcrumbCrumbs) + '\n' +
    '<main class="container">\n' +
    renderRestaurantHero(rest, name, cityRaw, catLabel, menuItems, slug) + '\n' +
    renderTrustBadges(rest, menuItems) + '\n' +
    '<div class="intro fade d1">\n' +
      (rest.description
        ? '<p>' + escapeHtml(rest.description) + '</p>'
        : '<p>' + escapeHtml(name) + ' ist ein ' + escapeHtml(catLabel) + ' in ' + escapeHtml(cityRaw) +
          '. Auf ' + BRAND + ' kannst du die komplette Speisekarte ansehen, online bestellen oder einen Tisch reservieren – kostenlos und ohne App-Download.</p>') +
      (addrLine ? '<p><strong>Adresse:</strong> ' + addrLine + '</p>' : '') +
      (rest.phone ? '<p><strong>Telefon:</strong> <a href="tel:' + escapeAttr(rest.phone) + '">' + escapeHtml(rest.phone) + '</a></p>' : '') +
      (rest.email ? '<p><strong>E-Mail:</strong> <a href="mailto:' + escapeAttr(rest.email) + '">' + escapeHtml(rest.email) + '</a></p>' : '') +
      (rest.website ? '<p><strong>Website:</strong> <a href="' + escapeAttr(rest.website) + '" rel="nofollow">' + escapeHtml(rest.website) + '</a></p>' : '') +
    '</div>\n' +
    '<p style="margin:18px 0 32px;"><a href="/?r=' + escapeAttr(slug) + '" style="display:inline-block;background:' + PRIMARY_COLOR + ';color:#fff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;">'
      + (kannBestellen(rest) ? 'Online bestellen bei ' : 'Speisekarte von ') + escapeHtml(name) + '</a></p>\n' +
    (menuItems.length
      ? '<h2 id="speisekarte">Speisekarte von ' + escapeHtml(name) + '</h2>\n' +
        '<p style="margin:0 0 16px;color:#666;">Die ' + menuItems.length + ' beliebtesten Gerichte – komplette Karte mit allen Optionen in der App.</p>\n' +
        renderMenuListHtml(menuItems) + '\n'
      : '<h2>Speisekarte' + (kannBestellen(rest) ? ' ansehen & online bestellen' : ' ansehen') + '</h2>\n' +
        '<p>Die vollständige Speisekarte von ' + escapeHtml(name) + ' findest du in der ' + BRAND + '-App.'
        + (kannBestellen(rest) ? ' Online bestellen geht direkt – Abholung oder Lieferung (wo verfügbar).' : '') + '</p>\n') +
    (kannReservieren(rest)
      ? '<h2>Tisch reservieren bei ' + escapeHtml(name) + '</h2>\n' +
        '<p>Direkt online einen Tisch reservieren – kostenlos, ohne Anmeldung, mit Sofort-Bestätigung per E-Mail. Wähle Datum, Uhrzeit und Personenzahl, fertig.</p>\n' +
        '<p style="margin:18px 0;"><a href="/?r=' + escapeAttr(slug) + '&action=reserve" style="display:inline-block;background:#fff;color:' + PRIMARY_COLOR + ';border:2px solid ' + PRIMARY_COLOR + ';padding:12px 26px;border-radius:8px;font-weight:600;text-decoration:none;">Tisch reservieren</a></p>\n'
      : '') +
    renderOeffnungszeitenHtml(rest, name) +
    (faqs.length
      ? '<h2>Häufige Fragen zu ' + escapeHtml(name) + '</h2>\n' + renderFaqAccordion(faqs) + '\n'
      : '') +
    renderReviewsHtml(rest, reviews) + '\n' +
    renderCrossLinks(cityObj || { slug: citySlug, name: cityRaw, region: 'Ostfriesland' }, cat) + '\n' +
    '</main>\n' +
    renderFooter() + '\n' +
    // Die Leiste am unteren Rand am Handy. Auch hier: kein Versprechen, das
    // das Haus nicht halten kann. "Abholung · Lieferung" stand bisher sogar
    // bei Betrieben, die nur am Tisch bedienen.
    '<div class="sticky-cta">' +
      '<div class="lbl">' + escapeHtml(name) + '<small>' +
        (kannBestellen(rest) ? 'Abholung · Lieferung · kostenlos'
          : kannReservieren(rest) ? 'Tisch reservieren · kostenlos'
          : 'Speisekarte · Öffnungszeiten') +
      '</small></div>' +
      '<a class="cta-primary" href="/?r=' + escapeAttr(slug) +
        (kannBestellen(rest) ? '' : kannReservieren(rest) ? '&action=reserve' : '') +
        '" style="padding:12px 22px;font-size:15px;">' +
        (kannBestellen(rest) ? 'Online bestellen'
          : kannReservieren(rest) ? 'Tisch reservieren'
          : 'Speisekarte ansehen') +
      '</a>' +
    '</div>\n' +
    '</body></html>\n';

  const filename = slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, filename), html, 'utf8');
  // lastmod aus den echten Daten (Google honoriert ehrliche Aenderungsdaten):
  // juengstes Datum aus Restaurant-Aenderung und neuester Bewertung.
  const daten = [rest.updated_at, rest.created_at]
    .concat(reviews.map(function(rv) { return rv && rv.created_at; }))
    .map(function(d) { return String(d || '').slice(0, 10); })
    .filter(function(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })
    .sort();
  const lastmod = daten.length ? daten[daten.length - 1] : null;
  return { filename: filename, url: url, count: 1, restaurant: true, menuCount: menuItems.length, lastmod: lastmod };
}

// ==================== PROSPECT / VERZEICHNIS-SEITEN ====================
// Seiten fuer Restaurants/Pizzerien/Cafes, die (noch) KEINE Kiek-mol-in-
// Partner sind. Genau wie ostfriesland.app: nur Name, Adresse, Telefon ->
// jede Seite rankt fuer "Pizzeria XY Stadt". Vorteile:
//   1. Riesiger SEO-Fussabdruck (hunderte Seiten statt nur Partner)
//   2. Lead-Magnet: laeuft die Seite gut, ruft der Vertrieb den Inhaber an
//   3. Funnel: jede Seite verlinkt auf echte Partner in derselben Stadt
// EHRLICH gehalten: kein Fake-"Online bestellen", klarer Inhaber-Hinweis,
// Opt-out im Footer. Quelle = prospects.json (vom Betreiber gepflegt).

// Wohin der "Bist du der Inhaber?"-Button zeigt (Partner-Anmeldung/Kontakt).
const PROSPECT_OWNER_CTA_URL = '/?page=kontakt';

function loadProspects() {
  const file = path.join(OUT_DIR, 'prospects.json');
  if (!fs.existsSync(file)) {
    console.log('[seo] keine prospects.json gefunden - Verzeichnis-Seiten uebersprungen.');
    return [];
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('[seo] WARN: prospects.json ist kein gueltiges JSON -', e.message);
    return [];
  }
  if (!Array.isArray(data)) {
    console.warn('[seo] WARN: prospects.json muss ein Array sein.');
    return [];
  }
  return data;
}

function prospectSlug(p) {
  const raw = (p.name || '') + (p.city ? ' ' + p.city : '');
  // normalize() macht ä->ae etc. + lowercase; NFD-Strip entfernt Rest-Akzente
  // wie é->e, à->a, sodass aus "Café" sauber "cafe" wird statt "caf".
  const base = normalize(raw).normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function detectProspectCategory(p) {
  if (p.category) {
    const c = CATEGORIES.find(function(x) { return x.slug === p.category; });
    if (c) return c;
  }
  // Aus dem Namen erkennen (z.B. "Pizzeria Castello" -> Pizzeria)
  const synthetic = { cuisine: p.name };
  for (const c of CATEGORIES) {
    if (c.slug !== 'restaurant' && categoryMatches(synthetic, c)) return c;
  }
  return CATEGORIES[CATEGORIES.length - 1];
}

function buildProspectJsonLd(p, name, cityRaw, url, catLabel) {
  // Bewusst OHNE aggregateRating: wir haben keine echten Bewertungen ->
  // Fake-Sterne wuerden von Google abgestraft. Nur saubere Stammdaten.
  const item = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': url,
    'name': name,
    'url': url
  };
  if (p.phone) item.telephone = String(p.phone);
  if (p.website) item.sameAs = [p.website];
  if (catLabel) item.servesCuisine = catLabel;
  if (p.street || p.zip || cityRaw) {
    item.address = {
      '@type': 'PostalAddress',
      'streetAddress': safeText(p.street, ''),
      'postalCode': safeText(p.zip, ''),
      'addressLocality': cityRaw,
      'addressCountry': 'DE'
    };
  }
  if (p.lat && p.lng) {
    item.geo = { '@type': 'GeoCoordinates', 'latitude': Number(p.lat), 'longitude': Number(p.lng) };
  }
  return item;
}

function generateProspectPage(p, partnerRestaurants, allProspects) {
  if (!p || !p.name) return null;
  const slug = prospectSlug(p);
  if (!slug || slug.length < 2) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;

  const isDraft = !!p.draft;
  const name = safeText(p.name, 'Restaurant');
  const cityRaw = safeText(p.city, 'Ostfriesland');
  const url = SITE_URL + '/' + slug;
  const cat = detectProspectCategory(p);
  const catLabel = cat.label;

  const cityObj = CITIES.find(function(c) { return normalize(c.name) === normalize(cityRaw); });
  const citySlug = cityObj ? cityObj.slug : normalize(cityRaw).replace(/[^a-z0-9]/g, '');

  const title = name + ' ' + cityRaw + ' – Adresse, Telefon & Öffnungszeiten | ' + catLabel;
  let description = name + ' in ' + cityRaw + ': ' + catLabel + ' – Adresse, Telefon';
  if (p.street) description += ', ' + p.street;
  description += '. Jetzt anrufen oder online bestellen bei Restaurants in ' + cityRaw + '.';
  if (description.length > 160) description = description.slice(0, 157) + '...';

  const prospectLd = buildProspectJsonLd(p, name, cityRaw, url, catLabel);
  const breadcrumbCrumbs = [
    { name: 'Startseite', url: SITE_URL + '/' },
    { name: cityRaw, url: SITE_URL + '/restaurants-' + citySlug },
    { name: name, url: url }
  ];
  const breadcrumbLd = buildBreadcrumbJsonLd(breadcrumbCrumbs);

  const addrLine = [
    p.street ? escapeHtml(p.street) : '',
    p.zip ? escapeHtml(p.zip) : '',
    escapeHtml(cityRaw)
  ].filter(function(s) { return s; }).join(' ');

  // Echte Partner in derselben Stadt -> Funnel von Nicht-Partner-Suchen
  const partners = (Array.isArray(partnerRestaurants) ? partnerRestaurants : [])
    .filter(function(r) { return r && r.slug && normalize(r.city) === normalize(cityRaw); })
    .slice(0, 6);

  // ----- Zusatz-Inhalt fuer bessere Google-Indexierung (kein Thin-Content) -----
  const eName = escapeHtml(name);
  const eCity = escapeHtml(cityRaw);
  // Küche aus OSM (falls vorhanden), sonst die Kategorie
  const cuisineRaw = p.cuisine ? (String(p.cuisine).charAt(0).toUpperCase() + String(p.cuisine).slice(1)) : catLabel;
  const eCuisine = escapeHtml(cuisineRaw);
  const hoursLine = p.hours ? escapeHtml(String(p.hours)) : '';

  // Variierter Intro-Text (3 Varianten, deterministisch je Eintrag) gegen
  // Duplicate-Content. Bewusst ohne Genus-Artikel -> grammatikalisch sicher.
  const introVariants = [
    eName + ' – ' + eCuisine + ' in ' + eCity + '. Adresse, Telefon' + (hoursLine ? ' und Öffnungszeiten' : '') +
      ' findest du hier auf einen Blick, dazu Restaurants in ' + eCity + ' zum direkten Online-Bestellen.',
    'Du suchst ' + eCuisine + ' in ' + eCity + '? ' + eName + ' gehört zu den Gastro-Betrieben vor Ort. ' +
      'Hier findest du Kontakt' + (hoursLine ? ' und Öffnungszeiten' : '') + ' – und welche Lokale in ' + eCity + ' Online-Bestellung oder Abholung anbieten.',
    eName + ' in ' + eCity + ' (Ostfriesland): ' + eCuisine + '. Adresse und Telefon stehen auf dieser Seite; ' +
      'weiter unten zeigen wir dir Restaurants aus ' + eCity + ', die du direkt über ' + BRAND + ' bestellen kannst.'
  ];
  const introHash = slug.split('').reduce(function(a, c) { return a + c.charCodeAt(0); }, 0);
  const introHtml = introVariants[introHash % introVariants.length];

  // Geschwister-Eintraege derselben Stadt -> internes Linknetz (gut fuer Crawling)
  const siblings = (Array.isArray(allProspects) ? allProspects : [])
    .filter(function(o) {
      return o && o.name && !o.draft && normalize(o.city) === normalize(cityRaw) && prospectSlug(o) !== slug;
    })
    .slice(0, 8);
  const siblingBox = siblings.length
    ? '<section class="crosslinks"><h3>Weitere Gastro-Betriebe in ' + eCity + '</h3><div class="links">' +
      siblings.map(function(o) {
        return '<a href="/' + escapeAttr(prospectSlug(o)) + '">' + escapeHtml(safeText(o.name, 'Restaurant')) + '</a>';
      }).join('') +
      '</div></section>'
    : '';

  // FAQ (sichtbar + FAQPage-JSON-LD) - nur Fragen mit echter Antwort
  const faqs = [];
  faqs.push({ q: 'Welche Art von Lokal ist ' + name + '?', a: name + ' ist ' + cuisineRaw + ' in ' + cityRaw + ' (Ostfriesland).' });
  if (p.street || p.zip) {
    faqs.push({ q: 'Wo finde ich ' + name + '?', a: name + ' befindet sich in ' + (p.street ? p.street + ', ' : '') + (p.zip ? p.zip + ' ' : '') + cityRaw + '.' });
  }
  if (p.phone) {
    faqs.push({ q: 'Wie ist die Telefonnummer von ' + name + '?', a: name + ' erreichst du telefonisch unter ' + String(p.phone) + '.' });
  }
  if (p.hours) {
    faqs.push({ q: 'Wann hat ' + name + ' geöffnet?', a: 'Öffnungszeiten (laut OpenStreetMap): ' + String(p.hours) + '. Bitte vor dem Besuch direkt beim Lokal bestätigen.' });
  }
  faqs.push({ q: 'Kann ich bei ' + name + ' online bestellen?', a: name + ' ist aktuell noch kein Partner von ' + BRAND + '. Online bestellen oder einen Tisch reservieren kannst du bei den Partner-Restaurants in ' + cityRaw + ', die auf dieser Seite verlinkt sind.' });
  const faqLd = buildFaqJsonLd(faqs);
  const faqHtml = '<section class="faq fade" style="margin-top:28px;">' +
    '<h2 style="font-size:20px;margin:0 0 12px;">Häufige Fragen zu ' + eName + '</h2>' +
    faqs.map(function(f) {
      return '<div style="margin:0 0 14px;"><h3 style="font-size:15px;margin:0 0 4px;">' + escapeHtml(f.q) + '</h3>' +
        '<p style="margin:0;color:#444;">' + escapeHtml(f.a) + '</p></div>';
    }).join('') +
    '</section>';

  const robotsTag = isDraft
    ? '<meta name="robots" content="noindex,follow">'
    : '<meta name="robots" content="index,follow,max-image-preview:large">';

  const draftBanner = isDraft
    ? '<div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:10px 16px;border-radius:8px;margin:16px 0;font-size:14px;">' +
      '⚠️ <strong>Vorschau / Beispiel-Eintrag.</strong> Diese Seite ist als <code>draft</code> markiert (noindex) und noch nicht veröffentlicht. ' +
      'Setze in <code>prospects.json</code> <code>"draft": false</code> sobald die Daten geprüft sind.' +
      '</div>'
    : '';

  // Anruf-Button (echter Mehrwert fuer den Sucher) + Inhaber-Lead-CTA
  const phoneBtn = p.phone
    ? '<a class="cta-primary" href="tel:' + escapeAttr(String(p.phone).replace(/\s+/g, '')) + '">📞 ' + escapeHtml(String(p.phone)) + '</a>'
    : '';

  const ownerBox =
    '<div style="background:#f0fdf4;border:1px solid ' + PRIMARY_COLOR + ';border-radius:10px;padding:18px 20px;margin:28px 0;">' +
      '<h2 style="margin:0 0 6px;font-size:19px;">Ist das dein Restaurant?</h2>' +
      '<p style="margin:0 0 14px;color:#444;">' + escapeHtml(name) + ' ist noch nicht bei ' + BRAND + '. ' +
      'Trag dein Restaurant <strong>kostenlos</strong> ein und nimm Online-Bestellungen & Tisch-Reservierungen entgegen – ohne App, mit fairer Provision.</p>' +
      '<a href="' + PROSPECT_OWNER_CTA_URL + '" style="display:inline-block;background:' + PRIMARY_COLOR + ';color:#fff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;">Restaurant kostenlos eintragen</a>' +
    '</div>';

  const partnerBox = partners.length
    ? '<section class="crosslinks"><h3>Online bestellen in ' + escapeHtml(cityRaw) + '</h3>' +
      '<p style="margin:0 0 10px;color:#666;">Diese Restaurants in ' + escapeHtml(cityRaw) + ' kannst du direkt über ' + BRAND + ' bestellen:</p>' +
      '<div class="links">' +
      partners.map(function(r) {
        return '<a href="/' + escapeAttr(r.slug) + '">' + escapeHtml(safeText(r.name, 'Restaurant')) + '</a>';
      }).join('') +
      '</div></section>'
    : '';

  const html = '<!DOCTYPE html>\n<html lang="de">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + escapeHtml(title) + '</title>\n' +
    '<meta name="description" content="' + escapeAttr(description) + '">\n' +
    '<link rel="canonical" href="' + escapeAttr(url) + '">\n' +
    robotsTag + '\n' +
    '<meta name="geo.region" content="DE-NI">\n' +
    '<meta name="geo.placename" content="' + escapeAttr(cityRaw) + '">\n' +
    '<meta property="og:type" content="restaurant.restaurant">\n' +
    '<meta property="og:title" content="' + escapeAttr(title) + '">\n' +
    '<meta property="og:description" content="' + escapeAttr(description) + '">\n' +
    '<meta property="og:url" content="' + escapeAttr(url) + '">\n' +
    '<meta property="og:locale" content="de_DE">\n' +
    '<meta property="og:site_name" content="' + BRAND + '">\n' +
    '<meta property="og:image" content="' + SITE_URL + '/og-image.png">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:image" content="' + SITE_URL + '/og-image.png">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n' +
    '<style>' + pageCss() + '</style>\n' +
    '<script type="application/ld+json">' + jsonEscape(prospectLd) + '</script>\n' +
    '<script type="application/ld+json">' + jsonEscape(breadcrumbLd) + '</script>\n' +
    '<script type="application/ld+json">' + jsonEscape(faqLd) + '</script>\n' +
    // KEIN App-Redirect: Nicht-Partner haben keinen App-Eintrag. Die Seite
    // bleibt stehen und liefert dem Sucher Telefon/Adresse + Funnel zu Partnern.
    '</head>\n<body>\n' +
    renderHeader() + '\n' +
    renderBreadcrumb(breadcrumbCrumbs) + '\n' +
    '<main class="container">\n' +
    draftBanner +
    '<section class="hero hero-fallback fade"><div class="ov"></div><div class="inner">' +
      '<h1>' + escapeHtml(name) + '</h1>' +
      '<div class="meta">' + escapeHtml(catLabel) + ' in ' + escapeHtml(cityRaw) + '</div>' +
      (phoneBtn ? '<div style="margin-top:18px;">' + phoneBtn + '</div>' : '') +
    '</div></section>\n' +
    '<div class="intro fade d1">\n' +
      '<p>' + introHtml + '</p>\n' +
      (addrLine ? '<p><strong>Adresse:</strong> ' + addrLine + '</p>' : '') +
      (p.phone ? '<p><strong>Telefon:</strong> <a href="tel:' + escapeAttr(String(p.phone).replace(/\s+/g, '')) + '">' + escapeHtml(String(p.phone)) + '</a></p>' : '') +
      (hoursLine ? '<p><strong>Öffnungszeiten:</strong> ' + hoursLine + ' <span style="color:#888;font-size:13px;">(laut OpenStreetMap – bitte bestätigen)</span></p>' : '') +
      (p.cuisine ? '<p><strong>Küche:</strong> ' + eCuisine + '</p>' : '') +
      (p.website ? '<p><strong>Website:</strong> <a href="' + escapeAttr(p.website) + '" rel="nofollow">' + escapeHtml(p.website) + '</a></p>' : '') +
    '</div>\n' +
    faqHtml + '\n' +
    ownerBox + '\n' +
    partnerBox + '\n' +
    siblingBox + '\n' +
    renderCrossLinks(cityObj || { slug: citySlug, name: cityRaw, region: 'Ostfriesland' }, cat) + '\n' +
    '</main>\n' +
    '<footer class="site"><div class="container row">' +
      '<div>&copy; ' + new Date().getFullYear() + ' ' + BRAND + ' – Ostfrieslands Gastro-Plattform</div>' +
      '<div style="font-size:13px;color:#888;">Eintrag auf Basis öffentlicher Daten' +
        (p.source === 'osm' ? ' · © OpenStreetMap-Mitwirkende' : '') +
        '. Inhaber? <a href="' + PROSPECT_OWNER_CTA_URL + '">Eintrag bearbeiten oder entfernen lassen</a>.</div>' +
    '</div></footer>\n' +
    '</body></html>\n';

  const filename = slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, filename), html, 'utf8');
  return { filename: filename, url: url, count: 1, prospect: true, draft: isDraft };
}

// ==================== PAGE GENERATORS ====================

function generateCityCategoryPage(city, cat, restaurants, lang) {
  const matched = restaurants.filter(function(r) {
    return cityMatches(r, city) && categoryMatches(r, cat);
  });
  matched.sort(function(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });
  if (matched.length === 0) return null;

  lang = lang || 'de';
  const isEn = lang === 'en';
  const slug = cat.slug + '-' + city.slug;
  const deUrl = SITE_URL + '/' + slug;
  const enUrl = SITE_URL + '/en/' + slug;
  const url = isEn ? enUrl : deUrl;
  const pluralL = isEn ? (cat.pluralEn || cat.plural) : cat.plural;
  const labelL = isEn ? (cat.labelEn || cat.label) : cat.label;
  const descEn = cat.descriptionEn || cat.description;

  // Titel mit echter Anzahl + Jahr: "Die 7 besten Pizzerien in Emden (2026)"
  // klickt nachweislich besser als ein generischer Titel - Anzahl und Jahr
  // sind ECHT (Anzahl = gelistete Betriebe, Jahr = Build-Zeitpunkt).
  const jahr = new Date().getFullYear();
  const title = matched.length >= 2
    ? (isEn
      ? 'The ' + matched.length + ' best ' + pluralL + ' in ' + city.name + ' (' + jahr + ') | ' + BRAND
      : 'Die ' + matched.length + ' besten ' + cat.plural + ' in ' + city.name + ' (' + jahr + ') | ' + BRAND)
    : (isEn
      ? pluralL + ' in ' + city.name + ' – order online | ' + BRAND
      : cat.plural + ' in ' + city.name + ' – online bestellen | ' + BRAND);
  const description = isEn
    ? 'The best ' + pluralL + ' in ' + city.name + ' on ' + BRAND + '. ' +
      descEn.charAt(0).toUpperCase() + descEn.slice(1) + '. View menu, order online & book a table – free!'
    : 'Die besten ' + cat.plural + ' in ' + city.name + ' auf ' + BRAND + '. ' +
      cat.descriptionDe.charAt(0).toUpperCase() + cat.descriptionDe.slice(1) +
      '. Speisekarte ansehen, online bestellen & reservieren – kostenlos!';

  const html = buildPage({
    lang: lang,
    altDe: deUrl,
    altEn: enUrl,
    title: title,
    description: description.length > 165 ? description.slice(0, 162) + '...' : description,
    canonical: url,
    h1: matched.length >= 2
      ? (isEn ? 'The ' + matched.length + ' best ' : 'Die ' + matched.length + ' besten ') + pluralL + ' in ' + city.name
      : (isEn ? 'The best ' : 'Die besten ') + pluralL + ' in ' + city.name,
    subtitle: matched.length + ' ' + (matched.length === 1 ? labelL : pluralL) + ' in ' + city.name +
      (isEn ? ' – menus, reviews, order online' : ' – Speisekarten, Bewertungen, online bestellen'),
    intro: isEn ? buildIntroEn(city, cat, matched.length) : buildIntro(city, cat, matched.length),
    restaurants: matched,
    faqs: isEn ? buildFaqsEn(city, cat, matched) : buildFaqs(city, cat, matched),
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Startseite', url: isEn ? SITE_URL + '/en' : SITE_URL + '/' },
      { name: city.name, url: isEn ? SITE_URL + '/en/restaurants-' + city.slug : SITE_URL + '/restaurants-' + city.slug },
      { name: pluralL + ' in ' + city.name, url: url }
    ],
    city: city,
    category: cat,
    gridHeading: (isEn ? 'Top ' : 'Top-') + pluralL + ' in ' + city.name
  });

  if (isEn) {
    const enDir = path.join(OUT_DIR, 'en');
    if (!fs.existsSync(enDir)) fs.mkdirSync(enDir, { recursive: true });
  }
  const relpath = (isEn ? 'en/' : '') + slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, relpath), html, 'utf8');
  return { filename: relpath, url: url, count: matched.length };
}

function generateCityOverview(city, restaurants, lang) {
  const matched = restaurants.filter(function(r) { return cityMatches(r, city); });
  matched.sort(function(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });
  if (matched.length === 0) return null;

  lang = lang || 'de';
  const isEn = lang === 'en';
  const cat = CATEGORIES[CATEGORIES.length - 1];
  const slug = 'restaurants-' + city.slug;
  const deUrl = SITE_URL + '/' + slug;
  const enUrl = SITE_URL + '/en/' + slug;
  const url = isEn ? enUrl : deUrl;

  const title = isEn
    ? 'Restaurants in ' + city.name + ' – order & book online | ' + BRAND
    : 'Restaurants in ' + city.name + ' – online bestellen & reservieren | ' + BRAND;
  const description = isEn
    ? 'All ' + matched.length + ' restaurants in ' + city.name + ' at a glance. Pizzerias, kebabs, fish restaurants & more. Menus, reviews, order online & book a table.'
    : 'Alle ' + matched.length + ' Restaurants in ' + city.name + ' auf einen Blick. Pizzerien, Doener, Fischrestaurants & mehr. Speisekarte, Bewertungen, online bestellen & reservieren.';

  const html = buildPage({
    lang: lang,
    altDe: deUrl,
    altEn: enUrl,
    title: title,
    description: description.length > 160 ? description.slice(0, 157) + '...' : description,
    canonical: url,
    h1: 'Restaurants in ' + city.name,
    subtitle: isEn
      ? matched.length + ' restaurants, pizzerias, snack bars & cafés in ' + city.name
      : matched.length + ' Restaurants, Pizzerien, Imbisse & Cafés in ' + city.name,
    intro: isEn ? buildIntroEn(city, cat, matched.length) : buildIntro(city, cat, matched.length),
    restaurants: matched,
    faqs: isEn ? buildFaqsEn(city, cat, matched) : buildFaqs(city, cat, matched),
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Startseite', url: isEn ? SITE_URL + '/en' : SITE_URL + '/' },
      { name: city.name, url: url }
    ],
    city: city,
    category: cat,
    gridHeading: (isEn ? 'Popular restaurants in ' : 'Beliebte Restaurants in ') + city.name
  });

  if (isEn) {
    const enDir = path.join(OUT_DIR, 'en');
    if (!fs.existsSync(enDir)) fs.mkdirSync(enDir, { recursive: true });
  }
  const relpath = (isEn ? 'en/' : '') + slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, relpath), html, 'utf8');
  return { filename: relpath, url: url, count: matched.length };
}

function generateCategoryOverview(cat, restaurants, lang) {
  const matched = restaurants.filter(function(r) { return categoryMatches(r, cat); });
  matched.sort(function(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });
  if (matched.length === 0) return null;

  lang = lang || 'de';
  const isEn = lang === 'en';
  const slug = cat.slug + '-ostfriesland';
  const deUrl = SITE_URL + '/' + slug;
  const enUrl = SITE_URL + '/en/' + slug;
  const url = isEn ? enUrl : deUrl;
  const pluralL = isEn ? (cat.pluralEn || cat.plural) : cat.plural;
  const descLocal = isEn ? (cat.descriptionEn || cat.description) : cat.descriptionDe;
  const pseudoCity = { slug: 'ostfriesland', name: isEn ? 'East Frisia' : 'Ostfriesland', region: isEn ? 'East Frisia' : 'Ostfriesland' };

  const title = isEn
    ? pluralL + ' in East Frisia – order online | ' + BRAND
    : cat.plural + ' in Ostfriesland – online bestellen | ' + BRAND;
  const description = isEn
    ? 'All ' + pluralL + ' in East Frisia: ' + descLocal + '. Menus, reviews, order online & book a table on ' + BRAND + ' – free.'
    : 'Alle ' + cat.plural + ' in Ostfriesland: ' + cat.descriptionDe + '. Speisekarte, Bewertungen, online bestellen & Tisch reservieren auf ' + BRAND + ' – kostenlos.';

  const introHtml = isEn
    ? '<p>East Frisia is more than tea, the Wadden Sea and twin windmills — the region has a surprisingly diverse food scene. ' +
      descLocal.charAt(0).toUpperCase() + descLocal.slice(1) + ' can be found in every larger town.</p>' +
      '<p>Right now ' + BRAND + ' lists <strong>' + matched.length + ' ' + pluralL + '</strong> in East Frisia. You can order online, view a menu or book a table directly.</p>' +
      '<p>' + BRAND + ' is the regional platform for East Frisian gastronomy — no chains, no high commissions. What you order comes from the region, and the money stays here.</p>'
    : '<p>Ostfriesland ist mehr als Tee, Wattenmeer und Zwillingsmühlen – die Region hat eine erstaunlich vielfältige Gastro-Szene. ' +
      cat.descriptionDe.charAt(0).toUpperCase() + cat.descriptionDe.slice(1) + ' findest du hier in jeder größeren Stadt.</p>' +
      '<p>Aktuell sind <strong>' + matched.length + ' ' + cat.plural + '</strong> in Ostfriesland auf ' + BRAND + ' verfügbar. Du kannst direkt online bestellen, eine Speisekarte ansehen oder einen Tisch reservieren.</p>' +
      '<p>' + BRAND + ' ist die regionale Plattform fuer ostfriesische Gastronomie – ohne Konzern, ohne hohe Provisionen. Was du bestellst, kommt aus der Region und das Geld bleibt hier.</p>';

  const faqs = isEn ? [
    { q: 'Where do I find the best ' + pluralL + ' in East Frisia?', a: 'On ' + BRAND + ' you can find a selection of the best ' + pluralL + ' in Greetsiel, Norden, Norddeich, Aurich and Emden — sorted by rating so you immediately see where it is worth going.' },
    { q: 'Do all ' + pluralL + ' in East Frisia deliver?', a: 'No, not all ' + pluralL + ' offer delivery. On each restaurant page you can see who delivers, who offers pickup, and who serves on-site only.' },
    { q: 'Which towns are featured on ' + BRAND + '?', a: BRAND + ' currently covers Greetsiel, Norden, Norddeich, Aurich and Emden — with plans to expand into further East Frisian towns.' }
  ] : [
    { q: 'Wo gibt es die besten ' + cat.plural + ' in Ostfriesland?', a: 'Auf ' + BRAND + ' findest du eine Auswahl der besten ' + cat.plural + ' in Greetsiel, Norden, Norddeich, Aurich und Emden. Sortiert nach Bewertung – damit du sofort siehst, wo es sich lohnt.' },
    { q: 'Liefern alle ' + cat.plural + ' in Ostfriesland?', a: 'Nein, nicht alle ' + cat.plural + ' bieten Lieferung an. Auf den einzelnen Restaurant-Seiten siehst du, welche Anbieter liefern, abholen oder nur vor Ort servieren.' },
    { q: 'Welche Städte sind auf ' + BRAND + ' vertreten?', a: BRAND + ' deckt aktuell Greetsiel, Norden, Norddeich, Aurich und Emden ab – mit Ausweitung in weitere ostfriesische Orte in Planung.' }
  ];

  const html = buildPage({
    lang: lang,
    altDe: deUrl,
    altEn: enUrl,
    title: title,
    description: description.length > 160 ? description.slice(0, 157) + '...' : description,
    canonical: url,
    h1: pluralL + (isEn ? ' in East Frisia' : ' in Ostfriesland'),
    subtitle: matched.length + ' ' + pluralL + (isEn ? ' in Greetsiel, Norden, Norddeich, Aurich, Emden & surroundings' : ' in Greetsiel, Norden, Norddeich, Aurich, Emden & Umgebung'),
    intro: introHtml,
    restaurants: matched,
    faqs: faqs,
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Startseite', url: isEn ? SITE_URL + '/en' : SITE_URL + '/' },
      { name: isEn ? 'East Frisia' : 'Ostfriesland', url: isEn ? SITE_URL + '/en' : SITE_URL + '/' },
      { name: pluralL, url: url }
    ],
    city: pseudoCity,
    category: cat,
    gridHeading: (isEn ? 'Top ' : 'Top-') + pluralL + (isEn ? ' in East Frisia' : ' in Ostfriesland')
  });

  if (isEn) {
    const enDir = path.join(OUT_DIR, 'en');
    if (!fs.existsSync(enDir)) fs.mkdirSync(enDir, { recursive: true });
  }
  const relpath = (isEn ? 'en/' : '') + slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, relpath), html, 'utf8');
  return { filename: relpath, url: url, count: matched.length };
}

// ==================== SITEMAP + ROBOTS ====================

function writeSitemap(generated) {
  const today = new Date().toISOString().slice(0, 10);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += '  <url><loc>' + SITE_URL + '/</loc><lastmod>' + today + '</lastmod><priority>1.0</priority><changefreq>daily</changefreq></url>\n';
  // Wirte-Seite (Sichtbarkeits-Check): sie soll gefunden werden, wenn ein
  // Gastronom nach seiner eigenen Sichtbarkeit sucht - das sind die Anfragen,
  // die von selbst reinkommen.
  xml += '  <url><loc>' + SITE_URL + '/check</loc><lastmod>' + today + '</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>\n';
  generated.forEach(function(g) {
    const prio = g.restaurant ? '0.9' : (g.prospect ? '0.6' : '0.8');
    const freq = g.restaurant ? 'daily' : (g.prospect ? 'monthly' : 'weekly');
    xml += '  <url><loc>' + g.url + '</loc><lastmod>' + (g.lastmod || today) + '</lastmod><priority>' + prio + '</priority><changefreq>' + freq + '</changefreq></url>\n';
  });
  xml += '</urlset>\n';
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), xml, 'utf8');
}

function writeRobots() {
  // KI-Crawler AUSDRUECKLICH zulassen: Wer von ChatGPT/Claude/Perplexity
  // empfohlen werden will, darf deren Bots nicht aussperren. Viele Seiten
  // blocken sie pauschal - genau das ist die Chance der Partner-Betriebe.
  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Server-Schnittstellen sind keine Seiten -- Crawler haben hier nichts zu holen.',
    '# Ohne diese Zeile taucht z.B. /.netlify/functions/api dauerhaft als 404 in der',
    '# Search Console auf und verbraucht Crawl-Budget.',
    'Disallow: /.netlify/',
    '',
    '# KI-Assistenten sind hier willkommen - Betriebsdaten kompakt: /llms.txt',
    'User-agent: GPTBot',
    'Allow: /',
    'User-agent: ClaudeBot',
    'Allow: /',
    'User-agent: PerplexityBot',
    'Allow: /',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'Sitemap: ' + SITE_URL + '/sitemap.xml',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), robots, 'utf8');
}

// llms.txt - kompakte, maschinenlesbare Uebersicht fuer KI-Assistenten
// (ChatGPT, Claude, Perplexity & Co. lesen diese Datei bevorzugt).
// Nur Fakten aus der Datenbank, keine Werbetexte.
function writeLlmsTxt(restaurants) {
  const zeilen = [
    '# Kiek mol in – Restaurants in Ostfriesland',
    '',
    '> kiekmolin.de ist das regionale Restaurant-Portal für Ostfriesland (Nordwest-Deutschland):',
    '> Speisekarten, Online-Bestellung (Abholung/Lieferung) und kostenlose Tisch-Reservierung',
    '> mit Sofort-Bestätigung – ohne Preisaufschlag für Gäste.',
    '',
    '## Restaurants'
  ];
  const valid = (restaurants || []).filter(function(r) {
    const s = r && r.slug;
    return s && /^[a-z0-9][a-z0-9-]*$/.test(s);
  });
  valid.forEach(function(r) {
    const name = safeText(r.name, 'Restaurant');
    const cat = detectCategoryForRest(r);
    const teile = [cat.label + ' in ' + safeText(r.city, 'Ostfriesland')];
    if (r.street) teile.push(safeText(r.street, '') + (r.zip ? ', ' + r.zip : '') + ' ' + safeText(r.city, ''));
    const oeff = parseOeffnungszeiten(r);
    if (oeff.text) teile.push('geöffnet ' + oeff.text);
    if (r.phone) teile.push('Tel. ' + r.phone);
    teile.push('Online bestellen & Tisch reservieren');
    zeilen.push('- [' + name + '](' + SITE_URL + '/' + r.slug + '): ' + teile.join('. ') + '.');
  });
  zeilen.push('', '## Orte');
  CITIES.forEach(function(c) {
    zeilen.push('- [Restaurants in ' + c.name + '](' + SITE_URL + '/restaurants-' + c.slug + ')');
  });
  zeilen.push('', '## Kategorien');
  CATEGORIES.forEach(function(c) {
    zeilen.push('- [' + c.plural + ' in Ostfriesland](' + SITE_URL + '/' + c.slug + '-ostfriesland)');
  });
  zeilen.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'llms.txt'), zeilen.join('\n'), 'utf8');
  return valid.length;
}

// IndexNow: Suchmaschinen (Bing, Yandex u.a. -> Google liest IndexNow-Daten
// ebenfalls aus) sofort ueber neue/geaenderte URLs informieren. Statt Wochen
// auf den Crawler zu warten, sind neue Restaurants in Stunden im Index.
// Schluessel liegt als <key>.txt im Web-Root. Fault-tolerant: Fehler ignorieren.
const INDEXNOW_KEY = 'b922131c20477eae9293e34da9b9dba9';
async function pingIndexNow(generated) {
  try {
    const host = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const urlList = [SITE_URL + '/'].concat(generated.map(function(g) { return g.url; }));
    // IndexNow akzeptiert bis 10.000 URLs pro Request.
    const payload = {
      host: host,
      key: INDEXNOW_KEY,
      keyLocation: SITE_URL + '/' + INDEXNOW_KEY + '.txt',
      urlList: urlList.slice(0, 10000)
    };
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    console.log('[seo] IndexNow ping: HTTP ' + res.status + ' (' + urlList.length + ' urls)');
  } catch (e) {
    console.warn('[seo] WARN: IndexNow ping fehlgeschlagen -', e.message);
  }
}

// Injiziert ALLE aktiven Restaurants als crawlbare Links in index.html
// (Footer-Liste + noscript-Liste). Faellt still zurueck auf die fest
// verdrahteten Links, wenn keine Daten/Marker vorhanden sind.
function injectHomepageRestaurantLinks(restaurants) {
  const indexPath = path.join(OUT_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) return;

  const valid = (restaurants || []).filter(function(r) {
    const s = r && (r.slug || r.id);
    return s && typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s);
  });
  if (!valid.length) return; // nichts ueberschreiben, wenn keine Daten

  valid.sort(function(a, b) {
    const ca = safeText(a.city, ''), cb = safeText(b.city, '');
    if (ca !== cb) return ca.localeCompare(cb);
    return safeText(a.name, '').localeCompare(safeText(b.name, ''));
  });

  function displayName(r) {
    const name = safeText(r.name, 'Restaurant');
    const city = safeText(r.city, '');
    if (city && normalize(name).indexOf(normalize(city)) === -1) return name + ' ' + city;
    return name;
  }

  const footerLinks = valid.map(function(r) {
    const slug = r.slug || r.id;
    return '        <a href="/' + encodeURIComponent(slug) + '" onclick="openRestaurantBySlug(\'' + escapeAttr(slug) + '\');return false;" style="color:var(--primary);text-decoration:none;font-weight:600;font-size:11px;">' + escapeHtml(displayName(r)) + '</a>';
  }).join('\n');

  const noscriptLinks = valid.map(function(r) {
    const slug = r.slug || r.id;
    const cat = detectCategoryForRest(r);
    const desc = r.description
      ? String(r.description).slice(0, 160)
      : cat.label + ' in ' + safeText(r.city, 'Ostfriesland') + ' – Speisekarte ansehen, online bestellen & Tisch reservieren auf ' + BRAND + '.';
    return '            <li><a href="/' + encodeURIComponent(slug) + '"><strong>' + escapeHtml(displayName(r)) + '</strong> &ndash; ' + escapeHtml(desc) + '</a></li>';
  }).join('\n');

  let html = fs.readFileSync(indexPath, 'utf8');
  const before = html;
  html = html.replace(/<!--KMI:REST-LINKS-START-->[\s\S]*?<!--KMI:REST-LINKS-END-->/, function() {
    return '<!--KMI:REST-LINKS-START-->\n' + footerLinks + '\n<!--KMI:REST-LINKS-END-->';
  });
  html = html.replace(/<!--KMI:REST-NOSCRIPT-START-->[\s\S]*?<!--KMI:REST-NOSCRIPT-END-->/, function() {
    return '<!--KMI:REST-NOSCRIPT-START-->\n' + noscriptLinks + '\n<!--KMI:REST-NOSCRIPT-END-->';
  });

  if (html !== before) {
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('[seo] index.html: ' + valid.length + ' Restaurant-Links injiziert (Footer + noscript)');
  } else {
    console.warn('[seo] WARN: index.html Marker nicht gefunden - Links unveraendert');
  }
}

// ==================== MAIN ====================

async function main() {
  console.log('[seo] Kiek mol in - SEO-Pages-Generator');
  console.log('[seo] Cities:', CITIES.length, '· Categories:', CATEGORIES.length);

  let restaurants = [];
  let supaOk = true;
  try {
    console.log('[seo] Fetching restaurants from Supabase...');
    restaurants = await fetchRestaurants();
    console.log('[seo] Got', restaurants.length, 'active restaurants');
  } catch (err) {
    supaOk = false;
    console.warn('[seo] WARN: Supabase fetch failed:', err.message);
    console.warn('[seo] Partner-Seiten werden uebersprungen - Prospect-Seiten werden trotzdem gebaut.');
  }

  const generated = [];
  let skipped = 0;

  // Ermitteln, welche Ort-/Kategorie-Seiten dieser Build ueberhaupt erzeugt.
  // MUSS vor der ersten Seite laufen -- auch Prospect-Seiten rendern
  // Cross-Links und duerfen nur auf real existierende Ziele zeigen.
  buildAvailableSlugs(restaurants);
  console.log('[seo] Verlinkbare Verzeichnis-Seiten:', AVAILABLE_SLUGS.size);

  // Verzeichnis-/Prospect-Seiten (Nicht-Partner) - unabhaengig von Supabase
  let prospectCount = 0, prospectDraft = 0;
  try {
    const prospects = loadProspects();
    for (const p of prospects) {
      const result = generateProspectPage(p, restaurants, prospects);
      if (result) {
        console.log('[seo] +', result.filename, '(prospect: ' + (p.name || '?') + (result.draft ? ' · DRAFT/noindex' : ' · live') + ')');
        prospectCount++;
        if (result.draft) prospectDraft++;
        else generated.push(result);   // nur Live-Eintraege in die Sitemap
      }
    }
  } catch (e) {
    console.warn('[seo] WARN: Prospect-Generierung fehlgeschlagen -', e.message);
  }
  console.log('[seo] Verzeichnis-Seiten:', prospectCount, '(davon Draft/noindex: ' + prospectDraft + ')');

  // Ist Supabase weg, bauen wir KEINE Partner-Seiten und ueberschreiben die
  // Sitemap NICHT (sonst gingen alle Partner-URLs verloren). Prospect-HTML
  // liegt aber schon auf der Platte und kommt beim naechsten guten Deploy rein.
  if (!supaOk) {
    console.warn('[seo] Supabase nicht erreichbar -> nur Verzeichnis-Seiten gebaut, Sitemap unveraendert.');
    process.exit(0);
  }

  // Pro Stadt × Kategorie: DE + EN
  const LANGS = ['de', 'en'];
  for (const city of CITIES) {
    for (const cat of CATEGORIES) {
      if (cat.slug === 'restaurant') continue;
      for (const lng of LANGS) {
        const result = generateCityCategoryPage(city, cat, restaurants, lng);
        if (result) {
          console.log('[seo] +', result.filename, '(' + result.count + ' restaurants)');
          generated.push(result);
        } else if (lng === 'de') {
          skipped++;
        }
      }
    }
  }

  for (const city of CITIES) {
    for (const lng of LANGS) {
      const result = generateCityOverview(city, restaurants, lng);
      if (result) {
        console.log('[seo] +', result.filename, '(' + result.count + ' restaurants)');
        generated.push(result);
      }
    }
  }

  for (const cat of CATEGORIES) {
    for (const lng of LANGS) {
      const result = generateCategoryOverview(cat, restaurants, lng);
      if (result) {
        console.log('[seo] +', result.filename, '(' + result.count + ' restaurants)');
        generated.push(result);
      }
    }
  }

  // Per-Restaurant SEO-Pages — damit "La Piazza Greetsiel" direkt findet
  // Inkl. Menu-Items aus Supabase fuer Rich Snippets (wie ostfriesland.app)
  let restaurantPages = 0;
  let totalMenuItems = 0;
  let totalReviews = 0;
  for (const rest of restaurants) {
    try {
      let menuItems = [];
      let reviews = [];
      if (rest.id) {
        menuItems = await fetchMenuItems(rest.id);
        reviews = await fetchReviews(rest.id);
      }
      const result = generateRestaurantPage(rest, menuItems, reviews);
      if (result) {
        console.log('[seo] +', result.filename, '(restaurant: ' + (rest.name || '?') + ', ' + (result.menuCount || 0) + ' menu items, ' + (reviews.length || 0) + ' reviews)');
        generated.push(result);
        restaurantPages++;
        totalMenuItems += result.menuCount || 0;
        totalReviews += reviews.length || 0;
      }
    } catch (e) {
      console.warn('[seo] WARN: skip restaurant page for', rest && rest.name, '-', e.message);
    }
  }
  console.log('[seo] Restaurant-Detail-Pages:', restaurantPages, '· menu items:', totalMenuItems, '· reviews embedded:', totalReviews);

  try {
    injectHomepageRestaurantLinks(restaurants);
  } catch (e) {
    console.warn('[seo] WARN: injectHomepageRestaurantLinks failed -', e.message);
  }

  writeSitemap(generated);
  writeRobots();
  console.log('[seo] + sitemap.xml (' + (generated.length + 1) + ' urls)');
  console.log('[seo] + robots.txt (KI-Crawler ausdruecklich erlaubt)');
  try {
    const llmsCount = writeLlmsTxt(restaurants);
    console.log('[seo] + llms.txt (' + llmsCount + ' Betriebe fuer KI-Assistenten)');
  } catch (e) {
    console.warn('[seo] WARN: llms.txt fehlgeschlagen -', e.message);
  }

  // Suchmaschinen sofort anstossen (nur wenn wirklich Seiten gebaut wurden)
  if (generated.length) {
    await pingIndexNow(generated);
  }
  console.log('[seo] Done. Generated:', generated.length, 'Skipped (empty):', skipped);
}

// Direkt aufgerufen (Netlify-Build): Seiten bauen. Als Modul geladen
// (test-seo.js): nur die Funktionen exportieren, nichts ausfuehren.
if (require.main === module) {
  main().catch(function(err) {
    console.error('[seo] FATAL:', err && err.stack ? err.stack : err);
    // fault tolerant: deploy soll nicht scheitern
    process.exit(0);
  });
} else {
  module.exports = {
    parseOeffnungszeiten: parseOeffnungszeiten,
    buildRestaurantFaqs: buildRestaurantFaqs,
    buildRestaurantJsonLd: buildRestaurantJsonLd,
    generateRestaurantPage: generateRestaurantPage,
    generateCityCategoryPage: generateCityCategoryPage,
    writeLlmsTxt: writeLlmsTxt,
    writeSitemap: writeSitemap,
    writeRobots: writeRobots,
    CITIES: CITIES,
    CATEGORIES: CATEGORIES
  };
}
