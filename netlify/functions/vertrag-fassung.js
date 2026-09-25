// AUS DEM ENTWURF EINE FASSUNG MACHEN -- mit Ibos echten Daten drin.
//
// Ibo am 25.09.2026: "ja mach und vertrag als Pdf und unterschreiben".
//
// WAS HIER PASSIERT
// =================
// 32-vertrag.sql legt zwei Entwuerfe an. Darin stehen fuenf Stellen als
// [[PLATZHALTER]], die nur der Betreiber kennt. Solange einer davon im
// Text steht, laesst die App nicht unterschreiben -- das ist Absicht und
// bleibt so.
//
// Diese Function ersetzt die Stellen, die sich aus BEKANNTEN Daten
// ergeben, und schreibt das Ergebnis als NEUE Fassung.
//
// WARUM EINE NEUE FASSUNG UND KEIN UPDATE
// =======================================
// Weil eine Unterschrift auf den Text zeigt, der damals wirklich auf dem
// Bildschirm stand -- dafuer gibt es den SHA-256-Abdruck in vertraege.
// Wuerde diese Function den Text einer bestehenden Fassung aendern,
// passten alle frueheren Abdruecke nicht mehr, und genau die Trennung
// von Text und Unterschrift, wegen der 32-vertrag.sql zwei Tabellen hat,
// waere hinfaellig.
//
// WAS SIE NICHT ERSETZT
// =====================
// Die Firmierungen und Sitze der Unterauftragsverarbeiter. Die stehen in
// den AVV der Anbieter und aendern sich; sie aus dem Gedaechtnis in einen
// Vertrag zu schreiben waere geraten, und Geratenes in einem Vertrag ist
// schlimmer als eine offene Stelle. Sie bleiben als [[...]] stehen --
// mit der Adresse, wo es steht. Damit blockiert die App weiter, bis
// jemand sie wirklich eingetragen hat.
//
// UND SIE SCHALTET NICHTS FREI
// ============================
// Die neue Fassung ist wieder 'entwurf'. Freischalten ist ein eigener,
// bewusster Schritt -- nach der Anwaltspruefung.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var VERWALTER = require('./lib/verwalter');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var KEY = process.env.SUPABASE_SERVICE_KEY || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf() { return { apikey: KEY, Authorization: 'Bearer ' + KEY }; }

// ---------------------------------------------------------------------
// DIE UNTERAUFTRAGSVERARBEITER -- am 25.09.2026 im Quelltext GEMESSEN,
// nicht aus dem Kopf aufgeschrieben. Hinter jedem Eintrag steht, woran
// man ihn im Projekt sieht.
//
// NICHT IN DIESER LISTE, und das ist eine Entscheidung:
//
//   Stripe   rechnet IBOS Rechnung an den Wirt ab. Der Wirt ist dort
//            betroffene Person, nicht Verantwortlicher -- das gehoert in
//            die Datenschutzerklaerung, nicht in den AVV ueber die
//            Gastdaten. (netlify/functions/stripe-*.js)
//   PayPal   nimmt das Geld des GASTES und zahlt DIREKT an den Wirt aus;
//            es laeuft nie ueber uns (datenbank/30-paypal-konto.sql).
//            Der Wirt ist dort selbst Verantwortlicher.
//   Kassen   tillhub, ready2order, orderbird, lightspeed, gastrofix --
//            das sind die Systeme DES WIRTS. Wir schicken auf seine
//            Weisung dorthin.
//
// Ob diese Einordnung traegt, entscheidet der Anwalt. Die LISTE muss
// vollstaendig sein -- eine unvollstaendige ist das eigentliche Risiko.
// ---------------------------------------------------------------------
var VERARBEITER = [
    { name: 'Supabase',
      zweck: 'Datenbank, Anmeldung und Dateispeicher. Verarbeitet alle Bestell-, '
           + 'Reservierungs- und Kontaktdaten der Gäste.',
      beleg: 'mvrgmbdokdzmumdyezha.supabase.co, in 33 Stellen der Functions',
      wo: 'Server in der EU (Frankfurt)',
      quelle: 'supabase.com/legal/dpa' },
    { name: 'Netlify',
      zweck: 'Betrieb der Website und der Server-Funktionen. Jede Anfrage eines '
           + 'Gastes läuft hier durch, einschließlich IP-Adresse.',
      beleg: 'netlify.toml, netlify/functions/',
      wo: 'weltweites Auslieferungsnetz',
      quelle: 'netlify.com/trust-center/' },
    { name: 'Resend',
      zweck: 'Versand der E-Mails an Gäste und Betriebe: Bestellbestätigung, '
           + 'Reservierung, Bewertungsanfrage, Mahnung.',
      beleg: 'api.resend.com in order-email.js, review-mail.js, mahnung.js',
      wo: 'Auftragsverarbeitung nach Angabe des Anbieters',
      quelle: 'resend.com/legal/dpa' },
    { name: 'Anthropic',
      zweck: 'Sprachmodell für den Chat-Assistenten und das Einlesen von '
           + 'Speisekarten. Bekommt, was der Gast in den Chat schreibt.',
      beleg: 'api.anthropic.com in chat-ai.js, menu-scan.js',
      wo: 'Vereinigte Staaten',
      quelle: 'anthropic.com/legal/commercial-terms' },
    { name: 'Google (Gemini, Cloud Vision)',
      zweck: 'Texterkennung und Sprachmodell beim Einlesen von Speisekarten.',
      beleg: 'generativelanguage.googleapis.com, vision.googleapis.com in menu-scan.js',
      wo: 'Vereinigte Staaten',
      quelle: 'cloud.google.com/terms/data-processing-addendum' },
    { name: 'Groq',
      zweck: 'Sprachmodell als Ausweichweg beim Einlesen von Speisekarten.',
      beleg: 'api.groq.com in menu-scan.js',
      wo: 'Vereinigte Staaten',
      quelle: 'groq.com/terms-of-sale/' },
    { name: 'OpenStreetMap (Nominatim) und Photon (komoot)',
      zweck: 'Umrechnung von Anschriften in Koordinaten für die Kartenansicht. '
           + 'Bekommt ausschließlich BETRIEBSanschriften, keine Gastadressen '
           + '— am 25.09.2026 an allen drei Aufrufstellen geprüft.',
      beleg: 'netlify/functions/geocode.js, gerufen von geocodeAddress() in index.html',
      wo: 'Europäische Union',
      quelle: 'openstreetmap.org/copyright' },
    { name: 'Push-Dienste der Browser-Hersteller',
      zweck: 'Zustellung der Push-Nachrichten an Geräte, die sie abonniert haben. '
           + 'Der Dienst des jeweiligen Herstellers erhält die Nachricht.',
      beleg: 'web-push / VAPID in push-send.js',
      wo: 'je nach Gerät und Hersteller',
      quelle: 'Angaben des jeweiligen Browser-Herstellers' }
];

