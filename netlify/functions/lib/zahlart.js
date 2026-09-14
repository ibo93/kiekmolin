'use strict';

// EINE STELLE FUER DIE ZAHLART.
//
// Ibo am 14.09.2026, mit einem Foto vom WinOrder-Bon eines Kunden:
// "warum steht card_on_delivery".
//
// Weil die Gastseite genau drei Werte erzeugt -- cash, card_on_delivery,
// paypal -- und VIER Stellen sie unabhaengig voneinander uebersetzt
// haben. Drei davon kannten card_on_delivery nicht:
//
//   index.html (Bildschirm)  kannte ihn     -> "Kartenzahlung"
//   winorder.js              kannte ihn NICHT -> "card_on_delivery"
//   order-email.js           kannte ihn NICHT -> "Zahlung: card_on_delivery"
//   pos-print.js (Bon)       kannte ihn NICHT -> "CARD_ON_DELIVERY"
//
// Alle drei hatten einen Rueckfall der Sorte "nimm halt den Rohwert".
// Der sieht hilfreich aus und ist das Gegenteil: er druckt einen
// technischen Code auf die Rechnung eines Gastes, und niemandem faellt
// es auf, weil kein Fehler entsteht. Genau die Sorte stiller Ausfall
// aus Regel 6 -- es sieht aus wie eine Antwort.
//
// Darum steht die Zuordnung ab jetzt EINMAL hier. Wer einen neuen
// Zahlweg einbaut, traegt ihn hier ein und alle vier Ausgaben stimmen.

var TEXTE = {
    cash: 'Barzahlung',
    bar: 'Barzahlung',
    card_on_delivery: 'Kartenzahlung',
    card: 'Kartenzahlung',
    ec: 'EC-Karte',
    paypal: 'PayPal',
    online: 'Online bezahlt',
    stripe: 'Online bezahlt'
};

function schluessel(roh) {
    return String(roh == null ? '' : roh).trim().toLowerCase();
}

function bekannt(roh) {
    var k = schluessel(roh);
    return !!k && Object.prototype.hasOwnProperty.call(TEXTE, k);
}

// Der Text, den ein MENSCH liest -- Gast, Fahrer, Theke, Kasse.
//
// Ein unbekannter Wert wird NICHT roh durchgereicht. Er wird als solcher
// benannt und der Code in Klammern dahinter gesetzt: der Gast sieht dann
// wenigstens ein deutsches Wort, und wer den Bon in der Hand haelt, kann
// nachfragen. Zusaetzlich gehoert so ein Fall ins Log -- er bedeutet,
// dass jemand einen Zahlweg eingebaut und diese Datei vergessen hat.
function text(roh) {
    var k = schluessel(roh);
    if (!k) return 'Barzahlung';
    if (TEXTE[k]) return TEXTE[k];
    return 'Sonstige Zahlung (' + k + ')';
}

// Muss beim Gast noch Geld eingesammelt werden?
// Das ist die Frage, die der Fahrer an der Tuer beantwortet haben will.
function kassieren(roh, bezahlt) {
    if (bezahlt === true) return false;
    var k = schluessel(roh);
    return k === 'cash' || k === 'bar' || k === 'card_on_delivery' || k === 'card' || k === 'ec';
}

// Braucht der Fahrer das Kartengeraet?
function karte(roh) {
    var k = schluessel(roh);
    return k === 'card_on_delivery' || k === 'card' || k === 'ec';
}

module.exports = { TEXTE: TEXTE, text: text, bekannt: bekannt, kassieren: kassieren, karte: karte };
