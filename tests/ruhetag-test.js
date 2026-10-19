// RUHETAG AUF DER OEFFENTLICHEN RESTAURANTSEITE.
//
// GEMELDET WURDE
// --------------
// "wenn ich ruhe tage eingetragen haben kommt beim öffnungzeiten geöffnet
//  eine uhrzeit". Auf kiekmolin.de/pizzeria-alporto-oldersum stand
// "Mo: 11:00–22:00", während Al Porto montags geschlossen hat -- Google
// zeigt für denselben Betrieb "Geschlossen - Öffnet Di um 16:00".
//
// DIE URSACHE: ZWEI QUELLEN, EINE GELESEN
// ---------------------------------------
// Der Ruhetag wird im Dashboard über ein eigenes Auswahlfeld gesetzt und
// landet in einer eigenen Spalte (restaurant.rest_day, 0=Mo .. 6=So). Die
// Uhrzeiten stehen davon getrennt in opening_hours -- und werden beim Setzen
// des Ruhetags NICHT geleert.
//
// Die Anzeige IN der App liest beides und zeigt richtig "Ruhetag". Der
// Reservierungskalender ebenfalls (der wurde schon einmal genau deshalb
// repariert). Nur die öffentliche Seite -- die, die bei Google gefunden wird
// und die der Gast zuerst sieht -- las ausschliesslich opening_hours.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Den ECHTEN Erzeuger aus der Datei nehmen statt ihn nachzubauen --
// nachgebaut würde der Test auch dann grün bleiben, wenn die Seite kaputt
// ist. Seit 19.10.2026 ist das lpZeitenHtml (eine Zeile pro Tag statt
// zusammengefasster Gruppen). zeige() macht daraus wieder "Mo: …"-Zeilen,
// damit die Prüfungen unten lesbar bleiben.
function fnAus(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return null; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }
var quelle = fnAus('lpZeitenHtml');
if (!quelle) { console.log('FAIL | Öffnungszeiten-Erzeuger nicht gefunden'); process.exit(1); }
var lpZeitenHtml = new Function(quelle + '; return lpZeitenHtml;')();
var KURZ = { Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do', Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So' };

function zeige(oh, restDay) {
    var h = lpZeitenHtml({ opening_hours: oh, rest_day: restDay }, new Date(2026, 9, 21), false, '', '');
    var zeilen = [], re = /<span>([A-Za-z]+)(?: <b>[^<]*<\/b>)?<\/span><span>(.*?)<\/span><\/div>/g, m;
    while ((m = re.exec(h))) zeilen.push(KURZ[m[1]] + ': ' + m[2].replace('<br>', ' & '));
    return zeilen.length ? zeilen.join('\n') : (/Keine Angabe/.test(h) ? 'Keine Angabe' : h);
}

// So sieht Al Porto in der Datenbank aus: Zeiten für ALLE sieben Tage
// gepflegt, Montag als Ruhetag im eigenen Feld.
var ALPORTO = {
    mo_start: '11:00', mo_end: '22:00',
    di_start: '16:00', di_end: '22:00',
    mi_start: '16:00', mi_end: '22:00',
    do_start: '16:00', do_end: '22:00',
    fr_start: '16:00', fr_end: '23:00',
    sa_start: '16:00', sa_end: '23:00',
    so_start: '16:00', so_end: '22:00'
};

// ---- DER GEMELDETE FEHLER ---------------------------------------------------
var mitRuhe = zeige(ALPORTO, 0);
t('am Ruhetag steht "Ruhetag", nicht die eingetragene Uhrzeit',
  /Mo: Ruhetag/.test(mitRuhe), mitRuhe);
t('die alte Zeile "Mo: 11:00–22:00" ist weg',
  !/Mo: 11:00/.test(mitRuhe), mitRuhe);
t('die anderen Tage bleiben unveraendert',
  /Di: 16:00–22:00/.test(mitRuhe) && /Do: 16:00–22:00/.test(mitRuhe) && /Sa: 16:00–23:00/.test(mitRuhe) && /So: 16:00–22:00/.test(mitRuhe),
  mitRuhe);

// ---- Ohne Ruhetag darf sich nichts ändern ----------------------------------
var ohneRuhe = zeige(ALPORTO, null);
t('ohne Ruhetag steht der Montag ganz normal da',
  /Mo: 11:00–22:00/.test(ohneRuhe), ohneRuhe);
t('"kein Ruhetag" wird nicht als Sonntag missverstanden',
  !/Ruhetag/.test(ohneRuhe), ohneRuhe);