function verarbeiterText() {
    var z = [];
    VERARBEITER.forEach(function (v, i) {
        z.push((i + 1) + '. ' + v.name);
        z.push('   Firmierung und Sitz: [[SITZ ' + v.name.split(' ')[0].toUpperCase()
             + ': aus dem Auftragsverarbeitungsvertrag des Anbieters übernehmen, '
             + 'siehe ' + v.quelle + ']]');
        z.push('   Zweck: ' + v.zweck);
        z.push('   Verarbeitungsort: ' + v.wo);
        z.push('');
    });
    return z.join('\n').trimEnd();
}

// ---------------------------------------------------------------------
var ABSENDER_PFLICHT = [
    ['firmierung', 'Firmierung'], ['inhaber', 'Inhaber'],
    ['strasse', 'Straße'], ['plz', 'PLZ'], ['ort', 'Ort'], ['email', 'E-Mail']
];
function fehlendeFelder(a) {
    if (!a) return ABSENDER_PFLICHT.map(function (f) { return f[1]; });
    return ABSENDER_PFLICHT.filter(function (f) { return !String(a[f[0]] || '').trim(); })
                           .map(function (f) { return f[1]; });
}

function anbieterBlock(a) {
    var z = [a.firmierung];
    if (a.inhaber && a.inhaber !== a.firmierung) z.push('Inhaber: ' + a.inhaber);
    z.push(a.strasse);
    z.push(a.plz + ' ' + a.ort);
    if (a.email) z.push('E-Mail: ' + a.email);
    if (a.telefon) z.push('Telefon: ' + a.telefon);
    if (a.steuernummer) z.push('Steuernummer: ' + a.steuernummer);
    return z.join('\n');
}

// Ersetzt eine Stelle ueber ihren Anfang -- die Platzhalter gehen im
// Entwurf ueber mehrere Zeilen, ein Vergleich auf den ganzen Wortlaut
// waere zu starr.
function ersetze(text, schluessel, wert) {
    return String(text).replace(
        new RegExp('\\[\\[' + schluessel + '[^\\]]*\\]\\]', 'g'), wert);
}

function fuellen(text, a) {
    var t = String(text || '');
    t = ersetze(t, 'ANBIETER', anbieterBlock(a));
    t = ersetze(t, 'UMSATZSTEUER', a.kleinunternehmer
        ? 'Es wird keine Umsatzsteuer ausgewiesen (Kleinunternehmer nach § 19 UStG).'
        : 'zzgl. der jeweils geltenden gesetzlichen Umsatzsteuer.');
    // Gerichtsstand ist der Sitz des Anbieters -- das ist die uebliche und
    // fuer Kaufleute zulaessige Wahl (§ 38 ZPO). Der Satz im Entwurf gilt
    // ausdruecklich nur gegenueber Kaufleuten.
    t = ersetze(t, 'GERICHTSSTAND', a.ort);
    t = ersetze(t, 'UNTERAUFTRAGSVERARBEITER', verarbeiterText());
    return t;
}

