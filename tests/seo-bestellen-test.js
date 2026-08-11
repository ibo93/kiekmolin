// AUF DER SEITE, DIE BESTELLUNGEN BRINGEN SOLL, MUSS "BESTELLEN" STEHEN.
//
// GEMELDET WURDE
// --------------
// Bildschirmfoto der Google-Suche nach "al porto oldersum". Der
// Wettbewerber steht mit
//
//     Al Porto Oldersum - Online bestellen
//     Pizza · 1. Pizza Margherita 7,50 € · 2. Pizza Salami ...
//
// darueber. Unser Treffer:
//
//     Pizzeria Al Porto Oldersum - Kiek mol in
//     ... hat täglich 11:00–22:00 Uhr geöffnet. Feiertage und
//     Betriebsferien können abweichen ...
//
// Von Bestellen kein Wort. Der Verdacht war, der Sterne-Durchgang habe die
// Beschreibung mitgeaendert. Nachgesehen: hat er nicht. Der Commit fasste
// im Generator nur drei Dinge an -- "Cafes" zu "Cafés", "weiss" zu "weiß"
// und die Bewertungssterne. Titel und Meta-Beschreibung der
// Restaurantseite wurden zuletzt Monate frueher angefasst.
//
// WAS WIRKLICH DAHINTERSTECKT
// ---------------------------
// Zwei Stellen, an denen der Bestell-Hinweis verschwinden KANN:
//
//   1. Hat der Wirt einen eigenen Beschreibungstext eingetragen, stand im
//      ersten Absatz NUR der. Der Satz "hier kannst du online bestellen"
//      fiel dann komplett weg -- ausgerechnet auf der Seite, die genau das
//      verkaufen soll.
//
//   2. Ohne Gerichte faellt die Meta-Beschreibung auf einen Textbaustein
//      zurueck, und die Seite hat nichts Eigenes. Genau dann sucht sich
//      Google einen beliebigen Absatz -- bei uns die Oeffnungszeiten.
//      Und die Gerichte konnten still wegbleiben: die Abfrage gab bei
//      JEDEM Fehler ein leeres Array zurueck, ohne ein Wort im Protokoll.
'use strict';
var fs = require('fs');
var S = fs.readFileSync('/home/user/kiekmolin/build-seo-pages.js', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus: die Erklaerungen oben im Generator zitieren den alten
// Zustand und wuerden den Waechter auf sich selbst hereinfallen lassen.
var CODE = S.replace(/^[ \t]*\/\/.*$/gm, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    return '';
}

// ---- 1. Der Bestell-Satz steht IMMER da ------------------------------------
t('es gibt einen eigenen Satz dafuer', schneide('bestellSatz').length > 400);
t('der Text des Wirts verdraengt ihn nicht mehr',
  /\(rest\.description \? '<p>' \+ escapeHtml\(rest\.description\) \+ '<\/p>' : ''\) \+\s*\n\s*'<p>' \+ bestellSatz\(/.test(CODE));
// Im Intro-Block nachsehen, nicht in der ganzen Datei -- sonst findet der
// Vergleich zuerst die DEFINITION von bestellSatz weit oben und vergleicht
// die falschen Stellen miteinander.
var intro = CODE.slice(CODE.indexOf("'<div class=\"intro fade d1\">"),
                       CODE.indexOf("'</div>\\n' +", CODE.indexOf("'<div class=\"intro fade d1\">")));
t('der Intro-Block ist gefunden worden', intro.length > 200, intro.length);
t('und der Bestell-Satz steht darin NACH dem Text des Hauses',
  intro.indexOf('escapeHtml(rest.description)') >= 0
  && intro.indexOf('escapeHtml(rest.description)') < intro.indexOf('bestellSatz('),
  intro.indexOf('escapeHtml(rest.description)') + ' / ' + intro.indexOf('bestellSatz('));

var satz = new Function('escapeHtml', 'BRAND',
    schneide('bestellSatz') + '; return bestellSatz;')(function (x) { return String(x); }, 'Kiek mol in');

var KARTE = [
    { name: 'Pizza Margherita', base_price: 7.5 },
    { name: 'Pizza Salami', base_price: 8.5 },
    { name: 'Insalata Mista', base_price: 5 }
];

var PIZZERIA = { artikel: 'eine', haus: 'Pizzeria', label: 'Pizzeria' };
var voll = satz({ features: [], delivery_fee: 2.5 }, 'Al Porto', PIZZERIA, 'Oldersum', KARTE);
t('das Wort "bestellen" kommt vor -- darum geht es',
  /[Bb]estell/.test(voll), voll);
t('Abholung und Lieferung stehen drin, wenn beides angeboten wird',
  /Abholung oder Lieferung/.test(voll), voll);
t('die Anzahl der Gerichte ist echt, nicht geraten',
  /3 Gerichte stehen online/.test(voll), voll);
t('der guenstigste Preis steht dabei', /ab 5,00 €/.test(voll), voll);
t('und die Reservierung, weil das Haus sie anbietet', /Tisch reservieren/.test(voll));

var ohneLieferung = satz({ features: [] }, 'Al Porto', PIZZERIA, 'Oldersum', KARTE);
t('ohne Liefergebuehr wird keine Lieferung versprochen',
  /Abholung –/.test(ohneLieferung) && ohneLieferung.indexOf('Lieferung') < 0, ohneLieferung);

var GASTHAUS = { artikel: 'ein', haus: 'Restaurant', label: 'Restaurant' };
var keinBestellen = satz({ features: ['no_ordering', 'no_reservations'] }, 'Deichhaus', GASTHAUS, 'Norddeich', []);
t('ein Haus ohne Bestellung bekommt kein falsches Versprechen',
  keinBestellen.indexOf('Bestellen zur') < 0 && keinBestellen.indexOf('reservieren') < 0, keinBestellen);
t('es steht trotzdem ein Satz da, kein leerer Absatz',
  keinBestellen.length > 30 && /Deichhaus ist ein Restaurant in Norddeich\./.test(keinBestellen));

var IMBISS = { artikel: 'ein', haus: 'Imbiss', label: 'Imbiss' };
var eines = satz({ features: [] }, 'X', IMBISS, 'Emden', [{ name: 'Pommes', price: 3 }]);
t('bei einem Gericht stimmt die Einzahl', /1 Gericht steht online/.test(eines), eines);
t('auch "price" statt "base_price" wird als Preis erkannt', /ab 3,00 €/.test(eines), eines);

var ohneKarte = satz({ features: [] }, 'X', IMBISS, 'Emden', []);
t('ohne Gerichte wird keine Anzahl erfunden',
  ohneKarte.indexOf('stehen online') < 0 && ohneKarte.indexOf('steht online') < 0, ohneKarte);
t('der Bestell-Hinweis bleibt trotzdem', /[Bb]estell/.test(ohneKarte), ohneKarte);

t('Unsinn in den Preisen ergibt keine Preisangabe',
  satz({ features: [] }, 'X', IMBISS, 'Emden', [{ name: 'A', price: 'gratis' }]).indexOf(' ab ') < 0);

// DER ARTIKEL GEHOERT ZUM WORT, ER LAESST SICH NICHT ABLEITEN.
// Vorher stand fest "ist ein " + label -- auf der Seite von Al Porto also
// woertlich "ist ein Pizzeria". Und bei Döner stand das GERICHT, nicht der
// Betrieb: "ist ein Döner".
t('"ist eine Pizzeria", nicht "ist ein Pizzeria"',
  /ist eine Pizzeria in Oldersum\./.test(voll), voll.slice(0, 60));
t('bei Döner steht der Betrieb, nicht das Gericht',
  /ist ein Döner-Imbiss in Emden\./.test(
    satz({ features: [] }, 'Kebap Haus', { artikel: 'ein', haus: 'Döner-Imbiss' }, 'Emden', [])));
t('ohne Angabe wird "ein Restaurant" genommen, nichts Falsches',
  /ist ein Restaurant in Emden\./.test(satz({ features: [] }, 'X', null, 'Emden', [])));

// Jede Kategorie im Generator muss Artikel und Betriebsbezeichnung haben --
// sonst faellt die naechste stillschweigend auf "ein Restaurant" zurueck.
var katBlock = S.slice(S.indexOf('const CATEGORIES'), S.indexOf('// ==================== UTILS'));
var slugs = (katBlock.match(/slug: '[a-z-]+'/g) || []);
t('es gibt Kategorien zum Pruefen', slugs.length >= 6, slugs.length);
t('jede Kategorie hat einen Artikel',
  (katBlock.match(/artikel: '/g) || []).length === slugs.length,
  (katBlock.match(/artikel: '/g) || []).length + ' von ' + slugs.length);
t('und eine Betriebsbezeichnung',
  (katBlock.match(/haus: '/g) || []).length === slugs.length,
  (katBlock.match(/haus: '/g) || []).length + ' von ' + slugs.length);

// Der Satz muss sich von Haus zu Haus unterscheiden -- ein Textbaustein
// wird von Google ungern als Ausschnitt genommen.
var a = satz({ features: [], delivery_fee: 2 }, 'Al Porto', 'Italienisch', 'Oldersum', KARTE);
var b = satz({ features: ['no_reservations'] }, 'Deichhaus', 'Fisch', 'Norddeich',
              [{ name: 'Krabbenbrötchen', base_price: 6.5 }]);
t('zwei Haeuser bekommen zwei verschiedene Saetze', a !== b);
t('und sie unterscheiden sich in mehr als nur dem Namen',
  a.replace(/Al Porto|Oldersum|Italienisch/g, '') !== b.replace(/Deichhaus|Norddeich|Fisch/g, ''));

// ---- 2. Eine fehlende Speisekarte darf nicht mehr still durchgehen --------
var holen = schneide('fetchMenuItems');
t('die Abfrage wird ohne die verknuepfte Kategorie wiederholt',
  /const ohneKategorie = /.test(holen) && /await hole\(ohneKategorie\)/.test(holen));
t('jeder Fehlschlag wird gemeldet statt verschluckt',
  (holen.match(/MENU_FEHLSCHLAEGE\.push/g) || []).length === 2);
t('kein stilles "return \\[\\]" im Fehlerfall mehr',
  !/catch \(e\) \{\s*\n?\s*return \[\];\s*\n?\s*\}/.test(holen), holen.slice(-300));
t('eine kaputte Antwort wird nicht fuer eine Liste gehalten',
  /Array\.isArray\(daten\) \? daten : \[\]/.test(holen));
t('der Name des Hauses steht in der Meldung -- sonst weiss niemand, welches',
  /fetchMenuItems\(rest\.id, rest\.name\)/.test(CODE));

t('am Ende des Baus wird aufgelistet, welche Seite ohne Gerichte blieb',
  /Restaurantseite\(n\) ohne ein einziges Gericht/.test(S));
t('und welches Haus die Speisekarte nicht laden konnte',
  /die Speisekarte liess sich bei ' \+ MENU_FEHLSCHLAEGE\.length/.test(S));
t('die Liste wird ueber das richtige Merkmal gefunden',
  /return g\.restaurant && !g\.menuCount;/.test(CODE));

// ---- 3. Titel und Beschreibung nennen weiterhin das Bestellen -------------
var seite = schneide('generateRestaurantPage');
t('der Titel nennt Bestellen und Reservieren',
  /' – Online bestellen & Tisch reservieren \| ' \+ catLabel/.test(seite));
t('die Beschreibung mit Gerichten nennt Bestellen',
  /sampleItems\.join\(' · '\) \+ '\. Online bestellen, Speisekarte ansehen & Tisch reservieren\.'/.test(seite));
t('und die ohne Gerichte ebenfalls',
  /' – Speisekarte ansehen, online bestellen & Tisch reservieren\.'/.test(seite));

// ---- 4. Was der Sterne-Durchgang WIRKLICH angefasst hat -------------------
// Festgehalten, damit die Frage nicht noch einmal offen bleibt: die Sterne
// sind raus, Titel und Beschreibung waren nie betroffen.
t('keine erfundenen Bewertungen mehr', CODE.indexOf('rating_count || 5') < 0);
t('die Bewertungsfunktion gibt es weiterhin', /function echteBewertungen\(/.test(CODE));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
