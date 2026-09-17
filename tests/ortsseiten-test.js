// ORTSSEITEN -- "Restaurants in <Ort>".
//
// WARUM ES DIESEN TEST GIBT
// generateCityOverview erzeugt seit Monaten Seiten und stand in KEINEM
// Export -- kein Test konnte sie auch nur aufrufen. Am 17.09.2026 kam dazu:
//
//   - die 902 Betriebsseiten hingen nur in der Sitemap, auf den Ortsseiten
//     standen sie nicht
//   - import-osm.js holt 45 Orte, CITIES kennt 28. Fuer die 19 dazwischen
//     schrieb die Betriebsseite einen Breadcrumb auf /restaurants-<ort>,
//     den es nicht gab -> Status 200 mit dem Inhalt der Startseite
//   - die Startseite hatte 5 interne Links
//
// Dieser Test LAEUFT den Generator, er liest ihn nicht. Ein Textvergleich
// haette keinen der drei Punkte gesehen.

var fs   = require('fs');
var os   = require('os');
var path = require('path');

var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-orte-'));
process.env.SEO_OUT_DIR = AUS;
var G = require(path.join(__dirname, '..', 'build-seo-pages.js'));

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}
// Fehlt die Datei, kommt LEERER Text zurueck -- kein Absturz.
//
// Beim Gegenpruefen ist genau das passiert: eine Gegenprobe nahm die
// weiteren Betriebe weg, damit entfiel die Ortsseite von Wilhelmshaven,
// und der Test starb an readFileSync statt rot zu werden. Ein Absturz
// beweist nichts ueber eine Zusicherung. Dass die Seite ueberhaupt da ist,
// pruefen eigene Zusicherungen weiter unten.
function lies(datei) {
    try { return fs.readFileSync(path.join(AUS, datei), 'utf8'); }
    catch (e) { return ''; }
}
function da(datei)   { return fs.existsSync(path.join(AUS, datei)); }

// ---- Die Welt: drei Orte, drei verschiedene Faelle -------------------
var PARTNER = [
    { id:'1', slug:'lapiazza', name:'La Piazza', city:'Greetsiel', cuisine:'Pizza',
      street:'Hafenstr. 1', zip:'26736', rating:4.6, rating_count:12 },
    // Sterne ohne eine einzige Bewertung -- darf NIRGENDS auftauchen.
    { id:'2', slug:'boerse', name:'Greetsieler Börse', city:'Greetsiel', cuisine:'Fisch',
      street:'Am Hafen 2', zip:'26736', rating:4.9, rating_count:0 }
];
var PROSPECTS = [
    { name:'Zum Alten Hafen', city:'Greetsiel', street:'Hafenstr. 3', zip:'26736', phone:'04926 111' },
    { name:'Café Mühle',      city:'Greetsiel', street:'Mühlenweg 1', zip:'26736' },
    { name:'Imbiss Deich',    city:'Greetsiel', street:'Deichstr. 9', zip:'26736', phone:'04926 222' },
    { name:'Geheim GmbH',     city:'Greetsiel', street:'Weg 1', zip:'26736', draft:true }
];
// Wilhelmshaven: KEIN Partner, 5 weitere. Steht nicht in CITIES.
['Nordsee Grill','Pizzeria Roma','Bistro Jade','Kebap Haus','Eiscafé Venezia'].forEach(function (n, i) {
    PROSPECTS.push({ name:n, city:'Wilhelmshaven', street:'Teststr. '+(i+1), zip:'26382', phone:'04421 '+(100+i) });
});
// Hinte: 2 Betriebe -> zu duenn, bekommt KEINE Seite.
PROSPECTS.push({ name:'Krug',  city:'Hinte', street:'Dorfstr. 1', zip:'26759' });
PROSPECTS.push({ name:'Deele', city:'Hinte', street:'Dorfstr. 2', zip:'26759' });

