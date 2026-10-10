// Kampagnen-Zahlen fuer das Studio von Kurani Design -- NUR Zahlen.
//
// WOZU
// 1. Gaeste-Beweis: wie viele Reservierungen/Bestellungen kamen ueber welches
//    Video (Spalte kampagne, datenbank/41-kampagne.sql)?
// 2. Leere Tische: wie voll sind die naechsten 14 Abende? Ist ein Abend
//    schwach gebucht, schlaegt das Studio dem Wirt eine Story vor.
//
// WAS HERAUSGEHT -- und was NICHT
// Anzahl, Personen, Umsatz je Video-Code; Reservierungen je Tag; Summe der
// Plaetze. KEINE Namen, Telefonnummern, Mailadressen, Notizen, Adressen.
// Die Abfragen unten waehlen diese Spalten gar nicht erst aus.
//
// WER DARF
// Nur wer den Schluessel STUDIO_ZAHLEN_TOKEN kennt (Netlify -> Site
// configuration -> Environment variables). Fehlt er dort, antwortet die
// Funktion mit 503 und sagt das -- sie ist dann fuer niemanden offen.
//
//   GET /.netlify/functions/kampagnen-zahlen?restaurant=die-millis&tage=30
//   Authorization: Bearer <STUDIO_ZAHLEN_TOKEN>
'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

var HEAD = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
function json(code, obj) { return { statusCode: code, headers: HEAD, body: JSON.stringify(obj) }; }

// Vergleich ohne Zeitunterschied (wie in reservation-save.js)
function gleich(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a.length !== b.length) return false;
    var u = 0;
    for (var i = 0; i < a.length; i++) u |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return u === 0;
}

// Storniert/abgelehnt zaehlt nicht -- das waere ein Gast, der NICHT kam.
var ZAEHLT_NICHT = ['cancelled', 'canceled', 'rejected', 'declined', 'storniert', 'abgelehnt', 'no_show'];
var NICHT_IN = 'not.in.(' + ZAEHLT_NICHT.join(',') + ')';

function kopf() { return { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }; }

async function holen(pfad) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: kopf() });
    var text = '';
    try { text = await res.text(); } catch (e) {}
    var daten = null;
    try { daten = JSON.parse(text); } catch (e) {}
    return { ok: res.ok, status: res.status, daten: daten, text: text };
}

// Fehlt die Spalte kampagne (SQL noch nicht eingespielt)? PostgREST sagt es so:
function spalteFehlt(r) {
    return r.status === 400 && /kampagne/.test(r.text) && /(does not exist|Could not find|42703|PGRST)/.test(r.text);
}

