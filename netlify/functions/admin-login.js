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
// WAS DIESER ENDPUNKT SEIT DEM 21.08.2026 ZUSAETZLICH TUT
// --------------------------------------------------------
// Er erzeugt bei richtigem Passwort eine ECHTE Supabase-Sitzung.
//
// Vorher tat er das nicht, und das war der Grund, warum die Gaestedaten
// nicht zugehen konnten. Der Ablauf war:
//
//     Passwort richtig  ->  { ok:true }
//     Browser           ->  localStorage setzen, Dashboard aufmachen
//     jede Abfrage      ->  Authorization: Bearer <oeffentlicher Schluessel>
//
// Fuer die Datenbank war der Admin damit ein Fremder (Rolle "anon").
// Solange alle Tabellen offen standen, fiel das nicht auf. In dem
// Moment, in dem eine Regel "nur wer angemeldet ist und dazugehoert"
// greift, sieht dieses Dashboard nichts mehr -- genau der Ausfall vom
// 20.08.2026, nur fuer den Verwaltungsbereich statt fuer die Wirte.
//
// Der Weg jetzt:
//
//     1. Passwort pruefen (unveraendert, zeichenweise, feste Laufzeit)
//     2. E-Mail des Superadmins aus customers holen -- NICHT fest
//        eingetragen, sonst laufen Datenbank und Code auseinander;
//        genau daran ist es am 20.08. schon einmal gescheitert
//     3. Beim Auth-Dienst ein Einmal-Token fuer diese Adresse erzeugen
//        (admin/generate_link, geht nur mit dem Dienstschluessel)
//     4. Nur den Token-Hash herausgeben
//
// Der Browser tauscht ihn ueber verifyOtp() gegen eine Sitzung. Ab dann
// ist kmiToken() ein echtes Token und kmi_ist_superadmin() sagt ja.
//
// WARUM DAS NICHTS AUFWEICHT
// Wer das Passwort kennt, kam vorher schon in den Verwaltungsbereich --
// und dort war ohnehin alles lesbar, weil nichts zugesperrt war. Neu
// ist nicht der Zugang, neu ist, dass die Datenbank ihn jetzt kennt und
// entsprechend begrenzen kann. Ohne diesen Schritt bliebe nur, den
// Passwort-Weg abzuschaffen.
//
// WAS DAMIT NICHT GELOEST IST
// Es gibt keine Versuchsbegrenzung. Wer das Passwort raten will, darf
// das beliebig oft. Der Google-Login daneben ist weiterhin der bessere
// Weg; dieser hier ist die Rueckfalltuer, solange es sie gibt.
//
// Aufruf:  POST /.netlify/functions/admin-login   { "passwort": "..." }
// Antwort: { ok:true, email, token_hash } oder 401 { ok:false }
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

        // Ab hier ist das Passwort richtig. Jetzt die Sitzung.

        // 1. WER IST DER SUPERADMIN? Steht in customers, nicht hier.
        //    Fest eingetragen war die Adresse frueher an mehreren
        //    Stellen -- und am 20.08.2026 stand in customers
        //    ibo@kiekmolin.de, angemeldet wurde sich mit
        //    ibo.kuran93@gmail.com. Fuer die Datenbank zwei Menschen.
        //    Deshalb gilt hier ausschliesslich, was in customers steht:
        //    dieselbe Zeile, die auch kmi_ist_superadmin() prueft.
        var admRes = await fetch(SUPABASE_URL
            + '/rest/v1/customers?select=email&role=eq.superadmin&limit=1', {
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
            signal: AbortSignal.timeout(8000)
        });
        var admZeilen = admRes.ok ? await admRes.json() : [];
        var admMail = (Array.isArray(admZeilen) && admZeilen[0] && admZeilen[0].email) || '';
        if (!admMail) {
            // Kein Superadmin eingetragen: NICHT durchwinken. Lieber
            // klemmt der Login, als dass er ohne Zuordnung aufmacht.
            return json(503, { ok: false, error: 'Kein Superadmin hinterlegt' });
        }

        // 2. EINMAL-TOKEN FUER DIESE ADRESSE.
        //    generate_link legt keinen Benutzer an -- gibt es die
        //    Adresse im Auth-Dienst nicht, kommt ein Fehler. Das ist
        //    gewollt: die Sitzung soll an ein bestehendes Konto gehen,
        //    nicht eines erfinden.
        var linkRes = await fetch(SUPABASE_URL + '/auth/v1/admin/generate_link', {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'magiclink', email: admMail }),
            signal: AbortSignal.timeout(8000)
        });
        if (!linkRes.ok) {
            // Das Passwort war richtig, nur die Sitzung kam nicht
            // zustande. Kein ok:true zurueckgeben -- ein halber Login
            // fuehrt in ein Dashboard, das nichts anzeigen kann, und
            // das sieht aus wie Datenverlust.
            return json(502, { ok: false, error: 'Anmeldung nicht moeglich' });
        }
        var link = await linkRes.json().catch(function () { return null; });

        // Je nach Version des Auth-Dienstes liegt der Hash oben oder
        // unter "properties". Beide Wege pruefen, statt sich auf einen
        // zu verlassen.
        var hash = (link && (link.hashed_token
            || (link.properties && link.properties.hashed_token))) || '';
        if (!hash) return json(502, { ok: false, error: 'Anmeldung nicht moeglich' });

        // Herausgegeben wird NUR der Hash -- nicht der fertige Link,
        // nicht das Einmal-Passwort im Klartext, nicht der
        // Dienstschluessel.
        return json(200, { ok: true, email: admMail, token_hash: hash });
    } catch (e) {
        return json(502, { ok: false, error: 'Datenbank nicht erreichbar' });
    }
};
