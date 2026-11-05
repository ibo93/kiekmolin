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

function aufbau(feld, bid) {
    feld = feld || 'open'; bid = bid || 'ohSchnell';
    var felder = {}, knoepfe = [], toasts = [];
    TAGE.forEach(function (tg) {
        ['Start', 'End', 'Start2', 'End2'].forEach(function (s) { felder[feld + tg + s] = { value: s === 'Start' ? '11:00' : s === 'End' ? '22:00' : '' }; });
        var at = { 'data-tag': tg, 'aria-pressed': 'false' };
        knoepfe.push({ getAttribute: function (k) { return at[k]; }, setAttribute: function (k, v) { at[k] = v; } });
    });
    ['Start', 'End', 'Start2', 'End2'].forEach(function (x) { felder[bid + x] = { value: '' }; });
    var box = { id: bid, getAttribute: function (k) { return k === 'data-feld' ? feld : null; },
        querySelectorAll: function (sel) { return /aria-pressed="true"/.test(sel) ? knoepfe.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }) : knoepfe; } };
    var doc = { getElementById: function (id) { return id === bid ? box : (felder[id] || null); } };
    var f = new Function('document', 'showToast', fn('ohTagWahl') + '\n' + fn('ohSchnellUebernehmen') + '; return { wahl: ohTagWahl, los: ohSchnellUebernehmen };')(doc, function (m, a) { toasts.push(a + ':' + m); });
    var los = f.los; f.los = function () { return los(box); };
    f.losOhne = function () { return los(); };
    return { f: f, felder: felder, knoepfe: knoepfe, toasts: toasts, tag: function (tg) { return knoepfe[TAGE.indexOf(tg)]; } };
}

// ---- Oberflaeche ----
t('Kasten "Mehrere Tage auf einmal" steht im Oeffnungszeiten-Formular', /id="ohSchnell" data-feld="open"/.test(H) && H.indexOf('id="ohSchnell"') < H.indexOf('id="openMoStart"') && H.indexOf('id="ohSchnell"') > H.indexOf('>Öffnungszeiten</h4>'), '');
t('sieben Tagesknoepfe Mo-So, in beiden Kaesten', TAGE.every(function (tg) { return H.split('data-tag="' + tg + '" aria-pressed="false" onclick="ohTagWahl(this)"').length === 3; }), '');
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


// ---- Ohne Kasten-Angabe: Admin-Kasten (alte Aufrufe) ----
A = aufbau(); A.f.wahl(A.tag('Mo')); A.felder.ohSchnellStart.value = '10:00'; A.felder.ohSchnellEnd.value = '20:00';
t('ohne Angabe -> Admin-Kasten #ohSchnell', A.f.losOhne() === 1 && A.felder.openMoStart.value === '10:00', '');

// ==== WIRT: eigene Karte ====
t('Wirt-Karte "Öffnungszeiten" unter Reservierungen > Zeiten, mit eigenem Kasten', /id="wirtOhKarte"/.test(H) && /id="wOhSchnell" data-feld="wOpen"/.test(H) && H.indexOf('id="wirtOhKarte"') > H.indexOf('id="resTabSettings"') && H.indexOf('id="wirtOhKarte"') < H.indexOf('id="resSettingsStart"'), '');
t('Wirt-Tabelle: alle 7 Tage mit 4 Feldern', TAGE.every(function (tg) { return ['Start', 'End', 'Start2', 'End2'].every(function (x) { return H.indexOf('id="wOpen' + tg + x + '"') > -1; }); }), '');
t('Karte wird beim Oeffnen der Zeiten befuellt', /wirtOhAnzeigen\(restaurant\)/.test(fn('loadResSettingsUI')), '');
var W = aufbau('wOpen', 'wOhSchnell');
['Sa', 'So'].forEach(function (tg) { W.f.wahl(W.tag(tg)); });
W.felder.wOhSchnellStart.value = '12:00'; W.felder.wOhSchnellEnd.value = '23:00';
t('Wirt-Kasten fuellt die Wirt-Tabelle (wOpen...)', W.f.los() === 2 && W.felder.wOpenSaStart.value === '12:00' && W.felder.wOpenSoEnd.value === '23:00' && W.felder.wOpenMoStart.value === '11:00', W.felder.wOpenSaStart.value);

