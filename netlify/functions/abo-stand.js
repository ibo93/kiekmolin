// WER HAT BEZAHLT? -- die Antwort kommt von Stripe, nicht aus einem Feld.
//
// DER BEFUND VOM 25.09.2026
// =========================
// In customers steht eine Spalte payment_status. Sie wird an acht Stellen
// GELESEN -- Kundenliste, drei Zaehler auf dem Dashboard, Umsatz. Und sie
// wird gesetzt:
//
//     'pending'  wenn ein Kunde angelegt wird
//     'paid'     wenn Ibo von Hand "Zahlung erfasst" drueckt
//     'overdue'  NIRGENDS. Von niemandem.
//
// Die Spalte next_payment_date wird einmal geschrieben und nie wieder
// gelesen. Der stripe-webhook schrieb nur stripe_status und hoerte gar
// nicht auf fehlgeschlagene Zahlungen.
//
// Folge: der Zaehler "Ueberfaellig" stand auf 0 -- immer. Und ein Kunde,
// der im Juni einmal als bezahlt eingetragen wurde, stand im September
// noch auf gruen. Ein gruener Haken sieht aus wie eine Antwort (Regel 6).
//
// Ibo dazu: "stripe ist besser so komme ich auch rein dann laeuft es auf
// eine ebene".
//
// WARUM HOLEN UND NICHT NUR ZUHOEREN
// ==================================
// Der Webhook ist der schnelle Weg, aber ich kann von hier aus NICHT
// nachsehen, ob er im Stripe-Fenster ueberhaupt eingerichtet ist -- weder
// die Netlify-Variablen noch kiekmolin.de sind von hier erreichbar
// (gemessen: beides gesperrt). Ein Bildschirm, der auf einem Webhook
// steht, den niemand geprueft hat, waere wieder derselbe stille Ausfall,
// nur eine Etage hoeher.
//
// Deshalb FRAGT diese Function bei Stripe nach, wenn Ibo sie aufruft.
// Was sie zurueckgibt, hat sie gerade gesehen. Sie schreibt den Stand
// nebenbei nach Supabase, damit die Liste beim naechsten Laden schon
// stimmt -- aber angezeigt wird, was gemessen wurde, mit Uhrzeit.
//
// NIE RATEN
// =========
// Kein Abo hinterlegt -> 'kein_abo'. Stripe nicht erreichbar ->
// 'unbekannt' mit Grund. Beides ist eine ehrliche Antwort. 'bezahlt' ist
// es nur, wenn Stripe das sagt.
//
// ENV: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

'use strict';

var Stripe = require('stripe');
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
// DIE UEBERSETZUNG. Stripe kennt acht Abo-Zustaende; Ibo muss eine
// Entscheidung treffen. Das hier ist die einzige Stelle, an der aus dem
// einen das andere wird.
//
// DER WICHTIGE SONDERFALL: "active" heisst NICHT bezahlt.
// Bei Rechnung statt Lastschrift (collection_method: send_invoice) bleibt
// das Abo auf "active", waehrend die Rechnung offen daliegt -- bis das
// Faelligkeitsdatum verstreicht, erst dann springt Stripe auf past_due.
// Wer nur auf den Abo-Zustand schaut, sieht genau in dem Zeitraum gruen,
// in dem das Geld fehlt. Deshalb zaehlt hier IMMER auch die letzte
// Rechnung.
// ---------------------------------------------------------------------
var STAENDE = ['bezahlt', 'testphase', 'offen', 'ueberfaellig', 'pausiert',
               'gekuendigt', 'kein_abo', 'unbekannt'];

