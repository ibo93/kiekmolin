// DER MITTAGSTISCH -- EINE KATEGORIE, DIE NUR MITTAGS DA IST.
//
// Ibo am 04.09.2026: "bei mittags ein komplettes menue mit mehre
// gerichte das man es einfuegen -- oder einzeln bei angebot hat man nur
// ein gericht".
//
// NACHGESEHEN STATT ANGENOMMEN: der EINZEL-Fall existiert schon.
// publishDailyOffer() legt ein Tagesangebot an -- Titel, Preis, alter
// Preis, gueltig bis. Neu gebaut werden musste davon nichts.
//
// Was fehlte: MEHRERE Gerichte, zeitlich begrenzt.
//
// DREI FALLEN STECKEN DARIN, UND JEDE EINZELNE WAERE STILL:
//
// 1. UEBER MITTERNACHT. Ein Nachtangebot 22:00-02:00 waere naiv
//    gerechnet NIE sichtbar -- und niemand wuerde einen Fehler sehen,
//    nur eine Kategorie, die "irgendwie nicht geht".
// 2. DIE ZEITZONE. Ohne feste deutsche Zeit saehe ein Gast im Urlaub
//    den Mittagstisch zur falschen Stunde.
// 3. EINE UNLESBARE ZEIT duerfte die Kategorie nicht verschwinden
//    lassen. Ein Wirt sucht sonst stundenlang nach seinen Gerichten.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var a = h.indexOf('var MITTAG = {');
var e = h.indexOf('window.MITTAG = MITTAG;');
t('MITTAG wurde gefunden', a > 0 && e > a, a + '/' + e);
var MITTAG = new Function('Intl', h.slice(a, e) + '; return MITTAG;')(Intl);

function zu(iso) { return new Date(iso); }

// ---- 1. Der Normalfall darf sich NICHT aendern -----------------------
console.log('\n-- Ohne Zeitfenster bleibt alles wie es war --');
t('eine Kategorie ohne Zeiten ist immer sichtbar',
  MITTAG.istSichtbar({ name: 'Vorspeisen' }, zu('2026-09-07T03:00:00+02:00')) === true, 'verschwunden');
t('auch mit nur EINER Zeit (halbe Angabe)',
  MITTAG.istSichtbar({ zeit_von: '11:00' }, zu('2026-09-07T03:00:00+02:00')) === true, 'verschwunden');
t('hatFenster erkennt das richtig',
  MITTAG.hatFenster({}) === false && MITTAG.hatFenster({ zeit_von: '11:00', zeit_bis: '14:00' }) === true, 'falsch');

// ---- 2. Der Mittagstisch --------------------------------------------
console.log('\n-- 11 bis 14 Uhr --');
var mittag = { zeit_von: '11:00', zeit_bis: '14:00' };
t('10:30 -> nicht sichtbar', MITTAG.istSichtbar(mittag, zu('2026-09-07T10:30:00+02:00')) === false, 'sichtbar');
t('11:00 -> sichtbar (die Grenze zaehlt mit)', MITTAG.istSichtbar(mittag, zu('2026-09-07T11:00:00+02:00')) === true, 'nicht sichtbar');
t('12:30 -> sichtbar', MITTAG.istSichtbar(mittag, zu('2026-09-07T12:30:00+02:00')) === true, 'nicht sichtbar');
t('14:00 -> sichtbar (die Grenze zaehlt mit)', MITTAG.istSichtbar(mittag, zu('2026-09-07T14:00:00+02:00')) === true, 'nicht sichtbar');
t('14:30 -> nicht sichtbar', MITTAG.istSichtbar(mittag, zu('2026-09-07T14:30:00+02:00')) === false, 'sichtbar');

// ---- 3. Ueber Mitternacht -------------------------------------------
console.log('\n-- Das Nachtangebot 22 bis 2 --');
var nacht = { zeit_von: '22:00', zeit_bis: '02:00' };
t('23:30 -> sichtbar', MITTAG.istSichtbar(nacht, zu('2026-09-07T23:30:00+02:00')) === true, 'nicht sichtbar');
t('01:00 -> sichtbar', MITTAG.istSichtbar(nacht, zu('2026-09-08T01:00:00+02:00')) === true, 'nicht sichtbar');
t('15:00 -> nicht sichtbar', MITTAG.istSichtbar(nacht, zu('2026-09-07T15:00:00+02:00')) === false, 'sichtbar');
t('03:00 -> nicht sichtbar', MITTAG.istSichtbar(nacht, zu('2026-09-08T03:00:00+02:00')) === false, 'sichtbar');

