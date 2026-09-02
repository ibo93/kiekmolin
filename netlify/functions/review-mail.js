// Kiek mol in — Bewertungs-Nachfass per E-Mail: "Hat's geschmeckt?"
//
// Warum es diese Funktion braucht, obwohl es review-push schon gibt:
// Der Push erreicht nur Geräte, die die Seite als App installiert und
// Benachrichtigungen erlaubt haben — derzeit 36. Und er kennt nur
// Bestellungen. Die 399 Reservierungen werden gar nicht nachgefasst.
// Ergebnis: 571 Gästekontakte, eine einzige Bewertung.
//
// Sterne im Google-Ergebnis sind der stärkste Sichtbarkeits-Hebel für
// einen Wirt — sie heben die Klickrate, ohne dass sich an der
// Platzierung etwas ändert. Der Code, der sie ausspielt, steht schon
// (build-seo-pages.js) und erfindet nichts: Er zeigt nur, was belegt
// ist. Es fehlt schlicht der Nachschub.
//
// Läuft stündlich, sendet aber nur zwischen 11 und 19 Uhr deutscher
// Zeit. Eine Bewertungsbitte um sieben Uhr morgens landet ungelesen im
// Papierkorb.
//
// Spam-Schutz:
//   - pro Reservierung/Bestellung genau EINE Mail (atomar beansprucht)
//   - erst am Tag danach (18-72 Std), nie am selben Abend
//   - nur bestätigte Reservierungen bzw. abgeschlossene Bestellungen
//   - höchstens 40 Mails je Lauf
//
// EINMALIG in Supabase:
//   ALTER TABLE reservations ADD COLUMN IF NOT EXISTS review_email_sent_at timestamptz;
//   ALTER TABLE orders       ADD COLUMN IF NOT EXISTS review_email_sent_at timestamptz;
// Fehlt eine Spalte, überspringt die Funktion diese Quelle sauber —
// lieber keine Mail als eine doppelte.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, EMAIL_FROM

'use strict';

var SUPABASE_URL = process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co';
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
var RESEND_API_KEY = process.env.RESEND_API_KEY || '';
var EMAIL_FROM = process.env.EMAIL_FROM || 'Kiek mol in <bestellung@kiekmolin.de>';
var SITE = 'https://kiekmolin.de';

/* Ohne Einwilligung geht nichts raus.

   Der BGH hat 2018 entschieden (VI ZR 225/17), dass eine Bewertungsbitte
   in einer Kundenzufriedenheits-Mail Werbung ist. Die Ausnahme in
   § 7 Abs. 3 UWG greift nur, wenn der Kunde BEI der Adresserhebung darauf
   hingewiesen wurde und widersprechen konnte. Solange das Buchungsformular
   kein solches Feld hat, waere jede dieser Mails abmahnfaehig - und zwar
   gegen Kiek mol in, nicht gegen den Wirt.

   Deshalb: Diese Funktion sendet ausschliesslich an Vorgaenge mit
   review_consent = true. Fehlt die Spalte, laeuft sie leer und sagt das
   im Protokoll. Lieber keine Bewertungen als eine Abmahnung.

   EINMALIG in Supabase, sobald das Haekchen im Formular steht:
     ALTER TABLE reservations ADD COLUMN IF NOT EXISTS review_consent boolean DEFAULT false;
     ALTER TABLE orders       ADD COLUMN IF NOT EXISTS review_consent boolean DEFAULT false; */
var MAX_JE_LAUF = 40;
var FRUEHESTENS_STD = 18;   // nicht am selben Abend
var SPAETESTENS_STD = 72;   // nach drei Tagen erinnert sich niemand mehr

function sbHeaders(extra) {
    return Object.assign({
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
    }, extra || {});
}

async function sbGet(path) {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
    if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) {}
        var err = new Error('GET ' + path.split('?')[0] + ' -> ' + res.status);
        err.status = res.status; err.body = t;
        throw err;
    }
    return res.json();
}

