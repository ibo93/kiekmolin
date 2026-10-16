// SONDERZEITEN: an einem Datum zusaetzlich buchbar (auch Ruhetag, Pause).
//
// Ibo, 16.10.2026: "spezial Zeit Freigabe ... 1 Stunde" -- auf Rueckfrage:
// "Extra-Zeit ausserhalb der Oeffnung". Steht in opening_hours.sonderzeiten.
// Ausgefuehrt: generateReservationSlots, das Speichern (gefaelschtes fetch)
// und das Zusammenfuehren im Lokal-Formular.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

var APP_DATA = { restaurants: [] };
var G = new Function('APP_DATA', fn('parseTime') + fn('subtractMinutes') + fn('sonderzeitenVon') + fn('sonderzeitenAm') + fn('reservierSchichtenAm') + fn('generateReservationSlots') + '; return generateReservationSlots;')(APP_DATA);
// rest_day 0 = Montag. 19.10.2026 ist ein Montag, 20.10. ein Dienstag.
function lokal(sz, extra) { return Object.assign({ id: 'L', opening_time: '17:00', closing_time: '22:00', slot_interval_minutes: 30, rest_day: 0,
    opening_hours: { pause_enabled: true, pause_start: '14:00', pause_end: '17:00', sonderzeiten: sz } }, extra || {}); }

APP_DATA.restaurants = [lokal([])];
t('ohne Sonderzeit: Ruhetag (Montag) keine Uhrzeiten', G('L', '2026-10-19').length === 0, G('L', '2026-10-19').join(' '));
APP_DATA.restaurants = [lokal([{ datum: '2026-10-19', von: '12:00', bis: '13:00' }])];
t('Sonderzeit am Ruhetag 12:00–13:00 -> 12:00 12:30 13:00', G('L', '2026-10-19').join(' ') === '12:00 12:30 13:00', G('L', '2026-10-19').join(' '));
t('… gilt nur an diesem Datum (Montag danach wieder zu)', G('L', '2026-10-26').length === 0, G('L', '2026-10-26').join(' '));
APP_DATA.restaurants = [lokal([{ datum: '2026-10-20', von: '15:00', bis: '15:30' }])];
var di = G('L', '2026-10-20');
t('Sonderzeit in der Pause kommt dazu, normale Zeiten bleiben', di[0] === '15:00' && di[1] === '15:30' && di.indexOf('17:00') > -1 && di.indexOf('21:30') > -1, di.join(' '));
t('… keine Doppelten, sortiert', di.join(' ') === di.slice().sort().filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' '), di.join(' '));
APP_DATA.restaurants = [lokal([{ datum: '2026-10-20', von: '13:00', bis: '12:00' }, { datum: 'kaputt', von: '1', bis: '2' }])];
t('kaputte Einträge (bis vor von, falsches Datum) werden ignoriert', G('L', '2026-10-20')[0] === '17:00', G('L', '2026-10-20').join(' '));
APP_DATA.restaurants = [Object.assign(lokal([{ datum: '2026-10-19', von: '12:00', bis: '12:30' }]), { opening_hours: JSON.stringify({ sonderzeiten: [{ datum: '2026-10-19', von: '12:00', bis: '12:30' }] }) })];
t('opening_hours als Text (ältere Zeilen) geht auch', G('L', '2026-10-19').join(' ') === '12:00 12:30', G('L', '2026-10-19').join(' '));

// Gaeste-Kalender: Ruhetag mit Sonderzeit ist anklickbar.
t('Gäste-Kalender: Ruhetag mit Sonderzeit nicht mehr zu', /if \(isClosed && _resRest && sonderzeitenAm\(_resRest, ds\)\.length\) isClosed = false;/.test(fn('resCalRender')), 'fehlt');

// Speichern: frisch lesen, nur sonderzeiten aendern, 0 Zeilen = Fehler.
(async function () {
    function welt(antwortZeilen, oh) {
        var w = { patch: null, angezeigt: 0 };
        var R = { id: 'L', slot_interval_minutes: 30, opening_hours: {} };
        var env = {
            APP_DATA: { restaurants: [R] }, SUPABASE_URL: 'https://x', sperrKopf: function (e) { return e || {}; },
            localDayStr: function () { return '2026-10-16'; },
            sbRead: async function () { return { json: async function () { return [{ opening_hours: oh }]; } }; },
            fetch: async function (u, o) { w.patch = JSON.parse(o.body); return { ok: true, json: async function () { return antwortZeilen === null ? [{ opening_hours: w.patch.opening_hours }] : antwortZeilen; } }; },
            sonderAnzeigen: function () { w.angezeigt++; }
        };
        var namen = Object.keys(env);
        w.speichern = new Function(namen.join(','), fn('sonderzeitenVon') + fn('sonderSpeichern') + '; return sonderSpeichern;').apply(null, namen.map(function (k) { return env[k]; }));
        w.R = R;
        return w;
    }
    var w = welt(null, { res_fenster: true, pause_start: '14:00', sonderzeiten: [{ datum: '2026-10-01', von: '12:00', bis: '13:00' }] });
    await w.speichern('L', function (alt) { return alt.concat([{ datum: '2026-10-19', von: '12:00', bis: '13:00' }]); });
    t('Speichern behält andere Einstellungen (res_fenster, Pause)', w.patch.opening_hours.res_fenster === true && w.patch.opening_hours.pause_start === '14:00', JSON.stringify(w.patch));
    t('… räumt vergangene Sonderzeiten weg, neue ist drin', JSON.stringify(w.patch.opening_hours.sonderzeiten) === '[{"datum":"2026-10-19","von":"12:00","bis":"13:00"}]', JSON.stringify(w.patch.opening_hours.sonderzeiten));
    t('… und übernimmt den Stand in die App', w.R.opening_hours.sonderzeiten.length === 1 && w.angezeigt === 1, JSON.stringify(w.R.opening_hours));
    var w0 = welt([], {});
    var fehler = null;
    try { await w0.speichern('L', function (a) { return a.concat([{ datum: '2026-10-19', von: '12:00', bis: '13:00' }]); }); } catch (e) { fehler = e.message; }
    t('0 Zeilen geändert -> Fehler, nicht still "freigegeben"', /keine Berechtigung/.test(fehler || '') && !w0.R.opening_hours.sonderzeiten, fehler);
    t('Fehler wird angezeigt ("Gäste sehen den alten Stand")', /Gäste sehen den alten Stand/.test(fn('sonderHinzufuegen')) && /Gäste sehen den alten Stand/.test(fn('sonderEntfernen')), 'fehlt');

    // Lokal-Formular: Bearbeiten ersetzte opening_hours ganz.
    var f = fn('addRestaurant');
    t('Lokal bearbeiten behält Sonderzeiten, Pause und res_fenster', /openingHours = Object\.assign\(\{\}, existingRest\.opening_hours, openingHours\);/.test(f), 'ersetzt ganz');
    t('Karte steht in den Sperrungen und lädt mit', /id="sonderKarte"/.test(H) && /sonderAnzeigen\(restId\);/.test(H), 'fehlt');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
