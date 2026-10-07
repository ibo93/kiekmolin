// KEIN STILLER ERFOLG BEI DER RESERVIERUNG.
//
// Gefunden am 06.10.2026, beim Bauen des Ab-18-Hakens. In
// saveReservationToSupabase standen zwei blanke returns:
//
//     if (!useSupabase) { console.error(...); return; }
//     if (resTimes.length >= 5) { showToast(...); return; }
//
// Fuer submitReservation ist ein return ein ERFOLG -- es zeigte die gruene
// Bestaetigung. Im Browser gemessen (Chromium, alte gegen neue Fassung):
//
//                                       vorher              nachher
//   Verbindung beim Start gescheitert   Bestaetigung,       an den Server,
//                                       0 Anfragen          gespeichert
//   Spam-Schutz greift                  Bestaetigung,       Meldung, keine
//                                       0 Anfragen          Bestaetigung
//
// useSupabase wird false, wenn beim Start die Restaurantliste nicht kam --
// schlechter Empfang reicht. Mit der Reservierung hat das nichts zu tun:
// die geht ueber reservation-guest. Ob es im Betrieb passiert ist, laesst
// sich von hier nicht messen; im Browser bleibt davon keine Spur.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - "if (!useSupabase) return;" wieder an den Anfang
//   - beim Spam-Schutz wieder return statt throw
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }
function schneide(kopf) {
    var a = H.indexOf(kopf); if (a < 0) return '';
    var i = H.indexOf('{', a), tiefe = 0;
    for (var j = i; j < H.length; j++) { if (H[j] === '{') tiefe++; else if (H[j] === '}') { tiefe--; if (!tiefe) return H.slice(a, j + 1); } }
    return '';
}
var quelle = schneide('async function saveReservationToSupabase(');
t('saveReservationToSupabase gefunden', quelle.length > 200, quelle.length);

function lauf(opt) {
    var anfragen = 0, toasts = [], speicher = { kmi_res_times: JSON.stringify(opt.zeiten || []) };
    var f = new Function('useSupabase', 'sessionStorage', 'fetch', 'showToast', 'verfolgMerken', 'sendReservationEmail', 'window', 'console',
        quelle + '\nreturn saveReservationToSupabase;')(
        opt.verbunden,
        { getItem: function (k) { return speicher[k] || null; }, setItem: function (k, v) { speicher[k] = v; } },
        async function () { anfragen++; return opt.antwort || { ok: true, status: 200, json: async function () { return { ok: true, id: 'r1', track_token: 't', status: 'pending' }; } }; },
        function (m, art) { toasts.push((art || '') + ': ' + m); },
        function () {}, function () {}, {}, { error: function () {}, warn: function () {} });
    return f({ restaurantId: 'x', guestName: 'G', date: '2026-10-09', time: '20:00', partySize: 2 })
        .then(function () { return { erfolg: true, anfragen: anfragen, toasts: toasts }; },
              function (e) { return { erfolg: false, fehler: e, anfragen: anfragen, toasts: toasts }; });
}

(async function () {
    console.log('\n-- 1. Verbindung beim Start gescheitert --');
    var a = await lauf({ verbunden: false });
    t('die Reservierung geht trotzdem an den Server', a.anfragen === 1, a);
    t('und ist gespeichert', a.erfolg === true, a);

    console.log('\n-- 2. Spam-Schutz --');
    var jetzt = Date.now();
    var b = await lauf({ verbunden: true, zeiten: [jetzt, jetzt, jetzt, jetzt, jetzt] });
    t('fuenf in zehn Minuten: KEIN Erfolg (sonst Bestaetigung)', b.erfolg === false, b.erfolg);
    t('keine Anfrage an den Server', b.anfragen === 0, b.anfragen);
    t('der Fehler traegt den Satz fuer den Gast', !!b.fehler && /Zu viele Reservierungen/.test(b.fehler.gastText || ''), b.fehler && b.fehler.message);
    var alt = await lauf({ verbunden: true, zeiten: [jetzt - 11 * 60 * 1000, jetzt - 11 * 60 * 1000, jetzt - 11 * 60 * 1000, jetzt - 11 * 60 * 1000, jetzt - 11 * 60 * 1000] });
    t('fuenf alte (aelter als zehn Minuten) bremsen nicht', alt.erfolg === true && alt.anfragen === 1, alt);

    console.log('\n-- 3. Server sagt nein --');
    var c = await lauf({ verbunden: true, antwort: { ok: false, status: 400, json: async function () { return { ok: false, error: 'Tag geschlossen' }; } } });
    t('kein Erfolg', c.erfolg === false && /Tag geschlossen/.test(c.fehler && c.fehler.message), c.fehler && c.fehler.message);

    console.log('\n-- 4. Die aufrufende Stelle --');
    var sr = schneide('function submitReservation(');
    t('Bestaetigung erst NACH dem Speichern (then)', /createReservationInSupabase\(reservation\)\.then\(function \(\) \{\s*closeModal\('reservationModal'\);/.test(sr), null);
    t('im Fehlerfall der Satz fuer den Gast, sonst der allgemeine', /\(err && err\.gastText\) \? err\.gastText/.test(sr), null);
    t('kein blankes return mehr am Anfang von saveReservationToSupabase', !/^\s*if \(!useSupabase\)/m.test(quelle), null);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
