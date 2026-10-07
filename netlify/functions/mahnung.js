// DIE MAHNUNG -- die App schreibt, Ibo drueckt.
//
// Ibo am 25.09.2026: "das muss selber was steuern ich kann es dann klicken".
//
// WARUM ES DIE GIBT
// =================
// Die Zahlsperre ist seit heute ausgeliefert. Benutzen darf er sie trotzdem
// nicht: ein Abschalten wegen offener Rechnung setzt eine Mahnung mit Frist
// voraus. Die gab es im ganzen Projekt nicht -- nur einen warnenden Satz in
// einem Bestaetigungsfenster. Ein Satz ist keine Funktion.
//
// Diese Function schliesst die Kette:
//
//     Stripe sagt "ueberfaellig"  ->  Mahnung mit Frist  ->  Frist ab  ->  Sperre
//
// DREI REGELN, DIE HIER EINGEBAUT SIND
// ====================================
//
// 1. KEINE MAHNUNG UEBER EINEN BETRAG, DEN WIR NICHT NACHSEHEN KOENNEN.
//    Der Betrag kommt direkt von Stripe, nicht aus dem Browser und nicht
//    aus einem gespeicherten Feld. Ist Stripe nicht erreichbar, gibt es
//    kein Schreiben. Eine falsche Zahl in einer Mahnung ist schlimmer als
//    keine Mahnung: sie macht die ganze Forderung angreifbar.
//
// 2. KEINE MAHNUNG MIT LUECKEN IM ABSENDER.
//    Fehlt die IBAN oder die Anschrift, weigert sich die Function und
//    sagt, WELCHES Feld fehlt. Dieselbe Regel wie beim Vertrag in
//    32-vertrag.sql, wo [[PLATZHALTER]] das Freischalten blockiert.
//
// 3. DIE FRIST LAEUFT ERST AB DER ZUSTELLUNG.
//    Geht die Mail nicht raus, wird die Zeile trotzdem geschrieben -- aber
//    OHNE frist_bis. Damit kann aus einem misslungenen Versand nie eine
//    abgelaufene Frist werden, auf die sich jemand beruft.
//
// WAS SIE NICHT TUT
// =================
// Sie schickt nichts von allein. Kein Zeitplan, kein Automatismus. Ein
// Programm, das nach 30 Tagen selbst mahnt, mahnt irgendwann einen Kunden,
// der laengst ueberwiesen hat -- und den verliert man dann.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY,
//      RESEND_API_KEY, EMAIL_FROM

'use strict';

var Stripe = require('stripe');
var VERWALTER = require('./lib/verwalter');

var SUPABASE_URL = (process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
var KEY = process.env.SUPABASE_SERVICE_KEY || '';
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || '';

var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
};
function json(code, obj) { return { statusCode: code, headers: CORS, body: JSON.stringify(obj) }; }
function kopf() { return { apikey: KEY, Authorization: 'Bearer ' + KEY }; }

// ---------------------------------------------------------------------
// Die Stufen. Die App zaehlt selbst hoch -- von Hand setzt das niemand,
// sonst springt jemand versehentlich von 1 auf 3.
// ---------------------------------------------------------------------
var STUFEN = {
    1: { betreff: 'Zahlungserinnerung',
         ton: 'vermutlich uebersehen',
         schluss: 'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, '
                + 'betrachten Sie es bitte als gegenstandslos.' },
    2: { betreff: '1. Mahnung',
         ton: 'bereits erinnert',
         schluss: 'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, '
                + 'betrachten Sie es bitte als gegenstandslos.' },
    3: { betreff: 'Letzte Mahnung',
         ton: 'mehrfach erinnert',
         // ABSICHTLICH OHNE DIE ANKUENDIGUNG EINER ABSCHALTUNG.
         //
         // Die Leistung wegen offener Rechnung auszusetzen setzt eine
         // entsprechende Klausel im Vertrag voraus (§ 320 BGB). Der
         // Vertrag aus 32-vertrag.sql ist nicht freigeschaltet -- in ihm
         // stehen noch [[PLATZHALTER]] und kein Anwalt hat ihn gelesen.
         //
         // Etwas anzukuendigen, wozu der Vertrag nicht berechtigt, waere
         // selbst eine Pflichtverletzung. Deshalb hier nur der allgemeine
         // Satz. Sobald der Vertrag steht, gehoert die Ankuendigung
         // hierhin -- und dann auch nur hier.
         schluss: 'Nach fruchtlosem Ablauf der Frist behalten wir uns weitere Schritte vor.' }
};

