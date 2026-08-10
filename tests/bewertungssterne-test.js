// KEINE ERFUNDENEN BEWERTUNGSSTERNE.
//
// AUFGEFALLEN IST
// ---------------
// In der Google-Suche stand unter dem kiekmolin.de-Treffer
// "4,8 ★★★★★ (56) · Kostenlos". Die Zahl kam nicht von Google -- sie stand
// fest verdrahtet im Kopfbereich der Seite:
//
//   "aggregateRating": { "ratingValue": "4.8", "ratingCount": "56" }
//
// Auf JEDER Seite, fuer jedes Restaurant. Bewertet hatte das niemand.
//
// Der zweite Teil war leiser, aber gleicher Art: Restaurants ohne
// eingetragene Bewertung bekamen im Code "|| 4.5" verpasst, und das
// Restaurant-Schema zeichnete daraus eine aggregateRating mit
// "reviewCount: rest.reviewCount || 1" aus -- mindestens eine Bewertung, die
// es nicht gab.
//
// WARUM DAS MEHR IST ALS EIN SCHOENHEITSFEHLER
// --------------------------------------------
// Google verlangt fuer Bewertungssterne Bewertungen, die auf dieser Seite von
// echten Nutzern abgegeben wurden. Erfundene kosten im Ernstfall die
// Sterne-Darstellung fuer die ganze Domain. Und in Deutschland sind erfundene
// Bewertungen als unlautere Geschaeftspraxis ausdruecklich benannt -- fuer
// eine App, die Gastronomen bezahlen, ist das deren Risiko.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---- 1. Die fest verdrahtete Bewertung ist weg ------------------------------
t('keine erfundene 4,8 mit 56 Bewertungen mehr im Kopfbereich',
  H.indexOf('"ratingValue": "4.8"') < 0 && H.indexOf('"ratingCount": "56"') < 0);
t('ueberhaupt keine aggregateRating-Auszeichnung mehr',
  !/"aggregateRating"\s*:/.test(H) && !/schema\.aggregateRating\s*=/.test(H));
t('auch keine einzelne Review-Auszeichnung',
  !/"@type"\s*:\s*"Review"/.test(H));

// Die App IST kostenlos -- diese Angabe stimmt und bleibt.
t('die Preisangabe "kostenlos" bleibt, die ist wahr',
  /"offers": \{"@type": "Offer", "price": "0", "priceCurrency": "EUR"\}/.test(H));

// Damit es niemand aus Versehen wieder einbaut, steht der Grund im Quelltext.
t('der Grund steht im Quelltext, nicht nur hier',
  /KEINE aggregateRating-Auszeichnung/.test(H)
  && /Bewertungen, die auf DIESER Seite/.test(H));

// ---- 2. Nirgends mehr eine erfundene 4,5 ------------------------------------
t('kein "|| 4.5" mehr im ganzen Quelltext', H.indexOf('|| 4.5') < 0);
t('auch kein fest gesetztes rating: 4.5', H.indexOf('rating: 4.5') < 0);
t('neu angelegte Restaurants starten mit 0',
  /is_open: true,[\s\S]{0,160}rating: 0,/.test(H));
t('das Eingabefeld erfindet auch nichts',
  /parseFloat\(document\.getElementById\('newRestaurantRating'\)\?\.value\) \|\| 0/.test(H));
t('dasselbe bei den Sehenswuerdigkeiten',
  /parseFloat\(document\.getElementById\('attractionRating'\)\.value\) \|\| 0/.test(H));

// ---- 3. Ohne Bewertung wird auch keine angezeigt ----------------------------
t('die Kartenkarte zeigt einen Strich statt einer erfundenen Zahl',
  /\(r\.rating > 0\) \? Number\(r\.rating\)\.toFixed\(1\) : '–'/.test(H));
t('der Google-Block erscheint nur mit echter Bewertung',
  /if \(!rest\.rating \|\| !rest\.googleMapsUrl\) return '';/.test(H));
t('"(0 Bewertungen)" wird nicht mehr danebengeschrieben',
  /if \(rest\.reviewCount > 0\) \{/.test(H));

// Die Google-Bewertung DARF gezeigt werden -- sie ist als solche
// gekennzeichnet und verlinkt. Nur als eigene Kennzahl auszeichnen darf man
// sie nicht.
t('die gezeigte Bewertung ist als Google-Bewertung gekennzeichnet',
  /bei Google<\/span>/.test(H) && /Auf Google ansehen/.test(H));

// ---- 4. Nichts kaputt gemacht ------------------------------------------------
var F = new Function('r', "return (r.rating > 0) ? Number(r.rating).toFixed(1) : '–';");
t('4,2 wird als 4.2 angezeigt', F({ rating: 4.2 }) === '4.2', F({ rating: 4.2 }));
t('0 wird zum Strich', F({ rating: 0 }) === '–', F({ rating: 0 }));
t('fehlender Wert ebenso', F({}) === '–', F({}));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
