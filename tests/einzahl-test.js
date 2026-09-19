// "1 Gerichte" -- die Sorte Fehler, die kein Absturz ist und trotzdem jeden
// Tag im Google-Ergebnis steht.
//
// Gefunden am 17.09.2026 beim Preismodell, gemeldet und liegen gelassen;
// am 19.09.2026 behoben. Betroffen waren:
//
//   * die Vertrauens-Leiste auf jeder Betriebsseite:  "1 Gerichte"
//   * die Meta-Description derselben Seite:           "1 Gerichte online"
//   * die FAQ "Was steht auf der Speisekarte?":       "umfasst online 1 Gerichte"
//   * Ortsseite mit genau einem Betrieb: "1 Restaurants, Pizzerien,
//     Imbisse und Cafes" -- in Titel, Untertitel, Description, Intro und FAQ
//
// Erreichbar ist das nicht theoretisch: eine Ortsseite entsteht auch mit
// einem einzigen Partner (ortLohntSeite), und ein Betrieb, der seine Karte
// gerade erst anlegt, hat genau ein Gericht drin.
//
// Geprueft wird durch AUSFUEHREN: die Helfer einzeln, und danach die
// fertigen Seiten als Text.

var fs = require('fs');
var os = require('os');
var path = require('path');
var KMI = path.join(__dirname, '..');

// Der Bauer schreibt Dateien und gibt nur Kennzahlen zurueck. Also in einen
// eigenen Ordner schreiben lassen und die Datei danach lesen. SEO_OUT_DIR
// wird beim Laden des Moduls gelesen -- deshalb VOR dem require setzen.
var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-einzahl-'));
process.env.SEO_OUT_DIR = AUS;

var B = require(path.join(KMI, 'build-seo-pages.js'));

// Fehlt die Datei, soll der Test ROT werden und nicht abstuerzen. Ein
// Absturz beweist nichts -- das ist in diesem Projekt schon zweimal
// passiert.
function gebaut(ergebnis) {
    if (!ergebnis || !ergebnis.filename) return '';
    try { return fs.readFileSync(path.join(AUS, ergebnis.filename), 'utf8'); }
    catch (e) { return ''; }
}

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ====================================================================
console.log('\n-- 1. Die Helfer --');
// ====================================================================

t('1 Gericht', B.gerichteZahl(1) === '1 Gericht', B.gerichteZahl(1));
t('2 Gerichte', B.gerichteZahl(2) === '2 Gerichte', B.gerichteZahl(2));
t('0 Gerichte (Mehrzahl ist bei null richtig)', B.gerichteZahl(0) === '0 Gerichte', B.gerichteZahl(0));
t('47 Gerichte', B.gerichteZahl(47) === '47 Gerichte', B.gerichteZahl(47));

t('ein Betrieb, deutsch', B.betriebeZahl(1, false) === 'Ein Betrieb', B.betriebeZahl(1, false));
t('ein Betrieb, englisch', B.betriebeZahl(1, true) === 'One business', B.betriebeZahl(1, true));
t('mehrere zaehlen weiter die Arten auf',
  B.betriebeZahl(5, false) === '5 Restaurants, Pizzerien, Imbisse und Cafés', B.betriebeZahl(5, false));
t('der Verbinder ist waehlbar (Untertitel nimmt &)',
  B.betriebeZahl(5, false, '&') === '5 Restaurants, Pizzerien, Imbisse & Cafés', B.betriebeZahl(5, false, '&'));
t('englisch mehrere',
  B.betriebeZahl(3, true) === '3 restaurants, pizzerias, snack bars and cafés', B.betriebeZahl(3, true));
t('bei einem Betrieb ist der Verbinder egal -- es wird nichts verbunden',
  B.betriebeZahl(1, false, '&') === 'Ein Betrieb', B.betriebeZahl(1, false, '&'));

// ====================================================================
console.log('\n-- 2. Die fertige Betriebsseite --');
// ====================================================================

var EIN_BETRIEB = {
    id: 'a1', slug: 'test-imbiss', name: 'Test-Imbiss', city: 'Greetsiel',
    street: 'Hafenstr. 1', zip: '26736', phone: '+4949311',
    rating: 0, review_count: 0, features: []
};
var EIN_GERICHT = [{ id: 'g1', name: 'Pommes', price: 3.5, is_popular: true }];
var ZWEI_GERICHTE = EIN_GERICHT.concat([{ id: 'g2', name: 'Currywurst', price: 4.5 }]);

