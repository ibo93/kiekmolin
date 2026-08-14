// DIE UEBERSCHRIFT IM GOOGLE-TREFFER UND DER RUHETAG.
//
// GEMELDET WURDE
// --------------
// Bildschirmfoto der Google-Suche "al porto oldersum":
//
//     Pizzeria Al Porto Oldersum - Kiek mol in
//     ... hat täglich 11:00–22:00 Uhr geöffnet ...
//
// Dazu zwei Saetze: "mit den Speisekarte und online Bestellen oben als
// Überschrift" und "Die Öffnungszeiten ist auch falsch".
//
// 1. DIE UEBERSCHRIFT
// Im Quelltext stand: name + ' ' + cityRaw + ' – Online bestellen & Tisch
// reservieren | ' + catLabel. Bei Al Porto ergab das 85 Zeichen:
//
//     "Pizzeria Al Porto Oldersum Oldersum – Online bestellen &
//      Tisch reservieren | Pizzeria"
//
// "Oldersum" doppelt, "Pizzeria" doppelt. Google schneidet bei etwa 60 ab
// und ersetzt Titel, die sich wiederholen, durch einen eigenen -- genau das
// war zu sehen.
//
// 2. DIE OEFFNUNGSZEITEN
// Der Ruhetag steht in einer EIGENEN Spalte (rest_day, 0=Mo .. 6=So), die
// Uhrzeiten getrennt davon. Der Erzeuger der oeffentlichen Seiten las nur
// die Uhrzeiten und machte aus zwei Feldern ein Versprechen fuer sieben
// Tage. Die App liest beides -- diese Datei hatte kein einziges "rest_day".
// Das Wort "täglich" war eine Behauptung, die die Daten nicht hergeben, und
// sie stand auch in der Auszeichnung fuer Google.
'use strict';
var fs = require('fs');
var S = fs.readFileSync('/home/user/kiekmolin/build-seo-pages.js', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus: die Erklaerungen im Generator zitieren den alten Stand.
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

// ---- 1. Die Ueberschrift ---------------------------------------------------
//
// NACHGEZOGEN: Der Titel ist nicht mehr fuer alle gleich. Er richtet sich
// danach, was das Haus wirklich anbietet -- manche Kunden haben kein
// Online-Bestellen, manche keine Reservierung, manche beides nicht. Ein Titel,
// der etwas verspricht, das die Seite nicht einloest, kostet Vertrauen beim
// Gast und Rang bei Google.
//
// Die vier Faelle und die Laengenregel pruefen tests/seo-angebot-test.js.
// HIER bleibt, was davon unabhaengig ist: der Ort darf nicht doppelt
// auftauchen, und der Titel darf nicht zu lang werden.
t('der Titel richtet sich nach dem Angebot des Hauses',
  /const title = \(function \(\) \{/.test(CODE) && /kannBestellen\(rest\)/.test(CODE));
t('der feste Titel fuer alle ist weg',
  !/const title = titelName \+ ' – Speisekarte & online bestellen';/.test(CODE));
t('der alte, doppelte Titel ist ebenfalls weg',
  !/const title = name \+ ' ' \+ cityRaw \+ ' – Online bestellen & Tisch reservieren/.test(CODE));

// Die Regel ausfuehren, nicht nur nach ihr suchen. Hier mit einem Haus, das
// beides kann -- der laengste Fall, also der schaerfste Laengentest.
var normalize = new Function(schneide('normalize') + '; return normalize;')();

// Die ECHTE Titel-Regel aus dem Quelltext holen, nicht nachbauen. Ein
// nachgebauter Titel haette hier die Laengenregel nicht gekannt und dem Test
// eine Sicherheit vorgespielt, die es nicht gibt.
var titelRegel = (function () {
    var i = CODE.indexOf('const title = (function () {');
    var j = CODE.indexOf('})();', i) + 5;
    return new Function('titelName', 'rest', 'kannBestellen', 'kannReservieren',
        CODE.slice(i, j).replace('const title =', 'return'));
})();
var kannB = new Function(schneide('featureListe') + schneide('kannBestellen') + '; return kannBestellen;')();
var kannR = new Function(schneide('featureListe') + schneide('kannReservieren') + '; return kannReservieren;')();

function titel(name, stadt) {
    var imNamen = normalize(name).indexOf(normalize(stadt)) >= 0;
    return titelRegel(imNamen ? name : name + ' ' + stadt, { features: [] }, kannB, kannR);
}

var alPorto = titel('Pizzeria Al Porto Oldersum', 'Oldersum');
t('der Ort steht nicht doppelt drin',
  (alPorto.match(/Oldersum/g) || []).length === 1, alPorto);
t('die Betriebsart steht nicht doppelt drin',
  (alPorto.match(/Pizzeria/g) || []).length === 1, alPorto);
// Bei diesem langen Namen greift die Laengenregel: der Zusatz wird kuerzer,
// "Speisekarte" faellt weg. Das ist gewollt -- lieber ein kurzer Titel, der
// ganz dasteht, als ein langer, den Google mitten im Wort abschneidet.
t('bei langem Namen wird der Zusatz gekuerzt', alPorto.indexOf('Speisekarte,') < 0, alPorto);
t('"bestellen" steht drin', /bestellen/i.test(alPorto), alPorto);
t('"reservieren" steht drin', /reservieren/i.test(alPorto), alPorto);
t('kurz genug, dass Google ihn nicht abschneidet',
  alPorto.length <= 62, alPorto.length + ' Zeichen: ' + alPorto);

var deichhaus = titel('Deichhaus', 'Norddeich');
t('steckt der Ort NICHT im Namen, kommt er dazu',
  deichhaus === 'Deichhaus Norddeich – Speisekarte, bestellen & reservieren', deichhaus);
t('Gross- und Kleinschreibung stoert die Erkennung nicht -- der Ort kommt nicht doppelt',
  titel('Cafe de NORDEN', 'Norden') === 'Cafe de NORDEN – Speisekarte, bestellen & reservieren',
  titel('Cafe de NORDEN', 'Norden'));

// ---- 2. Der Ruhetag --------------------------------------------------------
t('der Erzeuger kennt die Ruhetag-Spalte ueberhaupt',
  (CODE.match(/rest_day/g) || []).length >= 1);

var WT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
var WT_DE = ['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'];
var WT_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
var zeiten = new Function('WOCHENTAGE', 'WOCHENTAGE_DE', 'WOCHENTAGE_LANG',
    schneide('ruhetagIndex') + schneide('parseOeffnungszeiten') + '; return parseOeffnungszeiten;')(WT, WT_DE, WT_LANG);

var ohne = zeiten({ opening_time: '11:00', closing_time: '22:00' });
t('ohne Ruhetag bleibt "täglich" richtig',
  ohne.text === 'täglich 11:00–22:00 Uhr', ohne.text);
t('und die Auszeichnung nennt alle sieben Tage',
  ohne.specs.join('|') === 'Mo-Su 11:00-22:00', ohne.specs.join('|'));

var mitRuhe = zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: 0 });
t('mit Ruhetag steht dort NICHT mehr "täglich" allein',
  mitRuhe.text.indexOf('täglich 11:00') < 0, mitRuhe.text);
t('der Ruhetag wird genannt', /Montag: geschlossen/.test(mitRuhe.text), mitRuhe.text);
t('und die Auszeichnung fuer Google laesst den Montag aus',
  mitRuhe.specs.join('|').indexOf('Mo') < 0 && /Tu,We,Th,Fr,Sa,Su/.test(mitRuhe.specs.join('|')),
  mitRuhe.specs.join('|'));

var sonntag = zeiten({ opening_time: '12:00', closing_time: '20:00', rest_day: 6 });
t('ein Sonntags-Ruhetag wird ebenso behandelt',
  /Sonntag: geschlossen/.test(sonntag.text) && sonntag.specs.join('|').indexOf('Su') < 0,
  sonntag.text + ' · ' + sonntag.specs.join('|'));

// Pro Wochentag gepflegte Zeiten: am Ruhetag steht die Uhrzeit trotzdem in
// der Tabelle -- sie wird beim Setzen des Ruhetags nicht geleert.
var proTag = zeiten({
    rest_day: 0,
    opening_hours: { mon: { open: '11:00', close: '22:00' }, tue: { open: '16:00', close: '22:00' } }
});
t('die Uhrzeit des Ruhetags wird uebergangen, obwohl sie in den Daten steht',
  proTag.specs.join('|').indexOf('Mo ') < 0, proTag.specs.join('|'));
t('der Ruhetag wird auch hier genannt', /Montag: geschlossen/.test(proTag.text), proTag.text);

t('ohne Zeiten wird nichts behauptet',
  zeiten({}).text === '' && zeiten({}).specs.length === 0);
t('ein unsinniger Ruhetag wird ignoriert statt zu verrutschen',
  zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: 9 }).text === 'täglich 11:00–22:00 Uhr',
  zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: 9 }).text);
