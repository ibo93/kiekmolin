// MEINE EIGENEN REGELN HABEN DIE ANMELDUNG BLOCKIERT.
//
// Die Pruefseite meldete am 21.08.2026:
//     HTTP 401 -- code 42501
//     new row violates row-level security policy
//     for table "push_subscriptions"
//
// Das waren die Regeln aus Schritt 15 -- von mir, wenige Stunden vorher
// geschrieben.
//
// WARUM
// Die App meldet ein Geraet mit einem Upsert an:
//     POST /rest/v1/push_subscriptions?on_conflict=endpoint
//     Prefer: resolution=merge-duplicates
// In der Datenbank ist das ein "insert ... on conflict do update".
// Postgres prueft dabei nicht nur die INSERT-Regel, sondern auch die
// UPDATE-Regel. Meine hiess:
//     using (public.kmi_ist_superadmin())
// Fehlt bei UPDATE das "with check", gilt "using" auch dafuer. Fuer
// jeden, der nicht Superadmin ist -- also fuer jedes Wirte-Handy und
// jeden Gast -- war damit Schluss.
//
// Die INSERT-Regel war grosszuegig genug. Sie kam nur nie zum Zug.
//
// WAS ICH FALSCH GEDACHT HABE
// Ich habe die vier Regeln nach dem Muster von customers gebaut und
// "Aendern" dem Superadmin vorbehalten. Bei customers stimmt das. Bei
// push_subscriptions nicht, weil dort jedes Anmelden technisch ein
// Aendern sein kann. Ein Muster uebertragen, ohne zu pruefen, wie die
// App die Tabelle tatsaechlich benutzt -- das war der Fehler.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var s16 = fs.readFileSync(KMI + '/datenbank/16-push-anmelden-wieder-erlauben.sql', 'utf8');
var s15 = fs.readFileSync(KMI + '/datenbank/15-push-tabelle-zumachen.sql', 'utf8');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function ohneKommentar(txt) {
    return txt.split('\n').filter(function (z) { return /^\s*--/.test(z) === false; }).join('\n');
}
var c16 = ohneKommentar(s16);

console.log('\n-- 1. Anmelden geht wieder --');
t('die alte, zu strenge UPDATE-Regel wird entfernt',
  /drop policy if exists "Nur der Superadmin aendert Geraete" on public\.push_subscriptions/.test(c16),
  'bleibt stehen');
t('eine neue UPDATE-Regel laesst jedes Geraet durch',
  /create policy "Jedes Geraet darf sich neu eintragen"[\s\S]{0,200}?for update/.test(c16), 'fehlt');
// DER KERN: beides ausdruecklich hinschreiben. Genau diese Stille war
// der Fehler -- ohne "with check" gilt "using" stillschweigend auch
// dafuer.
t('using UND with check stehen ausdruecklich da',
  /for update\s*\n\s*using \(true\)\s*\n\s*with check \(true\)/.test(c16), 'wieder nur using');
t('und die INSERT-Regel bleibt grosszuegig',
  /for insert\s*\n\s*with check \(true\)/.test(c16), 'zu streng');

console.log('\n-- 2. Was geschuetzt bleibt, bleibt geschuetzt --');
// Der wichtige Teil: dort stehen Telefonnummern und E-Mail-Adressen
// von Gaesten. Lesen und Loeschen bleiben beim Superadmin.
t('SELECT wird nicht angefasst',
  /drop policy if exists "Nur der Superadmin sieht die Geraete"/.test(c16) === false, 'aufgeweicht');
t('DELETE wird nicht angefasst',
  /drop policy if exists "Nur der Superadmin loescht Geraete"/.test(c16) === false, 'aufgeweicht');
t('und RLS bleibt eingeschaltet',
  /disable row level security/.test(c16) === false, 'macht die Tabelle wieder auf');
// Der Ausloeser aus Schritt 15 ist jetzt der einzige Schutz gegen
// Falschangaben -- er muss dort stehen bleiben.
t('der Ausloeser aus Schritt 15 bleibt zustaendig',
  /create trigger kmi_push_schuetzen/.test(ohneKommentar(s15)), 'kein Schutz mehr');
t('er nagelt die Betriebs-Zuordnung fest',
  /new\.restaurant_id := null;/.test(ohneKommentar(s15)), 'fremder Betrieb moeglich');
t('und die E-Mail am Geraet',
  /new\.customer_email := null;/.test(ohneKommentar(s15)), 'Superadmin-Adresse faelschbar');

console.log('\n-- 3. Die Datei erklaert den Fehler, statt ihn zu verstecken --');
t('die Fehlermeldung steht drin', /42501/.test(s16), 'ohne Befund');
t('und warum die UPDATE-Regel ueberhaupt greift',
  s16.indexOf('insert ... on conflict do update') > -1, 'unerklaert');
t('was ich falsch gedacht habe',
  s16.indexOf('Ein Muster zu uebertragen, ohne zu pruefen') > -1, 'kein Lerneffekt');
t('und was als Rest bleibt',
  s16.indexOf('hinnehmbarer Rest') > -1, 'tut so als waere alles dicht');
t('mit Ruecknahme', /disable row level security/.test(s16), 'keine Ruecknahme');
t('und Gegenprobe', /from pg_policies/.test(s16), 'keine Gegenprobe');

console.log('\n-- 4. Die App meldet weiterhin per Upsert an --');
// Wenn das jemand aendert, muessen die Regeln nachziehen. Deshalb hier
// festgehalten, worauf sich Schritt 16 stuetzt.
t('mit on_conflict=endpoint',
  /push_subscriptions\?on_conflict=endpoint/.test(h), 'anderer Weg');
t('und resolution=merge-duplicates',
  /resolution=merge-duplicates/.test(h), 'anderer Weg');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
