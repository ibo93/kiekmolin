// KURANI Agentur - Anfragen von der Wirte-Seite (/check) entgegennehmen.
//
// WARUM: Bisher kamen Neukunden nur ueber Kaltbesuche rein. Diese Function
// ist der Briefkasten fuer den Weg andersherum: Ein Wirt findet die Seite,
// traegt seinen Betrieb ein - und die Anfrage landet SOFORT als E-Mail.
//
// GEAENDERT 25.08.2026: Frueher ging die Anfrage NUR per Mail raus und wurde
// nirgends gespeichert - weniger Datenschutz-Last. In der Praxis ging so aber
// jede zweite Anfrage im Postfach unter. Jetzt zusaetzlich in die Tabelle
// "anfragen", aus der das CRM sie von selbst abholt.
//
// Die Mail bleibt der Hauptweg und laeuft ZUERST: Klemmt die Datenbank, kommt
// die Anfrage trotzdem an. Ohne SUPABASE_URL/SUPABASE_ANON_KEY verhaelt sich
// die Function exakt wie vorher.
//
// Aufbewahrung: Anfragen ohne Auftrag werden nach zwoelf Monaten geloescht -
// so steht es im Datenschutzhinweis.
//
// GRUNDREGEL wie bei den anderen Functions: Sie darf nie etwas kaputtmachen
// und nie eine Anfrage verschlucken, ohne es zu sagen. Kann sie nicht mailen,
// meldet sie das ehrlich - die Seite zeigt dann den WhatsApp-Weg an.
//
// ENV: RESEND_API_KEY (Pflicht fuer den Versand), EMAIL_FROM, AGENTUR_EMAIL

'use strict';

var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || '';
/* Ausweichadresse, und zwar bewusst fest verdrahtet.
   Ibo hat zweimal gefragt "wo bekomme ich den Antrag". Die ehrliche
   Antwort war bis eben: "an die Adresse in der Netlify-Variablen
   AGENTUR_EMAIL -- und ob die dort gesetzt ist, kann ich nicht sehen".
   Eine Anfrage, die von einer Variablen abhaengt, an die sich niemand
   erinnert, ist eine verlorene Anfrage. info@kiekmolin.de steht im
   Impressum und in der Datenschutzerklaerung -- die gibt es. */
var AGENTUR_EMAIL = process.env.AGENTUR_EMAIL || 'info@kiekmolin.de';

// Optional: ohne diese beiden laeuft alles wie vorher, nur ohne CRM-Eintrag.
var SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

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

