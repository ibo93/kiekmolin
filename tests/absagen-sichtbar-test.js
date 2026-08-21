// EINE ABSAGE WAR FUER DEN WIRT UNSICHTBAR.
//
// Gemeldet vom Betreiber am 21.08.2026:
//   "und wenn die absagen sehen ich keine absagen... die resevierungen
//    es muss ja irgenwo stehen..."
//
// Er hatte recht. Verloren war nichts -- eine abgesagte Reservierung
// bleibt mit status = 'cancelled' in der Datenbank stehen. Aber jede
// Liste im Dashboard warf sie still weg:
//
//     var active = data.filter(function(r) { return r.status !== 'cancelled'; });
//
// Der Wirt sah also weder, DASS jemand abgesagt hat, noch WER. Fuer
// den Abend heisst das: er weiss nicht, ob der Tisch wirklich frei
// ist. Und bei einer Nachfrage ("ich hatte doch abgesagt") steht
// Aussage gegen Aussage.
//
// WARUM DIE ABSAGEN TROTZDEM NICHT IN DIE AKTIVE LISTE GEHOEREN
// Sie wuerden die Zahl oben verfaelschen ("12 Reservierungen ab
// heute") und im Tischplan einen Tisch belegen, der frei ist. Deshalb
// ein eigener Block, zugeklappt.

var fs = require('fs');
var path = require('path');
var h = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Absagen werden eingesammelt, nicht weggeworfen --');
t('es gibt eine Liste der Abgesagten',
  /var abgesagt = data\.filter\(function\(r\) \{ return r\.status === 'cancelled'; \}\);/.test(h),
  'werden weiterhin verworfen');
t('und sie steht direkt neben der aktiven Liste',
  /var active = data\.filter[\s\S]{0,900}?var abgesagt = data\.filter/.test(h),
  'an anderer Stelle -- laeuft beim naechsten Umbau auseinander');

console.log('\n-- 2. Aber NICHT in der aktiven Liste --');
// Sonst stimmt die Zahl oben nicht und der Tischplan belegt freie Tische.
t('die aktive Liste bleibt ohne Absagen',
  /var active = data\.filter\(function\(r\) \{ return r\.status !== 'cancelled'; \}\);/.test(h),
  'Absagen zaehlen mit');
t('die Zahl oben zaehlt die aktiven',
  /active\.length \+ ' Reservierung'/.test(h), 'zaehlt falsch');
// resAllReservations speist Kalender und Tischplan -- dort haengt
// active dran, nicht data.
t('Kalender und Tischplan bekommen nur die aktiven',
  /active\.forEach\(function \(r\) \{[\s\S]{0,300}?resAllReservations\.push/.test(h)
  || /active\.forEach\(function\(r\) \{[\s\S]{0,300}?resAllReservations\.push/.test(h),
  'Absagen belegen Tische');

console.log('\n-- 3. Der Block ist da und zugeklappt --');
// Zugeklappt, weil der Wirt im Betrieb die offenen Anfragen sehen will.
t('eigener Block fuer die Absagen',
  /if \(abgesagt\.length\) \{/.test(h), 'kein Block');
t('zugeklappt (details/summary)',
  /html \+= '<details style="margin:8px 12px 24px;">'/.test(h), 'immer offen');
t('mit Anzahl in der Ueberschrift',
  /abgesagt\.length \+ ' Absage' \+ \(abgesagt\.length > 1 \? 'n' : ''\) \+ ' ab heute'/.test(h),
  'ohne Anzahl');
t('und er kommt NACH der aktiven Liste',
  h.indexOf("abgesagt.length + ' Absage'") > h.indexOf("active.length + ' Reservierung'"),
  'steht ueber den offenen Anfragen');

console.log('\n-- 4. Was drinsteht, reicht zum Nachvollziehen --');
// Name, wann, wie viele, Telefon -- alles, was man braucht, um
// zurueckzurufen oder eine Nachfrage zu klaeren.
t('Name des Gastes', /escapeHtml\(r\.guest_name \|\| 'Gast'\)[\s\S]{0,400}?Abgesagt/.test(h), 'ohne Namen');
t('Datum, Uhrzeit und Personenzahl',
  /\+ aDatum \+ ' &middot; ' \+ aZeit \+ ' Uhr &middot; ' \+ \(r\.party_size \|\| 2\) \+ ' Personen<\/div>';/.test(h),
  'unvollstaendig');
t('Telefonnummer zum Anrufen', /if \(r\.guest_phone\) \{[\s\S]{0,300}?tel:/.test(h), 'keine Nummer');
t('und die Notiz des Gastes', /if \(r\.notes\) \{[\s\S]{0,300}?escapeHtml\(r\.notes\)/.test(h), 'Notiz faellt weg');

console.log('\n-- 5. Nichts davon wird ungeprueft in die Seite geschrieben --');
// Gastnamen und Notizen kommen von aussen. Ohne escapeHtml waere das
// eine Einladung, ueber ein Reservierungsformular Code einzuschleusen.
var block = h.slice(h.indexOf('if (abgesagt.length) {'), h.indexOf("html += '</div></details>';"));
['guest_name', 'guest_phone', 'notes'].forEach(function (feld) {
    var roh = new RegExp("\\+ r\\." + feld + " \\+|\\+ r\\." + feld + ";");
    t(feld + ' wird entschaerft', roh.test(block) === false && block.indexOf('escapeHtml(r.' + feld) > -1,
      'roh eingesetzt');
});

console.log('\n-- 6. Der Grund steht im Quelltext --');
t('warum sie nicht in die aktive Liste gehoeren',
  h.indexOf('Tisch belegen, der frei ist') > -1, 'keine Begruendung');
t('und was der Betreiber gemeldet hat',
  h.indexOf('es muss ja irgendwo stehen') > -1, 'kein Anlass festgehalten');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
