// DER MITTAGSTISCH, DEN DER WIRT JEDEN TAG NEU EINTRAEGT.
//
// Ibo am 07.09.2026: "menü erstellen ist doch kein mittagstisch ...
// mittagstisch was der gastronom HEUTE anbietet, 5 gerichte -- vorspeise,
// hauptgericht, dessert oder mehrere hauptgerichte -- da ändert sich ständig."
//
// ER HAT RECHT, UND DAS WAR MEIN FEHLER.
// Was ich vorher "Mittagstisch" genannt habe, war eine Kategorie mit
// Zeitfenster. Die loest "nur von 11 bis 14 Uhr sichtbar" -- aber nicht
// "heute diese fuenf, morgen andere". Das Taegliche fehlte komplett, und
// ich habe es trotzdem als fertig gemeldet.
//
// NACHGESEHEN STATT NEU GEBAUT: daily_specials kann das laengst. Eine
// date-Spalte, also eine Zeile pro Gericht pro Tag -- und die Gastseite
// liest schon mehrere davon samt Zeitfenster. Es fehlte nur der schnelle
// Weg: das Formular legt genau EINS an und ist danach wieder leer.
//
// DIE STELLEN, AN DENEN ES STILL SCHIEFGEHT:
// 1. Mehrere Zeilen mit id = Date.now() bekommen DIESELBE id. Vier von
//    fuenf Gerichten waeren von der Datenbank abgewiesen worden.
// 2. Beim Veroeffentlichen muss das Alte weg -- aber NUR der Mittagstisch.
//    Ein normales Tagesangebot liegt in derselben Tabelle am selben Datum
//    und wuerde sonst stillschweigend mit geloescht.
// 3. Das Geraetedatum statt des deutschen: ein Gast im Urlaub bekaeme den
//    Mittagstisch von gestern und wuesste nie warum.
// 4. Traegt er mehr Gerichte ein, als die Gastabfrage holt, verschwinden
//    die letzten lautlos.
// 5. Ein Gericht ohne Preis sieht beim Gast aus wie geschenkt.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

function schneide(name) {
    var a = h.indexOf('function ' + name + '(');
    if (a < 0) a = h.indexOf('async function ' + name + '(');
    if (a < 0) return '';
    var tiefe = 0, i = h.indexOf('{', a);
    if (i < 0) return '';
    for (var j = i; j < h.length; j++) {
        if (h[j] === '{') tiefe++;
        else if (h[j] === '}') { tiefe--; if (tiefe === 0) return h.slice(a, j + 1); }
    }
    return '';
}

// ---- Das Objekt wirklich ausfuehren, nicht nur den Text vergleichen ----
var a = h.indexOf('var MITTAGSTISCH = {');
var e = h.indexOf('window.MITTAGSTISCH = MITTAGSTISCH;');
t('MITTAGSTISCH wurde gefunden', a > 0 && e > a, a + '/' + e);
var M = new Function('Intl', 'Date', h.slice(a, e) + '; return MITTAGSTISCH;')(Intl, Date);

// ---- 1. Die Datenbank ------------------------------------------------
console.log('\n-- Die Spalte --');
var sqlPfad = path.join(KMI, 'datenbank', '29-mittagstisch-taeglich.sql');
t('es gibt die SQL-Datei', fs.existsSync(sqlPfad), 'fehlt');
var sql = fs.existsSync(sqlPfad) ? fs.readFileSync(sqlPfad, 'utf8') : '';
t('sie legt sorte an daily_specials an',
  /alter\s+table\s+public\.daily_specials/i.test(sql) && /sorte/i.test(sql), 'falsche Tabelle');
t('zweimal ausfuehrbar', /add column if not exists/i.test(sql), 'kracht beim zweiten Mal');
t('sie legt KEINE neue Tabelle an -- daily_specials kann das schon',
  !/create\s+table/i.test(sql), 'doppelt gebaut');

// ---- 2. Das deutsche Datum -------------------------------------------
console.log('\n-- Welcher Tag ist heute --');
// 31.12. um 23:30 UTC ist in Deutschland schon der 1.1. des Folgejahres.
t('rechnet in deutscher Zeit, nicht in UTC',
  M.heute(new Date('2026-12-31T23:30:00Z')) === '2027-01-01',
  M.heute(new Date('2026-12-31T23:30:00Z')));
