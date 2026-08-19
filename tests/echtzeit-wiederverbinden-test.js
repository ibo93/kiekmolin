// Prueft die Wache ueber die Echtzeit-Verbindungen.
//
// Vorher: alle 30 Sekunden nachsehen, ob ALLE zehn Kanaele stehen -- und
// wenn EINER fehlt, alle zehn wegwerfen und neu aufbauen. Ohne Abbruch,
// ohne steigende Wartezeit.
//
// Kann ein Kanal grundsaetzlich nicht verbinden -- Tabelle nicht fuer
// Echtzeit freigegeben, oder eine Regel sperrt sie -- laeuft das endlos:
// abbauen, aufbauen, scheitern, abbauen. Jeder Neuaufbau kostet zehn
// Verbindungen und zeichnet nebenbei die Startseite neu.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var w = h.slice(h.indexOf('window._realtimeHeartbeat = setInterval'));
w = w.slice(0, w.indexOf('}, 30000);') + 10);

console.log('\n-- Es wird nicht mehr endlos versucht --');

t('es gibt eine Obergrenze', /MAX_VERSUCHE = 5/.test(h));
t('und sie wird geprueft', /_realtimeVersuche >= MAX_VERSUCHE/.test(w), w.slice(0, 300));
t('danach wird nicht mehr neu aufgebaut',
  w.indexOf('_realtimeVersuche >= MAX_VERSUCHE') < w.indexOf('_realtimeVersuche++'), 'Reihenfolge');

console.log('\n-- Die Wartezeit steigt --');

t('sie verdoppelt sich mit jedem Versuch',
  /2000 \* Math\.pow\(2, window\._realtimeVersuche - 1\)/.test(w), w.slice(-400));
t('nicht mehr fest 2 Sekunden', !/setTimeout\(function \(\) \{ initRealtime\(\); \}, 2000\)/.test(w));

console.log('\n-- Aufgegeben wird laut, nicht still --');

t('einmal in die Konsole', /nach '\s*\+\s*MAX_VERSUCHE/.test(w) || /aufgegeben/.test(w), w.slice(-600));
t('und in die Fehlerliste des Betreibers', /meldeFehler\(\{/.test(w));
t('die betroffenen Kanaele werden benannt', /ch\.topic/.test(w));
t('nur EINMAL gemeldet, nicht alle 30 Sekunden',
  /if \(!window\._realtimeAufgegeben\)/.test(w));

console.log('\n-- Erholt sich die Leitung, geht es weiter --');

t('der Zaehler faengt bei null an', /window\._realtimeVersuche = 0;/.test(w));
// Ohne das bliebe die App bis zum Neuladen taub, obwohl wieder alles steht.
t('und das Aufgeben wird zurueckgenommen', /window\._realtimeAufgegeben = false;/.test(w));

console.log('\n-- Was bleibt --');

t('geprueft wird weiterhin alle 30 Sekunden', /\}, 30000\);/.test(w));
t('ein leerer Kanal-Satz loest nichts aus', /if \(!channels\.length\) return;/.test(w));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
