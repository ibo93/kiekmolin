// STEMPELKARTE VOR DEM BESTELLEN SICHTBAR (26.10.2026)
//
// Ibo: "beim bestellen, dass man sieht, dieser Betrieb hat Stempelkarte".
// Entwurf in Claude Design abgenommen ("passt baue es ein").
// Vorher sah der Gast die Karte erst im Warenkorb. Dazu: mapRestaurant liess
// stempel_ziel/stempel_belohnung fallen -- nach dem Laden waren sie weg.
//
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
function zeile(name) { var m = new RegExp('var ' + name + " = '[^\\n]*';").exec(H); return m ? m[0] : ''; }

var tel = '';
var quelle = [zeile('_STEMPEL_HAKEN'), zeile('_STEMPEL_GESCHENK'),
    fn('_stempelSchluessel'), fn('stempelTelOk'), fn('stempelHausAktiv'), fn('_stempelEsc'), fn('stempelPunkteHtml'), fn('_stempelNoch'),
    fn('stempelAngebot'), fn('_stempelZielSatz'), fn('_stempelGastTel'), fn('stempelAbzeichenHtml'), fn('_stempelLokalInnen')].join('\n');
var api = new Function('window', 'localStorage', 'zahlsperreBestellenAus', 'var _stempelStaende = {};\n' + quelle
    + '; return { angebot: stempelAngebot, abzeichen: stempelAbzeichenHtml, innen: _stempelLokalInnen };')(
    {}, { getItem: function () { return tel; } }, function (r) { return r && r.zahlsperre === 'pause'; });

console.log('\n-- 1. NUR WO ES DIE KARTE WIRKLICH GIBT --');
var haus = { id: 'a', features: ['loyalty_points'], stempel_ziel: 8, stempel_belohnung: 'eine Pizza gratis' };
t('ohne loyalty_points: nichts', api.angebot({ features: [] }) === null && api.abzeichen({ features: [] }) === '');
t('mit: Ziel und Belohnung des Wirts', JSON.stringify(api.angebot(haus)) === '{"ziel":8,"belohnung":"eine Pizza gratis"}', JSON.stringify(api.angebot(haus)));
t('"Nur Speisekarte" (keine Bestellung): kein Versprechen', api.angebot({ features: ['loyalty_points', 'no_ordering'] }) === null);
t('Zahlsperre pausiert Bestellungen: kein Versprechen', api.angebot({ features: ['loyalty_points'], zahlsperre: 'pause' }) === null);
t('ohne Einstellung: 10 und "ein Gratis-Gericht" wie der Server', JSON.stringify(api.angebot({ features: ['loyalty_points'] })) === '{"ziel":10,"belohnung":"ein Gratis-Gericht"}');
t('Ziel wird auf 3..30 begrenzt wie in der Datenbank', api.angebot({ features: ['loyalty_points'], stempel_ziel: 99 }).ziel === 30);

console.log('\n-- 2. LISTE --');
var ab = api.abzeichen(haus);
t('Abzeichen + Satz', /kmi-stempel-abzeichen[\s\S]*STEMPELKARTE/.test(ab) && /8 Bestellungen = eine Pizza gratis/.test(ab), ab);
t('Belohnung wird maskiert (der Wirt tippt sie ein)', !/<img/.test(api.abzeichen({ features: ['loyalty_points'], stempel_belohnung: '<img src=x onerror=alert(1)>' })));

console.log('\n-- 3. LOKALSEITE --');
var a = api.angebot(haus);
var neu = api.innen(haus, a, null);
t('neuer Gast: "kostenlos", Ziel, leere Punkte, Erklärung', /kostenlos/.test(neu) && /8 Bestellungen = eine Pizza gratis/.test(neu) && !/kmi-stempel-punkt voll/.test(neu) && /Keine App, keine Anmeldung/.test(neu));
var stamm = api.innen(haus, a, { aktiv: true, ziel: 8, belohnung: 'eine Pizza gratis', stempel: 3, guthaben: 0, gesamt: 3 });
t('Stammgast: eigener Stand, 3 volle Punkte, "Noch 5"', /Deine Stempelkarte/.test(stamm) && (stamm.match(/kmi-stempel-punkt voll/g) || []).length === 3 && /Noch 5 Bestellungen/.test(stamm), stamm.slice(0, 200));
var voll = api.innen(haus, a, { aktiv: true, ziel: 8, belohnung: 'eine Pizza gratis', stempel: 0, guthaben: 1, gesamt: 8 });
t('Karte voll: "Belohnung verdient!"', /Belohnung verdient!/.test(voll));
var kaputt = api.innen(haus, a, { fehler: 'HTTP 500' });
t('Stand nicht ladbar: allgemeiner Kasten statt falschem eigenen Stand', /kostenlos/.test(kaputt) && !/Deine Stempelkarte/.test(kaputt));

console.log('\n-- 4. EINGEBAUT --');
t('mapRestaurant nimmt Ziel und Belohnung mit', /stempel_ziel: r\.stempel_ziel != null \? Number\(r\.stempel_ziel\) : null/.test(fn('mapRestaurant')) && /stempel_belohnung: r\.stempel_belohnung/.test(fn('mapRestaurant')));
var mr = new Function('_restCoord', fn('mapRestaurant') + '; return mapRestaurant;')(function () { return 0; });
t('... und nach dem Laden sind sie da', (function () { try { var x = mr({ id: 'a', name: 'X', stempel_ziel: 8, stempel_belohnung: 'Pizza' }); return x.stempel_ziel === 8 && x.stempel_belohnung === 'Pizza'; } catch (e) { return 'Fehler: ' + e.message; } })(), 'siehe Fehler');
t('Liste: Abzeichen auf der Karte', /stempelAbzeichenHtml\(r\)/.test(fn('renderRestaurants')));
t('Lokalseite: Kasten vor der Speisekarte', /stempelLokalHtml\(rest\)[\s\S]{0,80}<!-- Speisekarte Highlights -->/.test(fn('showRestaurantLanding')));
t('Bestellkarte: Leiste, aber nicht im Nur-Karte-Modus', /stempelMenuLeiste\(_nurKarte \? null : appRest\)/.test(fn('openMenuModal')) && /id="stempelMenuLeiste"/.test(H));
t('"kostenlos" lesbar: Regel schlägt .kmi-stempel-kopf em', /\.kmi-stempel-kopf em\.kmi-stempel-frei \{[^}]*color: #00251e/.test(H));
t('Dunkelmodus: Haken im vollen Punkt nicht Gold auf Gold', /\.dark-mode \.kmi-stempel-punkt\.voll svg \{ color: #00251e !important/.test(H));
var sw = fs.readFileSync(KMI + '/sw.js', 'utf8'), wa = fs.readFileSync(KMI + '/netlify/functions/gastweg-wache.js', 'utf8');
var vSw = +(/kmi-shell-v(\d+)/.exec(sw) || [])[1], vW = +(/CACHE_MINDESTENS = (\d+)/.exec(wa) || [])[1];
t('neue Fassung für die Geräte (sw v105+, Wache gleich)', vSw >= 105 && vW === vSw, vSw + ' / ' + vW);

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
