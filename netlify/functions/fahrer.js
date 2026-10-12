// Kiek mol in -- die Seite des Fahrers: "Bin auf dem Rueckweg".
//
// Ibo, 12.10.2026: "wenn Lieferant er drueckt ein Knopf, dass er zurueck
// kommt zum Laden, so machen die das Essen fuer die Bestellung schon
// fertig". Jeder Fahrer hat sein eigenes Profil -- einen persoenlichen
// Link, den der Wirt im Dashboard anlegt (datenbank/44-fahrer.sql).
//
// WARUM UEBER DEN SERVER
// ======================
// Der Fahrer hat kein Konto. Er darf genau EINE Zeile aendern: seine
// eigene, und dort nur den Status. Das laesst sich mit Zeilen-Regeln fuer
// anon nicht sauber sagen, ohne die Tabelle fuer alle zu oeffnen. Also
// prueft diese Function den Link (sein SHA-256-Wert steht in der Tabelle)
// und schreibt mit dem Dienstschluessel -- nur status, zurueck_um,
// aktualisiert.
//
// AUFRUF
//   GET  /.netlify/functions/fahrer          Kopf  X-Fahrer: <link-geheimnis>
//   POST /.netlify/functions/fahrer          { t, aktion: 'los'|'rueckweg'|'da', minuten }
// Das Geheimnis geht NICHT in die Adresse (?t=...): Adressen landen in
// Protokollen. Im Kopf oder im Text der Anfrage nicht.
//
// ANTWORT  { ok, name, haus, status, zurueck_um, wartend }
//   wartend = wie viele Lieferungen im Laden auf einen Fahrer warten. Nur
//   die Zahl -- keine Gastdaten.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var crypto = require('crypto');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Fahrer',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

// Das Geheimnis: 32 Zeichen aus A-Z a-z 0-9 - _ (so erzeugt es das
// Dashboard). Alles andere wird gar nicht erst nachgeschlagen.
function gueltigesGeheimnis(t) { return typeof t === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(t); }
function fingerabdruck(t) { return crypto.createHash('sha256').update(t, 'utf8').digest('hex'); }

// Minuten bis zur Rueckkehr: 1 bis 60, sonst 10. Eine Zahl vom Handy ist
// eine Behauptung -- 600 Minuten wuerde die Kueche nur verwirren.
function minuten(m) {
    var n = parseInt(m, 10);
    if (!isFinite(n) || n < 1) return 10;
    return Math.min(n, 60);
}

// Was eine Aktion in die Zeile schreibt. Rein, damit der Test sie
// ausfuehren kann.
function neuerStand(aktion, min, jetzt) {
    var t = jetzt instanceof Date ? jetzt : new Date();
    if (aktion === 'rueckweg') {
        return { status: 'rueckweg', zurueck_um: new Date(t.getTime() + minuten(min) * 60000).toISOString(), aktualisiert: t.toISOString() };
    }
    if (aktion === 'los') return { status: 'unterwegs', zurueck_um: null, aktualisiert: t.toISOString() };
    if (aktion === 'da') return { status: 'im_laden', zurueck_um: null, aktualisiert: t.toISOString() };
    return null;
}

function kopf() { return { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }; }

async function fahrerZumGeheimnis(t) {
    var r = await fetch(SUPABASE_URL + '/rest/v1/fahrer?token_hash=eq.' + fingerabdruck(t)
        + '&aktiv=eq.true&select=id,name,status,zurueck_um,restaurant_id,restaurants(name)&limit=1', { headers: kopf() });
    if (!r.ok) throw new Error('Datenbank ' + r.status + ': ' + (await r.text()).slice(0, 120));
    var rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Lieferungen, die im Laden auf einen Fahrer warten: angenommen bzw. in
// Zubereitung oder fertig, aber noch nicht unterwegs. Nur heute.
async function wartendeLieferungen(rid) {
    var heute = new Date(Date.now() - 12 * 3600000).toISOString();
    var r = await fetch(SUPABASE_URL + '/rest/v1/orders?restaurant_id=eq.' + encodeURIComponent(rid)
        + '&order_type=eq.delivery&status=in.(accepted,confirmed,preparing,ready)&created_at=gt.' + encodeURIComponent(heute)
        + '&select=id', { headers: Object.assign({ Prefer: 'count=exact', Range: '0-0' }, kopf()) });
    if (!r.ok) return null;                  // ehrlich "unbekannt", nicht 0
    var bereich = r.headers.get('content-range') || '';
    var n = parseInt(bereich.split('/')[1], 10);
    return isFinite(n) ? n : null;
}

function antwort(f, wartend) {
    return {
        ok: true,
        name: f.name,
        haus: (f.restaurants && f.restaurants.name) || '',
        status: f.status,
        zurueck_um: f.zurueck_um,
        wartend: wartend
    };
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur GET oder POST' });
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var body = {};
    if (event.httpMethod === 'POST') {
        try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return json(400, { ok: false, error: 'Ungültige Anfrage' }); }
    }
    var h = event.headers || {};
    var t = body.t || h['x-fahrer'] || h['X-Fahrer'] || '';
    if (!gueltigesGeheimnis(t)) return json(401, { ok: false, error: 'Dieser Fahrer-Link ist ungültig.' });

    try {
        var f = await fahrerZumGeheimnis(t);
        // Unbekannt und entfernt sehen gleich aus -- wer rät, erfährt nichts.
        if (!f) return json(401, { ok: false, error: 'Dieser Fahrer-Link gilt nicht mehr. Bitte im Laden einen neuen geben lassen.' });

        if (event.httpMethod === 'POST') {
            var stand = neuerStand(body.aktion, body.minuten, new Date());
            if (!stand) return json(400, { ok: false, error: 'Unbekannte Aktion' });
            var u = await fetch(SUPABASE_URL + '/rest/v1/fahrer?id=eq.' + f.id + '&select=id,status,zurueck_um', {
                method: 'PATCH',
                headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=representation' }, kopf()),
                body: JSON.stringify(stand)
            });
            if (!u.ok) throw new Error('Datenbank ' + u.status + ': ' + (await u.text()).slice(0, 120));
            var zeilen = await u.json();
            // Leere Antwort = nichts gespeichert. Das darf nicht als Erfolg
            // beim Fahrer ankommen, sonst wartet die Kueche nicht auf ihn.
            if (!Array.isArray(zeilen) || !zeilen.length) throw new Error('nicht gespeichert');
            f.status = zeilen[0].status; f.zurueck_um = zeilen[0].zurueck_um;
        }
        return json(200, antwort(f, await wartendeLieferungen(f.restaurant_id)));
    } catch (e) {
        console.error('[fahrer] ' + (e && e.message));
        return json(502, { ok: false, error: 'Gerade nicht erreichbar – bitte gleich noch einmal tippen.' });
    }
};

exports._minuten = minuten;
exports._neuerStand = neuerStand;
exports._gueltigesGeheimnis = gueltigesGeheimnis;
exports._fingerabdruck = fingerabdruck;
