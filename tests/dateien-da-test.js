// AUF DATEIEN VERWEISEN, DIE ES NICHT GIBT.
//
// Gemeldet am 21.08.2026: "beim zum homebildschirm kommt mein logo
// nicht kiekmolin".
//
// index.html verwies auf /apple-touch-icon.png -- die Datei lag nicht
// im Projekt. iOS holt sie beim Ablegen auf dem Home-Bildschirm, bekommt
// 404, und nimmt ersatzweise ein Bildschirmfoto der Seite. Deshalb sah
// der Wirt seinen eigenen Betrieb nicht auf dem Symbol.
//
// Dabei fielen zwei weitere auf:
//
//   manifest.json   -- fehlte komplett. Darin steht, wie die App heisst
//                      und welche Symbole sie hat.
//   kiek-logo.png   -- fehlte, wird aber an 19 Stellen verwiesen, unter
//                      anderem als Symbol JEDER Push-Nachricht. Jede
//                      Meldung waere ohne Bild angekommen.
//
// WARUM DAS NIEMANDEM AUFFIEL
// Ein fehlendes Bild wirft keinen Fehler. Der Browser laesst die Stelle
// leer, iOS nimmt ein Ersatzbild, und im Protokoll steht ein 404
// zwischen tausend anderen Zeilen. Es gibt keine Stelle, an der es
// rot wird -- deshalb diese Datei.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die drei, die gefehlt haben --');
['apple-touch-icon.png', 'manifest.json', 'kiek-logo.png',
 'icon-192.png', 'favicon-32.png'].forEach(function (f) {
    t('vorhanden: ' + f, fs.existsSync(path.join(KMI, f)), 'fehlt');
});

console.log('\n-- 2. Und alles andere, worauf verwiesen wird --');
// Die Kuer: jede lokale Datei einsammeln, auf die index.html, der
// Service Worker oder eine Netlify-Funktion zeigt, und nachsehen, ob es
// sie gibt. So faellt der naechste Fall auf, bevor ihn jemand meldet.
// check.html kam am 31.08.2026 dazu -- die Wirte-Seite mit 23
// Kundenlogos. Genau der Fall, fuer den diese Datei gebaut wurde: ein
// fehlendes Logo wirft keinen Fehler, der Browser laesst die Stelle
// leer, und auf einer Seite, die neue Kunden gewinnen soll, faellt das
// erst dem Kunden auf.
var quellen = ['index.html', 'sw.js', 'push-check.html', 'check.html', '404.html'];
fs.readdirSync(path.join(KMI, 'netlify', 'functions'))
  .filter(function (f) { return /\.js$/.test(f); })
  .forEach(function (f) { quellen.push('netlify/functions/' + f); });

var ENDUNG = 'png|jpg|jpeg|webp|svg|ico|json|webmanifest|woff2?';

// Ein Verweis ist nur dann einer, wenn die Endung das Wort beendet.
// Ohne diese Bremse haelt der Test "cat.icon" fuer eine Bilddatei.
var GANZ = new RegExp('^(?:\\.?/)?[a-z0-9_\\-]+(?:/[a-z0-9_\\-]+)*\\.(?:' + ENDUNG + ')$', 'i');

