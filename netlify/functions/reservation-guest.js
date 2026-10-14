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

var alarmModul = require('./lib/alarm');
var ZAHLSPERRE = require('./lib/zahlsperre');
var AKTIONEN = require('./lib/aktionen');

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
/* Ohne diese Spalten ist eine Reservierung keine Reservierung. Fehlt eine
   davon, darf NICHT stillschweigend ohne sie gespeichert werden -- dann
   stimmt etwas an der Tabelle nicht, und das muss auffallen. */
var PFLICHTFELDER = ['restaurant_id', 'guest_name', 'guest_phone',
    'party_size', 'reservation_date', 'reservation_time', 'status'];

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
        source:           'app',
        /* Einwilligung in die EINE Bewertungsanfrage per Mail. Nur true,
           wenn der Gast das Haekchen gesetzt UND eine Adresse angegeben
           hat -- eine Einwilligung ohne Adresse ist keine.
           === true, nicht !!: aus dem Browser kommt sonst jeder wahre
           Wert durch, etwa der Text "nein". */
        review_consent:   (r.review_consent === true) && !!text(r.guest_email, 160)
    };
}

// Reservierungen ausgebucht (vom Wirt im Dashboard eingetragen):
// "ausgebucht:VON:BIS" im features-Array, beide Tage einschliesslich.
// Liefert den Zeitraum, in den der Tag faellt, oder null.
function ausgebuchtAm(merkmale, tag) {
    for (var i = 0; i < merkmale.length; i++) {
        var m = String(merkmale[i]).match(/^ausgebucht:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
        if (m && tag >= m[1] && tag <= m[2]) return { von: m[1], bis: m[2] };
    }
    return null;
}
// Ein Eintrag auf die Warteliste (die App schreibt "[Warteliste] ..." in
// die Notiz). Er ist eine Bitte, kein Tisch -- darum immer "pending".
function istWarteliste(r) { return /^\[Warteliste\]/.test(r.notes || ''); }

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

exports._ausgebuchtAm = ausgebuchtAm;
exports._istWarteliste = istWarteliste;

// Sperrungen an einem Tag: 'tag' (ganzer Tag), 'zeit' (diese Uhrzeit)
// oder null. Nur Sperren OHNE Tisch -- siehe 1d im Handler.
async function gesperrtUm(restaurantId, datum, uhrzeit) {
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/reservations?restaurant_id=eq.'
            + encodeURIComponent(restaurantId) + '&reservation_date=eq.' + encodeURIComponent(datum)
            + '&status=eq.blocked&table_id=is.null&select=reservation_time,source', { headers: kopf() });
        if (!res.ok) { console.warn('[reservation-guest] Sperrungen nicht lesbar: ' + res.status); return null; }
        var zeilen = await res.json();
        if (!Array.isArray(zeilen)) return null;
        var hhmm = String(uhrzeit || '').slice(0, 5);
        var tag = null, zeit = null;
        zeilen.forEach(function (z) {
            var t = String(z.reservation_time || '').slice(0, 5);
            var m = String(z.source || '').match(/^admin_block:(geschlossen|ruhetag|ferien)$/);
            var h = m ? m[1] : 'ausgebucht';
            if (t === '00:00') tag = tag || h;
            else if (t === hhmm) zeit = zeit || h;
        });
        return tag ? { art: 'tag', hinweis: tag } : (zeit ? { art: 'zeit', hinweis: zeit } : null);
    } catch (e) {
        console.warn('[reservation-guest] Sperrungen nicht lesbar: ' + e.message);
        return null;
    }
}

function onlineTische(merkmale) {
    for (var i = 0; i < (merkmale || []).length; i++) {
        var m = String(merkmale[i]).match(/^online_tische:(\d{1,3})$/);
        if (m && +m[1] > 0) return +m[1];
    }
    return null;
}

