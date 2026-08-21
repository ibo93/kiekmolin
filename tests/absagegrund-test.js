// WARUM HAT DER GAST ABGESAGT?
//
// Gefragt vom Betreiber am 21.08.2026, direkt nachdem die Absagen
// ueberhaupt sichtbar wurden:
//   "und warum haben die abgesagt...das ist auch wichtig das muessen
//    wir auch bei den gaeste einfuegen..."
//   "in der mail kann er absagen..."
//
// Er hat recht, und zwar geschaeftlich: fuenf Absagen wegen Krankheit
// sind ein Zufall. Fuenf mit "beim letzten Mal nicht zufrieden" sind
// ein Problem, das er sonst nie erfaehrt -- niemand ruft an, um sich zu
// beschweren, die Leute kommen einfach nicht wieder.
//
// ZWEI WEGE, EINE STELLE
// Der Gast kann in der App absagen oder ueber den Link in der
// Erinnerungs-Mail. Beide laufen durch res-cancel.js -- deshalb muss
// der Grund dort ankommen, nicht an zwei Stellen gepflegt werden.
//
// DIE WICHTIGSTE REGEL DABEI
// Die Frage nach dem Grund darf NIE zwischen Gast und Absage stehen.
// Eine Absage, die nicht ankommt, ist teurer als eine ohne Grund: dann
// steht der Tisch am Samstagabend leer und niemand weiss es.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');
var f = fs.readFileSync(KMI + '/netlify/functions/res-cancel.js', 'utf8');
var sql = fs.readFileSync(KMI + '/datenbank/12-absagegrund.sql', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die Absage geht immer vor --');
t('in der App ist "ohne Grund absagen" moeglich',
  /Ohne Grund absagen/.test(h), 'Grund erzwungen');
t('und Abbrechen ist etwas anderes als "ohne Grund"',
  /if \(grund === null\) return;/.test(h), 'kein Unterschied');
t('der Grund haengt nur an der Adresse, blockiert nichts',
  /\(grund \? '&grund=' \+ encodeURIComponent\(grund\) : ''\)/.test(h), 'blockiert');
// Ueber die Mail wird ZUERST storniert und DANN gefragt.
t('per Mail wird erst storniert, dann gefragt',
  f.indexOf("body: grundText") < f.indexOf('grundText ? \'\' : grundFrage(id)'), 'fragt vorher');
t('und das steht auch als Begruendung im Quelltext',
  /Der Grund wird aber ERST NACH der Absage erfragt/.test(f), 'keine Begruendung');
t('auf der Seite steht, dass man nicht muss',
  /Musst du nicht – die Absage ist schon durch/.test(f), 'wirkt wie Pflicht');

console.log('\n-- 2. Beide Wege kennen dieselben Gruende --');
var appGruende = (h.match(/\['(krank|plan|zeit|zuviele|woanders|unzufrieden)',/g) || [])
    .map(function (x) { return x.replace(/\['|',/g, ''); });
var srvGruende = Object.keys({ krank: 1, plan: 1, zeit: 1, zuviele: 1, woanders: 1, unzufrieden: 1 })
    .filter(function (k) { return new RegExp('^\\s*' + k + ':', 'm').test(f); });
t('die App kennt sechs Gruende', appGruende.length === 6, appGruende.length);
t('der Server auch', srvGruende.length === 6, srvGruende.length);
t('und es sind dieselben Schluessel',
  appGruende.slice().sort().join(',') === srvGruende.slice().sort().join(','),
  appGruende + ' vs ' + srvGruende);
t('der Quelltext warnt davor, sie auseinanderlaufen zu lassen',
  /Wer hier\s*\n\/\/ einen hinzufuegt, muss ihn dort auch eintragen/.test(h)
  || h.indexOf('muss ihn dort auch eintragen') > -1, 'keine Warnung');

console.log('\n-- 3. Nur bekannte Gruende kommen durch --');
// Die Absageseite ist ueber einen Link erreichbar. Freitext von dort
// landet sonst als Werbung im Dashboard des Wirts.
t('der Server nimmt nur bekannte Schluessel',
  /Object\.prototype\.hasOwnProperty\.call\(GRUENDE, grundSchluessel\)/.test(f), 'nimmt alles');
t('unbekannte werden zu leer, nicht durchgereicht',
  /\? GRUENDE\[grundSchluessel\] : '';/.test(f), 'reicht durch');
t('gespeichert wird der Text aus der Liste, nicht die Eingabe',
  /cancel_reason: grundText/.test(f) && /cancel_reason: grundSchluessel/.test(f) === false,
  'speichert die Eingabe');

console.log('\n-- 4. Nachreichen geht --');
// Wer per Mail absagt, hat schon storniert -- der Grund kommt dann mit
// einem zweiten Klick.
t('ein Grund laesst sich nach der Absage nachtragen',
  /if \(r\.status === 'cancelled'\) \{[\s\S]{0,700}?if \(grundText\) \{/.test(f), 'geht verloren');
t('und der Gast bekommt eine Rueckmeldung',
  /page\('Danke!'/.test(f), 'wortlos');

console.log('\n-- 5. Der Wirt sieht ihn --');
t('im Absagen-Block steht der Grund',
  /if \(r\.cancel_reason\) \{[\s\S]{0,400}?escapeHtml\(r\.cancel_reason\)/.test(h), 'wird nicht angezeigt');
t('und zwar hervorgehoben, nicht als Kleingedrucktes',
  /background:rgba\(186,26,26,0\.08\);color:#8c1414;font-weight:600/.test(h), 'geht unter');
// Zuerst der Grund, dann die Notiz von der Buchung -- der Grund ist
// das Neuere und das Wichtigere.
var absagenBlock = h.slice(h.indexOf('if (abgesagt.length) {'), h.indexOf("html += '</div></details>';"));
t('er steht ueber der Notiz des Gastes',
  absagenBlock.indexOf('r.cancel_reason') > -1
  && absagenBlock.indexOf('r.notes') > -1
  && absagenBlock.indexOf('r.cancel_reason') < absagenBlock.indexOf('r.notes'),
  'unter der Notiz oder gar nicht im Block');
// Auch in der Push-Benachrichtigung -- da schaut der Wirt zuerst hin.
t('und steht in der Push-Nachricht',
  /\(grundText \? ' Grund: ' \+ grundText : ''\)/.test(f), 'fehlt im Push');

console.log('\n-- 6. Die Spalte --');
t('wird angelegt, ohne etwas zu ueberschreiben',
  /add column if not exists cancel_reason text/.test(sql), 'kein if not exists');
t('keine Regel wird dabei angefasst',
  /create policy|drop policy|enable row level security/.test(sql) === false, 'fasst Regeln an');
t('mit Ruecknahme in der Datei',
  /drop column if exists cancel_reason/.test(sql), 'keine Ruecknahme');
t('und Gegenprobe',
  /information_schema\.columns/.test(sql), 'keine Gegenprobe');
t('bestehende Absagen bleiben ohne Grund -- steht auch da',
  /Bestehende Absagen bleiben ohne\s*\n-- Grund/.test(sql) || sql.indexOf('Bestehende Absagen bleiben ohne') > -1,
  'weckt falsche Erwartung');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
