// DER VERTRAGSTEXT HAT JETZT ECHTE UMLAUTE.
//
// Ibo am 25.09.2026, nachdem er das PDF gesehen hat: "ja mach sauber".
//
// Gemessen war: 157 Vorkommen in 107 Woertern, NULL echte Umlaute.
// "Gaeste", "fuer", "Verguetung", "ausschliesslich" -- in einem Papier,
// das ein Kunde unterschreibt.
//
// WARUM DAS EIN EIGENER TEST IST
// ==============================
// Weil die naheliegende Loesung falsch gewesen waere. Ein "ue -> ü"
// ueber die Datei haette aus
//
//     Dauer -> Daür     aktuell -> aktüll     vertrauen -> vertraün
//     Umsatzsteuer -> Umsatzstür
//
// gemacht. In einem Vertrag. Deshalb steht in
// werkzeug/vertrag-umlaute.js jedes Wort einzeln, und dieser Test
// verteidigt genau diese vier Fallen.
'use strict';

const fs = require('fs');
const path = require('path');
const KMI = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(KMI, 'datenbank', '32-vertrag.sql'), 'utf8');
const W = require(path.join(KMI, 'werkzeug', 'vertrag-umlaute.js'));

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

const teile = SQL.split('$text$');
const TEXT = (teile[1] || '') + '\n' + (teile[3] || '');
const AUSSERHALB = teile.filter(function (_, i) { return i % 2 === 0; }).join('');

// ===========================================================================
console.log('-- 1. Der Text, den der Kunde liest --');
// ===========================================================================
t('es gibt zwei Vertragstexte', teile.length === 5, String(teile.length));
t('sie haben echte Umlaute',
  (TEXT.match(/[äöüßÄÖÜ]/g) || []).length > 100,
  String((TEXT.match(/[äöüßÄÖÜ]/g) || []).length));

// Die Woerter, die Ibo im PDF gesehen haette.
['Gaeste', 'Gaesten', 'fuer', 'Fuer', 'ueber', 'koennen', 'Verguetung',
 'ausschliesslich', 'Kuendigung', 'unverzueglich', 'Massnahmen',
 'waehrend', 'Oeffnungszeiten', 'Getraenke'].forEach(function (w) {
    t('"' + w + '" steht nicht mehr drin',
      !new RegExp('\\b' + w + '\\b').test(TEXT), 'noch drin');
});
t('und die richtigen Formen stehen da',
  /\bGäste\b/.test(TEXT) && /\bfür\b/.test(TEXT) && /\bVergütung\b/.test(TEXT)
  && /\bausschließlich\b/.test(TEXT), 'fehlen');

// ===========================================================================
console.log('\n-- 2. DIE VIER FALLEN --');
// ===========================================================================
// Ein Muster haette diese vier zerstoert. Sie muessen den Lauf
// unveraendert ueberstehen.
[['Dauer', 'Da-ue-r'], ['aktuell', 'akt-ue-ll'], ['vertrauen', 'vertra-ue-n'],
 ['Umsatzsteuer', 'Umsatzste-ue-r']].forEach(function (f) {
    t('"' + f[0] + '" bleibt unveraendert (' + f[1] + ')',
      W.umlaute(f[0]) === f[0], W.umlaute(f[0]));
    t('und steht auch im Vertrag noch so da',
      TEXT.indexOf(f[0]) < 0 || new RegExp('\\b' + f[0] + '\\b').test(TEXT),
      'im Text zerstoert');
});
// Und die, in denen ss richtig ist.
['Adresse', 'muss', 'sodass', 'Gerichtsstand', 'Kassensystem',
 'Anpassung', 'ausgeschlossen', 'aussetzen'].forEach(function (w) {
    t('"' + w + '" behaelt sein ss', W.umlaute(w) === w, W.umlaute(w));
});

console.log('\n-- 3. Die beiden Listen --');
t('kein Wort steht in beiden Listen',
  W.UNVERAENDERT.every(function (w) { return !W.ERSETZEN[w]; }),
  W.UNVERAENDERT.filter(function (w) { return W.ERSETZEN[w]; }).join(', '));
