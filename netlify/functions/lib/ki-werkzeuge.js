// Kiek mol in — die vier Werkzeuge fuer KI-Assistenten (kiekmolin.de/mcp).
//
// Diese Datei kennt das MCP-SDK NICHT. Sie bekommt einen Datenbank-Zugang
// (db) und den Aufruf-Kontext (ctx) hineingereicht und gibt schlichte
// Objekte zurueck. mcp.mjs meldet sie beim SDK an. So laufen die Tests
// ohne npm install -- genau wie die uebrigen ~4000 in tests/.
//
// DIE REGELN, DIE HIER DURCHGESETZT WERDEN
//   * Gelesen wird nur aus den Sichten agent_*_v (datenbank/36).
//   * Ein Haus ist nur sichtbar, wenn es in agent_optin aktiv ist.
//   * request_reservation legt IMMER status 'pending' an -- auch wenn das
//     Haus "Reservierungen sofort bestaetigen" eingeschaltet hat. Ein
//     Assistent kann sich verhoeren, ein Mensch bestaetigt.
//   * Jede Anfrage steht in agent_requests. Ohne diese Tabelle nimmt
//     request_reservation nichts an (fail closed) -- eine Anfrage, die
//     niemand zaehlen und drosseln kann, ist eine offene Tuer.

'use strict';

var KI = require('./ki-agent');

var UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
var SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;

function Absage(text) { var e = new Error(text); e.absage = true; return e; }

function vorMinuten(jetzt, min) { return new Date(jetzt.getTime() - min * 60000).toISOString(); }

