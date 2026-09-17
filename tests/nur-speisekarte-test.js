// "NUR SPEISEKARTE ZEIGEN" -- der Schalter tat das Gegenteil.
//
// DER FEHLER, GEMESSEN AM 17.09.2026
// Ibo legt den Schalter um. Darunter steht woertlich:
//   "Keine Onlinebestellung - Gaeste sehen die Karte und rufen an."
// Danach sah kein Gast mehr die Karte. In openMenuModal stand:
//   showToast('Online-Bestellungen sind nicht verfuegbar'); return;
//
// Im Supabase-Protokoll war es zu sehen, ohne dass man es verstand: fuer
// einen Betrieb 443 Abfragen auf menu_items und NULL auf menu_categories.
// Kategorien laedt ausschliesslich die Kartenansicht -- es kam nie jemand
// hinein.
//
// Dazu kam eine zweite Stelle: der KARTE-Knopf auf der Betriebsseite stand
// mit im !noOrdering-Block und verschwand deshalb zusammen mit BESTELLEN.
//
// Dieser Test FUEHRT die Funktionen aus, mit nachgebautem DOM.

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var QUELLE = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}

// KOMMENTARE RAUS, BEVOR IM QUELLTEXT GESUCHT WIRD.
//
// Beim Gegenpruefen habe ich den Aufruf von kartenmodusAnwenden() mit
// /* ... */ stillgelegt -- und der Test blieb GRUEN, weil er den Aufruf im
// Kommentar wiederfand. Eine Zusicherung, die ein Kommentar erfuellt,
// prueft nichts.
function ohneKommentare(code) {
    return String(code)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')       // Blockkommentare
        .replace(/^[ \t]*\/\/.*$/gm, ' ');        // ganze Zeilenkommentare
}

function schneide(name) {
    var i = QUELLE.indexOf('function ' + name + '(');
    if (i < 0) throw new Error(name + ' nicht gefunden');
    var tiefe = 0;
    for (var k = QUELLE.indexOf('{', i); k < QUELLE.length; k++) {
        if (QUELLE[k] === '{') tiefe++;
        else if (QUELLE[k] === '}') { tiefe--; if (tiefe === 0) return QUELLE.slice(i, k + 1); }
    }
    throw new Error(name + ' nicht geschlossen');
}

