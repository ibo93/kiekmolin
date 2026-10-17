// EIN RAHMEN FUER ALLE GAESTE-MAILS.
//
// Ibo, 17.10.2026: "koennen wir die E-Mails besser machen ... Kiek-mol-in-
// Logo, Links zur Seite vom Restaurant". Bisher baute jede Mail ihr eigenes
// <div> -- vier Mails, vier Stile, kein Logo, kein Weg zum Lokal.
//
// Hier steht der Rahmen EINMAL: Kopf mit Wortmarke, Band mit dem Lokal
// (Name, Ort, Link zur Lokalseite), weisse Karte, Fuss. Die Mails liefern
// nur noch ihren Inhalt.
//
// MAIL-HANDWERK, NICHT WEBSEITE:
//   - Tabellen statt div/flex: Outlook kennt kein flex, Gmail kein <style>.
//   - Alles inline, Farben auch als bgcolor (manche Programme lesen nur das).
//   - Wortmarke als TEXT, nicht als Bild: viele Programme laden Bilder erst
//     auf Nachfrage -- ein Bild-Logo waere dort ein leeres Kaestchen.
//   - Das Lokal-Logo nur, wenn es eine https-Adresse ist; sonst der
//     Anfangsbuchstabe im Kreis.
//   - Unsichtbare Vorschauzeile: die Zeile, die das Postfach unter dem
//     Betreff zeigt. Ohne sie zeigt es den ersten Text der Mail.
'use strict';

var SITE = 'https://kiekmolin.de';
var GRUEN = '#0b3d33', GRUEN_HELL = '#e8f1ed', GELB = '#fcd34d', TEXT = '#1c1917', GRAU = '#57534e', LINIE = '#e7e5e4';
var SCHRIFT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Die Seite des Lokals in der App. Dieselbe Form wie in review-mail
// (/?r=<slug>); die App oeffnet damit das Lokal.
function lokalUrl(rest) {
    if (!rest) return SITE;
    var kennung = rest.slug || rest.id;
    return kennung ? SITE + '/?r=' + encodeURIComponent(kennung) : SITE;
}

// Anlass, wie die App ihn speichert -> wie der Gast ihn gewaehlt hat.
// Vorher stand in der Mail "Anlass: birthday".
var ANLASS = { birthday: 'Geburtstag', anniversary: 'Jahrestag', business: 'Geschäftlich', date: 'Date', celebration: 'Feier' };
function anlassText(code) {
    var k = String(code || '').trim();
    return ANLASS[k.toLowerCase()] || k;
}

function adresse(rest) {
    return rest ? [rest.street, rest.city].filter(Boolean).join(', ') : '';
}
function routeUrl(rest) {
    var a = adresse(rest);
    if (!a) return '';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((rest.name ? rest.name + ', ' : '') + a);
}

// Termin in Google Kalender. Zwei Stunden, deutsche Zeit -- ohne Zeitzone
// legte Google den Termin sonst in die Zone des Gastes.
function kalenderUrl(r, rest) {
    var d = String(r && r.reservation_date || ''), t = String(r && r.reservation_time || '').slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return '';
    var start = d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
    var min = parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10) + 120;
    var tag = new Date(d + 'T12:00:00Z');
    if (min >= 1440) { min -= 1440; tag.setUTCDate(tag.getUTCDate() + 1); }
    var ende = tag.toISOString().slice(0, 10).replace(/-/g, '') + 'T' + String(Math.floor(min / 60)).padStart(2, '0') + String(min % 60).padStart(2, '0') + '00';
    var name = (rest && rest.name) || 'Restaurant';
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        + '&text=' + encodeURIComponent('Tisch bei ' + name)
        + '&dates=' + start + '/' + ende + '&ctz=Europe/Berlin'
        + (adresse(rest) ? '&location=' + encodeURIComponent(adresse(rest)) : '')
        + '&details=' + encodeURIComponent((r.party_size || 2) + ' Personen · reserviert über kiekmolin.de');
}

