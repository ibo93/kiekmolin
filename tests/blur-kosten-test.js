// Prueft, dass die Karten kein backdrop-filter mehr tragen.
//
// DER BEFUND
// Auf der Bestellseite liegen 30 bis 40 Gerichtkarten uebereinander im
// Scrollbereich, auf der Startseite eine Karte pro Betrieb. Jede war
// eine eigene Blur-Ebene, die der Browser bei jedem Scrollbild neu
// rastert.
//
// GEMESSEN, NICHT GESCHAETZT (gedrosselte CPU, 40 Karten, 50 Bilder):
//   mit blur(20px):  Median 692 ms pro Bild
//   ohne blur:       Median 505 ms pro Bild
// Nach dem Entfernen lag dieselbe Messung bei 482 ms.
//
// UND MAN SIEHT ES NICHT
// Die Karte liegt zu 85 Prozent deckend auf einem nahezu einfarbigen
// Untergrund. Ein weichgezeichneter einfarbiger Untergrund sieht aus wie
// ein einfarbiger Untergrund. Pixelvergleich mit und ohne, 281.400
// Pixel: 4 unterscheiden sich, jeder um 1/255.
//
// WAS BLEIBT
// Die Transparenz (0.85). Entfernt wurde nur das Weichzeichnen der 15
// Prozent dahinter. Und: das ist KEIN Freibrief, backdrop-filter
// ueberall zu streichen. Ueber einem Foto sieht man den Unterschied
// sehr wohl -- deshalb behalten Kopfzeile, Modal und Chips ihren.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die Gerichtkarte --');
// NICHT den ersten Treffer nehmen: weiter oben steht der
// Dark-Mode-Block (.dark-mode #menuModal .menu-item-card). Der ist
// uebrigens der beste Beleg fuer die Sache -- er setzt ein
// volldeckendes #1a1a1a, dort war der Blur also zu 100 Prozent
// unsichtbar und wurde trotzdem bei jedem Bild berechnet.
var von = h.indexOf('/* Produkt Cards');
t('der Regelblock mit der Begruendung steht da', von > 0, von);
var dunkel = h.indexOf('.dark-mode #menuModal .menu-item-card');
t('der Dark-Mode-Block steht davor und ist ein anderer', dunkel > 0 && dunkel < von, dunkel + '/' + von);
t('auch der Dark-Mode-Block hat keinen Blur',
  /\.dark-mode #menuModal \.menu-item-card \{[^}]*\}/.test(h)
  && /\.dark-mode #menuModal \.menu-item-card \{[^}]*backdrop-filter[^}]*\}/.test(h) === false,
  'dort steht noch einer');
von = h.indexOf('.menu-item-card {', von);
t('.menu-item-card hat einen Regelblock', von > 0, von);
var regel = h.slice(von, h.indexOf('}', von));
t('kein backdrop-filter mehr', /backdrop-filter/.test(regel) === false, JSON.stringify(regel));
t('auch kein -webkit- davon', /-webkit-backdrop-filter/.test(regel) === false, JSON.stringify(regel));
// Die Transparenz war nicht das Problem und bleibt.
t('die Transparenz bleibt (0.85)',
  /background: rgba\(255,255,255,0\.85\)/.test(regel), JSON.stringify(regel));
t('die Form bleibt (48px Radius)', /border-radius: 48px/.test(regel), JSON.stringify(regel));

console.log('\n-- 2. Die Restaurantkarte --');
var karte = h.match(/<div class="restaurant-card \$\{isVisible[^>]*>/);
t('die Restaurantkarte ist da', !!karte, 'nicht gefunden');
if (karte) {
    t('kein backdrop-filter mehr', /backdrop-filter/.test(karte[0]) === false, karte[0].slice(0, 200));
    t('die Transparenz bleibt', /rgba\(255,255,255,0\.85\)/.test(karte[0]), karte[0].slice(0, 200));
}

console.log('\n-- 3. Der Grund steht dabei --');
// Ohne die Messung im Code liest das jemand in einem halben Jahr, denkt
// "da fehlt der Glaseffekt" und baut ihn wieder ein.
var davor = h.slice(h.indexOf('/* Produkt Cards'), von);
t('die Messung steht als Kommentar dabei',
  davor.indexOf('692 ms') > -1 && davor.indexOf('505 ms') > -1, JSON.stringify(davor.slice(-300)));
t('der Pixelvergleich steht dabei',
  davor.indexOf('281.400') > -1, JSON.stringify(davor.slice(-300)));
t('es steht dabei, dass die Transparenz bleibt',
  davor.indexOf('Transparenz BLEIBT') > -1, JSON.stringify(davor.slice(-200)));
t('die Restaurantkarte verweist darauf',
  /Kein backdrop-filter: siehe \.menu-item-card/.test(h), 'kein Verweis');

console.log('\n-- 4. Kein Kahlschlag --');
// Wichtig: das war eine gezielte Entfernung an zwei Stellen, kein
// Rundumschlag. Ueber einem Foto sieht man den Unterschied sehr wohl.
var uebrig = (h.match(/backdrop-filter/g) || []).length;
t('anderswo gibt es weiter backdrop-filter', uebrig > 100, uebrig);
t('die Modal-Grundflaeche behaelt ihren',
  /\.modal-overlay \{[\s\S]{0,400}?backdrop-filter/.test(h), 'weg');
t('die Kopfzeile der Speisekarte behaelt ihren',
  /<header style="position:sticky[^"]*backdrop-filter/.test(h), 'weg');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
