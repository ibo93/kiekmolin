// WhatsApp-Gutschein einlösbar + Umsatz nach deutschem Tag.
//
// Ibo, 09.10.2026: "wenn der Gastronom WhatsApp schickt mit Angebot-Code"
// und "ich will Umsatz sehen jeden Tag". Gefunden bei der Prüfung:
//   - generateMarketingCoupon speicherte den Code NUR im Browser des Wirts;
//     der Gast bekam "Ungültiger Gutschein-Code" (still, Regel 6).
//   - Tagesbalken ordnete nach UTC-Datum: Bestellung um 23:30 am falschen Tag.
//   - Startkarte "Umsatz heute" zeigte den Monat.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }

// ---- Umsatz pro Tag (deutsche Zeit)
var U = new Function(['umsatzTag', 'umsatzProTag'].map(fn).join('\n') + '; return { tag: umsatzTag, proTag: umsatzProTag };')();
t('23:30 Uhr deutscher Zeit (21:30 UTC) zählt zum selben Tag', U.tag('2026-10-08T21:30:00Z') === '2026-10-08', U.tag('2026-10-08T21:30:00Z'));
t('00:30 Uhr deutscher Zeit (22:30 UTC am Vortag) zählt zum neuen Tag', U.tag('2026-10-08T22:30:00Z') === '2026-10-09', U.tag('2026-10-08T22:30:00Z'));
t('Winterzeit: 00:15 Uhr am 15.01. (23:15 UTC am 14.) -> 15.01.', U.tag('2026-01-14T23:15:00Z') === '2026-01-15', U.tag('2026-01-14T23:15:00Z'));
var tage = U.proTag([{ created_at: '2026-10-08T10:00:00Z', total: '20.50', status: 'completed' }, { created_at: '2026-10-08T22:30:00Z', total: 10, status: 'delivered' },
    { created_at: '2026-10-08T12:00:00Z', total: 99, status: 'cancelled' }]);
t('Tagessumme ohne Stornos, späte Bestellung am nächsten Tag', tage['2026-10-08'].summe === 20.5 && tage['2026-10-08'].anzahl === 1 && tage['2026-10-09'].summe === 10, JSON.stringify(tage));
t('Tagesbalken nutzt umsatzProTag und das eigene Lokal zuerst', /var rid = umsatzRid\(\);/.test(H) && /dailyTotals\.push\(proTag\[dayStr\] \? proTag\[dayStr\]\.summe : 0\);/.test(H) && !/o\.created_at\.startsWith\(dayStr\)/.test(H), '');
t('Tagesbalken: Fehler wird gesagt, nicht "Keine Daten"', /Umsätze konnten nicht geladen werden/.test(H), '');
// Seit R-3 (Kassen-Umsatz): heute = App + Kasse, Monat ebenso.
t('Startkarte: heute groß, Monat darunter, Fehler sichtbar', /var tage = umsatzProTag\(orders\), heute = tage\[_heuteTag\]/.test(H) && /' · Monat ' \+ \(monat \+ kasseMonat\)\.toFixed\(0\) \+ ' €'/.test(H) && /'Umsatz nicht geladen'/.test(H), '');
t('Monatsbeginn als echter Zeitpunkt, nicht "…-01T00:00:00"', !/'-01T00:00:00';\n\s*supabaseGet\('orders', 'select=total,status&restaurant_id/.test(H) && /var monthStart = tagesBeginnIso\(new Date\(now\.getFullYear\(\), now\.getMonth\(\), 1\)\);/.test(H), '');

// ---- Gutschein in die Datenbank
(async function () {
    var aufrufe = [], antworten = [];
    var welt = { fetch: async function (u, o) { aufrufe.push({ u: u, o: o }); var a = antworten.shift(); return a; } };
    var code = ['gutscheinCode', 'gutscheinAnlegen'].map(fn).join('\n');
    var G = new Function('w', 'var fetch = w.fetch, SUPABASE_URL = "https://x.supabase.co", SUPABASE_KEY = "k", window = {}, crypto = undefined;'
        + 'function kmiToken() { return "tok"; } function todayStrLocal() { return "2026-10-09"; } function localDayStr(ms) { return "2026-11-08"; }\n'
        + code + '; return gutscheinAnlegen;')(welt);
    function res(status, body) { return { ok: status < 300, status: status, json: async function () { return body; }, text: async function () { return JSON.stringify(body); } }; }

    antworten = [res(201, [{ code: 'KIEK-ABC234' }])];
    var c1 = await G('r1', 10, 30);
    var body = JSON.parse(aufrufe[0].o.body);
    t('Gutschein geht in die Tabelle coupons, einmal einlösbar, 30 Tage, eigenes Lokal', /\/rest\/v1\/coupons$/.test(aufrufe[0].u) && body.max_uses === 1 && body.value === 10 && body.type === 'percent' && body.restaurant_id === 'r1' && body.valid_until === '2026-11-08' && c1 === 'KIEK-ABC234', JSON.stringify(body));
    t('Code ohne verwechselbare Zeichen (0/O, 1/I)', /^KIEK-[A-HJ-NP-Z2-9]{6}$/.test(body.code), body.code);

    aufrufe = []; antworten = [res(409, { code: '23505' }), res(201, [{ code: 'KIEK-ZZZ999' }])];
    var c2 = await G('r1', 10, 30);
    t('Code schon vergeben (409): neuer Code, kein Fehler', aufrufe.length === 2 && c2 === 'KIEK-ZZZ999', aufrufe.length);

    antworten = [res(201, [])]; var f1 = null;
    try { await G('r1', 10, 30); } catch (e) { f1 = e.message; }
    t('leere Antwort (RLS) ist ein Fehler, kein stiller Erfolg', /keine Berechtigung/.test(f1 || ''), f1);

    antworten = [res(401, { message: 'JWT expired' })]; var f2 = null;
    try { await G('r1', 10, 30); } catch (e) { f2 = e.message; }
    t('abgelehnt (401): Fehler mit Grund', /HTTP 401/.test(f2 || ''), f2);

    var gen = fn('generateMarketingCoupon');
    t('WhatsApp öffnet sich erst, wenn der Gutschein angelegt ist; sonst Fenster zu + Meldung', /try \{ code = await gutscheinAnlegen\(/.test(gen) && /if \(fenster\) fenster\.close\(\);/.test(gen) && /Gutschein NICHT angelegt/.test(gen) && !/localStorage/.test(gen), '');
    t('Name und Link aus dem Lokal des Marketing-Bereichs, nicht dem ersten der Liste', /var restaurant = mktRestaurant\(\);/.test(gen) && /var restaurant = mktRestaurant\(\);/.test(fn('sendMarketingWhatsApp')), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
