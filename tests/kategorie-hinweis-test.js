// DER HINWEIS FUER DIE GANZE KATEGORIE.
//
// Ibo am 06.09.2026: "was noch fehlt beispeiel bei pizza alle pizzen mit
// tomatensauce und kaese, oregano so bei".
//
// NACHGESEHEN STATT ANGENOMMEN, und dabei fiel das Groessere auf:
// editCategory() war ein STUMPF -- der Stift-Knopf an jeder Kategorie
// zeigte nur "wird implementiert". Ohne ihn waere der Hinweis NUR beim
// Anlegen zu setzen gewesen. Die Kategorie "Pizza" gibt es in jedem
// Betrieb aber laengst; das Feld waere fuer Ibo unerreichbar gewesen --
// derselbe Fall wie das Kombi-Menue ohne Knopf.
//
// WAS HIER STILL SCHIEFGEHEN KANN:
// 1. Ein 204 von PostgREST heisst NICHT "gespeichert". Bei fehlendem
//    Schreibrecht kommt derselbe Erfolg zurueck wie beim echten Treffer.
// 2. Fehlt die Spalte in der Datenbank, darf die Kategorie trotzdem
//    durchgehen -- aber es MUSS dabeistehen, sonst tippt er den Satz
//    und niemand sieht ihn je.
// 3. Wochentage muessen beim Bearbeiten VORBELEGT sein. Sonst saehe ein
//    Mo-Fr-Mittagstisch aus wie "taeglich", und ein Speichern haette
//    das Fenster still auf sieben Tage verbreitert.
// 4. Der Text kommt vom Wirt und steht beim Gast -- er muss escaped sein.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

function schneide(name) {
    var a = h.indexOf('function ' + name + '(');
    if (a < 0) a = h.indexOf('async function ' + name + '(');
    if (a < 0) return '';
    var tiefe = 0, i = h.indexOf('{', a);
    if (i < 0) return '';
    for (var j = i; j < h.length; j++) {
        if (h[j] === '{') tiefe++;
        else if (h[j] === '}') { tiefe--; if (tiefe === 0) return h.slice(a, j + 1); }
    }
    return '';
}

// ---- 1. Die Datenbank-Datei -----------------------------------------
console.log('\n-- Die Spalte --');
var sqlPfad = path.join(KMI, 'datenbank', '26-kategorie-hinweis.sql');
t('es gibt die SQL-Datei', fs.existsSync(sqlPfad), 'fehlt');
var sql = fs.existsSync(sqlPfad) ? fs.readFileSync(sqlPfad, 'utf8') : '';
t('sie legt beschreibung an menu_categories an',
  /alter\s+table\s+public\.menu_categories/i.test(sql) && /beschreibung/i.test(sql), 'falsche Tabelle');
t('sie ist zweimal ausfuehrbar (if not exists)',
  /add column if not exists/i.test(sql), 'wuerde beim zweiten Mal krachen');

// ---- 2. Das Feld beim Anlegen ---------------------------------------
console.log('\n-- Beim Anlegen --');
t('das Formular hat ein Hinweis-Feld', /id="newCategoryHinweis"/.test(h), 'kein Feld');
t('es ist beschriftet (Barrierefreiheit)',
  /for="newCategoryHinweis"/.test(h) || /id="newCategoryHinweis"[^>]*aria-label=/.test(h), 'ohne Label');
t('es ist laengenbegrenzt', /id="newCategoryHinweis"[^>]*maxlength=/.test(h), 'unbegrenzt');
t('der Hinweis wird in die Nutzlast geschrieben',
  /_catPayload\.beschreibung\s*=\s*_catHinweis/.test(h), 'wird nie mitgeschickt');
t('leer bleibt leer -- das Feld wird dann gar nicht geschickt',
  /if\s*\(_catHinweis\)\s*_catPayload\.beschreibung/.test(h), 'schickt auch leere Werte');
t('fehlt die Spalte, wird es GESAGT statt still verschluckt',
  /\/beschreibung\/i\.test\(error\.message[^)]*\)/.test(h)
  && /Spalte "beschreibung" fehlt/.test(h), 'stiller Ausfall');
t('nach dem Speichern wird das Feld geleert',
  /_hinweisFeld[\s\S]{0,80}\.value\s*=\s*''/.test(h), 'bleibt stehen');

// ---- 3. Der Stift-Knopf tut endlich etwas ---------------------------
console.log('\n-- Kategorie bearbeiten --');
var edit = schneide('editCategory');
t('editCategory wurde gefunden', edit.length > 200, edit.length + ' Zeichen');
t('es ist kein Stumpf mehr',
  !/wird implementiert/.test(edit), 'zeigt weiter nur eine Meldung');
