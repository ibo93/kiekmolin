// Kiek mol in — Gast sagt Reservierung selbst ab (Link aus der Erinnerungs-Mail).
//
// Aufruf: GET /.netlify/functions/res-cancel?id=<reservierungs-uuid>
//         GET /.netlify/functions/res-cancel?id=<uuid>&grund=<text>
// Setzt status='cancelled' und zeigt eine kleine Bestätigungs-Seite.
// Die UUID ist nicht erratbar und wirkt damit als Token; es kann nur
// storniert (nichts gelesen/geändert) werden -- risikoarm.
//
// DER GRUND -- UND WARUM ER NICHT VORHER ABGEFRAGT WIRD
// -----------------------------------------------------
// Der Wirt hat gefragt: "und warum haben die abgesagt... das ist auch
// wichtig". Stimmt -- fünf Absagen wegen Krankheit sind etwas anderes
// als fünf, weil das Essen beim letzten Mal kalt war.
//
// Der Grund wird aber ERST NACH der Absage erfragt, nie davor. Wer auf
// den Link in der Mail klickt, hat entschieden; ihm dann ein Formular
// vorzusetzen, kostet Absagen. Und eine Absage, die nicht ankommt, ist
// teurer als eine ohne Grund: dann steht der Tisch am Samstagabend
// leer und niemand weiss es.
//
// Also: erst stornieren, dann auf der Bestätigungsseite fragen. Wer
// weiterklickt, hat trotzdem abgesagt.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var webpush = require('web-push');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
var VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@kiekmolin.de';

function sbHeaders(extra) {
    return Object.assign({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {});
}

// Das Restaurant SOFORT informieren, wenn ein Gast selbst absagt.
// Vorher passierte hier nichts: Der Gast las "das Team kann den Tisch jetzt
// weitergeben", im Restaurant erfuhr davon aber niemand aktiv. Wer nicht
// zufällig ins Dashboard schaute, hielt den Tisch weiter frei -- am vollen
// Samstagabend bares Geld.
// Fehler hier dürfen die Absage NICHT scheitern lassen: der Gast hat seinen
// Teil getan, die Stornierung steht bereits in der Datenbank.
async function notifyRestaurant(r, restName, grundText) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE || !r.restaurant_id) return;
    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
    catch (e) { return; }

    var subs = [];
    try {
        var sr = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?restaurant_id=eq.' +
            encodeURIComponent(r.restaurant_id) + '&select=id,endpoint,p256dh_key,auth_key', { headers: sbHeaders() });
        if (sr.ok) subs = await sr.json();
    } catch (e) { return; }
    if (!Array.isArray(subs)) subs = [];

    // AUCH DER SUPERADMIN SOLL ES MITBEKOMMEN.
    // Er hat keinen eigenen Betrieb (restaurant_id ist NULL) und wuerde
    // von der Suche oben nie gefunden. Wer Superadmin ist, entscheidet
    // die Datenbank -- die App speichert beim Anmelden nur die E-Mail
    // mit, geprueft wird sie hier gegen customers. Ein Haekchen aus dem
    // Browser waere zu leicht zu faelschen.
    try {
        var ar = await fetch(SUPABASE_URL + '/rest/v1/customers?role=eq.superadmin&select=email',
            { headers: sbHeaders(), signal: AbortSignal.timeout(8000) });
        if (ar.ok) {
            var mails = (await ar.json() || []).map(function (a) { return a && a.email; }).filter(Boolean);
            if (mails.length) {
                var liste = mails.map(function (m) { return '"' + String(m).replace(/"/g, '') + '"'; }).join(',');
                var gr = await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?customer_email=in.('
                    + encodeURIComponent(liste) + ')&select=id,endpoint,p256dh_key,auth_key',
                    { headers: sbHeaders(), signal: AbortSignal.timeout(8000) });
                if (gr.ok) subs = subs.concat(await gr.json() || []);
            }
        }
    } catch (e) { /* ohne Admin-Geraete weiter -- der Wirt zaehlt zuerst */ }

    // Kein Geraet doppelt: ist der Superadmin zugleich Wirt dieses
    // Hauses, klingelte sein Handy sonst zweimal.
    var gesehen = {};
    subs = subs.filter(function (x) {
        if (!x || !x.endpoint || gesehen[x.endpoint]) return false;
        gesehen[x.endpoint] = true;
        return true;
    });
    if (!subs.length) return;

    var datum = '';
    try {
        var d = new Date(String(r.reservation_date) + 'T12:00:00');
        datum = isNaN(d.getTime()) ? String(r.reservation_date || '')
                                   : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    } catch (e) { datum = String(r.reservation_date || ''); }

    var zeit = String(r.reservation_time || '').slice(0, 5);
    var payload = JSON.stringify({
        title: 'Reservierung abgesagt',
        body: (r.guest_name || 'Ein Gast') + ' hat abgesagt – ' + datum + (zeit ? ' um ' + zeit + ' Uhr' : '') +
              '. Der Tisch ist wieder frei.' + (grundText ? ' Grund: ' + grundText : ''),
        icon: '/kiek-logo.png',
        badge: '/kiek-logo.png',
        tag: 'res-cancelled-' + r.id,
        requireInteraction: true,
        data: { type: 'reservation_cancelled', reservationId: r.id, url: '/?dashboard=reservations' }
    });

    for (var i = 0; i < subs.length; i++) {
        var s = subs[i];
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } }, payload);
        } catch (err) {
            // Tote Abos aufräumen, damit die Liste nicht zuwächst
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                try {
                    await fetch(SUPABASE_URL + '/rest/v1/push_subscriptions?id=eq.' + encodeURIComponent(s.id),
                        { method: 'DELETE', headers: sbHeaders({ 'Prefer': 'return=minimal' }) });
                } catch (e2) {}
            }
        }
    }
}

