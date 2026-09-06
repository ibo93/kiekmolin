// WAS SICH VERKAUFT -- FUER DEN WIRT SICHTBAR.
//
// Idee von Ibo am 04.09.2026: mehr Verkaufshilfen bei der Bestellung.
//
// NACHGESEHEN STATT ANGENOMMEN: gezaehlt wird laengst. loadPopularItems()
// summiert die Bestellungen der letzten 30 Tage je Gericht -- aber nur,
// um dem GAST "Beliebt"-Raenge zu zeigen. Im Dashboard gab es keine
// einzige Verkaufszahl je Gericht; die Top-Gerichte standen nur in der
// Abend-E-Mail.
//
// Ohne Zahlen ist jede Verkaufsidee Raten. Wer weiss, dass die Tonno
// 3-mal lief und die Margherita 41-mal, weiss auch, welches Gericht er
// nach oben zieht. Deshalb steht die Zahl direkt neben den Pfeilen.
//
// WICHTIG BEI DEN ZAHLEN: "0 verkauft" und "weiss ich nicht" sind
// zweierlei. Eine erfundene 0 waere genau der stille Ausfall aus Regel 6
// -- der Wirt wuerde ein Gericht aus der Karte werfen, das sich in
// Wahrheit gut verkauft, nur weil die Abfrage fehlgeschlagen ist.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

var a = h.indexOf('var _verkaufsZahlen = {};');
var e = h.indexOf('window.verkaufsAnzeige = verkaufsAnzeige;') + 'window.verkaufsAnzeige = verkaufsAnzeige;'.length;
t('der Abschnitt wurde gefunden', a > 0 && e > a, a + '/' + e);

function bauen(antwort) {
    var gezeichnet = 0;
    var ctx = {
        SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'anon',
        kmiToken: function () { return 'tok'; },
        fetch: function (url) { ctx._url = url; return Promise.resolve(antwort); },
        renderMenuCategories: function () { gezeichnet++; },
        Promise: Promise, Date: Date, Number: Number, String: String, Array: Array,
        JSON: JSON, console: console
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(h.slice(a, e), ctx);
    return { ctx: ctx, zahl: function () { return gezeichnet; } };
}

function gut(zeilen) {
    return { ok: true, status: 200, json: function () { return Promise.resolve(zeilen); } };
}

// ---- 1. Zaehlen ------------------------------------------------------
console.log('\n-- Zusammenzaehlen --');
var w = bauen(gut([
    { item_name: 'Pizza Margherita', quantity: 3 },
    { item_name: 'pizza margherita', quantity: 2 },   // andere Schreibweise
    { item_name: 'Pizza Tonno',      quantity: 1 },
    { item_name: '  Pizza Tonno  ',  quantity: 2 },   // Leerzeichen
    { item_name: 'Salat',            quantity: null } // fehlende Menge = 1
]));
w.ctx.verkaufszahlenLaden('r1').then(function () {
    t('Gross- und Kleinschreibung zaehlt zusammen',
      /5×/.test(w.ctx.verkaufsAnzeige({ name: 'Pizza Margherita' })),
      w.ctx.verkaufsAnzeige({ name: 'Pizza Margherita' }));
    t('Leerzeichen am Rand stoeren nicht',
      /3×/.test(w.ctx.verkaufsAnzeige({ name: 'Pizza Tonno' })),
      w.ctx.verkaufsAnzeige({ name: 'Pizza Tonno' }));
    t('fehlende Menge zaehlt als eins',
      /1×/.test(w.ctx.verkaufsAnzeige({ name: 'Salat' })),
      w.ctx.verkaufsAnzeige({ name: 'Salat' }));

    // NULL ist eine Aussage und wird gezeigt.
    t('ein Gericht ohne Verkauf zeigt 0x, statt zu schweigen',
      /0×/.test(w.ctx.verkaufsAnzeige({ name: 'Lasagne' })),
      w.ctx.verkaufsAnzeige({ name: 'Lasagne' }));

    t('die Abfrage fragt nur dieses Restaurant', /restaurant_id=eq\.r1/.test(w.ctx._url), w.ctx._url);
    t('und nur die letzten 30 Tage', /created_at=gte\./.test(w.ctx._url), w.ctx._url);
    t('danach wird neu gezeichnet', w.zahl() === 1, w.zahl());

    // ---- 2. Der wichtige Unterschied ---------------------------------
    console.log('\n-- "0 verkauft" und "weiss ich nicht" sind zweierlei --');
    var leer = bauen(gut([]));
    t('vor dem Laden steht gar nichts da', leer.ctx.verkaufsAnzeige({ name: 'Pizza' }) === '',
      leer.ctx.verkaufsAnzeige({ name: 'Pizza' }));

    var kaputt = bauen({ ok: false, status: 400, json: function () { return Promise.resolve({}); } });
    return kaputt.ctx.verkaufszahlenLaden('r1').then(function () {
        // Nach einem Fehler darf KEINE 0 erscheinen -- sonst wirft der
        // Wirt ein Gericht raus, das sich in Wahrheit gut verkauft.
        t('nach einem Serverfehler wird keine 0 erfunden',
          kaputt.ctx.verkaufsAnzeige({ name: 'Pizza' }) === '',
          kaputt.ctx.verkaufsAnzeige({ name: 'Pizza' }));
        t('und die Speisekarte wird trotzdem gezeichnet', kaputt.zahl() === 1, kaputt.zahl());

        // NICHT Promise.reject(...) als Argument bauen: das erzeugt eine
        // Zurueckweisung, die niemand entgegennimmt -- Node beendet den
        // Lauf danach mit Fehler, obwohl alle Tests bestanden haben. Ein
        // abgestuerzter Test sieht in der Zusammenfassung aus wie ein
        // bestandener; genau davor warnt Regel 5.
        var netz = bauen(null);
        netz.ctx.fetch = function () { return Promise.reject(new Error('kein Netz')); };
        return netz.ctx.verkaufszahlenLaden('r1').then(function () {
            t('ein Netzfehler stuerzt nicht ab', netz.zahl() === 1, netz.zahl());
            t('und erfindet ebenfalls keine 0', netz.ctx.verkaufsAnzeige({ name: 'Pizza' }) === '',
              netz.ctx.verkaufsAnzeige({ name: 'Pizza' }));
            abschluss();
        });
    });
}).catch(function (err) {
    t('kein Absturz', false, err && err.stack);
    abschluss();
});

function abschluss() {
    // ---- 3. Steht die Zahl auch wirklich in der Zeile? ---------------
    console.log('\n-- In der Maske --');
    t('die Zahl steht neben dem Preis', /\$\{verkaufsAnzeige\(item\)\}/.test(h), 'fehlt in der Zeile');
    t('sie wird beim Laden der Speisekarte geholt',
      /verkaufszahlenLaden\(restaurantId\);/.test(h), 'wird nie geholt');
    // Die Zahl ist eine Zugabe. Bleibt sie aus, muss die Karte trotzdem da sein.
    t('erst die Karte zeichnen, dann die Zahlen holen',
      h.indexOf('updateMenuStats();') < h.indexOf('verkaufszahlenLaden(restaurantId);'),
      'die Karte wartet auf die Zahlen');

    console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    if (n - ok > 0) process.exit(1);
}
