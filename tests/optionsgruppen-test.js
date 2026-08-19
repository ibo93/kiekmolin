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

// Seit die App das Sitzungs-Token benutzt, ruft der ausgeschnittene
// Code kmiToken(). Im Browser ist das eine globale Funktion -- hier
// gehoert sie zur nachgebauten Umgebung, genau wie sbRead oder showToast.
var KMI_STUB = 'var kmiToken = function () { return typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY '
    + ': (typeof SUPA_KEY !== "undefined" ? SUPA_KEY : "anon"); };\n';

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
        KMI_STUB + loeschen + '; return deleteOptionGroup;')(
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

// ---- 5. DER EIGENTLICHE FEHLER: die Rechte selbst --------------------------
//
// Die Punkte 1-4 sorgen dafuer, dass die App die WAHRHEIT sagt. Das behebt den
// Fehler aber nicht -- es macht ihn nur sichtbar. Behoben ist er erst, wenn in
// Supabase auch update und delete erlaubt sind.
//
// Der fertige Befehl im Dashboard vergab bisher NUR select und insert. Deshalb
// liess sich anlegen, aber nicht aendern und nicht loeschen -- exakt das, was
// gemeldet wurde. Und es fiel niemandem auf, weil Postgres bei fehlendem
// update-/delete-Recht nicht meckert: die Zeile ist fuer die Abfrage einfach
// unsichtbar, getroffen werden null Zeilen, gemeldet wird "in Ordnung".
(function () {
    var i = CODE.indexOf('var _RECHTE_SQL =');
    var sql = i < 0 ? '' : CODE.slice(i, CODE.indexOf('function _zeigeRechteHilfe', i));
    t('der fertige Supabase-Befehl ist gefunden worden', sql.length > 300, sql.length);

    ['menu_option_groups', 'menu_options'].forEach(function (tabelle) {
        ['select', 'insert', 'update', 'delete'].forEach(function (recht) {
            // Pro Tabelle und Recht muss es eine Regel geben. Vorher fehlten
            // je Tabelle update und delete -- also die Haelfte.
            var treffer = sql.split('create policy').some(function (block) {
                return block.indexOf(tabelle) >= 0 && new RegExp('for ' + recht + '\\b').test(block);
            });
            t('Recht "' + recht + '" ist fuer ' + tabelle + ' vergeben', treffer);
        });
    });

    // Beim update braucht es BEIDES: "using" entscheidet, welche Zeilen die
    // Regel sieht, "with check" prueft das Ergebnis. Fehlt using, ist die Zeile
    // unsichtbar und das update trifft nichts -- wieder still.
    sql.split('create policy').forEach(function (block) {
        if (!/for update/.test(block)) return;
        var wen = (block.match(/on (menu_\w+)/) || [])[1] || '?';
        t('das update fuer ' + wen + ' hat using UND with check',
          /using \(true\)/.test(block) && /with check \(true\)/.test(block), block.trim().slice(0, 90));
    });

    t('die Regeln gelten fuer anon -- das Dashboard schickt den anon-Key',
      (sql.match(/to anon, authenticated/g) || []).length >= 6,
      (sql.match(/to anon, authenticated/g) || []).length);

    // Der bequeme Ausweg waere "disable row level security". Der macht die
    // Tabelle fuer jeden im Internet beschreibbar -- nicht nur fuer den Wirt.
    // DER BEFEHL MUSS WIEDERHOLBAR SEIN.
    //
    // Ohne "drop policy if exists" war er beim zweiten Mal unbrauchbar -- und
    // beim ersten Mal oft auch, weil "extras lesen"/"extras anlegen" in
    // bestehenden Datenbanken schon existierten. Postgres antwortet dann
    // "policy already exists", und weil der SQL-Editor von Supabase den
    // eingefuegten Text als EINEN Block ausfuehrt, rollt eine einzige
    // abgelehnte Zeile ALLES zurueck -- auch die vier Regeln, um die es geht.
    // Der Wirt drueckt auf Run, sieht rot, und geaendert hat sich nichts.
    //
    // Dieselbe Falle wie der Fehler selbst, eine Ebene hoeher: es sieht nach
    // "erledigt" aus und hat nichts getan.
    // Im Quelltext stehen die Anfuehrungszeichen escaped: create policy \"...\"
    var angelegt = (sql.match(/create policy \\"([^"\\]+)\\" on (menu_\w+)/g) || []);
    t('es werden ueberhaupt Regeln angelegt', angelegt.length === 8, angelegt.length);
    angelegt.forEach(function (zeile) {
        var name = (zeile.match(/\\"([^"\\]+)\\"/) || [])[1];
        var tab = (zeile.match(/on (menu_\w+)/) || [])[1];
        var drop = 'drop policy if exists \\"' + name + '\\" on ' + tab + ';';
        t('vor "' + name + '" auf ' + tab + ' steht ein drop if exists',
          sql.indexOf(drop) >= 0 && sql.indexOf(drop) < sql.indexOf(zeile), drop);
    });
    t('es wird nur weggeworfen, was gleich wieder angelegt wird -- keine fremden Regeln',
      (sql.match(/drop policy if exists/g) || []).length === angelegt.length,
      (sql.match(/drop policy if exists/g) || []).length + ' drops / ' + angelegt.length + ' creates');

    // Der Wirt soll nachsehen koennen, ob es gewirkt hat, ohne dass er dafuer
    // eine zweite Abfrage von mir braucht.
    t('am Ende steht die Kontrollabfrage', /from pg_policies/.test(sql));
    t('und dabei, wie viele Zeilen herauskommen muessen', /8 Zeilen/.test(sql));

    t('RLS wird NICHT einfach abgeschaltet', !/disable row level security/i.test(sql));
    t('Lesen bleibt oeffentlich, sonst sieht der Gast keine Extras',
      /for select using \(true\)/.test(sql));
})();

// ---- 6. Der Wirt bekommt den Befehl auch zu sehen --------------------------
// Ein Toast ist nach Sekunden weg. Der Befehl muss stehen bleiben, bis er
// kopiert ist -- sonst weiss der Wirt zwar, DASS es an Supabase liegt, aber
// nicht, was er dort tun soll.
t('beim abgelehnten Loeschen wird die Rechte-Hilfe eingeblendet',
  /_zeigeOptionsRechteHilfe\('gelöscht'\)/.test(loeschen), loeschen.slice(-400));
t('beim abgelehnten Bearbeiten ebenso',
  /_zeigeOptionsRechteHilfe\('geändert'\)/.test(speichern));

// Die Aufrufe stehen in einem try -- ein ReferenceError daraus wuerde im catch
// landen und die klare Meldung durch "... is not defined" ersetzen. Genau das
// ist beim Bauen passiert, weil die Hilfe in einem anderen <script>-Block steht.
t('die Aufrufe sind gegen ReferenceError abgesichert',
  (CODE.match(/typeof _zeigeOptionsRechteHilfe === 'function'/g) || []).length === 3,
  (CODE.match(/typeof _zeigeOptionsRechteHilfe === 'function'/g) || []).length);

// Der Hinweiskasten darf NICHT in optionGroupsList liegen: nach einem
// abgelehnten Loeschen wird die Liste sofort neu geschrieben und wuerde den
// Hinweis im selben Moment wieder wegwischen.
(function () {
    var hinweis = H.indexOf('id="optionRechteHinweis"');
    var liste = H.indexOf('id="optionGroupsList"');
    t('der Hinweiskasten gibt es ueberhaupt', hinweis > 0);
    t('er steht VOR der Liste und nicht darin', hinweis > 0 && hinweis < liste, hinweis + ' / ' + liste);
    t('und die Hilfe schreibt genau dorthin',
      /_zeigeRechteHilfe\('optionRechteHinweis'/.test(CODE));
})();

// Der Wortlaut muss zu dem passen, was der Wirt gerade getan hat. Der alte Text
// endete mit "Hier noch einmal auf Diese Extras anlegen tippen" -- diesen Knopf
// gibt es im Optionen-Bereich gar nicht.
(function () {
    var i = CODE.indexOf('function _zeigeOptionsRechteHilfe');
    var f = i < 0 ? '' : CODE.slice(i, CODE.indexOf('\n}', i));
    t('der Text nennt das eigentliche Problem: anlegen geht, aendern nicht',
      /Anlegen geht/.test(f), f.slice(0, 200));
    t('und schickt nicht zu einem Knopf, den es hier nicht gibt',
      !/Diese Extras anlegen/.test(f));
    t('der Karten-Import behaelt seinen eigenen Wortlaut',
      /Die Datenbank lässt keine Extras zu\./.test(CODE) && /Diese Extras anlegen/.test(CODE));
})();
