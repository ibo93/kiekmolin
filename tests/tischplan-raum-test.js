// Tischplan: der Raum wie das echte Lokal -- Maße, L-Form, feste Teile.
//
// Ibo, 07.10.2026: "Wir müssen den Tischplan oben und 3D an das Restaurant
// anpassen" -- "der Laden ist wie eine L-Form". Vorher: ein fester Kasten
// ohne Maße, ohne Eingang, ohne Theke, Tische nur 0/90 Grad.
//
// Die Rechnungen laufen hier echt (Umriss, Ecke, Massstab). Was im Browser
// zu sehen ist, misst werkzeug/tischplan-messen.js (Teil 6 und 7).
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var SQL = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '41-tischplan-raum.sql'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }
var ecke = H.slice(H.indexOf('var ECKE_NAME'), H.indexOf(';', H.indexOf('var ECKE_NAME')) + 1);
var F = new Function('var tp = { raum: {}, bereich: "main" };' + ecke + ['raumVon', 'masseSetzen', 'eckeRechteck', 'ausEckeSchieben', 'umriss'].map(fn).join('\n')
    + '; return { tp: tp, raumVon: raumVon, masse: masseSetzen, ecke: eckeRechteck, schieben: ausEckeSchieben, umriss: umriss };')();

// Standard-Raum = alter Massstab
F.tp.raum = {};
var r0 = F.masse();
t('ohne Angabe: 12 x 9 m, Boden 560 x 420 px, Tische wie bisher (k = 1)', r0.breite === 12 && r0.tiefe === 9 && F.tp.W === 560 && F.tp.T === 420 && Math.abs(F.tp.k - 1) < 1e-9, JSON.stringify({ W: F.tp.W, T: F.tp.T, k: F.tp.k }));
t('Rechteck: 4 Wände', F.umriss(r0).length === 4, F.umriss(r0).length);

// L-Form in allen vier Ecken
['ol', 'or', 'ul', 'ur'].forEach(function (e) {
    F.tp.raum = { main: { breite: 16, tiefe: 10, form: 'L', ecke: e, ausB: 6, ausT: 4 } };
    var r = F.masse(), k = F.umriss(r), q = F.ecke(r);
    var laenge = k.reduce(function (s, x) { return s + Math.abs(x[2] - x[0]) + Math.abs(x[3] - x[1]); }, 0);
    t('L-Form, Ecke ' + e + ': 6 Wände, Umfang wie das L (2 x (B + T))', k.length === 6 && Math.abs(laenge - 2 * (F.tp.W + F.tp.T)) < 1, k.length + ' / ' + laenge);
    t('L-Form, Ecke ' + e + ': Ecke sitzt in der richtigen Ecke', (e.charAt(1) === 'r' ? q.x > 0 : q.x === 0) && (e.charAt(0) === 'u' ? q.y > 0 : q.y === 0), JSON.stringify(q));
    var mitte = { x: (q.x + q.w / 2) / F.tp.W * 100, y: (q.y + q.h / 2) / F.tp.T * 100 };
    var p = F.schieben(r, mitte), px = p.x / 100 * F.tp.W, py = p.y / 100 * F.tp.T;
    t('L-Form, Ecke ' + e + ': ein Tisch in der Ecke wird an den Rand geschoben', !(px > q.x && px < q.x + q.w && py > q.y && py < q.y + q.h), JSON.stringify(p));
});
F.tp.raum = { main: { breite: 20, tiefe: 8 } };
F.masse();
t('Maße in Metern: 20 x 8 m ergibt 560 x 224 px, Tische kleiner (k = 0,6)', F.tp.W === 560 && F.tp.T === 224 && Math.abs(F.tp.k - 0.6) < 1e-9, JSON.stringify({ W: F.tp.W, T: F.tp.T, k: F.tp.k }));
F.tp.raum = { main: { breite: 6, tiefe: 6, form: 'L', ausB: 9, ausT: 9 } };
var rk = F.raumVon('main');
t('Ecke nie größer als der Raum (mind. 1 m Raum bleibt)', rk.ausB <= 5 && rk.ausT <= 5, rk.ausB + ' / ' + rk.ausT);

// Oberfläche und Speichern
t('Leiste hat die festen Teile', ['tuer', 'theke', 'fenster', 'kueche', 'wc', 'wand', 'pflanze'].every(function (a) { return H.indexOf('data-teil="' + a + '"') >= 0; }), '');
t('Raum wird in restaurants.tischplan_raum gespeichert, leere Antwort ist ein Fehler',
  /JSON\.stringify\(\{ tischplan_raum: tp\.raum \}\)/.test(H) && /keine Berechtigung, den Raum zu ändern/.test(H), '');
t('fehlt 41: Hinweis beim Bearbeiten und nach Fertig "NICHT gespeichert"',
  /41-tischplan-raum\.sql in Supabase eingespielt ist/.test(H) && /Raumform und feste Teile aber NICHT/.test(H), '');
t('Drehen in 45°-Schritten nur, wenn 41 eingespielt ist', /tp\.ohneRaumSpalte \? \(\(t\.drehung \|\| 0\) \+ 90\) % 180 : \(\(t\.drehung \|\| 0\) \+ 45\) % 360/.test(H), '');
t('Rückgängig nimmt Tische UND Raum zurück', /JSON\.stringify\(\{ tische: tp\.tische, raum: tp\.raum \}\)/.test(H), '');

// SQL
t('41: Spalte tischplan_raum (wiederholbar)', /add column if not exists tischplan_raum jsonb/.test(SQL), '');
t('41: Drehung 0-315 in 45er-Schritten', /rotation in \(0, 45, 90, 135, 180, 225, 270, 315\)/.test(SQL), '');
t('41: ändert keine Zeilen-Regeln', !/policy|row level security|grant /i.test(SQL.replace(/^--.*$/gm, '')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