G.buildAvailableSlugs(PARTNER, PROSPECTS);
var ORTE = G.ermittleOrte(PARTNER, PROSPECTS);
function ort(name) { return ORTE.find(function (c) { return c.name === name; }); }

var gebaut = {};
ORTE.forEach(function (c) {
    var r = G.generateCityOverview(c, PARTNER, 'de', PROSPECTS);
    if (r) gebaut[c.name] = r;
});

console.log('\n-- 1. WELCHE ORTE BEKOMMEN EINE SEITE --');

t('Ort mit Partnern bekommt eine Seite', !!gebaut['Greetsiel']);
t('und sie heisst restaurants-<ort>.html',
  gebaut['Greetsiel'] && gebaut['Greetsiel'].filename === 'restaurants-greetsiel.html',
  gebaut['Greetsiel'] && gebaut['Greetsiel'].filename);

// DER PUNKT, DER 19 ORTE BETRIFFT.
t('Ort NUR aus den Daten (nicht in CITIES) bekommt eine Seite', !!gebaut['Wilhelmshaven']);
t('Wilhelmshaven war vorher in CITIES gar nicht drin',
  G.CITIES.every(function (c) { return c.name !== 'Wilhelmshaven'; }));

// DIE UNTERGRENZE.
t('Ort mit 2 Betrieben bekommt KEINE Seite', !gebaut['Hinte'], gebaut['Hinte']);
t('und die Datei liegt auch nicht da', !da('restaurants-hinte.html'));
t('Ort ganz ohne Daten bekommt keine Seite', !gebaut['Jever']);

t('die Untergrenze steht auf 4', G.MIN_EINTRAEGE === 4, G.MIN_EINTRAEGE);
t('3 Betriebe ohne Partner -> nein', G.ortLohntSeite(0, 3) === false);
t('4 Betriebe ohne Partner -> ja',   G.ortLohntSeite(0, 4) === true);
// PARTNER-ORTE IMMER -- so entschieden am 17.09.2026: die URL steht schon
// im Index, und dort wird ein zahlender Betrieb verlinkt.
t('1 Partner allein -> ja, trotz Untergrenze', G.ortLohntSeite(1, 0) === true);

console.log('\n-- 2. WAS AUF DER SEITE STEHT --');

var g = lies('restaurants-greetsiel.html');
t('Title nennt den Ort', /<title>Restaurants in Greetsiel/.test(g),
  (g.match(/<title>(.*?)<\/title>/)||[])[1]);
t('H1 ist "Restaurants in <Ort>"', /<h1[^>]*>Restaurants in Greetsiel<\/h1>/.test(g));
t('Canonical zeigt auf die Seite selbst',
  /rel="canonical" href="https:\/\/kiekmolin\.de\/restaurants-greetsiel"/.test(g));
t('Description nennt die Gesamtzahl',
  /content="5 Restaurants[^"]*Greetsiel/.test(g),
  (g.match(/name="description" content="(.*?)"/)||[])[1]);
t('Description bleibt unter 160 Zeichen',
  ((g.match(/name="description" content="(.*?)"/)||[])[1] || '').length <= 160,
  ((g.match(/name="description" content="(.*?)"/)||[])[1] || '').length);

t('Schema.org ItemList ist da', /"@type":"ItemList"/.test(g));
t('die ItemList enthaelt Partner UND weitere Betriebe',
  /"name":"La Piazza"/.test(g) && /"name":"Zum Alten Hafen"/.test(g));
t('BreadcrumbList ist da', /"@type":"BreadcrumbList"/.test(g));

console.log('\n-- 3. PARTNER ZUERST UND ABGESETZT --');

var iPartner = g.indexOf('Online bestellen in Greetsiel');
var iWeitere = g.indexOf('Weitere Betriebe in Greetsiel');
t('beide Bloecke sind da', iPartner > 0 && iWeitere > 0, iPartner + ' / ' + iWeitere);
t('die Partner stehen VOR den uebrigen', iPartner < iWeitere, iPartner + ' < ' + iWeitere);
t('La Piazza steht vor Zum Alten Hafen',
  g.indexOf('La Piazza') < g.indexOf('Zum Alten Hafen'));
