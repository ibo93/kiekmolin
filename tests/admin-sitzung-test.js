// DER ADMIN WAR FUER DIE DATENBANK EIN FREMDER.
//
// Der Passwort-Login (fuenf Klicks aufs Logo) setzte bis zum 21.08.2026
// nur einen Merker im Browser. Es entstand keine Supabase-Sitzung, und
// jede Abfrage danach lief mit dem oeffentlichen Schluessel -- Rolle
// "anon".
//
// Solange alle Tabellen offen standen, fiel das nicht auf. Genau
// deshalb fiel es nicht auf: der Fehler war unsichtbar, bis man
// zusperrt. Am 20.08. hat dieselbe Sorte Fehler bei den Wirten eine
// Stunde und einen halben Betriebstag gekostet.
//
// Diese Datei prueft die Reparatur -- und vor allem die Reihenfolge:
// die App muss live sein, BEVOR customers zugeht. Andersherum steht der
// Verwaltungsbereich leer da.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function ohneKommentar(s) { return s.split('\n').filter(function (z) { return !/^\s*--/.test(z); }).join('\n'); }

var h = fs.readFileSync(KMI + '/index.html', 'utf8');
var al = fs.readFileSync(KMI + '/netlify/functions/admin-login.js', 'utf8');
var s11 = fs.readFileSync(KMI + '/datenbank/11-customers-zumachen.sql', 'utf8');
var c11 = ohneKommentar(s11);

console.log('\n-- 1. Der Server gibt eine Sitzung heraus, kein Ja --');
t('Einmal-Token wird beim Auth-Dienst geholt',
  /auth\/v1\/admin\/generate_link/.test(al), 'kein generate_link');
t('als magiclink', /type:\s*'magiclink'/.test(al), 'anderer Typ');
t('und der Hash geht zurueck', /token_hash:\s*hash/.test(al), 'kein token_hash');
// Beide Ablagen pruefen -- je nach Version des Auth-Dienstes liegt der
// Hash oben oder unter "properties". Wer nur einen Weg prueft, baut
// einen Login, der nach einem Supabase-Update stillsteht.
t('beide Ablagen des Hashes werden geprueft',
  /link\.hashed_token/.test(al) && /properties && link\.properties\.hashed_token/.test(al),
  'nur ein Weg');

console.log('\n-- 2. Und gibt nicht mehr heraus als noetig --');
// Der fertige Link wuerde denselben Zugang per E-Mail-Weiterleitung
// verschenken; der Dienstschluessel waere das Ende.
t('kein fertiger Anmeldelink in der Antwort',
  /action_link/.test(al) === false, 'action_link wird herausgegeben');
t('kein Einmal-Passwort im Klartext',
  /email_otp/.test(al) === false, 'email_otp wird herausgegeben');
t('der Dienstschluessel bleibt drin',
  /SUPABASE_SERVICE_KEY/.test(al) && /json\(200[^)]*SUPABASE_KEY/.test(al) === false,
  'Dienstschluessel in der Antwort');

console.log('\n-- 3. Die Adresse steht in der Datenbank, nicht im Code --');
// AM 20.08.2026 GENAU HIER GESCHEITERT: in customers stand
// ibo@kiekmolin.de, angemeldet wurde sich mit ibo.kuran93@gmail.com.
// Wer die Adresse fest eintraegt, baut denselben Fehler wieder ein.
t('der Superadmin wird aus customers geholt',
  /customers\?select=email&role=eq\.superadmin/.test(al), 'nicht nachgeschlagen');
