// Kiek mol in — "ist meine Bestellung angekommen?", und sonst nichts.
//
// WOFUER
// ------
// Wenn das Absenden abbricht -- Funkloch im Kassenbereich, Server
// antwortet nicht rechtzeitig -- weiss der Gast nicht, ob die Bestellung
// noch durchging. Die App fragt dann nach. Die Antwort entscheidet
// darueber, ob sie "nicht abgeschickt" anzeigt oder "ist doch da".
//
// Das ist die EINZIGE Gastabfrage, die ohne Geheimnis auskommen muss:
// sie laeuft genau dann, wenn die Antwort mit dem Geheimnis nie ankam.
//
// WARUM DAS TROTZDEM NICHTS PREISGIBT
// -----------------------------------
// Zurueck kommt ein Ja oder ein Nein. Keine Zeile, kein Name, kein Preis,
// keine Kennung -- auch nicht, zu welchem Betrieb die Bestellung gehoert.
//
// Und die Bestellnummer ist nicht ratbar: KI-<Datum>-<6 Zufallsziffern>.
// Wer wissen will, ob eine bestimmte Person heute bestellt hat, muesste
// im Mittel eine halbe Million Mal fragen -- und wuesste dann immer noch
// nur, dass IRGENDJEMAND unter dieser Nummer bestellt hat.
//
// Aufruf:  GET /.netlify/functions/order-exists?n=KI-260819-004821
// Antwort: { ok:true, da:true }  oder  { ok:true, da:false }
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

// Genau die Form, die die App erzeugt (siehe index.html, orderNumber):
// 'KI-' + Datumskuerzel + '-' + sechs Ziffern. Strenger als noetig ist
// hier richtig: was nicht passt, kommt gar nicht erst an die Datenbank.
var NUMMER = /^KI-[0-9A-Za-z]{1,12}-[0-9]{6}$/;

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Nur GET' });

    // Ohne Dienstschluessel NICHT "da:false" antworten. Das hiesse fuer den
    // Gast "nicht angekommen" -- und er bestellt ein zweites Mal, waehrend
    // die erste Bestellung schon in der Kueche liegt.
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var nummer = ((event.queryStringParameters || {}).n || '').trim();
    if (!NUMMER.test(nummer)) return json(400, { ok: false, error: 'Keine gueltige Bestellnummer' });

    try {
        // select=id&limit=1: weniger geht nicht. Die id verlaesst die
        // Function nicht, sie ist nur das, was PostgREST zurueckgeben muss,
        // damit die Liste eine Laenge hat.
        var res = await fetch(SUPABASE_URL + '/rest/v1/orders?select=id&limit=1&order_number=eq.'
                              + encodeURIComponent(nummer), {
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
        var reihen = await res.json();
        // Nur eine LEERE Liste ist ein Beweis fuer "nicht da". Alles andere
        // ist eine unerwartete Antwort -- und die ist kein Beweis.
        if (!Array.isArray(reihen)) return json(502, { ok: false, error: 'Unerwartete Antwort' });
        return json(200, { ok: true, da: reihen.length > 0 });
    } catch (e) {
        return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
    }
};
