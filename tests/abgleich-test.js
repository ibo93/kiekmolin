// KARTE ABGLEICHEN -- der Vergleich wird wirklich gerechnet.
//
// Der Fehler, den diese Datei festhaelt: der Import kannte nur ANLEGEN.
// Schickte ein Wirt im Fruehjahr dieselbe Karte mit neuen Preisen, stand
// danach jedes Gericht zweimal in der App -- 142 Zeilen von Hand loeschen.
// Preise aendern sich zwei- bis dreimal im Jahr, das trifft jeden Kunden.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
var F = new Function('getDishNumber',
    ['_abgleichSchluessel', '_abgleichPreis', '_abgleichGroessen', 'karteAbgleichen'].map(schneide).join('\n')
    + '; return { abgleichen: karteAbgleichen, schluessel: _abgleichSchluessel };')(
    function (i) { return i && i.dish_number ? i.dish_number : ''; });

function inDb(o) {
    return { id: o.id, name: o.name, base_price: o.preis, dish_number: o.nr || '',
             description: o.besch || '', sizes: o.groessen || null,
             is_available: o.aus ? false : true };
}
function ausScan(o) {
    return { name: o.name, price: o.preis, dish_number: o.nr || '',
             description: o.besch || '', sizes: o.groessen || null, category: o.kat || 'Pizza' };
}

// --- Der Normalfall: dieselbe Karte, neue Preise ----------------------------
var bestehend = [
    inDb({ id: 'a', nr: '1', name: 'Pizza Margherita', preis: 6.5, besch: 'Käse',
           groessen: [{ name: 'klein', price: 6.5 }, { name: 'groß', price: 8.5 }] }),
    inDb({ id: 'b', nr: '2', name: 'Pizza Salami', preis: 7.0, besch: 'Salami' }),
    inDb({ id: 'c', nr: '3', name: 'Pizza Tonno', preis: 7.5, besch: 'Thunfisch' }),
    inDb({ id: 'd', nr: '9', name: 'Pizza Hawaii', preis: 8.0, besch: 'Ananas' })
];
var neuKarte = [
    ausScan({ nr: '1', name: 'Pizza Margherita', preis: 6.5, besch: 'Käse',
              groessen: [{ name: 'klein', price: 6.5 }, { name: 'groß', price: 8.5 }] }),
    ausScan({ nr: '2', name: 'Pizza Salami', preis: 7.5, besch: 'Salami' }),      // Preis hoch
    ausScan({ nr: '3', name: 'Pizza Thunfisch', preis: 7.5, besch: 'Thunfisch' }),// umbenannt
    ausScan({ nr: '4', name: 'Pizza Trüffel', preis: 12.5, besch: 'Trüffelöl' })  // neu
];
var d = F.abgleichen(neuKarte, bestehend);

t('unveraendertes Gericht wird nicht angefasst',
  d.unveraendert.length === 1 && d.unveraendert[0].id === 'a',
  d.unveraendert.map(function (x) { return x.name; }).join(', '));
var salami = d.geaendert.filter(function (x) { return x.alt.id === 'b'; })[0];
t('Preisaenderung wird erkannt', !!salami, d.geaendert.map(function (x) { return x.neu.name; }).join(', '));
t('und zwar mit altem UND neuem Preis',
  !!salami && salami.was[0].feld === 'Preis' && salami.was[0].alt === 7 && salami.was[0].neu === 7.5,
  salami && JSON.stringify(salami.was));
// Umbenennen ist eine Aenderung, kein "unveraendert": das Gericht wird ueber
// die Nummer wiedererkannt, aber der neue Name muss in der App ankommen.
var umbenannt = d.geaendert.filter(function (x) { return x.alt.id === 'c'; })[0];
t('Umbenennung wird als Aenderung gemeldet',
  !!umbenannt && umbenannt.was.some(function (w) { return w.feld === 'Name'; }),
  umbenannt && JSON.stringify(umbenannt.was));
t('mit altem und neuem Namen',
  !!umbenannt && umbenannt.was[0].alt === 'Pizza Tonno' && umbenannt.was[0].neu === 'Pizza Thunfisch',
  umbenannt && JSON.stringify(umbenannt.was[0]));
