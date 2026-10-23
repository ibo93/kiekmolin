// ORT x ART -- "Pizzerien in Greetsiel", "Döner in Wilhelmshaven".
//
// Ibo am 23.10.2026: "es muss nicht den Restaurantnamen suchen -- bei
// Begriffen wie Pizza, Pasta ... die Sichtbarkeit muss richtig gut sein."
//
// Gemessen vorher (Quelltext):
//   - diese Seiten gab es nur, wo ein PARTNER dieser Art sitzt
//   - auf ihnen standen nur Partner, meist einer
//   - kein einziges Gericht stand drauf
//
// Dieser Test LAEUFT den Generator mit einer kleinen Welt und liest die
// fertigen Seiten. Ob Google sie dann weiter oben zeigt, misst er nicht --
// das zeigt erst die Search Console (Suchen mit "pizza", "pasta").

var fs   = require('fs');
var os   = require('os');
var path = require('path');

var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-ortart-'));
process.env.SEO_OUT_DIR = AUS;
var G = require(path.join(__dirname, '..', 'build-seo-pages.js'));
var QUELLE = fs.readFileSync(path.join(__dirname, '..', 'build-seo-pages.js'), 'utf8');

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}
function lies(datei) { try { return fs.readFileSync(path.join(AUS, datei), 'utf8'); } catch (e) { return ''; } }
function da(datei) { return fs.existsSync(path.join(AUS, datei)); }
function meta(html, name) { var m = new RegExp('<meta name="' + name + '" content="([^"]*)"').exec(html); return m ? m[1] : ''; }
function titel(html) { var m = /<title>([^<]*)<\/title>/.exec(html); return m ? m[1] : ''; }
function sichtbar(html) { return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }

// ---- Die Welt ---------------------------------------------------------
var PARTNER = [
    { id:'p1', slug:'la-piazza-greetsiel', name:'La Piazza', city:'Greetsiel', cuisine:'Pizza',
      street:'Am Markt 10', zip:'26736', rating:4.6, rating_count:12 },
    // Partner ohne Karte: Seite ja, aber KEIN Gerichte-Abschnitt.
    { id:'p2', slug:'boerse', name:'Greetsieler Börse', city:'Greetsiel', cuisine:'Fisch',
      street:'Am Hafen 2', zip:'26736', rating:4.2, rating_count:3 }
];
var KARTEN = {
    p1: [
        { name:'Pizza Margherita', base_price:9.5, is_popular:true, menu_categories:{ name:'Pizza' } },
        { name:'Diavola', base_price:11, menu_categories:{ name:'Pizza' } },
        { name:'Spaghetti Bolognese', base_price:10.5, menu_categories:{ name:'Pasta' } },
        { name:'Tiramisu', base_price:5.5, menu_categories:{ name:'Dessert' } },
        { name:'Cola 0,33', base_price:2.5, menu_categories:{ name:'Getränke' } }
    ]
};
var PROSPECTS = [
    // Greetsiel: 3 weitere Pizzerien -> mit La Piazza 4
    { name:'Pizzeria Roma',  city:'Greetsiel', street:'Weg 1', zip:'26736', phone:'04926 1', category:'pizzeria' },
    { name:'Da Toni',        city:'Greetsiel', street:'Weg 2', zip:'26736', category:'pizzeria' },
    { name:'Pizzeria Sole',  city:'Greetsiel', street:'Weg 3', zip:'26736' },
    { name:'Zum Hafen',      city:'Greetsiel', street:'Weg 4', zip:'26736' },
    // Entwurf: darf NIRGENDS auftauchen
    { name:'Pizzeria Geheim', city:'Greetsiel', street:'Weg 5', zip:'26736', category:'pizzeria', draft:true }
];
// Wilhelmshaven: KEIN Partner. 4 Döner -> Seite. 3 Pizzerien -> zu duenn.
['Kebap Haus','Döner Palast','Istanbul Grill','Antalya Imbiss'].forEach(function (n, i) {
    PROSPECTS.push({ name:n, city:'Wilhelmshaven', street:'Str. '+i, zip:'26382', phone:'04421 '+i, category:'doener' });
});
['Pizzeria Uno','Pizzeria Due','Pizzeria Tre'].forEach(function (n, i) {
    PROSPECTS.push({ name:n, city:'Wilhelmshaven', street:'Allee '+i, zip:'26382', category:'pizzeria' });
});
// Emden: 4 Döner, und einer heisst schlicht "Döner" -> seine Seite ist
// /doener-emden. Die Art-Seite darf sie nicht ueberschreiben.
['Döner','Kebab Express','Mevlana Grill','Bosporus Imbiss'].forEach(function (n, i) {
    PROSPECTS.push({ name:n, city:'Emden', street:'Delft '+i, zip:'26721', phone:'04921 '+i, category:'doener' });
});

