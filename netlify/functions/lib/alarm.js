// ALARM AN DEN BETREIBER -- wenn ein Gast vor einer verschlossenen Tuer
// steht.
//
// WARUM ES DIESE DATEI GIBT
// =========================
// Am 25.08.2026 wurden vier Gaeste an einem Tag abgewiesen, weil eine
// Regel in der Datenbank ihnen das Anlegen erlaubte, aber das Lesen
// verbot. Der Fehler selbst war in einer Stunde repariert.
//
// Das eigentliche Problem: es hat TAGE gedauert, bis es jemand merkte.
// Der Gast bekam eine Fehlermeldung, ging weg und erzaehlte niemandem
// davon. Im Protokoll stand alles, aber Protokolle liest man erst, wenn
// man schon weiss, dass etwas kaputt ist.
//
// Der Betreiber dazu: "Sowas darf nie passieren...muessen bei sowas
// eine Loesung finden."
//
// Das hier ist die Loesung: sobald ein Gasteweg klemmt, klingelt sein
// Handy. Nicht "irgendwann im Bericht" -- sofort.
//
// WER BEKOMMT DEN ALARM
// Die Geraete des Superadmins. Wer das ist, entscheidet die Datenbank
// (customers.role), nicht der Aufrufer -- dieselbe Regel wie beim
// Melder. Ein Alarm, den man selbst adressieren kann, ist ein
// Werkzeug fuer den naechsten Angreifer.

'use strict';

var webpush = require('web-push');

var SUPABASE_URL  = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY || '';
var VAPID_PUBLIC  = process.env.VAPID_PUBLIC;
var VAPID_PRIVATE = process.env.VAPID_PRIVATE;
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

var vapidBereit = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); vapidBereit = true; }
    catch (e) { console.warn('[alarm] VAPID nicht eingerichtet:', e.message); }
}

function kopf() {
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
    };
}

async function hol(pfad) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: kopf() });
    if (!res.ok) throw new Error(pfad + ' -> ' + res.status);
    return res.json();
}

// Der Alarm darf nie die Sache kaputtmachen, die er ueberwacht.
// Deshalb faengt hier alles ab: geht das Melden schief, wird das
// protokolliert und der Aufrufer laeuft weiter.
async function alarm(titel, text, kennung) {
    // In die Netlify-Protokolle geht es IMMER -- auch wenn kein Handy
    // angemeldet ist. Das ist die Spur, die spaeter niemand suchen muss.
    console.error('[ALARM]', titel, '--', text);

    if (!SERVICE_KEY || !vapidBereit) {
        console.error('[alarm] kein Dienstschluessel oder kein VAPID -- nur protokolliert');
        return { ok: false, grund: 'nicht eingerichtet' };
    }

    try {
        var admins = await hol('customers?role=eq.superadmin&select=email');
        var mails = (admins || []).map(function (a) { return a && a.email; }).filter(Boolean);
        if (!mails.length) {
            console.error('[alarm] kein Superadmin hinterlegt');
            return { ok: false, grund: 'kein Superadmin' };
        }
        var liste = mails.map(function (m) { return '"' + String(m).replace(/"/g, '') + '"'; }).join(',');
        var geraete = await hol('push_subscriptions?customer_email=in.('
            + encodeURIComponent(liste) + ')&select=endpoint,p256dh_key,auth_key,id');
        if (!geraete || !geraete.length) {
            console.error('[alarm] kein Geraet angemeldet -- nur protokolliert');
            return { ok: false, grund: 'kein Geraet' };
        }

        var nutzlast = JSON.stringify({
            title: titel,
            body: text,
            icon: '/kiek-logo.png',
            badge: '/kiek-logo.png',
            // Gleiche Kennung = ein Handy zeigt nicht zwanzig gleiche
            // Meldungen uebereinander, sondern ersetzt die alte.
            tag: kennung || 'kmi-alarm',
            requireInteraction: true,
            url: '/'
        });

        var erfolge = 0;
        for (var i = 0; i < geraete.length; i++) {
            var g = geraete[i];
            try {
                await webpush.sendNotification({
                    endpoint: g.endpoint,
                    keys: { p256dh: g.p256dh_key, auth: g.auth_key }
                }, nutzlast);
                erfolge++;
            } catch (err) {
                // 404/410: das Geraet gibt es nicht mehr. Aufraeumen,
                // sonst schleppt die Liste ewig Karteileichen mit.
                if (err.statusCode === 404 || err.statusCode === 410) {
                    try {
                        await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + g.id,
                            { method: 'DELETE', headers: kopf() });
                    } catch (e2) {}
                }
            }
        }
        console.error('[alarm] an', erfolge, 'von', geraete.length, 'Geraeten');
        return { ok: erfolge > 0, geraete: geraete.length, erfolge: erfolge };
    } catch (e) {
        console.error('[alarm] Melden fehlgeschlagen:', e && e.message);
        return { ok: false, grund: e && e.message };
    }
}

module.exports = { alarm: alarm };
