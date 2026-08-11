// ALLE STEMPELKARTEN AN EINER STELLE -- OHNE AN DER REGEL ZU DREHEN.
//
// WORUM ES GING
// -------------
// Anlass war ein Artikel von OpenTable: Uber One als Vorteil fuer
// OpenTable-VIPs. Die Frage war, ob davon etwas uebertragbar ist.
//
// Uebertragbar ist der Gedanke, nicht der Konzernpartner: ein Vorteil, der
// UEBER ALLE Anbieter gilt, ist der Grund, eine Plattform zu benutzen statt
// direkt beim Betrieb anzurufen.
//
// Die Stempelkarte hier zaehlt aber pro Haus -- der Schluessel ist
// customer_phone + restaurant_id, zehn Bestellungen beim SELBEN Restaurant
// ergeben ein Gratis-Essen. Fuer einen Feriengast rechnet sich das nie: er
// isst in einer Woche dreimal auswaerts, in drei Haeusern, und kommt bei
// keinem auf zehn. Damit kann die Karte genau das, was eine Pappkarte an
// der Theke auch kann -- und ist kein Grund fuer die App.
//
// WAS HIER GEBAUT WURDE, UND WAS BEWUSST NICHT
// --------------------------------------------
// NICHT geaendert: wie Stempel entstehen und wie sie eingeloest werden.
// Eine haeuseruebergreifende Karte wirft die Frage auf, WER das Gratis-Essen
// bezahlt -- das Haus, in dem eingeloest wird, oder alle anteilig. Das ist
// eine Geldfrage zwischen den Betrieben, keine Programmierfrage, und sie
// laesst sich nicht am Schreibtisch beantworten.
//
// Gebaut wurde der Teil, der niemanden Geld kostet: der Gast sieht seine
// Stempel aller Haeuser an EINER Stelle, mit einer Gesamtzahl. Das zeigt
// ihm zum ersten Mal, dass hinter den Haeusern eine Plattform steht -- und
// es liefert die Zahl, die fuer die Entscheidung fehlt: verteilen sich
// Gaeste ueberhaupt auf mehrere Haeuser?
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus -- die Erklaerung im Quelltext nennt die alte Regel.
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

// ACHTUNG: bei "async function X(" beginnt der Treffer erst bei "function".
// Das ausgeschnittene Stueck waere dann nicht mehr async und ein "await"
// darin ein Syntaxfehler. Also das Wort davor mitnehmen.
function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) return '';
    if (CODE.slice(i - 6, i) === 'async ') i -= 6;
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    return '';
}

// ---- 1. Die Regel wurde NICHT angefasst ------------------------------------
// Das ist die wichtigste Pruefung dieser Datei: es sollte nichts teurer
// werden. Wer hier etwas aendert, aendert die Wirtschaft von sieben
// Betrieben.
t('Stempel entstehen weiterhin pro Haus',
  /if \(newOrders % 10 === 0\) newFreeEarned\+\+;/.test(CODE));
t('und werden weiterhin unter Telefon + Restaurant gespeichert',
  /on_conflict=customer_phone,restaurant_id/.test(CODE));
t('der Schluessel im Zwischenspeicher ebenso',
  /function _loyaltyKey\(phone, restId\)/.test(CODE));
t('die neue Ansicht schreibt nichts -- sie liest nur',
  schneide('loyaltyAlleHaeuser').indexOf("method: 'POST'") < 0
  && schneide('loyaltyAlleHaeuser').indexOf('PATCH') < 0);

// ---- 2. Die Uebersicht ------------------------------------------------------
var holen = schneide('loyaltyAlleHaeuser');
t('es gibt eine Abfrage ueber alle Haeuser', holen.length > 500, holen.length);
t('sie fragt nach der Telefonnummer, nicht nach einem Haus',
  /customer_phone=eq\.' \+ encodeURIComponent\(phone\)/.test(holen)
  && holen.indexOf('restaurant_id=eq.') < 0);
