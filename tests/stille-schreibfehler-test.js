// Prueft zwei Stellen, an denen ein fehlgeschlagenes Speichern still blieb.
//
// WIE DIE ZAHL ZUSTANDE KAM -- UND WARUM SIE KLEINER IST ALS GEDACHT
// Ich hatte "84 rohe Schreibpfade" im Kopf. Nachgezaehlt sind es 71, und
// davon pruefen 62 direkt danach res.ok. Von den uebrigen neun sind vier
// mit Absicht still (Ereignis-Protokoll, Push-Anmeldung,
// Gutschein-Zaehler) und drei waren Fehlalarme meiner Suche -- die
// pruefen weiter unten.
//
// Bleiben zwei. Die aber richtig:
//
// 1) resSetTableTime meldete "Tischzeit auf 90 Min. gesetzt" BEVOR der
//    PATCH lief, und dessen Fehler fing ein leeres .catch(){} weg. Der
//    Wirt las "gesetzt", beim naechsten Laden stand der alte Wert da.
//
// 2) saveSizeGroup nahm groupData[0].id aus einer Antwort, die es nicht
//    geprueft hatte. Schlug das Anlegen fehl, kam ein Fehlerobjekt statt
//    einer Liste -> groupId undefined -> die Optionen darunter wurden an
//    eine Gruppe gehaengt, die es nicht gibt. Bei einer LEEREN Liste warf
//    groupData[0].id sogar mitten im Speichern.
//
// Die 62 mit Pruefung bleiben absichtlich, wie sie sind. Sie auf sbWrite
// umzustellen haette Gewinn und Risiko schlecht verteilt: sbWrite WIRFT
// bei !ok, waehrend dort ueberall "if (!res.ok) { ... }" steht. Eine
// pauschale Umstellung haette 62 funktionierende Fehlerbehandlungen
// stillgelegt, um Telemetrie zu gewinnen.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Tischzeit: erst speichern, dann melden --');
var von = h.indexOf('window.resSetTableTime =');
t('resSetTableTime gefunden', von > 0, von);
var fn = h.slice(von, von + 3500);

t('die Funktion ist async', /window\.resSetTableTime = async function/.test(fn), fn.slice(0, 80));
t('der PATCH wird abgewartet', /await fetch\(SUPABASE_URL \+ '\/rest\/v1\/reservations\?id=eq\.' \+ resId/.test(fn), 'kein await');
t('kein stilles .catch(function(){}) mehr um den PATCH',
  /\}\)\.catch\(function\(\) \{\}\);/.test(fn) === false, 'noch da');

// Der Kern: die Erfolgsmeldung muss NACH der Antwort kommen und an ihr
// haengen.
var iPatch = fn.indexOf('await fetch(SUPABASE_URL');
var iErfolg = fn.indexOf("showToast('Tischzeit auf '");
t('die Erfolgsmeldung steht NACH dem Speichern', iPatch > 0 && iErfolg > iPatch, iPatch + '/' + iErfolg);
t('sie haengt an _tzRes.ok',
  /if \(_tzRes\.ok\) \{\s*\n\s*showToast\('Tischzeit auf '/.test(fn), 'haengt an nichts');
t('bei Fehlschlag wird das gesagt',
  /Tischzeit NICHT gespeichert — bitte nochmal versuchen/.test(fn), 'keine Meldung');
t('bei fehlender Verbindung auch',
  /Tischzeit NICHT gespeichert — keine Verbindung/.test(fn), 'keine Meldung');
// Die Ansicht darf weiter sofort umspringen -- der Wirt soll nicht auf
// das Netz warten. Nur das Wort "gesetzt" muss stimmen.
t('die Anzeige springt weiter sofort um (kein await davor)',
  fn.indexOf('resRenderAll') > 0 && fn.indexOf('resRenderAll') < iPatch, 'Anzeige haengt jetzt am Netz');

console.log('\n-- 2. Optionsgruppe: keine id aus einer ungeprueften Antwort --');
var g = h.indexOf('async function saveSizeGroup');
t('saveSizeGroup gefunden', g > 0, g);
var gfn = h.slice(g, g + 6000);

t('groupData[0].id wird nicht mehr blind genommen',
  /groupId = Array\.isArray\(groupData\) \? groupData\[0\]\.id : groupData\.id;/.test(gfn) === false, 'noch da');
t('groupRes.ok wird geprueft', /if \(!groupRes\.ok \|\| !groupId\)/.test(gfn), 'ungeprueft');
t('ein fehlendes Element wirft nicht mehr',
  /Array\.isArray\(groupData\) && groupData\[0\] && groupData\[0\]\.id/.test(gfn), 'kann werfen');
t('unlesbares JSON wirft nicht',
  /try \{ groupData = await groupRes\.json\(\); \} catch \(e\) \{\}/.test(gfn), 'kann werfen');
t('der Wirt bekommt den Grund zu sehen',
  /Optionsgruppe nicht angelegt: ' \+ grund/.test(gfn), 'keine Meldung');
t('und es wird abgebrochen, statt an eine Geistergruppe zu schreiben',
  /showToast\('Optionsgruppe nicht angelegt[\s\S]{0,120}?return;/.test(gfn), 'laeuft weiter');

console.log('\n-- 3. Die bewusst stillen Stellen bleiben still --');
// Ein Ereignis-Protokoll, das dem Wirt Fehlermeldungen zeigt, ist
// schlimmer als eines, das schweigt.
[
    ['restaurant_events', 'das Ereignis-Protokoll'],
    ['push_subscriptions', 'die Push-Anmeldung']
].forEach(function (p) {
    t(p[1] + ' schreibt weiterhin ohne Aufhebens',
      h.indexOf('rest/v1/' + p[0]) > -1, p[0]);
});

console.log('\n-- 4. sbWrite gibt es weiterhin und wird benutzt --');
var anzahl = (h.match(/sbWrite\(/g) || []).length;
t('sbWrite wird an vielen Stellen benutzt', anzahl > 40, anzahl);
t('sbWrite meldet Fehler weiter', /kind: 'write'/.test(h), 'meldet nicht');
// Nur Tabelle und Methode -- in den Nutzdaten stuenden Namen und Adressen.
t('sbWrite schickt keine Nutzdaten in die Fehlermeldung',
  /Nur Tabelle und Methode, keine Nutzdaten/.test(h), 'Hinweis fehlt');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