// Im Sommer ist Deutschland UTC+2.
t('auch im Sommer richtig',
  M.heute(new Date('2026-07-14T22:30:00Z')) === '2026-07-15',
  M.heute(new Date('2026-07-14T22:30:00Z')));
t('mittags am Tag selbst',
  M.heute(new Date('2026-09-07T10:00:00Z')) === '2026-09-07', M.heute(new Date('2026-09-07T10:00:00Z')));

// ---- 3. Das Zeitfenster ----------------------------------------------
console.log('\n-- Das Zeitfenster --');
t('wird der Beschreibung vorangestellt', M.fenster('11:00', '14:00') === '[11:00-14:00] ', M.fenster('11:00','14:00'));
t('ohne Zeiten kommt nichts', M.fenster('', '') === '' && M.fenster(null, null) === '', 'Praefix trotzdem da');
t('eine halbe Angabe ergibt nichts', M.fenster('11:00', '') === '' && M.fenster('', '14:00') === '', 'halbes Fenster');
t('Unsinn wird nicht durchgereicht', M.fenster('elf', 'zwei') === '', 'kaputtes Fenster im Text');
// angebotLaeuftNoch liest genau diese Schreibweise -- sonst waere es ein
// zweiter Weg, der spaeter auseinanderlaeuft.
t('die Schreibweise passt zu angebotLaeuftNoch',
  /\^\\\[\(\\d\{2\}\):\(\\d\{2\}\)-\(\\d\{2\}\):\(\\d\{2\}\)\\\]/.test(h), 'andere Schreibweise');

// ---- 4. Zeilen lesen --------------------------------------------------
console.log('\n-- Aus dem Formular --');
var gelesen = M.lesen([
    { name: '  Grünkohl  ', beschreibung: ' mit Pinkel ', preis: '9,90' },
    { name: '', beschreibung: '', preis: '' },
    { name: 'Suppe', beschreibung: '', preis: '4.50' }
]);
t('leere Zeilen fallen weg -- die sind der Normalfall', gelesen.length === 2, gelesen.length);
t('Namen werden getrimmt', gelesen[0].name === 'Grünkohl', gelesen[0].name);
t('ein Punkt-Preis wird zur Zahl', gelesen[1].preis === 4.5, String(gelesen[1].preis));
t('ein Komma-Preis wird NICHT still zu etwas Falschem',
  gelesen[0].preis === null, String(gelesen[0].preis));
t('ohne Eingabe ist der Preis null, nicht 0 -- 0 waere "geschenkt"',
  M.lesen([{ name: 'X', preis: '' }])[0].preis === null, String(M.lesen([{name:'X',preis:''}])[0].preis));

// ---- 5. Die Pruefung --------------------------------------------------
console.log('\n-- Was schiefgehen kann --');
var gut = M.pruefen(M.lesen([
    { name: 'Vorspeise', preis: '3.50' }, { name: 'Hauptgericht', preis: '9.90' }, { name: 'Dessert', preis: '3.00' }
]), '11:00', '14:00');
t('drei saubere Gerichte sind gueltig', gut.gueltig === true, JSON.stringify(gut));
t('leer ist nicht gueltig', M.pruefen([], '', '').leer === true, 'leer nicht erkannt');
var ohne = M.pruefen(M.lesen([{ name: 'Suppe', preis: '' }, { name: 'Braten', preis: '12' }]), '', '');
t('ein Gericht ohne Preis wird gefunden', ohne.ohnePreis.length === 1 && ohne.ohnePreis[0] === 'Suppe', JSON.stringify(ohne.ohnePreis));
t('und macht das Ganze ungueltig', ohne.gueltig === false, 'ginge durch');
t('ein negativer Preis wird gefunden',
  M.pruefen(M.lesen([{ name: 'X', preis: '-3' }]), '', '').negativ.length === 1, 'nicht gefunden');
