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

// Drehen (Ibo: "noch besser mit drehen können")
var D = new Function('var tp = { ohneRaumSpalte: false };' + fn('winkelRunden') + '; return { tp: tp, r: winkelRunden };')();
t('Griff: 30° bleibt 30°', D.r(30) === 30, D.r(30));
t('Griff: 43° rastet auf 45° ein', D.r(43) === 45, D.r(43));
t('Griff: 88° rastet auf 90° ein, 354° auf 0°, 352° nicht (8° weg)', D.r(88) === 90 && D.r(354) === 0 && D.r(352) === 350, D.r(88) + ' / ' + D.r(354) + ' / ' + D.r(352));
t('Griff: 22° -> 20° (5°-Schritte)', D.r(22) === 20, D.r(22));
t('Griff: negative Winkel werden 0-359 (-30° -> 330°)', D.r(-30) === 330, D.r(-30));
D.tp.ohneRaumSpalte = true;
t('ohne 41: nur 0 oder 90 (die Datenbank erlaubt nichts anderes)', D.r(30) === 0 && D.r(70) === 90 && D.r(170) === 0, [D.r(30), D.r(70), D.r(170)].join(','));
var W2 = new Function('var tp = { raum: { main: { breite: 12, tiefe: 9 } }, bereich: "main" };'
    + H.slice(H.indexOf('var TEIL = {'), H.indexOf('};', H.indexOf('var TEIL = {')) + 2) + ecke
    + ['raumVon', 'masseSetzen', 'eckeRechteck', 'umriss', 'anWandRasten'].map(fn).join('\n')
    + '; masseSetzen(); return { rasten: anWandRasten };')();
var tuer = { art: 'tuer', x: 3, y: 60, dreh: 0 };
W2.rasten(tuer);
t('Eingang nahe der linken Wand: rastet ein (x = 0) und steht senkrecht (90°)', tuer.x === 0 && tuer.dreh === 90, JSON.stringify(tuer));
var fen = { art: 'fenster', x: 40, y: 97, dreh: 90 };
W2.rasten(fen);
t('Fenster nahe der unteren Wand: y = 100, waagerecht (0°)', fen.y === 100 && fen.dreh === 0, JSON.stringify(fen));
var mitte = { art: 'tuer', x: 50, y: 50, dreh: 0 };
W2.rasten(mitte);
t('mitten im Raum rastet nichts ein', mitte.x === 50 && mitte.y === 50, JSON.stringify(mitte));
t('Seitenleiste hat feste Breite (sonst springt der Plan beim Antippen, gemessen 18 px)', /\.tp3-seite \{ flex: 0 0 320px; width: 320px; max-width: 320px; \}/.test(H), '');
t('3D: Wischen dreht den Raum, ein Wischen ist kein Antippen', /tp\.drehung = wisch\.d0 \+ dx \* 0\.45/.test(H) && /if \(tp\._gewischt\) return;/.test(H), '');

// Echte Tischmaße (Ibo: "es muss mit den echten Maßen sein")
var M = new Function('var tp = { ppm: 50 };' + ['formArt', 'standardMass', 'form', 'stuehle'].map(fn).join('\n')
    + H.slice(H.indexOf('var VORLAGEN = {'), H.indexOf('};', H.indexOf('var VORLAGEN = {')) + 2)
    + '; return { form: form, stuehle: stuehle, vorlagen: VORLAGEN };')();