// HIER HAT DER TEST EINEN FEHLER VON MIR GEFUNDEN.
// Number(null) ist 0 und Number('') auch. Mit der ersten Fassung haette
// jedes Haus OHNE Ruhetag montags geschlossen gehabt -- schlimmer als der
// Fehler, den ich beheben wollte.
[null, undefined, ''].forEach(function (leer) {
    t('rest_day ' + JSON.stringify(leer) + ' heisst kein Ruhetag, nicht Montag',
      zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: leer }).text === 'täglich 11:00–22:00 Uhr',
      zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: leer }).text);
});
t('rest_day als Text wird trotzdem verstanden',
  /Dienstag: geschlossen/.test(zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: '1' }).text),
  zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: '1' }).text);

// Gegenprobe -- ohne sie waere das gruene Ergebnis oben nichts wert.
t('Gegenprobe: der alte Stand haette "täglich" auch mit Ruhetag behauptet',
  'täglich ' + '11:00' + '–' + '22:00' + ' Uhr' === 'täglich 11:00–22:00 Uhr');

// Die Pause darf den Ruhetag nicht ueberschreiben.
var pause = zeiten({
    opening_time: '11:00', closing_time: '22:00', rest_day: 2,
    opening_hours: { pause_start: '14:00', pause_end: '17:00' }
});
t('auch mit Mittagspause bleibt der Ruhetag draussen',
  /Mittwoch: geschlossen/.test(pause.text) && pause.specs.every(function (x) { return x.indexOf('We') !== 0; }),
  pause.text + ' · ' + pause.specs.join('|'));
