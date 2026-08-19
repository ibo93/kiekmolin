// DER WEISSE BILDSCHIRM BEIM QR-SCAN.
//
// WAS DER GAST ERLEBTE
// --------------------
// Supabase wurde als gewoehnliches <script src> im <head> geladen -- ohne
// defer, ohne async. Ein solches Skript haelt den Seitenaufbau an: der
// Browser hoert auf zu bauen, bis das CDN geantwortet hat. Solange sieht der
// Gast nichts. Am Tisch mit einem Balken Empfang sind das mehrere Sekunden
// Weiss, bevor ueberhaupt etwas erscheint.
//
// Dazu kam die Material-Symbols-Schrift, die ebenfalls blockierte. Die
// zweite Schrift daneben war korrekt entkoppelt -- diese eine war dabei
// uebersehen worden.
//
// IM BROWSER NACHGEMESSEN (Chromium, 390px, 600 ms CDN-Latenz, dieselbe
// Seite, derselbe Ablauf, nur die beiden Tags geaendert; je fuenf Laeufe):
//     vorher:  erster Bildaufbau nach 744 ms  (736-772)
//     nachher: erster Bildaufbau nach 152 ms  (140-160)   -80 %
// In allen zehn Laeufen war der Supabase-Client bei DOMContentLoaded da.
//
// Eine erste Einzelmessung hatte 776/376 ms ergeben. Der zweite Wert war ein
// Ausreisser aus dem ersten, noch kalten Lauf -- deshalb hier der Median aus
// fuenf Laeufen und die Spanne dazu.
//
// WARUM defer FRUEHER NICHT GING
// -------------------------------
// Direkt darunter stand window.supabase.createClient(...) in einem normalen
// Inline-Skript. Inline-Skripte laufen sofort, defer-Skripte erst nach dem
// Parsen -- die Bibliothek waere noch nicht da gewesen, das try/catch haette
// den Fehler geschluckt und sb waere still null geblieben. Das war als
// Kommentar in der Datei vermerkt und der Grund, warum es liegen blieb.
//
// Geloest ueber onload am defer-Skript: das Ereignis kommt, sobald die
// Bibliothek ausgefuehrt ist, und das ist garantiert VOR DOMContentLoaded.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var KOPF = H.slice(0, H.indexOf('</head>'));
// Ohne HTML-Kommentare. Sonst faellt die Suche nach blockierenden Skripten
// auf den Tailwind-Kommentar herein, der zitiert, was dort FRUEHER stand --
// genau der Fehler, den dieser Test beim ersten Anlauf gemacht hat.
var KOPF_REIN = KOPF.replace(/<!--[\s\S]*?-->/g, '');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// ---- 1. Kein blockierendes Skript mehr im Kopf ------------------------------
// Das ist der eigentliche Waechter: er faengt AUCH das naechste Skript ab,
// das jemand ohne defer in den Kopf haengt.
var kopfSkripte = KOPF_REIN.match(/<script[^>]*\ssrc=[^>]*>/g) || [];
var blockierend = kopfSkripte.filter(function (s) {
    return !/\sdefer\b/.test(s) && !/\sasync\b/.test(s);
});
t('es gibt ueberhaupt externe Skripte im Kopf (die Suche greift)',
  kopfSkripte.length >= 3, kopfSkripte.length);
t('KEINES davon blockiert noch den Seitenaufbau',
  blockierend.length === 0, blockierend.join('\n         '));

var supa = kopfSkripte.filter(function (s) { return /supabase-js/.test(s); })[0] || '';
t('Supabase wird mit defer geladen', /\sdefer\b/.test(supa), supa);
t('und stoesst per onload die Client-Erzeugung an',
  /onload="kmiSbInit\(\)"/.test(supa), supa);

// ---- 2. Die Schriften blockieren nicht mehr ---------------------------------
// Hier standen drei Pruefungen zur Symbolschrift: verlinkt, entkoppelt
// geladen (media=print bis onload), und ein noscript-Notweg daneben. Alle
// drei waren richtig, solange die Schrift von Google kam.
//
// Sie kommt nicht mehr von Google -- sie steckt als data:-URL im Stilbogen
// (siehe symbolschrift-test.js, Grund: bei schlechtem Netz standen ueberall
// die Ligaturnamen als Wort da). Damit ist die Frage "blockiert sie den
// Seitenaufbau?" beantwortet, bevor sie gestellt wird: es gibt keine Anfrage,
// die haengen koennte, und einen noscript-Notweg braucht etwas nicht, das
// ohnehin schon in der Seite steht.
t('fuer die Symbolschrift geht ueberhaupt keine Anfrage mehr raus',
  (KOPF.match(/<link[^>]*Material\+Symbols[^>]*>/g) || []).length === 0,
  (KOPF.match(/<link[^>]*Material\+Symbols[^>]*>/g) || []).join(' '));
