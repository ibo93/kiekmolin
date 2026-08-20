// WARUM NACH DEM ZUMACHEN DER GAESTEDATEN ALLES LEER WAR.
//
// Gemeldet: "es kommen keine reservierungen und bestellungen rein",
// "alles weg" -- unmittelbar nachdem datenbank/04 die Tabellen auf
// "to authenticated" umgestellt hatte.
//
// DIE URSACHE, IM CODE GEFUNDEN
// Es gibt zwei Wege ins Dashboard:
//
//   1. simpleLogin()      Passwort gegen settings.admin_password.
//                         Setzt localStorage.kmi_admin_logged_in = true
//                         und ein Objekt currentAdmin. Sonst NICHTS.
//                         Keine Supabase-Sitzung, kein Token.
//   2. Google-Login       ueber supabaseClient.auth.signInWithOAuth,
//                         danach checkIfGastronom(). Echte Sitzung.
//
// Weg 1 ist fuer die Datenbank ein Fremder: kmiToken() liefert den
// oeffentlichen Schluessel, weil kmiTokenSetzen() nur aus
// onAuthStateChange und getSession gespeist wird. Jede Regel
// "to authenticated" laesst ihn damit aussen vor -- und genau so sah
// das Dashboard aus: leer.
//
// UND EIN ZWEITER FUND AUF DEM WEG DAHIN
// Weg 1 holte das Passwort in den Browser, um es dort zu vergleichen:
//
//     GET /rest/v1/settings?key=eq.admin_password
//     apikey: <oeffentlicher Schluessel aus dem Seitenquelltext>
//
// Damit der Login funktioniert, MUSS diese Zeile fuer den oeffentlichen
// Schluessel lesbar sein. Also konnte jeder, der den Seitenquelltext
// oeffnet, das Admin-Passwort im Klartext abrufen -- und damit in den
// Verwaltungsbereich der ganzen Plattform.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Das Passwort verlaesst den Server nicht mehr --');
var zeilen = h.split('\n');
function codeZeilen(muster) {
    return zeilen.filter(function (z) {
        return muster.test(z) && /^\s*(\/\/|\*|--)/.test(z) === false;
    });
}
t('kein Abruf von settings.admin_password im Browser',
  codeZeilen(/rest\/v1\/settings\?key=eq\.admin_password/).length === 0,
  JSON.stringify(codeZeilen(/rest\/v1\/settings\?key=eq\.admin_password/)));
// Die Erklaerung MUSS dastehen -- sonst baut das jemand zurueck.
t('die Erklaerung dazu steht noch im Code',
  h.indexOf('settings?key=eq.admin_password') > -1, 'Begruendung verschwunden');
t('der Vergleich passiert ueber den Server',
  /fetch\('\/\.netlify\/functions\/admin-login'/.test(h), 'kein Endpunkt');
t('das Passwort geht per POST, nicht in der Adresse',
  /method: 'POST'[\s\S]{0,200}?JSON\.stringify\(\{ passwort: password \}\)/.test(h), 'in der Adresse');

console.log('\n-- 2. Eine Stoerung ist kein "Ja" --');
// Ein Login, der bei einem Serverfehler durchwinkt, ist schlimmer als
// einer, der klemmt.
t('nur ein ausdrueckliches ok:true laesst herein',
  /if \(response\.ok && data && data\.ok === true\)/.test(h), 'zu nachsichtig');
t('und "falsches Passwort" steht nur bei 401',
  /response\.status === 401\)\s*\n\s*\? 'Falsches Passwort'/.test(h), 'meldet immer falsch');

console.log('\n-- 3. Der Endpunkt selbst --');
var A = fs.readFileSync(KMI + '/netlify/functions/admin-login.js', 'utf8');
t('nimmt nur POST', /event\.httpMethod !== 'POST'/.test(A), 'auch GET');
t('laeuft mit dem Dienstschluessel', /SUPABASE_SERVICE_KEY/.test(A), 'oeffentlicher Schluessel');
t('gibt das Passwort NICHT zurueck',
  /body: JSON\.stringify\(\{ ok: true \}\)/.test(A) || /json\(200, \{ ok: true \}\)/.test(A), 'gibt mehr heraus');
