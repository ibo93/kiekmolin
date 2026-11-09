// PORTIONEN ZAEHLEN (09.11.2026).
//
// Ibo: "Ja mache" -- zur Idee aus den Mise-Fotos: statt nur "ausverkauft"
// stellt die Kueche ein, wie viele Portionen es heute noch gibt
// (menu_items.portionen_rest, datenbank/52-ausverkauft.sql). Jede Bestellung
// zieht ab; bei 0 ist das Gericht von selbst ausverkauft.
//
// Das Abziehen passiert in EINER Datenbankfunktion (kmi_portionen_buchen):
// zwei Gaeste, die gleichzeitig die letzte Lammhaxe bestellen, bekommen sie
// nicht beide -- die Zeile ist waehrend der Pruefung gesperrt.
//
// Drei Arten:
//   pruefen    erst pruefen, dann abziehen; reicht es nicht -> ok:false
//   erzwingen  abziehen ohne Ablehnen (PayPal: das Geld ist schon da), nie unter 0
//   zurueck    zurueckbuchen (die Bestellung liess sich doch nicht speichern)
//
// Fehlt die Funktion (SQL 52 nicht eingespielt) oder klemmt die Abfrage,
// geht die Bestellung DURCH -- wie beim Preis-Schutz: eine Stoerung beim
// Nachschlagen darf keine echten Bestellungen verhindern. Es wird aber
// vermerkt (fehlt / fehler), damit es im Protokoll steht.

'use strict';

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Posten einer Bestellung -> [{ id, menge }], gleiche Gerichte zusammengezaehlt.
function posten(order) {
    var summe = {};
    ((order && order.items) || []).forEach(function (it) {
        var id = it && it.menu_item_id;
        if (!id || !UUID.test(String(id))) return;
        var m = parseInt(it.quantity, 10);
        if (!(m > 0)) m = 1;
        summe[id] = (summe[id] || 0) + m;
    });
    return Object.keys(summe).map(function (id) { return { id: id, menge: summe[id] }; });
}

async function buchen(url, key, restaurantId, liste, art) {
    if (!liste || !liste.length) return { ok: true, leer: true };
    if (!key || !restaurantId) return { ok: true, fehler: 'kein Schluessel/Lokal' };
    var res;
    try {
        res = await fetch(url + '/rest/v1/rpc/kmi_portionen_buchen', {
            method: 'POST',
            headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_restaurant: restaurantId, p_posten: liste, p_art: art || 'pruefen' })
        });
    } catch (e) {
        console.warn('[portionen] nicht erreichbar: ' + e.message);
        return { ok: true, fehler: e.message };
    }
    var text = ''; try { text = await res.text(); } catch (e) {}
    if (!res.ok) {
        var fehlt = res.status === 404 || /PGRST202|Could not find the function|kmi_portionen_buchen/.test(text);
        if (!fehlt) console.warn('[portionen] Fehler ' + res.status + ': ' + text.slice(0, 200));
        return fehlt ? { ok: true, fehlt: true } : { ok: true, fehler: 'HTTP ' + res.status };
    }
    var d = null; try { d = JSON.parse(text); } catch (e) {}
    if (d && d.ok === false) return { ok: false, gericht: d.gericht || null, rest: typeof d.rest === 'number' ? d.rest : 0 };
    return { ok: true, gebucht: true };
}

// Der Satz fuer den Gast.
function satz(ergebnis) {
    var g = (ergebnis && ergebnis.gericht) ? '„' + ergebnis.gericht + '“' : 'Ein Gericht';
    var r = ergebnis && ergebnis.rest;
    return r > 0
        ? 'Von ' + g + ' gibt es heute nur noch ' + r + (r === 1 ? ' Portion' : ' Portionen') + '. Bitte ändere die Menge im Warenkorb.'
        : g + ' ist gerade ausverkauft. Bitte nimm es aus dem Warenkorb.';
}

module.exports = { posten: posten, buchen: buchen, satz: satz };
