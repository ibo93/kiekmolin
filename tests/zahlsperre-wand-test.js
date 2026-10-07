// DIE ZAHLSPERRE AUF DER SERVERSEITE -- und die Anzeige darueber.
//
// Ibo am 25.09.2026: "Baue den Schalter auch hab sowas ja aehnlich guck mal
// noch mal und mach es noch schaerfer".
//
// Das Aehnliche war der Schalter "Sichtbar fuer Gaeste" und die beiden
// Feature-Schalter daneben. Nachgesehen und gefunden: die pruefen ALLE nur
// im Browser. Drei Wege gehen daran vorbei -- eine alte Fassung aus dem
// Zwischenspeicher, der Notweg beim direkten Insert, und ein Aufruf der
// Adresse von aussen. Deshalb hier die Wand: order-save, paypal-zahlung
// und reservation-guest pruefen selbst, mit dem Dienstschluessel.
//
// DIE SCHAERFE, DIE DIESER TEST VERTEIDIGT:
//
//   1. Die Wand steht -- und zwar VOR der Preis-Pruefung und VOR dem Insert.
//   2. Sie faellt OFFEN aus. Eine Stoerung sperrt nicht 25 Betriebe aus.
//   3. Sie hat eine EIGENE Abfrage. Kein zusaetzliches Feld in einem
//      bestehenden select -- das hat am 27.08.2026 den Preis-Schutz
//      abgeschaltet, ohne eine Fehlermeldung.
//   4. Beim PayPal-BUCHEN greift sie absichtlich NICHT. Sonst gaebe es
//      Geld ohne Bestellung.
//   5. Der Telefon-Eingang bleibt offen. Das ist ein anderes Produkt.
//   6. mapRestaurant traegt die Spalte. Ohne sie waere die ganze
//      Gaesteseite ein stiller Ausfall.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const KMI = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
const L = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'lib', 'zahlsperre.js'), 'utf8');
const OS = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'order-save.js'), 'utf8');
const PP = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'paypal-zahlung.js'), 'utf8');
const RG = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'reservation-guest.js'), 'utf8');
const RS = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'reservation-save.js'), 'utf8');
const TOML = fs.readFileSync(path.join(KMI, 'netlify.toml'), 'utf8');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

const WAND = require(path.join(KMI, 'netlify', 'functions', 'lib', 'zahlsperre.js'));

// ===========================================================================
console.log('-- 1. Die Stufen, serverseitig --');
// ===========================================================================
t('vier Stufen, in dieser Reihenfolge',
  WAND.STUFEN.join(',') === 'keine,hinweis,pause,aus', WAND.STUFEN.join(','));

[['keine', false, false], ['hinweis', false, false],
 ['pause', true, false], ['aus', true, true]].forEach(function (f) {
    t('Stufe ' + f[0] + ': bestellen ' + (f[1] ? 'zu' : 'offen')
      + ', reservieren ' + (f[2] ? 'zu' : 'offen'),
      WAND.bestellenAus(f[0]) === f[1] && WAND.reservierenAus(f[0]) === f[2],
      'bestellen=' + WAND.bestellenAus(f[0]) + ' reservieren=' + WAND.reservierenAus(f[0]));
});

t('bei "pause" bleibt der Tisch ausdruecklich offen',
  WAND.bestellenAus('pause') === true && WAND.reservierenAus('pause') === false);

console.log('\n-- 2. Alles Unbekannte ist "keine" --');
// Jeder dieser Werte MUSS offen lassen. Eine Sperre, die bei Datenmuell
// zuschnappt, sperrt irgendwann einen zahlenden Kunden aus.
[null, undefined, '', ' ', 'quatsch', 'KEINE', 0, 1, true, false, {}, [],
 'pause;', 'au s', 'Aus ', 'PAUSE'].forEach(function (w) {
    var erwartet = (String(w).trim().toLowerCase() === 'aus') ? 'aus'
                 : (String(w).trim().toLowerCase() === 'pause') ? 'pause' : 'keine';
    t('aus ' + JSON.stringify(w) + ' wird "' + erwartet + '"',
      WAND.stufeAus(w) === erwartet, WAND.stufeAus(w));
});

