// UMLAUTE IN DEN VERTRAGSTEXT -- Wort fuer Wort, nicht per Regex.
//
// Ibo am 25.09.2026, nachdem er das PDF gesehen hat: "ja mach sauber".
//
// WARUM KEIN MUSTER
// =================
// Gemessen: 114 Woerter im Vertragstext enthalten ae, oe, ue oder ss.
// Davon duerfen SIEBZEHN sich NICHT aendern -- in ihnen steht die
// Buchstabenfolge zufaellig:
//
//     Dauer        (Da-ue-r)      aktuell       (akt-ue-ll)
//     vertrauen    (vertra-ue-n)  Umsatzsteuer  (Umsatzste-ue-r)
//     Adresse, muss, sodass, Gerichtsstand -- dort ist ss richtig
//     muss, sodass, Gerichtsstand, Kassensystem, Anpassung ...
//
// Ein "ue -> ü" ueber die ganze Datei haette daraus "Daür", "aktüll"
// und "vertraün" gemacht. In einem Vertrag, den ein Kunde unterschreibt.
//
// Deshalb steht unten jedes Wort einzeln da. Was nicht in der Liste
// steht, wird nicht angefasst -- und das Werkzeug meldet am Ende, ob
// etwas uebrig blieb, das es nicht kennt.
//
// NUR DIE VERTRAGSTEXTE, NICHT DIE KOMMENTARE
// ===========================================
// Gearbeitet wird ausschliesslich zwischen den $text$-Marken. Die
// Kommentare der SQL-Datei bleiben in ASCII -- das ist Konvention im
// Projekt (siehe tests/umlaute-test.js) und der Gast liest sie nie.
//
// AUFRUF
//   node werkzeug/vertrag-umlaute.js           zeigt nur, was es taete
//   node werkzeug/vertrag-umlaute.js --schreiben   schreibt

'use strict';

var fs = require('fs');
var path = require('path');
var DATEI = path.join(__dirname, '..', 'datenbank', '32-vertrag.sql');

// ---- Was gleich bleibt. Hier steht die Buchstabenfolge zufaellig. ----
var UNVERAENDERT = [
    'Adresse', 'Anpassung', 'Dauer', 'Erfassung', 'Gerichtsstand',
    'Kassensystem', 'Schlussbestimmungen', 'aktuell', 'angemessenen',
    'angemessener', 'angepasst', 'anpassen', 'ausgeschlossen', 'aussetzen',
    'muss', 'sodass', 'vertrauen', 'Angemessenheitsbeschluss',
    'Umsatzsteuer'
];

