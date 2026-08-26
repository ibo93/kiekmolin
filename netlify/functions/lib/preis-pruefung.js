// Kiek mol in — die Preise einer Bestellung serverseitig gegenrechnen.
//
// Liegt in lib/, damit Netlify die Datei nicht als eigene Function deployt.
//
// WARUM ES DAS GIBT
// =================
// Bis hierher wurden subtotal, delivery_fee und total genau so gespeichert,
// wie der Browser sie geschickt hat. Wer die Entwicklerkonsole aufmacht --
// auf jedem Handy zwei Griffe -- bestellt fuer 1 Euro. Der Wirt sieht eine
// ganz normale Bestellung und kocht.
//
// DIE ENTSCHEIDENDE ENTWURFSFRAGE: UNTERGRENZE STATT NACHRECHNEN
// ==============================================================
// Naheliegend waere, den Preis exakt nachzurechnen und bei Abweichung
// abzulehnen. Das ist die gefaehrlichere Loesung. Preise entstehen an
// mehreren Stellen -- Grundpreis, Groessen, Extras mit Menge, Aktionspreise
// aus menu_cross_sells -- und wenn morgen eine weitere Regel dazukommt, die
// hier niemand nachtraegt, lehnt der Server ECHTE Bestellungen ab. Ein
// verlorener Gast kostet mehr als ein verhinderter Betrug einbringt.
//
// Deshalb rechnet diese Pruefung keinen Sollpreis aus, sondern eine
// UNTERGRENZE: was kann dieses Gericht im guenstigsten legitimen Fall
// kosten? Das ist der kleinste Preis, der in der Datenbank fuer dieses
// Gericht steht -- Grundpreis, kleinste Groesse oder Aktionspreis, je
// nachdem was niedriger ist. Extras koennen nur draufkommen, nie abziehen.
//
// Damit gilt: jede Regel, die es heute gibt oder morgen geben wird, kann
// den Preis nur ERHOEHEN. Eine Untergrenze kann also nie eine ehrliche
// Bestellung ablehnen -- aber sie faengt genau den Fall, um den es geht:
// 40-Euro-Bestellung fuer 1 Euro.
//
// WAS NICHT GEPRUEFT WERDEN KANN, WIRD NICHT ABGELEHNT
// =====================================================
// Steht ein Gericht nicht in der Karte (alte Bestellung nachbestellt,
// Gericht inzwischen geloescht), laesst sich nichts vergleichen. Das wird
// gezaehlt und gemeldet, aber nicht blockiert. Wer das ausnutzen will, muss
// einen Gerichtnamen erfinden, den es nicht gibt -- und dann steht in der
// Kueche eine Bestellung ueber ein Gericht, das niemand kennt. Der Angriff,
// der gefaehrlich ist, ist der unsichtbare: richtiger Name, falscher Preis.
// Genau der wird gefangen.
//
// UND DAS WICHTIGSTE ZUM SCHLUSS
// ===============================
// Diese Pruefung wirkt nur, wenn der Browser nicht daran vorbei kann. Solange
// die Tabelle "orders" Inserts mit dem oeffentlichen Schluessel erlaubt,
// schickt ein Angreifer seine Bestellung einfach direkt an PostgREST. Der
// Riegel ist eine RLS-Regel in Supabase; diese Datei ist die Tuer. Beides
// zusammen schliesst. Der fertige SQL-Befehl steht in
// netlify/functions/README-preise.md.

'use strict';

// Ein Cent Spielraum fuer Rundung. Die App rechnet in Fliesskomma
// (0.1 + 0.2 = 0.30000000000000004); auf zwei Nachkommastellen gerundet ist
// eine Abweichung von einem Cent kein Betrug, sondern Arithmetik.
var SPIELRAUM = 0.011;

function zahl(x) {
    var n = parseFloat(x);
    return isFinite(n) ? n : 0;
}