t('der neue Name wird auch geschrieben', /neuerStand = \{ name: g\.neu\.name/.test(H));
t('umbenanntes Gericht bleibt dasselbe Gericht (Nummer zaehlt, nicht der Name)',
  !d.neu.some(function (x) { return /Thunfisch/.test(x.name); })
  && !d.entfallen.some(function (x) { return /Tonno/.test(x.name); }),
  'neu: ' + d.neu.map(function (x) { return x.name; }).join(',') +
  ' entfallen: ' + d.entfallen.map(function (x) { return x.name; }).join(','));
t('wirklich neues Gericht wird als neu erkannt',
  d.neu.length === 1 && d.neu[0].name === 'Pizza Trüffel',
  d.neu.map(function (x) { return x.name; }).join(', '));
t('fehlendes Gericht wird als entfallen erkannt',
  d.entfallen.length === 1 && d.entfallen[0].id === 'd',
  d.entfallen.map(function (x) { return x.name; }).join(', '));

// --- Der Fehler, um den es geht: nichts darf sich verdoppeln ---------------
var nochmal = F.abgleichen(neuKarte.slice(0, 3).map(function (x) { return ausScan({
    nr: x.dish_number, name: x.name, preis: x.price, besch: x.description }); }), bestehend);
t('derselbe Import zweimal legt NICHTS doppelt an',
  nochmal.neu.length === 0, nochmal.neu.map(function (x) { return x.name; }).join(', '));

// --- Groessen ---------------------------------------------------------------
var g1 = F.abgleichen(
    [ausScan({ nr: '1', name: 'Pizza Margherita', preis: 7,
               groessen: [{ name: 'klein', price: 7 }, { name: 'groß', price: 9 }] })],
    [inDb({ id: 'a', nr: '1', name: 'Pizza Margherita', preis: 6.5,
            groessen: [{ name: 'klein', price: 6.5 }, { name: 'groß', price: 8.5 }] })]);
t('geaenderte Groessenpreise werden erkannt',
  g1.geaendert.length === 1 && g1.geaendert[0].was.some(function (w) { return w.feld === 'Größen'; }),
  JSON.stringify(g1.geaendert[0] && g1.geaendert[0].was));

// --- Zutaten duerfen nicht geloescht werden --------------------------------
// Eine Karte ohne Zutatenzeilen darf gepflegte Beschreibungen nicht leeren.
var g2 = F.abgleichen(
    [ausScan({ nr: '1', name: 'Pizza Margherita', preis: 6.5, besch: '' })],
    [inDb({ id: 'a', nr: '1', name: 'Pizza Margherita', preis: 6.5, besch: 'Käse, Tomaten, Basilikum' })]);
t('leere Beschreibung ueberschreibt eine gepflegte NICHT',
  g2.geaendert.length === 0 && g2.unveraendert.length === 1,
  JSON.stringify(g2.geaendert));

// --- Gerichte ohne Nummer ---------------------------------------------------
var g3 = F.abgleichen(
    [ausScan({ name: 'Apfelkuchen', preis: 4.2 })],
    [inDb({ id: 'x', name: 'Apfelkuchen', preis: 3.8 })]);
t('ohne Nummer wird ueber den Namen wiedererkannt',
  g3.geaendert.length === 1 && g3.neu.length === 0, JSON.stringify({ g: g3.geaendert.length, n: g3.neu.length }));

// --- Schon ausverkaufte zaehlen nicht als "entfallen" ----------------------
var g4 = F.abgleichen([], [inDb({ id: 'y', nr: '5', name: 'Saisonkarte', preis: 9, aus: true })]);
t('bereits ausverkaufte Gerichte werden nicht nochmal gemeldet',
  g4.entfallen.length === 0, g4.entfallen.length);

// --- Einbau ------------------------------------------------------------------
t('der Import geht erst in den Abgleich, wenn schon eine Karte da ist',
  /if \(!window\._abgleichLaeuft && Array\.isArray\(window\.menuItems\) && window\.menuItems\.length\)/.test(H)
  && /zeigeKartenAbgleich\(d\);/.test(H));
t('entfallene Gerichte werden ausverkauft gesetzt, nicht geloescht',
  /is_available: false/.test(H) && /value="ausverkauft" checked/.test(H));
t('Loeschen ist moeglich, aber nicht vorausgewaehlt',
  /value="loeschen"/.test(H) && !/value="loeschen"[^>]*checked/.test(H));
t('vor dem Abgleich wird gesichert',
  /await sichereKarte\(restaurantId, 'Karte abgleichen'\)/.test(H));
t('auch der erste Import sichert',
  /await sichereKarte\(restaurantId, 'Karte importieren'\)/.test(H));
t('auch das Massenloeschen sichert (war der zweite Weg ohne Zurueck)',
  /sichereKarte\([\s\S]{0,160}'Gerichte löschen'\)/.test(H));
t('die Sicherung haelt Preise, Groessen und Beschreibung fest',
  /base_price: i\.base_price, sizes: i\.sizes \|\| null/.test(H));
t('neue Gerichte laufen ueber den vorhandenen Import (Kategorien, Extras)',
  /window\._abgleichLaeuft = true;[\s\S]{0,200}await importScannedMenu\(\)/.test(H));
t('eigenes Fenster fuer den Abgleich',
  /<div class="modal-overlay" id="kartenAbgleichModal"/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
