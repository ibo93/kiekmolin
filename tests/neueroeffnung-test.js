// NEUERÖFFNUNG, AUSGEBUCHT = ANRUFEN, MITTAG/ABEND-SCHALTER (26.10.2026)
//
// Ibo:
//   - "Neueröffnung-Balken, dass man sieht, dass es eine Neueröffnung gibt,
//     wie am 30.10." (Entwurf in Claude Design abgenommen)
//   - "immer wenn's ausgebucht ist, immer telefonisch"
//   - "beim Sperren/ausgebucht: wenn ich auf Mittag und Abends klicke, geht
//     die Sperrung raus"
//
// Die Funktionen werden aus index.html gezogen und ECHT ausgefuehrt.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Funktion samt Rumpf aus dem Quelltext holen (Klammern zaehlen).
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
function tag(plus) { var d = new Date(); d.setDate(d.getDate() + plus); return d.toLocaleDateString('sv-SE'); }

var quelle = ['ausgebuchtZeitraeume', 'ausgebuchtAm', 'ausgebuchtTelefon', 'ausgebuchtAusweg', 'ausgebuchtAngebotSetzen',
    'eroeffnungInfo', 'eroeffnungZaehler', 'eroeffnungAbzeichen', 'eroeffnungBalkenHtml', 'eroeffnungBannerHtml', 'eroeffnungKastenHtml', 'eroeffnungZiel', 'eroeffnungRest', '_eroeffnungZwei', 'eroeffnungTimerHtml']
    .map(fn).join('\n');
var A = new Function('window', 'escapeHtml', 'zahlsperreReservierenAus',
    'var EROEFFNUNG_NEU_TAGE = 30;\n' + quelle +
    '\nreturn { ausgebuchtAm: ausgebuchtAm, ausgebuchtAngebotSetzen: ausgebuchtAngebotSetzen, ausgebuchtAusweg: ausgebuchtAusweg,' +
    ' eroeffnungInfo: eroeffnungInfo, eroeffnungAbzeichen: eroeffnungAbzeichen, eroeffnungBalkenHtml: eroeffnungBalkenHtml, eroeffnungBannerHtml: eroeffnungBannerHtml, eroeffnungKastenHtml: eroeffnungKastenHtml, eroeffnungZiel: eroeffnungZiel, eroeffnungRest: eroeffnungRest, eroeffnungTimerHtml: eroeffnungTimerHtml };'
)({}, function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }, function () { return false; });

console.log('\n-- 1. WANN IST WAS --');
var E = A.eroeffnungInfo;
var bald = E({ features: ['eroeffnung:2026-10-30'] }, '2026-10-26');
t('4 Tage vorher: bald, noch 4', bald && bald.phase === 'bald' && bald.tage === 4, JSON.stringify(bald));
t('Datum lang "30. Oktober", kurz "30.10."', bald && bald.lang === '30. Oktober' && bald.kurz === '30.10.', bald && bald.lang + ' ' + bald.kurz);
t('am Tag selbst: heute', (E({ features: ['eroeffnung:2026-10-30'] }, '2026-10-30') || {}).phase === 'heute');
t('10 Tage danach: neu', (E({ features: ['eroeffnung:2026-10-30'] }, '2026-11-09') || {}).phase === 'neu');
t('31 Tage danach: nichts mehr', E({ features: ['eroeffnung:2026-10-30'] }, '2026-11-30') === null);
t('ohne Eintrag: nichts', E({ features: ['ausgebucht:2026-10-01:2026-10-31'] }, '2026-10-26') === null && E({}, '2026-10-26') === null);
t('kaputter Eintrag: nichts', E({ features: ['eroeffnung:30.10.2026'] }, '2026-10-26') === null);

console.log('\n-- 2. LISTE UND LOKALSEITE --');
var r4 = { id: 'a1', slug: 'neu-haus', name: 'Neu <Haus>', city: 'Norden', phone: '04931 12345', features: ['eroeffnung:' + tag(4)] };
var rNeu = { id: 'a2', slug: 'alt', name: 'Alt', features: ['eroeffnung:' + tag(-5)] };
t('Abzeichen vorher: ERÖFFNUNG TT.MM.', /ERÖFFNUNG \d\d\.\d\d\./.test(A.eroeffnungAbzeichen(r4)));
t('Abzeichen danach: NEU ERÖFFNET', /NEU ERÖFFNET/.test(A.eroeffnungAbzeichen(rNeu)));
t('Abzeichen ohne Eintrag: leer', A.eroeffnungAbzeichen({ features: [] }) === '');
t('Balken vorher: NEUERÖFFNUNG AM … und noch 4 Tage', /NEUERÖFFNUNG AM /.test(A.eroeffnungBalkenHtml(r4)) && /noch 4 Tage/.test(A.eroeffnungBalkenHtml(r4)));
t('Balken nach der Eröffnung: weg', A.eroeffnungBalkenHtml(rNeu) === '');

