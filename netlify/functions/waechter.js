// Kiek mol in — DER WÄCHTER ALS HINTERGRUNDDIENST
//
// Läuft serverseitig alle 15 Minuten (siehe netlify.toml) und liest die
// Fehler, die im Betrieb aufgelaufen sind. Anders als der Selbstcheck im
// Dashboard braucht er niemanden, der hinsieht: er läuft auch nachts, auch
// wenn die App bei niemandem offen ist.
//
// WARUM ES IHN GIBT
// -----------------
// Beim Bestellen können drei Dinge schiefgehen, die der Gast merkt und das
// Restaurant nicht:
//   order_save_failed          — die Bestellung wurde nie gespeichert
//   order_verify_failed        — sie meldete Erfolg, war danach aber weg
//   order_items_unvollstaendig — einzelne Positionen fehlen in der Auswertung
// Diese Ereignisse schreibt die App seit dem Bestellverlust-Fix ins
// Protokoll. Bisher hat sie niemand gelesen. Genau das tut dieser Dienst.
//
// Die ersten beiden sind dringend: da wartet ein Gast auf Essen, das nie
// bestellt wurde. Deshalb geht sofort ein Push an alle Geräte des Hauses,
// mit Bestellnummer und Uhrzeit.
//
// WAS ER NICHT TUT
// ----------------
// Er beantwortet keine Reservierung, setzt keinen Preis und storniert
// nichts. Er liest und meldet. Alles, was einen echten Gast betrifft,
// entscheidet das Haus. (Um überfällige Bestellungen und Reservierungen
// kümmert sich pending-reminder.js — das hier ist ausdrücklich der Teil,
// den bisher niemand gesehen hat.)
//
// EINMALIG IN DER DATENBANK ANLEGEN:
//   ALTER TABLE restaurant_events
//     ADD COLUMN IF NOT EXISTS notified_at timestamptz;
// Ohne diese Spalte läuft der Dienst trotzdem — dann über ein Zeitfenster
// statt über einen Merker. Das ist ungenauer (eine Meldung kann doppelt
// kommen), aber besser als gar keine Meldung. Der Log sagt, welcher Weg
// gerade benutzt wird.
//
// ENV-Vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE

'use strict';

const webpush = require('web-push');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

// Läuft alle 15 Minuten. Das Rückfall-Fenster ist bewusst etwas größer,
// damit beim Umschalten nichts durchrutscht.
const FENSTER_MINUTEN = 20;

// Was gemeldet wird, und wie dringend.
const ALARM = {
    order_save_failed: {
        dringend: true,
        klartext: 'wurde nicht gespeichert'
    },
    order_verify_failed: {
        dringend: true,
        klartext: 'meldete Erfolg, war danach aber nicht auffindbar'
    },
    order_items_unvollstaendig: {
        dringend: false,
        klartext: 'Positionen fehlen in der Auswertung'
    }
};

if (VAPID_PUBLIC && VAPID_PRIVATE) {
    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
    catch (e) { console.warn('[waechter] VAPID setup failed:', e.message); }
}

function sbHeaders() {
    return {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };
}

async function sbGet(pfad) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: sbHeaders() });
    if (!res.ok) {
        const t = await res.text();
        const err = new Error('GET ' + pfad + ' -> ' + res.status + ': ' + t.slice(0, 200));
        err.status = res.status;
        err.text = t;
        throw err;
    }
    return res.json();
}

async function sbPatch(pfad, koerper) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, {
        method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(koerper)
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error('PATCH ' + pfad + ' -> ' + res.status + ': ' + t.slice(0, 200));
    }
    return res.json();
}

// Holt die noch nicht gemeldeten Ereignisse.
// Erster Versuch über den Merker notified_at. Fehlt die Spalte, wird über
// ein Zeitfenster gearbeitet -- ungenauer, aber der Dienst bleibt am Leben.
async function holeNeueEreignisse() {
    const typen = Object.keys(ALARM).join(',');
    const basis = 'restaurant_events?type=in.(' + typen + ')'
        + '&select=id,restaurant_id,type,message,payload,created_at'
        + '&order=created_at.asc&limit=100';
    try {
        return { weg: 'merker', ereignisse: await sbGet(basis + '&notified_at=is.null') };
    } catch (e) {
        // 42703 = undefined_column. Alles andere ist ein echter Fehler.
        const fehltSpalte = e.status === 400 && /notified_at|42703/.test(String(e.text || ''));
        if (!fehltSpalte) throw e;
        console.warn('[waechter] Spalte notified_at fehlt – weiche auf Zeitfenster aus. '
                   + 'ALTER TABLE restaurant_events ADD COLUMN IF NOT EXISTS notified_at timestamptz;');
        const seit = new Date(Date.now() - FENSTER_MINUTEN * 60000).toISOString();
        return { weg: 'fenster', ereignisse: await sbGet(basis + '&created_at=gte.' + encodeURIComponent(seit)) };
    }
}

async function pushAn(sub, nutzlast) {
    try {
        await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh_key, auth: sub.auth_key }
        }, JSON.stringify(nutzlast));
        return { ok: true };
    } catch (err) {
        return { ok: false, statusCode: err.statusCode, message: err.message };
    }
}

