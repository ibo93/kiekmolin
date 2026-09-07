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

// Empty-Response damit der Drucker beim nächsten Poll wieder fragt.
function emptyEposResponse() {
    return '<?xml version="1.0" encoding="utf-8"?>' +
           '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
           '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"/>' +
           '</s:Body></s:Envelope>';
}

// Bon-XML — identisches Format wie die bestehende generateEposXML im Frontend
function generateEposBon(order, restaurantName) {
    var belegNr = order.order_number || ('B-' + (order.id || '').substring(0, 8).toUpperCase());
    var datum = new Date(order.created_at || Date.now());
    var zeit = datum.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    var date = datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    var orderTypeLabel = order.order_type === 'dine_in' ? 'HIER ESSEN'
        : order.order_type === 'delivery' ? 'LIEFERUNG' : 'ABHOLUNG';

    var xml = '<?xml version="1.0" encoding="utf-8"?>';
    xml += '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">';
    xml += '<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">';
    // KEIN lang="de".
    //
    // Der Bon wurde vom Drucker abgeholt und nicht gedruckt -- ohne Fehler,
    // ohne Papier. Epson laesst bei lang nur bestimmte Werte zu:
    // en, ja, ko, zh-hans, zh-hant, th, vi, mul. "de" ist keiner davon.
    // Ein unzulaessiger Wert macht das ganze Dokument ungueltig, und der
    // Drucker verwirft es stillschweigend. Weil die Zeile in JEDEM Bon stand,
    // scheiterte auch jeder Bon.
    //
    // Weggelassen statt auf "en" gesetzt: ohne Angabe nimmt der Drucker seine
    // Voreinstellung, und die passt fuer deutsche Texte in Latin-Schrift. Ein
    // gesetztes "en" wuerde dasselbe tun, aber so behauptet der Bon nicht,
    // englisch zu sein. Umlaute haengen nicht daran, sondern an der
    // Zeichentabelle des Druckers.
    xml += '<text smooth="true"/>';

    // Restaurant-Header groß — wichtig für Läden ohne separate Kasse,
    // weil der Bon dann das primäre Beleg-Dokument ist.
    if (restaurantName) {
        xml += '<text align="center" width="2" height="2">' + xmlEscape(restaurantName) + '&#10;</text>';
        xml += '<text>&#10;</text>';
    }

    xml += '<text align="center" font="font_a" width="2" height="2">' + xmlEscape(belegNr) + '&#10;</text>';
    xml += '<text align="center">' + date + ' ' + zeit + '&#10;&#10;</text>';
    xml += '<text align="center" width="2" height="2">' + orderTypeLabel + '&#10;</text>';

    // VORBESTELLUNG ganz gross und ganz oben.
    //
    // Der Bon faellt bei einer Vorbestellung erst dann aus dem Drucker, wenn
    // die Kueche wieder da ist -- er sieht dann aus wie jeder andere. Ohne
    // diesen Block faengt jemand sofort an zu kochen, obwohl das Essen erst
    // Stunden spaeter abgeholt wird. Der Zeitpunkt ist hier die wichtigste
    // Angabe auf dem ganzen Zettel.
    if (order.scheduled_at) {
        var wann = '';
        try {
            var sd = new Date(order.scheduled_at);
            wann = sd.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })
                 + ' ' + sd.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
        } catch (e) {}
        xml += '<text>&#10;</text>';
        xml += '<text align="center">********************************&#10;</text>';
        xml += '<text align="center" width="2" height="2">VORBESTELLUNG&#10;</text>';
        if (wann) xml += '<text align="center" width="1" height="2">' + xmlEscape(wann) + '&#10;</text>';
        xml += '<text align="center">********************************&#10;</text>';
    }

    if (order.table_number) {
        xml += '<text align="center" width="2" height="2">Tisch ' + xmlEscape(order.table_number) + '&#10;</text>';
    }

    xml += '<text>&#10;</text><text>================================&#10;</text>';

    var items = Array.isArray(order.items) ? order.items : [];
    items.forEach(function (item) {
        var qty = item.quantity || 1;
        var name = item.name || '';
        // Items in doppelter Höhe — besser lesbar in der Küche
        xml += '<text width="1" height="2">' + xmlEscape(qty + 'x ' + name) + '&#10;</text>';
        if (item.options) xml += '<text>  &gt; ' + xmlEscape(item.options) + '&#10;</text>';
        // DIE NOTIZ ZUM GERICHT MUSS AUF DEN BON.
        //
        // Sie wurde gespeichert und im Dashboard angezeigt, aber hier fehlte
        // sie. In index.html steht beim Speichern sogar der Satz "notes MUSS
        // mit. Ohne diese Zeile schreibt der Gast 'ohne Zwiebeln' und die
        // Küche erfährt es nie" -- die Korrektur ging nur bis zum Bildschirm.
        // Der Koch arbeitet aber vom Zettel, nicht vom Bildschirm.
        //
        // Doppelte Höhe wie der Gerichtname: eine Sonderbestellung, die man
        // überliest, ist dasselbe wie keine. Der Pfeil davor unterscheidet
        // sie von den Extras darüber.
        if (item.notes) {
            xml += '<text width="1" height="2">' + xmlEscape('  ** ' + item.notes) + '&#10;</text>';
        }
    });

    xml += '<text>================================&#10;</text>';
    xml += '<text>&#10;</text>';

    // Total — extra groß (3x), damit's nicht zu übersehen ist
    var total = parseFloat(order.total || 0).toFixed(2).replace('.', ',');
    xml += '<text align="right" width="3" height="3">' + total + ' EUR&#10;</text>';
    xml += '<text align="right">GESAMT&#10;</text>';
    xml += '<text>&#10;</text>';

    // Zahlart prominent
    if (order.payment_method) {
        var pm = order.payment_method === 'cash' ? 'BAR' : String(order.payment_method).toUpperCase();
        xml += '<text align="center" width="2" height="2">' + xmlEscape(pm) + '&#10;</text>';
        xml += '<text>&#10;</text>';
    }

    if (order.customer_name) xml += '<text>Kunde:   ' + xmlEscape(order.customer_name) + '&#10;</text>';
    if (order.customer_phone) xml += '<text>Telefon: ' + xmlEscape(order.customer_phone) + '&#10;</text>';
    if (order.delivery_address && typeof order.delivery_address === 'object') {
        var addr = order.delivery_address;
        var addrLine = [addr.street, addr.house_number].filter(Boolean).join(' ');
        var cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
        if (addrLine) xml += '<text>Adresse: ' + xmlEscape(addrLine) + '&#10;</text>';
        if (cityLine) xml += '<text>         ' + xmlEscape(cityLine) + '&#10;</text>';
    }
    // Bei Lieferung: QR-Code der Adresse -> Fahrer scannt = Google-Maps-Navigation
    if (order.order_type === 'delivery') {
        var _qAddr = '';
        if (order.delivery_address && typeof order.delivery_address === 'object') {
            var _da = order.delivery_address;
            _qAddr = [[_da.street, _da.house_number].filter(Boolean).join(' '), [_da.zip, _da.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        } else if (typeof order.delivery_address === 'string') {
            _qAddr = order.delivery_address;
        }
        if (_qAddr) {
            var _mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(_qAddr);
            xml += '<text>&#10;</text>';
            xml += '<text align="center">Navigation zur Lieferadresse:&#10;</text>';
            xml += '<symbol type="qrcode_model_2" level="level_m" width="6" height="6" size="0">' + xmlEscape(_mapsUrl) + '</symbol>';
            xml += '<text>&#10;</text>';
            xml += '<text align="center">QR scannen = Navigation&#10;</text>';
            xml += '<text align="left"/>';
        }
    }
    if (order.customer_notes || order.delivery_notes) {
        xml += '<text>&#10;</text>';
        xml += '<text width="1" height="2">Hinweis:&#10;</text>';
        xml += '<text width="1" height="2">' + xmlEscape(order.customer_notes || order.delivery_notes) + '&#10;</text>';
    }

    xml += '<feed unit="30"/>';
    xml += '<text align="center">--- Vielen Dank! ---&#10;</text>';
    xml += '<text align="center">kiekmolin.de&#10;</text>';
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
            '&select=id,name,pos_pull_key,printer_last_error_at');

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

        // scheduled_at muss mit -- ohne das Feld weiss der Bon nicht, dass es
        // eine Vorbestellung ist, und die Kueche faengt sofort an.
        //
        // ABER: die Spalte gibt es je nach Datenbank noch nicht, und eine
        // unbekannte Spalte im select laesst PostgREST die GANZE Abfrage mit
        // 400 scheitern. Dann kaeme gar kein Bon mehr -- aus einem Zusatz
        // waere ein Totalausfall geworden. Also erst mit, bei Fehler ohne.
        var orders;
        try {
            orders = await sbGet(basis + ',scheduled_at');
        } catch (e) {
            console.warn('[pos-print] scheduled_at nicht abfragbar, drucke ohne Vorbestell-Hinweis:', e.message);
            orders = await sbGet(basis);
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
