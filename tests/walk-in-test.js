// WALK-IN UND SELBST EINTRAGEN IM TABLET-MODUS.
//
// Ibo am 11.11.2026: "bei Kalender mach auch Walk-in Reservierungen auch,
// dass man selber eintragen kann".
//
// Walk-in = Gast ohne Reservierung. Personen, Name (darf leer), Tisch (darf
// leer), ein Knopf. Gespeichert wie jede Reservierung aus dem Dashboard,
// Uhrzeit jetzt, und gleich "Ist da".
//
// Wie es kaputt aussaehe:
//  - Speichern scheitert, das Fenster geht trotzdem zu -> der Wirt glaubt,
//    der Tisch sei eingetragen (Regel 6). Deshalb: Fenster bleibt, Meldung.
//  - "Ist da" scheitert still -> der Gast steht als "kommt noch" im Tag und
//    wird spaeter als "nicht gekommen" markiert. Deshalb: eigene Meldung.

var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, q) {
    q = q || H;
    var i = q.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++;
    var d = 0, j = q.indexOf('{', i);
    for (var k = j; k < q.length; k++) { if (q[k] === '{') d++; else if (q[k] === '}') { d--; if (!d) return q.slice(i, k + 1); } }
}

function bauen(opt, quelle) {
    var toasts = [], gespeichert = [], status = [], gezeichnet = 0;
    var win = { resCurrentRestaurant: 'r1', resAllReservations: [],
        resSaveToDatabase: async function (r) { gespeichert.push(JSON.parse(JSON.stringify(r))); return opt.speichern; } };
    var f = new Function('window', 'showToast', 'escapeHtml', 'updateReservationStatus', 'resHeuteZeichnen', 'localDayStr', 'thekeHaus',
        fn('walkInJetzt', quelle) + fn('walkInDaten', quelle) + fn('walkInSpeichern', quelle) + '; return { daten: walkInDaten, speichern: walkInSpeichern };')(
        win, function (m, a) { toasts.push([m, a]); }, function (x) { return String(x); },
        async function (id, st) { status.push(id + ':' + st); if (opt.statusWirft) throw new Error('weg'); return opt.status; },
        function () { gezeichnet++; },
        function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
        function () { return { id: 'r1' }; });
    return { f: f, win: win, toasts: toasts, gespeichert: gespeichert, status: status, gez: function () { return gezeichnet; } };
}

