// RENNER & PENNER -- was laeuft, was steht rum.
//
// WAS VORHER DA WAR
// -----------------
// "Bestseller": die Top 5 nach Anzahl, gerechnet aus den Bestellungen. Die
// halbe Auswertung -- und die unwichtigere Haelfte fehlte.
//
// Wer wissen will, was von der Karte FLIEGT, braucht die Gerichte, die nicht
// verkauft wurden. Genau die konnten dort prinzipiell nie auftauchen: die
// Liste entstand aus Bestellungen, ein Gericht mit null Verkaeufen kommt darin
// gar nicht vor. Kein Rechenfehler -- ein blinder Fleck.
//
// Diese Datei haelt vor allem die zwei Ehrlichkeitsregeln fest. Eine
// Penner-Liste, die aus vier Bestellungen ein Urteil faellt, ist schlimmer als
// keine: der Gastronom nimmt ein Gericht von der Karte, das nie eine Chance
// hatte.
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

var F = new Function(
    'var AUSWERTUNG_MIN_BESTELLUNGEN = 10, AUSWERTUNG_NEU_TAGE = 21;\n'
    + schneide('auswerteGerichte') + '\n' + schneide('_auswertungHtml')
    + '; return { werte: auswerteGerichte, html: _auswertungHtml };')();

var HEUTE = '2026-08-09T12:00:00Z';

// Positionspreis = Gesamtpreis der Position, Menge steckt schon drin --
// so liefert das Dashboard die Bestellungen (order_items.total_price).
function best(gerichte, status) {
    return { status: status || 'completed',
             items: gerichte.map(function (g) { return { name: g[0], quantity: g[1], price: g[2] }; }) };
}

var KARTE = [
    { name: 'Pizza Margherita', created_at: '2025-01-01' },
    { name: 'Pizza Salami',     created_at: '2025-01-01' },
    { name: 'Döner Teller',     created_at: '2025-01-01' },
    { name: 'Lachsfilet',       created_at: '2025-01-01' },   // verkauft sich nie
    { name: 'Rote Grütze',      created_at: '2025-01-01' },   // auch nicht
    { name: 'Sommersalat',      created_at: '2026-08-01' }    // erst 8 Tage alt
];

// 12 Bestellungen -- genug fuer eine Aussage
var BESTELLUNGEN = [];
for (var i = 0; i < 6; i++) BESTELLUNGEN.push(best([['Pizza Margherita', 2, 17.00]]));
for (var i = 0; i < 4; i++) BESTELLUNGEN.push(best([['Döner Teller', 1, 9.50]]));
BESTELLUNGEN.push(best([['Pizza Salami', 1, 9.00]]));
BESTELLUNGEN.push(best([['Pizza Salami', 1, 9.00]]));

var a = F.werte(BESTELLUNGEN, KARTE, { jetzt: HEUTE });

// --- Renner ------------------------------------------------------------------
t('der Renner steht oben', a.renner[0].name === 'Pizza Margherita', a.renner[0] && a.renner[0].name);
t('Mengen werden addiert, nicht Bestellungen gezaehlt',
  a.renner[0].anzahl === 12, a.renner[0].anzahl);
t('Umsatz wird NICHT noch einmal mit der Menge multipliziert',
  a.renner[0].umsatz === 102, a.renner[0].umsatz);

// --- DER BLINDE FLECK: Gerichte ohne einen einzigen Verkauf -------------------
var namen = a.penner.map(function (e) { return e.name; });
t('Gerichte OHNE Verkauf tauchen ueberhaupt auf (das war vorher unmoeglich)',
  namen.indexOf('Lachsfilet') >= 0 && namen.indexOf('Rote Grütze') >= 0, namen.join(', '));
t('sie werden auch als solche gezaehlt', a.ohneVerkauf === 2, a.ohneVerkauf);
t('der Renner steht nicht gleichzeitig bei den Pennern',
  namen.indexOf('Pizza Margherita') < 0, namen.join(', '));

// --- Ehrlichkeitsregel 1: zu wenig Daten -> kein Urteil -----------------------
var duenn = F.werte([best([['Pizza Salami', 1, 9]]), best([['Döner Teller', 1, 9.5]])], KARTE, { jetzt: HEUTE });
t('bei zwei Bestellungen wird NICHTS als Penner gebrandmarkt',
  duenn.penner.length === 0, duenn.penner.map(function (e) { return e.name; }).join(', '));
t('die Renner werden trotzdem gezeigt', duenn.renner.length === 2, duenn.renner.length);
t('und es steht dabei, warum die Penner fehlen', duenn.genugDaten === false);
t('der Hinweis landet auch wirklich im Kasten',
  /noch zu früh/.test(F.html(duenn)) && /ab 10 wird sie angezeigt/.test(F.html(duenn)),
  F.html(duenn).slice(-260));

