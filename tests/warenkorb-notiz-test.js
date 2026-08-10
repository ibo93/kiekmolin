// WARENKORB: bearbeiten und Notiz -- und der Cross-Sell.
//
// GEMELDET WURDE
// --------------
// "beim warenkorb kann ich nicht mehr die gerichte bearbeiten man sieht
//  nichts mehr" und "beim dazu passt das gericht keine nichts einfügen wie
//  notizen".
//
// DREI URSACHEN, ALLE VERSCHIEDEN
// -------------------------------
// 1. Der Fuß des Warenkorbs listete JEDES Gericht ein zweites Mal -- als tote
//    Textzeile ohne Plus, Minus oder Papierkorb. Bei acht Positionen war diese
//    Liste höher als der Ausschnitt darüber: sichtbar war nur noch die
//    Aufzählung, die änderbaren Zeilen lagen ausserhalb des Bildes.
//
// 2. Eine Notiz konnte der Gast gar nicht eintragen. Das Feld item.notes gab
//    es, geschrieben hat es nur der Cross-Sell -- und zwar mit dem internen
//    Text "Cross-Sell Aktionspreis", der so auf den Bon gegangen wäre.
//    Schlimmer: notes wurde beim Abschicken an ALLEN DREI Stellen weggelassen.
//    Eine Notiz wäre also gespeichert worden und nie in der Küche
//    angekommen.
//
// 3. Im "Dazu passt..."-Fenster steht das onclick am ganzen Zeilen-<div>.
//    btnEl.textContent = 'Hinzugefügt' hat damit Bild, Name, Preis und
//    Plus-Zeichen durch ein nacktes Wort ersetzt -- der weiße Kasten mitten
//    im Fenster auf dem Bildschirmfoto.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// --- 1. Die doppelte Liste im Fuß ist weg -----------------------------------
t('der Fuss listet die Gerichte NICHT mehr einzeln auf',
  !/linesHtml \+= '<div style="display:flex;justify-content:space-between;align-items:center;color:var\(--text-secondary\);font-size:14px;">' \+\s*\n?\s*'<span>' \+ displayName/.test(H));
t('stattdessen steht dort eine Zwischensumme',
  /Zwischensumme · ' \+ anzahl \+ ' Artikel/.test(H));
t('der Grund steht im Quelltext',
  /Hier stand jedes Gericht ein ZWEITES Mal/.test(H));

// --- 2. Jede Zeile ist bedienbar ---------------------------------------------
var render = schneide('renderCartItems');
['changeCartItemQty', 'removeCartItem', 'toggleCartNote'].forEach(function (f) {
    t('jede Warenkorbzeile hat ' + f, render.indexOf(f + "('${item.id}'") >= 0);
});
// Nur das CSS prüfen, nicht den Kommentar darüber -- der darf die alte
// Größe ruhig beim Namen nennen.
t('die Zeilen sind kompakt genug fuer acht Gerichte (kein 112px-Bild mehr)',
  render.indexOf('width:112px;height:112px') < 0 && render.indexOf('width:56px;height:56px') >= 0);
t('die Beschreibung faellt im Warenkorb weg -- sie steht in der Speisekarte',
  render.indexOf("item['description_' + currentLanguage]") < 0);

// --- 3. Notiz eintragen -------------------------------------------------------
var welt = {
    orderCart: [{ id: '1', name: 'Pizza', total_price: 8.9, quantity: 1 },
                { id: '2', name: 'Salat', total_price: 5, quantity: 1 }],
    felder: { cartNoteInput_1: { value: ' ohne Zwiebeln ' } },
    toasts: [], gerendert: 0
};
var speichere = new Function('orderCart', 'document', 'renderCartItems', 'showToast',
    schneide('speichereCartNotiz') + '; return speichereCartNotiz;')(
    welt.orderCart,
    { getElementById: function (id) { return welt.felder[id] || null; } },
    function () { welt.gerendert++; },
    function (m) { welt.toasts.push(m); });

speichere('1');
t('die Notiz landet an der richtigen Position',
  welt.orderCart[0].notes === 'ohne Zwiebeln', JSON.stringify(welt.orderCart[0].notes));
t('Leerzeichen werden abgeschnitten', welt.orderCart[0].notes.indexOf(' ') !== 0);
t('die andere Position bleibt unberuehrt',
  welt.orderCart[1].notes === undefined, JSON.stringify(welt.orderCart[1]));
