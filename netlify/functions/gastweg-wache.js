// DER KANARIENVOGEL -- alle 15 Minuten geht die Wache selbst die Wege,
// die ein Gast geht, und schaut nach, ob sie offen sind.
//
// WARUM
// =====
// Am 25.08.2026 wurden vier Gaeste an einem Tag abgewiesen. Der Fehler
// war in einer Stunde repariert -- gemerkt hat ihn TAGE lang niemand.
//
// Der Grund ist unangenehm einfach: der Betreiber ist angemeldet. Fuer
// ihn ging alles. Der Gast ist niemand, und niemand beschwert sich --
// er geht einfach weg. Es gibt keine Stelle, an der so ein Ausfall von
// selbst auffaellt.
//
// "Sowas darf nie passieren...muessen bei sowas eine Loesung finden."
// "dar nie sowas passieren auch nicht bei Bestellungen"
//
// Ein Test, der die echte Tuer benutzt, kann nicht gruen sein, waehrend
// die Tuer klemmt. Das ist der ganze Punkt: unsere Tests lesen
// Quelltext. Sie haetten den Fehler NIE gefunden, weil er nicht im
// Quelltext stand, sondern in einer Regel in der Datenbank.
//
// DREI PRUEFUNGEN
// ===============
//   1. Reservieren    -- der Weg, der am 25.08. zu war.
//   2. Bestellen      -- derselbe Weg fuer Bestellungen.
//   3. Preis-Schutz   -- und der ist der interessanteste.
//
// Zu 3: Am selben Tag kam heraus, dass der Preis-Check bei JEDER
// Bestellung aus war -- eine Abfrage fragte nach einer Spalte, die es
// nicht gibt, die Pruefung fiel in den catch-Zweig und liess alles
// durch. Absichtlich faellt sie offen aus, damit eine Stoerung keine
// echte Bestellung verhindert; genau deshalb hat es monatelang niemand
// gemerkt.
//
// Deshalb schickt die Wache eine absichtlich ZU BILLIGE Bestellung: ein
// echtes Gericht fuer 0 Euro. Die MUSS abgelehnt werden. Kommt sie
// durch, ist der Schutz wieder aus -- und das Handy klingelt.
//
// WAS SIE HINTERLAESST
// Nichts. Jede Probe wird sofort geloescht, und jeder Durchlauf raeumt
// zuerst auf, was ein abgebrochener Vorgaenger liegengelassen haben
// koennte. Die Proben tragen einen eindeutigen Namen, liegen weit in
// der Zukunft und werden vom Melder uebersprungen -- kein Wirt bekommt
// je eine Meldung ueber einen Gast, den es nie gab.

'use strict';

var alarmModul = require('./lib/alarm');
var gedaechtnis = require('./lib/wache-gedaechtnis');

// EINE PRUEFUNG, DIE GERADE NICHT PRUEFBAR IST, IST KEIN "ALLES GUT".
//
// Ohne Speisekarte laesst sich der Preis-Schutz nicht pruefen, ohne
// hinterlegten Mindestwert der Mindestwert nicht. Frueher gaben diese
// Faelle dasselbe zurueck wie ein bestandener Durchlauf -- null. Das
// ging gut, solange daraus nur "kein Alarm" folgte.
//
// Jetzt folgt daraus auch eine Entwarnung, und da waere es falsch: die
// Wache haette "geht wieder" gemeldet, obwohl sie nur nicht hingesehen
// hat. Genau die Sorte stiller Fehler aus Regel 6 -- sieht aus wie
// eine Antwort, ist keine.
var UNPRUEFBAR = 'unpruefbar';

// DIE NUMMER MUSS MIT sw.js MITWANDERN.
//
// Der Name des Zwischenspeichers ist der einzige Schalter, der die
// alte App von den Geraeten raeumt. Steht hier eine kleinere Zahl als
// in sw.js, prueft die Wache nichts mehr -- sie waere zufrieden mit
// einer Fassung, die es gar nicht mehr geben darf.
//
// tests/wache-test.js vergleicht beide Zahlen und wird rot, wenn eine
// stehenbleibt.
var CACHE_MINDESTENS = 12;

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
var SEITE        = process.env.URL || process.env.DEPLOY_URL || 'https://kiekmolin.de';

