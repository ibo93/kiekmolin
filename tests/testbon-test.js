// EIN KNOPF, MIT DEM DER WIRT SELBST MESSEN KANN.
//
// Ibo am 07.09.2026: "Es ist auch alle eingetragen alles ist auch gut aber
// kein bon kommt raus."
//
// Gemessen war bis zur Uebergabe alles in Ordnung: Bestellung 16:56:26 rein,
// Bon 16:56:33 vom Drucker abgeholt. Der Drucker nimmt ihn und wirft ihn weg.
//
// Ich kann nicht in seinen Drucker sehen, und dreimal nachfragen hilft ihm
// nicht. Beim Server Direct Print gab es AUSGERECHNET keinen Testdruck --
// dort stand nur "Druck startet durch Drucker-Polling". Also konnte man,
// wenn nichts kam, gar nichts tun ausser warten, bis ein Gast bestellt.
//
// ZWEI KNOEPFE, WEIL ERST DER VERGLEICH ANTWORTET:
//   einfach kommt, echt kommt  -> alles gut
//   einfach kommt, echt nicht  -> unser Bon-Inhalt (so war es beim lang="de")
//   einfach kommt auch nicht   -> das Geraet
//
// DIE GEFAEHRLICHSTE STELLE IST DAS LOESCHEN DER ANFORDERUNG.
// Bleibt der Merker stehen, holt der Drucker den Testbon alle paar Sekunden
// erneut ab und ist in einer Viertelstunde durch die ganze Rolle. Deshalb:
// erst loeschen, warten, und bei einem Fehler NICHT drucken.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var pp = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'pos-print.js'), 'utf8');
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

