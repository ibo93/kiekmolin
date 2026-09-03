// DIE KARTE MIT DEM WASSERZEICHEN.
//
// Gemeldet am 02.09.2026 mit einem Bild der Startseite: quer ueber der
// ganzen Karte stand "API KEY REQUIRED". CARTO verlangt fuer seine
// Hintergrundkacheln jetzt ein Konto.
//
// Am 03.09. hat Ibo eins angelegt -- und auf der Anlege-Seite stand
// oben rechts "Your plan will expire in 14 days". Ein Konto, das in 14
// Tagen ablaeuft, loest gar nichts: dann stuenden wir am 17. September
// wieder hier.
//
// Also OpenStreetMap. Kein Schluessel, kein Konto, kein Ablaufdatum.
//
// Dieser Test haelt drei Dinge fest:
//   1. Es gibt NUR NOCH EINE Stelle mit einer Kachel-Adresse. Vorher
//      waren es neun, ueber fuenf Ansichten verteilt -- deshalb hat der
//      Ausfall auch ueberall gleichzeitig zugeschlagen.
//   2. Der Hinweis "© OpenStreetMap" ist sichtbar. Das ist keine Zier,
//      sondern die Bedingung, unter der die Kacheln kostenlos sind.
//      Zwei CSS-Regeln haben ihn bisher versteckt.
//   3. Nirgends steckt wieder eine CARTO-Adresse im Code.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

console.log('\n-- 1. CARTO ist raus --');