console.log('\n-- 3. DER GROSSE KASTEN AUF DER STARTSEITE --');
var r9 = { id: 'b1', slug: 'spaeter', name: 'Später', features: ['eroeffnung:' + tag(9)] };
var aus = { id: 'c1', slug: 'aus', name: 'Inaktiv', is_active: false, features: ['eroeffnung:' + tag(1)] };
var k = A.eroeffnungBannerHtml([r9, aus, r4, rNeu]);
t('zeigt die NÄCHSTE Eröffnung', k.indexOf('Neu &lt;Haus&gt;') >= 0 && k.indexOf('Später') < 0, k.slice(0, 120));
t('inaktives Haus nie', k.indexOf('Inaktiv') < 0);
t('Name wird escaped (kein HTML aus der Datenbank)', k.indexOf('<Haus>') < 0);
var _erw = A.eroeffnungRest(A.eroeffnungZiel(r4, A.eroeffnungInfo(r4)).ms, Date.now()).t;
t('Timer zeigt die Tage bis zur Öffnung und Reservieren-Knopf', new RegExp('data-teil="t"[^>]*>' + _erw + '<').test(k) && _erw >= 3 && /Tisch zur Eröffnung reservieren/.test(k), k.slice(0, 300));
t('nur eröffnete (neu) -> kein Kasten', A.eroeffnungBannerHtml([rNeu]) === '');
var r4voll = JSON.parse(JSON.stringify(r4)); r4voll.features.push('ausgebucht:' + tag(4) + ':' + tag(4));
var kv = A.eroeffnungBannerHtml([r4voll]);
t('Eröffnungstag ausgebucht -> Anrufen statt Reservieren', /href="tel:0493112345"/.test(kv) && kv.indexOf('Tisch zur Eröffnung reservieren') < 0, kv.slice(0, 200));
var r4ohneRes = JSON.parse(JSON.stringify(r4)); r4ohneRes.features.push('no_reservations');
t('Haus ohne Reservierung -> kein Reservieren-Knopf', A.eroeffnungBannerHtml([r4ohneRes]).indexOf('Tisch zur Eröffnung reservieren') < 0);

