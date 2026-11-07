// GAESTE WUENSCHEN SICH EIN LOKAL (Ibo, 07.11.2026: "erstmal Kiek mol in
// viele Kunden reinbringen").
//
//   POST { slug?, name, ort }  -> zaehlt einen Wunsch    -> { ok, anzahl? }
//   GET  ?slug=<slug>          -> wie viele bisher       -> { ok, anzahl }
//
// Wozu: "7 Ihrer Gaeste wuenschen sich Sie auf Kiek mol in" -- auf dem
// Eintrag des Lokals, im Brief, beim Besuch.
//
// BEWUSST NICHT: keine IP, kein Gastname, kein Cookie (wie lead-zaehler).
//
// Antwortet IMMER 200 -- aber ehrlich: ok:false, wenn nicht gespeichert
// wurde. Die Seite zeigt dann "hat nicht geklappt" statt eines falschen
// "Danke" (CLAUDE.md Regel 6: stille Ausfaelle). Haeufigste Ursache beim
// ersten Mal: datenbank/52-lokal-wuensche.sql ist noch nicht eingespielt.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY
'use strict';
var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var KEY = process.env.SUPABASE_SERVICE_KEY || '';
var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
};
function json(obj) { return { statusCode: 200, headers: CORS, body: JSON.stringify(obj) }; }

// Text von aussen: kein HTML, keine Steuerzeichen, kurz.
function text(roh, max) {
    return String(roh == null ? '' : roh).replace(/[<>"`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
// Derselbe Slug wie die Eintragsseiten (prospectSlug in build-seo-pages.js):
// Umlaute ausgeschrieben, Akzente weg, nur a-z0-9-, hoechstens 80 Zeichen.
function slugAus(roh) {
    return String(roh == null ? '' : roh).toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// Wenige Wuensche pro Minute und Instanz -- gegen Knopf-Gewitter, ohne IP zu speichern.
var fenster = { start: 0, zahl: 0 };
function zuViele(jetzt) {
    if (jetzt - fenster.start > 60000) { fenster = { start: jetzt, zahl: 0 }; }
    fenster.zahl++;
    return fenster.zahl > 30;
}

async function rpc(name, body) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    var t = '';
    try { t = await res.text(); } catch (e) { t = ''; }
    if (!res.ok) {
        if (/lokal_wuensch|lokal_wunsch/i.test(t) && /(does not exist|schema cache|Could not find)/i.test(t)) {
            console.warn('lokal-wunsch: Tabelle/Funktion fehlt -- datenbank/52-lokal-wuensche.sql einspielen');
            return { ok: false, grund: 'SQL 52 fehlt' };
        }
        console.warn('lokal-wunsch: Supabase ' + res.status + ' - ' + t.slice(0, 200));
        return { ok: false, grund: 'HTTP ' + res.status };
    }
    var wert = null;
    try { wert = t ? JSON.parse(t) : null; } catch (e) { wert = null; }
    return { ok: true, wert: wert };
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (!KEY) return json({ ok: false, grund: 'SUPABASE_SERVICE_KEY fehlt' });
    try {
        if (event.httpMethod === 'GET') {
            var s = slugAus((event.queryStringParameters || {}).slug);
            if (s.length < 2) return json({ ok: false, grund: 'kein Lokal' });
            var g = await rpc('lokal_wuensche_summe', { p_slug: s });
            return json(g.ok ? { ok: true, anzahl: Number(g.wert) || 0 } : { ok: false, grund: g.grund });
        }
        if (event.httpMethod !== 'POST') return json({ ok: false, grund: 'Nur GET/POST' });
        var d = {};
        try { d = JSON.parse(event.body || '{}'); } catch (e) { d = {}; }
        var name = text(d.name, 80), ort = text(d.ort, 60);
        var slug = slugAus(d.slug || (name + '-' + ort));
        if (name.length < 2 || slug.length < 2) return json({ ok: false, grund: 'Bitte den Namen des Lokals angeben' });
        if (zuViele(Date.now())) return json({ ok: false, grund: 'Gerade zu viele Wünsche – bitte gleich noch einmal' });
        var w = await rpc('lokal_wuenschen', { p_slug: slug, p_name: name, p_ort: ort });
        if (!w.ok) return json({ ok: false, grund: w.grund });
        var summe = await rpc('lokal_wuensche_summe', { p_slug: slug });
        return json({ ok: true, anzahl: summe.ok ? (Number(summe.wert) || 1) : null });
    } catch (e) {
        console.warn('lokal-wunsch: ' + (e && e.message));
        return json({ ok: false, grund: 'nicht erreichbar' });
    }
};

exports._slugAus = slugAus;
exports._text = text;
