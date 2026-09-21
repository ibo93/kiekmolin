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

// ==================== DAS PREISMODELL ====================
//
// AN EINER STELLE, WEIL ES AN SECHS STELLEN FALSCH STAND.
//
// Gefunden am 17.09.2026: die App sagt "0% Provision - fester Monatspreis",
// die rund 900 SEO-Seiten sagten "mit fairer Provision" und trugen einen
// Vertrauens-Punkt "Faire Provision". Fuer einen Wirt heisst "faire
// Provision": es gibt eine. Dann rechnet er nicht weiter und vergleicht
// nicht -- und genau diese Seiten sind das, was neue Wirte ueber Google
// finden. Wir haben also mit dem schwaecheren UND falschen Argument
// geworben.
//
// Im selben Kasten stand ausserdem "kostenlos eintragen" NEBEN "mit fairer
// Provision", bei tatsaechlich 59,90 EUR im Monat -- drei Aussagen, die
// nicht zusammenpassen.
//
// Darum steht das Modell jetzt hier, einmal. Aendert sich der Preis, ist es
// eine Zeile und nicht eine Suche durch 2500 Zeilen.
//
// KEINE ZAHLEN UEBER MITBEWERBER. Vergleichende Werbung ist erlaubt
// (§ 6 UWG), aber nur mit nachpruefbaren, aktuellen Zahlen. Eine Spanne wie
// "13 bis 30 %" ohne Quelle waere angreifbar -- und unser eigenes Argument
// traegt ohne sie: 0 % ist 0 %. Am 17.09.2026 so mit Ibo entschieden.
const PREIS_MONAT = '59,90 €';
const PREIS_PROVISION = '0 %';

// Der Eintrag ist kostenlos. Bestellungen und Reservierungen annehmen
// kostet. Beides in EINEM Satz zu mischen war der Fehler -- "kostenlos"
// und ein Monatspreis im selben Absatz liest sich wie eine Falle.
//
// 20.09.2026: "egal wie viel bestellt wird" stand hier allein. Ibo beim
// Lesen der Gastro-Seite: "es steht nur fuer bestellen, nicht fuer
// reservieren". Ein Gasthaus, das gar nicht liefert und nur Tische
// vergibt, las daraus, dass der Preis es nicht betrifft. Jetzt stehen
// beide Wege drin -- und zwar an der EINEN Stelle, von der die ~900
// Betriebsseiten und die Gastro-Seite es holen.
function preisSatz() {
  return PREIS_PROVISION + ' Provision. ' + PREIS_MONAT + ' im Monat, fest – '
       + 'egal wie viel bestellt oder reserviert wird.';
}

function preisSatzEn() {
  return PREIS_PROVISION + ' commission. ' + PREIS_MONAT + ' per month, fixed – '
       + 'no matter how much is ordered.';
}

// "1 Gerichte" stand monatelang auf jeder Seite eines Betriebs mit einem
// einzigen Gericht -- und auf einer Ortsseite mit genau einem Partner stand
// "1 Restaurants, Pizzerien, Imbisse und Cafes". Das liest der Wirt, und es
// steht im Google-Ergebnis. Ab hier gibt es dafuer zwei Stellen und nicht
// acht.
function gerichteZahl(anzahl) {
  return anzahl + (anzahl === 1 ? ' Gericht' : ' Gerichte');
}

// Bei genau einem Betrieb ist die Aufzaehlung falsch: es ist EINER, und
// welcher von den vier Arten, steht auf seiner Karte. "Ein Betrieb" ist
// kuerzer und stimmt immer.
function betriebeZahl(anzahl, isEn, verbinder) {
  var v = verbinder || (isEn ? 'and' : 'und');
  if (anzahl === 1) return isEn ? 'One business' : 'Ein Betrieb';
  return isEn
    ? anzahl + ' restaurants, pizzerias, snack bars ' + v + ' cafés'
    : anzahl + ' Restaurants, Pizzerien, Imbisse ' + v + ' Cafés';
}

// Die Seite fuer Gastronomen. Kurz, weil Ibo sie laut aussprechen wird --
// in einer Kueche, am Telefon, ueber den Tresen. "kiekmolin.de schraegstrich
// gastro" kann sich jemand merken, waehrend er die Haende voll hat.
const GASTRO_SLUG = 'gastro';

// Die Nummer steht an genau EINER Stelle. Angezeigt wird sie so, wie Ibo
// sie schreibt; der Anruf-Link braucht die internationale Form ohne
// Leerzeichen, sonst waehlt das Handy nichts.
const KONTAKT_TEL = '0152 04132343';
const KONTAKT_TEL_LINK = 'tel:+4915204132343';
const KONTAKT_MAIL = 'info@kiekmolin.de';

// Einfuehrungspreis fuer die ersten Betriebe.
//
// BEWUSST KEIN STREICHPREIS. Ein durchgestrichenes "statt 79,90" wuerde
// behaupten, dieser Preis sei einmal verlangt worden -- wurde er nie. Das
// waere ein Mondpreis und nach Paragraf 5 UWG abmahnbar.
//
// Was hier steht, ist etwas anderes: der kuenftige regulaere Preis. Das ist
// zulaessig, hat aber eine Bedingung, und die hat Ibo am 20.09.2026
// ausdruecklich zugesagt -- nach den ersten Plaetzen wird wirklich erhoeht.
// Bleibt der Preis danach stehen, wird die Aussage nachtraeglich zur Luege.
const EINSTEIGER_PLAETZE = 20;

// Kleinunternehmerregelung. Am 20.09.2026 von Ibo bestaetigt: der Betrieb
// zahlt genau den genannten Betrag, es kommt nichts obendrauf.
//
// ACHTUNG BEIM SPAETEREN AENDERN: Paragraf 19 haengt am Umsatz. Faellt die
// Regelung weg, stimmt dieser Satz auf ~900 Seiten nicht mehr -- deshalb
// steht er hier an EINER Stelle. Dann hier aendern, nicht suchen und
// ersetzen.
const PREIS_UST = 'Keine Umsatzsteuer (\u00a7 19 UStG).';
const PREIS_UST_KURZ = 'keine USt (\u00a7 19)';
const PREIS_MONAT_SPAETER = '79,90 \u20ac';

// Derselbe Preis, nur anders gerechnet. Die Zahl wird NICHT hingeschrieben,
// sondern aus PREIS_MONAT ausgerechnet -- aendert sich der Preis, aendert
// sich der Satz mit.
//
// WARUM DIE 30 UND NICHT 365, und warum das trotzdem nicht schoengerechnet
// ist (am 20.09.2026 nachgerechnet):
//
//     59,90 / 30 Tage    = 1,9967  -> 1,99 rundet AB, um 0,3 Cent
//     59,90 * 12 / 365   = 1,9693  -> 1,99 rundet AUF, um 2 Cent
//
// Auf ein ganzes Jahr gerechnet kostet der Tag also 1,97 Euro. Mit "1,99"
// sagen wir MEHR, als es wirklich kostet -- die sichere Richtung. Genau
// das haelt preisProTagMindestens() fest: die angezeigte Zahl darf nie
// unter den echten Tageskosten liegen.
function preisMonatCent() {
  return Math.round(parseFloat(String(PREIS_MONAT).replace(/[^0-9,]/g, '').replace(',', '.')) * 100);
}

// Was der Tag ueber ein volles Jahr wirklich kostet, in Cent.
function preisProTagEcht() {
  return preisMonatCent() * 12 / 365;
}

function preisProTag() {
  var cent = Math.floor(preisMonatCent() / 30);   // 199 Cent
  return (cent / 100).toFixed(2).replace('.', ',') + ' \u20ac am Tag';
}

function einstiegSatz() {
  return 'Die ersten ' + EINSTEIGER_PLAETZE + ' Betriebe zahlen ' + PREIS_MONAT
       + ' im Monat \u2013 dauerhaft, solange der Vertrag l\u00e4uft. '
       + 'Danach kostet ' + BRAND + ' ' + PREIS_MONAT_SPAETER + '.';
}

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
  { slug: 'papenburg',     name: 'Papenburg',     zipPrefix: '268', region: 'Emsland' },
  // Weitere Orte, aus denen import-osm.js Betriebe zieht -- ohne eigenen
  // Eintrag hier haetten deren Verzeichnis-Seiten kaputte Breadcrumb-Links.
  { slug: 'hinte',            name: 'Hinte',            zipPrefix: '267', region: 'Krummhörn' },
  { slug: 'moormerland',      name: 'Moormerland',      zipPrefix: '268', region: 'Ostfriesland' },
  { slug: 'hesel',            name: 'Hesel',            zipPrefix: '268', region: 'Ostfriesland' },
  { slug: 'uplengen',         name: 'Uplengen',         zipPrefix: '266', region: 'Ostfriesland' },
  { slug: 'westoverledingen', name: 'Westoverledingen', zipPrefix: '268', region: 'Overledingerland' },
  { slug: 'rhauderfehn',      name: 'Rhauderfehn',      zipPrefix: '268', region: 'Overledingerland' },
  { slug: 'bunde',            name: 'Bunde',            zipPrefix: '268', region: 'Rheiderland' },
  { slug: 'jemgum',           name: 'Jemgum',           zipPrefix: '268', region: 'Rheiderland' },
  { slug: 'bensersiel',       name: 'Bensersiel',       zipPrefix: '264', region: 'Harlingerland' },
  { slug: 'neuharlingersiel', name: 'Neuharlingersiel', zipPrefix: '264', region: 'Harlingerland' },
  { slug: 'friedeburg',       name: 'Friedeburg',       zipPrefix: '264', region: 'Harlingerland' },
  { slug: 'schortens',        name: 'Schortens',        zipPrefix: '264', region: 'Friesland' },
  { slug: 'sande',            name: 'Sande',            zipPrefix: '264', region: 'Friesland' },
  { slug: 'wilhelmshaven',    name: 'Wilhelmshaven',    zipPrefix: '263', region: 'Friesland' },
  { slug: 'hooksiel',         name: 'Hooksiel',         zipPrefix: '264', region: 'Wangerland' },
  { slug: 'horumersiel',      name: 'Horumersiel',      zipPrefix: '264', region: 'Wangerland' },
  { slug: 'zetel',            name: 'Zetel',            zipPrefix: '263', region: 'Friesland' },
  { slug: 'bockhorn',         name: 'Bockhorn',         zipPrefix: '263', region: 'Friesland' },
  { slug: 'varel',            name: 'Varel',            zipPrefix: '263', region: 'Friesland' }
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

// ==================== ORTE ====================

// Wie viele Eintraege ein Ort braucht, damit sich eine eigene Seite lohnt.
//
// Ein Ort mit zwei Eintraegen ergibt wieder eine duenne Seite, und davon
// gibt es schon genug. AUSNAHME: wo ein Partner sitzt, entsteht die Seite
// immer -- die steht heute bereits im Index, und sie ist die Seite, auf
// der ein zahlender Betrieb verlinkt wird. Eine indexierte URL wieder
// herauszunehmen kostet mehr als eine kurze Liste.
const MIN_EINTRAEGE = 4;