// ===========================================================================
console.log('\n-- 3. IM ZWEIFEL OFFEN: jeder Ausfall laesst durch --');
// ===========================================================================
// Die eigentliche Zusicherung dieses Tests. Gemessen wird mit einem
// vorgetaeuschten fetch, damit hier nichts ins Netz geht.
const echtesFetch = global.fetch;
function mitFetch(antwort, fn) {
    global.fetch = antwort;
    return fn().then(function (r) { global.fetch = echtesFetch; return r; },
                     function (e) { global.fetch = echtesFetch; throw e; });
}

(async function () {
    const SCHLUESSEL = 'test-dienstschluessel';

    // a) Supabase antwortet 500
    var r = await mitFetch(async function () {
        return { ok: false, status: 500, text: async function () { return 'kaputt'; } };
    }, function () { return WAND.lesen('r1', SCHLUESSEL); });
    t('HTTP 500 -> offen, und als ungemessen gekennzeichnet',
      r.stufe === 'keine' && r.gemessen === false, JSON.stringify(r));

    // b) Die Spalte fehlt noch (SQL 36 nicht eingespielt)
    r = await mitFetch(async function () {
        return { ok: false, status: 400, text: async function () {
            return '{"message":"column restaurants.zahlsperre does not exist"}'; } };
    }, function () { return WAND.lesen('r1', SCHLUESSEL); });
    t('fehlende Spalte -> offen, mit dem Grund "SQL 36"',
      r.stufe === 'keine' && r.gemessen === false && /36/.test(r.grund), JSON.stringify(r));

    // c) Netz weg
    r = await mitFetch(async function () { throw new Error('ECONNRESET'); },
        function () { return WAND.lesen('r1', SCHLUESSEL); });
    t('Netzfehler -> offen', r.stufe === 'keine' && r.gemessen === false, JSON.stringify(r));

    // d) Betrieb gibt es nicht
    r = await mitFetch(async function () {
        return { ok: true, json: async function () { return []; } };
    }, function () { return WAND.lesen('r1', SCHLUESSEL); });
    t('Betrieb nicht gefunden -> offen', r.stufe === 'keine' && r.gemessen === false, JSON.stringify(r));

    // e) Kein Schluessel gesetzt
    r = await WAND.lesen('r1', '');
    t('ohne Schluessel -> offen (kein Aufruf, keine Sperre)',
      r.stufe === 'keine' && r.gemessen === false, JSON.stringify(r));

    // f) Keine restaurant_id
    r = await WAND.lesen('', SCHLUESSEL);
    t('ohne restaurant_id -> offen', r.stufe === 'keine' && r.gemessen === false, JSON.stringify(r));

    console.log('\n-- 4. Und wenn es WIRKLICH gesperrt ist, sperrt es --');
    var gefragt = '';
    r = await mitFetch(async function (url) {
        gefragt = String(url);
        return { ok: true, json: async function () { return [{ zahlsperre: 'pause' }]; } };
    }, function () { return WAND.lesen('r7', SCHLUESSEL); });
    t('Stufe wird gelesen und als gemessen gemeldet',
      r.stufe === 'pause' && r.gemessen === true, JSON.stringify(r));
    t('gefragt wird NUR nach zahlsperre -- nichts anderes mit im select',
      /select=zahlsperre&/.test(gefragt) && !/features|is_active|min_order/.test(gefragt), gefragt);
    t('und nur nach diesem einen Betrieb',
      /id=eq\.r7/.test(gefragt) && /limit=1/.test(gefragt), gefragt);

    var p = await mitFetch(async function () {
        return { ok: true, json: async function () { return [{ zahlsperre: 'pause' }]; } };
    }, function () { return WAND.pruefe('r7', 'bestellen', SCHLUESSEL); });
    t('pruefe(bestellen) bei "pause": nicht erlaubt, mit Satz',
      p.erlaubt === false && p.text.length > 20, JSON.stringify(p));

    p = await mitFetch(async function () {
        return { ok: true, json: async function () { return [{ zahlsperre: 'pause' }]; } };
    }, function () { return WAND.pruefe('r7', 'reservieren', SCHLUESSEL); });
    t('pruefe(reservieren) bei "pause": ERLAUBT, ohne Satz',
      p.erlaubt === true && p.text === '', JSON.stringify(p));

    p = await mitFetch(async function () {
        return { ok: true, json: async function () { return [{ zahlsperre: 'hinweis' }]; } };
    }, function () { return WAND.pruefe('r7', 'bestellen', SCHLUESSEL); });
    t('"hinweis" sperrt NICHTS -- das ist der Sinn dieser Stufe',
      p.erlaubt === true, JSON.stringify(p));

    console.log('\n-- 5. Die Abweisung: 423, und kein Wort ueber Rechnungen --');
    var a = WAND.abweisung({ stufe: 'pause', text: WAND.gastText('pause') }, { 'X': '1' });
    t('423 Locked -- nicht 403, nicht 503',
      a.statusCode === 423, String(a.statusCode));
    var koerper = JSON.parse(a.body);
    t('ok:false, die Stufe und der Satz stehen drin',
      koerper.ok === false && koerper.zahlsperre === 'pause' && koerper.error.length > 20,
      a.body);
    t('die CORS-Kopfzeilen des Aufrufers werden uebernommen',
      a.headers && a.headers.X === '1', JSON.stringify(a.headers));

    // Das Wichtigste am Text: er beschaedigt den Betrieb nicht.
    ['pause', 'aus'].forEach(function (st) {
        var txt = WAND.gastText(st);
        t('Stufe ' + st + ': kein Wort ueber Rechnung/Zahlung/Schulden',
          !/rechnung|bezahl|zahlung|schuld|mahnung|gesperrt|offene/i.test(txt), txt);
        t('Stufe ' + st + ': aber ein vollstaendiger Satz fuer den Gast',
          txt.length > 30 && /\.$/.test(txt.trim()), txt);
    });
    t('bei "keine" gibt es keinen Satz', WAND.gastText('keine') === '');
    t('bei "hinweis" auch nicht -- der Gast merkt nichts',
      WAND.gastText('hinweis') === '');

    // ===================================================================
    console.log('\n-- 6. Server und Browser sagen DENSELBEN Satz --');
    // ===================================================================
    // Sonst liest der Gast zwei verschiedene Saetze fuer dieselbe Lage --
    // je nachdem, ob die App ihn abgewiesen hat oder der Server.
    const welt = { window: {}, console: console };
    welt.window = welt;
    vm.createContext(welt);
    vm.runInContext(H.slice(H.indexOf('var ZAHLSPERRE_STUFEN'),
                            H.indexOf('window.zahlsperreGastText = zahlsperreGastText;')), welt);
    ['pause', 'aus', 'hinweis', 'keine'].forEach(function (st) {
        t('Stufe ' + st + ': Wortlaut identisch',
          welt.zahlsperreGastText({ zahlsperre: st }) === WAND.gastText(st),
          'App: ' + welt.zahlsperreGastText({ zahlsperre: st }) + ' / Server: ' + WAND.gastText(st));
    });

    // ===================================================================
    console.log('\n-- 7. order-save: die Wand steht VORNE --');
    // ===================================================================
    t('order-save laedt die Wand',
      /require\('\.\/lib\/zahlsperre'\)/.test(OS), 'kein require');
    t('und fragt sie fuer "bestellen"',
      /ZAHLSPERRE\.pruefe\([^)]*'bestellen'/.test(OS), 'nicht gefragt');
    t('sie weist mit ZAHLSPERRE.abweisung ab -- kein eigener Statuscode',
      /return ZAHLSPERRE\.abweisung\(/.test(OS), 'eigene Antwort gebaut');

    var iSperre = OS.indexOf('ZAHLSPERRE.pruefe(');
    var iPreis  = OS.indexOf('await preisCheck(order)');
    var iInsert = OS.indexOf('await resilientInsert(order)');
    t('sie steht VOR der Preis-Pruefung (die holt sonst umsonst die Karte)',
      iSperre > 0 && iPreis > iSperre, iSperre + ' vs ' + iPreis);
    t('und VOR dem Insert -- danach steht die Bestellung in der Kueche',
      iSperre > 0 && iInsert > iSperre, iSperre + ' vs ' + iInsert);

    // ===================================================================
    console.log('\n-- 8. paypal-zahlung: beim Anlegen, NICHT beim Buchen --');
    // ===================================================================
    t('paypal-zahlung laedt die Wand',
      /require\('\.\/lib\/zahlsperre'\)/.test(PP), 'kein require');
    var iAnlegen = PP.indexOf("aktion === 'anlegen'");
    var iBuchen  = PP.indexOf("aktion === 'buchen'");
    var iPpSperre = PP.indexOf('ZAHLSPERRE.pruefe(');
    t('die Pruefung liegt im Anlegen-Zweig',
      iPpSperre > iAnlegen && iPpSperre < iBuchen,
      'anlegen@' + iAnlegen + ' sperre@' + iPpSperre + ' buchen@' + iBuchen);
    t('GENAU EINMAL -- beim Buchen waere der Gast schon durch PayPal durch',
      PP.split('ZAHLSPERRE.pruefe(').length - 1 === 1,
      String(PP.split('ZAHLSPERRE.pruefe(').length - 1));
    // Und sie muss vor dem Anlegen bei PayPal liegen, nicht danach.
    var iPpFetch = PP.indexOf("/v2/checkout/orders");
    t('vor dem Aufruf bei PayPal -- es bewegt sich kein Geld',
      iPpSperre < iPpFetch, iPpSperre + ' vs ' + iPpFetch);
    t('und der Grund steht als Kommentar dabei',
      /BEIM BUCHEN ABSICHTLICH NICHT/.test(PP), 'nicht begruendet');

    // ===================================================================
    console.log('\n-- 9. reservation-guest: nur "aus", mit eigener Abfrage --');
    // ===================================================================
    t('reservation-guest laedt die Wand',
      /require\('\.\/lib\/zahlsperre'\)/.test(RG), 'kein require');
    t('und fragt fuer "reservieren" -- nicht fuer "bestellen"',
      /ZAHLSPERRE\.pruefe\([^)]*'reservieren'/.test(RG)
      && !/ZAHLSPERRE\.pruefe\([^)]*'bestellen'/.test(RG), 'falsche Frage');

    // DER FEHLER VOM 27.08.2026, den dieser Test verhindert: zahlsperre mit
    // in den bestehenden select geschrieben. Fehlt die Spalte, antwortet
    // PostgREST 400, rRes ist nicht ok -- und die 502 drei Zeilen weiter
    // weist JEDE Reservierung ab. Ein stiller Totalausfall.
    t('zahlsperre steht NICHT im bestehenden Restaurant-select',
      /select=id,is_active,features/.test(RG) && !/select=id,is_active,features,zahlsperre/.test(RG),
      (RG.match(/select=id,is_active[^'&]*/) || [''])[0]);

    var iResSperre = RG.indexOf('ZAHLSPERRE.pruefe(');
    var iResInsert = RG.indexOf("/rest/v1/reservations'");
    t('gefragt wird vor dem Schreiben', iResSperre > 0 && iResInsert > iResSperre,
      iResSperre + ' vs ' + iResInsert);

    // ===================================================================
    console.log('\n-- 10. Der Telefon-Eingang bleibt ABSICHTLICH offen --');
    // ===================================================================
    // Telefon-Retter ist ein eigenes Produkt mit eigener Rechnung. Wer
    // dafuer zahlt, darf nicht abgeschaltet werden, weil die Kiek-mol-in-
    // Rechnung offen ist. Das waere die falsche Rechnung.
    t('reservation-save (Telefon) laedt die Wand NICHT',
      !/lib\/zahlsperre/.test(RS), 'Telefon-Eingang mitgesperrt');

    // ===================================================================
    console.log('\n-- 11. VON HAND. Kein Zeitplan, keine Automatik --');
    // ===================================================================
    t('zahlsperre steht in keinem Netlify-Zeitplan',
      !/zahlsperre/i.test(TOML), 'steht in netlify.toml');
    t('und niemand setzt eine Stufe im Code selbst',
      !/zahlsperre\s*[:=]\s*['"](pause|aus|hinweis)['"]/.test(OS + PP + RG),
      'irgendwo hart gesetzt');

    // ===================================================================
    console.log('\n-- 12. mapRestaurant: ohne das waere alles ein Nichts --');
    // ===================================================================
    var iMap = H.indexOf('function mapRestaurant');
    var iMapEnd = H.indexOf('async function initSupabase', iMap);
    var karte = H.slice(iMap, iMapEnd);
    t('mapRestaurant traegt zahlsperre',
      /zahlsperre:\s*r\.zahlsperre/.test(karte), 'fehlt -- stiller Ausfall');
    t('mapRestaurant traegt zahlsperre_seit (fuer "seit X Tagen")',
      /zahlsperre_seit:/.test(karte), 'fehlt');
    t('mapRestaurant traegt zahlsperre_notiz (die liest der Wirt)',
      /zahlsperre_notiz:/.test(karte), 'fehlt');
    t('und KEIN Ersatzwert auf zahlsperre -- undefined muss durchkommen',
      !/zahlsperre:\s*r\.zahlsperre\s*\|\|/.test(karte),
      'mit || belegt: fehlende Spalte wuerde zu einem festen Wert');

    // ===================================================================
    console.log('\n-- 13. Die Gaesteseite: kein Knopf, der nichts tut --');
    // ===================================================================
    t('die Speisekarte schaltet den Bestellweg ab (derselbe Weg wie "nur Karte")',
      /_nurKarte = true/.test(H) && /zahlsperreBestellenAus\(appRest\)/.test(H),
      'Warenkorb bleibt offen');
    t('openReservation faellt bei "aus" zurueck',
      /zahlsperreReservierenAus\(restaurant\)/.test(H), 'Reservierung geht durch');

    var iBar = H.indexOf('Glassmorphic Action Bar');
    var barQuelle = H.slice(iBar, H.indexOf('<div id="lpSpecials">', iBar));
    t('die Leiste setzt noOrdering aus der Sperre',
      /zahlsperreBestellenAus\(rest\)\) noOrdering = true/.test(barQuelle), 'Knopf bleibt');
    t('und noReservations',
      /zahlsperreReservierenAus\(rest\)\) noReservations = true/.test(barQuelle), 'Knopf bleibt');
    t('der Gast bekommt einen Satz statt eines toten Knopfes',
      /zahlsperreGastHinweis/.test(barQuelle), 'kein Hinweis');
    t('und die Telefonnummer dazu -- anrufen geht immer',
      /tel:/.test(barQuelle) && /rest\.phone/.test(barQuelle), 'keine Nummer');

    var iListe = H.indexOf("var _noOrd = _rfeat.indexOf('no_ordering') >= 0;");
    var listeQuelle = H.slice(iListe, iListe + 1600);
    t('in der Liste gehen die Knoepfe weg',
      /zahlsperreBestellenAus\(r\)\) _noOrd = true/.test(listeQuelle), 'Knopf bleibt');
    t('und der Speisekarten-Knopf bleibt trotzdem stehen',
      /openRestaurantBySlug/.test(listeQuelle) || /Speisekarte|Menukaart|Menu/.test(listeQuelle),
      'auch die Karte weg');
    // KEIN oeffentliches Abzeichen. Ein Haus in der Liste als gesperrt zu
    // kennzeichnen bestraft seine Gaeste, nicht den Wirt.
    t('kein rotes Abzeichen in der oeffentlichen Liste',
      !/zahlsperre[^\n]*(Abzeichen|badge)/i.test(listeQuelle), 'oeffentlich angeprangert');

    // ===================================================================
    console.log('\n-- 14. Die Kasse: 423 heisst Ende, nicht Notweg --');
    // ===================================================================
    var iKasse = H.indexOf('_zahlsperreAbgelehnt = _srvj');
    t('die Kasse erkennt 423',
      /_srv\.status === 423/.test(H) && iKasse > 0, 'nicht erkannt');
    var iNotweg = H.indexOf("_orderRes = await _resilientInsert('orders'");
    var iRueck = H.indexOf('if (_zahlsperreAbgelehnt) {');
    t('und kehrt VOR dem Notweg um -- sonst waere die Sperre umsonst',
      iRueck > 0 && iNotweg > iRueck, iRueck + ' vs ' + iNotweg);
    t('der Knopf wird wieder freigegeben (kein totes "wird verarbeitet")',
      /_zahlsperreAbgelehnt\)[\s\S]{0,500}submitBtn\.disabled = false/.test(H),
      'Knopf bleibt tot');
    t('PayPal meldet 423 nicht als PayPal-Fehler',
      /res\.status === 423/.test(H) && /zahlsperre: \(j && j\.zahlsperre\)/.test(H),
      'Gast liest "PayPal meldet einen Fehler"');

    // ===================================================================
    console.log('\n-- 15. Der rote Balken beim Wirt --');
    // ===================================================================
    var iBalken = H.indexOf('function zahlsperreBalkenPflegen');
    var balken = H.slice(iBalken, H.indexOf('function initFeatureToggles', iBalken));
    t('es gibt den Balken', iBalken > 0, 'fehlt');
    t('er steht GANZ OBEN im Dashboard, vor dem Verbindungsbalken',
      H.indexOf('id="zahlsperreBalken"') > 0
      && H.indexOf('id="zahlsperreBalken"') < H.indexOf('id="dashboardConnectionBanner"'),
      'weiter unten');
    t('er kommt schon bei "hinweis" -- das ist die Vorwarnung',
      /stufe === 'keine'\) \{ platz\.innerHTML = ''; return; \}/.test(balken)
      && /hinweis:/.test(balken), 'erst spaeter');
    t('er ist nicht wegzuklicken -- kein X, kein "verstanden"',
      !/onclick/.test(balken) && !/schliessen|dismiss/i.test(balken), 'wegklickbar');
    t('er sagt seit wann', /seit ' \+ tage/.test(balken), 'ohne Datum');
    t('und zeigt die Notiz, wenn eine da ist',
      /zahlsperre_notiz/.test(balken), 'Notiz fehlt');
    t('er sperrt NICHTS -- kein Overlay, kein return vor dem Dashboard',
      !/position:fixed/.test(balken) && !/pointer-events/.test(balken), 'sperrt das Dashboard');
    t('alles, was hinein geht, ist escapt (der Wirt tippt die Notiz nicht, Ibo schon)',
      (balken.match(/escapeHtml\(/g) || []).length >= 4,
      String((balken.match(/escapeHtml\(/g) || []).length));

    // ===================================================================
    console.log('\n-- 16. Die Knoepfe -- nur fuer Ibo --');
    // ===================================================================
    var iVerw = H.indexOf('function istVerwalter');
    var verw = H.slice(iVerw, H.indexOf('async function toggleRestaurantVisibility', iVerw));
    t('die Zeile erscheint nur fuer den Verwalter',
      /istVerwalter\(\) && !isGastro \? zahlsperreKartenZeile\(r\)/.test(H), 'jeder sieht sie');
    t('Verwalter heisst: Rolle superadmin',
      /=== 'superadmin'/.test(verw), 'andere Bedingung');
    t('und im Zweifel NEIN', /return false;/.test(verw), 'im Zweifel ja');
    t('alle vier Stufen sind anklickbar',
      ['keine', 'hinweis', 'pause', 'aus'].every(function (s) {
          return new RegExp("stufe: '" + s + "'").test(verw); }), 'Stufe fehlt');
    t('nachgefragt wird nur bei pause und aus',
      /stufe === 'pause' \|\| stufe === 'aus'\) \{[\s\S]{0,300}confirm\(/.test(verw),
      'auch bei offen/hinweis, oder gar nicht');
    t('und die Mahnung wird in der Nachfrage genannt',
      /Mahnung/.test(verw), 'kein Hinweis auf die Rechtslage');
    t('die Karte wird erst NACH dem OK vom Server umgeschrieben',
      verw.indexOf('rest.zahlsperre = stufe') > verw.indexOf('if (!res.ok || !j || !j.ok)'),
      'vorher -- Ibo saehe eine Sperre, die es nicht gibt');
    t('der Aufruf traegt die echte Sitzung mit',
      /'Authorization': 'Bearer ' \+ token/.test(verw), 'ohne Token');
    t('und geht an die Function, nicht direkt an die Tabelle',
      /\/\.netlify\/functions\/zahlsperre/.test(verw) && !/rest\/v1\/restaurants/.test(verw),
      'schreibt selbst');
    t('das benutzte Symbol steckt in der eingebetteten Schrift',
      !/>gavel</.test(H), 'gavel ist nicht dabei -- es stuende das Wort da');

    // ===================================================================
    console.log('\n-- 17. Die Auslieferung --');
    // ===================================================================
    var SW = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
    var WACHE = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'gastweg-wache.js'), 'utf8');
    var vSW = (SW.match(/kmi-shell-v(\d+)/) || [])[1];
    var vWache = (WACHE.match(/CACHE_MINDESTENS = (\d+)/) || [])[1];
    t('die Huelle hat eine neue Nummer (sonst behalten die Geraete die alte App)',
      Number(vSW) >= 51, 'v' + vSW);
    t('und die Wache verlangt mindestens dieselbe',
      Number(vWache) === Number(vSW), 'sw=' + vSW + ' wache=' + vWache);

    console.log('\n' + (n - ok === 0
        ? 'Alle ' + n + ' Tests bestanden.'
        : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    if (n - ok > 0) process.exitCode = 1;
})();