t('auch undefined ist kein Ruhetag', !/Ruhetag/.test(zeige(ALPORTO, undefined)));

// 0 ist Montag -- und 0 ist gleichzeitig der Wert, den ein schlampiger
// Falsy-Test als "nicht gesetzt" liest. Genau daran scheitern solche Felder.
t('Ruhetag 0 (Montag) wird als gesetzt erkannt, nicht als leer',
  /Mo: Ruhetag/.test(zeige(ALPORTO, 0)));
t('Ruhetag 6 ist der Sonntag',
  /So: Ruhetag/.test(zeige(ALPORTO, 6)) && !/Mo: Ruhetag/.test(zeige(ALPORTO, 6)),
  zeige(ALPORTO, 6));
t('Ruhetag 2 ist der Mittwoch', /Mi: Ruhetag/.test(zeige(ALPORTO, 2)), zeige(ALPORTO, 2));
t('der Ruhetag kommt auch als Text aus der Datenbank durch',
  /Mo: Ruhetag/.test(zeige(ALPORTO, '0')), zeige(ALPORTO, '0'));

// ---- Ein Tag ohne Zeiten gilt weiterhin als Ruhetag -------------------------
var ohneMontag = Object.assign({}, ALPORTO);
delete ohneMontag.mo_start; delete ohneMontag.mo_end;
t('fehlende Zeiten zaehlen weiter als Ruhetag (der alte Weg bleibt)',
  /Mo: Ruhetag/.test(zeige(ohneMontag, null)), zeige(ohneMontag, null));

// ---- Zwei Ruhetage hintereinander --------------------
var moDiZu = Object.assign({}, ALPORTO);
delete moDiZu.di_start; delete moDiZu.di_end;
t('Montag (Feld) und Dienstag (ohne Zeiten) sind beide Ruhetag',
  /Mo: Ruhetag/.test(zeige(moDiZu, 0)) && /Di: Ruhetag/.test(zeige(moDiZu, 0)), zeige(moDiZu, 0));

// ---- Sekunden aus der Datenbank abschneiden ---------------------------------
// Postgres liefert time-Spalten als "16:00:00". Ungekürzt stünde
// "16:00:00–22:00:00" auf der Seite.
t('Sekunden werden abgeschnitten',
  /Mo: 11:00–22:00/.test(zeige({ mo_start: '11:00:00', mo_end: '22:00:00' }, null)),
  zeige({ mo_start: '11:00:00', mo_end: '22:00:00' }, null));

// ---- Zweite Schicht bleibt erhalten -----------------------------------------
t('Mittagspause wird weiter angezeigt',
  /Mo: 11:00–14:00 & 17:00–22:00/.test(
      zeige({ mo_start: '11:00', mo_end: '14:00', mo_start2: '17:00', mo_end2: '22:00' }, null)),
  zeige({ mo_start: '11:00', mo_end: '14:00', mo_start2: '17:00', mo_end2: '22:00' }, null));
// Hier hat nur der Montag Zeiten; alle anderen Tage sind mangels Zeiten
// ohnehin Ruhetag. Ist auch der Montag zu, gibt es GAR keine Zeiten mehr --
// dann steht "Keine Angabe" (kein Tag hat offen).
var nurMontag = zeige({ mo_start: '11:00', mo_end: '14:00', mo_start2: '17:00', mo_end2: '22:00' }, 0);
t('am Ruhetag wird auch keine zweite Schicht gezeigt',
  !/17:00/.test(nurMontag), nurMontag);

// ---- Nichts kippt ------------------------------------------------------------
t('ohne Oeffnungszeiten kommt "Keine Angabe"',
  /Keine Angabe/.test(zeige(null, 0)), zeige(null, 0));
t('Oeffnungszeiten als JSON-Text werden gelesen',
  /Mo: Ruhetag/.test(zeige(JSON.stringify(ALPORTO), 0)), zeige(JSON.stringify(ALPORTO), 0));

// ---- Die anderen beiden Anzeigen lesen den Ruhetag weiterhin ----------------
// Damit niemand denkt, das Feld wäre nur an einer Stelle wichtig.
t('die Anzeige in der App liest rest_day',
  /if \(restDay !== null && restDay !== undefined && restDayKeys\[restDay\] === d\.key\)/.test(H));
t('der Reservierungskalender liest ihn ebenfalls',
  /if \(_resRest\.rest_day !== null && _resRest\.rest_day !== undefined\)/.test(H));
t('der Grund steht im Quelltext, nicht nur hier',
  /DER RUHETAG STEHT IN EINER EIGENEN SPALTE/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
