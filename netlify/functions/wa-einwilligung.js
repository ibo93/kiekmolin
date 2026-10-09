// WhatsApp-Einwilligung speichern -- nach einer Bestellung oder Reservierung.
//
// Ibo, 09.10.2026: Gaeste sollen bestaetigen, dass sie Angebote per WhatsApp
// bekommen duerfen -- bei Bestellung UND Reservierung, mit Namen, getrennt
// nach Quelle. Siehe datenbank/42-whatsapp-angebote.sql.
//
// WARUM DER SERVER NACHSCHLAEGT
// Die App schickt nur: Art, id, Telefon. Hier wird geprueft, dass es genau
// diese Bestellung/Reservierung mit genau dieser Nummer gibt und dass sie
// frisch ist (30 Minuten). Sonst koennte jeder beliebige Nummern eintragen,
// und der Wirt schriebe Fremden Werbung -- mit einer "Einwilligung", die
// keine ist.
//
// POST /.netlify/functions/wa-einwilligung
//   { art: 'bestellung' | 'reservierung', id, telefon }
// -> { ok:true } | { ok:false, error }
'use strict';

var WA = require('./lib/wa-angebote');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
var FRISCH_MS = 30 * 60 * 1000;

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf(mehr) { return Object.assign({ 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }, mehr || {}); }

var QUELLEN = {
    bestellung:   { tabelle: 'orders',       felder: 'id,restaurant_id,customer_phone,customer_name,created_at', tel: 'customer_phone', name: 'customer_name' },
    reservierung: { tabelle: 'reservations', felder: 'id,restaurant_id,guest_phone,guest_name,created_at',     tel: 'guest_phone',    name: 'guest_name' }
};

async function speichern(art, id, telefon, jetzt) {
    var q = QUELLEN[art];
    if (!q) return { code: 400, antwort: { ok: false, error: 'art muss bestellung oder reservierung sein' } };
    if (!/^[0-9a-f-]{8,64}$/i.test(String(id || ''))) return { code: 400, antwort: { ok: false, error: 'id fehlt' } };
    var tel = WA.nummer(telefon);
    if (!tel) return { code: 400, antwort: { ok: false, error: 'Telefonnummer fehlt oder ungueltig' } };

    var res = await fetch(SUPABASE_URL + '/rest/v1/' + q.tabelle + '?id=eq.' + encodeURIComponent(id) + '&select=' + q.felder, { headers: kopf() });
    if (!res.ok) return { code: 502, antwort: { ok: false, error: 'Nachschlagen fehlgeschlagen (' + res.status + ')' } };
    var zeile = ((await res.json()) || [])[0];
    if (!zeile) return { code: 404, antwort: { ok: false, error: 'nicht gefunden' } };
    if (WA.nummer(zeile[q.tel]) !== tel) return { code: 403, antwort: { ok: false, error: 'Nummer passt nicht zur ' + art } };
    var alter = (jetzt || Date.now()) - new Date(zeile.created_at).getTime();
    if (!(alter >= -60000 && alter <= FRISCH_MS)) return { code: 403, antwort: { ok: false, error: 'zu alt' } };

    // Upsert: einmal je Gast und Lokal. Wer schon abgemeldet war und erneut
    // zustimmt, ist wieder dabei (widerrufen_at -> null). erstmals_at und
    // abmelde_token bleiben, weil sie hier nicht mitgeschickt werden.
    var ein = await fetch(SUPABASE_URL + '/rest/v1/gast_einwilligungen?on_conflict=restaurant_id,telefon,kanal', {
        method: 'POST',
        headers: kopf({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({
            restaurant_id: zeile.restaurant_id, telefon: tel, name: String(zeile[q.name] || '').slice(0, 120) || null,
            kanal: 'whatsapp', quelle: art, bezug_id: String(zeile.id), text_fassung: WA.TEXT_FASSUNG,
            erteilt_at: new Date(jetzt || Date.now()).toISOString(), widerrufen_at: null
        })
    });
    if (!ein.ok) {
        var t = ''; try { t = (await ein.text()).slice(0, 200); } catch (e) {}
        // Tabelle fehlt -> SQL 42 nicht eingespielt. Laut, nicht still.
        console.error('[wa-einwilligung] Speichern fehlgeschlagen', ein.status, t);
        return { code: 502, antwort: { ok: false, error: /gast_einwilligungen/.test(t) ? 'Tabelle fehlt (datenbank/42 einspielen)' : 'Speichern fehlgeschlagen (' + ein.status + ')' } };
    }
    return { code: 200, antwort: { ok: true } };
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Nur POST' });
    if (!SERVICE_KEY) { console.error('[wa-einwilligung] SUPABASE_SERVICE_KEY fehlt'); return json(503, { ok: false, error: 'Server nicht eingerichtet' }); }
    var b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Ungueltiges JSON' }); }
    try {
        var r = await speichern(b.art, b.id, b.telefon);
        if (r.code !== 200) console.warn('[wa-einwilligung] abgelehnt', r.code, r.antwort.error);
        return json(r.code, r.antwort);
    } catch (e) {
        console.error('[wa-einwilligung]', e && e.message);
        return json(500, { ok: false, error: e.message });
    }
};
exports._speichern = speichern;
