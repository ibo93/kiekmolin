// SPALTENNAMEN, DIE ES NICHT GIBT.
//
// GEFUNDEN AUF EINEM BILDSCHIRMFOTO DES WIRTS.
// Er hatte die Konsole fuer etwas ganz anderes offen, und darin stand
// zwanzigmal:
//
//     GET /rest/v1/events?select=id,is_featured,date  ->  400
//     column events.date does not exist
//
// Die Spalte heisst event_date. An sechs Stellen im Haus steht das auch
// richtig -- an genau einer nicht.
//
// WARUM DAS NIEMANDEM AUFFIEL
// sbRead wirft bei 400, der umgebende catch-Block schreibt eine Zeile in
// die Konsole, und danach ist Schluss: die drei updateEl() darunter
// laufen nie. Auf dem Dashboard stehen die Event-Zahlen also gar nicht
// erst -- keine Fehlermeldung, kein Absturz, nur eine Zahl, die nicht
// stimmt. Das ist die unangenehmste Sorte Fehler: sie sieht aus wie
// eine Antwort.
//
// Diese Datei prueft, dass Lesen und Schreiben denselben Namen benutzen.
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

console.log('\n-- 1. Der gefundene Fehler ist behoben --');
t('events wird mit event_date gelesen',
  /events\?select=id,is_featured,event_date/.test(h), 'noch falsch');
