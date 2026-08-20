// DIE TOUR ERSCHEINT NUR AUF DER BLANKEN STARTSEITE.
//
// ANLASS
// "das endekete restaiurant neervt" -- gemeint ist die erste Folie der
// Onboarding-Tour ("Entdecke Restaurants"). Sie legte sich mit einem
// dunklen Schleier ueber JEDE Seite, auch ueber die Speisekarte, auf
// die ein Gast am Tisch gerade den QR-Code gescannt hat.
//
// WARUM DAS TEUER IST
// Der wichtigste Weg in diese App ist nicht die Startseite, sondern der
// QR-Code am Tisch: /rhodos/bestellen oder ?r=rhodos&tisch=7. Wer da
// landet, will die Karte -- und bekam stattdessen sechs Folien und
// einen "Weiter"-Knopf. Wegtippen ging nur ueber ein kleines graues
// "Ueberspringen"; wer das uebersah, klickte sich durch alle sechs.
// Jede Sekunde davor kostet Bestellungen.
//
// WAS DIESE DATEI FESTHAELT
//   1. Beim Direkteinstieg laeuft die Tour gar nicht erst an.
//   2. Sie wird dabei NICHT als "gesehen" abgehakt -- wer spaeter ueber
//      die Startseite kommt, soll sie noch bekommen koennen.
//   3. Tippen neben die Karte schliesst sie.
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

// ---- Die Entscheidung wirklich ausfuehren, nicht nur den Text lesen ----
// Ein Textvergleich haette den Fehler "pfad !== '/'" gegen "pfad === '/'"
// nicht gemerkt. Also die Funktion herausschneiden und laufen lassen.
function schnipsel(name) {
    var a = h.indexOf('function ' + name + '(');
    if (a < 0) throw new Error(name + ' nicht gefunden');
    var i = h.indexOf('{', a), tiefe = 0, j = i;
    for (; j < h.length; j++) {
        if (h[j] === '{') tiefe++;
        else if (h[j] === '}') { tiefe--; if (tiefe === 0) break; }
    }
    return h.slice(a, j + 1);
}

function direkt(pfad, frage) {
    var k = { window: { location: { pathname: pfad, search: frage || '' } } };
    k.String = String;
    vm.createContext(k);
    vm.runInContext(schnipsel('_direkterEinstieg') + '\n_direkterEinstieg();', k);
    return vm.runInContext('_direkterEinstieg()', k);
}

console.log('\n-- 1. Startseite: Tour ja --');
t('/ ist kein Direkteinstieg', direkt('/', '') === false, direkt('/', ''));
t('/index.html auch nicht', direkt('/index.html', '') === false, direkt('/index.html', ''));
t('und mit harmlosem Anhaengsel auch nicht',
  direkt('/', '?utm_source=insta') === false, direkt('/', '?utm_source=insta'));

console.log('\n-- 2. QR-Code am Tisch: Tour nein --');
// Das ist der Fall aus der Meldung.
t('?r=rhodos&tisch=7', direkt('/', '?r=rhodos&tisch=7') === true, 'Tour laeuft trotzdem');
t('nur ?r=rhodos', direkt('/', '?r=rhodos') === true, 'Tour laeuft trotzdem');
t('?tisch=7 allein', direkt('/', '?tisch=7') === true, 'Tour laeuft trotzdem');
t('?restaurant=... (alte Schreibweise)',
  direkt('/', '?restaurant=rhodos') === true, 'Tour laeuft trotzdem');
t('?table=7 (englisch)', direkt('/', '?table=7') === true, 'Tour laeuft trotzdem');
// Der Parameter darf auch hinten stehen.
t('&r= hinter etwas anderem',
  direkt('/', '?utm_source=qr&r=rhodos') === true, 'Tour laeuft trotzdem');

console.log('\n-- 3. Restaurant-Adressen: Tour nein --');
t('/rhodos', direkt('/rhodos', '') === true, 'Tour laeuft trotzdem');
t('/rhodos/bestellen', direkt('/rhodos/bestellen', '') === true, 'Tour laeuft trotzdem');
t('/rhodos/reservieren', direkt('/rhodos/reservieren', '') === true, 'Tour laeuft trotzdem');

console.log('\n-- 4. Kaputte Umgebung faellt nicht auf die Nase --');
// Ohne location darf die Funktion nicht werfen -- sonst bliebe
// showOnboarding stehen und die halbe Seite haette nichts.
var kaputt = { window: {}, String: String };
vm.createContext(kaputt);
var geworfen = false;
try { vm.runInContext(schnipsel('_direkterEinstieg') + '\n_direkterEinstieg();', kaputt); }
catch (e) { geworfen = true; }
t('ohne window.location wirft nichts', geworfen === false, 'wirft');

console.log('\n-- 5. showOnboarding fragt wirklich nach --');
var zeig = schnipsel('showOnboarding');
t('showOnboarding ruft _direkterEinstieg auf',
  /if \(_direkterEinstieg\(\)\) return;/.test(zeig), zeig.slice(0, 200));
// Reihenfolge zaehlt: erst pruefen, dann das Overlay anfassen.
t('und zwar bevor das Overlay geholt wird',
  zeig.indexOf('_direkterEinstieg()') < zeig.indexOf("getElementById('onboardingOverlay')"),
  'zu spaet');
// Nicht als gesehen abhaken: sonst bekaeme der Gast die Tour nie mehr,
// nur weil sein erster Besuch ueber einen QR-Code lief.
var bisAbbruch = zeig.slice(0, zeig.indexOf('_direkterEinstieg()') + 40);
t('beim Direkteinstieg wird kmi_onboarded NICHT gesetzt',
  bisAbbruch.indexOf("setItem('kmi_onboarded'") < 0, bisAbbruch);

console.log('\n-- 6. Neben die Karte tippen schliesst --');
var overlay = (h.match(/<div id="onboardingOverlay"[^>]*>/) || [''])[0];
t('das Overlay hat einen onclick', /onclick=/.test(overlay), overlay);
// event.target === this: nur der Schleier selbst, nicht die Karte darin.
// Ohne diese Bedingung wuerde jeder Klick auf "Weiter" die Tour zumachen.
t('nur der Schleier selbst, nicht die Karte',
  /event\.target===this/.test(overlay.replace(/\s+/g, '')), overlay);
t('und es ruft skipOnboarding', /skipOnboarding\(\)/.test(overlay), overlay);
// skipOnboarding haelt fest, dass die Tour erledigt ist -- hier ist das
// richtig, denn der Gast hat sie aktiv weggetippt.
t('skipOnboarding hakt sie ab',
  /function skipOnboarding\(\) \{ completeOnboarding\(\); \}/.test(h), 'anders verdrahtet');
t('completeOnboarding merkt sich das',
  /function completeOnboarding\(\)[\s\S]{0,120}setItem\('kmi_onboarded', 'true'\)/.test(h), 'merkt nichts');

console.log('\n-- 7. Von Hand aufrufbar bleibt sie --');
// Ueber das Menue kann man die Tour weiter starten -- reshowOnboarding
// geht absichtlich NICHT ueber showOnboarding, sonst wuerde sie auf
// einer Restaurantseite stumm bleiben.
t('reshowOnboarding gibt es weiter', /function reshowOnboarding\(\)/.test(h), 'weg');
var wieder = schnipsel('reshowOnboarding');
t('und haengt nicht an _direkterEinstieg',
  wieder.indexOf('_direkterEinstieg') < 0, wieder);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