// ---- Und hier jedes Wort, das sich aendert. ----
var ERSETZEN = {
    'Aenderung': 'Änderung', 'Aenderungen': 'Änderungen',
    'Ankuendigung': 'Ankündigung', 'Ankuendigungsfrist': 'Ankündigungsfrist',
    'Ansprueche': 'Ansprüche', 'Antraegen': 'Anträgen',
    'Ausfuehrung': 'Ausführung', 'Beschaeftigte': 'Beschäftigte',
    'Bestaetigung': 'Bestätigung', 'Bestaetigungs': 'Bestätigungs',
    'Durchfuehrung': 'Durchführung', 'Erfuellung': 'Erfüllung',
    'Ergaenzungen': 'Ergänzungen', 'Fahrlaessigkeit': 'Fahrlässigkeit',
    'Fuer': 'Für', 'Gaeste': 'Gäste', 'Gaesten': 'Gästen',
    'Geraet': 'Gerät', 'Getraenke': 'Getränke', 'Haelt': 'Hält',
    'Hinzufuegung': 'Hinzufügung', 'Hoehe': 'Höhe',
    'Koerper': 'Körper', 'Kuendigung': 'Kündigung',
    'Loeschkonzept': 'Löschkonzept', 'Loeschung': 'Löschung',
    'Massnahmen': 'Maßnahmen', 'Oeffnungszeiten': 'Öffnungszeiten',
    'Pruefung': 'Prüfung', 'Rueckgabe': 'Rückgabe',
    'Schluessel': 'Schlüssel', 'Sondervermoegen': 'Sondervermögen',
    'Sonderwuensche': 'Sonderwünsche', 'Stoerungen': 'Störungen',
    'Uebergabe': 'Übergabe', 'Uebermittlungsgrundlage': 'Übermittlungsgrundlage',
    'Uebertragungen': 'Übertragungen', 'Uebrigen': 'Übrigen',
    'Umsaetzen': 'Umsätzen',
    'Unterstuetzung': 'Unterstützung', 'Verfuegbarkeit': 'Verfügbarkeit',
    'Verfuegung': 'Verfügung', 'Verguetung': 'Vergütung',
    'Verschluesselung': 'Verschlüsselung', 'Vertraege': 'Verträge',
    'Widerspruechen': 'Widersprüchen', 'Zugaenge': 'Zugänge',
    'Zugriffsbeschraenkung': 'Zugriffsbeschränkung',
    'ausschliesslich': 'ausschließlich', 'ausserhalb': 'außerhalb',
    'ausserordentlichen': 'außerordentlichen', 'beduerfen': 'bedürfen',
    'begruenden': 'begründen', 'betraegt': 'beträgt',
    'einschliesslich': 'einschließlich', 'ergaenzen': 'ergänzen',
    'ermoeglicht': 'ermöglicht', 'faellig': 'fällig', 'fuer': 'für',
    'gaengigen': 'gängigen', 'geloescht': 'gelöscht', 'genuegt': 'genügt',
    'haelt': 'hält', 'hoehere': 'höhere', 'koennen': 'können',
    'kuendigen': 'kündigen', 'laeuft': 'läuft', 'loescht': 'löscht',
    'moeglichst': 'möglichst', 'oeffentlich': 'öffentlich',
    'oeffentliche': 'öffentliche', 'oeffentlichen': 'öffentlichen',
    'ordnungsgemaesse': 'ordnungsgemäße', 'pruefen': 'prüfen',
    'prueft': 'prüft', 'regelmaessig': 'regelmäßig',
    'regelmaessige': 'regelmäßige', 'saemtlicher': 'sämtlicher',
    'schliesst': 'schließt', 'spaetestens': 'spätestens',
    'stoeren': 'stören', 'ueber': 'über', 'ueberhaupt': 'überhaupt',
    'ueberschreiten': 'überschreiten', 'ueberzeugen': 'überzeugen',
    'unabhaengig': 'unabhängig', 'unberuehrt': 'unberührt',
    'unbeschraenkt': 'unbeschränkt', 'unterstuetzt': 'unterstützt',
    'unterstuetztes': 'unterstütztes', 'unverzueglich': 'unverzüglich',
    'unzulaessig': 'unzulässig', 'urspruengliche': 'ursprüngliche',
    'verguetungsfrei': 'vergütungsfrei', 'waehrend': 'während'
};

// Nur Woerter ersetzen, die GANZ so dastehen. Sonst wuerde in
// "Gaestezimmer" mitten im Wort ersetzt und der Rest bliebe haengen.
function umlaute(text) {
    var neu = text;
    Object.keys(ERSETZEN).sort(function (a, b) { return b.length - a.length; })
        .forEach(function (alt) {
            neu = neu.replace(new RegExp('\\b' + alt + '\\b', 'g'), ERSETZEN[alt]);
        });
    return neu;
}

// Welche Woerter im URSPRUENGLICHEN Text kenne ich nicht?
//
// Absichtlich auf dem Text VOR der Ersetzung. Beim ersten Versuch lief
// diese Pruefung hinterher -- und meldete "Schluessel", "unzulaessig"
// und "ausschliesslich" als unbekannt, nachdem sie schon richtig
// geschrieben waren: "Schlüssel" und "unzulässig" enthalten voellig zu
// Recht ein ss. Die Frage, um die es geht, lautet: habe ich ein Wort
// uebersehen -- und die stellt sich am Original.
function unbekannte(text) {
    var treffer = text.match(/[A-Za-zÄÖÜäöüß]*(ae|oe|ue|Ae|Oe|Ue|ss)[A-Za-zÄÖÜäöüß]*/g) || [];
    return [...new Set(treffer)].filter(function (w) {
        return UNVERAENDERT.indexOf(w) < 0 && !ERSETZEN[w];
    });
}

