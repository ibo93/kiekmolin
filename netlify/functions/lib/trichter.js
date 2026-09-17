// DER GASTTRICHTER -- wo die Gaeste abspringen.
//
// WARUM ES DIESE DATEI GIBT
// Am 14.09.2026 hatte ich im Protokoll 1.902 Speisekarten-Abrufe und 114
// Bestellungen und war kurz davor, daraus "6 %" zu machen. Das waere
// falsch gewesen: ein Gast loest mehrere Abrufe aus, das Dashboard laedt
// die Karte auch mit, und der Drucker fragt dauernd nach. 1.902 ist keine
// Gaestezahl.
//
// Darum zaehlt der Trichter BESUCHE, nicht Abrufe -- eine Zufallsnummer
// pro Browser-Sitzung, drei Schritte, jeder Schritt hoechstens einmal.
//
// Und darum liegt das Rechnen hier und nicht im Bericht: so laesst es
// sich pruefen, ohne Mails zu verschicken.

var SCHRITTE = ['karte', 'warenkorb', 'bestellt'];

// Unter so vielen Besuchen wird KEINE Quote gebildet.
//
// Bei 4 Besuchen und 1 Bestellung stuenden "25 %" im Bericht. Naechste
// Woche 5 und 1, dann sind es "20 %", und Ibo sucht nach einem Grund fuer
// einen Einbruch, den es nicht gab. Eine Zahl, die bei jedem Gast um
// Prozentpunkte springt, ist keine Auskunft -- sie ist Rauschen mit
// Nachkommastelle.
var GENUG = 20;

function zaehlen(zeilen) {
    var gesehen = { karte: {}, warenkorb: {}, bestellt: {} };
    (Array.isArray(zeilen) ? zeilen : []).forEach(function (z) {
        if (!z || SCHRITTE.indexOf(z.schritt) < 0) return;
        var b = String(z.besuch || '');
        if (!b) return;
        gesehen[z.schritt][b] = true;
    });
    return {
        karte:     Object.keys(gesehen.karte).length,
        warenkorb: Object.keys(gesehen.warenkorb).length,
        bestellt:  Object.keys(gesehen.bestellt).length
    };
}

// Die Zeilen EINES Hauses. Steht bewusst hier und nicht im Bericht:
// dort war es eine Zeile unter vielen, die genauso aussah wie die
// Filterzeile fuer Reservierungen -- und mein Test hat beim Gegenpruefen
// die falsche erwischt und blieb gruen. Hier laesst es sich ausfuehren.
function fuerHaus(zeilen, hausId) {
    if (!hausId) return [];
    return (Array.isArray(zeilen) ? zeilen : []).filter(function (z) {
        return z && z.restaurant_id === hausId;
    });
}

function prozent(teil, ganz) {
    if (!(ganz > 0)) return null;
    return Math.round((teil / ganz) * 100);
}

function auswerten(zeilen) {
    var z = zaehlen(zeilen);
    return {
        karte:     z.karte,
        warenkorb: z.warenkorb,
        bestellt:  z.bestellt,
        genug:     z.karte >= GENUG,
        quoteWarenkorb: z.karte >= GENUG ? prozent(z.warenkorb, z.karte) : null,
        quoteBestellt:  z.karte >= GENUG ? prozent(z.bestellt,  z.karte) : null
    };
}

// Der Satz, der in die Mail geht -- oder null, wenn es nichts zu sagen gibt.
//
// null heisst: die Zeile faellt weg. Lieber kein Abschnitt als einer, in
// dem "0 %" steht, weil die Tabelle noch leer ist -- das saehe aus wie ein
// Einbruch und waere nur ein fehlendes SQL.
function satz(zeilen) {
    var a = auswerten(zeilen);
    if (!a.karte) return null;
    if (!a.genug) {
        return a.karte + (a.karte === 1 ? ' Gast hat' : ' Gäste haben')
             + ' die Karte geöffnet. Für eine Quote '
             + 'sind das noch zu wenige – ab ' + GENUG + ' rechne ich sie aus.';
    }
    return 'Von ' + a.karte + ' Gästen, die die Karte geöffnet haben, haben '
         + a.warenkorb + ' etwas in den Warenkorb gelegt (' + a.quoteWarenkorb + ' %) '
         + 'und ' + a.bestellt + ' bestellt (' + a.quoteBestellt + ' %).';
}

// Wo der groesste Absprung ist. Das ist die eigentliche Auskunft:
// "Karte angesehen, nichts genommen" braucht eine andere Antwort als
// "Warenkorb voll, dann weg" (Versandkosten? Mindestbestellwert?).
function absprung(zeilen) {
    var a = auswerten(zeilen);
    if (!a.genug) return null;
    var vorKorb = a.karte - a.warenkorb;
    var imKorb  = a.warenkorb - a.bestellt;
    if (vorKorb <= 0 && imKorb <= 0) return null;
    if (vorKorb >= imKorb) {
        return vorKorb + (vorKorb === 1 ? ' Gast hat' : ' Gäste haben')
             + ' die Karte angesehen und nichts ausgewählt.';
    }
    return imKorb + (imKorb === 1 ? ' Gast hatte' : ' Gäste hatten')
         + ' den Warenkorb voll und ' + (imKorb === 1 ? 'hat' : 'haben')
         + ' dann doch nicht bestellt – dort liegt gerade der größte Verlust.';
}

module.exports = { SCHRITTE: SCHRITTE, GENUG: GENUG, zaehlen: zaehlen, fuerHaus: fuerHaus,
                   auswerten: auswerten, satz: satz, absprung: absprung };
