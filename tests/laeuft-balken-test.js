// ANGEBOTE & AKTIONEN: "LÄUFT GERADE"-BALKEN, KASTEN, TIMER, EVENT-KARTEN (26.10.2026)
//
// Ibo: "Angebote, Aktion oder so -- wie sehen deren Balken aus? Erstelle mal
// mit Claude Design was Gutes." Entwurf abgenommen: "so ist gut der Design".
// Die Funktionen werden aus index.html gezogen und ECHT ausgefuehrt.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = H.indexOf('{', i), tiefe = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') tiefe++;
        else if (H[k] === '}') { tiefe--; if (tiefe === 0) return H.slice(i, k + 1); }
    }
    return '';
}
var esc = function (x) { return String(x).replace(/</g, '&lt;'); };
var quelle = ["var AKTION_TAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];", "var AKTION_TAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];"]
    .concat(['laufEndeMs', '_laufZwei', 'laufRestText', 'laufBisHtml', 'laufendesFinden', 'laufBalkenHtml', 'laufKastenHtml',
        'aktionMinuten', 'aktionWochentag', 'aktionPasst', 'aktionDatumVon', 'aktionLaeuftJetzt', 'aktionenJetztFuerTisch', 'aktionZeitplanText', 'aktionKarteHtml',
        'angebotLaeuftNoch', 'angebotText', 'angebotPreis'].map(fn)).join('\n');
var A = new Function('escapeHtml', quelle + '; return { ende: laufEndeMs, rest: laufRestText, finden: laufendesFinden, balken: laufBalkenHtml, kasten: laufKastenHtml, karte: aktionKarteHtml };')(esc);

console.log('\n-- 1. TIMER --');
var j = new Date(2026, 9, 26, 17, 0, 0);
t('bis 19:00 um 17:00 -> heute 19:00', A.ende('19:00', j) === new Date(2026, 9, 26, 19, 0, 0).getTime());
t('bis 02:00 um 23:00 (Party über Mitternacht) -> morgen', A.ende('02:00', new Date(2026, 9, 26, 23, 0)) === new Date(2026, 9, 27, 2, 0, 0).getTime());
t('ohne Uhrzeit kein Ende', A.ende(null, j) === null && A.ende('abends', j) === null);
t('Rest als hh:mm:ss', A.rest(j.getTime() + 5050000, j.getTime()) === '01:24:10', A.rest(j.getTime() + 5050000, j.getTime()));
t('nie negativ', A.rest(0, 1000) === '00:00:00');

console.log('\n-- 2. WAS LÄUFT GERADE --');
var angebote = [
    { title: 'Happy Hour', description: '[16:00-19:00] Alle Cocktails', price: 6.5, old_price: 9.5, restaurant_id: 'r1' },
    { title: 'Grünkohl', description: 'ganztags', price: 12.9, restaurant_id: 'r1' }
];
var aktionen = [
    { titel: 'Ladies Night', gilt_fuer: 'reservierung', wochentage: [0, 1, 2, 3, 4, 5, 6], von: '16:00', bis: '23:00', aktiv: true, restaurant_id: 'r1' },
    { titel: 'Feierabend-Bier', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4, 5, 6], von: '16:00', bis: '18:30', vorteil: '2 für 1', aktiv: true, restaurant_id: 'r2' }
];
var lauf = A.finden(aktionen, angebote, j);
t('Angebot mit offenem Zeitfenster läuft (mit Ende)', lauf.some(function (x) { return x.titel === 'Happy Hour' && x.ende === new Date(2026, 9, 26, 19, 0).getTime(); }), JSON.stringify(lauf));
t('Angebot ohne Uhrzeit ist kein "läuft gerade"', !lauf.some(function (x) { return x.titel === 'Grünkohl'; }));
t('Aktion nur bei Online-Reservierung zählt nicht (wer jetzt hingeht, bekommt sie nicht)', !lauf.some(function (x) { return x.titel === 'Ladies Night'; }));
t('Aktion für alle läuft, mit Vorteil als Untertitel', lauf.some(function (x) { return x.titel === 'Feierabend-Bier' && x.unter === '2 für 1' && x.rid === 'r2'; }));
t('was zuerst endet, steht vorn', lauf[0].titel === 'Feierabend-Bier', lauf.map(function (x) { return x.titel; }).join(','));
t('außerhalb des Fensters läuft nichts', A.finden(aktionen, angebote, new Date(2026, 9, 26, 12, 0)).length === 0);