// DER ORTSSLUG MUSS AN BEIDEN STELLEN DERSELBE SEIN.
//
// Er stand frueher nur in generateProspectPage, inline. Folge, am
// 17.09.2026 an Wilhelmshaven nachgemessen: die Betriebsseite schreibt
// einen Breadcrumb auf /restaurants-wilhelmshaven, und diese Seite gab es
// nicht -- weil CITIES nur 28 Orte kennt, import-osm.js aber 45 holt.
// Google bekam strukturierte Daten mit einem Ziel, das im SPA-Fallback
// landet (Status 200, Inhalt der Startseite). Jetzt rechnet eine Funktion
// den Slug, und beide Seiten fragen sie.
function ortSlug(cityRaw) {
  const treffer = CITIES.find(function(c) { return normalize(c.name) === normalize(cityRaw); });
  if (treffer) return treffer.slug;
  return normalize(cityRaw).replace(/[^a-z0-9]/g, '');
}

// Alle Orte, fuer die es ueberhaupt Daten gibt -- nicht nur die 28 aus
// CITIES. Die handgepflegten kommen zuerst und unveraendert (sie tragen
// Region und PLZ-Praefix, die nirgends sonst stehen); danach alles, was in
// den Daten auftaucht und noch fehlt.
//
// ausDaten: true merkt sich, dass wir ueber diesen Ort NICHTS wissen
// ausser dem Namen. Wer das ignoriert, schreibt "Wilhelmshaven liegt
// mitten in Ostfriesland" -- das tut es nicht.
function ermittleOrte(restaurants, prospects) {
  const bekannt = new Set(CITIES.map(function(c) { return normalize(c.name); }));
  const dazu = new Map();
  (prospects || []).concat(restaurants || []).forEach(function(x) {
    const roh = x && x.city ? String(x.city).trim() : '';
    if (!roh) return;
    const n = normalize(roh);
    if (!n || bekannt.has(n) || dazu.has(n)) return;
    const slug = ortSlug(roh);
    if (!slug || slug.length < 2) return;
    dazu.set(n, { slug: slug, name: roh, zipPrefix: '', region: '', ausDaten: true });
  });
  return CITIES.concat(Array.from(dazu.values()));
}

// Die Nicht-Partner eines Ortes. draft-Eintraege bleiben draussen -- ihre
// eigene Seite traegt noindex, also darf hier auch kein Link hin.
function prospectsImOrt(prospects, city) {
  return (prospects || []).filter(function(p) {
    return p && p.name && !p.draft && p.city && normalize(p.city) === normalize(city.name);
  });
}

// Bekommt dieser Ort eine Seite?
//
// Partner-Ort: immer. Sonst erst ab MIN_EINTRAEGE. Beides zusammen ist die
// Regel, auf die wir uns am 17.09.2026 geeinigt haben.
function ortLohntSeite(partnerAnzahl, weitereAnzahl) {
  if (partnerAnzahl > 0) return true;
  return (partnerAnzahl + weitereAnzahl) >= MIN_EINTRAEGE;
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
    // DRITTER ANLAUF, UND DIESMAL NACHGESEHEN STATT GERATEN.
    //
    // Hier stand zuerst author_name, dann customer_name -- beide gibt es
    // nicht. Am 27.08.2026 stand im Protokoll 24 mal:
    //     42703  column reviews.customer_name does not exist
    //
    // Der richtige Name steht dort, wo die App die Bewertung ANLEGT
    // (index.html, POST auf /rest/v1/reviews): user_name, daneben
    // user_id und user_avatar. Wer den Namen einer Spalte wissen will,
    // sieht nach, was geschrieben wird -- nicht, was plausibel klingt.
    //
    // Die Folge war jedesmal dieselbe: 400, leeres Array, Seite ohne
    // Bewertungen. Google bekam vom Restaurant nur den Durchschnitt zu
    // sehen, nie einen echten Satz.
    + '&select=rating,title,comment,user_name,created_at'
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
         // "ohne hohe Provisionen" klang nach "es gibt welche, nur kleinere".
         // Es gibt keine -- und fuer den Gast ist genau das die Aussage:
         // was er zahlt, bleibt beim Wirt.
         '<p>' + BRAND + ' ist die ostfriesische Gastro-Plattform – wir verbinden Gäste mit lokalen Wirten und Wirtinnen, ohne Ketten, ohne Konzern, ohne Provision. Wenn du bei einem ' + escapeHtml(cat.label) + ' in ' + escapeHtml(cityName) + ' bestellst, bleibt der volle Betrag beim Betrieb und das Geld in der Region.</p>';
}

