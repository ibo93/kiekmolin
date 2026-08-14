// KURANI Agentur - Anfragen von der Wirte-Seite (/check) entgegennehmen.
//
// WARUM: Bisher kamen Neukunden nur ueber Kaltbesuche rein. Diese Function
// ist der Briefkasten fuer den Weg andersherum: Ein Wirt findet die Seite,
// traegt seinen Betrieb ein - und die Anfrage landet SOFORT als E-Mail.
//
// Bewusst OHNE Datenbank: Anfragen sind fluechtig und persoenlich. Sie gehen
// per Mail raus und werden hier NICHT gespeichert. Weniger Datenschutz-Last,
// nichts zu pflegen, nichts, was verloren gehen kann.
//
// GRUNDREGEL wie bei den anderen Functions: Sie darf nie etwas kaputtmachen
// und nie eine Anfrage verschlucken, ohne es zu sagen. Kann sie nicht mailen,
// meldet sie das ehrlich - die Seite zeigt dann den WhatsApp-Weg an.
//
// ENV: RESEND_API_KEY (Pflicht fuer den Versand), EMAIL_FROM, AGENTUR_EMAIL

'use strict';

var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || '';
var AGENTUR_EMAIL = process.env.AGENTUR_EMAIL || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

function json(status, body) {
    return {
        statusCode: status,
        headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
        body: JSON.stringify(body)
    };
}

// Eingaben kurz halten und Zeilenumbrueche rauswerfen - eine Anfrage ist
// kein Aufsatz, und niemand soll ueber dieses Feld E-Mail-Kopfzeilen bauen.
function sauber(wert, maxLaenge) {
    return String(wert == null ? '' : wert)
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, maxLaenge || 120);
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, fehler: 'Nur POST' });

    var daten;
    try {
        daten = JSON.parse(event.body || '{}');
    } catch (e) {
        return json(400, { ok: false, fehler: 'Konnte die Anfrage nicht lesen' });
    }

    // Honigtopf: ein fuer Menschen unsichtbares Feld. Ist es ausgefuellt,
    // war es ein Bot - wir antworten freundlich und tun nichts.
    if (sauber(daten.webseite_bestaetigung, 40)) return json(200, { ok: true });

    var betrieb = sauber(daten.betrieb, 90);
    var ort = sauber(daten.ort, 60);
    var name = sauber(daten.name, 70);
    var kontakt = sauber(daten.kontakt, 90);
    var anliegen = sauber(daten.anliegen, 400);

    if (!betrieb || !kontakt) {
        return json(400, { ok: false, fehler: 'Bitte Betrieb und eine Rueckrufnummer oder E-Mail angeben.' });
    }

    var zeilen = [
        'Neue Anfrage ueber kiekmolin.de/check',
        '',
        'Betrieb:  ' + betrieb,
        'Ort:      ' + (ort || '-'),
        'Name:     ' + (name || '-'),
        'Kontakt:  ' + kontakt,
        'Anliegen: ' + (anliegen || '-'),
        '',
        'Eingegangen: ' + new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
        '',
        'Naechster Schritt: heute noch zurueckrufen. Wer sich selbst meldet,',
        'hat ein Problem, das gerade weh tut - da zaehlen Stunden.'
    ].join('\n');

    // Ohne Versand-Schluessel nichts vortaeuschen: Die Seite bekommt gesagt,
    // dass sie den WhatsApp-Weg anbieten soll.
    if (!RESEND_API_KEY || !EMAIL_FROM || !AGENTUR_EMAIL) {
        console.warn('agentur-lead: RESEND_API_KEY/EMAIL_FROM/AGENTUR_EMAIL fehlen - Anfrage von "' +
            betrieb + '" konnte nicht gemailt werden.');
        return json(200, { ok: false, mailAus: true, fehler: 'Der E-Mail-Versand ist nicht eingerichtet.' });
    }

    try {
        var antwort = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: EMAIL_FROM,
                to: [AGENTUR_EMAIL],
                subject: 'Anfrage: ' + betrieb + (ort ? ' (' + ort + ')' : ''),
                text: zeilen,
                reply_to: kontakt.indexOf('@') > 0 ? kontakt : undefined
            })
        });
        if (!antwort.ok) {
            var text = await antwort.text();
            console.error('agentur-lead: Resend ' + antwort.status + ' - ' + text.slice(0, 200));
            return json(200, { ok: false, mailAus: true, fehler: 'Der Versand hat gerade nicht geklappt.' });
        }
    } catch (e) {
        console.error('agentur-lead: ' + (e && e.message));
        return json(200, { ok: false, mailAus: true, fehler: 'Der Versand hat gerade nicht geklappt.' });
    }

    return json(200, { ok: true });
};