// Gerichtnamen vergleichbar machen.
//
// Der Name ist der Notnagel, wenn keine menu_item_id mitkommt -- und das
// kommt vor: beim Nachbestellen aus dem Verlauf und bei Gruppenbestellungen
// wird der Warenkorb aus alten Daten aufgebaut. Dabei haengt die App
// Zusaetze an: "Pizza Salami (Peter)" bei der Gruppenbestellung,
// "Pommes (Aktionspreis)" beim Cross-Sell. Die kommen weg, sonst findet der
// Vergleich nichts und die Pruefung faellt still aus.
function normName(s) {
    return String(s == null ? '' : s)
        .replace(/\s*\([^()]*\)\s*$/, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

// Die Untergrenze fuer EIN Gericht aus der Karte.
//
// Alles, was in der Datenbank als Preis fuer dieses Gericht steht, und davon
// das Kleinste. Groessen liegen als JSON daneben; ist die Spalte leer oder
// kaputt, wird sie einfach uebersprungen.
function untergrenzeGericht(mi, aktionspreise) {
    var kandidaten = [];
    if (mi.base_price != null && zahl(mi.base_price) > 0) kandidaten.push(zahl(mi.base_price));
    if (mi.price != null && zahl(mi.price) > 0) kandidaten.push(zahl(mi.price));

    var groessen = mi.sizes;
    if (typeof groessen === 'string') { try { groessen = JSON.parse(groessen); } catch (e) { groessen = null; } }
    if (Array.isArray(groessen)) {
        groessen.forEach(function (g) {
            var p = zahl(g && g.price);
            if (p > 0) kandidaten.push(p);
        });
    }

    // Aktionspreis aus menu_cross_sells: der Wirt bietet ein Gericht
    // guenstiger an, wenn es zu einem anderen dazu bestellt wird. Er liegt
    // unter dem Grundpreis und gehoert deshalb zwingend in die Untergrenze.
    var akt = aktionspreise && aktionspreise[mi.id];
    if (akt != null && zahl(akt) > 0) kandidaten.push(zahl(akt));

    if (!kandidaten.length) return null;      // Gericht ohne jeden Preis
    return Math.min.apply(null, kandidaten);
}

// Aus den Kartendaten ein Nachschlagewerk bauen: nach id UND nach Name.
function bauKarte(menuItems, crossSells) {
    var aktionspreise = {};
    (crossSells || []).forEach(function (c) {
        var p = zahl(c && c.cross_sell_price);
        if (!c || !c.target_item_id || p <= 0) return;
        var bisher = aktionspreise[c.target_item_id];
        if (bisher == null || p < bisher) aktionspreise[c.target_item_id] = p;
    });

    var nachId = {}, nachName = {};
    (menuItems || []).forEach(function (mi) {
        if (!mi) return;
        var grenze = untergrenzeGericht(mi, aktionspreise);
        if (grenze == null) return;
        if (mi.id) nachId[mi.id] = grenze;
        var nn = normName(mi.name);
        // Zwei Gerichte gleichen Namens: das guenstigere gewinnt, sonst
        // wuerde die Untergrenze zu hoch liegen und ehrlich ablehnen.
        if (nn && (nachName[nn] == null || grenze < nachName[nn])) nachName[nn] = grenze;
    });
    return { nachId: nachId, nachName: nachName };
}

// Die eigentliche Pruefung.
//
// Bekommt die Bestellung, wie sie gespeichert werden soll, und die Daten aus
// der Datenbank. Gibt zurueck, ob sie durchgeht -- und wenn nicht, warum,
// in einem Satz, den man einem Gast zeigen kann.
function pruefe(order, daten) {
    var karte = bauKarte(daten.menuItems, daten.crossSells);
    var posten = Array.isArray(order.items) ? order.items : [];

    var untergrenzeSumme = 0;
    var ungeprueft = [];

    posten.forEach(function (p) {
        var menge = parseInt(p && p.quantity, 10);
        if (!(menge > 0)) menge = 1;
        var grenze = null;
        if (p && p.menu_item_id && karte.nachId[p.menu_item_id] != null) {
            grenze = karte.nachId[p.menu_item_id];
        } else {
            var nn = normName(p && p.name);
            if (nn && karte.nachName[nn] != null) grenze = karte.nachName[nn];
        }
        if (grenze == null) { ungeprueft.push((p && p.name) || '?'); return; }
        untergrenzeSumme += grenze * menge;
    });

    // Die Liefergebuehr steht im Restaurant und nirgendwo sonst. Bei Abholung
    // ist sie null. Sie war der zweite offene Weg: Liefergebuehr auf 0 setzen
    // und der Wirt faehrt umsonst.
    var gebuehrSoll = 0;
    if (order.order_type === 'delivery' && daten.restaurant) {
        gebuehrSoll = zahl(daten.restaurant.delivery_fee);
        // Hat der Wirt eine Schwelle fuer kostenlose Lieferung hinterlegt,
        // wird die Gebuehr hier gar nicht erst verlangt.
        //
        // Heute rechnet die App die Schwelle nicht ein -- sie zeigt nur den
        // Hinweis "Kostenlose Lieferung!" und berechnet die Gebuehr trotzdem
        // (eigener Fehler, eigene Baustelle). Wird das eines Tages richtig
        // gemacht, faengt diese Pruefung sonst an, ehrliche Bestellungen
        // abzulehnen. Zwei Euro Deckung weniger sind der bessere Tausch: der
        // Schutz steckt in der Untergrenze der Gerichte, nicht in der Gebuehr.
        if (zahl(daten.restaurant.free_delivery_from) > 0) gebuehrSoll = 0;
    }
    var gebuehrIst = zahl(order.delivery_fee);

    // Der Gutschein: was er hoechstens abziehen darf, steht in der Tabelle.
    //
    // Prozent rechnet auf die UNTERGRENZE, nicht auf die gemeldete Summe --
    // sonst liesse sich der Rabatt ueber eine erfundene hohe Summe aufblasen
    // ("Summe 1000 Euro, davon 10 Prozent, macht 100 Euro Rabatt").
    //
    // Dieser Betrag geht NUR in den Mindestpreis ein. Er wird ausdruecklich
    // NICHT einzeln mit dem gemeldeten Rabatt verglichen: 10 Prozent auf die
    // echte Summe sind mehr als 10 Prozent auf die Untergrenze, und ein
    // solcher Vergleich haette jede ehrliche Bestellung mit Prozent-Gutschein
    // abgelehnt (8,50 Pizza, 0,85 Rabatt, erlaubt waeren rechnerisch nur
    // 0,65). Der Vergleich am Ende faengt denselben Betrug, ohne diesen
    // Fehler: aufgeblasener Rabatt druecke den Gesamtpreis unter den
    // Mindestpreis, und genau darauf wird geschaut.
    var rabattMax = 0;
    if (daten.coupon) {
        var wert = zahl(daten.coupon.value);
        if (String(daten.coupon.type || '').indexOf('percent') >= 0 || daten.coupon.type === '%') {
            rabattMax = untergrenzeSumme * (wert / 100);
        } else {
            rabattMax = wert;
        }
        if (rabattMax > untergrenzeSumme) rabattMax = untergrenzeSumme;
    }

    // Trinkgeld ist frei, aber nicht negativ -- ein negatives Trinkgeld waere
    // ein Abzug mit anderem Namen.
    var trinkgeld = zahl(order.tip);

    var gemeldet = zahl(order.total);
    var mindestens = untergrenzeSumme + gebuehrSoll + Math.max(0, trinkgeld) - rabattMax;
    if (mindestens < 0) mindestens = 0;

    var gruende = [];

    // DER MINDESTBESTELLWERT -- BISHER NUR IM BROWSER GEPRUEFT.
    //
    // Gefragt am 26.08.2026: "was fehlt bei online bestellung
    // mindestbestellung beim liefern". Nachgemessen: der Wert steht in
    // restaurants.min_order_value, der Gast sieht ihn im Warenkorb
    // ("Noch 4,20 EUR bis Mindestbestellwert"), und der Checkout blockt
    // darunter -- aber NUR im Browser. Der Server holte vom Restaurant
    // bis dahin nur id und delivery_fee.
    //
    // Eine Regel, die nur im Browser steht, ist keine Regel. Sie faellt
    // weg bei einer alten App aus dem Zwischenspeicher (genau das ist
    // gestern passiert), bei einem Fehler in der Anzeige, und natuerlich
    // bei jedem, der die Adresse direkt aufruft. Der Wirt faehrt dann
    // fuer 6 Euro los oder muss absagen -- beides kostet ihn.
    //
    // Gilt nur bei Lieferung. Abholung hat keinen Mindestwert, und die
    // Probe der Wache bestellt zur Abholung.
    var mindestBestellwert = (order.order_type === 'delivery' && daten.restaurant)
        ? zahl(daten.restaurant.min_order_value) : 0;
    if (mindestBestellwert > 0) {
        // Gegen die UNTERGRENZE der Gerichte rechnen, nicht gegen die
        // gemeldete Zwischensumme -- sonst liesse sich der
        // Mindestbestellwert mit einer erfundenen hohen Zahl erschlagen.
        var warenwert = untergrenzeSumme;
        if (warenwert < mindestBestellwert - SPIELRAUM) {
            gruende.push('Warenwert ' + warenwert.toFixed(2)
                + ' unter dem Mindestbestellwert ' + mindestBestellwert.toFixed(2)
                + ' fuer Lieferung');
        }
    }

    if (trinkgeld < -SPIELRAUM) {
        gruende.push('negatives Trinkgeld');
    }
    if (gebuehrIst < gebuehrSoll - SPIELRAUM) {
        gruende.push('Liefergebuehr ' + gebuehrIst.toFixed(2) + ' statt ' + gebuehrSoll.toFixed(2));
    }
    if (gemeldet < mindestens - SPIELRAUM) {
        gruende.push('Gesamt ' + gemeldet.toFixed(2) + ' unter dem Mindestpreis ' + mindestens.toFixed(2));
    }

    return {
        ok: gruende.length === 0,
        gruende: gruende,
        mindestens: Math.round(mindestens * 100) / 100,
        mindestbestellwert: Math.round(mindestBestellwert * 100) / 100,
        gemeldet: Math.round(gemeldet * 100) / 100,
        ungeprueft: ungeprueft,
        geprueft: posten.length - ungeprueft.length
    };
}

module.exports = { pruefe: pruefe, bauKarte: bauKarte, untergrenzeGericht: untergrenzeGericht, normName: normName, SPIELRAUM: SPIELRAUM };
