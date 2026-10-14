// ANNEHMEN / ABLEHNEN DIREKT AUS DER BENACHRICHTIGUNG -- der Schluessel.
//
// Ibo, 14.10.2026: Wirte nehmen am Ruhetag Reservierungen von zu Hause an.
// Bisher hiess das: Push antippen, App oeffnen, anmelden, Reservierung
// suchen, bestaetigen. Jetzt stehen in der Push zwei Knoepfe.
//
// Der Service Worker, der den Knopf bekommt, hat keine Anmeldung. Darum
// traegt jede Push einen Schluessel, der GENAU EINE Reservierung GENAU EINES
// Hauses betrifft und nach 7 Tagen verfaellt. Unterschrieben mit HMAC aus
// dem Dienstschluessel -- den gibt es nur bei Netlify, nie im Browser.
// Wer den Schluessel nicht hat, kann nichts annehmen oder ablehnen.
//
// tests/push-antwort-test.js.
'use strict';

var crypto = require('crypto');

var GUELTIG_MS = 7 * 24 * 60 * 60 * 1000;

function geheimnis(dienstschluessel) {
    // Abgeleitet, nicht der Dienstschluessel selbst -- ein HMAC mit ihm als
    // Schluessel waere auch sicher, aber so taucht er nirgends roh auf.
    return crypto.createHash('sha256').update('kmi-push-antwort:' + String(dienstschluessel || '')).digest();
}

function unterschrift(resId, restId, ablauf, dienstschluessel) {
    return crypto.createHmac('sha256', geheimnis(dienstschluessel))
        .update(String(resId) + '.' + String(restId) + '.' + String(ablauf))
        .digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Fuer die Push: { id, r, exp, t }
function ausstellen(resId, restId, dienstschluessel, jetzt) {
    if (!dienstschluessel || !resId || !restId) return null;
    var ablauf = (jetzt || Date.now()) + GUELTIG_MS;
    return { id: String(resId), r: String(restId), exp: ablauf, t: unterschrift(resId, restId, ablauf, dienstschluessel) };
}

// true nur, wenn Unterschrift stimmt UND nicht abgelaufen.
function pruefen(a, dienstschluessel, jetzt) {
    if (!a || !dienstschluessel) return false;
    if (!/^[0-9a-f-]{20,}$/i.test(String(a.id || '')) || !/^[0-9a-f-]{20,}$/i.test(String(a.r || ''))) return false;
    var ablauf = Number(a.exp);
    if (!(ablauf > (jetzt || Date.now()))) return false;
    var soll = unterschrift(a.id, a.r, ablauf, dienstschluessel);
    var ist = String(a.t || '');
    if (ist.length !== soll.length) return false;
    return crypto.timingSafeEqual(Buffer.from(ist), Buffer.from(soll));
}

module.exports = { ausstellen: ausstellen, pruefen: pruefen, GUELTIG_MS: GUELTIG_MS };
