// DIE GERAETE DES BETREIBERS (Superadmin) -- an einer Stelle.
//
// 14.10.2026: keine Kopien der Wirte-Meldungen an ihn.
// 27.10.2026: doch -- "ich will selber alles auch kontrollieren der wirt
// ist selber oft vergesslich", "es hat nie geklappt". Genutzt von
// pending-reminder.js (jede neue Reservierung/Bestellung + Erinnerung)
// und admin-meldungen.js (Test an sein Handy).
'use strict';

function kopf(key) { return { apikey: key, Authorization: 'Bearer ' + key }; }

// DIE GERAETE DES BETREIBERS -- gross/klein egal.
//
// Bis 27.10.2026 suchte der Melder mit customer_email=in.("ibo@...").
// Das vergleicht Buchstabe fuer Buchstabe: steht in push_subscriptions
// "Ibo@..." und in customers "ibo@...", wird das Handy nie gefunden --
// still, ohne Fehler. Deshalb ilike je Adresse und danach in JavaScript
// genau verglichen (ilike kennt _ und % als Platzhalter).
async function geraete(url, key, mails) {
    mails = (mails || []).map(function (m) { return String(m).trim().toLowerCase(); }).filter(Boolean);
    if (!mails.length || !url || !key) return [];
    var oder = mails.map(function (m) { return 'customer_email.ilike."' + m.replace(/"/g, '') + '"'; }).join(',');
    var r = await fetch(url + '/rest/v1/push_subscriptions?or=(' + encodeURIComponent(oder) + ')'
        + '&select=id,endpoint,p256dh_key,auth_key,customer_email', { headers: kopf(key) });
    if (!r.ok) throw new Error('Geraete nicht lesbar (' + r.status + ')');
    var gesehen = {};
    return ((await r.json()) || []).filter(function (g) {
        var m = g && g.customer_email ? String(g.customer_email).trim().toLowerCase() : '';
        if (mails.indexOf(m) < 0 || !g.endpoint || gesehen[g.endpoint]) return false;
        gesehen[g.endpoint] = true;
        return true;
    });
}

module.exports = { geraete: geraete };
