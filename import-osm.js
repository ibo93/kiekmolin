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

// Staedte mit Mittelpunkt + Suchradius (m). Gleiche Staedte wie SEO-Build.
const CITIES = [
  { name: 'Greetsiel',     lat: 53.5006, lng: 7.1003, radius: 3500 },
  { name: 'Norddeich',     lat: 53.6122, lng: 7.1606, radius: 4000 },
  { name: 'Norden',        lat: 53.5944, lng: 7.2061, radius: 5000 },
  { name: 'Aurich',        lat: 53.4686, lng: 7.4828, radius: 6000 },
  { name: 'Emden',         lat: 53.3669, lng: 7.2061, radius: 7000 },
  { name: 'Carolinensiel', lat: 53.6900, lng: 7.7944, radius: 4000 }
];

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
    draft: true
  };
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
  // Live-Eintraege (draft:false) NIE ueberschreiben - die hast du kuratiert.
  const keep = existing.filter(function(p) { return p && p.draft === false; });
  const keepSlugs = new Set(keep.map(function(p) { return slugFor(p.name, p.city); }));
  console.log('[osm]', keep.length, 'bestehende Live-Eintraege bleiben erhalten.');

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
  console.log('[osm] Fertig:', imported.length, 'neue Eintraege (draft) +', keep.length, 'Live =', out.length, 'gesamt.');
  console.log('[osm] -> prospects.json geschrieben. Pruefen und "draft": false setzen zum Livegang.');
  console.log('[osm] Quelle: (c) OpenStreetMap-Mitwirkende (ODbL).');
}

main().catch(function(err) {
  console.error('[osm] FATAL:', err && err.message ? err.message : err);
  process.exit(1);
});