var seiteEins = gebaut(B.generateRestaurantPage(EIN_BETRIEB, EIN_GERICHT, []));
var seiteZwei = gebaut(B.generateRestaurantPage(EIN_BETRIEB, ZWEI_GERICHTE, []));

t('die Seite wird ueberhaupt gebaut', seiteEins.length > 500, seiteEins.length);
t('mit einem Gericht steht NIRGENDS "1 Gerichte"',
  seiteEins.indexOf('1 Gerichte') < 0, 'steht noch drin');
t('sondern "1 Gericht"', seiteEins.indexOf('1 Gericht') > -1, 'steht gar nichts da');
t('mit zwei Gerichten steht "2 Gerichte"',
  seiteZwei.indexOf('2 Gerichte') > -1, 'fehlt');
t('und nicht "2 Gericht"', !/2 Gericht[^e]/.test(seiteZwei), 'Einzahl bei zwei');

// Alle drei Stellen einzeln, damit nicht eine repariert ist und zwei nicht.
t('Vertrauens-Leiste: Einzahl', /<span class="i">📋<\/span>1 Gericht</.test(seiteEins),
  (seiteEins.match(/📋<\/span>[^<]*/) || [''])[0]);
// Die Kopfzeile unter dem Namen ("Imbiss in Greetsiel · 1 Gericht online").
// Hier stand zuerst "Meta-Description" im Namen und daneben die
// description-Zeile als Beleg -- die Zeile hat mit dieser Zusicherung aber
// nichts zu tun. Ein Test soll die Stelle nennen, die er wirklich prueft.
t('Kopfzeile im Aufmacher: Einzahl', /1 Gericht online/.test(seiteEins),
  (seiteEins.match(/[^>]{0,40}Gericht[e]? online/) || [''])[0]);
t('FAQ zur Speisekarte: Einzahl', /umfasst online 1 Gericht[^e]/.test(seiteEins),
  (seiteEins.match(/umfasst online [^<]{0,30}/) || [''])[0]);

// ====================================================================
console.log('\n-- 3. Die Ortsseite mit genau einem Betrieb --');
// ====================================================================

var STADT = { slug: 'greetsiel', name: 'Greetsiel' };
var ortEins = gebaut(B.generateCityOverview(STADT, [EIN_BETRIEB], 'de', []));
var ortEinsEn = gebaut(B.generateCityOverview(STADT, [EIN_BETRIEB], 'en', []));
var ortDrei = gebaut(B.generateCityOverview(STADT,
    [EIN_BETRIEB,
     { id: 'a2', slug: 'zwei', name: 'Zwei', city: 'Greetsiel', features: [] },
     { id: 'a3', slug: 'drei', name: 'Drei', city: 'Greetsiel', features: [] }], 'de', []));

t('die Ortsseite wird gebaut', ortEins.length > 500, ortEins.length);
t('mit einem Betrieb steht NIRGENDS "1 Restaurants"',
  ortEins.indexOf('1 Restaurants') < 0, 'steht noch drin');
t('auch nicht in der englischen Fassung',
  ortEinsEn.indexOf('1 restaurants') < 0, 'steht noch drin');
t('sondern "Ein Betrieb"', ortEins.indexOf('Ein Betrieb') > -1, 'steht gar nichts da');
t('englisch: "One business" oder "one business"',
  /[Oo]ne business/.test(ortEinsEn), 'fehlt');
t('mit drei Betrieben steht die Aufzaehlung wieder da',
  ortDrei.indexOf('3 Restaurants, Pizzerien') > -1, 'fehlt');

// Die FAQ ist ein eigener Satz und war eine eigene Fehlerstelle.
t('FAQ: "ist ein Betrieb ... gelistet", nicht "sind 1 Restaurants"',
  /ist ein Betrieb in Greetsiel gelistet/.test(ortEins),
  (ortEins.match(/Auf [^<]{0,80}gelistet/) || [''])[0]);
t('bei drei Betrieben heisst es weiter "sind 3 Restaurants"',
  /sind 3 Restaurants, Pizzerien/.test(ortDrei),
  (ortDrei.match(/Auf [^<]{0,80}gelistet/) || [''])[0]);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
