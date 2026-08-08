// Deterministischer Kartenparser fuer PDF-Text -- ohne Modell.
function parseKartenText(text, startKategorie) {
    var PREIS = /(\d{1,3},\d{2})\s*€/g;
    var zeilen = String(text || '').split('\n').map(function (z) { return z.replace(/\s+/g, ' ').trim(); })
                 .filter(Boolean);

    function preiseIn(z) {
        var m = z.match(/(\d{1,3},\d{2})\s*€/g);
        return m ? m.map(function (x) { return x.replace(/\s*€/, '').replace(',', '.'); }) : [];
    }
    // Spaltenkoepfe, die hinter der Ueberschrift stehen ("Pizza KLEIN GROSS")
    function ohneSpaltenkopf(z) {
        return z.replace(/\s*(KLEIN|GROSS|IM BROT|TELLER|PORTION|PREIS)\b/gi, '')
                .replace(/\s*\(Forts\.\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
    }
    // Ueberschriften sind mit '## ' markiert -- das kommt aus dem PDF selbst
    // (groessere oder fette Schrift), nicht aus einer Vermutung.
    function istUeberschrift(z) { return z.slice(0, 3) === '## '; }

    var out = [], kat = startKategorie || '', letztes = null;
    for (var i = 0; i < zeilen.length; i++) {
        var z = zeilen[i];
        if (istUeberschrift(z)) {
            var k = ohneSpaltenkopf(z.slice(3));
            if (k) { kat = k; letztes = null; }
            continue;
        }
        var pr = preiseIn(z);

        if (!pr.length) {
            // Beschreibung zum letzten Gericht
            if (letztes) {
                letztes.besch = (letztes.besch ? letztes.besch + ' ' : '') + z;
            }
            continue;
        }

        // Zeile mit Preis -> Gericht. Name = alles vor dem ersten Preis.
        var vor = z.slice(0, z.search(/\d{1,3},\d{2}\s*€/)).trim();
        var nr = '';
        var m = vor.match(/^(\d+\s?[A-Za-z]?)\.\s*(.*)$/);
        if (m) { nr = m[1].replace(/\s+/g, ''); vor = m[2].trim(); }
        // Hinweiszeilen sind keine Gerichte: "Extra Zutaten: klein 1,00 €",
        // "Menü-Upgrade: ... +5,00 €", "mit einer Zutat nach Wahl kostenlos".
        if (/[:+]/.test(vor) || /^[a-zäöüß]/.test(vor) || /\b(Zutat|Upgrade|erhältlich|kostenlos)\b/i.test(vor)) {
            if (letztes) letztes.besch = (letztes.besch ? letztes.besch + ' ' : '') + z;
            continue;
        }
        // Name laeuft in die naechste Zeile ("120. Pronto Pronto-Platte (für 4"
        // / "Pers.)") -- erkennbar an der offenen Klammer.
        if ((vor.match(/\(/g) || []).length > (vor.match(/\)/g) || []).length
            && i + 1 < zeilen.length && !preiseIn(zeilen[i + 1]).length) {
            vor = (vor + ' ' + zeilen[++i]).replace(/\s+/g, ' ').trim();
        }
        if (!vor) {
            // Preis ohne Namen (Name stand eine Zeile vorher, ohne Preis)
            if (letztes && !letztes.preise.length) { letztes.preise = pr; continue; }
            continue;
        }
        letztes = { nr: nr, name: vor, besch: '', preise: pr, kat: kat };
        out.push(letztes);
    }

    // Allergen-/Zusatzstoffklammern aus der Beschreibung holen
    out.forEach(function (g) {
        var alg = [], zus = [];
        g.besch = g.besch.replace(/\(([a-nA-N0-9 ,\.]{1,24})\)/g, function (all, inhalt) {
            var teile = inhalt.split(/[,\s]+/).filter(Boolean);
            var passt = teile.every(function (t) { return /^([a-nA-N]|\d{1,2})$/.test(t); });
            if (!passt) return all;
            teile.forEach(function (t) { (/^\d/.test(t) ? zus : alg).push(t.toLowerCase()); });
            return '';
        }).replace(/\s+/g, ' ').trim();
        g.allergene = alg; g.zusatz = zus;
    });
    return out;
}

if (require.main === module) {
    var fs = require('fs');
    var seiten = [fs.readFileSync('/tmp/karten/seite1.txt', 'utf8'), fs.readFileSync('/tmp/karten/seite2.txt', 'utf8')];
    var WAHR = JSON.parse(fs.readFileSync('/tmp/karten/pronto-wahrheit.json', 'utf8'));
    var alle = [];
    var letzteKat = '';
    seiten.forEach(function (t) {
        var teil = parseKartenText(t, letzteKat);
        if (teil.length) letzteKat = teil[teil.length - 1].kat;
        alle = alle.concat(teil);
    });

    function n(s) { return String(s || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, ''); }
    var nach = {}; alle.forEach(function (g) { nach[n(g.name) + '|' + g.nr] = g; });

    var gef = 0, pr = 0, kat = 0, fehlt = [];
    WAHR.forEach(function (w) {
        var g = nach[n(w.name) + '|' + w.nr];
        if (!g) { fehlt.push(w.nr + ' ' + w.name); return; }
        gef++;
        if (JSON.stringify(g.preise) === JSON.stringify(w.preise)) pr++;
        if (n(g.kat) === n(w.kat)) kat++;
    });
    var zuviel = alle.filter(function (g) {
        return !WAHR.some(function (w) { return n(w.name) === n(g.name) && w.nr === g.nr; });
    });
    console.log('OHNE MODELL, nur feste Regeln:');
    console.log('  Gerichte gefunden : ' + gef + ' / ' + WAHR.length);
    console.log('  Preise richtig    : ' + pr + ' / ' + WAHR.length);
    console.log('  Kategorie richtig : ' + kat + ' / ' + WAHR.length);
    console.log('  Eintraege gesamt  : ' + alle.reduce(function (a, g) { return a + g.preise.length; }, 0));
    if (fehlt.length) console.log('  FEHLEN (' + fehlt.length + '): ' + fehlt.slice(0, 10).join(' / '));
    if (zuviel.length) console.log('  ZU VIEL (' + zuviel.length + '): ' + zuviel.slice(0, 10).map(function (g) { return (g.nr || '-') + ' ' + g.name; }).join(' / '));
}
module.exports = { parseKartenText: parseKartenText };
