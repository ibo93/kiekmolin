// EXTRA-ZUTATEN, DIE ZUR GEWAEHLTEN GROESSE GEHOEREN.
//
// Gemeldet am 03.09.2026 mit zwei Bildern der Bestellseite von Pizzeria
// Pronto Riepe. Bei der Pizza Margherita standen ZWEI Extra-Listen
// untereinander:
//
//     "Extra Zutaten"                je + 1,50 EUR
//     "Extra Zutaten kleine Pizza"   je + 1,00 EUR
//
// Beide gleichzeitig, egal ob klein (6,50) oder gross (8,50) gewaehlt
// war. Der Gast konnte also zur GROSSEN Pizza die Zutaten zum
// Kleinpreis anklicken -- und der Wirt haette sie zum Kleinpreis
// abgerechnet.
//
// Ibo: "ich will wenn ich klein oder gross waehle so muessen die extra
// zutaten kommen".
//
// Der Grund: Groessen stehen im JSON-Feld menu_items.sizes, Extras in
// menu_option_groups. Zwischen beiden gab es KEINE Verbindung -- die
// Zugehoerigkeit stand nur im Namen, und den liest kein Code. Seit dem
// 03.09. gibt es dafuer die Spalte size_name.
//
// Der wichtigste Teil dieses Tests ist NICHT das Ausblenden. Es ist,
// dass ein bei "klein" angekreuztes Extra beim Wechsel auf "gross"
// auch WIRKLICH aus der Bestellung fliegt. Bliebe es drin, faehre es
// unsichtbar zum falschen Preis mit -- und niemand saehe es.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

console.log('\n-- 1. Die Verbindung steht in der Datenbank, nicht im Namen --');

var sql = fs.readFileSync(path.join(KMI, 'datenbank', '23-groessen-extras.sql'), 'utf8');
t('es gibt eine SQL-Datei fuer die Spalte',
  /alter table menu_option_groups[\s\S]*add column if not exists size_name/.test(sql));
t('und sie ist additiv (if not exists)', /if not exists/.test(sql));

