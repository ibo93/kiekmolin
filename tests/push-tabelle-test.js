// ES IST NIE EINE BENACHRICHTIGUNG RAUSGEGANGEN. SEIT DEM ERSTEN TAG.
//
// Der Betreiber am 21.08.2026: "wenn eine bestellung oder resevierung
// reinkommt soll der gastronomen auch das als benachrichtigung auf sein
// handy bekommen ... das haben wir mal gebaut, aber es kamm nicht so
// ganz durch" -- und danach: "ja das hatte ja als app aber wenn mein
// bildschirm und die app zu ist kommt nichts an".
//
// Der zweite Satz war der Hinweis. Wenn die App auf dem Home-Bildschirm
// liegt, MUSS eine Meldung auch bei geschlossener App ankommen -- genau
// dafuer ist Web Push gebaut. Kommt trotzdem nichts, wurde nichts
// gesendet.
//
// DER BEFUND AUS DEN PROTOKOLLEN
//     column push_subscriptions.p256dh_key does not exist
//
// Die Tabelle hat die beiden Schluessel in EINER jsonb-Spalte "keys".
// Der Code schreibt und liest zwei getrennte Spalten, p256dh_key und
// auth_key, dazu user_agent. Drei Spalten, die es nicht gibt.
//
// Also: Geraet anmelden -> 400. Geraete auslesen -> 400. Nie ein Geraet
// gespeichert, nie eine Meldung verschickt. An niemanden.
//
// WAS DARAN LEHRREICH IST
// Zuerst habe ich auf das iPhone getippt -- auf iOS braucht Web Push
// wirklich die App auf dem Home-Bildschirm. Das war naheliegend, gut
// begruendet und falsch. Der Betreiber hat es widerlegt, indem er sagte,
// dass die App laengst installiert ist. Erst danach habe ich in die
// Protokolle geschaut, und da stand es beim ersten Blick.
//
// Diese Datei prueft die Reparatur -- und dass der Code die Namen
// benutzt, auf die die Datenbank danach hoert.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var sql = fs.readFileSync(KMI + '/datenbank/14-push-tabelle-reparieren.sql', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die drei fehlenden Spalten --');
['p256dh_key', 'auth_key', 'user_agent'].forEach(function (sp) {
    t('wird angelegt: ' + sp,
      new RegExp('add column if not exists ' + sp + '\\s+text').test(sql), 'fehlt');
});
t('mit if not exists -- die Datei darf zweimal laufen',
  (sql.match(/add column if not exists/g) || []).length === 3, 'nicht wiederholbar');

console.log('\n-- 2. Vorhandene Zeilen gehen nicht verloren --');
t('was in keys steht, wird uebernommen',
  /set p256dh_key = coalesce\(p256dh_key, keys ->> 'p256dh'\)/.test(sql)
  && /auth_key   = coalesce\(auth_key,   keys ->> 'auth'\)/.test(sql), 'wird verworfen');