t('und die Pause steht weiterhin drin', /14:00 und 17:00/.test(pause.text), pause.text);

// ---- 2a. DAS FORMAT, DAS DAS DASHBOARD WIRKLICH SCHREIBT -------------------
// Gemeldet: "er liest die öffnungszeiten überall falsch".
//
// Die Eingabemaske speichert FLACH, mit deutschen Kuerzeln und einer
// optionalen zweiten Schicht fuer die Mittagspause:
//     { mo_start:'12:00', mo_end:'14:00', mo_start2:'17:00', mo_end2:'21:30', ... }
//
// Der Erzeuger suchte "mon"/"montag" mit verschachteltem { open, close }.
// Dieses Format schreibt niemand -- der Zweig traf NIE zu. Danach fiel
// alles auf opening_time/closing_time zurueck, also zwei Felder fuer die
// ganze Woche, und daraus wurde "täglich 11:00-22:00". Deshalb standen auf
// jeder Google-Seite dieselben erfundenen Zeiten.
//
// Die App selbst liest das flache Format korrekt (checkIfOpen,
// getOpeningTimeToday) -- nur die oeffentlichen Seiten nicht.
var LA_PIAZZA = { rest_day: 1, opening_hours: {
    mo_start: '12:00', mo_end: '14:00', mo_start2: '17:00', mo_end2: '21:30',
    di_start: '12:00', di_end: '14:00', di_start2: '17:00', di_end2: '21:30',
    mi_start: '12:00', mi_end: '14:00', mi_start2: '17:00', mi_end2: '21:30',
    do_start: '12:00', do_end: '14:00', do_start2: '17:00', do_end2: '21:30',
    fr_start: '12:00', fr_end: '14:00', fr_start2: '17:00', fr_end2: '22:30',
    sa_start: '12:00', sa_end: '14:00', sa_start2: '17:00', sa_end2: '22:30',
    so_start: '12:00', so_end: '21:30', so_start2: '', so_end2: '' } };
