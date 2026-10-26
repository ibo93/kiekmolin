// GESPEICHERTE BETRIEBSLISTE: DER BAU HAENGT NICHT MEHR AN OPENSTREETMAP (26.10.2026)
//
// Gemessen am 26.10.2026 in den Supabase-Protokollen: vier Netlify-Bauten
// hintereinander starteten, keiner erreichte die Restaurantseiten -- OSM
// lieferte nichts, die Sicherung (bau-vollstaendig-test.js) stoppte jeden.
// Ibo: "ja mach das".
//
// Dieser Test laeuft den ECHTEN import-osm.js in einem eigenen Prozess.
// OSM und Supabase-Speicher sind durch einen Stub ersetzt, der je Fall
// erreichbar, kaputt, leer oder halb ist.

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var WURZEL = path.join(__dirname, '..');
var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-osm-'));
var STUB = path.join(TMP, 'stub.js');
fs.writeFileSync(STUB, [
    "var fs = require('fs');",
    "var OSM = process.env.STUB_OSM;            // weg | geht | halb",
    "var SP = process.env.STUB_SPEICHER;        // leer | voll | klein | kaputt",
    "var LOG = process.env.STUB_LOG;",
    "function antwort(status, daten) { var t = typeof daten === 'string' ? daten : JSON.stringify(daten);",
    "  return { ok: status < 300, status: status, text: async function () { return t; }, json: async function () { return JSON.parse(t); } }; }",
    "function liste(n, wo) { var a = []; for (var i = 0; i < n; i++) a.push({ name: 'Alt ' + wo + ' ' + i, city: wo, source: 'osm', draft: true }); return a; }",
    "global.fetch = async function (u, o) { u = String(u); o = o || {};",
    "  if (/overpass/.test(u)) {",
    "    if (OSM === 'weg') throw new Error('fetch failed');",
    "    if (/\\/status$/.test(u)) return antwort(200, 'ok');",
    "    var body = decodeURIComponent(String(o.body || ''));",
    "    if (OSM === 'halb' && /53\\.5944/.test(body)) return antwort(504, 'Gateway Timeout');",
    "    var m = /around:\\d+,([\\d.]+),([\\d.]+)/.exec(body), el = [];",
    "    for (var i = 0; i < 30; i++) el.push({ type: 'node', lat: +m[1], lon: +m[2], tags: { amenity: 'restaurant', name: 'Neu ' + m[1] + ' ' + i } });",
    "    return antwort(200, { elements: el }); }",
    "  if (/\\/storage\\/v1\\/bucket/.test(u)) return antwort(409, { error: 'Duplicate' });",
    "  if (/\\/storage\\/v1\\/object\\//.test(u)) {",
    "    if ((o.method || 'GET') === 'POST') { fs.appendFileSync(LOG, JSON.stringify({ key: (o.headers || {}).apikey || '', n: JSON.parse(o.body).betriebe.length }) + '\\n'); return antwort(200, {}); }",
    "    if (SP === 'leer') return antwort(400, { error: 'not_found' });",
    "    if (SP === 'kaputt') return antwort(500, 'down');",
    "    if (SP === 'klein') return antwort(200, { stand: '2026-10-26T09:00:00Z', betriebe: liste(50, 'Norden') });",
    "    return antwort(200, { stand: '2026-10-26T09:00:00Z', betriebe: liste(1000, 'Norden') }); }",
    "  throw new Error('unerwartet: ' + u); };"
].join('\n'));

function lauf(name, osm, speicher, env) {
    var aus = path.join(TMP, name + '.json'), log = path.join(TMP, name + '.log');
    var r = cp.spawnSync(process.execPath, ['-r', STUB, path.join(WURZEL, 'import-osm.js')], {
        env: Object.assign({}, process.env, { OSM_OUT_FILE: aus, OSM_PAUSE_MS: '0', STUB_OSM: osm, STUB_SPEICHER: speicher, STUB_LOG: log,
            SUPABASE_SERVICE_KEY: 'test-schluessel', SEO_MIN_VERZEICHNIS: '900' }, env || {}),
        encoding: 'utf8', timeout: 60000
    });
    var datei = fs.existsSync(aus) ? JSON.parse(fs.readFileSync(aus, 'utf8')) : null;
    var abgelegt = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
    return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), datei: datei, abgelegt: abgelegt };
}