// Und hinterher: ist wirklich keine der ASCII-Schreibweisen uebrig?
// Nach ss wird hier NICHT gesucht -- das ist im Deutschen richtig.
function restliche(text) {
    return Object.keys(ERSETZEN).filter(function (alt) {
        // Ein Eintrag, der auf sich selbst zeigt, waere hier ewig
        // "uebrig". Am 25.09.2026 genau so passiert: 'Umsatzsteuer'
        // stand in der Liste, obwohl das Wort gar keinen Umlaut hat.
        if (ERSETZEN[alt] === alt) return false;
        return new RegExp('\\b' + alt + '\\b').test(text);
    });
}

function lauf(schreiben) {
    var roh = fs.readFileSync(DATEI, 'utf8');
    var teile = roh.split('$text$');
    // $text$ ... $text$ ... $text$ ... $text$  -> die Texte stehen auf
    // den ungeraden Plaetzen. Alles andere ist SQL und Kommentar.
    if (teile.length < 5) {
        console.error('Erwartet zwei $text$-Bloecke, gefunden: ' + Math.floor((teile.length - 1) / 2));
        process.exitCode = 1;
        return;
    }

    var offen = [], uebrig = [], geaendert = 0;
    for (var i = 1; i < teile.length; i += 2) {
        var vorher = teile[i];
        offen = offen.concat(unbekannte(vorher));   // am ORIGINAL fragen
        teile[i] = umlaute(vorher);
        if (teile[i] !== vorher) geaendert++;
        uebrig = uebrig.concat(restliche(teile[i]));
    }
    var neu = teile.join('$text$');

    var vorherZahl = (roh.match(/[A-Za-zÄÖÜäöüß]*(ae|oe|ue)[A-Za-zÄÖÜäöüß]*/g) || []).length;
    console.log('Bloecke geaendert: ' + geaendert + ' von ' + Math.floor((teile.length - 1) / 2));
    console.log('Umlaute jetzt im Text: '
        + ((neu.split('$text$')[1] + neu.split('$text$')[3]).match(/[äöüßÄÖÜ]/g) || []).length);

    if (offen.length) {
        console.log('\nUNBEKANNT -- bitte ansehen und in eine der beiden Listen aufnehmen:');
        console.log('  ' + [...new Set(offen)].join(', '));
        process.exitCode = 1;
    } else {
        console.log('Jedes betroffene Wort ist in einer der beiden Listen.');
    }

    if (uebrig.length) {
        console.error('ABBRUCH: nach der Ersetzung steht noch ASCII da: '
            + [...new Set(uebrig)].join(', '));
        process.exitCode = 1;
        return;
    }

    // NUR die Texte duerfen sich aendern. Sonst haette das Werkzeug
    // versehentlich SQL oder Kommentare angefasst.
    var sqlVorher = roh.split('$text$').filter(function (_, i) { return i % 2 === 0; }).join('');
    var sqlNachher = neu.split('$text$').filter(function (_, i) { return i % 2 === 0; }).join('');
    if (sqlVorher !== sqlNachher) {
        console.error('ABBRUCH: ausserhalb der Texte wurde etwas veraendert.');
        process.exitCode = 1;
        return;
    }
    console.log('SQL und Kommentare unveraendert.');

    if (schreiben) {
        fs.writeFileSync(DATEI, neu, 'utf8');
        console.log('Geschrieben: ' + DATEI);
    } else {
        console.log('(Probelauf -- mit --schreiben wird geschrieben.)');
    }
}

if (require.main === module) lauf(process.argv.indexOf('--schreiben') >= 0);
module.exports = { umlaute: umlaute, unbekannte: unbekannte, restliche: restliche,
                   ERSETZEN: ERSETZEN, UNVERAENDERT: UNVERAENDERT };