// Pflichtfelder des Absenders. Ohne die gibt es kein Schreiben.
var ABSENDER_PFLICHT = [
    ['firmierung', 'Firmierung'], ['inhaber', 'Inhaber'],
    ['strasse', 'Straße'], ['plz', 'PLZ'], ['ort', 'Ort'],
    ['email', 'E-Mail'], ['iban', 'IBAN']
];

function fehlendeFelder(a) {
    if (!a) return ABSENDER_PFLICHT.map(function (f) { return f[1]; });
    return ABSENDER_PFLICHT
        .filter(function (f) { return !String(a[f[0]] || '').trim(); })
        .map(function (f) { return f[1]; });
}

function datum(d) {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function geld(n) {
    return Number(n).toFixed(2).replace('.', ',') + ' €';
}

// ---------------------------------------------------------------------
// DER BRIEF. Hier und nur hier entsteht der Wortlaut -- damit das, was
// Ibo auf dem Bildschirm liest, Zeichen fuer Zeichen das ist, was der
// Wirt bekommt.
// ---------------------------------------------------------------------
function briefText(d) {
    var s = STUFEN[d.stufe] || STUFEN[1];
    var z = [];

    z.push(d.anbieter.firmierung);
    if (d.anbieter.inhaber && d.anbieter.inhaber !== d.anbieter.firmierung) z.push(d.anbieter.inhaber);
    z.push(d.anbieter.strasse);
    z.push(d.anbieter.plz + ' ' + d.anbieter.ort);
    z.push('');

    z.push(d.empfaenger_name);
    if (d.empfaenger_strasse) z.push(d.empfaenger_strasse);
    if (d.empfaenger_ort) z.push(d.empfaenger_ort);
    z.push('');

    z.push(d.anbieter.ort + ', ' + datum(d.heute));
    z.push('');
    z.push(s.betreff + (d.rechnung_ref ? ' zu Rechnung ' + d.rechnung_ref : ''));
    z.push('');
    z.push('Sehr geehrte Damen und Herren,');
    z.push('');

    var satz = 'für Ihre Nutzung von Kiek mol in ist ein Betrag von ' + geld(d.betrag) + ' offen';
    if (d.faellig_seit) satz += ', fällig seit dem ' + datum(d.faellig_seit);
    satz += '. Ein Zahlungseingang liegt uns bis heute nicht vor.';
    z.push(satz);
    z.push('');

    if (d.stufe >= 2) {
        z.push('Auf unsere vorangegangene Zahlungserinnerung haben wir keine Antwort erhalten.');
        z.push('');
    }

    z.push('Wir bitten Sie, den Betrag bis zum ' + datum(d.frist_bis)
         + ' auf folgendes Konto zu überweisen:');
    z.push('');
    z.push('    ' + d.anbieter.firmierung);
    z.push('    IBAN: ' + d.anbieter.iban);
    if (d.anbieter.bic)  z.push('    BIC:  ' + d.anbieter.bic);
    if (d.anbieter.bank) z.push('    Bank: ' + d.anbieter.bank);
    if (d.rechnung_ref)  z.push('    Verwendungszweck: ' + d.rechnung_ref);
    z.push('');

    if (d.anbieter.kleinunternehmer) {
        z.push('Der Betrag enthält nach § 19 UStG keine Umsatzsteuer.');
        z.push('');
    }

    z.push(s.schluss);
    z.push('');
    z.push('Mit freundlichen Grüßen');
    z.push(d.anbieter.inhaber || d.anbieter.firmierung);
    if (d.anbieter.telefon) z.push('Telefon ' + d.anbieter.telefon);
    z.push(d.anbieter.email);

    return z.join('\n');
}

function alsHtml(text) {
    var sicher = String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;'
         + 'line-height:1.6;color:#1a1a1a;white-space:pre-wrap;">' + sicher + '</div>';
}

// ---------------------------------------------------------------------
async function hol(pfad) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + pfad, { headers: kopf() });
    if (!res.ok) throw new Error(pfad.split('?')[0] + ' ' + res.status);
    return await res.json();
}

async function anbieterHolen() {
    try { return (await hol('anbieter?id=eq.1&select=*&limit=1'))[0] || null; }
    catch (e) {
        if (/40[04]/.test(e.message)) return null;   // Tabelle fehlt noch
        throw e;
    }
}

