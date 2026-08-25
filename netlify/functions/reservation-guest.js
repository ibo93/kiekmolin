// Kiek mol in -- die Tuer, durch die der GAST reserviert.
//
// WARUM ES DIESE DATEI GIBT
// =========================
// Gemeldet am 25.08.2026: "Es kommen keine Reservierungen und Bestellung
// rein". Und dann der Satz, der alles erklaerte: "Auf App kommen die
// Reservierung auf dem Browser nicht."
//
// Im Protokoll standen drei abgewiesene Versuche von drei verschiedenen
// Geraeten -- Samsung um 11:08, iPhone um 13:17, Android um 15:10:
//
//     POST /rest/v1/reservations -> 401
//     ERROR 42501 new row violates row-level security policy
//                 for table "reservations"
//
// Drei echte Gaeste an einem Tag.
//
// DER FEHLER LAG IN MEINEN EIGENEN REGELN
// Beim Zumachen der Gaestedaten (Schritt 09) steht auf reservations:
//
//     insert  fuer anon + authenticated   -> Gast darf anlegen
//     select  NUR fuer authenticated      -> Gast darf nicht lesen
//
// Die App bat beim Speichern aber mit "Prefer: return=representation"
// darum, die neue Zeile zurueckzubekommen -- sie braucht track_token
// fuer den Verfolgen-Banner und die id fuer die Bestaetigungsmail.
// Postgres wendet fuer so ein RETURNING die LESE-Regel an. Der Gast ist
// "anon". Er durfte anlegen, aber das Ergebnis nicht sehen -- und daran
// scheiterte der ganze Vorgang.
//
// Genau deshalb ging es in der App und im Browser nicht: in der App ist
// der Betreiber angemeldet und Superadmin, die Lese-Regel laesst ihn
// durch. Der Gast im Browser ist niemand.
//
// WARUM NICHT EINFACH DEN GAST LESEN LASSEN
// Weil das genau das Loch wieder aufreisst, das Schritt 09 zugemacht
// hat: wer reservations lesen darf, liest ALLE Reservierungen -- Namen,
// Telefonnummern, Uhrzeiten, von jedem Haus.
//
// Stattdessen derselbe Weg, den die Bestellungen laengst gehen:
// order-save.js schreibt mit dem Dienstschluessel und gibt dem Gast nur
// zurueck, was ihm gehoert. Deshalb waren die Bestellungen auch nie
// betroffen. Reservierungen schrieben als einzige noch direkt aus dem
// Browser.
//
// WAS DIESE TUER ZUSAETZLICH BESSER MACHT
// Der Browser durfte bisher status mitschicken. Wer die Adresse kennt,
// haette also status: 'confirmed' senden und sich selbst bestaetigen
// koennen -- am Wirt vorbei. Jetzt entscheidet das der Server anhand
// der Einstellung des Hauses. Der Browser darf es nur noch vorschlagen,
// und der Vorschlag wird ignoriert.

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
};

function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }

function kopf() {
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
    };
}

// Nur diese Felder kommen in die Datenbank. Alles andere aus dem Aufruf
// wird stillschweigend fallengelassen -- niemand soll von aussen status,
// source oder track_token setzen koennen.
function sauber(r) {
    function text(x, max) {
        return String(x == null ? '' : x)
            .replace(/[\x00-\x1f\x7f]/g, ' ')
            .trim().slice(0, max);
    }
    var groesse = parseInt(r.party_size, 10);
    // table_id ist eine uuid oder gar nichts. Ein leerer Text laesst
    // Postgres ueber den Datentyp stolpern (22P02), nicht ueber die Regel.
    var tisch = text(r.table_id, 64);
    return {
        restaurant_id:    text(r.restaurant_id, 64),
        guest_name:       text(r.guest_name, 120),
        guest_phone:      text(r.guest_phone, 40),
        guest_email:      text(r.guest_email, 160) || null,
        party_size:       (groesse > 0 && groesse <= 50) ? groesse : null,
        reservation_date: text(r.reservation_date, 10),
        reservation_time: text(r.reservation_time, 8),
        notes:            text(r.notes, 500),
        occasion:         text(r.occasion, 60) || null,
        table_id:         (tisch.indexOf('-') > 0) ? tisch : null,
        source:           'app'
    };
}

function pruefe(r) {
    var fehler = [];
    if (!r.restaurant_id) fehler.push('restaurant_id fehlt');
    if (!r.guest_name)    fehler.push('guest_name fehlt');
    if (!r.party_size)    fehler.push('party_size fehlt oder unplausibel (1-50)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reservation_date)) fehler.push('reservation_date muss JJJJ-MM-TT sein');
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(r.reservation_time)) fehler.push('reservation_time muss HH:MM sein');
    return fehler;
}

