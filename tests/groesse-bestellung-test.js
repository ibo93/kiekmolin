// GROESSE IN DER BESTELLUNG -- der Weg vom Antippen bis zum Bon.
//
// Der Import kann Größen noch so sauber anlegen: wenn die Bestellung sie
// nicht mitnimmt, bestellt der Gast "groß" und die Küche macht "klein".
//
// Zwei Fehler waren drin, beide von derselben Sorte: der Warenkorb legt eine
// gewählte Option als { group, option, price, price_type } ab -- ein Feld
// "name" gibt es dort NICHT. Zwei Anzeigen suchten aber nur nach opt.name
// und zeigten deshalb gar nichts:
//   * die Bestell-Spalten im Dashboard (was die Küche liest)
//   * der gedruckte Bon
// Dazu wurde die Größe als Aufpreis ausgewiesen ("groß (+10,00)"), obwohl
// sie den Preis ERSETZT.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// Seit die Extras eine Menge haben koennen ("2x Kaese"), rechnet
// calculateItemPrice den Aufschlag nicht mehr selbst, sondern fragt
// optionAufpreis. Die Funktion muss also mit hinein -- sonst prueft dieser
// Test nur noch, dass ein ReferenceError fliegt.
var HELFER = schneide('optionText') + '\n' + schneide('optionAufpreis') + '\n';

// --- Preisrechnung: die Größe ERSETZT den Grundpreis ----------------------
var rechne = new Function('currentMenuItem', 'currentItemOptions',
    HELFER + schneide('calculateItemPrice') + '; return calculateItemPrice();');

t('Groesse ersetzt den Grundpreis, sie kommt nicht obendrauf',
  rechne({ base_price: 6.5 }, [{ group: 'item_sizes', option: 'groß', price: 8.5, price_type: 'replace' }]) === 8.5,
  rechne({ base_price: 6.5 }, [{ group: 'item_sizes', option: 'groß', price: 8.5, price_type: 'replace' }]));
t('klein bleibt der Grundpreis',
  rechne({ base_price: 6.5 }, [{ group: 'item_sizes', option: 'klein', price: 6.5, price_type: 'replace' }]) === 6.5);
t('Extras kommen weiterhin obendrauf',
  rechne({ base_price: 6.5 }, [{ group: 'item_sizes', option: 'groß', price: 8.5, price_type: 'replace' },
                               { group: 'extra', option: 'Käse', price: 1.5, price_type: 'add' }]) === 10,
  rechne({ base_price: 6.5 }, [{ group: 'item_sizes', option: 'groß', price: 8.5, price_type: 'replace' },
                               { group: 'extra', option: 'Käse', price: 1.5, price_type: 'add' }]));

// --- Was die Küche liest ---------------------------------------------------
var GROESSE = { group: 'item_sizes', option: 'groß', price: 10, price_type: 'replace' };
var EXTRA = { group: 'extra', option: 'Extra Käse', price: 1.5, price_type: 'add' };