function standAus(abo) {
    if (!abo) return { stand: 'unbekannt', grund: 'kein Abo gefunden' };

    var s = String(abo.status || '').toLowerCase();
    var rg = abo.latest_invoice && typeof abo.latest_invoice === 'object' ? abo.latest_invoice : null;
    var rStatus = rg ? String(rg.status || '').toLowerCase() : '';

    if (abo.pause_collection) return { stand: 'pausiert', grund: 'bei Stripe pausiert' };

    if (s === 'canceled' || s === 'incomplete_expired') {
        return { stand: 'gekuendigt', grund: s === 'canceled' ? 'gekuendigt' : 'Einrichtung verfallen' };
    }
    if (s === 'past_due')   return { stand: 'ueberfaellig', grund: 'Zahlung fehlgeschlagen' };
    if (s === 'unpaid')     return { stand: 'ueberfaellig', grund: 'Stripe hat die Einzuege aufgegeben' };
    if (s === 'incomplete') return { stand: 'offen', grund: 'erste Zahlung nie abgeschlossen' };
    if (s === 'paused')     return { stand: 'pausiert', grund: 'pausiert' };

    if (s === 'trialing') {
        return { stand: 'testphase', grund: 'Testphase' };
    }
    if (s === 'active') {
        // Hier steckt der Sonderfall von oben.
        if (rStatus === 'open')            return { stand: 'offen', grund: 'Rechnung gestellt, noch nicht bezahlt' };
        if (rStatus === 'uncollectible')   return { stand: 'ueberfaellig', grund: 'Stripe haelt sie fuer uneinbringlich' };
        if (rStatus === 'draft')           return { stand: 'offen', grund: 'Rechnung noch im Entwurf' };
        if (rStatus === 'paid' || !rg)     return { stand: 'bezahlt', grund: '' };
        return { stand: 'offen', grund: 'Rechnung steht auf ' + rStatus };
    }
    return { stand: 'unbekannt', grund: 'Stripe meldet "' + s + '"' };
}

// Seit wann ist es offen? Aus der Rechnung, nicht aus dem Abo -- das Abo
// hat kein Faelligkeitsdatum.
function offenSeitTagen(abo) {
    var rg = abo && abo.latest_invoice && typeof abo.latest_invoice === 'object' ? abo.latest_invoice : null;
    if (!rg) return null;
    var faellig = rg.due_date || rg.period_end || rg.created;
    if (!faellig) return null;
    var tage = Math.floor((Date.now() / 1000 - faellig) / 86400);
    return tage > 0 ? tage : 0;
}

function euro(cent) {
    return (cent == null) ? null : Math.round(Number(cent)) / 100;
}

// ---------------------------------------------------------------------
async function kundenHolen() {
    var res = await fetch(SUPABASE_URL + '/rest/v1/customers'
        + '?select=id,name,email,restaurant_id,payment_status,stripe_customer_id,stripe_subscription_id,stripe_status'
        + '&role=neq.superadmin&order=name', { headers: kopf() });
    if (!res.ok) throw new Error('customers ' + res.status);
    return await res.json();
}

