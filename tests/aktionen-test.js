// AKTIONEN -- LADIES NIGHT, PARTY, HAPPY HOUR, 10 % BEI ONLINE-RESERVIERUNG.
//
// Gebaut am 06.10.2026 fuer den ersten Shisha-Bar-Kunden: "muss kiekmolin
// dann anbieten damit der kunde es fuer sich anspassen kann".
//
// WAS SCHIEFGEHEN KANN, UND WIE ES DANN AUSSAEHE
//   - Server und Browser rechnen verschieden: der Gast liest "Ladies Night:
//     Cocktail gratis", an der Reservierung steht nichts. -> Abschnitt 2
//     prueft beide mit denselben Faellen.
//   - Der Gast traegt sich den Rabatt selbst ein (der Browser schickt
//     aktion_text mit). -> Abschnitt 3: der Server nimmt nur, was ER findet.
//   - Eine Werbeaktion weist einen Gast ab, weil die Tabelle fehlt. Genau so
//     ein Nebenschauplatz hat am 25.08.2026 vier Gaeste gekostet. -> Abschnitt 3.
//   - Die Dashboard-Liste uebernimmt nur Felder, die in ihrer festen Liste
//     stehen -- wie mapRestaurant. Ohne aktion_text dort waere der Vorteil
//     still weg. -> Abschnitt 5.
//   - Schreiben "gelingt" mit 201, und eine Regel hat nichts geschrieben.
//     -> Abschnitt 5: jeder Schreibweg verlangt die Zeile zurueck.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - im Browser die Mitternachts-Regel anders als auf dem Server
//   - im Server den Wochentag aus new Date('JJJJ-MM-TT') statt aus den Ziffern
//   - reservation-guest uebernimmt aktion_text aus dem Browser
//   - reservation-guest ohne try/catch beim Lesen der Aktionen
//   - aktion_text aus der Dashboard-Liste gestrichen
//   - beim Speichern ohne Pruefung der zurueckgegebenen Zeile
'use strict';
var fs = require('fs');
var path = require('path');
var Module = require('module');
var KMI = path.join(__dirname, '..');
var FN = path.join(KMI, 'netlify', 'functions');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

var A = require(path.join(FN, 'lib', 'aktionen.js'));

// Gemeinsame Faelle fuer Server und Browser. 2026-10-12 ist ein Montag.
var LADIES = { titel: 'Ladies Night', art: 'vorteil', gilt_fuer: 'alle', vorteil: 'Cocktail gratis', wochentage: [3], von: '21:00', bis: '03:00', aktiv: true };
var HAPPY  = { titel: 'Happy Hour', art: 'vorteil', gilt_fuer: 'alle', vorteil: '2 für 1', wochentage: [0, 1, 2, 3, 4], von: '17:00', bis: '19:00', aktiv: true };
var ONLINE = { titel: 'Online reserviert', art: 'vorteil', gilt_fuer: 'reservierung', vorteil: '10 % auf die Rechnung', wochentage: [0, 1, 2, 3, 4, 5, 6], aktiv: true };
var PARTY  = { titel: 'Party', art: 'event', gilt_fuer: 'alle', datum: '2026-10-17', von: '22:00', aktiv: true };
var OKT    = { titel: 'Oktober-Special', art: 'event', gilt_fuer: 'alle', wochentage: [5], gueltig_ab: '2026-10-01', gueltig_bis: '2026-10-31', aktiv: true };
var AUS    = { titel: 'Pausiert', art: 'event', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4, 5, 6], aktiv: false };

