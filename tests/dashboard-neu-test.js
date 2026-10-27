// Dashboard (Entwurf "Dashboard – Version 3", Ibo 27.10.2026: "ja einbauen").
// Die Auswertung dashAuswerten() wird AUSGEFUEHRT, mit festen Daten und
// fester Uhrzeit -- jede Zahl auf dem Dashboard ist hier nachgerechnet.
// Und: nichts Erfundenes. Fehlen Daten, steht "–" bzw. "noch zu wenig Daten".
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var namen = ['dashTag', 'dashPlusTage', 'dashMin', 'dashSchnitt', 'dashProzent', 'dashFertigMin', 'dashAuswerten'];
var A = new Function('umsatzTag', 'localDayStr',
    'var DASH_ART = { pickup: {}, delivery: {}, dine_in: {} }; var DASH_STD = [11,12,13,14,15,16,17,18,19,20,21,22];\n'
    + namen.map(fn).join('\n') + '; return dashAuswerten;')(
    function (ts) { return new Date(ts).toLocaleDateString('sv-SE'); },
    function (d) { return d.toLocaleDateString('sv-SE'); });

// Dienstag, 27.10.2026, 18:20 Uhr (lokal)
var jetzt = new Date(2026, 9, 27, 18, 20);
function zeit(tagOffset, h, m) { var d = new Date(2026, 9, 27 + tagOffset, h, m || 0); return d.toISOString(); }
function tag(off) { return new Date(2026, 9, 27 + off, 12).toLocaleDateString('sv-SE'); }
var orders = [
    // heute: 3 Bestellungen, 1 storniert, 1 neu
    { created_at: zeit(0, 12, 10), total: '20.00', status: 'picked_up', order_type: 'pickup', ready_at: zeit(0, 12, 30), order_items: [{ item_name: 'Pizza', quantity: 2 }] },
    { created_at: zeit(0, 18, 0), total: '30.00', status: 'received', order_type: 'delivery', order_items: [{ item_name: 'Döner', quantity: 1 }] },
    { created_at: zeit(0, 17, 0), total: '99.00', status: 'cancelled', order_type: 'pickup' },
    // letzter Dienstag: eine vor 18:20 (zaehlt), eine danach (zaehlt NICHT fuer "bis jetzt")
    { created_at: zeit(-7, 12, 0), total: '40.00', status: 'picked_up', order_type: 'pickup', ready_at: zeit(-7, 12, 40), order_items: [{ item_name: 'Pizza', quantity: 1 }] },
    { created_at: zeit(-7, 20, 0), total: '100.00', status: 'picked_up', order_type: 'dine_in', order_items: [{ item_name: 'Salat', quantity: 5 }] },
    // vor 40 Tagen (nur Vormonat)
    { created_at: zeit(-40, 19, 0), total: '10.00', status: 'picked_up', order_type: 'pickup' }
];
var res = [
    { reservation_date: tag(0), reservation_time: '18:00:00', party_size: 4, status: 'confirmed', guest_name: 'Meyer', guest_phone: '0151 1' },
    { reservation_date: tag(0), reservation_time: '19:30:00', party_size: 2, status: 'pending', guest_name: 'Kaya' },
    { reservation_date: tag(0), reservation_time: '12:00:00', party_size: 6, status: 'cancelled', guest_name: 'Weg' },
    { reservation_date: tag(-7), reservation_time: '19:00:00', party_size: 3, status: 'finished', guest_name: 'Alt' },
    { reservation_date: tag(-3), reservation_time: '19:00:00', party_size: 2, status: 'no_show', guest_name: 'Nie' },
    { reservation_date: tag(4), reservation_time: '20:00:00', party_size: 8, status: 'confirmed', guest_name: 'Fr' }
];
var M = A({ orders: orders, res: res, kasse: {}, reviews: [] }, jetzt);

console.log('\n-- Heute --');
t('Umsatz heute (App): 20 + 30 = 50 €, Storno zaehlt nicht', M.umsatzApp === 50, M.umsatzApp);
t('Kasse heute nicht eingetragen -> null (nicht 0)', M.kasseHeute === null, M.kasseHeute);
t('Trend zum letzten Dienstag BIS JETZT: 50 zu 40 = +25 %', M.umsatzTrend === 25, M.umsatzTrend);
t('Bestellungen heute 3 (auch Storno zaehlt als Eingang)', M.bestellHeute === 3, M.bestellHeute);
t('neue Bestellungen (received) = 1', M.neueBestellungen === 1, M.neueBestellungen);
t('Gaeste heute: 4 (pending zaehlt mit 2 -> 6; storniert nicht)', M.gaesteHeute === 6, M.gaesteHeute);
t('wartende Reservierungen ab heute = 1', M.offeneRes === 1, M.offeneRes);
t('Ø bis fertig heute: 20 Min', Math.round(M.fertigHeute) === 20, M.fertigHeute);
t('Ø sonst (28 Tage): 40 Min', Math.round(M.fertigSonst) === 40, M.fertigSonst);
t('Als Naechstes: Meyer 18:00 (vor 20 Min, noch im Fenster) und Kaya', M.naechste.map(function (r) { return r.guest_name; }).join() === 'Meyer,Kaya', M.naechste.map(function (r) { return r.guest_name; }).join());

