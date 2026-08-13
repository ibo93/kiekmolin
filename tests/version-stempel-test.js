// WELCHER STAND IST LIVE? -- der Build schreibt seinen eigenen Ausweis.
//
// WAS PASSIERT IST
// ----------------
// Der Merge war durch, main trug die fertige Fassung, alle Tests gruen -- und
// auf kiekmolin.de stand trotzdem noch der alte Text ("Renner und Penner", die
// erfundenen Oeffnungszeiten, kein Angebots-Abzeichen). Es sah nach einem
// misslungenen Merge aus. Es war ein fehlender Deploy: Netlify hatte seit dem
// Merge nicht mehr gebaut.
//
// Warum das so lange gedauert hat: ein alter Deploy meldet genau dasselbe
// "ready" wie ein frischer. Es gab keine Stelle, an der die ausgelieferte Seite
// selbst sagt, aus welchem Commit sie gebaut wurde. version.txt ist diese
// Stelle -- ein Aufruf, fuenf Sekunden, Antwort.
//
// WAS HIER GEPRUEFT WIRD
// ----------------------
// Nicht, dass der Quelltext danach aussieht -- sondern dass das Skript wirklich
// laeuft und die Datei wirklich mit den echten Netlify-Werten entsteht.
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var SKRIPT = path.join(WURZEL, 'build-version.js');
var TOML = fs.readFileSync(path.join(WURZEL, 'netlify.toml'), 'utf8');
var QUELLE = fs.readFileSync(SKRIPT, 'utf8');

