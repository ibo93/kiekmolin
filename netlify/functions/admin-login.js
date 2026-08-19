// Kiek mol in — das Admin-Passwort pruefen, ohne es herauszugeben.
//
// WAS HIER VORHER PASSIERTE
// -------------------------
// Der Admin-Login in der App holte sich das Passwort und verglich es im
// Browser:
//
//     GET /rest/v1/settings?key=eq.admin_password
//     apikey: <oeffentlicher Schluessel aus dem Seitenquelltext>
//
// Damit der Login funktioniert, muss diese Zeile fuer den oeffentlichen
// Schluessel lesbar sein. Und das heisst: JEDER, der den Schluessel aus
// dem Seitenquelltext nimmt, bekommt das Admin-Passwort im Klartext.
// Einmal eintippen und man ist im Verwaltungsbereich der ganzen
// Plattform -- alle Betriebe, alle Kunden, alle Umsaetze.
//
// Ein Passwort, das der Client lesen muss, um es zu pruefen, ist kein
// Passwort. Der Vergleich gehoert auf den Server.
//
// WAS SICH DAMIT NICHT LOEST
// --------------------------
// Auch nach diesem Endpunkt entsteht KEINE Supabase-Sitzung. Der Admin
// ist fuer die Datenbank weiterhin ein Fremder, und jede Regel "to
// authenticated" laesst ihn aussen vor. Genau daran ist das Zumachen
// der Gaestedaten gescheitert: nach Schritt 04 sah das Dashboard nichts
// mehr, weil es gar nicht angemeldet war.
//
// Der richtige Weg fuehrt ueber den Google-Login wie bei den Wirten --
// der ist daneben eingebaut. Dieser Endpunkt ist die Absicherung des
// alten Wegs, solange es ihn noch gibt.
//
// Aufruf:  POST /.netlify/functions/admin-login   { "passwort": "..." }
// Antwort: { ok:true } oder 401 { ok:false }
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

// Zeichenweiser Vergleich mit fester Laufzeit.
//
// Ein gewoehnliches a === b bricht beim ersten Unterschied ab. Wer die
// Antwortzeit misst, erfaehrt daraus, wie viele Zeichen am Anfang schon
// stimmen, und kann das Passwort Zeichen fuer Zeichen erraten statt es
// zu suchen. Ueber ein Netz mit schwankender Laufzeit ist das schwer --
// aber es kostet nichts, es richtig zu machen.
function gleichLang(a, b) {
    a = String(a == null ? '' : a);
    b = String(b == null ? '' : b);
    // Verschiedene Laengen verraet ohnehin schon die Laenge; wichtig ist,
    // dass der Vergleich selbst nicht frueher abbricht.
    var unterschied = a.length ^ b.length;
    var max = Math.max(a.length, b.length);
    for (var i = 0; i < max; i++) {
        unterschied |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return unterschied === 0;
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST' });

    // Ohne Dienstschluessel NICHT durchwinken. Ein Login, der bei einem
    // Einrichtungsfehler jeden hereinlaesst, ist schlimmer als einer, der
    // niemanden hereinlaesst.
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var passwort = '';
    try { passwort = (JSON.parse(event.body || '{}').passwort || '').toString(); } catch (e) {}
    if (!passwort) return json(400, { ok: false, error: 'Kein Passwort uebergeben' });

    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/settings?select=value&key=eq.admin_password', {
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
        var reihen = await res.json();
        var hinterlegt = Array.isArray(reihen) && reihen[0] ? reihen[0].value : null;

        // Ist gar keins hinterlegt, darf NICHT jeder herein -- sonst
        // oeffnet eine leere Tabelle den Verwaltungsbereich.
        if (!hinterlegt) return json(503, { ok: false, error: 'Kein Passwort hinterlegt' });

        if (!gleichLang(passwort, hinterlegt)) return json(401, { ok: false });
        return json(200, { ok: true });
    } catch (e) {
        return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
    }
};