// Datum in deutscher Zeit (der Server laeuft in UTC)
function berlinDatum(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

exports.handler = async function (event) {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Nur GET' });
    var TOKEN = process.env.STUDIO_ZAHLEN_TOKEN || '';
    if (!TOKEN) return json(503, { ok: false, error: 'STUDIO_ZAHLEN_TOKEN ist in Netlify nicht eingetragen -- die Zahlen sind gesperrt.' });
    var auth = String((event.headers && (event.headers.authorization || event.headers.Authorization)) || '');
    if (!gleich(auth.replace(/^Bearer\s+/i, ''), TOKEN)) return json(401, { ok: false, error: 'Falscher Schluessel' });
    if (!SERVICE_KEY) return json(503, { ok: false, error: 'SUPABASE_SERVICE_KEY fehlt' });

    var q = event.queryStringParameters || {};
    var wer = String(q.restaurant || '').trim();
    if (!/^[a-z0-9-]{2,80}$/i.test(wer)) return json(400, { ok: false, error: 'restaurant fehlt (Kurzname oder ID)' });
    var tage = Math.max(1, Math.min(400, parseInt(q.tage, 10) || 30));

    var istId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wer);
    var rr = await holen('restaurants?' + (istId ? 'id=eq.' : 'slug=eq.') + encodeURIComponent(wer) + '&select=id,name,slug&limit=1');
    if (!rr.ok) return json(502, { ok: false, error: 'Restaurant konnte nicht gelesen werden', status: rr.status });
    var rest = Array.isArray(rr.daten) && rr.daten[0];
    if (!rest) return json(404, { ok: false, error: 'Restaurant nicht gefunden: ' + wer });
    var R = encodeURIComponent(rest.id);

    var jetzt = new Date();
    var von = new Date(jetzt.getTime() - tage * 864e5).toISOString();
    var antwort = {
        ok: true,
        restaurant: { id: rest.id, name: rest.name, slug: rest.slug || null },
        zeitraum: { von: von, bis: jetzt.toISOString(), tage: tage },
        kampagnenSpalte: true,
        kampagnen: [],
        gesamt: null,
        auslastung: null
    };

    // ---- 1. Gaeste-Beweis --------------------------------------------
    var res1 = await holen('reservations?restaurant_id=eq.' + R + '&created_at=gte.' + encodeURIComponent(von)
        + '&status=' + NICHT_IN + '&select=kampagne,party_size&limit=10000');
    var ord1 = await holen('orders?restaurant_id=eq.' + R + '&created_at=gte.' + encodeURIComponent(von)
        + '&status=' + NICHT_IN + '&select=kampagne,total&limit=10000');
    if (spalteFehlt(res1) || spalteFehlt(ord1)) {
        // Nicht still leer zurueckgeben: "keine Buchungen ueber Videos" sieht
        // genauso aus wie "Spalte fehlt" -- und das eine ist falsch.
        antwort.kampagnenSpalte = false;
        antwort.hinweis = 'datenbank/41-kampagne.sql ist noch nicht eingespielt -- Buchungen ueber Videos werden noch nicht gezaehlt.';
        res1 = await holen('reservations?restaurant_id=eq.' + R + '&created_at=gte.' + encodeURIComponent(von) + '&status=' + NICHT_IN + '&select=party_size&limit=10000');
        ord1 = await holen('orders?restaurant_id=eq.' + R + '&created_at=gte.' + encodeURIComponent(von) + '&status=' + NICHT_IN + '&select=total&limit=10000');
    }
    if (!res1.ok || !ord1.ok) return json(502, { ok: false, error: 'Buchungen konnten nicht gelesen werden', status: res1.ok ? ord1.status : res1.status });

    var je = {};
    function eintrag(k) { return je[k] || (je[k] = { kampagne: k, reservierungen: 0, personen: 0, bestellungen: 0, umsatz: 0 }); }
    var g = { reservierungen: 0, personen: 0, bestellungen: 0, umsatz: 0, ueberVideos: { reservierungen: 0, bestellungen: 0, umsatz: 0 } };
    (res1.daten || []).forEach(function (z) {
        var p = parseInt(z.party_size, 10) || 0;
        g.reservierungen++; g.personen += p;
        if (z.kampagne) { var e = eintrag(z.kampagne); e.reservierungen++; e.personen += p; g.ueberVideos.reservierungen++; }
    });
    (ord1.daten || []).forEach(function (z) {
        var s = Number(z.total) || 0;
        g.bestellungen++; g.umsatz += s;
        if (z.kampagne) { var e = eintrag(z.kampagne); e.bestellungen++; e.umsatz += s; g.ueberVideos.bestellungen++; g.ueberVideos.umsatz += s; }
    });
    function rund(x) { return Math.round(x * 100) / 100; }
    g.umsatz = rund(g.umsatz); g.ueberVideos.umsatz = rund(g.ueberVideos.umsatz);
    antwort.gesamt = g;
    antwort.kampagnen = Object.keys(je).map(function (k) { je[k].umsatz = rund(je[k].umsatz); return je[k]; })
        .sort(function (a, b) { return (b.reservierungen + b.bestellungen) - (a.reservierungen + a.bestellungen); });

    // ---- 2. Auslastung der naechsten 14 Tage --------------------------
    var heute = berlinDatum(jetzt), bis14 = berlinDatum(new Date(jetzt.getTime() + 13 * 864e5));
    var aus = await holen('reservations?restaurant_id=eq.' + R + '&reservation_date=gte.' + heute + '&reservation_date=lte.' + bis14
        + '&status=' + NICHT_IN + '&select=reservation_date,reservation_time,party_size&limit=10000');
    var tische = await holen('restaurant_tables?restaurant_id=eq.' + R + '&is_active=eq.true&select=max_capacity&limit=1000');
    if (aus.ok) {
        var tageListe = [];
        for (var i = 0; i < 14; i++) {
            var d = berlinDatum(new Date(jetzt.getTime() + i * 864e5));
            tageListe.push({ datum: d, reservierungen: 0, personen: 0, abends: 0 });
        }
        var nachDatum = {};
        tageListe.forEach(function (t) { nachDatum[t.datum] = t; });
        (aus.daten || []).forEach(function (z) {
            var t = nachDatum[String(z.reservation_date).slice(0, 10)];
            if (!t) return;
            var p = parseInt(z.party_size, 10) || 0;
            t.reservierungen++; t.personen += p;
            if (String(z.reservation_time || '') >= '17:00') t.abends += p;
        });
        var plaetze = null;
        if (tische.ok && Array.isArray(tische.daten) && tische.daten.length) {
            plaetze = tische.daten.reduce(function (s, t) { return s + (parseInt(t.max_capacity, 10) || 0); }, 0) || null;
        }
        antwort.auslastung = { tage: tageListe, plaetze: plaetze, hinweis: plaetze ? null : 'Kein Tischplan angelegt -- Auslastung nur als Anzahl, nicht in Prozent.' };
    } else {
        antwort.auslastung = { tage: [], plaetze: null, hinweis: 'Reservierungen der naechsten Tage nicht lesbar (Status ' + aus.status + ').' };
    }
    return json(200, antwort);
};