t('sie liegt stattdessen eingebettet in der Seite',
  /src:\s*url\(data:font\/woff2;base64,/.test(KOPF));
// Kein blockierendes Stylesheet mehr uebrig -- gleiche Waechter-Logik.
// Die <noscript>-Notwege sind Absicht: sie greifen nur, wenn kein
// JavaScript laeuft, und blockieren dann zu Recht.
var OHNE_NOSCRIPT = KOPF_REIN.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
var blockCss = (OHNE_NOSCRIPT.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || [])
    .filter(function (l) { return /https?:\/\//.test(l) && !/media="print"/.test(l); });
t('kein externes Stylesheet blockiert mehr', blockCss.length === 0, blockCss.join('\n         '));

// ---- 3. kmiSbInit -- die Stelle, an der es frueher scheiterte ----------------
function lauf(bibliothekDa) {
    var erzeugt = 0, gemeldet = [];
    var win = {};
    if (bibliothekDa) {
        win.supabase = { createClient: function (u, k) { erzeugt++; return { __client: true, u: u, k: k }; } };
    }
    var hoerer = [];
    var F = new Function('window', 'document', 'SUPABASE_URL', 'SUPABASE_KEY', 'console',
        'var sb = null;\n' + schneide('kmiSbInit')
        + '\nwindow.kmiSbInit = kmiSbInit;'
        + "\ndocument.addEventListener('DOMContentLoaded', kmiSbInit);"
        + '; return { init: kmiSbInit, sb: function(){ return sb; } };')(
        win,
        { addEventListener: function (a, f) { hoerer.push([a, f]); } },
        'https://test.supabase.co', 'schluessel',
        { error: function (m, e) { gemeldet.push(m); } });
    return { F: F, win: win, erzeugt: function () { return erzeugt; }, hoerer: hoerer, gemeldet: gemeldet };
}

var mit = lauf(true);
t('ohne Aufruf wird noch nichts erzeugt -- erst onload zaehlt',
  mit.erzeugt() === 0 && mit.F.sb() === null, mit.erzeugt());
var c1 = mit.F.init();
t('der erste Aufruf erzeugt den Client', mit.erzeugt() === 1 && !!c1);
t('er haengt auch an window (dort holen ihn 24 Stellen ab)',
  mit.win.sb === c1, typeof mit.win.sb);
t('er bekommt URL und Schluessel mit', c1.u === 'https://test.supabase.co' && c1.k === 'schluessel');

// Mehrfach aufrufbar: onload UND das DOMContentLoaded-Netz koennen beide
// feuern. Zwei Clients waeren zwei Realtime-Verbindungen.
var c2 = mit.F.init(); var c3 = mit.F.init();
t('weitere Aufrufe erzeugen KEINEN zweiten Client',
  mit.erzeugt() === 1 && c2 === c1 && c3 === c1, mit.erzeugt() + ' Clients');

// ---- 4. Wenn die Bibliothek fehlt --------------------------------------------
// Ein Blocker, ein CDN-Ausfall: dann darf nichts werfen. Die App faellt auf
// die REST-Wege zurueck, ueber die ohnehin die meisten Zugriffe laufen.
var ohne = lauf(false);
var r = ohne.F.init();
t('ohne Bibliothek wirft kmiSbInit nicht', r === null, String(r));
t('und window.sb bleibt unangetastet statt undefined zu werden',
  !('sb' in ohne.win), Object.keys(ohne.win).join(','));
t('spaeter nachgeladen klappt es dann doch noch',
  (function () {
      ohne.win.supabase = { createClient: function () { return { __client: true }; } };
      return !!ohne.F.init();
  })());

// ---- 5. Das Sicherheitsnetz --------------------------------------------------
t('es haengt ein DOMContentLoaded-Netz fuer den Fall, dass onload ausbleibt',
  mit.hoerer.filter(function (h) { return h[0] === 'DOMContentLoaded'; }).length === 1,
  JSON.stringify(mit.hoerer.map(function (h) { return h[0]; })));
// Es muss VOR den anderen Zuhoerern der Datei stehen -- Zuhoerer laufen in
// der Reihenfolge, in der sie registriert wurden.
var iNetz = H.indexOf("document.addEventListener('DOMContentLoaded', kmiSbInit);");
var andere = [];
var re = /document\.addEventListener\(["']DOMContentLoaded["']/g, m;
while ((m = re.exec(H))) andere.push(m.index);
t('und es ist der ERSTE DOMContentLoaded-Zuhoerer der Datei',
  iNetz > 0 && Math.min.apply(null, andere) === iNetz,
  iNetz + ' vs. frueheste ' + Math.min.apply(null, andere));

// ---- 6. Die Erzeugung passiert nirgends mehr sofort --------------------------
// Der Aufruf darf NUR noch in kmiSbInit stehen. Frueher stand er nackt im
// Inline-Skript und lief damit beim Parsen -- bevor die Bibliothek da war.
var OHNE_KOMMENTARE = H.replace(/<!--[\s\S]*?-->/g, '');
var alleAufrufe = (OHNE_KOMMENTARE.match(/window\.supabase\.createClient\(/g) || []).length;
var inInit = (schneide('kmiSbInit').match(/window\.supabase\.createClient\(/g) || []).length;
t('createClient steht genau einmal im Code', alleAufrufe === 1, alleAufrufe + ' Aufrufe');
t('und zwar innerhalb von kmiSbInit, nicht mehr beim Parsen',
  inInit === 1 && alleAufrufe === inInit, 'in kmiSbInit: ' + inInit);

// ---- 7. Der Grund steht im Quelltext -----------------------------------------
t('die Messung steht bei der Aenderung dabei',
  /vorher:  erster Bildaufbau nach 744 ms/.test(H) && /nachher: erster Bildaufbau nach 152 ms/.test(H));
t('und warum defer frueher nicht ging', /Inline-Skripte laufen sofort, defer-Skripte/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
