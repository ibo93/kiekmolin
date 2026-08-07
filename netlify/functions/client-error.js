// Kiek mol in — Fehler aus dem echten Betrieb einsammeln.
//
// WARUM: Bisher gab es KEINE Fehlermeldung aus dem Betrieb. Wenn bei einem
// Gastronomen in Greetsiel etwas kaputtging, erfuhr davon niemand -- ausser er
// rief an. Meistens ruft niemand an; er benutzt die Funktion einfach nicht
// mehr. Mit jedem neuen Restaurant waechst dieses Risiko.
//
// Diese Function nimmt Fehlerberichte des Browsers entgegen und schreibt sie
// nach activity_log (activity_type = 'client_error'). Das ist bewusst eine
// bestehende Tabelle mit freiem Schema -- so ist keine Datenbank-Aenderung
// noetig, die erst jemand von Hand einspielen muesste.
//
// GRUNDREGEL: Diese Function darf NIE etwas kaputtmachen. Sie antwortet immer
// mit 204, auch wenn das Schreiben scheitert. Ein Fehler beim Melden eines
// Fehlers darf den Nutzer nicht behelligen und erst recht keine Schleife
// ausloesen.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};
// Immer 204: der Browser soll nichts auswerten und nichts wiederholen.
var OK = { statusCode: 204, headers: CORS, body: '' };

// Grobe Bremse pro Function-Instanz. Ein Fehler in einer Schleife koennte sonst
// hunderte Zeilen pro Sekunde schreiben und die Tabelle unbrauchbar machen.
// Die Instanz lebt nur ein paar Minuten -- das reicht, um genau solche
// Ausbrueche abzufangen, ohne echte Meldungen zu verlieren.
var seen = {};          // Fingerabdruck -> { count, first }
var FENSTER_MS = 10 * 60 * 1000;
var MAX_PRO_FEHLER = 5;

function drosseln(fp, jetzt) {
    var e = seen[fp];
    if (!e || jetzt - e.first > FENSTER_MS) { seen[fp] = { count: 1, first: jetzt }; return false; }
    e.count++;
    return e.count > MAX_PRO_FEHLER;
}

function s(v, max) { return v == null ? '' : String(v).slice(0, max); }

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return OK;
    if (!SUPABASE_KEY) return OK;

    var b;
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return OK; }

    var message = s(b.message, 500).trim();
    if (!message) return OK;

    // Fingerabdruck ohne Zeilennummern-Rauschen: gleiche Ursache, ein Eintrag.
    var fp = (message + '|' + s(b.source, 200)).toLowerCase().replace(/\d+/g, '#');
    // Date.now() ist hier unproblematisch (laeuft auf dem Server, nicht im Build).
    if (drosseln(fp, Date.now())) return OK;

    var zeile = {
        activity_type: 'client_error',
        target_type: s(b.area, 60) || 'app',
        target_name: message.slice(0, 120),
        user_id: /^[0-9a-f-]{20,}$/i.test(s(b.userId, 60)) ? b.userId : null,
        user_name: s(b.userName, 80) || 'Unbekannt',
        message: message,
        metadata: {
            kind: s(b.kind, 30) || 'error',          // error | unhandledrejection | write
            source: s(b.source, 300),                 // Datei:Zeile
            stack: s(b.stack, 1500),
            page: s(b.page, 300),
            ua: s(event.headers && (event.headers['user-agent'] || event.headers['User-Agent']), 250),
            status: (typeof b.status === 'number') ? b.status : null,
            build: s(b.build, 60),
            fingerprint: fp.slice(0, 200)
        }
    };

    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/activity_log', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(zeile)
        });
        if (!res.ok) console.warn('[client-error] Schreiben fehlgeschlagen: HTTP ' + res.status);
    } catch (e) {
        console.warn('[client-error] Schreiben fehlgeschlagen:', e.message);
    }

    return OK;
};
