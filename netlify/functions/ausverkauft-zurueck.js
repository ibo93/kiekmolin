// AUSVERKAUFT -> MORGEN FRUEH WIEDER DA (09.11.2026).
//
// Das Kuechen-Display meldet "ausverkauft" mit dem Tag (menu_items.ausverkauft_am,
// datenbank/52-ausverkauft.sql). Dieser Lauf gibt jeden Morgen alles frei, was an
// einem FRUEHEREN Tag ausverkauft gemeldet wurde. Bewusst abgeschaltete Gerichte
// (ohne Tag) bleiben aus.
//
// Laeuft stuendlich, tut aber erst ab 4 Uhr deutscher Zeit etwas -- die
// Sommerzeit verschiebt die UTC-Stunde, deshalb rechnen wir in Berlin.
// Gibt IMMER 200 zurueck (wie die Wache): bei 500 startet Netlify neu.

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var AB_STUNDE = 4;

function heuteBerlin(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d || new Date());
}
function stundeBerlin(d) {
    return parseInt(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(d || new Date()), 10) % 24;
}

async function freigeben(jetzt) {
    var key = process.env.SUPABASE_SERVICE_KEY;
    var stand = { freigegeben: 0 };
    if (!key) { console.warn('[ausverkauft-zurueck] SUPABASE_SERVICE_KEY fehlt'); stand.fehler = 'kein Schluessel'; return stand; }
    if (stundeBerlin(jetzt) < AB_STUNDE) { stand.warten = 'vor 4 Uhr'; return stand; }
    var heute = heuteBerlin(jetzt);
    var res = await fetch(SUPABASE_URL + '/rest/v1/menu_items?ausverkauft_am=lt.' + heute + '&select=id,name', {
        method: 'PATCH',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ is_available: true, ausverkauft_am: null })
    });
    var text = ''; try { text = await res.text(); } catch (e) {}
    if (!res.ok) {
        // Fehlt die Spalte (SQL 52 nicht eingespielt), steht das hier -- nicht still.
        console.error('[ausverkauft-zurueck] Fehler ' + res.status + ': ' + text.slice(0, 200));
        stand.fehler = res.status;
        return stand;
    }
    var zeilen = []; try { zeilen = JSON.parse(text); } catch (e) {}
    stand.freigegeben = Array.isArray(zeilen) ? zeilen.length : 0;
    if (stand.freigegeben) console.log('[ausverkauft-zurueck] ' + stand.freigegeben + ' Gerichte wieder bestellbar.');

    // PORTIONEN: der Zaehler gilt nur fuer den Tag, an dem er gesetzt wurde.
    var res2 = await fetch(SUPABASE_URL + '/rest/v1/menu_items?portionen_am=lt.' + heute + '&select=id', {
        method: 'PATCH',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ portionen_rest: null, portionen_am: null, is_available: true })
    });
    var text2 = ''; try { text2 = await res2.text(); } catch (e) {}
    if (!res2.ok) { console.error('[ausverkauft-zurueck] Portionen: Fehler ' + res2.status + ': ' + text2.slice(0, 200)); stand.fehler_portionen = res2.status; return stand; }
    var z2 = []; try { z2 = JSON.parse(text2); } catch (e) {}
    stand.portionen_zurueck = Array.isArray(z2) ? z2.length : 0;
    if (stand.portionen_zurueck) console.log('[ausverkauft-zurueck] ' + stand.portionen_zurueck + ' Portionen-Zaehler zurueckgesetzt.');
    return stand;
}

exports.handler = async function () {
    var stand;
    try { stand = await freigeben(new Date()); }
    catch (e) { console.error('[ausverkauft-zurueck] ' + (e && e.message)); stand = { fehler: -1 }; }
    return { statusCode: 200, body: JSON.stringify(stand) };
};
exports._test = { heuteBerlin: heuteBerlin, stundeBerlin: stundeBerlin, freigeben: freigeben };
