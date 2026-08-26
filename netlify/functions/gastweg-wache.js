// DER KANARIENVOGEL -- alle 15 Minuten geht die Wache selbst die Wege,
// die ein Gast geht, und schaut nach, ob sie offen sind.
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
// "dar nie sowas passieren auch nicht bei Bestellungen"
//
// Ein Test, der die echte Tuer benutzt, kann nicht gruen sein, waehrend
// die Tuer klemmt. Das ist der ganze Punkt: unsere Tests lesen
// Quelltext. Sie haetten den Fehler NIE gefunden, weil er nicht im
// Quelltext stand, sondern in einer Regel in der Datenbank.
//
// DREI PRUEFUNGEN
// ===============
//   1. Reservieren    -- der Weg, der am 25.08. zu war.
//   2. Bestellen      -- derselbe Weg fuer Bestellungen.
//   3. Preis-Schutz   -- und der ist der interessanteste.
//
// Zu 3: Am selben Tag kam heraus, dass der Preis-Check bei JEDER
// Bestellung aus war -- eine Abfrage fragte nach einer Spalte, die es
// nicht gibt, die Pruefung fiel in den catch-Zweig und liess alles
// durch. Absichtlich faellt sie offen aus, damit eine Stoerung keine
// echte Bestellung verhindert; genau deshalb hat es monatelang niemand
// gemerkt.
//
// Deshalb schickt die Wache eine absichtlich ZU BILLIGE Bestellung: ein
// echtes Gericht fuer 0 Euro. Die MUSS abgelehnt werden. Kommt sie
// durch, ist der Schutz wieder aus -- und das Handy klingelt.
//
// WAS SIE HINTERLAESST
// Nichts. Jede Probe wird sofort geloescht, und jeder Durchlauf raeumt
// zuerst auf, was ein abgebrochener Vorgaenger liegengelassen haben
// koennte. Die Proben tragen einen eindeutigen Namen, liegen weit in
// der Zukunft und werden vom Melder uebersprungen -- kein Wirt bekommt
// je eine Meldung ueber einen Gast, den es nie gab.

'use strict';

var alarmModul = require('./lib/alarm');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
var SEITE        = process.env.URL || process.env.DEPLOY_URL || 'https://kiekmolin.de';

// Der Name, an dem jede Probe zu erkennen ist. Steht beim Anlegen, beim
// Aufraeumen und im Melder, der sie ueberspringt -- deshalb hier einmal
// und nur hier.
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

// Beide Tabellen, immer beide -- auch wenn nur eine Pruefung lief.
// Aufraeumen, das nur den eigenen Pfad kennt, laesst irgendwann etwas
// liegen.
async function aufraeumen() {
    var wege = [
        'reservations?guest_name=eq.' + encodeURIComponent(PROBE_NAME),
        'orders?customer_name=eq.' + encodeURIComponent(PROBE_NAME)
    ];
    for (var i = 0; i < wege.length; i++) {
        try {
            await fetch(SUPABASE_URL + '/rest/v1/' + wege[i], { method: 'DELETE', headers: kopf() });
        } catch (e) {
            console.error('[wache] Aufraeumen fehlgeschlagen:', wege[i], e.message);
        }
    }
}

// Ein Haus, an dem geprobt wird. Vorgabe per Umgebungsvariable, sonst
// das erste freigeschaltete -- die Proben werden ja sofort wieder
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

// Ein echtes Gericht mit echtem Preis -- gebraucht fuer die
// Preis-Schutz-Probe. Ohne Karte laesst sich der Schutz nicht pruefen.
async function probeGericht(haus) {
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/menu_items?restaurant_id=eq.'
            + encodeURIComponent(haus)
            + '&base_price=gte.1&select=id,base_price&limit=1', { headers: kopf() });
        if (!res.ok) return null;
        var zeilen = await res.json();
        return (zeilen && zeilen[0]) || null;
    } catch (e) { return null; }
}

// Antwort einer Gaeste-Tuer holen -- genau wie ein Gast: keine
// apikey-Kopfzeile, keine Anmeldung, kein Sonderrecht. Wenn es hier
// geht, geht es fuer jeden.
async function alsGast(pfad, rumpf) {
    try {
        var res = await fetch(SEITE + '/.netlify/functions/' + pfad, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rumpf)
        });
        var daten = await res.json().catch(function () { return null; });
        return { status: res.status, daten: daten };
    } catch (e) {
        return { status: 0, daten: null, netzFehler: (e && e.message) || 'unbekannt' };
    }
}

