// ERFUNDENE VARIABLEN -- DIE TEUERSTE FEHLERART DIESES PROJEKTS.
//
// Am 14.09.2026 gefunden: in submitOrder stand seit jeher
//
//     orderData.scheduled_at = window._vorbestellungFuer;
//
// orderData gab es nirgends in index.html. Jede Vorbestellung brach dort
// mit "ReferenceError: orderData is not defined" ab und wurde NIE
// gespeichert -- monatelang, ohne dass es jemandem auffiel. 5300 Tests
// waren gruen, einer davon forderte die kaputte Zeile sogar woertlich
// ein.
//
// Es war nicht der erste Fall:
//     cartSubtotalWert   06.09.2026  -- erfunden, nie deklariert
//     zahlarten()        13.09.2026  -- aufgerufen, bevor es sie gab
//     lastOrderNumber    13.09.2026  -- benutzt, existiert nicht
//
// WAS DIESER TEST MACHT
//
// Er sucht im Skriptteil nach Zuweisungen der Form
//
//     bezeichner.feld = ...
//
// am Zeilenanfang -- genau die Form, in der der Fehler stand -- und
// prueft, ob der Bezeichner irgendwo deklariert wird: var/let/const,
// Funktionsname, Parameter, catch, Pfeilfunktion, Schleifenkopf oder
// window.name =.
//
// WAS ER NICHT KANN, und das gehoert dazugesagt:
//   * Er ist kein Parser. Er findet die ZUWEISUNG an eine erfundene
//     Variable, nicht jedes bloße Lesen.
//   * Eine erfundene Variable, die nur gelesen wird (if (foo.bar)),
//     faellt ihm nicht auf.
// Auf dem heilen Stand meldet er nichts -- daran ist er gemessen. Meldet
// er etwas, ist es anzusehen und nicht wegzudruecken.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function skriptteil(html) {
    var code = '', re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, m;
    while ((m = re.exec(html)) !== null) code += '\n' + m[1];
    // \uXXXX zuerst: sonst zerfaellt "ählt" in einen Bezeichner.
    // Zeichenketten werden BEWUSST nicht ersetzt -- ein Apostroph in
    // einem deutschen Kommentar ("geht's") wuerde sonst halbe Dateien
    // verschlucken, und dann faende der Test gar nichts mehr.
    return code.replace(/\\u[0-9a-fA-F]{4}/g, 'X')
               .replace(/\/\*[\s\S]*?\*\//g, ' ')
               .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');
}

var BEKANNT = ('window document console localStorage sessionStorage navigator location history screen ' +
 'Math JSON Object Array String Number Boolean Date RegExp Promise Map Set Error Intl performance ' +
 'crypto caches fetch URL FormData Notification Audio Image parent top self supabase gtag dataLayer ' +
 'google paypal Stripe module exports').split(/\s+/);

function deklariert(code, name) {
    var b = '\\b' + name + '\\b';
    return new RegExp('(var|let|const)\\s+([\\w$]+\\s*(=\\s*[^,;\\n]*)?,\\s*)*' + b + '\\s*(=|;|,|\\n|\\))').test(code)
        || new RegExp('function\\s+' + b).test(code)
        || new RegExp('function[^(){]{0,60}\\([^)]{0,200}' + b).test(code)
        || new RegExp('catch\\s*\\(\\s*' + b).test(code)
        || new RegExp('\\(\\s*([\\w$]+\\s*,\\s*){0,6}' + b + '\\s*(,[^)\\n]{0,120})?\\)\\s*(=>|\\{)').test(code)
        || new RegExp(b + '\\s*=>').test(code)
        || new RegExp('for\\s*\\(\\s*(var|let|const)?\\s*' + b).test(code)
        || new RegExp('window\\.' + b + '\\s*=').test(code);
}

function erfundene(html) {
    var code = skriptteil(html);
    var gefunden = {}, m;
    var re = /^[ \t]*([a-z_][A-Za-z0-9_]{2,})((?:\s*\.\s*[A-Za-z_][\w$]*)+)\s*=(?!=)/gm;
    while ((m = re.exec(code)) !== null) {
        var name = m[1];
        if (BEKANNT.indexOf(name) >= 0) continue;
        (gefunden[name] = gefunden[name] || []).push((name + m[2]).slice(0, 60));
    }
    return Object.keys(gefunden)
        .filter(function (name) { return !deklariert(code, name); })
        .map(function (name) { return name + ' (' + gefunden[name].length + 'x, z.B. ' + gefunden[name][0] + ')'; });
}

var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// ---- 1. Der Befund ----------------------------------------------------
console.log('\n-- index.html --');
var treffer = erfundene(H);
t('keine Zuweisung an eine nie deklarierte Variable',
  treffer.length === 0, treffer.join('  |  '));

// ---- 2. Das Werkzeug taugt ueberhaupt etwas ---------------------------
//
// Ein Test, der immer gruen ist, prueft nichts. Also wird der echte
// Fehler vom 14.09.2026 hier im Speicher wieder eingebaut -- und der
// Test muss ihn finden.
console.log('\n-- Findet er den Fehler von heute wirklich? --');
var kaputt = H.replace('            _orderPayload.scheduled_at = window._vorbestellungFuer;',
                       '            orderData.scheduled_at = window._vorbestellungFuer;');
t('die Probe liess sich einbauen', kaputt !== H, 'Zeile nicht gefunden');
var trefferKaputt = erfundene(kaputt);
t('orderData wird gefunden',
  trefferKaputt.some(function (x) { return x.indexOf('orderData') === 0; }), trefferKaputt.join(' | '));
t('und sonst nichts Neues', trefferKaputt.length === treffer.length + 1,
  trefferKaputt.join(' | '));

// Zweite Probe: ein frei erfundener Name in einer eigenen Zeile.
var kaputt2 = H.replace('function loadOrderSettings() {',
                        'function loadOrderSettings() {\n    einGanzNeuerName.feld = 1;');
t('auch ein frei erfundener Name faellt auf',
  erfundene(kaputt2).some(function (x) { return x.indexOf('einGanzNeuerName') === 0; }),
  erfundene(kaputt2).join(' | '));

// Gegenprobe andersherum: eine ORDENTLICH deklarierte Variable darf NICHT
// gemeldet werden -- sonst ist der Test Laerm und wird weggedrueckt.
var heil = H.replace('function loadOrderSettings() {',
                     'function loadOrderSettings() {\n    var einOrdentlicherName = {};\n    einOrdentlicherName.feld = 1;');
t('eine ordentlich deklarierte Variable wird NICHT gemeldet',
  !erfundene(heil).some(function (x) { return x.indexOf('einOrdentlicherName') === 0; }),
  erfundene(heil).join(' | '));

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