// Der Name, an dem jede Probe zu erkennen ist. Steht beim Anlegen, beim
// Aufraeumen und im Melder, der sie ueberspringt -- deshalb hier einmal
// und nur hier.
var PROBE_NAME = '[Probe] Gastweg-Wache';

// DIE BESTELLNUMMER DARF HOECHSTENS 20 ZEICHEN HABEN.
//
// Am 27.08.2026 im Protokoll gefunden, 108 mal:
//     22001  value too long for type character varying(20)
//
// 'PROBE-BILLIG-' + Date.now() sind 26 Zeichen, 'PROBE-MINDEST-' + ...
// sogar 27. Zwei von drei Proben konnten also gar nicht eingefuegt
// werden -- sie scheiterten an der Spaltenbreite, nicht an dem, was sie
// pruefen sollten. Eine Probe, die aus dem falschen Grund fehlschlaegt,
// prueft nichts.
//
// P + zwei Buchstaben + Bindestrich + die letzten 13 Stellen der Zeit
// sind 17 Zeichen und bleiben eindeutig genug fuer eine Probe, die
// Sekunden spaeter wieder geloescht wird.
function probeNummer(art) {
    return ('P' + art + '-' + Date.now()).slice(0, 20);
}

function kopf() {
    return {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
    };
}

// Weit in der Zukunft: selbst wenn eine Probe wider Erwarten liegen
// bleibt, steht sie niemandem im Weg und faellt beim Durchsehen sofort
// als das auf, was sie ist.
function probeDatum() {
    var d = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

// Beide Tabellen, immer beide -- auch wenn nur eine Pruefung lief.
// Aufraeumen, das nur den eigenen Pfad kennt, laesst irgendwann etwas
// liegen.
async function aufraeumen() {
    var wege = [
        'reservations?guest_name=eq.' + encodeURIComponent(PROBE_NAME),
        'orders?customer_name=eq.' + encodeURIComponent(PROBE_NAME)
    ];
    for (var i = 0; i < wege.length; i++) {
        try {
            await fetch(SUPABASE_URL + '/rest/v1/' + wege[i], { method: 'DELETE', headers: kopf() });
        } catch (e) {
            console.error('[wache] Aufraeumen fehlgeschlagen:', wege[i], e.message);
        }
    }
}

// Ein Haus, an dem geprobt wird. Vorgabe per Umgebungsvariable, sonst
// das erste freigeschaltete -- die Proben werden ja sofort wieder
// geloescht, das Haus merkt nichts davon.
async function probeHaus() {
    if (process.env.WACHE_RESTAURANT_ID) return process.env.WACHE_RESTAURANT_ID;
    var res = await fetch(SUPABASE_URL
        + '/rest/v1/restaurants?is_active=eq.true&select=id&order=created_at.asc&limit=1',
        { headers: kopf() });
    if (!res.ok) return null;
    var zeilen = await res.json();
    return (zeilen && zeilen[0] && zeilen[0].id) || null;
}

// Ein echtes Gericht mit echtem Preis -- gebraucht fuer die
// Preis-Schutz-Probe. Ohne Karte laesst sich der Schutz nicht pruefen.
async function probeGericht(haus) {
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/menu_items?restaurant_id=eq.'
            + encodeURIComponent(haus)
            + '&base_price=gte.1&select=id,base_price&limit=1', { headers: kopf() });
        if (!res.ok) return null;
        var zeilen = await res.json();
        return (zeilen && zeilen[0]) || null;
    } catch (e) { return null; }
}

// Antwort einer Gaeste-Tuer holen -- genau wie ein Gast: keine
// apikey-Kopfzeile, keine Anmeldung, kein Sonderrecht. Wenn es hier
// geht, geht es fuer jeden.
async function alsGast(pfad, rumpf) {
    try {
        var res = await fetch(SEITE + '/.netlify/functions/' + pfad, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rumpf)
        });
        var daten = await res.json().catch(function () { return null; });
        return { status: res.status, daten: daten };
    } catch (e) {
        return { status: 0, daten: null, netzFehler: (e && e.message) || 'unbekannt' };
    }
}

// Aus einer Antwort einen Grund machen, den man um 23 Uhr lesen kann.
// "Etwas ist kaputt" hilft niemandem -- der HTTP-Code zeigt sofort, wo
// zu suchen ist: 401/403 heisst Rechte, 500 heisst Programmfehler,
// 404 heisst falsche Adresse.
function grundAus(a) {
    if (a.netzFehler) return 'Server nicht erreichbar: ' + a.netzFehler;
    var code = 'HTTP ' + ((a.daten && a.daten.status) || a.status);
    return (a.daten && a.daten.error) ? (a.daten.error + ' (' + code + ')') : code;
}

