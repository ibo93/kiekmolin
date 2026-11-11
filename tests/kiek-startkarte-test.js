// KIEK-STARTKARTE (11.11.2026, Entwurf in Claude Design: "Hunger, aber keine Idee?").
//
// Wie es kaputt aussaehe:
//  - Feld oder Vorschlag oeffnet Kiek, aber die Frage kommt nie an -> der
//    Gast sieht nur die Begruessung und denkt, Kiek kann nichts.
//  - Die Frage bleibt im Feld stehen -> beim Zurueckkommen doppelt.
//  - Leeres Feld schickt eine leere Frage -> Kiek antwortet auf nichts.
//  - Schwebender Knopf und Karte gleichzeitig -> der Knopf liegt auf
//    "Karte entdecken" (im Chromium gesehen, 390 px breit).
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, q) {
    q = q || H;
    var i = q.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++; var d = 0, j = q.indexOf('{', i);
    for (var k = j; k < q.length; k++) { if (q[k] === '{') d++; else if (q[k] === '}') { d--; if (!d) return q.slice(i, k + 1); } }
}
function lauf(quelle, frage) {
    var log = [], feld = { value: frage };
    var doc = { getElementById: function (id) { return id === 'kiekStartFrage' ? feld : null; } };
    new Function('document', 'openAssistant', 'askAssistant', fn('kiekStartFragen', quelle) + '; kiekStartFragen(' + JSON.stringify(frage) + ');')(
        doc, function () { log.push('auf'); }, function (q) { log.push('frage:' + q); });
    return { log: log, feld: feld.value };
}
var r = lauf(H, '  Wo gibt es Fisch?  ');
t('Frage: Kiek geht auf und bekommt die Frage (ohne Leerzeichen)', r.log.join('|') === 'auf|frage:Wo gibt es Fisch?', r.log.join('|'));
t('Feld ist danach leer', r.feld === '', JSON.stringify(r.feld));
var leer = lauf(H, '   ');
t('Leeres Feld: Kiek geht nur auf, keine leere Frage', leer.log.join('|') === 'auf', leer.log.join('|'));

// Gegenprobe: ohne askAssistant-Aufruf muss der erste Test rot werden.
var kaputt = H.replace(/(function kiekStartFragen\([\s\S]*?)askAssistant\(frage\);/, '$1/*weg*/');
t('Gegenprobe: ohne askAssistant kommt keine Frage an (Test erkennt das)', lauf(kaputt, 'X').log.join('|') === 'auf', '');

// Seite
var karte = (/<section id="kiekStart"[\s\S]*?<\/section>/.exec(H) || [''])[0];
t('Karte steht auf der Startseite, vor "Jetzt geöffnet"', karte && H.indexOf('id="kiekStart"') < H.indexOf('id="heuteAbend"'), '');
t('Formular schickt ueber kiekStartFragen, ohne Seite neu zu laden', /onsubmit="event\.preventDefault\(\); kiekStartFragen\(/.test(karte), '');
t('Feld hat ein Label', /<label for="kiekStartFrage"/.test(karte) && /id="kiekStartFrage"/.test(karte), '');
var chips = karte.match(/data-frage="[^"]+"/g) || [];
t('Drei Vorschlaege mit echter Frage', chips.length === 3, chips.length);
t('Keine erfundenen Orte in den Vorschlaegen (Kiek kennt nur echte Lokale)', !/Greetsiel|Aurich|Norden/.test(karte), '');
t('Dunkelmodus fuer Karte, Feld und Vorschlaege', /\.dark-mode \.kiek-start \{/.test(H) && /\.dark-mode \.kiek-start-feld \{/.test(H) && /\.dark-mode \.kiek-start-chips button \{/.test(H), '');
t('Schwebender Knopf weicht, solange die Karte sichtbar ist', /IntersectionObserver[\s\S]{0,200}kiek-knopf-weg/.test(H) && /#assistantBtn\.kiek-knopf\.kiek-knopf-weg \{[^}]*pointer-events: none/.test(H), '');
t('Ohne IntersectionObserver bleibt der Knopf (kein stiller Ausfall)', /typeof IntersectionObserver !== 'function'\) return;/.test(H), '');

console.log('\n' + ok + '/' + n + ' bestanden');
process.exit(ok === n ? 0 : 1);
