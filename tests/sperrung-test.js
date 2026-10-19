// SPERRUNGEN: Liste im richtigen Lokal, Zeitraum, mehrere Tage, Server.
//
// Ibo, 14.10.2026: "hab zeiten gesperrt für ein kunde, die sperrungen sind
// weg, aber auf dem reservierungen kalender sind die". Gemessen (Supabase
// edge_logs 12:30-12:35): angelegt bei Lokal a599f99c, die Liste fragte
// danach bei a004eaca. Anlegen und Liste ermittelten das Lokal verschieden.
//
// Dazu: "wir müssen haben zeit sperren an diesen tag und so weiter" ->
// Zeitraum von-bis, mehrere Tage. Und der Server nahm in gesperrte Zeiten
// bisher trotzdem Reservierungen an -- die Sperre galt nur in der App.
//
// Rechnung und Server werden AUSGEFUEHRT.
'use strict';
var fs = require('fs'), path = require('path');
var R = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

var A0 = H.indexOf('// ==================== SPERRUNGEN (BLOCKING) ====================');
var A1 = H.indexOf('// ==================== THEME ====================');
var BLOCK = H.slice(A0, A1);

// ---- 1. Ein Lokal für alles ----
console.log('-- 1. Anlegen, Liste, Aufheben: dasselbe Lokal --');
var felder = {};
var umgebung = {
    window: { resCurrentRestaurant: 'KUNDE', currentRestaurantId: 'ERSTES', _gastroOnlyRestaurantId: null },
    APP_DATA: { restaurants: [{ id: 'ERSTES', name: 'Erstes' }, { id: 'KUNDE', name: 'Lütt Italia' }] },
    document: {
        getElementById: function (id) { return felder[id] || null; },
        querySelectorAll: function (sel) { return sel === '.block-wt:checked' ? (felder._wt || []).map(function (v) { return { value: String(v) }; }) : []; }
    }
};
function mitUmgebung(code, rueck) {
    return new Function('window', 'APP_DATA', 'document', 'generateReservationSlots', 'localDayStr', code + '; return ' + rueck + ';');
}
var slotsJe = function (rid, datum) {
    if (datum === '2026-12-29') return [];                       // Ruhetag
    return ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];
};
var lds = function (d) { return d.toLocaleDateString('sv-SE'); };
var S = mitUmgebung(fn('sperrLokal') + fn('sperrLokalName') + fn('sperrTagePlus') + 'var _blockSelectedDate="2026-12-31", _blockSelectedType="slot", BLOCK_MAX_TAGE=92;' + fn('blockZeilenBauen') + fn('blockGruppen') + fn('sperrGastCode') + fn('sperrGastText') + fn('sperrGastAusQuelle') + fn('onlineTischeVon') + fn('nochTischeHtml'),
    '{ lokal: sperrLokal, name: sperrLokalName, bauen: blockZeilenBauen, gruppen: blockGruppen, typ: function (x) { _blockSelectedType = x; }, gast: sperrGastText, quelle: sperrGastAusQuelle, online: onlineTischeVon, noch: nochTischeHtml }')
    (umgebung.window, umgebung.APP_DATA, umgebung.document, slotsJe, lds);

t('sperrLokal nimmt das im Reservierungskalender gewählte Lokal, nicht das erste der Liste',
  S.lokal() === 'KUNDE', S.lokal());
umgebung.window._gastroOnlyRestaurantId = 'WIRT';
t('beim Wirt: sein eigenes Lokal', S.lokal() === 'WIRT', S.lokal());
umgebung.window._gastroOnlyRestaurantId = null;

// Der eigentliche Fehler: verschiedene Wege zum Lokal. Im ganzen Block darf
// es nur noch EINEN geben.
var ohneSperrLokal = BLOCK.replace(fn('sperrLokal', BLOCK), '').replace(/^\s*\/\/.*$/gm, '');
t('kein Teil der Sperrungen sucht das Lokal selbst (currentRestaurantId / erstes Lokal / resCurrentRestaurant)',
  !/currentRestaurantId|APP_DATA\.restaurants\[0\]|resCurrentRestaurant|_gastroOnlyRestaurantId/.test(ohneSperrLokal),
  (ohneSperrLokal.match(/.*(currentRestaurantId|APP_DATA\.restaurants\[0\]|resCurrentRestaurant|_gastroOnlyRestaurantId).*/) || [''])[0].trim());
