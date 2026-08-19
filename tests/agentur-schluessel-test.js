// Prueft, mit welchem Schluessel die Agentur-Werkzeuge an die Datenbank gehen.
//
// Warum das ein eigener Test ist: sichtbarkeit/ und telefon-retter/ haengen
// an DERSELBEN Supabase-Datenbank wie die App. Sie liefen bisher mit dem
// oeffentlichen Schluessel -- das ging nur gut, solange die RLS-Regeln offen
// standen.
//
// Der Fehler, den das verhindern soll, ist ein leiser: nach dem Zumachen von
// orders und reservations bekaeme der anon-Key keine Fehlermeldung, sondern
// LEERE LISTEN. Der Monatsbericht saehe aus wie "dieser Betrieb hatte keine
// einzige Bestellung". Ein Ergebnis, das keines ist.

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var LIBS = ['sichtbarkeit/lib/supabase.js', 'telefon-retter/lib/supabase.js'];

// Ein Token bauen, dem man die Rolle ansieht -- ohne Unterschrift, es wird
// hier nur gelesen, nie verschickt.
function token(rolle) {
    var nutz = Buffer.from(JSON.stringify({ role: rolle })).toString('base64').replace(/=+$/, '');
    return 'kopf.' + nutz + '.unterschrift';
}

// Das Modul in einem eigenen Node-Prozess laden, damit die Umgebung sauber ist.
function rolleMit(datei, umgebung) {
    var raus = cp.execFileSync(process.execPath, ['-e',
        'console.log(require(' + JSON.stringify(path.join(WURZEL, datei)) + ').schluesselRolle())'
    ], { env: Object.assign({}, process.env, umgebung), encoding: 'utf8' });
    return raus.trim();
}

console.log('\n-- Welcher Schluessel gewinnt --');

LIBS.forEach(function (datei) {
    var kurz = datei.split('/')[0];

    // Ohne alles: wie bisher. Wichtig, damit dieser Umbau heute nichts aendert.
    t(kurz + ': ohne .env laeuft es weiter mit dem oeffentlichen Schluessel',
      rolleMit(datei, { SUPABASE_SERVICE_KEY: '', SUPABASE_ANON_KEY: '' }) === 'anon');

    // Beide Namen muessen gelten: SUPABASE_SERVICE_KEY heisst er in den
    // Netlify-Functions dieses Projekts, SUPABASE_SERVICE_ROLE_KEY in
    // Supabases Doku. Wer den einen setzt und der andere zaehlt, sucht lange.
    t(kurz + ': auch der Name aus der Supabase-Doku gilt',
      rolleMit(datei, {
          SUPABASE_SERVICE_KEY: '',
          SUPABASE_SERVICE_ROLE_KEY: token('service_role')
      }) === 'service_role');

    t(kurz + ': der Dienstschluessel schlaegt den oeffentlichen',
      rolleMit(datei, {
          SUPABASE_SERVICE_KEY: token('service_role'),
          SUPABASE_ANON_KEY: token('anon')
      }) === 'service_role');

    t(kurz + ': ohne Dienstschluessel gilt der aus der .env',
      rolleMit(datei, {
          SUPABASE_SERVICE_KEY: '',
          SUPABASE_ANON_KEY: token('anon')
      }) === 'anon');

    t(kurz + ': ein kaputtes Token stuerzt nicht ab',
      rolleMit(datei, { SUPABASE_SERVICE_KEY: 'voellig-kaputt' }) === 'unbekannt');
});

console.log('\n-- Der Schluessel darf nie in den Browser --');

// Hier stand eine Pruefung, die durch einen Klammerfehler auf "|| true"
// endete -- sie konnte nie fehlschlagen. Ein Test, der immer gruen ist, ist
// schlimmer als keiner: er behauptet Sicherheit, die er nie geprueft hat.
// Ersetzt durch die Pruefung unten, die ALLE eingecheckten Dateien durchgeht
// und dabei den Inhalt der Token dekodiert, statt nach Wortlaut zu suchen.

// Der harte Teil: nirgendwo im ausgelieferten Code darf ein Token mit der
// Rolle service_role stehen. Geprueft wird der dekodierte Inhalt, nicht der
// Wortlaut -- ein Schluessel sieht sonst aus wie beliebiger Buchstabensalat.
function dienstSchluesselIn(text) {
    var treffer = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    return treffer.some(function (tk) {
        try {
            var nutz = JSON.parse(Buffer.from(tk.split('.')[1], 'base64').toString('utf8'));
            return nutz.role === 'service_role';
        } catch (e) { return false; }
    });
}

// Die git-gestuetzten Pruefungen brauchen ein echtes Repository. In einer
// blossen Kopie des Ordners (ohne .git) gibt es keins -- dann sagt der Test
// das ausdruecklich, statt abzustuerzen ODER stillschweigend gruen zu sein.
// In der CI liegt .git vor, dort laufen sie also immer.
var imRepo = true;
try { cp.execFileSync('git', ['-C', WURZEL, 'rev-parse', '--git-dir'], { stdio: 'ignore' }); }
catch (e) { imRepo = false; }

if (!imRepo) console.log('HINWEIS | kein git-Repository -- die Leck- und .gitignore-Pruefungen laufen hier nicht');

var eingecheckt = !imRepo ? [] : cp.execSync('git -C ' + JSON.stringify(WURZEL) + ' ls-files', { encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter(function (f) { return /\.(js|html|json|md|txt|sql|yml|example)$/.test(f); });

var verdaechtig = eingecheckt.filter(function (f) {
    try { return dienstSchluesselIn(fs.readFileSync(path.join(WURZEL, f), 'utf8')); }
    catch (e) { return false; }
});
if (imRepo) {
    t('kein Dienstschluessel in einer eingecheckten Datei (' + eingecheckt.length + ' geprueft)',
      verdaechtig.length === 0, verdaechtig.join(', '));
}

console.log('\n-- .env bleibt draussen --');

function ignoriert(p) {
    try {
        cp.execFileSync('git', ['-C', WURZEL, 'check-ignore', '-q', p], { stdio: 'ignore' });
        return true;
    } catch (e) { return false; }
}

if (imRepo) {
    ['.env', 'sichtbarkeit/.env', 'telefon-retter/.env', 'agentur/.env.local'].forEach(function (p) {
        t(p + ' ist von git ausgeschlossen', ignoriert(p) === true);
    });
    ['sichtbarkeit/.env.example', 'telefon-retter/.env.example'].forEach(function (p) {
        t(p + ' bleibt eincheckbar (nur Platzhalter)', ignoriert(p) === false);
    });
}

console.log('\n-- Die Vorlage sagt, was zu tun ist --');

['sichtbarkeit/.env.example', 'telefon-retter/.env.example'].forEach(function (p) {
    var s = fs.readFileSync(path.join(WURZEL, p), 'utf8');
    t(p + ' nennt SUPABASE_SERVICE_KEY', /SUPABASE_SERVICE_KEY/.test(s));
    t(p + ' warnt, dass er nicht in den Browser gehoert', /Browser/.test(s));
});

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
