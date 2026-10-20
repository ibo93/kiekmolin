// DIE FARBE DES LOKALS AUF DER GANZEN SEITE, BEIM RESERVIEREN UND BESTELLEN.
//
// Ibo, 20.10.2026: "der Kunde soll seine eigene Farbe waehlen koennen ...
// wir haben ja schon den Reservieren-Knopf und Oeffnungszeiten, es muss
// mehr sein" und "muss auch bei Reservierungen und Online-Bestellung rein".
// Gold (Sterne, "heute") und Gruen ("offen") bleiben -- Bedeutung.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

// MARKE aus der Datei holen und ausfuehren
var a = H.indexOf('var MARKE = {'), b = H.indexOf('window.MARKE = MARKE;', a);
var MARKE = new Function(H.slice(a, b) + '; return MARKE;')();
function el() { var p = {}, c = {}; return { style: { setProperty: function (k, v) { p[k] = v; } }, classList: { toggle: function (k, an) { c[k] = !!an; } }, p: p, c: c }; }
var e1 = el(), e2 = el();
MARKE.anwenden([e1, null, e2], { brand_color: '#6b1220' });
t('anwenden setzt --marke / --marke-dunkel / --marke-glas auf alle Elemente', e1.p['--marke'] === '#6b1220' && e2.p['--marke'] === '#6b1220' && /^#[0-9a-f]{6}$/.test(e1.p['--marke-dunkel']) && /^rgba\(\d+,\d+,\d+,0\.92\)$/.test(e1.p['--marke-glas']), JSON.stringify(e1.p));
t('und markiert "eigene Farbe"', e1.c['kmi-eigene-farbe'] === true, '');
var e3 = el(); MARKE.anwenden([e3], { brand_color: null });
t('ohne eigene Farbe: Hausfarbe, nicht markiert (= wie bisher)', e3.p['--marke'] === MARKE.STANDARD && e3.c['kmi-eigene-farbe'] === false, JSON.stringify(e3.p));
var e4 = el(); MARKE.anwenden([e4], { brand_color: '#ffff00' });
t('zu helle Farbe wird lesbar gemacht (nicht Gelb auf Weiß)', e4.p['--marke'] !== '#ffff00', e4.p['--marke']);

t('Reservieren bekommt die Farbe beim Öffnen', /MARKE\.anwenden\(\[document\.getElementById\('reservationModal'\)\], restaurant\)/.test(H), '');
t('Bestellen + schwebender Warenkorb + Warenkorb bekommen die Farbe', /MARKE\.anwenden\(\[document\.getElementById\('menuModal'\), document\.getElementById\('menuFloatingCartBar'\), document\.getElementById\('cartPanel'\)\], appRest\)/.test(H), '');
t('Reservieren: Auswahl, Ticket, Personen +, gewählter Tag in Markenfarbe', /\.res-stepper-plus \{ border: none; background: var\(--marke, #003d33\)/.test(H) && /#selectedSlotDisplay\.res-ticket \{[^}]*background: var\(--marke, #003d33\) !important/.test(H) && /\.slot-btn\.res-slot\.selected \{[^}]*background: var\(--marke, #003d33\)/.test(H) && /background:var\(--marke,#003d33\);color:#fff/.test(H), '');
t('Bestellen: Hinzufügen-Knopf und Warenkorb-Leiste in Markenfarbe, Preise bei eigener Farbe', /background:var\(--marke-dunkel,#00251e\);color:white/.test(H) && /background:var\(--marke-glas,rgba\(0,37,30,0\.95\)\)/.test(H) && /#menuModal\.kmi-eigene-farbe \{ --kmi-preis: var\(--marke\); \}/.test(H), '');
t('Lokalseite: Name, Überschriften-Zeilen, Preise, Knopfleiste', /#restaurantLanding\.lp-eigene-farbe \{ --lp-akzent: var\(--marke\); --lp-name: var\(--marke\); \}/.test(H) && /color:var\(--lp-name,var\(--ink-deep\)\)/.test(H) && /lp-aktionen" style="background:var\(--marke-glas,rgba\(0,37,30,0\.85\)\)/.test(H), '');
t('Sterne bleiben Gold, "heute" bleibt Gold', /color:var\(--lp-stern,#735c00\)/.test(H) && /\.lp-zeit-heute \{ background: #fed65b;/.test(H), '');
t('im Dunkeln bleiben Schriftfarben hell lesbar (Gold statt dunkler Markenfarbe)', /\.dark-mode #restaurantLanding\.lp-eigene-farbe \{ --lp-akzent: #fed65b;/.test(H) && /\.dark-mode #menuModal\.kmi-eigene-farbe \{ --kmi-preis: #fed65b; \}/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
