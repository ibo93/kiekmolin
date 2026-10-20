// Tischplan: Skizze einlesen, Hinfliegen, Gastblick, Laufwege (20.10.2026).
//
// Ibo: "wenn ich die Skizze der Plan einfüge, so passt sich der Tischplan 3D
// auch an das Lokal an und es muss rein zoomen ... Ideen, die so keiner hat".
//
// Dieser Test liest Quelltext und ruft die Prüf-Funktion des Servers echt auf.
// Ob es im Browser richtig AUSSIEHT, misst werkzeug/tischplan-messen.js
// (Abschnitt 8). Ob Claude eine echte Skizze richtig liest, misst keiner von
// beiden -- das geht erst mit einem Foto von Ibo.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');
var fn = fs.readFileSync(KMI + '/netlify/functions/tischplan-skizze.js', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function block(name) { var i = h.indexOf('function ' + name + '('); return i < 0 ? '' : h.slice(i, h.indexOf('\n                }', i) + 18); }

console.log('\n-- 1. Server: wer darf, was kommt zurück --');
var handler = fn.slice(fn.indexOf('exports.handler'));
t('Berechtigung wird VOR dem teuren Aufruf geprüft (darfLokal vor fragen)',
  handler.indexOf('V.darfLokal(') > 0 && handler.indexOf('V.darfLokal(') < handler.indexOf('fragen(key'), 'Reihenfolge falsch');
t('ohne Berechtigung: 403, nicht weiter', /if \(!\(await V\.darfLokal\(event, body\.restaurant_id\)\)\) return K\.json\(403/.test(handler), 'fehlt');
t('fehlender Schlüssel wird gesagt, nicht still', /ANTHROPIC_API_KEY fehlt/.test(handler), 'fehlt');
t('Zeitlimit wird als eigener Satz gemeldet', /zu lange gedauert/.test(handler), 'fehlt');
t('Server schreibt nichts in die Datenbank', !/rest\/v1\//.test(fn) && !/method: 'PATCH'|method: 'POST', headers: \{ apikey/.test(fn), 'schreibt doch');
t('kein Dienstschlüssel im Browser-Code', h.indexOf('SUPABASE_SERVICE_KEY') < 0 || !/SUPABASE_SERVICE_KEY\s*[=:]\s*['"]ey/.test(h), 'Schlüssel im Browser');

var S = require(KMI + '/netlify/functions/tischplan-skizze.js');
var p = S.pruefen({ breite: 14, tiefe: 8, form: 'L', ecke: 'xx', ausB: 99, massstab: true,
  teile: [{ art: 'theke', x: 120, y: 50, b: 3, t: 0.8 }, { art: 'rakete', x: 1, y: 1 }],
  tische: [{ form: 'oval', plaetze: 99, x: 10, y: 20 }], rahmen: { x0: 5, y0: 5, x1: 95, y1: 90 }, unsicher: ['Theke'] });
t('unbekannte Teile fliegen raus (nur, was der Plan kennt)', p.raum.teile.length === 1 && p.raum.teile[0].art === 'theke', JSON.stringify(p.raum.teile));
t('Werte werden begrenzt (x 120 -> 100, Plätze 99 -> 30, Ecke <= Breite-1)', p.raum.teile[0].x === 100 && p.tische[0].plaetze === 30 && p.raum.ausB === 13, JSON.stringify(p));
t('falsche Ecke -> "or", falsche Form -> "eckig"', p.raum.ecke === 'or' && p.tische[0].form === 'eckig', JSON.stringify(p));
t('Rahmen kommt mit (für die Skizze unter dem Plan)', p.rahmen && p.rahmen.x1 === 95, JSON.stringify(p.rahmen));
t('zu kleiner Rahmen wird verworfen', S.pruefen({ rahmen: { x0: 10, y0: 10, x1: 12, y1: 12 } }).rahmen === null, 'angenommen');
t('kein Grundriss -> kein_plan', S.pruefen({ kein_plan: true }).kein_plan === true, 'nicht erkannt');
t('ohne Maß im Bild: massstab false (die App sagt "geschätzt")', S.pruefen({}).massstab === false, 'falsch');

console.log('\n-- 2. App: Skizze einlesen --');
var lesen = block('skizzeLesen'), ueber = block('skizzeUebernehmen');
t('geht mit Anmeldung und Lokal an die Funktion',
  /fetch\('\/\.netlify\/functions\/tischplan-skizze'/.test(lesen) && /'Authorization': 'Bearer ' \+ kmiToken\(\)/.test(lesen) && /restaurant_id: tp\.rid/.test(lesen), lesen.slice(0, 300));
// Regel 6: ein Fehler darf nicht aussehen wie "nichts erkannt".
t('jede Antwort ohne ok wird zur Fehlermeldung', /if \(!res\.ok \|\| !d \|\| !d\.ok\) throw/.test(lesen) && /melden\(String\(e && e\.message \|\| e\), 'fehler'\)/.test(lesen), 'still');
t('Bild wird vorher verkleinert (Zeitlimit 10 s)', /bildVerkleinern\(datei, 1600\)/.test(lesen), 'fehlt');
t('vorhandene Tische werden nach Plätzen zugeordnet, nicht der Reihe nach',
  /Math\.abs\(a\.plaetze - k\.plaetze\)/.test(ueber) && !/if \(i < da\.length\)/.test(ueber), 'der Reihe nach');
t('kein Tisch wird gelöscht', !/is_active: false/.test(ueber) && !/tp\.tische = tp\.tische\.filter/.test(ueber), 'löscht');
t('neue Tische mit Lage aus der Skizze', /tischAnlegen\('skizze', \[k\.plaetze, art, L, B\], 0, 0, \{ x: lage\.x, y: lage\.y/.test(ueber), 'ohne Lage');
t('tischAnlegen übernimmt die Lage', /daten\.pos_x = lg\.x; daten\.pos_y = lg\.y; daten\.rotation = lg\.drehung;/.test(h), 'fest 50/50');
t('die Meldung sagt, was passiert ist', /'Aus der Skizze: '/.test(ueber) && /vorhandene verschoben/.test(ueber) && /bleiben, wo sie waren/.test(ueber), 'stumm');
t('Skizze liegt ÜBER den Bodenstücken (L-Form), unter allem anderen',
  /var h = bodenStuecke\(raum\) \+ skz \+ modellLicht\(raum\)/.test(h), 'unter dem Boden versteckt');
t('PDF wird mit Satz abgelehnt statt still zu scheitern', /PDF geht hier noch nicht/.test(lesen), 'fehlt');

console.log('\n-- 3. Hinfliegen und Zoom --');
t('Zoom bis 6-fach, an beiden Stellen (Knopf und zwei Finger)',
  /var ZOOM_MAX = 6;/.test(h) && (h.match(/Math\.min\(ZOOM_MAX, /g) || []).length === 2 && !/tp\.zoom = Math\.max\(0\.6, Math\.min\(3,/.test(h), 'noch 3');
t('Antippen fliegt hin (nur außerhalb des Bearbeitens)', /if \(tp\.bearbeiten\) zeichnen\(\); else hinfliegen\(tp\.gewaehlt\);/.test(h), 'fehlt');
var flug = block('hinfliegen');
t('erst ausmessen, dann vom alten Bild aus mit Übergang', /boden\.style\.transform = vorher; void boden\.offsetWidth;/.test(flug) && /classList\.add\('tp3-flug'\)/.test(flug), 'springt');
t('Übergang aus, wenn das Gerät weniger Bewegung will', /prefers-reduced-motion: reduce\) \{ \.tp3-boden\.tp3-flug \{ transition: none; \}/.test(h), 'fehlt');

console.log('\n-- 4. Gastblick --');
t('Blickwinkel wie ein Auge (halbe Bühnenbreite, nicht 1700 px)', /clientWidth \|\| 600\) \* 0\.5\)/.test(block('gastAbstand')) && !/GAST_ABSTAND = 1700/.test(h), 'Fernglas');
t('im Gastblick stehen alle Wände hoch', /function nahK\(k\) \{ return drei && !tp\.gast &&/.test(h), 'vorne nur Sockel');
t('Wände in Raumhöhe 2,6 m', /WAND_H = tp\.gast \? Math\.round\(2\.6 \* tp\.ppm\) : 58;/.test(h), 'Modellhöhe');
// Schärfe (Ibo: "es muss bessere Qualität sein"). Gemessen am 20.10.2026: eine
// Vergrößerung nur in der Matrix (scale3d um das Auge) machte NICHTS schärfer.
// Erst echte Pixel (CSS-zoom) -- der Test verlangt deshalb zoom, nicht scale3d.
t('Gastblick in echter höherer Auflösung (CSS-zoom 3, von der Matrix wieder herausgerechnet)',
  /GAST_FEIN = 3;/.test(h) && /boden\.style\.zoom = gt \? GAST_FEIN : '';/.test(h) && /\(S \/ Z\)/.test(block('gastTransform')), 'ohne zoom');
t('weiche Schatten im Gastblick ohne Unschärfe', /\.tp3\[data-gast="1"\] \.tp3-f\[style\*="var\(--tp3-schatten\)"\] \{ box-shadow: none !important;/.test(h), 'verwischt');
t('Tischbeine stechen nicht durch die Platte', /\.tp3\[data-gast="1"\] \.tp3-f\[style\*="var\(--tp3-bein\)"\] \{ display: none !important; \}/.test(h), 'sichtbar');
t('zoom wird außerhalb des Gastblicks zurückgesetzt (sonst wäre der Plan 3x groß)', /boden\.style\.zoom = gt \? GAST_FEIN : '';\s*if \(gt\)/.test(h), 'bleibt');
t('Augen über dem Sitz, nicht hinter der Lehne', /zurueck = -0\.08 \* tp\.ppm/.test(block('gastSicht')), 'Lehne im Bild');
t('Wischen = umschauen', /if \(tp\.gast\) tp\.gast\.um = wisch\.d0 - dx \* 0\.3;/.test(h), 'dreht den Raum');
t('Antippen im Gastblick wählt keinen anderen Tisch', /if \(tp\._gewischt \|\| tp\.gast\) return;/.test(h), 'fehlt');
t('Bearbeiten oder "Von oben" beendet ihn', /if \(tp\.gast && \(tp\.bearbeiten \|\| tp\.ansicht !== '3d'/.test(h), 'bleibt hängen');

console.log('\n-- 5. Laufwege-Wache --');
var fl = block('flaechenVon');
t('gemessen zwischen den Stühlen, nicht den Tischplatten', /stuehle\(g, t\.plaetze\)\.forEach/.test(fl) && /r: 0\.3/.test(fl), 'nur Platten');
t('Grenze 60 cm', /var LAUF_MIN = 0\.6;/.test(h), 'andere Grenze');
t('nur beim Bearbeiten', /tp\.eng = tp\.bearbeiten \? engstellen\(\) : \[\];/.test(h), 'immer');
t('frei ist auch eine Aussage (kein leerer Kasten)', /Laufwege frei/.test(block('engstellenListe')), 'leer');

console.log('\n-- 6. Auslieferung --');
var sw = fs.readFileSync(KMI + '/sw.js', 'utf8'), w = fs.readFileSync(KMI + '/netlify/functions/gastweg-wache.js', 'utf8');
var vSw = +(/kmi-shell-v(\d+)/.exec(sw) || [])[1], vW = +(/CACHE_MINDESTENS = (\d+)/.exec(w) || [])[1];
t('neue Fassung für die Geräte (sw v99 oder höher, Wache gleich)', vSw >= 99 && vW === vSw, vSw + ' / ' + vW);

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
