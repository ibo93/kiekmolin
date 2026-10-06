// PFLICHTANGABEN AUF JEDER SEITE, DIE EIN GAST SEHEN KANN.
//
// Die 404-Seite hatte bis zum 05.10.2026 genau einen Link: zur Startseite.
// Sie ist aber oeffentlich erreichbar -- jeder vertippte Link, jede alte
// Adresse aus Google landet dort. Damit gilt auch fuer sie die
// Impressumspflicht nach § 5 DDG, Bussgeld bis 50.000 Euro.
//
// WARUM ES NIEMANDEM AUFFIEL
// Weil niemand auf die 404-Seite schaut. Sie wird gebaut, sie sieht
// ordentlich aus, und danach sieht sie nie wieder jemand an -- ausser
// Gaesten, die sich vertippt haben.
//
// AUSSERDEM GEPRUEFT: zwei Links im Hilfe-Fenster zeigten auf
// "/?page=impressum" und "/?page=datenschutz". Diese App liest den
// Parameter "page" nirgends -- gemessen am 05.10.2026, kein einziges
// .get('page') im ganzen Haus. Beide Links luden also stumm die
// Startseite. Der Gast fragt den Helfer nach dem Impressum, klickt, und
// landet wieder am Anfang. Keine Fehlermeldung, nichts Rotes.
//
// GEGENPROBE BEIM SCHREIBEN (05.10.2026): den Absatz aus 404.html
// geloescht -> Punkt 1 rot. "/?page=impressum" wieder eingesetzt ->
// Punkt 3 rot. impressum.html umbenannt -> Punkt 2 rot.
var path = require('path');
var fs = require('fs');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

function lies(rel) {
    var p = path.join(KMI, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function ohneKommentare(s) {
    return String(s == null ? '' : s).replace(/<!--[\s\S]*?-->/g, '');
}

console.log('\n-- 1. Die 404-Seite fuehrt zum Impressum --');

var vierNullVier = lies('404.html');
t('404.html gibt es', vierNullVier !== null, null);

// Nicht nur das Wort suchen: ein Kommentar reicht nicht, es muss ein
// anklickbarer Link sein.
var sichtbar404 = ohneKommentare(vierNullVier);
t('404.html verlinkt /impressum.html anklickbar',
  /href\s*=\s*["']\/impressum\.html["']/i.test(sichtbar404),
  sichtbar404 ? sichtbar404.match(/href\s*=\s*["'][^"']*["']/gi) : null);

console.log('\n-- 2. Das Ziel existiert wirklich --');

// Ein Link auf eine Seite, die es nicht gibt, ist schlimmer als kein
// Link: er sieht aus wie eine Erfuellung der Pflicht und ist keine.
var ziele = [];
var reHref = /href\s*=\s*["'](\/[^"'#?]+\.html)["']/gi, mm;
while ((mm = reHref.exec(sichtbar404)) !== null) ziele.push(mm[1]);

t('die 404-Seite verlinkt ueberhaupt eine eigene Seite', ziele.length > 0, ziele);

var tot = ziele.filter(function (z) { return !fs.existsSync(path.join(KMI, z.replace(/^\//, ''))); });
t('kein Link der 404-Seite laeuft ins Leere', tot.length === 0, tot);

// Und das Impressum muss auch wirklich eins sein, nicht nur so heissen.
var imp = lies('impressum.html');
t('impressum.html nennt § 5 DDG und eine Anschrift',
  imp !== null && /§\s*5\s*DDG/.test(imp) && /\d{5}\s+\S/.test(imp),
  imp === null ? 'Datei fehlt' : null);

console.log('\n-- 3. Keine Links auf ?page= -- den liest niemand --');

var html = lies('index.html');

// Erst belegen, dass der Parameter wirklich nirgends gelesen wird. Wenn
// jemand spaeter einen Router baut, soll dieser Test nicht stur bleiben,
// sondern genau dann nachgeben.
var wirdGelesen = /\.get\(\s*['"]page['"]\s*\)/.test(html);
t('der Parameter "page" wird im Haus nirgends gelesen', wirdGelesen === false,
  'wenn das absichtlich dazugekommen ist, gehoert dieser Test angepasst');

if (!wirdGelesen) {
    var treffer = (html.match(/href=\\?["']\/\?page=[a-z]+\\?["']/gi) || []);
    t('kein Link im Haus zeigt auf /?page=...', treffer.length === 0, treffer);
} else {
    t('kein Link im Haus zeigt auf /?page=...', true, 'uebersprungen: es gibt jetzt einen Router');
}

console.log('\n-- 4. Die Fenster, auf die stattdessen verwiesen wird, gibt es --');

['impressumModal', 'datenschutzModal'].forEach(function (id) {
    t('das Fenster ' + id + ' ist angelegt',
      new RegExp('id\\s*=\\s*["\']' + id + '["\']').test(html), null);
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
