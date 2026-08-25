// DER GAST SCHREIBT NICHT MEHR SELBST IN DIE DATENBANK.
//
// Gemeldet am 25.08.2026: "Es kommen keine Reservierungen und Bestellung
// rein". Und der Satz, der es aufloeste: "Auf App kommen die
// Reservierung auf dem Browser nicht."
//
// Im Protokoll standen an einem Tag VIER abgewiesene Gaeste:
//
//   11:08  Samsung Browser      401
//   13:17  iPhone (Google-App)  401
//   15:10  Android Chrome       401
//   15:43  iPhone (Google-App)  401
//
//   ERROR 42501 new row violates row-level security policy
//               for table "reservations"
//
// Dazwischen zwei erfolgreiche (15:30, 15:41) -- vom angemeldeten
// Betreiber. Genau dieser Unterschied war der Beweis.
//
// URSACHE
// Beim Zumachen der Gaestedaten steht auf reservations:
//   insert  fuer anon + authenticated  -> Gast darf anlegen
//   select  NUR fuer authenticated     -> Gast darf nicht lesen
// Die App bat mit "Prefer: return=representation" darum, die neue Zeile
// zurueckzubekommen. Postgres wendet dafuer die LESE-Regel an. Der Gast
// ist "anon" -- und daran scheiterte der ganze Vorgang.
//
// Bestellungen waren nie betroffen: die gehen seit jeher ueber
// order-save mit dem Dienstschluessel. Reservierungen waren die
// letzten, die noch direkt aus dem Browser schrieben.
//
// DIESE DATEI HAELT DAS FEST: Gaestewege gehen ueber eine Servertuer.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Kommentare weg -- diese Datei und index.html erklaeren den Fehler
// selbst, und die Erklaerung darf ihn nicht ausloesen.
var src = h.split('\n').map(function (z) {
    return z.replace(/^(\s*)\/\/.*$/, '$1');
}).join('\n');

console.log('\n-- 1. Die Servertuer gibt es --');
var tuer = path.join(KMI, 'netlify', 'functions', 'reservation-guest.js');
t('reservation-guest.js liegt da', fs.existsSync(tuer), 'fehlt');
var f = fs.existsSync(tuer) ? fs.readFileSync(tuer, 'utf8') : '';
t('und schreibt mit dem Dienstschluessel',
  /SUPABASE_SERVICE_KEY/.test(f), 'kein Dienstschluessel');
t('ohne den tut sie gar nichts',
  /if \(!SERVICE_KEY\)[\s\S]{0,200}503/.test(f), 'laeuft ohne Schluessel weiter');

console.log('\n-- 2. Sie gibt nur zurueck, was dem Gast gehoert --');
// Der Dienstschluessel sieht ALLES. Was diese Tuer zurueckgibt, muss
// deshalb Feld fuer Feld aufgezaehlt sein -- nie die ganze Zeile.
var rueck = f.slice(f.indexOf('return json(200'));
t('genau id, track_token und status',
  /id:\s*zeile\.id/.test(rueck) && /track_token:\s*zeile\.track_token/.test(rueck)
  && /status:\s*zeile\.status/.test(rueck), 'gibt etwas anderes zurueck');
t('und keine Telefonnummer',
  /guest_phone/.test(rueck) === false, 'Telefonnummer geht zurueck');
t('und nicht die ganze Zeile',
  /return json\(200,\s*zeile\)|\.\.\.zeile|Object\.assign\(\{ ok: true \}, zeile\)/.test(rueck) === false,
  'gibt die ganze Zeile zurueck');

console.log('\n-- 3. Der Browser darf den Status nicht mehr setzen --');
// Wer die Adresse kannte, konnte status: 'confirmed' schicken und sich
// selbst bestaetigen -- am Wirt vorbei.
t('sauber() nimmt status gar nicht erst an',
  /function sauber\(r\)[\s\S]*?\n\}/.test(f)
  && /status:\s*(text\(r\.status|r\.status)/.test(f.slice(f.indexOf('function sauber'), f.indexOf('function pruefe'))) === false,
  'uebernimmt status aus dem Aufruf');
t('der Server entscheidet ihn anhand des Hauses',
  /r\.status = \(merkmale\.indexOf\('auto_confirm_reservations'\) >= 0\)/.test(f), 'entscheidet anders');
t('und prueft, ob das Haus ueberhaupt reserviert werden darf',
  /no_reservations/.test(f) && /is_active === false/.test(f), 'prueft das Haus nicht');

console.log('\n-- 4. Kein Gaesteweg schreibt mehr direkt --');
// Die beiden Wege, auf denen ein GAST eine Reservierung anlegt:
// das Formular und die Warteliste.
['saveReservationToSupabase', 'submitWaitlist'].forEach(function (name) {
    var i = src.indexOf('function ' + name);
    if (i < 0) { t(name + ' gibt es', false, 'Funktion nicht gefunden'); return; }
    var koerper = src.slice(i, i + 4000);
    var direkt = /fetch\(\s*SUPABASE_URL \+ '\/rest\/v1\/reservations'/.test(koerper);
    t(name + ' schreibt nicht direkt', direkt === false, 'schreibt wieder direkt in die Datenbank');
    t(name + ' geht durch die Servertuer',
      koerper.indexOf('/.netlify/functions/reservation-guest') > -1, 'benutzt sie nicht');
});

console.log('\n-- 5. Die Bestaetigung kommt erst nach dem Speichern --');
// DAS WAR DER SCHLIMMSTE TEIL. Das Speichern lief nebenher, und die
// Bestaetigungskarte kam sofort -- egal was daraus wurde. Die vier
// abgewiesenen Gaeste sahen eine gruene Bestaetigung fuer eine
// Reservierung, die es nicht gab. Sie waeren zur Uhrzeit erschienen.
var sub = src.slice(src.indexOf('function submitReservation'));
sub = sub.slice(0, sub.indexOf('\nfunction ', 10));
t('showReservationConfirmation steht im then-Zweig',
  /createReservationInSupabase\(reservation\)\.then\(function \(\)[\s\S]{0,400}showReservationConfirmation\(reservation\)/.test(sub),
  'kommt weiterhin sofort');
t('und nicht mehr davor',
  /\}\);\s*\n\s*closeModal\('reservationModal'\);/.test(sub) === false, 'steht wieder davor');
t('bei einem Fehler bleibt das Formular offen',
  /\.catch\(function \(err\)[\s\S]{0,400}showToast\(/.test(sub) && /closeModal/.test(sub.slice(sub.indexOf('.catch'))) === false,
  'schliesst trotzdem');
// Und die Speicherfunktion muss den Fehler weiterreichen, sonst kommt
// er im catch nie an.
var save = src.slice(src.indexOf('async function saveReservationToSupabase'));
save = save.slice(0, save.indexOf('\nfunction ', 10));
t('saveReservationToSupabase verschluckt den Fehler nicht mehr',
  /throw new Error\(fehlerText\)/.test(save) && /throw e;/.test(save), 'verschluckt ihn');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
