// AUS DEN SVG-DATEIEN DIE MERKMAL-SYMBOLE IN index.html ERZEUGEN.
//
// WARUM ES DIESES WERKZEUG GIBT
// -----------------------------
// Die Symbole liegen als einzelne Dateien unter public/icons/allergens/ --
// dort kann man sie oeffnen, ansehen und in jedem Zeichenprogramm aendern.
// In der App stehen sie aber INLINE in index.html, weil die App eine einzige
// Datei ist: 48 <img>-Aufrufe waeren 48 zusaetzliche Anfragen fuer Symbole
// von 15 Pixeln, und ueber <img> koennen sie die Textfarbe nicht erben.
//
// Zwei Orte fuer dieselbe Sache laufen auseinander. Deshalb ist die Datei die
// Quelle und index.html das Erzeugnis: hier drin steht die Umrechnung, und
// tests/symbol-rahmen-test.js rechnet sie nach und schlaegt an, sobald beides
// nicht mehr zusammenpasst.
//
//   node tools/symbole-bauen.js          schreibt index.html neu
//   node tools/symbole-bauen.js --pruefe meldet nur, ob es passt
//
// WAS DABEI UMGERECHNET WIRD
// --------------------------
// 1. WEISS WIRD ZU LOCH. In den Dateien sind Augen, Nuestern und Glanzlichter
//    weisse Formen ueber der schwarzen. Auf weissem Grund sieht das richtig
//    aus. Die App hat aber einen Dunkelmodus -- dort staenden weisse Punkte
//    auf dunklem Grund. Also wandern alle weissen Teile in eine <mask> und
//    werden damit zu echten Aussparungen, durch die der Hintergrund
//    durchscheint, welcher auch immer das ist.
//
//    Eine Maske statt fill-rule="evenodd": bei evenodd wuerde JEDE
//    Ueberlappung zweier schwarzer Formen zum Loch, und in diesen Zeichnungen
//    ueberlappen sich viele (Ohren am Kopf, Kamm am Kopf). Die Maske trennt
//    sauber zwischen "was ist da" und "was ist ausgespart".
//
// 2. JEDES SYMBOL BEKOMMT SEINEN AUSSCHNITT. Ein Kuhkopf ist quadratisch,
//    eine Aehre schmal und hoch. In demselben Kasten fuellt der Kopf ihn und
//    die Aehre steht als Streifen darin -- der Satz sieht dann halbfertig
//    aus, egal wie gut die einzelne Zeichnung ist. Deshalb rechnet das
//    Werkzeug die tatsaechliche Ausdehnung jeder Zeichnung aus und legt einen
//    quadratischen Ausschnitt darum, den sie zu ANTEIL fuellt.
'use strict';
var fs = require('fs');
var path = require('path');

var WURZEL = path.join(__dirname, '..');
var ICONS = path.join(WURZEL, 'public', 'icons', 'allergens');
var ANTEIL = 0.88;   // so viel vom Ausschnitt fuellt die Zeichnung

// Welche Datei steckt hinter welchem Symbolnamen. Die 14 EU-Pflichtallergene
// heissen hier wie unsere Codes in LMIV_ALLERGENS -- so kann die Anzeige
// direkt danach greifen, ohne zweite Uebersetzungstabelle.
var HERKUNFT = {
    // Merkmale am Gericht
    beliebt:         'kin/beliebt.svg',
    vegetarisch:     'kin/vegetarisch.svg',
    vegan:           'kin/vegan.svg',
    alkohol:         'kin/alkohol.svg',
    scharf:          'foods/chili.svg',
    rind:            'meat/beef.svg',
    huhn:            'meat/chicken.svg',
    // Die 14 Pflichtallergene nach EU-Verordnung 1169/2011
    gluten:          'eu-allergens/gluten.svg',
    krebstiere:      'eu-allergens/crustaceans.svg',
    eier:            'eu-allergens/eggs.svg',
    fisch:           'eu-allergens/fish.svg',
    erdnuss:         'eu-allergens/peanuts.svg',
    soja:            'eu-allergens/soy.svg',
    milch:           'eu-allergens/milk-lactose.svg',
    schalenfruechte: 'eu-allergens/tree-nuts.svg',
    sellerie:        'eu-allergens/celery.svg',
    senf:            'eu-allergens/mustard.svg',
    sesam:           'eu-allergens/sesame.svg',
    sulfite:         'eu-allergens/sulfites.svg',
    lupinen:         'eu-allergens/lupin.svg',
    weichtiere:      'eu-allergens/molluscs.svg'
};