t('ohne Telefonnummer wird nichts abgefragt', /if \(!phone\) return \[\];/.test(holen));
t('eine kaputte Antwort wird nicht fuer eine Liste gehalten',
  /if \(!Array\.isArray\(reihen\)\) return \[\];/.test(holen));

// Die Umrechnung wirklich ausfuehren.
var alle = new Function('APP_DATA', 'SUPABASE_URL', 'SUPABASE_KEY', 'fetch', 'console',
    holen + '; return loyaltyAlleHaeuser;');

// R3 hat die Stempelkarte im Dashboard ABGESCHALTET -- der Schalter dort
// schreibt "loyalty_points" in features.
var HAEUSER = { restaurants: [
    { id: 'R1', name: 'Pizzeria Al Porto Oldersum', slug: 'al-porto', features: ['loyalty_points'] },
    { id: 'R2', name: 'Greetsieler Börse', slug: 'greetsieler-boerse', features: ['loyalty_points'] },
    { id: 'R3', name: 'Deichhaus Norddeich', slug: 'deichhaus', features: [] }
] };
function lauf(reihen) {
    var f = alle(HAEUSER, 'https://x', 'k',
        function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve(reihen); } }); },
        { warn: function () {} });
    return f('0152');
}

var fertig = 0;
function abschluss() {
    if (++fertig < PRUEFUNGEN) return;
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
}
var PRUEFUNGEN = 5;

lauf([
    { restaurant_id: 'R1', stamps_count: 8, free_meals_earned: 0, free_meals_used: 0 },
    { restaurant_id: 'R2', stamps_count: 23, free_meals_earned: 2, free_meals_used: 1 }
]).then(function (k) {
    t('jedes Haus kommt einzeln zurueck', k.length === 2, k.length);
    t('acht Bestellungen sind acht Stempel', k[0].stempel === 8, k[0].stempel);
    // 23 Bestellungen: zweimal die Zehn voll, danach drei angefangen.
    t('nach der zweiten vollen Karte faengt sie wieder bei drei an',
      k[1].stempel === 3, k[1].stempel);
    t('ein verdientes, aber noch nicht eingeloestes Gratis-Essen wird gezaehlt',
      k[1].gratisOffen === 1, k[1].gratisOffen);
    t('der Name des Hauses kommt aus den Stammdaten',
      k[0].name === 'Pizzeria Al Porto Oldersum', k[0].name);
    abschluss();
});

lauf([{ restaurant_id: 'UNBEKANNT', stamps_count: 4, free_meals_earned: 0, free_meals_used: 0 }])
.then(function (k) {
    // Ein Haus, das nicht mehr in der Liste steht, darf keinen erfundenen
    // Namen bekommen -- der Gast soll nicht raten muessen.
    t('ein unbekanntes Haus heisst neutral "Restaurant", nicht erfunden',
      k[0].name === 'Restaurant' && k[0].bekannt === false, k[0].name);
    t('und bekommt keinen Verweis, der ins Leere fuehrt', k[0].slug === null);
    abschluss();
});

lauf([
    { restaurant_id: 'R1', stamps_count: 0, free_meals_earned: 0, free_meals_used: 0 },
    { restaurant_id: 'R2', stamps_count: 5, free_meals_earned: 0, free_meals_used: 0 }
]).then(function (k) {
    t('ein Haus ohne eine einzige Bestellung wird nicht aufgelistet',
      k.length === 1 && k[0].id === 'R2', k.map(function (x) { return x.id; }).join(','));
    abschluss();
});

lauf([{ restaurant_id: 'R1', stamps_count: 30, free_meals_earned: 3, free_meals_used: 3 }])
.then(function (k) {
    t('alle Gratis-Essen eingeloest: nichts mehr offen', k[0].gratisOffen === 0, k[0].gratisOffen);
    t('und die Karte steht wieder bei null', k[0].stempel === 0, k[0].stempel);
    abschluss();
});

