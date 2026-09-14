// DER DRUCKER SCHREIBT 16 MAL PRO MINUTE IN DIE DATENBANK -- UND NIEMAND
// ERFAEHRT, OB JE EIN BON KAM.
//
// Gemessen am 14.09.2026 aus edge_logs:
//   6.466 PATCH auf EIN Restaurant in 6,5 Stunden  = 16,6 pro Minute
//   24.600 Abrufe vom Drucker in 24 Stunden        = 17,1 pro Minute
//   0 Rueckmeldungen (printer_ok / printer_failed) -- bei ALLEN Betrieben,
//     seit es die Rueckmeldung gibt. Die Abfrage hat keine Zeitgrenze.
//
// ZWEI PROBLEME, EINE URSACHE
//
// 1. Jeder Abruf stempelte "zuletzt gemeldet". Das kostet nicht nur
//    Schreibvorgaenge -- es hat beim Suchen nach einem Fehler die echten
//    Eintraege zugedeckt: eine gespeicherte Einstellung ging in tausenden
//    gleicher Zeilen unter.
// 2. Die Ampel stand die ganze Zeit auf gruen. Gruen heisst aber nur "er
//    fragt nach Arbeit", nicht "es kam ein Bon". Genau dieser Unterschied
//    hat eine Woche gekostet.
//
// UND EINE FALLE BEIM REPARIEREN: die Ampel wurde bei 30 Sekunden gelb.
// Mit einer Drosselung auf 60 Sekunden stuende ein voellig gesunder
// Drucker die halbe Zeit auf "langsam". Die Schwelle muss mitwandern.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var POS = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'pos-print.js'), 'utf8');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// ---- 1. Die Drosselung -------------------------------------------------
console.log('\n-- Hoechstens einmal pro Minute --');
t('der alte Stand wird aus der schon geholten Zeile gelesen -- keine zweite Abfrage',
  /rrows\[0\]\.printer_last_poll_at/.test(POS), 'fragt extra nach');
t('dafuer steht die Spalte im bestehenden select',
  /select=id,name,pos_pull_key,printer_last_error_at,printer_test_art,printer_last_poll_at/.test(POS),
  'Spalte fehlt im select');
t('geschrieben wird erst nach 60 Sekunden',
  /\(jetzt - zuletzt\) >= 60000/.test(POS), 'schreibt bei jedem Abruf');
t('beim allerersten Abruf wird trotzdem geschrieben -- sonst bleibt die Ampel ewig grau',
  /!\(zuletzt > 0\) \|\|/.test(POS), 'erster Abruf faellt durch');

// Die Bedingung wirklich ausfuehren.
var bed = new Function('zuletzt', 'jetzt', 'return (!(zuletzt > 0) || (jetzt - zuletzt) >= 60000);');
t('noch nie gestempelt -> schreiben', bed(0, 1000000) === true);
t('kaputter Zeitstempel (NaN) -> schreiben', bed(NaN, 1000000) === true);
t('vor 10 Sekunden -> NICHT schreiben', bed(1000000 - 10000, 1000000) === false);
t('vor 59 Sekunden -> NICHT schreiben', bed(1000000 - 59000, 1000000) === false);
t('vor 61 Sekunden -> schreiben', bed(1000000 - 61000, 1000000) === true);

// Wie viel spart das? 17 Abrufe pro Minute, einer davon schreibt.
var abrufe = 17, geschrieben = 1;
t('das sind rund ' + Math.round((1 - geschrieben / abrufe) * 100) + '% weniger Schreibvorgaenge',
  (1 - geschrieben / abrufe) > 0.9, 'spart zu wenig');

