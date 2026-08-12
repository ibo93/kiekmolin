// DER BELEG WAR AUF KASSENROLLE GESETZT -- GEDRUCKT WURDE AUF A4.
//
// GEMELDET WURDE
// --------------
// Bildschirmfoto der Druckvorschau: Pizzeria Al Porto, Epson ET-8550,
// "2 Blätter Papier". Eine sieben Zentimeter schmale Spalte in
// Schreibmaschinenschrift, mitten auf dem Blatt, und der Text lief auf eine
// zweite Seite. Dazu: "schicker schöner keine 0815".
//
// WAS DAHINTERSTECKTE
// -------------------
// Im Beleg stand fest:
//
//     @page { margin: 5mm; size: 80mm auto; }
//     body { font-family: 'Courier New', ...; width: 72mm; }
//
// Das ist die Breite einer Kassenrolle. Wer einen gewoehnlichen Drucker hat
// -- und das ist der Normalfall -- bekam genau das, was im Bildschirmfoto
// steht. Entscheiden kann das nur ein Mensch: welcher Drucker angeschlossen
// ist, sieht der Browser nicht. Also eine Einstellung, Vorgabe A4.
//
// WAS BEIM ABHOLER FEHLTE
// -----------------------
// Der Kasten mit Adresse und QR-Code gab es NUR bei Lieferung. Wer abholte,
// fand auf seinem Beleg weder die Adresse des Restaurants noch eine
// Uhrzeit: er wusste weder wohin noch wann. Jetzt zeigt der Block bei
// Lieferung den Weg zum Gast und bei Abholung den Weg zum Restaurant.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus: die Erklaerung oben im Quelltext zitiert den alten Code.
// Ohne das faellt der Waechter auf die Fehlerbeschreibung herein statt auf
// den Fehler -- das ist in diesem Projekt schon mehrfach passiert.
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

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
var BON = schneide('printOrderBrowser');
t('der Beleg-Erzeuger ist gefunden worden', BON.length > 3000, BON.length);

// ---- 1. Zwei Papierformate, und die Vorgabe ist das haeufigere -------------
var papier = new Function('getPrinterSettings',
    schneide('bonPapierFormat') + '; return bonPapierFormat;');

t('A4 ist die Vorgabe -- das Papier, das in einem gewoehnlichen Drucker liegt',
  papier(function () { return {}; })('R1') === 'a4');
t('wer umgestellt hat, bekommt die Kassenrolle',
  papier(function () { return { R1: { papier: 'thermo' } }; })('R1') === 'thermo');
t('die Einstellung eines anderen Hauses gilt nicht fuer meines',
  papier(function () { return { R2: { papier: 'thermo' } }; })('R1') === 'a4');
t('eine allgemeine Einstellung greift, wenn das Haus keine eigene hat',
  papier(function () { return { 'default': { papier: 'thermo' } }; })('R1') === 'thermo');
t('Unsinn im Feld faellt auf A4 zurueck, nicht auf eine kaputte Seitengroesse',
  papier(function () { return { R1: { papier: 'zettel' } }; })('R1') === 'a4');
t('kaputte Einstellungen stuerzen nicht ab',
  papier(function () { throw new Error('kaputt'); })('R1') === 'a4');