t('keine einzige cartocdn-Adresse mehr',
  (h.match(/cartocdn/g) || []).length === 0,
  (h.match(/[^'"]*cartocdn[^'"]*/g) || []).slice(0, 3).join(' | '));
t('und auch sonst kein CARTO-Kachelserver',
  !/basemaps\.carto|api\.carto\.com\/v3\/maps/.test(h));

console.log('\n-- 2. Nur noch EINE Stelle mit einer Kachel-Adresse --');

// Jede Zeichenkette, die wie eine Kachel-Adresse aussieht: sie traegt
// {z}/{x}/{y}. Danach suchen wir, nicht nach einem Anbieternamen --
// sonst faende der Test den naechsten Umzug nicht.
var adressen = h.match(/['"]https:\/\/[^'"]*\{z\}\/\{x\}\/\{y\}[^'"]*['"]/g) || [];
t('genau eine Kachel-Adresse im ganzen Haus',
  adressen.length === 1, adressen.length + ': ' + adressen.join(' | '));
t('und die zeigt auf OpenStreetMap',
  adressen.length === 1 && /tile\.openstreetmap\.org/.test(adressen[0]), adressen[0]);
t('ohne {s}-Platzhalter (die Unteradressen gibt es dort nicht mehr)',
  adressen.length === 1 && adressen[0].indexOf('{s}') < 0, adressen[0]);
t('und ohne {r} (Retina-Kacheln liefert OSM nicht)',
  adressen.length === 1 && adressen[0].indexOf('{r}') < 0, adressen[0]);

// Und niemand darf an KARTE vorbei eine eigene Ebene bauen.
var eigenbau = h.match(/L\.tileLayer\(/g) || [];
t('L.tileLayer wird nur an dieser einen Stelle gerufen',
  eigenbau.length === 1, eigenbau.length + ' mal');

console.log('\n-- 3. Der Hinweis auf OpenStreetMap ist sichtbar --');

t('kein attributionControl:false mehr',
  (h.match(/attributionControl:\s*false/g) || []).length === 0,
  (h.match(/attributionControl:\s*false/g) || []).length + ' mal');
t('die Kachel-Ebene traegt den Hinweis',
  /attribution: KARTE\.HINWEIS/.test(h));
t('und der Hinweis nennt OpenStreetMap',
  /HINWEIS:[^\n]*OpenStreetMap/.test(h));
t('mit Link auf die Lizenz',
  /openstreetmap\.org\/copyright/.test(h));

// Regel 5: hier stand frueher zweimal display:none darauf. Faellt
// dieser Test, ist der Hinweis wieder weg -- und damit die Erlaubnis.
var versteckt = h.match(/\.leaflet-control-attribution[^{]*\{[^}]*display:\s*none/g) || [];
t('keine CSS-Regel blendet ihn aus',
  versteckt.length === 0, versteckt.join(' | '));

console.log('\n-- 4. Das ruhige Grau --');

t('ein Filter liegt auf der Kachel-Ebene',
  /\.leaflet-tile-pane\s*\{[^}]*filter:[^}]*grayscale/.test(h));
t('und NUR dort -- die Stecknadeln bleiben farbig',
  !/\.leaflet-marker-pane\s*\{[^}]*filter:/.test(h) &&
  !/\.leaflet-container\s*\{[^}]*filter:\s*grayscale/.test(h));
t('dunkel wird ueber eine eigene Klasse gemacht',
  /\.kmi-karte-dunkel\s+\.leaflet-tile-pane\s*\{[^}]*invert\(1\)/.test(h));

console.log('\n-- 5. Umschalten laedt nicht alles neu --');

// Vorher warf updateMapTheme beide Ebenen weg und legte sie neu an:
// jede Kachel noch einmal uebers Netz, nur fuer eine andere Farbe.
var utm = h.slice(h.indexOf('function updateMapTheme'));
utm = utm.slice(0, utm.indexOf('\n}\n') + 3);
t('updateMapTheme wirft keine Ebene mehr weg',
  !/removeLayer/.test(utm), utm.slice(0, 200));
t('sondern setzt nur die Klasse',
  (utm.match(/KARTE\.dunkelSetzen/g) || []).length === 2, utm.slice(0, 300));

var tms = h.slice(h.indexOf('function toggleMapStyle'));
tms = tms.slice(0, tms.indexOf('\n}\n') + 3);
t('toggleMapStyle genauso',
  !/removeLayer/.test(tms) && /KARTE\.dunkelSetzen/.test(tms), tms.slice(0, 200));

console.log('\n-- 6. KARTE selbst --');

// Den Block herausschneiden und wirklich laufen lassen.
var a = h.indexOf('    var KARTE = {');
var quelle = h.slice(a, h.indexOf('\n    };\n', a) + 7);
t('der Block laesst sich finden', quelle.length > 200, quelle.length);

var ebenen = [];
var ctx = {
    document: { body: { classList: { _d: false, contains: function () { return ctx.document.body.classList._d; } } } },
    L: { tileLayer: function (url, o) { ebenen.push({ url: url, o: o }); return { addTo: function () { return this; } }; } },
    window: {}, console: console
};
vm.createContext(ctx);
vm.runInContext(quelle, ctx);
var K = ctx.KARTE;

function falscheKarte(klassen) {
    return { getContainer: function () { return { classList: {
        add: function (c) { if (klassen.indexOf(c) < 0) klassen.push(c); },
        remove: function (c) { var i = klassen.indexOf(c); if (i >= 0) klassen.splice(i, 1); }
    } }; } };
}

var kl = [];
K.ebene(falscheKarte(kl), true);
t('dunkel gesetzt haengt die Klasse an', kl.indexOf('kmi-karte-dunkel') >= 0, kl.join(','));
K.dunkelSetzen(falscheKarte(kl), false);
t('und hell nimmt sie wieder weg', kl.indexOf('kmi-karte-dunkel') < 0, kl.join(','));

var kl2 = [];
K.ebene(falscheKarte(kl2), false);
t('hell setzt keine Klasse', kl2.length === 0, kl2.join(','));
t('die Ebene bekommt den Hinweis mit',
  ebenen.length > 0 && /OpenStreetMap/.test(ebenen[ebenen.length - 1].o.attribution),
  JSON.stringify(ebenen[ebenen.length - 1] && ebenen[ebenen.length - 1].o));

// Ohne Rahmen darf nichts abstuerzen -- eine Karte kann schon weg sein,
// wenn der Dunkelmodus umschaltet.
var geknallt = false;
try { K.dunkelSetzen(null, true); K.dunkelSetzen({}, true); } catch (e) { geknallt = true; }
t('ohne Karte stuerzt es nicht ab', geknallt === false);

// istDunkel liest den Koerper, nicht eine eigene Variable.
ctx.document.body.classList._d = true;
t('istDunkel folgt dem Dunkelmodus der Seite', K.istDunkel() === true);
ctx.document.body.classList._d = false;
t('und dem hellen genauso', K.istDunkel() === false);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
