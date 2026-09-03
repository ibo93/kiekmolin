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
const dns = require('dns');

// Node bevorzugt seit Version 18 IPv6. Auf vielen Anschluessen ist IPv6 zwar
// eingeschaltet, aber nicht wirklich nutzbar - dann scheitert jede Verbindung
// mit einem nichtssagenden "fetch failed", waehrend der Browser klaglos
// funktioniert (der faellt von selbst auf IPv4 zurueck). Diese Zeile macht
// dasselbe. Bei funktionierendem IPv6 aendert sie nichts.
try { dns.setDefaultResultOrder('ipv4first'); } catch (_e) { /* aeltere Node-Version */ }

// "fetch failed" ist die Standardmeldung von Node und sagt gar nichts. Der
// eigentliche Grund steckt eine Ebene tiefer in error.cause - ohne den sucht
// man im Dunkeln, ob es die Leitung, der Name, die Sperre oder das Zertifikat war.
function fehlerGrund(e) {
  const teile = [e && e.message ? e.message : String(e)];
  const c = e && e.cause;
  if (c) {
    const code = c.code || (c.cause && c.cause.code) || '';
    const text = c.message || '';
    if (code) teile.push(code);
    else if (text && text !== teile[0]) teile.push(text);
  }
  return teile.join(' / ');
}

// Klartext zu den Codes, die in der Praxis vorkommen. Wer nicht taeglich mit
// Netzwerken zu tun hat, kann mit "ENOTFOUND" nichts anfangen.
const GRUND_KLARTEXT = [
  ['ENOTFOUND',    'Der Servername liess sich nicht aufloesen. Meist: keine Internetverbindung, ein DNS-Filter (Pi-hole, AdGuard, NextDNS) oder ein VPN blockt.'],
  ['EAI_AGAIN',    'Die Namensaufloesung hat keine Antwort bekommen - typisch fuer WLAN ohne Internet oder einen ueberlasteten DNS-Server.'],
  ['ECONNREFUSED', 'Die Verbindung wurde abgelehnt. Meist ein Proxy oder eine Firewall.'],
  ['ETIMEDOUT',    'Zeitueberschreitung - der Server antwortet nicht oder etwas dazwischen schluckt die Anfrage.'],
  ['ECONNRESET',   'Die Verbindung wurde unterwegs gekappt - typisch fuer VPN oder Firewall.'],
  ['CERT_',        'Das TLS-Zertifikat wurde abgelehnt. Meist ein Virenscanner oder Firmen-Proxy, der den Verkehr aufbricht.'],
  ['UNABLE_TO_',   'Das TLS-Zertifikat liess sich nicht pruefen. Meist ein Virenscanner oder Firmen-Proxy.']
];

function grundErklaeren(text) {
  for (const [code, erklaerung] of GRUND_KLARTEXT) {
    if (String(text).includes(code)) return erklaerung;
  }
  return null;
}

const OUT_FILE = path.join(__dirname, 'prospects.json');
// Mehrere Overpass-Server. Der Hauptserver ist ein kostenloses Gemeinschafts-
// projekt und regelmaessig ueberlastet (HTTP 429/504) - dann uebernimmt der
// naechste. Mit nur einem Server scheiterte der ganze Import an schlechtem Timing.
const OVERPASS_SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter'
];

// Welcher Server hat zuletzt geantwortet? Ohne dieses Gedaechtnis liefe der
// Importer bei JEDEM der 45 Gebiete erst wieder gegen den toten ersten Server
// und wartet, bevor er den funktionierenden nimmt - das summiert sich auf
// Minuten reiner Wartezeit fuer nichts.
let bevorzugterServer = 0;

function serverReihenfolge() {
  const liste = OVERPASS_SERVER.slice();
  const gut = liste.splice(bevorzugterServer, 1);
  return gut.concat(liste);
}

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

// Ein Gebiet holen. Klappt ein Server nicht, wird der naechste probiert -
// erst wenn ALLE nicht koennen, gilt das Gebiet als gescheitert.
async function fetchCity(city) {
  const body = 'data=' + encodeURIComponent(buildQuery(city));
  let letzterFehler = null;
  for (const server of serverReihenfolge()) {
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'KiekMolIn-Importer/1.0 (kiekmolin.de)'
        },
        signal: AbortSignal.timeout(90000),
        body: body
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (_e) {
        // Overpass antwortet bei Ueberlast mit HTML/Klartext statt JSON.
        // Den Anfang mitgeben - sonst raetselt man ewig, was los war.
        throw new Error('Keine JSON-Antwort: ' + text.slice(0, 120).replace(/\s+/g, ' '));
      }
      bevorzugterServer = OVERPASS_SERVER.indexOf(server);
      return Array.isArray(json.elements) ? json.elements : [];
    } catch (e) {
      letzterFehler = e;
      // Kurz warten, dann naechster Server
      await new Promise(function(r) { setTimeout(r, 2000); });
    }
  }
  throw new Error(letzterFehler ? fehlerGrund(letzterFehler) : 'Unbekannter Fehler');
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