['loadBlockingUI', 'createBlock', 'removeBlocks', 'blockCalSelectDate', 'blockCalBlaettern', 'blockZeitenFuellen'].forEach(function (f) {
    t(f + ' holt das Lokal über sperrLokal()', /sperrLokal\(\)/.test(fn(f, BLOCK)), 'eigener Weg');
});
t('oben steht, für welches Lokal gesperrt wird', /'Sperrungen für ' \+ \(sperrLokalName\(restId\)/.test(fn('loadBlockingUI', BLOCK)) && /id="blockLokalName"/.test(H), 'fehlt');
t('Lokal oben gewechselt -> Sperrungen laden neu', /_bt&&_bt\.style\.display!=='none'&&typeof loadBlockingUI==='function'\)loadBlockingUI\(\)/.test(H), 'bleibt beim alten Lokal');

// ---- 2. Zeitraum und mehrere Tage ----
console.log('\n-- 2. Zeitraum von-bis, mehrere Tage --');
function setze(o, wt) { felder = { _wt: wt || [0, 1, 2, 3, 4, 5, 6] }; Object.keys(o).forEach(function (k) { felder[k] = { value: o[k] }; }); }
setze({ blockVonDatum: '2026-12-28', blockBisDatum: '2026-12-31', blockTime: '18:00', blockTimeBis: '19:30', blockReason: 'Privatfeier' });
S.typ('slot');
var b = S.bauen('KUNDE');
t('Zeitraum 18:00–19:30 über 4 Tage, einer davon Ruhetag: 3 Tage × 4 Uhrzeiten = 12 Zeilen',
  !b.fehler && b.zeilen.length === 12 && b.tage === 4, JSON.stringify(b.fehler || b.zeilen.length));
t('… alle für das richtige Lokal, ohne Tisch, Status blocked, mit Grund',
  b.zeilen.every(function (z) { return z.restaurant_id === 'KUNDE' && z.table_id === null && z.status === 'blocked' && z.notes === 'Privatfeier'; }), '');
t('… nur Uhrzeiten zwischen von und bis (18:00 bis einschließlich 19:30)',
  b.zeilen.every(function (z) { return z.reservation_time >= '18:00:00' && z.reservation_time <= '19:30:00'; })
  && b.zeilen.some(function (z) { return z.reservation_time === '19:30:00'; }), '');
t('… der Ruhetag bekommt keine Zeile', b.zeilen.every(function (z) { return z.reservation_date !== '2026-12-29'; }), '');

S.typ('day');
setze({ blockVonDatum: '2026-12-24', blockBisDatum: '2026-12-26' });
b = S.bauen('KUNDE');
t('Ganzer Tag über 3 Tage: je Tag eine Zeile 00:00 ohne Tisch',
  b.zeilen.length === 3 && b.zeilen.every(function (z) { return z.reservation_time === '00:00:00' && !z.table_id; })
  && b.zeilen.map(function (z) { return z.reservation_date; }).join() === '2026-12-24,2026-12-25,2026-12-26', JSON.stringify(b.zeilen && b.zeilen.map(function (z) { return z.reservation_date; })));

S.typ('table');
setze({ blockVonDatum: '2026-12-31', blockBisDatum: '2026-12-31', blockTableId: 'T5', blockTime: '', blockTimeBis: '20:00' });
b = S.bauen('KUNDE');
t('Ein Tisch, "ganzer Tag": eine Zeile 00:00 mit Tisch', b.zeilen.length === 1 && b.zeilen[0].table_id === 'T5' && b.zeilen[0].reservation_time === '00:00:00', JSON.stringify(b.zeilen));

S.typ('slot');
setze({ blockVonDatum: '2026-01-01', blockBisDatum: '2026-12-31', blockTime: '18:00', blockTimeBis: '19:00' });
t('mehr als 92 Tage auf einmal -> klare Meldung statt tausender Zeilen', /Höchstens 92 Tage/.test(S.bauen('KUNDE').fehler || ''), JSON.stringify(S.bauen('KUNDE').fehler));
setze({ blockVonDatum: '2026-12-31', blockBisDatum: '2026-12-31', blockTime: '20:00', blockTimeBis: '18:00' });
t('"Bis Uhrzeit" vor "Von Uhrzeit" -> Meldung', /liegt vor/.test(S.bauen('KUNDE').fehler || ''), JSON.stringify(S.bauen('KUNDE')));

