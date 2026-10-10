// WhatsApp-Angebote: gemeinsame Bausteine fuer wa-einwilligung,
// whatsapp-abmelden und order-save (Einloesung). Siehe datenbank/42.
'use strict';

// Der Satz, dem der Gast zustimmt -- steht so in der Datenbank (Nachweis).
// Wird er geaendert, eine neue Fassung anlegen, nicht ueberschreiben.
var TEXT_FASSUNG = 'wa-v1: Ja, schickt mir Angebote und Gutscheine dieses Lokals per WhatsApp an meine Telefonnummer. Abmelden jederzeit mit einem Klick (Link in jeder Nachricht).';

// Wie waNummer() in der App: nur Ziffern, Laendervorwahl vorn.
// "0176 123" -> "49176123", "+49 176" / "0049 176" -> "49176".
function nummer(roh) {
    var z = String(roh == null ? '' : roh).replace(/[^\d+]/g, '');
    if (z.indexOf('+') === 0) z = z.slice(1);
    z = z.replace(/\D/g, '');
    if (z.indexOf('00') === 0) z = z.slice(2);
    else if (z.indexOf('0') === 0) z = '49' + z.slice(1);
    return (z.length >= 8 && z.length <= 15) ? z : '';
}

module.exports = { TEXT_FASSUNG: TEXT_FASSUNG, nummer: nummer };