// Knopf. art: 'voll' (gruen), 'rand' (gruen umrandet), 'rot' (Absagen),
// 'paypal'. Als Tabelle, damit Outlook die Flaeche malt.
function knopf(text, url, art) {
    var f = { voll: [GRUEN, '#ffffff', GRUEN], rand: ['#ffffff', GRUEN, GRUEN], rot: ['#ffffff', '#b91c1c', '#fca5a5'], paypal: ['#0070f3', '#ffffff', '#0070f3'] }[art || 'voll'] || [GRUEN, '#ffffff', GRUEN];
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:4px 6px 4px 0;"><tr>'
        + '<td bgcolor="' + f[0] + '" style="background:' + f[0] + ';border:1.5px solid ' + f[2] + ';border-radius:999px;">'
        + '<a href="' + esc(url) + '" style="display:inline-block;padding:12px 22px;font-family:' + SCHRIFT + ';font-size:14px;font-weight:700;color:' + f[1] + ';text-decoration:none;border-radius:999px;">' + text + '</a>'
        + '</td></tr></table>';
}

// Kleine Textverweise in einer Zeile ("Route · In Kalender · Anrufen").
function verweise(liste) {
    var teile = (liste || []).filter(function (v) { return v && v[1]; }).map(function (v) {
        return '<a href="' + esc(v[1]) + '" style="color:' + GRUEN + ';font-weight:600;text-decoration:none;">' + v[0] + '</a>';
    });
    return teile.length ? '<p style="margin:14px 0 0;font-size:13px;color:' + GRAU + ';">' + teile.join(' &nbsp;·&nbsp; ') + '</p>' : '';
}