// ---------------------------------------------------------------------------
// SVG lesen: nur so viel Parser, wie diese Dateien brauchen.
// ---------------------------------------------------------------------------
function attrs(roh) {
    var a = {}, re = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(roh))) a[m[1]] = m[2];
    return a;
}

function lies(datei) {
    var t = fs.readFileSync(datei, 'utf8');
    var vb = (/viewBox="([^"]+)"/.exec(t) || [])[1] || '0 0 64 64';
    var g = /<g\b([^>]*)>([\s\S]*?)<\/g>/.exec(t);
    var gAttr = g ? attrs(g[1]) : {};
    var inhalt = g ? g[2] : t.replace(/<\?xml[\s\S]*?\?>|<svg[^>]*>|<\/svg>/g, '');
    var teile = [];
    var re = /<(path|circle|ellipse|rect|polygon|line)\b([^>]*?)\/?>/g, m;
    while ((m = re.exec(inhalt))) teile.push({ tag: m[1], attr: attrs(m[2]), roh: m[0] });
    return { viewBox: vb, gAttr: gAttr, teile: teile };
}

function istWeiss(w) { return /^#fff(f|fff)?$/i.test((w || '').trim()); }

// ---------------------------------------------------------------------------
// Ausdehnung. Pfade werden in Punkte zerlegt, Grundformen direkt gerechnet.
// ---------------------------------------------------------------------------
function punkteAusPfad(d) {
    var zahl = /[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
    var teile = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    var pts = [], x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, warC = false;

    function kubik(x0, y0, x1, y1, x2, y2, x3, y3) {
        for (var i = 0; i <= 16; i++) {
            var u = i / 16, m = 1 - u;
            pts.push([m*m*m*x0 + 3*m*m*u*x1 + 3*m*u*u*x2 + u*u*u*x3,
                      m*m*m*y0 + 3*m*m*u*y1 + 3*m*u*u*y2 + u*u*u*y3]);
        }
    }
    function quad(x0, y0, x1, y1, x2, y2) {
        kubik(x0, y0, x0 + 2/3*(x1-x0), y0 + 2/3*(y1-y0),
              x2 + 2/3*(x1-x2), y2 + 2/3*(y1-y2), x2, y2);
    }
    function bogen(x0, y0, rx, ry, phi, gross, sweep, x1, y1) {
        if (!rx || !ry) { pts.push([x1, y1]); return; }
        rx = Math.abs(rx); ry = Math.abs(ry);
        var c = Math.cos(phi), s = Math.sin(phi);
        var dx2 = (x0 - x1) / 2, dy2 = (y0 - y1) / 2;
        var x1p =  c*dx2 + s*dy2, y1p = -s*dx2 + c*dy2;
        var l = (x1p*x1p)/(rx*rx) + (y1p*y1p)/(ry*ry);
        if (l > 1) { var q = Math.sqrt(l); rx *= q; ry *= q; }
        var num = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p;
        var den = rx*rx*y1p*y1p + ry*ry*x1p*x1p;
        var co = Math.sqrt(Math.max(0, num / den)) * (gross === sweep ? -1 : 1);
        var cxp =  co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
        var cx = c*cxp - s*cyp + (x0 + x1)/2, cy = s*cxp + c*cyp + (y0 + y1)/2;
        function w(ux, uy, vx, vy) {
            var d2 = Math.sqrt((ux*ux+uy*uy)*(vx*vx+vy*vy));
            var a = Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/d2)));
            return (ux*vy - uy*vx < 0) ? -a : a;
        }
        var t1 = w(1, 0, (x1p-cxp)/rx, (y1p-cyp)/ry);
        var dt = w((x1p-cxp)/rx, (y1p-cyp)/ry, (-x1p-cxp)/rx, (-y1p-cyp)/ry);
        if (!sweep && dt > 0) dt -= 2*Math.PI;
        if (sweep && dt < 0) dt += 2*Math.PI;
        for (var i = 0; i <= 24; i++) {
            var a = t1 + dt * (i/24);
            pts.push([cx + rx*Math.cos(a)*c - ry*Math.sin(a)*s,
                      cy + rx*Math.cos(a)*s + ry*Math.sin(a)*c]);
        }
    }

    teile.forEach(function (teil) {
        var cmd = teil[0], rel = cmd === cmd.toLowerCase();
        var v = (teil.slice(1).match(zahl) || []).map(Number);
        var C = cmd.toUpperCase(), i = 0;
        if (C === 'Z') { x = sx; y = sy; pts.push([x, y]); warC = false; return; }
        while (i < v.length) {
            if (C === 'M' || C === 'L' || C === 'T') {
                x = rel ? x + v[i] : v[i]; y = rel ? y + v[i+1] : v[i+1];
                i += 2; pts.push([x, y]);
                if (C === 'M' && i === 2) { sx = x; sy = y; C = 'L'; }
                warC = false;
            } else if (C === 'H') { x = rel ? x + v[i] : v[i]; i += 1; pts.push([x, y]); warC = false; }
            else if (C === 'V') { y = rel ? y + v[i] : v[i]; i += 1; pts.push([x, y]); warC = false; }
            else if (C === 'C') {
                var a1 = rel ? x+v[i]   : v[i],   b1 = rel ? y+v[i+1] : v[i+1];
                var a2 = rel ? x+v[i+2] : v[i+2], b2 = rel ? y+v[i+3] : v[i+3];
                var ex = rel ? x+v[i+4] : v[i+4], ey = rel ? y+v[i+5] : v[i+5];
                kubik(x, y, a1, b1, a2, b2, ex, ey);
                px = a2; py = b2; x = ex; y = ey; i += 6; warC = true;
            } else if (C === 'S') {
                var r1 = warC ? 2*x - px : x, r2 = warC ? 2*y - py : y;
                var s2 = rel ? x+v[i]   : v[i],   s3 = rel ? y+v[i+1] : v[i+1];
                var e1 = rel ? x+v[i+2] : v[i+2], e2 = rel ? y+v[i+3] : v[i+3];
                kubik(x, y, r1, r2, s2, s3, e1, e2);
                px = s2; py = s3; x = e1; y = e2; i += 4; warC = true;
            } else if (C === 'Q') {
                var q1 = rel ? x+v[i]   : v[i],   q2 = rel ? y+v[i+1] : v[i+1];
                var q3 = rel ? x+v[i+2] : v[i+2], q4 = rel ? y+v[i+3] : v[i+3];
                quad(x, y, q1, q2, q3, q4); x = q3; y = q4; i += 4; warC = false;
            } else if (C === 'A') {
                var ax = rel ? x+v[i+5] : v[i+5], ay = rel ? y+v[i+6] : v[i+6];
                bogen(x, y, v[i], v[i+1], v[i+2]*Math.PI/180, v[i+3], v[i+4], ax, ay);
                x = ax; y = ay; i += 7; warC = false;
            } else { i = v.length; }
        }
    });
    return pts;
}

