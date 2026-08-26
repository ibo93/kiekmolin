// DER PREIS WURDE NIRGENDS NACHGERECHNET.
//
// WAS DER FALL WAR
// ----------------
// netlify/functions/order-save.js hat subtotal, delivery_fee, discount und
// total genau so gespeichert, wie der Browser sie geschickt hat. Und der
// Browser lief nicht einmal ueber diese Function -- er hat direkt in die
// Tabelle geschrieben.
//
// Der Angriff braucht keine Kenntnisse: Entwicklerkonsole auf, beim Absenden
// total auf 1 setzen. Der Wirt sieht eine ganz normale Bestellung und kocht.
//
// WIE ES JETZT GEPRUEFT WIRD: UNTERGRENZE STATT NACHRECHNEN
// ----------------------------------------------------------
// Naheliegend waere, den Sollpreis auszurechnen und bei Abweichung
// abzulehnen. Das ist die gefaehrlichere Loesung: Preise entstehen an
// mehreren Stellen (Grundpreis, Groessen, Extras mit Menge, Aktionspreise),
// und die erste Regel, die hier niemand nachtraegt, lehnt ECHTE
// Bestellungen ab. Ein verlorener Gast kostet mehr als ein verhinderter
// Betrug einbringt.
//
// Also: was kann dieses Gericht im guenstigsten legitimen Fall kosten? Das
// Kleinste, was in der Datenbank dafuer steht. Extras kommen nur drauf.
// Damit kann jede kuenftige Regel den Preis nur erhoehen -- eine
// Untergrenze lehnt nie ehrlich ab und faengt trotzdem den Fall, um den es
// geht.
//
// WAS DIESER TEST NICHT BEHAUPTET
// --------------------------------
// Dass das Loch zu ist. Es ist zu, wenn die Tabelle "orders" keine Inserts
// mit dem oeffentlichen Schluessel mehr annimmt (RLS). Bis dahin geht ein
// Angreifer an der Function vorbei. Geprueft wird hier, dass die Tuer
// richtig gebaut ist -- der Riegel ist eine Zeile SQL und steht in
// netlify/functions/README-preise.md.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
var braucheAbschluss = false;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var P = require(path.join(WURZEL, 'netlify', 'functions', 'lib', 'preis-pruefung.js'));
var SAVE = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'order-save.js'), 'utf8');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// Eine kleine Karte, wie sie in der Datenbank steht
// ---------------------------------------------------------------------------
var KARTE = [
    { id: 'i-pizza', name: 'Pizza Margherita', base_price: 8.5,
      sizes: [{ name: 'klein', price: 6.5 }, { name: 'groß', price: 12.0 }] },
    { id: 'i-doener', name: 'Döner', base_price: 7.0, sizes: null },
    { id: 'i-cola', name: 'Cola 0,33', base_price: 2.5, sizes: null },
    // Gericht ohne jeden Preis -- kommt vor, wenn der Wirt es halb angelegt hat
    { id: 'i-leer', name: 'Tagesgericht', base_price: null, sizes: null }
];
var CROSS = [{ target_item_id: 'i-cola', cross_sell_price: 1.5 }];
var REST = { id: 'r1', delivery_fee: 2.5 };

function bestellung(extra) {
    var o = {
        restaurant_id: 'r1',
        order_type: 'delivery',
        items: [{ menu_item_id: 'i-pizza', name: 'Pizza Margherita', quantity: 1, price: 8.5 }],
        subtotal: 8.5, delivery_fee: 2.5, tip: 0, discount: 0, total: 11.0
    };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
}
function pruefe(o, daten) {
    return P.pruefe(o, daten || { restaurant: REST, menuItems: KARTE, crossSells: CROSS });
}

// ---- 1. Die Untergrenze je Gericht -----------------------------------------
(function () {
    var karte = P.bauKarte(KARTE, CROSS);
    t('bei Groessen zaehlt die kleinste, nicht der Grundpreis',
      karte.nachId['i-pizza'] === 6.5, karte.nachId['i-pizza']);
    t('ohne Groessen der Grundpreis', karte.nachId['i-doener'] === 7.0);
    // Der Wirt bietet die Cola fuer 1,50 an, wenn sie zum Doener dazu kommt.
    // Waere der Aktionspreis nicht dabei, wuerde genau diese echte Bestellung
    // abgelehnt.
    t('ein Aktionspreis zieht die Untergrenze mit herunter',
      karte.nachId['i-cola'] === 1.5, karte.nachId['i-cola']);
    t('ein Gericht ganz ohne Preis kommt nicht in die Karte',
      karte.nachId['i-leer'] === undefined);
    t('nachgeschlagen wird auch ueber den Namen',
      karte.nachName['pizza margherita'] === 6.5);
})();

