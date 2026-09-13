// Bon-Druck via Epson Server Direct Print.
// Der Epson-Bondrucker (TM-Serie mit ePOS Server Direct) wird so konfiguriert,
// dass er regelmässig (alle 5-15 Sek) bei dieser URL nachfragt. Wir liefern
// dann die nächste ungedruckte Bestellung im ePOS-Print-XML-Format aus und
// markieren sie als gedruckt.
//
// Modi:
//   GET/POST /.netlify/functions/pos-print?restaurant=<id>&key=<pull_key>
//     -> liefert XML mit der nächsten ungedruckten Bestellung (oder leer)
//     -> markiert die Bestellung als gedruckt
//
//   POST /.netlify/functions/pos-print?action=reprint&order=<id>
//        Header: Authorization: Bearer <supabase-login-token>
//     -> setzt printed_at zurück, damit der Drucker den Bon nochmal holt
//
// ENV-Vars optional: SUPABASE_URL, SUPABASE_SERVICE_KEY (bevorzugt).
// Fehlen sie, fallen wir auf die öffentlichen anon-Zugangsdaten zurück.

'use strict';

var crypto = require('crypto');

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cmdtYmRva2R6bXVtZHllemhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjEyOTgsImV4cCI6MjA4MTEzNzI5OH0.7Ciwa2UKUHwtorvq3p6sN69XmVvPg0Kvg5lgrovxpDw';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
};

function svcHeaders() {
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
    };
}

async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: svcHeaders() });
    if (!res.ok) {
        var t = await res.text();
        throw new Error('Supabase GET ' + path + ' -> ' + res.status + ': ' + t.slice(0, 200));
    }
    return res.json();
}

async function sbPatch(path, body) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
        method: 'PATCH',
        headers: Object.assign({}, svcHeaders(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        var t = await res.text();
        throw new Error('Supabase PATCH ' + path + ' -> ' + res.status + ': ' + t.slice(0, 200));
    }
}

function safeEqual(a, b) {
    var ha = crypto.createHash('sha256').update(String(a)).digest();
    var hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// EIN EREIGNIS AUFSCHREIBEN.
//
// Bis hierher ging jede Erkenntnis ueber den Drucker nach console.log --
// also in die Netlify-Protokolle, die weder der Wirt noch sonst jemand im
// Betrieb je aufmacht. Der Grund war jedes Mal da und jedes Mal weg.
//
// restaurant_events gibt es seit Schritt 20; der Waechter liest die Tabelle
// ohnehin. Geschrieben wird mit dem Service-Schluessel, also an RLS vorbei --
// das ist hier richtig, die Meldung stammt vom Server, nicht vom Browser.
//
// STILL IM FEHLERFALL, ABER NIE STILL IM ERFOLGSFALL: klemmt das Schreiben,
// darf der Bon trotzdem rausgehen. Ein verlorenes Protokoll ist aergerlich,
// eine verlorene Bestellung kostet Geld.
async function ereignis(restaurantId, typ, text, orderId, nutzdaten) {
    if (!restaurantId) return;
    try {
        await fetch(SUPABASE_URL + '/rest/v1/restaurant_events', {
            method: 'POST',
            headers: Object.assign({}, svcHeaders(), { 'Prefer': 'return=minimal' }),
            body: JSON.stringify({
                restaurant_id: restaurantId,
                type: typ,
                message: String(text || '').slice(0, 500),
                order_id: orderId || null,
                payload: nutzdaten || null
            })
        });
    } catch (e) {
        console.warn('[pos-print] Ereignis nicht geschrieben:', e.message);
    }
}

function xmlEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Rueckmeldung des Druckers aus dem POST-Rumpf lesen.
//
// Der Epson schickt bei Server Direct Print etwas in dieser Art:
//
//   <PrintRequestInfo><ePOSPrint>
//     <Parameter><devid>local_printer</devid><printjobid>..</printjobid></Parameter>
//     <PrintResponse><response success="false" code="EPTR_COVER_OPEN" status="..."/></PrintResponse>
//   </ePOSPrint></PrintRequestInfo>
//
// Beim reinen Nachfragen fehlt der PrintResponse-Teil. Genau daran erkennen
// wir den Unterschied: kein success-Attribut = normale Anfrage.
//
// ABSICHTLICH per Textsuche und nicht mit einem XML-Parser: der Rumpf kommt
// von einem Geraet, dessen genaues Format je nach Firmware abweicht. Eine
// strenge Auswertung wuerde bei der kleinsten Abweichung nichts finden -- und
// dann staenden wir wieder ohne Grund da, so wie vorher.
function druckerMeldung(body, base64) {
    if (!body) return null;
    var text = String(body);
    if (base64) {
        try { text = Buffer.from(body, 'base64').toString('utf8'); } catch (e) { /* dann eben roh */ }
    }
    var m = text.match(/success\s*=\s*"([^"]*)"/i);
    if (!m) return null;
    var code = (text.match(/code\s*=\s*"([^"]*)"/i) || [])[1] || '';
    var status = (text.match(/status\s*=\s*"([^"]*)"/i) || [])[1] || '';
    return {
        erfolg: String(m[1]).toLowerCase() === 'true',
        code: code,
        status: status,
        // Fuers Log gekuerzt -- der Rumpf kann lang sein und enthaelt nichts,
        // was wir dauerhaft aufheben wollen.
        rumpf: text.slice(0, 400)
    };
}