// Aus einer Antwort einen Grund machen, den man um 23 Uhr lesen kann.
// "Etwas ist kaputt" hilft niemandem -- der HTTP-Code zeigt sofort, wo
// zu suchen ist: 401/403 heisst Rechte, 500 heisst Programmfehler,
// 404 heisst falsche Adresse.
function grundAus(a) {
    if (a.netzFehler) return 'Server nicht erreichbar: ' + a.netzFehler;
    var code = 'HTTP ' + ((a.daten && a.daten.status) || a.status);
    return (a.daten && a.daten.error) ? (a.daten.error + ' (' + code + ')') : code;
}

// ---- PRUEFUNG 1: Kann ein Gast reservieren? -------------------------
async function pruefeReservierung(haus) {
    var a = await alsGast('reservation-guest', {
        restaurant_id:    haus,
        guest_name:       PROBE_NAME,
        guest_phone:      '0000000000',
        party_size:       2,
        reservation_date: probeDatum(),
        reservation_time: '12:00',
        notes:            'Automatische Pruefung, wird sofort geloescht.'
    });
    // Halb reicht nicht: ohne track_token haette der Gast keinen
    // Verfolgen-Banner, und das faellt sonst wieder niemandem auf.
    if (a.daten && a.daten.ok && a.daten.id && a.daten.track_token) return null;
    if (a.daten && a.daten.ok) return 'Reservieren: Antwort unvollstaendig (id/track_token fehlt)';
    return 'Reservieren: ' + grundAus(a);
}

// ---- PRUEFUNG 2: Kann ein Gast bestellen? ---------------------------
async function pruefeBestellung(haus) {
    var a = await alsGast('order-save', {
        order: {
            order_number:  'PROBE-' + Date.now(),
            restaurant_id: haus,
            customer_name: PROBE_NAME,
            customer_phone: '0000000000',
            status:        'received',
            order_type:    'pickup',
            items:         [],
            subtotal:      0,
            total:         0
        }
    });
    if (a.daten && a.daten.ok && a.daten.id) return null;
    return 'Bestellen: ' + grundAus(a);
}

// ---- PRUEFUNG 3: Lebt der Preis-Schutz noch? ------------------------
// Ein echtes Gericht fuer 0 Euro. Das MUSS abgelehnt werden.
async function pruefePreisSchutz(haus) {
    var gericht = await probeGericht(haus);
    if (!gericht) return null;          // ohne Karte nicht pruefbar, kein Alarm

    var a = await alsGast('order-save', {
        order: {
            order_number:  'PROBE-BILLIG-' + Date.now(),
            restaurant_id: haus,
            customer_name: PROBE_NAME,
            customer_phone: '0000000000',
            status:        'received',
            order_type:    'pickup',
            items:         [{ menu_item_id: gericht.id, quantity: 1, price: 0 }],
            subtotal:      0,
            total:         0
        }
    });
    if (a.status === 422 && a.daten && a.daten.preis_abgelehnt) return null;   // richtig abgewiesen
    if (a.netzFehler) return 'Preis-Schutz: ' + grundAus(a);
    return 'Preis-Schutz IST AUS: ein Gericht fuer ' + gericht.base_price
         + ' Euro ging fuer 0 Euro durch (HTTP ' + a.status + ')';
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

    // Alle drei laufen, auch wenn die erste schon klemmt. Sonst weiss
    // man nach dem Alarm nur, dass EIN Weg zu ist -- und repariert ihn,
    // waehrend der naechste noch immer zu ist.
    var maengel = [];
    var pruefungen = [pruefeReservierung, pruefeBestellung, pruefePreisSchutz];
    for (var i = 0; i < pruefungen.length; i++) {
        try {
            var m = await pruefungen[i](haus);
            if (m) maengel.push(m);
        } catch (e) {
            maengel.push('Pruefung ' + (i + 1) + ' ist selbst abgestuerzt: ' + ((e && e.message) || e));
        }
    }

    // Immer aufraeumen -- auch wenn alles geklappt hat, gerade dann.
    await aufraeumen();

    if (!maengel.length) {
        console.log('[wache] alle Gastwege in Ordnung (Haus', haus + ')');
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // ---- Es klemmt. Jetzt klingelt das Handy. -----------------------
    await alarmModul.alarm(
        maengel.length === 1 ? 'Ein Gastweg klemmt' : (maengel.length + ' Gastwege klemmen'),
        maengel.join(' -- ') + '. Das trifft jeden Gast, der es gerade versucht.',
        'kmi-wache');

    // 500, damit der Ausfall auch in der Netlify-Uebersicht rot ist und
    // nicht nur in einer Protokollzeile steht.
    return { statusCode: 500, body: JSON.stringify({ ok: false, maengel: maengel }) };
};
