// WAS AUS EINER VERSCHICKTEN E-MAIL WIRD -- UND WARUM DAS BISHER
// NIEMAND ERFAHREN HAT.
//
// Gefragt am 31.08.2026 zu zwei Zeilen im Resend-Fenster:
// "bei den e-mail kommt nicht bei den kunden an? warum?" und
// "ich meine die gesendeten muessen geliefert sein".
//
// Er hat recht. "Gesendet" heisst nur: Resend hat die Mail an den
// Mailserver des Gastes uebergeben. "Geliefert" heisst: der Server hat
// sie ANGENOMMEN. Dazwischen liegen drei moegliche Enden:
//
//     geliefert     alles gut
//     verzoegert    der Empfaenger drosselt (web.de und GMX tun das),
//                   kommt meist Minuten spaeter doch an
//     abgeprallt    kommt NIE an
//
// UND HIER WAR DER STILLE AUSFALL
// Es gab keinen Weg, das zu erfahren. Prallt eine Mail ab, steht das in
// Resend, und da schaut niemand nach. Schlimmer: Resend SPERRT die
// Adresse danach (Unterdrueckungen). Ab dann gehen Mails an diesen Gast
// gar nicht mehr raus -- kein Fehler, keine Meldung, keine Zeile im
// Protokoll. Der Gast wartet auf eine Bestaetigung, die es nie geben
// wird, und der Wirt haelt die Reservierung fuer bestaetigt.
//
// Genau die Sorte Fehler aus Regel 6: es sieht aus wie normal, nur
// leer.
//
// Ab jetzt meldet Resend jedes Ende hierher, und ein Abpraller
// klingelt.
//
// EINRICHTEN (zwei Handgriffe, beide bei Resend/Netlify):
//   1. Resend -> Webhooks -> Endpunkt hinzufuegen:
//        https://kiekmolin.de/.netlify/functions/resend-ereignis
//      Ereignisse: email.delivered, email.bounced, email.complained,
//                  email.delivery_delayed
//   2. Das dort angezeigte Geheimnis (beginnt mit whsec_) bei Netlify
//      als RESEND_WEBHOOK_SECRET hinterlegen.
//
// OHNE SCHRITT 2 TUT DIESE FUNKTION NICHTS -- absichtlich. Ein
// Alarm-Eingang, den jeder Fremde aufrufen kann, ist ein Werkzeug fuer
// den naechsten Spassvogel: er koennte dem Betreiber beliebig viele
// Abpraller vortaeuschen. Lieber stumm als manipulierbar. Dass es
// stumm ist, steht dann aber laut im Protokoll.

'use strict';

var crypto = require('crypto');
var alarmModul = require('./lib/alarm');

var GEHEIMNIS = process.env.RESEND_WEBHOOK_SECRET || '';

function antwort(rumpf) {
    // IMMER 200. Dieselbe Lehre wie bei der Wache: wer einem Absender
    // einen Fehler zurueckgibt, bekommt denselben Aufruf gleich noch
    // einmal -- und jeder Versuch wuerde eine weitere Meldung ausloesen.
    return { statusCode: 200, body: JSON.stringify(rumpf) };
}