// Ein gedrehtes Oval braucht keine Abtastung -- seine Ausdehnung hat eine
// geschlossene Form. Das ist genauer als Punkte zu zaehlen und kuerzer.
function ovalAusdehnung(cx, cy, rx, ry, grad) {
    var p = (grad || 0) * Math.PI / 180, c = Math.cos(p), s = Math.sin(p);
    var hw = Math.sqrt(rx*rx*c*c + ry*ry*s*s);
    var hh = Math.sqrt(rx*rx*s*s + ry*ry*c*c);
    return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

function teilAusdehnung(teil, gAttr) {
    var a = teil.attr, box = null;
    var dreh = /rotate\(\s*([-\d.]+)/.exec(a.transform || '');
    var grad = dreh ? Number(dreh[1]) : 0;
    if (teil.tag === 'circle') {
        box = ovalAusdehnung(+a.cx, +a.cy, +a.r, +a.r, 0);
    } else if (teil.tag === 'ellipse') {
        box = ovalAusdehnung(+a.cx, +a.cy, +a.rx, +a.ry, grad);
    } else if (teil.tag === 'rect') {
        box = { x0: +a.x || 0, y0: +a.y || 0,
                x1: (+a.x || 0) + (+a.width), y1: (+a.y || 0) + (+a.height) };
    } else if (teil.tag === 'line') {
        box = { x0: Math.min(+a.x1, +a.x2), y0: Math.min(+a.y1, +a.y2),
                x1: Math.max(+a.x1, +a.x2), y1: Math.max(+a.y1, +a.y2) };
    } else if (a.d) {
        var pts = punkteAusPfad(a.d);
        if (!pts.length) return null;
        var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
        box = { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys),
                x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
    } else if (a.points) {
        var zz = a.points.trim().split(/[\s,]+/).map(Number), xs2 = [], ys2 = [];
        for (var k = 0; k + 1 < zz.length; k += 2) { xs2.push(zz[k]); ys2.push(zz[k+1]); }
        if (!xs2.length) return null;
        box = { x0: Math.min.apply(null, xs2), y0: Math.min.apply(null, ys2),
                x1: Math.max.apply(null, xs2), y1: Math.max.apply(null, ys2) };
    }
    if (!box) return null;
    // Die Kontur ragt ueber die Geometrie hinaus.
    var sw = a['stroke-width'] !== undefined ? +a['stroke-width']
           : (a.stroke && a.stroke !== 'none') ? (+gAttr['stroke-width'] || 0)
           : (gAttr.stroke && gAttr.stroke !== 'none' && a.fill !== 'none') ? (+gAttr['stroke-width'] || 0)
           : 0;
    var hat = (a.stroke && a.stroke !== 'none') || (!a.stroke && gAttr.stroke && gAttr.stroke !== 'none');
    if (hat && sw) { var h = sw / 2; box.x0 -= h; box.y0 -= h; box.x1 += h; box.y1 += h; }
    return box;
}

// ---------------------------------------------------------------------------
// Ein Symbol bauen.
// ---------------------------------------------------------------------------
function baueSymbol(name, datei) {
    var svg = lies(path.join(ICONS, datei));
    var sicht = [], weiss = [], box = null;

    svg.teile.forEach(function (teil) {
        var a = teil.attr;
        var w = istWeiss(a.fill) || istWeiss(a.stroke);
        (w ? weiss : sicht).push(teil);
        // NUR die sichtbaren Teile bestimmen die Ausdehnung. Ein weisses
        // Glanzlicht, das ueber den Rand hinausragt, wuerde das Symbol sonst
        // kleiner rechnen, als es aussieht.
        if (w) return;
        var b = teilAusdehnung(teil, svg.gAttr);
        if (!b) return;
        box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0),
                      x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    });
    if (!box) throw new Error(name + ': keine sichtbare Form in ' + datei);

    // Ein Teil fuer die Maske umfaerben.
    //
    // Zwei Fehler steckten hier vorher drin, und beide hat erst der
    // Pixelvergleich gefunden:
    //
    // 1. Die alten Farb- und Strichangaben blieben stehen und die neuen kamen
    //    dazu -- <path stroke-width="4" ... stroke-width="4"> ist ungueltiges
    //    XML, und der Browser hat das ganze Symbol verweigert.
    // 2. Eine Form mit weisser FUELLUNG UND weisser KONTUR wurde nur als
    //    Kontur uebernommen. Die Flaeche dazwischen blieb stehen, und die
    //    Mittelrippe des Blatts war nur noch ein Umriss statt eines Schlitzes.
    //
    // Deshalb: erst alle Mal-Angaben abraeumen, dann genau die setzen, die
    // das Teil wirklich hat -- Fuellung nur wenn es eine hat, Strich nur wenn
    // es einen hat.
    function maskiere(teil, farbe) {
        var a = teil.attr;
        var fuellung = a.fill !== undefined ? a.fill : svg.gAttr.fill;
        var strich   = a.stroke !== undefined ? a.stroke : svg.gAttr.stroke;
        var stuecke = [];
        stuecke.push('fill="' + (fuellung === 'none' ? 'none' : farbe) + '"');
        if (strich && strich !== 'none') {
            stuecke.push('stroke="' + farbe + '"');
            var breite = a['stroke-width'] !== undefined ? a['stroke-width']
                       : (svg.gAttr['stroke-width'] !== undefined ? svg.gAttr['stroke-width'] : '1');
            stuecke.push('stroke-width="' + breite + '"');
            var cap = a['stroke-linecap'] || svg.gAttr['stroke-linecap'];
            var join = a['stroke-linejoin'] || svg.gAttr['stroke-linejoin'];
            if (cap) stuecke.push('stroke-linecap="' + cap + '"');
            if (join) stuecke.push('stroke-linejoin="' + join + '"');
        }
        return teil.roh
            .replace(/\s(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit)="[^"]*"/g, '')
            .replace(/\s*\/?>$/, ' ' + stuecke.join(' ') + '/>');
    }
    var markup;
    if (weiss.length) {
        var vb = svg.viewBox.split(/\s+/).map(Number);
        var id = 'kinm-' + name;
        // DIE REIHENFOLGE MUSS MIT IN DIE MASKE.
        //
        // Beim Rind liegen die beiden Nuesterpunkte INNERHALB des weissen
        // Muffels: schwarzer Kopf, darueber weisser Muffel, darauf wieder
        // schwarze Punkte. Wer nur die weissen Teile in die Maske schreibt,
        // loescht den Muffel weg -- und die Punkte darin gleich mit, weil
        // die Maske nicht weiss, dass sie spaeter kamen.
        //
        // Deshalb wird ab dem ersten weissen Teil ALLES nachgespielt, in der
        // Reihenfolge der Datei: weiss deckt zu (schwarz in der Maske),
        // was danach kommt, holt sich die Flaeche zurueck (weiss).
        var erstesWeiss = svg.teile.findIndex(function (teil) {
            return istWeiss(teil.attr.fill) || istWeiss(teil.attr.stroke);
        });
        markup = '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="' + vb[0] + '" y="' + vb[1]
               + '" width="' + vb[2] + '" height="' + vb[3] + '">'
               + '<rect x="' + vb[0] + '" y="' + vb[1] + '" width="' + vb[2] + '" height="' + vb[3] + '" fill="#fff"/>'
               + svg.teile.slice(erstesWeiss).map(function (teil) {
                     var deckt = istWeiss(teil.attr.fill) || istWeiss(teil.attr.stroke);
                     return maskiere(teil, deckt ? '#000' : '#fff');
                 }).join('')
               + '</mask>'
               + '<g mask="url(#' + id + ')"' + gruppenAttr(svg.gAttr) + '>'
               + sicht.map(function (t) { return t.roh.replace(/\s*\/?>$/, '/>'); }).join('')
               + '</g>';
    } else {
        markup = '<g' + gruppenAttr(svg.gAttr) + '>'
               + sicht.map(function (t) { return t.roh.replace(/\s*\/?>$/, '/>'); }).join('')
               + '</g>';
    }

    var seite = Math.max(box.x1 - box.x0, box.y1 - box.y0) / ANTEIL;
    var mx = (box.x0 + box.x1) / 2, my = (box.y0 + box.y1) / 2;
    return {
        markup: markup,
        rahmen: [mx - seite/2, my - seite/2, seite, seite]
                .map(function (v) { return (Math.round(v * 100) / 100).toFixed(2); }).join(' ')
    };
}

function gruppenAttr(g) {
    return Object.keys(g).filter(function (k) { return k !== 'id'; })
        .map(function (k) { return ' ' + k + '="' + g[k] + '"'; }).join('');
}

// ---------------------------------------------------------------------------
function baue() {
    var symbole = {}, rahmen = {};
    Object.keys(HERKUNFT).forEach(function (name) {
        var r = baueSymbol(name, HERKUNFT[name]);
        symbole[name] = r.markup;
        rahmen[name] = r.rahmen;
    });
    return { symbole: symbole, rahmen: rahmen };
}

function alsJs(erg) {
    var breit = Math.max.apply(null, Object.keys(erg.symbole).map(function (k) { return k.length; })) + 1;
    function zeilen(obj, wrap) {
        var ks = Object.keys(obj);
        return ks.map(function (k, i) {
            return '        ' + (k + ':').padEnd(breit + 1) + ' ' + wrap(obj[k])
                 + (i === ks.length - 1 ? '' : ',');
        }).join('\n');
    }
    return {
        symbole: '    var KIN_SYMBOLE = {\n'
               + zeilen(erg.symbole, function (v) { return "'" + v.replace(/'/g, "\\'") + "'"; })
               + '\n    };',
        rahmen: '    var KIN_RAHMEN = {\n'
              + zeilen(erg.rahmen, function (v) { return "'" + v + "'"; })
              + '\n    };'
    };
}

function ersetze(html, name, neu) {
    var i = html.indexOf('    var ' + name + ' = {');
    if (i < 0) throw new Error(name + ' nicht gefunden');
    var j = html.indexOf('\n    };', i) + '\n    };'.length;
    return html.slice(0, i) + neu + html.slice(j);
}

module.exports = { baue: baue, alsJs: alsJs, ersetze: ersetze, HERKUNFT: HERKUNFT, ANTEIL: ANTEIL };

if (require.main === module) {
    var ziel = path.join(WURZEL, 'index.html');
    var html = fs.readFileSync(ziel, 'utf8');
    var js = alsJs(baue());
    var neu = ersetze(ersetze(html, 'KIN_SYMBOLE', js.symbole), 'KIN_RAHMEN', js.rahmen);
    if (process.argv.indexOf('--pruefe') >= 0) {
        var gleich = neu === html;
        console.log(gleich
            ? 'index.html passt zu den SVG-Dateien.'
            : 'ABWEICHUNG: index.html passt NICHT zu den SVG-Dateien. node tools/symbole-bauen.js');
        process.exit(gleich ? 0 : 1);
    }
    fs.writeFileSync(ziel, neu);
    console.log(Object.keys(HERKUNFT).length + ' Symbole aus public/icons/allergens/ erzeugt.');
}