var FAELLE = [
    [LADIES, '2026-10-15', '22:00', true,  'Ladies Night: Donnerstag 22:00'],
    [LADIES, '2026-10-15', '21:00', true,  'Ladies Night: genau zum Beginn'],
    [LADIES, '2026-10-15', '19:00', false, 'Ladies Night: Donnerstag 19:00, noch nicht'],
    // Donnerstag 02:00 FRUEH gehoert zur Mittwochnacht -- nicht zur Ladies Night,
    // die erst am Donnerstagabend anfaengt. Dieser Fall fehlte zuerst: die
    // Gegenprobe "Browser rechnet ueber Mitternacht anders" blieb gruen.
    [LADIES, '2026-10-15', '02:00', false, 'Ladies Night: Donnerstag 02:00 frueh -- gehoert zur Nacht davor'],
    [LADIES, '2026-10-16', '22:00', false, 'Ladies Night: Freitag -- falscher Tag'],
    [LADIES, '2026-10-15', '',      true,  'Ladies Night: ohne Uhrzeit -> der Tag zaehlt'],
    [HAPPY,  '2026-10-14', '18:00', true,  'Happy Hour: Mittwoch 18:00'],
    [HAPPY,  '2026-10-14', '19:30', false, 'Happy Hour: Mittwoch 19:30, vorbei'],
    [HAPPY,  '2026-10-17', '18:00', false, 'Happy Hour: Samstag -- nicht dabei'],
    [ONLINE, '2026-10-18', '20:00', true,  'Online-Reservierung: Sonntag, ganzer Tag'],
    [PARTY,  '2026-10-17', '23:00', true,  'Party: am Tag, nach Beginn'],
    [PARTY,  '2026-10-24', '23:00', false, 'Party: eine Woche spaeter -- einmalig'],
    [OKT,    '2026-10-17', '20:00', true,  'Oktober-Special: Samstag im Oktober'],
    [OKT,    '2026-11-07', '20:00', false, 'Oktober-Special: Samstag im November'],
    [AUS,    '2026-10-15', '20:00', false, 'pausierte Aktion gilt nie'],
    [LADIES, 'unsinn',     '22:00', false, 'kaputtes Datum -> nein']
];

console.log('\n-- 1. Die Regel auf dem Server --');
FAELLE.forEach(function (f) { t('Server: ' + f[4], A.passt(f[0], f[1], f[2]) === f[3], A.passt(f[0], f[1], f[2])); });
t('Wochentag aus den Ziffern: 12.10.2026 ist Montag (0)', A.wochentag('2026-10-12') === 0, A.wochentag('2026-10-12'));
t('und 18.10.2026 ist Sonntag (6)', A.wochentag('2026-10-18') === 6, A.wochentag('2026-10-18'));
var fuer = A.fuerReservierung([PARTY, ONLINE, LADIES, HAPPY], '2026-10-15', '22:00');
t('fuer Do 22:00 gelten: Online + Ladies (Happy Hour ist vorbei, Party ist Sa)',
  fuer.map(function (a) { return a.titel; }).sort().join() === 'Ladies Night,Online reserviert', fuer.map(function (a) { return a.titel; }));
t('Vorteile stehen vorn', fuer.every(function (a) { return !!a.vorteil; }), null);
t('an der Reservierung steht, was das Personal wissen muss',
  /Online reserviert: 10 % auf die Rechnung/.test(A.textFuerReservierung(fuer) || '') && /Ladies Night: Cocktail gratis/.test(A.textFuerReservierung(fuer) || ''),
  A.textFuerReservierung(fuer));
t('ein Event ohne Vorteil landet NICHT an der Reservierung', A.textFuerReservierung([PARTY]) === null, A.textFuerReservierung([PARTY]));
t('Zeitplan: Jeden Donnerstag · 21:00–03:00', A.zeitplanText(LADIES) === 'Jeden Donnerstag · 21:00–03:00', A.zeitplanText(LADIES));
t('Zeitplan: Mo–Fr · 17:00–19:00', A.zeitplanText(HAPPY) === 'Mo–Fr · 17:00–19:00', A.zeitplanText(HAPPY));
t('Zeitplan: Täglich', A.zeitplanText(ONLINE) === 'Täglich', A.zeitplanText(ONLINE));
t('Zeitplan: Sa 17.10. · ab 22:00', A.zeitplanText(PARTY) === 'Sa 17.10. · ab 22:00', A.zeitplanText(PARTY));

