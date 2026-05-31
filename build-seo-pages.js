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

const OUT_DIR = __dirname;

const CITIES = [
  { slug: 'greetsiel', name: 'Greetsiel', zipPrefix: '267', region: 'Krummhoern' },
  { slug: 'norddeich', name: 'Norddeich', zipPrefix: '267', region: 'Norden' },
  { slug: 'norden',    name: 'Norden',    zipPrefix: '267', region: 'Ostfriesland' },
  { slug: 'aurich',    name: 'Aurich',    zipPrefix: '267', region: 'Ostfriesland' },
  { slug: 'emden',     name: 'Emden',     zipPrefix: '267', region: 'Ostfriesland' }
];

const CATEGORIES = [
  {
    slug: 'pizzeria',
    label: 'Pizzeria',
    plural: 'Pizzerien',
    keywords: ['pizza', 'pizzeria', 'italienisch'],
    description: 'frische Pizza und italienische Spezialitaeten',
    descriptionDe: 'frische Pizza und italienische Spezialitäten'
  },
  {
    slug: 'doener',
    label: 'Döner',
    plural: 'Döner-Imbisse',
    keywords: ['doener', 'döner', 'türkisch', 'turkish', 'kebab'],
    description: 'Doener Kebab und tuerkische Gerichte',
    descriptionDe: 'Döner Kebab und türkische Gerichte'
  },
  {
    slug: 'fischrestaurant',
    label: 'Fischrestaurant',
    plural: 'Fischrestaurants',
    keywords: ['fisch', 'fischrestaurant', 'meeresfrüchte', 'meeresfruechte', 'krabben', 'seafood'],
    description: 'frischer Fisch und Krabben aus der Nordsee',
    descriptionDe: 'frischer Fisch und Krabben aus der Nordsee'
  },
  {
    slug: 'restaurant',
    label: 'Restaurant',
    plural: 'Restaurants',
    keywords: [],   // leer => matcht alle
    description: 'gemuetliche Restaurants mit deutscher und internationaler Kueche',
    descriptionDe: 'gemütliche Restaurants mit deutscher und internationaler Küche'
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

function fmtRating(rating) {
  const r = Number(rating);
  if (!r || isNaN(r)) return '';
  return r.toFixed(1).replace('.', ',');
}

function capitalize(s) {
  if (!s) return '';
  s = String(s);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeText(s, fallback) {
  if (s == null || s === '') return fallback || '';
  return String(s);
}

// ==================== DATA FETCH ====================

async function fetchRestaurants() {
  const url = SUPABASE_URL + '/rest/v1/restaurants?is_active=eq.true&select=*';
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
  // Bis zu 30 verfuegbare Items, populaere zuerst, dann nach sort_order
  // Fault-tolerant: bei Fehler leeres Array zurueck, Page wird trotzdem gebaut
  if (!restaurantId) return [];
  const url = SUPABASE_URL + '/rest/v1/menu_items'
    + '?restaurant_id=eq.' + encodeURIComponent(restaurantId)
    + '&is_available=eq.true'
    + '&select=name,description,base_price,price,image_url,is_popular,menu_categories(name)'
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

function fmtPrice(item) {
  const p = item.base_price != null ? item.base_price : item.price;
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
  if (region === 'Krummhoern' || region === 'Krummhörn') {
    regionText = 'Greetsiel ist eines der maleristen Fischerdoerfer der Krummhörn an der ostfriesischen Nordseekueste. Zwischen Zwillingsmuehlen und Hafen findet sich hier eine ueberraschend dichte Auswahl an Gastronomie.';
  } else if (cityName === 'Norddeich') {
    regionText = 'Norddeich ist das Tor zu Juist und Norderney – direkt am Wattenmeer gelegen. Wer hier gegessen hat, weiss: Frische Nordsee-Produkte sind keine Werbung, sondern Standard.';
  } else if (cityName === 'Norden') {
    regionText = 'Norden ist das gastronomische Herz der nordwestlichen Ostfriesischen Halbinsel. Vom historischen Marktplatz bis zur Teemuseums-Naehe gibt es hier Gerichte fuer jeden Geschmack.';
  } else if (cityName === 'Aurich') {
    regionText = 'Aurich, die heimliche Hauptstadt Ostfrieslands, vereint norddeutsche Gemuetlichkeit mit kulinarischer Vielfalt – vom traditionellen Wirtshaus bis zur modernen Kueche.';
  } else if (cityName === 'Emden') {
    regionText = 'Emden, die groesste Stadt Ostfrieslands und Hafenstadt mit Charakter, bietet eine ueberraschend bunte Gastronomie-Szene zwischen Delft, Ratsdelft und Innenstadt.';
  } else {
    regionText = cityName + ' liegt mitten in ' + region + ' und bietet ostfriesische Gastlichkeit mit echtem Charakter.';
  }

  let categoryText;
  if (isPizza) {
    categoryText = 'Italienische Kueche gehoert in ' + cityName + ' laengst zum Alltag. Von duenner roemischer Pizza ueber neapolitanischen Steinofen bis zur klassischen Familienpizzeria mit Holzofen – die Auswahl ist groesser als viele denken. Viele Pizzerien liefern auch nach Hause oder ins Ferienhaus an der Kueste.';
  } else if (isDoener) {
    categoryText = 'Doener Kebab gibt es in ' + cityName + ' in jeder Variante – vom klassischen Kalbsdoener bis zum vegetarischen Falafel-Wrap. Viele Imbisse haben bis spaet abends geoeffnet und liefern auch ins Umland.';
  } else if (isFish) {
    categoryText = 'Frischer Fisch und Krabben aus der Nordsee – das ist DIE kulinarische Spezialitaet von ' + cityName + '. Viele Fischrestaurants beziehen ihren Fang direkt aus dem Hafen, und die Krabbenbroetchen sind oft in einer Liga, die Tagesgaeste sich gar nicht vorstellen koennen.';
  } else {
    categoryText = 'Von deftiger ostfriesischer Hausmannskost ueber moderne Bistro-Kueche bis zu internationalen Spezialitaeten: Die Restaurants in ' + cityName + ' decken jeden Geschmack ab. Viele bieten auch Reservierung online und Lieferung an.';
  }

  const countText = count > 0
    ? 'Aktuell findest du auf ' + BRAND + ' <strong>' + count + ' ' + (count === 1 ? cat.label : plural) + '</strong> in ' + cityName + ', die online verfuegbar sind. Du kannst direkt die Speisekarte ansehen, online bestellen und – wo verfuegbar – einen Tisch reservieren. Alles ohne versteckte Gebuehren.'
    : '';

  return '<p>' + escapeHtml(regionText) + ' ' + escapeHtml(categoryText) + '</p>' +
         '<p>' + countText + '</p>' +
         '<p>' + BRAND + ' ist die ostfriesische Gastro-Plattform – wir verbinden Gaeste mit lokalen Wirten und Wirtinnen, ohne Ketten, ohne Konzern, ohne hohe Provisionen. Wenn du bei einem ' + escapeHtml(cat.label) + ' in ' + escapeHtml(cityName) + ' bestellst, bleibt das Geld in der Region.</p>';
}

function buildFaqs(city, cat) {
  const cityName = city.name;
  const plural = cat.plural;
  const label = cat.label;

  return [
    {
      q: 'Welche ' + plural + ' liefern in ' + cityName + '?',
      a: 'Auf ' + BRAND + ' siehst du direkt, welche ' + plural + ' in ' + cityName + ' aktuell liefern. Filter nach "Lieferung" und du bekommst alle Optionen, die in dein Postleitzahl-Gebiet liefern – inklusive Mindestbestellwert und Lieferzeit.'
    },
    {
      q: 'Was kostet ' + label + ' in ' + cityName + '?',
      a: 'Die Preise variieren je nach Anbieter. Auf den Speisekarten der einzelnen ' + plural + ' findest du tagesaktuelle Preise. ' + BRAND + ' nimmt keine Preisaufschlaege – du zahlst genau das, was auch im Restaurant ausgezeichnet ist.'
    },
    {
      q: 'Welche ' + plural + ' haben heute geoeffnet?',
      a: 'Die Oeffnungszeiten findest du auf jedem Restaurant-Profil. ' + BRAND + ' zeigt dir live, welche ' + plural + ' in ' + cityName + ' gerade geoeffnet haben und Bestellungen annehmen.'
    },
    {
      q: 'Kann ich bei ' + plural + ' in ' + cityName + ' reservieren?',
      a: 'Ja – viele ' + plural + ' in ' + cityName + ' bieten online Tisch-Reservierung an. Klick einfach auf das gewuenschte Restaurant und waehle Datum, Uhrzeit und Personenzahl. Bestaetigung kommt sofort.'
    }
  ];
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
    header.site{background:${PRIMARY_COLOR};color:#fff;padding:14px 0}
    header.site .row{display:flex;align-items:center;justify-content:space-between;gap:16px}
    header.site .logo{font-weight:700;font-size:20px;color:#fff;text-decoration:none}
    header.site .logo span{color:${ACCENT_COLOR}}
    header.site nav a{color:#fff;margin-left:18px;font-size:14px}
    .breadcrumb{font-size:13px;color:#666;padding:14px 0 0}
    .breadcrumb a{color:#666}
    .breadcrumb .sep{margin:0 6px;color:#bbb}
    h1{font-size:clamp(28px,4.5vw,42px);line-height:1.15;margin:18px 0 8px;color:${PRIMARY_COLOR};font-weight:800}
    .subtitle{font-size:18px;color:#555;margin:0 0 28px}
    .intro{background:#fff;border-radius:14px;padding:24px;margin:0 0 32px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .intro p{margin:0 0 12px}
    .intro p:last-child{margin-bottom:0}
    h2{font-size:26px;margin:36px 0 18px;color:${PRIMARY_COLOR};font-weight:700}
    .grid{display:grid;grid-template-columns:1fr;gap:18px}
    @media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}
    @media(min-width:960px){.grid{grid-template-columns:repeat(3,1fr)}}
    .card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);transition:transform .15s,box-shadow .15s;display:flex;flex-direction:column}
    .card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.08)}
    .card .img{aspect-ratio:16/10;background:#eee linear-gradient(135deg,#e6f0ee,#cfe0dc);background-size:cover;background-position:center}
    .card .body{padding:16px;flex:1;display:flex;flex-direction:column;gap:8px}
    .card h3{margin:0;font-size:18px;color:${PRIMARY_COLOR};font-weight:700}
    .card .stars{color:${ACCENT_COLOR};font-size:15px;letter-spacing:1px}
    .card .stars .num{color:#666;font-size:13px;margin-left:6px;letter-spacing:0}
    .card .addr{color:#666;font-size:14px;margin:0}
    .card .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:6px}
    .card .tag{font-size:11px;background:#eef5f3;color:${PRIMARY_COLOR};padding:3px 9px;border-radius:99px;font-weight:500}
    .card .btn{margin-top:10px;display:inline-block;background:${PRIMARY_COLOR};color:#fff;padding:10px 14px;border-radius:8px;text-align:center;font-weight:600;font-size:14px}
    .card .btn:hover{background:#002a23;text-decoration:none;color:#fff}
    .crosslinks{background:#fff;border-radius:14px;padding:22px;margin:32px 0}
    .crosslinks h3{margin:0 0 10px;font-size:16px;color:${PRIMARY_COLOR}}
    .crosslinks .links{display:flex;flex-wrap:wrap;gap:8px}
    .crosslinks .links a{display:inline-block;background:#eef5f3;color:${PRIMARY_COLOR};padding:6px 12px;border-radius:99px;font-size:14px}
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
        (r ? '<div class="stars" itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">' +
              stars + '<span class="num"><span itemprop="ratingValue">' + r + '</span> / 5</span></div>' : '') +
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
      if (rest.rating) {
        item.aggregateRating = {
          '@type': 'AggregateRating',
          'ratingValue': Number(rest.rating),
          'bestRating': 5,
          'ratingCount': Math.max(1, Math.round((rest.rating_count) || 5))
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

function renderCrossLinks(currentCity, currentCat) {
  const otherCats = CATEGORIES.filter(function(c) { return c.slug !== currentCat.slug; });
  const otherCities = CITIES.filter(function(c) { return c.slug !== currentCity.slug; });

  let html = '<section class="crosslinks">';
  html += '<h3>Auch beliebt in ' + escapeHtml(currentCity.name) + '</h3>';
  html += '<div class="links">';
  otherCats.forEach(function(c) {
    html += '<a href="/' + c.slug + '-' + currentCity.slug + '">' + escapeHtml(c.label) + ' in ' + escapeHtml(currentCity.name) + '</a>';
  });
  html += '</div>';

  html += '<h3 style="margin-top:18px">' + escapeHtml(currentCat.plural) + ' in der Region</h3>';
  html += '<div class="links">';
  otherCities.forEach(function(c) {
    html += '<a href="/' + currentCat.slug + '-' + c.slug + '">' + escapeHtml(currentCat.label) + ' in ' + escapeHtml(c.name) + '</a>';
  });
  html += '<a href="/' + currentCat.slug + '-ostfriesland">Alle ' + escapeHtml(currentCat.plural) + ' in Ostfriesland</a>';
  html += '</div>';
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
    : '<div class="empty">Aktuell keine passenden Restaurants gelistet. Schau spaeter wieder vorbei oder besuche <a href="/">die Hauptseite</a>.</div>';

  const crossLinks = (opts.city && opts.category) ? renderCrossLinks(opts.city, opts.category) : '';

  return '<!DOCTYPE html>\n<html lang="de">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + escapeHtml(opts.title) + '</title>\n' +
    '<meta name="description" content="' + escapeAttr(opts.description) + '">\n' +
    '<link rel="canonical" href="' + escapeAttr(opts.canonical) + '">\n' +
    '<meta name="robots" content="index,follow,max-image-preview:large">\n' +
    '<meta name="geo.region" content="DE-NI">\n' +
    '<meta name="geo.placename" content="' + escapeAttr(opts.city ? opts.city.name : 'Ostfriesland') + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + escapeAttr(opts.title) + '">\n' +
    '<meta property="og:description" content="' + escapeAttr(opts.description) + '">\n' +
    '<meta property="og:url" content="' + escapeAttr(opts.canonical) + '">\n' +
    '<meta property="og:locale" content="de_DE">\n' +
    '<meta property="og:site_name" content="' + BRAND + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + escapeAttr(opts.title) + '">\n' +
    '<meta name="twitter:description" content="' + escapeAttr(opts.description) + '">\n' +
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2212%22 fill=%22%23003d33%22/%3E%3Ctext x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-size=%2238%22 font-weight=%22bold%22 fill=%22%23f59e0b%22 text-anchor=%22middle%22%3EK%3C/text%3E%3C/svg%3E">\n' +
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
    '<h2 id="faq">Haeufig gestellte Fragen</h2>\n' +
    renderFaqAccordion(opts.faqs || []) + '\n' +
    '</main>\n' +
    renderFooter() + '\n' +
    '</body></html>\n';
}

function buildRestaurantJsonLd(rest) {
  const slug = rest.slug || rest.id;
  const item = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': SITE_URL + '/' + slug,
    'name': safeText(rest.name, 'Restaurant'),
    'url': SITE_URL + '/' + slug
  };
  if (rest.image) item.image = rest.image;
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
  if (rest.rating) {
    item.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': Number(rest.rating),
      'bestRating': 5,
      'ratingCount': Math.max(1, Math.round(rest.rating_count || 5))
    };
  }
  const cuisines = [];
  if (rest.cuisine) cuisines.push(rest.cuisine);
  if (Array.isArray(rest.cuisine_type)) rest.cuisine_type.forEach(function(c) { if (c) cuisines.push(c); });
  if (cuisines.length) item.servesCuisine = cuisines;
  item.priceRange = rest.price_range || '€€';
  item.acceptsReservations = true;
  // Opening hours (best effort, optional)
  if (rest.opening_hours && typeof rest.opening_hours === 'object') {
    const dayMap = {
      mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su',
      monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th',
      friday: 'Fr', saturday: 'Sa', sunday: 'Su',
      montag: 'Mo', dienstag: 'Tu', mittwoch: 'We', donnerstag: 'Th',
      freitag: 'Fr', samstag: 'Sa', sonntag: 'Su'
    };
    const specs = [];
    Object.keys(rest.opening_hours).forEach(function(day) {
      const code = dayMap[String(day).toLowerCase()];
      const v = rest.opening_hours[day];
      if (code && v && v.open && v.close) {
        specs.push(code + ' ' + v.open + '-' + v.close);
      }
    });
    if (specs.length) item.openingHours = specs;
  }
  return item;
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
          const p = it.base_price != null ? it.base_price : it.price;
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

function generateRestaurantPage(rest, menuItems) {
  const slug = rest.slug;
  if (!slug || typeof slug !== 'string' || slug.length < 2) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;   // safe filename only

  menuItems = menuItems || [];

  const name = safeText(rest.name, 'Restaurant');
  const cityRaw = safeText(rest.city, 'Ostfriesland');
  const url = SITE_URL + '/' + slug;
  const cat = detectCategoryForRest(rest);
  const catLabel = cat.label;

  // Stadt-Slug fuer Breadcrumb-Link
  const cityObj = CITIES.find(function(c) { return normalize(c.name) === normalize(cityRaw); });
  const citySlug = cityObj ? cityObj.slug : normalize(cityRaw).replace(/[^a-z0-9]/g, '');

  // Features beachten: wenn no_reservations / no_ordering gesetzt, nicht in SEO werben
  const restFeatures = Array.isArray(rest.features) ? rest.features : [];
  const hasReservations = restFeatures.indexOf('no_reservations') === -1;
  const hasOrdering = restFeatures.indexOf('no_ordering') === -1;

  // Title: alle relevanten Aktionen rein, max 60 Zeichen fuer Google
  // Beispiele:
  //   "La Piazza Greetsiel – Bestellen, Reservieren & Speisekarte"
  //   "Eis-Cafe Norden – Speisekarte ansehen | Kiek mol in"
  const actionParts = [];
  if (hasOrdering)     actionParts.push('Bestellen');
  if (hasReservations) actionParts.push('Reservieren');
  actionParts.push('Speisekarte');
  let title = name + ' ' + cityRaw + ' – ' + actionParts.join(' · ');
  if (title.length > 60) {
    // Faellt zurueck auf kurze Variante wenn zu lang
    title = name + ' ' + cityRaw + ' – ' + (hasOrdering ? 'Bestellen' : 'Speisekarte') + (hasReservations ? ' & Reservieren' : '');
  }
  if (title.length > 70) title = name + ' ' + cityRaw + ' | ' + BRAND;

  // Meta-Description: alle Aktionen + Menue-Items wenn vorhanden
  let description;
  if (menuItems.length >= 3) {
    const sampleItems = menuItems.slice(0, 4).map(function(it) { return safeText(it.name, ''); }).filter(function(n) { return n; });
    const verbs = [];
    if (hasOrdering) verbs.push('online bestellen');
    if (hasReservations) verbs.push('Tisch reservieren');
    verbs.push('Speisekarte ansehen');
    description = name + ' ' + cityRaw + ': ' + sampleItems.join(' · ') + '. ' + capitalize(verbs.join(', ')) + '.';
  } else {
    const verbs2 = ['Speisekarte ansehen'];
    if (hasOrdering) verbs2.push('online bestellen');
    if (hasReservations) verbs2.push('Tisch reservieren');
    description = name + ' in ' + cityRaw + ' – ' + verbs2.join(', ') + '.';
    if (rest.cuisine) description += ' ' + rest.cuisine + '.';
  }
  if (description.length > 160) description = description.slice(0, 157) + '...';

  const restJsonLd = buildRestaurantJsonLd(rest);
  // Menu in Restaurant-JSON einhaengen wenn Items vorhanden
  if (menuItems.length) {
    restJsonLd.menu = SITE_URL + '/' + slug + '#speisekarte';
    restJsonLd.hasMenu = SITE_URL + '/' + slug + '#speisekarte';
  }
  const menuJsonLd = buildMenuJsonLd(rest, menuItems);
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
    (rest.image ? '<meta property="og:image" content="' + escapeAttr(rest.image) + '">\n' : '') +
    '<meta property="og:locale" content="de_DE">\n' +
    '<meta property="og:site_name" content="' + BRAND + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + escapeAttr(title) + '">\n' +
    '<meta name="twitter:description" content="' + escapeAttr(description) + '">\n' +
    (rest.image ? '<meta name="twitter:image" content="' + escapeAttr(rest.image) + '">\n' : '') +
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2212%22 fill=%22%23003d33%22/%3E%3Ctext x=%2232%22 y=%2244%22 font-family=%22Arial%22 font-size=%2238%22 font-weight=%22bold%22 fill=%22%23f59e0b%22 text-anchor=%22middle%22%3EK%3C/text%3E%3C/svg%3E">\n' +
    '<style>' + pageCss() + '</style>\n' +
    '<script type="application/ld+json">' + jsonEscape(restJsonLd) + '</script>\n' +
    '<script type="application/ld+json">' + jsonEscape(breadcrumbLd) + '</script>\n' +
    (menuJsonLd ? '<script type="application/ld+json">' + jsonEscape(menuJsonLd) + '</script>\n' : '') +
    '<script>(function(){try{if(typeof navigator==="undefined")return;var ua=navigator.userAgent||"";if(/bot|crawl|slurp|spider|search|google|bing|yandex|duckduck|baidu|facebookexternalhit|whatsapp|linkedinbot|twitterbot|telegrambot/i.test(ua))return;location.replace("/?r=" + encodeURIComponent(' + JSON.stringify(slug) + '));}catch(e){}})();</script>\n' +
    '</head>\n<body>\n' +
    renderHeader() + '\n' +
    renderBreadcrumb(breadcrumbCrumbs) + '\n' +
    '<main class="container">\n' +
    '<h1>' + escapeHtml(name) + ' ' + escapeHtml(cityRaw) + '</h1>\n' +
    '<p class="subtitle">' + escapeHtml(catLabel) + ' in ' + escapeHtml(cityRaw) +
      (rest.cuisine ? ' · ' + escapeHtml(rest.cuisine) : '') +
      (menuItems.length ? ' · ' + menuItems.length + ' Gerichte online' : '') + '</p>\n' +
    '<div class="intro">\n' +
      (rest.description
        ? '<p>' + escapeHtml(rest.description) + '</p>'
        : '<p>' + escapeHtml(name) + ' ist ein ' + escapeHtml(catLabel) + ' in ' + escapeHtml(cityRaw) +
          '. Auf ' + BRAND + ' kannst du die komplette Speisekarte ansehen, online bestellen oder einen Tisch reservieren – kostenlos und ohne App-Download.</p>') +
      (addrLine ? '<p><strong>Adresse:</strong> ' + addrLine + '</p>' : '') +
      (rest.phone ? '<p><strong>Telefon:</strong> <a href="tel:' + escapeAttr(rest.phone) + '">' + escapeHtml(rest.phone) + '</a></p>' : '') +
      (rest.email ? '<p><strong>E-Mail:</strong> <a href="mailto:' + escapeAttr(rest.email) + '">' + escapeHtml(rest.email) + '</a></p>' : '') +
      (rest.website ? '<p><strong>Website:</strong> <a href="' + escapeAttr(rest.website) + '" rel="nofollow">' + escapeHtml(rest.website) + '</a></p>' : '') +
    '</div>\n' +
    '<p style="margin:18px 0 32px;"><a href="/?r=' + escapeAttr(slug) + '" style="display:inline-block;background:' + PRIMARY_COLOR + ';color:#fff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;">Online bestellen bei ' + escapeHtml(name) + '</a></p>\n' +
    (menuItems.length
      ? '<h2 id="speisekarte">Speisekarte von ' + escapeHtml(name) + '</h2>\n' +
        '<p style="margin:0 0 16px;color:#666;">Die ' + menuItems.length + ' beliebtesten Gerichte – komplette Karte mit allen Optionen in der App.</p>\n' +
        renderMenuListHtml(menuItems) + '\n'
      : '<h2>Speisekarte ansehen & online bestellen</h2>\n' +
        '<p>Die vollstaendige Speisekarte von ' + escapeHtml(name) + ' findest du in der ' + BRAND + '-App. Online bestellen geht direkt – Abholung oder Lieferung (wo verfuegbar).</p>\n') +
    '<h2>Tisch reservieren bei ' + escapeHtml(name) + '</h2>\n' +
    '<p>Direkt online einen Tisch reservieren – kostenlos, ohne Anmeldung, mit Sofort-Bestaetigung per E-Mail. Waehle Datum, Uhrzeit und Personenzahl, fertig.</p>\n' +
    '<p style="margin:18px 0;"><a href="/?r=' + escapeAttr(slug) + '&action=reserve" style="display:inline-block;background:#fff;color:' + PRIMARY_COLOR + ';border:2px solid ' + PRIMARY_COLOR + ';padding:12px 26px;border-radius:8px;font-weight:600;text-decoration:none;">Tisch reservieren</a></p>\n' +
    renderCrossLinks(cityObj || { slug: citySlug, name: cityRaw, region: 'Ostfriesland' }, cat) + '\n' +
    '</main>\n' +
    renderFooter() + '\n' +
    '</body></html>\n';

  const filename = slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, filename), html, 'utf8');
  return { filename: filename, url: url, count: 1, restaurant: true, menuCount: menuItems.length };
}

// ==================== PAGE GENERATORS ====================

function generateCityCategoryPage(city, cat, restaurants) {
  const matched = restaurants.filter(function(r) {
    return cityMatches(r, city) && categoryMatches(r, cat);
  });
  // Sort by rating desc
  matched.sort(function(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });

  if (matched.length === 0) return null;

  const slug = cat.slug + '-' + city.slug;
  const url = SITE_URL + '/' + slug;
  const title = cat.plural + ' in ' + city.name + ' – online bestellen | ' + BRAND;
  const description = 'Die besten ' + cat.plural + ' in ' + city.name + ' auf ' + BRAND + '. ' +
    cat.descriptionDe.charAt(0).toUpperCase() + cat.descriptionDe.slice(1) +
    '. Speisekarte ansehen, online bestellen & reservieren – kostenlos!';

  const html = buildPage({
    title: title,
    description: description.length > 165 ? description.slice(0, 162) + '...' : description,
    canonical: url,
    h1: 'Die besten ' + cat.plural + ' in ' + city.name,
    subtitle: matched.length + ' ' + (matched.length === 1 ? cat.label : cat.plural) + ' in ' + city.name + ' – Speisekarten, Bewertungen, online bestellen',
    intro: buildIntro(city, cat, matched.length),
    restaurants: matched,
    faqs: buildFaqs(city, cat),
    breadcrumbs: [
      { name: 'Startseite', url: SITE_URL + '/' },
      { name: city.name, url: SITE_URL + '/restaurants-' + city.slug },
      { name: cat.plural + ' in ' + city.name, url: url }
    ],
    city: city,
    category: cat,
    gridHeading: 'Top-' + cat.plural + ' in ' + city.name
  });

  const filename = slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, filename), html, 'utf8');
  return { filename: filename, url: url, count: matched.length };
}

function generateCityOverview(city, restaurants) {
  const matched = restaurants.filter(function(r) { return cityMatches(r, city); });
  matched.sort(function(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });
  if (matched.length === 0) return null;

  const cat = CATEGORIES[CATEGORIES.length - 1];   // 'restaurant' Kategorie
  const slug = 'restaurants-' + city.slug;
  const url = SITE_URL + '/' + slug;
  const title = 'Restaurants in ' + city.name + ' – online bestellen & reservieren | ' + BRAND;
  const description = 'Alle ' + matched.length + ' Restaurants in ' + city.name + ' auf einen Blick. Pizzerien, Doener, Fischrestaurants & mehr. Speisekarte, Bewertungen, online bestellen & reservieren.';

  const html = buildPage({
    title: title,
    description: description.length > 160 ? description.slice(0, 157) + '...' : description,
    canonical: url,
    h1: 'Restaurants in ' + city.name,
    subtitle: matched.length + ' Restaurants, Pizzerien, Imbisse & Cafés in ' + city.name,
    intro: buildIntro(city, cat, matched.length),
    restaurants: matched,
    faqs: buildFaqs(city, cat),
    breadcrumbs: [
      { name: 'Startseite', url: SITE_URL + '/' },
      { name: city.name, url: url }
    ],
    city: city,
    category: cat,
    gridHeading: 'Beliebte Restaurants in ' + city.name
  });
  fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), html, 'utf8');
  return { filename: slug + '.html', url: url, count: matched.length };
}

function generateCategoryOverview(cat, restaurants) {
  const matched = restaurants.filter(function(r) { return categoryMatches(r, cat); });
  matched.sort(function(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });
  if (matched.length === 0) return null;

  const slug = cat.slug + '-ostfriesland';
  const url = SITE_URL + '/' + slug;
  const title = cat.plural + ' in Ostfriesland – online bestellen | ' + BRAND;
  const description = 'Alle ' + cat.plural + ' in Ostfriesland: ' + cat.descriptionDe + '. Speisekarte, Bewertungen, online bestellen & Tisch reservieren auf ' + BRAND + ' – kostenlos.';

  // Pseudo-City fuer Region
  const pseudoCity = { slug: 'ostfriesland', name: 'Ostfriesland', region: 'Ostfriesland' };

  const html = buildPage({
    title: title,
    description: description.length > 160 ? description.slice(0, 157) + '...' : description,
    canonical: url,
    h1: cat.plural + ' in Ostfriesland',
    subtitle: matched.length + ' ' + cat.plural + ' in Greetsiel, Norden, Norddeich, Aurich, Emden & Umgebung',
    intro: '<p>Ostfriesland ist mehr als Tee, Wattenmeer und Zwillingsmuehlen – die Region hat eine erstaunlich vielfaeltige Gastro-Szene. ' +
           cat.descriptionDe.charAt(0).toUpperCase() + cat.descriptionDe.slice(1) + ' findest du hier in jeder groesseren Stadt.</p>' +
           '<p>Aktuell sind <strong>' + matched.length + ' ' + cat.plural + '</strong> in Ostfriesland auf ' + BRAND + ' verfuegbar. Du kannst direkt online bestellen, eine Speisekarte ansehen oder einen Tisch reservieren.</p>' +
           '<p>' + BRAND + ' ist die regionale Plattform fuer ostfriesische Gastronomie – ohne Konzern, ohne hohe Provisionen. Was du bestellst, kommt aus der Region und das Geld bleibt hier.</p>',
    restaurants: matched,
    faqs: [
      { q: 'Wo gibt es die besten ' + cat.plural + ' in Ostfriesland?', a: 'Auf ' + BRAND + ' findest du eine Auswahl der besten ' + cat.plural + ' in Greetsiel, Norden, Norddeich, Aurich und Emden. Sortiert nach Bewertung – damit du sofort siehst, wo es sich lohnt.' },
      { q: 'Liefern alle ' + cat.plural + ' in Ostfriesland?', a: 'Nein, nicht alle ' + cat.plural + ' bieten Lieferung an. Auf den einzelnen Restaurant-Seiten siehst du, welche Anbieter liefern, abholen oder nur vor Ort servieren.' },
      { q: 'Welche Staedte sind auf ' + BRAND + ' vertreten?', a: BRAND + ' deckt aktuell Greetsiel, Norden, Norddeich, Aurich und Emden ab – mit Ausweitung in weitere ostfriesische Orte in Planung.' }
    ],
    breadcrumbs: [
      { name: 'Startseite', url: SITE_URL + '/' },
      { name: 'Ostfriesland', url: SITE_URL + '/' },
      { name: cat.plural, url: url }
    ],
    city: pseudoCity,
    category: cat,
    gridHeading: 'Top-' + cat.plural + ' in Ostfriesland'
  });

  fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), html, 'utf8');
  return { filename: slug + '.html', url: url, count: matched.length };
}

// ==================== SITEMAP + ROBOTS ====================

function writeSitemap(generated) {
  const today = new Date().toISOString().slice(0, 10);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += '  <url><loc>' + SITE_URL + '/</loc><lastmod>' + today + '</lastmod><priority>1.0</priority><changefreq>daily</changefreq></url>\n';
  generated.forEach(function(g) {
    const prio = g.restaurant ? '0.9' : '0.8';
    const freq = g.restaurant ? 'daily' : 'weekly';
    xml += '  <url><loc>' + g.url + '</loc><lastmod>' + today + '</lastmod><priority>' + prio + '</priority><changefreq>' + freq + '</changefreq></url>\n';
  });
  xml += '</urlset>\n';
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), xml, 'utf8');
}

function writeRobots() {
  const robots = 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE_URL + '/sitemap.xml\n';
  fs.writeFileSync(path.join(OUT_DIR, 'robots.txt'), robots, 'utf8');
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

  let restaurants;
  try {
    console.log('[seo] Fetching restaurants from Supabase...');
    restaurants = await fetchRestaurants();
    console.log('[seo] Got', restaurants.length, 'active restaurants');
  } catch (err) {
    console.warn('[seo] WARN: Supabase fetch failed:', err.message);
    console.warn('[seo] Skipping SEO page generation - deploy will continue without new pages.');
    process.exit(0);
  }

  const generated = [];
  let skipped = 0;

  for (const city of CITIES) {
    for (const cat of CATEGORIES) {
      // skip restaurant-<city> here, handled by city overview
      if (cat.slug === 'restaurant') continue;
      const result = generateCityCategoryPage(city, cat, restaurants);
      if (result) {
        console.log('[seo] +', result.filename, '(' + result.count + ' restaurants)');
        generated.push(result);
      } else {
        skipped++;
      }
    }
  }

  for (const city of CITIES) {
    const result = generateCityOverview(city, restaurants);
    if (result) {
      console.log('[seo] +', result.filename, '(' + result.count + ' restaurants)');
      generated.push(result);
    }
  }

  for (const cat of CATEGORIES) {
    const result = generateCategoryOverview(cat, restaurants);
    if (result) {
      console.log('[seo] +', result.filename, '(' + result.count + ' restaurants)');
      generated.push(result);
    }
  }

  // Per-Restaurant SEO-Pages — damit "La Piazza Greetsiel" direkt findet
  // Inkl. Menu-Items aus Supabase fuer Rich Snippets (wie ostfriesland.app)
  let restaurantPages = 0;
  let totalMenuItems = 0;
  for (const rest of restaurants) {
    try {
      let menuItems = [];
      if (rest.id) {
        menuItems = await fetchMenuItems(rest.id);
      }
      const result = generateRestaurantPage(rest, menuItems);
      if (result) {
        console.log('[seo] +', result.filename, '(restaurant: ' + (rest.name || '?') + ', ' + (result.menuCount || 0) + ' menu items)');
        generated.push(result);
        restaurantPages++;
        totalMenuItems += result.menuCount || 0;
      }
    } catch (e) {
      console.warn('[seo] WARN: skip restaurant page for', rest && rest.name, '-', e.message);
    }
  }
  console.log('[seo] Restaurant-Detail-Pages:', restaurantPages, '· total menu items rendered:', totalMenuItems);

  try {
    injectHomepageRestaurantLinks(restaurants);
  } catch (e) {
    console.warn('[seo] WARN: injectHomepageRestaurantLinks failed -', e.message);
  }

  writeSitemap(generated);
  writeRobots();
  console.log('[seo] + sitemap.xml (' + (generated.length + 1) + ' urls)');
  console.log('[seo] + robots.txt');
  console.log('[seo] Done. Generated:', generated.length, 'Skipped (empty):', skipped);
}

main().catch(function(err) {
  console.error('[seo] FATAL:', err && err.stack ? err.stack : err);
  // fault tolerant: deploy soll nicht scheitern
  process.exit(0);
});
