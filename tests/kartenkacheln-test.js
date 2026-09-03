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

console.log('\n-- 2. Alle Kachel-Adressen stehen an EINER Stelle --');

// Jede Zeichenkette, die wie eine Kachel-Adresse aussieht: sie traegt
// {z} und {x} und {y}. Danach suchen wir, nicht nach einem
// Anbieternamen -- sonst faende der Test den naechsten Umzug nicht.
var adressen = h.match(/['"]https:\/\/[^'"]*\{z\}[^'"]*\{[xy]\}[^'"]*['"]/g) || [];
t('zwei Adressen: hell und dunkel',
  adressen.length === 2, adressen.length + ': ' + adressen.join(' | '));

// Und BEIDE muessen im KARTE-Block liegen. Sonst nuetzt "eine Stelle"
// nichts -- genau daran hing der CARTO-Ausfall, der neun Stellen
// gleichzeitig getroffen hat.
var kBlock = h.slice(h.indexOf('    var KARTE = {'), h.indexOf('\n    };\n', h.indexOf('    var KARTE = {')));
t('und beide stehen im KARTE-Block, nirgends sonst',
  adressen.every(function (a) { return kBlock.indexOf(a) >= 0; }),
  adressen.filter(function (a) { return kBlock.indexOf(a) < 0; }).join(' | '));

t('hell ist Esri Light Gray', /World_Light_Gray_Base/.test(kBlock));
t('dunkel ist Esri Dark Gray', /World_Dark_Gray_Base/.test(kBlock));

// Esri ordnet {z}/{y}/{x}. Vertauscht liefert es Kacheln von der
// falschen Stelle der Welt -- ohne Fehlermeldung (Regel 6).
t('die Esri-Reihenfolge {z}/{y}/{x} stimmt',
  adressen.every(function (a) { return /\{z\}\/\{y\}\/\{x\}/.test(a); }), adressen.join(' | '));
t('kein {s}-Platzhalter', adressen.every(function (a) { return a.indexOf('{s}') < 0; }));
t('kein {r}-Platzhalter', adressen.every(function (a) { return a.indexOf('{r}') < 0; }));

// Weiter zoomen als der Anbieter Kacheln hat, ergibt WEISS -- und das
// sieht aus wie eine Karte ohne Haeuser.
t('ueber die letzte Kachel hinaus wird vergroessert statt weiss',
  /maxNativeZoom: KARTE\.MAXNATIV/.test(h) && /MAXNATIV: 1[0-9]/.test(kBlock));

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
t('und der Hinweis nennt beide Quellen',
  /HINWEIS:[^\n]*Esri/.test(h) && /HINWEIS:[^\n]*OpenStreetMap/.test(h));
t('mit Link auf die Lizenz',
  /openstreetmap\.org\/copyright/.test(h));

// Regel 5: hier stand frueher zweimal display:none darauf. Faellt
// dieser Test, ist der Hinweis wieder weg -- und damit die Erlaubnis.
var versteckt = h.match(/\.leaflet-control-attribution[^{]*\{[^}]*display:\s*none/g) || [];
t('keine CSS-Regel blendet ihn aus',
  versteckt.length === 0, versteckt.join(' | '));

console.log('\n-- 4. Kein Filter mehr ueber der Karte --');

// Solange die Kacheln von OSM kamen, wurden sie mit Gewalt entfaerbt.
// Esri Light Gray ist von sich aus reduziert -- ein Filter darueber
// macht es nur flau, und invert(1) auf grau sieht schmutzig aus.
t('kein Graufilter mehr auf der Kachel-Ebene',
  !/\.leaflet-tile-pane\s*\{[^}]*filter:/.test(h));
t('und keine invert-Regel fuer dunkel',
  !/kmi-karte-dunkel/.test(h));
t('dunkel kommt als eigener Kartenstil vom Anbieter',
  /karte\._kmiEbene\.setUrl\(will\)/.test(h));

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

var a = h.indexOf('    var KARTE = {');
var quelle = h.slice(a, h.indexOf('\n    };\n', a) + 7);
t('der Block laesst sich finden', quelle.length > 200, quelle.length);

var gebaut = [];
var ctx = {
    document: { body: { classList: { _d: false, contains: function () { return ctx.document.body.classList._d; } } } },
    L: { tileLayer: function (url, o) {
            var eb = { _url: url, o: o,
                setUrl: function (u) { this._url = u; gebaut.push('setUrl:' + u); },
                addTo: function () { return this; } };
            gebaut.push('neu:' + url);
            return eb;
         } },
    window: {}, console: console
};
vm.createContext(ctx);
vm.runInContext(quelle, ctx);
var K = ctx.KARTE;

var karte = {};
var eb = K.ebene(karte, false);
t('hell legt die helle Ebene an', eb._url === K.HELL, eb._url);
t('die Ebene haengt an der Karte', karte._kmiEbene === eb);
t('mit Hinweis', /Esri/.test(eb.o.attribution), eb.o.attribution);
t('und mit maxNativeZoom', eb.o.maxNativeZoom === K.MAXNATIV, eb.o.maxNativeZoom);

K.dunkelSetzen(karte, true);
t('dunkel tauscht nur die Adresse', karte._kmiEbene._url === K.DUNKEL, karte._kmiEbene._url);
t('und legt KEINE neue Ebene an',
  gebaut.filter(function (g) { return g.indexOf('neu:') === 0; }).length === 1,
  gebaut.join(' | '));

var vorher = gebaut.length;
K.dunkelSetzen(karte, true);
t('zweimal dasselbe schreibt nicht noch einmal', gebaut.length === vorher, gebaut.slice(vorher).join(' | '));

K.dunkelSetzen(karte, false);
t('und zurueck auf hell geht auch', karte._kmiEbene._url === K.HELL);

// Ohne Ebene darf nichts abstuerzen -- eine Karte kann schon weg sein,
// wenn der Dunkelmodus umschaltet.
var geknallt = false;
try { K.dunkelSetzen(null, true); K.dunkelSetzen({}, true); K.ebene(null); } catch (e) { geknallt = true; }
t('ohne Karte stuerzt es nicht ab', geknallt === false);

ctx.document.body.classList._d = true;
t('istDunkel folgt dem Dunkelmodus der Seite', K.istDunkel() === true);
ctx.document.body.classList._d = false;
t('und dem hellen genauso', K.istDunkel() === false);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