// Der hinterlegte Wert darf ueberall auftauchen, nur nicht in einer
// Antwort. Deshalb zeilenweise und ohne Zeichenketten pruefen -- die
// Fehlermeldung "Kein Passwort hinterlegt" enthaelt das Wort ja auch,
// und daran ist dieser Test beim ersten Versuch haengengeblieben.
var aZeilen = A.split('\n')
    .filter(function (z) { return /^\s*(\/\/|\*)/.test(z) === false; })
    .map(function (z) { return z.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""'); });
// Nur was NACH dem json( steht, ist die Antwort. In
//   if (!hinterlegt) return json(503, ...)
// steht die Variable in der Bedingung davor -- das ist kein Leck, und
// daran ist auch der zweite Anlauf dieses Tests haengengeblieben.
var raus = aZeilen.filter(function (z) {
    var i = z.indexOf('json(');
    return i > -1 && /\bhinterlegt\b/.test(z.slice(i));
});
t('keine Antwort gibt den hinterlegten Wert heraus', raus.length === 0, JSON.stringify(raus));
// Gegenprobe: die Variable gibt es ueberhaupt, sonst prueft das nichts.
t('die Variable heisst wirklich so',
  aZeilen.filter(function (z) { return /\bhinterlegt\b/.test(z); }).length >= 2,
  aZeilen.filter(function (z) { return /\bhinterlegt\b/.test(z); }).length);
// Ohne Dienstschluessel NICHT durchwinken.
t('ohne Dienstschluessel -> 503, nicht ok',
  /if \(!SUPABASE_KEY\) return json\(503/.test(A), 'winkt durch');
// Eine leere Tabelle darf den Verwaltungsbereich nicht oeffnen.
t('ohne hinterlegtes Passwort -> 503, nicht ok',
  /if \(!hinterlegt\) return json\(503/.test(A), 'leeres Passwort oeffnet');
t('falsches Passwort -> 401', /return json\(401, \{ ok: false \}\)/.test(A), 'anderer Code');
// Der Vergleich bricht nicht beim ersten Unterschied ab.
t('der Vergleich hat feste Laufzeit', /function gleichLang\(a, b\)/.test(A), 'einfaches ===');
t('er laeuft ueber die volle Laenge',
  /for \(var i = 0; i < max; i\+\+\)/.test(A) && /unterschied \|=/.test(A), 'bricht ab');

console.log('\n-- 4. Der Weg, der eine echte Sitzung erzeugt --');
// Das ist der eigentliche Fix fuer das leere Dashboard.
var c = h.indexOf('SUPERADMIN? DANN IN DEN VERWALTUNGSBEREICH');
t('checkIfGastronom kennt den Superadmin', c > 0, c);
var block = h.slice(c, c + 2200);
t('die Rolle wird klein und ohne Raender verglichen',
  /String\(customer\.role \|\| ''\)\.trim\(\)\.toLowerCase\(\)/.test(block), 'buchstabengenau');
t('bei superadmin geht es in den Verwaltungsbereich',
  /if \(_rolle === 'superadmin'\) \{[\s\S]{0,700}?adminDashboardOeffnen\(/.test(block), 'kein Weg');
t('und danach wird abgebrochen, nicht weitergelaufen',
  /adminDashboardOeffnen\([^)]*\);\s*\n\s*return true;/.test(block), 'faellt durch');
// Er steht VOR der Restaurant-Pruefung -- der Superadmin hat keins.
t('die Weiche steht vor der Restaurant-Pruefung',
  block.indexOf('_rolle === \'superadmin\'') < block.indexOf('Prüfe ob Restaurant auch aktiv ist'),
  'zu spaet');

console.log('\n-- 5. Beide Wege bauen dasselbe Dashboard --');
// Vorher stand der Aufbau nur im Passwort-Zweig. Ein zweiter Weg haette
// ihn kopiert -- und beim naechsten Umbau waere einer der beiden
// vergessen worden.
t('der Aufbau steht in einer eigenen Funktion',
  /function adminDashboardOeffnen\(wer\) \{/.test(h), 'nicht herausgeloest');
var rufe = (h.match(/adminDashboardOeffnen\(\{/g) || []).length;
t('beide Wege rufen sie auf', rufe === 2, rufe);
t('sie setzt isAdmin', /isAdmin: true/.test(h), 'fehlt');
t('sie hebt die Gastro-Einschraenkungen auf',
  /function adminDashboardOeffnen[\s\S]{0,1200}?removeGastroRestrictions\(\)/.test(h), 'fehlt');

console.log('\n-- 6. Der Zusammenhang ist erklaert --');
// Ohne diese Erklaerung sieht der Passwort-Login harmlos aus, und beim
// naechsten Anlauf aufs Zumachen steht der Laden wieder.
t('der Unterschied der beiden Wege steht im Code',
  h.indexOf('Fuer die Datenbank ist dieser Benutzer ein') > -1, 'nicht erklaert');
t('und dass Weg 1 keine Sitzung erzeugt',
  /Setzt nur ein Flag im Browser/.test(h), 'nicht erklaert');
t('und was das fuer die Regeln bedeutet',
  h.indexOf('to authenticated') > -1, 'nicht erklaert');

console.log('\n-- 7. Der Endpunkt, wirklich ausgefuehrt --');
// Bauart pruefen reicht hier nicht: ob ein Login wirklich niemanden
// hereinlaesst, den er nicht soll, zeigt sich erst im Ablauf.
process.env.SUPABASE_SERVICE_KEY = 'test-dienst';
process.env.SUPABASE_URL = 'https://beispiel.supabase.co';
function ladeEndpunkt() {
    delete require.cache[require.resolve(KMI + '/netlify/functions/admin-login.js')];
    return require(KMI + '/netlify/functions/admin-login.js');
}
function serverGibt(antwort) {
    global.fetch = function () {
        return Promise.resolve({ ok: true, status: 200,
            json: function () { return Promise.resolve(antwort); },
            text: function () { return Promise.resolve(''); } });
    };
}
function POST(b) { return { httpMethod: 'POST', body: JSON.stringify(b) }; }

(async function () {
    var E = ladeEndpunkt();
    var r;

    serverGibt([{ value: 'geheim123' }]);
    r = await E.handler(POST({ passwort: 'geheim123' }));
    t('richtiges Passwort -> 200 ok:true',
      r.statusCode === 200 && JSON.parse(r.body).ok === true, r.statusCode + ' ' + r.body);
    // Der Kern: das Passwort darf die Function nie verlassen.
    t('die Antwort enthaelt das Passwort nicht', r.body.indexOf('geheim123') === -1, r.body);

    r = await E.handler(POST({ passwort: 'falsch' }));
    t('falsches Passwort -> 401', r.statusCode === 401, r.statusCode);
    t('auch dann steht es nicht in der Antwort', r.body.indexOf('geheim123') === -1, r.body);

    // Der Vergleich darf nicht bei gleicher Anfangsfolge nachgeben.
    r = await E.handler(POST({ passwort: 'geheim12' }));
    t('ein Zeichen zu kurz -> 401', r.statusCode === 401, r.statusCode);
    r = await E.handler(POST({ passwort: 'geheim1234' }));
    t('ein Zeichen zu lang -> 401', r.statusCode === 401, r.statusCode);

    r = await E.handler(POST({}));
    t('ohne Passwort -> 400', r.statusCode === 400, r.statusCode);
    r = await E.handler({ httpMethod: 'GET' });
    t('GET -> 405', r.statusCode === 405, r.statusCode);

    // Eine leere Tabelle darf den Verwaltungsbereich nicht oeffnen.
    serverGibt([]);
    r = await E.handler(POST({ passwort: 'egal' }));
    t('kein Passwort hinterlegt -> 503, nicht ok',
      r.statusCode === 503 && JSON.parse(r.body).ok !== true, r.statusCode + ' ' + r.body);

    // Und leer gegen leer erst recht nicht.
    serverGibt([{ value: '' }]);
    r = await E.handler(POST({ passwort: '' }));
    t('leer gegen leer -> kein Einlass', JSON.parse(r.body).ok !== true, r.body);

    process.env.SUPABASE_SERVICE_KEY = '';
    r = await ladeEndpunkt().handler(POST({ passwort: 'geheim123' }));
    t('ohne Dienstschluessel -> 503, nicht ok',
      r.statusCode === 503 && JSON.parse(r.body).ok !== true, r.statusCode + ' ' + r.body);

    console.log('\n' + ok + '/' + n + ' bestanden');
    if (ok !== n) process.exit(1);
})();

