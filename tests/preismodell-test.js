// DAS PREISMODELL AUF DEN SEO-SEITEN.
//
// GEFUNDEN AM 17.09.2026
// Die App sagt "0% Provision - fester Monatspreis". Die rund 900
// SEO-Seiten sagten:
//     "ohne App, mit fairer Provision"
//     Vertrauens-Punkt "🤝 Faire Provision"
//     "ohne Konzern, ohne hohe Provisionen"
//
// Fuer einen Wirt heisst "faire Provision": es GIBT eine. Dann rechnet er
// nicht weiter. Und genau diese Seiten sind das, was neue Wirte ueber
// Google finden -- wir haben mit dem schwaecheren UND falschen Argument
// geworben.
//
// Im selben Kasten stand ausserdem "kostenlos eintragen" NEBEN "mit fairer
// Provision", bei tatsaechlich 59,90 EUR im Monat.
//
// Dieser Test FUEHRT den Generator aus und liest die fertigen Seiten.

var fs   = require('fs');
var os   = require('os');
var path = require('path');

var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-preis-'));
process.env.SEO_OUT_DIR = AUS;
var G = require(path.join(__dirname, '..', 'build-seo-pages.js'));
// KOMMENTARE RAUS, BEVOR IM QUELLTEXT GEZAEHLT WIRD.
//
// Beim ersten Lauf meldete "59,90 steht nur EINMAL fest" zwei Treffer --
// der zweite war mein eigener Kommentar, der den Fund beschreibt. Eine
// Zusicherung, die ein Kommentar ausloest, prueft nichts.
var QUELLE = fs.readFileSync(path.join(__dirname, '..', 'build-seo-pages.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}
function lies(d) { try { return fs.readFileSync(path.join(AUS, d), 'utf8'); } catch (e) { return ''; } }
function text(html) { return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }

var PARTNER = [{ id:'1', slug:'testhaus', name:'Testhaus', city:'Norden', cuisine:'Pizza',
                 street:'Am Markt 1', zip:'26506', rating:4.5, rating_count:8 }];
var PROSPECT = { name:'Pizzeria Castello', city:'Norden', street:'Am Markt 3',
                 zip:'26506', phone:'04931 1234' };

G.buildAvailableSlugs(PARTNER, [PROSPECT]);
G.generateProspectPage(PROSPECT, PARTNER, [PROSPECT]);
G.generateRestaurantPage(PARTNER[0], [{ name:'Pizza', base_price:9.5 }], []);
G.generateCityCategoryPage(G.CITIES.find(function(c){return c.name==='Norden';}),
    G.CATEGORIES.find(function(c){return c.slug==='pizzeria';}), PARTNER, 'de');
G.generateCityCategoryPage(G.CITIES.find(function(c){return c.name==='Norden';}),
    G.CATEGORIES.find(function(c){return c.slug==='pizzeria';}), PARTNER, 'en');
// Die Regionen-Uebersicht in BEIDEN Sprachen. Ohne sie blieb eine
// Gegenprobe am englischen Text gruen -- die Seite wurde nie gebaut.
G.generateCategoryOverview(G.CATEGORIES.find(function(c){return c.slug==='pizzeria';}), PARTNER, 'de');
G.generateCategoryOverview(G.CATEGORIES.find(function(c){return c.slug==='pizzeria';}), PARTNER, 'en');
G.writeLlmsTxt(PARTNER);

var alleSeiten = fs.readdirSync(AUS).filter(function (f) { return /\.(html|txt)$/.test(f); });

console.log('\n-- 1. DAS FALSCHE ARGUMENT IST UEBERALL WEG --');
t('es gibt ueberhaupt Seiten zu pruefen', alleSeiten.length >= 4, alleSeiten.length);

var funde = [];
alleSeiten.forEach(function (f) {
    var inhalt = lies(f);
    [/[Ff]aire Provision/, /hohe Provisionen?/, /[Ff]air commission/, /high commissions?/]
        .forEach(function (re) {
            var m = inhalt.match(re);
            if (m) funde.push(f + ': ' + m[0]);
        });
});
t('nirgends mehr "faire" oder "hohe" Provision', funde.length === 0, funde.join(' | '));

console.log('\n-- 2. DER KASTEN FUER WIRTE ZEIGT DIE RECHNUNG --');
var pros = text(lies('pizzeria-castello-norden.html'));
var kasten = pros.slice(pros.indexOf('Ist das dein Restaurant'),
                        pros.indexOf('Ist das dein Restaurant') + 500);
t('der Kasten ist da', kasten.length > 50, kasten.slice(0, 60));
t('0 % Provision steht drin', /0 % Provision/.test(kasten), kasten);
t('der Monatspreis steht drin', /59,90 €/.test(kasten));
t('und dass er FEST ist', /fest, egal wie viel bestellt wird/.test(kasten));
t('mit der Folge daraus, nicht nur dem Schlagwort',
  /bleibt der volle Betrag beim Betrieb/.test(kasten), kasten.slice(0, 260));

console.log('\n-- 3. KOSTENLOS UND KOSTENPFLICHTIG SIND GETRENNT --');
//
// Vorher stand beides im selben Satz: "trag dein Restaurant kostenlos ein
// ... mit fairer Provision". Das liest sich wie eine Falle.
t('der Eintrag ist als kostenlos benannt', /Eintrag ist kostenlos/.test(kasten), kasten);
t('und was kostet, steht in einem EIGENEN Satz',
  pros.indexOf('Eintrag ist kostenlos') < pros.indexOf('zahlt 59,90'),
  pros.indexOf('Eintrag ist kostenlos') + ' < ' + pros.indexOf('zahlt 59,90'));
t('"kostenlos" und der Preis stehen nicht im selben Satz',
  !/kostenlos[^.]*59,90/.test(kasten), (kasten.match(/kostenlos[^.]{0,60}/) || [''])[0]);

console.log('\n-- 4. KEINE UNBELEGTE BEHAUPTUNG UEBER MITBEWERBER --');
//
// § 6 UWG: vergleichende Werbung ist erlaubt, aber nur mit nachpruefbaren,
// aktuellen Zahlen. Am 17.09.2026 mit Ibo entschieden: gar keine Zahl ueber
// Dritte. Unser eigenes Argument traegt ohne sie.
var verboten = [];
alleSeiten.forEach(function (f) {
    var inhalt = lies(f);
    [/Lieferando/i, /Wolt/i, /Uber\s*Eats/i, /13\s*(bis|-|–)\s*30\s*%/, /marktüblich/i]
        .forEach(function (re) {
            var m = inhalt.match(re);
            if (m) verboten.push(f + ': ' + m[0]);
        });
});
t('kein Mitbewerber wird genannt', verboten.length === 0, verboten.join(' | '));
t('auch keine Prozentspanne ohne Quelle', verboten.length === 0);

console.log('\n-- 5. KEINE ZAHL, DIE VERALTEN KANN --');
//
// "Noch X von 20 Plaetzen" steht bewusst NICHT drauf: die Restaurant-Tabelle
// lieferte zuletzt 5, das Dashboard meldete 7 -- die Zaehlungen meinen nicht
// dasselbe. Eine veraltete Zahl auf 900 Seiten ist schlimmer als keine.
var zaehler = [];
alleSeiten.forEach(function (f) {
    var inhalt = lies(f);
    [/noch \d+ (von \d+ )?Plätze/i, /\d+ von 20/, /ersten 20/].forEach(function (re) {
        var m = inhalt.match(re);
        if (m) zaehler.push(f + ': ' + m[0]);
    });
});
t('kein Platzzähler auf den Seiten', zaehler.length === 0, zaehler.join(' | '));

console.log('\n-- 6. DER VERTRAUENS-PUNKT --');
var betrieb = lies('testhaus.html');
t('der Punkt heisst jetzt "0 % Provision"', /0 % Provision/.test(betrieb));
t('und nicht mehr "Faire Provision"', !/Faire Provision/.test(betrieb));

console.log('\n-- 7. DER GASTWEG: OHNE PROVISION, NICHT OHNE HOHE --');
var katDe = lies('pizzeria-norden.html');
var katEn = lies('en/pizzeria-norden.html');
t('deutsch: "ohne Provision"', /ohne Provision/.test(katDe));
t('deutsch: der volle Betrag bleibt beim Betrieb',
  /bleibt der volle Betrag beim Betrieb/.test(katDe));
t('englisch: "no commission at all"', /no commission at all/.test(katEn), katEn ? 'Seite da' : 'Seite fehlt');

// Die Regionen-Uebersicht hat ihren eigenen Satz -- in beiden Sprachen.
var regDe = lies('pizzeria-ostfriesland.html');
var regEn = lies('en/pizzeria-ostfriesland.html');
t('Region deutsch: "ohne Provision"', /ohne Provision/.test(regDe), regDe ? 'Seite da' : 'Seite fehlt');
t('Region englisch: "no commission"', /no commission/.test(regEn), regEn ? 'Seite da' : 'Seite fehlt');
t('Region englisch NICHT "no high commissions"', !/no high commissions/.test(regEn));

console.log('\n-- 8. WAS KI-ASSISTENTEN LESEN --');
//
// Fragt jemand eine KI "was kostet Kiek mol in fuer Gastronomen", kam die
// Antwort bisher aus den SEO-Seiten -- also aus der falschen Quelle.
var llms = lies('llms.txt');
t('llms.txt hat einen Abschnitt fuer Gastronomen', /## Für Gastronomen/.test(llms));
t('mit 0 % Provision', /0 % Provision/.test(llms));
t('mit dem Monatspreis', /59,90 €/.test(llms));
t('und dem kostenlosen Eintrag', /Eintrag kostenlos/.test(llms));
t('nennt auch dort keinen Mitbewerber', !/Lieferando/i.test(llms));

console.log('\n-- 9. EINE STELLE, NICHT SECHS --');
//
// Der Preis stand an sechs Stellen im Text. Aendert er sich, muss das eine
// Zeile sein -- sonst steht in einem halben Jahr wieder Widerspruechliches
// auf 900 Seiten.
t('es gibt eine Konstante fuer den Monatspreis',
  /const PREIS_MONAT = '59,90 €';/.test(QUELLE));
t('und eine fuer die Provision', /const PREIS_PROVISION = '0 %';/.test(QUELLE));
var hartkodiert = (QUELLE.match(/59,90/g) || []).length;
t('59,90 steht nur EINMAL fest im Quelltext', hartkodiert === 1, hartkodiert + 'x');
var nullProzent = (QUELLE.match(/'0 %'/g) || []).length;
t('"0 %" ebenso', nullProzent === 1, nullProzent + 'x');

console.log('\n-- 10. DIE ORTSLISTE IN llms.txt --');
//
// Sie kam aus CITIES und stimmte seit der Ortsseiten-Aenderung von heute in
// BEIDE Richtungen nicht: Orte unter der Untergrenze standen drin, ohne
// Seite, und die 19 neu dazugekommenen fehlten.
var orteImLlms = (llms.match(/\/restaurants-[a-z0-9-]+/g) || [])
    .map(function (u) { return u.slice(1); });
t('llms.txt listet ueberhaupt Ortsseiten', orteImLlms.length > 0, orteImLlms.length);
var echteSlugs = G.buildAvailableSlugs(PARTNER, [PROSPECT]);
var tot = orteImLlms.filter(function (slug) { return !echteSlugs.has(slug); });
t('und KEINE, die es nicht gibt', tot.length === 0, tot.slice(0, 5).join(', '));

try { fs.rmSync(AUS, { recursive: true, force: true }); } catch (e) {}

console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