console.log('\n-- 3. BALKEN UND KASTEN --');
var b = A.balken({ titel: 'Happy <b>', ende: Date.now() + 3600000 }, 92);
t('Balken: Titel maskiert, "LÄUFT", Timer', /HAPPY &lt;B> LÄUFT/.test(b) && /class="kmi-bis" data-ende="\d+"/.test(b), b.slice(0, 200));
t('Balken unter der Navigation (top übergeben)', /position:absolute;top:92px;/.test(b));
t('Balken verschwindet, wenn es vorbei ist (kmi-lauf-weg)', /kmi-lauf-weg/.test(b));
var k = A.kasten({ titel: 'Happy Hour', unter: 'Alle Cocktails', ende: Date.now() + 3600000 }, { id: 'r1', slug: 'luett-italia', name: 'Lütt Italia' });
t('Kasten: LÄUFT GERADE, Name, ENDET IN, Knopf zum Haus', /LÄUFT GERADE/.test(k) && /Lütt Italia/.test(k) && /ENDET IN/.test(k) && /openRestaurantBySlug\('luett-italia'\)/.test(k));
t('Kasten ohne Ende: kein Timer', !/ENDET IN/.test(A.kasten({ titel: 'X', ende: null }, { id: 'r', name: 'Y' })));

console.log('\n-- 4. EVENT-KARTE MIT DATUMSBLOCK --');
var w = A.karte({ titel: 'Ladies Night', wochentage: [3], von: '20:00', vorteil: 'Prosecco' }, false);
t('wöchentlich: grüner Block "JEDEN DO"', /kmi-akt-block"[\s\S]*>JEDEN<[\s\S]*>DO</.test(w), w.slice(0, 300));
var d = A.karte({ titel: 'Live', datum: '2026-11-08', von: '21:00' }, false);
t('festes Datum: goldener Block "SO 8.11."', /kmi-akt-block-gold"[\s\S]*>SO<[\s\S]*>8\.11\.</.test(d), d.slice(0, 300));
t('Titel maskiert', /&lt;x/.test(A.karte({ titel: '<x>', wochentage: [1] }, false)));

console.log('\n-- 5. EINGEBAUT --');
t('Lokalseite stößt den Balken an', /laufBalkenLokal\(rest\.id\)/.test(H));
t('Balken rutscht unter den Neueröffnungs-Balken, wenn der da ist', /var top = eb \? 92 \+ eb\.offsetHeight \+ 8 : 92;/.test(fn('laufBalkenLokal')));
t('Startseite: "Angebote & Aktionen" mit Kasten', /Angebote &amp; Aktionen/.test(fn('loadDailySpecials')) && /laufKastenHtml\(_lauf, _laufRest\)/.test(fn('loadDailySpecials')));
t('Startseite holt Aktionen aller Häuser (nur "für alle")', /aktionen\?aktiv=eq\.true&gilt_fuer=eq\.alle/.test(fn('aktionenAlleLaden')));
t('Timer tickt jede Sekunde', /setInterval\(function \(\) \{ try \{ laufTicken\(\); \} catch \(e\) \{\} \}, 1000\)/.test(H));
t('Dunkelmodus: Goldblock bleibt dunkel beschriftet', /\.dark-mode \.kmi-akt-block-gold span \{ background: #ffd54f; color: #00251e !important; \}/.test(H));
var sw = fs.readFileSync(KMI + '/sw.js', 'utf8'), wa = fs.readFileSync(KMI + '/netlify/functions/gastweg-wache.js', 'utf8');
var vSw = +(/kmi-shell-v(\d+)/.exec(sw) || [])[1], vW = +(/CACHE_MINDESTENS = (\d+)/.exec(wa) || [])[1];
t('neue Fassung für die Geräte (sw v107+, Wache gleich)', vSw >= 107 && vW === vSw, vSw + ' / ' + vW);

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
