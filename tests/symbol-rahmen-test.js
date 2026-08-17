// STEHEN ALLE MERKMAL-SYMBOLE GLEICH GROSS IM KASTEN?
//
// GEMELDET WURDE
// --------------
// "die icon sehen noch nicht so gut" -- ohne zu sagen, welches. Das war
// richtig, aber unscharf, und ich habe zweimal am falschen Ende gedreht:
// einzelne Zeichnungen nachgebessert, obwohl das Problem der ganze Satz war.
//
// Erst das Messen hat es gezeigt. Vom gerasterten Bild abgenommen lag die
// Tinte im Kasten zwischen 13 % (Aehre) und 35 % (Blatt), die Breiten
// zwischen 5,8 und 18,8 von 24 Einheiten. Nebeneinander wirkte damit die
// eine Haelfte fett und die andere geschrumpft -- egal wie sauber die
// einzelne Zeichnung war.
//
// WAS DAGEGEN HILFT
// -----------------
// Jedes Symbol hat einen eigenen Ausschnitt (KIN_RAHMEN): ein Quadrat um die
// tatsaechliche Zeichnung, so gross, dass sie 88 % davon fuellt. Der Browser
// skaliert und zentriert dann selbst.
//
// WARUM ES DIESEN TEST BRAUCHT
// ----------------------------
// Die Ausschnitte sind gemessene Zahlen neben den Pfaden -- also zwei Dinge,
// die auseinanderlaufen koennen. Wer eine Zeichnung aendert und den
// Ausschnitt vergisst, bekommt ein Symbol, das schief oder zu klein im
// Kasten haengt. Nichts stuerzt ab, nichts sieht im Code falsch aus, und
// auffallen wuerde es erst jemandem, der genau hinsieht.
//
// Deshalb rechnet dieser Test die Ausschnitte NACH: er liest die Pfade,
// zerlegt Kurven und Boegen in Punkte und misst daraus die Ausdehnung. Ganz
// ohne Browser, damit er ueberall laeuft.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function tabelle(name) {
    var i = H.indexOf('var ' + name + ' = {');
    if (i < 0) return null;
    var ende = H.indexOf('\n    };', i);
    if (ende < 0) ende = H.indexOf('};', i);
    return new Function(H.slice(i, ende + 7) + '\n return ' + name + ';')();
}

var SYM = tabelle('KIN_SYMBOLE');
var RAHMEN = tabelle('KIN_RAHMEN');

t('die Symboltabelle ist lesbar', !!SYM && Object.keys(SYM).length === 11,
  SYM && Object.keys(SYM).length);
t('die Ausschnitt-Tabelle ist lesbar', !!RAHMEN, RAHMEN);
if (!SYM || !RAHMEN) { console.log('\nAbbruch.'); process.exit(1); }

// ---------------------------------------------------------------------------
// Pfaddaten zu Punkten. Nur so viel, wie in diesen Symbolen vorkommt:
// M/m L/l H/h V/v C/c S/s A/a Z/z -- plus rotate() auf einer Gruppe.
// ---------------------------------------------------------------------------
function punkteAusPfad(d) {
    var zahl = /[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
    var teile = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    var pts = [], x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0, letzterC = false;

    function kubik(x0, y0, x1, y1, x2, y2, x3, y3) {
        for (var i = 0; i <= 16; i++) {
            var u = i / 16, m = 1 - u;
            pts.push([
                m*m*m*x0 + 3*m*m*u*x1 + 3*m*u*u*x2 + u*u*u*x3,
                m*m*m*y0 + 3*m*m*u*y1 + 3*m*u*u*y2 + u*u*u*y3
            ]);
        }
    }
    // Bogen: Endpunkt- in Mittelpunktform, dann abtasten. Die Loecher sind
    // alle Halbkreise -- ohne das faenden wir ihre Ausdehnung nicht.
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
        function winkel(ux, uy, vx, vy) {
            var d2 = Math.sqrt((ux*ux+uy*uy)*(vx*vx+vy*vy));
            var a = Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/d2)));
            return (ux*vy - uy*vx < 0) ? -a : a;
        }
        var t1 = winkel(1, 0, (x1p-cxp)/rx, (y1p-cyp)/ry);
        var dt = winkel((x1p-cxp)/rx, (y1p-cyp)/ry, (-x1p-cxp)/rx, (-y1p-cyp)/ry);
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
        if (C === 'Z') { x = sx; y = sy; pts.push([x, y]); letzterC = false; return; }
        while (i < v.length) {
            if (C === 'M' || C === 'L') {
                var nx = rel ? x + v[i] : v[i], ny = rel ? y + v[i+1] : v[i+1];
                x = nx; y = ny; i += 2; pts.push([x, y]);
                if (C === 'M' && i === 2) { sx = x; sy = y; C = 'L'; }  // weitere Paare = L
                letzterC = false;
            } else if (C === 'H') { x = rel ? x + v[i] : v[i]; i += 1; pts.push([x, y]); letzterC = false; }
            else if (C === 'V') { y = rel ? y + v[i] : v[i]; i += 1; pts.push([x, y]); letzterC = false; }
            else if (C === 'C') {
                var a1 = rel ? x+v[i]   : v[i],   b1 = rel ? y+v[i+1] : v[i+1];
                var a2 = rel ? x+v[i+2] : v[i+2], b2 = rel ? y+v[i+3] : v[i+3];
                var ex = rel ? x+v[i+4] : v[i+4], ey = rel ? y+v[i+5] : v[i+5];
                kubik(x, y, a1, b1, a2, b2, ex, ey);
                px = a2; py = b2; x = ex; y = ey; i += 6; letzterC = true;
            } else if (C === 'S') {
                var r1 = letzterC ? 2*x - px : x, r2 = letzterC ? 2*y - py : y;
                var s2 = rel ? x+v[i]   : v[i],   s3 = rel ? y+v[i+1] : v[i+1];
                var sx2 = rel ? x+v[i+2] : v[i+2], sy2 = rel ? y+v[i+3] : v[i+3];
                kubik(x, y, r1, r2, s2, s3, sx2, sy2);
                px = s2; py = s3; x = sx2; y = sy2; i += 4; letzterC = true;
            } else if (C === 'A') {
                var ax = rel ? x+v[i+5] : v[i+5], ay = rel ? y+v[i+6] : v[i+6];
                bogen(x, y, v[i], v[i+1], v[i+2]*Math.PI/180, v[i+3], v[i+4], ax, ay);
                x = ax; y = ay; i += 7; letzterC = false;
            } else { i = v.length; }
        }
    });
    return pts;
}

