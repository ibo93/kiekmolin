// TISCHE ZUSAMMENSCHIEBEN (08.10.2026)
//
// Grosse Gruppe: im Lokal schiebt man zwei, drei Tische zusammen. Der Plan
// konnte das nicht -- eine Reservierung hatte genau einen Tisch, eine Gruppe
// von 10 an einem 4er-Tisch ging still durch.
// Gespeichert ohne neue Spalte: table_id = angetippter Tisch, die anderen in
// der Notiz ("Zusammen mit: Tisch 4, Tisch 5"). Die Rechnungen laufen hier echt;
// im Browser misst es werkzeug/tischplan-messen.js.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }
function zeile(start) { var i = H.indexOf(start); return H.slice(i, H.indexOf(';', i) + 1); }

var F = new Function(
    'var tp = { tische: [], res: [], raum: {}, datum: "2026-10-09", bereich: "main" };'
    + 'function heute() { return "2026-10-08"; } function jetztMin() { return 0; } function zustand() { return { art: "frei" }; }'
    + 'function tischVon(id) { return tp.tische.find(function (t) { return String(t.id) === String(id); }); }'
    + zeile('var ECKE_NAME') + zeile("var VERBUND = ")
    + ['minuten', 'hhmm', 'raumVon', 'tischNotiz', 'notizTisch', 'verbundNamen', 'verbundTische', 'resFuerTisch', 'freiUm', 'dazuKandidaten'].map(fn).join('\n')
    + '; return { tp: tp, notizTisch: notizTisch, verbundNamen: verbundNamen, verbundTische: verbundTische, resFuerTisch: resFuerTisch, freiUm: freiUm, dazuKandidaten: dazuKandidaten };')();

function tisch(nr, x, y, pl, bereich) { return { id: 'id' + nr, nummer: String(nr), name: 'Tisch ' + nr, x: x, y: y, plaetze: pl, bereich: bereich || 'main' }; }
F.tp.tische = [tisch(1, 10, 10, 2), tisch(3, 40, 50, 4), tisch(4, 50, 50, 4), tisch(5, 60, 50, 4), tisch(6, 90, 90, 6), tisch(10, 20, 20, 2), tisch(7, 45, 50, 4, 'terrace')];
var gruppe = { id: 'r1', table_id: 'id3', notes: 'Zusammen mit: Tisch 4, Tisch 5', reservation_time: '19:00:00', duration_minutes: 120, status: 'confirmed' };
var notiz10 = { id: 'r2', table_id: null, notes: 'Tisch: Tisch 10', reservation_time: '12:00:00', duration_minutes: 90, status: 'confirmed' };
F.tp.res = [gruppe, notiz10];
var bei = function (nr) { return F.resFuerTisch(F.tp.tische.find(function (x) { return x.nummer === String(nr); })).map(function (r) { return r.id; }).join(','); };

// Lesen
t('Notiz "Zusammen mit: Tisch 4, Tisch 5" wird zu zwei Tischen', F.verbundNamen(gruppe).join('|') === 'Tisch 4|Tisch 5', F.verbundNamen(gruppe).join('|'));
t('ohne Tisch-Spalte: "Tisch: Tisch 1 · Zusammen mit: Tisch 2" -> Haupttisch Tisch 1', F.notizTisch({ notes: 'Tisch: Tisch 1 · Zusammen mit: Tisch 2' }) === 'Tisch 1', F.notizTisch({ notes: 'Tisch: Tisch 1 · Zusammen mit: Tisch 2' }));
t('alle Tische einer Gruppe, Haupttisch zuerst: 3, 4, 5', F.verbundTische(gruppe).map(function (x) { return x.nummer; }).join(',') === '3,4,5', F.verbundTische(gruppe).map(function (x) { return x.nummer; }).join(','));
// Anzeige am Tisch
t('die Gruppe steht an Tisch 3, 4 und 5 -- nicht an 6', bei(3) === 'r1' && bei(4) === 'r1' && bei(5) === 'r1' && bei(6) === '', [bei(3), bei(4), bei(5), bei(6)].join('/'));
t('alter Fehler: "Tisch: Tisch 10" landete auch an Tisch 1', bei(10) === 'r2' && bei(1) === '', 'Tisch 10: ' + bei(10) + ' / Tisch 1: ' + bei(1));
// Frei oder nicht
var t4 = F.tp.tische[2], t6 = F.tp.tische[4];
t('Tisch 4 ist um 19:30 durch die Gruppe belegt, um 22:00 wieder frei', !F.freiUm(t4, 19 * 60 + 30) && F.freiUm(t4, 22 * 60), '');
// Vorschläge
var t1 = F.tp.tische[0], k = F.dazuKandidaten(F.tp.tische[1], 13 * 60).map(function (q) { return q.t.nummer; });
t('Vorschlag zum Dazunehmen: nächste Tische zuerst, nur derselbe Bereich', k[0] === '4' && k[1] === '5' && k.indexOf('7') < 0 && k.indexOf('3') < 0, k.join(','));
var k2 = F.dazuKandidaten(t6, 19 * 60 + 30).map(function (q) { return q.t.nummer; });
t('belegte Tische werden nicht vorgeschlagen (19:30: 3, 4, 5 vergeben)', ['3', '4', '5'].every(function (x) { return k2.indexOf(x) < 0; }) && k2.length > 0, k2.join(','));

// Speichern und Plan (Quelltext)
t('gespeichert: table_id = angetippter Tisch, die anderen in der Notiz', /var verbund = dazu\.length \? VERBUND \+ dazu\.map\(function \(x\) \{ return x\.name; \}\)\.join\(', '\) : '';/.test(H) && /if \(verbund\) daten\.notes = verbund;/.test(H), '');
t('ohne Tisch-Spalte (40 fehlt) bleibt die Gruppe in der Notiz erhalten', /daten\.notes = tischNotiz\(t\) \+ \(verbund \? ' · ' \+ verbund : ''\);/.test(H), '');
t('Überschneidung an jedem der Tische wird geprüft', /for \(var ki = 0; ki < alle\.length; ki\+\+\)/.test(H), '');
t('mehr Gäste als Plätze: Rückfrage statt still durchwinken', /if \(pers > platz && !\(await kinConfirm\(/.test(H), '');
t('im Formular: Tische dazunehmen, mit "Passende Tische dazunehmen"', /\+ dazuHtml\(t, minuten\(zeit\), Math\.min\(2, t\.plaetze\)\)/.test(H) && /data-aktion="dazu-auto"/.test(H), '');
t('Eingaben bleiben stehen: Auswahl ändert nur den Block, nicht das ganze Formular', /if \(d\) d\.outerHTML = dazuHtml\(t, w\.a, w\.pers\);/.test(H), '');
t('im Plan: Linie zwischen den Tischen, Schild "mit 4+5"', /if \(!tp\.bearbeiten\) h \+= verbundLinien\(liste\);/.test(H) && /var zus = mit\.length \? ' · mit ' \+ mit\.join\('\+'\) : '';/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