function merken(gesucht, roh, q) {
    var datei = String(roh).split('?')[0].split('#')[0];
    // Keine fremden Adressen, keine zusammengebauten Namen.
    if (/^[a-z]+:/i.test(datei) || datei.indexOf('//') === 0) return;
    if (datei.indexOf('${') > -1 || datei.indexOf('+') > -1) return;
    if (!GANZ.test(datei)) return;
    datei = datei.replace(/^\.?\//, '');
    if (gesucht[datei] && gesucht[datei].indexOf(q) > -1) return;
    (gesucht[datei] = gesucht[datei] || []).push(q);
}

var gesucht = {};
quellen.forEach(function (q) {
    var voll = path.join(KMI, q);
    if (!fs.existsSync(voll)) return;
    var txt = fs.readFileSync(voll, 'utf8');

    // a) Was im HTML als Adresse steht: href="manifest.json",
    //    src="icon-192.png". Genau hier fehlte apple-touch-icon.png --
    //    ohne fuehrenden Schraegstrich, deshalb reicht /... nicht.
    var attr = txt.match(/(?:href|src)="[^"<>]+"/gi) || [];
    attr.forEach(function (x) { merken(gesucht, x.split('"')[1], q); });

    // b) Und was im JavaScript mit / beginnt: '/kiek-logo.png' als
    //    Symbol der Push-Nachrichten, die Liste im Service Worker.
    var abs = txt.match(new RegExp('["\'`]\\/[a-z0-9_\\-/]+\\.(?:' + ENDUNG + ')["\'`]', 'gi')) || [];
    abs.forEach(function (x) { merken(gesucht, x.slice(1, -1), q); });
});

var namen = Object.keys(gesucht).sort();
t('es gibt Verweise zu pruefen', namen.length > 3, namen.length);
namen.forEach(function (datei) {
    var da = fs.existsSync(path.join(KMI, datei));
    t(datei, da, 'fehlt -- verwiesen in ' + gesucht[datei].join(', '));
});

console.log('\n-- 3. Das Manifest sagt, wie die App heisst --');
var m = JSON.parse(fs.readFileSync(path.join(KMI, 'manifest.json'), 'utf8'));
t('Name gesetzt', m.name === 'Kiek mol in', m.name);
t('Kurzname fuer den Home-Bildschirm', !!m.short_name, 'fehlt');
// Ohne standalone startet die App im Browser-Tab -- und dann gibt es
// auf dem iPhone gar keine Benachrichtigungen.
t('startet als eigene App, nicht im Tab', m.display === 'standalone', m.display);
t('mit eigener Startadresse', m.start_url === '/', m.start_url);
t('und einem Geltungsbereich', m.scope === '/', m.scope);
t('Symbole sind hinterlegt', Array.isArray(m.icons) && m.icons.length >= 2, m.icons);
m.icons.forEach(function (i) {
    var datei = i.src.replace(/^\//, '');
    var da = fs.existsSync(path.join(KMI, datei));
    t('Symbol vorhanden: ' + i.src, da, 'fehlt');
    if (!da) return;
    // Der Browser sucht sich das Symbol nach dieser Angabe aus. Steht
    // sie falsch da, nimmt er das falsche.
    var d = fs.readFileSync(path.join(KMI, datei));
    t('Groesse stimmt: ' + i.src,
      i.sizes === d.readUInt32BE(16) + 'x' + d.readUInt32BE(20),
      i.sizes + ' behauptet, echt ' + d.readUInt32BE(16) + 'x' + d.readUInt32BE(20));
});

console.log('\n-- 4. Die Symbole sind quadratisch --');
// Der zweite Teil desselben Problems. Die Symbole waren 192 breit und
// 191 hoch -- ein Pixel zu kurz. iOS schneidet ein Symbol in ein
// Quadrat und zieht es dafuer in die Laenge; das Logo stand dann
// schief. Ein Pixel, den man nur sieht, wenn man ihn misst.
function masse(datei) {
    var d = fs.readFileSync(path.join(KMI, datei));
    return { breit: d.readUInt32BE(16), hoch: d.readUInt32BE(20) };
}
['favicon-32.png', 'icon-192.png', 'apple-touch-icon.png',
 'kiek-logo.png'].forEach(function (f) {
    var m = masse(f);
    t('quadratisch: ' + f, m.breit === m.hoch, m.breit + 'x' + m.hoch);
});

console.log('\n-- 5. Das Symbol fuer den Home-Bildschirm --');
// iOS holt genau diese Datei. Fehlt sie, nimmt es ein Bildschirmfoto.
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var verweis = h.match(/<link rel="apple-touch-icon"[^>]*>/);
t('index.html verweist darauf', !!verweis, 'kein Verweis');
t('und zeigt auf apple-touch-icon.png',
  !!verweis && verweis[0].indexOf('href="apple-touch-icon.png"') > -1, verweis && verweis[0]);
// Und die Groessenangabe muss stimmen. Eine falsche ist schlimmer als
// keine -- sie behauptet etwas, das niemand nachmisst.
var behauptet = verweis && verweis[0].match(/sizes="(\d+)x(\d+)"/);
var echt = masse('apple-touch-icon.png');
t('mit zutreffender Groessenangabe',
  !behauptet || (+behauptet[1] === echt.breit && +behauptet[2] === echt.hoch),
  behauptet && (behauptet[0] + ' -- echt ' + echt.breit + 'x' + echt.hoch));
t('und die App traegt einen Namen fuers iPhone',
  /<meta name="apple-mobile-web-app-title" content="Kiek mol in">/.test(h), 'namenlos');
t('sowie den Vollbild-Schalter',
  /<meta name="apple-mobile-web-app-capable" content="yes">/.test(h), 'startet im Tab');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
