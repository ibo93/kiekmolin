var fs = require('fs'), n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x)); }
var sw = fs.readFileSync('/home/user/kiekmolin/sw.js','utf8');
var html = fs.readFileSync('/home/user/kiekmolin/index.html','utf8');

// --- Service Worker gehärtet ---
var fetchTeil = sw.slice(sw.indexOf("addEventListener('fetch'"), sw.indexOf("addEventListener('push'"));
t('SW: liest im fetch-Handler keinen Rumpf als Text ein (war der 1,2-MB-Fehler)',
  !/\.text\(\)/.test(fetchTeil), 'gefunden in: ' + (fetchTeil.match(/.{0,40}\.text\(\)/) || [''])[0]);
t('SW: liest den Rumpf NICHT mehr doppelt ein', !/cached\.clone\(\)\.text\(\)/.test(sw));
t('SW: Huellen-Pfad faengt jeden Fehler ab (Offline-Antwort statt leerer Seite)',
  /catch \(e\) \{/.test(sw) && /status: 503/.test(sw));
// Frueher stand hier ein "await" davor. Das Schreiben laeuft jetzt neben der
// Antwort her (siehe sw-geduld-test.js) -- und braucht deshalb ZWEI
// Absicherungen statt einer: try faengt ein sofortiges Werfen, .catch die
// abgelehnte Zusage. Ohne das zweite waere ein voller Speicher eine
// unbehandelte Ablehnung.
t('SW: Cache-Schreibfehler kippt die Seite nicht',
  /try \{ cache\.put\(SHELL, res\.clone\(\)\)\.catch\(function \(\) \{\}\); \} catch \(e\) \{\}/.test(sw));
t('SW: Notausgang /?nosw=1 vorhanden', /nosw'\) === '1'/.test(sw) && /if \(AUS\) return;/.test(sw));
t('SW: Notausgang laesst sich zuruecknehmen', /nosw'\) === '0'/.test(sw));
t('SW: Datenbank + Functions weiterhin nie gecacht',
  /indexOf\('\/rest\/v1\/'\) === 0\) return/.test(sw) && /indexOf\('\/\.netlify\/'\) === 0\) return/.test(sw));
t('SW: Push-Handler unberuehrt', /addEventListener\('push'/.test(sw));

// --- sbRead: "nichts gefunden" ist kein Fehler ---
t('sbRead behandelt 404/406 als normalen Fall',
  /res\.status === 404 \|\| res\.status === 406/.test(html));
t('sbRead meldet "nichts gefunden" NICHT als Fehler', /if \(!nichtsGefunden\) \{/.test(html));
t('sbRead meldet "nichts gefunden" auch nicht an die Fehlerliste',
  /if \(!nichtsGefunden\) \{[\s\S]{0,2200}?meldeFehler/.test(html));
t('Aufrufer kann den Fall unterscheiden', /err\.notFound = nichtsGefunden/.test(html));

console.log('\n' + (ok===n ? `Alle ${n} Tests bestanden.` : `${n-ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok===n?0:1);
