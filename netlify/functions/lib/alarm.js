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
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM     = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';

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
            // KEIN GERAET -- ABER NICHT SCHWEIGEN.
            //
            // Gemessen am 26.08.2026 um 13:11:45: der Melder suchte die
            // Geraete des Superadmins und bekam eine leere Liste zurueck.
            // Die Wache lief gruen, aber ein Alarm haette niemanden
            // erreicht -- er waere in ein Protokoll gegangen, das keiner
            // liest. Genau die Stille, die diese Woche einen Tag
            // gekostet hat.
            //
            // Ein Push braucht ein Geraet, das sich einmal angemeldet
            // hat. Das ist ein Schritt, den ein Mensch nicht vergessen
            // darf -- und darauf darf sich ein Waechter nie verlassen.
            // E-Mail braucht nichts ausser der Adresse aus customers.
            console.error('[alarm] kein Geraet angemeldet -- weiche auf E-Mail aus');
            var perMail = await mailAlarm(mails, titel, text);
            return { ok: perMail, weg: 'email', grund: perMail ? null : 'kein Geraet, keine Mail' };
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
        // Auch wenn Geraete eingetragen sind, koennen alle abgelehnt
        // haben (Erlaubnis entzogen, Geraet weg). Dann dasselbe: nicht
        // schweigen.
        if (erfolge === 0) {
            console.error('[alarm] kein Geraet erreicht -- weiche auf E-Mail aus');
            var perMail2 = await mailAlarm(mails, titel, text);
            return { ok: perMail2, weg: 'email', geraete: geraete.length, erfolge: 0 };
        }
        return { ok: true, weg: 'push', geraete: geraete.length, erfolge: erfolge };
    } catch (e) {
        console.error('[alarm] Melden fehlgeschlagen:', e && e.message);
        return { ok: false, grund: e && e.message };
    }
}

// Der zweite Weg. Kein Ersatz fuer den Push -- der ist schneller und
// weckt auch nachts -- aber der Weg, der immer da ist.
async function mailAlarm(mails, titel, text) {
    if (!RESEND_API_KEY) {
        console.error('[alarm] RESEND_API_KEY fehlt -- Alarm bleibt im Protokoll');
        return false;
    }
    if (!mails || !mails.length) return false;
    var html = '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px">'
        + '<h2 style="color:#b91c1c;margin:0 0 12px">' + String(titel).replace(/[<>&]/g, '') + '</h2>'
        + '<p style="font-size:16px;line-height:1.5">' + String(text).replace(/[<>&]/g, '') + '</p>'
        + '<p style="color:#64748b;font-size:13px;margin-top:20px">'
        + 'Automatische Meldung der Gastweg-Wache von kiek mol in. '
        + 'Diese Nachricht kam per E-Mail, weil kein Handy fuer Benachrichtigungen '
        + 'eingetragen ist -- einmal im Admin-Dashboard anmelden, dann kommt sie sofort aufs Handy.'
        + '</p></div>';
    var erfolge = 0;
    for (var i = 0; i < mails.length; i++) {
        try {
            var res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: EMAIL_FROM, to: [mails[i]], subject: '[Kiek mol in] ' + titel, html: html })
            });
            if (res.ok) erfolge++;
            else console.error('[alarm] Resend', res.status);
        } catch (e) {
            console.error('[alarm] E-Mail fehlgeschlagen:', e && e.message);
        }
    }
    console.error('[alarm] per E-Mail an', erfolge, 'von', mails.length);
    return erfolge > 0;
}

module.exports = { alarm: alarm };