(async function () {
    var jetzt = new Date(2026, 10, 11, 19, 7);
    var A = bauen({ speichern: { id: 'neu1' }, status: true });
    var d = A.f.daten(4, '  ', '', jetzt);
    t('Walk-in: heute, Uhrzeit jetzt (19:07)', d.date === '2026-11-11' && d.time === '19:07', JSON.stringify(d));
    t('Walk-in ohne Name heisst "Walk-in"', d.name === 'Walk-in', d.name);
    t('Walk-in: 4 Personen, kein Tisch, Notiz Walk-in', d.persons === 4 && d.table === null && d.notes === 'Walk-in', JSON.stringify(d));
    t('Mit Name und Tisch', A.f.daten(2, 'Meyer', 'tisch-uuid', jetzt).name === 'Meyer' && A.f.daten(2, 'Meyer', 'tisch-uuid', jetzt).table === 'tisch-uuid', '');
    t('Unsinnige Personenzahl -> 2', A.f.daten('x', '', '', jetzt).persons === 2, '');

    var ok1 = await A.f.speichern(A.f.daten(3, 'Janssen', '', jetzt));
    t('Speichern ok: true', ok1 === true, String(ok1));
    t('gleich auf "Ist da" gesetzt', A.status[0] === 'neu1:seated', A.status.join(','));
    t('steht sofort im Tag (resAllReservations, Status seated)', A.win.resAllReservations.length === 1 && A.win.resAllReservations[0].status === 'seated', JSON.stringify(A.win.resAllReservations));
    t('Tag neu gezeichnet', A.gez() === 1, String(A.gez()));
    t('Erfolgsmeldung', A.toasts.some(function (x) { return x[1] === 'success' && /3 Pers\. gesetzt/.test(x[0]); }), JSON.stringify(A.toasts));

    var B = bauen({ speichern: { fehler: 'keine Berechtigung' } });
    var ok2 = await B.f.speichern(B.f.daten(2, '', '', jetzt));
    t('Speichern scheitert: false (Fenster bleibt offen)', ok2 === false, String(ok2));
    t('Speichern scheitert: Fehlermeldung mit Grund', B.toasts.some(function (x) { return x[1] === 'error' && /keine Berechtigung/.test(x[0]); }), JSON.stringify(B.toasts));
    t('Speichern scheitert: nichts in der Liste, kein "Ist da"', B.win.resAllReservations.length === 0 && B.status.length === 0, '');

    var C = bauen({ speichern: { id: 'neu2' }, status: false });
    var ok3 = await C.f.speichern(C.f.daten(2, '', '', jetzt));
    t('"Ist da" scheitert: eingetragen bleibt (true), aber Warnung', ok3 === true && C.toasts.some(function (x) { return x[1] === 'warning' && /nicht auf „Ist da“/.test(x[0]); }), JSON.stringify(C.toasts));
    t('"Ist da" scheitert: steht als bestaetigt, nicht als sitzt', C.win.resAllReservations[0].status === 'confirmed', C.win.resAllReservations[0].status);
    var D = bauen({ speichern: { id: 'neu3' }, statusWirft: true });
    await D.f.speichern(D.f.daten(2, '', '', jetzt));
    t('"Ist da" wirft: auch dann die Warnung', D.toasts.some(function (x) { return x[1] === 'warning'; }), JSON.stringify(D.toasts));

    // Gegenprobe: Rueckgabe ohne Pruefung der Id -> Fehler wuerde als Erfolg gelten
    var M = bauen({ speichern: { fehler: 'x' } }, H.replace("if (!gesp || !gesp.id) {", "if (!gesp) {"));
    var okm = await M.f.speichern(M.f.daten(2, '', '', jetzt));
    t('Gegenprobe: ohne Id-Pruefung gaelte ein Fehler als gespeichert -- Test wird rot', okm === true, String(okm));

    // Oberflaeche
    t('Knoepfe nur im Reiter Reservierungen', /body\.kin-theke\[data-theke-ansicht="reservierungen"\] \.kin-theke-res-knoepfe \{ display: flex; \}/.test(H)
        && /\.kin-theke-res-knoepfe \{ display: none; gap: 8px; \}/.test(H), '');
    t('Knopf Walk-in und + Reservierung in der Leiste', /onclick="thekeWalkInOeffnen\(\)">Walk-in</.test(H) && /onclick="thekeNeueReservierung\(\)"/.test(H), '');
    t('Walk-in-Fenster liegt ueber dem Tablet-Modus (10020 > 1500)', /\.kin-walkin-grund \{[^}]*z-index: 10020/.test(H), '');
    t('+ Reservierung nimmt den gewaehlten Tag der Tage-Leiste', /var tag = \(typeof _resHeuteTag !== 'undefined' && _resHeuteTag\) \|\| localDayStr\(new Date\(\)\);/.test(fn('thekeNeueReservierung')), '');
    t('Walk-in-Fenster: Tische aus derselben Liste wie das Formular', /resFormTischeLaden/.test(fn('thekeWalkInOeffnen')), '');
    t('Walk-in-Fenster: Personen-Knoepfe 1–8, echte Buttons mit aria-pressed', /\[1, 2, 3, 4, 5, 6, 7, 8\]/.test(fn('thekeWalkInOeffnen')) && /aria-pressed/.test(fn('thekeWalkInOeffnen')), '');
    t('Dunkelmodus fuer das Fenster', /\.dark-mode \.kin-walkin \{/.test(H), '');

    console.log('\n' + ok + '/' + n + ' OK');
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