// ---- 4. Wochentage ---------------------------------------------------
console.log('\n-- Mo bis Fr --');
var werktags = { zeit_von: '11:00', zeit_bis: '14:00', wochentage: [0, 1, 2, 3, 4] };
t('Montag 12:00 -> sichtbar', MITTAG.istSichtbar(werktags, zu('2026-09-07T12:00:00+02:00')) === true, 'nicht sichtbar');
t('Freitag 12:00 -> sichtbar', MITTAG.istSichtbar(werktags, zu('2026-09-11T12:00:00+02:00')) === true, 'nicht sichtbar');
t('Samstag 12:00 -> nicht sichtbar', MITTAG.istSichtbar(werktags, zu('2026-09-12T12:00:00+02:00')) === false, 'sichtbar');
t('Sonntag 12:00 -> nicht sichtbar', MITTAG.istSichtbar(werktags, zu('2026-09-13T12:00:00+02:00')) === false, 'sichtbar');
t('leere Tagesliste heisst taeglich',
  MITTAG.istSichtbar({ zeit_von: '11:00', zeit_bis: '14:00', wochentage: [] }, zu('2026-09-13T12:00:00+02:00')) === true,
  'Sonntag ausgesperrt');

// ---- 5. Die Zeitzone -------------------------------------------------
console.log('\n-- Der Gast im Urlaub --');
// Derselbe Zeitpunkt: 12:00 in Deutschland. Egal, wo das Geraet steht --
// gerechnet wird in deutscher Zeit.
t('12:00 deutscher Zeit gilt, egal wie der Zeitpunkt geschrieben ist',
  MITTAG.istSichtbar(mittag, zu('2026-09-07T10:00:00Z')) === true, 'falsch gerechnet');
t('und 09:00 deutscher Zeit gilt nicht',
  MITTAG.istSichtbar(mittag, zu('2026-09-07T07:00:00Z')) === false, 'falsch gerechnet');
// Sommer/Winter macht der Browser selbst -- im Januar ist +01:00 richtig.
t('im Winter stimmt es auch',
  MITTAG.istSichtbar(mittag, zu('2026-01-12T12:30:00+01:00')) === true, 'Winterzeit falsch');

// ---- 6. Unsinn darf nichts verschlucken ------------------------------
console.log('\n-- Kaputte Zeiten --');
t('"Mittag" statt einer Uhrzeit -> lieber sichtbar als spurlos weg',
  MITTAG.istSichtbar({ zeit_von: 'Mittag', zeit_bis: '14:00' }, zu('2026-09-07T03:00:00+02:00')) === true, 'verschwunden');
t('25:00 ist keine Uhrzeit', MITTAG.minuten('25:00') === null, MITTAG.minuten('25:00'));
t('11:70 auch nicht', MITTAG.minuten('11:70') === null, MITTAG.minuten('11:70'));
t('"11:00:00" wird verstanden', MITTAG.minuten('11:00:00') === 660, MITTAG.minuten('11:00:00'));

// ---- 7. Der Hinweis fuer den Wirt ------------------------------------
console.log('\n-- Was der Wirt liest --');
// Er sieht die Kategorie IMMER -- aber er muss wissen, dass der Gast das nicht tut.
var hin = MITTAG.hinweis(werktags, zu('2026-09-12T12:00:00+02:00'));
t('am Samstag steht dort "NICHT sichtbar"', /NICHT sichtbar/.test(hin), hin);
t('mit den Tagen', /Mo, Di, Mi, Do, Fr/.test(hin), hin);
t('und den Zeiten', /11:00–14:00/.test(hin), hin);
t('ohne Fenster steht gar nichts da', MITTAG.hinweis({}) === '', MITTAG.hinweis({}));

// ---- 8. Die Verdrahtung ----------------------------------------------
console.log('\n-- Angeschlossen? --');
t('der Gast bekommt nur sichtbare Kategorien',
  /categories = categories\.filter\(function \(c\) \{ return MITTAG\.istSichtbar\(c\); \}\)/.test(h), 'nicht gefiltert');
t('aktive Zeitfenster stehen vorne', /MITTAG\.hatFenster\(a\) \? 0 : 1/.test(h), 'nicht sortiert');
t('die Maske hat Von- und Bis-Feld',
  /id="newCategoryVon"/.test(h) && /id="newCategoryBis"/.test(h), 'kein Feld');
t('und Wochentag-Knoepfe', /id="newCategoryTage"/.test(h), 'keine Tage');
// Eine halbe Angabe waere ein Fenster, das niemand versteht.
t('eine halbe Zeitangabe wird abgefangen',
  /Bitte beide Zeiten angeben/.test(h), 'halbe Angabe geht durch');
t('es gibt die SQL-Datei dazu',
  fs.existsSync(path.join(KMI, 'datenbank', '25-mittagstisch.sql')), 'fehlt');
// Der Einzel-Fall wurde NICHT neu gebaut.
t('das Tagesangebot blieb, wie es war', /async function publishDailyOffer\(/.test(h), 'angefasst');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