// Die Empfehlungs-Frage ist GENAU die Frage, die Gaeste (und KI-Assistenten
// mit Web-Suche) stellen. Die Antwort nennt die Betriebe beim Namen -
// ehrlich nach Bewertung sortiert, nur echte Daten.
function buildEmpfehlungsFaq(cityName, plural, matched, isEn) {
  if (!matched || !matched.length) return null;
  const top = matched.slice().sort(function(a, b) {
    return (Number(b.rating) || 0) - (Number(a.rating) || 0);
  }).slice(0, 3);
  // STERNE NUR MIT ECHTEN BEWERTUNGEN DAHINTER.
  //
  // Hier stand nur "rating >= 4". In der Datenbank kann rating von Hand
  // eingetragen sein -- dann stand hier "(4,9 von 5 Sternen)", ohne dass je
  // jemand etwas geschrieben haette. renderCard und buildRestaurantJsonLd
  // passen seit laengerem auf (echteBewertungen()), diese FAQ nicht --
  // und sie geht als FAQPage-Schema an Google.
  const namen = top.map(function(r) {
    const rating = Number(r.rating);
    const belegt = echteBewertungen(r) > 0;
    return r.name + ((rating >= 4 && belegt)
      ? (isEn ? ' (' + fmtRating(rating) + ' of 5 stars)' : ' (' + fmtRating(rating) + ' von 5 Sternen)')
      : '');
  });
  // Und der Satz am Ende behauptet "echte Gaeste-Bewertungen" fuer ALLE.
  // Ohne eine einzige Bewertung ist das dieselbe Luege, nur in Prosa.
  const hatBewertungen = top.some(function(r) { return echteBewertungen(r) > 0; });
  if (isEn) {
    return {
      q: 'Which ' + plural + ' in ' + cityName + ' are recommended?',
      a: 'Popular with guests on ' + BRAND + ' right now: ' + namen.join(', ') + '. ' +
         'All with a current menu' + (hatBewertungen ? ', real guest reviews' : '') +
         ' and free online table booking on ' + BRAND + '.'
    };
  }
  return {
    q: 'Welche ' + plural + ' in ' + cityName + ' sind zu empfehlen?',
    a: 'Bei Gästen auf ' + BRAND + ' aktuell beliebt: ' + namen.join(', ') + '. ' +
       'Alle mit aktueller Speisekarte' + (hatBewertungen ? ', echten Gäste-Bewertungen' : '') +
       ' und kostenloser Online-Tischreservierung auf ' + BRAND + '.'
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
         '<p>' + BRAND + ' is the East Frisian gastronomy platform — we connect guests directly with local hosts, with no chains, no corporations and no commission at all. When you order from a ' + escapeHtml(label) + ' in ' + escapeHtml(cityName) + ', the full amount stays with the restaurant and the money stays in the region.</p>';
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
    .weitere{margin:34px 0 0}
    .weitere h2{margin:0 0 6px}
    .weitere-hinweis{color:#64748b;font-size:14px;margin:0 0 14px;max-width:62ch}
    .weitere-liste{list-style:none;margin:0;padding:0;border-top:1px solid #e2e8f0}
    .weitere-zeile{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;padding:11px 2px;border-bottom:1px solid #e2e8f0}
    .weitere-zeile>a:first-child{font-weight:700;color:${PRIMARY_COLOR};text-decoration:none}
    .weitere-zeile>a:first-child:hover{text-decoration:underline}
    .weitere-addr{color:#64748b;font-size:14px}
    .weitere-tel{color:#64748b;font-size:14px;text-decoration:none;margin-left:auto}
    .weitere-tel:hover{text-decoration:underline}
    @media(max-width:560px){.weitere-tel{margin-left:0}}
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

// EIN NICHT-PARTNER IN DER ORTSLISTE.
//
// Bewusst KEINE Karte wie renderCard: kein Bild, keine Sterne, kein
// "Speisekarte ansehen". Wir haben von diesen Betrieben nur Stammdaten aus
// OpenStreetMap -- keine Karte, keine Bewertung, keine Bestellmoeglichkeit.
// Eine Kachel, die aussieht wie die eines Partners, wuerde genau das
// versprechen. Der Gast klickt, findet nichts, und der Partner daneben
// verliert seinen Vorsprung gleich mit.
//
// Deshalb: eine Zeile, Name verlinkt, Adresse und Telefon daneben -- mehr
// wissen wir nicht, mehr steht da auch nicht.
// Ein Nicht-Partner in der Form, die buildItemListJsonLd erwartet.
//
// Bewusst OHNE rating und rating_count: echteBewertungen() liefert dann 0,
// und es entsteht keine aggregateRating. Dieselbe Regel wie in
// buildRestaurantJsonLd und buildProspectJsonLd -- Sterne nur, wo echte
// Bewertungen dahinterstehen.
function alsListenEintrag(p) {
  return {
    slug: prospectSlug(p),
    name: p.name,
    street: p.street || '',
    zip: p.zip || '',
    city: p.city || '',
    phone: p.phone || '',
    lat: p.lat,
    lng: p.lng,
    _nichtPartner: true
  };
}

function renderProspectRow(p) {
  const slug = prospectSlug(p);
  if (!slug) return '';
  const name = escapeHtml(safeText(p.name, 'Betrieb'));
  const addr = [p.street, p.zip, p.city].filter(function(x) { return x; }).map(escapeHtml).join(' ');
  const tel = p.phone ? String(p.phone) : '';
  return '<li class="weitere-zeile">' +
    '<a href="/' + encodeURIComponent(slug) + '">' + name + '</a>' +
    (addr ? '<span class="weitere-addr">' + addr + '</span>' : '') +
    (tel ? '<a class="weitere-tel" href="tel:' + escapeAttr(tel.replace(/[^\d+]/g, '')) + '">' + escapeHtml(tel) + '</a>' : '') +
  '</li>';
}

// Der zweite Block der Ortsseite. Die Ueberschrift sagt nuechtern, was es
// ist -- kein "Geheimtipps", kein "Die schoensten". Es ist eine Liste.
function renderWeitereSection(city, weitere) {
  if (!weitere || !weitere.length) return '';
  const zeilen = weitere.map(renderProspectRow).filter(function(z) { return z; });
  if (!zeilen.length) return '';
  return '<section class="weitere">' +
    '<h2>Weitere Betriebe in ' + escapeHtml(city.name) + '</h2>' +
    // Sagt dem Gast, warum diese Eintraege anders aussehen. Ohne den Satz
    // wirkt die Liste wie ein schlechterer Teil derselben Sache.
    '<p class="weitere-hinweis">Diese Betriebe sind nicht bei ' + BRAND + '. ' +
      'Wir zeigen Name, Adresse und Telefon &ndash; Speisekarte, Bestellung und ' +
      'Reservierung gibt es hier nicht.</p>' +
    '<ul class="weitere-liste">' + zeilen.join('') + '</ul>' +
  '</section>';
}

function buildItemListJsonLd(restaurants, pageUrl, max) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'itemListElement': restaurants.slice(0, max || 10).map(function(rest, idx) {
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
      // Preisklasse nur da, wo wir ueberhaupt Speisekarten haben. Von einem
      // Nicht-Partner kennen wir Name, Adresse und Telefon -- "€€" waere
      // geraten, und geraten ist erfunden.
      if (!rest._nichtPartner) item.priceRange = '€€';
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
function buildAvailableSlugs(restaurants, prospects) {
  AVAILABLE_SLUGS.clear();
  AVAILABLE_SLUGS_READY = true;
  // Wird immer gebaut, haengt an keinen Daten.
  AVAILABLE_SLUGS.add(GASTRO_SLUG);
  // Ortsseiten nach DERSELBEN Regel wie generateCityOverview. Liefe hier
  // eine andere Bedingung, zeigten Querverweise auf Seiten, die nie gebaut
  // werden -- und der Catch-All macht daraus Status 200 mit dem Inhalt der
  // Startseite, also einen Soft-404. Genau dagegen gibt es slugExists().
  ermittleOrte(restaurants, prospects).forEach(function(city) {
    const p = (restaurants || []).filter(function(r) { return cityMatches(r, city); }).length;
    const w = prospectsImOrt(prospects, city).length;
    if (ortLohntSeite(p, w)) AVAILABLE_SLUGS.add('restaurants-' + city.slug);
  });
  CITIES.forEach(function(city) {
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
  // Die ItemList soll die Seite abbilden, nicht nur ihren oberen Teil.
  // opts.itemListe traegt bei Ortsseiten Partner UND weitere Betriebe.
  const itemList = buildItemListJsonLd(opts.itemListe || opts.restaurants || [], opts.canonical,
                                      opts.itemListe ? 50 : 10);
  const breadcrumb = buildBreadcrumbJsonLd(opts.breadcrumbs || []);
  const faqLd = buildFaqJsonLd(opts.faqs || []);

  const grid = (opts.restaurants && opts.restaurants.length)
    ? '<div class="grid">' + opts.restaurants.slice(0, 10).map(renderCard).join('') + '</div>'
    // Kein Partner, aber ein extraHtml-Block (die weiteren Betriebe): dann
    // waere "keine Restaurants gelistet" schlicht gelogen -- unter dem Kasten
    // stehen zwanzig. Der Kasten bleibt nur, wenn die Seite wirklich leer ist.
    : (opts.extraHtml ? ''
      : '<div class="empty">Aktuell keine passenden Restaurants gelistet. Schau später wieder vorbei oder besuche <a href="/">die Hauptseite</a>.</div>');

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
    ((grid || !opts.extraHtml) ? '<h2>' + escapeHtml(opts.gridHeading || 'Top-Empfehlungen') + '</h2>\n' : '') +
    grid + '\n' +
    (opts.extraHtml || '') + '\n' +
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
          'name': safeText(rv.user_name, 'Gast')
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
      a: 'Die Speisekarte von ' + name + ' umfasst online ' + gerichteZahl(menuItems.length) +
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
    const author = escapeHtml(safeText(rv.user_name, 'Gast'));
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
  if (menuItems.length) metaParts.push(gerichteZahl(menuItems.length) + ' online');
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
  if (menuItems.length) badges.push({ i: '📋', t: gerichteZahl(menuItems.length) });
  badges.push({ i: '📍', t: 'Aus ' + escapeHtml(safeText(rest.city, 'der Region')) });
  // "Faire Provision" hiess fuer einen Wirt: es gibt eine. Es gibt keine.
  badges.push({ i: '🤝', t: PREIS_PROVISION + ' Provision' });
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
  // Derselbe Rechner wie in der Ortsseite -- sonst zeigt der Breadcrumb auf
  // eine Seite, die es nicht gibt (siehe Kommentar bei ortSlug).
  const citySlug = ortSlug(cityRaw);

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
    { name: 'Startseite', url: SITE_URL + '/' }
  ];
    // Die Ortsstufe NUR, wenn es die Ortsseite auch gibt. Ein Ort unter der
    // Untergrenze bekommt keine -- und ein Breadcrumb auf eine fehlende URL
    // ist genau der Soft-404, gegen den diese ganze Aenderung gebaut ist.
    // (Vorher stand die Stufe fest drin; gemessen am 17.09.2026 an
    // Wilhelmshaven, wo sie ins Leere zeigte.)
  if (slugExists('restaurants-' + citySlug)) {
    breadcrumbCrumbs.push({ name: cityRaw, url: SITE_URL + '/restaurants-' + citySlug });
  }
  breadcrumbCrumbs.push({ name: name, url: url });
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
// Zeigte bis zum 19.09.2026 auf '/?page=kontakt' -- ein Fenster in der
// Gaeste-App. Ein Gastronom, der dort landete, sah ein Kontaktformular und
// nirgends, was ihm eigentlich angeboten wird. Jetzt auf die Seite, die
// genau das erklaert und unten das Eintragen-Formular hat.
const PROSPECT_OWNER_CTA_URL = '/' + GASTRO_SLUG;

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
  // Derselbe Rechner wie in der Ortsseite -- sonst zeigt der Breadcrumb auf
  // eine Seite, die es nicht gibt (siehe Kommentar bei ortSlug).
  const citySlug = ortSlug(cityRaw);

  const title = name + ' ' + cityRaw + ' – Adresse, Telefon & Öffnungszeiten | ' + catLabel;
  let description = name + ' in ' + cityRaw + ': ' + catLabel + ' – Adresse, Telefon';
  if (p.street) description += ', ' + p.street;
  description += '. Jetzt anrufen oder online bestellen bei Restaurants in ' + cityRaw + '.';
  if (description.length > 160) description = description.slice(0, 157) + '...';

  const prospectLd = buildProspectJsonLd(p, name, cityRaw, url, catLabel);
  const breadcrumbCrumbs = [
    { name: 'Startseite', url: SITE_URL + '/' }
  ];
    // Die Ortsstufe NUR, wenn es die Ortsseite auch gibt. Ein Ort unter der
    // Untergrenze bekommt keine -- und ein Breadcrumb auf eine fehlende URL
    // ist genau der Soft-404, gegen den diese ganze Aenderung gebaut ist.
    // (Vorher stand die Stufe fest drin; gemessen am 17.09.2026 an
    // Wilhelmshaven, wo sie ins Leere zeigte.)
  if (slugExists('restaurants-' + citySlug)) {
    breadcrumbCrumbs.push({ name: cityRaw, url: SITE_URL + '/restaurants-' + citySlug });
  }
  breadcrumbCrumbs.push({ name: name, url: url });
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
      // ZWEI SAETZE, WEIL ES ZWEI DINGE SIND.
      //
      // Vorher stand "kostenlos eintragen" und "mit fairer Provision" im
      // selben Satz. Beides zusammen liest sich wie eine Falle: erst gratis,
      // dann zieht jemand mit. Getrennt stimmt es und klingt auch besser --
      // der Eintrag IST frei, und der Preis danach ist eine feste Zahl
      // statt eines Prozentsatzes vom Umsatz.
      '<p style="margin:0 0 10px;color:#444;">' + escapeHtml(name) + ' ist noch nicht bei ' + BRAND + '. ' +
      'Der Eintrag ist <strong>kostenlos</strong>.</p>' +
      '<p style="margin:0 0 14px;color:#444;">Wer Online-Bestellungen und Tisch-Reservierungen annehmen will, ' +
      'zahlt <strong>' + PREIS_MONAT + ' im Monat</strong> – fest, egal wie viel bestellt oder reserviert wird. ' +
      '<strong>' + PREIS_PROVISION + ' Provision</strong>: von jeder Bestellung bleibt der volle Betrag beim Betrieb. ' +
      'Ohne App, jederzeit kündbar, ' + PREIS_UST_KURZ + '.</p>' +
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

// VORSPANN DER ORTSSEITE -- SACHLICH, NICHT SCHOEN.
//
// buildIntro() schreibt 200-300 Woerter Prosa ("die Krabbenbroetchen sind
// oft in einer Liga, die Tagesgaeste sich gar nicht vorstellen koennen").
// Das ist fuer die Kategorie-Seiten gebaut und steht dort weiter. Auf der
// Ortsseite hat es zwei Probleme:
//
//   1. Eine Ortsseite ist eine Liste, kein Aufsatz.
//   2. Der Zweig am Ende lautet "<Ort> liegt mitten in Ostfriesland". Fuer
//      die Orte, die erst ueber die Daten dazugekommen sind -- Wilhelmshaven,
//      Varel, Bockhorn -- stimmt das nicht. Ein erfundener Satz ueber einen
//      Ort ist schlimmer als gar keiner.
//
// Hier steht deshalb nur, was zaehlbar ist.
function buildOrtsIntro(city, matched, weitere, isEn) {
  const gesamt = matched.length + weitere.length;
  const n = escapeHtml(city.name);
  if (isEn) {
    return '<p>' + betriebeZahl(gesamt, true) + ' in ' + n +
      ' – with address and phone number.' +
      (matched.length
        ? ' <strong>' + matched.length + '</strong> of them are on ' + BRAND +
          ': menu, online ordering and table booking.'
        : ' None of them is on ' + BRAND + ' yet.') +
      '</p>';
  }
  return '<p>' + betriebeZahl(gesamt, false) + ' in ' + n +
    ' – mit Adresse und Telefonnummer.' +
    (matched.length
      ? ' Davon sind <strong>' + matched.length + '</strong> bei ' + BRAND +
        ': mit Speisekarte, Online-Bestellung und Tischreservierung.'
      : ' Davon ist noch keiner bei ' + BRAND + '.') +
    '</p>';
}

// FAQ DER ORTSSEITE -- AUS ZAHLEN, NICHT AUS WERBUNG.
//
// buildFaqs() verspricht Lieferung und Reservierung ("Ja - viele bieten
// online Tisch-Reservierung an"). In einem Ort ohne einen einzigen Partner
// ist jeder dieser Saetze falsch. Google straft das nicht nur ab, es steht
// auch einfach nicht.
function buildOrtsFaqs(city, matched, weitere, isEn) {
  const n = city.name;
  const gesamt = matched.length + weitere.length;
  const faqs = [];

  // Die Empfehlungs-Frage nennt Betriebe beim Namen, ehrlich nach
  // Bewertung sortiert. Sie kommt nur, wenn es Partner gibt.
  const empf = buildEmpfehlungsFaq(n, isEn ? 'restaurants' : 'Restaurants', matched, isEn);
  if (empf) faqs.push(empf);

  faqs.push(isEn ? {
    q: 'How many restaurants are there in ' + n + '?',
    a: BRAND + ' lists ' + betriebeZahl(gesamt, true).replace(/^One business$/, 'one business') + ' in ' + n + '.'
  } : {
    q: 'Wie viele Restaurants gibt es in ' + n + '?',
    a: (gesamt === 1 ? 'Auf ' + BRAND + ' ist ein Betrieb in ' + n + ' gelistet.'
         : 'Auf ' + BRAND + ' sind ' + betriebeZahl(gesamt, false) + ' in ' + n + ' gelistet.')
  });

  faqs.push(isEn ? {
    q: 'Can I order online in ' + n + '?',
    a: matched.length
      ? 'Yes – ' + matched.length + ' ' + (matched.length === 1 ? 'restaurant' : 'restaurants') +
        ' in ' + n + ' can be ordered from on ' + BRAND + '. For the others we only hold address and phone number.'
      : 'Not yet. For the restaurants in ' + n + ' we currently only hold address and phone number – you can call them directly.'
  } : {
    q: 'Kann ich in ' + n + ' online bestellen?',
    a: matched.length
      ? 'Ja – bei ' + matched.length + ' ' + (matched.length === 1 ? 'Betrieb' : 'Betrieben') +
        ' in ' + n + ' geht das über ' + BRAND + '. Von den übrigen haben wir nur Adresse und Telefonnummer.'
      : 'Noch nicht. Von den Betrieben in ' + n + ' haben wir aktuell nur Adresse und Telefonnummer – anrufen geht natürlich.'
  });

  return faqs;
}

function generateCityOverview(city, restaurants, lang, prospects) {
  const matched = restaurants.filter(function(r) { return cityMatches(r, city); });
  matched.sort(function(a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });

  // Die Nicht-Partner desselben Ortes. Ohne sie war diese Seite eine Liste
  // von drei Betrieben, waehrend nebenan 40 eigene Seiten lagen, auf die
  // nichts verlinkte ausser der Sitemap.
  const weitere = prospectsImOrt(prospects, city);
  weitere.sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''), 'de');
  });

  if (!ortLohntSeite(matched.length, weitere.length)) return null;

  lang = lang || 'de';
  const isEn = lang === 'en';
  const cat = CATEGORIES[CATEGORIES.length - 1];
  const slug = 'restaurants-' + city.slug;
  const deUrl = SITE_URL + '/' + slug;
  const enUrl = SITE_URL + '/en/' + slug;
  const url = isEn ? enUrl : deUrl;

  // DER TITEL DARF NUR VERSPRECHEN, WAS DIE SEITE HAELT.
  //
  // Hier stand "online bestellen & reservieren" fest. Seit die Ortsseite
  // auch Orte ohne einen einzigen Partner abdeckt, waere das genau in dem
  // Fall gelogen, in dem es am meisten auffaellt: in der Google-Zeile.
  // Wer daraufhin klickt und nur Telefonnummern findet, geht wieder --
  // und Google merkt sich das.
  const title = matched.length
    ? (isEn
        ? 'Restaurants in ' + city.name + ' – order & book online | ' + BRAND
        : 'Restaurants in ' + city.name + ' – online bestellen & reservieren | ' + BRAND)
    : (isEn
        ? 'Restaurants in ' + city.name + ' – addresses & phone numbers | ' + BRAND
        : 'Restaurants in ' + city.name + ' – Adressen & Telefonnummern | ' + BRAND);
  // Die Zahl in Title und Description muss die Zahl auf der Seite sein.
  // Stand hier frueher matched.length -- mit den weiteren Betrieben waere
  // das eine Description, die weniger verspricht, als die Seite zeigt.
  const gesamt = matched.length + weitere.length;
  const description = isEn
    ? betriebeZahl(gesamt, true) + ' in ' + city.name + ' at a glance – with address and phone number.'
      + (matched.length ? ' ' + matched.length + ' of them with menu, online ordering and table booking.' : '')
    : betriebeZahl(gesamt, false) + ' in ' + city.name + ' auf einen Blick – mit Adresse und Telefonnummer.'
      + (matched.length ? ' Davon ' + matched.length + ' mit Speisekarte und Online-Bestellung.' : '');

  const html = buildPage({
    lang: lang,
    altDe: deUrl,
    altEn: enUrl,
    title: title,
    description: description.length > 160 ? description.slice(0, 157) + '...' : description,
    canonical: url,
    h1: (isEn ? 'Restaurants in ' : 'Restaurants in ') + city.name,
    subtitle: isEn
      ? betriebeZahl(gesamt, true, '&') + ' in ' + city.name
      : betriebeZahl(gesamt, false, '&') + ' in ' + city.name,
    intro: buildOrtsIntro(city, matched, weitere, isEn),
    restaurants: matched,
    // Die ItemList bildet die ganze Seite ab, nicht nur die Partner. Sonst
    // stuende im Schema eine Liste mit 3 Eintraegen unter einer Seite, auf
    // der 40 stehen.
    itemListe: matched.concat(weitere.map(alsListenEintrag)),
    extraHtml: renderWeitereSection(city, weitere),
    faqs: buildOrtsFaqs(city, matched, weitere, isEn),
    breadcrumbs: [
      { name: isEn ? 'Home' : 'Startseite', url: isEn ? SITE_URL + '/en' : SITE_URL + '/' },
      { name: city.name, url: url }
    ],
    city: city,
    // KEINE category: renderCrossLinks wuerde sonst Kategorie-Seiten
    // verlinken, die es fuer die neu dazugekommenen Orte nicht gibt.
    gridHeading: (isEn ? 'Order online in ' : 'Online bestellen in ') + city.name
  });

  if (isEn) {
    const enDir = path.join(OUT_DIR, 'en');
    if (!fs.existsSync(enDir)) fs.mkdirSync(enDir, { recursive: true });
  }
  const relpath = (isEn ? 'en/' : '') + slug + '.html';
  fs.writeFileSync(path.join(OUT_DIR, relpath), html, 'utf8');
  return { filename: relpath, url: url, count: matched.length,
           weitere: weitere.length, ort: city.name };
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
      '<p>' + BRAND + ' is the regional platform for East Frisian gastronomy — no chains, no commission. What you order comes from the region, and the money stays here.</p>'
    : '<p>Ostfriesland ist mehr als Tee, Wattenmeer und Zwillingsmühlen – die Region hat eine erstaunlich vielfältige Gastro-Szene. ' +
      cat.descriptionDe.charAt(0).toUpperCase() + cat.descriptionDe.slice(1) + ' findest du hier in jeder größeren Stadt.</p>' +
      '<p>Aktuell sind <strong>' + matched.length + ' ' + cat.plural + '</strong> in Ostfriesland auf ' + BRAND + ' verfügbar. Du kannst direkt online bestellen, eine Speisekarte ansehen oder einen Tisch reservieren.</p>' +
      '<p>' + BRAND + ' ist die regionale Plattform fuer ostfriesische Gastronomie – ohne Konzern, ohne Provision. Was du bestellst, kommt aus der Region und das Geld bleibt hier.</p>';

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

// ---------------------------------------------------------------------
// Die Seite fuer Gastronomen: kiekmolin.de/gastro
// ---------------------------------------------------------------------
// WARUM ES SIE GIBT (19.09.2026): kiekmolin.de ist die Gaeste-App. Wer den
// Namen hoert und nachschaut, landete bisher in einer Bestell-App und wusste
// danach nicht, was ihm eigentlich angeboten wird -- die sichtbare
// Ueberschrift der Startseite lautet "Willkommen!". Fuer den Betrieb gab es
// keine einzige Seite.
//
// WAS HIER NICHT STEHT: keine erfundene Kundenzahl, keine Bewertung ohne
// Deckung, kein Streichpreis. Jeder Punkt unten ist eine Funktion, die
// wirklich im Code steht -- am 19.09.2026 einzeln nachgesehen.

// Die zwoelf Punkte. Jeder entspricht einer Funktion, die wirklich im Code
// steht -- am 19.09.2026 einzeln nachgesehen. Das Symbol ist ein Schluessel
// auf gastroSymbol(), KEIN Emoji: der Design-Standard von Kiek mol in
// verbietet Emojis als Bedienelement, und ein SVG faerbt sich mit dem Text.
function gastroLeistungen() {
  return [
    { z: 'karte', kopf: 'Speisekarte online',
      text: 'Kategorien, Gr\u00f6\u00dfen, Extras und Preise. \u00c4nderst du etwas, ist es sofort \u00fcberall aktuell \u2014 auch auf deiner Seite bei Google.' },
    { z: 'tasche', kopf: 'Online bestellen',
      text: 'Abholung und Lieferung, mit eigenem Lieferradius und Mindestbestellwert. Auch vorbestellen f\u00fcr sp\u00e4ter.' },
    { z: 'kalender', kopf: 'Tisch reservieren',
      text: 'Mit Tischplan, Best\u00e4tigung per Mail und einer Erinnerung f\u00fcr den Gast am Tag davor.' },
    { z: 'qr', kopf: 'QR-Code am Tisch',
      text: 'F\u00fcr jeden Tisch ein eigener Code. Der Gast scannt, bestellt und zahlt \u2014 ohne dass jemand an den Tisch muss. Auf der Terrasse im August ist das der Unterschied.' },
    // 20.09.2026 berichtigt. Hier stand "Karte ueber Stripe" -- falsch:
    // Stripe ist bei uns ausschliesslich das Abo zwischen uns und dem
    // Betrieb (stripe-create-customer/-manage/-webhook). Im Gastweg gibt
    // es drei Zahlarten, und keine davon laeuft ueber uns: cash,
    // card_on_delivery (das eigene Geraet des Betriebs) und paypal ueber
    // das eigene Konto aus der Tabelle paypal_konten.
    { z: 'karte_zahlung', kopf: 'Bezahlen',
      text: 'Bar, Karte mit dem eigenen Ger\u00e4t des Betriebs, oder PayPal \u00fcber das eigene '
          + 'PayPal-Konto. Das Geld geht direkt an den Betrieb \u2014 es l\u00e4uft nicht \u00fcber uns. '
          + 'Trinkgeld kann der Gast dazugeben.' },
    { z: 'drucker', kopf: 'Bon-Drucker',
      text: 'Bestellungen laufen direkt auf den Bondrucker in der K\u00fcche. Kein Tablet, das jemand im Blick behalten muss.' },
    { z: 'sonne', kopf: 'Mittagstisch und Tagesangebote',
      text: 'T\u00e4glich wechselnd, eine Woche im Voraus planbar.' },
    { z: 'marke', kopf: 'Stempelkarte und Gutscheine',
      text: 'Digitale Stempel, Pr\u00e4mien und Gutscheincodes \u2014 ohne Pappkarte, die der Gast verliert.' },
    { z: 'welt', kopf: 'Eigene Seite bei Google',
      text: 'Mit Speisekarte, \u00d6ffnungszeiten, Adresse und Telefonnummer. So gebaut, dass auch KI-Assistenten sie lesen k\u00f6nnen.' },
    { z: 'megafon', kopf: 'Veranstaltungen und Stellenanzeigen',
      text: 'Was bei dir l\u00e4uft und wen du suchst \u2014 im selben System.' },
    { z: 'sprechblase', kopf: 'Bewertungen',
      text: 'G\u00e4ste bewerten direkt bei dir. Auf Wunsch fragst du nach dem Besuch einmal per Mail nach.' },
    { z: 'lupe', kopf: 'Sichtbarkeits-Bericht',
      text: 'Ein Bericht, was bei Google und bei den KI-Assistenten \u00fcber dich zu finden ist \u2014 und was sich verbessern l\u00e4sst. Ohne Aufpreis.' },
    { z: 'preis', kopf: 'Alles in einem Preis',
      text: 'Kein Baukasten, keine Zusatzmodule. Alles, was hier steht, ist im Monatspreis drin.' }
  ];
}

// Schlanke Strich-Symbole, 24x24, currentColor. Bewusst KEINE Sterne: die
// Seite darf keine Bewertung andeuten, die nicht gedeckt ist.
function gastroSymbol(z) {
  var d = {
    karte:         '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M11 4h7.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11"/><path d="M14 9h3M14 13h3"/>',
    tasche:        '<path d="M5 8h14l-1 11.5a1.5 1.5 0 0 1-1.5 1.4h-11A1.5 1.5 0 0 1 4 19.5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    kalender:      '<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/><path d="M8 14h3v3H8z"/>',
    qr:            '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 14h2v2h-2zM18 14h2.5M14 18h2M18 18h2.5M18 21h2.5"/>',
    karte_zahlung: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18M6.5 14.5h3"/>',
    drucker:       '<path d="M7 9V4.5h10V9"/><rect x="3.5" y="9" width="17" height="7" rx="2"/><path d="M7 14h10v5.5H7z"/><path d="M17.5 12h.01"/>',
    sonne:         '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
    marke:         '<path d="M12 3.5l2 4.3 4.7.6-3.4 3.3.8 4.7-4.1-2.2-4.1 2.2.8-4.7L5.3 8.4l4.7-.6z" opacity=".35"/><path d="M7 20.5l5-2.6 5 2.6"/>',
    welt:          '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z"/>',
    megafon:       '<path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H8l6 4V4.5l-6 4H5.5A1.5 1.5 0 0 0 4 10z"/><path d="M17.5 9.5a4 4 0 0 1 0 5"/>',
    sprechblase:   '<path d="M20.5 11.5c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20.5l1.4-3.6C4.1 15.5 3.5 13.6 3.5 11.5c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"/>',
    lupe:          '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4l5.1 5.1"/><path d="M8 10.5h5M10.5 8v5"/>',
    preis:         '<path d="M3.5 11.2V5.5A2 2 0 0 1 5.5 3.5h5.7a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0L4.1 12.6a2 2 0 0 1-.6-1.4z"/><path d="M8 8h.01"/>'
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
       + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
       + (d[z] || d.preis) + '</svg>';
}

function gastroNichtDas() {
  return [
    { kopf: PREIS_PROVISION + ' Provision',
      text: 'Wir nehmen nichts vom Umsatz. Von jeder Bestellung bleibt der volle Betrag im Haus.' },
    { kopf: 'Keine Mindestlaufzeit',
      text: 'Monatlich k\u00fcndbar. Wer aufh\u00f6ren will, h\u00f6rt auf.' },
    { kopf: 'Deine G\u00e4ste bleiben deine G\u00e4ste',
      text: 'Name, Telefon und E-Mail stehen in deinem Dashboard \u2014 nicht nur in unserem.' },
    { kopf: 'Wir fassen dein Geld nicht an',
      text: 'Es gibt bei uns kein Konto, auf dem dein Umsatz zwischenlandet. Der Gast zahlt bar, '
          + 'mit Karte bei dir oder auf dein eigenes PayPal-Konto.' },
    { kopf: 'Kein App-Download',
      text: 'Der Gast \u00f6ffnet einen Link oder scannt den Code am Tisch. Es gibt nichts zu installieren.' }
  ];
}

function buildGastroFaqs() {
  return [
    { q: 'Was kostet ' + BRAND + '?',
      a: PREIS_MONAT + ' im Monat, fest \u2014 egal wie viel bestellt oder reserviert wird. ' + einstiegSatz()
       + ' ' + PREIS_UST + ' Nur in die \u00dcbersicht eingetragen zu werden, kostet nichts.' },
    { q: 'Nehmt ihr Provision?',
      a: 'Nein. ' + PREIS_PROVISION + '. Von jeder Bestellung bleibt der volle Betrag beim Betrieb. '
       + 'Deshalb ist der Monatspreis eine feste Zahl und kein Anteil.' },
    { q: 'Ich nehme gar keine Bestellungen an, nur Reservierungen. Lohnt sich das?',
      a: 'Ja. Der Preis ist derselbe und gilt f\u00fcr beides. Tischplan, Best\u00e4tigung per Mail, '
       + 'Erinnerung am Tag davor und die eigene Seite bei Google sind auch ohne eine einzige Bestellung drin.' },
    { q: 'Muss ich meine Kasse wechseln?',
      a: 'Nein. Deine Kasse bleibt, wo sie ist. Bestellungen k\u00f6nnen als Bon gedruckt oder \u00fcber eine Schnittstelle abgeholt werden.' },
    { q: 'Brauchen meine G\u00e4ste eine App?',
      a: 'Nein. Der Gast \u00f6ffnet einen Link oder scannt den QR-Code am Tisch. Es gibt nichts zu installieren.' },
    { q: 'Wie lange bin ich gebunden?',
      a: 'Monatlich k\u00fcndbar, keine Mindestlaufzeit.' },
    { q: 'Was ist der Sichtbarkeits-Bericht, und kostet der was?',
      a: 'Er kostet nichts \u2014 jeder Betrieb bei ' + BRAND + ' bekommt ihn. Darin steht, ob dich die '
       + 'KI-Assistenten nennen, was in deinem Google-Profil fehlt, was an deiner Karte bremst, ob deine '
       + 'Texte maschinenlesbar sind, und wie das im Vergleich zum Vormonat aussieht.' },
    { q: 'Was kostet der Telefonassistent?',
      a: 'Der ist nicht im Monatspreis drin, er kostet extra. Was genau, h\u00e4ngt davon ab, wie viel bei dir '
       + 'angerufen wird \u2014 sag uns Bescheid, dann rechnen wir es dir aus. Er meldet sich \u00fcbrigens von '
       + 'sich aus als digitaler Assistent, er tut nicht so, als w\u00e4re er ein Mensch.' },
    { q: 'Wer steckt dahinter?',
      a: BRAND + ' wird in Ostfriesland gemacht und betreut. Wenn etwas klemmt, ist jemand da, der vorbeikommen kann.' }
  ];
}

// Die Seite baut ihr eigenes Dokument statt buildPage() zu benutzen.
//
// WARUM: buildPage ist fuer Listenseiten gemacht -- Karten-Raster, "keine
// Restaurants gelistet", Querverweise. Diese Seite verkauft etwas und muss
// aussehen wie die App, nicht wie ein Verzeichnis. Ibo am 20.09.2026:
// "Design muss wie kiekmolin sein, es muss die Leute ueberzeugen".
//
// Die Werte unten stammen aus dem :root von index.html, nicht aus dem
// Gedaechtnis: Dunkelgruen #003D33, Gold #C5A233, Epilogue fuer
// Ueberschriften, Inter fuer den Text, weiche Schatten mit rgba(0,37,30),
// Radien 12/16/32/48. Der Dunkelmodus spiegelt den der App.
//
// Keine Emojis als Bedienelement -- das verbietet der Design-Standard und
// es waere auf einer Verkaufsseite auch billig. Stattdessen Strich-Symbole
// aus gastroSymbol(), die sich mit dem Text einfaerben.

var GASTRO_CSS = "\n:root{\n  --gr:#003D33;--gr-hell:#1a5f4a;--gr-tief:#00251e;\n  --gold:#C5A233;--gold-hell:#FFD54F;\n  --creme:#f8f9fa;--sand:#edeeef;--kohle:#191c1d;--schiefer:#404946;\n  --flaeche:#ffffff;--grund:#f8f9fa;--linie:rgba(0,37,30,.10);\n  --s-sm:0 2px 8px rgba(0,37,30,.04);--s-md:0 8px 24px -4px rgba(0,37,30,.07);\n  --s-lg:0 24px 48px -8px rgba(0,37,30,.10);--s-xl:0 32px 64px -12px rgba(0,37,30,.14);\n  --r-sm:12px;--r-md:16px;--r-lg:32px;--r-xl:48px;\n  --weich:all .22s cubic-bezier(.4,0,.2,1);--pille-schrift:#ffffff;\n}\n@media (prefers-color-scheme:dark){:root{\n  --gr:#9cd1c3;--gr-hell:#b8eddf;--gr-tief:#003D33;--gold:#FFD54F;\n  --creme:#0a1612;--sand:#111f1a;--kohle:#e8eeec;--schiefer:#9ca8a4;\n  --flaeche:#1a2e27;--grund:#0a1612;--linie:rgba(255,255,255,.08);\n  --s-sm:0 2px 8px rgba(0,0,0,.4);--s-md:0 8px 24px -4px rgba(0,0,0,.45);\n  --s-lg:0 24px 48px -8px rgba(0,0,0,.5);--s-xl:0 32px 64px -12px rgba(0,0,0,.55);--pille-schrift:#00251e;\n}}\n*{box-sizing:border-box}\nhtml{scroll-behavior:smooth}\nbody{margin:0;background:var(--grund);color:var(--kohle);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;line-height:1.62;-webkit-font-smoothing:antialiased}\nh1,h2,h3{font-family:Epilogue,Inter,sans-serif;font-weight:900;letter-spacing:-.035em;line-height:1.06;margin:0}\np{margin:0 0 14px}\na{color:inherit}\n.huelle{max-width:1080px;margin:0 auto;padding:0 20px}\n.eng{max-width:760px}\n/* Die klebende Kopfzeile ist 64px hoch. Ohne das hier verdeckt sie\n   beim Sprung auf einen Anker dessen obere Kante. */\n#anmelden,#drin{scroll-margin-top:84px}\n.schmal{max-width:760px;margin-right:auto}\n.kopf{position:sticky;top:0;z-index:20;background:var(--grund);border-bottom:1px solid var(--linie)}\n.kopf .huelle{display:flex;align-items:center;justify-content:space-between;height:64px;gap:14px}\n.wortmarke{font-family:Epilogue,sans-serif;font-weight:900;font-size:19px;letter-spacing:-.03em;color:var(--gr);text-decoration:none}\n.pille{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:13px 28px;border-radius:9999px;font-weight:700;font-size:16px;text-decoration:none;border:1px solid transparent;cursor:pointer;transition:var(--weich);font-family:inherit}\n.pille.voll{background:var(--gr);color:var(--pille-schrift);box-shadow:var(--s-md)}\n.pille.voll:hover{transform:translateY(-2px);box-shadow:var(--s-lg)}\n.pille.gold{background:var(--gold-hell);color:#00251e;box-shadow:0 10px 26px -8px rgba(197,162,51,.55)}\n.pille.gold:hover{transform:translateY(-2px);box-shadow:0 16px 34px -10px rgba(197,162,51,.65)}\n.pille.geist{background:transparent;border-color:rgba(255,255,255,.45);color:#fff}\n.pille.geist:hover{background:rgba(255,255,255,.12)}\n.pille:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--gold);outline-offset:3px}\n.held{position:relative;background:linear-gradient(160deg,#00352c 0%,#00251e 62%,#001a15 100%);color:#f2f7f5;padding:78px 0 132px;overflow:hidden}\n.held::after{content:'';position:absolute;inset:auto -10% -55% 38%;height:72%;background:radial-gradient(ellipse at center,rgba(197,162,51,.22),transparent 68%);pointer-events:none}\n.held .huelle{position:relative;z-index:1}\n.held h1{font-size:clamp(34px,6.4vw,62px);color:#fff;max-width:15ch}\n.held .unter{font-size:clamp(17px,2.2vw,21px);color:rgba(255,255,255,.80);max-width:46ch;margin:20px 0 30px}\n.marken{display:flex;flex-wrap:wrap;gap:10px;margin:32px 0 0;padding:0;list-style:none}\n.marken li{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.20);border-radius:9999px;padding:9px 17px;font-size:14px;font-weight:600;color:rgba(255,255,255,.94)}\n.knopfreihe{display:flex;flex-wrap:wrap;gap:12px}\n.preis{margin:-86px auto 0;position:relative;z-index:5;background:var(--flaeche);border:1px solid var(--linie);border-radius:var(--r-xl);box-shadow:var(--s-xl);padding:36px 32px}\n.preis .zahl{font-family:Epilogue,sans-serif;font-weight:900;font-size:clamp(46px,9vw,72px);line-height:1;letter-spacing:-.05em;color:var(--gr)}\n.preis .je{font-size:17px;font-weight:600;color:var(--schiefer);margin-left:8px;letter-spacing:0}\n.rechnung{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:12px}\n.rechnung li{position:relative;padding-left:26px;font-size:15.5px;color:var(--schiefer);line-height:1.55}\n.rechnung li::before{content:\"\";position:absolute;left:2px;top:.62em;width:8px;height:8px;border-radius:50%;background:var(--gold)}\n.rechnung strong{color:var(--kohle)}\n.preis .band{margin:22px 0 0;background:var(--sand);border-left:4px solid var(--gold);border-radius:0 var(--r-sm) var(--r-sm) 0;padding:16px 19px;font-weight:600}\n.preis .klein{margin:14px 0 0;font-size:15px;color:var(--schiefer)}\nsection{padding:62px 0}\n.titel{font-size:clamp(25px,4vw,36px);margin-bottom:8px}\n.vorsatz{color:var(--schiefer);margin-bottom:32px;max-width:52ch}\n.raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:18px}\n.karte{background:var(--flaeche);border:1px solid var(--linie);border-radius:var(--r-lg);padding:26px;box-shadow:var(--s-sm);transition:var(--weich)}\n.karte:hover{transform:translateY(-3px);box-shadow:var(--s-lg)}\n.karte h3{font-size:17px;font-weight:800;letter-spacing:-.02em;margin:16px 0 7px}\n.karte p{margin:0;font-size:15.5px;color:var(--schiefer);line-height:1.6}\n.zeichen{width:44px;height:44px;border-radius:var(--r-sm);display:grid;place-items:center;background:rgba(0,61,51,.09);color:var(--gr)}\n.zeichen svg{width:23px;height:23px}\n.dazu{background:var(--flaeche);border:2px solid var(--gold);border-radius:var(--r-lg);padding:34px 32px;box-shadow:var(--s-md)}\n.extra{background:var(--flaeche);border:1px solid var(--linie);border-radius:var(--r-lg);padding:34px 32px;box-shadow:var(--s-sm)}\n.marke-gold{display:inline-block;background:var(--gold-hell);color:#00251e;border-radius:9999px;padding:6px 15px;font-size:13px;font-weight:700;margin:0 0 14px;letter-spacing:.01em}\n.marke-still{display:inline-block;background:rgba(0,61,51,.09);color:var(--gr);border-radius:9999px;padding:6px 15px;font-size:13px;font-weight:700;margin:0 0 14px}\n.haken{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:11px}\n.haken li{position:relative;padding-left:32px;color:var(--schiefer)}\n.haken li::before{content:\"\";position:absolute;left:4px;top:.5em;width:9px;height:5px;border-left:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(-45deg)}\n.dazu .klein{font-size:14px;color:var(--schiefer)}\n@media (max-width:640px){.dazu,.extra{padding:26px 22px}}\n.nicht{background:var(--sand)}\n.nicht .karte{background:transparent;border:0;box-shadow:none;padding:0}\n.nicht .karte:hover{transform:none;box-shadow:none}\n.nicht .zeichen{background:rgba(197,162,51,.22);color:var(--gr)}\n@media (min-width:900px){.nicht .raster{grid-template-columns:1fr 1fr;gap:26px 34px}}\n.anmelden{background:linear-gradient(165deg,#00352c,#00251e);color:#f2f7f5;border-radius:var(--r-xl);padding:44px 34px;box-shadow:var(--s-xl)}\n.anmelden .titel{color:#fff}\n.anmelden .vorsatz{color:rgba(255,255,255,.78)}\n.feldsatz{display:grid;gap:15px;max-width:560px;border:0;padding:0;margin:0}\n.feld{display:grid;gap:6px;font-size:14px;font-weight:600;color:rgba(255,255,255,.88)}\n.feld input,.feld textarea{font:inherit;font-weight:400;padding:14px 16px;border-radius:var(--r-sm);border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;transition:var(--weich);width:100%}\n.feld input::placeholder,.feld textarea::placeholder{color:rgba(255,255,255,.42)}\n.feld input:focus,.feld textarea:focus{background:rgba(255,255,255,.14);border-color:var(--gold-hell);outline:0}\n.hinweis{min-height:22px;margin:0;font-size:15px;font-weight:600}\n.klein-weiss{font-size:13px;color:rgba(255,255,255,.62);margin:0}\n.klein-weiss a{color:rgba(255,255,255,.88)}\n.direkt{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:26px 0 0;padding-top:24px;border-top:1px solid rgba(255,255,255,.14)}\n.oder{font-size:14px;font-weight:600;color:rgba(255,255,255,.7)}\n.anmelden .pille.geist{border-color:rgba(255,255,255,.35);color:#fff;font-size:15px;padding:11px 20px;min-height:44px}\n.anmelden .pille.geist:hover{background:rgba(255,255,255,.14);transform:translateY(-1px)}\n.topf{position:absolute;left:-9999px;top:-9999px;width:1px;height:0;overflow:hidden}\n.frage{background:var(--flaeche);border:1px solid var(--linie);border-radius:var(--r-md);margin-bottom:10px;overflow:hidden}\n.frage summary{cursor:pointer;padding:19px 22px;font-weight:700;font-size:16.5px;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:14px;transition:var(--weich)}\n.frage summary::-webkit-details-marker{display:none}\n.frage summary::after{content:'';width:10px;height:10px;flex:0 0 auto;border-right:2px solid var(--gr);border-bottom:2px solid var(--gr);transform:rotate(45deg) translateY(-2px);transition:var(--weich)}\n.frage[open] summary::after{transform:rotate(225deg) translateY(2px)}\n.frage summary:hover{background:rgba(0,61,51,.05)}\n.frage .antwort{padding:0 22px 20px;color:var(--schiefer);margin:0}\n.fuss{border-top:1px solid var(--linie);padding:34px 0 50px;color:var(--schiefer);font-size:14.5px}\n.fuss a{margin-right:18px;text-decoration:none;font-weight:600}\n.fuss a:hover{text-decoration:underline}\n@media (max-width:640px){\n  body{font-size:16px}\n  .held{padding:54px 0 110px}\n  section{padding:46px 0}\n  .preis{padding:28px 22px;border-radius:var(--r-lg)}\n  .anmelden{padding:32px 22px;border-radius:var(--r-lg)}\n  .knopfreihe .pille{flex:1 1 100%}\n}\n@media (prefers-reduced-motion:reduce){*{transition:none !important;scroll-behavior:auto}}\n";

var GASTRO_JS = "(function(){\n  var f=document.getElementById('gastroForm');if(!f)return;\n  var h=document.getElementById('gastroHinweis'),b=document.getElementById('gastroSenden');\n  function sag(txt,farbe){h.textContent=txt;h.style.color=farbe;}\n  f.addEventListener('submit',function(e){\n    e.preventDefault();\n    var d={quelle:'gastro'};\n    Array.prototype.forEach.call(f.elements,function(el){if(el.name)d[el.name]=el.value;});\n    b.disabled=true;sag('Wird gesendet \\u2026','rgba(255,255,255,.75)');\n    fetch('/.netlify/functions/agentur-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})\n      .then(function(r){return r.json().catch(function(){return null;});})\n      .then(function(a){\n        if(a&&a.ok){f.reset();sag('Angekommen. Wir melden uns \\u2014 meistens noch heute.','#9ee7c8');}\n        else if(a&&a.mailAus&&a.imCrm){f.reset();sag('Angekommen \\u2014 wir melden uns. Falls es eilt: info@kiekmolin.de','#9ee7c8');}\n        else{b.disabled=false;sag('Das hat gerade nicht geklappt. Schreib uns bitte an info@kiekmolin.de','#ffb4a8');}\n      })\n      .catch(function(){b.disabled=false;sag('Keine Verbindung. Schreib uns bitte an info@kiekmolin.de','#ffb4a8');});\n  });\n})();";
function gastroFormular() {
  return '' +
    '<section id="anmelden" class="huelle" style="padding-bottom:0;">' +
      '<div class="anmelden">' +
        '<h2 class="titel">Jetzt eintragen</h2>' +
        '<p class="vorsatz">Trag deinen Betrieb ein. Wir melden uns \u2014 meistens noch am selben Tag. ' +
          'Kein Vertrag am Telefon, kein Verkaufsgespr\u00e4ch.</p>' +
        '<form id="gastroForm" novalidate>' +
          '<fieldset class="feldsatz">' +
            '<label class="feld">Betrieb *' +
              '<input name="betrieb" required maxlength="90" autocomplete="organization" placeholder="Gasthaus zur Br\u00fccke">' +
            '</label>' +
            '<label class="feld">Ort' +
              '<input name="ort" maxlength="60" autocomplete="address-level2" placeholder="Greetsiel">' +
            '</label>' +
            '<label class="feld">Dein Name' +
              '<input name="name" maxlength="70" autocomplete="name" placeholder="Vorname Nachname">' +
            '</label>' +
            '<label class="feld">Telefon oder E-Mail *' +
              '<input name="kontakt" required maxlength="90" placeholder="0 49 31 \u2026 oder name@betrieb.de">' +
            '</label>' +
            '<label class="feld">Was brauchst du?' +
              '<textarea name="anliegen" rows="3" maxlength="400" placeholder="Wir nehmen nur Reservierungen \u2014 geht das auch?"></textarea>' +
            '</label>' +
            '<div class="topf" aria-hidden="true">' +
              '<input name="firmen_webseite" tabindex="-1" autocomplete="off">' +
            '</div>' +
            '<button type="submit" id="gastroSenden" class="pille gold" style="width:100%;">Eintragen</button>' +
            '<p id="gastroHinweis" class="hinweis" role="status" aria-live="polite"></p>' +
            '<p class="klein-weiss">Wir nutzen deine Angaben nur, um dir zu antworten. ' +
              '<a href="/?page=datenschutz">Datenschutz</a></p>' +
          '</fieldset>' +
        '</form>' +
        // Viele Wirte tippen kein Formular aus. Der direkte Weg steht
        // deshalb gleich daneben und nicht im Kleingedruckten.
        '<div class="direkt">' +
          '<span class="oder">Lieber direkt?</span>' +
          '<a class="pille geist" href="' + KONTAKT_TEL_LINK + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:19px;height:19px;">' +
            '<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z"/>' +
            '</svg>' + KONTAKT_TEL +
          '</a>' +
          '<a class="pille geist" href="mailto:' + KONTAKT_MAIL + '">' + KONTAKT_MAIL + '</a>' +
        '</div>' +
      '</div>' +
    '</section>';
}

function generateGastroPage() {
  const url = SITE_URL + '/' + GASTRO_SLUG;
  const faqs = buildGastroFaqs();

  const titel = 'Bestellen, reservieren und bezahlen \u2014 ohne Provision | ' + BRAND;
  const beschreibung = 'Das komplette G\u00e4stesystem f\u00fcr Gastronomie in Ostfriesland: Speisekarte, '
    + 'Online-Bestellung, Tischreservierung, QR am Tisch. ' + PREIS_MONAT + ' im Monat, '
    + PREIS_PROVISION + ' Provision.';

  const held = ''
    + '<header class="held">'
      + '<div class="huelle">'
        + '<h1>Bestellen, reservieren, bezahlen \u2014 ohne Provision.</h1>'
        + '<p class="unter">Das ganze G\u00e4stesystem f\u00fcr deinen Betrieb in Ostfriesland. '
        + 'Ein Preis, alles drin \u2014 und der Gast bleibt deiner.</p>'
        + '<div class="knopfreihe">'
          + '<a class="pille gold" href="#anmelden">Jetzt eintragen</a>'
          + '<a class="pille geist" href="#drin">Was ist drin?</a>'
        + '</div>'
        + '<ul class="marken">'
          + '<li>' + PREIS_PROVISION + ' Provision</li>'
          + '<li>Monatlich k\u00fcndbar</li>'
          + '<li>Ohne App</li>'
          + '<li>Aus Ostfriesland</li>'
        + '</ul>'
      + '</div>'
    + '</header>';

  const preis = ''
    + '<div class="huelle eng">'
      + '<section class="preis" style="padding-top:34px;">'
        + '<h2 class="titel" style="font-size:22px;margin-bottom:16px;">Was es kostet</h2>'
        + '<p style="margin:0;"><span class="zahl">' + PREIS_MONAT + '</span>'
          + '<span class="je">im Monat, fest</span></p>'
        + '<p style="margin:14px 0 0;color:var(--schiefer);">' + preisSatz() + '</p>'
        + '<ul class="rechnung">'
          + '<li><strong>' + preisProTag() + '.</strong> '
            + 'So viel kostet eine Tasse Kaffee im Einkauf.</li>'
          + '<li><strong>Der Betrag \u00e4ndert sich nie.</strong> Bei 500 \u20ac Online-Umsatz im Monat '
            + 'zahlst du dasselbe wie bei 15.000 \u20ac \u2014 weil wir nichts vom Umsatz nehmen.</li>'
          + '<li><strong>Bei 30 \u20ac Rechnungsdurchschnitt sind das zwei G\u00e4ste im Monat.</strong> '
            + 'Wer den dritten \u00fcber die Seite bekommt, hat es wieder drin.</li>'
          // Bewusst OHNE Druckpreis: was eine Karte kostet, weiss der Wirt
          // besser als wir, und eine erfundene Zahl waere angreifbar.
          + '<li><strong>Preise \u00e4ndern kostet nichts mehr.</strong> Du tippst sie einmal, '
            + 'und sie stehen \u00fcberall richtig \u2014 auf deiner Seite, im Bestellweg und bei Google. '
            + 'Ohne neu zu drucken.</li>'
        + '</ul>'
        + '<p class="band">' + einstiegSatz() + '</p>'
        + '<p class="klein"><strong>' + PREIS_UST + '</strong> Auf der Rechnung steht ' + PREIS_MONAT
          + ', und genau das wird abgebucht.</p>'
        + '<p class="klein">Nur in die \u00dcbersicht eingetragen zu werden \u2014 mit Adresse, '
          + '\u00d6ffnungszeiten und Telefonnummer \u2014 kostet nichts.</p>'
      + '</section>'
    + '</div>';

  const drin = ''
    + '<section id="drin" class="huelle">'
      + '<h2 class="titel">Was drin ist</h2>'
      + '<p class="vorsatz">Alles in einem Preis. Kein Baukasten, keine Zusatzmodule.</p>'
      + '<div class="raster">'
      + gastroLeistungen().map(function(l) {
          return '<article class="karte">'
            + '<div class="zeichen">' + gastroSymbol(l.z) + '</div>'
            + '<h3>' + escapeHtml(l.kopf) + '</h3>'
            + '<p>' + escapeHtml(l.text) + '</p>'
          + '</article>';
        }).join('')
      + '</div>'
    + '</section>';

  // Zwei Bloecke, die nicht in das Raster oben gehoeren: einer, der ohne
  // Aufpreis dazukommt, und einer, der extra kostet. Beides muss auf den
  // ersten Blick unterscheidbar sein -- sonst wird aus "alles in einem
  // Preis" eine Falle.
  const dazu = ''
    + '<section class="huelle"><div class="dazu">'
      + '<p class="marke-gold">Ohne Aufpreis dabei</p>'
      + '<h2 class="titel">Der Sichtbarkeits-Bericht</h2>'
      + '<p class="vorsatz">Jeder Betrieb bei ' + escapeHtml(BRAND) + ' bekommt ihn. '
      + 'Er zeigt schwarz auf wei\u00df, wo du im Netz stehst \u2014 und was sich daran drehen l\u00e4sst.</p>'
      + '<ul class="haken">'
        + '<li>Wirst du genannt, wenn jemand einen KI-Assistenten nach Essen in deinem Ort fragt? Und bei welchen?</li>'
        + '<li>Was fehlt in deinem Google-Profil \u2014 Fotos, Kategorien, Beitr\u00e4ge.</li>'
        + '<li>Was an deiner Karte bremst: tote Gerichte, fehlende Beschreibungen, Reihenfolge, L\u00e4nge.</li>'
        + '<li>Ob deine Texte f\u00fcr Maschinen lesbar sind \u2014 danach richten sich die Assistenten.</li>'
        + '<li>Und der Vergleich zum Vormonat: besser oder schlechter geworden.</li>'
      + '</ul>'
      + '<p class="klein" style="margin-top:6px;">Keine Zahlen ohne Beleg. Was nicht messbar ist, steht als nicht messbar drin.</p>'
    + '</div></section>';

  const extra = ''
    + '<section class="huelle"><div class="extra">'
      + '<p class="marke-still">Kostet extra</p>'
      + '<h2 class="titel">Wie viele Anrufe gehen bei dir ins Leere?</h2>'
      // BEWUSST EINE FRAGE UND KEINE ZAHL.
      //
      // Ibo aus der Praxis: an Ruhetagen verpasst ein Betrieb ungefaehr
      // 10 bis 20 Anrufe am Tag. Das ist seine Erfahrung, und sie ist
      // vermutlich richtig -- aber sie ist NICHT gemessen, und messen
      // koennen wir sie auch nicht: Wenn niemand rangeht, erfaehrt
      // Kiek mol in davon nichts. telefonzahlen.js zaehlt nur, was der
      // Assistent GEBRACHT hat, nicht was ohne ihn verloren ging.
      //
      // Eine ungepruefte Zahl auf einer Werbeseite ist nach Paragraf 5
      // UWG angreifbar -- und nach unserer eigenen Regel 1 duerfen wir
      // eine Vermutung nicht wie einen Befund hinschreiben. Die Frage
      // wirkt ohnehin staerker: der Wirt nennt sich seine eigene Zahl,
      // und der glaubt er.
      + '<p class="vorsatz">Am Ruhetag. Mitten im Mittagsgesch\u00e4ft. Wenn alle H\u00e4nde voll sind. '
      + 'Guck heute Abend einmal in die Anrufliste deines Telefons \u2014 die Zahl \u00fcberrascht die meisten. '
      + 'Jeder davon war jemand, der einen Tisch wollte.</p>'
      + '<p style="margin:0 0 18px;color:var(--schiefer);"><strong>Der Telefonassistent geht ran, wenn ihr nicht k\u00f6nnt.</strong> '
      + 'Er nimmt Reservierungen und Bestellungen auf, notiert R\u00fcckrufe und stellt auf Wunsch zu dir durch.</p>'
      + '<p style="margin:0 0 18px;color:var(--schiefer);">Er sagt von sich aus, dass er ein digitaler Assistent ist \u2014 '
      + 'kein Mensch, der so tut als ob. Das ist uns wichtig und seit 2026 auch Vorschrift.</p>'
      + '<a class="pille voll" href="#anmelden">Was das kostet, sagen wir dir</a>'
    + '</div></section>';

  const nicht = ''
    + '<section class="nicht"><div class="huelle">'
      + '<h2 class="titel">Was wir nicht tun</h2>'
      + '<p class="vorsatz">Vier Sachen, die bei anderen anders laufen.</p>'
      + '<div class="raster">'
      + gastroNichtDas().map(function(x) {
          return '<article class="karte">'
            + '<div class="zeichen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + '<path d="M4.5 12.5l5 5 10-11"/></svg></div>'
            + '<h3>' + escapeHtml(x.kopf) + '</h3>'
            + '<p>' + escapeHtml(x.text) + '</p>'
          + '</article>';
        }).join('')
      + '</div>'
    + '</div></section>';

  const fragen = ''
    + '<section class="huelle"><div class="schmal">'
      + '<h2 class="titel">H\u00e4ufige Fragen</h2>'
      + '<p class="vorsatz">Die, die beim ersten Gespr\u00e4ch immer kommen.</p>'
      + faqs.map(function(f) {
          return '<details class="frage">'
            + '<summary>' + escapeHtml(f.q) + '</summary>'
            + '<p class="antwort">' + escapeHtml(f.a) + '</p>'
          + '</details>';
        }).join('')
    + '</div></section>';

  const html = '<!doctype html>\n<html lang="de">\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<title>' + escapeHtml(titel) + '</title>\n'
    + '<meta name="description" content="' + escapeAttr(beschreibung) + '">\n'
    + '<meta name="robots" content="index,follow,max-image-preview:large">\n'
    + '<link rel="canonical" href="' + escapeAttr(url) + '">\n'
    + '<meta property="og:type" content="website">\n'
    + '<meta property="og:title" content="' + escapeAttr(titel) + '">\n'
    + '<meta property="og:description" content="' + escapeAttr(beschreibung) + '">\n'
    + '<meta property="og:url" content="' + escapeAttr(url) + '">\n'
    + '<meta name="theme-color" content="#00251e">\n'
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap">\n'
    // Die Helfer geben ein Objekt zurueck, keinen fertigen Block -- der
    // script-Rahmen und das Maskieren gehoeren dazu, sonst steht das JSON
    // nackt im Kopf und Google sieht gar kein Schema.
    + '<script type="application/ld+json">'
    + jsonEscape(buildBreadcrumbJsonLd([{ name: 'Start', url: SITE_URL + '/' },
                                        { name: 'F\u00fcr Gastronomie', url: url }]))
    + '<\/script>\n'
    + '<script type="application/ld+json">' + jsonEscape(buildFaqJsonLd(faqs)) + '<\/script>\n'
    + '<style>' + GASTRO_CSS + '</style>\n'
    + '</head>\n<body>\n'
    + '<a class="kopf" href="#" style="display:none"></a>'
    + '<div class="kopf"><div class="huelle">'
      + '<a class="wortmarke" href="/">' + escapeHtml(BRAND) + '</a>'
      + '<a class="pille voll" href="#anmelden" style="padding:9px 20px;min-height:40px;font-size:15px;">Eintragen</a>'
    + '</div></div>'
    + held + preis + drin + dazu + extra + nicht + fragen + gastroFormular()
    + '<footer class="fuss"><div class="huelle">'
      + '<p style="margin:0 0 10px;">'
      + '<a href="/">Zur\u00fcck zu ' + escapeHtml(BRAND) + '</a>'
      + '<a href="/?page=impressum">Impressum</a>'
      + '<a href="/?page=datenschutz">Datenschutz</a>'
      + '</p>'
      + '<p style="margin:0;">Gemacht in Ostfriesland. Fragen? '
      + '<a href="' + KONTAKT_TEL_LINK + '">' + KONTAKT_TEL + '</a></p>'
    + '</div></footer>'
    + '<script>' + GASTRO_JS + '<\/script>\n'
    + '</body>\n</html>\n';

  const filename = GASTRO_SLUG + '.html';
  fs.writeFileSync(path.join(OUT_DIR, filename), html, 'utf8');
  return { filename: filename, url: url, gastro: true };
}

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
    // Die Gastro-Seite ist die einzige, die etwas verkauft. Sie steht so
    // weit oben wie eine Betriebsseite und aendert sich selten.
    const prio = g.gastro ? '0.9' : (g.restaurant ? '0.9' : (g.prospect ? '0.6' : '0.8'));
    const freq = g.gastro ? 'monthly' : (g.restaurant ? 'daily' : (g.prospect ? 'monthly' : 'weekly'));
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
// Die Orte, fuer die dieser Build wirklich Seiten erzeugt hat. Wird in
// main() gesetzt; bleibt sie leer (Aufruf aus einem Test), faellt
// writeLlmsTxt auf CITIES zurueck wie frueher.
var LLMS_ORTE = [];

function writeLlmsTxt(restaurants) {
  const zeilen = [
    '# Kiek mol in – Restaurants in Ostfriesland',
    '',
    '> kiekmolin.de ist das regionale Restaurant-Portal für Ostfriesland (Nordwest-Deutschland):',
    '> Speisekarten, Online-Bestellung (Abholung/Lieferung) und kostenlose Tisch-Reservierung',
    '> mit Sofort-Bestätigung – ohne Preisaufschlag für Gäste.',
    '',
    // FUER WIRTE, NICHT FUER GAESTE.
    //
    // Fragt jemand einen KI-Assistenten "was kostet Kiek mol in fuer
    // Gastronomen", stand hier bisher nichts -- und die Antwort kam dann
    // aus den SEO-Seiten, wo "faire Provision" stand. Also aus der
    // falschen Quelle. Jetzt steht es hier, in einem Satz.
    '## Für Gastronomen',
    '',
    'Eintrag kostenlos. ' + preisSatz(),
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
  // NUR ORTE, DIE ES ALS SEITE GIBT.
  //
  // Hier stand CITIES -- also die 28 handgepflegten. Seit die Ortsseiten
  // aus den Daten kommen (17.09.2026) stimmt das in beide Richtungen
  // nicht: Orte unter der Untergrenze bekommen keine Seite und stuenden
  // hier trotzdem, und die 19 Orte, die erst ueber die Daten dazukamen,
  // fehlten. Ein Verzeichnis fuer KI-Assistenten, das auf den
  // SPA-Fallback zeigt, ist schlimmer als ein kuerzeres.
  zeilen.push('', '## Orte');
  // slugExists() gilt IMMER, auch im Rueckfallweg auf CITIES.
  //
  // Erst stand die Pruefung nur im LLMS_ORTE-Zweig -- der Rueckfallweg
  // druckte alle 28 Orte ungeprueft, also auch die ohne Seite. Genau der
  // Soft-404, gegen den die Ortsseiten-Aenderung von heute gebaut ist, nur
  // eine Datei weiter. Ist die Liste nicht ermittelt, sagt slugExists()
  // ohnehin zu allem ja -- dann verhaelt es sich wie frueher.
  (LLMS_ORTE.length ? LLMS_ORTE : CITIES).forEach(function(c) {
    if (!slugExists('restaurants-' + c.slug)) return;
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
// DIE STARTSEITE AUF DIE ORTSSEITEN VERLINKEN.
//
// Gemessen am 17.09.2026: die Startseite hatte genau 5 interne Links -- die
// 5 Partnerseiten. Die uebrigen Seiten hingen allein in der Sitemap, also
// an nichts. Im Footer standen die passenden Begriffe sogar schon da
// ("Restaurant Greetsiel", "Speisekarte Norden"), nur als tote <span>.
//
// Verlinkt wird NUR, was dieser Build wirklich gebaut hat. Sonst zeigt die
// Startseite auf eine URL, die der Catch-All in netlify.toml mit Status 200
// und dem Inhalt der Startseite beantwortet -- ein Soft-404, und das
// ausgerechnet von der wichtigsten Seite der Domain aus.
function injectHomepageCityLinks(ortsseiten) {
  const indexPath = path.join(OUT_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) return;

  const orte = (ortsseiten || [])
    .filter(function(o) { return o && o.ort && o.slug; })
    .sort(function(a, b) { return String(a.ort).localeCompare(String(b.ort), 'de'); });

  // Nichts gebaut -> Marker in Ruhe lassen. Ein leerer Block waere
  // schlechter als der alte Stand.
  if (!orte.length) {
    console.warn('[seo] WARN: keine Ortsseiten - Startseiten-Links unveraendert');
    return;
  }

  const footer = orte.map(function(o) {
    return '        <a href="/' + escapeAttr(o.slug) + '" style="color:var(--text-primary);text-decoration:none;">Restaurants in ' +
      escapeHtml(o.ort) + '</a>';
  }).join('\n');

  const noscript = orte.map(function(o) {
    return '            <li><a href="/' + escapeAttr(o.slug) + '">Restaurants in ' + escapeHtml(o.ort) +
      '</a> &ndash; ' + o.gesamt + ' ' + (o.gesamt === 1 ? 'Betrieb' : 'Betriebe') +
      (o.count ? ', davon ' + o.count + ' mit Speisekarte und Online-Bestellung' : '') + '</li>';
  }).join('\n');

  let html = fs.readFileSync(indexPath, 'utf8');
  const before = html;
  html = html.replace(/<!--KMI:ORT-LINKS-START-->[\s\S]*?<!--KMI:ORT-LINKS-END-->/, function() {
    return '<!--KMI:ORT-LINKS-START-->\n' + footer + '\n<!--KMI:ORT-LINKS-END-->';
  });
  html = html.replace(/<!--KMI:ORT-NOSCRIPT-START-->[\s\S]*?<!--KMI:ORT-NOSCRIPT-END-->/, function() {
    return '<!--KMI:ORT-NOSCRIPT-START-->\n' + noscript + '\n<!--KMI:ORT-NOSCRIPT-END-->';
  });

  if (html !== before) {
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('[seo] index.html: ' + orte.length + ' Ortsseiten-Links injiziert (Footer + noscript)');
  } else {
    console.warn('[seo] WARN: index.html ORT-Marker nicht gefunden - Links unveraendert');
  }
}

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
  // Die Prospects muessen JETZT schon dastehen: buildAvailableSlugs
  // entscheidet mit ihnen, welche Ortsseiten es geben wird, und jede
  // Prospect-Seite verlinkt darauf.
  let prospects = [];
  try {
    prospects = loadProspects();
  } catch (e) {
    console.warn('[seo] WARN: prospects.json nicht lesbar -', e.message);
  }

  buildAvailableSlugs(restaurants, prospects);
  console.log('[seo] Verlinkbare Verzeichnis-Seiten:', AVAILABLE_SLUGS.size);

  // Verzeichnis-/Prospect-Seiten (Nicht-Partner) - unabhaengig von Supabase
  let prospectCount = 0, prospectDraft = 0;
  try {
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

  // Ortsseiten ueber ALLE Orte, fuer die es Daten gibt -- nicht nur die 28
  // aus CITIES. import-osm.js holt 45; die 19 dazwischen hatten bisher
  // keine Ortsseite, obwohl ihre Betriebe eine eigene Seite bekamen und im
  // Breadcrumb darauf zeigten.
  const alleOrte = ermittleOrte(restaurants, prospects);
  const ortsListe = [];
  let ortsseiten = 0, ortsseitenUebersprungen = 0;
  for (const city of alleOrte) {
    for (const lng of LANGS) {
      const result = generateCityOverview(city, restaurants, lng, prospects);
      if (result) {
        console.log('[seo] +', result.filename,
          '(' + result.count + ' Partner, ' + result.weitere + ' weitere)');
        generated.push(result);
        if (lng === 'de') {
          ortsseiten++;
          ortsListe.push({ slug: 'restaurants-' + city.slug, ort: city.name,
                           count: result.count, gesamt: result.count + result.weitere });
        }
      } else if (lng === 'de') {
        // Die Zahl steht im Log, damit die Untergrenze nach dem ersten
        // echten Build mit echten Zahlen nachjustiert werden kann.
        const w = prospectsImOrt(prospects, city).length;
        console.log('[seo] - restaurants-' + city.slug + ' uebersprungen (' + w + ' Betriebe, Untergrenze ' + MIN_EINTRAEGE + ')');
        ortsseitenUebersprungen++;
      }
    }
  }
  console.log('[seo] Ortsseiten:', ortsseiten, '· uebersprungen (zu duenn):', ortsseitenUebersprungen,
              '· Orte gesamt:', alleOrte.length);

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

  try {
    injectHomepageCityLinks(ortsListe);
  } catch (e) {
    console.warn('[seo] WARN: injectHomepageCityLinks failed -', e.message);
  }

  // Die Seite fuer Gastronomen. Eine einzige, deutsch, ohne Betriebsdaten --
  // sie muss deshalb nicht in die Schleifen oben.
  const gastro = generateGastroPage();
  console.log('[seo] +', gastro.filename, '(Seite fuer Gastronomen)');
  generated.push(gastro);

  writeSitemap(generated);
  writeRobots();
  console.log('[seo] + sitemap.xml (' + (generated.length + 1) + ' urls)');
  console.log('[seo] + robots.txt (KI-Crawler ausdruecklich erlaubt)');
  try {
    LLMS_ORTE = alleOrte;
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
    // Die Ortsseite war bisher von keinem Test erreichbar -- sie stand
    // nicht in den Exporten, obwohl sie 28 Seiten erzeugt.
    generateCityOverview: generateCityOverview,
    // Die Regionen-Uebersicht war wie die Ortsseite in keinem Export --
    // eine Gegenprobe an ihrem englischen Text blieb deshalb gruen.
    generateCategoryOverview: generateCategoryOverview,
    generateProspectPage: generateProspectPage,
    injectHomepageCityLinks: injectHomepageCityLinks,
    buildAvailableSlugs: buildAvailableSlugs,
    slugExists: slugExists,
    ermittleOrte: ermittleOrte,
    ortSlug: ortSlug,
    ortLohntSeite: ortLohntSeite,
    prospectSlug: prospectSlug,
    generateGastroPage,
  gastroLeistungen,
  buildGastroFaqs,
  einstiegSatz,
  preisProTag,
  preisProTagEcht,
  EINSTEIGER_PLAETZE,
  PREIS_MONAT_SPAETER,
  PREIS_UST,
  PREIS_UST_KURZ,
  GASTRO_SLUG,
  PROSPECT_OWNER_CTA_URL,
  gerichteZahl,
  betriebeZahl,
  MIN_EINTRAEGE: MIN_EINTRAEGE,
    writeLlmsTxt: writeLlmsTxt,
    writeSitemap: writeSitemap,
    writeRobots: writeRobots,
    CITIES: CITIES,
    CATEGORIES: CATEGORIES
  };
}