// ---- PRUEFUNG 1: Kann ein Gast reservieren? -------------------------
async function pruefeReservierung(haus) {
    var a = await alsGast('reservation-guest', {
        restaurant_id:    haus,
        guest_name:       PROBE_NAME,
        guest_phone:      '0000000000',
        party_size:       2,
        reservation_date: probeDatum(),
        reservation_time: '12:00',
        notes:            'Automatische Pruefung, wird sofort geloescht.'
    });
    // Halb reicht nicht: ohne track_token haette der Gast keinen
    // Verfolgen-Banner, und das faellt sonst wieder niemandem auf.
    if (a.daten && a.daten.ok && a.daten.id && a.daten.track_token) return null;
    if (a.daten && a.daten.ok) return 'Reservieren: Antwort unvollstaendig (id/track_token fehlt)';
    return 'Reservieren: ' + grundAus(a);
}

// ---- PRUEFUNG 2: Kann ein Gast bestellen? ---------------------------
async function pruefeBestellung(haus) {
    var a = await alsGast('order-save', {
        order: {
            order_number:  probeNummer('OR'),
            restaurant_id: haus,
            customer_name: PROBE_NAME,
            customer_phone: '0000000000',
            status:        'received',
            order_type:    'pickup',
            items:         [],
            subtotal:      0,
            total:         0
        }
    });
    if (a.daten && a.daten.ok && a.daten.id) return null;
    return 'Bestellen: ' + grundAus(a);
}

// ---- PRUEFUNG 0: IST DIE AUSGELIEFERTE SEITE UEBERHAUPT DIE NEUE? ---
//
// DAS WAR DER BLINDE FLECK, UND ER HAT EINEN GANZEN TAG GEKOSTET.
//
// Am 26.08.2026 fragte der Betreiber: "Und wo ist der Waechter warum
// sieht er die Probleme nicht". Zu Recht. Die Wache rief bis dahin nur
// die Server-Funktionen auf -- und die waren heil. Sie meldete
// durchgehend gruen, waehrend im Browser nichts ging.
//
// Der Grund: die Reparatur lag seit dem Vortag auf dem Server, aber die
// SEITE, die der Browser bekommt, war noch die alte. Zwei Wege dahin:
// Netlify hatte den neuen Stand noch nicht ausgeliefert, oder der
// Service Worker auf dem Geraet hielt die alte Fassung fest, weil der
// Name seines Zwischenspeichers unveraendert blieb.
//
// Eine Wache, die nur den Server prueft, kann diesen Fall nicht sehen.
// Sie muss holen, was der Gast holt.
//
// Was sie NICHT kann: in den Zwischenspeicher eines fremden Handys
// schauen. Aber der Name in sw.js ist der Schalter, der ihn leert --
// stimmt der, raeumt jedes Geraet beim naechsten Aufruf von selbst auf.
async function pruefeAusgelieferteSeite() {
    var seite, worker;
    try {
        var a = await fetch(SEITE + '/index.html', { headers: { 'Cache-Control': 'no-cache' } });
        if (!a.ok) return 'Startseite: HTTP ' + a.status;
        seite = await a.text();
        var b = await fetch(SEITE + '/sw.js', { headers: { 'Cache-Control': 'no-cache' } });
        worker = b.ok ? await b.text() : '';
    } catch (e) {
        return 'Startseite nicht abrufbar: ' + ((e && e.message) || 'unbekannt');
    }

    // Schickt die ausgelieferte Seite Gaeste ueber die neue Tuer?
    var neuerWeg = seite.indexOf('/.netlify/functions/reservation-guest') > -1;
    if (!neuerWeg) {
        return 'Die ausgelieferte Seite ist ALT: sie schreibt Reservierungen noch '
             + 'direkt in die Datenbank. Der Server ist repariert, die Seite nicht -- '
             + 'vermutlich haengt der Netlify-Deploy.';
    }

    // Und passt der Name des Zwischenspeichers dazu? Sonst behalten die
    // Geraete die alte Fassung, obwohl auf dem Server alles stimmt.
    var v = (worker.match(/var CACHE = 'kmi-shell-v(\d+)';/) || [])[1];
    if (!v) return 'sw.js: kein gezaehlter Name fuer den Zwischenspeicher gefunden';
    if (Number(v) < CACHE_MINDESTENS) {
        return 'Der Zwischenspeicher steht auf v' + v + ', obwohl die Seite den neuen '
             + 'Gastweg benutzt -- die Geraete behalten die alte App';
    }
    return null;
}