t('die uebrigen stehen in einem eigenen Abschnitt', /<section class="weitere">/.test(g));
t('und es steht dabei, dass sie nicht dabei sind',
  /Diese Betriebe sind nicht bei Kiek mol in/.test(g));
t('sie bekommen KEINE Partner-Kachel',
  (g.match(/<article class="card"/g) || []).length === 2,
  (g.match(/<article class="card"/g) || []).length);
t('und kein "Speisekarte ansehen" fuer einen Nicht-Partner',
  g.indexOf('Zum Alten Hafen') > 0 &&
  g.slice(g.indexOf('Zum Alten Hafen'), g.indexOf('Zum Alten Hafen') + 300).indexOf('Speisekarte ansehen') < 0);

console.log('\n-- 4. KEINE ERFUNDENEN STERNE --');
//
// Dieselbe Regel wie in buildRestaurantJsonLd: ein rating ohne eine
// einzige Bewertung ist keine Bewertung. Die Boerse hat 4.9 und 0
// Bewertungen -- die 4.9 darf nirgends stehen.
t('Bewertung nur mit echten Bewertungen dahinter',
  (g.match(/aggregateRating/g) || []).length === 2,
  (g.match(/aggregateRating/g) || []).length);
t('die erfundene 4,9 der Boerse steht nirgends', g.indexOf('4,9') < 0 && g.indexOf('4.9') < 0);
t('die echte 4,6 von La Piazza steht da', g.indexOf('4,6') > 0);

// DIE ZUSICHERUNG, DIE BEIM GEGENPRUEFEN GEFEHLT HAT.
//
// Die Empfehlungs-FAQ behauptete "Alle mit aktueller Speisekarte, echten
// Gaeste-Bewertungen und ...". Ich habe den Satz repariert -- und meine
// Gegenprobe (hatBewertungen fest auf true) blieb GRUEN, weil ihn nichts
// geprueft hat. Ein Satz ueber Bewertungen ist dieselbe Behauptung wie
// eine Sternezahl, nur in Prosa.
var faqEmpf = (g.match(/<summary>Welche Restaurants[^<]*<\/summary><p>([^<]*)<\/p>/) || [])[1] || '';
t('die Empfehlungs-FAQ ist ueberhaupt da', faqEmpf.length > 0, faqEmpf);
t('sie nennt echte Bewertungen -- hier gibt es welche (La Piazza)',
  /echten Gäste-Bewertungen/.test(faqEmpf), faqEmpf);

// Und dieselbe Seite ohne eine einzige echte Bewertung: dann darf der
// Satz NICHT dastehen.
var nurOhne = [{ id:'9', slug:'ohne', name:'Ohne Bewertung', city:'Greetsiel',
                 cuisine:'Pizza', rating:4.9, rating_count:0 }];
G.generateCityOverview(ort('Greetsiel'), nurOhne, 'de', PROSPECTS);
var go = lies('restaurants-greetsiel.html');
var faqOhne = (go.match(/<summary>Welche Restaurants[^<]*<\/summary><p>([^<]*)<\/p>/) || [])[1] || '';
t('ohne echte Bewertungen behauptet die FAQ keine',
  faqOhne.length > 0 && !/Gäste-Bewertungen/.test(faqOhne), faqOhne);
t('und nennt auch keine Sternezahl', !/von 5 Sternen/.test(faqOhne), faqOhne);
// Seite wieder mit den richtigen Daten herstellen, die naechsten
// Zusicherungen lesen sie.
G.generateCityOverview(ort('Greetsiel'), PARTNER, 'de', PROSPECTS);
g = lies('restaurants-greetsiel.html');
t('kein Nicht-Partner bekommt eine Preisklasse',
  (g.match(/priceRange/g) || []).length === 2,
  (g.match(/priceRange/g) || []).length);