// Ohne Kommentare pruefen: im Kopf der Datei stehen beide Adressen
// absichtlich, weil dort erklaert wird, woran es am 20.08. lag.
var alCode = al.split('\n').filter(function (z) { return !/^\s*\/\//.test(z); }).join('\n');
t('keine feste E-Mail im Anmeldeweg',
  /ibo@kiekmolin\.de|ibo\.kuran93@gmail\.com/.test(alCode) === false, 'fest eingetragen');
t('ohne Superadmin-Zeile wird NICHT durchgewunken',
  /Kein Superadmin hinterlegt/.test(al), 'winkt durch');
t('und die App uebernimmt die Adresse vom Server',
  /adminDashboardOeffnen\(\{ name: 'Ibo', email: data\.email/.test(h), 'setzt eigene');

console.log('\n-- 4. Halb angemeldet gibt es nicht --');
// Ein Dashboard ohne Sitzung sieht bei zugesperrten Tabellen leer aus.
// Ein leeres Dashboard liest sich wie Datenverlust -- diese
// Verwechslung hat am 20.08. eine Stunde gekostet.
t('die App tauscht den Token gegen eine Sitzung',
  /supabaseClient\.auth\.verifyOtp/.test(h), 'kein Tausch');
t('und prueft, ob wirklich eine entstanden ist',
  /angemeldet = !!\(erg && erg\.data && erg\.data\.session\)/.test(h), 'ungeprueft');
// AM 21.08.2026 ZURUECKGENOMMEN -- NACH EINER WEISSEN SEITE.
//
// Hier stand die Forderung: ohne Sitzung gar nicht erst aufmachen.
// Der Gedanke war richtig, nur zu frueh. Solange die Tabellen offen
// stehen, kommt das Dashboard mit dem oeffentlichen Schluessel bestens
// zurecht. Wer in dieser Lage den Einlass an die Sitzung knuepft, macht
// aus einem Zusatznutzen eine Bedingung -- und sperrt bei jedem
// Schluckauf den Betreiber aus seinem eigenen Verwaltungsbereich aus.
//
// Bedingung wird die Sitzung erst, wenn customers wirklich zu ist. Dann
// steht sie in 11-customers-zumachen.sql als Vorbedingung.
t('der Passwort-Weg fuehrt IMMER ins Dashboard',
  /if \(!angemeldet\) \{\s*\n\s*adminDashboardOeffnen\(/.test(h), 'sperrt aus');
t('bei geglueckter Sitzung baut nur der Zuhoerer auf, nicht beide',
  /Ein zweiter Aufbau waere ein Rennen gegen sich selbst/.test(h), 'baut doppelt auf');
// Und der Aufbau selbst darf nirgends mittendrin abbrechen: die
// Gastansicht ist da schon versteckt.
t('der Aufbau stolpert nicht ueber fehlende Umschalt-Knoepfe',
  /var _um = document\.querySelectorAll\('\.toggle-btn'\);/.test(h)
  && /if \(_um\[0\]\) _um\[0\]/.test(h)
  && /if \(_um\[1\]\) _um\[1\]/.test(h), 'kann weisse Seite hinterlassen');
t('scheitert die Sitzung, kommt kein ok:true vom Server',
  /Anmeldung nicht moeglich/.test(al), 'halber Erfolg moeglich');

console.log('\n-- 5. Schritt 11 schliesst die Luecke, die 09 offen liess --');
// customers entscheidet, WER zu WELCHEM Betrieb gehoert. Solange dort
// jeder schreiben darf, laesst sich Schritt 09 in vier Zeilen
// aushebeln: fremde restaurant_id eintragen, mit Google anmelden,
// fertig.
t('die Notregel "offen" faellt weg',
  /drop policy if exists "offen" on public\.customers/.test(c11), 'bleibt liegen');
t('RLS wird eingeschaltet',
  /alter table public\.customers enable row level security/.test(c11), 'kein Schalter');
['select', 'insert', 'update', 'delete'].forEach(function (art) {
    t('Regel fuer ' + art.toUpperCase(),
      new RegExp('for ' + art + '\\b', 'i').test(c11), 'fehlt');
});
t('die eigene Zeile bleibt lesbar -- sonst kommt keiner ins Dashboard',
  /for select[\s\S]{0,200}lower\(trim\(email\)\) = public\.kmi_email\(\)/.test(c11), 'zu eng');
t('loeschen darf nur der Superadmin',
  /for delete[\s\S]{0,120}using \(public\.kmi_ist_superadmin\(\)\)/.test(c11), 'zu weit');

console.log('\n-- 6. Die Zuordnung zaehlt erst nach Freischaltung --');
// kmi_meine_haeuser() fragte nur nach email und restaurant_id. Eine
// Zeile, die noch niemand freigeschaltet hat, zaehlte damit schon.
t('is_active ist Bedingung geworden',
  /kmi_meine_haeuser[\s\S]{0,700}?c\.is_active is true/.test(c11), 'zaehlt auch pending');
t('und die Rolle auch',
  /kmi_meine_haeuser[\s\S]{0,800}?c\.role in \('restaurant', 'superadmin'\)/.test(c11), 'jede Rolle zaehlt');

console.log('\n-- 7. Rolle und Zuordnung sind festgenagelt --');
// In "with check" kommt man an den alten Wert nicht heran -- eine Regel
// allein kann also nicht sehen, dass jemand seine eigene Rolle gerade
// hochsetzt. Dafuer braucht es einen Ausloeser.
t('es gibt einen Ausloeser',
  /create trigger kmi_rolle_schuetzen[\s\S]{0,160}on public\.customers/.test(c11), 'kein Trigger');
t('er greift vor INSERT und vor UPDATE',
  /before insert or update on public\.customers/.test(c11), 'zu spaet oder zu schmal');
t('der Dienstschluessel darf vorbei -- er laeuft auf dem Server',
  /service_role[\s\S]{0,60}return new/.test(c11), 'Netlify-Funktionen blockiert');
t('eine Anmeldung darf hoechstens "restaurant" sein',
  /new\.role := case when new\.role = 'restaurant' then 'restaurant' else null end/.test(c11),
  'freie Rollenwahl');
t('und kommt immer auf pending',
  /new\.is_active := false/.test(c11), 'schaltet sich selbst frei');
t('bei UPDATE bleiben die drei Felder, wie sie waren',
  /new\.role\s+:= old\.role/.test(c11)
  && /new\.restaurant_id := old\.restaurant_id/.test(c11)
  && /new\.is_active\s+:= old\.is_active/.test(c11), 'aenderbar');

console.log('\n-- 8. Die Reihenfolge steht in der Datei --');
// Laeuft 11 vor dem Deploy, steht der Verwaltungsbereich leer. Das
// steht nicht als Nebensatz da, sondern als eigener Abschnitt.
t('Ruecknahme steht ganz oben',
  s11.indexOf('disable row level security') < s11.indexOf('enable row level security'),
  'erst unten');
t('die Warnung, dass die App zuerst live sein muss',
  /ZUERST mergen und Netlify bauen lassen/.test(s11), 'keine Warnung');
t('Pruefen kommt vor Zumachen',
  s11.indexOf('TEIL A -- ERST PRUEFEN') < s11.indexOf('TEIL D -- DIE REGELN'), 'falsch herum');
t('Teil A aendert nichts',
  /alter table|create policy|drop policy/.test(
      ohneKommentar(s11.slice(s11.indexOf('TEIL A'), s11.indexOf('TEIL B')))) === false,
  'Teil A schreibt');
t('und fragt ab, wem Teil B den Zugang naehme',
  /is_active is distinct from true/.test(s11), 'keine Vorabprobe');
t('die Proben danach gehoeren in den Browser',
  /DREI PROBEN IM BROWSER/.test(s11), 'keine Gegenprobe');
t('was offen bleibt, steht auch da',
  /WAS DANACH NOCH OFFEN BLEIBT/.test(s11), 'tut so als waere alles fertig');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