// Baut aus den Ereignissen EINES Restaurants eine einzige Meldung.
// Nicht fünf Pushes für fünf Bestellungen -- das liest niemand.
function meldungBauen(restName, ereignisse) {
    const dringend = ereignisse.filter(e => ALARM[e.type] && ALARM[e.type].dringend);
    const zeilen = ereignisse.slice(0, 3).map(e => {
        const nr = (e.payload && e.payload.order_number) || null;
        const zeit = new Date(e.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return zeit + (nr ? ' · ' + nr : '') + ' · ' + (ALARM[e.type] ? ALARM[e.type].klartext : e.type);
    });
    const mehr = ereignisse.length > zeilen.length ? ' (+' + (ereignisse.length - zeilen.length) + ' weitere)' : '';

    return {
        title: dringend.length
            ? (dringend.length === 1 ? 'Eine Bestellung ist nicht angekommen' : dringend.length + ' Bestellungen sind nicht angekommen')
            : 'Hinweis zu Bestellungen',
        body: restName + ': ' + zeilen.join(' | ') + mehr,
        icon: '/kiek-logo.png',
        badge: '/kiek-logo.png',
        tag: 'waechter-' + (ereignisse[0] && ereignisse[0].restaurant_id),
        requireInteraction: dringend.length > 0,
        vibrate: dringend.length ? [300, 120, 300, 120, 300] : [200],
        data: { type: 'waechter', restaurantId: ereignisse[0] && ereignisse[0].restaurant_id, url: '/?adminTab=orders' }
    };
}

exports.handler = async function () {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error('[waechter] SUPABASE_URL oder SUPABASE_SERVICE_KEY fehlt.');
        return { statusCode: 500, body: 'missing env' };
    }

    try {
        const { weg, ereignisse } = await holeNeueEreignisse();
        console.log('[waechter] ' + ereignisse.length + ' ungemeldete Ereignisse (Weg: ' + weg + ')');
        if (!ereignisse.length) return { statusCode: 200, body: 'nichts zu melden' };

        // Nach Restaurant bündeln.
        const proHaus = {};
        ereignisse.forEach(e => {
            if (!e.restaurant_id) return;
            (proHaus[e.restaurant_id] = proHaus[e.restaurant_id] || []).push(e);
        });

        const ids = Object.keys(proHaus);
        let namen = {};
        if (ids.length) {
            try {
                const liste = await sbGet('restaurants?id=in.(' + ids.map(encodeURIComponent).join(',') + ')&select=id,name');
                liste.forEach(r => { namen[r.id] = r.name; });
            } catch (e) { console.warn('[waechter] Namen nicht ladbar:', e.message); }
        }

        let gemeldet = 0, ohneGeraet = 0;

        for (const rid of ids) {
            const evs = proHaus[rid];
            try {
                const subs = await sbGet('push_subscriptions?restaurant_id=eq.' + encodeURIComponent(rid)
                                       + '&select=id,endpoint,p256dh_key,auth_key');
                if (!subs || !subs.length) {
                    // Kein Gerät angemeldet. Der Befund bleibt im Protokoll und
                    // im Selbstcheck sichtbar -- nur eben ohne Push.
                    console.log('[waechter] ' + (namen[rid] || rid) + ': ' + evs.length
                              + ' Ereignisse, aber kein Gerät für Push angemeldet.');
                    ohneGeraet++;
                } else if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
                    console.warn('[waechter] VAPID-Schlüssel fehlen – kein Push möglich.');
                    ohneGeraet++;
                } else {
                    const nutzlast = meldungBauen(namen[rid] || 'Dein Restaurant', evs);
                    const ergebnisse = await Promise.all(subs.map(s => pushAn(s, nutzlast)));
                    const gut = ergebnisse.filter(r => r.ok).length;
                    console.log('[waechter] ' + (namen[rid] || rid) + ': ' + evs.length
                              + ' Ereignisse an ' + gut + '/' + subs.length + ' Geräte');
                    if (gut) gemeldet++;

                    // Abgelaufene Geräte aufräumen.
                    for (let i = 0; i < ergebnisse.length; i++) {
                        if (!ergebnisse[i].ok && (ergebnisse[i].statusCode === 404 || ergebnisse[i].statusCode === 410)) {
                            try {
                                await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + subs[i].id,
                                            { method: 'DELETE', headers: sbHeaders() });
                            } catch (e) {}
                        }
                    }
                }

                // Als gemeldet markieren -- sonst kommt dieselbe Meldung alle
                // 15 Minuten wieder. Nur wenn es die Spalte gibt.
                if (weg === 'merker') {
                    const jetzt = new Date().toISOString();
                    await sbPatch('restaurant_events?id=in.(' + evs.map(e => encodeURIComponent(e.id)).join(',') + ')',
                                  { notified_at: jetzt });
                }
            } catch (e) {
                console.error('[waechter] ' + rid + ' fehlgeschlagen:', e.message);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                ereignisse: ereignisse.length, haeuser: ids.length,
                gemeldet: gemeldet, ohneGeraet: ohneGeraet, weg: weg
            })
        };
    } catch (err) {
        console.error('[waechter] fatal:', err && err.stack ? err.stack : err);
        return { statusCode: 500, body: err.message || 'error' };
    }
};

// Fuer die Tests: die reine Logik ohne Netz.
exports._intern = { ALARM, meldungBauen, FENSTER_MINUTEN };