// ---- 2. Der Fall, um den es geht -------------------------------------------
(function () {
    var r = pruefe(bestellung({ total: 1.0 }));
    t('40-Euro-Bestellung fuer 1 Euro wird abgelehnt', r.ok === false);
    t('und es steht dabei, warum',
      r.gruende.length === 1 && /Gesamt 1\.00 unter dem Mindestpreis 9\.00/.test(r.gruende[0]),
      JSON.stringify(r.gruende));
    t('die ehrliche Bestellung geht durch', pruefe(bestellung()).ok === true,
      JSON.stringify(pruefe(bestellung()).gruende));
})();

// ---- 3. Die anderen offenen Wege -------------------------------------------
(function () {
    t('Liefergebuehr auf 0 gesetzt wird abgelehnt -- sonst faehrt der Wirt umsonst',
      pruefe(bestellung({ delivery_fee: 0, total: 8.5 })).ok === false);
    t('bei Abholung ist keine Gebuehr faellig und das ist in Ordnung',
      pruefe(bestellung({ order_type: 'pickup', delivery_fee: 0, total: 8.5 })).ok === true);
    t('ein erfundener Rabatt ohne Gutschein wird abgelehnt',
      pruefe(bestellung({ discount: 5, total: 6.0 })).ok === false);
    t('negatives Trinkgeld ist ein Abzug mit anderem Namen',
      pruefe(bestellung({ tip: -5, total: 6.0 })).ok === false);
})();

// ---- 4. Gutscheine ---------------------------------------------------------
(function () {
    var mitGutschein = function (coupon, o) {
        return P.pruefe(o, { restaurant: REST, menuItems: KARTE, crossSells: CROSS, coupon: coupon });
    };
    var zehnProzent = { code: 'ZEHN', type: 'percent', value: 10 };
    var fuenfEuro = { code: 'FUENF', type: 'fixed', value: 5 };

    t('ein echter Prozent-Gutschein geht durch',
      mitGutschein(zehnProzent, bestellung({ discount: 0.85, total: 10.15 })).ok === true,
      JSON.stringify(mitGutschein(zehnProzent, bestellung({ discount: 0.85, total: 10.15 })).gruende));
    t('mehr als der Gutschein hergibt, wird abgelehnt',
      mitGutschein(zehnProzent, bestellung({ discount: 8, total: 3.0 })).ok === false);
    // Ein Gutschein ueber 50 Euro auf eine Bestellung von 9 Euro zieht
    // hoechstens den Warenwert ab, nicht mehr. Sonst bliebe nach dem Rabatt
    // ein negativer Rest, der die Liefergebuehr mit auffrisst -- der Wirt
    // faehrt dann umsonst UND verschenkt das Essen.
    var fuenfzig = { code: 'FUENFZIG', type: 'fixed', value: 50 };
    t('ein Gutschein groesser als die Bestellung frisst die Liefergebuehr nicht mit',
      mitGutschein(fuenfzig, bestellung({ discount: 50, total: 0 })).ok === false,
      JSON.stringify(mitGutschein(fuenfzig, bestellung({ discount: 50, total: 0 }))));
    t('mit bezahlter Liefergebuehr geht derselbe Gutschein durch',
      mitGutschein(fuenfzig, bestellung({ discount: 50, total: 2.5 })).ok === true);

    t('ein Fest-Gutschein zieht seinen Betrag ab',
      mitGutschein(fuenfEuro, bestellung({ discount: 5, total: 6.0 })).ok === true,
      JSON.stringify(mitGutschein(fuenfEuro, bestellung({ discount: 5, total: 6.0 })).gruende));

    // Prozent rechnet auf die UNTERGRENZE, nicht auf die gemeldete Summe.
    //
    // Sonst reicht ein Gutschein ueber EIN Prozent: Summe von 100.000 Euro
    // melden, davon ein Prozent sind 1000 Euro Rabatt -- gedeckelt auf den
    // Warenwert, und uebrig bleibt die Liefergebuehr. Fuer 2,50 Euro
    // gegessen.
    //
    // Der Deckel allein reicht dagegen nicht, deshalb steht dieser Fall so
    // scharf da: mit einem Prozent und einer erfundenen Riesensumme wird der
    // Deckel selbst zum Rabatt.
    var einProzent = { code: 'EINS', type: 'percent', value: 1 };
    var aufgeblasen = bestellung({ subtotal: 100000, discount: 99999, total: 2.5 });
    t('Prozent rechnet auf die Untergrenze, nicht auf die gemeldete Summe',
      mitGutschein(einProzent, aufgeblasen).ok === false,
      JSON.stringify(mitGutschein(einProzent, aufgeblasen)));
})();

