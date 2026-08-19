// Prueft das SQL-Skript, das die Regeln fuer Angemeldete oeffnet.
//
// Ein SQL-Skript kann man hier nicht ausfuehren -- es gibt keine Datenbank.
// Pruefbar ist aber das Wichtigste: dass es nichts tut, was es nicht tun
// soll. Dieses Skript laeuft auf der Produktivdatenbank mit 25 Betrieben.
// Was hier durchrutscht, faellt niemandem vorher auf.

var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var datei = path.join(__dirname, '..', 'datenbank', '01-rollen-erweitern.sql');
t('das Skript liegt im Projekt', fs.existsSync(datei));
var sql = fs.readFileSync(datei, 'utf8');

// Kommentare raus -- geprueft wird, was ausgefuehrt wird, nicht was
// danebensteht. (Im Kommentar stehen Worte wie "geloescht" durchaus.)
var code = sql.split('\n').filter(function (z) { return !/^\s*--/.test(z); }).join('\n');

console.log('\n-- Was es NICHT tun darf --');

t('RLS wird nirgends abgeschaltet', !/disable\s+row\s+level\s+security/i.test(code));
t('keine Regel wird geloescht', !/drop\s+policy/i.test(code));
t('keine Regel wird neu angelegt', !/create\s+policy/i.test(code));
t('keine Tabelle wird veraendert', !/\balter\s+table\b/i.test(code));
t('nichts wird geloescht oder ueberschrieben',
  !/\b(delete\s+from|truncate|drop\s+table|update\s+\w+\s+set)\b/i.test(code));
t('keine Rechte werden per grant verteilt', !/\bgrant\b/i.test(code));

console.log('\n-- Was es tun soll --');

t('es aendert Regeln -- und zwar nur die Rollenliste',
  /alter policy %I on %I\.%I to %s/.test(code));
t('genau ein einziger veraendernder Befehl', (code.match(/execute format/gi) || []).length === 1);

console.log('\n-- Die Auswahl der Regeln --');

// Der gefaehrlichste denkbare Fehler: eine Regel erwischen, die NICHT fuer
// anon gilt. Aus "nur der Dienstschluessel darf das" wuerde dann "jeder
// Angemeldete darf das".
t('angefasst wird nur, was ohnehin schon fuer anon gilt',
  /'anon'\s*=\s*any\(roles\)/.test(code));
t('nichts, was schon fuer authenticated gilt (sonst laeuft es doppelt)',
  /not\s*\(\s*'authenticated'\s*=\s*any\(roles\)\s*\)/.test(code));
t('nichts, was fuer public gilt -- das schliesst beide schon ein',
  /not\s*\(\s*'public'\s*=\s*any\(roles\)\s*\)/.test(code));
t('nur das oeffentliche Schema', /schemaname\s*=\s*'public'/.test(code));

console.log('\n-- Bestehende Rollen bleiben --');

// "to anon, authenticated" waere der bequeme Weg -- und wuerde jede weitere
// Rolle stillschweigend wegwerfen.
t('die vorhandenen Rollen werden uebernommen, nicht ersetzt',
  /r\.roles\s*\|\|\s*'authenticated'/.test(code));
t('keine fest verdrahtete Rollenliste',
  !/to\s+anon\s*,\s*authenticated\s*['"]/i.test(code));
t('Bezeichner werden sauber gequotet (%I / quote_ident)',
  /quote_ident/.test(code) && /%I/.test(code));

console.log('\n-- Mehrfach ausfuehrbar --');

// Die Auswahl schliesst aus, was schon erweitert wurde -- damit findet der
// zweite Lauf nichts mehr. Genau deshalb steht die Bedingung in der
// Schleife und nicht in einer Liste fest eingetragener Namen.
t('es arbeitet ueber eine Abfrage, nicht ueber getippte Regelnamen',
  /for\s+r\s+in[\s\S]{0,400}from pg_policies/.test(code));
t('und meldet, wenn es nichts zu tun gab', /Nichts zu tun/.test(sql));

console.log('\n-- Gegenprobe eingebaut --');

var letzte = code.slice(code.lastIndexOf('end $$;'));
t('am Ende steht eine Abfrage, die 0 Zeilen liefern muss',
  /select[\s\S]*from pg_policies/i.test(letzte));
t('sie prueft dieselbe Bedingung wie die Schleife',
  /'anon'\s*=\s*any\(roles\)/.test(letzte));

console.log('\n-- Reihenfolge --');

t('das Skript sagt, dass es VOR dem Deploy laufen muss', /vor dem Deploy/i.test(sql));
t('und warum: sonst kann ein angemeldeter Gast nicht mehr bestellen',
  /nicht mehr\s*\n?--\s*bestellen|bestellen/i.test(sql));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