// ---- PRUEFUNG 3: Lebt der Preis-Schutz noch? ------------------------
// Ein echtes Gericht fuer 0 Euro. Das MUSS abgelehnt werden.
async function pruefePreisSchutz(haus) {
    var gericht = await probeGericht(haus);
    if (!gericht) return UNPRUEFBAR;    // ohne Karte nicht pruefbar, kein Alarm

    var a = await alsGast('order-save', {
        order: {
            order_number:  probeNummer('PS'),
            restaurant_id: haus,
            customer_name: PROBE_NAME,
            customer_phone: '0000000000',
            status:        'received',
            order_type:    'pickup',
            items:         [{ menu_item_id: gericht.id, quantity: 1, price: 0 }],
            subtotal:      0,
            total:         0
        }
    });
    if (a.status === 422 && a.daten && a.daten.preis_abgelehnt) return null;   // richtig abgewiesen
    if (a.netzFehler) return 'Preis-Schutz: ' + grundAus(a);
    return 'Preis-Schutz IST AUS: ein Gericht fuer ' + gericht.base_price
         + ' Euro ging fuer 0 Euro durch (HTTP ' + a.status + ')';
}

// ---- PRUEFUNG 4: Haelt der Mindestbestellwert? ----------------------
//
// Gefragt am 26.08.2026 zu einer Lieferbestellung ueber 12,00 Euro bei
// hinterlegten 15 Euro: "warum konnte er mit 12,00 liefern lassen".
//
// Der Grund: die Regel stand nur im Browser. Genau deshalb prueft die
// Wache sie jetzt dort, wo sie gelten muss -- auf dem Server.
//
// Eine Lieferbestellung mit einem einzigen Gericht, weit unter dem
// hinterlegten Wert. Die MUSS abgelehnt werden.
//
// UND SIE PRUEFT IHN DORT, WO ES IHN GIBT -- NICHT DORT, WO SIE GERADE
// STEHT.
//
// Am 27.08.2026 nach dem Einspielen von SQL 19 nachgesehen:
//
//     Greetsieler Boerse           0.00
//     La Piazza                    0.00
//     Pizzeria Al Porto Oldersum   0.00
//     Rhodos                      15.00
//
// Genau ein Haus hat einen Mindestbestellwert. Die Wache probt aber am
// ERSTEN freigeschalteten Haus -- und wenn das nicht Rhodos ist, findet
// sie dort 0, gibt "nicht pruefbar" zurueck und der einzige Betrieb,
// bei dem die Regel ueberhaupt gilt, wird nie geprueft.
//
// Eine Wache, die nur dort nachsieht, wo nichts zu holen ist, meldet
// jahrelang gruen. Also sucht diese Pruefung sich ihr Haus selbst: das
// erste freigeschaltete MIT hinterlegtem Wert.
async function pruefeMindestbestellwert(haus) {
    var hausDaten = null;
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/restaurants'
            + '?is_active=eq.true&min_order_value=gt.0'
            + '&select=id,min_order_value&order=created_at.asc&limit=1', { headers: kopf() });
        if (res.ok) hausDaten = (await res.json())[0];
    } catch (e) { return UNPRUEFBAR; }

    // Kein Haus mit hinterlegtem Wert -> nichts zu pruefen, kein Alarm.
    var mindest = hausDaten ? Number(hausDaten.min_order_value) || 0 : 0;
    if (!hausDaten || mindest <= 0) return UNPRUEFBAR;
    haus = hausDaten.id;

    var gericht = await probeGericht(haus);
    if (!gericht) return UNPRUEFBAR;           // ohne Karte nicht pruefbar

    // Ein Gericht zum echten Preis. Liegt das schon ueber dem Mindestwert,
    // laesst sich der Schutz mit einer Bestellung nicht pruefen -- dann
    // lieber gar nichts melden als falschen Alarm.
    var warenwert = Number(gericht.base_price) || 0;
    if (warenwert >= mindest) return UNPRUEFBAR;

    var a = await alsGast('order-save', {
        order: {
            order_number:   probeNummer('MB'),
            restaurant_id:  haus,
            customer_name:  PROBE_NAME,
            customer_phone: '0000000000',
            status:         'received',
            order_type:     'delivery',
            delivery_address: 'Probestrasse 1, 26802 Moormerland',
            items:          [{ menu_item_id: gericht.id, quantity: 1, price: warenwert }],
            subtotal:       warenwert,
            total:          warenwert
        }
    });
    if (a.status === 422 && a.daten && a.daten.preis_abgelehnt) return null;   // richtig abgewiesen
    if (a.netzFehler) return 'Mindestbestellwert: ' + grundAus(a);
    return 'Mindestbestellwert GILT NICHT: eine Lieferung ueber ' + warenwert.toFixed(2)
         + ' Euro ging durch, obwohl ' + mindest.toFixed(2) + ' Euro hinterlegt sind (HTTP '
         + a.status + ')';
}

