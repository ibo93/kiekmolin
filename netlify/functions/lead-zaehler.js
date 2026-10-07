// KOMMT UEBER DIE RESTAURANTSEITEN UEBERHAUPT JEMAND?
//
// Auf hunderten Seiten steht der gruene Kasten "Ist das dein Restaurant?"
// und zeigt auf /gastro. Niemand konnte sagen, ob er 10 oder 10.000 Mal
// gesehen wurde.
//
// Ibo am 24.09.2026: "wir muessen mehr Werbung machen und Kunden holen".
// Werbung ohne Zaehler ist Geld ausgeben mit verbundenen Augen. Also
// zuerst zaehlen, dann ausgeben.
//
// Drei Schritte: gesehen -> geklickt -> gesendet.
//
// WAS HIER BEWUSST NICHT PASSIERT: keine IP, kein Besucher-Kennzeichen,
// kein Verlauf, kein Cookie. Nur Tag, Seite, Schritt, Anzahl. Damit
// braucht es keine Einwilligung -- und es beantwortet trotzdem die
// einzige Frage, die zaehlt.
//
// UND: dieser Zaehler darf NIE eine Seite kaputtmachen. Er antwortet
// immer 200, auch wenn die Tabelle fehlt oder Supabase klemmt. Eine
// Verkaufsseite, die wegen einer Zaehlung nicht laedt, waere der teuerste
// Zaehler der Welt.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var KEY = process.env.SUPABASE_SERVICE_KEY || '';

var SCHRITTE = ['gesehen', 'geklickt', 'gesendet'];

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

// Der Seitenname, nicht mehr. Alles ausser Buchstaben, Ziffern und
// Bindestrich fliegt raus -- was von aussen kommt, darf in der Datenbank
// nichts anlegen, was wir nicht kennen.
function sauberSlug(roh) {
    return String(roh == null ? '' : roh).toLowerCase()
        .replace(/[^a-z0-9-]/g, '').slice(0, 120) || '-';
}

// Zaehlt hoch. Wirft NIE -- der Aufrufer soll nicht davon abhaengen.
async function hoch(slug, schritt) {
    if (!KEY) return { ok: false, grund: 'SUPABASE_SERVICE_KEY fehlt' };
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/lead_zaehlen', {
            method: 'POST',
            headers: {
                apikey: KEY, Authorization: 'Bearer ' + KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ p_slug: slug, p_schritt: schritt })
        });
        if (res.ok) return { ok: true };
        var text = '';
        try { text = await res.text(); } catch (e) { text = ''; }
        // Die haeufigste Ursache beim ersten Mal, und sie ist behebbar:
        // das SQL wurde noch nicht eingespielt. Das gehoert ins Protokoll,
        // damit niemand raten muss, warum alle Zahlen auf null stehen.
        if (/lead_zaehlen|lead_zaehler/i.test(text) && /(does not exist|schema cache)/i.test(text)) {
            console.warn('lead-zaehler: Tabelle/Funktion fehlt noch -- datenbank/35-lead-zaehler.sql einspielen');
            return { ok: false, grund: 'SQL 35 fehlt' };
        }
        console.warn('lead-zaehler: Supabase ' + res.status + ' - ' + text.slice(0, 200));
        return { ok: false, grund: 'HTTP ' + res.status };
    } catch (e) {
        console.warn('lead-zaehler: ' + (e && e.message));
        return { ok: false, grund: 'nicht erreichbar' };
    }
}
exports.hoch = hoch;

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    // Auch ein falscher Aufruf bekommt 200. Ein Zaehler, der Fehler wirft,
    // faerbt fremde Protokolle rot und lenkt von echten Fehlern ab.
    if (event.httpMethod !== 'POST') return json(200, { ok: false, grund: 'Nur POST' });

    var daten = {};
    try { daten = JSON.parse(event.body || '{}'); } catch (e) { daten = {}; }

    var schritt = String(daten.schritt || '');
    if (SCHRITTE.indexOf(schritt) === -1) return json(200, { ok: false, grund: 'Unbekannter Schritt' });

    var erg = await hoch(sauberSlug(daten.slug), schritt);
    return json(200, erg);
};

exports._sauberSlug = sauberSlug;
exports._SCHRITTE = SCHRITTE;
