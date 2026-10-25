// EIN UNVOLLSTAENDIGER BAU GEHT NICHT LIVE (25.10.2026)
//
// Gemessen am 23.10.2026: OpenStreetMap lieferte beim Netlify-Bau nichts.
// Der Bau lief trotzdem "erfolgreich" durch und ging mit 724 statt 2200
// Dateien live. Rund 1250 Betriebsseiten lieferten Google zwei Tage lang
// die App-Startseite. Fuer Gaeste sah alles normal aus.
//
// Dieser Test laeuft den ECHTEN Seitenbau (eigener Prozess, Supabase durch
// einen Stub ersetzt) und die ECHTE Befehlskette aus netlify.toml in der
// Shell. Ein Textvergleich haette nicht gesehen, dass "a || b; c" mit dem
// Rueckgabewert von c endet.

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var WURZEL = path.join(__dirname, '..');
var G = require(path.join(WURZEL, 'build-seo-pages.js'));

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}

console.log('\n-- 1. DIE PRUEFUNG --');
t('vollstaendig: kein Grund', G.bauVollstaendig(true, 9, 1200) === null);
t('Supabase weg: Grund', /Supabase war nicht erreichbar/.test(G.bauVollstaendig(false, 0, 1200) || ''));
t('kein Partner: Grund', /keinen einzigen Partner/.test(G.bauVollstaendig(true, 0, 1200) || ''));
t('OSM leer: Grund nennt die Zahl', /nur 0 Betriebe aus OpenStreetMap/.test(G.bauVollstaendig(true, 9, 0) || ''));
t('OSM halb: auch zu wenig', /nur 300 Betriebe/.test(G.bauVollstaendig(true, 9, 300) || ''));

console.log('\n-- 2. DER ECHTE SEITENBAU --');
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-bau-'));
var STUB = path.join(TMP, 'stub.js');
fs.writeFileSync(STUB,
    "var KAPUTT = process.env.STUB_SUPABASE_KAPUTT === '1';\n" +
    "global.fetch = async function (u) { u = String(u); var d = [];\n" +
    "  if (/\\/restaurants\\?/.test(u)) { if (KAPUTT) return { ok:false, status:503, json: async()=>({}), text: async()=>'down' };\n" +
    "    d = [{ id:'p1', slug:'la-piazza-greetsiel', name:'La Piazza', city:'Greetsiel', cuisine:'Pizza', is_active:true }]; }\n" +
    "  return { ok:true, status:200, json: async()=>d, text: async()=>JSON.stringify(d) }; };\n");

function bau(name, betriebe, env) {
    var aus = path.join(TMP, name);
    fs.mkdirSync(aus);
    var pr = [];
    for (var i = 0; i < betriebe; i++) pr.push({ name:'Betrieb ' + i, city:'Greetsiel', street:'Weg ' + i, zip:'26736', source:'osm' });
    if (betriebe >= 0) fs.writeFileSync(path.join(aus, 'prospects.json'), JSON.stringify(pr));
    var r = cp.spawnSync(process.execPath, ['-r', STUB, path.join(WURZEL, 'build-seo-pages.js')], {
        env: Object.assign({}, process.env, { SEO_OUT_DIR: aus, NETLIFY: '' }, env || {}), encoding: 'utf8', timeout: 60000
    });
    var html = fs.readdirSync(aus).filter(function (f) { return /\.html$/.test(f); });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), html: html };
}

var leer = bau('osm-leer', 3, { NETLIFY: 'true' });
t('Netlify, OSM fast leer: Bau bricht mit Fehler ab', leer.code === 1, leer.code);
t('und sagt im Protokoll warum', /BAU ABGEBROCHEN: nur 3 Betriebe aus OpenStreetMap/.test(leer.out), leer.out.slice(-300));
t('und schreibt keine halbe Seite', leer.html.length === 0, leer.html.join(','));

var keineDatei = bau('osm-weg', -1, { NETLIFY: 'true' });
t('Netlify, prospects.json fehlt ganz: Abbruch', keineDatei.code === 1, keineDatei.code);

var supa = bau('supa-weg', 1200, { NETLIFY: 'true', STUB_SUPABASE_KAPUTT: '1' });
t('Netlify, Supabase weg: Abbruch statt Seiten ohne Partner', supa.code === 1 && /Supabase war nicht erreichbar/.test(supa.out), supa.code);

var voll = bau('voll', 5, { NETLIFY: 'true', SEO_MIN_VERZEICHNIS: '5' });
t('Netlify, vollstaendig: Bau laeuft durch', voll.code === 0, voll.code + ' ' + voll.out.slice(-300));
t('und schreibt die Seiten', voll.html.indexOf('la-piazza-greetsiel.html') >= 0 && voll.html.indexOf('betrieb-0-greetsiel.html') >= 0, voll.html.length);

var lokal = bau('lokal', 3, {});
t('lokal (nicht Netlify): nur Warnung, Bau laeuft', lokal.code === 0 && /unvollstaendig/.test(lokal.out), lokal.code);

console.log('\n-- 3. DIE BEFEHLSKETTE AUS netlify.toml --');
var toml = fs.readFileSync(path.join(WURZEL, 'netlify.toml'), 'utf8');
var cmd = (/^\s*command = "(.*)"\s*$/m.exec(toml) || [])[1] || '';
t('Befehl gefunden', cmd.length > 0);
// Jeden Schritt durch true/false ersetzen und die Kette echt laufen lassen.
function kette(osm, seo, minify) {
    var c = cmd.replace('node import-osm.js', osm ? 'true' : 'false')
               .replace('node build-seo-pages.js', seo ? 'true' : 'false')
               .replace('node minify-build.js', minify ? 'true' : 'false')
               .replace('node build-version.js', 'true');
    return cp.spawnSync('sh', ['-c', c], { encoding: 'utf8' }).status;
}
t('Seitenbau scheitert -> ganzer Bau scheitert (nichts geht live)', kette(true, false, true) !== 0, kette(true, false, true));
t('OSM scheitert -> Kette laeuft weiter (der Seitenbau entscheidet)', kette(false, true, true) === 0, kette(false, true, true));
t('Minify scheitert -> Bau laeuft trotzdem', kette(true, true, false) === 0);
t('alles gut -> Bau laeuft', kette(true, true, true) === 0);

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