// Die Fehlercodes des Druckers in Klartext. Ein "EPTR_REC_EMPTY" im Log hilft
// niemandem, der wissen will, warum kein Bon kommt.
var CODE_TEXT = {
    EPTR_AUTOMATICAL: 'Druckerfehler (Automatik) -- Drucker aus und wieder an',
    EPTR_COVER_OPEN: 'Die Papierklappe ist offen',
    EPTR_CUTTER: 'Das Messer klemmt -- Papier pruefen',
    EPTR_MECHANICAL: 'Mechanischer Fehler im Drucker',
    EPTR_REC_EMPTY: 'Kein Papier mehr',
    EPTR_UNRECOVERABLE: 'Schwerer Druckerfehler -- Neustart noetig',
    SchemaError: 'Der Drucker versteht unser XML nicht -- ein Feld passt ihm nicht',
    DeviceNotFound: 'Die Geraete-ID stimmt nicht (meist "local_printer")',
    PrintSystemError: 'Fehler im Drucksystem',
    EX_BADPORT: 'Kommunikationsfehler am Anschluss',
    EX_TIMEOUT: 'Zeitueberschreitung -- der Drucker hat zu lange gebraucht',
    JobNotFound: 'Der Druckauftrag war schon abgelaufen'
};
function codeKlartext(code) {
    return CODE_TEXT[code] || 'unbekannter Code -- bitte im Epson-Handbuch nachschlagen';
}

// DER EINFACHSTE BON, DEN ES GIBT.
//
// Absichtlich nackt: keine Schriftgroessen, keine Ausrichtung, kein QR,
// keine Umlaute. Nur Text und abschneiden. Alles, was der Epson ablehnen
// koennte, ist hier weggelassen.
//
// Kommt DIESER Zettel heraus, ist das Geraet in Ordnung -- Papier, Klappe,
// Netzwerk, Server Direct Print. Dann liegt es an unserem Bon-Inhalt.
// Kommt er NICHT heraus, brauchen wir im Code gar nicht weiterzusuchen.
function testBonEinfach() {
    return '<?xml version="1.0" encoding="utf-8"?>' +
           '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
           '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' +
           '<text>TEST&#10;</text>' +
           '<text>kiekmolin&#10;</text>' +
           '<feed unit="36"/><cut type="feed"/>' +
           '</epos-print></s:Body></s:Envelope>';
}

// Derselbe Bon wie im Betrieb -- mit allem, was darin vorkommt: doppelte
// und dreifache Schrift, Ausrichtung, Umlaute, Notiz, QR-Code fuer die
// Lieferadresse. Wer den vergleicht, findet die Stelle in einem Schritt.
function testBonEcht(restaurantName) {
    return generateEposBon({
        order_number: 'TEST-1',
        created_at: new Date().toISOString(),
        order_type: 'delivery',
        customer_name: 'Übungsbestellung Grün',
        customer_phone: '04921 000000',
        customer_notes: 'Das ist ein Testbon. Bitte nicht kochen.',
        delivery_address: { street: 'Musterstraße', house_number: '1', zip: '26721', city: 'Emden' },
        items: [
            { quantity: 2, name: 'Pizza Salami (groß)', options: 'extra Käse', notes: 'ohne Zwiebeln' },
            { quantity: 1, name: 'Apfelschorle 0,5' }
        ],
        payment_method: 'cash',
        total: 24.5
    }, restaurantName || 'Testdruck');
}

