'use strict';

// DIE WARTEZEIT — EINE STELLE, DIE ENTSCHEIDET.
//
// Ibo am 13.09.2026: "bei Abholung steht 25 min, muss auf der Mail 25 min
// stehen ... so haben sie eine direkte Bestaetigung, dann muessen die es
// nicht bestaetigen."
//
// Bisher wusste NUR der Browser des Wirts, was zugesagt wird. Die
// automatische Annahme lief in index.html und nur nach einem Kassen-Push
// -- also nur, solange das Dashboard offen war. Wer kein Dashboard offen
// hatte, dessen Gast bekam gar nichts.
//
// Diese Datei ist die Server-Fassung derselben Regeln wie
// vorbereitungsMinuten() und wartezeitAn() in index.html. Zwei Stellen
// mit zwei Regeln laufen frueher oder spaeter auseinander -- und dann
// steht in der Mail eine andere Zahl als auf dem Bildschirm.
//
// Gespeichert wird in restaurants.features:
//   prep_pickup:25     Abholung in 25 Minuten
//   prep_delivery:60   Lieferung in 60 Minuten
//   prep_off           gar keine Zusage machen
//   prep_auto          Bestellung sofort bestaetigen (NEU)

function liste(features) {
    return Array.isArray(features) ? features : [];
}

// Wartezeit an oder aus. FEHLT der Eintrag, ist sie AN -- damit sich fuer
// die bestehenden Betriebe nichts aendert.
function an(features) {
    return liste(features).indexOf('prep_off') < 0;
}

function minuten(features, orderType) {
    var lieferung = orderType === 'delivery';
    var schluessel = lieferung ? 'prep_delivery' : 'prep_pickup';
    var feats = liste(features);
    for (var i = 0; i < feats.length; i++) {
        var m = new RegExp('^' + schluessel + ':(\\d+)$').exec(String(feats[i]));
        if (m) {
            var v = parseInt(m[1], 10);
            // Grenzen wie im Browser: unter 5 Minuten ist keine ehrliche
            // Zusage, ueber 180 kein Restaurantbetrieb mehr.
            if (v >= 5 && v <= 180) return v;
        }
    }
    return lieferung ? 45 : 25;
}

// Sofort bestaetigen -- NUR wenn der Wirt es eingeschaltet hat.
//
// Absichtlich andersherum als prep_off: FEHLT der Eintrag, passiert
// nichts. Jedes Restaurant hat eine Wartezeit (25/45 als Vorgabe). Waere
// das die Bedingung, wuerde ueber Nacht auf der ganzen Plattform die
// Annahme wegfallen -- und kein Wirt koennte eine Bestellung mehr
// ablehnen, weil die Kueche voll ist oder etwas aus ist.
function sofort(features) {
    return liste(features).indexOf('prep_auto') >= 0;
}

// Was in die Bestellung geschrieben wird -- oder null, wenn nichts.
//
// vorbestellung: der Gast hat eine Wunschzeit gewaehlt. Dann waere "in 25
// Minuten" gelogen; die Bestellung geht den normalen Weg.
function zusage(features, orderType, vorbestellung, jetzt) {
    if (!sofort(features)) return null;
    if (vorbestellung) return null;

    var stempel = new Date(jetzt || Date.now());
    var feld = { status: 'accepted', accepted_at: stempel.toISOString() };

    // Schalter auf aus: angenommen ja, Zusage nein. Die Felder bleiben
    // leer, statt auf einer Zahl zu stehen, die niemand versprochen hat.
    if (an(features)) {
        var min = minuten(features, orderType);
        feld.estimated_minutes = min;
        feld.estimated_time = new Date(stempel.getTime() + min * 60000).toISOString();
    }
    return feld;
}

module.exports = { an: an, minuten: minuten, sofort: sofort, zusage: zusage };