// WELCHE PRUEFUNG WELCHE KENNUNG TRAEGT.
//
// Die Kennung ist der Name, unter dem sich die Wache merkt, ob sie
// diese eine Sache schon gemeldet hat. Frueher trugen ALLE Pruefungen
// dieselbe ('kmi-wache') -- damit haette eine bekannte Stoerung eine
// neue verschluckt: Preis-Schutz meldet sich, danach ist Ruhe, und
// wenn eine Stunde spaeter das Reservieren zumacht, sagt niemand etwas.
//
// Je Pruefung eine eigene Kennung. Leiser beim Wiederholen, nie leiser
// bei etwas Neuem.
var PRUEFUNGEN = [
    // Die ausgelieferte Seite zuerst: geht die nicht, ist alles andere
    // egal -- dann bekommt der Gast gar nicht erst die reparierte App.
    { kennung: 'wache-seite',       fn: pruefeAusgelieferteSeite },
    { kennung: 'wache-reservieren', fn: pruefeReservierung },
    { kennung: 'wache-bestellen',   fn: pruefeBestellung },
    { kennung: 'wache-preis',       fn: pruefePreisSchutz },
    { kennung: 'wache-mindest',     fn: pruefeMindestbestellwert }
];

exports.handler = async function () {
    if (!SERVICE_KEY) {
        console.error('[wache] SUPABASE_SERVICE_KEY fehlt -- Wache kann nicht aufraeumen');
        return { statusCode: 503, body: 'nicht eingerichtet' };
    }

    // ERST aufraeumen. Wenn ein frueherer Durchlauf mitten im Vorgang
    // abgebrochen ist, liegt noch eine Probe da -- die soll sich nicht
    // haeufen.
    await aufraeumen();

    var haus = null;
    try { haus = await probeHaus(); }
    catch (e) { /* faellt unten als "kein Haus" auf */ }

    if (!haus) {
        await melden([{ kennung: 'wache-haus',
            text: 'Die Gastweg-Wache findet kein freigeschaltetes Restaurant. '
                + 'Entweder ist keines aktiv, oder die Datenbank antwortet nicht.' }], []);
        return antwort({ ok: false, grund: 'kein Haus' });
    }

    // Alle laufen, auch wenn die erste schon klemmt. Sonst weiss man
    // nach dem Alarm nur, dass EIN Weg zu ist -- und repariert ihn,
    // waehrend der naechste noch immer zu ist.
    var stand = [];
    for (var i = 0; i < PRUEFUNGEN.length; i++) {
        var p = PRUEFUNGEN[i];
        var erg;
        try {
            erg = await p.fn(haus);
        } catch (e) {
            erg = 'Pruefung ' + p.kennung + ' ist selbst abgestuerzt: ' + ((e && e.message) || e);
        }
        stand.push({ kennung: p.kennung, mangel: erg === UNPRUEFBAR ? null : erg,
                     uebersprungen: erg === UNPRUEFBAR });
    }

    // Immer aufraeumen -- auch wenn alles geklappt hat, gerade dann.
    await aufraeumen();

    // ---- WAS DAVON SOLL IHN UEBERHAUPT ERREICHEN? -------------------
    //
    // Bis zum 27.08.2026: alles, jedes Mal, alle 15 Minuten. Gemessen
    // wurden 96 E-Mails in einer Nacht, alle mit demselben Satz. Seine
    // Worte: "die wache nervt zu viel".
    //
    // Jetzt entscheidet das Gedaechtnis je Pruefung -- neu, Erinnerung,
    // Entwarnung oder still. Und danach geht EINE Nachricht raus, nicht
    // eine je Pruefung.
    var schlecht = [], gut = [], maengel = [];
    for (var j = 0; j < stand.length; j++) {
        var z = stand[j];
        if (z.mangel) maengel.push(z.mangel);
        // Eine Pruefung, die gerade nicht pruefbar ist, aendert nichts:
        // weder Alarm noch Entwarnung.
        if (z.uebersprungen) continue;
        var was = await gedaechtnis.bewerten(z.kennung, !!z.mangel);
        if (was === 'neu' || was === 'erinnerung') {
            schlecht.push({ kennung: z.kennung, text: z.mangel, erinnerung: was === 'erinnerung' });
        } else if (was === 'entwarnung') {
            gut.push(z.kennung);
        }
    }

    if (schlecht.length || gut.length) await melden(schlecht, gut);

    if (!maengel.length) console.log('[wache] alle Gastwege in Ordnung (Haus', haus + ')');
    return antwort({ ok: !maengel.length, maengel: maengel,
                     gemeldet: schlecht.length, entwarnt: gut.length });
};