// Ein Symbol besteht aus mehreren <path>, evtl. in einer gedrehten Gruppe.
function ausdehnung(quelle) {
    var dreh = /rotate\(([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)/.exec(quelle);
    var alle = [];
    (quelle.match(/ d="([^"]+)"/g) || []).forEach(function (s) {
        alle = alle.concat(punkteAusPfad(s.slice(4, -1)));
    });
    if (dreh) {
        var a = Number(dreh[1]) * Math.PI/180, cx = Number(dreh[2]), cy = Number(dreh[3]);
        var c = Math.cos(a), s = Math.sin(a);
        alle = alle.map(function (p) {
            var dx = p[0]-cx, dy = p[1]-cy;
            return [cx + dx*c - dy*s, cy + dx*s + dy*c];
        });
    }
    var xs = alle.map(function (p) { return p[0]; }), ys = alle.map(function (p) { return p[1]; });
    // Die Kontur ragt 0,4 ueber die Geometrie hinaus (stroke-width 0.8).
    return { x0: Math.min.apply(null, xs) - 0.4, y0: Math.min.apply(null, ys) - 0.4,
             x1: Math.max.apply(null, xs) + 0.4, y1: Math.max.apply(null, ys) + 0.4 };
}

// ---------------------------------------------------------------------------
var ANTEIL = 0.88;   // so viel vom Ausschnitt soll die Zeichnung fuellen
var TOLERANZ = 0.6;  // runde Ecken und Kantenglaettung schwanken etwas

var namen = Object.keys(SYM);
t('jedes Symbol hat einen Ausschnitt',
  namen.every(function (k) { return typeof RAHMEN[k] === 'string'; }),
  namen.filter(function (k) { return !RAHMEN[k]; }).join(','));
t('und es gibt keinen Ausschnitt ohne Symbol -- sonst ist einer uebrig '
  + 'geblieben, den niemand mehr pflegt',
  Object.keys(RAHMEN).every(function (k) { return !!SYM[k]; }),
  Object.keys(RAHMEN).filter(function (k) { return !SYM[k]; }).join(','));

var seiten = [];
namen.forEach(function (k) {
    var r = (RAHMEN[k] || '').trim().split(/\s+/).map(Number);
    if (r.length !== 4 || r.some(isNaN)) { t(k + ': Ausschnitt lesbar', false, RAHMEN[k]); return; }
    t(k + ': der Ausschnitt ist quadratisch -- sonst verzerrt er die Zeichnung',
      Math.abs(r[2] - r[3]) < 0.01, r[2] + ' x ' + r[3]);
    seiten.push(r[2]);

    var a = ausdehnung(SYM[k]);
    var soll = Math.max(a.x1 - a.x0, a.y1 - a.y0) / ANTEIL;
    t(k + ': der Ausschnitt passt zur Zeichnung',
      Math.abs(r[2] - soll) < TOLERANZ,
      'hinterlegt ' + r[2].toFixed(2) + ', gemessen ' + soll.toFixed(2)
      + ' -- Zeichnung geaendert? Ausschnitt neu messen.');

    var mx = (a.x0 + a.x1) / 2, my = (a.y0 + a.y1) / 2;
    t(k + ': und sie steht mittig darin',
      Math.abs((r[0] + r[2]/2) - mx) < TOLERANZ && Math.abs((r[1] + r[3]/2) - my) < TOLERANZ,
      'Mitte Ausschnitt ' + (r[0]+r[2]/2).toFixed(2) + '/' + (r[1]+r[3]/2).toFixed(2)
      + ', Mitte Zeichnung ' + mx.toFixed(2) + '/' + my.toFixed(2));
});

// Der eigentliche Punkt der ganzen Uebung: alle gleich gross. Das laesst sich
// nach dem Rahmen direkt pruefen -- jede Zeichnung fuellt denselben Anteil.
t('alle Symbole fuellen ihren Ausschnitt gleich stark -- genau das war '
  + 'vorher nicht so',
  seiten.length === 11, seiten.length);

// ---- Der Ausschnitt muss auch benutzt werden -------------------------------
// Die Tabelle allein nuetzt nichts, wenn sym() weiter 0 0 24 24 schreibt.
t('sym() setzt den Ausschnitt des Symbols ein',
  /viewBox="' \+ \(KIN_RAHMEN\[form\] \|\| '0 0 24 24'\) \+ '"/.test(H));
t('und faellt auf den vollen Kasten zurueck, wenn einer fehlt -- lieber '
  + 'etwas zu klein als gar nichts',
  /KIN_RAHMEN\[form\] \|\| '0 0 24 24'/.test(H));
t('warum es die Tabelle gibt, steht dabei',
  /Ohne das sah der Satz halbfertig aus, und zwar messbar/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