t('der Warenkorb wird danach neu gezeichnet', welt.gerendert === 1, welt.gerendert);
t('der Gast bekommt eine Rueckmeldung', /Notiz gespeichert/.test(welt.toasts.join('|')), welt.toasts.join('|'));

welt.felder.cartNoteInput_1.value = '';
speichere('1');
t('leere Notiz entfernt sie wieder', welt.orderCart[0].notes === '', JSON.stringify(welt.orderCart[0].notes));
t('und sagt das auch', /Notiz entfernt/.test(welt.toasts.join('|')), welt.toasts.join('|'));

welt.felder.cartNoteInput_1.value = 'x'.repeat(400);
speichere('1');
t('endlos lange Notizen werden gekappt', welt.orderCart[0].notes.length === 200, welt.orderCart[0].notes.length);

speichere('gibtsnicht');
t('unbekannte Position kippt nicht', true);

// --- 4. DER WICHTIGSTE PUNKT: die Notiz kommt in der Küche an ----------------
// Eine Notiz, die der Gast schreibt und die Küche nie sieht, ist schlimmer
// als gar keine Notiz -- der Gast verlässt sich darauf.
var bestellPayloads = H.split('items: orderCart.map(item => ({');
t('die Bestellung schickt notes mit', bestellPayloads.length === 3, bestellPayloads.length - 1 + ' Stellen gefunden');
[1, 2].forEach(function (i) {
    var block = bestellPayloads[i].slice(0, 400);
    t('Payload ' + i + ' enthaelt notes', /notes: item\.notes \|\| ''/.test(block), block.slice(0, 200));
});
t('auch order_items bekommt die Notiz',
  /total_price: item\.total_price \|\| 0,\s*\n\s*notes: item\.notes \|\| '',/.test(H));
t('das Dashboard liest sie aus beiden Quellen',
  (H.match(/notes: item\.notes \|\| '',\s*\n\s*price:/g) || []).length === 2,
  (H.match(/notes: item\.notes \|\| '',\s*\n\s*price:/g) || []).length);
t('die Bestellkarte im Dashboard zeigt sie an',
  /item\.notes \? '<br><span style=&quot;font-size:12px;color:#b45309/.test(H));
t('auf dem Bon steht sie FETT (graue Kleinschrift wird ueberlesen)',
  /item\.notes \? '<br><span style="font-size:11px;font-weight:bold;"/.test(H));
// Der Warenkorb schreibt "notes", das Kassensystem las nur "note" -- genau der
// Fehler, den es bei den Größen schon gab (Küche las opt.name statt option).
t('das Kassensystem liest notes, nicht nur note',
  /note: item\.notes \|\| item\.note \|\| item\.special_request/.test(H));

// --- 5. Cross-Sell: die Zeile bleibt heil ------------------------------------
var quick = schneide('quickAddCrossSell');
t('btnEl.textContent zerstoert die Zeile nicht mehr',
  quick.indexOf("btnEl.textContent = 'Hinzugefügt'") < 0);
t('stattdessen wird nur das Plus zu einem Haken',
  /plus\[plus\.length - 1\]\.textContent = 'check'/.test(quick));
t('und die Zeile faerbt sich gruen', /rgba\(22,163,74,0\.12\)/.test(quick));
t('doppeltes Antippen wird verhindert', /pointerEvents = 'none'/.test(quick));

// --- 6. Cross-Sell: nichts blind in den Korb ---------------------------------
var braucht = new Function(schneide('_crossSellBrauchtAuswahl') + '; return _crossSellBrauchtAuswahl;')();
t('ein Gericht mit klein/gross braucht eine Auswahl',
  braucht({ sizes: [{ name: 'klein', price: 8 }, { name: 'groß', price: 10 }] }) === true);
t('ein Gericht ohne Groessen kann direkt in den Korb',
  braucht({ name: 'Cola' }) === false);
t('leere Groessenliste zaehlt nicht als Auswahl', braucht({ sizes: [] }) === false);
t('kein Gericht kippt nicht', braucht(null) === false);
t('mit Groessen wird das normale Fenster geoeffnet statt blind hinzugefuegt',
  /if \(_crossSellBrauchtAuswahl\(item\)\) \{[\s\S]{0,200}openItemOptions\(item\.id, item\)/.test(quick));

// --- 7. Keine internen Texte auf dem Bon -------------------------------------
t('"Cross-Sell Aktionspreis" landet nicht mehr als Gast-Notiz im Korb',
  quick.indexOf("notes: item._cross_sell_price ? 'Cross-Sell Aktionspreis'") < 0);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