// ---- 5. Mengen und mehrere Posten ------------------------------------------
(function () {
    var drei = bestellung({
        items: [{ menu_item_id: 'i-pizza', name: 'Pizza Margherita', quantity: 3, price: 25.5 }],
        total: 22.0
    });
    t('drei Pizzen kosten mindestens dreimal die kleinste',
      pruefe(drei).ok === true && pruefe(drei).mindestens === 22.0, pruefe(drei).mindestens);
    t('zwei davon zum Preis von einer wird abgelehnt',
      pruefe(bestellung({
          items: [{ menu_item_id: 'i-pizza', name: 'Pizza Margherita', quantity: 3, price: 25.5 }],
          total: 15.0
      })).ok === false);

    var gemischt = bestellung({
        items: [{ menu_item_id: 'i-pizza', name: 'Pizza Margherita', quantity: 1, price: 12 },
                { menu_item_id: 'i-doener', name: 'Döner', quantity: 2, price: 14 }],
        total: 28.5
    });
    t('mehrere Posten werden zusammengezaehlt',
      pruefe(gemischt).ok === true && pruefe(gemischt).mindestens === 23.0, pruefe(gemischt).mindestens);
})();

// ---- 6. Extras koennen nur draufkommen -------------------------------------
// Genau das ist die Zusage der Untergrenze. Wer eine Pizza mit vier Extras
// bestellt, liegt weit ueber der Grenze und wird nie abgelehnt.
(function () {
    var mitExtras = bestellung({
        items: [{ menu_item_id: 'i-pizza', name: 'Pizza Margherita', quantity: 1, price: 16.5,
                  options: '2× Extra Käse, Sardellen' }],
        total: 19.0
    });
    t('eine Pizza mit Extras liegt ueber der Grenze und geht durch',
      pruefe(mitExtras).ok === true);
})();

// ---- 7. Was sich nicht pruefen laesst, wird nicht abgelehnt ----------------
// Nachbestellen aus dem Verlauf, Gericht inzwischen geloescht. Wer das
// ausnutzen will, muss ein Gericht erfinden, das es nicht gibt -- und dann
// steht in der Kueche ein Name, den niemand kennt. Der gefaehrliche Angriff
// ist der unsichtbare: richtiger Name, falscher Preis.
(function () {
    // Abholung, damit hier wirklich nur das unbekannte Gericht zaehlt und
    // nicht nebenbei die Liefergebuehr den Mindestpreis hebt.
    var unbekannt = bestellung({
        order_type: 'pickup', delivery_fee: 0,
        items: [{ name: 'Gibt es nicht mehr', quantity: 1, price: 9 }], total: 1.0
    });
    var r = pruefe(unbekannt);
    t('ein unbekanntes Gericht blockiert die Bestellung nicht', r.ok === true);
    t('es wird aber gezaehlt und gemeldet',
      r.ungeprueft.length === 1 && r.ungeprueft[0] === 'Gibt es nicht mehr' && r.geprueft === 0,
      JSON.stringify(r));
})();

