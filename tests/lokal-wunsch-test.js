// GAESTE WUENSCHEN SICH EIN LOKAL (07.11.2026).
// Was still kaputtgehen kann: Tabelle fehlt -> Gast sieht trotzdem "Danke",
// gezaehlt wird nichts (Regel 6). Oder App und Eintrag zaehlen dasselbe Lokal
// unter zwei Namen -> die Zahl beim Wirt ist zu klein.
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var KMI = path.join(__dirname, '..');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + JSON.stringify(x))); }

process.env.SUPABASE_SERVICE_KEY = 'test';
var W = require(path.join(KMI, 'netlify/functions/lokal-wunsch.js'));
var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-wunsch-'));
process.env.SEO_OUT_DIR = AUS;
var B = require(path.join(KMI, 'build-seo-pages.js'));

console.log('-- 1. Derselbe Name fuer dasselbe Lokal --');
[['Café Moin', 'Aurich'], ['Fischhaus „Möwe“', 'Norddeich'], ['Gasthaus Zur Linde', 'Norden']].forEach(function (x) {
  t('App und Eintrag: ' + x[0], W._slugAus(x[0] + '-' + x[1]) === B.prospectSlug({ name: x[0], city: x[1] }), [W._slugAus(x[0] + '-' + x[1]), B.prospectSlug({ name: x[0], city: x[1] })]);
});
t('Kein HTML aus Gaeste-Eingaben', W._text('<script>x</script> Lokal', 80).indexOf('<') < 0);

(async function () {
  console.log('\n-- 2. Funktion wirklich ausfuehren (Supabase nachgespielt) --');
  var echt = global.fetch, aufrufe = [];
  function supabase(antwort) { global.fetch = async function (url, opt) { aufrufe.push(url); return antwort(url, opt); }; }
  var post = function (body) { return W.handler({ httpMethod: 'POST', body: JSON.stringify(body) }); };

  supabase(async function () { return { ok: false, status: 404, text: async function () { return 'Could not find the function public.lokal_wuenschen'; } }; });
  var r = await post({ name: 'Trattoria Roma', ort: 'Aurich' }), d = JSON.parse(r.body);
  t('Tabelle fehlt: ok:false mit Grund (kein stilles Danke)', r.statusCode === 200 && d.ok === false && d.grund === 'SQL 52 fehlt', d);

  supabase(async function (url) { return { ok: true, status: 200, text: async function () { return /summe/.test(url) ? '3' : ''; } }; });
  aufrufe = [];
  r = await post({ name: 'Trattoria Roma', ort: 'Aurich' }); d = JSON.parse(r.body);
  t('Gespeichert: ok:true und die neue Zahl', d.ok === true && d.anzahl === 3, d);
  t('Schreibt ueber die geschuetzte Funktion, nicht direkt in die Tabelle', /rpc\/lokal_wuenschen$/.test(aufrufe[0]), aufrufe);
  r = await W.handler({ httpMethod: 'GET', queryStringParameters: { slug: 'trattoria-roma-aurich' } }); d = JSON.parse(r.body);
  t('GET liefert die Zahl', d.ok === true && d.anzahl === 3, d);
  r = await post({ name: 'x' }); d = JSON.parse(r.body);
  t('Ohne richtigen Namen: nichts gespeichert', d.ok === false, d);
  global.fetch = echt;

  console.log('\n-- 3. Eintragsseite und App --');
  var seite = B.generateProspectPage({ name: 'Gasthaus Zur Linde', city: 'Norden', category: 'Restaurant', source: 'osm' }, [], []);
  var h = fs.readFileSync(path.join(AUS, seite.filename), 'utf8');
  t('Eintrag hat den Wunsch-Knopf', /id="wunschKnopf"/.test(h) && /Sie essen gern hier\?/.test(h));
  t('Inhaber sieht die Zahl seiner Gaeste (Platz dafuer da)', /id="wunschZahlWirt"/.test(h) && /Ihrer Gäste wünschen sich Sie auf Kiek mol in/.test(h));
  t('Danke nur, wenn gespeichert (d.ok)', /if\(d&&d\.ok\)\{try\{localStorage\.setItem\(schl,"1"\)/.test(h) && /Das hat gerade nicht geklappt/.test(h));
  var app = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
  t('App: "Dein Lieblingslokal fehlt?" vorhanden', /id="gastWunsch"/.test(app) && /Dein Lieblingslokal fehlt\?/.test(app));
  t('App: Danke nur bei d.ok, sonst ehrliche Meldung', /if \(d && d\.ok\) \{ f\.reset\(\); sag\(/.test(app) && /sag\('Das hat gerade nicht geklappt/.test(app));

  console.log('\n-- 4. Datenbank: niemand ausser der Funktion --');
  var sql = fs.readFileSync(path.join(KMI, 'datenbank/52-lokal-wuensche.sql'), 'utf8');
  t('RLS an, keine Policy fuer Gaeste', /alter table public\.lokal_wunsch enable row level security/.test(sql) && !/create policy/i.test(sql));
  t('anon darf die Funktionen nicht aufrufen', /revoke all on function public\.lokal_wuenschen\(text, text, text\) from public, anon, authenticated/.test(sql));
  t('Keine Personendaten in der Tabelle (kein ip, keine email)', !/\b(ip|email|telefon)\b/i.test(sql.split('create table')[1].split(');')[0]));

  console.log('\n' + ok + '/' + n + (ok === n ? ' grün' : ' ROT'));
  try { fs.rmSync(AUS, { recursive: true, force: true }); } catch (e) {}
  process.exit(ok === n ? 0 : 1);
})();
