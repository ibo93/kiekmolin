// EIN SYNTAXFEHLER KILLT DEN GANZEN BLOCK -- LEISE.
//
// Gemeldet am 04.09.2026: "kueche geht nicht auf ist das normal?", kurz
// darauf "tagesabschluss, TV-karte".
//
// Ursache: in openKitchenDisplay() stand rohes CSS. Ein einzeiliger
// Kommentar
//
//     // Responsive CSS per JS einfuegen (</style> in innerHTML ...)
//
// war beim Einbau des Dunkelmodus (#201) aufgeschnitten worden, und 157
// Zeilen CSS lagen dazwischen -- mitten im JavaScript.
//
// Der Browser wirft bei einem Syntaxfehler den KOMPLETTEN <script>-Block
// weg. Nicht die eine Funktion: alles. Rund 2100 Zeilen, darunter
// openKitchenDisplay, openDayCloseReport und openTvModeForRestaurant.
//
// Am Bildschirm sah das so aus: man klickt auf "Kueche" -- und nichts
// passiert. Keine Fehlermeldung, keine Spur, nichts. Der genau stille
// Ausfall aus Regel 6, nur eine Etage tiefer: nicht eine leere Liste,
// sondern ein Fuenftel der App, das es gar nicht gibt.
//
// Unsere ~4500 Tests haben es nicht gesehen, weil sie Quelltext LESEN.
// Sie schneiden einzelne Funktionen heraus und fuehren die aus -- der
// Fehler lag zwischen den Funktionen. Genau die Luecke, vor der Regel 5
// warnt.
//
// Dieser Test parst jeden <script>-Block der Seite als Ganzes. Er
// haette den Fehler in dem Moment gefunden, in dem #201 entstand.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Jede HTML-Datei, die der Gast oder der Wirt laedt.
var dateien = fs.readdirSync(KMI).filter(function (f) { return /\.html$/.test(f); });
t('es gibt HTML-Dateien zu pruefen', dateien.length > 0, dateien.length);

dateien.forEach(function (datei) {
    var s = fs.readFileSync(path.join(KMI, datei), 'utf8');

    // Nur echte JS-Bloecke: kein src=, kein type= (JSON-LD, Vorlagen).
    var re = /<script(?![^>]*\bsrc=)(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/g;
    var m, bloecke = 0, kaputt = [];
    while ((m = re.exec(s))) {
        bloecke++;
        var zeile = s.slice(0, m.index).split('\n').length;
        try {
            new Function(m[1]);
        } catch (e) {
            kaputt.push('ab Zeile ' + zeile + ': ' + e.message);
        }
    }

    console.log('\n-- ' + datei + ': ' + bloecke + ' Skript-Bloecke --');
    // Eine Seite OHNE JavaScript ist voellig in Ordnung -- impressum.html
    // braucht keins. Der erste Anlauf dieses Tests forderte hier einen
    // Block und wurde bei vier harmlosen Seiten rot. Ein Test, der etwas
    // einfordert, das gar keine Anforderung ist, kostet nur Zeit.
    t(datei + ': kein Block hat einen Syntaxfehler', kaputt.length === 0, kaputt.join(' | '));
});

// index.html ist die App. Findet der Test dort keine Bloecke, stimmt der
// Ausschnitt nicht mehr und der Test prueft in Wahrheit gar nichts.
var appBloecke = (fs.readFileSync(path.join(KMI, 'index.html'), 'utf8')
    .match(/<script(?![^>]*\bsrc=)(?![^>]*\btype=)[^>]*>/g) || []).length;
t('index.html: die Skript-Bloecke wurden gefunden', appBloecke >= 10, appBloecke);

// ---- Und die Wachhunde gegen den konkreten Rueckfall -------------------
console.log('\n-- Kein CSS im JavaScript --');
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// Der Kommentar, der damals aufgeschnitten wurde, muss eine Zeile sein.
t('der aufgeschnittene Kommentar ist wieder eine Zeile',
  /\/\/ Responsive CSS per JS einfügen \(<\/style> in innerHTML bricht HTML-Parser\)/.test(h),
  'der Kommentar ist wieder zerlegt');

// Die drei Funktionen, die dadurch verschwunden waren.
['openKitchenDisplay', 'openDayCloseReport', 'openTvModeForRestaurant'].forEach(function (f) {
    t(f + ' steht auf oberster Ebene',
      new RegExp('^(async )?function ' + f + '\\b', 'm').test(h), 'nicht gefunden');
});

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