// Auf die Groesse pruefen, nicht auf die Raender -- die sind Gestaltung und
// duerfen sich aendern, ohne dass ein Waechter anschlaegt.
t('beide Seitengroessen stehen im Beleg',
  /@page \{ size: A4;/.test(BON) && /@page \{ size: 80mm auto;/.test(BON));
t('die Groesse haengt an der Einstellung, nicht mehr fest im Text',
  /\$\{istRolle \? stilRolle : stilA4\}/.test(BON));
t('80mm steht nirgends mehr ausserhalb des Rollen-Stils',
  (BON.match(/80mm/g) || []).length === 1, (BON.match(/80mm/g) || []).length);

t('keine Schreibmaschinenschrift mehr',
  BON.indexOf('Courier') < 0, (BON.match(/Courier[^;]*/g) || []).join(' | '));

// Der Grund fuer die zwei Blaetter: Bloecke durften mitten drin umbrechen.
t('kein Block bricht mitten durch',
  /break-inside: avoid; page-break-inside: avoid;/.test(BON));

// ---- 2. Abholung bekommt endlich einen eigenen Block -----------------------
t('der Weg-Block gilt fuer beide Bestellarten, nicht nur fuer Lieferung',
  /var wegZiel = lieferung/.test(BON));
t('bei Lieferung steht die Adresse des Gastes drin',
  /titel: 'Lieferadresse'/.test(BON));
t('bei Abholung die des Restaurants -- vorher stand dort gar nichts',
  /titel: 'Abholung bei'/.test(BON) && /roh: restName \+ \(restAdresse/.test(BON));
t('und die Telefonnummer passt jeweils dazu',
  /tel: order\.customer_phone/.test(BON) && /tel: restPhone/.test(BON));
t('die Uhrzeit steht dabei, wenn das Restaurant eine genannt hat',
  /Lieferung gegen ' : 'Abholbereit gegen '/.test(BON));
t('ohne genannte Uhrzeit steht dort nichts Erfundenes',
  /var fertigStr = '';/.test(BON) && /if \(order\.estimated_time\)/.test(BON));
t('ohne Adresse faellt der Block weg statt leer dazustehen',
  /if \(wegZiel\.roh && wegZiel\.roh\.replace/.test(BON));

t('die Bestellart steht als Wort oben auf dem Beleg',
  /<div class="art-chip">\$\{artText\}<\/div>/.test(BON));
t('und die Ueberschrift beim Kunden passt zur Bestellart',
  /lieferung \? 'Lieferung an' : 'Abholung durch'/.test(BON));

// ---- 3. Erst drucken, wenn die Bilder da sind ------------------------------
// Vorher: setTimeout(print, 300) -- eine geratene Zahl. QR-Code und Logo
// kommen aus dem Netz und brauchen im Restaurant-WLAN regelmaessig laenger.
// Dann ging der Beleg mit einer leeren Flaeche raus.
t('nicht mehr nach 300 Millisekunden blind drucken',
  !/setTimeout\(function\(\) \{ printWindow\.print\(\); \}, 300\)/.test(CODE));
t('es gibt eine Funktion, die auf die Bilder wartet',
  schneide('bonDruckenWennFertig').length > 300);
t('sie wird vom Beleg auch aufgerufen',
  /bonDruckenWennFertig\(printWindow\)/.test(BON) || /bonDruckenWennFertig\(printWindow\)/.test(CODE));

var warten = schneide('bonDruckenWennFertig');
t('gewartet wird auf Laden UND auf Fehlschlag -- sonst haengt es ewig',
  /addEventListener\('load', ab/.test(warten) && /addEventListener\('error', ab/.test(warten));
t('es gibt eine Notbremse, damit ein Beleg nie am Netz haengen bleibt',
  /setTimeout\(los, maxWartenMs \|\| 3000\)/.test(warten));
t('gedruckt wird genau einmal, auch wenn beides zugleich eintritt',
  /if \(fertig\) return;\s*\n\s*fertig = true;/.test(warten));
t('was nicht geladen hat, kommt nicht als leere Flaeche aufs Papier',
  /naturalWidth === 0/.test(warten) && /box\.style\.display = 'none'/.test(warten));
t('ohne Bilder wird nicht unnoetig gewartet',
  /if \(offen === 0\) \{ setTimeout\(los, 120\); return; \}/.test(warten));

// ---- 4. Der Gerichtname kam ungeschuetzt aus der Datenbank -----------------
// Sonderwunsch und Zusaetze waren escapt, ausgerechnet der Name nicht.
t('der Gerichtname wird escapt',
  /escapeHtml\(item\.name \|\| ''\)/.test(BON));
t('die Zusatzangabe auch', /escapeHtml\(item\.options\)/.test(BON));
t('der Sonderwunsch ebenfalls', /escapeHtml\(item\.notes\)/.test(BON));
t('und der Name des Hauses im Kopf',
  /escapeHtml\(restName\.trim\(\)\)/.test(BON));
t('kein roher Name mehr im Beleg',
  BON.indexOf("+ item.name +") < 0, 'roher item.name gefunden');

// ---- 5. Die Zahlart als Wort, nicht als Datenbankschluessel ---------------
var zahl = new Function('order',
    'var _zahl = String(order.payment_method || "").toLowerCase();'
    + (BON.match(/var zahlartText = [\s\S]*?: 'Bar';/) || [''])[0]
    + '; return zahlartText;');
t('bar wird zu "Bar"', zahl({ payment_method: 'cash' }) === 'Bar');
t('Karte wird zu "Karte"',
  zahl({ payment_method: 'card' }) === 'Karte' && zahl({ payment_method: 'card_on_delivery' }) === 'Karte');
t('PayPal behaelt seine Schreibweise', zahl({ payment_method: 'paypal' }) === 'PayPal');
t('ohne Angabe steht "Bar" da, kein leeres Feld', zahl({}) === 'Bar');
t('ein unbekannter Wert wird wenigstens grossgeschrieben, nicht roh gezeigt',
  zahl({ payment_method: 'sofort' }) === 'Sofort');

// ---- 6. Der Wirt findet die Einstellung ------------------------------------
t('das Papierformat steht in den Drucker-Einstellungen',
  /Papier für den Kundenbeleg/.test(H));
t('beide Formate sind anwaehlbar',
  /\['a4', 'A4-Blatt'\], \['thermo', 'Kassenrolle 80 mm'\]/.test(CODE));
t('die aktuelle Wahl ist zu sehen, nicht geraten',
  /var jetzt = bonPapierFormat\(restId\);/.test(CODE));
t('nach dem Umstellen baut sich der Dialog neu auf',
  /setBonPapierFormat\(\\'' \+ restId \+ '\\', \\'' \+ w\[0\] \+ '\\'\); openMultiPrinterSettings\(\);/.test(CODE));
t('und stapelt sich dabei nicht -- ein offenes Fenster kommt vorher weg',
  /var offen = document\.getElementById\('multiPrinterOverlay'\);\s*\n\s*if \(offen\) offen\.remove\(\);/.test(CODE));

// ---- 7. Gegenprobe ---------------------------------------------------------
(function () {
    var alt = "@page { margin: 5mm; size: 80mm auto; }\n    body { font-family: 'Courier New', Courier, monospace; width: 72mm; }";
    t('Gegenprobe: der alte fest verdrahtete Rollen-Beleg wuerde auffallen',
      /Courier/.test(alt) && /size: 80mm auto/.test(alt) && !/istRolle/.test(alt));
})();

// ---- 7b. Die Gestaltung: Briefbogen, nicht Kassenzettel -------------------
// Gewuenscht war "stilvoller". Was den Unterschied macht, wird hier
// festgehalten -- sonst faellt es beim naechsten Umbau still wieder weg.
t('Hausname, Adresse und Dank stehen in einer Serifenschrift',
  (BON.match(/font-family: Baskerville, 'Hoefler Text', Georgia, 'Times New Roman', serif/g) || []).length >= 4,
  (BON.match(/font-family: Baskerville[^;]*/g) || []).length);
// Gewaehlt wurde "Baskerville oder Georgia" -- beides erfuellt, weil eine
// Schriftangabe eine Rangfolge ist: Mac bekommt Baskerville, Windows Georgia.
t('Baskerville steht vorn, Georgia faengt Windows auf',
  /Baskerville, 'Hoefler Text', Georgia, 'Times New Roman', serif/.test(BON));
t('kein Geraet faellt auf Times zurueck, ohne vorher Georgia zu finden',
  BON.indexOf("'Times New Roman', serif") > BON.indexOf('Georgia'));
// "Baskerville Old Face" liegt zwar auf Windows, ist aber eine
// Auszeichnungsschrift mit ganz anderen Formen -- als Rueckfall waere sie
// eine Ueberraschung, keine Absicherung.
t('die falsche Baskerville ist nicht dabei',
  BON.indexOf('Baskerville Old Face') < 0);
// Der Beleg darf nicht am Netz haengen: eine Schrift, die nicht rechtzeitig
// kommt, wuerde die Zeilen nachtraeglich umbrechen -- mitten im Druck.
t('das Druckfenster laedt keine Schrift aus dem Netz',
  BON.indexOf('fonts.googleapis') < 0 && BON.indexOf('@font-face') < 0
  && BON.indexOf('fonts.gstatic') < 0);
t('die Trennlinie traegt das Markenzeichen, vom Hausgruen ins Gelb',
  /\.trennlinie \{[\s\S]{0,220}linear-gradient\(90deg, #00251e 0%, #003d33 55%, #fed65b 100%\)/.test(BON));
t('nur EINE solche Linie -- der zusaetzliche Randstreifen ist raus',
  BON.indexOf('randstreifen') < 0);
t('abgesetzte Flaechen in warmem Papierweiss, nicht in kuehlem Grau',
  (BON.match(/#faf7ee/g) || []).length >= 2 && BON.indexOf('#f7faf9') < 0);
t('die Bestellart steht als Umriss da, nicht als gefuellte Flaeche',
  /\.art-chip \{[^}]*border: 1\.5px solid #003d33; color: #003d33/.test(BON));
t('der Weg-Block hat eine Kante in Hausfarbe statt eines Rahmens ringsum',
  /\.weg \{[^}]*border-left: 3px solid #003d33/.test(BON));
t('Zahlen stehen untereinander -- Ziffern gleicher Breite',
  /font-variant-numeric: tabular-nums/.test(BON));

// ---- 8. Der Grund steht im Quelltext ---------------------------------------
t('warum es zwei Formate gibt, steht in der Datei',
  /AUF WELCHES PAPIER GEHT DER BELEG\?/.test(H));
t('und warum nicht mehr blind gedruckt wird',
  /ERST DRUCKEN, WENN DIE BILDER DA SIND/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