console.log('\n-- Zeitraeume --');
t('Umsatz 30 Tage: 50 + 40 + 100 = 190', M.umsatz30Summe === 190, M.umsatz30Summe);
t('30 Tage davor: 10', M.umsatzVor30.reduce(function (a, b) { return a + b; }, 0) === 10, '');
t('Top-Gericht: Salat 5×, dann Pizza 3×', M.top[0][0] === 'Salat' && M.top[0][1] === 5 && M.top[1][0] === 'Pizza' && M.top[1][1] === 3, JSON.stringify(M.top));
t('Bestellart 14 Tage: Abholung 2 (ohne Storno), Lieferung 1, Tisch 1', M.art.pickup.anzahl === 2 && M.art.delivery.anzahl === 1 && M.art.dine_in.anzahl === 1, JSON.stringify([M.art.pickup.anzahl, M.art.delivery.anzahl, M.art.dine_in.anzahl]));
t('Reservierte Gaeste in 4 Tagen: 8', M.res14[4].gaeste === 8, M.res14[4].gaeste);
t('Nicht gekommen (30 Tage): 1 von 2 = 50 %', M.noShow === 50, M.noShow);
t('Beliebte Zeiten: Dienstag 12 Uhr hat einen Wert (letzte Woche)', M.zeiten[2][1] > 0, JSON.stringify(M.zeiten[2]));

console.log('\n-- Nichts erfinden --');
var L = A({ orders: [], res: [], kasse: {}, reviews: [] }, jetzt);
t('ohne Daten: Ø bis fertig = null (Anzeige "–")', L.fertigHeute === null && L.fertigSonst === null, '');
t('ohne Daten: kein Trend (nicht "+0 %" und nicht "▲ 100 %")', L.umsatzTrend === null, L.umsatzTrend);
t('ohne Daten: keine Bewertung', L.bewSchnitt === null, L.bewSchnitt);
t('ohne Daten: Quoten "–"', L.noShow === null && L.abgesagt === null && L.wiederkehrend === null, '');
t('ohne Daten: Beliebte Zeiten melden "zu wenig"', L.zeitenGenug === false, '');
var B = A({ orders: [], res: [], kasse: {}, reviews: [{ rating: 5, created_at: zeit(-60, 12) }, { rating: 5, created_at: zeit(-50, 12) }, { rating: 4, created_at: zeit(-45, 12) }, { rating: 5, created_at: zeit(-1, 12) }] }, jetzt);
t('Bewertung: Ø 4,75 aus 4', Math.abs(B.bewSchnitt - 4.75) < 0.001 && B.bewAnzahl === 4, B.bewSchnitt);
t('ohne Antwort: 4', B.bewOhneAntwort === 4, B.bewOhneAntwort);

console.log('\n-- Seite --');
t('die alte Ansicht ist ausgeblendet, nicht geloescht (Kennungen bleiben)', /#sectionDashboard \[data-kin-alt="1"\] \{ display: none !important; \}/.test(H) && /id="tableGrid"/.test(H) && /id="dashRevenue"/.test(H), '');
t('der Schalter "Restaurant offen" (speicherte nur im Browser) ist nicht mehr zu sehen', /#kinDashSteuerSlot #dashSteuerung \.availability-control \{ display: none !important; \}/.test(H), '');
t('"Heute geschlossen" fragt nach und nutzt die echten Betriebsferien', /kinConfirm\('Heute geschlossen\?/.test(fn('dashHeuteZu')) && /_patchVacation\('vacation:' \+ heute \+ ':' \+ heute\)/.test(fn('dashHeuteZu')), '');
t('"Ausverkauft" prueft, ob die Datenbank wirklich gespeichert hat', /return=representation/.test(fn('dashGerichtUmschalten')) && /keine Berechtigung/.test(fn('dashGerichtUmschalten')), '');
t('Ladefehler -> Meldung mit "Nochmal versuchen", nicht leer', /Dashboard nicht geladen/.test(fn('dashLaden')) && /Nochmal versuchen/.test(fn('dashLaden')), '');
t('updateDashboard zeichnet das neue Dashboard', /try \{ dashLaden\(\); \} catch \(e\)/.test(fn('updateDashboard')), '');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exitCode = 1;