var slugs = G.buildAvailableSlugs(PARTNER, PROSPECTS);
var ORTE = G.ermittleOrte(PARTNER, PROSPECTS);
function ort(n) { return ORTE.find(function (c) { return c.name === n; }); }
function art(s) { return G.CATEGORIES.find(function (c) { return c.slug === s; }); }

var erg = {};
ORTE.forEach(function (c) {
    G.CATEGORIES.forEach(function (k) {
        if (k.slug === 'restaurant') return;
        ['de', 'en'].forEach(function (l) {
            var r = G.generateCityCategoryPage(c, k, PARTNER, l, PROSPECTS, KARTEN);
            if (r) erg[r.filename] = r;
        });
    });
    G.generateCityOverview(c, PARTNER, 'de', PROSPECTS);
    G.generateCityOverview(c, PARTNER, 'en', PROSPECTS);
});
G.CATEGORIES.forEach(function (k) { ['de', 'en'].forEach(function (l) { G.generateCategoryOverview(k, PARTNER, l); }); });
PROSPECTS.forEach(function (p) { G.generateProspectPage(p, PARTNER, PROSPECTS); });
PARTNER.forEach(function (r) { G.generateRestaurantPage(r, KARTEN[r.id] || [], []); });
G.generateGastroPage();

console.log('\n-- 1. WELCHE SEITEN ES GIBT --');
t('Pizzerien in Greetsiel (Partner)', da('pizzeria-greetsiel.html'));
t('Döner in Wilhelmshaven -- OHNE Partner, 4 Betriebe', da('doener-wilhelmshaven.html'));
t('Pizzerien in Wilhelmshaven NICHT -- nur 3, zu duenn', !da('pizzeria-wilhelmshaven.html'));
t('verlinkbar ist genau, was gebaut wird',
  slugs.has('pizzeria-greetsiel') && slugs.has('doener-wilhelmshaven') && !slugs.has('pizzeria-wilhelmshaven'));
t('ohne Partner keine englische Seite', !da('en/doener-wilhelmshaven.html'));
t('mit Partner bleibt die englische', da('en/pizzeria-greetsiel.html'));

t('Betrieb "Döner" in Emden behaelt seine Seite /doener-emden',
  /<h1>Döner<\/h1>/.test(lies('doener-emden.html')) && !slugs.has('doener-emden') && !erg['doener-emden.html'], lies('doener-emden.html').slice(0, 0));

console.log('\n-- 2. PIZZERIEN IN GREETSIEL --');
var pg = lies('pizzeria-greetsiel.html');
var pgText = sichtbar(pg);
t('alle Pizzerien des Ortes stehen drauf, nicht nur der Partner',
  /Pizzeria Roma/.test(pgText) && /Da Toni/.test(pgText) && /Pizzeria Sole/.test(pgText), '');
t('ein Lokal anderer Art steht NICHT drauf', !/Zum Hafen/.test(pgText));
t('ein Entwurf (noindex) steht nirgends', !/Pizzeria Geheim/.test(pg));
t('die anderen sind als "Weitere Pizzerien" abgesetzt', /Weitere Pizzerien in Greetsiel/.test(pgText));
t('Gerichte-Abschnitt mit den echten Wörtern', /Pizza &amp; Pasta in Greetsiel – Gerichte und Preise/.test(pg), '');
t('echte Gerichte mit Preis', /Pizza Margherita/.test(pgText) && /9,50 €/.test(pgText) && /Spaghetti Bolognese/.test(pgText));
t('nur Gerichte dieser Art (kein Tiramisu, keine Cola)', !/Tiramisu/.test(pgText) && !/Cola/.test(pgText));
var desc = meta(pg, 'description');
t('Beschreibung im Google-Treffer beginnt mit "Pizza & Pasta in Greetsiel"', desc.indexOf('Pizza &amp; Pasta in Greetsiel: ') === 0, desc);
t('und nennt ein Gericht mit Preis', /Pizza Margherita 9,50 €/.test(desc), desc);
t('und ist hoechstens 160 Zeichen lang', desc.replace(/&amp;/g, '&').length <= 160, desc.length);
t('der Titel bleibt, wie er war (rankt schon)', titel(pg) === 'Pizzerien in Greetsiel – online bestellen | Kiek mol in', titel(pg));
t('die Frage "Welche Pizzerien gibt es in Greetsiel?" nennt alle',
  /Welche Pizzerien gibt es in Greetsiel\?/.test(pg) && /In Greetsiel: La Piazza, Da Toni, Pizzeria Roma, Pizzeria Sole\./.test(pg), '');