// ---- Ein Mini-DOM, gerade genug fuer die Anzeige-Logik ---------------
function baueWelt() {
    var knoten = {};
    function neu(id, eltern) {
        var el = { id: id, style: {}, innerHTML: '', textContent: '',
                   classList: { _c: {}, add: function (c) { this._c[c] = 1; },
                                remove: function (c) { delete this._c[c]; },
                                contains: function (c) { return !!this._c[c]; } },
                   parentElement: eltern || null };
        knoten[id] = el;
        return el;
    }
    var kopfKorb = neu('_kopfKorb');
    neu('menuCartBadge', kopfKorb);
    neu('menuFloatingCartBar');
    neu('cartButtonFixed');
    neu('menuAnrufenBar');
    neu('floatingCartCount');
    neu('floatingCartTotal');

    var meldungen = [];
    var ctx = {
        document: { getElementById: function (id) { return knoten[id] || null; } },
        window: {},
        console: console,
        showToast: function (txt) { meldungen.push(txt); }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(schneide('_escHtmlBasic') + '\n' + schneide('kartenmodusAnwenden'), ctx);
    return { ctx: ctx, k: knoten, meldungen: meldungen };
}

console.log('\n-- 1. KARTENMODUS AN: DER BESTELLWEG VERSCHWINDET --');

var w = baueWelt();
var betrieb = { id: 'r1', name: 'Greetsieler Börse', phone: '04926 1234' };
w.ctx.kartenmodusAnwenden(true, betrieb);

t('das Warenkorb-Symbol in der Kopfzeile ist weg',
  w.k._kopfKorb.style.display === 'none', w.k._kopfKorb.style.display);
t('die schwebende Warenkorb-Leiste ist weg',
  w.k.menuFloatingCartBar.style.display === 'none', w.k.menuFloatingCartBar.style.display);
t('der feste Warenkorb-Knopf ist weg',
  !w.k.cartButtonFixed.classList.contains('visible'));

console.log('\n-- 2. UND DIE TELEFONNUMMER KOMMT --');
//
// Das ist der halbe Sinn des Schalters: "Gaeste sehen die Karte und rufen an."
t('die Anrufen-Leiste ist sichtbar', w.k.menuAnrufenBar.style.display === '',
  w.k.menuAnrufenBar.style.display);
t('sie enthaelt einen tel:-Link', /href="tel:/.test(w.k.menuAnrufenBar.innerHTML));
t('mit der Nummer des Betriebs, ohne Leerzeichen',
  /href="tel:049261234"/.test(w.k.menuAnrufenBar.innerHTML), w.k.menuAnrufenBar.innerHTML.slice(0, 90));
t('und lesbar daneben', /04926 1234/.test(w.k.menuAnrufenBar.innerHTML));

console.log('\n-- 3. OHNE NUMMER KEIN KNOPF --');
//
// "Ruf uns an" ohne Nummer ist eine Sackgasse. Dann lieber nichts.
var ohne = baueWelt();
ohne.ctx.kartenmodusAnwenden(true, { id: 'r2', name: 'Ohne Telefon' });
t('keine Anrufen-Leiste ohne Telefonnummer',
  ohne.k.menuAnrufenBar.style.display === 'none', ohne.k.menuAnrufenBar.style.display);
t('und auch kein leerer Knopf im HTML', ohne.k.menuAnrufenBar.innerHTML === '');
t('der Warenkorb bleibt trotzdem aus', ohne.k._kopfKorb.style.display === 'none');

console.log('\n-- 4. KARTENMODUS AUS: ALLES WIE VORHER --');
//
// Wird der Schalter NICHT angewandt, behaelt ein Gast den versteckten
// Warenkorb vom vorigen Betrieb.
var aus = baueWelt();
aus.ctx.kartenmodusAnwenden(true, betrieb);          // erst ein Kartenmodus-Betrieb
aus.ctx.kartenmodusAnwenden(false, { id: 'r3', name: 'Normal', phone: '0491 999' });
t('das Warenkorb-Symbol ist wieder da', aus.k._kopfKorb.style.display === '',
  aus.k._kopfKorb.style.display);
t('die Anrufen-Leiste ist wieder weg', aus.k.menuAnrufenBar.style.display === 'none');
t('die Warenkorb-Leiste bleibt auf none -- updateCartBadges blendet sie ein',
  aus.k.menuFloatingCartBar.style.display === 'none', aus.k.menuFloatingCartBar.style.display);

console.log('\n-- 5. XSS: EIN NAME IST KEIN HTML --');
var bose = baueWelt();
bose.ctx.kartenmodusAnwenden(true, { id: 'r4', name: 'X', phone: '0491 <img src=x onerror=alert(1)>' });
t('kein rohes <img> in der Leiste', bose.k.menuAnrufenBar.innerHTML.indexOf('<img') < 0,
  bose.k.menuAnrufenBar.innerHTML.slice(0, 120));
t('aber ein Knopf entsteht trotzdem', /href="tel:/.test(bose.k.menuAnrufenBar.innerHTML));

console.log('\n-- 6. EIN ANZEIGEFEHLER DARF DIE KARTE NICHT KIPPEN --');
//
// Im Kartenmodus ist die Karte das Einzige, was der Gast bekommt.
var kaputt = baueWelt();
kaputt.ctx.document.getElementById = function () { throw new Error('DOM weg'); };
var geworfen = false;
try { kaputt.ctx.kartenmodusAnwenden(true, betrieb); } catch (e) { geworfen = true; }
t('kartenmodusAnwenden wirft nicht', !geworfen);

console.log('\n-- 7. openMenuModal OEFFNET JETZT --');
//
// Der eigentliche Fehler. Frueher stand hier ein return.
var omm = ohneKommentare(schneide('openMenuModal'));
t('openMenuModal bricht bei no_ordering NICHT mehr ab',
  !/no_ordering'\) >= 0\) \{[\s\S]{0,200}return;/.test(omm),
  (omm.match(/no_ordering[\s\S]{0,120}/) || [''])[0].slice(0, 110));
t('stattdessen wird _nurKarte gesetzt', /_nurKarte = !!\(appRest/.test(omm));
t('und der Kartenmodus angewandt', /kartenmodusAnwenden\(_nurKarte, restaurant\)/.test(omm));
t('die Adresse heisst dann /speisekarte statt /bestellen',
  /_nurKarte \? '\/speisekarte' : '\/bestellen'/.test(omm));

console.log('\n-- 8. NICHTS IN DEN WARENKORB --');
//
// Ausgeblendet ist nicht abgeschaltet: aus der Suche, aus einem noch
// offenen Gericht-Fenster oder per Tastatur kommt man trotzdem hierhin.
var add = ohneKommentare(schneide('addItemToCart'));
t('addItemToCart sperrt im Kartenmodus', /if \(window\._nurKarte\)/.test(add));
t('und zwar GANZ OBEN, vor dem Rechnen',
  add.indexOf('window._nurKarte') < add.indexOf('calculateItemPrice'),
  add.indexOf('window._nurKarte') + ' / ' + add.indexOf('calculateItemPrice'));
t('mit einem Hinweis, der auf das Telefon zeigt', /bitte anrufen/.test(add));

console.log('\n-- 9. DIE LEISTE AUF DER BETRIEBSSEITE --');
//
// Der KARTE-Knopf stand mit im !noOrdering-Block und verschwand deshalb
// zusammen mit BESTELLEN -- also genau der Knopf, der bleiben sollte.
var i = QUELLE.indexOf("var noOrdering = restFeatures.indexOf('no_ordering')");
var leiste = ohneKommentare(QUELLE.slice(i, QUELLE.indexOf("bar += '</div>';", i)));
var iIf    = leiste.indexOf('if (!noOrdering)');
var iEnde  = leiste.indexOf('}', leiste.indexOf('BESTELLEN'));
var iKarte = leiste.indexOf('restaurant_menu');
t('BESTELLEN steht im !noOrdering-Block',
  leiste.indexOf('BESTELLEN') > iIf && leiste.indexOf('BESTELLEN') < iEnde);
t('der KARTE-Knopf steht AUSSERHALB davon', iKarte > iEnde, iKarte + ' > ' + iEnde);
t('und heisst im Kartenmodus SPEISEKARTE',
  /noOrdering \? 'SPEISEKARTE' : 'KARTE'/.test(leiste));

console.log('\n-- 10. DIE WARENKORB-LEISTE KENNT DEN MODUS --');
var ucb = ohneKommentare(schneide('updateCartBadges'));
t('updateCartBadges blendet im Kartenmodus nicht ein',
  /count > 0 && !window\._nurKarte/.test(ucb),
  (ucb.match(/count > 0[^)]*/) || [''])[0]);

console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