t('der Renderer liest size_name', /group\.size_name/.test(h));
t('und NICHT den Gruppennamen', !/size_name[^\n]*indexOf\(/.test(h) && !/group\.name[^\n]*klein/i.test(h));
t('das Dashboard speichert die Spalte', /size_name: groesse \|\| null/.test(h));
t('leer wird zu NULL, nicht zu ""', /groesse \|\| null/.test(h));

// Fehlt die Spalte, darf nicht das ganze Speichern kaputtgehen.
t('ohne die Spalte wird einmal ohne sie nachgefasst',
  /if \(!res\.ok && \/size_name\/\.test\(_meldung\)\)/.test(h));
t('und der Wirt erfaehrt, dass die SQL-Datei fehlt',
  /23-groessen-extras\.sql/.test(h));

console.log('\n-- 2. Das Umschalten, wirklich durchgespielt --');

// Funktion herausschneiden und laufen lassen.
var a = h.indexOf('function extrasZurGroesse');
var quelle = h.slice(a, h.indexOf('\n}\n', a) + 3);
t('die Funktion wurde gefunden', quelle.length > 300, quelle.length);

// Nachgebaute Kaesten. Eine Zeile = ein Extra.
function bauKasten(gid, fuerGroesse, gewaehlt) {
    var zeilen = gewaehlt.map(function (name) {
        var el = {
            _klassen: ['option-item', 'selected'], _anzahl: { textContent: '3' },
            classList: {
                remove: function (c) { var i = el._klassen.indexOf(c); if (i >= 0) el._klassen.splice(i, 1); },
                contains: function (c) { return el._klassen.indexOf(c) >= 0; }
            },
            querySelector: function (s) { return s === '.extra-anzahl' ? el._anzahl : null; },
            _name: name
        };
        return el;
    });
    return {
        _gid: gid, _fuer: fuerGroesse, style: {},
        getAttribute: function (k) {
            if (k === 'data-fuer-groesse') return fuerGroesse;
            if (k === 'data-gruppe') return gid;
            return null;
        },
        querySelectorAll: function (s) {
            return s === '.option-item.selected'
                ? zeilen.filter(function (z) { return z.classList.contains('selected'); })
                : [];
        },
        _zeilen: zeilen
    };
}

function lauf(gewaehlteGroesse, kaesten, optionen) {
    var ctx = {
        document: { querySelectorAll: function (s) {
            return /data-fuer-groesse/.test(s) ? kaesten : [];
        } },
        currentItemOptions: optionen.slice(),
        frischeGruppenZaehler: function () {},
        window: {}, String: String, Array: Array, console: console
    };
    vm.createContext(ctx);
    vm.runInContext(quelle, ctx);
    ctx.extrasZurGroesse(gewaehlteGroesse);
    return ctx;
}

// Der gemeldete Fall: Margherita, klein gewaehlt.
var gKlein = bauKasten('g-klein', 'klein', []);
var gGross = bauKasten('g-gross', 'groß', []);
var c1 = lauf('klein', [gKlein, gGross], []);
t('bei "klein" ist die Klein-Gruppe sichtbar', gKlein.style.display === '', JSON.stringify(gKlein.style));
t('und die Gross-Gruppe verschwindet', gGross.style.display === 'none', JSON.stringify(gGross.style));

var gKlein2 = bauKasten('g-klein', 'klein', []);
var gGross2 = bauKasten('g-gross', 'groß', []);
lauf('groß', [gKlein2, gGross2], []);
t('bei "groß" genau andersherum',
  gGross2.style.display === '' && gKlein2.style.display === 'none',
  JSON.stringify([gKlein2.style, gGross2.style]));

// Gross-/Kleinschreibung darf nicht entscheiden -- der Wirt tippt das
// von Hand ins Dashboard.
var gK3 = bauKasten('g-klein', 'Klein', []);
lauf('klein', [gK3], []);
t('Gross-/Kleinschreibung ist egal', gK3.style.display === '', JSON.stringify(gK3.style));
var gK4 = bauKasten('g-klein', '  klein  ', []);
lauf('klein', [gK4], []);
t('Leerzeichen davor und dahinter auch', gK4.style.display === '', JSON.stringify(gK4.style));

// Eine Gruppe OHNE Eintrag gilt fuer alles -- so verhalten sich alle
// Gruppen, die es vor dem 03.09. gab.
var gAlle = bauKasten('g-alle', '', []);
lauf('groß', [gAlle], []);
t('eine Gruppe ohne Groesse bleibt immer stehen', gAlle.style.display === '', JSON.stringify(gAlle.style));

console.log('\n-- 3. UND DAS ANGEKREUZTE FLIEGT MIT RAUS --');

var gK = bauKasten('g-klein', 'klein', ['Salami', 'Champignons']);
var gG = bauKasten('g-gross', 'groß', []);
var start = [
    { group: 'item_sizes', option: 'groß', price: 8.5, price_type: 'replace' },
    { group: 'g-klein', option: 'Salami', price: 1.0, price_type: 'add', quantity: 3 },
    { group: 'g-klein', option: 'Champignons', price: 1.0, price_type: 'add', quantity: 1 }
];
var c = lauf('groß', [gK, gG], start);

t('die Klein-Extras sind aus der Bestellung raus',
  c.currentItemOptions.filter(function (o) { return o.group === 'g-klein'; }).length === 0,
  JSON.stringify(c.currentItemOptions));
t('die Groesse selbst bleibt drin',
  c.currentItemOptions.some(function (o) { return o.group === 'item_sizes'; }),
  JSON.stringify(c.currentItemOptions));
t('und die Haekchen sind auch optisch weg',
  gK._zeilen.every(function (z) { return !z.classList.contains('selected'); }));
t('der Mengenzaehler faengt wieder bei eins an',
  gK._zeilen.every(function (z) { return z._anzahl.textContent === '1'; }),
  gK._zeilen.map(function (z) { return z._anzahl.textContent; }).join(','));

// Was in der SICHTBAREN Gruppe steht, darf NICHT angefasst werden.
var gK5 = bauKasten('g-klein', 'klein', ['Salami']);
var c5 = lauf('klein', [gK5], [{ group: 'g-klein', option: 'Salami', price: 1.0, quantity: 2 }]);
t('was sichtbar bleibt, bleibt auch gewaehlt',
  c5.currentItemOptions.length === 1, JSON.stringify(c5.currentItemOptions));
t('und behaelt seine Menge',
  c5.currentItemOptions[0].quantity === 2, c5.currentItemOptions[0].quantity);

console.log('\n-- 4. Beim Oeffnen gilt es sofort --');

// Sonst saehe der Gast beim Aufmachen beide Listen, und erst ein Tippen
// wuerde aufraeumen. Halb repariert ist nicht repariert.
t('die erste Groesse wird beim Rendern angewandt',
  /extrasZurGroesse\(item\.sizes\[0\]\.name \|\| ''\)/.test(h));
t('und ohne Groessen bleibt alles sichtbar',
  /Ohne Groessen ergibt eine an eine Groesse gebundene Gruppe/.test(h));
t('beim Wechsel der Groesse wird es gerufen',
  /if \(group === 'item_sizes'\) extrasZurGroesse\(option\);/.test(h));
t('und zwar VOR der Preisberechnung',
  h.indexOf("if (group === 'item_sizes') extrasZurGroesse(option);")
    < h.indexOf('updateItemTotalPrice();', h.indexOf("if (group === 'item_sizes')")));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