function page(title, text, ok, extra) {
    var color = ok ? '#16a34a' : '#b91c1c';
    var icon = ok ? 'M20 6L9 17l-5-5' : 'M18 6L6 18M6 6l12 12';
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        body: '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>' + title + ' – Kiek mol in</title></head>' +
            '<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f8f7;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;">' +
            '<div style="max-width:420px;width:100%;background:#ffffff;border-radius:24px;padding:36px 28px;text-align:center;box-shadow:0 20px 50px rgba(0,61,51,0.08);">' +
                '<div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:' + (ok ? 'rgba(22,163,74,0.1)' : 'rgba(185,28,28,0.08)') + ';display:flex;align-items:center;justify-content:center;">' +
                    '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + icon + '"/></svg>' +
                '</div>' +
                '<h1 style="font-size:20px;margin:0 0 8px;color:#00251e;">' + title + '</h1>' +
                '<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.5;">' + text + '</p>' +
                (extra || '') +
                '<a href="https://kiekmolin.de" style="display:inline-block;background:#003d33;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:600;font-size:14px;">Zu Kiek mol in</a>' +
            '</div></body></html>'
    };
}

// Die Auswahlmoeglichkeiten.
//
// "Beim letzten Mal nicht zufrieden" stand hier und ist auf Wunsch des
// Betreibers wieder raus. Sein Argument: einem Gast so einen Satz zum
// Antippen hinzulegen, macht aus einer Absage eine Beschwerde, die
// vorher keine war. Wer wirklich unzufrieden war, schreibt es -- dafuer
// ist "Sonstiges" da.
//
// FREITEXT -- URSPRUENGLICH BEWUSST NICHT, JETZT DOCH
// Ich hatte davon abgeraten: diese Seite ist ueber einen Link
// erreichbar, ein offenes Textfeld ist ein offenes Textfeld. Der
// Betreiber will es trotzdem, und er hat gute Gruende -- sechs feste
// Knoepfe treffen den wirklichen Grund oft nicht.
//
// Also entschaerft statt weggelassen: hoechstens 200 Zeichen, spitze
// Klammern und kaufmaennisches Und fliegen raus, Zeilenumbrueche
// werden zu Leerzeichen. Und man braucht weiterhin eine gueltige
// Reservierungs-ID, um ueberhaupt hier anzukommen -- die ist nicht
// erratbar.
var GRUENDE = {
    krank:     'Krank geworden',
    plan:      'Pläne haben sich geändert',
    zeit:      'Schaffe es zeitlich nicht',
    zuviele:   'Andere Personenzahl nötig',
    woanders:  'Doch woanders hingegangen',
    sonstiges: 'Sonstiges'
};

