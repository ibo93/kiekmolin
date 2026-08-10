// Der neue Menüscanner: die Weg-Auswahl wird WIRKLICH durchlaufen.
//
// Nachgebaut ist nur die Umgebung (DOM, pdf.js, Modell) -- der Code kommt
// unverändert aus index.html. Eingabe ist die echte pdf.js-Ausgabe der Karte
// "Pronto Pronto, Riepe".
//
// Geprüfte Zusage, an der früher alles hängengeblieben ist:
// hat ein PDF echten Text, wird NIEMALS ein Modell gefragt -- auch dann nicht,
// wenn eines bereitsteht.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var SEITEN = JSON.parse(fs.readFileSync('/home/user/kiekmolin/tests/daten/pronto-pdfjs.json', 'utf8'));

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); }
    }
    throw new Error('Klammern offen: ' + name);
}
var vorspann = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);

// --- Nachgebaute Umgebung ---------------------------------------------------
function umgebung(o) {
    var el = {};
    function feld(id) { return el[id] = el[id] || { id: id, style: {}, textContent: '', value: '', innerHTML: '' }; }
    ['menuScanPreview', 'menuScanProgress', 'menuScanStatus', 'menuScanUploadArea',
     'menuScanResults', 'menuScanCount', 'menuScanItemsList', 'menuScanTextInput'].forEach(feld);
    return {
        document: { getElementById: function (id) { return el[id] || null; } },
        el: el,
        toasts: [],
        modellAufrufe: 0
    };
}

async function lauf(o) {
    var u = umgebung();
    var quelle = vorspann + '\n'
        + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems', '_nrWert',
           'sortiereNachNummer', 'extrasZuGruppen', 'zutatenAusKategorie', 'extrasMitZutaten',
           'extrasAufAlleKategorien', 'leseKartePdf', 'startMenuScan'].map(schneide).join('\n');
    var f = new Function('umw', 'return (async function () {\n'
        + 'var document = umw.document, showToast = umw.showToast;\n'
        + 'var menuScanImageData = umw.datei, menuScanFileType = umw.typ;\n'
        + 'var scannedMenuItems = [], window = umw.window;\n'
        + 'var pdfTextSeiten = umw.pdfTextSeiten, convertPdfAllPages = umw.convertPdfAllPages;\n'
        + 'var splitImageVertically = umw.splitImageVertically;\n'
        + 'var ladeVorhandeneKategorien = umw.ladeVorhandeneKategorien;\n'
        + 'var leseKarteKI = umw.leseKarteKI, showScannedResults = umw.showScannedResults;\n'
        + 'var startMenuScanTesseract = umw.startMenuScanTesseract;\n'
        + 'var showMenuScanWarningIfAny = function () {};\n'
        + 'var currentMenuRestaurant = null, RESTAURANT_ID = null;\n'
        + quelle + '\n'
        + 'await startMenuScan();\n'
        + 'return { items: scannedMenuItems, fenster: window };\n})();');

    var umw = {
        document: u.document,
        window: {},
        datei: 'data:application/pdf;base64,XX',
        typ: o.typ || 'pdf',
        showToast: function (m, a) { u.toasts.push({ text: m, art: a }); },
        pdfTextSeiten: async function () { return o.pdfText; },
        convertPdfAllPages: async function () { u.bilderGebaut = true; return ['bild1']; },
        splitImageVertically: async function () { return ['bild1']; },
        ladeVorhandeneKategorien: async function () { return []; },
        leseKarteKI: async function () {
            u.modellAufrufe++;
            return { items: [{ name: 'Aus der KI', price: 1, category: 'X', selected: true }],
                     fehlSeiten: 0, ersterFehler: null, pruefung: {},
                     bericht: { quelle: 'KI (test)', modell: 'test' } };
        },
        showScannedResults: function () { u.ergebnisGezeigt = true; },
        startMenuScanTesseract: async function () { u.ocrGelaufen = true; }
    };
    var r = await f(umw);
    u.items = r.items; u.fenster = r.fenster;
    return u;
}