// Der Betrag kommt von Stripe. Siehe Regel 1 im Kopf.
async function offenerBetrag(kunde) {
    if (!kunde.stripe_subscription_id) {
        return { ok: false, grund: 'Für diesen Kunden ist kein Stripe-Abo hinterlegt. '
                                 + 'Ohne Abo kennen wir keinen Betrag und keine Fälligkeit.' };
    }
    if (!process.env.STRIPE_SECRET_KEY) {
        return { ok: false, grund: 'STRIPE_SECRET_KEY ist in Netlify nicht gesetzt.' };
    }
    try {
        var stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        var abo = await stripe.subscriptions.retrieve(kunde.stripe_subscription_id,
                                                     { expand: ['latest_invoice'] });
        var rg = (abo && abo.latest_invoice && typeof abo.latest_invoice === 'object')
            ? abo.latest_invoice : null;
        if (!rg) return { ok: false, grund: 'Stripe kennt zu diesem Abo keine Rechnung.' };
        if (String(rg.status || '').toLowerCase() === 'paid') {
            return { ok: false, grund: 'Stripe meldet diese Rechnung als BEZAHLT. '
                                     + 'Es gibt gerade nichts zu mahnen.' };
        }
        var faellig = rg.due_date || rg.period_end || rg.created || null;
        return {
            ok: true,
            betrag: Math.round(Number(rg.amount_due != null ? rg.amount_due : rg.total)) / 100,
            rechnung_ref: rg.number || rg.id || null,
            faellig_seit: faellig ? new Date(faellig * 1000).toISOString() : null
        };
    } catch (e) {
        return { ok: false, grund: 'Stripe nicht erreichbar: ' + (e && e.message) };
    }
}

// Welche Stufe ist dran? Eine mehr als die letzte GESENDETE, hoechstens 3.
async function naechsteStufe(customerId) {
    try {
        var bisher = await hol('mahnungen?customer_id=eq.' + encodeURIComponent(customerId)
            + '&versendet_am=not.is.null&select=stufe&order=stufe.desc&limit=1');
        var letzte = (bisher[0] && bisher[0].stufe) || 0;
        return Math.min(letzte + 1, 3);
    } catch (e) {
        // Tabelle fehlt noch oder nicht erreichbar: bei 1 anfangen. Eine
        // Zahlungserinnerung ist der mildeste Fall -- im Zweifel der.
        return 1;
    }
}

async function bauen(customerId) {
    var kunden = await hol('customers?id=eq.' + encodeURIComponent(customerId)
        + '&select=id,name,email,restaurant_id,stripe_subscription_id&limit=1');
    var kunde = kunden[0];
    if (!kunde) return { ok: false, fehler: 'Diesen Kunden gibt es nicht.' };
    if (!kunde.email) return { ok: false, fehler: 'Für diesen Kunden ist keine E-Mail hinterlegt.' };

    var anbieter = await anbieterHolen();
    var fehlt = fehlendeFelder(anbieter);
    if (fehlt.length) {
        return { ok: false, fehler: 'Im Absender fehlt: ' + fehlt.join(', ') + '.',
                 absender_unvollstaendig: true, fehlende_felder: fehlt };
    }

    var geld_ = await offenerBetrag(kunde);
    if (!geld_.ok) return { ok: false, fehler: geld_.grund };

    var haus = null;
    if (kunde.restaurant_id) {
        try {
            haus = (await hol('restaurants?id=eq.' + encodeURIComponent(kunde.restaurant_id)
                + '&select=name,street,zip,city&limit=1'))[0] || null;
        } catch (e) { haus = null; }
    }

    var heute = new Date();
    var frist = new Date(heute.getTime()
        + (Number(anbieter.frist_tage) || 14) * 86400000);
    var stufe = await naechsteStufe(customerId);

    var daten = {
        stufe: stufe,
        anbieter: anbieter,
        empfaenger_name: (haus && haus.name) || kunde.name,
        empfaenger_strasse: haus ? (haus.street || '') : '',
        empfaenger_ort: haus ? [haus.zip, haus.city].filter(Boolean).join(' ') : '',
        heute: heute.toISOString(),
        frist_bis: frist.toISOString(),
        betrag: geld_.betrag,
        rechnung_ref: geld_.rechnung_ref,
        faellig_seit: geld_.faellig_seit
    };

    return {
        ok: true,
        kunde: { id: kunde.id, name: kunde.name, email: kunde.email,
                 restaurant_id: kunde.restaurant_id },
        stufe: stufe,
        betreff: (STUFEN[stufe] || STUFEN[1]).betreff
               + (geld_.rechnung_ref ? ' zu Rechnung ' + geld_.rechnung_ref : ''),
        frist_bis: frist.toISOString().slice(0, 10),
        betrag: geld_.betrag,
        rechnung_ref: geld_.rechnung_ref,
        text: briefText(daten)
    };
}

