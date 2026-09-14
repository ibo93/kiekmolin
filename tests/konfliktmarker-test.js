// SIND NOCH KONFLIKTMARKER IM BAUM?
//
// GEFUNDEN AM 14.09.2026, IN EINEM COMMIT, DER SCHON GESCHRIEBEN WAR:
//
//     netlify/functions/gastweg-wache.js:81: <<<<<<< HEAD
//
// Beim Aufloesen eines Squash-Merge-Konflikts habe ich sieben Dateien von
// Hand entschieden -- und die achte uebersehen, weil git ihre Zeile in
// meiner Ausgabe abgeschnitten hatte. Danach "git add -A": die Marker
// wanderten mit in den Commit.
//
// Gemerkt habe ich es nur, weil ZUFAELLIG ein Test genau diese Datei
// laedt und mit einem SyntaxError starb. Haette die Datei kein Test
// angefasst, waere sie so zu Netlify gegangen -- und dort ist eine
// Function mit Konfliktmarkern kein Syntaxfehler in einem Test, sondern
// eine Wache, die nicht mehr laeuft.
//
// Dieser Test haengt nicht davon ab, ob jemand die Datei laedt. Er sieht
// nach.

var fs   = require('fs');
var path = require('path');

var WURZEL = path.join(__dirname, '..');
var AUS    = ['node_modules', '.git', 'dist', 'build', '.netlify', 'coverage'];
var ENDET  = ['.js', '.html', '.css', '.json', '.sql', '.md', '.toml', '.yml', '.yaml'];

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}

function dateien(dir, raus) {
    raus = raus || [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
        if (e.name.charAt(0) === '.' && e.name !== '.github') return;
        if (AUS.indexOf(e.name) >= 0) return;
        var voll = path.join(dir, e.name);
        if (e.isDirectory()) { dateien(voll, raus); return; }
        if (ENDET.indexOf(path.extname(e.name)) >= 0) raus.push(voll);
    });
    return raus;
}

// Am Zeilenanfang und mit der Form, die git wirklich schreibt. Ein
// "=======" als Trennstrich in einem Kommentar ist KEIN Konflikt --
// davon stehen im Projekt einige, und ein Test, der die anmeckert,
// wird abgeschaltet und faengt dann gar nichts mehr.
var MARKER = [
    { name: '<<<<<<<', re: /^<<<<<<< .+$/m },
    { name: '>>>>>>>', re: /^>>>>>>> .+$/m }
];

var alle = dateien(WURZEL);
t('es gibt ueberhaupt Dateien zu pruefen', alle.length > 50, alle.length);

var funde = [];
alle.forEach(function (f) {
    var inhalt;
    try { inhalt = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    MARKER.forEach(function (m) {
        if (!m.re.test(inhalt)) return;
        var zeile = inhalt.split('\n').findIndex(function (z) { return m.re.test(z); }) + 1;
        funde.push(path.relative(WURZEL, f) + ':' + zeile + ' (' + m.name + ')');
    });
});

t('kein Konfliktmarker im Baum', funde.length === 0, funde.join(' | '));

// GEGENPROBE IM TEST SELBST.
//
// Ohne sie waere das hier ein Test, der immer gruen ist und nie etwas
// prueft -- der Fall aus Regel 5.
var probe = 'var a = 1;\n<<<<<<< HEAD\nvar b = 2;\n=======\nvar b = 3;\n>>>>>>> origin/main\n';
t('und er findet einen, wenn einer da ist', MARKER[0].re.test(probe) && MARKER[1].re.test(probe));
t('ein Trennstrich in einem Kommentar ist kein Konflikt',
  !MARKER[0].re.test('// ======= TEIL B =======\n') && !MARKER[1].re.test('// ======= TEIL B =======\n'));
t('"<<<<<<<" ohne Namen dahinter zaehlt nicht', !MARKER[0].re.test('a <<<<<<< b\n'));

console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
