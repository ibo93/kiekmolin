// window.X, WO X EIN let ODER const IST -- IMMER undefined.
//
// Gemeldet am 21.08.2026: "ich als admin bekomme keine nachricht auf
// mein handy liegt das an admin oder auch die andere". Sein Verdacht
// stimmte, und der Grund war eine Zeile in subscribeWebPush():
//
//   if (window.currentUser && ... 'superadmin') adminMail = ...
//   else if (window.currentAdmin && window.currentAdmin.isAdmin) ...
//
// currentUser und currentAdmin sind beide mit let deklariert. Eine
// let- oder const-Variable haengt NICHT am window-Objekt -- anders als
// ein altes var. window.currentAdmin war also immer undefined, adminMail
// immer null, und sein Handy trug sich ohne E-Mail ein. Der Melder sucht
// die Admin-Geraete aber genau ueber diese E-Mail.
//
// Beim Gastronom fiel es nicht auf: dessen Zweig lief ueber
// window._gastroOnlyRestaurantId, und das wird mit window. gesetzt.
// Deshalb ging es bei den einen und bei ihm nicht.
//
// WARUM DAS NIEMANDEM AUFFIEL
// "undefined && irgendwas" ist gueltiges JavaScript. Es wirft nicht, es
// warnt nicht, es faellt einfach immer in den anderen Zweig. Beim
// Nachzaehlen stand an 21 Stellen window.APP_DATA -- jede einzelne war
// immer falsch, und mit ihnen fielen der KI-Berater, die
// Vorbereitungszeiten und der Tischruf still aus.
//
// Dieser Test liest index.html, sammelt alle let/const auf oberster
// Ebene ein und sieht nach, ob irgendwo window.<dieser Name> steht,
// ohne dass es eine Zeile window.<Name> = ... gibt.

var fs = require('fs');
var path = require('path');
var QUELLE = path.join(__dirname, '..', 'index.html');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var roh = fs.readFileSync(QUELLE, 'utf8');

// Kommentare weg -- sonst meldet der Test die Erklaerungen, die genau
// diesen Fehler beschreiben. (Das ist hier schon zweimal passiert.)
//
// NUR Zeilenkommentare. Der erste Versuch warf auch /* ... */ weg und
// verschluckte damit 1,37 Millionen Zeichen -- ein Drittel der Datei,
// subscribeWebPush inklusive. Grund: irgendwo steht /* in einer
// Zeichenkette, und ab da laeuft der Ausdruck bis zum naechsten */
// quer durch fremden Code. Ein Filter, der mehr wegnimmt als er soll,
// macht einen gruenen Test, der nichts geprueft hat.
function ohneKommentare(txt) {
    return txt
        .split('\n')
        .map(function (z) { return z.replace(/^(\s*)\/\/.*$/, '$1'); })
        .join('\n');
}
var src = ohneKommentare(roh);

console.log('\n-- 1. Was mit let/const auf oberster Ebene steht --');
var deklariert = {};
(src.match(/(?:^|\n)(?:let|const)\s+([A-Za-z_$][\w$]*)/g) || []).forEach(function (x) {
    deklariert[x.replace(/[\s\S]*?(?:let|const)\s+/, '')] = true;
});
var namen = Object.keys(deklariert);
t('es gibt oberste let/const zu pruefen', namen.length > 10, namen.length);

console.log('\n-- 2. Wer davon wird ans window gehaengt --');
var amFenster = {};
(src.match(/window\.([A-Za-z_$][\w$]*)\s*=[^=]/g) || []).forEach(function (x) {
    amFenster[x.replace(/^window\./, '').replace(/\s*=[\s\S]*$/, '')] = true;
});
// APP_DATA ist der Fall, der den Anstoss gab: 21 Abfragen auf
// window.APP_DATA, und die eine Zeile, die sie alle richtig macht.
t('window.APP_DATA wird gesetzt', amFenster.APP_DATA === true, 'fehlt -- 21 Abfragen laufen ins Leere');
t('window.supabaseClient wird gesetzt', amFenster.supabaseClient === true, 'fehlt');

console.log('\n-- 3. Und wer abgefragt wird, ohne dass es ihn gibt --');
var gelesen = {};
var re = /window\.([A-Za-z_$][\w$]*)/g, m;
while ((m = re.exec(src))) {
    var name = m[1];
    if (!gelesen[name]) gelesen[name] = [];
    gelesen[name].push(src.slice(0, m.index).split('\n').length);
}
var blind = namen.filter(function (name) {
    return gelesen[name] && !amFenster[name];
});
t('keine window.X-Abfrage auf ein let/const ohne Zuweisung',
  blind.length === 0,
  blind.map(function (b) { return 'window.' + b + ' (Zeile ' + gelesen[b].join(', ') + ') -- immer undefined'; }).join(' | '));

console.log('\n-- 4. Die Stellen, an denen es geknallt ist --');
// Der Admin-Push. Beide Namen duerfen dort nie wieder mit window. stehen.
var push = src.slice(src.indexOf('function subscribeWebPush()'));
push = push.slice(0, push.indexOf('\nfunction ', 10));
t('subscribeWebPush fragt currentAdmin direkt ab',
  /typeof currentAdmin !== 'undefined'/.test(push), 'wieder ueber window?');
t('subscribeWebPush fragt currentUser direkt ab',
  /typeof currentUser !== 'undefined'/.test(push), 'wieder ueber window?');
t('und kein window.currentAdmin/currentUser mehr darin',
  /window\.current(Admin|User)/.test(push) === false, 'steht wieder da');
// Der Notnagel fuer den Betrieb: kmi_admin schreibt niemand,
// kmi_gastro_restaurant_id schon.
t('Notnagel liest den Schluessel, den es wirklich gibt',
  push.indexOf('kmi_gastro_restaurant_id') > -1 && push.indexOf("localStorage.getItem('kmi_admin')") === -1,
  'liest wieder kmi_admin');

// Der Tischruf. APP_DATA.currentUser wird nirgends gesetzt -- da half
// auch window.APP_DATA nicht.
t('APP_DATA.currentUser wird nirgends GESETZT',
  /APP_DATA\.currentUser\s*=/.test(src) === false, 'jetzt doch?');
var ruf = src.slice(src.indexOf('function _tischRufFuerMich'));
ruf = ruf.slice(0, ruf.indexOf('\nfunction ', 10));
t('Tischruf fragt nicht mehr APP_DATA.currentUser',
  ruf.indexOf('APP_DATA.currentUser') === -1, 'fragt eine Eigenschaft ab, die es nicht gibt');
t('Tischruf prueft stattdessen currentAdmin',
  /typeof currentAdmin !== 'undefined'/.test(ruf), 'prueft was anderes');

// Der Fehlermelder: currentUser aus einem frueheren <script>-Block, und
// bei let wirft schon typeof, wenn die Zeile noch nicht gelaufen ist.
t('Fehlermelder hat einen eigenen, abgesicherten Zugriff',
  /function _melderNutzer\(feld\)\s*\{\s*try \{/.test(src), 'kein try/catch');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