// ---- 8. Der Name als Notnagel ----------------------------------------------
// Nachbestellungen und Gruppenbestellungen bauen den Warenkorb aus alten
// Daten auf und haben keine menu_item_id. Dabei haengt die App Zusaetze an
// den Namen: "(Peter)" bei der Gruppenbestellung, "(Aktionspreis)" beim
// Cross-Sell. Ohne das Abschneiden findet der Vergleich nichts und die
// Pruefung faellt still aus -- genau die Sorte Loch, die niemand bemerkt.
(function () {
    // Geprueft wird, ob das Gericht ERKANNT wurde -- nicht bloss, ob die
    // Bestellung abgelehnt wird. Erst hiess es hier "wird abgelehnt", und das
    // war gruen, obwohl der Name gar nicht gefunden wurde: die Liefergebuehr
    // allein hob den Mindestpreis schon ueber die getuerkte Summe. Eine
    // Pruefung, die aus dem falschen Grund gruen ist, ist keine.
    function erkannt(name) {
        var r = pruefe(bestellung({ items: [{ name: name, quantity: 1, price: 8.5 }], total: 1.0 }));
        return r.geprueft === 1 && r.ungeprueft.length === 0;
    }
    t('ohne Kennung wird ueber den Namen gefunden', erkannt('Pizza Margherita'));
    t('der Zusatz aus der Gruppenbestellung stoert nicht', erkannt('Pizza Margherita (Peter)'));
    t('der Zusatz "(Aktionspreis)" ebenso', erkannt('Cola 0,33 (Aktionspreis)'));
    t('Gross- und Kleinschreibung spielt keine Rolle', erkannt('PIZZA  margherita'));
    t('und ein wirklich unbekannter Name wird auch als unbekannt gemeldet',
      !erkannt('Kaesekuchen mit Sahne'));
})();

// ---- 9. Rundung ist kein Betrug --------------------------------------------
// Die App rechnet in Fliesskomma; 0.1 + 0.2 ergibt dort 0.30000000000000004.
// Wer wegen eines halben Cents ablehnt, lehnt echte Bestellungen ab.
(function () {
    t('ein Cent Abweichung nach unten geht durch',
      pruefe(bestellung({ total: 8.99 })).ok === true);
    t('zehn Cent nicht mehr', pruefe(bestellung({ total: 8.9 })).ok === false);
})();

// ---- 10. Die Function haengt es richtig ein --------------------------------
(function () {
    t('order-save benutzt die Pruefung',
      /require\('\.\/lib\/preis-pruefung'\)/.test(SAVE));
    t('und rechnet VOR dem Speichern',
      SAVE.indexOf('await preisCheck(order)') < SAVE.indexOf('await resilientInsert(order)'),
      SAVE.indexOf('await preisCheck(order)') + ' / ' + SAVE.indexOf('await resilientInsert(order)'));

    // 422 und nicht 200: der Browser darf danach nicht auf den direkten
    // Insert ausweichen. Mit 200 sieht eine Ablehnung aus wie jeder andere
    // Fehler, und der Notweg holt die Bestellung doch noch herein.
    t('eine Ablehnung kommt als 422 zurueck, nicht als 200',
      /statusCode: 422/.test(SAVE) && /preis_abgelehnt: true/.test(SAVE));

    // Faellt die Datenbankabfrage aus, muss die Bestellung DURCHGEHEN. Sonst
    // steht der Wirt am Freitagabend ohne Bestellungen da, weil eine
    // Nebenabfrage klemmt.
    t('bei einer Stoerung beim Nachschlagen geht die Bestellung durch',
      /return \{ ok: true, unpruefbar: e\.message \}/.test(SAVE));
    t('das wird aber protokolliert und nicht verschwiegen',
      /Preis ungeprueft durchgelassen/.test(SAVE));
})();

// ---- 10b. Die Function wirklich laufen lassen ------------------------------
// Die Pruefungen darueber lesen nur den Quelltext. Hier wird der echte
// Handler aufgerufen, mit einem vorgetaeuschten fetch statt der Datenbank --
// so faellt auf, wenn der require-Pfad nicht stimmt, eine Abfrage anders
// heisst als die Tabelle oder die Antwort die falsche Form hat.
(function () {
    var echtesFetch = global.fetch;
    var gespeichert = 0;
    global.fetch = async function (url, opt) {
        var u = String(url);
        function antwort(d) { return { ok: true, status: 200, json: async function () { return d; }, text: async function () { return JSON.stringify(d); } }; }
        if (u.indexOf('restaurants?') >= 0) return antwort([REST]);
        if (u.indexOf('menu_items?') >= 0) return antwort(KARTE);
        if (u.indexOf('menu_cross_sells') >= 0) return antwort(CROSS);
        if (u.indexOf('coupons?') >= 0) return antwort([]);
        if (u.indexOf('/orders') >= 0 && opt && opt.method === 'POST') { gespeichert++; return antwort([{ id: 'neu-1' }]); }
        return antwort([]);
    };

    var handler = require(path.join(WURZEL, 'netlify', 'functions', 'order-save.js')).handler;
    function ruf(o) {
        return handler({ httpMethod: 'POST', body: JSON.stringify({ order: o }) });
    }

    var lauf = (async function () {
        var ehrlich = await ruf(bestellung({ order_number: 'KI-1' }));
        var betrug = await ruf(bestellung({ order_number: 'KI-2', total: 1.0 }));
        return { ehrlich: ehrlich, betrug: betrug, gespeichert: gespeichert };
    })();

    lauf.then(function (r) {
        t('die echte Function speichert eine ehrliche Bestellung',
          r.ehrlich.statusCode === 200 && JSON.parse(r.ehrlich.body).ok === true,
          r.ehrlich.statusCode + ' ' + r.ehrlich.body);
        t('und lehnt die manipulierte mit 422 ab',
          r.betrug.statusCode === 422 && JSON.parse(r.betrug.body).preis_abgelehnt === true,
          r.betrug.statusCode + ' ' + r.betrug.body);
        t('die abgelehnte wurde NICHT gespeichert -- eine Ablehnung, die trotzdem einfuegt, waere keine',
          r.gespeichert === 1, r.gespeichert + ' Inserts');
        global.fetch = echtesFetch;
        abschluss();
    });
    braucheAbschluss = true;
})();

