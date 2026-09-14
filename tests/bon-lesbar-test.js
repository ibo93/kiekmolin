// DER BON — DREI LESER, DREI BEDUERFNISSE.
//
// Ibo am 13.09.2026: "der Bondruck muss besser sein fuer Lieferung und
// Abholer und fuer die Kueche."
//
// WAS WIRKLICH DA WAR
// -------------------
// 1. payment_method stand GAR NICHT im select von pos-print. Der ganze
//    Zahlart-Block auf dem Bon -- "BAR", "PAYPAL - ZAHLUNG PRUEFEN" --
//    war toter Code. Auf dem Papier stand nie ein Wort zur Zahlung.
// 2. Die zugesagte Uhrzeit stand nirgends. Der Gast bekommt per Mail
//    "gegen 19:20 Uhr", die Kueche wusste davon nichts.
// 3. Die Lieferadresse stand klein, in normaler Schrift, unter
//    "Adresse:". Der Fahrer liest das im dunklen Auto.
// 4. Bei Abholung stand der Name des Gastes klein unter "Kunde:". An der
//    Theke ist der Name das Einzige, was zaehlt.
// 5. Der Hinweis des Gastes stand ganz unten -- hinter Summe, Zahlart und
//    QR-Code. Der Koch liest bis zum Ende des Gerichteblocks.
//
// WARUM DIESER TEST ANDERS IST
// ----------------------------
// Die bisherigen Bon-Tests haben im Quelltext nach Zeichenketten gesucht.
// Damit kann man pruefen, dass eine Zeile dasteht -- nicht, was aus dem
// Drucker kommt. Hier wird generateEposBon() AUSGEFUEHRT und das XML in
// das umgerechnet, was auf dem Papier steht (tests/bon-vorschau.js).

var path = require('path');
var V = require(path.join(__dirname, 'bon-vorschau.js'));

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var bau = V.ladeBonBauer();

function papier(order, name) { return V.alsPapier(bau(order, name === undefined ? 'Pizzeria Pronto' : name)); }
function text(order, name) { return papier(order, name).map(function (z) { return z.text; }).join('\n'); }
function zeileVon(zeilen, teil) { return zeilen.filter(function (z) { return z.text.indexOf(teil) >= 0; })[0] || null; }
function istGross(z) { return !!z && (z.w > 1 || z.h > 1); }

var GERICHTE = [
    { quantity: 2, name: 'Pizza Salami', options: 'groß, extra Käse', notes: 'ohne Zwiebeln' },
    { quantity: 1, name: 'Tiramisu' }
];
var LIEFERUNG = {
    order_number: 'B-1042', order_type: 'delivery', created_at: '2026-09-13T17:00:00Z',
    estimated_minutes: 60, estimated_time: '2026-09-13T18:00:00Z',
    customer_name: 'Familie Janssen', customer_phone: '04941 123456',
    delivery_address: { street: 'Osterstraße', house_number: '14', zip: '26721', city: 'Emden' },
    items: GERICHTE, total: 38.5, payment_method: 'cash',
    customer_notes: 'Bitte klingeln bei Janssen'
};
var ABHOLUNG = {
    order_number: 'B-1043', order_type: 'pickup', created_at: '2026-09-13T17:00:00Z',
    estimated_minutes: 25, estimated_time: '2026-09-13T17:25:00Z',
    customer_name: 'Herr Wilts', customer_phone: '0170 9998877',
    items: GERICHTE, total: 24.5, payment_method: 'paypal', payment_status: 'paid'
};
var VOR_ORT = {
    order_number: 'B-1044', order_type: 'dine_in', created_at: '2026-09-13T17:00:00Z',
    table_number: '7', items: GERICHTE, total: 24.5
};

