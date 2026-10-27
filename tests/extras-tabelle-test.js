// EXTRAS ALS TABELLE MIT KLEIN/GROSS-SPALTEN (27.10.2026)
//
// Ibos PDF "Pizza Pronto Moordorf – Extras" ergab "In dieser Karte stehen
// keine Extra-Regeln": der Leser kannte nur "Extra Zutaten: 1,00 €" und hielt
// die 36 Tabellenzeilen für Gerichte. tests/daten/pronto-moordorf-extras.txt
// ist der Text, den die App (pdf.js 2.16.105, leseKartePdf) aus genau dieser
// PDF holt -- im Browser gemessen, nicht abgetippt.

var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var ROH = fs.readFileSync(path.join(__dirname, 'daten', 'pronto-moordorf-extras.txt'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = H.indexOf('{', i), tiefe = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') tiefe++;
        else if (H[k] === '}') { tiefe--; if (tiefe === 0) return H.slice(i, k + 1); }
    }
    return '';
}
var lies = new Function('window', fn('_extrasPreisZahl') + fn('extrasKategorienFinden') + fn('extrasTabelleLesen') + '; return extrasTabelleLesen;')({});
var KATS = ['Pizza', 'Pizza Spezial', 'Familienpizza', 'Spaghetti', 'Rigatoni', 'Tortellini', 'Tagliatelle', 'Salate', 'Spezialitäten des Hauses', 'Pasta Bowls', 'Getränke'];
var G = lies(ROH, KATS);
function g(name, gr) { return G.filter(function (x) { return x.name === name && (gr === undefined || x.groesse === gr); })[0]; }

console.log('\n-- 1. KLEIN/GROSS-SPALTEN --');
t('Extra-Zutaten Pizza: je eine Gruppe für klein und groß', !!g('Extra-Zutaten Pizza', 'klein') && !!g('Extra-Zutaten Pizza', 'groß'));
t('25 Zutaten, klein 0,50 €, groß 1,00 €', g('Extra-Zutaten Pizza', 'klein').optionen.length === 25 && g('Extra-Zutaten Pizza', 'klein').optionen[0].price === 0.5 && g('Extra-Zutaten Pizza', 'groß').optionen[0].price === 1);
t('Premium: 5 Zutaten, 1,00 / 2,00 €', g('Premium-Zutaten Pizza', 'klein').optionen.length === 5 && g('Premium-Zutaten Pizza', 'groß').optionen[2].price === 2);
t('Name mit Klammer bleibt ganz ("Hackfleisch vom Spieß (Döner)")', g('Premium-Zutaten Pizza', 'klein').optionen[0].name === 'Hackfleisch vom Spieß (Döner)');
t('"Für Pizza 1–19 und Pizza Spezial 26–31" -> Kategorien Pizza und Pizza Spezial', g('Extra-Zutaten Pizza', 'klein').kategorie === 'Pizza,Pizza Spezial', g('Extra-Zutaten Pizza', 'klein').kategorie);
t('mehrere wählbar', g('Extra-Zutaten Pizza', 'groß').mehrfach === true);

console.log('\n-- 2. FAMILIEN- & PARTYPIZZA --');
var fam = g('Extra-Zutaten Familienpizza');
t('"jede weitere Zutat 2,50" + "Alle Zutaten von oben" -> alle 30 Zutaten zu 2,50 €', fam && fam.optionen.length === 30 && fam.optionen.every(function (o) { return o.price === 2.5; }), fam && fam.optionen.length);
t('Partypizza 3,50 €', g('Extra-Zutaten Partypizza').optionen[0].price === 3.5);
t('ohne passende Kategorie: unsicher (in der Vorschau nicht angehakt)', g('Extra-Zutaten Partypizza').unsicher === true && fam.unsicher === false);

console.log('\n-- 3. AUSWAHL UND EINZELNE AUFPREISE --');
var sosse = g('Soße nach Wahl');
t('"Salate – Soße nach Wahl" + Liste darunter -> Einzelauswahl mit 3 Soßen', sosse && sosse.mehrfach === false && sosse.optionen.map(function (o) { return o.name; }).join('|') === 'Cocktailsauce|Joghurtsauce|Knoblauchsauce', sosse && JSON.stringify(sosse.optionen));
t('... nur bei Salate, ohne Aufpreis', sosse.kategorie === 'Salate' && sosse.optionen[0].price === 0);
t('Pasta Bowls: Sahnesauce oder Basilikumpesto', g('Sauce nach Wahl').kategorie === 'Pasta Bowls' && g('Sauce nach Wahl').optionen.length === 2);
t('Nudelgerichte: "Mit Käse überbacken 1,00" bei Spaghetti, Rigatoni, Tortellini, Tagliatelle', g('Nudelgerichte').optionen[0].name === 'Mit Käse überbacken' && g('Nudelgerichte').kategorie === 'Spaghetti,Rigatoni,Tortellini,Tagliatelle');
t('Fladenbrot 1,50 bei Spezialitäten und Salaten', g('Fladenbrot').optionen[0].price === 1.5 && /Spezialitäten des Hauses/.test(g('Fladenbrot').kategorie) && /Salate/.test(g('Fladenbrot').kategorie));
t('der Seitentitel wird keine Gruppe', !G.some(function (x) { return /Moordorf/.test(x.name); }));
t('insgesamt 10 Gruppen', G.length === 10, G.length + ': ' + G.map(function (x) { return x.name + (x.groesse ? '/' + x.groesse : ''); }).join(', '));

console.log('\n-- 4. KATEGORIEN NUR ALS GANZES WORT --');
var find = new Function(fn('extrasKategorienFinden') + '; return extrasKategorienFinden;')();
t('"Pizza" steckt nicht in "Familienpizza"', find('Extra-Zutaten Familienpizza', ['Pizza', 'Familienpizza']).join() === 'Familienpizza');
t('Groß-/Kleinschreibung egal, "(Nr. 41)" stört nicht', find('salate (Nr. 65–71)', ['Salate']).join() === 'Salate');

console.log('\n-- 5. EINGEBAUT --');
t('Extras aus PDF versucht die Tabellenform', /extrasTabelleLesen\(e\.rohtext \|\| '', await extrasKategorienHolen\(extrasRestaurantWahl\(\)\)\)/.test(fn('extrasPdfLesen')));
t('auch wenn der Leser "0 Gerichte" meldet, zählt der Text', /if \(!e\.ok && !e\.rohtext\)/.test(fn('extrasPdfLesen')));
t('Größe wird mitgeschrieben (size_name)', /size_name: g\.groesse \|\| null/.test(fn('legeExtrasAn')));
t('zweites Einlesen erkennt klein/groß als vorhanden', /select=id,name,internal_name,size_name/.test(fn('legeExtrasAn')) && /\(g\.groesse \? '\|' \+ g\.groesse : ''\)/.test(fn('legeExtrasAn')));
t('unsichere Gruppe in der Vorschau nicht angehakt', /\(g\.unsicher \? '' : ' checked'\)/.test(fn('_extrasPdfZeige')));
console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
