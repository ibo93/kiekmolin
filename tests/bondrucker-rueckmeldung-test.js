// DER DRUCKER SAGT, WARUM ER NICHT DRUCKT -- WIR HABEN WEGGEHOERT.
//
// WAS PASSIERT IST
// ----------------
// Epson TM-m30III per Server Direct Print eingerichtet. Die Drucker-Ampel im
// Dashboard stand auf gruen, beide Bestellungen waren als "gedruckt" markiert
// -- und aus dem Drucker kam kein einziger Zettel.
//
// Der Grund war nicht zu finden, weil die Stelle fehlte, an der man ihn haette
// sehen koennen. Bei Server Direct Print schickt der Drucker NACH jedem
// Auftrag eine Rueckmeldung an dieselbe URL: hat geklappt, oder hat nicht
// geklappt und hier ist der Fehlercode. Fuer pos-print.js sah diese
// Rueckmeldung aus wie eine ganz normale Anfrage.
//
// Zwei Folgen, beide schlecht:
//   1. Der Grund, den der Drucker uns direkt genannt hat, landete im Nichts.
//   2. Auf die Rueckmeldung hin bekam er sofort die naechste Bestellung --
//      die damit als gedruckt galt, ohne je gedruckt worden zu sein. So
//      wurden Bestellungen still verbraucht.
//
// Das ist dieselbe Familie wie die Optionsgruppen und der Beleg-Merge:
// Erfolg wird angenommen, ohne nachzusehen.
//
// WAS HIER GEPRUEFT WIRD
// ----------------------
// Die echte Funktion aus pos-print.js, mit echten Rumpf-Formaten des Epson.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var DATEI = path.join(__dirname, '..', 'netlify', 'functions', 'pos-print.js');
var SRC = fs.readFileSync(DATEI, 'utf8');

// Die beiden Funktionen herausschneiden und wirklich ausfuehren -- nicht nur
// den Quelltext nach Zeichenketten absuchen. Ein Test, der nur liest, haette
// den ganzen Fehler hier auch nicht gefunden.
function schneide(name) {
    var i = SRC.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = SRC.indexOf('{', i), d = 0;
    for (var k = j; k < SRC.length; k++) {
        if (SRC[k] === '{') d++;
        else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
    }
    return '';
}

var tabelle = SRC.slice(SRC.indexOf('var CODE_TEXT ='), SRC.indexOf('function codeKlartext'));
var f = new Function('Buffer',
    schneide('druckerMeldung') + '\n' + tabelle + '\n' + schneide('codeKlartext') +
    '\n; return { druckerMeldung: druckerMeldung, codeKlartext: codeKlartext };')(Buffer);
var druckerMeldung = f.druckerMeldung;
var codeKlartext = f.codeKlartext;

// ---- 1. Die normale Anfrage darf KEINE Rueckmeldung sein --------------------
// Das ist die wichtigste Unterscheidung. Haelt sie nicht, bekommt der Drucker
// nie wieder eine Bestellung -- der Fehler waere schlimmer als der alte.
var ANFRAGE =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<PrintRequestInfo><ePOSPrint>' +
    '<Parameter><devid>local_printer</devid><timeout>10000</timeout><printjobid></printjobid></Parameter>' +
    '</ePOSPrint></PrintRequestInfo>';
t('die normale Anfrage wird NICHT als Rueckmeldung gelesen',
  druckerMeldung(ANFRAGE) === null, JSON.stringify(druckerMeldung(ANFRAGE)));
t('ein leerer Rumpf ebenfalls nicht', druckerMeldung('') === null);
t('und ein fehlender Rumpf auch nicht', druckerMeldung(null) === null && druckerMeldung(undefined) === null);

// ---- 2. Erfolgsmeldung ------------------------------------------------------
var ERFOLG =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<PrintRequestInfo><ePOSPrint>' +
    '<Parameter><devid>local_printer</devid><printjobid>kmi_1</printjobid></Parameter>' +
    '<PrintResponse><response success="true" code="" status="252702215" battery="0"/></PrintResponse>' +
    '</ePOSPrint></PrintRequestInfo>';
(function () {
    var m = druckerMeldung(ERFOLG);
    t('die Erfolgsmeldung wird erkannt', !!m, m);
    t('und als Erfolg gewertet', m && m.erfolg === true, m && m.erfolg);
    t('der Status wird mitgenommen', m && m.status === '252702215', m && m.status);
})();

// ---- 3. Fehlermeldung -- der Fall, um den es geht ---------------------------
var FEHLER =
    '<PrintRequestInfo><ePOSPrint>' +
    '<Parameter><devid>local_printer</devid></Parameter>' +
    '<PrintResponse><response success="false" code="EPTR_REC_EMPTY" status="252674059"/></PrintResponse>' +
    '</ePOSPrint></PrintRequestInfo>';
(function () {
    var m = druckerMeldung(FEHLER);
    t('die Fehlermeldung wird erkannt', !!m);
    t('und NICHT als Erfolg gewertet', m && m.erfolg === false, m && m.erfolg);
    t('der Fehlercode wird gelesen', m && m.code === 'EPTR_REC_EMPTY', m && m.code);
})();