function schneide(quelle, name) {
    var a = quelle.indexOf('function ' + name + '(');
    if (a < 0) a = quelle.indexOf('async function ' + name + '(');
    if (a < 0) return '';
    var tiefe = 0, i = quelle.indexOf('{', a);
    if (i < 0) return '';
    for (var j = i; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    return '';
}

// ---- 1. Die Spalte --------------------------------------------------
console.log('\n-- Die Datenbank --');
var sqlPfad = path.join(KMI, 'datenbank', '28-testbon.sql');
t('es gibt die SQL-Datei', fs.existsSync(sqlPfad), 'fehlt');
var sql = fs.existsSync(sqlPfad) ? fs.readFileSync(sqlPfad, 'utf8') : '';
t('sie legt printer_test_art an restaurants an',
  /alter\s+table\s+public\.restaurants/i.test(sql) && /printer_test_art/i.test(sql), 'falsche Tabelle');
t('zweimal ausfuehrbar', /add column if not exists/i.test(sql), 'kracht beim zweiten Mal');

// ---- 2. Der einfachste Bon ------------------------------------------
console.log('\n-- Der nackte Testbon --');
var einfach = schneide(pp, 'testBonEinfach');
t('testBonEinfach wurde gefunden', einfach.length > 100, einfach.length + ' Zeichen');
t('er schneidet ab -- sonst haengt der Zettel im Geraet',
  /<cut type="feed"\/>/.test(einfach), 'kein Schnitt');
t('er hat KEINE Schriftgroessen', !/width="/.test(einfach) && !/height="/.test(einfach), 'Groessen drin');
t('er hat KEINE Ausrichtung', !/align="/.test(einfach), 'Ausrichtung drin');
t('er hat KEINEN QR-Code', !/<symbol/.test(einfach), 'QR drin');
t('er hat keine Umlaute -- die haengen an der Zeichentabelle des Druckers',
  !/[äöüÄÖÜß]/.test(einfach), 'Umlaut drin');
t('er hat KEIN lang-Attribut (genau daran ist es schon einmal gescheitert)',
  !/lang=/.test(einfach), 'lang wieder drin');
t('er ist ein vollstaendiges ePOS-Dokument',
  /epos-print xmlns="http:\/\/www\.epson-pos\.com/.test(einfach) && /<\/s:Envelope>/.test(einfach), 'unvollstaendig');

// ---- 3. Der echte Testbon -------------------------------------------
console.log('\n-- Der Testbon wie im Betrieb --');
var echt = schneide(pp, 'testBonEcht');
t('testBonEcht wurde gefunden', echt.length > 200, echt.length + ' Zeichen');
t('er benutzt WIRKLICH den echten Bon-Bauer -- sonst prueft er nichts',
  /generateEposBon\(/.test(echt), 'eigener Nachbau');
t('mit Umlauten drin', /[äöüÄÖÜß]/.test(echt), 'keine Umlaute -- prueft die Zeichentabelle nicht');
t('mit einer Notiz am Gericht', /notes: 'ohne Zwiebeln'/.test(echt), 'Notizzeile ungeprueft');
t('als Lieferung, damit der QR-Code mitkommt',
  /order_type: 'delivery'/.test(echt) && /delivery_address:/.test(echt), 'QR ungeprueft');
t('er ist als Test erkennbar -- niemand soll ihn kochen',
  /Testbon\. Bitte nicht kochen/.test(echt), 'sieht aus wie eine echte Bestellung');

// ---- 4. Die Auslieferung -- hier haengt die Papierrolle -------------
console.log('\n-- Ausliefern, aber genau einmal --');
t('die Spalte wird im vorhandenen SELECT mitgelesen -- keine Extra-Anfrage',
  /select=id,name,pos_pull_key,printer_last_error_at,printer_test_art/.test(pp), 'zusaetzliche Abfrage pro Poll');
t('der Merker wird geloescht, BEVOR gedruckt wird',
  pp.indexOf("{ printer_test_art: null }") < pp.indexOf('return xmlResponse(testArt ==='), 'Endlosdruck moeglich');
t('auf das Loeschen wird gewartet',
  /await sbPatch\('restaurants\?id=eq\.' \+ encodeURIComponent\(restaurant\), \{ printer_test_art: null \}\);/.test(pp),
  'nicht abgewartet -- der Drucker koennte vorher nochmal fragen');
t('klemmt das Loeschen, wird NICHT gedruckt',
  /catch \(e\) \{[\s\S]{0,220}Testbon-Anforderung nicht geloescht[\s\S]{0,200}return xmlResponse\(emptyEposResponse\(\)\);/.test(pp),
  'druckt trotzdem -- die Rolle waere in einer Viertelstunde durch');
t('der Test steht VOR der Bestellsuche',
  pp.indexOf('printer_test_art) {') < pp.indexOf('Älteste ungedruckte Bestellung'), 'verbraucht eine echte Bestellung');
t('ein Test verbraucht keine Bestellung',
  /return xmlResponse\(testArt === 'einfach'/.test(pp), 'faellt in die Bestellsuche');
t('und wird als Ereignis aufgeschrieben', /'printer_test_sent'/.test(pp), 'nicht nachvollziehbar');
t('nur "einfach" gilt als einfach, alles andere ist der echte Bon',
  /testArt === 'einfach' \? testBonEinfach\(\) : testBonEcht/.test(pp), 'unklare Auswahl');

// ---- 5. Die Knoepfe -------------------------------------------------
console.log('\n-- Im Dashboard --');
t('Server Direct Print hat jetzt Testdruck-Knoepfe',
  /testbonAnfordern\(\\'einfach\\'\)/.test(h) && /testbonAnfordern\(\\'echt\\'\)/.test(h), 'keine Knoepfe');
// Nicht auf den blossen Text pruefen -- der steht (zu Recht) im Kommentar
// daneben und erklaert, warum es die Knoepfe gibt. Gemeint ist der SATZ IN
// DER OBERFLAECHE, also zwischen zwei Tags.
t('der alte Satz steht nicht mehr in der Oberflaeche',
  !/>Druck startet durch Drucker-Polling</.test(h), 'wird dem Wirt noch angezeigt');
t('beide Knoepfe erklaeren sich selbst',
  /title="Nur das Wort TEST/.test(h) && /title="Ein vollständiger Bon/.test(h), 'ohne Erklaerung');
var ta = schneide(h, 'testbonAnfordern');
t('testbonAnfordern wurde gefunden', ta.length > 400, ta.length + ' Zeichen');
t('ohne gewaehltes Restaurant wird nichts geschrieben',
  /Bitte zuerst oben ein Restaurant auswählen/.test(ta), 'schreibt ins Leere');
t('es verlangt die Zeile zurueck -- ein 204 ist kein Beweis',
  /'Prefer': 'return=representation'/.test(ta), '204 gilt als Erfolg');
t('und prueft, dass wirklich eine kam',
  /!Array\.isArray\(zeilen\) \|\| zeilen\.length === 0/.test(ta), 'glaubt dem Status');
t('sonst sagt es, dass NICHT angefordert wurde',
  /Nicht angefordert: die Datenbank hat die Änderung ohne Fehlermeldung verworfen/.test(ta), 'still');
t('fehlt die Spalte, wird genau das gesagt',
  /Spalte "printer_test_art"/.test(ta), 'nur eine Fehlernummer');
t('der Erfolg nennt die Wartezeit -- sonst haelt er es nach drei Sekunden fuer kaputt',
  /5–15 Sekunden/.test(ta), 'keine Erwartung gesetzt');
t('ein unbekannter Wert wird nicht durchgereicht',
  /art === 'einfach' \? 'einfach' : 'echt'/.test(ta), 'schreibt Beliebiges in die Datenbank');

// ---- 6. Auslieferung ------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 26', !!m && Number(m[1]) >= 26, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