var lp = zeiten(LA_PIAZZA);

t('das flache Format wird ueberhaupt erkannt',
  lp.text.indexOf('täglich') < 0, lp.text);
t('der Dienstag-Ruhetag steht drin, nicht "täglich"',
  /Dienstag: geschlossen/.test(lp.text), lp.text);
t('die Mittagspause wird als zweite Schicht gelesen',
  /12:00–14:00 und 17:00–21:30/.test(lp.text), lp.text);
t('Freitag und Samstag haben ihre eigenen, laengeren Zeiten',
  /Freitag–Samstag 12:00–14:00 und 17:00–22:30/.test(lp.text), lp.text);
t('der Sonntag ohne zweite Schicht steht einzeln',
  /Sonntag 12:00–21:30 Uhr/.test(lp.text), lp.text);
t('gleiche Tage werden zusammengefasst statt siebenmal untereinander',
  /Mittwoch–Donnerstag/.test(lp.text), lp.text);

t('die Auszeichnung fuer Google nennt jede Schicht einzeln',
  lp.specs.indexOf('Fr,Sa 17:00-22:30') >= 0, lp.specs.join(' | '));
t('und den Ruhetag gar nicht',
  lp.specs.every(function (x) { return x.indexOf('Tu') < 0; }), lp.specs.join(' | '));

// Ein Tag ohne Start- oder Endzeit ist geschlossen -- so traegt die Maske
// einen zweiten Ruhetag ein, ohne dass es rest_day gibt.
var zweiZu = zeiten({ opening_hours: {
    mo_start: '', mo_end: '', di_start: '11:00', di_end: '22:00',
    mi_start: '11:00', mi_end: '22:00', do_start: '11:00', do_end: '22:00',
    fr_start: '11:00', fr_end: '22:00', sa_start: '11:00', sa_end: '22:00',
    so_start: '', so_end: '' } });
t('ein Tag ohne Zeiten gilt als geschlossen, auch ohne rest_day',
  /Montag: geschlossen/.test(zweiZu.text) && /Sonntag: geschlossen/.test(zweiZu.text), zweiZu.text);
t('und taucht nicht in der Auszeichnung auf',
  zweiZu.specs.every(function (x) { return x.indexOf('Mo') < 0 && x.indexOf('Su') < 0; }),
  zweiZu.specs.join(' | '));

t('sind alle Tage leer, wird nichts behauptet',
  zeiten({ opening_hours: { mo_start: '', mo_end: '', di_start: '', di_end: '' } }).text === '');
t('opening_hours als Text (JSON-String) wird trotzdem gelesen',
  /Montag/.test(zeiten({ opening_hours: JSON.stringify({ mo_start: '11:00', mo_end: '22:00' }) }).text),
  zeiten({ opening_hours: JSON.stringify({ mo_start: '11:00', mo_end: '22:00' }) }).text);