function baue(umgebung) {
    // Eigener Ordner, damit der Test nie ins echte Projekt schreibt.
    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-version-'));
    var env = {};
    Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
    // Geerbte Netlify-Variablen erst loeschen, sonst faerbt die Umgebung des
    // Testlaufs das Ergebnis ein und der Test misst sich selbst.
    delete env.COMMIT_REF; delete env.BRANCH; delete env.DEPLOY_ID;
    env.SEO_OUT_DIR = tmp;
    Object.keys(umgebung || {}).forEach(function (k) { env[k] = umgebung[k]; });

    var ausgabe = '', code = 0;
    try {
        ausgabe = cp.execSync('node ' + JSON.stringify(SKRIPT),
            { encoding: 'utf8', cwd: WURZEL, env: env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
        ausgabe = (e.stdout || '') + (e.stderr || '');
        code = e.status == null ? 1 : e.status;
    }
    var datei = path.join(tmp, 'version.txt');
    var r = {
        ausgabe: ausgabe,
        code: code,
        da: fs.existsSync(datei),
        inhalt: fs.existsSync(datei) ? fs.readFileSync(datei, 'utf8') : ''
    };
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    return r;
}

// ---- 1. Mit Netlify-Werten, so wie es im echten Build laeuft ---------------
var echt = baue({
    COMMIT_REF: '8b93916d5e4579d098650d92acd837677cd2ded9',
    BRANCH: 'main',
    DEPLOY_ID: '6a7cdbb46864e30008f87626'
});

t('das Skript laeuft ohne Fehler durch', echt.code === 0, echt.ausgabe.slice(0, 300));
t('version.txt entsteht', echt.da === true, echt.ausgabe.slice(0, 300));
t('der Commit steht drin -- vollstaendig, nicht abgeschnitten',
  echt.inhalt.indexOf('8b93916d5e4579d098650d92acd837677cd2ded9') >= 0, JSON.stringify(echt.inhalt));
t('der Branch steht drin', /^branch:\s+main$/m.test(echt.inhalt), JSON.stringify(echt.inhalt));
t('die Deploy-Nummer steht drin -- damit laesst sich der Bau in Netlify finden',
  echt.inhalt.indexOf('6a7cdbb46864e30008f87626') >= 0, JSON.stringify(echt.inhalt));
t('ein Zeitpunkt steht drin', /^gebaut:\s+\d{4}-\d{2}-\d{2}T[\d:.]+Z$/m.test(echt.inhalt), JSON.stringify(echt.inhalt));
t('das Log sagt, wohin gestempelt wurde', /\[version\] .*version\.txt/.test(echt.ausgabe), echt.ausgabe);

// Der eigentliche Zweck ist der Vergleich mit main. Dafuer muss der Commit als
// Ganzes dastehen und nicht in Fliesstext versteckt sein.
(function () {
    var zeile = (echt.inhalt.split('\n').filter(function (z) { return z.indexOf('commit:') === 0; })[0] || '');
    t('die Commit-Zeile enthaelt genau den Commit und sonst nichts',
      zeile.replace('commit:', '').trim() === '8b93916d5e4579d098650d92acd837677cd2ded9', JSON.stringify(zeile));
    t('genau vier Zeilen, keine leeren', echt.inhalt.split('\n').filter(Boolean).length === 4,
      JSON.stringify(echt.inhalt));
})();

// ---- 2. Ohne Netlify-Werte, also lokal -------------------------------------
var lokal = baue({});
t('auch ohne Netlify-Variablen entsteht die Datei', lokal.da === true);
t('und sie ist nicht leer -- "lokal" ist ehrlicher als eine leere Zeile',
  /^commit:\s+lokal$/m.test(lokal.inhalt), JSON.stringify(lokal.inhalt));
t('keine Zeile bleibt unausgefuellt',
  lokal.inhalt.split('\n').filter(Boolean).length === 4
  && lokal.inhalt.split('\n').filter(Boolean).every(function (z) { return /^\w+:\s+\S/.test(z); }),
  JSON.stringify(lokal.inhalt));

// ---- 3. Zwei Baeufe hintereinander unterscheiden sich ----------------------
// Sonst waere der Ausweis wertlos: er soll ja gerade "alt" von "neu" trennen.
(function () {
    var a = baue({ COMMIT_REF: 'aaaaaaa' });
    var b = baue({ COMMIT_REF: 'bbbbbbb' });
    t('unterschiedliche Commits ergeben unterschiedliche Ausweise',
      a.inhalt !== b.inhalt && /^commit:\s+aaaaaaa$/m.test(a.inhalt) && /^commit:\s+bbbbbbb$/m.test(b.inhalt),
      JSON.stringify(a.inhalt) + ' / ' + JSON.stringify(b.inhalt));
})();

// ---- 4. Der Ausweis darf von nichts abhaengen ------------------------------
// Er stand zuerst am Ende von minify-build.js. Genau falsch: dieses Skript
// braucht terser. Faellt terser aus, gaebe es ausgerechnet dann keinen Ausweis,
// wenn man ihn am dringendsten braucht.
t('build-version.js braucht keine fremden Pakete',
  !/require\('(?!fs'|path')/.test(QUELLE.replace(/^\s*\/\/.*$/gm, '')), 'fremdes require gefunden');
t('der Stempel haengt NICHT mehr in minify-build.js',
  fs.readFileSync(path.join(WURZEL, 'minify-build.js'), 'utf8').indexOf('version.txt') < 0);

// ---- 5. Netlify ruft ihn auch wirklich auf ---------------------------------
// Ein Skript, das im Build nicht vorkommt, ist ein Skript, das nichts tut --
// die Sorte Fehler, die hier schon mehrfach vorkam.
(function () {
    var zeile = (TOML.split('\n').filter(function (z) { return z.indexOf('command =') >= 0; })[0] || '');
    t('build-version.js steht im Netlify-Build-Befehl', zeile.indexOf('node build-version.js') >= 0, zeile);
    t('und zwar als LETZTER Schritt, nach dem Minifizieren',
      zeile.indexOf('node build-version.js') > zeile.indexOf('node minify-build.js'), zeile);
    // Ohne "|| echo": der Schritt kann nicht scheitern, und wenn doch, soll man
    // es sehen statt es wegzuschlucken.
    t('der Schritt wird nicht mit "|| echo" stummgeschaltet',
      !/build-version\.js \|\|/.test(zeile), zeile);
})();

// ---- 6. Der Grund steht im Quelltext ---------------------------------------
t('warum es die Datei gibt, ist festgehalten', /fehlt ein DEPLOY -- nicht ein Merge/.test(QUELLE));
t('und warum sie ein eigenes Skript ist', /Der Ausweis darf von nichts\s*\n\/\/ abhaengen/.test(QUELLE),
  'Begruendung fuer das eigene Skript fehlt');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