t('es oeffnet wirklich ein Fenster', /showGenericModal\(/.test(edit), 'kein Fenster');
t('mit dem Namen', /id="editCatName"/.test(edit), 'kein Name');
t('mit dem Hinweis', /id="editCatHinweis"/.test(edit), 'kein Hinweis');
t('mit dem Zeitfenster', /id="editCatVon"/.test(edit) && /id="editCatBis"/.test(edit), 'keine Zeiten');
t('der vorhandene Hinweis steht drin (nicht leer vorbelegt)',
  /_v\(kat\.beschreibung\)/.test(edit), 'wuerde beim Speichern geloescht');
t('der Text wird escaped, bevor er ins Formular geht',
  /escapeHtml\(String\(x == null \? '' : x\)\)/.test(edit), 'roh eingesetzt');
t('eine unbekannte Kategorie fuehrt zu einer Meldung, nicht zu nichts',
  /Kategorie nicht gefunden/.test(edit), 'still');
t('die Wochentage werden vorbelegt',
  /mittagTageBauen\('editCategoryTage', kat\.wochentage\)/.test(edit), 'saehe aus wie taeglich');

// ---- 4. Der Knopf-Bauer kann das ueberhaupt -------------------------
var bauer = schneide('mittagTageBauen');
t('mittagTageBauen nimmt Kasten und Vorbelegung entgegen',
  /function mittagTageBauen\(kastenId, vorbelegt\)/.test(bauer), 'unveraendert');
t('ohne Argumente baut er weiter das Anlege-Formular (alter Weg bleibt)',
  /kastenId \|\| 'newCategoryTage'/.test(bauer), 'alter Aufruf kaputt');
t('vorbelegte Tage stehen wirklich auf an',
  /b\.dataset\.an = _an\[i\] \? '1' : '0'/.test(bauer), 'immer aus');
t('und sehen auch gedrueckt aus',
  /_an\[i\] \? 'var\(--primary\)' : 'rgba\(255,255,255,0\.6\)'/.test(bauer), 'unsichtbar an');

// ---- 5. Das Speichern -----------------------------------------------
console.log('\n-- Speichern --');
var sp = schneide('kategorieSpeichern');
t('kategorieSpeichern wurde gefunden', sp.length > 400, sp.length + ' Zeichen');
t('es schreibt per PATCH auf menu_categories',
  /method: 'PATCH'/.test(sp) && /rest\/v1\/menu_categories\?id=eq\./.test(sp), 'schreibt woanders hin');
t('es verlangt die Zeile zurueck (ein 204 ist kein Beweis)',
  /'Prefer': 'return=representation'/.test(sp), '204 wuerde als Erfolg gelten');
t('und prueft, dass wirklich eine Zeile kam',
  /!Array\.isArray\(zeilen\) \|\| zeilen\.length === 0/.test(sp), 'glaubt dem Status');
t('sonst sagt es, dass NICHT gespeichert wurde',
  /Nicht gespeichert: die Datenbank hat die Änderung ohne Fehlermeldung verworfen/.test(sp), 'still');
t('lokal wird ERST nach der Bestaetigung uebernommen',
  sp.indexOf('zeilen.length === 0') < sp.indexOf('Object.keys(zeilen[0])'), 'schreibt vorher');
t('ein leerer Name wird abgefangen',
  /Bitte einen Namen eingeben/.test(sp), 'wuerde die Kategorie namenlos machen');
t('eine halbe Zeitangabe wird abgefangen',
  /\(von && !bis\) \|\| \(bis && !von\)/.test(sp), 'halbe Angabe geht durch');
t('ein geleerter Hinweis wird wirklich geloescht (null, nicht undefined)',
  /beschreibung: hinweis \|\| null/.test(sp), 'liesse den alten Text stehen');
t('Zeiten ohne Fenster werden zurueckgesetzt',
  /zeit_von: von \|\| null/.test(sp) && /zeit_bis: bis \|\| null/.test(sp), 'Fenster bliebe kleben');
t('alle sieben Tage gedrueckt heisst taeglich, nicht sieben Eintraege',
  /tage\.length && tage\.length < 7/.test(sp), 'unnoetige Liste');
t('fehlt die Spalte, wird der Rest trotzdem gespeichert -- mit Ansage',
  /delete daten\.beschreibung/.test(sp) && /Spalte "beschreibung" fehlt/.test(sp), 'stiller Ausfall');
t('ein echter Fehler wird mit Status gemeldet',
  /Nicht gespeichert \(Fehler '/.test(sp), 'still');
t('die Liste wird danach neu gezeichnet',
  /renderMenuCategories\(\)/.test(sp), 'Dashboard bliebe alt');

// ---- 6. Was der Gast sieht ------------------------------------------
console.log('\n-- Beim Gast --');
var gast = schneide('renderKarteDurchgehend');
t('renderKarteDurchgehend wurde gefunden', gast.length > 500, gast.length + ' Zeichen');
t('der Hinweis wird aus der Kategorie uebernommen',
  /hinweis: c\.beschreibung \|\| ''/.test(gast), 'kommt nie an');
t('er wird nur gezeichnet, wenn es einen gibt',
  /if \(r\.hinweis\)/.test(gast), 'leerer Kasten bei jeder Kategorie');
t('ohne Hinweis bleibt der Kopf wirklich leer',
  /var kopf = '';/.test(gast), 'Abstand veraendert sich immer');
t('er steht UEBER den Gerichten',
  gast.indexOf('kopf') < gast.indexOf('stitch-menu-grid'), 'steht darunter');
t('und wird escaped -- der Text kommt vom Wirt',
  /escapeHtml\(String\(r\.hinweis\)\)/.test(gast), 'roh in die Seite');
t('die Abschnitte heissen weiter kmi-kat-abschnitt (Sprungleiste)',
  /class="kmi-kat-abschnitt" data-kat=/.test(gast), 'Sprungziel kaputt');

// ---- 7. Und im Dashboard --------------------------------------------
var liste = schneide('renderMenuCategories');
t('das Dashboard zeigt den Hinweis auch an',
  /cat\.beschreibung \?/.test(liste), 'unsichtbar bis zum Gast');
t('auch dort escaped',
  /escapeHtml\(String\(cat\.beschreibung\)\)/.test(liste), 'roh im Dashboard');

// ---- 8. Der Cache muss hoch -----------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 24 (Gastweg hat sich geaendert)',
  !!m && Number(m[1]) >= 24, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
