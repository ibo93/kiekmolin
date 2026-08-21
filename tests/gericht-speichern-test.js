// EIN JA/NEIN-HAKEN, DER IN EINE ZAHLENSPALTE LAEUFT.
//
// GEMELDET WURDE
// --------------
// Bildschirmfoto aus dem Dashboard: "Gericht hinzufuegen" ausgefuellt, auf
// Speichern gedrueckt, roter Balken:
//
//     Fehler: invalid input syntax for type integer: "false"
//
// Das Gericht war nicht gespeichert, und der Wirt las eine Meldung der
// Datenbank auf Englisch.
//
// WAS DAHINTERSTECKT
// ------------------
// is_spicy ist in dieser Datenbank eine ZAHL, keine Ja/Nein-Spalte. Das
// wussten drei der vier Speicherstellen -- sie schrieben "? 1 : 0". Die
// vierte, das Formular "Gericht hinzufuegen", schickte den Haken direkt:
//
//     is_spicy: _chk('menuItemSpicy')      // -> false
//
// Wieder dieselbe Familie: einmal geflickt, die anderen Aufrufer blieben
// liegen. Es faellt erst auf, wenn ein Wirt genau diesen Weg nimmt -- und
// gemerkt hat es niemand ausser ihm.
//
// WARUM NUR is_spicy
// ------------------
// Nicht geraten, sondern aus dem Quelltext abgelesen. In der Zeile, die
// nachweislich funktioniert (Speisekarte bearbeiten), steht:
//
//     is_vegetarian: isVeg, is_vegan: isVegan,
//     is_spicy: isSpicy ? 1 : 0, is_available: isAvail
//
// Genau EIN Feld wird dort umgerechnet. Die anderen gehen als Ja/Nein durch
// und werden angenommen. Also: is_spicy ist die Zahl, der Rest nicht.
// Alles auf 1/0 umzustellen waere geraten gewesen.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus: die Erklaerung oben im Quelltext zitiert den alten Code
// und die alte Fehlermeldung. Ohne das faellt der Waechter auf sich selbst
// herein -- das ist hier schon einmal passiert.
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    return '';
}

// ---- 1. Die Umrechnung gibt es und sie rechnet richtig ---------------------
t('es gibt eine Stelle, an der die Umrechnung steht',
  /function scharfWert\(x\) \{ return x \? 1 : 0; \}/.test(CODE));

var scharf = new Function(schneide('scharfWert') + '; return scharfWert;')();
t('aus einem gesetzten Haken wird 1', scharf(true) === 1);
t('aus einem leeren Haken wird 0 -- nicht false', scharf(false) === 0 && scharf(false) !== false);
t('nichts uebergeben ergibt 0, keinen Absturz',
  scharf(undefined) === 0 && scharf(null) === 0);
t('es kommt immer eine Zahl heraus, nie ein Ja/Nein',
  [true, false, null, undefined, 1, 0, '', 'x'].every(function (v) { return typeof scharf(v) === 'number'; }));

// ---- 2. Die vier Speicherstellen -------------------------------------------
// Nur was WIRKLICH in die Datenbank geht. Der Scanner baut zwischendurch
// eigene Objekte mit is_spicy als Ja/Nein -- die laufen danach durch
// importScannedMenu, das umrechnet. Deshalb hier gezielt die DB-Wege.
var schreibwege = [
  { fn: 'importScannedMenu',   was: 'Speisekarte einlesen' },
  { fn: 'addMenuItem',         was: 'Gericht anlegen (alter Weg)' },
  { fn: 'speichereGerichtBearbeitet', was: 'Gericht bearbeiten' }
];

var alleSpicy = (CODE.match(/is_spicy:\s*[^,\n]+/g) || []);
t('es gibt ueberhaupt Stellen, die is_spicy setzen', alleSpicy.length >= 4, alleSpicy.length);

