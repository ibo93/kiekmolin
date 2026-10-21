// KUNDE NICHT DOPPELT ALS OSM-SEITE (21.10.2026)
//
// Ibo: "Taverna Jever ist auch Kunde". Google zeigte trotzdem die
// OpenStreetMap-Seite "Restaurant Taverna Jever – Adresse, Telefon &
// Oeffnungszeiten" ("ist Italian in Jever") -- import-osm.js holt ALLE
// Lokale, build-seo-pages.js baute fuer jedes eine Seite, ohne Abgleich mit
// den Kunden. Dieser Test ruft den Abgleich echt auf.
var path = require('path'), fs = require('fs');
var R = path.join(__dirname, '..');
var S = require(R + '/build-seo-pages.js');
var B = fs.readFileSync(R + '/build-seo-pages.js', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
var K = [{ slug: 'taverna-jever', name: 'Taverna Jever', city: 'Jever', phone: '04461 9009806' },
         { slug: 'luett-italia', name: 'Lütt Italia', city: 'Wittmund' },
         { slug: 'la-piazza-aurich', name: 'La Piazza', city: 'Aurich', lat: 53.47, lng: 7.48 }];
function k(name, city, mehr) { var r = S.kundeFuerProspect(Object.assign({ name: name, city: city }, mehr || {}), K); return r ? r.slug : null; }

t('"Restaurant Taverna" in Jever ist der Kunde "Taverna Jever"', k('Restaurant Taverna', 'Jever') === 'taverna-jever', k('Restaurant Taverna', 'Jever'));
t('Name nur aus allgemeinen Woertern: der Kern ist nicht leer', S.nameKern('Restaurant Taverna', 'Jever') === 'taverna', S.nameKern('Restaurant Taverna', 'Jever'));
t('gleiche Telefonnummer (+49-Schreibweise) = derselbe Betrieb', k('Haus Sowieso', 'Jever', { phone: '+49 4461 9009806' }) === 'taverna-jever', '');
t('"Luett Italia Wittmund GmbH" = "Luett Italia"', k('Lütt Italia Wittmund GmbH', 'Wittmund') === 'luett-italia', '');
console.log('\n-- keine Fehltreffer --');
t('anderer Ort, gleicher Name: KEIN Treffer ("Pizzeria Taverna" in Esens)', k('Pizzeria Taverna', 'Esens') === null, '');
t('ein gemeinsames Wort reicht nicht ("Cafe Luett" ist nicht "Luett Italia")', k('Café Lütt', 'Wittmund') === null, k('Café Lütt', 'Wittmund'));
t('Nachbar 15 m weiter ist NICHT der Kunde (Lage allein zaehlt nicht)', k('Il Gusto', 'Aurich', { lat: 53.4701, lng: 7.4801 }) === null, '');
t('"La Strada" ist nicht "La Piazza"', k('La Strada', 'Aurich') === null, '');
console.log('\n-- im Bau --');
t('Kunden werden aus der OSM-Liste genommen, BEVOR Seiten und Ortslisten entstehen',
  B.indexOf('const k = kundeFuerProspect(p, restaurants);') > 0 && B.indexOf('const k = kundeFuerProspect(p, restaurants);') < B.indexOf('buildAvailableSlugs(restaurants, prospects);'), '');
t('alte Adresse leitet per 301 auf die Kundenseite (auch mit .html)', /umleitungen\.push\('\/' \+ alt \+ ' \/' \+ k\.slug \+ ' 301'\)/.test(B) && /t\[0\] \+ '\.html ' \+ t\[1\] \+ ' 301'/.test(B), '');
t('_redirects: nur der eigene Block wird ersetzt, ganze Kommentarzeilen', /'# OSM-KUNDE ANFANG'/.test(B) && /alt\.slice\(0, i\) \+ alt\.slice\(j \+ E\.length\)/.test(B), '');
t('ohne Kundenliste (Supabase weg): Warnung statt still', /ohne Kundenliste kein Abgleich/.test(B), '');
console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
