// DER NEUE TISCHPLAN (tp3) -- was der alte falsch gemacht hat, darf nicht
// zurueckkommen.
//
// Gefunden am 06.10.2026, im Code nachgeprueft:
//   - acht fest eingebaute Tische, fuer jedes Lokal dieselben
//   - "Speichern" zeigte nur "Tischplan gespeichert!", gespeichert wurde nichts
//   - "Besetzen"/"Freigeben" taten nichts (eine spaetere Funktion gleichen
//     Namens hat sie ueberschrieben)
//   - Schnell-Reservierung schickte table_id "3" statt der uuid und meldete
//     auch bei Fehlschlag "gespeichert!"
//   - Ziehen nur mit der Maus -- auf dem iPad ging nichts
//   - updateReservationStatus meldete "Status aktualisiert", auch wenn die
//     Datenbank still nichts geaendert hatte (200 mit leerer Liste)
//
// Was ein Textvergleich NICHT sieht (Lage im 3D-Raum, Kontrast, ob die
// Datenbank wirklich gefragt wird), misst werkzeug/tischplan-messen.js im
// echten Browser. Dieser Test sichert die Stellen, an denen es frueher brach.
//
// Gegenprobe: jede Pruefung wurde einmal durch Zurueckbauen rot gemacht.
'use strict';
var fs = require('fs'), path = require('path');
var W = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(W, 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

var a = H.indexOf('// ==================== TISCHPLAN (tp3) ====================');
var e = H.indexOf('})();', a);
var TP = a > -1 ? H.slice(a, e) : '';
t('der neue Tischplan ist da', TP.length > 5000, TP.length);

// --- keine erfundenen Tische mehr ---
t('keine fest eingebauten Tische mehr im Tischplan-Reiter',
  !/class="fp-table[^"]*" data-table="1"/.test(H) && !/id="floorplanGrid"/.test(H), 'fp-table/floorplanGrid gefunden');
t('Tische kommen aus restaurant_tables des gewaehlten Lokals',
  /restaurant_tables\?restaurant_id=eq\.' \+ encodeURIComponent\(tp\.rid\) \+ '&is_active=eq\.true/.test(TP), '');

// --- der Reiter oeffnet den neuen Plan, nicht die alte Demo ---
t('Reiter "Tischplan" oeffnet tp3',
  /tabName === 'floorplan' && typeof window\.tp3Oeffnen === 'function'/.test(H)
  && !/tabName === 'floorplan' && typeof renderFloorplan === 'function'/.test(H), '');
t('der alte Block zeichnet nichts mehr, wenn seine Oberflaeche fehlt',
  /function init\(\) \{[\s\S]{0,400}if \(!document\.getElementById\('floorplanGrid'\)\) return;/.test(H)
  && /window\.updateFloorplanDisplay = function\(\) \{\s*if \(!document\.getElementById\('floorplanGrid'\)\) return;/.test(H), '');

// --- Speichern speichert wirklich, und meldet ehrlich ---
t('Fertig schreibt Lage, Name, Plaetze, Bereich per PATCH',
  /daten\.pos_x = /.test(TP) && /table_name: t\.name/.test(TP) && /max_capacity: t\.plaetze/.test(TP) && /method: 'PATCH'/.test(TP), '');
var leer = (TP.match(/if \(!Array\.isArray\(z{1,2}(?:eilen)?\) \|\| !z{1,2}(?:eilen)?\.length\) throw/g) || []).length;
t('jede Schreib-Antwort wird auf "leer" (RLS) geprueft -- 4 Stellen + neuer Tisch', leer === 4 && /var z = \(await r\.json\(\)\)\[0\];\s*if \(!z\) throw/.test(TP), leer);
t('Erfolgsmeldung erst NACH der Pruefung, Fehler bleibt im Bearbeiten',
  /if \(fehler\.length\) \{ melden\('Nicht gespeichert – '[\s\S]{0,40}return false; \}/.test(TP)
  && /if \(await speichern\(\)\) \{ tp\.bearbeiten = false;/.test(TP), '');
t('fehlende Spalten (39-tischplan.sql): Plan laedt trotzdem und sagt es',
  /tp\.ohnePosSpalten = true;\s*zeilen = await/.test(TP) && /datenbank\/39-tischplan\.sql/.test(TP), '');

// --- Schnell-Reservierung ---
t('Schnell-Reservierung schickt die echte Tisch-ID',
  /table_id: t\.id, status: 'confirmed', source: 'dashboard'/.test(TP), '');
t('und prueft vorher auf Ueberschneidung am selben Tisch',
  /konflikt = resFuerTisch\(t\)\.find/.test(TP), '');

// --- Status der Reservierung ---
t('"Gaeste sind da" geht ueber updateReservationStatus und wertet das Ergebnis aus',
  /resStatus\(z\.res, 'seated'\)/.test(TP) && /var ok = await updateReservationStatus\(r\.id, status\);\s*if \(ok === false\)/.test(TP), '');
var u = H.slice(H.indexOf('async function updateReservationStatus('), H.indexOf('async function updateReservationStatus(') + 6000);
t('updateReservationStatus: leere PATCH-Antwort ist KEIN Erfolg',
  /patchResp\.ok && Array\.isArray\(patchZeilen\) && patchZeilen\.length/.test(u), '');
t('updateReservationStatus meldet true/false zurueck',
  (u.match(/return true;/g) || []).length >= 2 && (u.match(/return false;/g) || []).length >= 2, '');
t('"Tisch ist frei" schliesst die sitzende Reservierung mit einem Status, den die App schon schreibt (finished)',
  /resStatus\(z\.res, 'finished'\)/.test(TP) && /updateReservationStatus\('\$\{r\.id\}', 'finished'\)/.test(H), '');

// --- iPad ---
t('Ziehen mit Pointer-Events (Finger und Maus), nicht HTML5-Drag',
  /addEventListener\('pointerdown', zugStart\)/.test(TP) && /setPointerCapture/.test(TP) && !/draggable/.test(TP), '');
t('beim Ziehen scrollt die Seite nicht mit (touch-action: none)',
  /\.tp3\[data-bearbeiten="1"\] \.tp3-buehne \{ touch-action: none;/.test(H), '');
t('Raster 2,5 %', /RASTER = 2\.5/.test(TP) && /Math\.round\(\(zug\.tx \+ dx\) \/ RASTER\) \* RASTER/.test(TP), '');
t('jeder Tisch hat eine Tippflaeche, die groesser ist als er selbst',
  /\.tp3-tisch \.tp3-tipp \{ position: absolute; inset: -10px;/.test(H), '');

// --- beide Ansichten ---
t('3D und "Von oben", das Geraet merkt sich die Wahl',
  /localStorage\.setItem\('kmi_tp3_ansicht', a\)/.test(TP) && /rotateX\(' \+ NEIGUNG \+ 'deg\)/.test(TP), '');
t('Bearbeiten immer von oben (genaues Setzen), danach zurueck',
  /tp\.ansichtVorBearbeiten = tp\.ansicht; tp\.ansicht = 'oben'/.test(TP), '');
t('Schilder stehen aufrecht (Gegendrehung) und behalten ihre Groesse',
  /rotateZ\(' \+ \(-winkel\(\)\) \+ 'deg\) rotateX\(-' \+ NEIGUNG \+ 'deg\) scale\(' \+ k/.test(TP) && /var k = Math\.min\(1\.[0-8], 1 \/ \(tp\.s \|\| 1\)\)/.test(TP), '');
t('ueberdeckte Schilder weichen aus', /function entzerren\(\)/.test(TP) && /bodenStellen\(\); entzerren\(\);/.test(TP), '');
var roh = TP.split('\n').filter(function (z) { return /guest_name|\bname\b/.test(z) && /'<|innerHTML|showToast/.test(z) && /\+ *(r|z\.res|konflikt)?\.?(guest_name|name)\b(?! *[:=])/.test(z.replace(/esc\([^)]*\)/g, '')); });
t('Namen (Gaeste, Tische) werden escaped, bevor sie in HTML oder Toast landen', roh.length === 0, roh.map(function (z) { return z.trim().slice(0, 90); }).join(' | '));

// --- Lesbarkeit / Dunkelmodus / Bewegung ---
t('rufender Tisch pulsiert -- ausser bei "Bewegung reduzieren"',
  /@media \(prefers-reduced-motion: reduce\) \{ \.tp3-ruft-hof \{ animation: none; \} \}/.test(H), '');
t('freie Tischplatte nicht #ffffff (der Dunkelmodus faerbt das schwarz)',
  /frei: \{ oben: '#fbfcfb'/.test(TP), '');
t('Dunkelmodus fuer die hellen Karten und Schilder',
  /\.dark-mode \.tp3-schild\.frei > span/.test(H) && /\.dark-mode \.tp3-karte\.res/.test(H) && /\.dark-mode \.tp3-karte\.frei/.test(H), '');
t('Ladefehler wird gezeigt, mit "Nochmal versuchen" -- keine leere Flaeche',
  /Tische konnten nicht geladen werden/.test(TP) && /Nochmal versuchen/.test(TP), '');

// --- Datenbank-Datei ---
var SQL = fs.readFileSync(path.join(W, 'datenbank', '39-tischplan.sql'), 'utf8');
t('39-tischplan.sql legt pos_x, pos_y, rotation an (wiederholbar)',
  /add column if not exists pos_x/.test(SQL) && /add column if not exists pos_y/.test(SQL) && /add column if not exists rotation/.test(SQL), '');
t('39-tischplan.sql aendert keine Zeilen-Regeln', !/policy|row level security|grant /i.test(SQL.replace(/^--.*$/gm, '')), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