var spalte = H.match(/optionsText = it\.selected_options\.map\([\s\S]*?join\(', '\);/);
t('Bestell-Spalte baut den Optionstext ueberhaupt', !!spalte);
if (spalte) {
    var f = new Function('it', HELFER + 'var optionsText = "";' + spalte[0] + '; return optionsText;');
    t('die Kueche sieht "groß" -- vorher stand dort NICHTS',
      f({ selected_options: [GROESSE] }) === 'groß', '"' + f({ selected_options: [GROESSE] }) + '"');
    t('Groesse und Extra stehen beide da',
      f({ selected_options: [GROESSE, EXTRA] }) === 'groß, Extra Käse',
      '"' + f({ selected_options: [GROESSE, EXTRA] }) + '"');
    t('alte Schreibweise (nur Text) geht weiter',
      f({ selected_options: ['ohne Zwiebeln'] }) === 'ohne Zwiebeln',
      '"' + f({ selected_options: ['ohne Zwiebeln'] }) + '"');
    t('leere Eintraege erzeugen keine Kommas',
      f({ selected_options: [GROESSE, {}] }) === 'groß', '"' + f({ selected_options: [GROESSE, {}] }) + '"');
}

// --- Was auf dem Bon steht --------------------------------------------------
var bon = H.match(/var opts = \(item\.selected_options \|\| \[\]\)\.map\(function \(o\)[\s\S]*?filter\(Boolean\)\.join\(', '\);/);
t('Bon baut den Optionstext ueberhaupt', !!bon);
if (bon) {
    var b = new Function('item', HELFER + 'var optsText="";' + bon[0] + '; return { text: optsText, opts: opts };');
    var r1 = b({ selected_options: [GROESSE] });
    t('auf dem Bon steht die Groesse', r1.text === 'groß', '"' + r1.text + '"');
    t('und NICHT als Aufpreis -- der Preis ist ja der ganze Preis',
      r1.text.indexOf('+') < 0, '"' + r1.text + '"');
    var r2 = b({ selected_options: [EXTRA] });
    t('ein echtes Extra steht weiterhin mit Aufpreis auf dem Bon',
      /Extra Käse \(\+1\.50\)/.test(r2.text), '"' + r2.text + '"');
}

// --- Küchenanzeige ---------------------------------------------------------
// Die Fallunterscheidung stand frueher hier ausgeschrieben. Sie steckt jetzt
// in optionAufpreis -- an einer Stelle statt an fuenf. Geprueft wird beides:
// dass die Anzeige die Funktion nimmt, und dass die Funktion es richtig macht.
t('Kuechenanzeige rechnet den Aufpreis mit optionAufpreis',
  /var optPrice = optionAufpreis\(opt\);/.test(H));
t('und optionAufpreis weist eine Groesse nicht als Aufpreis aus',
  /if \(!o \|\| o\.price_type === 'replace'\) return 0;/.test(H));

// --- Der Warenkorb trägt die Größe überhaupt mit ------------------------
t('gewaehlte Optionen landen im Warenkorb', /selected_options: \[\.\.\.currentItemOptions\]/.test(H));
t('und die Auswahl merkt sich Gruppe, Name, Preis und Art',
  /currentItemOptions\.push\(\{ group, option, price, price_type: priceType \}\)/.test(H));

// --- Was der Gast sieht -----------------------------------------------------
t('die Gast-Ansicht baut die Groessen-Auswahl, sobald ein Gericht Groessen hat',
  /if \(item\.sizes && Array\.isArray\(item\.sizes\) && item\.sizes\.length > 0\)/.test(H)
  && /selectSize \|\| 'Größe wählen'/.test(H));
t('jede Groesse steht mit Namen und eigenem Preis da',
  /szPrice\.toFixed\(2\)\.replace\('\.', ','\)/.test(H)
  && /option-name">' \+ \(sz\.name \|\| ''\)/.test(H));
t('in der Karte steht "ab" plus guenstigster Preis',
  /pricePrefix = 'ab '/.test(H) && /minSizePrice/.test(H));

// Die erste Größe ist optisch vorausgewählt -- sie muss auch wirklich
// ausgewählt sein. Sonst geht die Bestellung ohne Größe raus, und in der
// Küche steht "Pizza Margherita" ohne jeden Hinweis.
t('die vorausgewaehlte Groesse landet auch in der Bestellung',
  /currentItemOptions\.push\(\{ group: 'item_sizes', option: _ersteGroesse\.name/.test(H));
t('und ersetzt eine vorher gewaehlte Groesse, statt sich zu stapeln',
  /currentItemOptions\.filter\(function \(o\) \{ return o\.group !== 'item_sizes'; \}\)/.test(H));

// --- Fehlende Spalte ist keine Sackgasse ------------------------------------
// Größen gehören zwingend an das einzelne Gericht: eine Optionsgruppe
// hängt an der KATEGORIE und kann keine Preise je Gericht tragen (Margherita
// klein 6,50, Salami klein 7,00). Fehlt die Spalte, hilft kein Umweg -- sie
// muss angelegt werden. Also sagt die App genau wie.
t('bei fehlenden Spalten kommt eine Anleitung statt einer Sackgasse',
  /function _zeigeSpaltenHilfe/.test(H) && /In der Datenbank fehlen/.test(H));
t('mit fertigem Befehl zum Kopieren',
  /alter table menu_items add column if not exists/.test(H)
  && /function _kopiereSpaltenSQL/.test(H));
t('der Befehl kennt den richtigen Typ je Spalte',
  /sizes: 'jsonb'/.test(H) && /allergens: 'text\[\]'/.test(H));
t('und sagt, dass danach noch einmal uebernommen werden muss',
  /der Abgleich trägt die Größen nach/.test(H));

var vor = H.slice(H.indexOf('var _SPALTEN_TYP'), H.indexOf('function _zeigeSpaltenHilfe'));
var bauSql = new Function(vor + 'return function (sp) { return sp.filter(function (x) { return _SPALTEN_TYP[x]; })'
  + '.map(function (x) { return "alter table menu_items add column if not exists " + x + " " + _SPALTEN_TYP[x] + ";"; })'
  + '.join(String.fromCharCode(10)); };')();
t('der erzeugte Befehl ist gueltiges SQL fuer die Groessen-Spalte',
  bauSql(['sizes']) === 'alter table menu_items add column if not exists sizes jsonb;',
  bauSql(['sizes']));
t('unbekannte Felder erzeugen keinen Unsinn im Befehl',
  bauSql(['gibtsnicht']) === '', '"' + bauSql(['gibtsnicht']) + '"');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