// Wie viele Reservierungen zu genau dieser Uhrzeit schon stehen (ohne
// Absagen, ohne Sperren, ohne Warteliste). null = nicht zaehlbar.
async function belegtUm(restaurantId, datum, uhrzeit) {
    try {
        var hhmm = String(uhrzeit || '').slice(0, 5);
        var res = await fetch(SUPABASE_URL + '/rest/v1/reservations?restaurant_id=eq.'
            + encodeURIComponent(restaurantId) + '&reservation_date=eq.' + encodeURIComponent(datum)
            + '&reservation_time=eq.' + encodeURIComponent(hhmm + ':00')
            + '&status=in.(pending,confirmed,seated)&select=id,notes', { headers: kopf() });
        if (!res.ok) { console.warn('[reservation-guest] Belegung nicht zaehlbar: ' + res.status); return null; }
        var zeilen = await res.json();
        if (!Array.isArray(zeilen)) return null;
        return zeilen.filter(function (z) { return !istWarteliste(z); }).length;
    } catch (e) {
        console.warn('[reservation-guest] Belegung nicht zaehlbar: ' + e.message);
        return null;
    }
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

        // ZAHLSPERRE. Nur die Stufe "aus" sperrt Reservierungen -- bei
        // "pause" geht der Tisch weiter. Ein Tisch kostet den Betrieb
        // nichts, und der Gast wird nicht weggeschickt.
        //
        // ABSICHTLICH EINE EIGENE ABFRAGE und nicht mit in den select
        // oben: fehlt die Spalte (SQL 36 noch nicht eingespielt), waere
        // rRes nicht ok -- und dann wuerde die 502 drei Zeilen weiter oben
        // JEDE Reservierung abweisen. Genau dieser Fehler hat am 25.08.2026
        // vier Gaeste gekostet.
        var _sperre = await ZAHLSPERRE.pruefe(r.restaurant_id, 'reservieren', SERVICE_KEY);
        if (!_sperre.erlaubt) {
            console.warn('[reservation-guest] Zahlsperre ' + _sperre.stufe + ' -- abgewiesen.');
            return ZAHLSPERRE.abweisung(_sperre, CORS);
        }

        // ---- 1b. Ausgebucht? Dann nur die Warteliste.
        // Die App zeigt an solchen Tagen keine Uhrzeiten -- aber eine alte
        // Fassung auf dem Handy oder ein direkter Aufruf wuerde sonst einen
        // Tisch in einen vollen Abend buchen.
        var _voll = ausgebuchtAm(merkmale, r.reservation_date);
        if (_voll && !istWarteliste(r)) {
            return json(409, { ok: false, ausgebucht: true, von: _voll.von, bis: _voll.bis,
                error: 'An diesem Tag ist das Restaurant ausgebucht. Bitte ein anderes Datum waehlen oder auf die Warteliste setzen.' });
        }

        // ---- 1c. Besonderer Abend mit Plaetzen (Silvester, SQL 45)?
        // Dann nicht mehr Personen annehmen, als frei sind. Sonst stuende auf
        // der Seite "ausgebucht" und trotzdem kaemen Buchungen herein.
        // Faellt offen aus (lib/aktionen.js kontingent): nicht lesbar = durch.
        if (!istWarteliste(r)) {
            var _abend = await AKTIONEN.kontingent(r.restaurant_id, r.reservation_date, SERVICE_KEY, SUPABASE_URL);
            if (_abend && r.party_size > _abend.frei) {
                return json(409, { ok: false, ausgebucht: true, kontingent: true, frei: _abend.frei,
                    titel: _abend.titel, von: r.reservation_date, bis: r.reservation_date,
                    error: _abend.frei > 0
                        ? 'Fuer ' + (_abend.titel || 'diesen Abend') + ' sind nur noch ' + _abend.frei + ' Plaetze frei.'
                        : (_abend.titel || 'Dieser Abend') + ' ist ausgebucht. Gern auf die Warteliste.' });
            }
        }

        // ---- 1d. Gesperrt? (Dashboard > Reservierungen > Sperrungen)
        // Bis 14.10.2026 galt eine Sperrung NUR in der App: sie blendete
        // die Uhrzeit aus, der Server nahm trotzdem alles an. Eine alte
        // Fassung auf dem Handy, der "nur Anfrage"-Weg bei schlechtem Netz
        // oder ein direkter Aufruf buchte in einen gesperrten Abend.
        // Ganzer Tag = 00:00 ohne Tisch; Zeitraum = je Uhrzeit eine Zeile
        // ohne Tisch. Tisch-Sperren nehmen nur einen Tisch weg, nicht die
        // Uhrzeit -- die zaehlt die App.
        // Faellt offen aus: nicht lesbar = durch. Lieber eine Buchung zu
        // viel, die der Wirt absagen kann, als ein Gast, der vor einer
        // Fehlermeldung steht, weil Supabase kurz hakt.
        if (!istWarteliste(r)) {
            var _sp = await gesperrtUm(r.restaurant_id, r.reservation_date, r.reservation_time);
            if (_sp) {
                return json(409, { ok: false, ausgebucht: true, gesperrt: _sp.art, hinweis: _sp.hinweis,
                    von: r.reservation_date, bis: r.reservation_date,
                    // Fuer den Gast heisst es "ausgebucht" (Ibo, 14.10.2026),
                    // ausser der Wirt hat einen anderen Gast-Text gewaehlt.
                    error: _sp.hinweis === 'ausgebucht'
                        ? (_sp.art === 'tag' ? 'An diesem Tag ist das Restaurant ausgebucht.' : 'Diese Uhrzeit ist ausgebucht.')
                        : ({ geschlossen: 'Geschlossene Gesellschaft', ruhetag: 'Ruhetag', ferien: 'Betriebsferien' })[_sp.hinweis] + '.' });
            }

            // ---- 1e. Online buchbare Tische pro Uhrzeit ('online_tische:N').
            // Der Wirt gibt nur einen Teil der Tische online frei; die App
            // zeigt "noch 2 Tische". Ohne diese Pruefung kaeme die dritte
            // Buchung trotzdem durch. Faellt offen aus wie 1d.
            var _ot = onlineTische(merkmale);
            if (_ot) {
                var _belegt = await belegtUm(r.restaurant_id, r.reservation_date, r.reservation_time);
                if (_belegt !== null && _belegt >= _ot) {
                    return json(409, { ok: false, ausgebucht: true, gesperrt: 'zeit', hinweis: 'ausgebucht',
                        von: r.reservation_date, bis: r.reservation_date,
                        error: 'Diese Uhrzeit ist ausgebucht.' });
                }
            }
        }

        // ---- 2. Der Server entscheidet ueber den Status, nicht der Browser
        // Bisher schickte die App status mit. Wer die Adresse kannte,
        // konnte sich selbst bestaetigen. Jetzt zaehlt nur die
        // Einstellung des Hauses.
        r.status = (merkmale.indexOf('auto_confirm_reservations') >= 0) ? 'confirmed' : 'pending';
        // Warteliste: nie automatisch bestaetigt. Vorher bekam ein Gast bei
        // Haeusern mit Auto-Bestaetigung fuer einen VOLLEN Tag sofort
        // "bestaetigt" -- und stand dann vor besetzten Tischen.
        if (istWarteliste(r)) r.status = 'pending';

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

        // ---- 3b. GILT EINE AKTION FUER DIESEN TERMIN?
        //
        // "10 % bei Online-Reservierung", "Ladies Night: Gratis-Cocktail".
        // Der SERVER schlaegt nach, nicht der Browser -- sonst traegt sich
        // jeder Gast den Rabatt selbst ein. Was gilt, steht danach an der
        // Reservierung (aktion_text), und das Personal sieht es im Dashboard.
        //
        // Faellt offen aus: keine Tabelle, kein Netz -> keine Aktion, aber
        // die Reservierung geht durch. Siehe lib/aktionen.js.
        var _aktionen = await AKTIONEN.lesen(r.restaurant_id, SERVICE_KEY, SUPABASE_URL);
        var _passend = AKTIONEN.fuerReservierung(_aktionen, r.reservation_date, r.reservation_time);
        var _aktionText = AKTIONEN.textFuerReservierung(_passend);
        if (_aktionText) r.aktion_text = _aktionText;

        // ---- 4. Schreiben
        //
        // Selbst-heilend, wie bei order-save. Fehlt eine Spalte in der
        // Tabelle -- weil eine SQL-Datei noch nicht eingespielt ist --,
        // wird das Feld herausgenommen und es wird erneut versucht. Eine
        // Reservierung darf nicht daran scheitern, dass eine
        // Nebensaechlichkeit wie review_consent noch fehlt: am 25.08.2026
        // wurden vier Gaeste abgewiesen, und niemand hat es bemerkt.
        //
        // Absichtlich nur fuer Spalten, die es nicht gibt (400 mit
        // Spaltennamen). Jeder andere Fehler -- Regel, Datentyp, Netz --
        // bleibt ein Fehler und wird gemeldet.
        var res, rohtext = '';
        var koerper = {};
        Object.keys(r).forEach(function (k) { koerper[k] = r[k]; });
        for (var versuch = 0; versuch < 6; versuch++) {
            res = await fetch(SUPABASE_URL + '/rest/v1/reservations', {
                method: 'POST',
                headers: Object.assign({ 'Prefer': 'return=representation' }, kopf()),
                body: JSON.stringify(koerper)
            });
            if (res.ok) break;
            rohtext = '';
            try { rohtext = await res.text(); } catch (e) {}
            var fehlt = rohtext.match(/Could not find the '([^']+)'/)
                     || rohtext.match(/column "?([a-zA-Z_]+)"? .*does not exist/i);
            if (res.status === 400 && fehlt && fehlt[1]
                && Object.prototype.hasOwnProperty.call(koerper, fehlt[1])
                && PFLICHTFELDER.indexOf(fehlt[1]) < 0) {
                console.warn('[reservation-guest] Spalte ' + fehlt[1]
                    + ' fehlt in reservations -- ohne sie gespeichert.');
                delete koerper[fehlt[1]];
                continue;
            }
            // TISCHWUNSCH (07.10.2026, gemessen in postgres_logs): table_id
            // verweist in der Datenbank noch auf die alte Tabelle "tables",
            // der Gast waehlt aber aus restaurant_tables. Ergebnis 409/23503
            // -- der Gast waere abgewiesen worden. Bis datenbank/40-tisch-
            // zuordnung.sql eingespielt ist: ohne table_id speichern, der
            // Wunsch steht in der Notiz. Der Gast bekommt seinen Platz, das
            // Personal sieht den Wunsch.
            if (res.status === 409 && koerper.table_id && /reservations_table_id_fkey/.test(rohtext)) {
                var wunsch = 'Tischwunsch';
                try {
                    var tRes = await fetch(SUPABASE_URL + '/rest/v1/restaurant_tables?id=eq.' + encodeURIComponent(koerper.table_id)
                        + '&select=table_number,table_name', { headers: kopf() });
                    var tz = tRes.ok ? await tRes.json() : [];
                    if (Array.isArray(tz) && tz[0]) wunsch = 'Tisch: ' + (tz[0].table_name || ('Tisch ' + tz[0].table_number));
                } catch (e) {}
                console.warn('[reservation-guest] table_id verweist noch auf "tables" -- ohne Tisch gespeichert (' + wunsch + ').');
                delete koerper.table_id;
                koerper.notes = wunsch + (koerper.notes ? ' · ' + koerper.notes : '');
                continue;
            }
            break;
        }
        if (!res.ok) {
            var text = rohtext || '';
            console.error('[reservation-guest] Speichern fehlgeschlagen', res.status, text.slice(0, 300));

            // HIER STAND FRUEHER NICHTS AUSSER EINER PROTOKOLLZEILE.
            //
            // Genau das war der eigentliche Fehler vom 25.08.2026: vier
            // Gaeste wurden abgewiesen, alles stand im Protokoll, und
            // niemand hat es gelesen. Protokolle liest man erst, wenn
            // man schon weiss, dass etwas kaputt ist.
            //
            // Jetzt klingelt beim ERSTEN abgewiesenen Gast das Handy.
            // Die Probe der Wache loest keinen Alarm aus -- die hat
            // ihren eigenen, mit dem Grund darin.
            if (String(r.guest_name || '').indexOf('[Probe]') !== 0) {
                try {
                    await alarmModul.alarm(
                        'Ein Gast konnte nicht reservieren',
                        'Gerade wurde eine echte Reservierung abgewiesen (HTTP ' + res.status
                            + '). Wenn das kein Einzelfall ist, trifft es jeden Gast.',
                        'kmi-gast-abgewiesen');
                } catch (e) {}
            }
            return json(502, { ok: false, error: 'Speichern fehlgeschlagen', status: res.status });
        }
        var zeile = (await res.json())[0] || {};

        // KAM DER VORTEIL AUCH AN?
        // Fehlt die Spalte aktion_text (SQL 38 noch nicht eingespielt), hat
        // der selbstheilende Insert sie still herausgenommen. Die
        // Reservierung ist da -- aber an der Kasse weiss niemand vom
        // Rabatt, den der Gast gerade gelesen hat. Das soll nicht still
        // bleiben: Protokoll, und der Gast bekommt es in der Antwort
        // gesagt, damit er es selbst erwaehnen kann.
        var _aktionGespeichert = !!(_aktionText && Object.prototype.hasOwnProperty.call(koerper, 'aktion_text'));
        if (_aktionText && !_aktionGespeichert) {
            console.warn('[reservation-guest] Aktion "' + _aktionText + '" galt, aber aktion_text fehlt in reservations (SQL 38).');
        }

        // ---- 5. Zurueck geht NUR, was dem Gast gehoert
        // Kein fremder Name, keine Nachbarzeile. Genau die drei Angaben,
        // die die App braucht: die Kennung fuer die Bestaetigungsmail,
        // das Geheimnis fuer den Verfolgen-Banner und den Status.
        return json(200, {
            ok: true,
            id: zeile.id || null,
            track_token: zeile.track_token || null,
            status: zeile.status || r.status,
            // Was fuer diesen Termin gilt -- damit der Gast es auf der
            // Bestaetigung liest. gespeichert:false heisst: bitte im Lokal
            // erwaehnen, das Personal sieht es nicht.
            aktion: _aktionText ? { text: _aktionText, gespeichert: _aktionGespeichert } : null
        });
    } catch (e) {
        console.error('[reservation-guest]', e && e.message);
        return json(500, { ok: false, error: e.message });
    }
};
