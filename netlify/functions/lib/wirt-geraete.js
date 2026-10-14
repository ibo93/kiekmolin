// DIE GERAETE EINES LOKALS -- OHNE DAS HANDY DES BETREIBERS.
//
// Ibo, 14.10.2026: "ich will kein wächter nachrichten oder so bekommen
// als admin". Auf Nachfrage: keine Kopien dessen, was die Wirte bekommen
// (neue Reservierung, Erinnerung, Absage, Kellner-Ruf, Waechter). Der
// Alarm der Gastweg-Wache und die Meldung bei einer neuen
// Gastronom-Anmeldung bleiben -- die gehen nur an ihn und sind seine.
//
// WARUM HIER GEFILTERT WIRD UND NICHT IN DER ABFRAGE
// Sein Handy kann eine restaurant_id tragen: die App setzt sie beim
// Eintragen aus dem zuletzt geoeffneten Lokal. Dann faende ihn die Suche
// "Geraete dieses Lokals" -- und sein Handy klingelte bei jedem Gast
// jedes Lokals, das er sich einmal angesehen hat.
//
// Ein Filter "customer_email=not.in.(...)" in der Abfrage waere kuerzer
// und FALSCH: in SQL ist NULL NOT IN (...) weder wahr noch falsch, die
// Zeile faellt heraus. Jedes Wirte-Handy ohne gespeicherte E-Mail bekaeme
// dann still gar nichts mehr. Deshalb hier, in JavaScript, wo ein
// fehlender Wert einfach "kein Admin" heisst.
//
// Faellt die Admin-Suche aus, gehen die Meldungen trotzdem an die Wirte.
// Lieber einmal eine Kopie zu viel beim Betreiber als eine Reservierung,
// die beim Wirt nie ankommt.
'use strict';

async function adminMails(supabaseUrl, schluessel) {
    try {
        var r = await fetch(supabaseUrl + '/rest/v1/customers?role=eq.superadmin&select=email', {
            headers: { apikey: schluessel, Authorization: 'Bearer ' + schluessel }
        });
        if (!r.ok) return [];
        var zeilen = await r.json();
        return (Array.isArray(zeilen) ? zeilen : [])
            .map(function (z) { return z && z.email ? String(z.email).trim().toLowerCase() : ''; })
            .filter(Boolean);
    } catch (e) {
        return [];
    }
}

function nurWirte(geraete, mails) {
    if (!Array.isArray(geraete)) return [];
    var admin = {};
    (mails || []).forEach(function (m) { admin[String(m).trim().toLowerCase()] = true; });
    return geraete.filter(function (g) {
        if (!g) return false;
        var m = g.customer_email ? String(g.customer_email).trim().toLowerCase() : '';
        return !(m && admin[m]);
    });
}

module.exports = { adminMails: adminMails, nurWirte: nurWirte };
