// RESERVIERUNGS-ALARM wie im Entwurf (27.10.2026). Der Test FUEHRT
// showNewReservationAlarm aus, mit nachgebautem document, und liest, was
// auf dem Bildschirm stuende.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var angehaengt = [], weg = 0, status = [], ergebnis = true;
var dok = {
    getElementById: function (id) { return id === 'newResAlarmOverlay' ? (angehaengt.length && !weg ? { remove: function () { weg++; } } : null) : null; },
    createElement: function () { return { setAttribute: function () {}, style: {} }; },
    body: { appendChild: function (el) { angehaengt.push(el); } }
};
var code = ['_alarmEsc', 'kinSym', 'showNewReservationAlarm', 'dismissNewReservationAlarm', 'resAlarmBestaetigen', 'resAlarmAblehnen'].map(fn).join('\n');
var K = new Function('document', 'localStorage', 'window', 'setInterval', 'clearInterval', 'setTimeout', 'updateReservationStatus', 'kinConfirm', 'showDashboardSection',
    'var KIN_SYM = { tel: "" }; var _resAlarmInterval = null, _resAlarmCount = 0; function resAlarmSeitZeigen() {}\n' + code
    + '; return { zeigen: showNewReservationAlarm, ja: resAlarmBestaetigen, nein: resAlarmAblehnen };')(
    dok, { getItem: function () { return null; } },
    { resAllReservations: [{ id: 'a', date: '2026-10-31', time: '19:30:00', persons: 4, status: 'confirmed' }, { id: 'b', date: '2026-10-31', time: '19:30', persons: 2, status: 'cancelled' }, { id: 'c', date: '2026-10-31', time: '20:00', persons: 9, status: 'confirmed' }] },
    function () { return 1; }, function () {}, function () {},
    async function (id, st) { status.push([id, st]); return ergebnis; }, async function () { return true; }, function () {});

(async function () {
    K.zeigen({ id: 'r1', guest_name: '<img src=x onerror=alert(1)>', guest_phone: '0170 1234412', party_size: 6, reservation_date: '2026-10-31', reservation_time: '19:30:00', status: 'pending', source: 'app', notes: 'Kinderstuhl' });
    var h = angehaengt[0] && angehaengt[0].innerHTML || '';
    t('Uhrzeit groß, Datum ausgeschrieben', /<b>19:30<\/b>/.test(h) && /SAMSTAG, 31\. OKTOBER/.test(h), h.slice(0, 300));
    t('Personen 6', /PERSONEN<\/span><b>6<\/b>/.test(h), '');
    t('"schon da" gezählt: 4 (Storno nicht, 20 Uhr nicht) – keine erfundene Platzzahl', /4 Gäste/.test(h) && !/frei/.test(h), h.match(/SCHON[^<]*<\/span><b[^>]*>[^<]*/));
    t('Name wird entschärft (kein HTML vom Gast)', !/<img src=x/.test(h) && /&lt;img/.test(h), '');
    t('Telefon gekürzt, Anrufen-Knopf wählt die volle Nummer', /0170 ••• 412/.test(h) && /href="tel:01701234412"/.test(h), '');
    t('Quelle ONLINE und die Notiz des Gastes', /ONLINE/.test(h) && /Kinderstuhl/.test(h), '');
    t('Bestätigen ist der große Knopf und bestätigt DIESE Reservierung', /class="kin-alarm-haupt" onclick="resAlarmBestaetigen\('r1'\)">Bestätigen/.test(h), '');
    t('Ablehnen klein mit Nachfrage', /class="kin-alarm-ablehnen" onclick="resAlarmAblehnen\('r1'\)"/.test(h), '');

    ergebnis = false; weg = 0;
    await K.ja('r1');
    t('Bestätigen scheitert -> Alarm bleibt offen (nicht still zu)', status[0][1] === 'confirmed' && weg === 0, JSON.stringify(status) + ' weg=' + weg);
    ergebnis = true;
    await K.ja('r1');
    t('Bestätigen klappt -> Alarm zu', weg === 1, weg);
    status = []; ergebnis = true; angehaengt = [{}]; weg = 0;
    await K.nein('r1');
    t('Ablehnen = "cancelled" (Absage-Mail geht raus, Platz wird frei) -- nicht "rejected"', status.length === 1 && status[0][1] === 'cancelled', JSON.stringify(status));

    angehaengt = []; weg = 0;
    K.zeigen({ id: 'r2', guest_name: 'Auto', party_size: 2, reservation_date: '2026-10-31', reservation_time: '18:00', status: 'confirmed' });
    var h2 = angehaengt[0].innerHTML;
    t('schon automatisch bestätigt -> "Ansehen" statt "Bestätigen"', /kin-alarm-haupt" onclick="dismissNewReservationAlarm\(true\)">Ansehen/.test(h2) && !/>Bestätigen</.test(h2), '');

    // Kleine Ersatz-Karte (Vollbild-Alarm aus): dunkel/gold wie das Bestell-Banner
    t('Ersatz-Karte "Neue Reservierung": kein gruener Verlauf mehr, dunkel mit Goldrand', !/#16a34a,#0f766e/.test(H) && /#newResAlert\{[^']*background:#00251e;color:#fff;border:2px solid #ffd54f;/.test(H) && /#newResAlert \.ra-ic\{[^']*background:#ffd54f/.test(H), '');
    t('Gold-Symbol verblasst nicht (eigene Animation statt der doppelt definierten "pulse")', /#newResAlert \.ra-ic\{[^']*animation:kinSymPuls/.test(H) && /#newOrderAlert \.oa-ic\{[^']*animation:kinSymPuls/.test(H) && (H.match(/@keyframes kinSymPuls\{0%,100%\{opacity:1\}50%\{opacity:\.65\}\}/g) || []).length === 2, '');
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
