// DER SERVICE WORKER HAT JEDE SEITE ZUR APP ERKLAERT.
//
// Am 21.08.2026: die Pruefseite /push-check.html war live, auf dem
// Handy kam trotzdem die gewoehnliche Startseite. Nicht ein Fehler --
// die richtige Datei wurde nie geholt.
//
// DER GRUND
//     function istHuelle(req, url) {
//         if (req.mode === 'navigate') return true;   // <- JEDE Navigation
//
// Der Worker hielt jeden Seitenaufruf auf dieser Domain fuer "die App"
// und lieferte index.html aus dem Zwischenspeicher. Fuer die Adressen
// der App ist das genau richtig -- "/", "/lapiazza", "/bestellen"
// bedient index.html. Fuer eine eigene Datei ist es falsch.
//
// Betroffen war nicht nur die Pruefseite: auch die erzeugten
// Google-Seiten. Wer /pizzeria-emden.html direkt aufrief, sah die App.
//
// WAS DARAN LEHRREICH IST
// Der Fehler sass eine Ebene ueber allem, was ich vorher gesucht habe.
// Drei Reparaturen an der Push-Kette, und die vierte Ursache war, dass
// das Geraet die neue Fassung ueberhaupt nicht bekam. Wer einen Fehler
// dreimal am selben Ort sucht, sollte anfangen, den Ort zu bezweifeln.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var sw = fs.readFileSync(KMI + '/sw.js', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Die Funktion aus der Datei schneiden und wirklich laufen lassen --
// nicht bloss den Text danach absuchen.
var i = sw.indexOf('function istHuelle(');
var j = sw.indexOf('\n}', i) + 2;
var istHuelle = new Function('return ' + sw.slice(i, j) + '; istHuelle')();

function navigation(pfad) {
    return [{ mode: 'navigate' }, { origin: 'https://kiekmolin.de', pathname: pfad }];
}
function unterabruf(pfad) {
    return [{ mode: 'no-cors' }, { origin: 'https://kiekmolin.de', pathname: pfad }];
}
// Der Worker vergleicht gegen self.location.origin -- im Test stellen
// wir den her, damit dieselbe Bedingung gilt wie im Browser.
global.self = { location: { origin: 'https://kiekmolin.de' } };

console.log('\n-- 1. Die App selbst ist weiterhin die Huelle --');
// Sonst waere der Zwischenspeicher wertlos und die App laedt bei jedem
// Aufruf 611 KB neu -- am Tisch, im Funkloch, mit dem QR-Code in der Hand.
[['/', 'Startseite'],
 ['/index.html', 'index.html direkt'],
 ['/lapiazza', 'Restaurant-Adresse'],
 ['/bestellen', 'Bestell-Adresse'],
 ['/en/emden', 'englische Adresse']].forEach(function (f) {
    t(f[1] + ' zaehlt als Huelle', istHuelle.apply(null, navigation(f[0])) === true, 'nicht mehr');
});

console.log('\n-- 2. Eine eigene Seite wird nicht mehr verschluckt --');
[['/push-check.html', 'die Pruefseite'],
 ['/pizzeria-emden.html', 'eine erzeugte Google-Seite'],
 ['/en/doener-aurich.html', 'eine englische Google-Seite'],
 ['/LAPIAZZA.HTML', 'auch in Grossbuchstaben'],
 ['/irgendwas.htm', 'auch die kurze Endung']].forEach(function (f) {
    t(f[1] + ' geht ans Netz', istHuelle.apply(null, navigation(f[0])) === false, 'wird abgefangen');
});

console.log('\n-- 3. Was keine Navigation ist, bleibt aussen vor --');
// Bilder, Schriften, Skripte laufen ueber den anderen Zweig.
[['/kiek-logo.png', 'ein Bild'],
 ['/sw.js', 'der Worker selbst'],
 ['/irgendein/pfad', 'ein Unterabruf ohne Endung']].forEach(function (f) {
    t(f[1] + ' ist keine Huelle', istHuelle.apply(null, unterabruf(f[0])) === false, 'faellt hinein');
});
t('fremde Domains sowieso nicht',
  istHuelle({ mode: 'navigate' }, { origin: 'https://google.de', pathname: '/' }) === false, 'faengt fremde ab');

console.log('\n-- 4. Der alte Zwischenspeicher wird weggeworfen --');
// Ohne das haetten die Geraete die Fassung ohne funktionierende
// Benachrichtigungen noch tagelang behalten.
//
// DER NAME MUSS ZUM GAESTEWEG PASSEN.
//
// Am 26.08.2026 war der Fix fuer die Reservierungen seit dem Vorabend
// auf dem Server -- die Wache belegte es, sie reservierte alle 15
// Minuten erfolgreich. Auf dem Handy ging es trotzdem nicht: um 12:13
// ging dort ein Schreibversuch DIREKT an /rest/v1/reservations, also
// aus der alten App. Der Service Worker liefert die Huelle aus dem
// Zwischenspeicher; der erste Aufruf nach einem Deploy zeigt noch die
// alte Seite.
//
// Deshalb nicht "steht v3 da", sondern die Regel dahinter: sobald die
// App den Gast ueber reservation-guest schickt, MUSS der Name
// mindestens v4 sein. Sonst ist die Reparatur auf dem Server heil und
// beim Gast nicht -- und genau das kostet Gaeste.
var name = (sw.match(/var CACHE = '(kmi-shell-v(\d+))';/) || []);
t('der Zwischenspeicher hat einen gezaehlten Namen', !!name[1], 'kein kmi-shell-vN');
var h = require('fs').readFileSync(KMI + '/index.html', 'utf8');
var neuerGastweg = h.indexOf('/.netlify/functions/reservation-guest') > -1;
t('und der Name passt zum Gaesteweg',
  !neuerGastweg || Number(name[2]) >= 4,
  'App schickt Gaeste ueber reservation-guest, Zwischenspeicher steht aber auf v' + name[2]
  + ' -- die Geraete behalten die alte Fassung');
t('und beim Aktivieren wird alles andere geloescht',
  /k === CACHE \? null : caches\.delete\(k\)/.test(sw), 'raeumt nicht auf');
t('der neue Worker uebernimmt sofort',
  /self\.skipWaiting\(\)/.test(sw) && /self\.clients\.claim\(\)/.test(sw), 'wartet auf den naechsten Start');

console.log('\n-- 5. Der Notausgang bleibt --');
// Falls doch etwas klemmt, braucht es keinen Deploy: /?nosw=1 schaltet
// das Zwischenspeichern ab.
t('/?nosw=1 schaltet ab', /searchParams\.get\('nosw'\) === '1'/.test(sw), 'kein Notausgang');
t('und /?nosw=0 wieder ein', /searchParams\.get\('nosw'\) === '0'/.test(sw), 'kein Weg zurueck');

console.log('\n-- 6. Der Grund steht in der Datei --');
t('warum die Regel geaendert wurde',
  sw.indexOf('AM 21.08.2026 GENAU DARAN') > -1, 'kommentarlos geaendert');
t('und was sonst noch betroffen war',
  sw.indexOf('erzeugten Google-Seiten') > -1, 'nur die halbe Wahrheit');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
