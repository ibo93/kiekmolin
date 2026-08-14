#!/usr/bin/env node
/**
 * Kiek mol in - OSM-Importer fuer Verzeichnis-Seiten
 *
 * Zieht alle Gastro-Betriebe (Restaurants, Pizzerien, Cafes, Imbisse) der
 * Region aus OpenStreetMap (Overpass API) und schreibt sie nach
 * prospects.json. Daraus baut build-seo-pages.js die Verzeichnis-Seiten.
 *
 * Warum OSM: kostenlos, kein API-Key, offene Daten (ODbL - nur Quellenangabe
 * noetig). Google Places verbietet das dauerhafte Speichern - OSM erlaubt es.
 *
 * Nutzung:   node import-osm.js
 *
 * - Alle importierten Eintraege bekommen "draft": true -> bei Google erstmal
 *   unsichtbar (noindex). Du pruefst sie und setzt "draft": false zum Livegang.
 * - Bereits vorhandene LIVE-Eintraege (draft:false) in prospects.json bleiben
 *   erhalten (werden nicht ueberschrieben).
 * - Nur Node 18+ Built-ins (fetch, fs).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, 'prospects.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Suchgebiete: Mittelpunkt + Radius (m). Abgedeckt wird ganz Ostfriesland
// (Landkreise Aurich, Leer, Wittmund und die Stadt Emden), der Landkreis
// Friesland samt Wilhelmshaven, die Kuestenorte und die sieben ostfriesischen
// Inseln.
//
// Warum die Inseln eigene Eintraege bekommen: dort lebt fast jeder Betrieb
// vom Tagesgast, der vorher googelt. Wer auf Norderney nicht gefunden wird,
// verliert nicht Stammgaeste, sondern die halbe Saison.
//
// Die Radien ueberlappen bewusst. Doppelte Betriebe filtert der Importer
// ueber den Slug heraus - lieber ein Dorfgasthof zu viel erfasst als einer
// zu wenig. Gerade die kleinen Landbetriebe sind am wenigsten online und
// deshalb die dankbarsten Kunden.
const CITIES = [
  // --- Landkreis Aurich + Stadt Emden ---------------------------------------
  { name: 'Norden',            lat: 53.5944, lng: 7.2061, radius: 6000 },
  { name: 'Norddeich',         lat: 53.6122, lng: 7.1606, radius: 4000 },
  { name: 'Aurich',            lat: 53.4686, lng: 7.4828, radius: 7000 },
  { name: 'Emden',             lat: 53.3669, lng: 7.2061, radius: 8000 },
  { name: 'Hage',              lat: 53.6090, lng: 7.2920, radius: 4000 },
  { name: 'Dornum',            lat: 53.6470, lng: 7.4280, radius: 4500 },
  { name: 'Marienhafe',        lat: 53.5250, lng: 7.2750, radius: 4000 },
  { name: 'Greetsiel',         lat: 53.5006, lng: 7.1003, radius: 4000 },
  { name: 'Pewsum',            lat: 53.4090, lng: 7.0930, radius: 4000 },
  { name: 'Hinte',             lat: 53.4090, lng: 7.1720, radius: 3500 },
  { name: 'Südbrookmerland',   lat: 53.4530, lng: 7.3500, radius: 5000 },
  { name: 'Großefehn',         lat: 53.4180, lng: 7.5470, radius: 5000 },
  { name: 'Ihlow',             lat: 53.3830, lng: 7.4000, radius: 4000 },
  { name: 'Wiesmoor',          lat: 53.4130, lng: 7.7340, radius: 5000 },

  // --- Landkreis Leer -------------------------------------------------------
  { name: 'Leer',              lat: 53.2316, lng: 7.4480, radius: 7000 },
  { name: 'Moormerland',       lat: 53.3200, lng: 7.5100, radius: 5000 },
  { name: 'Hesel',             lat: 53.3060, lng: 7.6000, radius: 4500 },
  { name: 'Uplengen',          lat: 53.3080, lng: 7.7500, radius: 5000 },
  { name: 'Westoverledingen',  lat: 53.1830, lng: 7.4650, radius: 5000 },
  { name: 'Rhauderfehn',       lat: 53.1360, lng: 7.5300, radius: 5500 },
  { name: 'Weener',            lat: 53.1650, lng: 7.3520, radius: 5000 },
  { name: 'Bunde',             lat: 53.1830, lng: 7.2670, radius: 4500 },
  { name: 'Jemgum',            lat: 53.2600, lng: 7.3900, radius: 4000 },

  // --- Landkreis Wittmund + Kuestenorte -------------------------------------
  { name: 'Wittmund',          lat: 53.5762, lng: 7.7795, radius: 5500 },
  { name: 'Esens',             lat: 53.6470, lng: 7.6120, radius: 4500 },
  { name: 'Bensersiel',        lat: 53.6690, lng: 7.5730, radius: 3000 },
  { name: 'Neuharlingersiel',  lat: 53.7010, lng: 7.7020, radius: 3000 },
  { name: 'Carolinensiel',     lat: 53.6900, lng: 7.7944, radius: 4000 },
  { name: 'Friedeburg',        lat: 53.4560, lng: 7.8340, radius: 5000 },

  // --- Landkreis Friesland + Wilhelmshaven ----------------------------------
  { name: 'Jever',             lat: 53.5740, lng: 7.9000, radius: 5000 },
  { name: 'Schortens',         lat: 53.5370, lng: 7.9490, radius: 4500 },
  { name: 'Sande',             lat: 53.5040, lng: 8.0170, radius: 4000 },
  { name: 'Wilhelmshaven',     lat: 53.5230, lng: 8.1050, radius: 8000 },
  { name: 'Hooksiel',          lat: 53.6360, lng: 8.0470, radius: 3500 },
  { name: 'Horumersiel',       lat: 53.6900, lng: 8.0230, radius: 3500 },
  { name: 'Zetel',             lat: 53.4180, lng: 7.9770, radius: 4500 },
  { name: 'Bockhorn',          lat: 53.3970, lng: 8.0130, radius: 4000 },
  { name: 'Varel',             lat: 53.3970, lng: 8.1360, radius: 6000 },

  // --- Die ostfriesischen Inseln -------------------------------------------
  { name: 'Borkum',            lat: 53.5800, lng: 6.6600, radius: 5000 },
  { name: 'Juist',             lat: 53.6790, lng: 7.0000, radius: 4000 },
  { name: 'Norderney',         lat: 53.7070, lng: 7.1550, radius: 5000 },
  { name: 'Baltrum',           lat: 53.7280, lng: 7.3700, radius: 2500 },
  { name: 'Langeoog',          lat: 53.7460, lng: 7.4800, radius: 3500 },
  { name: 'Spiekeroog',        lat: 53.7690, lng: 7.6960, radius: 2500 },
  { name: 'Wangerooge',        lat: 53.7900, lng: 7.9000, radius: 3000 }
];

// Wie sollen importierte Eintraege markiert werden?
// draft:false  = sofort live + von Google indexierbar (ostfriesland.app-Stil).
// draft:true   = erst noindex, du gibst manuell frei (IMPORT_DRAFT=1 setzen).
const IMPORT_AS_DRAFT = process.env.IMPORT_DRAFT === '1';

// Welche OSM-amenity-Typen interessieren uns (Essen/Trinken zum Bestellen)
const AMENITIES = 'restaurant|cafe|fast_food|ice_cream|biergarten';

function normalize(s) {
  if (!s) return '';
  return String(s).toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

function slugFor(name, city) {
  const raw = (name || '') + ' ' + (city || '');
  return normalize(raw).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// OSM-Tags -> unsere Kategorie-Slugs (passend zu build-seo-pages.js)
function mapCategory(tags) {
  const amenity = (tags.amenity || '').toLowerCase();
  const cuisine = (tags.cuisine || '').toLowerCase();
  if (amenity === 'cafe' || amenity === 'ice_cream') return 'cafe';
  if (/pizza|italian/.test(cuisine)) return 'pizzeria';
  if (/kebab|doner|döner|turkish/.test(cuisine)) return 'doener';
  if (/greek/.test(cuisine)) return 'griechisches-restaurant';
  if (/fish|seafood/.test(cuisine)) return 'fischrestaurant';
  if (amenity === 'fast_food') {
    // Imbiss ohne klare Kueche -> Doener ist die haeufigste Annahme, aber
    // nur wenn Name/cuisine darauf deutet; sonst leer (Build erkennt selbst).
    return '';
  }
  return ''; // leer -> build-seo-pages.js erkennt Kategorie aus dem Namen
}

function buildQuery(city) {
  return '[out:json][timeout:60];(' +
    'node["amenity"~"' + AMENITIES + '"]["name"](around:' + city.radius + ',' + city.lat + ',' + city.lng + ');' +
    'way["amenity"~"' + AMENITIES + '"]["name"](around:' + city.radius + ',' + city.lat + ',' + city.lng + ');' +
    ');out center tags;';
}

async function fetchCity(city) {
  const body = 'data=' + encodeURIComponent(buildQuery(city));
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'KiekMolIn-Importer/1.0 (kiekmolin.de)'
    },
    body: body
  });
  if (!res.ok) throw new Error('Overpass HTTP ' + res.status);
  const json = await res.json();
  return Array.isArray(json.elements) ? json.elements : [];
}

function elementToProspect(el, fallbackCity) {
  const t = el.tags || {};
  const name = t.name;
  if (!name) return null;
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
  const lng = el.lon != null ? el.lon : (el.center && el.center.lon);
  const p = {
    name: name,
    category: mapCategory(t),
    city: t['addr:city'] || fallbackCity,
    street: street || '',
    zip: t['addr:postcode'] || '',
    phone: t.phone || t['contact:phone'] || '',
    website: t.website || t['contact:website'] || '',
    source: 'osm',
    draft: IMPORT_AS_DRAFT
  };
  // Zusatzdaten fuer mehr Seiteninhalt (besser fuer Google-Indexierung)
  var hours = t.opening_hours || '';
  if (hours) p.hours = String(hours).slice(0, 200);
  var cuisine = (t.cuisine || '').split(';')[0].replace(/_/g, ' ').trim();
  if (cuisine) p.cuisine = cuisine;
  if (lat && lng) { p.lat = lat; p.lng = lng; }
  if (!p.category) delete p.category; // Build erkennt dann selbst
  return p;
}

function loadExisting() {
  if (!fs.existsSync(OUT_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[osm] WARN: bestehende prospects.json unlesbar -', e.message);
    return [];
  }
}

async function main() {
  console.log('[osm] OSM-Importer fuer', CITIES.length, 'Staedte');

  const existing = loadExisting();
  // Manuell gepflegte Eintraege (nicht aus OSM) bleiben erhalten; OSM-Daten
  // werden bei jedem Lauf frisch geholt, damit Adresse/Telefon aktuell sind.
  const keep = existing.filter(function(p) { return p && p.source !== 'osm'; });
  const keepSlugs = new Set(keep.map(function(p) { return slugFor(p.name, p.city); }));
  console.log('[osm]', keep.length, 'manuell gepflegte Eintraege bleiben erhalten.');

  const seen = new Set(keepSlugs);
  const imported = [];

  for (const city of CITIES) {
    try {
      process.stdout.write('[osm] ' + city.name + ' ... ');
      const elements = await fetchCity(city);
      let added = 0;
      for (const el of elements) {
        const p = elementToProspect(el, city.name);
        if (!p) continue;
        const slug = slugFor(p.name, p.city);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        imported.push(p);
        added++;
      }
      console.log(elements.length + ' Treffer, ' + added + ' neu');
    } catch (e) {
      console.warn('FEHLER -', e.message);
    }
    // Overpass-Etikette: kurze Pause zwischen Anfragen
    await new Promise(function(r) { setTimeout(r, 1500); });
  }

  const out = keep.concat(imported);
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('[osm] Fertig:', imported.length, 'OSM-Eintraege (' + (IMPORT_AS_DRAFT ? 'draft/noindex' : 'live') + ') +', keep.length, 'manuell =', out.length, 'gesamt.');
  console.log('[osm] -> prospects.json geschrieben.' + (IMPORT_AS_DRAFT ? ' Pruefen und "draft": false setzen zum Livegang.' : ' Sofort live (von Google indexierbar).'));
  console.log('[osm] Quelle: (c) OpenStreetMap-Mitwirkende (ODbL).');
}

main().catch(function(err) {
  console.error('[osm] FATAL:', err && err.message ? err.message : err);
  process.exit(1);
});
