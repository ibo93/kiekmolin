// WARUM KEIN BON KOMMT -- UND WARUM ES BISHER NIEMAND ERFAHREN HAT.
//
// Ibo am 07.09.2026: "Es ist verbunden kommt aber kein bon Druck."
//
// GEMESSEN, NICHT VERMUTET (Supabase edge_logs, 24 Stunden):
//
//   Drucker A  24.676 Anfragen | Schluessel ok | 2 Bons gefunden 16:56, 17:06
//   Drucker B   1.437 Anfragen | kommt NIE am Schluessel vorbei
//   Drucker C     342 Anfragen | kommt NIE am Schluessel vorbei
//
// Bei A war die Kette bis zum Schluss in Ordnung: Bestellung um 16:56 rein,
// Sekunden spaeter hat der Drucker den Bon abgeholt. Trotzdem kein Zettel.
//
// Der Grund WAR da. Der Epson meldet nach jedem Auftrag zurueck, ob er
// drucken konnte -- mit Fehlercode. pos-print.js liest das sogar aus und
// schrieb es NUR nach console.log bei Netlify. Also dorthin, wo weder der
// Wirt noch sonst jemand hinsieht.
//
// Bei B und C dasselbe Muster an anderer Stelle: abgewiesen bei jeder
// einzelnen Anfrage, seit Stunden, ohne ein Wort.
//
// DREI FALLEN BEIM REPARIEREN:
// 1. 1.437 Abweisungen am Tag duerfen nicht 1.437 Meldungen werden.
//    Am 27.08. hat uns diese Art Wiederholung 96 E-Mails in einer Nacht
//    eingebracht. Hoechstens eine pro Stunde.
// 2. Das Protokollieren darf den Bon nie aufhalten. Ein verlorenes
//    Protokoll ist aergerlich, eine verlorene Bestellung kostet Geld.
// 3. Auch der ERFOLG muss aufgeschrieben werden. Sonst waere "keine
//    Meldung" wieder zweideutig -- nichts gedruckt, oder alles gut?

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

// ---- 1. Die Spalte fuer die Bremse ----------------------------------
console.log('\n-- Die Datenbank --');
var sqlPfad = path.join(KMI, 'datenbank', '27-drucker-rueckmeldung.sql');
t('es gibt die SQL-Datei', fs.existsSync(sqlPfad), 'fehlt');
var sql = fs.existsSync(sqlPfad) ? fs.readFileSync(sqlPfad, 'utf8') : '';
t('sie legt printer_last_error_at an restaurants an',
  /alter\s+table\s+public\.restaurants/i.test(sql) && /printer_last_error_at/i.test(sql), 'falsche Tabelle');
t('sie ist zweimal ausfuehrbar', /add column if not exists/i.test(sql), 'kracht beim zweiten Mal');
t('sie legt KEINE neue Ereignis-Tabelle an (restaurant_events gibt es seit Schritt 20)',
  !/create\s+table[^;]*restaurant_events/i.test(sql), 'doppelt gebaut');

// ---- 2. Der Ereignis-Schreiber --------------------------------------
console.log('\n-- Aufschreiben statt wegwerfen --');
var er = schneide(pp, 'ereignis');
t('ereignis() wurde gefunden', er.length > 200, er.length + ' Zeichen');
t('es schreibt nach restaurant_events',
  /rest\/v1\/restaurant_events/.test(er) && /method: 'POST'/.test(er), 'schreibt woanders hin');
t('es benutzt den Service-Schluessel (die Meldung kommt vom Server)',
  /svcHeaders\(\)/.test(er), 'falscher Schluessel');
t('ohne Restaurant wird nichts geschrieben -- eine Stoerung ohne Haus ist wertlos',
  /if \(!restaurantId\) return;/.test(er), 'schreibt Muell');
t('der Text wird begrenzt', /\.slice\(0, 500\)/.test(er), 'unbegrenzt');
t('es reisst nie den Bon mit runter',
  /catch \(e\)/.test(er) && /console\.warn/.test(er), 'kann den Druck verhindern');

// ---- 3. Der abgewiesene Drucker -------------------------------------
console.log('\n-- Abgewiesen, aber nicht mehr stumm --');
t('alle drei Abweisungsgruende bekommen einen eigenen Satz',
  /Restaurant an, das es nicht gibt/.test(pp)
  && /gar kein Drucker-Schluessel hinterlegt/.test(pp)
  && /FALSCHEN Schluessel/.test(pp), 'ein Grund fehlt');
