// DIE ZAHLSPERRE AUF DER SERVERSEITE -- die Wand hinter der Anzeige.
//
// WARUM ES DIE HIER NOCH EINMAL GIBT
// ==================================
// Im Browser steht derselbe Schalter schon (index.html, zahlsperreStufe).
// Der reicht nicht, und zwar aus demselben Grund, aus dem die
// Preis-Pruefung serverseitig laeuft: eine Pruefung, an der man
// vorbeigehen kann, ist keine.
//
// Konkret gehen im Browser drei Wege an ihm vorbei:
//
//   1. Eine ALTE FASSUNG der App. Der Service Worker haelt die Huelle
//      vor; ein Geraet, das seit Tagen offen liegt, kennt die Sperre
//      nicht und schickt die Bestellung wie immer los.
//   2. Der NOTWEG. Antwortet order-save nicht, schreibt die App direkt
//      in die Datenbank. Dort steht keine Pruefung.
//   3. Die ADRESSE DIREKT. /.netlify/functions/order-save nimmt jeden
//      POST an; ein Skript braucht die App gar nicht.
//
// Deshalb: die Anzeige im Browser ist die Hoeflichkeit, das hier ist die
// Sperre. Wer sie erreicht, bekommt 423 und den Satz, den der Gast lesen
// soll -- nicht das Wort Rechnung.
//
// IM ZWEIFEL OFFEN
// ================
// Faellt die Abfrage aus, fehlt die Spalte (SQL 36 noch nicht
// eingespielt) oder steht etwas Unbekanntes drin, gilt "keine" und die
// Bestellung geht durch. Die Alternative waere: eine Stoerung bei
// Supabase sperrt alle 25 Betriebe gleichzeitig aus -- an einem
// Freitagabend. Genau der Fall, in dem ein Fehler von mir Ibo Kunden
// kostet, statt einen Nichtzahler zu treffen.
//
// EIGENE ABFRAGE, EIGENER AUSFALL
// ===============================
// Bewusst NICHT in den bestehenden select der Funktionen
// hineingeschrieben. Am 27.08.2026 hat genau das einen Tag gekostet:
// min_order_value in einen select genommen, die Spalte gab es nicht,
// PostgREST antwortete 400 -- und weil Promise.all abbricht, war
// danach der GANZE Preis-Schutz aus, ohne eine einzige Fehlermeldung.
// Eine zusaetzliche Abfrage kostet 40 Millisekunden. Ein stiller
// Ausfall kostet Tage.

'use strict';

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

// Die Reihenfolge ist die Schaerfe. Index 0 = offen.
var STUFEN = ['keine', 'hinweis', 'pause', 'aus'];

// Unbekanntes, Leeres, null, Zahlen, Gross-/Kleinschreibung -- alles
// landet auf 'keine'. Nur genau die drei bekannten Woerter sperren.
function stufeAus(wert) {
    var s = String(wert == null ? '' : wert).trim().toLowerCase();
    return STUFEN.indexOf(s) > 0 ? s : 'keine';
}

function bestellenAus(stufe) { return stufe === 'pause' || stufe === 'aus'; }
function reservierenAus(stufe) { return stufe === 'aus'; }

// Was der Gast liest. KEIN WORT UEBER RECHNUNGEN: das geht ihn nichts an,
// und es beschaedigt den Betrieb vor seinen eigenen Gaesten. Wortgleich
// mit zahlsperreGastText() in index.html -- der Gast soll nicht zwei
// verschiedene Saetze fuer dieselbe Lage sehen, je nachdem ob die App
// oder der Server ihn abgewiesen hat.
function gastText(stufe) {
    if (stufe === 'pause') return 'Dieser Betrieb nimmt gerade keine Online-Bestellungen an. Tisch reservieren geht weiter.';
    if (stufe === 'aus') return 'Dieser Betrieb ist gerade nicht über Kiek mol in erreichbar.';
    return '';
}

// Liest die Stufe. Gibt IMMER ein Ergebnis zurueck, nie einen Fehler.
//   { stufe: 'keine'|'hinweis'|'pause'|'aus', gemessen: bool, grund: string }
// gemessen=false heisst: wir wissen es nicht, und lassen deshalb durch.
// Das gehoert ins Protokoll, damit "es sperrt nicht" nachher nicht
// geraten werden muss.
async function lesen(restaurantId, schluessel) {
    var rid = String(restaurantId || '');
    if (!rid) return { stufe: 'keine', gemessen: false, grund: 'keine restaurant_id' };

    var key = schluessel || process.env.SUPABASE_SERVICE_KEY || '';
    if (!key) return { stufe: 'keine', gemessen: false, grund: 'kein Schluessel' };

    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/restaurants?id=eq.'
            + encodeURIComponent(rid) + '&select=zahlsperre&limit=1',
            { headers: { apikey: key, Authorization: 'Bearer ' + key } });

        if (!res.ok) {
            var text = '';
            try { text = await res.text(); } catch (e) {}
            if (/zahlsperre/i.test(text) && /(does not exist|schema cache)/i.test(text)) {
                console.warn('[zahlsperre] Spalte fehlt noch (SQL 36 nicht eingespielt) -- alles offen.');
                return { stufe: 'keine', gemessen: false, grund: 'SQL 36 fehlt' };
            }
            console.warn('[zahlsperre] Supabase ' + res.status + ' -- im Zweifel offen.');
            return { stufe: 'keine', gemessen: false, grund: 'HTTP ' + res.status };
        }

        var zeilen = await res.json();
        if (!Array.isArray(zeilen) || !zeilen.length) {
            return { stufe: 'keine', gemessen: false, grund: 'Betrieb nicht gefunden' };
        }
        return { stufe: stufeAus(zeilen[0].zahlsperre), gemessen: true, grund: '' };
    } catch (e) {
        console.warn('[zahlsperre] nicht erreichbar: ' + (e && e.message) + ' -- im Zweifel offen.');
        return { stufe: 'keine', gemessen: false, grund: 'nicht erreichbar' };
    }
}

// Der Aufruf fuer die Functions.
//   was: 'bestellen' | 'reservieren'
//   -> { erlaubt: bool, stufe, text, gemessen }
async function pruefe(restaurantId, was, schluessel) {
    var stand = await lesen(restaurantId, schluessel);
    var zu = (was === 'reservieren') ? reservierenAus(stand.stufe) : bestellenAus(stand.stufe);
    return {
        erlaubt: !zu,
        stufe: stand.stufe,
        gemessen: stand.gemessen,
        text: zu ? gastText(stand.stufe) : ''
    };
}

// Die fertige Antwort. 423 Locked -- absichtlich nicht 403: der Browser
// darf danach NICHT auf den direkten Insert ausweichen, genau wie beim
// 422 der Preis-Pruefung. Und nicht 503: das hiesse "versuch es gleich
// nochmal", und die App wuerde es tun.
function abweisung(pruefung, cors) {
    return {
        statusCode: 423,
        headers: cors,
        body: JSON.stringify({
            ok: false,
            zahlsperre: pruefung.stufe,
            error: pruefung.text
        })
    };
}

module.exports = {
    STUFEN: STUFEN,
    stufeAus: stufeAus,
    bestellenAus: bestellenAus,
    reservierenAus: reservierenAus,
    gastText: gastText,
    lesen: lesen,
    pruefe: pruefe,
    abweisung: abweisung
};
