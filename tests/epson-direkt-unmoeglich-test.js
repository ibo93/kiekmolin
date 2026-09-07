// DER DRUCKER-TYP, DER NIE FUNKTIONIEREN KANN -- UND DAS NICHT SAGTE.
//
// Ibo am 07.09.2026: "Wir haben Epson als Drucker benutzt."
//
// Damit ist die Kette klar. In den Drucker-Einstellungen stand der Typ
// "Epson ePOS Direkt". Der schickt den Bon aus dem BROWSER an
//
//     http://<Drucker-IP>/cgi-bin/epos/service.cgi
//
// kiekmolin.de laeuft ueber HTTPS. Ein Browser verweigert jede Anfrage von
// einer HTTPS-Seite an eine http://-Adresse (Mixed Content). Sie wird
// abgebrochen, BEVOR sie das Geraet verlaesst -- kein Netzwerkfehler,
// keine Meldung, sie kommt schlicht nie an.
//
// WARUM DAS SO TEUER WAR:
// 1. Der Typ hiess "(HTTPS-Probleme moeglich)". Das klingt nach "kann
//    klappen". Es kann nicht klappen.
// 2. Der Fehlschlag gab nur "Druckfehler" aus, ohne Grund. Das sieht aus
//    wie ein Drucker, der nicht antwortet -- und man sucht am falschen
//    Ende: Strom, Kabel, WLAN, IP. Alles in Ordnung. Trotzdem kein Bon.
//
// Der Drucker war die ganze Zeit heil. Er wurde nur nie gefragt.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

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

// ---- 1. Die Auswahl luegt nicht mehr --------------------------------
console.log('\n-- Was in der Auswahl steht --');
t('"HTTPS-Probleme möglich" ist weg -- das klang nach "kann klappen"',
  !/HTTPS-Probleme möglich/.test(h), 'steht noch da');
t('der Typ sagt jetzt, dass er nicht geht',
  /funktioniert NICHT über kiekmolin\.de/.test(h), 'verschweigt es');
t('Server Direct Print steht weiter als empfohlen darueber',
  /Server Direct Print \(Epson, empfohlen/.test(h), 'Empfehlung verloren');

// ---- 2. Der Warnkasten ----------------------------------------------
console.log('\n-- Die Warnung im Formular --');
t('bei diesem Typ steht eine Warnung',
  /Dieser Weg kann über kiekmolin\.de nicht funktionieren/.test(h), 'keine Warnung');
t('sie nennt den Grund in einem Satz',
  /Die Seite läuft über HTTPS, der Drucker antwortet über HTTP/.test(h), 'nur "geht nicht"');
t('sie sagt ausdruecklich, dass der Drucker heil ist -- sonst wird ein gutes Geraet getauscht',
  /Der Drucker ist dabei völlig in Ordnung/.test(h), 'laesst ihn am Geraet zweifeln');
t('und bietet die Umstellung mit EINEM Klick an',
  /updateMultiPrinter\(' \+ idx \+ ', \\'type\\', \\'server-direct\\'\)/.test(h), 'nur ein Hinweis, keine Tat');
t('die Warnung steht im epson-Zweig, nicht bei allen Typen',
  h.indexOf("if (p.type === 'epson') {") < h.indexOf('Dieser Weg kann über kiekmolin.de nicht funktionieren'),
  'warnt auch bei funktionierenden Typen');
t('die IP-Felder bleiben trotzdem da -- im Heimnetz ohne HTTPS geht es ja',
  /Drucker IP-Adresse/.test(h) && /Device ID/.test(h), 'Felder entfernt');

// ---- 3. Nicht mehr blind losschicken --------------------------------
console.log('\n-- Der Druckversuch selbst --');
var pe = schneide(h, 'printToEpson');
t('printToEpson wurde gefunden', pe.length > 300, pe.length + ' Zeichen');
t('es prueft das Protokoll der Seite, bevor es losschickt',
  /location\.protocol === 'https:'/.test(pe), 'schickt blind los');
t('und bricht dann VOR dem fetch ab',
  pe.indexOf("location.protocol === 'https:'") < pe.indexOf('var url ='), 'prueft zu spaet');
t('der Wirt bekommt den echten Grund, nicht nur "Druckfehler"',
  /kann der Browser/.test(pe) && /Server Direct Print/.test(pe), 'weiter grundlos');
t('es wird auch protokolliert', /logRestaurantEvent\(/.test(pe) && /printer_failed/.test(pe), 'nur ein Toast, morgen vergessen');
// NICHT auf ein blosses "return false" pruefen -- das steht in der Funktion
// noch zweimal woanders (fehlende IP, catch-Zweig). Gemeint ist der Ausgang
// GENAU DIESES Zweiges. Ein true an dieser Stelle waere schlimmer als der
// Fehler selbst: dispatchPrintToAll zaehlte ihn als Erfolg und meldete
// "An 1 Drucker gesendet", waehrend nichts gedruckt wird.
t('der Fehlschlag bleibt ein Fehlschlag (kein falsches "gedruckt")',
  /logRestaurantEvent[\s\S]{0,400}?\n            \}\n            return false;\n        \}/.test(pe),
  'dieser Zweig meldet Erfolg');
t('ohne location wird wie bisher versucht -- Tests und alte Umgebungen',
  /catch \(e\) \{ \/\* kein location/.test(pe), 'kracht ohne location');
t('ueber http bleibt der Weg offen (Heimnetz, lokaler Aufruf)',
  !/location\.protocol !== 'https:'/.test(pe) && /=== 'https:'/.test(pe), 'sperrt auch http');

// ---- 4. Der andere Weg bleibt unangetastet --------------------------
console.log('\n-- Was NICHT angefasst wurde --');
t('Server Direct Print druckt weiter ueber die Freigabe',
  /bonFreigeben\(order\.id\)/.test(h), 'kaputtgemacht');
t('die Testbon-Knoepfe von vorhin sind noch da',
  /testbonAnfordern\(\\'einfach\\'\)/.test(h), 'verloren');

// ---- 5. Auslieferung ------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 27', !!m && Number(m[1]) >= 27, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
