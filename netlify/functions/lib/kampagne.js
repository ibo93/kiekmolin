// Kampagne = aus welchem Video ein Gast kam (?ref=reel-pizzatag am Link).
//
// WOZU: Das Studio von Kurani Design haengt an jeden Video-Link und QR-Code
// einen kurzen Code. Bucht oder bestellt der Gast in derselben Sitzung, steht
// der Code an der Reservierung/Bestellung -- im Monatsbericht des Wirts heisst
// das dann "Reel Pizzatag: 11 Reservierungen" statt nur "4.200 Aufrufe".
//
// STRENG: nur kleine Buchstaben, Ziffern, Bindestrich, 3-48 Zeichen. Alles
// andere wird zu null -- niemand soll ueber diesen Weg Text in die Datenbank
// schreiben koennen. Kein Personenbezug: der Code beschreibt das VIDEO, nicht
// den Gast. Im Browser liegt er nur im Arbeitsspeicher (keine Cookies, kein
// localStorage) -- bucht der Gast erst Tage spaeter, zaehlt es nicht. Bewusst.
'use strict';

var MUSTER = /^[a-z0-9][a-z0-9-]{2,47}$/;

function pruefe(x) {
    if (typeof x !== 'string') return null;
    var k = x.trim().toLowerCase();
    return MUSTER.test(k) ? k : null;
}

module.exports = { pruefe: pruefe, MUSTER: MUSTER };