console.log('\n-- 2. Dieselbe Regel im Browser, mit denselben Faellen --');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
function schneide(kopf) {
    var a = H.indexOf(kopf); if (a < 0) return '';
    var i = H.indexOf('{', a), tiefe = 0;
    for (var j = i; j < H.length; j++) { if (H[j] === '{') tiefe++; else if (H[j] === '}') { tiefe--; if (!tiefe) return H.slice(a, j + 1); } }
    return '';
}
var B;
try {
    B = new Function("var AKTION_TAGE_KURZ = ['Mo','Di','Mi','Do','Fr','Sa','So']; var AKTION_TAGE_LANG = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];\n"
        + ['function aktionMinuten(', 'function aktionWochentag(', 'function aktionPasst(', 'function aktionenFuerReservierung(', 'function aktionZeitplanText('].map(schneide).join('\n')
        + '\nreturn { passt: aktionPasst, fuer: aktionenFuerReservierung, plan: aktionZeitplanText, tag: aktionWochentag };')();
} catch (e) { B = null; }
t('die Browser-Regel laeuft', !!B, null);
if (B) {
    FAELLE.forEach(function (f) { t('Browser: ' + f[4], B.passt(f[0], f[1], f[2]) === f[3], B.passt(f[0], f[1], f[2])); });
    [LADIES, HAPPY, ONLINE, PARTY, OKT].forEach(function (a) {
        t('Zeitplan gleich wie auf dem Server: ' + a.titel, B.plan(a) === A.zeitplanText(a), { browser: B.plan(a), server: A.zeitplanText(a) });
    });
    t('Reihenfolge gleich wie auf dem Server',
      B.fuer([PARTY, ONLINE, LADIES, HAPPY], '2026-10-15', '22:00').map(function (a) { return a.titel; }).join()
      === fuer.map(function (a) { return a.titel; }).join(), null);
}