// ---- 1. Nichts bricht mitten im Wort um -------------------------------
console.log('\n-- Die Rolle ist 32 Zeichen breit --');
[['Lieferung', LIEFERUNG], ['Abholung', ABHOLUNG], ['Vor Ort', VOR_ORT]].forEach(function (f) {
    var zuBreitGross = papier(f[1]).filter(function (z) {
        return istGross(z) && z.w > 1 && z.text.length > 16;
    }).map(function (z) { return z.text; });
    t(f[0] + ': keine Ueberschrift bricht um', zuBreitGross.length === 0, zuBreitGross.join(' | '));
});
// Ein langer Restaurantname darf nicht mitten im Wort zerfallen.
var lang = papier(ABHOLUNG, 'Restaurant Zur Alten Mühle');
var kopfLang = zeileVon(lang, 'Alten');
t('ein langer Restaurantname wird hoch statt breit gedruckt',
  !!kopfLang && kopfLang.w === 1 && kopfLang.h === 2, kopfLang && (kopfLang.w + 'x' + kopfLang.h));
t('ein kurzer bleibt doppelt breit',
  (zeileVon(papier(ABHOLUNG), 'Pizzeria Pronto') || {}).w === 2, 'zu klein');

// ---- 2. Die zugesagte Uhrzeit ------------------------------------------
console.log('\n-- Wann muss es fertig sein --');
var zl = papier(LIEFERUNG), za = papier(ABHOLUNG);
t('Abholung: FERTIG UM steht drauf', /FERTIG UM/.test(text(ABHOLUNG)), 'fehlt');
t('mit der Uhrzeit, gross', istGross(zeileVon(za, '19:25')), 'fehlt oder klein');
t('Lieferung: LOSFAHREN UM statt FERTIG UM -- der Fahrer braucht die Abfahrt',
  /LOSFAHREN UM/.test(text(LIEFERUNG)) && !/FERTIG UM/.test(text(LIEFERUNG)), 'falsche Beschriftung');
t('und die zugesagten Minuten stehen dabei',
  /zugesagt: 60 Minuten/.test(text(LIEFERUNG)), 'fehlt');
// Ohne Zusage darf keine Uhrzeit erfunden werden.
var ohne = Object.assign({}, ABHOLUNG); delete ohne.estimated_minutes; delete ohne.estimated_time;
t('ohne Zusage steht KEINE Uhrzeit drauf -- keine erfundene Zeit',
  !/FERTIG UM/.test(text(ohne)), 'erfindet eine Zeit');
// Nur Minuten, keine Uhrzeit: dann wird sie ausgerechnet.
var nurMin = Object.assign({}, ABHOLUNG); delete nurMin.estimated_time;
t('nur Minuten gespeichert -> die Uhrzeit wird ausgerechnet',
  /17:25|19:25/.test(text(nurMin)), 'rechnet nicht');

// ---- 3. Der Fahrer -----------------------------------------------------
console.log('\n-- Der Fahrer --');
t('die Strasse steht gross drauf', istGross(zeileVon(zl, 'Osterstraße 14')), 'klein');
t('der Ort auch', istGross(zeileVon(zl, '26721 Emden')), 'klein');
t('die Telefonnummer gross -- er ruft an, wenn niemand aufmacht',
  istGross(zeileVon(zl, '04941 123456')), 'klein');
t('die Adresse ist NICHT doppelt breit -- lange Strassen wuerden umbrechen',
  (zeileVon(zl, 'Osterstraße 14') || {}).w === 1, 'bricht bei langen Strassen um');
t('der QR-Code fuer die Navigation ist dabei',
  papier(LIEFERUNG).some(function (z) { return z.qr; }), 'fehlt');
t('bei Abholung gibt es KEINEN QR-Code -- da faehrt niemand hin',
  !papier(ABHOLUNG).some(function (z) { return z.qr; }), 'unnoetiges Papier');

// ---- 4. Die Theke ------------------------------------------------------
console.log('\n-- Die Theke --');
t('bei Abholung steht der Name des Gastes gross',
  istGross(zeileVon(za, 'Herr Wilts')), 'klein oder fehlt');
