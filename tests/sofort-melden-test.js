// DER WIRT ERFUHR NICHT, WENN ETWAS HEREINKAM.
//
// Gemeldet: "wenn eine bestellung oder resevierung reinkommt soll der
// gastronomen auch das als benachrichtigung auf sein handy bekommen ...
// wenn abends oder morgens eine resevierung reinkommt kann er so
// bestaetigen ... von zuhause" -- dazu: "das haben wir mal gebaut, aber
// es kamm nicht so ganz durch".
//
// WAS ES WIRKLICH GAB
// pending-reminder war eine MAHNUNG, keine Meldung: sie feuerte erst,
// wenn etwas 20 Minuten unbeantwortet lag, und lief alle 10 Minuten.
// Eine Reservierung um 21 Uhr erreichte den Wirt fruehestens um 21:20 --
// und nur, wenn er bis dahin nicht reagiert hatte.
//
// Beim EINGANG meldete sich nichts. Weder order-save noch
// reservation-save verschicken einen Push, und die Reservierung des
// Gastes entsteht ohnehin direkt aus dem Browser. Im Dashboard sah der
// Wirt sie sofort ueber den Echtzeit-Kanal -- aber nur solange das
// Dashboard offen war.
//
// UND DER ZWEITE GRUND, DER NICHTS MIT DEM SERVER ZU TUN HAT
// Auf dem iPhone kommen Web-Pushs nur an, wenn die Seite als App auf
// dem Home-Bildschirm liegt (iOS 16.4+). Im Safari-Tab passiert gar
// nichts -- ohne Fehlermeldung. Daran kann man tagelang vorbeisuchen.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');
var m = fs.readFileSync(KMI + '/netlify/functions/pending-reminder.js', 'utf8');
var toml = fs.readFileSync(KMI + '/netlify.toml', 'utf8');
var sql = fs.readFileSync(KMI + '/datenbank/13-sofort-melden.sql', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Es wird jede Minute nachgesehen --');
t('der Zeitplan steht auf jede Minute',
  /\[functions\."pending-reminder"\]\s*\n\s*schedule = "\* \* \* \* \*"/.test(toml), 'seltener');
t('und der alte 10-Minuten-Takt ist weg',
  /schedule = "\*\/10 \* \* \* \*"/.test(toml) === false, 'noch drin');

console.log('\n-- 2. Sofort heisst ohne Mindestalter --');
// Genau das war der Unterschied: vorher musste etwas 20 Minuten alt
// sein, um ueberhaupt gefunden zu werden.
t('die Sofort-Abfrage sucht nach push_sent_at, nicht nach Alter',
  /'orders\?status=in\.\(received,pending\)' \+\s*\n\s*'&push_sent_at=is\.null'/.test(m),
  'immer noch mit Mindestalter');
t('dasselbe fuer Reservierungen',
  /'reservations\?status=eq\.pending' \+\s*\n\s*'&push_sent_at=is\.null'/.test(m), 'fehlt');
t('kein created_at-Filter in der Sofort-Abfrage',
  /push_sent_at=is\.null'[\s\S]{0,200}?created_at=lt/.test(m) === false, 'wartet doch');

console.log('\n-- 3. Die Erinnerung bleibt daneben bestehen --');
// Sofortmeldung und Erinnerung sind zwei verschiedene Dinge: die eine
// sagt "ist da", die andere "liegt immer noch rum".
t('die 20-Minuten-Grenze gibt es weiterhin',
  /const STALE_MINUTES = 20;/.test(m), 'Erinnerung abgeschafft');
t('und eine eigene Abfrage dafuer',
  /reminder_sent_at=is\.null/.test(m), 'keine Erinnerung mehr');
t('beide Stufen werden getrennt abgehakt',
  /const spalte = \(stufe === 'sofort' \? 'push_sent_at' : 'reminder_sent_at'\);/.test(m),
  'eine Spalte fuer beides');
t('und tragen verschiedene Kennzeichner',
  /tag: stufe \+ '-' \+ kind \+ '-' \+ item\.id/.test(m), 'ersetzen sich gegenseitig');

console.log('\n-- 4. Was drinsteht, reicht zum Bestaetigen vom Sofa --');
t('Sofortmeldung Bestellung nennt den Kunden',
  /title = '🍽 Neue Bestellung';/.test(m) && /item\.customer_name \|\| 'Ein Kunde'/.test(m), 'namenlos');
t('Sofortmeldung Reservierung nennt Datum, Zeit und Personen',
  /title = '📅 Neue Reservierung';/.test(m)
  && /datumStr[\s\S]{0,200}?zeitStr[\s\S]{0,120}?party_size/.test(m), 'unvollstaendig');
t('und fordert zum Antippen auf',
  /Zum Bestaetigen antippen/.test(m), 'kein Hinweis');
t('der Klick fuehrt in den richtigen Bereich',
  /adminTab=orders/.test(m) && /adminTab=reservations/.test(m), 'landet irgendwo');

console.log('\n-- 5. Ein Fehler haelt nicht die ganze Kette auf --');
t('jede Sache einzeln abgesichert',
  /catch \(e\) \{ console\.error\('\[melder\]', stufe, kind, eintrag\.id, 'fehlgeschlagen:', e\.message\); \}/.test(m),
  'ein Fehler stoppt alles');
t('ohne angemeldetes Geraet wird trotzdem abgehakt',
  /keine Geraete fuer Betrieb[\s\S]{0,400}?sbPatch\(tabelle/.test(m), 'versucht es ewig neu');
t('tote Geraete werden entfernt',
  /statusCode === 404 \|\| results\[i\]\.statusCode === 410/.test(m), 'Liste waechst zu');

console.log('\n-- 6. Der iPhone-Grund wird benannt, nicht verschwiegen --');
// Der haeufigste Grund fuer "geht nicht" liegt am Geraet, nicht am
// Server. Wer das nicht sagt, laesst den Wirt raten.
t('die App erkennt ein iPhone', /function istIPhone\(\)/.test(h), 'keine Erkennung');
t('auch iPads, die sich als Mac ausgeben',
  /navigator\.platform === 'MacIntel' && navigator\.maxTouchPoints > 1/.test(h), 'iPad faellt durch');
t('und ob sie als App laeuft',
  /display-mode: standalone/.test(h) && /navigator\.standalone === true/.test(h), 'keine Pruefung');
t('im Safari-Tab wird erklaert statt gefragt',
  /if \(isDashboard && istIPhone\(\) && !laeuftAlsApp\(\)\) \{/.test(h), 'fragt ins Leere');
t('mit der konkreten Anleitung',
  /Zum Home-Bildschirm/.test(h), 'ohne Anleitung');
t('der Hinweis laesst sich wegklicken',
  /kmi_push_hinweis_weg/.test(h), 'nervt dauerhaft');
t('und der Schliessen-Knopf hat einen Namen',
  /aria-label="Hinweis schließen"/.test(h), 'namenloser Knopf');

console.log('\n-- 6b. Neue Gastronom-Anmeldungen --');
// Eine Anmeldung landete stumm in der Datenbank. Sichtbar war sie nur
// unter "offene Anmeldungen" -- und die Liste sieht man nur, wenn man
// hinschaut. Wer sich nachts anmeldet, lag bis zum naechsten Blick.
t('es wird nach neuen Anmeldungen gesucht',
  /customers\?role=eq\.restaurant' \+\s*\n\s*'&is_active=eq\.false' \+\s*\n\s*'&gemeldet_at=is\.null'/.test(m),
  'wird nicht gesucht');
t('und sie gehen NUR an den Superadmin',
  /async function meldeAnmeldung\(zeile\) \{\s*\n\s*const subs = await adminGeraete\(\);/.test(m),
  'geht an Wirte');
t('mit Name und Adresse in der Meldung',
  /zeile\.name \|\| 'Ein Betrieb'/.test(m) && /zeile\.email/.test(m), 'nichtssagend');
t('und werden abgehakt',
  /sbPatch\('customers\?id=eq\.' \+ zeile\.id, \{ gemeldet_at: jetzt \}\)/.test(m), 'meldet jede Minute neu');
// Laeuft Schritt 15 noch nicht, gibt es die Spalte nicht. Das darf die
// Bestellungen nicht aufhalten -- die sind wichtiger.
t('fehlt die Spalte noch, laeuft der Rest trotzdem',
  /Anmeldungen nicht ladbar/.test(m), 'ein fehlender Schritt kippt alles');

console.log('\n-- 7. Die Spalten --');
t('push_sent_at auf orders', /alter table public\.orders\s*\n\s*add column if not exists push_sent_at timestamptz/.test(sql), 'fehlt');
t('push_sent_at auf reservations', /alter table public\.reservations\s*\n\s*add column if not exists push_sent_at timestamptz/.test(sql), 'fehlt');
t('keine Regel wird angefasst',
  /create policy|drop policy|enable row level security/.test(sql) === false, 'fasst Regeln an');
// Sonst bekommt der Wirt beim ersten Durchlauf alle Altfaelle auf einmal.
t('bestehende Zeilen gelten als gemeldet',
  /update public\.orders\s*\n\s*set push_sent_at = now\(\)/.test(sql)
  && /update public\.reservations\s*\n\s*set push_sent_at = now\(\)/.test(sql), 'Altfaelle fluten das Handy');
t('mit Ruecknahme', /drop column if exists push_sent_at/.test(sql), 'keine Ruecknahme');
t('und der iPhone-Schritt steht auch in der Probe',
  /Zum Home-Bildschirm/.test(sql), 'Probe fuehrt in die Irre');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
