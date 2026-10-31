// Kiek mol in -- TEAM-ZUGANG: Manager und Mitarbeiter mit eigener E-Mail.
//
// Ibo, 31.10.2026: "beim Anmelden soll auch Arbeiter oder Manager, auch
// deren E-Mail fuer die Anmeldung gehen". Vorher gehoerte ein Lokal genau
// EINER E-Mail -- das Team meldete sich mit dem Konto vom Chef an und sah
// alles, auch Umsatz, Vertraege und PayPal-Schluessel.
//
// WIE ES GEHT
// ===========
// Ein Teammitglied ist eine Zeile in customers: seine E-Mail, die
// restaurant_id des Lokals, role = 'team', team_rolle = 'manager' oder
// 'mitarbeiter' (datenbank/49-team.sql). Damit greift kmi_meine_haeuser()
// -- die eine Stelle, an der alle Datenbank-Regeln fragen, wer zu welchem
// Lokal gehoert. Angemeldet wird mit Google und der eigenen E-Mail.
//
// Was jemand SIEHT, regelt die App (teamRechte in index.html). Die
// Datenbank prueft in dieser ersten Fassung nur "gehoert zum Lokal", nicht
// die Rolle -- das steht so in der Freigabe.
//
// NUR DER INHABER (oder der Superadmin) verwaltet das Team -- nie ein
// Teammitglied selbst, auch kein Manager.
//
// GET    ?r=<restaurant_id>                       -> { ok, team: [...] }
// POST   { r, email, rolle: manager|mitarbeiter, name? } -> { ok, mitglied }
// DELETE { r, id }                                -> { ok }
//
// tests/team-test.js.
'use strict';

var VERWALTER = require('./lib/verwalter');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var ROLLEN = { manager: 1, mitarbeiter: 1 };

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf(extra) { return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {}); }

async function sitzungsMail(event) {
    var tok = VERWALTER.token(event);
    if (!tok) return '';
    try {
        var u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + tok } });
        if (!u.ok) return '';
        var n = await u.json();
        return n && n.email ? String(n.email).trim().toLowerCase() : '';
    } catch (e) { return ''; }
}

