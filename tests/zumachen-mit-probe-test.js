// Prueft die beiden SQL-Dateien, mit denen das Zumachen der Gaestedaten
// ein zweites Mal versucht wird -- nachdem der erste Versuch den Betrieb
// lahmgelegt hat.
//
// WAS BEIM ERSTEN MAL SCHIEFGING
// datenbank/04 hat alle vier Tabellen auf einmal zugemacht. Danach kamen
// im Dashboard keine Bestellungen und Reservierungen mehr an. Weil alles
// gleichzeitig umgestellt wurde, war nicht erkennbar, welche Tabelle
// schuld war -- und der Laden stand, waehrend wir suchten.
//
// Mein eigentlicher Fehler war aber die Gegenprobe: sie testete, ob der
// GAST noch klarkommt. Ob die WIRTE noch an ihre Bestellungen kommen,
// stand nirgends drin.
//
// DAHER JETZT ZWEI DATEIEN
//   06-erst-pruefen.sql        rechnet VORHER aus, was jeder Wirt nach
//                              dem Zumachen saehe. Aendert nichts.
//   07-eine-nach-der-anderen.sql  schaltet um -- eine Tabelle pro
//                              Abschnitt, jede mit eigener Ruecknahme.

var fs = require('fs');
var path = require('path');
var D = path.join(__dirname, '..', 'datenbank');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function ohneKommentar(s) { return s.split('\n').filter(function (z) { return !/^\s*--/.test(z); }).join('\n'); }

var s06 = fs.readFileSync(D + '/06-erst-pruefen.sql', 'utf8');
var c06 = ohneKommentar(s06);
var s08 = fs.readFileSync(D + '/08-nur-die-drei.sql', 'utf8');
var c08 = ohneKommentar(s08);
var s07 = fs.readFileSync(D + '/07-eine-nach-der-anderen.sql', 'utf8');
var c07 = ohneKommentar(s07);

console.log('\n-- 1. Schritt 06 aendert wirklich nichts an den Rechten --');
// Das ist die ganze Zusage dieser Datei. Steht dort ein enable/create
// policy, ist sie nicht mehr harmlos und jemand fuehrt sie im
// Vertrauen darauf aus.
t('kein "enable row level security"',
  /enable\s+row\s+level\s+security/i.test(c06) === false, 'schaltet doch um');
t('keine create policy', /create\s+policy/i.test(c06) === false, 'legt Regeln an');
t('keine drop policy', /drop\s+policy/i.test(c06) === false, 'loescht Regeln');
t('kein delete/update/truncate auf Daten',
  /^\s*(delete|truncate)\b/im.test(c06) === false, 'aendert Daten');
t('nur Funktionen und Abfragen',
  /create or replace function/i.test(c06) && /select/i.test(c06), 'nichts drin');

console.log('\n-- 2. Die Helfer sind nachsichtig geworden --');
// Vorher wurde die Rolle buchstabengenau mit 'superadmin' verglichen.
// Steht in der Datenbank 'Superadmin' oder 'superadmin ' mit
// Leerzeichen, greift die Regel nicht -- und niemand sieht, warum.
t('Rolle wird klein und ohne Raender verglichen',
  /lower\(trim\(coalesce\(c\.role, ''\)\)\) = 'superadmin'/.test(c06), 'noch buchstabengenau');
t('E-Mail ebenso',
  /lower\(trim\(c\.email\)\) = lower\(trim\(coalesce\(p_email, ''\)\)\)/.test(c06), 'noch streng');
t('kmi_email trimmt jetzt auch',
  /lower\(trim\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\)\)/.test(c06), 'ohne trim');