// Ruhetag jede Woche: nur montags, 12 Wochen, Gast liest "Ruhetag"
S.typ('day');
setze({ blockVonDatum: '2026-11-02', blockBisDatum: '2027-01-24', blockGastText: 'ruhetag', blockReason: 'Ruhetag' }, [1]);
b = S.bauen('KUNDE');
t('Wochentage: nur Montage über 12 Wochen -> 12 Zeilen, alle montags',
  !b.fehler && b.zeilen.length === 12 && b.zeilen.every(function (z) { return new Date(z.reservation_date + 'T12:00:00').getDay() === 1; }), JSON.stringify(b.fehler || b.zeilen.length));
t('Gast-Text "Ruhetag" steht in der Herkunft (admin_block:ruhetag)', b.zeilen.every(function (z) { return z.source === 'admin_block:ruhetag'; }), b.zeilen[0] && b.zeilen[0].source);
setze({ blockVonDatum: '2026-11-02', blockBisDatum: '2026-11-08' }, []);
t('mehrere Tage ohne Wochentag -> Meldung', /mindestens einen Wochentag/.test(S.bauen('KUNDE').fehler || ''), JSON.stringify(S.bauen('KUNDE')));
setze({ blockVonDatum: '2026-11-02', blockBisDatum: '2026-11-02', blockGastText: 'quatsch' });
t('Standard und Unbekanntes: Gäste lesen "Ausgebucht" (source admin_block)', S.bauen('KUNDE').zeilen[0].source === 'admin_block', S.bauen('KUNDE').zeilen[0].source);
t('Herkunft -> Gast-Text, alte Sperren (admin_block) = Ausgebucht',
  S.quelle('admin_block') === 'ausgebucht' && S.quelle('admin_block:geschlossen') === 'geschlossen' && S.quelle('admin_block:<x>') === 'ausgebucht' && S.gast('ruhetag').titel === 'Ruhetag' && S.gast('ausgebucht').warteliste === true && S.gast('ferien').warteliste === false, '');

// Online-Tische
t('Online-Tische aus features: online_tische:2 -> 2, fehlt/0/Unsinn -> keine Grenze',
  S.online({ features: ['delivery', 'online_tische:2'] }) === 2 && S.online({ features: ['online_tische:0'] }) === null && S.online({ features: ['online_tische:x'] }) === null && S.online({}) === null, '');
t('Uhrzeit zeigt "noch 2 Tische" / "noch 1 Tisch", ohne Grenze nichts',
  /noch 2 Tische/.test(S.noch({ nochTische: 2 })) && /noch 1 Tisch</.test(S.noch({ nochTische: 1 })) && S.noch({ nochTische: null }) === '', S.noch({ nochTische: 1 }));
var las0 = fn('loadAvailableSlots');
t('Gästeseite rechnet die Grenze ein (min(Tische, Online-Tische)) und gibt nochTische mit',
  /if \(_onlineT\) maxTables = Math\.min\(maxTables, _onlineT\);/.test(las0) && /nochTische: _onlineT \? Math\.max\(0, maxTables - bookingsAtTime\) : null/.test(las0), 'fehlt');
// Seit 19.10.2026 (neues Reservieren) baut EINE Funktion die Knoepfe fuer
// Mittag und Abend (resSlotsHtml, Umschalter waehlt die Liste).
t('Mittag und Abend zeigen es (eine Knopf-Funktion fuer beide)', /nochTischeHtml\(s\)/.test(fn('resSlotsHtml')) && /resSlotsHtml\(liste\)/.test(fn('renderSlotsWithSuggestions')) && /window\._resTeil === 'mittag' \? mittag : abend/.test(fn('renderSlotsWithSuggestions')), 'fehlt');

var slots = slotsJe('K', '2026-12-31');
var g = S.gruppen([
    { id: 'a', reservation_time: '18:00:00', table_id: null, notes: 'Feier' },
    { id: 'b', reservation_time: '18:30:00', table_id: null, notes: 'Feier' },
    { id: 'c', reservation_time: '19:00:00', table_id: null, notes: 'Feier' },
    { id: 'd', reservation_time: '20:00:00', table_id: null, notes: 'Feier' },
    { id: 'e', reservation_time: '17:00:00', table_id: null, notes: 'anders' }
], slots);
t('Liste fasst aufeinanderfolgende Uhrzeiten zusammen (18:00–19:00), trennt bei Lücke und anderem Grund',
  g.length === 3 && g.some(function (x) { return x.von === '18:00' && x.bis === '19:00' && x.ids.join() === 'a,b,c'; })
  && g.some(function (x) { return x.von === '20:00' && x.bis === '20:00'; }) && g.some(function (x) { return x.notes === 'anders'; }), JSON.stringify(g));