function werkzeuge(db, ctx) {
    var jetzt = ctx.jetzt || new Date();

    // Protokoll darf NIE den Aufruf kaputt machen -- ausser bei der
    // Reservierung, dort wird das Ergebnis von protokoll() geprueft.
    async function protokoll(werkzeug, ergebnis, extra) {
        extra = extra || {};
        try {
            await db.anlegen('agent_requests', {
                werkzeug: werkzeug,
                client: ctx.client || 'unbekannt',
                user_agent: String(ctx.ua || '').slice(0, 200) || null,
                restaurant_id: extra.restaurant_id || null,
                ergebnis: ergebnis,
                ip_hash: ctx.ipHash || null,
                telefon_hash: extra.telefon_hash || null,
                reservation_id: extra.reservation_id || null,
                details: extra.details || null
            });
            return true;
        } catch (e) {
            console.warn('[mcp] Protokoll nicht geschrieben (' + werkzeug + '): ' + e.message);
            return false;
        }
    }

    async function leseDrossel() {
        if (!ctx.ipHash) return;
        try {
            var n = await db.zaehlen('agent_requests?ip_hash=eq.' + ctx.ipHash
                + '&created_at=gte.' + encodeURIComponent(vorMinuten(jetzt, 10)));
            var d = KI.drossel({ lesen_ip_10min: n });
            if (d) throw Absage(d);
        } catch (e) {
            if (e.absage) throw e;
            // Zaehlen ging nicht -> Lesen trotzdem erlauben. Lesen verraet
            // nichts, was nicht auch auf der Webseite steht.
        }
    }

    async function haeuser() {
        var optin = await db.lesen('agent_optin?aktiv=eq.true&select=restaurant_id');
        var ids = (optin || []).map(function (o) { return o.restaurant_id; }).filter(function (x) { return UUID.test(x); });
        if (!ids.length) return [];
        return await db.lesen('agent_restaurants_v?id=in.(' + ids.join(',') + ')&select=*') || [];
    }

    async function haus(kennung) {
        var k = String(kennung || '').trim().toLowerCase();
        if (!UUID.test(k) && !SLUG.test(k)) throw Absage('Unbekannte restaurant_id. Bitte zuerst search_restaurants aufrufen.');
        var alle = await haeuser();
        var r = alle.find(function (x) { return x.id === k || x.slug === k; });
        if (!r) throw Absage('Dieses Restaurant ist über den Assistenten nicht verfügbar. Bitte zuerst search_restaurants aufrufen.');
        return r;
    }

    async function belegungUndTische(r, datum) {
        var bel = await db.lesen('agent_belegung_v?restaurant_id=eq.' + r.id
            + '&reservation_date=eq.' + datum + '&select=reservation_time,party_size,status,table_id');
        // Wie in der App: kommt die Belegung nicht, ist die ehrliche
        // Antwort "weiss ich nicht" -- nie "alles frei".
        if (!Array.isArray(bel)) throw Absage('Die Belegung lässt sich gerade nicht abrufen. Bitte gleich nochmal versuchen oder das Restaurant anrufen.');
        var t = null;
        try {
            var tz = await db.lesen('agent_tische_v?restaurant_id=eq.' + r.id + '&select=tische');
            t = tz && tz[0] ? tz[0].tische : null;
        } catch (e) { t = null; }
        return { belegung: bel, tische: t };
    }

    // ==================== search_restaurants ====================
    async function search_restaurants(a) {
        await leseDrossel();
        var liste = KI.suchen(await haeuser(), a || {}, jetzt);
        await protokoll('search_restaurants', 'ok', { details: {
            ort: KI.sauber(a && a.ort, 60) || null, kueche: KI.sauber(a && a.kueche, 40) || null,
            hunde: !!(a && a.hunde_erlaubt), draussen: !!(a && a.draussen_sitzen),
            heute_offen: !!(a && a.heute_offen), treffer: liste.length } });
        return {
            anzahl: liste.length,
            restaurants: liste.slice(0, 20).map(function (r) { return KI.restaurantFuerAgent(r, jetzt); }),
            hinweis: liste.length ? null
                : 'Keine passenden Restaurants bei Kiek mol in. Filter lockern (z. B. ohne Küche oder Ausstattung) oder einen Nachbarort versuchen.'
        };
    }

    // ==================== get_menu ====================
    async function get_menu(a) {
        a = a || {};
        await leseDrossel();
        var r = await haus(a.restaurant_id);
        var roh = await db.lesen('agent_menu_v?restaurant_id=eq.' + r.id + '&select=*&order=sort_order.asc&limit=500');
        if (!Array.isArray(roh)) throw Absage('Die Speisekarte lässt sich gerade nicht abrufen.');
        var gerichte = roh.map(KI.gerichtFuerAgent);

        if (a.nur_vegetarisch) gerichte = gerichte.filter(function (g) { return g.vegetarisch; });
        if (a.nur_vegan) gerichte = gerichte.filter(function (g) { return g.vegan; });

        // "Ohne Gluten" heisst: nur Gerichte, bei denen der Wirt Allergene
        // eingetragen hat UND Gluten nicht dabei ist. Gerichte ohne Angabe
        // fallen raus -- sie koennten alles enthalten.
        var ohneAngabe = 0;
        var meiden = (a.ohne_allergene || []).map(function (x) { return String(x).trim().toUpperCase(); })
            .filter(function (x) { return /^[A-R]$/.test(x); });
        if (meiden.length) {
            gerichte = gerichte.filter(function (g) {
                if (!g.allergene_angegeben) { ohneAngabe++; return false; }
                return !g.allergene.some(function (x) { return meiden.indexOf(x.code) >= 0; });
            });
        }

        var kategorien = {};
        gerichte.forEach(function (g) {
            var k = g.kategorie || 'Speisekarte';
            (kategorien[k] = kategorien[k] || []).push(g);
        });

        await protokoll('get_menu', 'ok', { restaurant_id: r.id, details: {
            vegetarisch: !!a.nur_vegetarisch, vegan: !!a.nur_vegan, ohne: meiden, gerichte: gerichte.length } });
        return {
            restaurant: KI.sauber(r.name, 120),
            restaurant_id: r.slug || r.id,
            waehrung: 'EUR',
            anzahl_gerichte: gerichte.length,
            kategorien: Object.keys(kategorien).map(function (k) { return { name: k, gerichte: kategorien[k] }; }),
            allergen_legende: Object.keys(KI.ALLERGENE).map(function (k) { return KI.ALLERGENE[k].code + ' = ' + KI.ALLERGENE[k].name; }).join(', '),
            ausgelassen_ohne_allergenangabe: meiden.length ? ohneAngabe : undefined,
            hinweis: KI.HINWEIS_ALLERGENE
        };
    }

    // ==================== check_availability ====================
    async function check_availability(a) {
        a = a || {};
        await leseDrossel();
        var r = await haus(a.restaurant_id);
        if (!KI.kannReservieren(r)) throw Absage(KI.sauber(r.name, 120) + ' nimmt keine Online-Reservierungen an. Bitte telefonisch: ' + (r.phone || 'siehe Webseite'));
        var datum = KI.datumLesen(a.datum, jetzt);
        if (!datum) throw Absage('datum muss JJJJ-MM-TT, "heute" oder "morgen" sein.');
        var personen = parseInt(a.personen, 10);
        if (!(personen >= 1 && personen <= 20)) throw Absage('personen muss 1 bis 20 sein. Größere Gruppen bitte direkt anrufen.');

        var bt = await belegungUndTische(r, datum);
        var fz = KI.freieZeiten(r, datum, bt.belegung, bt.tische, jetzt);
        var wunsch = KI.hhmm(a.uhrzeit);
        var ergebnis = {
            restaurant: KI.sauber(r.name, 120),
            restaurant_id: r.slug || r.id,
            datum: datum,
            personen: personen,
            geschlossen: fz.geschlossen,
            grund: fz.grund,
            freie_zeiten: fz.zeiten
        };
        if (wunsch) {
            ergebnis.wunschzeit = wunsch;
            ergebnis.wunschzeit_frei = fz.zeiten.indexOf(wunsch) >= 0;
            if (!ergebnis.wunschzeit_frei && fz.zeiten.length) {
                var w = KI.hhmm(wunsch), mw = Number(w.slice(0, 2)) * 60 + Number(w.slice(3));
                ergebnis.alternativen = fz.zeiten.slice().sort(function (x, y) {
                    var dx = Math.abs(Number(x.slice(0, 2)) * 60 + Number(x.slice(3)) - mw);
                    var dy = Math.abs(Number(y.slice(0, 2)) * 60 + Number(y.slice(3)) - mw);
                    return dx - dy;
                }).slice(0, 3).sort();
            }
        }
        ergebnis.hinweis = 'Frei heißt: anfragbar. Eine Reservierung über den Assistenten ist erst fest, wenn das Restaurant sie bestätigt.';
        await protokoll('check_availability', 'ok', { restaurant_id: r.id, details: {
            datum: datum, personen: personen, wunsch: wunsch || null, frei: fz.zeiten.length } });
        return ergebnis;
    }

    // ==================== request_reservation ====================
    async function request_reservation(a) {
        var gelesen = KI.anfrageLesen(a, jetzt);
        var r;
        try { r = await haus(a && a.restaurant_id); }
        catch (e) { await protokoll('request_reservation', 'abgelehnt', { details: { grund: 'haus' } }); throw e; }

        var basis = { restaurant_id: r.id, details: { datum: gelesen.wert.datum, uhrzeit: gelesen.wert.uhrzeit, personen: gelesen.wert.personen } };
        if (gelesen.fehler.length) {
            await protokoll('request_reservation', 'abgelehnt', Object.assign({}, basis, { details: Object.assign({ grund: 'eingabe' }, basis.details) }));
            throw Absage('Bitte ergänzen: ' + gelesen.fehler.join('; '));
        }
        if (!KI.kannReservieren(r)) {
            throw Absage(KI.sauber(r.name, 120) + ' nimmt keine Online-Reservierungen an. Bitte telefonisch: ' + (r.phone || 'siehe Webseite'));
        }
        var v = gelesen.wert;
        var telHash = KI.hash(KI.telefonSchluessel(v.telefon), ctx.salz);
        basis.telefon_hash = telHash;

        // DROSSEL -- fail closed: ohne Zaehlung keine Anfrage.
        var z;
        try {
            var tag = encodeURIComponent(vorMinuten(jetzt, 24 * 60));
            var stunde = encodeURIComponent(vorMinuten(jetzt, 60));
            var q = 'agent_requests?werkzeug=eq.request_reservation&ergebnis=eq.ok';
            z = {
                // Alle Versuche zaehlen (auch abgelehnte), nur nicht die
                // Vorab-Zeile 'angenommen' -- sonst zaehlte jede Anfrage doppelt.
                anfragen_ip_stunde: ctx.ipHash ? await db.zaehlen('agent_requests?werkzeug=eq.request_reservation&ergebnis=neq.angenommen&ip_hash=eq.' + ctx.ipHash + '&created_at=gte.' + stunde) : 0,
                anfragen_telefon_tag: await db.zaehlen(q + '&telefon_hash=eq.' + telHash + '&created_at=gte.' + tag),
                anfragen_haus_tag: await db.zaehlen(q + '&restaurant_id=eq.' + r.id + '&created_at=gte.' + tag)
            };
        } catch (e) {
            console.error('[mcp] Drossel nicht pruefbar -- Anfrage abgelehnt: ' + e.message);
            throw Absage('Reservierungsanfragen sind gerade nicht möglich. Bitte das Restaurant direkt anrufen: ' + (r.phone || 'siehe Webseite'));
        }

        // DOPPELT? Derselbe Gast, dasselbe Haus, dieselbe Zeit innerhalb
        // eines Tages -> dieselbe Anfrage zurueckgeben statt einer zweiten.
        // Assistenten wiederholen Aufrufe, wenn eine Antwort langsam ist.
        try {
            var frueher = await db.lesen('agent_requests?werkzeug=eq.request_reservation&ergebnis=eq.ok'
                + '&telefon_hash=eq.' + telHash + '&restaurant_id=eq.' + r.id
                + '&created_at=gte.' + encodeURIComponent(vorMinuten(jetzt, 24 * 60))
                + '&select=reservation_id,details&order=created_at.desc&limit=10');
            var gleich = (frueher || []).find(function (f) {
                return f.details && f.details.datum === v.datum && f.details.uhrzeit === v.uhrzeit;
            });
            if (gleich) {
                return antwort(r, v, gleich.reservation_id, true);
            }
        } catch (e) { /* ohne Vergleich weiter -- die Drossel oben greift trotzdem */ }

        var sperre = KI.drossel(z);
        if (sperre) {
            await protokoll('request_reservation', 'gedrosselt', basis);
            throw Absage(sperre + (r.phone ? ' Telefon: ' + r.phone : ''));
        }

        var bt = await belegungUndTische(r, v.datum);
        var fz = KI.freieZeiten(r, v.datum, bt.belegung, bt.tische, jetzt);
        if (fz.zeiten.indexOf(v.uhrzeit) < 0) {
            await protokoll('request_reservation', 'abgelehnt', Object.assign({}, basis, { details: Object.assign({ grund: 'nicht frei' }, basis.details) }));
            throw Absage(fz.geschlossen
                ? 'An diesem Tag ist keine Reservierung möglich (' + fz.grund + ').'
                : v.uhrzeit + ' Uhr ist nicht anfragbar. Freie Zeiten an dem Tag: ' + (fz.zeiten.join(', ') || 'keine') + '.');
        }

        // Erst protokollieren koennen, dann anlegen: faellt das Protokoll
        // aus, zaehlt die Drossel die Anfrage nicht -- also keine Anfrage.
        var probe = await protokoll('request_reservation', 'angenommen', basis);
        if (!probe) throw Absage('Reservierungsanfragen sind gerade nicht möglich. Bitte das Restaurant direkt anrufen: ' + (r.phone || 'siehe Webseite'));

        var zeile = {
            restaurant_id: r.id,
            guest_name: v.gast_name,
            guest_phone: v.telefon,
            guest_email: v.email,
            party_size: v.personen,
            reservation_date: v.datum,
            reservation_time: v.uhrzeit,
            // Der Wirt soll im Dashboard sehen, woher die Anfrage kommt --
            // das Dashboard kennt source 'ki-assistent' (noch) nicht als
            // eigenes Abzeichen, die Notiz zeigt es aber immer an.
            notes: ('[KI-Assistent' + (ctx.client && ctx.client !== 'unbekannt' ? ' via ' + ctx.client : '') + ' – bitte bestätigen] ' + v.notiz).trim(),
            status: 'pending',
            source: 'ki-assistent'
        };
        var neu;
        try {
            neu = await db.anlegen('reservations', zeile, { zurueck: true });
        } catch (e) {
            console.error('[mcp] Reservierung nicht gespeichert: ' + e.message);
            await protokoll('request_reservation', 'fehler', basis);
            throw Absage('Die Anfrage konnte nicht gespeichert werden. Bitte das Restaurant direkt anrufen: ' + (r.phone || 'siehe Webseite'));
        }
        var id = neu && neu[0] && neu[0].id != null ? String(neu[0].id) : null;
        await protokoll('request_reservation', 'ok', Object.assign({}, basis, { reservation_id: id }));
        return antwort(r, v, id, false);
    }

    function antwort(r, v, id, wiederholt) {
        return {
            status: 'angefragt',
            bestaetigt: false,
            anfrage_nr: id ? String(id).replace(/-/g, '').slice(0, 8).toUpperCase() : null,
            wiederholt: wiederholt || undefined,
            restaurant: KI.sauber(r.name, 120),
            datum: v.datum,
            uhrzeit: v.uhrzeit,
            personen: v.personen,
            text_fuer_gast: 'Deine Anfrage ist bei ' + KI.sauber(r.name, 120) + ' eingegangen – für ' + v.personen
                + (v.personen === 1 ? ' Person' : ' Personen') + ' am ' + v.datum + ' um ' + v.uhrzeit + ' Uhr. '
                + 'Sie ist noch NICHT bestätigt. Das Restaurant bestätigt oder meldet sich unter der angegebenen Telefonnummer.'
                + (r.phone ? ' Rückfragen: ' + r.phone + '.' : '')
        };
    }

    return {
        search_restaurants: search_restaurants,
        get_menu: get_menu,
        check_availability: check_availability,
        request_reservation: request_reservation
    };
}

module.exports = { werkzeuge: werkzeuge, Absage: Absage };