// EINE NACHRICHT JE DURCHLAUF -- NICHT EINE JE PRUEFUNG.
//
// Wenn drei Wege gleichzeitig zumachen, ist das eine Stoerung und
// nicht drei. Drei Nachrichten dafuer waeren genau der Laerm, um den
// es hier geht.
async function melden(schlecht, gut) {
    var titel, zeilen = [];

    if (schlecht.length) {
        var alleErinnerung = schlecht.every(function (x) { return x.erinnerung; });
        titel = alleErinnerung
            ? (schlecht.length === 1 ? 'Klemmt immer noch' : schlecht.length + ' Sachen klemmen immer noch')
            : (schlecht.length === 1 ? 'Ein Gastweg klemmt' : schlecht.length + ' Gastwege klemmen');
        zeilen.push(schlecht.map(function (x) { return x.text; }).join(' -- '));
        if (!alleErinnerung) zeilen.push('Das trifft jeden Gast, der es gerade versucht.');
        // Damit er weiss, dass keine zweite Mail kommt, wenn er nichts tut.
        zeilen.push('Naechste Erinnerung fruehestens morgen tagsueber.');
    }
    if (gut.length) {
        if (!titel) titel = gut.length === 1 ? 'Geht wieder' : 'Geht wieder (' + gut.length + ')';
        zeilen.push('Wieder in Ordnung: ' + gut.join(', ') + '.');
    }

    try {
        await alarmModul.senden(titel, zeilen.join(' '), 'kmi-wache',
                                schlecht.length ? 'alarm' : 'entwarnung');
    } catch (e) {
        console.error('[wache] Melden fehlgeschlagen:', (e && e.message) || e);
    }
}

// IMMER 200 -- UND DAS IST KEINE SCHOENFAERBEREI, SONDERN DIE
// REPARATUR EINES GEMESSENEN FEHLERS.
//
// Vorher gab die Wache 500 zurueck, wenn etwas klemmte, "damit der
// Ausfall auch in der Netlify-Uebersicht rot ist". Netlify haelt einen
// Durchlauf mit 500 fuer misslungen und startet ihn NEU.
//
// Gemessen am 27.08.2026 in den Edge-Protokollen: drei Durchlaeufe je
// Viertelstunde statt einem -- 05:45:25, 05:45:28 und 05:45:36 Uhr
// fragten nacheinander nach den Empfaengern, jeder schickte eine
// eigene E-Mail. Der Statuscode allein hat die Zahl der Meldungen
// verdreifacht. Zum Vergleich: seit alles wieder gruen ist, legt die
// Wache genau EINE Probe je Viertelstunde an.
//
// Rot in einer Uebersicht, die niemand aufmacht, ist nichts wert. Der
// Ausfall steht als [ALARM] im Protokoll, im Gedaechtnis und auf
// seinem Handy. Das reicht, und es kostet keine drei Mails.
function antwort(rumpf) {
    return { statusCode: 200, body: JSON.stringify(rumpf) };
}
