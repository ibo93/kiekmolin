// Prueft, dass die Karten ihre Glasflaeche HABEN.
//
// Diese Datei stand vorher auf dem Kopf: sie sicherte ab, dass der
// backdrop-filter WEG ist. Das war ein Fehler, und er ist es wert,
// festgehalten zu werden -- damit ihn niemand wiederholt.
//
// WAS RICHTIG WAR
// Auf der Bestellseite liegen 30 bis 40 Gerichtkarten im Scrollbereich,
// jede eine eigene Blur-Ebene. Gemessen (gedrosselte CPU, 40 Karten,
// 50 Scrollbilder): mit blur(20px) 692 ms pro Bild, ohne 505 ms.
// Das Tempo-Argument stimmt.
//
// WAS FALSCH WAR
// Der Pixelvergleich, der die Entscheidung getragen hat, lief NUR im
// Speisekarten-Fenster. Dort liegt hinter der Karte ein nahezu
// einfarbiger Untergrund -- und ein weichgezeichneter einfarbiger
// Untergrund sieht aus wie ein einfarbiger Untergrund. 4 von 281.400
// Pixeln anders, das war korrekt gemessen.
//
// Daraus wurde "man sieht es nie" und der Effekt flog auch auf der
// Startseite und bei den Reservierungen raus. Dort liegen Fotos und
// Farbverlaeufe dahinter. Die Rueckmeldung kam am selben Tag:
// "auf dem online reservierungen hast das glas design weg gemacht warum
//  das war sehr schoen bitte wieder zurueck holen".
//
// ZWEI LEHREN
//   1. Eine Messung gilt fuer den Zusammenhang, in dem sie gemacht
//      wurde. Uebertragen ist Raten mit Zahlen davor.
//   2. Das Glas ist Hausstil, kein Zierrat. Tempo wird woanders geholt.
//
// Deshalb prueft diese Datei ab jetzt die andere Richtung.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die Gerichtkarte hat ihr Glas --');
// NICHT den ersten Treffer nehmen: weiter oben steht der Dark-Mode-Block.
var kommentar = h.indexOf('/* Produkt Cards');
t('der Regelblock steht da', kommentar > 0, kommentar);
var von = h.indexOf('.menu-item-card {', kommentar);
var regel = h.slice(von, h.indexOf('}', von));

t('backdrop-filter: blur(20px) ist da', /backdrop-filter:\s*blur\(20px\)/.test(regel), JSON.stringify(regel));
t('der -webkit-Zwilling fuer Safari ist da',
  /-webkit-backdrop-filter:\s*blur\(20px\)/.test(regel), JSON.stringify(regel));
t('die Transparenz stimmt (0.85)',
  /background:\s*rgba\(255,255,255,0\.85\)/.test(regel), JSON.stringify(regel));
t('die Form stimmt (48px Radius)', /border-radius:\s*48px/.test(regel), JSON.stringify(regel));

console.log('\n-- 2. Die Restaurantkarte auch --');
// Das ist die Karte, um die es ging: Startseite und Reservierungen.
var karte = h.match(/<div class="restaurant-card \$\{isVisible[^>]*>/);
t('die Restaurantkarte ist da', !!karte, 'nicht gefunden');
if (karte) {
    t('backdrop-filter ist zurueck', /backdrop-filter:blur\(20px\)/.test(karte[0]), karte[0].slice(0, 260));
    t('mit -webkit-Zwilling', /-webkit-backdrop-filter:blur\(20px\)/.test(karte[0]), karte[0].slice(0, 260));
    t('die Transparenz stimmt', /rgba\(255,255,255,0\.85\)/.test(karte[0]), karte[0].slice(0, 260));
}

console.log('\n-- 3. Der Fehler ist im Code festgehalten --');
// Ohne die Begruendung optimiert das in einem halben Jahr jemand
// wieder weg -- mit denselben 692/505 ms als Argument.
var davor = h.slice(kommentar, von);
t('die Messung steht dabei',
  davor.indexOf('692 ms') > -1 && davor.indexOf('505 ms') > -1, JSON.stringify(davor.slice(0, 200)));
t('und dass sie NUR im Speisekarten-Fenster galt',
  davor.indexOf('NUR im') > -1, JSON.stringify(davor.slice(0, 400)));
t('und dass hinter der Startseite Fotos liegen',
  /Fotos und Farbverlaeufe/.test(davor), JSON.stringify(davor.slice(-400)));
t('die Lehre steht dabei',
  davor.indexOf('Zusammenhang, in dem sie') > -1, JSON.stringify(davor.slice(-400)));
t('die Restaurantkarte verweist darauf',
  /Das Glas gehoert hierher/.test(h), 'kein Verweis');

console.log('\n-- 4. Die Glasflaechen anderswo sind unberuehrt --');
var anzahl = (h.match(/backdrop-filter/g) || []).length;
t('es gibt weiterhin viele Glasflaechen', anzahl > 100, anzahl);
t('die Modal-Grundflaeche hat ihre',
  /\.modal-overlay \{[\s\S]{0,400}?backdrop-filter/.test(h), 'weg');
t('die Kopfzeile der Speisekarte hat ihre',
  /<header style="position:sticky[^"]*backdrop-filter/.test(h), 'weg');
// Der dunkle Modus setzt ein volldeckendes #1a1a1a -- dort ist der Blur
// wirkungslos, aber das ist eine bewusste Eigenheit dieses Blocks und
// kein Grund, ihn oben zu entfernen.
t('der Dark-Mode-Block bleibt, wie er ist',
  /\.dark-mode #menuModal \.menu-item-card \{[^}]*#1a1a1a/.test(h), 'veraendert');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
