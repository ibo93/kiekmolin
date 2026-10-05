// SCHRIFTEN GEHOEREN INS HAUS, NICHT ZU GOOGLE.
//
// Bis zum 05.10.2026 standen im Kopf von index.html zwei <link> auf
// fonts.googleapis.com. Jeder Gast, der die Seite oeffnete, schickte damit
// seine IP-Adresse an Google -- beim Laden, vor dem Banner, ohne dass er
// etwas anklicken konnte.
//
// WAS DAS KOSTET
// LG Muenchen I, 20.01.2022, Az. 3 O 17493/20: 100 Euro Schadensersatz an
// einen einzelnen Besucher. BGH, 18.11.2024, VI ZR 10/24: schon der
// Verlust der Kontrolle ueber die eigenen Daten kann ein Schaden sein.
//
// WARUM ES NIEMANDEM AUFFIEL
// Es sieht aus wie nichts. Die Schrift kommt an, die Seite sieht richtig
// aus, in der Konsole steht keine Zeile. Genau die Sorte Fehler, die man
// nur findet, wenn man danach sucht -- die Symbolschrift lag aus demselben
// Grund laengst im Projekt, diese zwei hatte niemand nachgezogen.
//
// WAS DIESE DATEI PRUEFT
//   1. Kein Verweis auf einen fremden Schrift-Dienst, in KEINER Datei,
//      die ein Gast laedt.
//   2. Die vier Schriftdateien liegen wirklich da und sind echte woff2.
//   3. Jede @font-face-Quelle zeigt auf eine Datei, die existiert.
//
// GEGENPROBE BEIM SCHREIBEN (05.10.2026): den alten <link> wieder
// eingesetzt -> Punkt 1 wurde rot. public/fonts/inter-latin.woff2
// weggeschoben -> Punkt 2 und 3 wurden rot. Beides danach zurueckgedreht.
var path = require('path');
var fs = require('fs');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

// Dienste, die eine Schrift ausliefern und dabei die IP des Gastes sehen.
var FREMDE_SCHRIFTDIENSTE = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'use.typekit.net',
    'fast.fonts.net',
    'cloud.typography.com',
    'fonts.bunny.net',
    'use.fontawesome.com'
];

// Jede Datei, die ein Gast im Browser laedt. Nicht nur index.html: die
// SEO-Seiten sind oeffentlich und werden sogar beworben.
var GASTDATEIEN = fs.readdirSync(KMI)
    .filter(function (f) { return /\.html$/i.test(f); })
    .map(function (f) { return path.join(KMI, f); });

console.log('\n-- 1. Keine Schrift von fremden Servern --');
console.log('   (' + GASTDATEIEN.length + ' HTML-Dateien geprueft)');

// Kommentare zaehlen nicht: in index.html steht die Begruendung, warum es
// die Links NICHT mehr gibt, und darin kommen die Namen vor. Gesucht wird
// deshalb nur in href/src/url() -- also dort, wo der Browser wirklich
// etwas abholt.
function ohneKommentare(s) {
    return String(s).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

FREMDE_SCHRIFTDIENSTE.forEach(function (dienst) {
    var schuldige = [];
    GASTDATEIEN.forEach(function (datei) {
        var s = ohneKommentare(fs.readFileSync(datei, 'utf8'));
        var muster = new RegExp('(?:href|src)\\s*=\\s*["\']https?://' + dienst.replace(/\./g, '\\.')
                              + '|url\\(\\s*["\']?https?://' + dienst.replace(/\./g, '\\.'), 'i');
        if (muster.test(s)) schuldige.push(path.basename(datei));
    });
    t('nichts wird von ' + dienst + ' geholt', schuldige.length === 0, schuldige);
});

console.log('\n-- 2. Die Schriften liegen im Projekt --');

var ERWARTET = [
    'public/fonts/epilogue-latin.woff2',
    'public/fonts/epilogue-latin-ext.woff2',
    'public/fonts/inter-latin.woff2',
    'public/fonts/inter-latin-ext.woff2',
    'public/fonts/material-symbols-kin.woff2'
];

ERWARTET.forEach(function (rel) {
    var p = path.join(KMI, rel);
    var da = fs.existsSync(p);
    // Eine leere oder kaputte Datei faellt sonst erst dem Gast auf: die
    // Schrift kommt nicht, die Seite zeigt die Systemschrift, niemand
    // merkt etwas. Deshalb die ersten vier Bytes pruefen.
    var echt = false, groesse = 0;
    if (da) {
        var b = fs.readFileSync(p);
        groesse = b.length;
        echt = b.length > 1000 && b.slice(0, 4).toString('latin1') === 'wOF2';
    }
    t(rel + ' ist eine echte woff2-Datei', da && echt, { da: da, bytes: groesse });
});

console.log('\n-- 3. Jede @font-face-Quelle zeigt auf eine Datei, die es gibt --');

var html = fs.readFileSync(KMI + '/index.html', 'utf8');

// url(...) innerhalb von @font-face. data: ist in Ordnung -- so liegt die
// Symbolschrift drin.
var quellen = [];
var reBlock = /@font-face\s*\{([^}]*)\}/g, m;
while ((m = reBlock.exec(html)) !== null) {
    var reUrl = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g, u;
    while ((u = reUrl.exec(m[1])) !== null) quellen.push(u[1].trim());
}

t('es gibt ueberhaupt @font-face-Bloecke', quellen.length >= 4, quellen.length);

var fehlend = [];
quellen.forEach(function (q) {
    if (q.indexOf('data:') === 0) return;                 // eingebettet, nichts zu holen
    if (/^https?:\/\//i.test(q)) { fehlend.push(q + ' (fremder Server)'); return; }
    var p = path.join(KMI, q.replace(/^\//, ''));
    if (!fs.existsSync(p)) fehlend.push(q + ' (Datei fehlt)');
});
t('alle Quellen sind erreichbar und liegen im Projekt', fehlend.length === 0, fehlend);

console.log('\n-- 4. Die Schriftnamen passen zu dem, was die App benutzt --');

// Ein @font-face auf 'Epilogue Variable' waere nutzlos: im Haus steht
// ueberall font-family:'Epilogue'. Die Seite saehe dann aus wie vorher --
// mit Systemschrift, ohne Fehlermeldung.
['Epilogue', 'Inter'].forEach(function (name) {
    var re = new RegExp("@font-face\\s*\\{[^}]*font-family\\s*:\\s*['\"]" + name + "['\"]", 'i');
    t("es gibt ein @font-face fuer genau '" + name + "'", re.test(html), null);
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