console.log('\n-- 3. Die Helfer sind pruefbar geworden --');
// Im SQL-Editor ist man Datenbank-Besitzer, nicht der Wirt. auth.jwt()
// ist dort leer. Ohne eine Fassung, die eine E-Mail entgegennimmt,
// laesst sich VORHER gar nicht ausrechnen, was ein Wirt sehen wuerde.
['kmi_ist_superadmin_fuer', 'kmi_meine_haeuser_fuer'].forEach(function (f) {
    t(f + ' nimmt eine E-Mail entgegen',
      new RegExp('function public\\.' + f + '\\(p_email text\\)').test(c06), f);
});
t('kmi_ist_superadmin reicht nur noch durch',
  /kmi_ist_superadmin\(\)[\s\S]{0,300}?kmi_ist_superadmin_fuer\(public\.kmi_email\(\)\)/.test(c06),
  'doppelte Logik');
t('kmi_meine_haeuser ebenso',
  /kmi_meine_haeuser\(\)[\s\S]{0,300}?kmi_meine_haeuser_fuer\(public\.kmi_email\(\)\)/.test(c06),
  'doppelte Logik');

console.log('\n-- 4. Alle Helfer sind sicher gebaut --');
// Ohne security definer laufen sie gegen die RLS der Tabellen, die
// dieses Skript gerade zumacht. Ohne festen search_path koennte jemand
// mit eigenem Schema eine falsche customers-Tabelle unterschieben.
var funktionen = c06.match(/create or replace function[\s\S]*?\$\$;/g) || [];
t('es gibt fuenf Helfer', funktionen.length === 5, funktionen.length);
funktionen.forEach(function (f) {
    var name = (f.match(/function public\.([a-z_]+)/) || [])[1] || '?';
    t(name + ': security definer', /security definer/.test(f), f.slice(0, 120));
    t(name + ': fester search_path', /set search_path = public, pg_temp/.test(f), f.slice(0, 200));
    t(name + ': stable', /\bstable\b/.test(f), f.slice(0, 120));
});

console.log('\n-- 5. Die Vorher-Rechnung beantwortet die richtige Frage --');
// Das ist der Kern. Sie muss BEIDES nebeneinander zeigen: was die Regel
// durchliesse und was tatsaechlich da ist. Nur eins von beidem hilft
// nicht -- genau daran ist Schritt 04 gescheitert.
t('zeigt, was sichtbar waere', /sichtbar_bestellungen/.test(c06), 'fehlt');
t('zeigt, was vorhanden ist', /vorhanden_bestellungen/.test(c06), 'fehlt');
t('beides auch fuer Reservierungen',
  /sichtbar_reservierungen/.test(c06) && /vorhanden_reservierungen/.test(c06), 'fehlt');
t('rechnet mit derselben Bedingung wie die spaetere Regel',
  /o\.restaurant_id in \(select public\.kmi_meine_haeuser_fuer\(c\.email\)\)/.test(c06), 'andere Logik');