t('ein Tippfehler-Preis wird gemeldet, aber nicht blockiert',
  M.pruefen(M.lesen([{ name: 'X', preis: '0.99' }]), '', '').verdaechtig.length === 1
  && M.pruefen(M.lesen([{ name: 'X', preis: '0.99' }]), '', '').gueltig === true, 'blockiert oder stumm');
t('zwei gleiche Namen fallen auf',
  M.pruefen(M.lesen([{ name: 'Suppe', preis: '3' }, { name: 'suppe', preis: '4' }]), '', '').doppelt.length === 1, 'nicht gefunden');
t('eine halbe Zeitangabe blockiert',
  M.pruefen(M.lesen([{ name: 'X', preis: '3' }]), '11:00', '').halbesFenster === true, 'geht durch');
t('und macht ungueltig',
  M.pruefen(M.lesen([{ name: 'X', preis: '3' }]), '11:00', '').gueltig === false, 'geht durch');
var zuviel = [];
for (var i = 0; i < M.MAX + 2; i++) zuviel.push({ name: 'G' + i, preis: '5' });
t('mehr als das Limit wird gemeldet', M.pruefen(M.lesen(zuviel), '', '').zuViele === 2, String(M.pruefen(M.lesen(zuviel),'','').zuViele));
t('und blockiert -- sonst verschwinden sie lautlos',
  M.pruefen(M.lesen(zuviel), '', '').gueltig === false, 'wuerde still abschneiden');

// ---- 6. Die Zeile fuer die Datenbank ---------------------------------
console.log('\n-- Was in die Datenbank geht --');
var stempel = 1757000000000;
var z0 = M.zeile({ name: 'Suppe', beschreibung: 'mit Brot', preis: 4.5 }, 0, 'rid', '2026-09-07', '[11:00-14:00] ', stempel);
var z1 = M.zeile({ name: 'Braten', beschreibung: '', preis: 9.9 }, 1, 'rid', '2026-09-07', '[11:00-14:00] ', stempel);
t('jede Zeile bekommt eine EIGENE id -- sonst wird nur eine gespeichert',
  z0.id !== z1.id, z0.id + '/' + z1.id);
t('die Reihenfolge bleibt erhalten (Vorspeise vor Dessert)', z1.id > z0.id, z0.id + '/' + z1.id);
t('das Zeitfenster steht vor der Beschreibung',
  z0.description === '[11:00-14:00] mit Brot', z0.description);
t('auch ohne eigene Beschreibung', z1.description === '[11:00-14:00] ', JSON.stringify(z1.description));
t('die Sorte ist gesetzt -- daran wird spaeter nur das Eigene ersetzt',
  z0.sorte === 'mittagstisch', String(z0.sorte));
t('das Datum kommt mit', z0.date === '2026-09-07', z0.date);
t('is_active ist an', z0.is_active === true, String(z0.is_active));
t('old_price bleibt leer -- ein Mittagstisch ist kein Rabatt',
  z0.old_price === null, String(z0.old_price));

// ---- 7. Speichern -----------------------------------------------------
console.log('\n-- Veroeffentlichen --');
var sp = schneide('mittagstischSpeichern');
t('mittagstischSpeichern wurde gefunden', sp.length > 800, sp.length + ' Zeichen');
t('es loescht NUR die eigene Sorte',
  /sorte=eq\.mittagstisch/.test(sp), 'wuerde auch das Tagesangebot loeschen');
t('fehlt die Spalte, wird ABGEBROCHEN statt blind zu loeschen',
  /\/sorte\/i\.test\(dt\)/.test(sp) && /darum wird hier abgebrochen/.test(sp), 'loescht das Tagesangebot mit');
t('klemmt das Loeschen, wird nichts geschrieben',
  /Nichts geändert/.test(sp), 'schreibt trotzdem');
t('es verlangt die Zeilen zurueck (201 ohne Rumpf ist kein Beweis)',
  /'Prefer': 'return=representation'/.test(sp), '201 gilt als Erfolg');
t('und prueft, dass ALLE angekommen sind',
  /zurueck\.length !== nutz\.length/.test(sp), 'zwei von fuenf reichen');
