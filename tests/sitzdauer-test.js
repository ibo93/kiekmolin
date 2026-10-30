// SITZDAUER AN DEN TISCHEN (29.10.2026) -- statt einer KI-Kamera.
// Ibo: "ja bauen ... spaeter in Zukunft koennen wir mit Kamera machen".
// Der Test FUEHRT die Rechnung und die Karte aus und prueft das SQL.
'use strict';
process.env.TZ = 'Europe/Berlin';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var SQL = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '48-sitzdauer.sql'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var X = new Function(['escapeHtml', 'sitzdauerAuswerten', 'sitzText', 'sitzKarte', 'dashKarte', 'dashTabelle', 'dashWenig'].map(fn).join('\n')
    + '; return { rechne: sitzdauerAuswerten, text: sitzText, karte: sitzKarte };')();

function besuch(tag, von, bis, p) { return { seated_at: new Date(tag + 'T' + von + ':00').toISOString(), finished_at: new Date(tag + 'T' + bis + ':00').toISOString(), party_size: p }; }
var S = X.rechne([
    besuch('2026-10-23', '12:00', '12:45', 2),
    besuch('2026-10-23', '12:30', '13:25', 4),
    besuch('2026-10-24', '19:00', '21:00', 2),
    besuch('2026-10-24', '18:30', '20:10', 6),
    besuch('2026-10-24', '20:00', '20:03', 2),   // vergessener Tipp: 3 Min
    besuch('2026-10-24', '19:00', '18:00', 2),   // Ende vor Anfang
    besuch('2026-10-20', '11:00', '23:30', 2)    // ueber 6 Std: "Fertig" vergessen
]);
t('nur echte Besuche zaehlen (3 Min, Ende vor Anfang, >6 Std raus)', S.n === 4, S.n);
t('mittags: Schnitt aus 45 und 55 Min = 50 Min', S.mittag && S.mittag.min === 50 && S.mittag.n === 2, JSON.stringify(S.mittag));
t('abends: Schnitt aus 120 und 100 Min = 1 Std 50 Min', S.abend && S.abend.min === 110 && X.text(S.abend) === '1 Std 50 Min', JSON.stringify(S.abend));
t('nach Gruppengroesse: 1-2 / 3-4 / ab 5', S.klein.n === 2 && S.mittel.n === 1 && S.gross.n === 1 && S.gross.min === 100, JSON.stringify([S.klein, S.mittel, S.gross]));
var nachmittag = X.rechne([besuch('2026-10-22', '15:30', '16:20', 2)]);
t('15:30 Uhr ist weder mittags (bis 15) noch abends (ab 17)', nachmittag.n === 1 && nachmittag.mittag === null && nachmittag.abend === null, JSON.stringify(nachmittag));
t('Text: volle Stunde ohne "0 Min", unter einer Stunde nur Minuten', X.text({ min: 120 }) === '2 Std' && X.text({ min: 45 }) === '45 Min' && X.text(null) === '–', '');

var k = X.karte(S);
t('Karte zeigt Mittags/Abends/Schnitt mit Anzahl', /MITTAGS<\/span><b>50 Min<\/b><small>bis 15 Uhr · 2×/.test(k) && /ABENDS<\/span><b>1 Std 50 Min/.test(k), k.slice(0, 400));
t('… mit Tabelle (fuer "Als Tabelle")', /<th>Ø Sitzdauer<\/th>/.test(k), '');
t('SQL fehlt -> sagt es (nicht still leer)', /SQL 48 \(Sitzdauer\)/.test(X.karte({ fehlt: true })), '');
t('Fehler -> sagt es mit Grund', /Sitzdauer nicht geladen \(HTTP 500\)/.test(X.karte({ fehler: 'HTTP 500' })), '');
t('zu wenig gemessen -> sagt wie viele und wie es sich fuellt', /Noch zu wenig gemessen \(1 Besuch\)/.test(X.karte(X.rechne([besuch('2026-10-23', '12:00', '12:45', 2)]))), '');

// Laden: eigene Abfrage, fehlende Spalte wird erkannt, reisst die Reservierungen nicht mit
var dl = fn('dashLaden');
t('eigene Abfrage nur mit seated_at+finished_at, letzte 8 Wochen', /seated_at=not\.is\.null&finished_at=not\.is\.null&reservation_date=gte\.' \+ dashPlusTage\(heute, -56\)/.test(dl), '');
t('fehlende Spalte (42703) -> { fehlt: true }, sonst Fehler mit Status', /\/seated_at\|finished_at\|42703\/\.test\(t\) \? \{ fehlt: true \} : \{ fehler: 'HTTP ' \+ antw\.status \}/.test(dl), '');
t('die normale Reservierungs-Abfrage fragt die neuen Spalten NICHT ab', !/select=id,reservation_date,reservation_time,party_size,status,guest_name,guest_phone,created_at[^&']*seated_at/.test(dl), '');
t('Karte steht im Dashboard', /sitzKarte\(extra && extra\.sitz\)/.test(fn('dashZeichnen')) && /\+ reihe4 \+ reihe5;/.test(fn('dashZeichnen')) && /sitz: e\[6\]/.test(dl), '');

// SQL: die Datenbank setzt die Zeit selbst, mehrfach ausfuehrbar
t('SQL: Spalten mit "if not exists"', /add column if not exists seated_at timestamptz/.test(SQL) && /add column if not exists finished_at timestamptz/.test(SQL), '');
t('SQL: Trigger setzt seated_at nur einmal (zweites "Ist da" verschiebt nichts)', /if new\.status = 'seated' then\s+if new\.seated_at is null then new\.seated_at := now\(\); end if;/.test(SQL), '');
t('SQL: zurueck von Fertig auf "Ist da" macht das Ende wieder offen', /old\.status in \('finished', 'completed'\) then new\.finished_at := null/.test(SQL), '');
t('SQL: Fertig setzt finished_at', /new\.status in \('finished', 'completed'\) and new\.finished_at is null then\s+new\.finished_at := now\(\)/.test(SQL), '');
t('SQL: Trigger bei jedem Statuswechsel und beim Anlegen, neu anlegbar', /drop trigger if exists kmi_res_zeiten on public\.reservations;/.test(SQL) && /before insert or update of status on public\.reservations/.test(SQL), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