// Empty-Response damit der Drucker beim nächsten Poll wieder fragt.
function emptyEposResponse() {
    return '<?xml version="1.0" encoding="utf-8"?>' +
           '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
           '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/>' +
           '</s:Body></s:Envelope>';
}

// Bon-XML — identisches Format wie die bestehende generateEposXML im Frontend
// DER BON -- DREI LESER, DREI BEDUERFNISSE.
//
// Ibo am 13.09.2026: "der Bondruck muss besser sein fuer Lieferung und
// Abholer und fuer die Kueche."
//
// Bisher war es EIN Zettel fuer alle, in einer Reihenfolge, die keinem
// von ihnen half:
//
//   KUECHE      braucht: Gerichte, Extras, Notizen, und WANN es fertig
//               sein muss. Die Uhrzeit stand nirgends auf dem Bon --
//               obwohl der Gast per Mail "in 25 Minuten" bekommt.
//   FAHRER      braucht: Adresse und Telefon so gross, dass man sie im
//               dunklen Auto liest, und den Betrag, den er kassiert.
//               Die Adresse stand klein, in normaler Schrift, unter
//               "Adresse:".
//   THEKE       braucht: den NAMEN des Gastes. Der stand klein unter
//               "Kunde:" -- an der Theke ist er das Einzige, was zaehlt.
//
// Und der "Hinweis" des Gastes stand ganz unten, hinter Summe, Zahlart
// und QR-Code. Der Koch liest bis zum Ende des Gerichteblocks und hoert
// dann auf. Jetzt steht er direkt darunter.
//
// Aufbau ist jetzt fuer alle drei gleich, nur die Betonung wechselt:
//   Kopf (Name, Nummer, Zeit) -> ART + FERTIG UM -> FUER WEN ->
//   KUECHE -> Hinweis -> Geld -> Navigation
function generateEposBon(order, restaurantName) {
    var belegNr = order.order_number || ('B-' + (order.id || '').substring(0, 8).toUpperCase());
    var datum = new Date(order.created_at || Date.now());
    var zeit = datum.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    var date = datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });

    var lieferung = order.order_type === 'delivery';
    var vorOrt = order.order_type === 'dine_in';
    var orderTypeLabel = vorOrt ? 'HIER ESSEN' : lieferung ? 'LIEFERUNG' : 'ABHOLUNG';

    var LINIE = '================================';
    var xml = '<?xml version="1.0" encoding="utf-8"?>';
    xml += '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">';
    xml += '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">';
    // KEIN lang="de".
    //
    // Der Bon wurde vom Drucker abgeholt und nicht gedruckt -- ohne Fehler,
    // ohne Papier. Epson laesst bei lang nur bestimmte Werte zu:
    // en, ja, ko, zh-hans, zh-hant, th, vi, mul. "de" ist keiner davon.
    // Ein unzulaessiger Wert macht das ganze Dokument ungueltig, und der
    // Drucker verwirft es stillschweigend. Weil die Zeile in JEDEM Bon
    // stand, scheiterte auch jeder Bon.
    xml += '<text smooth="true"/>';

    function zeile(text, opt) {
        var o = opt || {};
        var a = ' align="' + (o.align || 'left') + '"';
        var b = o.fett ? ' em="true"' : '';
        var w = o.w ? ' width="' + o.w + '"' : '';
        var hh = o.h ? ' height="' + o.h + '"' : '';
        return '<text' + a + w + hh + b + '>' + xmlEscape(String(text)) + '&#10;</text>';
    }
    function leer() { return '<text>&#10;</text>'; }

    // DOPPELTE BREITE HEISST HALBE ZEILE.
    //
    // Die Rolle hat 32 Zeichen; bei width="2" sind es 16. "Restaurant Zur
    // Alten Muehle" oder "Familie Jansen-Ostermann" bricht darin mitten im
    // Wort um und sieht kaputt aus. Passt es nicht, bleibt die Breite bei 1
    // und nur die HOEHE wird verdoppelt -- dann steht es immer noch gross
    // da, aber in einer Zeile.
    function gross(text, align) {
        var t = String(text == null ? '' : text);
        return zeile(t, { align: align || 'center', w: t.length <= 16 ? 2 : 1, h: 2 });
    }

    // ---- 1. Kopf ------------------------------------------------------
    if (restaurantName) {
        xml += gross(restaurantName);
        xml += leer();
    }
    xml += gross(belegNr);
    xml += zeile(date + ' ' + zeit, { align: 'center' });
    xml += leer();

    // ---- 2. Art und WANN ----------------------------------------------
    xml += gross(orderTypeLabel);

    // DIE UHRZEIT IST DIE WICHTIGSTE ZAHL FUER DIE KUECHE.
    //
    // Der Gast bekommt per Mail "in etwa 25 Minuten -- also gegen 19:20
    // Uhr". Auf dem Bon stand diese Zusage bisher NICHT. Die Kueche
    // konnte also gar nicht wissen, worauf sie hinarbeitet, und der
    // Abholer stand vor einer Theke, an der niemand mit ihm rechnete.
    var fertigUm = '';
    if (order.estimated_time) {
        try {
            fertigUm = new Date(order.estimated_time)
                .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        } catch (e) { fertigUm = ''; }
    }
    var min = parseInt(order.estimated_minutes, 10);
    if (!fertigUm && min > 0) {
        try {
            fertigUm = new Date(datum.getTime() + min * 60000)
                .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        } catch (e) { fertigUm = ''; }
    }
    if (fertigUm) {
        // Beschriftung klein, Uhrzeit gross. In einer Zeile waere
        // "LOSFAHREN UM 20:00" 18 Zeichen -- in doppelter Breite passen
        // nur 16 auf die Rolle, es haette mitten im Wort umgebrochen.
        xml += zeile(lieferung ? 'LOSFAHREN UM' : 'FERTIG UM', { align: 'center' });
        xml += gross(fertigUm + ' Uhr');
        if (min > 0) xml += zeile('(zugesagt: ' + min + ' Minuten)', { align: 'center' });
    }

    // ---- 3. Vorbestellung ----------------------------------------------
    //
    // Der Bon faellt bei einer Vorbestellung erst dann aus dem Drucker,
    // wenn die Kueche wieder da ist -- er sieht dann aus wie jeder andere.
    // Ohne diesen Block faengt jemand sofort an zu kochen, obwohl das
    // Essen erst Stunden spaeter abgeholt wird.
    if (order.scheduled_at) {
        var wann = '';
        try {
            var sd = new Date(order.scheduled_at);
            wann = sd.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
                 + ' ' + sd.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) + ' Uhr';
        } catch (e) {}
        xml += leer();
        xml += zeile('********************************', { align: 'center' });
        xml += gross('VORBESTELLUNG');
        xml += zeile('NICHT JETZT KOCHEN', { align: 'center' });
        if (wann) xml += zeile(wann, { align: 'center', w: 1, h: 2 });
        xml += zeile('********************************', { align: 'center' });
    }

    // ---- 4. Fuer wen -- je nach Art das, was zaehlt ----------------------
    xml += leer();
    if (vorOrt) {
        if (order.table_number) xml += gross('Tisch ' + order.table_number);
    } else if (lieferung) {
        // Der Fahrer liest das im Dunkeln, im Auto, in Eile.
        var adr = order.delivery_address;
        var strasse = '', stadt = '';
        if (adr && typeof adr === 'object') {
            strasse = [adr.street, adr.house_number].filter(Boolean).join(' ');
            stadt = [adr.zip, adr.city].filter(Boolean).join(' ');
        } else if (typeof adr === 'string') {
            strasse = adr;
        }
        if (strasse) xml += zeile(strasse, { align: 'center', w: 1, h: 2, fett: true });
        if (stadt) xml += zeile(stadt, { align: 'center', w: 1, h: 2, fett: true });
        if (order.customer_name) xml += zeile(order.customer_name, { align: 'center' });
        if (order.customer_phone) xml += zeile('Tel ' + order.customer_phone, { align: 'center', w: 1, h: 2 });
    } else {
        // An der Theke zaehlt der Name. Er stand bisher klein ganz unten.
        if (order.customer_name) xml += gross(order.customer_name);
        if (order.customer_phone) xml += zeile('Tel ' + order.customer_phone, { align: 'center' });
    }

    // ---- 5. Die Kueche ---------------------------------------------------
    xml += leer();
    xml += zeile(LINIE);
    var items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) {
        // Eine leere Liste ist keine Antwort. Ohne diese Zeile faende die
        // Kueche einen Bon ohne Gerichte und wuesste nicht, ob nichts
        // bestellt wurde oder etwas verlorenging.
        xml += zeile('!! KEINE POSITIONEN !!', { align: 'center', w: 1, h: 2 });
        xml += zeile('Bitte im Dashboard nachsehen', { align: 'center' });
    }
    items.forEach(function (item) {
        var qty = item.quantity || 1;
        xml += zeile(qty + 'x ' + (item.name || ''), { w: 1, h: 2 });
        if (item.options) xml += zeile('  > ' + item.options);
        // DIE NOTIZ ZUM GERICHT MUSS AUF DEN BON.
        //
        // Doppelte Hoehe wie der Gerichtname: eine Sonderbestellung, die
        // man ueberliest, ist dasselbe wie keine.
        if (item.notes) xml += zeile('  ** ' + item.notes, { w: 1, h: 2 });
    });
    xml += zeile(LINIE);

    // ---- 6. Hinweis -- direkt hinter den Gerichten -----------------------
    //
    // Stand bisher ganz unten, hinter Summe, Zahlart und QR-Code. Der Koch
    // liest bis zum Ende des Gerichteblocks und hoert dann auf.
    var hinweis = order.customer_notes || order.delivery_notes || '';
    if (hinweis) {
        xml += leer();
        xml += zeile('HINWEIS', { w: 1, h: 2 });
        xml += zeile(hinweis, { w: 1, h: 2 });
    }

    // ---- 7. Das Geld -----------------------------------------------------
    xml += leer();
    var total = parseFloat(order.total || 0).toFixed(2).replace('.', ',');
    var art = String(order.payment_method || '').toLowerCase();
    var bezahlt = String(order.payment_status || '').toLowerCase() === 'paid';

    if (bezahlt) {
        // Seit PayPal Checkout gibt es einen echten Beleg: das Geld ist
        // abgebucht und geprueft. Dann muss auf dem Bon BEZAHLT stehen und
        // nicht "pruefen" -- sonst kassiert jemand ein zweites Mal.
        xml += zeile(total + ' EUR', { align: 'right', w: 3, h: 3 });
        xml += gross('BEZAHLT');
        xml += zeile('nichts kassieren', { align: 'center' });
    } else if (art === 'cash') {
        // Der Fahrer und die Theke muessen EINE Zahl sehen: was kassiert
        // wird. Bisher stand die Summe an einer Stelle und "BAR" an einer
        // anderen.
        xml += gross('BAR KASSIEREN');
        xml += zeile(total + ' EUR', { align: 'right', w: 3, h: 3 });
    } else if (art === 'paypal') {
        // PAYPAL ohne bestaetigte Zahlung ist keine Zahlungsbestaetigung.
        // Ein Bezahllink meldet uns nie, ob der Gast bezahlt hat.
        xml += zeile(total + ' EUR', { align: 'right', w: 3, h: 3 });
        xml += gross('PAYPAL - ZAHLUNG PRUEFEN');
    } else if (art) {
        xml += zeile(total + ' EUR', { align: 'right', w: 3, h: 3 });
        xml += gross(String(order.payment_method).toUpperCase());
    } else {
        xml += zeile(total + ' EUR', { align: 'right', w: 3, h: 3 });
        xml += zeile('GESAMT', { align: 'right' });
    }

    // ---- 8. Navigation, nur fuer den Fahrer ------------------------------
    if (lieferung) {
        var _qAddr = '';
        if (order.delivery_address && typeof order.delivery_address === 'object') {
            var _da = order.delivery_address;
            _qAddr = [[_da.street, _da.house_number].filter(Boolean).join(' '),
                      [_da.zip, _da.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        } else if (typeof order.delivery_address === 'string') {
            _qAddr = order.delivery_address;
        }
        if (_qAddr) {
            var _mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(_qAddr);
            xml += leer();
            xml += '<symbol type="qrcode_model_2" level="level_m" width="6" height="6" size="0">' + xmlEscape(_mapsUrl) + '</symbol>';
            xml += zeile('QR scannen = Navigation', { align: 'center' });
            xml += '<text align="left"/>';
        }
    }

    xml += '<feed unit="30"/>';
    xml += zeile('--- Vielen Dank! ---', { align: 'center' });
    xml += zeile('kiekmolin.de', { align: 'center' });
    xml += '<feed unit="36"/><cut type="feed"/>';
    xml += '</epos-print></s:Body></s:Envelope>';
    return xml;
}

function xmlResponse(body, status) {
    return {
        statusCode: status || 200,
        headers: Object.assign({}, CORS_HEADERS, { 'Content-Type': 'text/xml; charset=utf-8' }),
        body: body
    };
}

function jsonResponse(status, obj) {
    return {
        statusCode: status,
        headers: Object.assign({}, CORS_HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(obj)
    };
}

// Login-Token validieren (für Reprint-Aktion vom Dashboard)
async function authedRestaurantIds(token) {
    if (!token) return null;
    var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return null;
    var user = await res.json();
    if (!user || !user.email) return null;
    var rows = await sbGet('customers?email=eq.' + encodeURIComponent(user.email) +
        '&is_active=eq.true&select=restaurant_id');
    return (rows || []).map(function (r) { return r.restaurant_id; }).filter(Boolean);
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    var q = event.queryStringParameters || {};

    try {
        // ---- Reprint-Aktion (vom Dashboard) ----
        if (q.action === 'reprint') {
            var auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
            var token = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
            var allowedIds = await authedRestaurantIds(token);
            if (!allowedIds) return jsonResponse(401, { ok: false, error: 'Nicht eingeloggt.' });

            var orderId = q.order;
            if (!orderId) return jsonResponse(400, { ok: false, error: 'Order-ID fehlt.' });

            // Restaurant der Bestellung prüfen
            var orderRows = await sbGet('orders?id=eq.' + encodeURIComponent(orderId) +
                '&select=id,restaurant_id');
            if (!orderRows.length) return jsonResponse(404, { ok: false, error: 'Bestellung nicht gefunden.' });
            if (allowedIds.indexOf(orderRows[0].restaurant_id) === -1) {
                return jsonResponse(403, { ok: false, error: 'Kein Zugriff auf diese Bestellung.' });
            }

            await sbPatch('orders?id=eq.' + encodeURIComponent(orderId), { printed_at: null });
            return jsonResponse(200, { ok: true, message: 'Bon wird beim naechsten Poll erneut gedruckt.' });
        }

        // ---- Druck-Abruf vom Drucker ----
        var restaurant = q.restaurant;
        var key = q.key || (event.headers && (event.headers['x-api-key'] || event.headers['X-API-Key']));
        if (!restaurant || !key) {
            // Empty für den Drucker (keine 4xx -> Drucker meldet sonst Fehler)
            return xmlResponse(emptyEposResponse());
        }

        // ---- Rueckmeldung des Druckers ----
        //
        // WARUM DAS HIER STEHT.
        // Der Bon kam nicht heraus, obwohl die Ampel gruen war und die
        // Bestellungen als gedruckt markiert wurden. Der Grund war nicht zu
        // finden, weil wir dem Drucker nie zugehoert haben.
        //
        // Bei Server Direct Print schickt der Epson NACH jedem Auftrag eine
        // Rueckmeldung an dieselbe URL -- ob er drucken konnte, und wenn nicht,
        // mit welchem Fehlercode. Diese Rueckmeldung sah fuer uns aus wie eine
        // ganz normale Anfrage. Wir haben also
        //   1. den Grund weggeworfen, den der Drucker uns direkt genannt hat,
        //   2. ihm auf seine Erfolgsmeldung hin gleich die naechste Bestellung
        //      geschickt -- die damit als gedruckt galt, ohne je gedruckt zu
        //      werden. So wurden zwei Bestellungen still "verbraucht".
        //
        // Hier wird die Rueckmeldung erkannt, protokolliert und beantwortet,
        // ohne dass eine Bestellung dafuer draufgeht.
        var meldung = druckerMeldung(event.body, event.isBase64Encoded);
        if (meldung) {
            console.log('[pos-print] Rueckmeldung vom Drucker'
                + ' restaurant=' + restaurant
                + ' erfolg=' + meldung.erfolg
                + ' code=' + (meldung.code || '-')
                + ' status=' + (meldung.status || '-'));
            if (!meldung.erfolg) {
                console.warn('[pos-print] DRUCK FEHLGESCHLAGEN -- Code "' + (meldung.code || 'ohne Code')
                    + '": ' + codeKlartext(meldung.code));
            }
            // DAS IST DER SATZ, DER BISHER GEFEHLT HAT.
            //
            // Am 06.09.2026 gemessen: Bestellung um 16:56 rein, Bon Sekunden
            // spaeter vom Drucker abgeholt, als gedruckt markiert -- und kein
            // Zettel. Der Drucker hat uns in derselben Sekunde gesagt warum,
            // und wir haben es nach console.log geworfen.
            //
            // Auch der ERFOLG wird aufgeschrieben. Ohne ihn waere "keine
            // Meldung" wieder zweideutig: nichts gedruckt, oder alles gut?
            await ereignis(restaurant,
                meldung.erfolg ? 'printer_ok' : 'printer_failed',
                meldung.erfolg
                    ? 'Der Drucker meldet: Bon gedruckt.'
                    : 'Der Drucker konnte NICHT drucken — ' + codeKlartext(meldung.code)
                      + ' (Code ' + (meldung.code || 'ohne Code') + ').',
                null,
                { code: meldung.code || null, status: meldung.status || null, rumpf: meldung.rumpf });
            // BEWUSST ohne Bestellung antworten. Ein fehlgeschlagener Auftrag
            // wird NICHT von selbst wiederholt: der Drucker wuerde ihn erneut
            // ablehnen, wir wuerden ihn erneut schicken, und das ginge endlos
            // weiter. Der Wirt entscheidet ueber den Knopf "Bon", ob nochmal.
            return xmlResponse(emptyEposResponse());
        }

        // Restaurant + pull_key validieren
        var rrows = await sbGet('restaurants?id=eq.' + encodeURIComponent(restaurant) +
            '&select=id,name,pos_pull_key,printer_last_error_at,printer_test_art');

        // EIN ABGEWIESENER DRUCKER MUSS SICH MELDEN DUERFEN.
        //
        // Gemessen am 06.09.2026: zwei Drucker fragen seit Stunden an --
        // 1.437 und 342 Mal -- und kommen kein einziges Mal an dieser Stelle
        // vorbei. Sie melden trotzdem "verbunden", weil eine leere Antwort
        // fuer sie dasselbe ist wie "gerade nichts zu drucken".
        //
        // Hoechstens eine Meldung pro Stunde. Sonst staenden hier 1.437
        // gleiche Zeilen am Tag -- und am 27.08. hat uns genau diese Art
        // Wiederholung 96 E-Mails in einer Nacht eingebracht.
        var abweisung = null;
        if (!rrows.length) abweisung = 'Ein Drucker fragt fuer ein Restaurant an, das es nicht gibt.';
        else if (!rrows[0].pos_pull_key) abweisung = 'Ein Drucker fragt an, aber fuer dieses Restaurant ist gar kein Drucker-Schluessel hinterlegt. Es kann kein Bon kommen.';
        else if (!safeEqual(key, rrows[0].pos_pull_key)) abweisung = 'Ein Drucker fragt mit einem FALSCHEN Schluessel an. Er meldet sich als verbunden, bekommt aber nie einen Bon. Schluessel im Drucker mit dem im Dashboard vergleichen.';

        if (abweisung) {
            var zuletzt = rrows.length ? rrows[0].printer_last_error_at : null;
            var langGenugHer = !zuletzt || (Date.now() - new Date(zuletzt).getTime()) > 60 * 60 * 1000;
            if (rrows.length && langGenugHer) {
                await ereignis(restaurant, 'printer_rejected', abweisung, null, { schluessel_laenge: String(key).length });
                sbPatch('restaurants?id=eq.' + encodeURIComponent(restaurant), {
                    printer_last_error_at: new Date().toISOString()
                }).catch(function (e) { console.warn('[pos-print] printer_last_error_at:', e.message); });
            }
            return xmlResponse(emptyEposResponse());
        }

        // HAT DER WIRT EINEN TESTBON ANGEFORDERT?
        //
        // Steht vor der Bestellsuche: ein Test darf niemals eine echte
        // Bestellung verbrauchen -- die waere danach als gedruckt markiert
        // und der Gast bekaeme sein Essen nie.
        if (rrows[0].printer_test_art) {
            var testArt = String(rrows[0].printer_test_art);

            // ERST LOESCHEN, DANN DRUCKEN. Bliebe die Anforderung stehen,
            // holte der Drucker sie alle paar Sekunden erneut ab und waere
            // in einer Viertelstunde durch die ganze Rolle. Deshalb wird
            // hier auch gewartet -- und bei einem Fehler NICHT gedruckt.
            try {
                await sbPatch('restaurants?id=eq.' + encodeURIComponent(restaurant), { printer_test_art: null });
            } catch (e) {
                console.warn('[pos-print] Testbon-Anforderung nicht geloescht, darum nicht gedruckt:', e.message);
                return xmlResponse(emptyEposResponse());
            }

            await ereignis(restaurant, 'printer_test_sent',
                'Testbon (' + (testArt === 'einfach' ? 'einfach' : 'echt') + ') an den Drucker übergeben. '
                + 'Kommt jetzt kein Zettel, liegt es am Gerät und nicht an den Daten.',
                null, { art: testArt });

            return xmlResponse(testArt === 'einfach' ? testBonEinfach() : testBonEcht(rrows[0].name));
        }

        // Älteste ungedruckte Bestellung (letzte 24h, nicht storniert)
        var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        var basis = 'orders?restaurant_id=eq.' + encodeURIComponent(restaurant) +
            '&printed_at=is.null' +
            '&created_at=gte.' + encodeURIComponent(since) +
            '&status=not.in.(cancelled,canceled,rejected)' +
            '&order=created_at.asc&limit=1' +
            '&select=id,order_number,status,order_type,created_at,table_number,' +
                    'customer_name,customer_phone,customer_notes,delivery_address,delivery_notes,' +
                    'items,total';

        // DIE SPALTEN, OHNE DIE DER BON HALB BLIND IST.
        //
        // Am 13.09.2026 nachgesehen: payment_method stand GAR NICHT im
        // select. Der ganze sorgfaeltig gebaute Zahlart-Block im Bon --
        // "BAR", "PAYPAL - ZAHLUNG PRUEFEN" -- war toter Code. Auf dem
        // Papier stand nie ein Wort zur Zahlung. Genau die Sorte stiller
        // Ausfall: der Bon sieht vollstaendig aus, ihm fehlt nur alles,
        // was niemand vermisst, weil es noch nie da war.
        //
        // Diese Spalten gibt es je nach Datenbank noch nicht, und EINE
        // unbekannte Spalte laesst PostgREST die GANZE Abfrage mit 400
        // scheitern -- dann kaeme kein Bon mehr. Aus einem Zusatz waere
        // ein Totalausfall geworden. Also: PostgREST nennt im Fehler die
        // Spalte, die es nicht gibt. Die fliegt raus, der Rest bleibt.
        var zusatz = ['scheduled_at', 'payment_method', 'payment_status',
                      'estimated_minutes', 'estimated_time'];
        var orders = null;
        for (var vers = 0; vers < zusatz.length + 1; vers++) {
            try {
                orders = await sbGet(basis + (zusatz.length ? ',' + zusatz.join(',') : ''));
                break;
            } catch (e) {
                var fehlt = null;
                for (var z = 0; z < zusatz.length; z++) {
                    if (String(e.message).indexOf(zusatz[z]) >= 0) { fehlt = zusatz[z]; break; }
                }
                if (fehlt) {
                    console.warn('[pos-print] Spalte ' + fehlt + ' fehlt, Bon wird ohne sie gedruckt.');
                    zusatz.splice(zusatz.indexOf(fehlt), 1);
                    continue;
                }
                console.warn('[pos-print] Zusatzspalten nicht abfragbar, drucke mit dem Noetigsten:', e.message);
                orders = await sbGet(basis);
                break;
            }
        }
        // Nach allen Versuchen immer noch nichts: lieber kein Bon als ein
        // Absturz. Der Drucker bekommt eine leere Antwort und fragt in ein
        // paar Sekunden wieder -- er tut das ohnehin 17 Mal pro Minute.
        if (orders === null) {
            console.error('[pos-print] Bestellungen nicht lesbar -- kein Bon in diesem Durchlauf.');
            return xmlResponse(emptyEposResponse());
        }

        // Last-Poll-Tracker: bei jedem Abruf vom Drucker den Zeitstempel
        // updaten. Dashboard kann darauf einen 'Drucker online'-Indikator
        // bauen. Fire-and-forget -- sollte die XML-Auslieferung nicht blockieren.
        sbPatch('restaurants?id=eq.' + encodeURIComponent(restaurant), {
            printer_last_poll_at: new Date().toISOString()
        }).catch(function(e) {
            console.warn('[pos-print] printer_last_poll_at update fehlgeschlagen:', e.message);
        });

        if (!orders.length) {
            return xmlResponse(emptyEposResponse());
        }

        var order = orders[0];
        var xml = generateEposBon(order, rrows[0].name);

        // Sofort als gedruckt markieren (in v1 vertrauen wir dem Drucker).
        // Bei Druckfehler kann der Gastronom im Dashboard "Nachdrucken" klicken.
        try {
            await sbPatch('orders?id=eq.' + encodeURIComponent(order.id), {
                printed_at: new Date().toISOString()
            });
        } catch (e) {
            console.warn('[pos-print] printed_at konnte nicht gesetzt werden:', e.message);
        }

        return xmlResponse(xml);
    } catch (err) {
        console.error('[pos-print] error:', err && err.stack ? err.stack : err);
        // Drucker erwartet IMMER eine XML-Antwort, sonst Fehler-LED
        return xmlResponse(emptyEposResponse(), 200);
    }
};