// Die erlaubten Herkuenfte. /check ist der Sichtbarkeits-Check, /gastro die
// Seite fuer Gastronomen. Steht etwas anderes drin, gilt 'check' -- so wie
// es war, bevor es diese Unterscheidung gab.
var HERKUNFT = {
    check:  { pfad: 'kiekmolin.de/check' },
    gastro: { pfad: 'kiekmolin.de/gastro' }
};

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
    //
    // Zwei Namen, weil zwei Seiten senden: /check heisst das Feld seit jeher
    // "webseite_bestaetigung", /gastro nennt es "firmen_webseite" -- der alte
    // Name enthaelt ae/ue und faellt damit dem Umlaut-Test zur Last, der
    // sichtbaren Text prueft. Beide gelten, damit die aeltere Seite laeuft.
    if (sauber(daten.webseite_bestaetigung, 40) || sauber(daten.firmen_webseite, 40)) {
        return json(200, { ok: true });
    }

    var betrieb = sauber(daten.betrieb, 90);
    var ort = sauber(daten.ort, 60);
    var name = sauber(daten.name, 70);
    var kontakt = sauber(daten.kontakt, 90);
    var anliegen = sauber(daten.anliegen, 400);
    var website = sauber(daten.website, 200);

    // Woher kam die Anfrage? Bewusst eine feste Liste und kein freier Text:
    // der Wert landet in einer Mail und in der Datenbank, und was von aussen
    // kommt, darf dort nichts hinschreiben duerfen, was wir nicht kennen.
    var quelle = HERKUNFT[sauber(daten.quelle, 20)] ? sauber(daten.quelle, 20) : 'check';
    // Der Selbsttest von der Seite: {punkte:2, antworten:{...}}. Rein zur
    // Information - fehlt er, aendert das nichts.
    var selbsttest = null;
    if (daten.selbsttest && typeof daten.selbsttest.punkte === 'number') {
        selbsttest = { punkte: daten.selbsttest.punkte, antworten: daten.selbsttest.antworten || {} };
    }

    if (!betrieb || !kontakt) {
        return json(400, { ok: false, fehler: 'Bitte Betrieb und eine Rueckrufnummer oder E-Mail angeben.' });
    }

    var zeilen = [
        'Neue Anfrage ueber ' + HERKUNFT[quelle].pfad,
        '',
        'Betrieb:  ' + betrieb,
        'Ort:      ' + (ort || '-'),
        'Name:     ' + (name || '-'),
        'Kontakt:  ' + kontakt,
        'Anliegen: ' + (anliegen || '-'),
        'Webseite: ' + (website || '-'),
        selbsttest ? 'Selbsttest: ' + selbsttest.punkte + ' von 5' : 'Selbsttest: nicht ausgefuellt',
        '',
        'Eingegangen: ' + new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
        '',
        'Naechster Schritt: heute noch zurueckrufen. Wer sich selbst meldet,',
        'hat ein Problem, das gerade weh tut - da zaehlen Stunden.'
    ].join('\n');

    /* EINE Anfrage darf NIE verloren gehen -- egal woran der Mailweg
       scheitert.

       Am 20.09.2026 um 12:04 hat Ibo das Formular auf /gastro ausgefuellt.
       Die Seite sagte "Das hat gerade nicht geklappt". Gemessen in den
       edge_logs: NULL Schreibzugriffe auf die Tabelle anfragen. Die
       Eingabe war weg.

       Der Grund: unten gab es DREI Ausgaenge, an denen der Mailweg endet
       -- Schluessel fehlt, Resend antwortet mit Fehler, Resend wirft --
       und nur der erste schrieb vorher ins CRM. Ich hatte zwei uebersehen.

       Deshalb gibt es jetzt genau eine Stelle, die das erledigt. Wer hier
       einen weiteren Ausgang einbaut, muss sie benutzen. */
    var ohneMail = async function (grund, protokoll) {
        if (protokoll) console.warn('agentur-lead: ' + protokoll);
        var gerettet = await inDieDatenbank({
            betrieb: betrieb, ort: ort, person: name, kontakt: kontakt,
            nachricht: anliegen, website: website, selbsttest: selbsttest,
            herkunft: HERKUNFT[quelle].pfad
        });
        return json(200, { ok: false, mailAus: true, imCrm: gerettet, fehler: grund });
    };

    if (!RESEND_API_KEY || !EMAIL_FROM || !AGENTUR_EMAIL) {
        return await ohneMail(
            'Der E-Mail-Versand ist gerade nicht eingerichtet.',
            'RESEND_API_KEY/EMAIL_FROM/AGENTUR_EMAIL fehlen - Anfrage von "' + betrieb + '"');
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
            return await ohneMail('Der Versand hat gerade nicht geklappt.',
                'Resend ' + antwort.status + ' - ' + text.slice(0, 200));
        }
    } catch (e) {
        return await ohneMail('Der Versand hat gerade nicht geklappt.',
            'Resend warf: ' + (e && e.message));
    }

    // Erst jetzt, nachdem die Mail sicher raus ist: ins CRM legen.
    // Scheitert das, ist die Anfrage trotzdem angekommen - deshalb
    // aendert ein Fehler hier die Antwort an den Wirt nicht.
    var imCrm = await inDieDatenbank({
        betrieb: betrieb, ort: ort, person: name, kontakt: kontakt,
        nachricht: anliegen, website: website, selbsttest: selbsttest,
        herkunft: HERKUNFT[quelle].pfad
    });

    return json(200, { ok: true, imCrm: imCrm });
};

// Legt die Anfrage in die Tabelle "anfragen". Gibt true/false zurueck und
// wirft nie - der Mailweg ist schon gelaufen, hier darf nichts mehr kippen.
async function inDieDatenbank(a) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    var istMail = a.kontakt.indexOf('@') > 0;
    try {
        var antwort = await fetch(SUPABASE_URL + '/rest/v1/anfragen', {
            method: 'POST',
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            },
            body: JSON.stringify({
                betrieb: a.betrieb,
                ort: a.ort || '-',
                person: a.person || null,
                telefon: istMail ? null : a.kontakt,
                mail: istMail ? a.kontakt : null,
                website: a.website || null,
                nachricht: a.nachricht || null,
                selbsttest: a.selbsttest,
                herkunft: a.herkunft || 'kiekmolin.de/check'
            })
        });
        if (!antwort.ok) {
            var text = await antwort.text();
            console.error('agentur-lead: Supabase ' + antwort.status + ' - ' + text.slice(0, 200));
            return false;
        }
        return true;
    } catch (e) {
        console.error('agentur-lead/Supabase: ' + (e && e.message));
        return false;
    }
}