// --- Ehrlichkeitsregel 2: neue Gerichte sind keine Penner ---------------------
t('ein Gericht von letzter Woche ist neu, kein Penner',
  namen.indexOf('Sommersalat') < 0, namen.join(', '));
t('es wird stattdessen getrennt ausgewiesen',
  a.neu.length === 1 && a.neu[0] === 'Sommersalat', JSON.stringify(a.neu));
t('das steht auch im Kasten', /noch neu auf der Karte/.test(F.html(a)));

// Sobald es alt genug ist, zaehlt es normal mit.
var spaeter = F.werte(BESTELLUNGEN, KARTE, { jetzt: '2026-10-01T12:00:00Z' });
t('zwei Monate spaeter zaehlt dasselbe Gericht ganz normal mit',
  spaeter.penner.map(function (e) { return e.name; }).indexOf('Sommersalat') >= 0,
  spaeter.penner.map(function (e) { return e.name; }).join(', '));

// --- Was NICHT als Penner gelten darf ----------------------------------------
var ausverkauft = F.werte(BESTELLUNGEN,
    KARTE.concat([{ name: 'Grünkohl', is_available: false, created_at: '2025-01-01' }]), { jetzt: HEUTE });
t('ein ausverkauftes Gericht ist kein Penner',
  ausverkauft.penner.map(function (e) { return e.name; }).indexOf('Grünkohl') < 0,
  ausverkauft.penner.map(function (e) { return e.name; }).join(', '));

var alterName = F.werte(BESTELLUNGEN.concat([best([['Pizza Uralt', 1, 5]])]), KARTE, { jetzt: HEUTE });
t('ein Name, den es auf der Karte nicht mehr gibt, wird nicht als Penner gemeldet',
  alterName.penner.map(function (e) { return e.name; }).indexOf('Pizza Uralt') < 0,
  alterName.penner.map(function (e) { return e.name; }).join(', '));
t('er zaehlt aber weiter zum Umsatz der Renner-Liste',
  alterName.renner.some(function (e) { return e.name === 'Pizza Uralt'; }));

// --- Stornos zaehlen nicht ----------------------------------------------------
var mitStorno = F.werte(BESTELLUNGEN.concat([best([['Lachsfilet', 9, 200]], 'cancelled')]), KARTE, { jetzt: HEUTE });
t('stornierte Bestellungen machen aus einem Penner keinen Renner',
  mitStorno.renner.every(function (e) { return e.name !== 'Lachsfilet'; }),
  mitStorno.renner.map(function (e) { return e.name; }).join(', '));

// --- Nach Umsatz statt nach Anzahl -------------------------------------------
// 4x Döner zu 9,50 = 38 €, 2x Salami zu 9,00 = 18 €. Nach Anzahl liegt Döner
// vorn, nach Umsatz auch -- also ein Fall bauen, wo es auseinanderlaeuft.
var teuer = [best([['Hummer', 1, 89]]), best([['Pommes', 20, 60]])];
var nachAnzahl = F.werte(teuer, [], { jetzt: HEUTE, sicht: 'anzahl' });
var nachUmsatz = F.werte(teuer, [], { jetzt: HEUTE, sicht: 'umsatz' });
t('nach Anzahl fuehrt das billige Massengericht',
  nachAnzahl.renner[0].name === 'Pommes', nachAnzahl.renner[0].name);
t('nach Umsatz fuehrt das teure',
  nachUmsatz.renner[0].name === 'Hummer', nachUmsatz.renner[0].name);
t('die Umschaltung steht auch wirklich auf der Seite',
  /onclick="setzeAuswertungsSicht\('anzahl'\)"/.test(H) && /onclick="setzeAuswertungsSicht\('umsatz'\)"/.test(H));

// --- Nichts kippt bei leeren Daten -------------------------------------------
t('keine Bestellungen, keine Karte -> leer statt Absturz',
  F.werte([], [], { jetzt: HEUTE }).renner.length === 0);
t('Bestellung ohne items kippt nicht',
  F.werte([{ status: 'completed' }], KARTE, { jetzt: HEUTE }).renner.length === 0);
t('Gericht ohne Namen wird uebergangen',
  F.werte([], [{ name: '' }], { jetzt: HEUTE }).penner.length === 0);

// --- Ist es eingebaut? --------------------------------------------------------
t('die Karte wird fuer die Auswertung wirklich nachgeladen',
  /_karteFuerAuswertung\(rid\)\.then/.test(H));
t('die Ueberschrift heisst jetzt Renner & Penner',
  /Renner &amp; Penner/.test(H));
t('der alte, halbe Bestseller-Block ist ersetzt',
  !/\/\/ Bestseller berechnen und anzeigen/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
