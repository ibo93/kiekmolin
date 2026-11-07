// EIN KANAL FUER ANFRAGEN (Ibo, 07.11.2026: "das es auf ein Kanal landet")
//
// Wirte sollen von Kiek mol in direkt zum Kurani-Check kommen -- und zwar immer
// zur SELBEN Anfrage-Seite, mit quelle=kiekmolin (damit man sieht, woher Anfragen
// kommen). Die alte Seite /check.html (Sichtbarkeits-Check -> info@) leitet dorthin
// um, statt einen zweiten Kanal offen zu halten.
//
// Wie sieht es aus, wenn es kaputt ist? Ein Link ohne quelle -> Anfragen zaehlen als
// "Formular" statt "Kiek mol in". Eine Umleitung ohne force -> die alte check.html
// gewinnt still, und Anfragen landen wieder im alten Postfach.
'use strict';
var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var ZIEL = 'https://kurani-check.netlify.app/check-anfordern?quelle=kiekmolin';

var ok = 0, fehler = 0;
function t(name, bed, info) { if (bed) { ok++; console.log('OK   | ' + name); } else { fehler++; console.log('FAIL | ' + name + (info ? '  -> ' + info : '')); } }

var html = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var toml = fs.readFileSync(path.join(KMI, 'netlify.toml'), 'utf8');

// Seit 07.11.2026 abends (Ibo: der dunkle Kurani-Kasten "nervt", und Gastro bekommt
// ohnehin Kiek mol in): KEIN Kurani-Kasten im Dashboard, KEIN Kurani-Link in der
// Fusszeile. Wer als Wirt kommt, geht ueber den ruhigen Balken auf /starten.
t('kein Kurani-Kasten mehr im Wirte-Dashboard', html.indexOf('id="kuraniCheckKasten"') < 0 && !/kuraniCheckAusblenden/.test(html));
t('kein Kurani-Link mehr auf kiekmolin.de', html.indexOf('kurani-check.netlify.app') < 0);

// Alte Adresse -> neue Seite, mit force (sonst gewinnt die vorhandene Datei still)
['/check.html', '/check'].forEach(function (von) {
    var re = new RegExp('\\[\\[redirects\\]\\]\\s*from = "' + von.replace('.', '\\.') + '"\\s*to = "([^"]+)"\\s*status = (\\d+)\\s*force = (true|false)');
    var m = toml.match(re);
    t(von + ' wird umgeleitet', !!m);
    t(von + ' -> EINE Anfrage-Seite', m && m[1] === ZIEL, m && m[1]);
    t(von + ' mit force = true', m && m[3] === 'true');
});

console.log('\n' + (fehler ? fehler + ' von ' + (ok + fehler) + ' Tests fehlgeschlagen.' : 'Alle ' + ok + ' Tests bestanden.'));
if (fehler) process.exit(1);
