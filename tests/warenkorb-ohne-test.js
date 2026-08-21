// "+ ohne mit Souvlaki" -- drei Fehler in einer Zeile im Warenkorb.
//
// GEMELDET WURDE
// Bildschirmfoto vom Warenkorb bei Rhodos. Unter "55 Rhodos-Teller"
// stand:
//
//     + ohne mit Souvlaki
//
// Dazu: "ich hab ohne angeklickt er schreibt + anstatt -".
//
// DREI URSACHEN
//
// 1. DAS PLUS. "Bitte ohne" legt seine Haken als price_type 'add' ab --
//    technisch richtig, sie kosten nichts und ersetzen keine Groesse.
//    Die Warenkorb-Anzeige hat daraus aber ein Extra gemacht und ein
//    Plus davorgesetzt. Der Gast streicht etwas weg und liest ein Plus;
//    in der Kueche steht dieselbe Zeile und liest sich wie
//    "zusaetzlich".
//
// 2. DAS "MIT". Die Zutatenliste kommt aus der Beschreibung, hier
//    "Gyros, Tzatziki, mit Souvlaki, Pommes". Der dritte Teil ist keine
//    Zutat, sondern eine Zutat mit Bindewort davor.
//
// 3. (dabei gefunden) Die Liste fehlte bei vielen Gerichten ganz --
//    siehe bitte-ohne-test.js, Abschnitt "Punkt am Ende".

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Weglassen wird als Weglassen erkannt --');
// Der Haken traegt group === 'ohne'. Daran und nur daran laesst sich ein
// Weglassen von einem Extra unterscheiden -- price_type ist bei beiden
// 'add'.
t('toggleOhne legt group "ohne" an',
  /currentItemOptions\.push\(\{ group: 'ohne', option: text, price: 0, price_type: 'add' \}\)/.test(h),
  'anders gespeichert');

var kw = h.indexOf('WEGLASSEN IST KEIN EXTRA');
t('der Warenkorb unterscheidet die beiden', kw > 0, kw);
var block = h.slice(kw, kw + 2500);

t('es gibt einen Test auf group "ohne"',
  /const istOhne = o => \(o && \(o\.group \|\| o\.option_group\)\) === 'ohne'/.test(block),
  'keine Unterscheidung');
t('Extras schliessen das Weglassen aus',
  /\.filter\(o => o\.price_type === 'add' && !istOhne\(o\)\)/.test(block), 'Extras enthalten ohne');
t('das Weglassen wird eigens gesammelt',
  /const ohneText = selOpts\s*\n\s*\.filter\(istOhne\)/.test(block), 'nicht gesammelt');

console.log('\n-- 2. Kein Plus mehr vor "ohne" --');
// Der Kern der Meldung.
t('nur Extras bekommen ein Plus',
  /if \(extrasText\) optionTeile\.push\('\+ ' \+ extrasText\)/.test(block), 'Plus falsch gesetzt');
t('das Weglassen bekommt KEIN Plus',
  /if \(ohneText\) optionTeile\.push\(ohneText\)/.test(block), 'Plus auch beim ohne');
// Und auch kein Minus: im Text steht schon "ohne", "- ohne Souvlaki"
// laese sich doppelt.
t('und auch kein Minus davor',
  /optionTeile\.push\('[-−] ' \+ ohneText\)/.test(block) === false, 'Minus gesetzt');

// Die alte Zeile baute das Plus direkt in die Ausgabe. Sie darf nicht
// mehr dastehen, sonst wirkt die Unterscheidung oben ins Leere.
t('die alte Bauzeile ist weg',
  /\(sizeText \? ' · \+ ' : '\+ '\) \+ extrasText/.test(h) === false, 'noch da');
t('die Ausgabe nimmt die zusammengesetzte Zeile',
  /'<p style="font-size:12px;color:var\(--text-secondary\);line-height:1\.45;margin:3px 0 0;">' \+ allOptionsText/.test(h),
  'baut noch selbst zusammen');

console.log('\n-- 3. Die anderen Anzeigen setzen kein Plus --');
// Kuechenansicht, Bon und Bestelluebersicht geben die Optionen ueber
// optionText aus und haengen nichts davor. Waere das anders, muesste die
// Unterscheidung dort ebenfalls hin.
var plusStellen = (h.match(/'\+ ' \+ (extrasText|optName|opts)/g) || []);
t('nur eine Stelle setzt ueberhaupt ein Plus', plusStellen.length === 1, plusStellen);

console.log('\n-- 4. Das Bindewort vor der Zutat --');
t('es gibt eine Liste der Bindewoerter',
  /var OHNE_BINDEWORT = \/\^\(\?:und\|oder\|mit\|/.test(h), 'fehlt');
t('sie greift auch am Wortende',
  /\(\?:\\s\+\|\$\)\/i;/.test(h), 'nur mit Leerzeichen dahinter');
t('bindewortWeg wird auf jede Zutat angewandt',
  /\.map\(bindewortWeg\)/.test(h), 'nicht angewandt');
t('was danach leer ist, faellt raus',
  /\.map\(bindewortWeg\)\s*\n\s*\.filter\(Boolean\)/.test(h), 'leere bleiben');
// "Pommes" und "dazu Pommes" werden nach dem Abschneiden gleich.
t('Doppelte nach dem Abschneiden werden entfernt',
  /alle\.findIndex\(function \(x\) \{ return x\.toLowerCase\(\) === z\.toLowerCase\(\); \}\) === i/.test(h),
  'Doppelte bleiben');

console.log('\n-- 5. Zubereitungen sind keine Zutaten --');
t('es gibt eine Liste dafuer', /var OHNE_KEINE_ZUTAT = \[/.test(h), 'fehlt');
t('"paniert" steht drin', /'paniert'/.test(h), 'fehlt');
t('sie wird beim Filtern benutzt',
  /if \(OHNE_KEINE_ZUTAT\.indexOf\(k\) >= 0\) return false;/.test(h), 'unbenutzt');

console.log('\n-- 6. Werbung bleibt draussen --');
// Frueher trennte allein der Punkt am Ende Werbung von Zutaten. Der
// musste weg, damit "Gyros, Tzatziki, Pommes, Salat." durchgeht -- also
// braucht es ein anderes Merkmal.
t('ein Punkt am Ende wird abgeschnitten',
  /text = text\.replace\(\/\\s\*\\\.\\s\*\$\/, ''\);/.test(h), 'fehlt');
t('innere Satzzeichen bleiben ein Ausschluss',
  /if \(\/\[\.!\?;:\]\/\.test\(text\)\) return \[\];/.test(h), 'fehlt');
// Deutsch schreibt Substantive gross -- Zutaten sind Substantive,
// Werbung besteht aus Adjektiven.
t('Gross-/Kleinschreibung entscheidet',
  /if \(gross \* 3 < teile\.length \* 2\) return \[\];/.test(h), 'fehlt');
t('der Grund steht als Kommentar dabei',
  h.indexOf('ZUTATEN SIND SUBSTANTIVE') > -1, 'keine Begruendung');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