t('sucht verwaiste Bestellungen ohne Wirt',
  /not exists \(select 1 from public\.customers c/.test(c06), 'fehlt');
t('die Abbruchbedingung steht als Klartext dabei',
  /DANN NICHT ZUMACHEN/.test(s06), 'keine Warnung');

console.log('\n-- 6. Der Browser-Gegentest ist beschrieben --');
// Die Tabelle rechnet mit E-Mails aus customers. Womit sich ein Wirt
// TATSAECHLICH anmeldet, weiss sie nicht -- da war moeglicherweise der
// Bruch.
t('erklaert, dass auth.jwt() im SQL-Editor leer ist',
  /auth\.jwt\(\) ist dort leer|auth\.jwt\(\) ist hier leer/.test(s06), 'fehlt');
t('gibt den Konsolen-Aufruf an', /rpc\/kmi_email/.test(s06), 'fehlt');
t('sagt, was zu tun ist wenn die Adresse abweicht',
  /update customers set email/.test(s06), 'kein Ausweg');

console.log('\n-- 7. Schritt 07 geht Tabelle fuer Tabelle --');
t('vier Abschnitte', (s07.match(/^-- ABSCHNITT \d/gm) || []).length === 4,
  (s07.match(/^-- ABSCHNITT \d/gm) || []).length);
t('die Warnung steht ganz oben', /NICHT AM STUECK AUSFUEHREN/.test(s07.slice(0, 900)), 'fehlt');
t('order_items kommt zuerst (kleinster Schaden)',
  s07.indexOf('ABSCHNITT 1 -- order_items') > 0
  && s07.indexOf('ABSCHNITT 1 -- order_items') < s07.indexOf('ABSCHNITT 3 -- orders'), 'falsche Reihenfolge');
t('customers kommt zuletzt (groesster Schaden)',
  s07.indexOf('ABSCHNITT 4 -- customers') > s07.indexOf('ABSCHNITT 3 -- orders'), 'falsche Reihenfolge');

console.log('\n-- 8. Jeder Abschnitt hat seine Reissleine --');
['order_items', 'reservations', 'orders', 'customers'].forEach(function (tab) {
    t(tab + ': Ruecknahme steht als Kommentar dabei',
      new RegExp('Ruecknahme:\\s+alter table public\\.' + tab + ' disable row level security;').test(s07),
      tab);
    t(tab + ': wird am Ende des Abschnitts eingeschaltet',
      new RegExp('alter table public\\.' + tab + ' enable row level security;').test(c07), tab);
    t(tab + ': alte Regeln werden restlos weggeraeumt',
      new RegExp("tablename = '" + tab + "'[\\s\\S]{0,200}?drop policy %I on public\\." + tab).test(c07), tab);
});

console.log('\n-- 9. Nach jedem Abschnitt wird geprueft --');
t('es gibt Pruef-Listen zwischen den Abschnitten',
  (s07.match(/JETZT PRUEFEN/g) || []).length >= 3, (s07.match(/JETZT PRUEFEN/g) || []).length);
t('und sie pruefen den WIRT, nicht nur den Gast',
  /Dashboard/.test(s07) && /Bestellung annehmen/.test(s07), 'nur Gastseite');
t('die Vorbedingung aus 06 steht drin',
  /sichtbar_bestellungen = vorhanden_bestellungen/.test(s07), 'keine Vorbedingung');

console.log('\n-- 10. Bestellen und reservieren bleibt moeglich --');
// Ohne diese drei Regeln kann kein Gast mehr bestellen. Das waere kein
// Datenschutz, das waere ein kaputter Laden.
[['orders', 'bestellen'], ['order_items', 'Positionen anlegen'], ['reservations', 'reservieren']]
.forEach(function (p) {
    var re = new RegExp('on public\\.' + p[0] + ' for insert to anon, authenticated');
    t(p[0] + ': Gaeste duerfen weiter ' + p[1], re.test(c07), p[0]);
});
t('customers: Anlegen nur angemeldet',
  /on public\.customers for insert to authenticated/.test(c07)
  && /on public\.customers for insert to anon/.test(c07) === false, 'anon darf anlegen');

console.log('\n-- 10b. Die Rollensperre -- sonst ist alles umsonst --');
// GEFUNDEN BEIM DURCHLESEN VOR DEM AUSFUEHREN.
//
// Abschnitt 4 hatte:
//     create policy "Angemeldete legen ihre Kundenzeile an"
//         on public.customers for insert to authenticated
//         with check (true);
//
// kmi_ist_superadmin() fragt customers.role ab. Wer sich anmelden kann
// -- und das kann jeder mit einem Google-Konto -- haette sich eine
// Zeile mit der eigenen E-Mail und role = 'superadmin' angelegt und
// danach JEDE Bestellung, JEDE Reservierung und JEDEN Kunden gelesen.
// Dasselbe ueber UPDATE: role gehoert zur eigenen Zeile.
//
// Mit Regeln allein ist das nicht dicht: in with check kommt man an den
// ALTEN Wert nicht heran. Also ein Ausloeser.
t('es gibt einen Ausloeser fuer die Rolle',
  /create or replace function public\.kmi_rolle_schuetzen\(\)/.test(c07), 'fehlt');
t('er haengt an customers, vor Anlegen UND Aendern',
  /before insert or update on public\.customers/.test(c07), 'nicht verdrahtet');
t('und wird vorher sauber abgeraeumt',
  /drop trigger if exists kmi_rolle_schuetzen on public\.customers;/.test(c07), 'kein drop');
t('beim Anlegen wird die Rolle geleert',
  /if tg_op = 'INSERT' then[\s\S]{0,200}?new\.role := null;[\s\S]{0,80}?new\.restaurant_id := null;/.test(c07),
  'Rolle bleibt setzbar');
t('beim Aendern bleibt sie, wie sie war',
  /new\.role := old\.role;[\s\S]{0,80}?new\.restaurant_id := old\.restaurant_id;/.test(c07),
  'Rolle bleibt aenderbar');

// DREI WEGE MUESSEN DURCH -- sonst sperrt die Sperre den Betrieb aus.
// Der SQL-Editor hat kein Anmelde-Token: ohne diese Zeile wuerde sich
// der Superadmin beim Anlegen eines Wirts dessen Rolle selbst
// wegloeschen.
t('der SQL-Editor kommt durch', /if auth\.jwt\(\) is null then return new; end if;/.test(c07),
  'sperrt den Editor aus');
// Der Dienstschluessel geht an RLS vorbei, aber NICHT an Ausloesern.
t('der Dienstschluessel kommt durch',
  /auth\.jwt\(\) ->> 'role', ''\) = 'service_role' then return new/.test(c07),
  'sperrt die Netlify-Funktionen aus');