// Die Kernregel: nirgends darf is_spicy als Ja/Nein in eine Anfrage gehen.
// Erlaubt sind scharfWert(...) und die Zwischenobjekte des Scanners, die
// erkennbar aus einem Suchmuster kommen.
var verdaechtig = alleSpicy.filter(function (z) {
    if (/scharfWert\(/.test(z)) return false;               // umgerechnet
    if (/\/scharf\/i\.test\(/.test(z)) return false;        // Scanner-Zwischenobjekt
    if (/\?\s*1\s*:\s*0/.test(z)) return false;             // von Hand, aber richtig
    if (/is_spicy:\s*\[/.test(z)) return false;             // Stichwortliste des Scanners
    return true;
});
t('keine Speicherstelle schickt is_spicy als Ja/Nein in die Datenbank',
  verdaechtig.length === 0, verdaechtig.join(' | '));

// Die gemeldete Stelle namentlich -- damit klar bleibt, worum es ging.
t('das Formular "Gericht hinzufuegen" rechnet jetzt um',
  /is_spicy: scharfWert\(_chk\('menuItemSpicy'\)\)/.test(CODE));

// Und die drei, die es schon von Hand richtig machten, benutzen denselben
// Helfer -- sonst steht die Regel an vier Stellen und weicht irgendwann ab.
t('alle Speicherstellen gehen ueber denselben Helfer',
  (CODE.match(/is_spicy: scharfWert\(/g) || []).length >= 4,
  (CODE.match(/is_spicy: scharfWert\(/g) || []).length);
t('niemand rechnet mehr von Hand um',
  !/is_spicy:[^,\n]*\?\s*1\s*:\s*0/.test(CODE),
  (CODE.match(/is_spicy:[^,\n]*\?\s*1\s*:\s*0/g) || []).join(' | '));

// Gegenprobe -- ohne sie waere das gruene Ergebnis oben nichts wert.
(function () {
    var probe = "is_spicy: _chk('menuItemSpicy'),";
    var faengt = /is_spicy:\s*[^,\n]+/.test(probe)
        && !/scharfWert\(/.test(probe) && !/\?\s*1\s*:\s*0/.test(probe);
    t('Gegenprobe: der alte Code wuerde gemeldet', faengt === true);
})();

// ---- 3. Die anderen Haken bleiben Ja/Nein ----------------------------------
// Wichtig, dass hier NICHT alles auf 1/0 umgestellt wurde: das waere geraten.
['is_vegetarian', 'is_vegan', 'is_popular', 'is_available'].forEach(function (feld) {
    var umgerechnet = (CODE.match(new RegExp(feld + ':\\s*scharfWert\\(', 'g')) || []);
    t(feld + ' wird NICHT umgerechnet -- das ist eine echte Ja/Nein-Spalte',
      umgerechnet.length === 0, umgerechnet.join(' | '));
});
t('der Beweis dafuer steht im Quelltext: eine Zeile, in der genau EIN Feld umgerechnet wird',
  /is_vegetarian: isVeg, is_vegan: isVegan, is_spicy: scharfWert\(isSpicy\), is_available: isAvail/.test(CODE));

// ---- 4. Der Wirt liest keine Datenbankmeldungen mehr -----------------------
// Vorher stand im roten Balken woertlich:
//   'Fehler: invalid input syntax for type integer: "false"'
var uebersetzer = schneide('dbFehlerText');
t('es gibt eine Uebersetzung fuer Datenbankmeldungen', uebersetzer.length > 100, uebersetzer.length);

var text = new Function(schneide('dbFehlerText') + '; return dbFehlerText;')();
t('die gemeldete Meldung wird zu einem lesbaren Satz',
  text({ message: 'invalid input syntax for type integer: "false"' }, 'Das Gericht konnte nicht gespeichert werden.')
    === 'Das Gericht konnte nicht gespeichert werden. Ein Feld hat das falsche Format.',
  text({ message: 'invalid input syntax for type integer: "false"' }, 'Das Gericht konnte nicht gespeichert werden.'));
t('kein englisches Datenbankdeutsch mehr im Ergebnis',
  !/invalid input syntax|integer/.test(text({ message: 'invalid input syntax for type integer: "false"' }, 'X')));
t('doppelter Eintrag wird erklaert',
  text({ message: 'duplicate key value violates unique constraint' }) === 'Das gibt es schon.');
t('fehlendes Pflichtfeld wird erklaert',
  /Pflichtfeld ist leer/.test(text({ message: 'null value violates not-null constraint' }, 'Speichern fehlgeschlagen.')));
t('fehlende Berechtigung wird erklaert',
  /Berechtigung/.test(text({ message: 'new row violates row-level security policy' })));
t('kein Netz wird erklaert',
  /Verbindung/.test(text({ message: 'Failed to fetch' })));
t('eine unbekannte Meldung bekommt den Ersatztext, nicht das Original',
  text({ message: 'irgendwas ganz anderes' }, 'Das Gericht konnte nicht gespeichert werden.')
    === 'Das Gericht konnte nicht gespeichert werden.');
t('ohne Fehlerobjekt kein Absturz',
  typeof text(null, 'Ersatz') === 'string' && typeof text(undefined) === 'string');
t('alle Saetze sind deutsch und enden mit einem Punkt',
  ['invalid input syntax', 'duplicate key', 'violates foreign key', 'violates not-null',
   'row-level security', 'Failed to fetch', 'unbekannt'].every(function (m) {
      var r = text({ message: m }, 'Speichern fehlgeschlagen.');
      return /\.$/.test(r) && !/[a-z]{4,}\s(syntax|constraint|policy|key)/.test(r);
  }));

t('der technische Wortlaut geht weiterhin in die Konsole',
  /console\.error\('Gericht speichern:', e\)/.test(CODE));
t('und der Balken zeigt den uebersetzten Satz',
  /showToast\(dbFehlerText\(e, 'Das Gericht konnte nicht gespeichert werden\.'\), 'error'\)/.test(CODE));

// ---- 5. Der Grund steht im Quelltext ---------------------------------------
t('warum is_spicy eine Sonderrolle hat, steht in der Datei',
  /is_spicy IST IN DER DATENBANK EINE ZAHL/.test(H));
t('und dass die anderen Felder bewusst nicht angefasst wurden',
  /NUR is_spicy ist eine Zahl/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