// ---- 11. Der Browser geht jetzt zuerst ueber den Server --------------------
// Der wichtigste Teil. Vorher lief der Browser direkt in die Datenbank und
// diese Function war nur der Notweg -- damit lief die Pruefung an fast jeder
// Bestellung vorbei.
(function () {
    var iSrv = H.indexOf("fetch('/.netlify/functions/order-save'");
    var iDirekt = H.indexOf("_resilientInsert('orders', _orderPayload)");
    t('der Server wird VOR dem direkten Insert gefragt',
      iSrv > 0 && iDirekt > 0 && iSrv < iDirekt, iSrv + ' / ' + iDirekt);
    t('der direkte Insert bleibt als Notweg, falls Netlify nicht erreichbar ist',
      /if \(!_orderRes\.ok\) \{\s*_orderRes = await _resilientInsert\('orders', _orderPayload\);/.test(H));
    // Geprueft wird der BLOCK, nicht ein Zeichenfenster: ein Fenster waere
    // beim naechsten laengeren Kommentar zu klein und die Pruefung still weg.
    var blockStart = H.indexOf('if (_preisAbgelehnt) {');
    var block = '';
    if (blockStart > 0) {
        var tiefe = 0;
        for (var k = H.indexOf('{', blockStart); k < H.length; k++) {
            if (H[k] === '{') tiefe++;
            else if (H[k] === '}') { tiefe--; if (!tiefe) { block = H.slice(blockStart, k + 1); break; } }
        }
    }
    t('es gibt einen eigenen Zweig fuer die Preis-Ablehnung', block.length > 0);
    t('der Zweig steigt aus, bevor irgendetwas gespeichert wird',
      /\breturn;/.test(block) && block.indexOf('_resilientInsert') < 0,
      block.slice(0, 120));
    t('und der Knopf wird wieder freigegeben, statt tot stehenzubleiben',
      block.indexOf('submitBtn.disabled = false;') > 0);

    // Ohne die Kennung bleibt dem Server nur der Name.
    t('die Bestellung schickt die Gericht-Kennung mit',
      /menu_item_id: item\.menu_item_id \|\| null,/.test(H));
})();

// ---- 12. Und was noch fehlt, steht schriftlich da --------------------------
// Diese Pruefung wirkt nur, wenn der Browser nicht an ihr vorbei kann. Der
// Riegel ist eine RLS-Regel in Supabase. Solange sie fehlt, ist das Loch
// kleiner, aber nicht zu -- und das darf nirgends anders klingen.
(function () {
    var pfad = path.join(WURZEL, 'netlify', 'functions', 'README-preise.md');
    t('es gibt eine Anleitung fuer den fehlenden Riegel', fs.existsSync(pfad));
    if (fs.existsSync(pfad)) {
        var md = fs.readFileSync(pfad, 'utf8');
        t('mit dem fertigen SQL-Befehl zum Kopieren',
          /alter table public\.orders enable row level security/i.test(md));
        t('und mit dem Satz, dass es ohne diesen Schritt nicht zu ist',
          /nicht zu|offen|wirkt nur/i.test(md));
    }
    t('auch im Code steht, dass die Pruefung ohne RLS umgangen werden kann',
      /RLS/.test(fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'lib', 'preis-pruefung.js'), 'utf8')));
})();

