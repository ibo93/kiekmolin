// SPERRUNGEN + ZEITEN wie die Claude-Design-Boards "Sperrungen – drei
// Spalten" und "Zeiten" (27.10.2026). Prueft den Aufbau, nicht Pixel.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
var a = H.indexOf('<div class="kin-sperr-raster">'), e = H.indexOf('<!-- EINSTELLUNGEN TAB -->', a);
var raster = H.slice(a, e);
var l = raster.indexOf('<!-- Links: neue Sperrung -->'), m = raster.indexOf('<!-- Mitte'), r = raster.indexOf('<!-- Rechte Seite');
t('drei Spalten in der Reihenfolge links · Mitte · rechts', a > 0 && l > 0 && m > l && r > m, [l, m, r].join());
t('links: das Formular mit "Sperren"', raster.slice(l, m).indexOf('id="blockSperrKnopf"') > 0 && raster.slice(l, m).indexOf('id="blockCalendar"') < 0, '');
t('Mitte: Kalender und "Sperrungen an diesem Tag"', raster.slice(m, r).indexOf('id="blockCalendar"') > 0 && raster.slice(m, r).indexOf('id="blockList"') > 0, '');
t('rechts: Online-Tische, Sonderzeiten, Kommende', ['blockOnlineTische', 'sonderKarte', 'blockKommende'].every(function (id) { return raster.slice(r).indexOf('id="' + id + '"') > 0; }), '');
t('Raster: 3 Spalten, Tablet hoch 2, Handy 1', /\.kin-sperr-raster \{ display: grid; grid-template-columns: repeat\(3/.test(H) && /max-width: 699px\) \{ \.kin-sperr-raster \{ grid-template-columns: minmax\(0, 1fr\)/.test(H), '');
t('Zeiten: Pause-Schalter in der Überschrift, bedienbar (echtes Kästchen, beschriftet)', /class="res-pause-toggle kin-pause-kopf"[\s\S]{0,400}Mittagspause[\s\S]{0,200}class="kin-kipp"[\s\S]{0,120}id="resSettingsPauseEnabled" checked onchange="updateResPreview\(\)" aria-label="Mittagspause an"/.test(H), '');
t('Zeiten: drei Spalten wie im Board', /#resTabSettings \.res-settings-grid \{ display: grid; grid-template-columns: repeat\(3/.test(H), '');
t('Schalter auch im Dunkelmodus sichtbar (gold)', /\.dark-mode \.kin-kipp input:checked \+ \.kin-kipp-bahn \{ background: #ffd54f; \}/.test(H), '');
t('Uhrzeit- und Auswahlfelder der Sperrungen haben eine sichtbare Fläche', /#resTabBlocking select,[\s\S]{0,80}#resTabSettings \.res-time-input \{ min-height: 48px !important;[^}]*background: #f3f4f5 !important/.test(H), '');
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