(async function () {
    var echterText = null;

    // Der PDF-Text, wie ihn der Browser wirklich bekommt.
    var pdfSeiteZuText = new Function(schneide('pdfSeiteZuText') + '; return pdfSeiteZuText;')();
    echterText = SEITEN.map(function (s) { return pdfSeiteZuText(s.items, s.w); });

    // --- WEG 1: PDF mit Text -------------------------------------------------
    var a = await lauf({ typ: 'pdf', pdfText: echterText });
    t('PDF mit Text: KEIN Modell wird gefragt', a.modellAufrufe === 0, a.modellAufrufe + ' Aufrufe');
    t('PDF mit Text: keine Bilder gebaut (kein Umweg ueber Zeichenerkennung)',
      !a.bilderGebaut, 'Bilder wurden gebaut');
    t('PDF mit Text: keine Texterkennung', !a.ocrGelaufen, 'OCR lief');
    // Eine kleine Karte muss genauso durchkommen wie eine große.
    var klein = await lauf({ typ: 'pdf', pdfText: ['## Kuchen\nApfelkuchen 3,80 €\nKäsekuchen 4,20 €'] });
    t('kleine Karte (2 Gerichte) kommt ohne KI durch',
      klein.modellAufrufe === 0 && klein.items.length === 2,
      klein.modellAufrufe + ' Aufrufe, ' + klein.items.length + ' Gerichte');

    t('PDF mit Text: 142 Gerichte (Groessen als Auswahl, nicht als eigene Gerichte)',
      a.items.length === 142, a.items.length);
    t('PDF mit Text: Ergebnis wird angezeigt', a.ergebnisGezeigt === true, 'nicht angezeigt');
    t('PDF mit Text: Bericht sagt "ohne KI"',
      (a.fenster._scanBericht || {}).quelle === 'PDF-Text, ohne KI',
      JSON.stringify((a.fenster._scanBericht || {}).quelle));
    t('PDF mit Text: Meldung nennt den Weg',
      a.toasts.some(function (x) { return /ohne KI/.test(x.text); }), JSON.stringify(a.toasts));
    var kats = {};
    a.items.forEach(function (i) { kats[i.category] = 1; });
    t('PDF mit Text: 13 Kategorien', Object.keys(kats).length === 13, Object.keys(kats).join(' | '));
    t('PDF mit Text: Extras werden mitgenommen',
      Array.isArray(a.fenster._scanExtras), JSON.stringify(a.fenster._scanExtras));

    // --- WEG 2: PDF ohne Text (eingescannt) ----------------------------------
    var b = await lauf({ typ: 'pdf', pdfText: null });
    t('PDF ohne Text: Modell uebernimmt', b.modellAufrufe === 1, b.modellAufrufe + ' Aufrufe');
    t('PDF ohne Text: Bilder werden gebaut', b.bilderGebaut === true, 'keine Bilder');
    t('PDF ohne Text: Grund steht auf dem Bildschirm',
      /enthaelt keinen Text|keinen Text/.test(b.el.menuScanStatus.textContent),
      b.el.menuScanStatus.textContent);

    // --- Text da, aber KEIN Gericht: NICHT still zum Modell ------------------
    // Die Schwelle lag früher bei fünf Gerichten -- damit fiel jede kleine
    // Karte auf den KI-Weg zurück, obwohl ihr Text vollständig da war.
    // Jetzt gilt: ein einziges gefundenes Gericht beweist, dass der Text
    // lesbar ist. Nur wenn gar keins gefunden wird, stimmt etwas nicht --
    // und dann gehört der Rohtext auf den Bildschirm, nicht ein stiller
    // Wechsel zum Modell.
    var c = await lauf({ typ: 'pdf', pdfText: ['## Speisekarte\nHier steht nur Fliesstext ohne jeden Preis\nund noch eine Zeile' + ' x'.repeat(200)] });
    t('Text da, kein Gericht: kein stiller Wechsel zum Modell',
      c.modellAufrufe === 0, c.modellAufrufe + ' Aufrufe');
    t('Text da, kein Gericht: Rohtext landet im Textfeld',
      c.el.menuScanTextInput.value.length > 0, 'Textfeld leer');
    t('Text da, kein Gericht: der Gastronom bekommt eine Ansage',
      c.toasts.some(function (x) { return x.art === 'warning'; }), JSON.stringify(c.toasts));

    // --- WEG 3: Foto ---------------------------------------------------------
    var d = await lauf({ typ: 'image', pdfText: null });
    t('Foto: Modell uebernimmt', d.modellAufrufe === 1, d.modellAufrufe + ' Aufrufe');
    t('Foto: PDF-Weg wird gar nicht erst versucht',
      !/PDF wird gelesen/.test(d.el.menuScanStatus.textContent), d.el.menuScanStatus.textContent);

    // --- Der Weg steht über dem Ergebnis ------------------------------------
    t('Ergebnisseite zeigt den Weg ganz oben',
      /WELCHER WEG GELAUFEN IST/.test(H) && /Direkt aus dem PDF gelesen — ohne KI/.test(H));
    t('drei Wege sind unterscheidbar beschriftet',
      /Von der KI gelesen/.test(H) && /Nur Texterkennung/.test(H));

    // --- Aufbau --------------------------------------------------------------
    t('Weg-Auswahl ist kurz geblieben (unter 6000 Zeichen)',
      schneide('startMenuScan').length < 6000, schneide('startMenuScan').length);
    t('PDF-Weg ist eine eigene Funktion', /async function leseKartePdf/.test(H));
    t('KI-Weg ist eine eigene Funktion', /async function leseKarteKI/.test(H));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
