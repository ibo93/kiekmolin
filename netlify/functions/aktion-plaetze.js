// Kiek mol in -- Restplaetze fuer einen besonderen Abend (Silvester ...).
//
// Ibo, 12.10.2026 (Luett Italia): Silvester-Block auf der Lokalseite "mit
// Menue, Ablauf und Restplaetzen". Die Plaetze stehen an der Aktion
// (datenbank/45-besonderer-abend.sql), die Reservierungen darf der Gast
// nicht lesen -- also zaehlt diese Function mit dem Dienstschluessel und
// gibt NUR Zahlen heraus. Keine Namen, keine Uhrzeiten.
//
// Aufruf:  GET /.netlify/functions/aktion-plaetze?restaurant=<uuid>&datum=JJJJ-MM-TT
// Antwort: { ok:true, plaetze, frei }      -- Kontingent gefunden
//          { ok:true, plaetze:null }       -- an dem Tag gibt es keins
//          { ok:false }                    -- nicht zaehlbar; die Seite
//                                             zeigt dann KEINE Zahl statt
//                                             einer erfundenen.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var AKTIONEN = require('./lib/aktionen');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    // Eine Minute reicht: wer Silvester bucht, sieht die Zahl nach einer
    // Minute neu -- und der Server zaehlt beim Buchen ohnehin selbst.
    'Cache-Control': 'public, max-age=60'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Nur GET' });
    if (!SUPABASE_KEY) return json(200, { ok: false, error: 'Server nicht eingerichtet' });

    var q = event.queryStringParameters || {};
    var rid = String(q.restaurant || '').trim();
    var datum = String(q.datum || '').trim();
    if (!/^[0-9a-f-]{20,}$/i.test(rid)) return json(400, { ok: false, error: 'restaurant fehlt' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return json(400, { ok: false, error: 'datum muss JJJJ-MM-TT sein' });

    var k = await AKTIONEN.kontingent(rid, datum, SUPABASE_KEY, SUPABASE_URL);
    if (k === null) {
        // null heisst bei kontingent() "keins" ODER "nicht lesbar". Fuer die
        // Seite ist beides dasselbe: keine Zahl zeigen.
        return json(200, { ok: true, plaetze: null });
    }
    return json(200, { ok: true, plaetze: k.plaetze, frei: k.frei });
};