t('sonst sagt es, wie viele fehlen',
  /von ' \+ nutz\.length \+ ' Gerichten sind angekommen/.test(sp), 'still');
t('alle Zeilen bekommen denselben Zeitstempel als Basis',
  /var stempel = Date\.now\(\);/.test(sp) && /MITTAGSTISCH\.zeile\(z, i, restId, datum, praefix, stempel\)/.test(sp),
  'ids koennten kollidieren');
t('Leeren wird nachgefragt -- es loescht den ganzen Tag',
  /confirm\(/.test(sp) && /geleert werden/.test(sp), 'loescht ohne Rueckfrage');
t('rote Hinweise blockieren das Speichern',
  /Bitte zuerst die roten Hinweise beheben/.test(sp), 'speichert trotzdem');
t('der Knopf wird waehrenddessen gesperrt und danach wieder frei',
  /knopf\.disabled = true/.test(sp) && /finally/.test(sp), 'doppeltes Absenden moeglich');

// ---- 8. Von gestern uebernehmen --------------------------------------
console.log('\n-- Von gestern uebernehmen --');
var ue = schneide('mittagstischUebernehmen');
t('mittagstischUebernehmen wurde gefunden', ue.length > 400, ue.length + ' Zeichen');
t('es holt den Vortag', /setDate\(vortag\.getDate\(\) - 1\)/.test(ue), 'holt den falschen Tag');
t('das Zeitfenster wird aus der Beschreibung entfernt',
  /replace\(\/\^\\\[\\d\{2\}:\\d\{2\}-\\d\{2\}:\\d\{2\}\\\]\\s\*\/, ''\)/.test(ue),
  'stuende beim Speichern doppelt drin');
t('und stattdessen in die Zeitfelder gesetzt',
  /vf\.value = m\[1\]/.test(ue) && /bf\.value = m\[2\]/.test(ue), 'Zeit geht verloren');
t('gibt es nichts, wird das gesagt statt still nichts zu tun',
  /ist nichts eingetragen/.test(ue), 'still');
t('mehr als das Limit wird nicht uebernommen',
  /slice\(0, MITTAGSTISCH\.MAX\)/.test(ue), 'zu viele Zeilen');

// ---- 9. Was der Gast sieht -------------------------------------------
console.log('\n-- Beim Gast --');
t('die Gastabfrage rechnet mit deutschem Datum',
  /MITTAGSTISCH\.heute\(\) : todayStrLocal\(\)/.test(h), 'Geraetezeit');
t('das Limit kommt aus derselben Zahl wie die Warnung im Formular',
  /limit=' \+ _maxSpecials/.test(h), 'zwei Zahlen, die auseinanderlaufen');
t('die Reihenfolge des Wirts bleibt (Vorspeise zuerst, nicht Dessert)',
  /order=id\.asc&limit=/.test(h), 'umgekehrte Reihenfolge');

// ---- 10. Der Knopf ----------------------------------------------------
console.log('\n-- Wo er ihn sucht --');
t('der Knopf steht bei den Angeboten', /onclick="mittagstischOeffnen\(\)"/.test(h), 'kein Knopf');
t('er steht VOR dem Tagesangebot-Kasten',
  h.indexOf('mittagstischOeffnen()') < h.indexOf('Neues Tagesangebot erstellen'), 'steht darunter');
t('der Unterschied wird erklaert',
  /Ein Tagesangebot daneben ist <strong>ein<\/strong> Gericht/.test(h), 'keine Abgrenzung');
var oe = schneide('mittagstischOeffnen');
t('das Fenster startet mit fuenf Zeilen -- nicht leer',
  /for \(var i = 0; i < 5; i\+\+\) mittagstischZeile\(\);/.test(oe), 'leeres Formular');
t('das Datum ist auf heute vorbelegt', /MITTAGSTISCH\.heute\(\)/.test(oe), 'kein Datum');
var zl = schneide('mittagstischZeile');
t('mehr als das Limit laesst sich gar nicht erst eintragen',
  />= MITTAGSTISCH\.MAX/.test(zl), 'unbegrenzt');

// ---- 11. Auslieferung -------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 28', !!m && Number(m[1]) >= 28, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