console.log('\n-- 5. KEIN AUFSATZ, KEINE ERFUNDENEN ORTSTEXTE --');
//
// buildIntro schreibt "<Ort> liegt mitten in Ostfriesland" -- fuer
// Wilhelmshaven und Varel ist das falsch. Eine Ortsseite ist eine Liste.
var w = lies('restaurants-wilhelmshaven.html');
t('kein "liegt mitten in Ostfriesland"', !/liegt mitten in/.test(w));
t('keine erfundene Kuestenprosa', !/Krabbenbr/.test(w) && !/malerischsten/.test(w));
t('keine Superlative in der Ueberschrift',
  !/Die (schoensten|besten|schönsten)/.test(w.match(/<h1[\s\S]*?<\/h1>/) || ''));
t('der Vorspann ist kurz', (w.match(/<div class="intro">([\s\S]*?)<\/div>/)||['',''])[1].length < 400,
  (w.match(/<div class="intro">([\s\S]*?)<\/div>/)||['',''])[1].length);

console.log('\n-- 6. EIN ORT OHNE PARTNER LUEGT NICHT --');
//
// Der Title stand fest auf "online bestellen & reservieren". In einem Ort
// ohne einen einzigen Partner ist das die Google-Zeile, auf die jemand
// klickt -- und dann findet er Telefonnummern.
t('Title verspricht keine Bestellung', !/online bestellen/.test((w.match(/<title>(.*?)<\/title>/)||[])[1]),
  (w.match(/<title>(.*?)<\/title>/)||[])[1]);
t('Title sagt, was es wirklich gibt',
  /Adressen &amp; Telefonnummern/.test((w.match(/<title>(.*?)<\/title>/)||[])[1]),
  (w.match(/<title>(.*?)<\/title>/)||[])[1]);
t('der Vorspann sagt es auch', /noch keiner bei Kiek mol in/.test(w));
t('die FAQ sagt es ebenfalls', /Noch nicht\./.test(w));
t('und verspricht KEINE Tischreservierung',
  !/viele[^<]*bieten online Tisch-Reservierung/.test(w));
t('kein "keine passenden Restaurants gelistet" ueber 5 Betrieben',
  !/keine passenden Restaurants gelistet/.test(w));
t('die 5 Betriebe stehen wirklich drauf',
  (w.match(/<li class="weitere-zeile">/g) || []).length === 5,
  (w.match(/<li class="weitere-zeile">/g) || []).length);

console.log('\n-- 7. ENTWUERFE BLEIBEN DRAUSSEN --');
// Ihre eigene Seite traegt noindex -- dann darf hier auch kein Link hin.
t('ein Entwurf steht nicht in der Liste', g.indexOf('Geheim GmbH') < 0);
t('und nicht im Schema', g.indexOf('Geheim') < 0);

console.log('\n-- 8. DER BREADCRUMB ZEIGT NUR AUF ECHTE SEITEN --');
//
// DER FEHLER VOM 17.09.2026, gemessen: die Betriebsseite in Wilhelmshaven
// schrieb einen Breadcrumb auf /restaurants-wilhelmshaven, und diese Seite
// gab es nicht. Der Catch-All macht daraus Status 200 mit dem Inhalt der
// Startseite -- ein Soft-404 in strukturierten Daten.
function breadcrumbZiel(prospect) {
    var r = G.generateProspectPage(prospect, [], PROSPECTS);
    var h = lies(r.filename);
    var m = h.match(/"item":"(https:\/\/kiekmolin\.de\/restaurants-[^"]*)"/);
    return m ? m[1].replace('https://kiekmolin.de/', '') : null;
}
var zielWhv = breadcrumbZiel(PROSPECTS.find(function (p) { return p.city === 'Wilhelmshaven'; }));
t('Betrieb in Wilhelmshaven zeigt auf seine Ortsseite', zielWhv === 'restaurants-wilhelmshaven', zielWhv);
t('und die Datei gibt es wirklich', da(zielWhv + '.html'));

