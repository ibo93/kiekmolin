// DER RUHETAG HAT SICH SELBST GELOESCHT.
//
// GEMELDET WURDE
// --------------
// Im Fenster "Restaurant bearbeiten" stand "Kein Ruhetag", obwohl fuer
// Al Porto der Montag eingetragen war.
//
// DIE URSACHE
// -----------
// Die Formular-Fuellfunktion hiess:
//
//     const setVal = (id, val) => { if (el) el.value = val || ''; };
//
// Der Ruhetag ist eine Zahl, 0 = Montag. Und 0 ist in JavaScript "falsy".
// Aus `0 || ''` wurde '', das Auswahlfeld sprang auf "Kein Ruhetag".
//
// Das war nicht nur eine falsche Anzeige. Beim naechsten Speichern las die
// App genau diesen leeren Wert zurueck und schrieb rest_day = null in die
// Datenbank. Der Ruhetag hat sich also bei JEDEM Bearbeiten des Restaurants
// selbst geloescht -- und danach zeigte die oeffentliche Seite wieder
// Oeffnungszeiten fuer den Montag.
//
// Betroffen war GENAU EIN Tag: Montag. Dienstag bis Sonntag sind 1..6, also
// truthy, die kamen immer durch. Deshalb wirkte es, als ginge der Ruhetag
// mal und mal nicht.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Die echte Fuellfunktion aus der Datei holen.
var anf = H.indexOf('const setVal = (id, val) => {');
var ende = H.indexOf('};', anf) + 2;
var setValQuelle = H.slice(anf, ende);

function feldNach(wert) {
    var el = { value: 'ALT' };
    new Function('document', setValQuelle + '; setVal("x", ' + JSON.stringify(wert) + ');')(
        { getElementById: function () { return el; } });
    return el.value;
}

// ---- DER FEHLER --------------------------------------------------------------
t('Montag (0) landet als 0 im Feld, nicht als leer',
  feldNach(0) === 0, JSON.stringify(feldNach(0)));
t('Dienstag (1) natuerlich auch', feldNach(1) === 1, JSON.stringify(feldNach(1)));
t('Sonntag (6) ebenso', feldNach(6) === 6, JSON.stringify(feldNach(6)));

// ---- "Kein Ruhetag" muss weiterhin leeren -----------------------------------
t('null leert das Feld', feldNach(null) === '', JSON.stringify(feldNach(null)));
t('undefined leert das Feld', feldNach(undefined) === '', JSON.stringify(feldNach(undefined)));
t('ein leerer Text bleibt leer', feldNach('') === '', JSON.stringify(feldNach('')));

// ---- Andere Felder mit einer echten Null --------------------------------------
// Dieselbe Falle traf jedes Feld, dessen richtiger Wert 0 ist -- eine
// Liefergebuehr von 0 stand als leeres Feld da und wurde beim Speichern zu
// "nicht gesetzt".
t('eine Liefergebuehr von 0 verschwindet nicht mehr',
  feldNach(0) === 0, JSON.stringify(feldNach(0)));
t('Text bleibt Text', feldNach('Pizzeria') === 'Pizzeria');

// ---- Das Feld wird IMMER gesetzt, nicht nur bei vorhandenem Ruhetag ----------
// Das Formular wird wiederverwendet. Ohne Zuruecksetzen stand beim naechsten
// Restaurant noch der Ruhetag des vorigen im Feld.
t('das Auswahlfeld wird immer gesetzt, auch ohne Ruhetag',
  /setVal\('restDaySelect', restaurant\.rest_day\);/.test(H)
  && !/if \(restaurant\.rest_day !== null && restaurant\.rest_day !== undefined\) \{\s*\n\s*setVal\('restDaySelect'/.test(H));

// ---- Das Speichern war nie das Problem ---------------------------------------
// Dort wird sauber auf den leeren Text geprueft statt auf "falsy" -- deshalb
// war der Fehler so schwer zu finden: eine Haelfte der Kette war richtig.
t('beim Speichern wird 0 korrekt als Montag uebernommen',
  /var restDay = restDayVal !== '' && restDayVal !== undefined \? parseInt\(restDayVal\) : null;/.test(H));

var speichern = new Function('v',
    "var restDayVal = v; return restDayVal !== '' && restDayVal !== undefined ? parseInt(restDayVal) : null;");
t('"0" wird zu 0, nicht zu null', speichern('0') === 0, JSON.stringify(speichern('0')));
t('"" wird zu null', speichern('') === null, JSON.stringify(speichern('')));
t('"6" wird zu 6', speichern('6') === 6);

// ---- Die ganze Kette: eintragen, oeffnen, speichern --------------------------
// Vorher: Montag rein -> Feld leer -> Speichern schreibt null -> weg.
function rundlauf(ausDerDatenbank) {
    var imFeld = feldNach(ausDerDatenbank);            // Formular fuellen
    return speichern(String(imFeld));                  // und wieder speichern
}
t('Montag ueberlebt das Oeffnen und Speichern',
  rundlauf(0) === 0, JSON.stringify(rundlauf(0)));
t('Mittwoch ebenso', rundlauf(2) === 2, JSON.stringify(rundlauf(2)));
t('kein Ruhetag bleibt kein Ruhetag', rundlauf(null) === null, JSON.stringify(rundlauf(null)));

t('der Grund steht im Quelltext, nicht nur hier',
  /ACHTUNG, HIER LAG DER RUHETAG-FEHLER/.test(H)
  && /Betroffen war GENAU EIN Tag: Montag/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