// Vorab-Test: kommen wir ueberhaupt an einen Overpass-Server heran? Ohne den
// laeuft der Importer sechs Minuten lang in 45 identische Fehler und man weiss
// hinterher trotzdem nicht, woran es lag.
async function erreichbarkeitPruefen() {
  const probleme = [];
  for (const server of OVERPASS_SERVER) {
    const name = server.replace(/^https?:\/\//, '').split('/')[0];
    try {
      const res = await fetch(server.replace('/interpreter', '/status'), {
        headers: { 'User-Agent': 'KiekMolIn-Importer/1.0 (kiekmolin.de)' },
        signal: AbortSignal.timeout(20000)
      });
      // 403 heisst NICHT "erreichbar": Overpass selbst antwortet so nicht.
      // Wer ein 403 bekommt, sitzt hinter einem Proxy oder einer Sperre, die
      // die Anfrage abfaengt - und genau dann scheitern nachher alle 45
      // Gebiete. Lieber hier abbrechen als sechs Minuten ins Leere laufen.
      if (res.status === 403 || res.status === 407) {
        console.log('[osm] Verbindung zu ' + name + ': abgewiesen (HTTP ' + res.status + ')');
        probleme.push('HTTP ' + res.status + ' - abgewiesen');
        continue;
      }
      // Ein 400er dagegen ist in Ordnung: der Server ist da und redet mit uns.
      // Diesen merken wir uns - er wird ab jetzt zuerst gefragt.
      bevorzugterServer = OVERPASS_SERVER.indexOf(server);
      console.log('[osm] Verbindung zu ' + name + ': erreichbar (HTTP ' + res.status + ')' +
        (bevorzugterServer > 0 ? ' - wird ab jetzt zuerst gefragt' : ''));
      return true;
    } catch (e) {
      const grund = fehlerGrund(e);
      console.log('[osm] Verbindung zu ' + name + ': FEHLER - ' + grund);
      probleme.push(grund);
    }
  }
  console.log('');
  console.log('[osm] ABBRUCH: kein einziger Overpass-Server ist erreichbar.');
  const zusammen = probleme.join(' ');
  const erklaerung = grundErklaeren(zusammen);
  if (erklaerung) console.log('[osm] ' + erklaerung);
  else if (/403|407/.test(zusammen)) {
    console.log('[osm] Die Anfragen werden abgewiesen. Meist ein Proxy, ein VPN, ' +
      'ein Virenscanner mit Web-Schutz oder ein Firmen-/Gastnetz. Zum Test: VPN aus, ' +
      'oder ueber einen anderen Anschluss (Handy-Hotspot) versuchen.');
  }
  console.log('[osm] Zum Nachpruefen im Terminal:');
  console.log('[osm]   curl -sS -m 20 https://overpass-api.de/api/status');
  console.log('[osm] Klappt curl, aber dieses Skript nicht, liegt es an Node - dann melden.');
  console.log('[osm] prospects.json bleibt unveraendert.');
  return false;
}

async function main() {
  console.log('[osm] OSM-Importer fuer', CITIES.length, 'Staedte');

  if (!(await erreichbarkeitPruefen())) { process.exitCode = 2; return; }

  const existing = loadExisting();
  // Manuell gepflegte Eintraege (nicht aus OSM) bleiben erhalten; OSM-Daten
  // werden bei jedem Lauf frisch geholt, damit Adresse/Telefon aktuell sind.
  const keep = existing.filter(function(p) { return p && p.source !== 'osm'; });
  const keepSlugs = new Set(keep.map(function(p) { return slugFor(p.name, p.city); }));
  console.log('[osm]', keep.length, 'manuell gepflegte Eintraege bleiben erhalten.');

  const seen = new Set(keepSlugs);
  const imported = [];
  const gescheitert = [];

  /* Gesamt-Zeitlimit. Bisher hatte nur die EINZELNE Abfrage eine Grenze
     (90 Sekunden), der Lauf als Ganzes nicht. Bei 45 Gebieten sind das im
     schlechtesten Fall ueber eine Stunde - und genau daran ist der
     Netlify-Bau am 02.09.2026 gescheitert ("Command did not finish within
     the time limit"). Die Seite blieb dann auf dem alten Stand stehen,
     ohne dass jemand es merkte.

     Nach dieser Zeit wird abgebrochen und mit dem gearbeitet, was schon da
     ist. Ein paar Betriebe weniger sind besser als eine Seite, die gar
     nicht neu gebaut wird. Ueber OSM_ZEITLIMIT_S anpassbar. */
  const ZEITLIMIT_MS = (parseInt(process.env.OSM_ZEITLIMIT_S || '420', 10) || 420) * 1000;
  const beginn = Date.now();
  let abgebrochen = false;

  for (const city of CITIES) {
    if (Date.now() - beginn > ZEITLIMIT_MS) {
      abgebrochen = true;
      console.log('[osm] Zeitlimit von ' + Math.round(ZEITLIMIT_MS / 1000) + 's erreicht - '
        + 'die restlichen Gebiete bleiben beim letzten Stand.');
      break;
    }
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
      // Auf stdout, nicht stderr: die Agentur-App liest den Verlauf mit und
      // soll den Fehler anzeigen koennen, statt ihn zu verschlucken.
      console.log('FEHLER - ' + e.message);
      gescheitert.push(city.name + ': ' + e.message);
    }
    // Overpass-Etikette: kurze Pause zwischen Anfragen
    await new Promise(function(r) { setTimeout(r, 1500); });
  }

  // WICHTIG: Ist gar nichts angekommen, wird prospects.json NICHT angefasst.
  // Vorher wurde in diesem Fall die alte Liste einfach zurueckgeschrieben und
  // der Import meldete "fertig" - man sass davor, klickte immer wieder und
  // sah nie, dass in Wahrheit jede einzelne Abfrage gescheitert war.
  if (!imported.length) {
    console.log('[osm] ABBRUCH: kein einziger Betrieb geholt - prospects.json bleibt unveraendert.');
    if (gescheitert.length) {
      console.log('[osm] Gescheiterte Gebiete (' + gescheitert.length + ' von ' + CITIES.length + '):');
      gescheitert.slice(0, 5).forEach(function(z) { console.log('[osm]   ' + z); });
      console.log('[osm] Haeufigste Ursachen: keine Internetverbindung, Overpass ueberlastet ' +
        '(dann spaeter nochmal), oder eine Firewall blockt overpass-api.de.');
    }
    process.exitCode = 2;
    return;
  }

  let out = keep.concat(imported);

  /* Beim Zeitlimit wurden nicht alle Gebiete abgefragt. Wuerde jetzt nur das
     Geholte geschrieben, verschwaenden alle Betriebe der uebersprungenen
     Gebiete aus der Datei - beim Test blieben von 1643 noch 221 uebrig.
     Also: alles behalten, was vorher schon dastand und diesmal nicht
     wiedergekommen ist. Die Meldung "bleiben beim letzten Stand" soll auch
     stimmen. */
  if (abgebrochen) {
    let vorher = [];
    try {
      vorher = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      if (!Array.isArray(vorher)) vorher = [];
    } catch (_e) { vorher = []; }

    const bekannt = new Set(out.map(function (p) { return slugFor(p.name, p.city); }));
    let uebernommen = 0;
    for (const alt of vorher) {
      const slug = slugFor(alt && alt.name, alt && alt.city);
      if (!slug || bekannt.has(slug)) continue;
      bekannt.add(slug);
      out.push(alt);
      uebernommen++;
    }
    if (uebernommen) {
      console.log('[osm] ' + uebernommen + ' Betriebe aus dem letzten Lauf uebernommen '
        + '(Gebiete, die diesmal nicht mehr drankamen).');
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  if (gescheitert.length) {
    console.log('[osm] WARNUNG: ' + gescheitert.length + ' von ' + CITIES.length +
      ' Gebieten sind gescheitert - diese Betriebe fehlen. Import spaeter wiederholen.');
  }
  console.log('[osm] Quelle: (c) OpenStreetMap-Mitwirkende (ODbL).');
  /* Die Zahl der frisch geholten sagt nach einem Abbruch wenig - entscheidend
     ist, was am Ende in der Datei steht. Sonst liest man "130 Betriebe" und
     denkt, 1500 seien verloren. */
  console.log('[osm] Fertig: ' + out.length + ' Betriebe in prospects.json'
    + ' (' + imported.length + ' diesmal geholt aus '
    + (abgebrochen ? 'einem Teil der ' : (CITIES.length - gescheitert.length) + ' von ')
    + CITIES.length + ' Gebieten, ' + keep.length + ' von Hand gepflegt'
    + (abgebrochen ? ', Rest vom letzten Lauf' : '') + ').');
}

main().catch(function(err) {
  console.error('[osm] FATAL:', err && err.message ? err.message : err);
  process.exit(1);
});