t('und der echte Superadmin auch',
  /if public\.kmi_ist_superadmin\(\) then return new; end if;/.test(c07), 'sperrt dich aus');

// Anlegen nur mit der eigenen Adresse -- sonst legt jemand Zeilen auf
// fremde E-Mails an und kommt ueber die Stammkundenkarte an fremde
// Daten.
t('angelegt wird nur die eigene Zeile',
  /create policy "Angemeldete legen ihre eigene Kundenzeile an"[\s\S]{0,300}?lower\(trim\(email\)\) = public\.kmi_email\(\)/.test(c07),
  'with check (true) ist zurueck');
t('kein "with check (true)" mehr bei customers',
  /for insert to authenticated\s*\n\s*with check \(true\);/.test(c07) === false, 'wieder offen');

// Der Ausloeser gehoert auch in die Gegenprobe -- sonst merkt niemand,
// wenn er spaeter abgeschaltet wird.
t('die Gegenprobe fragt den Ausloeser ab',
  /from pg_trigger[\s\S]{0,200}?kmi_rolle_schuetzen/.test(c07), 'nicht abgefragt');
// Die Browser-Probe steht als Anleitung im Kommentar -- also gegen die
// ungefilterte Fassung pruefen.
t('und es gibt eine Probe aus dem Browser',
  /role: 'superadmin'[\s\S]{0,400}?role steht weiter auf null/.test(s07), 'keine Probe');