var cb = fn('createBlock', BLOCK);
t('Speichern zählt, was zurückkommt (leere Antwort ist kein Erfolg)',
  /'Prefer': 'return=representation'/.test(cb) && /if \(gespeichert < neu\.length\)/.test(cb), 'meldet blind Erfolg');
t('schon Gesperrtes wird nicht doppelt eingetragen', /var neu = b\.zeilen\.filter\(function \(z\) \{\s*return !vorhanden\[/.test(cb), 'doppelt');
t('Liste: Ladefehler wird gesagt, nicht als "keine Sperrungen" gezeigt',
  /if \(!resp\.ok\) throw new Error\('HTTP ' \+ resp\.status\);/.test(fn('loadBlockList', BLOCK))
  && /Sperrungen konnten nicht geladen werden/.test(fn('loadBlockList', BLOCK)), 'stille Leere');
t('Kalender markiert gesperrte Tage, Übersicht "Kommende Sperrungen"',
  /_blockMonat\[dateStr\]/.test(fn('blockCalRender', BLOCK)) && /id="blockKommende"/.test(H) && /function blockKommendeLaden\(/.test(BLOCK), 'fehlt');

// ---- 3. Gäste-Text ----
var vollText = new Function(fn('reservierungVollText') + fn('sperrGastCode') + fn('sperrGastText') + '; return reservierungVollText;')();
t('Gast liest bei Sperrung "Ausgebucht" (Ibo: "ausgebucht muss meistens stehen")',
  /^Ausgebucht – diese Uhrzeit ist leider schon voll/.test(vollText({ ausgebucht: true, gesperrt: 'zeit' }))
  && /^Ausgebucht – an diesem Tag ist leider alles voll/.test(vollText({ ausgebucht: true, gesperrt: 'tag' })), vollText({ gesperrt: 'zeit' }));
t('Server lehnt mit Gast-Text ab -> Gast liest ihn ("Ruhetag – …", "Geschlossene Gesellschaft – …")',
  /^Ruhetag – an diesem Tag ist das Restaurant geschlossen\. Wähle gern ein anderes Datum\.$/.test(vollText({ ausgebucht: true, gesperrt: 'tag', hinweis: 'ruhetag' }))
  && /^Geschlossene Gesellschaft – zu dieser Uhrzeit/.test(vollText({ ausgebucht: true, gesperrt: 'zeit', hinweis: 'geschlossen' }))
  && /^Ausgebucht – diese Uhrzeit/.test(vollText({ ausgebucht: true, gesperrt: 'zeit', hinweis: 'ausgebucht' })), vollText({ ausgebucht: true, gesperrt: 'tag', hinweis: 'ruhetag' }));
var las = fn('loadAvailableSlots');
t('ganzer Tag gesperrt -> Gästeseite nimmt den Gast-Text der Sperre (Standard "Ausgebucht" + Warteliste)',
  /if \(fullDayBlock\) \{[\s\S]{0,900}var _gt = sperrGastText\(_ganz && _ganz\.hinweis\);[\s\S]{0,900}if \(_gt\.warteliste\) \{[\s\S]{0,500}showWaitlistForm\(\)/.test(las)
  && !/keine Reservierungen möglich/.test(las), 'anderer Text');
var GT = new Function(fn('sperrGastCode') + fn('sperrGastText') + '; return sperrGastText;')();
t('… ohne Gast-Text: "Ausgebucht – an diesem Tag ist leider alles voll." mit Warteliste; "Ruhetag" ohne',
  GT(undefined).titel === 'Ausgebucht' && GT(undefined).tag === 'an diesem Tag ist leider alles voll.' && GT(undefined).warteliste === true && GT('ruhetag').warteliste === false, JSON.stringify(GT(undefined)));
var rsw = fn('renderSlotsWithSuggestions');
t('keine Uhrzeit mehr frei -> "Ausgebucht", nicht "Keine verfügbaren Zeiten"',
  /<strong>Ausgebucht<\/strong> – an diesem Tag ist leider alles voll/.test(rsw) && !/Keine verfügbaren Zeiten/.test(rsw), 'alter Text');
t('… außer der Tag ist schon vorbei (sonst gelogen)',
  /window\._slotsTagVorbei = date === todayStr && allTimes\.every/.test(las) && /Für heute sind keine Uhrzeiten mehr frei/.test(rsw), 'sagt nachts "ausgebucht"');

// ---- 4. Server ----
console.log('\n-- 4. Server: gesperrte Zeiten werden abgelehnt --');
var Module = require('module'), echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    return echtLaden.apply(this, arguments);
};
function plus(tg) { var d = new Date(); d.setDate(d.getDate() + tg); return d.toLocaleDateString('sv-SE'); }
function lauf(sperren, uhrzeit, notes, kaputt, features, belegt, oh) {
    process.env.SUPABASE_SERVICE_KEY = 'x';
    var p = require.resolve(path.join(R, 'netlify/functions/reservation-guest.js')); delete require.cache[p];
    var F = require(p), gespeichert = null, alt = global.fetch, w = console.warn, l = console.log;
    console.warn = function () {}; console.log = function () {};
    global.fetch = function (url, o) {
        url = String(url);
        var antw = function (d, s) { return Promise.resolve({ ok: (s || 200) < 300, status: s || 200, json: function () { return Promise.resolve(d); }, text: function () { return Promise.resolve(JSON.stringify(d)); } }); };
        if (/\/restaurants\?id=eq\./.test(url) && /features/.test(url)) return antw([{ id: 'r1', is_active: true, features: features || [], opening_hours: /opening_hours/.test(url) ? (oh || null) : undefined }]);
        if (/\/reservations\?/.test(url) && /reservation_time=eq\./.test(url) && /status=in\.\(pending,confirmed,seated\)/.test(url)) return antw(belegt || []);
        if (/\/reservations\?/.test(url) && /status=eq\.blocked/.test(url)) {
            if (kaputt) return antw({ message: 'kaputt' }, 500);
            // Wie PostgREST: table_id=is.null filtert Tisch-Sperren weg.
            return antw(sperren.filter(function (z) { return !/table_id=is\.null/.test(url) || !z.table_id; }));
        }
        if (/\/reservations$/.test(url) && o && o.method === 'POST') { gespeichert = JSON.parse(o.body); return antw([Object.assign({ id: 'neu', track_token: 'tt' }, gespeichert)], 201); }
        return antw([]);
    };
    return F.handler({ httpMethod: 'POST', body: JSON.stringify({ restaurant_id: '11111111-1111-4111-8111-111111111111', guest_name: 'Ayse', guest_phone: '0176 1', party_size: 2, reservation_date: plus(3), reservation_time: uhrzeit, notes: notes || '' }) })
        .then(function (r) { return { code: r.statusCode, body: JSON.parse(r.body), gespeichert: gespeichert }; })
        .finally(function () { global.fetch = alt; console.warn = w; console.log = l; });
}

(async function () {
    var r = await lauf([{ reservation_time: '00:00:00', table_id: null }], '19:00');
    t('ganzer Tag gesperrt -> 409 "tag", nichts gespeichert, Text sagt "ausgebucht"', r.code === 409 && r.body.gesperrt === 'tag' && r.body.ausgebucht === true && r.gespeichert === null && /ausgebucht/.test(r.body.error), JSON.stringify(r));
    r = await lauf([{ reservation_time: '19:00:00', table_id: null }], '19:00');
    t('Uhrzeit gesperrt -> 409 "zeit", nichts gespeichert', r.code === 409 && r.body.gesperrt === 'zeit' && r.gespeichert === null, JSON.stringify(r));
    r = await lauf([{ reservation_time: '19:00:00', table_id: null }], '19:30');
    t('andere Uhrzeit am selben Tag geht durch', r.code === 200 && r.gespeichert !== null, JSON.stringify(r));
    r = await lauf([{ reservation_time: '00:00:00', table_id: 'T5' }], '19:00');
    t('nur ein Tisch gesperrt -> Reservierung geht durch (der Tisch fehlt nur in der Zählung)', r.code === 200, JSON.stringify(r));
    r = await lauf([{ reservation_time: '00:00:00', table_id: null }], '19:00', '[Warteliste] Tag war ausgebucht');
    t('Warteliste geht durch (wie bei "ausgebucht")', r.code === 200, JSON.stringify(r));
    r = await lauf([{ reservation_time: '00:00:00', table_id: null, source: 'admin_block:ruhetag' }], '19:00');
    t('Gast-Text "Ruhetag" kommt beim Gast an (hinweis), Text sagt Ruhetag', r.code === 409 && r.body.hinweis === 'ruhetag' && /Ruhetag/.test(r.body.error), JSON.stringify(r.body));
    r = await lauf([], '19:00', '', false, ['online_tische:2'], [{ id: 'a' }, { id: 'b' }]);
    t('Online-Tische 2, schon 2 Reservierungen um 19:00 -> 409 ausgebucht', r.code === 409 && r.body.ausgebucht === true && r.gespeichert === null, JSON.stringify(r));
    r = await lauf([], '19:00', '', false, ['online_tische:2'], [{ id: 'a' }, { id: 'w', notes: '[Warteliste] x' }]);
    t('… Warteliste zählt nicht mit -> geht durch', r.code === 200, JSON.stringify(r));
    r = await lauf([], '19:00', '', false, ['online_tische:2'], [{ id: 'a' }]);
    t('… 1 von 2 belegt -> geht durch', r.code === 200, JSON.stringify(r));
    // Sonderzeit mit Tisch-Zahl (Ibo 16.10.2026: "mit Tische so viel in die Zeit buchbar")
    var SZ = { sonderzeiten: [{ datum: plus(3), von: '12:00', bis: '13:00', tische: 1 }] };
    r = await lauf([], '12:30', '', false, [], [{ id: 'a' }], SZ);
    t('Sonderzeit 12–13 Uhr mit 1 Tisch, schon 1 Reservierung um 12:30 -> 409', r.code === 409 && r.body.ausgebucht === true && r.gespeichert === null, JSON.stringify(r));
    r = await lauf([], '12:30', '', false, [], [], SZ);
    t('… noch frei -> geht durch', r.code === 200 && r.gespeichert !== null, JSON.stringify(r));
    r = await lauf([], '19:00', '', false, ['online_tische:5'], [{ id: 'a' }, { id: 'b' }], SZ);
    t('… außerhalb der Sonderzeit gilt die allgemeine Zahl (5) -> geht durch', r.code === 200, JSON.stringify(r));
    r = await lauf([], '12:30', '', false, ['online_tische:1'], [{ id: 'a' }], { sonderzeiten: [{ datum: plus(3), von: '12:00', bis: '13:00', tische: 3 }] });
    t('… Sonderzeit mit 3 Tischen geht vor der allgemeinen Zahl (1)', r.code === 200, JSON.stringify(r));
    var TG = require(path.join(R, 'netlify/functions/reservation-guest.js'))._tischGrenzeUm;
    t('Grenze: anderer Tag / ohne Tisch-Zahl / kaputt -> allgemeine Zahl', TG(['online_tische:4'], SZ, plus(4), '12:30') === 4 && TG([], { sonderzeiten: [{ datum: plus(3), von: '12:00', bis: '13:00' }] }, plus(3), '12:30') === null && TG([], '{kaputt', plus(3), '12:30') === null && TG([], JSON.stringify(SZ), plus(3), '13:00') === 1, '');
    // res-availability: Gast-Text nur fuer Sperren, Herkunft echter Reservierungen bleibt drin
    process.env.SUPABASE_SERVICE_KEY = 'x';
    var rap = require.resolve(path.join(R, 'netlify/functions/res-availability.js')); delete require.cache[rap];
    var RA = require(rap), altF = global.fetch;
    global.fetch = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve([
        { reservation_time: '19:00:00', party_size: 2, status: 'confirmed', table_id: null, source: 'telefon' },
        { reservation_time: '00:00:00', party_size: 30, status: 'blocked', table_id: null, source: 'admin_block:geschlossen' },
        { reservation_time: '18:00:00', party_size: 30, status: 'blocked', table_id: null, source: 'admin_block' }]); } }); };
    var av = await RA.handler({ httpMethod: 'GET', queryStringParameters: { r: '11111111-1111-4111-8111-111111111111', d: '2026-12-31' } });
    global.fetch = altF;
    var bel = JSON.parse(av.body).belegung || [];
    t('Belegung: Sperre trägt hinweis (geschlossen / ausgebucht), echte Reservierung ohne Herkunft',
      bel[1].hinweis === 'geschlossen' && bel[2].hinweis === 'ausgebucht' && !('source' in bel[0]) && !('hinweis' in bel[0]) && bel.every(function (z) { return !('source' in z); }), JSON.stringify(bel));

    r = await lauf([], '19:00', '', true);
    t('Sperrungen nicht lesbar -> durch (lieber eine Buchung zu viel als ein abgewiesener Gast)', r.code === 200, JSON.stringify(r));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
