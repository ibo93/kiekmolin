// Holt sbWrite aus index.html und prüft das Verhalten bei abgelehnten Anfragen.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
var fs = require('fs');
var html = fs.readFileSync(KMI + '/index.html', 'utf8');
var m = html.match(/async function sbWrite\(url, options\) \{[\s\S]*?\n    \}/);
if (!m) { console.log('FAIL: sbWrite nicht gefunden'); process.exit(1); }
var sbWrite = new Function('fetch', 'return ' + m[0])(mockFetch);

var scenario;
function mockFetch() {
  if (scenario === 'net') return Promise.reject(new Error('Failed to fetch'));
  return Promise.resolve({
    ok: scenario === 'ok',
    status: scenario === 'ok' ? 204 : 400,
    text: async () => scenario === 'pgrst'
      ? '{"code":"PGRST204","message":"Could not find the \'logo\' column"}'
      : 'plain error body'
  });
}

(async function () {
  var t = [], ok = 0;
  async function check(label, sc, fn) {
    scenario = sc;
    var caught = null, ret = null;
    try { ret = await sbWrite('u', {}); } catch (e) { caught = e; }
    var r = fn(caught, ret);
    console.log((r === true ? 'OK  ' : 'FAIL') + ' | ' + label + (r === true ? '' : '  -> ' + r));
    if (r === true) ok++; t.push(r);
  }

  await check('204 -> kein Fehler, Antwort kommt zurueck', 'ok',
    (e, r) => e ? 'hat geworfen: ' + e.message : (r && r.status === 204 ? true : 'keine Antwort'));
  await check('400 -> wirft (Erfolgsmeldung wird uebersprungen)', 'plain',
    e => e ? true : 'hat NICHT geworfen — Fehler bliebe still');
  await check('400 -> Statuscode steht in der Meldung', 'plain',
    e => e && /400/.test(e.message) ? true : 'Meldung: ' + (e && e.message));
  await check('PostgREST-Grund wird lesbar gemacht', 'pgrst',
    e => e && /Could not find the 'logo' column/.test(e.message) ? true : 'Meldung: ' + (e && e.message));
  await check('PostgREST: kein rohes JSON in der Meldung', 'pgrst',
    e => e && !/PGRST204|\{"code"/.test(e.message) ? true : 'rohes JSON: ' + (e && e.message));
  // GEAENDERT AM 02.09.2026.
  //
  // Hier stand: die Meldung muss "Failed to fetch" enthalten. Genau das
  // hat der Wirt beim Vorbestellen gesehen -- "failed stand da" -- und
  // konnte nichts damit anfangen. Der Test hat die unbrauchbare Meldung
  // festgeschrieben.
  //
  // Was zaehlt, ist nicht der Wortlaut, sondern dass der Fehler
  // DURCHKOMMT und nicht verschluckt wird. Der Wortlaut ist jetzt einer,
  // den ein Gastronom lesen kann. Details in
  // tests/netzfehler-melden-test.js.
  await check('Netzwerkfehler wird durchgereicht', 'net',
    e => e ? true : 'verschluckt -- der Wirt merkt nichts');
  await check('Netzwerkfehler ist als solcher gekennzeichnet', 'net',
    e => e && e.istNetzFehler === true ? true : 'nicht gekennzeichnet');
  // Ohne Zahl in der Meldung. Genau daran liess sich heute erkennen,
  // dass die Anfrage nie angekommen war -- "HTTP 401" waere eine
  // Ablehnung gewesen, "failed" ohne Zahl ist etwas anderes.
  await check('und nennt den Grund statt der Technik', 'net',
    e => e && /keine Verbindung/.test(e.message) && !/Failed to fetch/.test(e.message)
      ? true : 'Meldung: ' + (e && e.message));
  await check('err.status gesetzt (fuer gezielte Behandlung)', 'plain',
    e => e && e.status === 400 ? true : 'status=' + (e && e.status));

  console.log(ok === t.length ? '\nAlle Tests bestanden.' : '\nFEHLER.');
  process.exit(ok === t.length ? 0 : 1);
})();