// Zurueckschreiben. Fehler hier duerfen die Antwort NICHT kippen: der
// gemessene Stand ist auch dann richtig, wenn das Merken misslingt.
async function merken(id, felder) {
    try {
        var res = await fetch(SUPABASE_URL + '/rest/v1/customers?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: Object.assign({}, kopf(), { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify(felder)
        });
        if (!res.ok) {
            var t = ''; try { t = await res.text(); } catch (e) {}
            console.warn('[abo-stand] merken fehlgeschlagen ' + res.status + ' ' + t.slice(0, 160));
            return false;
        }
        return true;
    } catch (e) {
        console.warn('[abo-stand] merken: ' + (e && e.message));
        return false;
    }
}

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, fehler: 'Nur POST' });
    if (!KEY) return json(500, { ok: false, fehler: 'Server nicht eingerichtet (SUPABASE_SERVICE_KEY fehlt).' });

    if (!(await VERWALTER.darfVerwalten(event, KEY))) {
        return json(403, { ok: false, fehler: 'Nur der Verwalter darf das.' });
    }

    var geheim = process.env.STRIPE_SECRET_KEY || '';
    var kunden;
    try { kunden = await kundenHolen(); }
    catch (e) { return json(502, { ok: false, fehler: 'Kundenliste nicht lesbar: ' + e.message }); }

    // OHNE STRIPE-SCHLUESSEL keine erfundene Antwort. Die Liste kommt
    // trotzdem -- mit 'unbekannt' bei jedem, der ein Abo hat. Das ist der
    // Unterschied zwischen "weiss ich nicht" und "alles gut".
    if (!geheim) {
        return json(200, {
            ok: true,
            gemessen_am: new Date().toISOString(),
            stripe_erreichbar: false,
            hinweis: 'STRIPE_SECRET_KEY ist in Netlify nicht gesetzt. Ohne ihn kann niemand sagen, wer bezahlt hat.',
            kunden: kunden.map(function (k) {
                return {
                    id: k.id, name: k.name, restaurant_id: k.restaurant_id,
                    stand: k.stripe_subscription_id ? 'unbekannt' : 'kein_abo',
                    grund: k.stripe_subscription_id ? 'Stripe-Schluessel fehlt' : 'kein Stripe-Abo hinterlegt',
                    offen_seit_tagen: null, betrag: null, faellig_am: null, rechnung_url: null
                };
            })
        });
    }

    var stripe = Stripe(geheim);

    // EIN Aufruf statt einer je Kunde. Bei 25 Betrieben sind das 25
    // gesparte Runden -- und Stripe begrenzt die Aufrufe.
    var abos = {};
    var stripeFehler = '';
    try {
        var liste = await stripe.subscriptions.list({
            status: 'all', limit: 100, expand: ['data.latest_invoice']
        });
        (liste.data || []).forEach(function (a) { abos[a.id] = a; });
    } catch (e) {
        stripeFehler = (e && e.message) || 'unbekannt';
        console.error('[abo-stand] Stripe: ' + stripeFehler);
    }

    var ergebnis = [];
    var gemerkt = 0;
    for (var i = 0; i < kunden.length; i++) {
        var k = kunden[i];
        var zeile = {
            id: k.id, name: k.name, email: k.email, restaurant_id: k.restaurant_id,
            stand: 'kein_abo', grund: 'kein Stripe-Abo hinterlegt',
            offen_seit_tagen: null, betrag: null, faellig_am: null, rechnung_url: null,
            stripe_status: null
        };

        if (k.stripe_subscription_id) {
            if (stripeFehler) {
                zeile.stand = 'unbekannt';
                zeile.grund = 'Stripe nicht erreichbar: ' + stripeFehler;
            } else {
                var abo = abos[k.stripe_subscription_id];
                if (!abo) {
                    // Das Abo steht bei uns, aber Stripe kennt es nicht.
                    // Kein Grund fuer gruen -- eher ein Grund nachzusehen.
                    zeile.stand = 'unbekannt';
                    zeile.grund = 'Abo ' + k.stripe_subscription_id + ' bei Stripe nicht gefunden';
                } else {
                    var u = standAus(abo);
                    zeile.stand = u.stand;
                    zeile.grund = u.grund;
                    zeile.stripe_status = abo.status || null;
                    zeile.offen_seit_tagen = (u.stand === 'offen' || u.stand === 'ueberfaellig')
                        ? offenSeitTagen(abo) : null;
                    if (abo.current_period_end) {
                        zeile.faellig_am = new Date(abo.current_period_end * 1000).toISOString();
                    }
                    var rg = (abo.latest_invoice && typeof abo.latest_invoice === 'object') ? abo.latest_invoice : null;
                    if (rg) {
                        zeile.betrag = euro(rg.amount_due != null ? rg.amount_due : rg.total);
                        // Damit Ibo "auch reinkommt" -- ein Klick in die
                        // echte Rechnung bei Stripe, ohne Suchen.
                        zeile.rechnung_url = rg.hosted_invoice_url || null;
                    }

                    // Den Stand merken, damit die Liste beim naechsten
                    // Laden schon stimmt. NUR bei einer echten Messung --
                    // 'unbekannt' ueberschreibt nichts.
                    var wort = (u.stand === 'bezahlt' || u.stand === 'testphase') ? 'paid'
                             : (u.stand === 'ueberfaellig') ? 'overdue'
                             : (u.stand === 'offen') ? 'pending' : null;
                    var felder = { stripe_status: abo.status || null };
                    if (wort) felder.payment_status = wort;
                    if (await merken(k.id, felder)) gemerkt++;
                }
            }
        }
        ergebnis.push(zeile);
    }

    return json(200, {
        ok: true,
        gemessen_am: new Date().toISOString(),
        stripe_erreichbar: !stripeFehler,
        hinweis: stripeFehler ? ('Stripe hat nicht geantwortet: ' + stripeFehler) : '',
        gemerkt: gemerkt,
        kunden: ergebnis
    });
};

exports._STAENDE = STAENDE;
exports._standAus = standAus;
exports._offenSeitTagen = offenSeitTagen;