function berlinStunde() {
    var s = new Date().toLocaleTimeString('de-DE', {
        timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false
    });
    return parseInt(s.slice(0, 2), 10);
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendMail(to, subject, html) {
    var res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject: subject, html: html })
    });
    if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (e) {}
        throw new Error('Resend ' + res.status + ': ' + t.slice(0, 150));
    }
}

/* Der Anlass wird beim Namen genannt — "Ihr Besuch am Freitag" wirkt wie
   eine Erinnerung an einen schönen Abend, "Ihre Transaktion" wie eine
   Rechnung. Gebeten wird EINMAL, ohne Nachdruck, mit sichtbarem Weg zum
   Nein: Wer nicht mag, klickt nichts und hört nie wieder davon. */
function baueMail(name, betrieb, anlassText, link) {
    var anrede = name ? 'Hallo ' + esc(String(name).split(' ')[0]) + ',' : 'Guten Tag,';
    return ''
        + '<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f2">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px">'
        + '<tr><td align="center">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;'
        + 'border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;color:#1a1a1a">'
        + '<tr><td style="padding:24px 26px 6px;font-size:15px;line-height:1.6">' + anrede + '</td></tr>'
        + '<tr><td style="padding:0 26px 4px;font-size:15px;line-height:1.65">'
        + 'hat es geschmeckt ' + esc(anlassText) + ' bei <b>' + esc(betrieb) + '</b>?'
        + '</td></tr>'
        + '<tr><td style="padding:6px 26px 18px;font-size:14.5px;line-height:1.65;color:#4a4a4a">'
        + 'Wenn Sie zwei Minuten haben: Eine kurze Bewertung hilft anderen Gästen bei der Suche '
        + '— und dem Betrieb mehr, als man denkt.'
        + '</td></tr>'
        + '<tr><td style="padding:2px 26px 24px">'
        + '<a href="' + esc(link) + '" style="display:inline-block;background:#1f7a3d;color:#fff;'
        + 'text-decoration:none;padding:12px 22px;border-radius:7px;font-size:15px;font-weight:600">'
        + 'Bewertung schreiben</a>'
        + '</td></tr>'
        + '<tr><td style="padding:14px 26px 22px;border-top:1px solid #ececec;font-size:12px;line-height:1.6;color:#8a8a8a">'
        + 'Sie erhalten diese Nachricht einmalig, weil Sie bei der Buchung zugestimmt haben. '
        + 'Wenn Sie nicht bewerten möchten, ignorieren Sie sie einfach — es folgt nichts weiter.'
        + '</td></tr>'
        + '</table></td></tr></table></body></html>';
}

/* Eine Zeile atomar für uns beanspruchen: Nur wenn die Spalte NOCH leer
   ist, wird sie gesetzt — und nur wenn die Datenbank daraufhin eine Zeile
   zurückgibt, verschicken wir. Sonst war ein paralleler Lauf schneller,
   und der Gast bekäme die Mail zweimal. */
async function beanspruche(tabelle, id) {
    var res = await fetch(
        SUPABASE_URL + '/rest/v1/' + tabelle + '?id=eq.' + encodeURIComponent(id)
        + '&review_email_sent_at=is.null',
        {
            method: 'PATCH',
            headers: sbHeaders({ 'Prefer': 'return=representation' }),
            body: JSON.stringify({ review_email_sent_at: new Date().toISOString() })
        }
    );
    if (!res.ok) return false;
    var d = await res.json();
    return Array.isArray(d) && d.length > 0;
}

