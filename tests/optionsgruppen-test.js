// GELOESCHT, GESPEICHERT -- UND ALLES KOMMT ZURUECK.
//
// GEMELDET WURDE
// --------------
// Bildschirmfoto des Admin-Bereichs "Optionen & Extras":
// "ich kann hier nichts, wenn ich die sachen lösche oder bearbeite kommen
//  die wieder zurück...."
//
// WAS DAHINTERSTECKT -- ZWEIMAL DIESELBE FAMILIE
// -----------------------------------------------
// 1. LOESCHEN. Die alte Fassung schickte das DELETE und meldete danach
//    sofort "Optionsgruppe gelöscht" -- ohne nachzusehen, OB etwas weg ist.
//    Ein DELETE, das keine Zeile trifft, ist fuer die Datenbank kein
//    Fehler: sie antwortet "in Ordnung, nichts zu tun". Genau das passiert,
//    wenn eine Zugriffsregel in Supabase das Loeschen nicht erlaubt -- die
//    Zeile ist fuer die Abfrage schlicht nicht da. sbWrite kann das nicht
//    merken, es gibt ja keinen Fehler.
//
// 2. BEARBEITEN. Dort stand:
//        var groupId = editId || (saved[0] ? saved[0].id : null);
//    Beim Bearbeiten war groupId damit IMMER gesetzt -- einfach die ID, mit
//    der man hereingekommen ist. Ob die Datenbank die Aenderung angenommen
//    hat, wurde nie gelesen: weder res.ok noch die Antwort. Wurde sie
//    abgelehnt, lief alles weiter, die Meldung sagte "aktualisiert", und
//    nach dem Neuladen stand der alte Name wieder da.
//
// Beide Male wurde Erfolg behauptet, ohne nachzusehen. Dass die Sachen
// "wiederkommen", war kein Fehler der Liste -- sie waren nie weg.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare raus -- die Erklaerung im Quelltext zitiert die alte Zeile.
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

// ---- 1. Loeschen -----------------------------------------------------------
var loeschen = schneide('deleteOptionGroup');
t('das Loeschen ist gefunden worden', loeschen.length > 400, loeschen.length);
t('die Datenbank wird gefragt, WAS sie geloescht hat',
  /'Prefer': 'return=representation'/.test(loeschen));
t('die Antwort wird auch gelesen', /weg = await res\.json\(\)/.test(loeschen));
t('eine leere Antwort gilt als NICHT geloescht',
  /if \(!Array\.isArray\(weg\) \|\| weg\.length === 0\)/.test(loeschen));
t('und dann steht kein "gelöscht" mehr da',
  /Die Gruppe konnte nicht gelöscht werden/.test(loeschen));
t('der Wirt erfaehrt, dass es an einer Berechtigung liegt und nicht an ihm',
  /kein Fehler in der Eingabe/.test(loeschen));

// Die Reihenfolge muss stimmen: erst pruefen, dann Erfolg melden.
t('der Erfolgston kommt NACH der Pruefung',
  loeschen.indexOf('weg.length === 0') < loeschen.indexOf("showToast('Optionsgruppe gelöscht'"),
  loeschen.indexOf('weg.length === 0') + ' / ' + loeschen.indexOf("showToast('Optionsgruppe gelöscht'"));

// Wirklich ausfuehren -- beide Faelle.
function laufLoeschen(antwort) {
    var meldungen = [];
    var f = new Function('SUPABASE_URL', 'SUPABASE_KEY', 'sbWrite', 'kinConfirm',
        'showToast', 'loadOptionGroups', 'loadMenuOptionGroups',
        loeschen + '; return deleteOptionGroup;')(
        'https://x', 'k',
        function () { return Promise.resolve({ json: function () { return Promise.resolve(antwort); } }); },
        function () { return Promise.resolve(true); },
        function (text, art) { meldungen.push((art || 'info') + ': ' + text); },
        function () {}, function () {});
    return f('g1').then(function () { return meldungen; });
}

var offen = 2;
function fertig() {
    if (--offen > 0) return;
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
}

laufLoeschen([]).then(function (m) {
    t('nichts geloescht: der Wirt bekommt einen Fehler, keinen Erfolg',
      m.length === 1 && m[0].indexOf('error:') === 0, m.join(' | '));
    t('und das Wort "gelöscht" als Erfolg faellt weg',
      m.join(' ').indexOf('success:') < 0, m.join(' | '));
    fertig();
});

laufLoeschen([{ id: 'g1' }]).then(function (m) {
    t('wirklich geloescht: dann steht der Erfolg auch da',
      m.length === 1 && m[0] === 'success: Optionsgruppe gelöscht', m.join(' | '));
    fertig();
});

// ---- 2. Bearbeiten ---------------------------------------------------------
var speichern = schneide('saveOptionGroup');
t('das Speichern ist gefunden worden', speichern.length > 800, speichern.length);
t('die alte Zeile, die beim Bearbeiten immer durchliess, ist weg',
  !/var groupId = editId \|\| \(saved\[0\] \? saved\[0\]\.id : null\);\s*\n\s*\n?\s*if \(!groupId\) \{ showToast\('Fehler beim Speichern'/.test(speichern));
t('res.ok wird geprueft, bevor irgendetwas weiterlaeuft',
  /if \(!res\.ok\) \{/.test(speichern));
t('der Grund aus der Datenbank wird mitgegeben, statt nur "Fehler"',
  /saved\.message \|\| saved\.hint \|\| saved\.details/.test(speichern));
t('beim Bearbeiten gilt eine leere Antwort als NICHT uebernommen',
  /if \(editId && \(!Array\.isArray\(saved\) \|\| saved\.length === 0\)\)/.test(speichern));
t('und der Wirt erfaehrt auch hier den wahren Grund',
  /die Datenbank hat die Zeile nicht \n?\s*\+ 'freigegeben/.test(speichern)
  || /Die Änderung wurde nicht übernommen/.test(speichern));

// Die Pruefungen muessen VOR dem Loeschen der alten Optionen stehen --
// sonst sind die Optionen weg, obwohl die Gruppe unveraendert blieb.
t('geprueft wird, BEVOR die alten Optionen geloescht werden',
  speichern.indexOf('if (!res.ok)') < speichern.indexOf("rest/v1/menu_options?group_id=eq."),
  speichern.indexOf('if (!res.ok)') + ' / ' + speichern.indexOf('rest/v1/menu_options?group_id=eq.'));
t('und bevor "aktualisiert" gemeldet wird',
  speichern.indexOf('saved.length === 0') < speichern.indexOf("'Optionsgruppe aktualisiert'"));

// ---- 3. Gegenprobe ---------------------------------------------------------
(function () {
    var alt = "var groupId = editId || (saved[0] ? saved[0].id : null);";
    t('Gegenprobe: die alte Zeile allein liesse jedes abgelehnte PATCH durch',
      (function () { var editId = 'g1', saved = []; return !!(editId || (saved[0] ? saved[0].id : null)); })() === true);
})();

// ---- 4. Der Grund steht im Quelltext ---------------------------------------
t('warum ein erfolgloses DELETE kein Fehler ist, steht in der Datei',
  /in Ordnung, nichts zu tun/.test(H));
t('und warum beim Bearbeiten nie etwas auffiel',
  /Ob die Datenbank die Aenderung/.test(H));