// ---- 2. Die Ampel muss mitwandern -------------------------------------
console.log('\n-- Die Ampel --');
var ampel = H.slice(H.indexOf('function _renderPrinterStatus'), H.indexOf('// Kassen-Ampel'));
t('der Ampel-Block wurde gefunden', ampel.length > 200, ampel.length);
t('gruen bis mindestens 90 Sekunden -- sonst macht die Drosselung sie gelb',
  /ageSec < 90/.test(ampel), 'Schwelle steht noch bei 30 s');
t('und der Grund steht dabei',
  /Die Schwellen haengen an der Drosselung|hoechstens einmal pro/i.test(ampel), 'keine Begruendung');

var stufe = new Function('ageSec',
    'if (ageSec < 90) return "gruen"; if (ageSec < 300) return "gelb"; return "rot";');
t('nach 45 Sekunden noch gruen', stufe(45) === 'gruen');
t('nach 120 Sekunden gelb', stufe(120) === 'gelb');
t('nach einer Stunde rot', stufe(3600) === 'rot');

// ---- 3. Gruen heisst nicht "es kam ein Bon" ----------------------------
console.log('\n-- Meldet sich, druckt aber nie --');
t('es gibt den Hinweis',
  /noch nie einen Bon bestätigt/.test(H), 'fehlt');
t('er sagt auch, was zu tun ist',
  /Testbon einfach/.test(H.slice(H.indexOf('noch nie einen Bon bestätigt') - 400,
                                 H.indexOf('noch nie einen Bon bestätigt') + 400)), 'kein Weg raus');
// Der erste Anlauf pruefte nur, ob _druckerPolltAber IRGENDWO vorkommt.
// Die Gegenprobe (Bedingung entfernt, Funktion stehen gelassen) blieb
// dadurch gruen -- der Test haette den Fehler durchgewunken. Jetzt wird
// die BEDINGUNG selbst geprueft.
t('er erscheint nur, wenn der Drucker WIRKLICH anfragt',
  /if \(!zeigen && ereignis === null && _druckerPolltAber\(\)\) \{/.test(H),
  'meldet auch bei totem Drucker');
t('und die Auskunft kommt von der Ampel daneben, nicht aus einer zweiten Abfrage',
  /function _druckerPolltAber[\s\S]{0,300}printerStatusText/.test(H), 'zweiter Weg, laeuft auseinander');

// Die Entscheidung ausfuehren.
var vonD = H.indexOf('function _druckerPolltAber()');
var bisD = H.indexOf('function _renderDruckerMeldung');
var polltAber = new Function('document', H.slice(vonD, bisD) + '; return _druckerPolltAber;');
function mitText(txt) {
    return polltAber({ getElementById: function (id) { return id === 'printerStatusText' ? { textContent: txt } : null; } })();
}
t('"Drucker online" -> ja', mitText('Drucker online') === true);
t('"Drucker offline (2 Std)" -> nein', mitText('Drucker offline (2 Std)') === false);
t('"Drucker nie verbunden" -> nein', mitText('Drucker nie verbunden') === false);
t('gar kein Element -> nein, statt Absturz',
  polltAber({ getElementById: function () { return null; } })() === false);

// ---- 4. Der Wirt sieht, fuer welchen Betrieb er einstellt --------------
console.log('\n-- Welches Restaurant? --');
t('die Karte hat einen Platz fuer den Namen', /id="orderSettingsRestName"/.test(H), 'fehlt');
t('und er wird beim Umschalten gesetzt',
  /nameEl\.textContent = \(_r && _r\.name\)/.test(H), 'bleibt leer');
t('ohne bekannten Betrieb steht der alte Text da, keine Luecke',
  /: 'für Kunden sichtbar';/.test(H), 'leerer Platz');
t('auch die Bestaetigung beim Speichern nennt ihn',
  /r && r\.name \? r\.name \+ ': ' : ''/.test(H), '"gespeichert" ohne WO');

// ---- 5. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var cm = sw.match(/kmi-shell-v(\d+)/);
t('sie ist mindestens 38', !!cm && Number(cm[1]) >= 38, cm ? cm[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
