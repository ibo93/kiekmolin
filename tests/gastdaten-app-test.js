// Prueft, dass die App keine Gaestedaten mehr ueber Telefonnummern sucht.
//
// Der Befund war nicht nur "die Tabelle ist offen". Die App hat die
// offene Tabelle aktiv ausgenutzt: in "Meine Bestellungen" stand ein
// Feld "Telefonnummer" unter der Ueberschrift "Anmelden". Angemeldet hat
// sich damit nie jemand -- die Nummer ging unveraendert als Suchbegriff
// an die Datenbank:
//
//     orders?customer_phone=ilike.*<letzte 8 Ziffern>*&limit=30
//     reservations?guest_phone=ilike.*<letzte 8 Ziffern>*&limit=20
//
// Wer eine fremde Nummer eintippte, bekam Name, Telefon und
// Lieferadresse. Ein Formular, das Sicherheit vortaeuscht, ist schlimmer
// als gar keins.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Keine Telefonsuche mehr --');

// Der Kern. Diese Muster duerfen in keiner CODE-Zeile mehr stehen --
// auch nicht in einer Funktion, die gerade niemand aufruft.
//
// Zeilenweise und ohne Kommentarzeilen: die Muster stehen absichtlich in
// den Erklaerungen daneben, damit spaeter niemand denkt, die Telefonsuche
// sei nur aus Versehen verschwunden. Ein Test, der Kommentare mitzaehlt,
// wuerde genau diese Erklaerungen wieder herausdruecken.
var zeilen = h.split('\n');
function codeZeilen(muster) {
    return zeilen.filter(function (z) {
        return muster.test(z) && /^\s*(\/\/|\*|--)/.test(z) === false;
    });
}
[
    ['orders ueber customer_phone', /orders\?[^'"]*customer_phone=ilike/],
    ['reservations ueber guest_phone', /reservations\?[^'"]*guest_phone=ilike/]
].forEach(function (p) {
    var treffer = codeZeilen(p[1]);
    t('keine Suche nach ' + p[0] + ' im Code', treffer.length === 0, JSON.stringify(treffer.slice(0, 2)));
});

// Gegenprobe zur Gegenprobe: die Erklaerungen MUESSEN dastehen. Sonst
// haette der Test oben auch dann bestanden, wenn jemand die Kommentare
// samt Begruendung geloescht haette.
t('die Erklaerung zur alten Telefonsuche steht noch da',
  h.indexOf('customer_phone=ilike') > -1, 'Begruendung verschwunden');

t('das Schein-Login loginWithPhone ist weg',
  /function loginWithPhone/.test(h) === false, 'noch da');
t('showPhoneLoginForOrders ist weg',
  /function showPhoneLoginForOrders/.test(h) === false, 'noch da');
t('das Eingabefeld myOrdersPhone ist weg',
  h.indexOf('myOrdersPhone') === -1, 'noch da');
t('das Eingabefeld myResPhone ist weg',
  h.indexOf('myResPhone') === -1, 'noch da');

console.log('\n-- 2. Der Vorrat an Geheimnissen --');

// Den Block herausschneiden und wirklich AUSFUEHREN. Ein Test, der nur
// nach Textstellen sucht, haette nicht gemerkt, dass die Abschneidung
// die falsche Seite abschneidet.
var von = h.indexOf('var VERFOLG_SCHLUESSEL =');
var bis = h.indexOf('// ==================== BESTELLHISTORIE');
t('der Block steht in index.html', von > 0 && bis > von, von + '/' + bis);

var speicher = {};
var welt = {
    localStorage: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(speicher, k) ? speicher[k] : null; },
        setItem: function (k, v) { speicher[k] = String(v); }
    },
    JSON: JSON, Array: Array, String: String, console: console
};
welt.window = welt;
vm.createContext(welt);
vm.runInContext(h.slice(von, bis), welt);

var HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

t('ein gueltiges Geheimnis wird gemerkt', welt.verfolgMerken('b', HEX) === true, speicher);
t('und ist danach da', welt.verfolgLesen().b[0] === HEX, welt.verfolgLesen());

// Alles, was nicht die Form der Datenbank hat, darf gar nicht erst in
// den Vorrat -- sonst landet es spaeter in einer Abfrage-Adresse.
[['zu kurz', 'abc'], ['leer', ''], ['null', null],
 ['mit Komma', HEX + ',' + HEX], ['mit Sternchen', '*'],
 ['Grossbuchstaben-Muell', 'ZZZZ' + HEX.slice(4)],
 ['PostgREST-Anhaengsel', HEX.slice(0, 30) + '&or=(1.eq.1)']
].forEach(function (f) {
    t('abgelehnt: ' + f[0], welt.verfolgMerken('b', f[1]) === false, f[1]);
});

t('eine unbekannte Art wird abgelehnt', welt.verfolgMerken('x', HEX) === false, 'x ging durch');

// Grossbuchstaben sind dieselbe Zahl -- die Datenbank schreibt klein.
t('Grossbuchstaben werden klein gemerkt',
  welt.verfolgMerken('b', HEX.toUpperCase()) === true && welt.verfolgLesen().b.indexOf(HEX.toUpperCase()) === -1,
  welt.verfolgLesen().b);

console.log('\n-- 3. Der Vorrat laeuft nicht ueber --');
speicher = {};
for (var i = 0; i < 30; i++) {
    welt.verfolgMerken('b', String(i).padStart(2, '0').repeat(16));
}
var liste = welt.verfolgLesen().b;
t('hoechstens 20 Geheimnisse', liste.length === 20, liste.length);
// Die entscheidende Frage: welche 20? Die NEUESTEN muessen bleiben --
// sonst verliert der Gast ausgerechnet die Bestellung von eben.
t('das zuletzt gemerkte steht vorn', liste[0] === '29'.repeat(16), liste[0]);
t('das aelteste ist rausgefallen', liste.indexOf('00'.repeat(16)) === -1, liste);

console.log('\n-- 4. Doppelte rutschen nach vorn, statt sich zu haeufen --');
speicher = {};
welt.verfolgMerken('b', '11'.repeat(16));
welt.verfolgMerken('b', '22'.repeat(16));
welt.verfolgMerken('b', '11'.repeat(16));
var l2 = welt.verfolgLesen().b;
t('kein Doppeleintrag', l2.length === 2, l2);
t('das erneut gemerkte steht vorn', l2[0] === '11'.repeat(16), l2);

console.log('\n-- 5. Kaputter Speicher wirft nicht --');
speicher[welt.VERFOLG_SCHLUESSEL] = '{kein json';
t('unlesbarer Vorrat gibt leere Listen',
  welt.verfolgLesen().b.length === 0 && welt.verfolgLesen().r.length === 0, welt.verfolgLesen());
speicher[welt.VERFOLG_SCHLUESSEL] = '{"b":"kein array","r":42}';
t('falsche Formen geben leere Listen',
  welt.verfolgLesen().b.length === 0 && welt.verfolgLesen().r.length === 0, welt.verfolgLesen());

console.log('\n-- 6. Die Anzeigen holen ueber den Endpunkt --');
[
    ['loadMyOrdersFromSupabase', 'Meine Bestellungen'],
    ['loadMyReservationsFromSupabase', 'Meine Reservierungen'],
    ['checkActiveOrderBanner', 'der Aktiv-Banner'],
    ['loadProfileReservations', 'das Profil']
].forEach(function (f) {
    var a = h.indexOf('function ' + f[0]);
    t(f[1] + ' ist vorhanden', a > 0, a);
    var block = h.slice(a, a + 4000);
    t(f[1] + ' fragt verfolgHolen()', /verfolgHolen\(\)/.test(block), f[0]);
});

t('die Statusanzeige laeuft ueber verfolgBestellung',
  /var updatedOrder = await verfolgBestellung\(customerActiveOrder\.id\)/.test(h), 'nicht umgestellt');
t('das Verfolgungs-Band ebenfalls',
  /var b = await verfolgBestellung\(activeTrackingOrderId\)/.test(h), 'nicht umgestellt');

console.log('\n-- 7. Die uebrigen Gastabfragen laufen ueber Endpunkte --');
[
    ['order-exists', 'die Nachpruefung nach Abbruch'],
    ['order-counts', 'die Zaehler auf der Startseite'],
    ['res-availability', 'die freien Zeiten']
].forEach(function (f) {
    t(f[1] + ' ruft /.netlify/functions/' + f[0],
      h.indexOf('/.netlify/functions/' + f[0]) > -1, f[0]);
});

t('die Startseite holt nicht mehr alle Bestellungen des Tages',
  /orders\?select=restaurant_id&created_at=gte/.test(h) === false, 'noch da');
t('die Belegung wird nicht mehr direkt gelesen',
  /reservations\?restaurant_id=eq\.[^'"]*select=reservation_time/.test(h) === false, 'noch da');

console.log('\n-- 8. Bei Stoerung kein falsches "alles frei" --');
// Das ist der gefaehrlichste Fall: kommt die Belegung nicht an und die
// App liest das als leere Liste, bietet sie belegte Zeiten an und der
// Gast steht vor vollem Haus.
var bv = h.indexOf('async function loadAvailableSlots');
var bloc = h.slice(bv, bv + 3000);
t('loadAvailableSlots prueft _bel.ok', /if \(!_bel\.ok\)/.test(bloc), 'ungeprueft');
t('und meldet es dem Gast statt Zeiten anzubieten',
  bloc.indexOf('nicht abrufen') > -1, 'keine Meldung');

console.log('\n-- 9. Das Geheimnis wird beim Anlegen gemerkt --');
t('nach der Bestellung', /verfolgMerken\('b', _neueZeile\.track_token\)/.test(h), 'fehlt');
t('nach der Reservierung', /verfolgMerken\('r', r\.track_token\)/.test(h), 'fehlt');
// Wichtig: die App erzeugt das Geheimnis NICHT selbst -- es kommt aus
// der Datenbank zurueck. Sonst gaebe es zwei Quellen fuer dieselbe Zahl.
t('die App erzeugt selbst kein Geheimnis',
  /track_token:\s/.test(h) === false, 'die App schreibt track_token');

console.log('\n-- 10. Der kaputte Date-Aufruf ist weg --');
// new DatelocalDayStr(...) gab es nie -- ein verungluecktes Ersetzen aus
// new Date(...) und localDayStr(...). Vier Stellen warfen einen
// ReferenceError.
t('kein new DatelocalDayStr mehr', h.indexOf('DatelocalDayStr') === -1, 'noch da');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