function wirtSandbox(felder, antwort, status) {
    var calls = [], toasts = [];
    var doc = { getElementById: function (id) { return felder[id] || null; } };
    var appRest = { id: 'R1', opening_hours: { pause_start: '14:00', res_fenster: true, mo_start: '09:00' }, rest_day: 2, features: [] };
    var W2 = new Function('document', 'showToast', 'window', 'APP_DATA', 'fetch', 'SUPABASE_URL', 'SUPABASE_KEY', 'kmiToken', 'resTageHinweis', 'urlaubFelderZeigen',
        'var OH_TAGE = ' + /var OH_TAGE = (\[[^\]]*\]);/.exec(H)[1] + ';\n' + ['ohGross', 'ohAusTabelle', 'wirtOhSpeichern'].map(fn).join('\n') + '; return { lies: ohAusTabelle, speichern: wirtOhSpeichern };')(
        doc, function (m, a) { toasts.push(a + ':' + m); }, { resCurrentRestaurant: 'R1' }, { restaurants: [appRest] },
        async function (u, o) { calls.push({ u: u, o: o }); return { ok: status < 400, status: status, json: async function () { return JSON.parse(antwort); } }; },
        'https://x', 'k', function () { return 't'; }, function () {}, function () {});
    return { W: W2, calls: calls, toasts: toasts, rest: appRest };
}
function tabelle(werte) {
    var f = { wirtOhStand: { textContent: '' }, wRuhetag: { value: werte.ruhetag || '' } };
    ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(function (tg) {
        f['wOpen' + tg + 'Start'] = { value: '17:00' }; f['wOpen' + tg + 'End'] = { value: '23:00' }; f['wOpen' + tg + 'Start2'] = { value: '' }; f['wOpen' + tg + 'End2'] = { value: '' };
    });
    Object.keys(werte).forEach(function (k) { if (f[k]) f[k].value = werte[k]; });
    return f;
}
(async function () {
    var X = wirtSandbox(tabelle({}), '[{"id":"R1","opening_hours":{"x":1},"rest_day":null}]', 200);
    var ok1 = await X.W.speichern();
    var body = JSON.parse(X.calls[0].o.body);
    t('Wirt speichert: Wochentage neu, Pause/res_fenster bleiben erhalten', ok1 === true && body.opening_hours.mo_start === '17:00' && body.opening_hours.pause_start === '14:00' && body.opening_hours.res_fenster === true, JSON.stringify(body.opening_hours).slice(0, 120));
    t('Wirt speichert NICHT opening_time/closing_time (das sind die Reservierungszeiten)', !('opening_time' in body) && !('closing_time' in body) && body.rest_day === null, JSON.stringify(Object.keys(body)));
    t('mit Antwort (return=representation) und Stand "Gespeichert"', /return=representation/.test(X.calls[0].o.headers.Prefer) && /success:Öffnungszeiten gespeichert/.test(X.toasts.join('|')), X.toasts.join('|'));

    var f0 = tabelle({});
    X = wirtSandbox(f0, '[]', 200);
    t('0 Zeilen zurueck (keine Berechtigung) -> NICHT gespeichert, sagt warum', (await X.W.speichern()) === false && /error:Öffnungszeiten nicht gespeichert/.test(X.toasts.join('|')) && /Nicht gespeichert: keine Berechtigung/.test(f0.wirtOhStand.textContent), f0.wirtOhStand.textContent);

    var f = tabelle({ wOpenDiStart: '', wOpenDiEnd: '' });
    X = wirtSandbox(f, '[{}]', 200);
    t('ein Tag leer -> Meldung "Di: ...", nichts geschickt', (await X.W.speichern()) === false && !X.calls.length && /error:Di: bitte/.test(X.toasts.join('|')), X.toasts.join('|'));
    f = tabelle({ wOpenDiStart: '', wOpenDiEnd: '', ruhetag: '1' });
    X = wirtSandbox(f, '[{"id":"R1","rest_day":1}]', 200);
    t('leerer Tag ist der Ruhetag -> erlaubt, rest_day = 1', (await X.W.speichern()) === true && JSON.parse(X.calls[0].o.body).rest_day === 1, X.toasts.join('|'));
    f = tabelle({ wOpenFrStart2: '18:00' });
    X = wirtSandbox(f, '[{}]', 200);
    t('zweite Schicht halb -> Meldung, nichts geschickt', (await X.W.speichern()) === false && !X.calls.length && /Fr: zweite Schicht/.test(X.toasts.join('|')), X.toasts.join('|'));

    // ==== Betriebsurlaub ====
    t('Betriebsurlaub im Admin-Formular und in der Wirt-Karte', /data-urlaub-wo="formular"/.test(H) && /data-urlaub-wo="wirt"/.test(H) && /id="formUrlaubVon"/.test(H) && /id="wUrlaubVon"/.test(H), '');
    t('Admin-Formular zeigt beim Oeffnen den Urlaub DIESES Lokals', /urlaubFelderZeigen\(restaurant\.features \|\| \[\], 'formUrlaub'\)/.test(H), '');
    var calls = [], antw = [];
    var U = new Function('document', 'showToast', 'window', 'APP_DATA', 'fetch', 'sbRead', 'SUPABASE_URL', 'SUPABASE_KEY', 'kmiToken', 'updateVacationUI',
        ['urlaubFelderZeigen', 'urlaubSchreiben', 'urlaubKnopf'].map(fn).join('\n') + '; return { schreib: urlaubSchreiben, knopf: urlaubKnopf, zeig: urlaubFelderZeigen };');
    var uf = { wUrlaubVon: { value: '2026-12-22' }, wUrlaubBis: { value: '2027-01-06' }, wUrlaubStand: { textContent: '' } }, ut = [];
    var UU = U({ getElementById: function (id) { return uf[id] || null; } }, function (m, a) { ut.push(a + ':' + m); }, { resCurrentRestaurant: 'R1' }, { restaurants: [{ id: 'R1', features: [] }] },
        async function (u, o) { calls.push(o); return { ok: true, status: 200, json: async function () { return antw.shift(); } }; },
        async function () { return { json: async function () { return [{ features: ['abholung', 'vacation:2026-01-01:2026-01-05'] }]; } }; },
        'https://x', 'k', function () { return 't'; }, function () {});
    antw = [[{ id: 'R1', features: ['abholung', 'vacation:2026-12-22:2027-01-06'] }]];
    var r1 = await UU.knopf('wirt', 'speichern');
    var gesendet = JSON.parse(calls[0].body).features;
    t('Urlaub eintragen: alter Eintrag ersetzt, andere Schalter bleiben', r1 === true && gesendet.join() === 'abholung,vacation:2026-12-22:2027-01-06', gesendet.join());
    t('Stand zeigt den geplanten Urlaub', /Geplant: 22\. Dezember bis 6\. Januar/.test(uf.wUrlaubStand.textContent), uf.wUrlaubStand.textContent);
    calls = []; antw = [[]]; ut = [];
    t('0 Zeilen zurueck -> "Nicht gespeichert"', (await UU.knopf('wirt', 'speichern')) === false && /Nicht gespeichert: keine Berechtigung/.test(uf.wUrlaubStand.textContent), uf.wUrlaubStand.textContent);
    uf.wUrlaubBis.value = '2026-12-01'; calls = [];
    t('Bis vor Von -> Meldung, nichts geschickt', (await UU.knopf('wirt', 'speichern')) === false && !calls.length, '');
    antw = [[{ id: 'R1', features: ['abholung'] }]]; calls = [];
    t('Loeschen -> nur der Urlaubs-Eintrag faellt weg', (await UU.knopf('wirt', 'loeschen')) === true && JSON.parse(calls[0].body).features.join() === 'abholung', '');
    t('Dashboard "Betrieb" nutzt dieselbe gepruefte Speicherung', /await urlaubSchreiben\(restId, newEntry\)/.test(fn('_patchVacation')) && !/'Prefer': 'return=minimal'/.test(fn('_patchVacation')), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