var g4 = M.form({ plaetze: 4 }), g6 = M.form({ plaetze: 6 }), g2 = M.form({ plaetze: 2 }), gr8 = M.form({ plaetze: 8, form: 'round' });
t('ohne Maße: 4 Plätze = eckig 80 x 80 cm', g4.art === 'eckig' && g4.L === 80 && g4.B === 80, JSON.stringify(g4));
t('ohne Maße: 6 Plätze = lang 180 x 80 cm, 2 Plätze = rund Ø 70', g6.L === 180 && g6.B === 80 && g2.art === 'rund' && g2.L === 70, JSON.stringify([g6, g2]));
t('Massstab: 180 cm bei 50 px/m = 90 px', g6.b === 90 && g6.t === 40, g6.b + ' x ' + g6.t);
var eigen = M.form({ plaetze: 6, form: 'rectangle', laenge: 210, breite: 90 });
t('gespeicherte Maße gelten (210 x 90)', eigen.L === 210 && eigen.B === 90, JSON.stringify(eigen));
var rund = M.form({ plaetze: 4, form: 'round', laenge: 110, breite: 60 });
t('rund: Breite = Durchmesser', rund.L === 110 && rund.B === 110, JSON.stringify(rund));
[[{ plaetze: 2 }, 2], [{ plaetze: 4 }, 4], [{ plaetze: 6 }, 6], [{ plaetze: 8, form: 'round' }, 8], [{ plaetze: 10, form: 'rectangle' }, 10], [{ plaetze: 5, form: 'rectangle' }, 5]].forEach(function (f) {
    var n2 = M.stuehle(M.form(f[0]), f[0].plaetze).length;
    t('so viele Stühle wie Plätze: ' + f[1] + ' (' + M.form(f[0]).art + ')', n2 === f[1], n2);
});
t('Schnellauswahl: Größen für rund, eckig, lang', M.vorlagen.rund.length >= 3 && M.vorlagen.eckig.length >= 2 && M.vorlagen.lang.length >= 4, '');
t('Leiste: 9 Tischgrößen zum Anlegen', (H.match(/data-neu="(rund|eckig|lang)\d+"/g) || []).length === 9, (H.match(/data-neu="(rund|eckig|lang)\d+"/g) || []).length);
t('Speichern schickt laenge_cm/breite_cm (wenn 41 da ist)', /daten\.laenge_cm = Math\.round\(gm\.L\); daten\.breite_cm = Math\.round\(gm\.B\);/.test(H), '');
t('41: Spalten laenge_cm/breite_cm mit Grenzen', /add column if not exists laenge_cm smallint/.test(SQL) && /laenge_cm between 30 and 800/.test(SQL), '');
t('neue Form = übliches Maß dieser Form (kein 180 cm breiter Rundtisch)', /t\.form = f\.getAttribute\('data-form'\); t\.laenge = null; t\.breite = null;/.test(H), '');