// Gestern kann niemand mehr reservieren, und in drei Jahren will es
// niemand. Zwei Stunden Nachsicht: wer um 19:05 fuer "heute 19 Uhr"
// reserviert, meint es so.
function zeitFehler(r, jetzt) {
    var zeit = r.reservation_time.length === 5 ? r.reservation_time + ':00' : r.reservation_time;
    var wann = new Date(r.reservation_date + 'T' + zeit);
    if (isNaN(wann.getTime())) return 'Datum/Uhrzeit ergibt keinen gueltigen Zeitpunkt';
    if (wann.getTime() < jetzt - 2 * 60 * 60 * 1000) return 'Zeitpunkt liegt in der Vergangenheit';
    if (wann.getTime() > jetzt + 400 * 24 * 60 * 60 * 1000) return 'Zeitpunkt liegt mehr als ein Jahr voraus';
    return '';
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST')    return json(405, { ok: false, error: 'Nur POST' });

    if (!SERVICE_KEY) {
        console.error('[reservation-guest] SUPABASE_SERVICE_KEY fehlt');
        return json(503, { ok: false, error: 'Server nicht eingerichtet' });
    }

    var roh;
    try { roh = JSON.parse(event.body || '{}'); }
    catch (e) { return json(400, { ok: false, error: 'Ungueltiges JSON' }); }

    var r = sauber((roh && roh.reservation) || roh || {});
    var fehler = pruefe(r);
    if (fehler.length) return json(400, { ok: false, error: fehler.join('; ') });
    var zeit = zeitFehler(r, Date.now());
    if (zeit) return json(400, { ok: false, error: zeit });

    try {
        // ---- 1. Gibt es das Haus, und nimmt es ueberhaupt Reservierungen?
        var rRes = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.'
            + encodeURIComponent(r.restaurant_id)
            + '&select=id,is_active,features&limit=1', { headers: kopf() });
        if (!rRes.ok) return json(502, { ok: false, error: 'Restaurant nicht pruefbar' });
        var haus = (await rRes.json())[0];
        if (!haus)                    return json(404, { ok: false, error: 'Restaurant nicht gefunden' });
        if (haus.is_active === false) return json(403, { ok: false, error: 'Dieses Restaurant ist nicht freigeschaltet' });

        var merkmale = Array.isArray(haus.features) ? haus.features : [];
        if (merkmale.indexOf('no_reservations') >= 0) {
            return json(403, { ok: false, error: 'Online-Reservierungen sind hier nicht verfuegbar' });
        }

        // ---- 2. Der Server entscheidet ueber den Status, nicht der Browser
        // Bisher schickte die App status mit. Wer die Adresse kannte,
        // konnte sich selbst bestaetigen. Jetzt zaehlt nur die
        // Einstellung des Hauses.
        r.status = (merkmale.indexOf('auto_confirm_reservations') >= 0) ? 'confirmed' : 'pending';

        // ---- 3. Bremse gegen Dauerfeuer
        // Im Browser stand schon eine Bremse -- die schuetzt aber nur vor
        // Versehen, nicht vor jemandem, der die Adresse direkt aufruft.
        // Fuenf Reservierungen derselben Nummer in zehn Minuten sind
        // kein Gast mehr.
        if (r.guest_phone) {
            var seit = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            var zRes = await fetch(SUPABASE_URL + '/rest/v1/reservations?guest_phone=eq.'
                + encodeURIComponent(r.guest_phone)
                + '&created_at=gte.' + encodeURIComponent(seit)
                + '&select=id&limit=6', { headers: kopf() });
            if (zRes.ok) {
                var bisher = await zRes.json();
                if (Array.isArray(bisher) && bisher.length >= 5) {
                    return json(429, { ok: false, error: 'Zu viele Reservierungen. Bitte warte einige Minuten.' });
                }
            }
        }

        // ---- 4. Schreiben
        var res = await fetch(SUPABASE_URL + '/rest/v1/reservations', {
            method: 'POST',
            headers: Object.assign({ 'Prefer': 'return=representation' }, kopf()),
            body: JSON.stringify(r)
        });
        if (!res.ok) {
            var text = '';
            try { text = await res.text(); } catch (e) {}
            console.error('[reservation-guest] Speichern fehlgeschlagen', res.status, text.slice(0, 300));
            return json(502, { ok: false, error: 'Speichern fehlgeschlagen', status: res.status });
        }
        var zeile = (await res.json())[0] || {};

        // ---- 5. Zurueck geht NUR, was dem Gast gehoert
        // Kein fremder Name, keine Nachbarzeile. Genau die drei Angaben,
        // die die App braucht: die Kennung fuer die Bestaetigungsmail,
        // das Geheimnis fuer den Verfolgen-Banner und den Status.
        return json(200, {
            ok: true,
            id: zeile.id || null,
            track_token: zeile.track_token || null,
            status: zeile.status || r.status
        });
    } catch (e) {
        console.error('[reservation-guest]', e && e.message);
        return json(500, { ok: false, error: e.message });
    }
};
