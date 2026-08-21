// AM HANDY KAM NIE DAS ANMELDEFORMULAR.
//
// Gemeldet vom Betreiber am 21.08.2026:
//   "die sollen den formular anmelden wie im mac alles ausfuellen ich
//    schalte den frei...auf dem handy kommt nur google anmeldung"
//
// DER ABLAUF, DER NIE FUNKTIONIERT HAT
//   1. "Fuer Gastronomen" antippen
//   2. noch nicht angemeldet -> Merker setzen, Anmeldefenster auf
//   3. Google-Anmeldung
//   4. danach soll das Formular kommen
//
// Dazwischen liegt signInWithOAuth mit redirectTo. Das ist keine
// Popup-Anmeldung, sondern eine echte Weiterleitung: die Seite geht zu
// Google und kommt als NEU GELADENE Seite zurueck. window._pending-
// Registration war eine gewoehnliche Variable -- nach dem Neuladen weg.
// Der Zweig, der das Formular oeffnet, wurde also nie erreicht.
//
// WARUM ES SO LANGE UNBEMERKT BLIEB
// Auf dem Rechner des Betreibers lag eine Anmeldung. Dann greift die
// Weiche in startRestaurantRegistration() gar nicht und das Formular
// kommt sofort. Der Fehler zeigt sich NUR beim ersten Mal auf einem
// fremden Geraet -- also bei genau den Leuten, fuer die das Formular da
// ist.

var fs = require('fs');
var path = require('path');
var h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Der Merker uebersteht das Neuladen --');
t('er liegt in localStorage, nicht nur im Arbeitsspeicher',
  /localStorage\.setItem\(KMI_REG_MERKER/.test(h), 'nur Variable');
t('und wird von dort auch wieder gelesen',
  /localStorage\.getItem\(KMI_REG_MERKER\)/.test(h), 'wird nie gelesen');
// sessionStorage reicht nicht: die Rueckkehr von Google kann je nach
// Geraet in einem anderen Tab landen.
t('kein sessionStorage fuer diesen Merker',
  /sessionStorage[^\n]*REG_MERKER|REG_MERKER[^\n]*sessionStorage/.test(h) === false,
  'ueberlebt den Tab-Wechsel nicht');

console.log('\n-- 2. Er bleibt nicht ewig liegen --');
// Ein Merker, der wochenlang liegt, setzt irgendwann jemandem das
// Anmeldeformular vor die Nase, der sich nur einloggen wollte.
t('mit Zeitstempel gespeichert',
  /localStorage\.setItem\(KMI_REG_MERKER, String\(Date\.now\(\)\)\)/.test(h), 'ohne Zeit');
t('und einer Frist', /KMI_REG_GILT_MS\s*=\s*10 \* 60 \* 1000/.test(h), 'keine Frist');
t('die beim Abholen auch geprueft wird',
  /Date\.now\(\) - Number\(seit\)\) < KMI_REG_GILT_MS/.test(h), 'Frist wird ignoriert');

console.log('\n-- 3. Abgeholt wird genau einmal --');
// Zwei Wege koennen ihn abholen: der Anmelde-Zuhoerer und das Netz in
// handleOAuthRedirect. Wer zweiter ist, darf nichts mehr finden --
// sonst geht das Formular doppelt auf.
t('beim Abholen wird geloescht',
  /function regWunschAbholen\(\)[\s\S]{0,400}?regWunschLoeschen\(\);[\s\S]{0,200}?return \(Date\.now/.test(h),
  'bleibt liegen');
t('und auch im Kurzschluss-Fall geloescht',
  /if \(window\._pendingRegistration\) \{ window\._pendingRegistration = false; regWunschLoeschen\(\);/.test(h),
  'nur die Variable zurueckgesetzt');
t('wer schon angemeldet ist, braucht ihn nicht mehr',
  /\/\/ Angemeldet -- der Merker hat seinen Zweck erfuellt\.\s*\n\s*regWunschLoeschen\(\);/.test(h),
  'bleibt liegen');

console.log('\n-- 4. Nach der Rueckkehr von Google oeffnet das Formular --');
t('der Anmelde-Zweig holt den Merker ab',
  /if \(regWunschAbholen\(\)\) \{[\s\S]{0,160}?startRestaurantRegistration\(\)/.test(h), 'kein Abholen');
// Je nach Fassung der Bibliothek meldet die Rueckkehr SIGNED_IN oder
// INITIAL_SESSION. Beim zweiten feuert der Zweig oben nicht.
t('und es gibt ein Netz beim OAuth-Rueckweg',
  /RUECKFALL FUER DEN REGISTRIERUNGS-WUNSCH/.test(h), 'kein Netz');
t('das Netz wartet, bis eine Anmeldung dasteht',
  /if \(!currentUser \|\| !currentUser\.email\) return;/.test(h), 'kann Anmeldefenster doppelt oeffnen');

console.log('\n-- 5. Das Formular selbst ist noch vollstaendig --');
// Was der Wirt ausfuellen soll -- wenn hier eines fehlt, kommt eine
// Anmeldung ohne die Angaben an, die zum Freischalten noetig sind.
['regRestaurantName', 'regOwnerName', 'regRestaurantPhone', 'regRestaurantEmail',
 'regRestaurantStreet', 'regRestaurantZip', 'regRestaurantCity',
 'regRestaurantCuisine'].forEach(function (id) {
    t('Feld vorhanden: ' + id,
      new RegExp('id="' + id + '"').test(h), 'fehlt');
});
t('die Anmeldung kommt auf pending, nicht sofort aktiv',
  /is_active: false,\s*\n\s*role: 'restaurant'/.test(h), 'schaltet sich selbst frei');
t('und der Wirt sieht danach den Warte-Bildschirm',
  /showPendingApprovalScreen\(restaurantName\)/.test(h), 'keine Rueckmeldung');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