// Inhaber dieses Lokals = eine customers-Zeile mit seiner E-Mail und der
// restaurant_id, die KEINE Team-Zeile ist. Oder der Superadmin.
async function istInhaber(event, mail, rid) {
    if (await VERWALTER.istSuperadmin(VERWALTER.token(event), SUPABASE_KEY)) return true;
    var r = await fetch(SUPABASE_URL + '/rest/v1/customers?restaurant_id=eq.' + encodeURIComponent(rid)
        + '&email=ilike.' + encodeURIComponent(mail) + '&select=role&limit=5', { headers: kopf() });
    if (!r.ok) return false;
    var zeilen = (await r.json()) || [];
    return zeilen.some(function (z) { return String(z.role || '').trim().toLowerCase() !== 'team'; });
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (!SUPABASE_KEY) return json(503, { ok: false, error: 'Server nicht eingerichtet' });

    var b = {};
    if (event.httpMethod !== 'GET') { try { b = JSON.parse(event.body || '{}'); } catch (e) { b = {}; } }
    var q = event.queryStringParameters || {};
    var rid = String(b.r || q.r || '');
    if (!/^[0-9a-f-]{20,}$/i.test(rid)) return json(400, { ok: false, error: 'Lokal fehlt' });

    var mail = await sitzungsMail(event);
    if (!mail) return json(401, { ok: false, error: 'Nicht angemeldet' });
    try {
        if (!(await istInhaber(event, mail, rid))) return json(403, { ok: false, error: 'Nur der Inhaber kann das Team verwalten' });

        if (event.httpMethod === 'GET') {
            var l = await fetch(SUPABASE_URL + '/rest/v1/customers?restaurant_id=eq.' + encodeURIComponent(rid)
                + '&role=eq.team&select=id,name,email,team_rolle,is_active,created_at&order=created_at.asc', { headers: kopf() });
            if (!l.ok) {
                var lt = ''; try { lt = await l.text(); } catch (e) {}
                if (/team_rolle/.test(lt)) return json(409, { ok: false, sqlFehlt: true, error: 'Bitte einmal datenbank/49-team.sql in Supabase einspielen.' });
                return json(502, { ok: false, error: 'Team nicht lesbar (' + l.status + ')' });
            }
            return json(200, { ok: true, team: await l.json() });
        }

        if (event.httpMethod === 'POST') {
            var email = String(b.email || '').trim().toLowerCase();
            var rolle = String(b.rolle || '').trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return json(400, { ok: false, error: 'Diese E-Mail-Adresse sieht nicht richtig aus' });
            if (!ROLLEN[rolle]) return json(400, { ok: false, error: 'Rolle muss Manager oder Mitarbeiter sein' });
            if (email === mail) return json(400, { ok: false, error: 'Das ist deine eigene Adresse – du bist schon Inhaber' });
            // Eine Adresse, die schon ein Konto hat (eigenes Lokal, Gast,
            // anderes Team), wuerde beim Anmelden das falsche Lokal oeffnen.
            var d = await fetch(SUPABASE_URL + '/rest/v1/customers?email=ilike.' + encodeURIComponent(email) + '&select=id,role,restaurant_id&limit=1', { headers: kopf() });
            if (d.ok && ((await d.json()) || []).length) return json(409, { ok: false, error: 'Diese E-Mail hat schon ein Konto bei Kiek mol in. Bitte eine andere Adresse nehmen.' });
            var neu = { email: email, restaurant_id: rid, role: 'team', team_rolle: rolle, is_active: true, name: String(b.name || '').trim().slice(0, 80) || email.split('@')[0] };
            var p = await fetch(SUPABASE_URL + '/rest/v1/customers', { method: 'POST', headers: kopf({ Prefer: 'return=representation' }), body: JSON.stringify(neu) });
            var pt = ''; try { pt = await p.text(); } catch (e) {}
            if (!p.ok) {
                console.error('[team] Anlegen fehlgeschlagen: ' + p.status + ' ' + pt.slice(0, 200));
                if (/team_rolle/.test(pt)) return json(409, { ok: false, sqlFehlt: true, error: 'Bitte einmal datenbank/49-team.sql in Supabase einspielen.' });
                return json(502, { ok: false, error: 'Nicht gespeichert (' + p.status + ')' });
            }
            var zeile = null; try { zeile = (JSON.parse(pt) || [])[0]; } catch (e) {}
            if (!zeile) return json(502, { ok: false, error: 'Nicht gespeichert – die Datenbank hat nichts zurückgegeben' });
            return json(200, { ok: true, mitglied: { id: zeile.id, name: zeile.name, email: zeile.email, team_rolle: zeile.team_rolle } });
        }

        if (event.httpMethod === 'DELETE') {
            var id = String(b.id || '');
            if (!id) return json(400, { ok: false, error: 'Wer soll entfernt werden?' });
            // Nur Team-Zeilen DIESES Lokals -- nie der Inhaber, nie ein fremdes Lokal.
            var x = await fetch(SUPABASE_URL + '/rest/v1/customers?id=eq.' + encodeURIComponent(id) + '&restaurant_id=eq.' + encodeURIComponent(rid) + '&role=eq.team',
                { method: 'DELETE', headers: kopf({ Prefer: 'return=representation' }) });
            var weg = []; try { weg = await x.json(); } catch (e) {}
            if (!x.ok || !Array.isArray(weg) || !weg.length) return json(404, { ok: false, error: 'Nicht entfernt – diese Person gehört nicht (mehr) zum Team' });
            // Seine Handys bekommen ab jetzt keine Bestellungen mehr: die
            // Geraete-Zeilen dieses Lokals mit seiner E-Mail weg.
            var wegMail = String(weg[0].email || '').trim().toLowerCase(), handys = true;
            if (wegMail) {
                try {
                    var h = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?restaurant_id=eq.' + encodeURIComponent(rid) + '&customer_email=ilike.' + encodeURIComponent(wegMail),
                        { method: 'DELETE', headers: kopf() });
                    handys = h.ok;
                } catch (e) { handys = false; }
                if (!handys) console.error('[team] Handys von ' + wegMail + ' nicht entfernt');
            }
            return json(200, { ok: true, handysEntfernt: handys });
        }
        return json(405, { ok: false, error: 'Methode nicht erlaubt' });
    } catch (e) {
        console.error('[team] ' + (e && e.message));
        return json(502, { ok: false, error: 'Gerade nicht möglich' });
    }
};
