// ZWEI KNOEPFE HIESSEN "BON" -- UND EINER TAT NICHTS.
//
// GEMELDET WURDE
// --------------
// "es kommt kein bon raus aus dem drucker ist es auch verbunden" -- bei
// gruener Drucker-Ampel und Bestellungen, die als gedruckt markiert waren.
//
// ZWEI FEHLER UEBEREINANDER
// -------------------------
// 1. AUF DER KARTE STANDEN ZWEI KNOEPFE "BON".
//    Der eine rief printKitchenBon (Browser-Druckfenster), der andere
//    reprintBon (Freigabe fuer den Bondrucker). Beide konnten orange sein --
//    beim einen hiess orange "Kuechen-Bon", beim anderen "noch nicht
//    gedruckt". Wer den falschen erwischte, bekam ein Druckfenster statt
//    eines Bons. Oder gar nichts, wenn der Browser es blockierte.
//
// 2. DER RICHTIGE WEG TAT TROTZDEM NICHTS.
//    In dispatchPrintToAll stand fuer 'server-direct' nur:
//        success++;   // "Drucker pollt selbst -- keine aktive Aktion noetig"
//    Die Annahme: printed_at bleibe ohnehin null. Das stimmt genau einmal --
//    beim allerersten Mal. Hat der Drucker die Bestellung einmal abgeholt,
//    steht dort ein Zeitstempel, und der Knopf gibt sie nie wieder frei.
//    Gemeldet wurde trotzdem "An 1 Drucker gesendet".
//
// Wieder dieselbe Familie: Erfolg wird gemeldet, ohne dass etwas geschah.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus -- die Erklaerung im Quelltext zitiert die alten Zeilen.
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

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

// ---- 1. Nur noch EIN Knopf heisst "Bon" ------------------------------------
(function () {
    var i = CODE.indexOf('function renderDashboardOrders');
    var j = CODE.indexOf("}).join('');", i);
    var karte = i >= 0 && j > i ? CODE.slice(i, j) : '';
    t('die Bestellkarte ist gefunden worden', karte.length > 2000, karte.length);

    // Knoepfe zaehlen, deren sichtbare Beschriftung "Bon" ist.
    var bonKnoepfe = (karte.match(/>\s*Bon\s*<\/button>/g) || []).length;
    t('nur noch EIN Knopf traegt die Beschriftung "Bon"', bonKnoepfe === 1, bonKnoepfe);

    var belegKnoepfe = (karte.match(/>\s*Beleg\s*<\/button>/g) || []).length;
    t('und genau einer die Beschriftung "Beleg"', belegKnoepfe === 1, belegKnoepfe);

    t('der zweite Bon-Knopf (reprintBon direkt auf der Karte) ist weg',
      karte.indexOf('reprintBon(') < 0, 'reprintBon steht noch in der Karte');
    t('die Variable dafuer existiert nicht mehr', CODE.indexOf('var printBtn') < 0);
    t('und wird auch nicht mehr eingesetzt', karte.indexOf('${printBtn}') < 0);
})();

// ---- 2. Die Farbe hat nur noch EINE Bedeutung ------------------------------
// Vorher war orange am einen Knopf "Kuechen-Bon" und am anderen "noch nicht
// gedruckt". Jetzt: orange = ungedruckt, gruen = gedruckt. Sonst nichts.
t('die Farbe haengt am Druckstatus', /bonFarbe = printed/.test(CODE));
t('gruen steht fuer gedruckt', /printed[\s\S]{0,120}34,197,94/.test(CODE));
t('orange fuer noch nicht gedruckt', /bonFarbe[\s\S]{0,200}249,115,22/.test(CODE));
t('der Titel sagt, wann zuletzt gedruckt wurde', /Bon wurde am/.test(CODE));
t('und bei ungedruckt etwas anderes', /Bon noch nicht gedruckt/.test(CODE));

// ---- 3. Der server-direct-Zweig tut jetzt wirklich etwas -------------------
(function () {
    var f = schneide('dispatchPrintToAll');
    t('dispatchPrintToAll ist gefunden worden', f.length > 800, f.length);

    var i = f.indexOf("p.type === 'server-direct'");
    var j = f.indexOf("p.type === 'epson'");
    var zweig = i >= 0 && j > i ? f.slice(i, j) : '';
    t('der server-direct-Zweig ist gefunden worden', zweig.length > 50, zweig.length);

    t('er gibt die Bestellung wirklich frei', /bonFreigeben\(order\.id\)/.test(zweig), zweig.trim());
    t('und wartet das Ergebnis ab', /await bonFreigeben/.test(zweig));
    t('Erfolg zaehlt nur, wenn die Freigabe geklappt hat',
      /if \(frei\.ok\) success\+\+/.test(zweig), zweig.trim());
    t('ein Fehlschlag zaehlt als Fehler, nicht als Erfolg',
      /else \{ errors\+\+/.test(zweig), zweig.trim());

    // Die alte Zeile darf nicht mehr da sein: nacktes success++ ohne Tat.
    t('das nackte "success++" ohne Aktion ist weg',
      !/server-direct'\)\s*\{\s*success\+\+;/.test(zweig.replace(/\s+/g, ' ')), zweig.trim());
})();

// ---- 4. Die Freigabe ist eine eigene Funktion mit ehrlichem Ergebnis -------
(function () {
    var f = schneide('bonFreigeben');
    t('bonFreigeben existiert', f.length > 300, f.length);
    t('sie ruft den Nachdruck-Endpunkt', /action=reprint/.test(f));
    t('sie liefert bei Erfolg ok:true', /return \{ ok: true \}/.test(f));
    t('und bei Fehler einen Grund statt nur false',
      /return \{ ok: false, error:/.test(f));
    t('ohne Anmeldung sagt sie das auch', /Bitte als Gastronom einloggen/.test(f));
    t('sie ist global erreichbar -- dispatchPrintToAll steht woanders',
      /window\.bonFreigeben = bonFreigeben/.test(CODE));
})();

// ---- 5. reprintBon benutzt dieselbe Freigabe -------------------------------
// Sonst gaebe es zwei Wege, die auseinanderlaufen koennen -- und einer davon
// war ja schon still kaputt.
(function () {
    var f = schneide('reprintBon');
    t('reprintBon ist auf bonFreigeben umgestellt', /await bonFreigeben\(orderId\)/.test(f), f.trim().slice(0, 200));
    t('es baut die Anfrage nicht mehr selbst', f.indexOf('action=reprint') < 0);
    t('und meldet Erfolg nur bei ok', /if \(r\.ok\)/.test(f));
})();

// ---- 6. Der Grund steht im Quelltext ---------------------------------------
t('warum es zwei gleichnamige Knoepfe nicht mehr gibt, steht in der Datei',
  /ZWEI Knoepfe mit der Beschriftung/.test(H));
t('und warum "success\\+\\+" allein falsch war',
  /Das gilt genau\s*\n?\s*\/\/ beim ersten Mal|stimmt genau einmal/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
