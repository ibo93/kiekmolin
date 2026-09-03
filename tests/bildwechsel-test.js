// DER HARTE SCHNITT BEIM BILDWECHSEL.
//
// Gemeldet am 02.09.2026: "das bilder stoerend ist wieder da ... beim
// wechsel der bilder".
//
// Am 19.08. war schon einmal etwas mit diesen Bildern: das Zittern kam
// von einer Ken-Burns-Bewegung ueber background-size, einer
// MAL-Eigenschaft. Das wurde auf transform umgestellt und war weg.
//
// DIESMAL WAR ES DER WECHSEL SELBST. Der Ablauf war:
//
//     ebeneVorbereiten(kommt, bild)   ->  transition: none
//     kommt.style.opacity = '1'       ->  WAEHREND transition none
//
// Also sprang das neue Bild mit einem Schlag auf volle Deckkraft,
// waehrend das alte darunter zwei Sekunden ausblendete. Kein
// Ueberblenden, sondern ein harter Schnitt mit Nachleuchten.
//
// Die Reihenfolge ist der ganze Punkt: erst den Uebergang setzen, DANN
// die Deckkraft. Genau das prueft diese Datei -- sie zeichnet auf, in
// welcher Reihenfolge an den Ebenen geschraubt wird.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

function schnipsel(name) {
    var a = h.indexOf('    function ' + name + '(');
    if (a < 0) return '';
    var e = h.indexOf('\n    }\n', a);
    return e < 0 ? '' : h.slice(a, e + 6);
}
var quelleVorbereiten = schnipsel('ebeneVorbereiten');
var quelleEinblenden  = schnipsel('einblenden');
t('ebeneVorbereiten gefunden', quelleVorbereiten.length > 100, quelleVorbereiten.length);
t('einblenden gefunden', quelleEinblenden.length > 100, quelleEinblenden.length);

// Eine Ebene, die mitschreibt, was in welcher Reihenfolge gesetzt wird.
function ebene(name, protokoll) {
    var werte = {};
    return {
        name: name,
        werte: werte,
        style: new Proxy({}, {
            set: function (ziel, k, v) {
                werte[k] = v;
                protokoll.push(name + '.' + k + '=' + v);
                return true;
            },
            get: function (ziel, k) { return werte[k]; }
        })
    };
}

function laufen(ruhe) {
    var protokoll = [];
    var kommt = ebene('kommt', protokoll), geht = ebene('geht', protokoll);
    var welt = {
        RUHE: ruhe,
        ZOOM: 'scale(1.06)',
        // Zwei verschachtelte Bilder -- sofort ausfuehren, wir messen nur
        // die Reihenfolge, nicht die Zeit.
        requestAnimationFrame: function (f) { f(); }
    };
    vm.createContext(welt);
    vm.runInContext(quelleVorbereiten + '\n' + quelleEinblenden, welt);
    welt.ebeneVorbereiten(kommt, 'bild.jpg');
    welt.einblenden(kommt, geht);
    return { protokoll: protokoll, kommt: kommt, geht: geht };
}

function stelle(protokoll, teil) {
    for (var i = 0; i < protokoll.length; i++) if (protokoll[i].indexOf(teil) === 0) return i;
    return -1;
}

console.log('\n-- 1. Die neue Ebene faengt unsichtbar an --');
var a = laufen(false);
t('ebeneVorbereiten setzt opacity auf 0', stelle(a.protokoll, 'kommt.opacity=0') > -1,
  a.protokoll.join(' | '));
t('und zwar VOR dem Einblenden',
  stelle(a.protokoll, 'kommt.opacity=0') < stelle(a.protokoll, 'kommt.opacity=1'), a.protokoll.join(' | '));

console.log('\n-- 2. Erst der Uebergang, DANN die Deckkraft --');
// Das ist der Fehler von heute, in einer Zeile: opacity aendern, solange
// transition auf 'none' steht, gibt einen Sprung.
var iTrans = -1, iEins = stelle(a.protokoll, 'kommt.opacity=1');
for (var i = 0; i < a.protokoll.length; i++) {
    if (a.protokoll[i].indexOf('kommt.transition=opacity') === 0) { iTrans = i; break; }
}
t('der Uebergang wird gesetzt', iTrans > -1, a.protokoll.join(' | '));
t('und er steht VOR dem Sichtbarmachen', iTrans > -1 && iTrans < iEins,
  'transition an Stelle ' + iTrans + ', opacity=1 an Stelle ' + iEins);
t('zum Zeitpunkt des Sichtbarmachens steht transition nicht mehr auf none',
  a.kommt.werte.transition !== 'none', a.kommt.werte.transition);

console.log('\n-- 3. Das alte Bild blendet aus --');
t('die alte Ebene geht auf 0', a.geht.werte.opacity === '0', a.geht.werte.opacity);

console.log('\n-- 4. Auch wer ruhige Bewegung eingestellt hat, bekommt ein Ueberblenden --');
// Vorher fiel fuer ihn BEIDES weg: zoomStarten() sprang vorne aus, damit
// wurde die transition nie gesetzt -- jeder Wechsel ein harter Schnitt.
// Kein Zoom heisst nicht kein Uebergang.
var b = laufen(true);
t('der Uebergang wird trotzdem gesetzt', /opacity 2s/.test(b.kommt.werte.transition || ''),
  b.kommt.werte.transition);
t('aber ohne Zoom', !/transform/.test(b.kommt.werte.transition || ''), b.kommt.werte.transition);
t('und die Ebene wird nicht vergroessert', b.kommt.werte.transform === 'scale(1)', b.kommt.werte.transform);
t('sichtbar wird sie aber sehr wohl', b.kommt.werte.opacity === '1', b.kommt.werte.opacity);

console.log('\n-- 5. Und die Reparatur vom 19.08. steht noch --');
// Damals: Ken Burns lief ueber background-size, eine MAL-Eigenschaft --
// der Browser rasterte das ganze Bild in jedem Einzelbild neu. Das war
// das Zittern. transform macht dasselbe auf der Grafikkarte.
t('der Zoom laeuft ueber transform', /transform: *scale|transform = ZOOM|ZOOM/.test(quelleEinblenden),
  'kein transform');
t('und nicht ueber background-size',
  !/backgroundSize *= *'1[0-9][0-9]%'/.test(quelleVorbereiten + quelleEinblenden), 'wieder background-size');
t('background-size bleibt auf cover', /backgroundSize = 'cover'/.test(quelleVorbereiten), 'geaendert');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