(async function () {
console.log('\n-- 3. reservation-guest: der Server entscheidet --');
var echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    if (/[\\/]lib[\\/]alarm$/.test(anfrage) || anfrage === './lib/alarm') return { alarm: async function () {}, senden: async function () {} };
    return echtLaden.apply(this, arguments);
};
process.env.SUPABASE_SERVICE_KEY = 'test';
var RG;
try { RG = require(path.join(FN, 'reservation-guest.js')); } catch (e) { console.log('FAIL | reservation-guest laedt nicht  -> ' + e.message); process.exit(1); }
Module._load = echtLaden;

var RID = '11111111-2222-3333-4444-555555555555';
// welt.aktionen: was die Tabelle liefert (oder 'weg' = 404, 'kaputt' = wirft)
// welt.spalteFehlt: aktion_text gibt es in reservations noch nicht
async function reservieren(welt, extra) {
    var eingefuegt = [];
    global.fetch = async function (url, init) {
        url = String(url);
        if (/\/rest\/v1\/aktionen\?/.test(url)) {
            if (welt.aktionen === 'kaputt') throw new Error('ECONNRESET');
            if (welt.aktionen === 'weg') return { ok: false, status: 404, json: async function () { return null; } };
            return { ok: true, status: 200, json: async function () { return welt.aktionen || []; } };
        }
        if (/select=zahlsperre/.test(url)) return { ok: true, json: async function () { return [{ zahlsperre: 'keine' }]; } };
        if (/\/rest\/v1\/restaurants\?/.test(url)) return { ok: true, json: async function () { return [{ id: RID, is_active: true, features: [] }]; } };
        if (/\/rest\/v1\/reservations\?guest_phone/.test(url)) return { ok: true, json: async function () { return []; } };
        if (/\/rest\/v1\/reservations$/.test(url) && init && init.method === 'POST') {
            var k = JSON.parse(init.body); eingefuegt.push(k);
            if (welt.spalteFehlt && Object.prototype.hasOwnProperty.call(k, 'aktion_text')) {
                return { ok: false, status: 400, text: async function () { return "Could not find the 'aktion_text' column of 'reservations'"; } };
            }
            return { ok: true, status: 201, json: async function () { return [{ id: 'r1', track_token: 'x'.repeat(32), status: 'pending' }]; } };
        }
        return { ok: true, json: async function () { return []; } };
    };
    var koerper = Object.assign({ restaurant_id: RID, guest_name: 'Ayse', guest_phone: '0491123', party_size: 4,
        reservation_date: '2026-10-15', reservation_time: '22:00' }, extra || {});
    var r = await RG.handler({ httpMethod: 'POST', body: JSON.stringify(koerper) });
    return { code: r.statusCode, antwort: JSON.parse(r.body), eingefuegt: eingefuegt };
}

var mit = await reservieren({ aktionen: [ONLINE, LADIES] });
var letzte = mit.eingefuegt[mit.eingefuegt.length - 1] || {};
t('Reservierung geht durch', mit.antwort.ok === true, mit.antwort);
t('der Server schreibt den Vorteil an die Reservierung', /10 % auf die Rechnung/.test(letzte.aktion_text || ''), letzte.aktion_text);
t('und sagt es dem Gast zurueck', !!mit.antwort.aktion && /Cocktail gratis/.test(mit.antwort.aktion.text), mit.antwort.aktion);
t('gespeichert: ja', !!mit.antwort.aktion && mit.antwort.aktion.gespeichert === true, mit.antwort.aktion);

var schummel = await reservieren({ aktionen: [] }, { aktion_text: '100 % gratis', aktion: '100 %' });
var s1 = schummel.eingefuegt[schummel.eingefuegt.length - 1] || {};
t('ein Gast, der sich "100 % gratis" mitschickt, bekommt NICHTS davon',
  !Object.prototype.hasOwnProperty.call(s1, 'aktion_text') && schummel.antwort.aktion === null, s1.aktion_text);

var ohneTabelle = await reservieren({ aktionen: 'weg' });
t('Tabelle fehlt (SQL 38 nicht da): Reservierung geht trotzdem durch', ohneTabelle.antwort.ok === true && ohneTabelle.code === 200, ohneTabelle.antwort);
var netzWeg = await reservieren({ aktionen: 'kaputt' });
t('Datenbank klemmt beim Nachschlagen: Reservierung geht trotzdem durch', netzWeg.antwort.ok === true, netzWeg.antwort);

var spalte = await reservieren({ aktionen: [ONLINE], spalteFehlt: true });
t('Spalte fehlt: Reservierung geht durch (zweiter Versuch ohne die Spalte)', spalte.antwort.ok === true && spalte.eingefuegt.length === 2, { ok: spalte.antwort.ok, versuche: spalte.eingefuegt.length });
t('und das bleibt NICHT still: gespeichert: nein -- der Gast soll es erwaehnen',
  !!spalte.antwort.aktion && spalte.antwort.aktion.gespeichert === false, spalte.antwort.aktion);

var frueh = await reservieren({ aktionen: [LADIES] }, { reservation_time: '19:00' });
t('19:00 am Ladies-Night-Donnerstag: kein Vorteil an der Reservierung', frueh.antwort.aktion === null, frueh.antwort.aktion);

console.log('\n-- 4. Die Datenbank-Datei --');
var SQL = fs.readFileSync(path.join(KMI, 'datenbank', '38-aktionen.sql'), 'utf8');
var sqlCode = SQL.replace(/--[^\n]*/g, '');
t('Tabelle mit Zeilen-Regeln', /create table if not exists public\.aktionen/.test(sqlCode) && /alter table public\.aktionen enable row level security/.test(sqlCode), null);
t('Gaeste lesen nur aktive Aktionen', /for select to anon, authenticated\s+using \(aktiv = true\)/.test(sqlCode), null);
['insert', 'update', 'delete'].forEach(function (was) {
    var re = new RegExp('for ' + was + ' to authenticated[\\s\\S]{0,260}kmi_meine_haeuser\\(\\)[\\s\\S]{0,60}kmi_ist_superadmin\\(\\)');
    t(was + ': nur der Inhaber oder der Superadmin', re.test(sqlCode), null);
});
t('keine Schreibregel fuer anon', !/for (insert|update|delete) to anon/.test(sqlCode), null);
t('ohne Zeitplan keine Aktion', /constraint aktion_hat_zeitplan check/.test(sqlCode), null);
t('aktion_text an der Reservierung ist per Ausloeser geschuetzt (nicht per Spaltenrecht)',
  /create trigger kmi_aktion_schuetzen\s+before insert or update on public\.reservations/.test(sqlCode)
  && /new\.aktion_text := null/.test(sqlCode) && /new\.aktion_text := old\.aktion_text/.test(sqlCode), null);
t('der Dienstschluessel darf schreiben', /'service_role' then return new/.test(sqlCode), null);
t('nichts Zerstoererisches', !/\b(drop table|truncate|delete from|disable row level)\b/i.test(sqlCode), null);
t('Gegenprobe am Ende', /as schutz_aktiv;\s*$/.test(SQL.trim() + '\n') || /schutz_aktiv/.test(SQL), null);

console.log('\n-- 5. Im Browser angeschlossen --');
t('Dashboard-Liste uebernimmt aktion_text -- sonst waere der Vorteil still weg',
  /aktion_text: r\.aktion_text \|\| ''/.test(H), null);
t('Personal sieht den Vorteil in der Detailansicht, escaped', /escapeHtml\(res\.aktion_text\)/.test(H), null);
t('Lokalseite hat den Platz und fuellt ihn',
  /<div id="lpAktionen"><\/div>/.test(H) && /renderRestaurantAktionen\(rest\.id\)/.test(H), null);
t('Karten auf der Lokalseite escapen den Text des Wirts',
  /escapeHtml\(a\.titel \|\| ''\)/.test(schneide('function aktionKarteHtml(')) && /escapeHtml\(a\.vorteil\)/.test(schneide('function aktionKarteHtml(')), null);
t('Reservierungsfenster zeigt den Hinweis VOR dem Absenden',
  /id="resAktionHinweis"/.test(H) && /try \{ aktionHinweisZeigen\(\); \} catch \(e\) \{\}/.test(schneide('function updateResSummary(')), null);
t('der Hinweis setzt Text mit textContent, nicht innerHTML',
  /text\.textContent = /.test(schneide('function aktionHinweisZeigen(')) && !/innerHTML/.test(schneide('function aktionHinweisZeigen(').replace(/box\.textContent = '';/g, '')), null);
t('Bestaetigung zeigt, was der SERVER festgehalten hat',
  /window\._letzteAktion = \(antwort && antwort\.ok && antwort\.aktion\)/.test(H) && /_ak\.textContent = window\._letzteAktion\.text/.test(H), null);
var sp = schneide('async function aktionSpeichern(');
t('Speichern verlangt die Zeile zurueck', /'Prefer': 'return=representation'/.test(sp), null);
t('und meldet "nichts gespeichert", wenn keine kommt', /!Array\.isArray\(zurueck\) \|\| !zurueck\.length/.test(sp), null);
['async function aktionAktivSchalten(', 'async function aktionLoeschen('].forEach(function (k) {
    var f = schneide(k);
    t(k.replace('async function ', '').replace('(', '') + ' prueft die zurueckgegebene Zeile', /!Array\.isArray\(zurueck\) \|\| !zurueck\.length/.test(f), null);
});
t('fehlt die Tabelle, sieht der Wirt einen roten Hinweis statt einer leeren Liste',
  /window\._aktionenTabelleFehlt/.test(schneide('function aktionenVerwaltung(')) && /38-aktionen\.sql/.test(schneide('function aktionenVerwaltung(')), null);
t('die Verwaltung laedt, wenn "Angebote" aufgeht', /case 'offers':\s*\n\s*renderActiveOffers\(\);\s*\n\s*if \(typeof aktionenVerwaltung === 'function'\) aktionenVerwaltung\(\);/.test(H), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
})();