// ---- Der Mindestbestellwert bei Lieferung ---------------------------------
// Gefragt am 26.08.2026: "was fehlt bei online bestellung mindestbestellung
// beim liefern". Nachgemessen: der Wert stand in der Datenbank, der Gast sah
// ihn im Warenkorb, der Checkout blockte darunter -- aber NUR im Browser.
// order-save holte vom Restaurant nur id und delivery_fee.
//
// Eine Regel, die nur im Browser steht, ist keine Regel: sie faellt weg bei
// einer alten App aus dem Zwischenspeicher (genau das ist am 25.08. passiert)
// und bei jedem, der die Adresse direkt aufruft. Der Wirt faehrt dann fuer
// 6 Euro los oder muss absagen.
(function () {
    var REST_MIN = { id: 'r1', delivery_fee: 2.5, min_order_value: 15 };
    function mitMin(o) {
        return P.pruefe(o, { restaurant: REST_MIN, menuItems: KARTE, crossSells: CROSS });
    }

    // Eine Pizza fuer 8,50 bei 15 Euro Mindestwert -- muss abgelehnt werden.
    var zuKlein = mitMin(bestellung());
    t('unter dem Mindestbestellwert wird abgelehnt', zuKlein.ok === false, zuKlein.gruende);
    t('und der Grund nennt beide Zahlen',
      /Warenwert .*unter dem Mindestbestellwert 15\.00/.test((zuKlein.gruende || []).join(' ')),
      zuKlein.gruende);

    // Zwei Pizzen: Untergrenze 2 x 6,50 = 13,00 -- immer noch zu wenig.
    var knapp = mitMin(bestellung({
        items: [{ menu_item_id: 'i-pizza', name: 'Pizza', quantity: 2, price: 8.5 }],
        subtotal: 17.0, total: 19.5
    }));
    t('gerechnet wird gegen die Untergrenze, nicht gegen die gemeldete Summe',
      knapp.ok === false, knapp.gruende);

    // Drei Pizzen: 3 x 6,50 = 19,50 -- ueber dem Mindestwert, geht durch.
    var genug = mitMin(bestellung({
        items: [{ menu_item_id: 'i-pizza', name: 'Pizza', quantity: 3, price: 8.5 }],
        subtotal: 25.5, delivery_fee: 2.5, total: 28.0
    }));
    t('darueber geht die Bestellung durch', genug.ok === true, genug.gruende);

    // ABHOLUNG hat keinen Mindestwert -- und die Probe der Wache bestellt so.
    var abholung = mitMin(bestellung({ order_type: 'pickup', delivery_fee: 0, total: 8.5 }));
    t('bei Abholung gilt kein Mindestbestellwert', abholung.ok === true, abholung.gruende);

    // Ohne hinterlegten Wert aendert sich nichts -- kein Wirt wird ueberrascht.
    var ohneWert = pruefe(bestellung());
    t('ohne hinterlegten Wert bleibt alles wie bisher', ohneWert.ok === true, ohneWert.gruende);
    var nullWert = P.pruefe(bestellung(), {
        restaurant: { id: 'r1', delivery_fee: 2.5, min_order_value: 0 },
        menuItems: KARTE, crossSells: CROSS });
    t('und bei 0 ebenfalls nicht', nullWert.ok === true, nullWert.gruende);

    // Der Wert steht in der Antwort, damit die Absage ihn nennen kann.
    t('der geforderte Wert steht in der Antwort', zuKlein.mindestbestellwert === 15, zuKlein.mindestbestellwert);

    // Und der Server muss ihn ueberhaupt holen -- sonst ist er immer 0.
    var os = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'order-save.js'), 'utf8');
    t('order-save holt min_order_value vom Restaurant',
      /select=id,delivery_fee,free_delivery_from,min_order_value/.test(os), 'holt ihn nicht');
})();

// Der Lauf gegen die echte Function ist asynchron; das Ergebnis kommt erst,
// wenn alles darueber schon durch ist. Deshalb wird hier nicht sofort
// abgeschlossen, sondern erst wenn er fertig ist -- sonst faende ein Fehler
// dort niemanden mehr vor, der ihn meldet.
function abschluss() {
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
}
if (!braucheAbschluss) abschluss();
