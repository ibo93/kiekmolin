// AKTIONEN -- WELCHE GILT FUER DIESEN TERMIN?
//
// Seit dem 06.10.2026, gebaut fuer den ersten Shisha-Bar-Kunden: Ladies
// Night, Party, Happy Hour, "10 % bei Online-Reservierung". Der Wirt legt
// sie selbst an (Tabelle aktionen, SQL 38).
//
// Dieselbe Regel steht im Browser (index.html, aktionPasst). Beide werden in
// tests/aktionen-test.js mit DENSELBEN Faellen geprueft -- zwei Fassungen,
// die auseinanderlaufen, sind schlimmer als eine unbequeme.
//
// DIE REGELN
//   - Wochentage zaehlen ab Montag: 0 = Montag ... 6 = Sonntag. Genau wie
//     rest_day -- eine dritte Zaehlweise im Haus waere eine Falle.
//   - "bis" vor "von" heisst ueber Mitternacht (Ladies Night 21-03 Uhr).
//     Die Aktion gehoert dem Tag, an dem sie ANFAENGT -- wie die Schichten
//     in aktiveSchicht(). Reservieren laesst sich ohnehin nur bis 23:30.
//   - Ohne Uhrzeit gilt die Aktion den ganzen Tag.
//   - gueltig_ab / gueltig_bis begrenzen optional den Zeitraum.

'use strict';

var TAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
var TAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function minuten(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t == null ? '' : t));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 'JJJJ-MM-TT' -> Wochentag ab Montag. Aus den Ziffern gerechnet, nicht aus
// new Date('JJJJ-MM-TT'): das waere UTC, und auf dem Server (UTC) und im
// Browser (Europa) kaeme sonst nicht immer derselbe Tag heraus.
function wochentag(datum) {
    var t = String(datum || '').split('-').map(Number);
    if (t.length !== 3 || !t[0] || !t[1] || !t[2]) return null;
    var js = new Date(Date.UTC(t[0], t[1] - 1, t[2])).getUTCDay();
    return (js + 6) % 7;
}

function passt(a, datum, uhrzeit) {
    if (!a || a.aktiv === false) return false;
    var d = String(datum || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (a.gueltig_ab && d < String(a.gueltig_ab).slice(0, 10)) return false;
    if (a.gueltig_bis && d > String(a.gueltig_bis).slice(0, 10)) return false;

    if (a.datum) {
        if (String(a.datum).slice(0, 10) !== d) return false;
    } else {
        var tage = Array.isArray(a.wochentage) ? a.wochentage.map(Number) : [];
        if (tage.indexOf(wochentag(d)) < 0) return false;
    }

    var von = minuten(a.von), bis = minuten(a.bis), t = minuten(uhrzeit);
    if (t == null || (von == null && bis == null)) return true;      // ganzer Tag
    if (von != null && bis != null) {
        if (bis > von) return t >= von && t <= bis;
        return t >= von;                                              // ueber Mitternacht: ab Beginn
    }
    if (von != null) return t >= von;
    return t <= bis;
}

// Aktionen, die fuer eine Reservierung an diesem Tag zu dieser Uhrzeit
// gelten. Vorteile zuerst -- die muss das Personal wissen.
function fuerReservierung(liste, datum, uhrzeit) {
    return (Array.isArray(liste) ? liste : [])
        .filter(function (a) { return a && (a.gilt_fuer === 'alle' || a.gilt_fuer === 'reservierung'); })
        .filter(function (a) { return passt(a, datum, uhrzeit); })
        .sort(function (x, y) {
            var vx = x.vorteil ? 0 : 1, vy = y.vorteil ? 0 : 1;
            return vx - vy || (Number(x.reihenfolge) || 0) - (Number(y.reihenfolge) || 0);
        });
}

// Was an der Reservierung steht -- fuer das Personal. Nur Aktionen MIT
// Vorteil: "Party am Samstag" muss niemand an der Kasse wissen.
function textFuerReservierung(liste) {
    var mit = (Array.isArray(liste) ? liste : []).filter(function (a) { return a && a.vorteil; }).slice(0, 2);
    if (!mit.length) return null;
    return mit.map(function (a) {
        return String(a.titel || 'Aktion').slice(0, 80) + ': ' + String(a.vorteil).slice(0, 120);
    }).join(' · ').slice(0, 240);
}

// "Jeden Donnerstag · 21:00–03:00", "Sa 25.10. · ab 22:00", "Mo–Fr · 17:00–19:00"
function zeitplanText(a) {
    if (!a) return '';
    var teile = [];
    if (a.datum) {
        var t = String(a.datum).slice(0, 10).split('-');
        var wt = wochentag(a.datum);
        teile.push((wt != null ? TAGE_KURZ[wt] + ' ' : '') + Number(t[2]) + '.' + Number(t[1]) + '.');
    } else {
        var tage = (Array.isArray(a.wochentage) ? a.wochentage.map(Number) : []).filter(function (x) { return x >= 0 && x <= 6; });
        tage = tage.filter(function (x, i) { return tage.indexOf(x) === i; }).sort();
        if (tage.length === 7) teile.push('Täglich');
        else if (tage.length === 1) teile.push('Jeden ' + TAGE_LANG[tage[0]]);
        else if (tage.length > 2 && tage[tage.length - 1] - tage[0] === tage.length - 1)
            teile.push(TAGE_KURZ[tage[0]] + '–' + TAGE_KURZ[tage[tage.length - 1]]);
        else teile.push(tage.map(function (x) { return TAGE_KURZ[x]; }).join(', '));
    }
    var von = a.von ? String(a.von).slice(0, 5) : '', bis = a.bis ? String(a.bis).slice(0, 5) : '';
    if (von && bis) teile.push(von + '–' + bis);
    else if (von) teile.push('ab ' + von);
    else if (bis) teile.push('bis ' + bis);
    return teile.join(' · ');
}

// Aktionen eines Hauses lesen -- mit dem Dienstschluessel, auf dem Server.
// FAELLT OFFEN AUS: fehlt die Tabelle (SQL 38 nicht eingespielt) oder
// klemmt die Datenbank, gibt es keine Aktion -- aber die Reservierung geht
// durch. Eine Werbeaktion darf nie einen Gast abweisen; genau das hat am
// 25.08.2026 vier Gaeste gekostet.
async function lesen(restaurantId, schluessel, basisUrl) {
    try {
        var url = (basisUrl || process.env.SUPABASE_URL || 'https://mvrgmbdokdzmumdyezha.supabase.co')
            + '/rest/v1/aktionen?restaurant_id=eq.' + encodeURIComponent(restaurantId)
            + '&aktiv=eq.true&select=id,titel,art,gilt_fuer,vorteil,wochentage,datum,von,bis,gueltig_ab,gueltig_bis,aktiv,reihenfolge';
        var res = await fetch(url, { headers: { 'apikey': schluessel, 'Authorization': 'Bearer ' + schluessel } });
        if (!res.ok) return [];
        var zeilen = await res.json();
        return Array.isArray(zeilen) ? zeilen : [];
    } catch (e) {
        return [];
    }
}

module.exports = {
    passt: passt, fuerReservierung: fuerReservierung, textFuerReservierung: textFuerReservierung,
    zeitplanText: zeitplanText, wochentag: wochentag, lesen: lesen
};