// Profi-Ansicht (Ibo: "richtig professionell")
t('Zoom: Knöpfe −/Einpassen/+, zwei Finger, Strg+Mausrad', /id="tp3ZoomRein"/.test(H) && /id="tp3ZoomFit"/.test(H) && /pinch = \{ d0:/.test(H) && /if \(!e\.ctrlKey\) return;/.test(H), '');
t('Zoom geht in den Massstab ein (Ziehen und Schilder bleiben richtig)', /function massstab\(\) \{ return grundMassstab\(\) \* \(tp\.zoom \|\| 1\); \}/.test(H), '');
t('freier Tisch zeigt nur die Nummer (ausser gewählt)', /else if \(z\.art === 'frei'\) \{ if \(gew\) inhalt \+=/.test(H), '');
t('kleine Schilder, aber Tippfläche durch unsichtbaren Rand', /\.tp3-schild:not\(\.teil\) > span::before \{ content: ''; position: absolute; left: -6px; right: -6px; top: -13px; bottom: -13px; \}/.test(H), '');
var wm = /var WAND_H = (\d+), WAND_VORN = (\d+), PLATTE = (\d+);/.exec(H) || [];
t('aufgeschnittene Wände: hinten niedriger als die Schilder (66 px), vorne nur ein Sockel', +wm[1] > 30 && +wm[1] < 66 && +wm[2] <= 14 && /translateZ\(' \+ \(gew \? 70 : 66\) \+ 'px\)/.test(H), wm.slice(1).join('/'));

// Architektur-Look (Ibo: "wie eine teure Architektur", "dass sowas keiner hat")
t('Wände haben Stärke (24 cm) und sind von oben ein schwarzer Schnitt', /function wandStaerke\(\) \{ return Math\.max\(7, Math\.round\(0\.24 \*/.test(H) && /g \+= flach\(fx, fy, fw, fh, hoch, 'background:var\(--tp3-schnitt\);'\);/.test(H), '');
t('Eingang schneidet eine Lücke in die Wand (Schwelle statt Schnitt)', /tueren\.forEach\(function \(t\) \{ st = /.test(H) && /background:var\(--tp3-schwelle\)/.test(H), '');
t('Boden: Fischgrät-Parkett, Eiche hell / Nussbaum dunkel', (H.match(/--tp3-parkett: url\("data:image\/svg\+xml,/g) || []).length === 2, '');
// Stühle: Mitte + Blickrichtung, Lehne nach außen
var S = new Function('var tp = { ppm: 50 };' + ['formArt', 'standardMass', 'form', 'stuehle'].map(fn).join('\n') + '; return { form: form, stuehle: stuehle };')();
var g4 = S.form({ plaetze: 4 }), st4 = S.stuehle(g4, 4);
var winkel4 = st4.map(function (x) { return x[2]; }).sort(function (a, b) { return a - b; }).join(',');
t('4er-Tisch: je Seite ein Stuhl, Lehne nach außen (0/90/180/-90 Grad)', winkel4 === '-90,0,90,180', winkel4);
var aussen = st4.every(function (x) { return x[0] < 0 || x[0] > g4.b || x[1] < 0 || x[1] > g4.t; });
t('Stühle stehen am Tisch, nicht auf der Platte', aussen, JSON.stringify(st4));
var g21 = S.form({ plaetze: 21, form: 'rectangle' });
t('auch der lange 21er-Tisch hat 21 Stühle', S.stuehle(g21, 21).length === 21, S.stuehle(g21, 21).length);
// Licht nach Uhrzeit
var L = new Function('var tp = { datum: "2026-10-07", zeit: "12:00" }; function heute() { return tp.datum; } function minuten(h) { var p = String(h).split(":"); return (+p[0]) * 60 + (+p[1] || 0); } function jetztMin() { return 0; }'
    + H.slice(H.indexOf('var SONNE = ['), H.indexOf(';', H.indexOf('var SONNE = [')) + 1) + ['zeitpunkt', 'sonnenuntergang', 'licht'].map(fn).join('\n')
    + '; return function (z, d) { tp.zeit = z; if (d) tp.datum = d; return licht(); };')();
t('Licht: 12:00 Tag, 18:15 Abend, 19:00 Nacht (Oktober, Sonne 18:42)', L('12:00') === 'tag' && L('18:15') === 'abend' && L('19:00') === 'nacht', [L('12:00'), L('18:15'), L('19:00')].join('/'));
t('Licht: im Juni ist 21:00 noch Abend, nicht Nacht', L('21:00', '2026-06-20') === 'abend' && L('20:00', '2026-06-20') === 'tag', [L('20:00', '2026-06-20'), L('21:00', '2026-06-20')].join('/'));
t('Zeitschieber über den Sonnenuntergang zeichnet neu (Licht gehört zum Stand)', /function standJetzt\(\) \{ return tp\.bereich \+ '#' \+ \(tp\.ansicht === '3d' \? licht\(\) : ''\)/.test(H), '');
t('Gedeck nur, wo jemand sitzt; reserviert = Kärtchen; nicht beim Bearbeiten', /if \(!tp\.bearbeiten && \(z\.art === 'bes' \|\| z\.art === 'ruft'\)\) o \+= gedecktHtml\(sitze\);/.test(H) && /if \(!tp\.bearbeiten && z\.art === 'res'\) o \+= kaertchenHtml\(g\);/.test(H), '');
t('von oben: Schild an der Tischecke, damit Gedeck und Stühle sichtbar bleiben', /var ecke = tp\.ansicht === 'oben' && !gew && !tp\.bearbeiten/.test(H), '');
t('feste Teile: dezente Schrift, Fenster/Wand/Pflanze im Live-Plan ohne', /\.tp3\[data-bearbeiten="0"\] \.tp3-schild\.teil\.still \{ display: none; \}/.test(H), '');

// Oberfläche und Speichern
t('Leiste hat die festen Teile', ['tuer', 'theke', 'fenster', 'kueche', 'wc', 'wand', 'pflanze'].every(function (a) { return H.indexOf('data-teil="' + a + '"') >= 0; }), '');
t('Raum wird in restaurants.tischplan_raum gespeichert, leere Antwort ist ein Fehler',
  /JSON\.stringify\(\{ tischplan_raum: tp\.raum \}\)/.test(H) && /keine Berechtigung, den Raum zu ändern/.test(H), '');
t('fehlt 41: Hinweis beim Bearbeiten und nach Fertig "NICHT gespeichert"',
  /41-tischplan-raum\.sql in Supabase eingespielt ist/.test(H) && /Raumform und feste Teile aber NICHT/.test(H), '');
t('frei drehen nur, wenn 41 eingespielt ist (sonst 0/90)', /if \(tp\.ohneRaumSpalte\) return Math\.round\(grad \/ 90\) % 2 \? 90 : 0;/.test(H), '');
t('Rückgängig nimmt Tische UND Raum zurück', /JSON\.stringify\(\{ tische: tp\.tische, raum: tp\.raum \}\)/.test(H), '');

// SQL
t('41: Spalte tischplan_raum (wiederholbar)', /add column if not exists tischplan_raum jsonb/.test(SQL), '');
t('41: Drehung frei von 0 bis 359 Grad', /check \(rotation between 0 and 359\)/.test(SQL), '');
t('41: ändert keine Zeilen-Regeln', !/policy|row level security|grant /i.test(SQL.replace(/^--.*$/gm, '')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