t('coalesce -- schon Gefuelltes wird nicht ueberschrieben',
  /coalesce\(p256dh_key,/.test(sql), 'ueberschreibt');
t('die alte Spalte bleibt stehen',
  /drop column .*keys/.test(sql) === false, 'wird geloescht, bevor sicher ist dass nichts daran haengt');

console.log('\n-- 3. Der naechste Fehler wird gleich mit abgeraeumt --');
// Nach dem ersten Fehler waeren zwei weitere gekommen. Wer nur den
// ersten behebt, glaubt fertig zu sein und sucht morgen weiter.
t('keys darf leer bleiben -- sonst scheitert jede Anmeldung weiter',
  /alter column keys drop not null/.test(sql), 'NOT NULL bleibt');
t('und zwar nur, wenn dort wirklich NOT NULL steht',
  /is_nullable = 'NO'/.test(sql), 'blind ausgefuehrt');
t('ein eindeutiger Index auf endpoint',
  /create unique index if not exists push_subscriptions_endpoint_key/.test(sql), 'fehlt');
t('mit Begruendung: der Code meldet mit on_conflict=endpoint an',
  /on_conflict=endpoint/.test(sql), 'unbegruendet');
t('Doppelte werden vorher aufgeraeumt, sonst scheitert der Index',
  sql.indexOf('delete from public.push_subscriptions a') < sql.indexOf('create unique index'),
  'Index scheitert an Doppelten');
t('und der juengste Eintrag bleibt',
  /a\.created_at < b\.created_at/.test(sql), 'behaelt den alten');

console.log('\n-- 4. Die Datei sagt, was auf dem Spiel stand --');
t('der Befund steht drin', /column push_subscriptions\.p256dh_key does not exist/.test(sql), 'ohne Befund');
t('und dass es ACHT Funktionen betrifft',
  /pending-reminder/.test(sql) && /waiter-call/.test(sql) && /loyalty-push/.test(sql)
  && /review-push/.test(sql) && /marketing-push/.test(sql) && /waechter/.test(sql)
  && /res-cancel/.test(sql) && /push-send/.test(sql), 'unterschaetzt den Umfang');
t('warum die Datenbank angepasst wird und nicht acht Dateien',
  /acht Gelegenheiten, eine zu vergessen/.test(sql), 'keine Begruendung');
t('mit Ruecknahme', /drop column if exists p256dh_key/.test(sql), 'keine Ruecknahme');
t('und einer Probe, die das Geraet in der Tabelle sucht',
  /from public\.push_subscriptions[\s\S]{0,120}order by created_at desc/.test(sql), 'keine Probe');
// Ehrlich bleiben. Der Superadmin-Weg ist gebaut -- und er hat einen
// Rest, den die Datei benennen muss, statt ihn zu verschweigen:
// push_subscriptions steht offen, wer die Adresse kennt, kann ein
// Geraet darunter eintragen.
t('der Superadmin-Weg steht in der Datei',
  sql.indexOf('DER SUPERADMIN -- SCHON MITGEBAUT') > -1, 'nicht erklaert');
t('samt Begruendung, warum kein Haekchen aus dem Browser',
  /in einer\s*\n-- Zeile gefaelscht/.test(sql) || sql.indexOf('Zeile gefaelscht') > -1,
  'keine Begruendung');
t('und der Rest wird benannt, nicht verschwiegen',
  sql.indexOf('WAS DABEI OFFEN BLEIBT') > -1
  && sql.indexOf('push_subscriptions selbst ist noch offen') > -1, 'weckt falsche Erwartung');

console.log('\n-- 5. Der Code benutzt die Namen, die danach dastehen --');
// Wenn hier jemand umbenennt, ohne die Datenbank anzufassen, ist der
// Fehler sofort zurueck -- und wieder unsichtbar.
var dateien = ['pending-reminder', 'res-cancel', 'waiter-call', 'loyalty-push',
               'review-push', 'marketing-push', 'waechter', 'push-send'];
dateien.forEach(function (name) {
    var quelle = fs.readFileSync(KMI + '/netlify/functions/' + name + '.js', 'utf8');
    t(name + ' liest p256dh_key/auth_key',
      /p256dh_key/.test(quelle) && /auth_key/.test(quelle), 'andere Namen');
});
var h = fs.readFileSync(KMI + '/index.html', 'utf8');
t('und die App schreibt dieselben Namen',
  /p256dh_key: json\.keys && json\.keys\.p256dh/.test(h)
  && /auth_key: json\.keys && json\.keys\.auth/.test(h), 'andere Namen');
t('samt user_agent', /user_agent: navigator\.userAgent \|\| null/.test(h), 'fehlt');

console.log('\n-- 6. Der Superadmin bekommt es auch --');
// "für mich wäre es auch gut ... damit ich es alles verfolgen kann".
// Er hat keinen eigenen Betrieb -- restaurant_id ist bei ihm NULL --
// und wurde von jeder Suche nach restaurant_id uebersehen.
var melder = fs.readFileSync(KMI + '/netlify/functions/pending-reminder.js', 'utf8');
var absage = fs.readFileSync(KMI + '/netlify/functions/res-cancel.js', 'utf8');
var app = fs.readFileSync(KMI + '/index.html', 'utf8');

t('die App speichert die Adresse des Superadmins mit',
  /adminMail \|\| email/.test(app), 'Geraet bleibt namenlos');
t('erkannt an der Rolle, nicht am Zufall',
  /String\(window\.currentUser\.role \|\| ''\)\.toLowerCase\(\) === 'superadmin'/.test(app), 'raet');
t('auch ueber den Passwort-Weg',
  /window\.currentAdmin && window\.currentAdmin\.isAdmin === true/.test(app), 'nur Google');

// DER PUNKT, AUF DEN ES ANKOMMT: der Browser darf das nicht behaupten.
// Ein Haekchen "ich bin Admin" waere mit dem oeffentlichen Schluessel
// aus dem Seitenquelltext in einer Zeile gefaelscht -- und der
// Faelscher bekaeme jede Bestellung mit Gastnamen aufs Handy.
t('kein Admin-Haekchen aus dem Browser',
  /is_admin|isAdmin:\s*true,/.test(app.slice(app.indexOf('var record = {'),
                                              app.indexOf('var record = {') + 600)) === false,
  'Browser behauptet es selbst');
t('der Melder fragt customers, wer Superadmin ist',
  /customers\?role=eq\.superadmin&select=email/.test(melder), 'glaubt dem Geraet');
t('und die Absage-Function auch',
  /customers\?role=eq\.superadmin&select=email/.test(absage), 'nur halb eingebaut');
t('gesucht wird dann ueber die E-Mail',
  /push_subscriptions\?customer_email=in\.\(/.test(melder)
  && /push_subscriptions\?customer_email=in\.\(/.test(absage), 'findet nichts');
t('die Admin-Liste wird einmal je Durchlauf geholt, nicht je Meldung',
  /let _adminGeraete = null;/.test(melder) && /if \(_adminGeraete\) return _adminGeraete;/.test(melder),
  'fragt bei jeder Meldung neu');
t('kein Geraet klingelt doppelt',
  /gesehen\[x\.endpoint\]/.test(melder) && /gesehen\[x\.endpoint\]/.test(absage), 'doppelte Meldung');
t('faellt die Admin-Suche aus, bekommt der Wirt trotzdem seine Meldung',
  /catch \(e\) \{ \/\* ohne Admin-Geraete weiter -- der Wirt zaehlt zuerst \*\//.test(absage)
  && /Admin-Geraete nicht ladbar/.test(melder), 'ein Fehler kippt alles');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