t('der falsche Schluessel wird als Ereignis geschrieben',
  /ereignis\(restaurant, 'printer_rejected'/.test(pp), 'weiter still');
t('hoechstens eine Meldung pro Stunde',
  /langGenugHer = !zuletzt \|\| \(Date\.now\(\) - new Date\(zuletzt\)\.getTime\(\)\) > 60 \* 60 \* 1000;/.test(pp),
  'flutet die Tabelle');
t('und die Bremse entscheidet wirklich ueber das Schreiben',
  /if \(rrows\.length && langGenugHer\) \{[\s\S]{0,200}ereignis\(restaurant, 'printer_rejected'/.test(pp),
  'Bremse haengt an nichts');
t('der Zeitstempel wird danach gesetzt',
  /printer_last_error_at: new Date\(\)\.toISOString\(\)/.test(pp), 'Bremse greift nie');
t('die Bremse wird im VORHANDENEN Select mitgelesen -- keine Extra-Anfrage',
  /select=id,name,pos_pull_key,printer_last_error_at/.test(pp), 'zusaetzliche Abfrage pro Poll');
t('ein unbekanntes Restaurant bekommt keinen Zeitstempel geschrieben',
  /if \(rrows\.length && langGenugHer\)/.test(pp), 'schreibt auf eine Zeile, die es nicht gibt');
t('der Drucker bekommt trotzdem eine gueltige leere Antwort (sonst Fehler-LED)',
  /if \(abweisung\)[\s\S]{0,900}return xmlResponse\(emptyEposResponse\(\)\);/.test(pp), 'Drucker meldet Fehler');
t('der Schluessel selbst steht NICHT in der Meldung',
  !/payload[^)]*pos_pull_key/.test(pp) && /schluessel_laenge/.test(pp), 'Schluessel im Klartext protokolliert');

// ---- 4. Die Rueckmeldung des Druckers -------------------------------
console.log('\n-- Was der Drucker selbst sagt --');
t('ein Fehlschlag wird aufgeschrieben', /'printer_failed'/.test(pp), 'landet nur in console.log');
t('ein Erfolg auch -- sonst waere Schweigen wieder zweideutig',
  /'printer_ok'/.test(pp), 'nur Fehler');
t('der Fehlercode wird in Klartext uebersetzt',
  /codeKlartext\(meldung\.code\)/.test(pp), 'nur der rohe Code');
t('der rohe Code steht trotzdem dabei (fuers Handbuch)',
  /code: meldung\.code \|\| null/.test(pp), 'Code verloren');
t('die Klartexte gibt es wirklich',
  /EPTR_REC_EMPTY: 'Kein Papier mehr'/.test(pp) && /DeviceNotFound:/.test(pp), 'Tabelle fehlt');
t('geschrieben wird VOR der leeren Antwort',
  pp.indexOf("ereignis(restaurant,\n                meldung.erfolg") < pp.indexOf('// BEWUSST ohne Bestellung antworten'), 'nach dem return');

// ---- 5. Was der Wirt sieht ------------------------------------------
console.log('\n-- Im Dashboard --');
t('es gibt einen Platz dafuer', /id="druckerMeldungZeile"/.test(h) && /id="druckerMeldungText"/.test(h), 'kein Platz');
var rd = schneide(h, '_renderDruckerMeldung');
t('_renderDruckerMeldung wurde gefunden', rd.length > 200, rd.length + ' Zeichen');
t('ein Erfolg wird NICHT angezeigt -- die gruene Ampel sagt das schon',
  /printer_failed' \|\| ereignis\.type === 'printer_rejected'/.test(rd)
  && !/=== 'printer_ok'/.test(rd), 'Laerm');
t('eine alte Meldung wird nicht als heutige ausgegeben',
  /DRUCKER_MELDUNG_MAX_ALTER_MS/.test(rd), 'zeigt Fehler von vorgestern');
t('die Grenze ist gesetzt', /var DRUCKER_MELDUNG_MAX_ALTER_MS = 12 \* 60 \* 60 \* 1000;/.test(h), 'keine Grenze');
t('ohne Meldung verschwindet die Zeile wirklich',
  /if \(!zeigen\) \{ kasten\.style\.display = 'none'; return; \}/.test(rd), 'bleibt stehen');
t('der Text wird als Text gesetzt, nicht als HTML',
  /text\.textContent =/.test(rd) && !/text\.innerHTML/.test(rd), 'XSS-Weg offen');
var rdm = schneide(h, 'refreshDruckerMeldung');
t('refreshDruckerMeldung wurde gefunden', rdm.length > 200, rdm.length + ' Zeichen');
t('es holt genau die neueste Meldung',
  /order=created_at\.desc&limit=1/.test(rdm), 'holt zu viel');
t('fehlt die Tabelle, bleibt die Zeile weg statt zu krachen',
  /if \(!res\.ok\) \{ _renderDruckerMeldung\(null\); return; \}/.test(rdm), 'wirft');
t('es wird beim Auffrischen mitgezogen',
  /refreshDruckerMeldung\(restId\);/.test(h), 'wird nie aufgerufen');
t('ohne gewaehltes Restaurant wird die Zeile geleert',
  /_renderDruckerMeldung\(null\);\n        return;/.test(h), 'zeigt fremde Meldung weiter');
var rp = schneide(h, 'refreshPrinterStatus');
t('die Ampel wird von der Meldung nicht mitgerissen',
  rp.indexOf('_renderPrinterStatus(data[0]') < rp.indexOf('refreshDruckerMeldung(restId)'), 'Reihenfolge falsch');

// ---- 6. Auslieferung ------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 25', !!m && Number(m[1]) >= 25, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