// ---- 4. Robust gegen Firmware-Abweichungen ----------------------------------
// Der Rumpf kommt von einem Geraet, dessen Format je nach Firmware anders
// aussieht. Eine strenge Auswertung wuerde bei der kleinsten Abweichung nichts
// finden -- und wir staenden wieder ohne Grund da.
t('Grossschreibung im Attribut stoert nicht',
  (function () { var m = druckerMeldung('<response SUCCESS="FALSE" CODE="SchemaError"/>'); return !!m && m.erfolg === false && m.code === 'SchemaError'; })());
t('Leerzeichen um das Gleichheitszeichen stoeren nicht',
  (function () { var m = druckerMeldung('<response success = "true" />'); return !!m && m.erfolg === true; })());
t('ein fehlendes code-Attribut ergibt einen leeren Code, keinen Absturz',
  (function () { var m = druckerMeldung('<response success="false"/>'); return !!m && m.code === ''; })());
t('base64-Rumpf wird entschluesselt',
  (function () {
      var m = druckerMeldung(Buffer.from(FEHLER, 'utf8').toString('base64'), true);
      return !!m && m.code === 'EPTR_REC_EMPTY';
  })(), 'base64 nicht dekodiert');
t('kaputtes base64 stuerzt nicht ab, sondern versucht es roh',
  (function () { try { druckerMeldung('###kein base64###', true); return true; } catch (e) { return false; } })());

// Der Rumpf wird fuers Log gekuerzt -- er kann lang sein.
t('der Rumpf wird fuer das Log gekuerzt',
  (function () {
      var lang = '<response success="false" code="X"/>' + new Array(2000).join('y');
      var m = druckerMeldung(lang);
      return m.rumpf.length <= 400;
  })());

// ---- 5. Fehlercodes in Klartext ---------------------------------------------
// "EPTR_REC_EMPTY" hilft niemandem, der wissen will, warum kein Bon kommt.
t('kein Papier wird in Klartext uebersetzt', /Kein Papier/.test(codeKlartext('EPTR_REC_EMPTY')), codeKlartext('EPTR_REC_EMPTY'));
// klein geschrieben pruefen: der Text sagt "Papierklappe", nicht "Klappe".
t('offene Klappe ebenso', /klappe/i.test(codeKlartext('EPTR_COVER_OPEN')), codeKlartext('EPTR_COVER_OPEN'));
t('und der Fall, der uns hier am ehesten trifft: XML abgelehnt',
  /XML/.test(codeKlartext('SchemaError')), codeKlartext('SchemaError'));
t('ein unbekannter Code liefert trotzdem einen brauchbaren Satz',
  /unbekannter Code/.test(codeKlartext('EPTR_WAS_AUCH_IMMER')));
t('und auch ein fehlender Code stuerzt nicht ab',
  typeof codeKlartext(undefined) === 'string' && codeKlartext(undefined).length > 10);

// ---- 6. Die Rueckmeldung darf keine Bestellung verbrauchen ------------------
// Der eigentliche Schaden: auf die Erfolgsmeldung hin bekam der Drucker sofort
// die naechste Bestellung, die damit als gedruckt galt, ohne gedruckt zu sein.
(function () {
    var i = SRC.indexOf('var meldung = druckerMeldung(');
    var j = SRC.indexOf('// Restaurant + pull_key validieren');
    var block = i >= 0 && j > i ? SRC.slice(i, j) : '';
    t('die Rueckmeldung wird im Handler ausgewertet', block.length > 200, block.length);
    t('und danach OHNE Bestellung geantwortet',
      /return xmlResponse\(emptyEposResponse\(\)\);/.test(block), block.slice(-200));
    t('sie wird geprueft, BEVOR eine Bestellung gesucht wird',
      i >= 0 && i < SRC.indexOf("'&printed_at=is.null'"), i + ' / ' + SRC.indexOf("'&printed_at=is.null'"));
    t('ein Fehlschlag wird als Warnung protokolliert, nicht nur als Zeile',
      /console\.warn\('\[pos-print\] DRUCK FEHLGESCHLAGEN/.test(SRC));
    t('der Erfolgsfall wird ebenfalls protokolliert -- sonst sieht man nie, DASS er antwortet',
      /console\.log\('\[pos-print\] Rueckmeldung vom Drucker/.test(SRC));
})();

// ---- 7. Kein Endlos-Nachdruck ----------------------------------------------
// Ein fehlgeschlagener Auftrag darf NICHT von selbst wiederholt werden: der
// Drucker lehnt ihn erneut ab, wir schicken ihn erneut, und das laeuft ewig.
t('bei Fehlschlag wird printed_at NICHT automatisch zurueckgesetzt',
  !/meldung[\s\S]{0,400}printed_at:\s*null/.test(SRC), 'automatischer Nachdruck gefunden');
t('und der Grund dafuer steht im Quelltext',
  /das ginge endlos/.test(SRC) || /endlos/.test(SRC));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