exports.handler = async function () {
    if (!SUPABASE_KEY || !RESEND_API_KEY) {
        return { statusCode: 200, body: 'still inaktiv: SUPABASE_SERVICE_KEY oder RESEND_API_KEY fehlt' };
    }

    var stunde = berlinStunde();
    if (stunde < 11 || stunde >= 19) {
        return { statusCode: 200, body: 'ausserhalb des Zeitfensters (11-19 Uhr), nichts verschickt' };
    }

    var jetzt = Date.now();
    var von = new Date(jetzt - SPAETESTENS_STD * 3600000).toISOString();
    var bis = new Date(jetzt - FRUEHESTENS_STD * 3600000).toISOString();

    var betriebe = {};
    try {
        (await sbGet('restaurants?select=id,name,slug&limit=300')).forEach(function (r) { betriebe[r.id] = r; });
    } catch (e) {
        return { statusCode: 200, body: 'Betriebe nicht lesbar: ' + e.message };
    }

    var kandidaten = [];

    // --- Reservierungen: die grosse, bisher ungenutzte Quelle ---------------
    try {
        var resis = await sbGet(
            'reservations?status=eq.confirmed&guest_email=not.is.null'
            + '&review_consent=is.true'
            + '&review_email_sent_at=is.null'
            + '&created_at=gte.' + encodeURIComponent(von)
            + '&created_at=lte.' + encodeURIComponent(bis)
            + '&select=id,restaurant_id,guest_name,guest_email,reservation_date&limit=' + MAX_JE_LAUF
        );
        resis.forEach(function (r) {
            kandidaten.push({
                tabelle: 'reservations', id: r.id, restaurant_id: r.restaurant_id,
                name: r.guest_name, mail: r.guest_email, anlass: 'bei Ihrem Besuch'
            });
        });
    } catch (e) {
        if (e.status === 400 && /review_(email_sent_at|consent)/.test(e.body || '')) {
            console.warn('[review-mail] Spalte review_email_sent_at oder review_consent fehlt bei reservations. Uebersprungen - ohne Einwilligung wird nicht verschickt.');
        } else {
            console.warn('[review-mail] Reservierungen nicht lesbar:', e.message);
        }
    }

    // --- Bestellungen ohne Push-Erlaubnis -----------------------------------
    try {
        var orders = await sbGet(
            'orders?customer_email=not.is.null&review_consent=is.true'
            + '&review_email_sent_at=is.null'
            + '&created_at=gte.' + encodeURIComponent(von)
            + '&created_at=lte.' + encodeURIComponent(bis)
            + '&select=id,restaurant_id,customer_name,customer_email&limit=' + MAX_JE_LAUF
        );
        orders.forEach(function (o) {
            kandidaten.push({
                tabelle: 'orders', id: o.id, restaurant_id: o.restaurant_id,
                name: o.customer_name, mail: o.customer_email, anlass: 'bei Ihrer Bestellung'
            });
        });
    } catch (e) {
        if (e.status === 400 && /review_(email_sent_at|consent)/.test(e.body || '')) {
            console.warn('[review-mail] Spalte review_email_sent_at oder review_consent fehlt bei orders. Uebersprungen - ohne Einwilligung wird nicht verschickt.');
        } else {
            console.warn('[review-mail] Bestellungen nicht lesbar:', e.message);
        }
    }

    var verschickt = 0, uebersprungen = 0, fehler = 0;

    for (var i = 0; i < kandidaten.length && verschickt < MAX_JE_LAUF; i++) {
        var k = kandidaten[i];
        var b = betriebe[k.restaurant_id];
        if (!b || !b.name) { uebersprungen++; continue; }

        if (!(await beanspruche(k.tabelle, k.id))) { uebersprungen++; continue; }

        var link = SITE + '/?r=' + encodeURIComponent(b.slug || b.id) + '&review=1';
        try {
            await sendMail(
                k.mail,
                'Wie war es bei ' + b.name + '?',
                baueMail(k.name, b.name, k.anlass, link)
            );
            verschickt++;
        } catch (e) {
            fehler++;
            console.error('[review-mail] Versand fehlgeschlagen:', e.message);
        }
    }

    var bericht = verschickt + ' verschickt, ' + uebersprungen + ' uebersprungen, ' + fehler + ' Fehler'
        + ' (von ' + kandidaten.length + ' Kandidaten)';
    console.log('[review-mail] ' + bericht);
    return { statusCode: 200, body: bericht };
};
