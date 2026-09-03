// WAS NICHT IM NETZ STEHEN DARF.
//
// Gefunden am 31.08.2026, als der Betreiber eine ZIP-Datei schickte:
// "das muss geändert sein". Darin lagen vier Sperren, die im Repo
// fehlten. Beim Nachsehen kamen sieben weitere dazu.
//
// DER GRUND STEHT IN EINER ZEILE IN netlify.toml:
//
//     publish = "."
//
// Netlify veroeffentlicht damit das GANZE Verzeichnis. Nicht nur
// index.html und die erzeugten SEO-Seiten -- alles. Nachgezaehlt lagen
// offen abrufbar:
//
//     /tests/          143 Dateien
//     /netlify/         47 Dateien (der Quelltext aller Funktionen)
//     /agentur/         30 Dateien (server.js)
//     /telefon-retter/  28 Dateien
//     /datenbank/       23 SQL-Dateien
//     /sichtbarkeit/    18 Dateien
//     /marketing/        4 Dateien (Gespraechsleitfaden, Angebot)
//     /prospects.json   die Interessentenliste
//
// Keine Schluessel darin -- die liegen bei Netlify. Aber:
//
//   * prospects.json traegt Namen und Telefonnummern von Betrieben.
//     Die Datei im Repo hat zwei Musterzeilen; import-osm.js schreibt
//     sie bei JEDEM Deploy neu und voll. Live lag also die echte Liste.
//
//   * Unsere Tests sind das Schlimmste daran. Sie beschreiben mit Datum
//     JEDE Luecke, die es je gab, und wie sie geschlossen wurde. Fuer
//     jemanden, der eine sucht, ist das kein Quelltext, sondern eine
//     Karte.
//
//   * /datenbank/ enthaelt jede RLS-Regel im Klartext.
//
// WARUM ES NIEMANDEM AUFFIEL
// Eine Datei, die zu viel im Netz steht, wirft keinen Fehler. Sie wird
// ausgeliefert, mit 200, an jeden der danach fragt. Es gibt keine
// Stelle, an der es rot wird -- deshalb diese Datei.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var toml = fs.readFileSync(path.join(KMI, 'netlify.toml'), 'utf8');

// Die Sperren aus netlify.toml einsammeln: from -> {status, force, pos}
function sperren(quelle) {
    var raus = {};
    (quelle.split('[[redirects]]')).forEach(function (block, i) {
        if (!i) return;
        var von = (block.match(/from\s*=\s*"([^"]+)"/) || [])[1];
        if (!von) return;
        raus[von] = {
            status: Number((block.match(/status\s*=\s*(\d+)/) || [])[1]),
            force: /force\s*=\s*true/.test(block),
            pos: quelle.indexOf('from = "' + von + '"')
        };
    });
    return raus;
}
var regeln = sperren(toml);

console.log('\n-- 1. Warum das ueberhaupt noetig ist --');
t('publish veroeffentlicht das ganze Verzeichnis',
  /publish\s*=\s*"\."/.test(toml), 'publish anders gesetzt -- diese Datei neu denken');

console.log('\n-- 2. Jeder Werkzeug-Ordner ist gesperrt --');
// Alles hier liegt im Repo und wird von der App NICHT geladen.
var ZU = ['/agentur/*', '/telefon-retter/*', '/sichtbarkeit/*', '/tests/*',
          '/datenbank/*', '/marketing/*', '/tools/*', '/tailwind/*',
          '/werkzeug/*', '/netlify/*', '/prospects.json'];
ZU.forEach(function (pfad) {
    var r = regeln[pfad];
    t(pfad + ' ist gesperrt', !!r && r.status === 404, r ? ('status ' + r.status) : 'keine Regel');
    // Ohne force gewinnt die vorhandene Datei -- die Sperre waere
    // dekorativ. Genau so eine Regel ist schlimmer als keine: sie
    // sieht aus, als waere es erledigt.
    if (r) t('  und mit force = true', r.force === true, 'ohne force -- die Datei gewinnt');
});

console.log('\n-- 3. Und zwar VOR dem Auffangnetz --');
// /* faengt alles ab, was vorher nicht getroffen hat. Steht eine Sperre
// dahinter, greift sie nie.
var auffang = regeln['/*'];
t('es gibt ein Auffangnetz /*', !!auffang, 'keins');
ZU.forEach(function (pfad) {
    var r = regeln[pfad];
    if (!r || !auffang) return;
    t(pfad + ' steht davor', r.pos < auffang.pos, 'steht dahinter -- greift nie');
});

console.log('\n-- 4. Was oeffentlich BLEIBEN muss --');
// Die Gegenrichtung ist genauso wichtig. Wer hier zu viel sperrt,
// nimmt dem Gast die Allergen-Symbole weg -- und das faellt genauso
// wenig auf wie eine offene Datei.
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
t('index.html laedt Symbole aus /public/', /public\/icons\/allergens\//.test(h), 'nicht mehr?');
t('und /public/ ist NICHT gesperrt', !regeln['/public/*'], 'gesperrt -- Allergen-Symbole weg');
var c = fs.readFileSync(path.join(KMI, 'check.html'), 'utf8');
t('check.html zeigt Logos aus /logos/', /logos\/[a-z0-9-]+\.png/.test(c), 'keine Logos');
t('und /logos/ ist NICHT gesperrt', !regeln['/logos/*'], 'gesperrt -- Logos weg');

console.log('\n-- 5. Die Sperre braucht eine Seite, auf die sie zeigt --');
t('404.html liegt da', fs.existsSync(path.join(KMI, '404.html')), 'fehlt -- die Sperre zeigt ins Leere');

console.log('\n-- 6. Und der naechste neue Ordner faellt auf --');
// DAS IST DER EIGENTLICHE SCHUTZ.
// Eine Liste veraltet. Wer morgen einen Ordner mit einem eigenen
// Server anlegt, denkt nicht an netlify.toml -- und dann liegt der
// wieder offen. Also wird hier jedes Mal NEU nachgesehen.
var ERLAUBT = ['public', 'logos', 'en', 'node_modules', '.git', '.github', '.netlify', 'dist'];
var offen = fs.readdirSync(KMI).filter(function (name) {
    var voll = path.join(KMI, name);
    if (name.charAt(0) === '.' || !fs.statSync(voll).isDirectory()) return false;
    if (ERLAUBT.indexOf(name) > -1) return false;
    return !regeln['/' + name + '/*'];
});
t('kein unbekannter Ordner liegt offen im Netz', offen.length === 0,
  offen.join(', ') + ' -- entweder in netlify.toml sperren oder oben in ERLAUBT eintragen');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
