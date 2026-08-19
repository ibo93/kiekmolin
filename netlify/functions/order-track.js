// Kiek mol in — der Gast holt seine eigene Bestellung ab.
//
// WARUM ES DIESE DATEI GIBT
// -------------------------
// Bisher suchte die App so:
//
//     orders?customer_phone=ilike.*<letzte 8 Ziffern>*
//
// Das ist kein Nachweis, das ist eine Suche. Wer eine Telefonnummer kennt --
// oder acht Ziffern raet -- bekam Name, Telefon und Lieferadresse dieser
// Person. Und weil die Abfrage aus dem Browser mit dem oeffentlichen
// Schluessel lief, konnte das jeder, der "Seitenquelltext anzeigen" drueckt.
//
// Jetzt entscheidet ein Geheimnis, nicht eine Telefonnummer. Jede Bestellung
// hat eines (orders.track_token, 16 Zufallsbytes). Es steht im Link der
// Bestaetigungsmail und im Browser des Geraets, das bestellt hat. Wer es hat,
// sieht genau diese eine Bestellung. Wer es nicht hat, sieht nichts -- auch
// mit der richtigen Telefonnummer nicht.
//
// KEIN VERSUCHSZAEHLER, UND WARUM DAS HIER REICHT
// 16 Zufallsbytes sind 2^128 Moeglichkeiten. Wer pro Sekunde eine Milliarde
// Tokens durchprobiert, braucht dafuer laenger als das Universum alt ist.
// Ein Zaehler wuerde hier nichts schuetzen, was die Zahl nicht schon schuetzt
// -- er wuerde nur eine Zustandshaltung einfuehren, die es in einer
// Serverless-Function nicht ohne Weiteres gibt. Bei einer RATBAREN Kennung
// waere das anders; genau deshalb ist die Bestellnummer hier nicht mehr die
// Kennung.
//
// Aufruf:
//   GET /.netlify/functions/order-track?b=<token>[,<token>...]&r=<token>[,...]
//     b = Bestellungen, r = Reservierungen. Beide optional, mindestens eines.
//
// Antwort: { ok:true, bestellungen:[...], reservierungen:[...] }
//
// Zurueckgegeben wird nur, was die Ansicht braucht. Der Gast sieht dabei
// seine eigenen Daten -- das ist in Ordnung, es sind seine. Aber es gibt
// keinen Weg, ueber diesen Endpunkt etwas anderes zu sehen als die Zeilen,
// zu denen man das Geheimnis besitzt.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

// Ein Geraet sammelt mit der Zeit Tokens an. Zwanzig sind reichlich fuer die
// Liste "Meine Bestellungen" und begrenzen zugleich, wie lang eine einzelne
// Abfrage werden kann.
var MAX_TOKENS = 20;

// Genau die Form, die tools/… erzeugt: 32 Hex-Zeichen. Alles andere fliegt
// raus, bevor es in eine Abfrage geraet.
var TOKEN = /^[0-9a-f]{32}$/;

function tokenListe(roh) {
    if (!roh) return [];
    return String(roh)
        .split(',')
        .map(function (s) { return s.trim().toLowerCase(); })
        .filter(function (s) { return TOKEN.test(s); })
        .slice(0, MAX_TOKENS);
}

// Felder bewusst einzeln aufgezaehlt statt select=*. Kommt morgen eine Spalte
// dazu -- ein interner Vermerk, ein Rohdatenfeld aus der Kasse -- soll sie
// nicht automatisch beim Gast landen.
//
// Die Liste ist an der Anzeige abgeglichen, nicht geraten: items
// (die bestellten Gerichte), estimated_minutes (die Wartezeit) und
// restaurant_name werden in "Meine Bestellungen" und im Statusband
// wirklich gelesen. Fehlt eines davon, bleibt die Karte still leer --
// ohne Fehlermeldung, weil undefined einfach nichts anzeigt.
var BESTELL_FELDER = [
    'id', 'order_number', 'status', 'order_type', 'total', 'created_at',
    'scheduled_at', 'estimated_time', 'estimated_minutes',
    'restaurant_id', 'restaurant_name', 'items',
    'customer_name', 'customer_phone', 'customer_email',
    'delivery_address', 'notes', 'track_token'
].join(',');

// party_size, NICHT guests. Die Spalte heisst in der Datenbank party_size;
// "guests" taucht in der App nur als Notnagel in JavaScript auf. Mit dem
// falschen Namen antwortet PostgREST mit 400 -- und der Gast haette hier
// "Datenbank nicht erreichbar" gelesen, obwohl sie erreichbar war.
var RES_FELDER = [
    'id', 'status', 'reservation_date', 'reservation_time', 'party_size',
    'restaurant_id', 'guest_name', 'guest_phone', 'notes', 'track_token'
].join(',');

async function hole(tabelle, felder, tokens) {
    if (!tokens.length) return [];
    var url = SUPABASE_URL + '/rest/v1/' + tabelle
        + '?select=' + felder
        + '&track_token=in.(' + tokens.join(',') + ')'
        + '&order=created_at.desc';
    var res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
        var text = '';
        try { text = (await res.text() || '').slice(0, 200); } catch (e) {}
        var err = new Error('HTTP ' + res.status + (text ? ': ' + text : ''));
        err.status = res.status;
        throw err;
    }
    return res.json();
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Nur GET' });

    // Ohne Dienstschluessel gar nicht erst anfangen. Eine leere Liste waere
    // hier die schlechteste Antwort: sie sieht aus wie "du hast nichts
    // bestellt", und der Gast sucht den Fehler bei sich.
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var q = event.queryStringParameters || {};
    var bTokens = tokenListe(q.b);
    var rTokens = tokenListe(q.r);

    if (!bTokens.length && !rTokens.length) {
        return json(400, { ok: false, error: 'Kein gueltiges Kennzeichen uebergeben' });
    }

    try {
        var beides = await Promise.all([
            hole('orders', BESTELL_FELDER, bTokens),
            hole('reservations', RES_FELDER, rTokens)
        ]);
        return json(200, { ok: true, bestellungen: beides[0], reservierungen: beides[1] });
    } catch (e) {
        // Die Spalte fehlt noch (datenbank/03 nicht gelaufen): das ist ein
        // Einrichtungsfehler, kein Gastfehler -- und er muss sich anders
        // anfuehlen als "nichts gefunden".
        if (/track_token/.test(String(e.message)) && /column|does not exist|Could not find/i.test(String(e.message))) {
            return json(503, { ok: false, error: 'Verfolgung noch nicht eingerichtet' });
        }
        return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
    }
};
