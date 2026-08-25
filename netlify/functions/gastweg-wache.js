// DER KANARIENVOGEL -- alle 15 Minuten reserviert die Wache einen Tisch,
// genau wie ein echter Gast, und schaut nach, ob es geht.
//
// WARUM
// =====
// Am 25.08.2026 wurden vier Gaeste an einem Tag abgewiesen. Der Fehler
// war in einer Stunde repariert -- gemerkt hat ihn TAGE lang niemand.
//
// Der Grund ist unangenehm einfach: der Betreiber ist angemeldet. Fuer
// ihn ging alles. Der Gast ist niemand, und niemand beschwert sich --
// er geht einfach weg. Es gibt keine Stelle, an der so ein Ausfall von
// selbst auffaellt.
//
// "Sowas darf nie passieren...muessen bei sowas eine Loesung finden."
//
// Hier ist sie. Diese Function tut genau das, was ein Gast tut: sie
// ruft dieselbe Adresse auf, ohne Anmeldung, ohne Sonderrechte. Geht es
// nicht durch, klingelt das Handy des Betreibers -- innerhalb von
// hoechstens 15 Minuten, mitten in der Nacht genauso wie zur
// Mittagszeit.
//
// Ein Test, der die echte Tuer benutzt, kann nicht gruen sein, waehrend
// die Tuer klemmt. Das ist der ganze Punkt: unsere 3947 Tests lesen
// Quelltext. Sie haetten diesen Fehler NIE gefunden, weil er nicht im
// Quelltext stand, sondern in einer Regel in der Datenbank.
//
// WAS SIE HINTERLAESST
// Nichts. Die Probe-Reservierung wird sofort wieder geloescht, und
// jeder Durchlauf raeumt zuerst auf, was ein abgebrochener Vorgaenger
// liegengelassen haben koennte. Sie traegt einen eindeutigen Namen,
// liegt weit in der Zukunft und wird vom Melder uebersprungen -- kein
// Wirt bekommt je eine Meldung darueber.

'use strict';

var alarmModul = require('./lib/alarm');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
var SEITE        = process.env.URL || process.env.DEPLOY_URL || 'https://kiekmolin.de';

// Der Name, an dem die Probe zu erkennen ist. Steht an drei Stellen:
// beim Anlegen, beim Aufraeumen und im Melder, der sie ueberspringt.
// Deshalb hier einmal und nur hier.
var PROBE_NAME = '[Probe] Gastweg-Wache';

function kopf() {
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
    };
}

// Weit in der Zukunft: selbst wenn eine Probe wider Erwarten liegen
// bleibt, steht sie niemandem im Weg und faellt beim Durchsehen sofort
// als das auf, was sie ist.
function probeDatum() {
    var d = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

async function aufraeumen() {
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/reservations?guest_name=eq.'
            + encodeURIComponent(PROBE_NAME), { method: 'DELETE', headers: kopf() });
        return res.ok;
    } catch (e) {
        console.error('[wache] Aufraeumen fehlgeschlagen:', e.message);
        return false;
    }
}

// Ein Haus, an dem geprobt wird. Vorgabe per Umgebungsvariable, sonst
// das erste freigeschaltete -- die Probe wird ja sofort wieder
// geloescht, das Haus merkt nichts davon.
async function probeHaus() {
    if (process.env.WACHE_RESTAURANT_ID) return process.env.WACHE_RESTAURANT_ID;
    var res = await fetch(SUPABASE_URL
        + '/rest/v1/restaurants?is_active=eq.true&select=id&order=created_at.asc&limit=1',
        { headers: kopf() });
    if (!res.ok) return null;
    var zeilen = await res.json();
    return (zeilen && zeilen[0] && zeilen[0].id) || null;
}

exports.handler = async function () {
    if (!SERVICE_KEY) {
        console.error('[wache] SUPABASE_SERVICE_KEY fehlt -- Wache kann nicht aufraeumen');
        return { statusCode: 503, body: 'nicht eingerichtet' };
    }

    // ERST aufraeumen. Wenn ein frueherer Durchlauf mitten im Vorgang
    // abgebrochen ist, liegt noch eine Probe da -- die soll sich nicht
    // haeufen.
    await aufraeumen();

    var haus = null;
    try { haus = await probeHaus(); }
    catch (e) { /* faellt unten als "kein Haus" auf */ }

    if (!haus) {
        await alarmModul.alarm(
            'Wache: kein Haus zum Pruefen',
            'Die Gastweg-Wache findet kein freigeschaltetes Restaurant. Entweder ist keines aktiv, oder die Datenbank antwortet nicht.',
            'kmi-wache');
        return { statusCode: 200, body: JSON.stringify({ ok: false, grund: 'kein Haus' }) };
    }

    // ---- Der eigentliche Versuch: genau wie ein Gast ----------------
    // Keine apikey-Kopfzeile, keine Anmeldung, kein Sonderrecht. Wenn
    // das hier geht, geht es fuer jeden.
    var antwort = null, status = 0, netzFehler = '';
    try {
        var res = await fetch(SEITE + '/.netlify/functions/reservation-guest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id:    haus,
                guest_name:       PROBE_NAME,
                guest_phone:      '0000000000',
                party_size:       2,
                reservation_date: probeDatum(),
                reservation_time: '12:00',
                notes:            'Automatische Pruefung, wird sofort geloescht.'
            })
        });
        status = res.status;
        antwort = await res.json().catch(function () { return null; });
    } catch (e) {
        netzFehler = e && e.message;
    }

    var geklappt = !!(antwort && antwort.ok && antwort.id && antwort.track_token);

    // Immer aufraeumen -- auch wenn es geklappt hat, gerade dann.
    await aufraeumen();

    if (geklappt) {
        console.log('[wache] Gastweg in Ordnung (Haus', haus + ')');
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // ---- Es klemmt. Jetzt klingelt das Handy. -----------------------
    // Der Grund gehoert in die Meldung. "Etwas ist kaputt" hilft
    // niemandem um 23 Uhr -- "HTTP 401, RLS" sagt sofort, wo zu suchen
    // ist.
    // DER GRUND GEHOERT VOLLSTAENDIG IN DIE MELDUNG.
    //
    // Hier stand zuerst nur antwort.error -- also "Speichern
    // fehlgeschlagen". Das sagt um 23 Uhr niemandem etwas. Der HTTP-Code
    // dagegen zeigt sofort, wo zu suchen ist: 401 und 403 heissen
    // Rechte, 500 heisst Programmfehler, 404 heisst falsche Adresse.
    // Aufgefallen ist das dem eigenen Test in wache-test.js.
    var grund;
    if (netzFehler) {
        grund = 'Server nicht erreichbar: ' + netzFehler;
    } else {
        var codeTeil = 'HTTP ' + ((antwort && antwort.status) || status);
        grund = (antwort && antwort.error)
            ? (antwort.error + ' (' + codeTeil + ')')
            : codeTeil;
    }

    await alarmModul.alarm(
        'Gaeste koennen nicht reservieren',
        'Die automatische Pruefung wurde abgewiesen: ' + grund
            + '. Das trifft jeden Gast, der es gerade versucht.',
        'kmi-wache');

    // 500, damit der Ausfall auch in der Netlify-Uebersicht rot ist und
    // nicht nur in einer Protokollzeile steht.
    return { statusCode: 500, body: JSON.stringify({ ok: false, grund: grund }) };
};