console.log('\n-- 4. AUSGEBUCHT = ANRUFEN --');
var box = { innerHTML: '', style: {} };
A.ausgebuchtAngebotSetzen(box, { phone: '04931 / 12 34 5' });
t('mit Nummer: Anruf-Knopf mit tel:', /href="tel:0493112345"/.test(box.innerHTML) && /nur noch telefonisch/.test(box.innerHTML) && box.style.display === 'block');
t('mit Nummer: KEINE Warteliste', box.innerHTML.indexOf('showWaitlistForm') < 0);
A.ausgebuchtAngebotSetzen(box, { phone: '' });
t('ohne Nummer: Warteliste als Ausweg (nie ein leerer Kasten)', /showWaitlistForm\(\)/.test(box.innerHTML) && box.style.display === 'block');
t('Satz darüber passt dazu', /ruf direkt an/.test(A.ausgebuchtAusweg({ phone: '0491 1234' })) && /Warteliste/.test(A.ausgebuchtAusweg({})));
var las = fn('loadAvailableSlots'), rsw = fn('renderSlotsWithSuggestions');
t('alle drei Ausgebucht-Stellen nutzen den Anruf-Knopf',
  /ausgebuchtAngebotSetzen\(document\.getElementById\('waitlistOption'\), _abRest\)/.test(las)
  && /ausgebuchtAngebotSetzen\(_spWl, _spRest\)/.test(las)
  && /ausgebuchtAngebotSetzen\(document\.getElementById\('waitlistOption'\), window\._resCurrentRestaurantData/.test(rsw), '');

console.log('\n-- 5. MITTAG/ABEND DARF KEINE SPERRE AUFHEBEN --');
var beginn = las.indexOf('window._resSlots = null;'), ferien = las.indexOf('Betriebsferien: F');
t('neuer Tag: alte Uhrzeiten und Schalter weg, BEVOR Ferien/ausgebucht/Sperre aussteigen',
  beginn > 0 && beginn < ferien && las.indexOf('resTeilSchalterZeigen(false, false);') > 0 && las.indexOf('resTeilSchalterZeigen(false, false);') < ferien, beginn + ' / ' + ferien);
t('späte Antwort eines anderen Tages wird verworfen',
  /await belegungHolen\(restaurantId, date\);\s*\/\/[^\n]*\n[\s\S]{0,300}if \(\(\(document\.getElementById\('reservationDate'\) \|\| \{\}\)\.value \|\| ''\) !== date\) return;/.test(las), '');
// resTeilWaehlen echt ausfuehren
var gezeichnet = 0;
var W = { _resSlots: [{ time: '12:00' }], _resSlotsDatum: '2026-10-27' };
var datumsFeld = { value: '2026-10-28' };
var resTeilWaehlen = new Function('window', 'document', 'renderSlotsWithSuggestions', fn('resTeilWaehlen') + '; return resTeilWaehlen;')(
    W, { getElementById: function () { return datumsFeld; } }, function () { gezeichnet++; });
resTeilWaehlen('mittag');
t('Uhrzeiten eines ANDEREN Tages werden nicht gezeichnet', gezeichnet === 0, gezeichnet);
datumsFeld.value = '2026-10-27';
resTeilWaehlen('abend');
t('Uhrzeiten desselben Tages schon', gezeichnet === 1, gezeichnet);

console.log('\n-- 6. EINGEBAUT UND AUSGELIEFERT --');
// Ibo, 26.10.2026: "mach lieber wo anders die neueröffnung damit ich als admin
// es bearbeiten kann" -- das Feld sitzt im Admin-Fenster "Restaurant bearbeiten",
// NICHT mehr in der Restaurant-Steuerung des Wirts.
var modal = H.slice(H.indexOf('<form id="addRestaurantForm"'), H.indexOf('</form>', H.indexOf('<form id="addRestaurantForm"')));
var steuerung = H.slice(H.indexOf('<div id="sectionDashboard"'), H.indexOf('<div id="sectionReservations"'));
t('Admin-Fenster: Datum, Speichern, Löschen, Stand', /id="eroeffnungDatum"/.test(modal) && /data-eroeffnung="speichern"/.test(modal) && /data-eroeffnung="loeschen"/.test(modal) && /id="eroeffnungStand"/.test(modal));
t('Wirt-Dashboard hat kein Neueröffnungs-Feld mehr', steuerung.length > 1000 && !/eroeffnung/i.test(steuerung));
t('genau ein Feld (keine doppelten IDs)', (H.match(/id="eroeffnungDatum"/g) || []).length === 1);
var spe = fn('eroeffnungSpeichern');
t('Speichern nimmt das Restaurant aus dem Bearbeiten-Fenster, nicht das des Wirts', /form\.dataset\.editId/.test(spe) && !/getControlRestaurantId/.test(spe));
t('neues Restaurant ohne ID: Hinweis statt stillem Nichts', /Erst das Restaurant anlegen/.test(spe));
t('Bearbeiten lädt das Datum des gewählten Restaurants', /eroeffnungUI\(restaurant\.features \|\| \[\]\)/.test(fn('editRestaurant')));
t('Neu anlegen leert das Feld', /eroeffnungUI\(\[\]\)/.test(fn('openNewRestaurantModal')));
// Verhalten: Formular wird wiederverwendet -- Datum des vorigen Restaurants darf nicht stehen bleiben
var feldE = { value: '2026-10-30' }, standE = { textContent: '' };
var uiE = new Function('document', 'eroeffnungInfo', 'EROEFFNUNG_NEU_TAGE', 'eroeffnungZaehler', fn('eroeffnungUI') + '; return eroeffnungUI;')(
    { getElementById: function (id) { return id === 'eroeffnungDatum' ? feldE : standE; } }, function () { return null; }, 30, function () { return ''; });
uiE([]);
t('Wechsel auf Restaurant ohne Eröffnung leert das Datum', feldE.value === '' && /Keine Neueröffnung/.test(standE.textContent), feldE.value);
t('Speichern prüft die zurückgegebene Zeile (sonst "nicht gespeichert")', /Prefer': 'return=representation'/.test(spe) && /if \(!Array\.isArray\(zeilen\) \|\| !zeilen\.length\) throw/.test(spe));
t('Speichern ersetzt den alten Eintrag statt zu stapeln', /filter\(function \(f\) \{ return !\/\^eroeffnung:\/\.test\(String\(f\)\); \}\)/.test(spe));
t('Startseite: Kasten über der Liste', /id="eroeffnungBanner"/.test(H) && /eroeffnungBannerZeichnen\(\);/.test(fn('renderRestaurants')));
t('Liste: Abzeichen auf der Karte', /eroeffnungAbzeichen\(r\)/.test(fn('renderRestaurants')));
// 26.10.2026, Ibo mit Bildschirmfoto: "man sieht den Balken nicht". Er stand
// VOR dem Kopf -- genau hinter der schwebenden Navigation (position:fixed,
// 0..80px). Im Browser gemessen: Balken top 0, Navigation 0..56 sichtbar davor.
var lp = fn('showRestaurantLanding');
t('Lokalseite: Balken IM Kopf (nicht davor, hinter der Navigation)', lp.indexOf('eroeffnungBalkenHtml(rest)') > lp.indexOf('id="lpHero"') && lp.indexOf('id="lpHero"') > 0, lp.indexOf('eroeffnungBalkenHtml(rest)') + ' / ' + lp.indexOf('id="lpHero"'));
t('Balken liegt unter der Navigation (top 92px, über dem Foto)', /class="kmi-eroeffnung-balken[^"]*" role="note" style="position:absolute;top:92px;[^"]*z-index:5/.test(fn('eroeffnungBalkenHtml')));
t('Handy: kurzes Datum, damit der Balken nicht umbricht', /kmi-bk-kurz">NEUERÖFFNUNG ' \+ e\.kurz/.test(fn('eroeffnungBalkenHtml')) && /@media \(max-width: 520px\) \{ \.kmi-bk-lang \{ display: none; \}/.test(H));
// "es muss was richtig Grosses sein, wie du es mir gezeigt hast"
t('Lokalseite: der grosse grüne Kasten aus dem Entwurf', /eroeffnungKastenHtml\(rest, false\)/.test(lp));
var kL = A.eroeffnungKastenHtml(r4, false), kS = A.eroeffnungKastenHtml(r4, true);
t('Kasten auf der Lokalseite ohne "Zum Restaurant" (man ist schon da)', /kmi-eroeffnung-kasten/.test(kL) && !/Zum Restaurant/.test(kL) && /Zum Restaurant/.test(kS));
t('Kasten mit Datum, Timer und Reservieren', /class="kmi-countdown" data-ziel="\d+" role="timer"/.test(kL) && /Tisch zur Eröffnung reservieren/.test(kL));
// "es muss wie ein Timer": Tage, Std, Min, Sek -- bis zur Oeffnungszeit des Tages
var zr = A.eroeffnungRest(new Date(2026, 9, 30, 17, 0, 0).getTime(), new Date(2026, 9, 26, 15, 38, 50).getTime());
t('Timer rechnet richtig: 4 Tage 01:21:10', zr.t === 4 && zr.s === 1 && zr.m === 21 && zr.sek === 10, JSON.stringify(zr));
var zz = A.eroeffnungZiel({ opening_hours: { fr_start: '17:00' } }, { datum: '2026-10-30' });
t('Ziel = Öffnungszeit dieses Wochentags (Fr 30.10. ab 17:00)', zz.uhr === '17:00' && zz.ms === new Date(2026, 9, 30, 17, 0, 0).getTime(), JSON.stringify(zz));
t('ohne Öffnungszeit: Mitternacht, kein "ab"', A.eroeffnungZiel({}, { datum: '2026-10-30' }).uhr === '');
var th = A.eroeffnungTimerHtml(Date.now() + 90061000);
t('Timer-Kacheln TAG/STD/MIN/SEK mit führender Null', /data-teil="t"[^>]*>1</.test(th) && /data-teil="s"[^>]*>01</.test(th) && /data-teil="m"[^>]*>01</.test(th) && />SEK</.test(th), th.slice(0, 200));
t('abgelaufen: "JETZT GEÖFFNET" statt 0:00:00', /JETZT GEÖFFNET/.test(A.eroeffnungTimerHtml(Date.now() - 1000)));
t('tickt jede Sekunde', /setInterval\(function \(\) \{ try \{ eroeffnungTicken\(\); \} catch \(e\) \{\} \}, 1000\)/.test(H));
t('nach der Eröffnung kein Kasten mehr', A.eroeffnungKastenHtml(rNeu, false) === '');
var sw = fs.readFileSync(KMI + '/sw.js', 'utf8'), w = fs.readFileSync(KMI + '/netlify/functions/gastweg-wache.js', 'utf8');
var vSw = +(/kmi-shell-v(\d+)/.exec(sw) || [])[1], vW = +(/CACHE_MINDESTENS = (\d+)/.exec(w) || [])[1];
t('neue Fassung für die Geräte (sw v103+, Wache gleich)', vSw >= 103 && vW === vSw, vSw + ' / ' + vW);

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