var zielHinte = breadcrumbZiel(PROSPECTS.find(function (p) { return p.city === 'Hinte'; }));
t('Betrieb in Hinte (keine Ortsseite) zeigt auf GAR NICHTS', zielHinte === null, zielHinte);

t('beide Seiten rechnen denselben Ortsslug',
  G.ortSlug('Wilhelmshaven') === 'wilhelmshaven' && G.ortSlug('Greetsiel') === 'greetsiel');
t('und Umlaute werden dabei nicht verschluckt', G.ortSlug('Krummhörn') === 'krummhoern',
  G.ortSlug('Krummhörn'));

console.log('\n-- 9. DIE STARTSEITE VERLINKT DIE ORTSSEITEN --');
//
// Gemessen am 17.09.2026: 5 interne Links, alle auf Partnerseiten. Im
// Footer standen die Begriffe schon da -- als tote <span>.
var quelle = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
fs.writeFileSync(path.join(AUS, 'index.html'), quelle, 'utf8');
G.injectHomepageCityLinks([
    { slug:'restaurants-greetsiel',     ort:'Greetsiel',     count:2, gesamt:5 },
    { slug:'restaurants-wilhelmshaven', ort:'Wilhelmshaven', count:0, gesamt:5 }
]);
var idx = lies('index.html');
var block = (idx.match(/<!--KMI:ORT-LINKS-START-->([\s\S]*?)<!--KMI:ORT-LINKS-END-->/) || [])[1] || '';
t('die Marker sind in index.html vorhanden', block.length > 0);
t('beide Ortsseiten sind verlinkt',
  /href="\/restaurants-greetsiel"/.test(block) && /href="\/restaurants-wilhelmshaven"/.test(block));
t('die alten toten <span> sind weg', !/<span>Restaurant Greetsiel<\/span>/.test(idx));
t('auch der noscript-Block bekommt sie',
  /<li><a href="\/restaurants-greetsiel">/.test(idx));
t('im noscript steht die echte Zahl', /5 Betriebe, davon 2 mit Speisekarte/.test(idx));
t('ein Ort ohne Partner bekommt dort kein "davon"',
  /Restaurants in Wilhelmshaven<\/a> &ndash; 5 Betriebe<\/li>/.test(idx));

// NICHTS ueberschreiben, wenn nichts gebaut wurde -- sonst loescht ein
// Build ohne Daten die Links von der Startseite.
fs.writeFileSync(path.join(AUS, 'index.html'), quelle, 'utf8');
G.injectHomepageCityLinks([]);
t('leere Liste laesst die Startseite in Ruhe',
  lies('index.html') === quelle);

console.log('\n-- 10. VERLINKBARE SLUGS UND SITEMAP --');
var slugs = G.buildAvailableSlugs(PARTNER, PROSPECTS);
t('Greetsiel ist verlinkbar', slugs.has('restaurants-greetsiel'));
t('Wilhelmshaven ist verlinkbar', slugs.has('restaurants-wilhelmshaven'));
t('Hinte ist NICHT verlinkbar -- die Seite gibt es nicht',
  !slugs.has('restaurants-hinte'));

G.writeSitemap([
    { url:'https://kiekmolin.de/restaurants-greetsiel', count:5 },
    { url:'https://kiekmolin.de/restaurants-wilhelmshaven', count:5 }
]);
var sm = lies('sitemap.xml');
t('die Ortsseiten stehen in der sitemap.xml',
  /<loc>https:\/\/kiekmolin\.de\/restaurants-greetsiel<\/loc>/.test(sm) &&
  /<loc>https:\/\/kiekmolin\.de\/restaurants-wilhelmshaven<\/loc>/.test(sm));

try { fs.rmSync(AUS, { recursive: true, force: true }); } catch (e) {}

console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