async function schreiben(zeile) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/mahnungen', {
        method: 'POST',
        headers: Object.assign({}, kopf(), {
            'Content-Type': 'application/json', Prefer: 'return=representation'
        }),
        body: JSON.stringify(zeile)
    });
    if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) {}
        if (/mahnungen/i.test(t) && /(does not exist|schema cache|relation)/i.test(t)) {
            throw new Error('Die Tabelle mahnungen fehlt noch in der Datenbank (SQL 37).');
        }
        throw new Error('Konnte die Mahnung nicht protokollieren (' + res.status + ').');
    }
    return (await res.json())[0] || null;
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
        // ---- Absender lesen ------------------------------------------
        if (aktion === 'absender') {
            var a = await anbieterHolen();
            return json(200, { ok: true, absender: a, fehlende_felder: fehlendeFelder(a) });
        }

        // ---- Absender speichern --------------------------------------
        if (aktion === 'absender-speichern') {
            var feld = {};
            ['firmierung', 'inhaber', 'strasse', 'plz', 'ort', 'email', 'telefon',
             'iban', 'bic', 'bank', 'steuernummer'].forEach(function (k) {
                if (body[k] !== undefined) feld[k] = String(body[k] || '').trim() || null;
            });
            if (body.kleinunternehmer !== undefined) feld.kleinunternehmer = !!body.kleinunternehmer;
            if (body.frist_tage !== undefined) {
                var t = parseInt(body.frist_tage, 10);
                // Unter 7 Tagen gilt eine Frist schnell als unangemessen kurz;
                // ueber 30 mahnt man sich selbst aus.
                if (!(t >= 7 && t <= 30)) {
                    return json(400, { ok: false, fehler: 'Die Frist muss zwischen 7 und 30 Tagen liegen.' });
                }
                feld.frist_tage = t;
            }
            feld.geaendert_am = new Date().toISOString();

            var res = await fetch(SUPABASE_URL + '/rest/v1/anbieter?id=eq.1', {
                method: 'PATCH',
                headers: Object.assign({}, kopf(), {
                    'Content-Type': 'application/json', Prefer: 'return=representation'
                }),
                body: JSON.stringify(feld)
            });
            var txt = await res.text();
            if (!res.ok) {
                if (/anbieter/i.test(txt) && /(does not exist|schema cache|relation)/i.test(txt)) {
                    return json(500, { ok: false, fehler: 'Die Tabelle anbieter fehlt noch (SQL 37).' });
                }
                return json(500, { ok: false, fehler: 'Nicht gespeichert (' + res.status + ').' });
            }
            var zeilen = []; try { zeilen = JSON.parse(txt); } catch (e) {}
            if (!zeilen.length) return json(500, { ok: false, fehler: 'Nicht gespeichert: keine Zeile getroffen.' });
            return json(200, { ok: true, absender: zeilen[0], fehlende_felder: fehlendeFelder(zeilen[0]) });
        }

        // ---- Verlauf zu einem Kunden ---------------------------------
        if (aktion === 'stand') {
            var cid = String(body.customer_id || '');
            if (!cid) return json(400, { ok: false, fehler: 'customer_id fehlt.' });
            var liste = [];
            try {
                liste = await hol('mahnungen?customer_id=eq.' + encodeURIComponent(cid)
                    + '&select=id,stufe,erstellt_am,versendet_am,frist_bis,betrag,betreff,versand_fehler'
                    + '&order=erstellt_am.desc&limit=10');
            } catch (e) {
                return json(200, { ok: true, mahnungen: [], hinweis: 'SQL 37 fehlt noch' });
            }
            var letzte = liste.filter(function (m) { return m.versendet_am && m.frist_bis; })[0] || null;
            return json(200, {
                ok: true, mahnungen: liste, letzte: letzte,
                // Das Feld, an dem die Sperr-Knoepfe haengen.
                frist_abgelaufen: !!(letzte && new Date(letzte.frist_bis + 'T23:59:59') < new Date())
            });
        }

        // ---- Alle Staende auf einmal ---------------------------------
        // Die Kundenliste braucht fuer JEDE Zeile die Antwort auf "ist
        // gemahnt und ist die Frist um?". Eine Anfrage je Zeile waere bei
        // 25 Betrieben 25 Runden -- und die Liste baut sich bei jedem
        // Rendern neu auf.
        if (aktion === 'staende') {
            var alle = [];
            try {
                alle = await hol('mahnungen?versendet_am=not.is.null'
                    + '&select=customer_id,stufe,versendet_am,frist_bis'
                    + '&order=versendet_am.desc&limit=500');
            } catch (e) {
                return json(200, { ok: true, staende: {}, hinweis: 'SQL 37 fehlt noch', tabelle_fehlt: true });
            }
            var karte = {};
            var jetzt = new Date();
            alle.forEach(function (m) {
                // order=versendet_am.desc: der erste Treffer je Kunde ist
                // der juengste. Spaetere ueberschreiben ihn nicht.
                if (karte[m.customer_id]) return;
                karte[m.customer_id] = {
                    stufe: m.stufe,
                    versendet_am: m.versendet_am,
                    frist_bis: m.frist_bis,
                    abgelaufen: !!(m.frist_bis && new Date(m.frist_bis + 'T23:59:59') < jetzt)
                };
            });
            return json(200, { ok: true, staende: karte, tabelle_fehlt: false });
        }

        // ---- Vorschau: schreiben, aber nicht senden -------------------
        if (aktion === 'vorschau') {
            var cid2 = String(body.customer_id || '');
            if (!cid2) return json(400, { ok: false, fehler: 'customer_id fehlt.' });
            var v = await bauen(cid2);
            return json(v.ok ? 200 : 409, v);
        }

        // ---- Senden --------------------------------------------------
        if (aktion === 'senden') {
            var cid3 = String(body.customer_id || '');
            if (!cid3) return json(400, { ok: false, fehler: 'customer_id fehlt.' });

            var m = await bauen(cid3);
            if (!m.ok) return json(409, m);

            // Ibo darf den Text noch anpassen -- aber nur den Text. Betrag,
            // Frist und Empfaenger kommen aus der Messung, nicht aus dem
            // Browser. Sonst koennte eine falsche Zahl durchrutschen.
            var text = String(body.text || m.text);

            if (!RESEND_API_KEY || !EMAIL_FROM) {
                return json(503, { ok: false, fehler: 'Kein Mailversand eingerichtet '
                    + '(RESEND_API_KEY oder EMAIL_FROM fehlt in Netlify).' });
            }

            var zeile = {
                customer_id: m.kunde.id,
                restaurant_id: m.kunde.restaurant_id || null,
                stufe: m.stufe,
                empfaenger: m.kunde.email,
                betrag: m.betrag,
                rechnung_ref: m.rechnung_ref,
                betreff: m.betreff,
                text: text
            };

            var versandFehler = '';
            try {
                var mr = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: EMAIL_FROM, to: [m.kunde.email],
                        subject: m.betreff, text: text, html: alsHtml(text)
                    })
                });
                if (!mr.ok) {
                    var mt = ''; try { mt = await mr.text(); } catch (e) {}
                    versandFehler = 'Resend ' + mr.status + ': ' + mt.slice(0, 200);
                }
            } catch (e) {
                versandFehler = 'Resend nicht erreichbar: ' + (e && e.message);
            }

            // REGEL 3: die Frist nur bei erfolgreichem Versand.
            if (versandFehler) {
                zeile.versand_fehler = versandFehler;
            } else {
                zeile.versendet_am = new Date().toISOString();
                zeile.frist_bis = m.frist_bis;
            }

            var gespeichert = null, schreibFehler = '';
            try { gespeichert = await schreiben(zeile); }
            catch (e) { schreibFehler = e.message; }

            if (versandFehler) {
                return json(502, { ok: false, fehler: 'Die Mahnung ging nicht raus. ' + versandFehler,
                                   protokolliert: !!gespeichert });
            }
            if (schreibFehler) {
                // Mail ist draussen, Protokoll nicht geschrieben. Das MUSS
                // er erfahren: ohne Eintrag gibt es spaeter keinen Beleg,
                // und die Sperre bleibt zu Recht gesperrt.
                return json(500, { ok: false, gesendet: true,
                    fehler: 'Die Mahnung ist rausgegangen, konnte aber nicht protokolliert werden: '
                          + schreibFehler + ' Ohne Eintrag zählt die Frist nicht.' });
            }
            return json(200, { ok: true, mahnung: gespeichert, stufe: m.stufe,
                               frist_bis: m.frist_bis, empfaenger: m.kunde.email });
        }

        return json(400, { ok: false, fehler: 'Unbekannte Aktion.' });
    } catch (e) {
        console.error('[mahnung] ' + (e && e.message));
        return json(500, { ok: false, fehler: e.message });
    }
};

exports._briefText = briefText;
exports._fehlendeFelder = fehlendeFelder;
exports._STUFEN = STUFEN;
exports._ABSENDER_PFLICHT = ABSENDER_PFLICHT;
