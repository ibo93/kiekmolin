'use strict';

// LIEFERUNG, ABHOLUNG, VOR ORT -- EINE STELLE.
//
// Dasselbe Muster wie bei der Zahlart, nur noch nicht schmerzhaft
// geworden. Am 14.09.2026 nachgesehen, wie die drei Werte heute
// uebersetzt werden:
//
//   winorder.js     'Lieferung' / 'Vor Ort'   / 'Abholung'
//   order-email.js  'Lieferung' / 'Vor Ort'   / 'Abholung'
//   pos-print.js    'LIEFERUNG' / 'HIER ESSEN'/ 'ABHOLUNG'
//   pos-orders.js   gar nicht -- nur der Rohwert
//
// Dreimal dieselbe Frage, dreimal eigener Dreisatz, und "Vor Ort" heisst
// auf dem Bon "HIER ESSEN". Noch harmlos, weil alles deutsche Woerter
// sind. Genau so harmlos sah card_on_delivery aus, bis ein vierter Wert
// dazukam und drei von vier Stellen ihn nicht kannten.
//
// Die AUSWAHLKNOEPFE des Gastes bleiben absichtlich draussen: dort steht
// eine Einladung ("Hier essen"), hier eine Bezeichnung. Das ist nicht
// dasselbe und darf sich unterscheiden.

var TEXTE = {
    delivery: 'Lieferung',
    pickup: 'Abholung',
    takeaway: 'Abholung',
    dine_in: 'Vor Ort'
};

function schluessel(roh) {
    return String(roh == null ? '' : roh).trim().toLowerCase();
}

function bekannt(roh) {
    var k = schluessel(roh);
    return !!k && Object.prototype.hasOwnProperty.call(TEXTE, k);
}

// Abholung ist die Vorgabe -- so stand es vorher an allen drei Stellen
// (der letzte Zweig jedes Dreisatzes). Ein unbekannter Wert wird NICHT
// roh durchgereicht; er waere auf einem Bon dasselbe Problem wie
// "card_on_delivery" auf einer Rechnung.
function text(roh) {
    var k = schluessel(roh);
    if (TEXTE[k]) return TEXTE[k];
    return 'Abholung';
}

function lieferung(roh) { return schluessel(roh) === 'delivery'; }
function vorOrt(roh) { return schluessel(roh) === 'dine_in'; }

module.exports = { TEXTE: TEXTE, text: text, bekannt: bekannt, lieferung: lieferung, vorOrt: vorOrt };