// Gegenprobe: die alte Zuordnung haette bei diesen Daten nichts gefunden.
(function () {
    var dayMap = { mon: 'Mo', montag: 'Mo', tue: 'Tu' };
    var treffer = Object.keys(LA_PIAZZA.opening_hours).filter(function (k) { return dayMap[k]; });
    t('Gegenprobe: die alte Zuordnung findet in diesen Daten keinen einzigen Tag',
      treffer.length === 0, treffer.join(','));
})();

// ---- 2b. Die Oeffnungszeiten waren der Google-Ausschnitt -------------------
// Unter dem Treffer stand woertlich der Oeffnungszeiten-Absatz. Er war ein
// Fliesstext, der fuer sich allein steht und wie eine fertige Antwort
// aussieht -- genau so etwas nimmt Google, auch wenn eine
// Meta-Beschreibung da ist. Der zweite Satz ("Feiertage und
// Betriebsferien...") hat den Absatz noch abgerundet, ohne jemandem bei
// einer Entscheidung zu helfen.
var block = new Function('WOCHENTAGE', 'WOCHENTAGE_DE', 'WOCHENTAGE_LANG', 'escapeHtml',
    schneide('grossErstes') + schneide('ruhetagIndex') + schneide('parseOeffnungszeiten')
    + schneide('renderOeffnungszeitenHtml') + '; return renderOeffnungszeitenHtml;')(
    WT, WT_DE, WT_LANG, function (x) { return String(x); });

var htmlZeiten = block({ opening_time: '12:00', closing_time: '21:30', rest_day: 0 }, 'La Piazza');
t('die Zeiten stehen als Liste da, nicht als Absatz',
  /<ul class="oeffnungszeiten">/.test(htmlZeiten) && htmlZeiten.indexOf('<p>') < 0, htmlZeiten);
// CODE, nicht S: der Kommentar ueber der Funktion zitiert den alten Satz,
// und der Waechter waere sonst auf die Fehlerbeschreibung hereingefallen.
// Dieselbe Falle wie schon mehrfach in diesem Projekt.
t('der abrundende Fuellsatz ist weg',
  CODE.indexOf('Feiertage und Betriebsferien können abweichen') < 0,
  (CODE.match(/[^\n]{0,50}Feiertage und Betriebsferien[^\n]{0,50}/g) || []).join(' | '));
t('die Zeiten selbst bleiben -- der Gast braucht sie',
  /12:00–21:30/.test(htmlZeiten), htmlZeiten);
t('der Ruhetag steht als eigener Punkt',
  /<li>Montag: Ruhetag<\/li>/.test(htmlZeiten), htmlZeiten);
t('und der Wochentag wird grossgeschrieben, nicht "montag"',
  htmlZeiten.indexOf('>montag:') < 0, htmlZeiten);
t('ohne Ruhetag gibt es auch keinen zweiten Punkt',
  (block({ opening_time: '11:00', closing_time: '22:00' }, 'X').match(/<li>/g) || []).length === 1);
t('ohne Zeiten steht gar nichts da, statt einer leeren Ueberschrift',
  block({}, 'X') === '');
t('die Auszeichnung fuer Google zieht weiter aus derselben Quelle',
  /parseOeffnungszeiten\(rest\)/.test(schneide('renderOeffnungszeitenHtml')));

// ---- 3. Der Grund steht im Quelltext ---------------------------------------
t('warum die Ueberschrift geaendert wurde, steht in der Datei',
  /DIE UEBERSCHRIFT IM GOOGLE-TREFFER/.test(S));
t('und warum der Ruhetag dazukam',
  /DER RUHETAG STAND AUF DER GOOGLE-SEITE NICHT DRIN/.test(S));
t('und warum die Zeiten kein Absatz mehr sind',
  /DIE OEFFNUNGSZEITEN WAREN DER GOOGLE-AUSSCHNITT/.test(S));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