// Resend unterschreibt mit Svix. Unterschrieben wird
//     <svix-id>.<svix-timestamp>.<Rumpf>
// mit HMAC-SHA256 und dem Geheimnis OHNE das Praefix 'whsec_',
// base64-entschluesselt. In svix-signature koennen mehrere Unterschriften
// stehen (bei einem Schluesselwechsel) -- eine passende genuegt.
function unterschriftStimmt(kopf, rumpf) {
    var id    = kopf['svix-id'] || kopf['Svix-Id'];
    var zeit  = kopf['svix-timestamp'] || kopf['Svix-Timestamp'];
    var liste = kopf['svix-signature'] || kopf['Svix-Signature'];
    if (!id || !zeit || !liste) return false;

    // Alte Aufrufe abweisen: sonst liesse sich ein einmal mitgelesener
    // Aufruf beliebig oft wiederholen.
    var alter = Math.abs(Math.floor(Date.now() / 1000) - Number(zeit));
    if (!isFinite(alter) || alter > 300) return false;

    var schluessel = Buffer.from(String(GEHEIMNIS).replace(/^whsec_/, ''), 'base64');
    var erwartet = crypto.createHmac('sha256', schluessel)
        .update(id + '.' + zeit + '.' + rumpf).digest('base64');

    return String(liste).split(' ').some(function (teil) {
        var wert = teil.indexOf(',') > -1 ? teil.split(',')[1] : teil;
        var a = Buffer.from(wert || '', 'utf8');
        var b = Buffer.from(erwartet, 'utf8');
        // Gleiche Laenge pruefen, sonst wirft timingSafeEqual.
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}

// Kleingeschriebene Kopfzeilen -- Netlify liefert sie mal so, mal so.
function kopfKlein(kopf) {
    var raus = {};
    Object.keys(kopf || {}).forEach(function (k) { raus[String(k).toLowerCase()] = kopf[k]; });
    return raus;
}

exports.handler = async function (ereignis) {
    if (ereignis.httpMethod !== 'POST') return antwort({ ok: false, grund: 'nur POST' });

    if (!GEHEIMNIS) {
        console.error('[resend-ereignis] RESEND_WEBHOOK_SECRET fehlt -- Aufruf verworfen. '
            + 'Ohne Geheimnis koennte jeder Fremde Abpraller vortaeuschen. '
            + 'Geheimnis aus Resend -> Webhooks bei Netlify hinterlegen.');
        return antwort({ ok: false, grund: 'nicht eingerichtet' });
    }

    var rumpf = ereignis.body || '';
    if (!unterschriftStimmt(kopfKlein(ereignis.headers), rumpf)) {
        console.error('[resend-ereignis] Unterschrift stimmt nicht -- verworfen');
        return antwort({ ok: false, grund: 'Unterschrift' });
    }

    var daten;
    try { daten = JSON.parse(rumpf); } catch (e) { return antwort({ ok: false, grund: 'kein JSON' }); }

    var art  = daten && daten.type;
    var d    = (daten && daten.data) || {};
    var an   = [].concat(d.to || []).join(', ');
    var thema = d.subject || '';

    // Ins Protokoll geht JEDES Ereignis -- auch die guten. Erst damit
    // laesst sich spaeter nachsehen, was aus einer bestimmten Mail
    // geworden ist, ohne sich bei Resend anzumelden.
    console.log('[resend]', art, '->', an, '|', thema);

    if (art === 'email.bounced') {
        // DER FALL, DER WIRKLICH WEHTUT.
        // Der Gast bekommt nichts, und Resend sperrt die Adresse
        // danach -- jede weitere Mail an ihn geht still ins Leere.
        var grund = (d.bounce && (d.bounce.message || d.bounce.subType || d.bounce.type)) || 'ohne Angabe';
        await alarmModul.alarm(
            'Eine E-Mail kam nicht an',
            'An ' + an + ' ("' + thema + '") ist abgeprallt: ' + grund
                + '. Der Gast hat nichts bekommen. Resend sperrt die Adresse jetzt -- '
                + 'weitere Mails dorthin gehen ins Leere, bis die Sperre unter '
                + '"Unterdrueckungen" aufgehoben wird.',
            'mail-abgeprallt');
    } else if (art === 'email.complained') {
        // Als Spam markiert. Nicht dringend, aber es sagt etwas ueber
        // die Zustellbarkeit aller anderen Mails.
        await alarmModul.alarm(
            'E-Mail als Spam gemeldet',
            an + ' hat "' + thema + '" als Spam markiert. Haeuft sich das, '
                + 'landen auch die Bestellbestaetigungen anderer Gaeste im Spam.',
            'mail-spam');
    }
    // email.delivered und email.delivery_delayed: nur ins Protokoll.
    // Verzoegert ist kein Fehler -- web.de und GMX drosseln, das loest
    // sich meist von selbst. Wer dafuer alarmiert, ist wieder bei den
    // 96 Mails pro Nacht.

    return antwort({ ok: true, art: art });
};