console.log('\n-- 11. Lesen ist ueberall zu --');
var leseRegeln = c07.split('create policy').slice(1).filter(function (b) { return /\bfor select\b/.test(b); });
t('vier Leseregeln', leseRegeln.length === 4, leseRegeln.length);
leseRegeln.forEach(function (b) {
    var name = (b.match(/"([^"]+)"/) || [])[1] || '?';
    t('"' + name + '" gilt nicht fuer anon',
      /to authenticated\b/.test(b) && /\banon\b/.test(b) === false, b.slice(0, 140));
    t('"' + name + '" hat eine Bedingung',
      /using \(/.test(b) && /using \(\s*true\s*\)/.test(b) === false, b.slice(0, 200));
});

console.log('\n-- 12. Die Probe aufs Exempel steht am Ende --');
t('als nicht angemeldeter Gast Namen abfragen',
  /select=customer_name/.test(s07) && /LEERE Liste/.test(s07), 'fehlt');
t('und die Regeln lassen sich auflisten',
  /from pg_policies/.test(c07), 'keine Gegenprobe');

console.log('\n-- 12. Schritt 08: die drei mit den Gaestedaten, ohne customers --');
// WARUM ES DIESE DATEI GIBT.
// 07 Abschnitt 4 (customers) ist der gefaehrlichste: daran haengt
// checkIfGastronom(), also wer ueberhaupt ins Dashboard darf. Steht dort
// eine andere E-Mail als die, mit der sich der Wirt anmeldet, sperrt er
// sich selbst aus. Der Konsolen-Test aus 06 war noch nicht gelaufen.
//
// Also erst das Sichere. Die Gaestedaten -- Name, Telefon, Adresse --
// stehen in orders, order_items und reservations. customers enthaelt die
// Betreiberkonten (sechs Zeilen) und kann warten.
t('die Datei gibt es', s08.length > 500, s08.length);

// DAS WICHTIGSTE: customers darf NICHT angefasst werden. Eine einzige
// Zeile zuviel, und der Wirt steht vor verschlossener Tuer.
t('customers wird NICHT zugemacht',
  /alter table public\.customers enable row level security/.test(c08) === false, 'doch angefasst');
t('und bekommt auch keine Regeln',
  /on public\.customers/.test(c08) === false, 'doch Regeln');
t('customers kommt nur in Erklaerungen vor',
  c08.indexOf('customers') < 0, 'im Code erwaehnt');

// Genau drei Tabellen, nicht mehr und nicht weniger.
var zu = (c08.match(/alter table public\.([a-z_]+) enable row level security/g) || [])
    .map(function (z) { return z.replace(/.*public\.([a-z_]+).*/, '$1'); });
t('genau drei Tabellen werden zugemacht', zu.length === 3, zu);
['order_items', 'reservations', 'orders'].forEach(function (tab) {
    t('  dabei: ' + tab, zu.indexOf(tab) > -1, zu);
});
// Reihenfolge nach Schadensgroesse -- order_items zuerst, orders zuletzt.
// Beim ersten Versuch lief alles auf einmal, und als es schiefging war
// unklar, welche Tabelle schuld war.
t('in der Reihenfolge kleinster Schaden zuerst',
  zu.join(',') === 'order_items,reservations,orders', zu);

// Gaeste muessen weiter bestellen und reservieren koennen -- sonst ist
// zwar alles dicht, aber der Laden steht.
['orders', 'order_items', 'reservations'].forEach(function (tab) {
    var re = new RegExp('on public\\.' + tab + ' for insert to anon, authenticated');
    t('Gaeste duerfen weiter schreiben: ' + tab, re.test(c08), 'zu');
});
// Und Lesen ist ueberall zu.
['orders', 'order_items', 'reservations'].forEach(function (tab) {
    var re = new RegExp('on public\\.' + tab + ' for select to anon');
    t('Lesen ist zu: ' + tab, re.test(c08) === false, 'noch offen fuer anon');
});

// Jeder Abschnitt braucht seine Reissleine -- und zwar sichtbar, nicht
// im Kopf des Skripts vergraben.
['order_items', 'reservations', 'orders'].forEach(function (tab) {
    var re = new RegExp('Ruecknahme:\\s+alter table public\\.' + tab + ' disable row level security;');
    t('Reissleine dabei: ' + tab, re.test(s08), 'fehlt');
});
t('nach jedem Abschnitt wird geprueft',
  (s08.match(/JETZT PRUEFEN/g) || []).length >= 3,
  (s08.match(/JETZT PRUEFEN/g) || []).length);

// Die Gegenprobe zaehlt 12 Regeln -- 4 pro Tabelle.
t('12 Regeln im Skript', (c08.match(/^create policy /gm) || []).length === 12,
  (c08.match(/^create policy /gm) || []).length);
t('die Gegenprobe erwartet dieselbe Zahl', /Erwartet: 12 Regeln/.test(s08), 'andere Zahl');
t('und fragt customers nicht mit ab',
  /tablename in \('orders','order_items','reservations'\)/.test(c08), 'fragt zuviel');

// Die harte Probe: als Fremder die Telefonnummern holen wollen.
t('die Probe von aussen ist beschrieben',
  /select=customer_name,customer_phone/.test(s08), 'fehlt');
t('mit der erwarteten leeren Liste',
  /ERWARTET: eine leere Liste/.test(s08), 'ohne Erwartung');
t('und dem Hinweis auf Chromes Einfuege-Sperre',
  /allow pasting/.test(s08), 'fehlt');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
