// FOTOS DER GERICHTE ALS ECHTE BILDDATEIEN (23.10.2026)
//
// Gemessen: das Dashboard speichert Fotos als Text (data:image/...;base64)
// in der Datenbank. Dieser Text stand bisher unveraendert im Speisekarten-
// Schema der Restaurantseite -- fuer Google ungueltig, nie in der
// Bildersuche, und die Seite wurde schwer (Taverna rund 80 KB je Abruf).
//
// Dieser Test baut Seiten mit solchen Fotos und liest das Ergebnis.

var fs   = require('fs');
var os   = require('os');
var path = require('path');

var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-bilder-'));
process.env.SEO_OUT_DIR = AUS;
var G = require(path.join(__dirname, '..', 'build-seo-pages.js'));

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}
function lies(d) { try { return fs.readFileSync(path.join(AUS, d), 'utf8'); } catch (e) { return ''; } }
function daten(bytes, art) { return 'data:image/' + (art || 'jpeg') + ';base64,' + Buffer.from(bytes).toString('base64'); }

var FOTO = daten('jpeg-bytes-margherita');
var REST = { id:'r1', slug:'la-piazza-greetsiel', name:'La Piazza', city:'Greetsiel', cuisine:'Pizza',
             street:'Am Markt 10', zip:'26736', image_url: daten('titelbild-bytes'), logo_url: daten('logo-bytes', 'png') };
var KARTE = [
    { name:'Pizza Margherita', base_price:9.5, image_url: FOTO, menu_categories:{ name:'Pizza' } },
    // dasselbe Foto bei einem zweiten Gericht -> nur EINE Datei je Bild
    { name:'Pizza Margherita gross', base_price:12, image_url: FOTO, menu_categories:{ name:'Pizza' } },
    { name:'Diavola', base_price:11, image_url:'https://cdn.example.de/diavola.jpg', menu_categories:{ name:'Pizza' } },
    // SVG kann Skript enthalten -> faellt weg
    { name:'Calzone', base_price:11, image_url: daten('<svg onload="alert(1)"></svg>', 'svg+xml'), menu_categories:{ name:'Pizza' } },
    { name:'Kaputt', base_price:1, image_url:'data:image/jpeg;base64,', menu_categories:{ name:'Pizza' } },
    { name:'Ohne Bild', base_price:3, menu_categories:{ name:'Pizza' } }
];

var erg = G.generateRestaurantPage(REST, KARTE, []);
var html = lies('la-piazza-greetsiel.html');
G.buildAvailableSlugs([REST], []);
G.generateCityCategoryPage(G.CITIES.find(function (c) { return c.name === 'Greetsiel'; }),
    G.CATEGORIES.find(function (c) { return c.slug === 'pizzeria'; }), [REST], 'de', [], { r1: KARTE });
var liste = lies('pizzeria-greetsiel.html');

console.log('\n-- 1. KEIN BILD-TEXT MEHR IN DER SEITE --');
t('Restaurantseite enthaelt kein data:image', html.indexOf('data:image') < 0, (html.match(/data:image[^"]{0,40}/) || [''])[0]);
t('Seite fuer Ort und Art enthaelt kein data:image', liste.indexOf('data:image') < 0);

console.log('\n-- 2. DIE FOTOS SIND ECHTE DATEIEN --');
var ordner = path.join(AUS, 'bilder', 'la-piazza-greetsiel');
var dateien = fs.existsSync(ordner) ? fs.readdirSync(ordner) : [];
var margherita = dateien.filter(function (f) { return /^pizza-margherita-[0-9a-f]{10}\.jpg$/.test(f); });
t('Foto liegt als Datei unter /bilder/<haus>/', margherita.length === 1, dateien.join(', '));
t('und hat genau den Inhalt aus der Datenbank',
  margherita.length === 1 && fs.readFileSync(path.join(ordner, margherita[0]), 'utf8') === 'jpeg-bytes-margherita');
t('dasselbe Foto zweimal -> eine Datei', dateien.filter(function (f) { return /^pizza-margherita/.test(f); }).length === 1, dateien.join(', '));
t('SVG wird nie geschrieben', !dateien.some(function (f) { return /svg/.test(f); }) && html.indexOf('onload') < 0);

console.log('\n-- 3. WAS GOOGLE SIEHT --');
var url = 'https://kiekmolin.de/bilder/la-piazza-greetsiel/' + margherita[0];
t('<img> mit beschreibendem alt in der Speisekarte',
  html.indexOf('<img src="' + url + '" alt="Pizza Margherita – La Piazza, Greetsiel"') >= 0, (html.match(/<img [^>]*>/) || [''])[0]);
t('mit fester Groesse und lazy', /<img [^>]*width="72" height="72" loading="lazy"/.test(html));
t('im Speisekarten-Schema steht die Datei-Adresse', html.indexOf('"image":"' + url + '"') >= 0);
t('ein Foto mit Adresse bleibt, wie es ist', html.indexOf('https://cdn.example.de/diavola.jpg') >= 0);
t('Titelbild des Hauses als og:image (Datei, nicht Text)',
  /<meta property="og:image" content="https:\/\/kiekmolin\.de\/bilder\/la-piazza-greetsiel\/titel-[0-9a-f]{10}\.jpg">/.test(html));
t('Logo als Datei im Restaurant-Schema', /"logo":"https:\/\/kiekmolin\.de\/bilder\/la-piazza-greetsiel\/logo-[0-9a-f]{10}\.png"/.test(html));

// Ibo: "die Logos oder Bilder vom Restaurant werden nicht gefunden".
// Ein CSS-Hintergrund steht nie in der Bildersuche -- es muss <img> sein.
t('Titelbild als <img> mit alt "La Piazza in Greetsiel"',
  /<img class="bg" src="https:\/\/kiekmolin\.de\/bilder\/la-piazza-greetsiel\/titel-[0-9a-f]{10}\.jpg" alt="La Piazza in Greetsiel"/.test(html));
t('kein Titelbild mehr als CSS-Hintergrund', !/class="bg" style="background-image/.test(html));
t('Logo als <img> mit alt "Logo von La Piazza, Greetsiel"',
  /<img src="https:\/\/kiekmolin\.de\/bilder\/la-piazza-greetsiel\/logo-[0-9a-f]{10}\.png" alt="Logo von La Piazza, Greetsiel"/.test(html));

console.log('\n-- 4. BILD-SITEMAP --');
t('Ergebnis nennt Titelbild, Logo und die eigenen Fotos (ohne fremde Adressen, ohne doppelte)',
  erg && erg.bilder && erg.bilder.length === 3 && /\/titel-/.test(erg.bilder[0]) && /\/logo-/.test(erg.bilder[1]) && erg.bilder[2] === url, erg && JSON.stringify(erg.bilder));
G.writeSitemap([erg]);
var sm = lies('sitemap.xml');
t('sitemap.xml kennt die Bild-Erweiterung', /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/.test(sm));
t('und fuehrt das Foto bei der Restaurantseite', sm.indexOf('<image:image><image:loc>' + url + '</image:loc></image:image>') >= 0);
t('auch Titelbild und Logo', /<image:loc>https:\/\/kiekmolin\.de\/bilder\/la-piazza-greetsiel\/titel-/.test(sm) && /<image:loc>https:\/\/kiekmolin\.de\/bilder\/la-piazza-greetsiel\/logo-/.test(sm));

try { fs.rmSync(AUS, { recursive: true, force: true }); } catch (e) {}
console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
