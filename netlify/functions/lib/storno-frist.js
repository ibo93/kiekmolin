// BIS WANN DARF EIN GAST ONLINE ABSAGEN? -- an EINER Stelle.
//
// Ibo, 29.10.2026: "Gaeste, die absagen wollen, koennen nicht 2 Stunden vor
// der Reservierung absagen, nur telefonisch" / "soll jeder selber machen" /
// "bei Bestaetigungs-Mails steht auch absagen ... und bei Erinnerungs-Mail".
//
// Kurz vorher erfaehrt der Wirt eine Absage am Telefon sofort und kann den
// Tisch weitergeben; ein Klick auf einen Link geht im Service unter.
//
// Gespeichert wie die Wartezeit: restaurants.features enthaelt
// "storno_frist:<Stunden>". 0 = jederzeit online. Fehlt der Eintrag: jederzeit
// (Ibo, 29.10.2026: "er will es wie vorher" -- keiner bekommt eine Frist,
// die er nicht selbst gewaehlt hat).
//
// KEINE SACKGASSE: Hat das Lokal keine Telefonnummer, bleibt Online-Absagen
// immer erlaubt. Wer weder klicken noch anrufen kann, kommt einfach nicht --
// und ein No-Show ist teurer als eine spaete Absage.
//
// Benutzt von res-cancel.js (die eigentliche Sperre), order-email.js
// (Bestaetigung) und reservation-reminder.js (Erinnerung).
'use strict';

var STANDARD = 0, HOECHSTENS = 72;

function fristStunden(features) {
    var f = Array.isArray(features) ? features : [];
    for (var i = 0; i < f.length; i++) {
        var m = /^storno_frist:(\d{1,3})$/.exec(String(f[i]));
        if (m) { var v = parseInt(m[1], 10); if (v >= 0 && v <= HOECHSTENS) return v; }
    }
    return STANDARD;
}

// Datum + Uhrzeit des Tisches (deutsche Zeit) -> Millisekunden seit 1970.
function berlinZeitpunkt(datum, zeit) {
    var d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum || ''));
    var t = /^(\d{1,2}):(\d{2})/.exec(String(zeit || ''));
    if (!d || !t) return NaN;
    var guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
    // Wie spaet ist es in Berlin, wenn es UTC "guess" ist? Die Differenz ist
    // der Versatz (Sommer +2, Winter +1) -- ohne Tabelle, mit der echten Uhr.
    var teile = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date(guess)).forEach(function (p) { teile[p.type] = p.value; });
    var alsBerlin = Date.UTC(+teile.year, +teile.month - 1, +teile.day, +teile.hour % 24, +teile.minute);
    return guess - (alsBerlin - guess);
}

// WANN MACHT DAS LOKAL FUER DIESEN TISCH AUF? (Ibo, 29.10.2026: "der Wirt
// um 17 Uhr geoeffnet, der Gast kommt um 17 Uhr") -- bei 2 Std Frist muesste
// der Gast um 15 Uhr anrufen, und da geht keiner ran. Also: der Beginn der
// Schicht, in die der Tisch faellt (spaetester Beginn <= Tischzeit). Kennt
// auch die zweite Schicht (Mittagspause) und Sonderzeiten an dem Tag.
// "HH:MM" oder '' (unbekannt -> Frist bleibt wie eingestellt).
var TAGE = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
function schichtBeginn(lokal, datum, zeit) {
    if (!lokal) return '';
    var oh = lokal.opening_hours;
    if (typeof oh === 'string') { try { oh = JSON.parse(oh); } catch (e) { oh = null; } }
    var d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(datum || ''));
    var hhmm = String(zeit || '').slice(0, 5);
    if (!d || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
    var k = TAGE[new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).getUTCDay()];
    var anfaenge = [];
    if (oh && typeof oh === 'object' && oh[k + '_start']) {
        anfaenge.push(oh[k + '_start']);
        if (oh[k + '_start2']) anfaenge.push(oh[k + '_start2']);
    } else if (lokal.opening_time) anfaenge.push(lokal.opening_time);
    ((oh && Array.isArray(oh.sonderzeiten)) ? oh.sonderzeiten : []).forEach(function (z) {
        if (z && String(z.datum) === String(datum).slice(0, 10) && z.von) anfaenge.push(z.von);
    });
    var beste = '';
    anfaenge.forEach(function (a) {
        a = String(a).slice(0, 5);
        if (/^\d{2}:\d{2}$/.test(a) && a <= hhmm && a > beste) beste = a;
    });
    return beste;
}

// Bis wann online? null = jederzeit (Frist 0 oder kein Telefon).
// lokal (optional) = { opening_hours, opening_time }: vor der Oeffnung ist
// niemand am Telefon, also bleibt online absagen bis zur Oeffnung erlaubt.
function spaetestens(datum, zeit, features, telefon, lokal) {
    var h = fristStunden(features);
    if (!h || !String(telefon || '').replace(/[^\d]/g, '')) return null;
    var z = berlinZeitpunkt(datum, zeit);
    if (isNaN(z)) return null;
    var grenze = z - h * 3600000;
    var auf = schichtBeginn(lokal, datum, zeit);
    if (auf) { var a = berlinZeitpunkt(datum, auf); if (!isNaN(a) && a > grenze) grenze = a; }
    return grenze;
}

function darfOnline(datum, zeit, features, telefon, jetzt, lokal) {
    var grenze = spaetestens(datum, zeit, features, telefon, lokal);
    return grenze === null || (jetzt == null ? Date.now() : jetzt) < grenze;
}

// "Sa, 31.10., 17:30 Uhr" (deutsche Zeit)
function fristText(ms) {
    var d = new Date(ms);
    var tag = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'numeric' }).format(d);
    var uhr = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return tag.replace(/\.$/, '') + '., ' + uhr + ' Uhr';
}

module.exports = { STANDARD: STANDARD, fristStunden: fristStunden, berlinZeitpunkt: berlinZeitpunkt, schichtBeginn: schichtBeginn, spaetestens: spaetestens, darfOnline: darfOnline, fristText: fristText };