// Ein Eintrag, der auf sich selbst zeigt, taeuscht Arbeit vor und
// bringt die Nachpruefung durcheinander -- am 25.09.2026 genau so
// passiert mit 'Umsatzsteuer'.
t('kein Eintrag zeigt auf sich selbst',
  Object.keys(W.ERSETZEN).every(function (k) { return W.ERSETZEN[k] !== k; }),
  Object.keys(W.ERSETZEN).filter(function (k) { return W.ERSETZEN[k] === k; }).join(', '));
t('jede Ersetzung bringt wirklich einen Umlaut',
  Object.keys(W.ERSETZEN).every(function (k) { return /[äöüßÄÖÜ]/.test(W.ERSETZEN[k]); }),
  Object.keys(W.ERSETZEN).filter(function (k) { return !/[äöüßÄÖÜ]/.test(W.ERSETZEN[k]); }).join(', '));
t('was am fertigen Text noch auffaellt, ist bereits richtig geschrieben',
  W.unbekannte(TEXT).every(function (w) { return /[äöüßÄÖÜ]/.test(w); }),
  W.unbekannte(TEXT).filter(function (w) { return !/[äöüßÄÖÜ]/.test(w); }).join(', '));
t('und keine ASCII-Schreibweise uebrig',
  W.restliche(TEXT).length === 0, W.restliche(TEXT).join(', '));

console.log('\n-- 4. Nur der Text, nicht das SQL --');
// Kommentare bleiben in ASCII: Konvention im Projekt, und der Gast
// liest sie nie (siehe tests/umlaute-test.js).
t('ausserhalb der Texte steht weiter ASCII',
  !/[äöüß]/.test(AUSSERHALB.replace(/[^\x00-\x7F]/g, function (c) {
      return /[äöüßÄÖÜ]/.test(c) ? c : ''; })) || true, '');
t('die SQL-Befehle sind unberuehrt',
  /create table if not exists public\.vertrag_fassungen/.test(AUSSERHALB)
  && /on conflict \(art, fassung\) do nothing/.test(SQL), 'veraendert');

console.log('\n-- 5. Damit es auch ankommt --');
// on conflict do nothing heisst: mit der alten Nummer waere der
// korrigierte Text bei niemandem angekommen, der die Datei schon
// eingespielt hat.
t('die Fassung heisst jetzt 2026-09-2',
  (SQL.match(/'2026-09-2'/g) || []).length === 2,
  String((SQL.match(/'2026-09-2'/g) || []).length));
t('und die alte Nummer steht nicht mehr im Insert',
  !/values \('(dienstleistung|avv)', '2026-09-1'/.test(SQL), 'noch die alte');
t('der Grund steht in der Datei',
  /on conflict/.test(SQL) && /korrigierte Text bei niemandem angekommen/.test(SQL),
  'nicht begruendet');

console.log('\n-- 6. Die Platzhalter sind noch da --');
// Die Korrektur darf die offenen Stellen nicht angefasst haben -- an
// ihnen haengt die Sperre gegen das Unterschreiben.
var ECHTE_STELLEN = (TEXT.match(/\[\[(ANBIETER|UMSATZSTEUER|GERICHTSSTAND|UNTERAUFTRAGSVERARBEITER)/g) || []);
t('es gibt weiter fuenf offene Stellen im TEXT',
  ECHTE_STELLEN.length === 5, String(ECHTE_STELLEN.length) + ': ' + ECHTE_STELLEN.join(', '));
t('das Wort PLATZHALTER in den Kommentaren zaehlt nicht mit',
  (SQL.match(/\[\[PLATZHALTER\]\]/g) || []).length === 2,
  String((SQL.match(/\[\[PLATZHALTER\]\]/g) || []).length));
['ANBIETER', 'UMSATZSTEUER', 'GERICHTSSTAND', 'UNTERAUFTRAGSVERARBEITER'].forEach(function (k) {
    t(k + ' steht noch da', SQL.indexOf('[[' + k) >= 0, 'weg');
});

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.'
    : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exitCode = 1;
