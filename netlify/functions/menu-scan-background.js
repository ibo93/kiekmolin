// Kiek mol in — Menuescanner OHNE Zeitlimit.
//
// ============================================================================
// WARUM ES DIESE DATEI GIBT
// ============================================================================
// "Mach es so einfach wie Claude im Chat" -- das ist die richtige Forderung.
// Im Chat legt man die Karte vor und bekommt sie zurueck. Ein Aufruf. Fertig.
//
// Hier ging das nicht, weil eine normale Netlify-Function nach 10 SEKUNDEN
// hart abgeschnitten wird. Eine volle Speisekarte braucht laenger. Der ganze
// Aufwand im normalen Scanner -- Abschnitte, Runden, Fortsetzungen, Zaehlen,
// Nachlesen -- existiert AUSSCHLIESSLICH, um diese 10 Sekunden zu umgehen.
//
// Diese Datei nimmt die 10 Sekunden weg, statt drumherum zu bauen.
//
// Netlify behandelt jede Function, deren Name auf "-background" endet, anders:
// sie antwortet dem Browser SOFORT mit 202 und laeuft danach bis zu 15 MINUTEN
// weiter. Damit ist der Scan wieder das, was er sein sollte: ein Aufruf, die
// ganze Karte, so wie im Chat.
//
// Der Browser bekommt das Ergebnis nicht direkt (die Verbindung ist ja schon
// zu). Deshalb legt diese Function das Ergebnis unter einer Auftragsnummer ab,
// und die App fragt alle zwei Sekunden bei menu-scan-status nach.
//
// Ablage: Tabelle activity_log, activity_type = 'menu_scan_job'. Bewusst eine
// vorhandene Tabelle mit freiem Schema -- so ist keine Datenbank-Aenderung
// noetig, die erst jemand von Hand einspielen muesste.
//
// FAELLT DIESER WEG AUS (aeltere Netlify-Plaene kennen keine
// Background-Functions), antwortet Netlify mit 404. Die App merkt das und
// nimmt den bisherigen Weg mit Abschnitten und Runden. Kein Risiko.
//
// Body: { jobId, images: [...], categories?: [...] }
// ENV:  ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var scan = require('./lib/scan-kern');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// Zeit bis Netlify abschneidet: 15 Minuten. Wir hoeren vorher von selbst auf,
// damit auch bei einer riesigen Karte noch ein Ergebnis abgelegt wird statt
// gar keins.
var BUDGET_MS = parseInt(process.env.MENU_SCAN_BG_MS || '780000', 10);   // 13 min

async function ablegen(jobId, zeile) {
    if (!SUPABASE_KEY) return;
    try {
        await fetch(SUPABASE_URL + '/rest/v1/activity_log', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                activity_type: 'menu_scan_job',
                target_type: 'menu_scan',
                target_name: String(jobId).slice(0, 120),
                message: zeile.status,
                metadata: zeile
            })
        });
    } catch (e) {
        console.warn('[menu-scan-bg] Ablegen fehlgeschlagen:', e.message);
    }
}

exports.handler = async function (event) {
    var T0 = Date.now();

    var body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 202 }; }

    var jobId = String(body.jobId || '').slice(0, 80);
    var images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
    var kategorien = Array.isArray(body.categories) ? body.categories.slice(0, 40) : [];
    var text = body.text ? String(body.text).slice(0, 20000) : '';
    if (!jobId) return { statusCode: 202 };

    var key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
        await ablegen(jobId, { status: 'fehler', fehler: 'ANTHROPIC_API_KEY fehlt in Netlify.' });
        return { statusCode: 202 };
    }

    var frist = T0 + BUDGET_MS;

    try {
        // EIN Aufruf pro Seite, die ganze Seite am Stueck -- so wie im Chat.
        // Seiten laufen gleichzeitig, weil sie voneinander unabhaengig sind.
        var proSeite = await Promise.all((images.length ? images : [null]).map(function (bild) {
            return scan.leseGanz(key, bild ? [bild] : [], text, kategorien, frist)
                .catch(function (e) { return { items: [], fehler: e.message }; });
        }));

        var alle = [], fehler = null;
        proSeite.forEach(function (p) {
            if (!fehler && p.fehler) fehler = p.fehler;
            alle = alle.concat(p.items || []);
        });

        var deduped = scan.entdoppeln(alle);

        if (!deduped.length) {
            await ablegen(jobId, {
                status: 'fehler',
                fehler: fehler || 'Keine Gerichte erkannt',
                ms: Date.now() - T0
            });
            return { statusCode: 202 };
        }

        await ablegen(jobId, {
            status: 'fertig',
            anzahl: deduped.length,
            items: deduped,
            ms: Date.now() - T0,
            seiten: images.length,
            modell: scan.MODELL,
            teilweise: !!fehler,
            fehler: fehler || null
        });
    } catch (e) {
        await ablegen(jobId, { status: 'fehler', fehler: e.message, ms: Date.now() - T0 });
    }

    return { statusCode: 202 };
};