t('auch im ItemList-Schema stehen alle', /"ItemList"/.test(pg) && /Pizzeria Roma/.test(pg.slice(pg.indexOf('"ItemList"'))));
t('die Seite verlinkt sich nicht selbst', pg.indexOf('Alle Pizzerien in Greetsiel</a>') < 0);

console.log('\n-- 3. DÖNER IN WILHELMSHAVEN (kein Partner) --');
var dw = lies('doener-wilhelmshaven.html');
var dwText = sichtbar(dw);
t('Titel verspricht kein Bestellen', /Döner-Imbisse in Wilhelmshaven – Adressen &amp; Telefon/.test(titel(dw)) && !/bestell/i.test(titel(dw)), titel(dw));
t('Beschreibung verspricht kein Bestellen', !/bestell/i.test(meta(dw, 'description')), meta(dw, 'description'));
t('Vorspann sagt ehrlich: keiner ist dabei', /Keiner davon ist bisher bei Kiek mol in/.test(dwText));
t('keine erfundene Empfehlung ("zu empfehlen")', !/zu empfehlen/.test(dw));
t('alle 4 stehen drauf, mit Telefon',
  ['Kebap Haus','Döner Palast','Istanbul Grill','Antalya Imbiss'].every(function (n) { return dwText.indexOf(n) >= 0; }) && /tel:/.test(dw));
t('kein hreflang auf eine englische Seite, die es nicht gibt', !/hreflang="en"/.test(dw));
t('kein Gerichte-Abschnitt ohne Karte', !/Gerichte und Preise/.test(dw));

console.log('\n-- 4. PARTNER OHNE KARTE --');
var fg = lies('fischrestaurant-greetsiel.html');
t('Seite gibt es', !!fg);
t('aber keinen leeren Gerichte-Abschnitt', !/Gerichte und Preise/.test(fg));
t('und die bisherige Beschreibung', /^Die besten Fischrestaurants in Greetsiel/.test(meta(fg, 'description')), meta(fg, 'description'));

console.log('\n-- 5. WIE GOOGLE DIE SEITEN FINDET --');
var roma = lies('pizzeria-roma-greetsiel.html');
t('Betriebsseite einer Pizzeria verlinkt "Alle Pizzerien in Greetsiel"',
  /href="\/pizzeria-greetsiel">Alle Pizzerien in Greetsiel</.test(roma));
var og = lies('restaurants-greetsiel.html');
t('Ortsseite verlinkt die Arten im Ort', /href="\/pizzeria-greetsiel">Pizzerien in Greetsiel</.test(og));
t('Ortsseite Wilhelmshaven verlinkt Döner, aber nicht die fehlenden Pizzerien',
  /href="\/doener-wilhelmshaven"/.test(lies('restaurants-wilhelmshaven.html')) && !/href="\/pizzeria-wilhelmshaven"/.test(lies('restaurants-wilhelmshaven.html')));

// Jeder interne Link zeigt auf eine Seite, die es gibt. Sonst liefert der
// Catch-All die Startseite mit Status 200 -- ein Soft-404.
var tot = [];
(function laufe(dir, pre) {
    fs.readdirSync(dir).forEach(function (f) {
        var voll = path.join(dir, f);
        if (fs.statSync(voll).isDirectory()) return laufe(voll, pre + f + '/');
        if (!/\.html$/.test(f)) return;
        var html = fs.readFileSync(voll, 'utf8');
        var re = /href="\/((?:en\/)?[a-z0-9-]+)"/g, m;
        while ((m = re.exec(html))) {
            // /en ist die Startseite (SPA, canonical auf /) -- so seit jeher.
            if (m[1] === 'en') continue;
            if (!da(m[1] + '.html')) tot.push(pre + f + ' -> /' + m[1]);
        }
    });
})(AUS, '');
t('kein interner Link ins Leere', tot.length === 0, tot.slice(0, 6).join(' | '));

console.log('\n-- 6. BAUREIHENFOLGE --');
t('Speisekarten werden VOR den Ort-x-Art-Seiten geholt',
  QUELLE.indexOf('kartenNachId[rest.id] = await fetchMenuItems(rest.id)') > 0 &&
  QUELLE.indexOf('kartenNachId[rest.id] = await fetchMenuItems(rest.id)') <
  QUELLE.indexOf('generateCityCategoryPage(city, cat, restaurants, lng, prospects, kartenNachId)'));
t('jede Karte nur einmal geholt (kein zweites fetchMenuItems je Restaurant)',
  (QUELLE.match(/await fetchMenuItems\(/g) || []).length === 1);
t('Ort x Art über alle Orte mit Daten, nicht nur CITIES',
  /for \(const city of ermittleOrte\(restaurants, prospects\)\) \{\s*for \(const cat of CATEGORIES\)/.test(QUELLE));

try { fs.rmSync(AUS, { recursive: true, force: true }); } catch (e) {}
console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