function offeneStellen(text) {
    return String(text || '').match(/\[\[[^\]]*\]\]/g) || [];
}

async function hol(pfad) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: kopf() });
    if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) {}
        if (/(does not exist|schema cache|relation)/i.test(t)) {
            throw new Error('Die Vertrags-Tabellen fehlen noch (datenbank/32-vertrag.sql).');
        }
        throw new Error(pfad.split('?')[0] + ' ' + res.status);
    }
    return await res.json();
}

// Die naechste Fassungsnummer: 2026-09-1 -> 2026-09-2.
function naechsteNummer(vorhandene) {
    var heute = new Date();
    var stamm = heute.getFullYear() + '-' + String(heute.getMonth() + 1).padStart(2, '0');
    var hoechste = 0;
    (vorhandene || []).forEach(function (f) {
        var m = String(f.fassung || '').match(/^(\d{4}-\d{2})-(\d+)$/);
        if (m && m[1] === stamm) hoechste = Math.max(hoechste, parseInt(m[2], 10));
    });
    return stamm + '-' + (hoechste + 1);
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, fehler: 'Nur POST' });
    if (!KEY) return json(500, { ok: false, fehler: 'Server nicht eingerichtet (SUPABASE_SERVICE_KEY fehlt).' });
    if (!(await VERWALTER.darfVerwalten(event, KEY))) {
        return json(403, { ok: false, fehler: 'Nur der Verwalter darf das.' });
    }

    var body = {};
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return json(400, { ok: false, fehler: 'Konnte die Anfrage nicht lesen.' }); }
    var aktion = (event.queryStringParameters || {}).action || body.action || 'vorschau';

    try {
        var anbieter = null;
        try { anbieter = (await hol('anbieter?id=eq.1&select=*&limit=1'))[0] || null; }
        catch (e) {
            return json(409, { ok: false, fehler: 'Deine Firmendaten fehlen noch (SQL 37). '
                + 'Trag sie einmal unter "Mahnung schreiben" ein.' });
        }
        var fehlt = fehlendeFelder(anbieter);
        if (fehlt.length) {
            return json(409, { ok: false, absender_unvollstaendig: true, fehlende_felder: fehlt,
                fehler: 'Im Absender fehlt: ' + fehlt.join(', ') + '. '
                      + 'Das steht im Vertrag ganz oben — ohne das geht es nicht.' });
        }

        var alle = await hol('vertrag_fassungen?select=*&order=erstellt_am');
        if (!alle.length) {
            return json(409, { ok: false, fehler: 'Es gibt noch keine Entwürfe. '
                + 'Spiel datenbank/32-vertrag.sql ein.' });
        }

        // Je Art die JUENGSTE Fassung als Grundlage -- nicht irgendeine.
        var grundlage = {};
        alle.forEach(function (f) { grundlage[f.art] = f; });

        var ergebnis = Object.keys(grundlage).map(function (art) {
            var f = grundlage[art];
            var neu = fuellen(f.inhalt, anbieter);
            return {
                art: art, titel: f.titel, von_fassung: f.fassung,
                inhalt: neu,
                vorher_offen: offeneStellen(f.inhalt).length,
                nachher_offen: offeneStellen(neu)
            };
        });

        if (aktion === 'vorschau') {
            return json(200, { ok: true, fassungen: ergebnis,
                               naechste_nummer: naechsteNummer(alle) });
        }

        if (aktion === 'erstellen') {
            var nummer = naechsteNummer(alle);
            var zeilen = ergebnis.map(function (e) {
                return { art: e.art, fassung: nummer, titel: e.titel,
                         inhalt: e.inhalt, status: 'entwurf' };
            });
            var res = await fetch(SUPABASE_URL + '/rest/v1/vertrag_fassungen', {
                method: 'POST',
                headers: Object.assign({}, kopf(), {
                    'Content-Type': 'application/json', Prefer: 'return=representation'
                }),
                body: JSON.stringify(zeilen)
            });
            var text = await res.text();
            if (!res.ok) {
                return json(500, { ok: false, fehler: 'Nicht gespeichert (' + res.status + '): '
                    + text.slice(0, 200) });
            }
            var geschrieben = []; try { geschrieben = JSON.parse(text); } catch (e) {}
            if (!geschrieben.length) {
                return json(500, { ok: false, fehler: 'Nicht gespeichert: keine Zeile zurückgekommen.' });
            }
            return json(200, { ok: true, fassung: nummer, angelegt: geschrieben.length,
                               fassungen: ergebnis });
        }

        return json(400, { ok: false, fehler: 'Unbekannte Aktion.' });
    } catch (e) {
        console.error('[vertrag-fassung] ' + (e && e.message));
        return json(500, { ok: false, fehler: e.message });
    }
};

exports._fuellen = fuellen;
exports._offeneStellen = offeneStellen;
exports._verarbeiterText = verarbeiterText;
exports._VERARBEITER = VERARBEITER;
exports._naechsteNummer = naechsteNummer;
exports._fehlendeFelder = fehlendeFelder;