// Die "Eintrittskarte": oben gross Tag und Uhrzeit, darunter die Zeilen.
// gross = { links: 'Sa, 17. Okt.', rechts: '18:30 Uhr' } (optional).
function detailKarte(zeilen, gross) {
    var kopf = '';
    if (gross) {
        kopf = '<tr><td style="padding:16px 18px;border-bottom:1px dashed #d6d3d1;" bgcolor="' + GRUEN_HELL + '">'
            + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
            + '<td style="font-family:' + SCHRIFT + ';font-size:17px;font-weight:800;color:' + GRUEN + ';">' + gross.links + '</td>'
            + '<td align="right" style="font-family:' + SCHRIFT + ';font-size:22px;font-weight:800;color:' + GRUEN + ';white-space:nowrap;">' + (gross.rechts || '') + '</td>'
            + '</tr></table></td></tr>';
    }
    var reihen = (zeilen || []).filter(function (z) { return z && z[1] !== '' && z[1] != null; }).map(function (z) {
        return '<tr><td style="padding:7px 0;font-family:' + SCHRIFT + ';font-size:13px;color:' + GRAU + ';width:96px;vertical-align:top;">' + z[0] + '</td>'
            + '<td style="padding:7px 0;font-family:' + SCHRIFT + ';font-size:14px;font-weight:600;color:' + TEXT + ';">' + z[1] + '</td></tr>';
    }).join('');
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ' + LINIE + ';border-radius:14px;border-collapse:separate;overflow:hidden;">'
        + kopf
        + (reihen ? '<tr><td style="padding:8px 18px 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + reihen + '</table></td></tr>' : '')
        + '</table>';
}

// Kasten fuer Nebensachen (Absagen, Bewertung, PayPal-Hinweis).
function kasten(inhalt, art) {
    var f = { grau: ['#fafaf9', LINIE], blau: ['#f0f7ff', '#cfe4ff'], orange: ['#fff7ed', '#fed7aa'], gruen: [GRUEN_HELL, '#cfe3da'] }[art || 'grau'];
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr>'
        + '<td bgcolor="' + f[0] + '" style="background:' + f[0] + ';border:1px solid ' + f[1] + ';border-radius:14px;padding:16px 18px;font-family:' + SCHRIFT + ';font-size:14px;line-height:1.55;color:#44403c;">'
        + inhalt + '</td></tr></table>';
}

function lokalBand(rest) {
    if (!rest || !rest.name) return '';
    var logo = rest.logo_url && /^https:\/\//.test(String(rest.logo_url)) && !/["'<>\s]/.test(String(rest.logo_url))
        ? '<img src="' + esc(rest.logo_url) + '" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid ' + LINIE + ';">'
        : '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="44" height="44" align="center" bgcolor="' + GRUEN_HELL + '" style="width:44px;height:44px;border-radius:50%;background:' + GRUEN_HELL + ';font-family:' + SCHRIFT + ';font-size:19px;font-weight:800;color:' + GRUEN + ';">'
          + esc(String(rest.name).trim().charAt(0).toUpperCase()) + '</td></tr></table>';
    return '<tr><td style="padding:18px 28px;border-bottom:1px solid ' + LINIE + ';">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td width="56" style="width:56px;vertical-align:middle;">' + logo + '</td>'
        + '<td style="vertical-align:middle;font-family:' + SCHRIFT + ';">'
        + '<div style="font-size:16px;font-weight:800;color:' + TEXT + ';">' + esc(rest.name) + '</div>'
        + (rest.city ? '<div style="font-size:13px;color:' + GRAU + ';margin-top:2px;">' + esc(rest.city) + '</div>' : '')
        + '</td>'
        + '<td align="right" style="vertical-align:middle;font-family:' + SCHRIFT + ';white-space:nowrap;">'
        + '<a href="' + esc(lokalUrl(rest)) + '" style="font-size:13px;font-weight:700;color:' + GRUEN + ';text-decoration:none;">Zum Lokal&nbsp;›</a>'
        + '</td></tr></table></td></tr>';
}

// status: { text: 'Bestätigt', art: 'gruen'|'gelb'|'rot' } (optional)
function rahmen(o) {
    o = o || {};
    var st = o.status ? ({ gruen: ['#dcfce7', '#166534'], gelb: ['#fef3c7', '#92400e'], rot: ['#fee2e2', '#991b1b'] }[o.status.art || 'gruen'] || ['#dcfce7', '#166534']) : null;
    return '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<meta name="color-scheme" content="light"><title>' + esc(o.titelText || 'Kiek mol in') + '</title></head>'
        + '<body style="margin:0;padding:0;background:#efece4;" bgcolor="#efece4">'
        + (o.vorschau ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + esc(o.vorschau) + '&#8199;&#65279;&#847;'.repeat(30) + '</div>' : '')
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#efece4" style="background:#efece4;"><tr><td align="center" style="padding:24px 12px 32px;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">'
        // Kopf: Wortmarke
        + '<tr><td bgcolor="' + GRUEN + '" style="background:' + GRUEN + ';border-radius:18px 18px 0 0;padding:20px 28px;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="font-family:' + SCHRIFT + ';font-size:22px;font-weight:800;letter-spacing:-0.3px;color:#ffffff;">'
        + '<a href="' + SITE + '" style="color:#ffffff;text-decoration:none;">Kiek mol <span style="color:' + GELB + ';">in</span></a></td>'
        + '<td align="right" style="font-family:' + SCHRIFT + ';font-size:11px;font-weight:700;letter-spacing:1.5px;color:' + GELB + ';">OSTFRIESLAND</td>'
        + '</tr></table></td></tr>'
        // Karte
        + '<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 18px 18px;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        + lokalBand(o.lokal)
        + '<tr><td style="padding:24px 28px 8px;font-family:' + SCHRIFT + ';font-size:15px;line-height:1.6;color:' + TEXT + ';">'
        + (st ? '<span style="display:inline-block;background:' + st[0] + ';color:' + st[1] + ';font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;margin-bottom:12px;">' + o.status.text + '</span>' : '')
        + (o.titel ? '<h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.3px;color:' + TEXT + ';">' + o.titel + '</h1>' : '')
        + (o.inhalt || '')
        + '</td></tr>'
        + '<tr><td style="padding:12px 28px 24px;font-family:' + SCHRIFT + ';font-size:12px;line-height:1.6;color:#78716c;">'
        + '<div style="border-top:1px solid ' + LINIE + ';padding-top:14px;">' + (o.fuss || 'Automatisch verschickt von kiekmolin.de.') + '</div>'
        + '</td></tr></table></td></tr>'
        // unter der Karte
        + '<tr><td align="center" style="padding:18px 12px 0;font-family:' + SCHRIFT + ';font-size:12px;color:#78716c;">'
        + '<a href="' + SITE + '" style="color:#57534e;text-decoration:none;font-weight:700;">kiekmolin.de</a> · Restaurants in Ostfriesland entdecken, bestellen, reservieren'
        + '</td></tr>'
        + '</table></td></tr></table></body></html>';
}

// ABSENDER UND ANTWORT (Ibo, 17.10.2026).
//
// Im Postfach stand bei jeder Mail nur "Kiek mol in" -- der Gast sah nicht,
// von welchem Lokal sie ist. Und wer auf die Mail antwortete ("wir kommen
// 15 Minuten spaeter"), schrieb an bestellung@kiekmolin.de, wo das Lokal
// es nie liest.
//
// Jetzt: "Die Millis über Kiek mol in <bestellung@kiekmolin.de>" -- die
// ADRESSE bleibt unsere (nur sie ist bei Resend bestaetigt; eine fremde
// Absenderadresse landet im Spam). Antworten gehen per reply_to an die
// E-Mail des Lokals, wenn eine gueltige hinterlegt ist.
function absender(lokalName, standard) {
    standard = String(standard || 'Kiek mol in <bestellung@kiekmolin.de>');
    var m = standard.match(/<([^>]+)>/);
    var adresse = m ? m[1] : standard.trim();
    var name = String(lokalName || '').replace(/["<>\\\r\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return name ? '"' + name + ' über Kiek mol in" <' + adresse + '>' : standard;
}
function antwortAn(rest) {
    var e = String(rest && rest.email || '').trim();
    return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/.test(e) && e.length <= 120 ? e : null;
}
// Der fertige Kopf fuer die Resend-Anfrage.
function versandKopf(rest, standard, lokalName) {
    var k = { from: absender((rest && rest.name) || lokalName, standard) };
    var r = antwortAn(rest);
    if (r) k.reply_to = r;
    return k;
}

// Verschicken mit Rueckfall. Lehnt Resend den neuen Absender ab (400/422 --
// etwa wegen eines Zeichens im Lokalnamen), geht dieselbe Mail sofort noch
// einmal mit dem alten Absender raus. Eine Mail mit schlichtem Absender ist
// besser als keine; der Rueckfall steht im Protokoll.
async function senden(apiKey, body, standard) {
    function los(b) {
        return fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(b)
        });
    }
    var res = await los(body);
    if (!res.ok && (res.status === 400 || res.status === 422) && standard && body.from !== standard) {
        var grund = ''; try { grund = await res.text(); } catch (e) {}
        console.warn('[mail] Absender "' + body.from + '" abgelehnt (' + res.status + ': ' + String(grund).slice(0, 120) + ') -- noch einmal mit ' + standard);
        res = await los(Object.assign({}, body, { from: standard }));
    }
    return res;
}

module.exports = { rahmen: rahmen, senden: senden, absender: absender, antwortAn: antwortAn, versandKopf: versandKopf, knopf: knopf, verweise: verweise, detailKarte: detailKarte, kasten: kasten,
    lokalUrl: lokalUrl, anlassText: anlassText, adresse: adresse, routeUrl: routeUrl, kalenderUrl: kalenderUrl, esc: esc, SITE: SITE };
