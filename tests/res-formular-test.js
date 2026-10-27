// NEUE RESERVIERUNG (27.10.2026). Zwei stille Fehler, die hier nicht
// wiederkommen duerfen:
//   1. "Automatisch" speicherte Tisch 1 (parseInt('') || 1), aus einer
//      fest eingetragenen Liste "Tisch 1 (2P)" .. "Tisch 9" -- in jedem Lokal.
//   2. Scheiterte das Speichern: "lokal gespeichert". Die Reservierung lebte
//      nur im Browser und war nach dem Neuladen weg.
// Der Test FUEHRT resSaveToDatabase und resSaveNew aus.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function block(anfang) {
    var i = H.indexOf(anfang); if (i < 0) throw new Error('fehlt: ' + anfang);
    var d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
var gesendet = [], antwort;
var felder = {};
function feld(id, wert) { felder[id] = { value: wert, style: {}, disabled: false, selectedOptions: [{ textContent: 'Tisch 4 · 6 Plätze' }] }; }
var toasts = [];
var W = { resCurrentRestaurant: 'r1', resAllReservations: [] };
var umgebung = new Function('window', 'fetch', 'document', 'showToast', 'escapeHtml', 'kmiToken', 'SUPABASE_URL', 'SUPABASE_KEY',
    block('window.resSaveToDatabase = async function(reservation) {') + ';\n' + block('window.resSaveNew = async function() {') + ';');
umgebung(W, async function (url, opt) {
    var b = JSON.parse(opt.body); gesendet.push(b);
    var a = antwort(b);
    return { ok: a[0] < 300, status: a[0], text: async function () { return typeof a[1] === 'string' ? a[1] : JSON.stringify(a[1]); } };
}, { getElementById: function (id) { return felder[id] || null; } },
function (m, art) { toasts.push([m, art]); }, function (x) { return String(x); }, function () { return 'tok'; }, 'https://x', 'k');

(async function () {
    var UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
    antwort = function (b) { return [201, [Object.assign({ id: 'neu1' }, b)]]; };
    var z = await W.resSaveToDatabase({ date: '2026-10-28', time: '19:00', name: 'A', persons: 2, table: null });
    t('ohne Tisch -> keine table_id', gesendet[0] && !('table_id' in gesendet[0]) && z.id === 'neu1', JSON.stringify(gesendet[0]));
    gesendet = [];
    await W.resSaveToDatabase({ date: '2026-10-28', time: '19:00', name: 'A', persons: 2, table: 1 });
    t('eine Zahl (alte Liste) wird NICHT als Tisch gespeichert', !('table_id' in gesendet[0]), JSON.stringify(gesendet[0]));
    gesendet = [];
    await W.resSaveToDatabase({ date: '2026-10-28', time: '19:00', name: 'A', persons: 2, table: UUID });
    t('echte Tisch-ID wird gespeichert', gesendet[0].table_id === UUID, JSON.stringify(gesendet[0]));

    gesendet = []; feld('resTable', UUID);
    antwort = function (b) { return b.table_id ? [409, '{"code":"23503","message":"violates foreign key constraint \\"reservations_table_id_fkey\\""}'] : [201, [Object.assign({ id: 'neu2' }, b)]]; };
    z = await W.resSaveToDatabase({ date: '2026-10-28', time: '19:00', name: 'A', persons: 2, table: UUID, notes: 'Geburtstag' });
    t('alte Tisch-Verknüpfung (23503) -> ohne Tisch, Tisch in der Notiz', z.id === 'neu2' && gesendet.length === 2 && /^Tisch 4 · Geburtstag$/.test(gesendet[1].notes), JSON.stringify(gesendet));

    antwort = function () { return [403, '{"message":"permission denied"}']; };
    z = await W.resSaveToDatabase({ date: '2026-10-28', time: '19:00', name: 'A', persons: 2 });
    t('403 -> Fehler "keine Berechtigung", keine ID', !z.id && z.fehler === 'keine Berechtigung', JSON.stringify(z));

    // ---- resSaveNew ----
    feld('resDate', '2026-10-28'); feld('resTime', '19:00'); feld('resName', 'Meyer'); feld('resPartySize', '4');
    feld('resPhone', ''); feld('resTable', ''); feld('resNotes', ''); feld('saveReservationBtn', null);
    felder.newReservationModal = { style: { display: 'flex' } };
    toasts = []; W.resAllReservations = []; W.resRenderAll = function () {};
    // Tisch 1 ist belegt -- "Automatisch" darf davon NICHT abgehalten werden.
    W.isTableAvailable = function (tisch) { return tisch !== 1 && tisch !== '1'; };
    W.getTableReservations = function () { return [{ name: 'Belegt', time: '19:00' }]; };
    await W.resSaveNew();
    t('Speichern scheitert -> Formular bleibt offen', felder.newReservationModal.style.display === 'flex', felder.newReservationModal.style.display);
    t('… nichts "lokal" in die Liste', W.resAllReservations.length === 0, W.resAllReservations.length);
    t('… und eine Fehlermeldung', toasts.some(function (x) { return x[1] === 'error' && /Nicht gespeichert/.test(x[0]); }), JSON.stringify(toasts));
    t('… der Name bleibt stehen (nichts geht verloren)', felder.resName.value === 'Meyer', felder.resName.value);

    antwort = function (b) { return [201, [Object.assign({ id: 'neu3' }, b)]]; };
    gesendet = []; toasts = [];
    await W.resSaveNew();
    t('"Automatisch" wird nicht von Tisch 1 blockiert', !toasts.some(function (x) { return /Belegt/.test(x[0]); }) && gesendet.length === 1, JSON.stringify(toasts));
    t('"Automatisch" -> ohne Tisch gespeichert (nicht Tisch 1)', gesendet[0] && !('table_id' in gesendet[0]) && W.resAllReservations[0] && W.resAllReservations[0].table === null, JSON.stringify(gesendet[0]));
    t('gespeichert -> Formular zu', felder.newReservationModal.style.display === 'none', felder.newReservationModal.style.display);

    var form = H.slice(H.indexOf('id="newReservationModal"'), H.indexOf('id="saveReservationBtn"'));
    t('keine fest eingetragenen Tische mehr im Formular', !/Tisch \d \(\dP\)/.test(form), '');
    t('Tische kommen aus restaurant_tables, Fehler wird angezeigt', /restaurant_tables\?restaurant_id=eq\./.test(block('async function resFormTischeLaden() {')) && /Tische nicht geladen/.test(block('async function resFormTischeLaden() {')), '');
    t('Personen als Knöpfe 1–8 plus "mehr"', (form.match(/onclick="resFormPersonen\(\d\)"/g) || []).length === 8 && /id="resPartyMehr"/.test(form), '');
    t('kein "lokal gespeichert" mehr', !/Reservierung lokal gespeichert/.test(H), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
