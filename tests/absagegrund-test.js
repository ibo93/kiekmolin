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
t('in der App sagt der Knopf unten immer ab',
  /overlay\.querySelector\('#kmiGrundOhne'\)\.onclick/.test(h)
  && /fertig\(txt \? 'sonstiges' : '', txt\);/.test(h), 'Grund erzwungen');
t('und Abbrechen ist etwas anderes als "ohne Angabe"',
  /if \(wahl === null\) return;/.test(h), 'kein Unterschied');
t('der Grund haengt nur an der Adresse, blockiert nichts',
  /\(wahl\.grund \? '&grund=' \+ encodeURIComponent\(wahl\.grund\) : ''\)/.test(h), 'blockiert');
// Ueber die Mail wird ZUERST storniert und DANN gefragt.
t('per Mail wird erst storniert, dann gefragt',
  f.indexOf("body: grundText") < f.indexOf('grundText ? \'\' : grundFrage(id)'), 'fragt vorher');
t('und das steht auch als Begruendung im Quelltext',
  /Der Grund wird aber ERST NACH der Absage erfragt/.test(f), 'keine Begruendung');
t('auf der Seite steht, dass man nicht muss',
  /Musst du nicht – die Absage ist schon durch/.test(f), 'wirkt wie Pflicht');

console.log('\n-- 2. Beide Wege kennen dieselben Gruende --');
var appGruende = (h.match(/\['(krank|plan|zeit|zuviele|woanders)',/g) || [])
    .map(function (x) { return x.replace(/\['|',/g, ''); });
var srvGruende = ['krank', 'plan', 'zeit', 'zuviele', 'woanders']
    .filter(function (k) { return new RegExp('^\\s*' + k + ':', 'm').test(f); });
t('die App kennt fuenf Knopf-Gruende', appGruende.length === 5, appGruende.length);
t('der Server auch', srvGruende.length === 5, srvGruende.length);
t('und es sind dieselben Schluessel',
  appGruende.slice().sort().join(',') === srvGruende.slice().sort().join(','),
  appGruende + ' vs ' + srvGruende);
// AUF WUNSCH DES BETREIBERS WIEDER RAUS.
// "beim letzent mali nicht zu frieden raus". Sein Argument: einem Gast
// so einen Satz zum Antippen hinzulegen macht aus einer Absage eine
// Beschwerde, die vorher keine war. Wer wirklich unzufrieden war,
// schreibt es -- dafuer ist das Freitextfeld da.
// Ohne Kommentare pruefen: in beiden Dateien steht der Satz
// absichtlich noch als Begruendung, warum er weg ist.
function ohneKommentar(txt) {
    return txt.split('\n').filter(function (z) { return /^\s*\/\//.test(z) === false; }).join('\n');
}
t('"Beim letzten Mal nicht zufrieden" ist kein Knopf mehr',
  ohneKommentar(h).indexOf('Beim letzten Mal nicht zufrieden') === -1
  && ohneKommentar(f).indexOf('Beim letzten Mal nicht zufrieden') === -1,
  'noch als Knopf drin');
t('aber der Grund dafuer steht im Quelltext',
  h.indexOf('macht aus einer Absage eine Beschwerde') > -1, 'kommentarlos entfernt');
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

console.log('\n-- 3b. Der Freitext --');
// Ich hatte davon abgeraten: diese Seite ist ueber einen Link
// erreichbar. Der Betreiber will es trotzdem -- "schreib oder sonstiges
// die sollen es ausfuellen" -- und hat gute Gruende: fuenf feste
// Knoepfe treffen den wirklichen Grund oft nicht. Also entschaerft
// statt weggelassen.
t('es gibt ein Feld zum Schreiben -- in der App',
  /id="kmiGrundFrei" type="text" maxlength="200"/.test(h), 'kein Feld');
t('und auf der Seite nach der Mail-Absage',
  /name="frei" maxlength="200"/.test(f), 'kein Feld');
t('die Mail-Seite nutzt ein echtes Formular, kein JavaScript',
  /<form method="get" action="\/\.netlify\/functions\/res-cancel"/.test(f), 'braucht JavaScript');
t('das Feld hat eine Beschriftung fuer Screenreader',
  /<label for="freiGrund"/.test(f) && /for="kmiGrundFrei"/.test(h), 'unbeschriftet');
t('der Server saeubert den Text',
  /function freitextSaeubern\(roh\)/.test(f), 'ungeprueft');
t('spitze Klammern und & fliegen raus',
  /replace\(\/\[<>&\]\/g, ''\)/.test(f), 'HTML kommt durch');
t('Zeilenumbrueche werden zu Leerzeichen',
  /replace\(\/\[\\r\\n\\t\]\+\/g, ' '\)/.test(f), 'mehrzeilig');
t('und bei 200 Zeichen ist Schluss',
  /\.slice\(0, 200\)/.test(f), 'unbegrenzt');
t('bei "Sonstiges" zaehlt das Geschriebene, nicht das Wort',
  /if \(grundSchluessel === 'sonstiges'\) grundText = frei;/.test(f), 'speichert "Sonstiges"');
t('ohne Geschriebenes gilt die Absage als ohne Grund',
  /Hat er nichts\s*\n\/\/ geschrieben, gilt die Absage als ohne Grund/.test(f)
  || f.indexOf('gilt die Absage als ohne Grund') > -1, 'speichert Leeres');

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
