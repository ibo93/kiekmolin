// GROESSE IN DER BESTELLUNG -- der Weg vom Antippen bis zum Bon.
//
// Der Import kann Groessen noch so sauber anlegen: wenn die Bestellung sie
// nicht mitnimmt, bestellt der Gast "groß" und die Kueche macht "klein".
//
// Zwei Fehler waren drin, beide von derselben Sorte: der Warenkorb legt eine
// gewaehlte Option als { group, option, price, price_type } ab -- ein Feld
// "name" gibt es dort NICHT. Zwei Anzeigen suchten aber nur nach opt.name
// und zeigten deshalb gar nichts:
//   * die Bestell-Spalten im Dashboard (was die Kueche liest)
//   * der gedruckte Bon
// Dazu wurde die Groesse als Aufpreis ausgewiesen ("groß (+10,00)"), obwohl
// sie den Preis ERSETZT.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// --- Preisrechnung: die Groesse ERSETZT den Grundpreis ----------------------
var rechne = new Function('currentMenuItem', 'currentItemOptions',
    schneide('calculateItemPrice') + '; return calculateItemPrice();');

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

// --- Was die Kueche liest ---------------------------------------------------
var GROESSE = { group: 'item_sizes', option: 'groß', price: 10, price_type: 'replace' };
var EXTRA = { group: 'extra', option: 'Extra Käse', price: 1.5, price_type: 'add' };

var spalte = H.match(/optionsText = it\.selected_options\.map\(function \(opt\)[\s\S]*?join\(', '\);/);
t('Bestell-Spalte baut den Optionstext ueberhaupt', !!spalte);
if (spalte) {
    var f = new Function('it', 'var optionsText = "";' + spalte[0] + '; return optionsText;');
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
    var b = new Function('item', 'var optsText="";' + bon[0] + '; return { text: optsText, opts: opts };');
    var r1 = b({ selected_options: [GROESSE] });
    t('auf dem Bon steht die Groesse', r1.text === 'groß', '"' + r1.text + '"');
    t('und NICHT als Aufpreis -- der Preis ist ja der ganze Preis',
      r1.text.indexOf('+') < 0, '"' + r1.text + '"');
    var r2 = b({ selected_options: [EXTRA] });
    t('ein echtes Extra steht weiterhin mit Aufpreis auf dem Bon',
      /Extra Käse \(\+1\.50\)/.test(r2.text), '"' + r2.text + '"');
}

// --- Kuechenanzeige ---------------------------------------------------------
t('Kuechenanzeige weist die Groesse nicht als Aufpreis aus',
  /opt\.price_type === 'replace' \? 0 : \(parseFloat\(opt\.price\) \|\| 0\)/.test(H));

// --- Der Warenkorb traegt die Groesse ueberhaupt mit ------------------------
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

// Die erste Groesse ist optisch vorausgewaehlt -- sie muss auch wirklich
// ausgewaehlt sein. Sonst geht die Bestellung ohne Groesse raus, und in der
// Kueche steht "Pizza Margherita" ohne jeden Hinweis.
t('die vorausgewaehlte Groesse landet auch in der Bestellung',
  /currentItemOptions\.push\(\{ group: 'item_sizes', option: _ersteGroesse\.name/.test(H));
t('und ersetzt eine vorher gewaehlte Groesse, statt sich zu stapeln',
  /currentItemOptions\.filter\(function \(o\) \{ return o\.group !== 'item_sizes'; \}\)/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