// Freitext entschaerfen. Leer heisst: nichts geschrieben.
function freitextSaeubern(roh) {
    return String(roh == null ? '' : roh)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[<>&]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

// Die Frage nach dem Grund -- als Knoepfe, die denselben Endpunkt noch
// einmal aufrufen. Kein Formular, kein JavaScript: das hier laeuft in
// jedem Mailprogramm-Browser, auch in den seltsamen.
//
// Ueberspringen ist erlaubt und steht auch da. Wer sich gedraengt
// fuehlt, klickt beim naechsten Mal gar nicht erst auf den Absagelink
// -- und dann steht der Tisch leer.
function grundFrage(id) {
    var h = '<div style="margin:0 0 20px;padding-top:20px;border-top:1px solid #eef1f0;">'
          + '<p style="margin:0 0 14px;color:#00251e;font-size:14px;font-weight:600;">'
          + 'Magst du kurz sagen, woran es lag?</p>'
          + '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">';
    Object.keys(GRUENDE).forEach(function (k) {
        // "Sonstiges" ist kein Knopf, sondern das Feld darunter.
        if (k === 'sonstiges') return;
        h += '<a href="/.netlify/functions/res-cancel?id=' + encodeURIComponent(id)
           + '&grund=' + encodeURIComponent(k) + '" '
           + 'style="display:inline-block;padding:9px 16px;border-radius:9999px;border:1px solid rgba(0,61,51,0.15);'
           + 'background:#f6f8f7;color:#00251e;text-decoration:none;font-size:13px;font-weight:600;">'
           + GRUENDE[k] + '</a>';
    });
    h += '</div>';

    // Ein echtes Formular, kein JavaScript. Diese Seite wird oft aus
    // einem Mailprogramm heraus geoeffnet, und deren eingebaute Browser
    // sind unberechenbar -- ein <form method="get"> laeuft ueberall.
    h += '<form method="get" action="/.netlify/functions/res-cancel" '
       + 'style="display:flex;gap:8px;margin-top:14px;">'
       + '<input type="hidden" name="id" value="' + String(id).replace(/[^0-9a-fA-F-]/g, '') + '">'
       + '<input type="hidden" name="grund" value="sonstiges">'
       + '<label for="freiGrund" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Anderer Grund</label>'
       + '<input id="freiGrund" type="text" name="frei" maxlength="200" placeholder="Anderer Grund…" '
       + 'style="flex:1;min-width:0;padding:11px 16px;border-radius:9999px;border:1px solid rgba(0,61,51,0.15);'
       + 'background:#ffffff;color:#00251e;font-size:14px;font-family:inherit;">'
       + '<button type="submit" style="padding:11px 20px;border-radius:9999px;border:none;background:#003d33;'
       + 'color:#ffffff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Senden</button>'
       + '</form>';

    h += '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;">Musst du nicht – die Absage ist schon durch.</p>'
       + '</div>';
    return h;
}

exports.handler = async function (event) {
    var id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    // NUR bekannte Schluessel. Was hier hereinkommt, landet im Dashboard
    // des Wirts -- freier Text von aussen hat da nichts verloren.
    var grundSchluessel = (event.queryStringParameters && event.queryStringParameters.grund) || '';
    var grundText = Object.prototype.hasOwnProperty.call(GRUENDE, grundSchluessel)
        ? GRUENDE[grundSchluessel] : '';
    // Bei "Sonstiges" zaehlt, was der Gast geschrieben hat -- das blosse
    // Wort "Sonstiges" im Dashboard hilft niemandem. Hat er nichts
    // geschrieben, gilt die Absage als ohne Grund.
    var frei = freitextSaeubern((event.queryStringParameters && event.queryStringParameters.frei) || '');
    if (grundSchluessel === 'sonstiges') grundText = frei;
    if (!/^[0-9a-f-]{20,}$/i.test(id)) return page('Link ungültig', 'Dieser Absage-Link ist unvollständig. Bitte nutze den Link aus deiner E-Mail.', false);
    if (!SUPABASE_KEY) return page('Gerade nicht möglich', 'Die Absage kann gerade nicht verarbeitet werden. Bitte ruf kurz im Restaurant an.', false);

    try {
        // Reservierung lesen
        var res = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(id) +
            '&select=id,status,guest_name,reservation_date,reservation_time,restaurant_id', { headers: sbHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var rows = await res.json();
        if (!rows.length) return page('Nicht gefunden', 'Diese Reservierung existiert nicht (mehr).', false);
        var r = rows[0];
        var timeStr = String(r.reservation_time || '').slice(0, 5);

        if (r.status === 'cancelled') {
            // Nachgereichter Grund: genau der Fall, wenn jemand auf der
            // Bestaetigungsseite einen der Knoepfe drueckt. Die Absage
            // stand da schon.
            if (grundText) {
                try {
                    await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(id), {
                        method: 'PATCH',
                        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
                        body: JSON.stringify({ cancel_reason: grundText })
                    });
                } catch (e) {}
                return page('Danke!', 'Wir haben es notiert. Das hilft dem Restaurant weiter – bis zum nächsten Mal!', true);
            }
            return page('Schon abgesagt', 'Diese Reservierung wurde bereits storniert. Alles gut – bis zum nächsten Mal!', true);
        }

        // Stornieren
        var upd = await fetch(SUPABASE_URL + '/rest/v1/reservations?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: sbHeaders({ 'Prefer': 'return=minimal' }),
            body: grundText
                ? JSON.stringify({ status: 'cancelled', cancel_reason: grundText })
                : JSON.stringify({ status: 'cancelled' })
        });
        if (!upd.ok) throw new Error('HTTP ' + upd.status);

        // Restaurant-Name für die Bestätigung (optional)
        var restName = 'das Restaurant';
        try {
            var rr = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + encodeURIComponent(r.restaurant_id) + '&select=name', { headers: sbHeaders() });
            if (rr.ok) { var rl = await rr.json(); if (rl[0] && rl[0].name) restName = rl[0].name; }
        } catch (e) {}

        // Restaurant benachrichtigen -- Fehler hier dürfen die Absage nicht kippen
        try { await notifyRestaurant(r, restName, grundText); }
        catch (e) { console.error('[res-cancel] Benachrichtigung fehlgeschlagen:', e.message); }

        return page('Reservierung abgesagt',
            'Danke für die Info' + (r.guest_name ? ', ' + String(r.guest_name).replace(/[<>&]/g, '') : '') + '! ' +
            'Dein Tisch' + (timeStr ? ' um ' + timeStr + ' Uhr' : '') + ' bei ' + String(restName).replace(/[<>&]/g, '') +
            ' wurde storniert – das Team kann ihn jetzt weitergeben. Bis zum nächsten Mal!', true,
            grundText ? '' : grundFrage(id));
    } catch (e) {
        console.error('[res-cancel]', e.message);
        return page('Gerade nicht möglich', 'Die Absage konnte nicht verarbeitet werden. Bitte ruf kurz im Restaurant an.', false);
    }
};