t('und nirgends mehr mit "date"',
  /events\?select=[^`'"]*[,=]date(?![_a-z])/.test(h) === false, 'noch eine Stelle');
t('auch die Auswertung nutzt event_date',
  /upcomingEvents = eventsArray\.filter\(e => new Date\(e\.event_date\)/.test(h), 'liest e.date');
t('der Grund steht im Quelltext',
  h.indexOf('Die Spalte heisst event_date, nicht date') > -1, 'keine Begruendung');

console.log('\n-- 2. Gelesen wird nur, was auch geschrieben wird --');
// Fuer jede Tabelle: welche Spalten holt die App per select, und welche
// tauchen sonst irgendwo im Haus auf (als Feld beim Speichern, als
// Eigenschaft beim Lesen, in einem Filter)? Ein Name, den es NUR im
// select gibt, ist verdaechtig -- genau so sah events.date aus.
var GEWOLLT_UNBEKANNT = {
    // Hier nichts. Wird ein Eintrag noetig, gehoert die Begruendung
    // daneben -- sonst wird diese Liste zum Teppich, unter den man
    // kehrt.
};
var abfragen = h.match(/rest\/v1\/[a-z_]+\?select=[^`'"&]+/g) || [];
t('es gibt Abfragen zu pruefen', abfragen.length > 5, abfragen.length);

var verdaechtig = [];
abfragen.forEach(function (a) {
    var tabelle = a.match(/rest\/v1\/([a-z_]+)/)[1];
    var spalten = a.split('select=')[1];
    if (spalten.indexOf('*') > -1) return;               // select=* sagt nichts
    spalten.split(',').forEach(function (sp) {
        sp = sp.trim();
        // Verschachtelte Auswahl (tabelle(spalte)) und Sonderzeichen
        // ueberspringen -- die pruefen wir hier nicht.
        if (!/^[a-z][a-z0-9_]*$/.test(sp)) return;
        if ((GEWOLLT_UNBEKANNT[tabelle] || []).indexOf(sp) > -1) return;
        // Kommt der Name irgendwo SONST vor? Als Feld beim Speichern
        // (name:), als Eigenschaft (.name) oder in einem Filter (name=eq).
        var sonst = new RegExp('(\\.' + sp + '\\b)|(\\b' + sp + '\\s*:)|(\\b' + sp + '=(eq|gte|lte|in|is)\\.)', 'g');
        var treffer = (h.match(sonst) || []).length;
        if (treffer === 0) verdaechtig.push(tabelle + '.' + sp);
    });
});
t('kein Spaltenname, den es sonst nirgends gibt',
  verdaechtig.length === 0, verdaechtig);

console.log('\n-- 3. Eine leere Antwort darf nicht wie ein Ergebnis aussehen --');
// Das Muster "Array.isArray(x) ? x : []" ist an sich richtig -- es
// schuetzt davor, dass ein Fehlerobjekt wie eine Liste behandelt wird.
// Nur macht es aus einem Fehler eine glaubwuerdige Null. Deshalb gilt:
// wer so absichert, muss den Fehler vorher hoerbar machen. sbRead tut
// das -- es wirft, statt still ein Fehlerobjekt zurueckzugeben.
t('sbRead wirft bei einer Fehlerantwort', /if \(!res\.ok\) \{/.test(h), 'schluckt sie');
t('und sagt dabei, welche Tabelle es war',
  /var tabelle = \(String\(url\)\.match\(\/rest\\\/v1\\\/\(\[a-z_\]\+\)\/\)/.test(h), 'ohne Tabelle');
// 404 und 406 sind bei PostgREST Alltag ("hat dieser Gast ein Konto?")
// und duerfen die Liste nicht fluten.
t('"nichts gefunden" gilt nicht als Stoerung',
  /nichtsGefunden = \(res\.status === 404 \|\| res\.status === 406\)/.test(h), 'flutet die Liste');

console.log('\n-- 4. Der Fehlermelder darf nicht selbst kaputt sein --');
// AUS DEN POSTGRES-PROTOKOLLEN, WOERTLICH:
//   null value in column "target_id" of relation "activity_log"
//   violates not-null constraint
//
// client-error.js hat target_id nie gesetzt. Der Aufrufer im Browser
// prueft die Antwort absichtlich nicht -- ein Fehlermelder darf nichts
// werfen -- also fiel es nirgends auf: KEINE EINZIGE Client-Meldung ist
// je in der Datenbank gelandet.
//
// Das ist der bitterste Teil: dieser Melder haette die anderen Fehler
// dieses Tages (events.date, google_reviews) laengst gezeigt. Ein
// kaputter Fehlermelder ist schlimmer als gar keiner -- man glaubt, es
// gaebe nichts zu melden.
var CE = fs.readFileSync(KMI + '/netlify/functions/client-error.js', 'utf8');
t('client-error setzt target_id', /target_id:/.test(CE), 'fehlt weiterhin');
t('mit dem Haus, wenn es bekannt ist', /test\(_haus\) \? _haus/.test(CE), 'ignoriert das Haus');
t('und sonst einer gueltigen Null-Kennung',
  /OHNE_ZIEL = '00000000-0000-0000-0000-000000000000'/.test(CE), 'keine Ersatzkennung');
t('der Browser schickt die Restaurant-Kennung mit',
  /restaurantId: \(window\.currentOrderRestaurant && window\.currentOrderRestaurant\.id\)/.test(h),
  'schickt sie nicht');
t('der Grund steht im Quelltext',
  CE.indexOf('target_id DARF NICHT LEER BLEIBEN') > -1, 'keine Begruendung');
t('samt der Lehre daraus',
  CE.indexOf('Ein kaputter Fehlermelder ist schlimmer als keiner') > -1, 'keine Lehre');

// Die andere Stelle, die in activity_log schreibt, hat target_id von
// Anfang an gesetzt -- daran sieht man, dass die Spalte wirklich
// gebraucht wird und die Null-Kennung kein Selbstzweck ist.
var WC = fs.readFileSync(KMI + '/netlify/functions/waiter-call.js', 'utf8');
t('waiter-call setzt target_id ebenfalls', /target_id: restaurantId/.test(WC), 'auch dort leer');

console.log('\n-- 5. Keine SQL-Unterabfragen in PostgREST-Filtern --');
// PostgREST versteht "in.(a,b,c)" -- eine Werteliste. NICHT versteht es
// "in.(select ... from ...)". Das gab 400, der umgebende catch
// verschluckte es, und die Hero-Slideshow zeigte nie ein Bewertungsfoto.
// 28 Fehlversuche in dreieinhalb Stunden.
var roh = h.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
t('keine Unterabfrage in einem Filter',
  /=in\.\(\s*select /i.test(roh) === false, 'wieder eine drin');
t('die Fotos werden in zwei Schritten geholt',
  /rest\/v1\/reviews\?select=id&restaurant_id=eq\./.test(h), 'kein erster Schritt');
t('und die Kennungen dann als Liste uebergeben',
  /review_id=in\.\(/.test(h) && /idListe\.map\(encodeURIComponent\)\.join/.test(h), 'keine Liste');
t('leere Liste fragt gar nicht erst nach', /if \(idListe\.length\) \{/.test(h), 'fragt immer');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
