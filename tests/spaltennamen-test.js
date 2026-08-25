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
// AM 21.08.2026 KORRIGIERT.
//
// Hier stand "restaurant_id=eq." -- und dieser Test hat den falschen
// Spaltennamen damit festgeschrieben. reviews merkt sich sein Ziel als
// Paar aus target_type und target_id; eine restaurant_id gibt es dort
// nicht. Die Abfrage lief also auf 400, die Fotos blieben leer.
//
// Peinlich, weil es genau die Fehlerart ist, die diese Datei finden
// soll. Der Grund: ich habe den Namen geraten statt nachgesehen, und
// der Test hat den Irrtum bestaetigt statt ihn zu widerlegen. Ein Test,
// der nur wiederholt, was der Code sagt, prueft nichts.
t('die Fotos werden in zwei Schritten geholt',
  /rest\/v1\/reviews\?select=id&target_type=eq\.restaurant&target_id=eq\./.test(h),
  'kein erster Schritt');
t('und nicht ueber eine restaurant_id, die es in reviews nicht gibt',
  /rest\/v1\/reviews\?[^']*restaurant_id=eq\./.test(h) === false, 'wieder falsch');
t('und die Kennungen dann als Liste uebergeben',
  /review_id=in\.\(/.test(h) && /idListe\.map\(encodeURIComponent\)\.join/.test(h), 'keine Liste');
t('leere Liste fragt gar nicht erst nach', /if \(idListe\.length\) \{/.test(h), 'fragt immer');


console.log('\n-- Spalten, die es nachweislich nicht gibt --');
// Am 25.08.2026 im Datenbank-Protokoll gefunden, nicht geraten:
//
//   column menu_items.price does not exist   (42703, dutzendfach)
//   column orders.source does not exist      (42703, dutzendfach)
//
// menu_items.price stand in order-save.js. Die Abfrage fiel aus,
// preisCheck() ging in den catch-Zweig und meldete "unpruefbar" -- der
// Preis-Check war bei JEDER Bestellung aus. Absichtlich faellt er
// offen aus, damit eine Stoerung keine Bestellung verhindert; genau
// deshalb hat es nie jemand gemerkt.
//
// orders.source stand in sichtbarkeit/lib/supabase.js als FILTER. Ein
// Filter auf eine Spalte, die es nicht gibt, ist immer 400 -- die
// Telefon-Bestellungen im Agentur-Bericht waren nie zaehlbar.
var path = require('path');
var VERBOTEN = [
    { tabelle: 'menu_items', spalte: 'price', richtig: 'base_price' }
];

// UND DER FALL, DER ANDERS LIEGT: orders.source.
//
// Hier ist nicht der Code falsch, sondern die Datenbank unvollstaendig.
// Der Telefon-Assistent WILL seine Bestellungen als 'telefon' markieren,
// und der Agentur-Bericht WILL sie zaehlen. Nur die Spalte fehlte.
// reservations hat sie laengst -- orders wurde vergessen.
//
// Deshalb hier keine Verbots-Regel, sondern eine Kopplung: wer im Code
// auf orders.source zeigt, braucht eine Wanderung in datenbank/, die
// die Spalte anlegt. Sonst zeigen die beiden wieder ins Leere, und
// wieder faellt es keinem auf.
var wanderungen = fs.readdirSync(path.join(KMI, 'datenbank'))
    .filter(function (f) { return /\.sql$/.test(f); })
    .map(function (f) { return fs.readFileSync(path.join(KMI, 'datenbank', f), 'utf8'); })
    .join('\n');
t('zu orders.source gibt es eine Wanderung, die die Spalte anlegt',
  /alter table public\.orders[\s\S]{0,120}add column if not exists source/.test(wanderungen),
  'Code zeigt auf orders.source, die Datenbank kennt sie nicht');
t('und sie hat einen Standardwert, damit alte Zeilen nicht leer sind',
  /add column if not exists source text not null default 'app'/.test(wanderungen), 'ohne Standardwert');

// Alle Quelldateien einsammeln, die Supabase-Abfragen bauen.
function dateienSammeln(ordner, treffer) {
    var eintraege;
    try { eintraege = fs.readdirSync(ordner, { withFileTypes: true }); } catch (e) { return treffer; }
    eintraege.forEach(function (e) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'tests') return;
        var voll = path.join(ordner, e.name);
        if (e.isDirectory()) return dateienSammeln(voll, treffer);
        if (/\.(js|html)$/.test(e.name)) treffer.push(voll);
    });
    return treffer;
}
var quellen = dateienSammeln(KMI, []);
t('es gibt Quelldateien zu pruefen', quellen.length > 20, quellen.length);

VERBOTEN.forEach(function (v) {
    var schuldige = [];
    quellen.forEach(function (datei) {
        var txt;
        try { txt = fs.readFileSync(datei, 'utf8'); } catch (e) { return; }
        // Zeilenkommentare weg -- diese Datei erklaert den Fehler ja
        // selbst, und die Erklaerung darf ihn nicht ausloesen.
        txt = txt.split('\n').map(function (z) {
            return z.replace(/^(\s*)\/\/.*$/, '$1');
        }).join('\n');
        // Jede Abfrage auf diese Tabelle heraussuchen und darin nach der
        // Spalte sehen -- als select-Feld ODER als Filter.
        //
        // NICHT am Anfuehrungszeichen abbrechen. Die Abfragen werden mit
        // + zusammengesetzt:
        //
        //   'orders?restaurant_id=eq.' + id + '&source=eq.telefon' + ...
        //
        // Ein Ausdruck, der beim ersten ' aufhoert, sieht nur den ersten
        // Schnipsel -- und meldet Entwarnung. Genau so war dieser Test
        // beim ersten Anlauf gruen, obwohl der Fehler dastand. Deshalb
        // ein Fenster ueber den ROHEN Text nach dem Tabellennamen.
        var re = new RegExp(v.tabelle + "\\?", 'g');
        var m;
        while ((m = re.exec(txt))) {
            var abfrage = txt.slice(m.index, m.index + 400).split('\n').slice(0, 8).join(' ');
            var alsFeld = new RegExp('select=[^&]*(^|,)' + v.spalte + '(,|$|&)').test(abfrage);
            var alsFilter = new RegExp('[?&]' + v.spalte + '=').test(abfrage);
            if (alsFeld || alsFilter) {
                schuldige.push(path.relative(KMI, datei) + ' (' + abfrage.slice(0, 70) + ')');
            }
        }
    });
    t(v.tabelle + '.' + v.spalte + ' wird nirgends abgefragt',
      schuldige.length === 0,
      'richtig waere: ' + v.richtig + ' -- steht in: ' + schuldige.join(' | '));
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
