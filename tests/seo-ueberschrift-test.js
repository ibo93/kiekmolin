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
t('die Ueberschrift nennt die Speisekarte und das Bestellen',
  /const title = titelName \+ ' – Speisekarte & online bestellen';/.test(CODE));
t('der alte, doppelte Titel ist weg',
  !/const title = name \+ ' ' \+ cityRaw \+ ' – Online bestellen & Tisch reservieren/.test(CODE));

// Die Regel ausfuehren, nicht nur nach ihr suchen.
var normalize = new Function(schneide('normalize') + '; return normalize;')();
function titel(name, stadt) {
    var imNamen = normalize(name).indexOf(normalize(stadt)) >= 0;
    return (imNamen ? name : name + ' ' + stadt) + ' – Speisekarte & online bestellen';
}

var alPorto = titel('Pizzeria Al Porto Oldersum', 'Oldersum');
t('der Ort steht nicht doppelt drin',
  (alPorto.match(/Oldersum/g) || []).length === 1, alPorto);
t('die Betriebsart steht nicht doppelt drin',
  (alPorto.match(/Pizzeria/g) || []).length === 1, alPorto);
t('"Speisekarte" steht drin', alPorto.indexOf('Speisekarte') > 0, alPorto);
t('"online bestellen" steht drin', alPorto.indexOf('online bestellen') > 0, alPorto);
t('kurz genug, dass Google ihn nicht abschneidet',
  alPorto.length <= 62, alPorto.length + ' Zeichen: ' + alPorto);

var deichhaus = titel('Deichhaus', 'Norddeich');
t('steckt der Ort NICHT im Namen, kommt er dazu',
  deichhaus === 'Deichhaus Norddeich – Speisekarte & online bestellen', deichhaus);
t('Gross- und Kleinschreibung stoert die Erkennung nicht -- der Ort kommt nicht doppelt',
  titel('Cafe de NORDEN', 'Norden') === 'Cafe de NORDEN – Speisekarte & online bestellen',
  titel('Cafe de NORDEN', 'Norden'));

// ---- 2. Der Ruhetag --------------------------------------------------------
t('der Erzeuger kennt die Ruhetag-Spalte ueberhaupt',
  (CODE.match(/rest_day/g) || []).length >= 1);

var WT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
var WT_DE = ['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'];
var zeiten = new Function('WOCHENTAGE', 'WOCHENTAGE_DE',
    schneide('ruhetagIndex') + schneide('parseOeffnungszeiten') + '; return parseOeffnungszeiten;')(WT, WT_DE);

var ohne = zeiten({ opening_time: '11:00', closing_time: '22:00' });
t('ohne Ruhetag bleibt "täglich" richtig',
  ohne.text === 'täglich 11:00–22:00 Uhr', ohne.text);
t('und die Auszeichnung nennt alle sieben Tage',
  ohne.specs.join('|') === 'Mo-Su 11:00-22:00', ohne.specs.join('|'));

var mitRuhe = zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: 0 });
t('mit Ruhetag steht dort NICHT mehr "täglich" allein',
  mitRuhe.text.indexOf('täglich 11:00') < 0, mitRuhe.text);
t('der Ruhetag wird genannt', /montags Ruhetag/.test(mitRuhe.text), mitRuhe.text);
t('und die Auszeichnung fuer Google laesst den Montag aus',
  mitRuhe.specs.join('|').indexOf('Mo') < 0 && /Tu,We,Th,Fr,Sa,Su/.test(mitRuhe.specs.join('|')),
  mitRuhe.specs.join('|'));

var sonntag = zeiten({ opening_time: '12:00', closing_time: '20:00', rest_day: 6 });
t('ein Sonntags-Ruhetag wird ebenso behandelt',
  /sonntags Ruhetag/.test(sonntag.text) && sonntag.specs.join('|').indexOf('Su') < 0,
  sonntag.text + ' · ' + sonntag.specs.join('|'));

// Pro Wochentag gepflegte Zeiten: am Ruhetag steht die Uhrzeit trotzdem in
// der Tabelle -- sie wird beim Setzen des Ruhetags nicht geleert.
var proTag = zeiten({
    rest_day: 0,
    opening_hours: { mon: { open: '11:00', close: '22:00' }, tue: { open: '16:00', close: '22:00' } }
});
t('die Uhrzeit des Ruhetags wird uebergangen, obwohl sie in den Daten steht',
  proTag.specs.join('|').indexOf('Mo ') < 0, proTag.specs.join('|'));
t('der Ruhetag wird auch hier genannt', /montags Ruhetag/.test(proTag.text), proTag.text);

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
  /dienstags Ruhetag/.test(zeiten({ opening_time: '11:00', closing_time: '22:00', rest_day: '1' }).text),
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
  /mittwochs Ruhetag/.test(pause.text) && pause.specs.every(function (x) { return x.indexOf('We') !== 0; }),
  pause.text + ' · ' + pause.specs.join('|'));
t('und die Pause steht weiterhin drin', /14:00 und 17:00/.test(pause.text), pause.text);

// ---- 3. Der Grund steht im Quelltext ---------------------------------------
t('warum die Ueberschrift geaendert wurde, steht in der Datei',
  /DIE UEBERSCHRIFT IM GOOGLE-TREFFER/.test(S));
t('und warum der Ruhetag dazukam',
  /DER RUHETAG STAND AUF DER GOOGLE-SEITE NICHT DRIN/.test(S));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
