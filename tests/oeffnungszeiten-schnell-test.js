// OEFFNUNGSZEITEN: MEHRERE TAGE AUF EINMAL (02.11.2026).
// Ibo: "die Tage auf einmal waehlen, eine Zeit, nicht jedes Mal einzeln".
// Der Test FUEHRT ohSchnellUebernehmen mit einem kleinen Formular aus.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function aufbau() {
    var felder = {}, knoepfe = [], toasts = [];
    TAGE.forEach(function (tg) {
        ['Start', 'End', 'Start2', 'End2'].forEach(function (s) { felder['open' + tg + s] = { value: s === 'Start' ? '11:00' : s === 'End' ? '22:00' : '' }; });
        var at = { 'data-tag': tg, 'aria-pressed': 'false' };
        knoepfe.push({ getAttribute: function (k) { return at[k]; }, setAttribute: function (k, v) { at[k] = v; } });
    });
    ['ohSchnellStart', 'ohSchnellEnd', 'ohSchnellStart2', 'ohSchnellEnd2'].forEach(function (id) { felder[id] = { value: '' }; });
    var doc = {
        getElementById: function (id) { return felder[id] || null; },
        querySelectorAll: function (sel) { return /aria-pressed="true"/.test(sel) ? knoepfe.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }) : knoepfe; }
    };
    var f = new Function('document', 'showToast', fn('ohTagWahl') + '\n' + fn('ohSchnellUebernehmen') + '; return { wahl: ohTagWahl, los: ohSchnellUebernehmen };')(doc, function (m, a) { toasts.push(a + ':' + m); });
    return { f: f, felder: felder, knoepfe: knoepfe, toasts: toasts, tag: function (tg) { return knoepfe[TAGE.indexOf(tg)]; } };
}

// ---- Oberflaeche ----
t('Kasten "Mehrere Tage auf einmal" steht im Oeffnungszeiten-Formular', /id="ohSchnell"/.test(H) && H.indexOf('id="ohSchnell"') < H.indexOf('id="openMoStart"') && H.indexOf('id="ohSchnell"') > H.indexOf('>Öffnungszeiten</h4>'), '');
t('sieben Tagesknoepfe Mo-So', TAGE.every(function (tg) { return H.indexOf('data-tag="' + tg + '" aria-pressed="false" onclick="ohTagWahl(this)"') > -1; }), '');
t('Dunkelmodus: Uebernehmen-Knopf dunkel auf Gelb mit !important', /\.dark-mode \.kmi-oh-los \{[^}]*color: #00251e !important/.test(H), '');

// ---- Tag antippen ----
var A = aufbau();
A.f.wahl(A.tag('Mo')); A.f.wahl(A.tag('Di'));
t('Antippen waehlt, nochmal Antippen waehlt ab', A.tag('Mo').getAttribute('aria-pressed') === 'true' && (A.f.wahl(A.tag('Di')), A.tag('Di').getAttribute('aria-pressed') === 'false'), '');

// ---- Mo-Fr 17-23 ----
A = aufbau();
['Mo', 'Di', 'Mi', 'Do', 'Fr'].forEach(function (tg) { A.f.wahl(A.tag(tg)); });
A.felder.ohSchnellStart.value = '17:00'; A.felder.ohSchnellEnd.value = '23:00';
var r = A.f.los();
t('Mo-Fr 17:00-23:00 -> alle fuenf Tage eingetragen', r === 5 && ['Mo', 'Di', 'Mi', 'Do', 'Fr'].every(function (tg) { return A.felder['open' + tg + 'Start'].value === '17:00' && A.felder['open' + tg + 'End'].value === '23:00'; }), r);
t('Sa und So bleiben unveraendert', A.felder.openSaStart.value === '11:00' && A.felder.openSoEnd.value === '22:00', A.felder.openSaStart.value);
t('Meldung nennt die Tage und erinnert ans Speichern', /success:Mo, Di, Mi, Do, Fr: 17:00–23:00 eingetragen\. Zum Sichern unten speichern/.test(A.toasts.join('|')), A.toasts.join('|'));
t('danach sind die Tage wieder abgewaehlt (naechste Gruppe neu waehlen)', A.knoepfe.every(function (b) { return b.getAttribute('aria-pressed') === 'false'; }), '');

// ---- Zweite Schicht ----
A = aufbau();
A.f.wahl(A.tag('Sa')); A.f.wahl(A.tag('So'));
A.felder.ohSchnellStart.value = '11:30'; A.felder.ohSchnellEnd.value = '14:00';
A.felder.ohSchnellStart2.value = '17:00'; A.felder.ohSchnellEnd2.value = '22:00';
A.f.los();
t('mit Mittagspause: beide Schichten fuer Sa und So', A.felder.openSaStart2.value === '17:00' && A.felder.openSoEnd2.value === '22:00' && A.felder.openSaEnd.value === '14:00', A.felder.openSaStart2.value);
A = aufbau();
A.felder.openMoStart2.value = '17:00'; A.felder.openMoEnd2.value = '22:00';
A.f.wahl(A.tag('Mo')); A.felder.ohSchnellStart.value = '12:00'; A.felder.ohSchnellEnd.value = '22:00';
A.f.los();
t('ohne zweite Schicht: alte zweite Schicht wird geleert (sonst bliebe sie still stehen)', A.felder.openMoStart2.value === '' && A.felder.openMoEnd2.value === '', A.felder.openMoStart2.value);

// ---- Nichts still verschlucken ----
A = aufbau();
A.felder.ohSchnellStart.value = '17:00'; A.felder.ohSchnellEnd.value = '23:00';
r = A.f.los();
t('keine Tage gewaehlt -> Meldung, nichts geaendert', r === 0 && /error:Bitte zuerst die Tage/.test(A.toasts.join('|')) && A.felder.openMoStart.value === '11:00', A.toasts.join('|'));
A = aufbau(); A.f.wahl(A.tag('Mo'));
A.felder.ohSchnellStart.value = '17:00';
r = A.f.los();
t('"Zu" leer -> Meldung, nichts geaendert', r === 0 && /error:Bitte „Auf“ und „Zu“/.test(A.toasts.join('|')) && A.felder.openMoStart.value === '11:00', A.toasts.join('|'));
A = aufbau(); A.f.wahl(A.tag('Mo'));
A.felder.ohSchnellStart.value = '11:00'; A.felder.ohSchnellEnd.value = '14:00'; A.felder.ohSchnellStart2.value = '17:00';
r = A.f.los();
t('zweite Schicht halb ausgefuellt -> Meldung, nichts geaendert', r === 0 && /error:Zweite Schicht/.test(A.toasts.join('|')) && A.felder.openMoEnd.value === '22:00', A.toasts.join('|'));

// ---- Gespeichert wird weiter ueber dieselben Felder ----
t('Speichern liest weiter openMoStart ... openSoEnd2', /mo_start: document\.getElementById\('openMoStart'\)/.test(H) && /so_end2: document\.getElementById\('openSoEnd2'\)/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