console.log('\n-- 1. OSM WEG, LISTE GESPEICHERT: DER BAU GEHT WEITER --');
var a = lauf('weg-voll', 'weg', 'voll');
t('Ende ohne Fehler (Seitenbau darf laufen)', a.code === 0, a.code + ' ' + a.out.slice(-300));
t('prospects.json hat die 1000 gespeicherten Betriebe', a.datei && a.datei.length === 1000, a.datei && a.datei.length);
t('Protokoll sagt deutlich: ERSATZ, mit Stand', /ERSATZ: OpenStreetMap hat nicht geliefert - gespeicherte Liste verwendet: 1000 Betriebe, Stand 2026-10-26 09:00 UTC/.test(a.out), a.out.slice(-300));
t('nichts neu abgelegt (die Liste ist ja die alte)', a.abgelegt.length === 0);

console.log('\n-- 2. OSM WEG, KEIN ERSATZ: WIE VORHER, MIT GRUND --');
var b = lauf('weg-leer', 'weg', 'leer');
t('noch nichts gespeichert: Fehlercode, keine Datei', b.code === 2 && b.datei === null, b.code);
t('... und der Grund im Protokoll', /Gespeicherte Liste nicht verfuegbar: noch keine Liste gespeichert/.test(b.out));
var c = lauf('weg-klein', 'weg', 'klein');
t('gespeicherte Liste zu klein: nicht verwendet', c.code === 2 && c.datei === null && /nur 50 Betriebe/.test(c.out), c.code);
var d = lauf('weg-ohne-schluessel', 'weg', 'voll', { SUPABASE_SERVICE_KEY: '' });
t('Schlüssel fehlt in der Bau-Umgebung: gesagt, nicht still', d.code === 2 && /SUPABASE_SERVICE_KEY fehlt in der Bau-Umgebung/.test(d.out), d.code);
var e = lauf('weg-kaputt', 'weg', 'kaputt');
t('Speicher antwortet 500: Fehlercode mit Grund', e.code === 2 && /HTTP 500/.test(e.out), e.code);

console.log('\n-- 3. OSM GEHT: FRISCH HOLEN UND ABLEGEN --');
var f = lauf('geht', 'geht', 'leer');
t('frisch geholt: 45 Gebiete x 30', f.code === 0 && f.datei && f.datei.length === 1350, f.datei && f.datei.length);
t('für den nächsten Ausfall abgelegt (alle 1350)', f.abgelegt.length === 1 && f.abgelegt[0].n === 1350, JSON.stringify(f.abgelegt));
t('mit dem Schlüssel aus der Umgebung', f.abgelegt[0] && f.abgelegt[0].key === 'test-schluessel');
t('Schlüssel steht NICHT im Protokoll', f.out.indexOf('test-schluessel') === -1);
var g = lauf('geht-wenig', 'geht', 'leer', { SEO_MIN_VERZEICHNIS: '5000' });
t('unvollständige Liste wird NICHT abgelegt', g.abgelegt.length === 0 && /Liste NICHT gespeichert: nur 1350/.test(g.out));

console.log('\n-- 4. OSM HALB: FEHLENDE GEBIETE AUS DEM LETZTEN STAND --');
var h = lauf('halb', 'halb', 'voll');
t('ein Gebiet gescheitert, Lauf geht weiter', h.code === 0, h.code);
t('frische 44x30 plus alte Betriebe aus dem Speicher', h.datei && h.datei.length === 1320 + 1000, h.datei && h.datei.length);
t('Protokoll nennt die Übernahme', /1000 Betriebe aus dem letzten Lauf uebernommen/.test(h.out));

console.log('\n-- 5. GEHEIMNISSE --');
var quelle = fs.readFileSync(path.join(WURZEL, 'osm-speicher.js'), 'utf8');
t('kein Schlüssel im Quelltext (nur aus der Umgebung)', !/eyJ[A-Za-z0-9_-]{20,}/.test(quelle) && /process\.env\.SUPABASE_SERVICE_KEY/.test(quelle));
t('privater Speicher', /public: false/.test(quelle));
var gi = fs.readFileSync(path.join(WURZEL, '.gitignore'), 'utf8');
t('prospects.json bleibt aus dem Repo', /^prospects\.json$/m.test(gi));

console.log('\n' + ok + '/' + (ok + fail) + ' bestanden');
if (fail) process.exit(1);