t('bei Vor Ort steht der Tisch gross',
  istGross(zeileVon(papier(VOR_ORT), 'Tisch 7')), 'klein oder fehlt');
t('bei Abholung steht keine Lieferadresse', !/Osterstraße/.test(text(ABHOLUNG)));

// ---- 5. Die Kueche -----------------------------------------------------
console.log('\n-- Die Kueche --');
t('die Gerichte stehen gross', istGross(zeileVon(za, '2x Pizza Salami')), 'klein');
t('die Extras darunter', /> groß, extra Käse/.test(text(ABHOLUNG)), 'fehlen');
t('die Sonderbestellung so gross wie das Gericht -- was man ueberliest, ist wie nicht da',
  istGross(zeileVon(za, 'ohne Zwiebeln')), 'klein');
t('mit eigenem Zeichen, damit man sie nicht mit den Extras verwechselt',
  /\*\* ohne Zwiebeln/.test(text(ABHOLUNG)), 'sieht aus wie ein Extra');

// DER HINWEIS GEHOERT HINTER DIE GERICHTE, NICHT ANS ENDE.
// Der Koch liest bis zum Ende des Gerichteblocks und hoert dann auf.
var tL = text(LIEFERUNG);
t('der Hinweis des Gastes steht VOR der Summe, nicht dahinter',
  tL.indexOf('Bitte klingeln') > 0 && tL.indexOf('Bitte klingeln') < tL.indexOf('38,50'),
  'steht hinter dem Geld');
t('und ist als HINWEIS ueberschrieben', /HINWEIS/.test(tL), 'ohne Ueberschrift');

// Eine leere Liste ist keine Antwort.
var leer = Object.assign({}, ABHOLUNG, { items: [] });
t('ein Bon ohne Gerichte sagt das laut',
  /KEINE POSITIONEN/.test(text(leer)), 'sieht aus wie ein normaler Bon');

// ---- 6. Das Geld -------------------------------------------------------
console.log('\n-- Das Geld --');
t('bar: es steht da, dass kassiert wird', /BAR KASSIEREN/.test(tL), 'nur "BAR"');
t('und der Betrag gross daneben', istGross(zeileVon(zl, '38,50 EUR')), 'klein');
t('bezahltes PayPal sagt BEZAHLT', /BEZAHLT/.test(text(ABHOLUNG)), 'sagt es nicht');
t('und ausdruecklich: nichts kassieren -- sonst zahlt der Gast zweimal',
  /nichts kassieren/.test(text(ABHOLUNG)), 'jemand kassiert nach');
var ppOffen = Object.assign({}, ABHOLUNG); delete ppOffen.payment_status;
t('PayPal OHNE bestaetigte Zahlung: ZAHLUNG PRUEFEN',
  /ZAHLUNG PRUEFEN/.test(text(ppOffen)) && !/BEZAHLT/.test(text(ppOffen)), 'sieht aus wie bezahlt');
t('ohne Zahlart steht wenigstens GESAMT da',
  /GESAMT/.test(text(VOR_ORT)), 'gar nichts');

// ---- 7. Der Drucker bekommt die Spalten auch ---------------------------
console.log('\n-- Die Spalten --');
var fs = require('fs');
var POS = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'pos-print.js'), 'utf8');
['payment_method', 'payment_status', 'estimated_minutes', 'estimated_time', 'scheduled_at'].forEach(function (sp) {
    t(sp + ' wird abgefragt', new RegExp("'" + sp + "'").test(POS.slice(POS.indexOf('var zusatz = ['), POS.indexOf('var orders = null'))), 'fehlt im select');
});
t('fehlt eine davon, fliegt NUR sie raus',
  /zusatz\.splice\(zusatz\.indexOf\(fehlt\), 1\)/.test(POS), 'ganze Abfrage faellt aus');

// ---- 8. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
var cm = sw.match(/kmi-shell-v(\d+)/);
t('sie ist mindestens 35', !!cm && Number(cm[1]) >= 35, cm ? cm[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
