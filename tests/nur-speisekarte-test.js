// NUR SPEISEKARTE, KEINE ONLINEBESTELLUNG.
//
// Ibos Idee vom 04.09.2026: "die keine online bestellung haben wollen
// fuer die soll die speisekarte gezeigt werden".
//
// WARUM DAS VORHER NICHT GING -- gemessen, nicht vermutet:
// schaltete der Wirt alle drei Bestellarten aus, machte der Code sie
// wieder an --
//
//     if (!pickupEnabled && !deliveryEnabled && !localStorage...) {
//         pickupEnabled = true; deliveryEnabled = true;
//     }
//
// "alles aus" und "nie eingestellt" sahen gleich aus, und im Zweifel
// gewann "an". Es liess sich also gar nicht abschalten.
//
// Deshalb ein eigenes Merkmal (nur_speisekarte) in der bestehenden
// Spalte features -- keine neue SQL-Datei, und wer es nicht setzt,
// merkt von der ganzen Sache nichts.
//
// Nebenbei aufgefallen und mit repariert: hier_essen wurde NIE in die
// Datenbank geschrieben. Der Schalter ging um, die Meldung sagte
// "gespeichert", und nach dem Neuladen stand der alte Stand da.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

console.log('\n-- 1. Das Merkmal, an einer Stelle --');

var a = h.indexOf("    var NUR_KARTE = 'nur_speisekarte';");
var quelle = h.slice(a, h.indexOf('    window.nurSpeisekarte = nurSpeisekarte;', a) + 45);
t('der Block wurde gefunden', quelle.length > 100, quelle.length);

var ctx = { window: {}, console: console };
vm.createContext(ctx);
vm.runInContext(quelle, ctx);

t('ein Betrieb mit dem Merkmal zeigt nur die Karte',
  ctx.nurSpeisekarte({ features: ['abholung', 'nur_speisekarte'] }) === true);
t('einer ohne das Merkmal nicht',
  ctx.nurSpeisekarte({ features: ['abholung', 'lieferung'] }) === false);
t('ohne features-Feld auch nicht',
  ctx.nurSpeisekarte({}) === false);
t('und ohne Betrieb stuerzt nichts ab',
  ctx.nurSpeisekarte(null) === false && ctx.nurSpeisekarte(undefined) === false);

// Es liegt in features -- also braucht niemand eine SQL-Datei.
t('kein neues Datenbankfeld noetig', !/alter table restaurants[\s\S]{0,120}nur_speisekarte/i.test(h));

console.log('\n-- 2. Der Gast kann nichts in den Korb legen --');

// Zwei Tueren: der Knopf an der Gerichtkarte UND openItemOptions
// selbst, das auch aus der Suche und den Tagesangeboten gerufen wird.
// Nur eine davon zuzumachen hiesse, die andere zu vergessen.
var koep = h.slice(h.indexOf('// Hinzufügen Button'), h.indexOf('// Hinzufügen Button') + 1400);
t('bei "nur Speisekarte" steht kein Hinzufuegen-Knopf da',
  /nurSpeisekarte\(currentOrderRestaurant\)/.test(koep), koep.slice(0, 200));
t('sondern ein Hinweis "Nur zum Ansehen"', /Nur zum Ansehen/.test(koep));

var oio = h.slice(h.indexOf('function openItemOptions(itemId, item)'));
oio = oio.slice(0, 900);
t('openItemOptions selbst ist gesperrt',
  /nurSpeisekarte\(currentOrderRestaurant\)/.test(oio), oio.slice(0, 300));
t('und die Sperre steht GANZ VORNE, vor jeder Zuweisung',
  oio.indexOf('nurSpeisekarte') < oio.indexOf('currentMenuItem = item'),
  oio.indexOf('nurSpeisekarte') + ' vs ' + oio.indexOf('currentMenuItem = item'));
t('sie sagt dem Gast auch, warum', /telefonisch/.test(oio));

console.log('\n-- 3. Und er erfaehrt, dass es Absicht ist --');

// Eine Karte ohne Knoepfe sieht sonst aus wie eine kaputte Karte.
t('ein Hinweis wird eingesetzt', /id = 'nurKarteHinweis'/.test(h) || /_hinweisId = 'nurKarteHinweis'/.test(h));
t('mit klarer Ansage', /Hier gibt es keine Onlinebestellung/.test(h));
t('und der Telefonnummer, wenn es eine gibt', /href="tel:/.test(h) && /restaurant\.phone/.test(h));
t('ein alter Hinweis wird vorher entfernt (kein Stapeln)',
  /_alterHinweis\) _alterHinweis\.remove\(\)/.test(h));

console.log('\n-- 4. Der Schalter im Dashboard --');

t('es gibt ihn', /id="settingNurKarte"/.test(h));
t('er wird beim Laden gesetzt', /nurKarteEl\.checked = features\.indexOf\('nur_speisekarte'\)/.test(h));
t('er wird gespeichert', /if \(settings\.nur_karte\) features\.push\(NUR_KARTE\)/.test(h));
t('und vorher aus der Liste geworfen (kein doppelter Eintrag)',
  /f !== NUR_KARTE/.test(h));
t('er springt optisch um wie die anderen',
  /\['Pickup', 'Delivery', 'DineIn', 'NurKarte'\]/.test(h));

// Beides gleichzeitig waere ein Widerspruch, den der Gast ausbadet.
t('ist er an, gehen die drei Bestellarten aus',
  /if \(settings\.nur_karte\) \{ settings\.pickup = false; settings\.delivery = false; settings\.dine_in = false; \}/.test(h));
t('und sie sind nicht mehr anklickbar',
  /toggle\.style\.pointerEvents = _nurAn \? 'none' : '';/.test(h));

console.log('\n-- 5. Der Nebenbefund: hier_essen wurde nie gespeichert --');

var sos = h.slice(h.indexOf('async function saveOrderSettingsToSupabase'));
sos = sos.slice(0, sos.indexOf('\n}\n') + 3);
t('hier_essen wird jetzt aus der Liste gefiltert',
  /f !== 'hier_essen'/.test(sos), sos.slice(0, 400));
t('und auch wieder hineingeschrieben',
  /if \(settings\.dine_in\) features\.push\('hier_essen'\)/.test(sos));
t('abholung und lieferung weiterhin ebenso',
  /features\.push\('abholung'\)/.test(sos) && /features\.push\('lieferung'\)/.test(sos));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