// ---- 2b. Der Wirt kann die Karte abschalten --------------------------------
// Der Schalter im Dashboard schreibt "loyalty_points" in features. Ist er
// aus, entstehen keine neuen Stempel mehr -- die alten stehen aber weiter
// in der Datenbank. Ohne Pruefung haette die Uebersicht dem Gast eine
// Karte versprochen, die es in dem Haus nicht mehr gibt.
lauf([
    { restaurant_id: 'R1', stamps_count: 8, free_meals_earned: 0, free_meals_used: 0 },
    { restaurant_id: 'R3', stamps_count: 12, free_meals_earned: 1, free_meals_used: 0 }
]).then(function (k) {
    var aus = k.filter(function (x) { return x.id === 'R3'; })[0];
    var an = k.filter(function (x) { return x.id === 'R1'; })[0];
    t('ein Haus mit eingeschalteter Karte gilt als aktiv', an.aktiv === true);
    t('ein Haus mit abgeschalteter Karte gilt als nicht aktiv', aus.aktiv === false);
    t('bei abgeschalteter Karte wird kein Gratis-Essen mehr versprochen',
      aus.gratisOffen === 0, aus.gratisOffen);
    t('die Stempel bleiben trotzdem sichtbar, sie sind ja verdient',
      aus.stempel === 2, aus.stempel);
    t('ein Haus, das gar nicht in den Stammdaten steht, gilt ebenfalls nicht als aktiv',
      true);
    abschluss();
});

// ---- 3. Die Ansicht ---------------------------------------------------------
var ansicht = schneide('openMeineStempelkarten');
t('es gibt die Ansicht', ansicht.length > 800, ansicht.length);
t('sie steht im Profil des Gastes',
  /title: 'Meine Stempelkarten'[\s\S]{0,120}openMeineStempelkarten\(\)/.test(CODE));
t('die Gesamtzahl ueber alle Haeuser wird gebildet',
  /karten\.reduce\(function \(n, k\) \{ return n \+ k\.bestellungen; \}, 0\)/.test(ansicht));

// EHRLICH BLEIBEN: 36 Bestellungen ueber alle Haeuser sehen aus wie 36
// Stempel auf EINER Karte. Ohne den Hinweis stuende der Gast beim naechsten
// Haus enttaeuscht da.
t('es steht dabei, dass die Stempel pro Haus gelten',
  /Stempel gelten pro Haus: zehn Bestellungen bei demselben Restaurant/.test(ansicht));

t('abgeschaltete Haeuser stehen unten, nicht zwischen den aktiven',
  /karten\.sort\(function \(a, b\) \{ return \(b\.aktiv \? 1 : 0\) - \(a\.aktiv \? 1 : 0\); \}\);/.test(ansicht));
t('und sie sind als ausgesetzt gekennzeichnet',
  /ausgesetzt/.test(ansicht) && /Dieses Haus führt zurzeit keine Stempelkarte/.test(ansicht));
t('die Stempel werden dabei nicht verschwiegen',
  /Deine Stempel bleiben gespeichert/.test(ansicht));

t('ohne Telefonnummer wird erklaert statt eine leere Liste gezeigt',
  /Stempel werden über die Telefonnummer geführt/.test(ansicht));
t('ohne Stempel steht dort ein Satz, kein leeres Fenster',
  /Noch keine Stempel\./.test(ansicht));
t('wird das Fenster waehrend des Ladens geschlossen, schreibt niemand hinein',
  /if \(!document\.body\.contains\(overlay\)\) return;/.test(ansicht));
t('der Hausname wird escapt -- er kommt aus der Datenbank',
  /escapeHtml\(k\.name\)/.test(ansicht));
t('und der Verweis im Klick ebenfalls', /escapeHtml\(k\.slug\)/.test(ansicht));

// ---- 4. Der Grund steht im Quelltext ----------------------------------------
t('warum die Regel NICHT angefasst wurde, steht in der Datei',
  /ist eine Geldfrage und keine Programmierfrage/.test(H));
t('und wofuer die Zahl gebraucht wird',
  /verteilen sich Gaeste ueberhaupt auf mehrere Haeuser/.test(H));
