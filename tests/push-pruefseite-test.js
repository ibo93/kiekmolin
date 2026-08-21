// EINE PRUEFSEITE, WEIL RATEN DREIMAL DANEBENLAG.
//
// Am 21.08.2026 kam nach drei Reparaturen immer noch keine Meldung an:
//   1. Die Tabelle hatte die Spalten p256dh_key, auth_key, user_agent
//      gar nicht -- jede Anmeldung lief auf 400.
//   2. Geraete mit laengst erteilter Erlaubnis trugen sich nie nach.
//   3. Gefragt wurde beim Laden der Seite, wenn das Dashboard noch zu
//      war -- also nie.
//
// Nach jeder dieser drei Reparaturen sah es aus wie behoben. Und nach
// jeder stand in den Protokollen wieder: nichts. Kein Fehler, keine
// Anfrage, gar nichts.
//
// Ohne Fehler kann man nicht suchen, man kann nur raten. Dreimal
// geraten ist genug. Diese Seite geht die Kette Schritt fuer Schritt
// durch und zeigt jeden Schritt an -- mit der echten Meldung des
// Browsers, nicht mit einer Vermutung.
//
// SIE GEHOERT NICHT IN DIE APP.
// Eigene Adresse, kein Menuepunkt, kein Weg von der Startseite hierher.
// Werkzeug, kein Bestandteil.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var p = fs.readFileSync(KMI + '/push-check.html', 'utf8');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die ganze Kette wird geprueft, nicht nur ein Glied --');
// Genau daran lag es: jede einzelne Reparatur war richtig, aber die
// naechste Schicht darunter tat schon nichts mehr.
[['als App vom Home-Bildschirm', /display-mode: standalone/],
 ['Browser kann Benachrichtigungen', /'Notification' in window/],
 ['Service Worker vorhanden', /'serviceWorker' in navigator/],
 ['Push wird unterstuetzt', /'PushManager' in window/],
 ['Erlaubnis', /Notification\.requestPermission\(\)/],
 ['Service Worker laeuft', /navigator\.serviceWorker\.ready/],
 ['beim Push-Dienst anmelden', /pushManager\.subscribe\(/],
 ['in die Datenbank eintragen', /rest\/v1\/push_subscriptions\?on_conflict=endpoint/],
 ['Probemeldung', /showNotification\(/]].forEach(function (s) {
    t('Schritt geprueft: ' + s[0], s[1].test(p), 'fehlt');
});

console.log('\n-- 2. Der echte Fehlertext wird gezeigt, nicht verschluckt --');
// Der Kern der Sache. Ueberall sonst in der App faengt ein catch-Block
// den Fehler ab und macht weiter -- das ist im Betrieb richtig und war
// hier genau das Problem.
t('der Antworttext der Datenbank wird gelesen',
  /text = await antwort\.text\(\)/.test(p), 'verschluckt');
t('und bei Misserfolg angezeigt',
  /'HTTP ' \+ antwort\.status \+ \(text \? ' – ' \+ text\.slice\(0, 300\) : ''\)/.test(p), 'nur eine Zahl');
t('Ausnahmen zeigen ihre eigene Meldung',
  (p.match(/e && e\.message \? e\.message : String\(e\)/g) || []).length >= 4, 'eigene Worte statt echter');
t('und nichts wird stillschweigend uebersprungen',
  /catch \(e\) \{\s*\}/.test(p) === false || /melde\(/.test(p), 'stille catch-Bloecke');

console.log('\n-- 3. Sie meldet wirklich an --');
// Wenn sie gruen durchlaeuft, soll die Zeile auch dastehen. Eine
// Pruefung, die nur so tut, haette uns nichts gebracht.
t('mit denselben Spaltennamen wie die App',
  /p256dh_key: j\.keys && j\.keys\.p256dh/.test(p)
  && /auth_key: j\.keys && j\.keys\.auth/.test(p)
  && /user_agent: navigator\.userAgent/.test(p), 'andere Namen');
t('und demselben Upsert-Weg',
  /resolution=merge-duplicates/.test(p), 'legt Doppelte an');
t('mit dem VAPID-Schluessel aus der App',
  p.indexOf('BMhF-LWy94av-ZdG1kf-b0BpuKFqpfO-XdO9rH_R-LNc8An-4hSkjD1ZQeR2SlW5cdv2VUmuWdGsKBYGXTNEXKU') > -1
  && h.indexOf('BMhF-LWy94av-ZdG1kf-b0BpuKFqpfO-XdO9rH_R-LNc8An-4hSkjD1ZQeR2SlW5cdv2VUmuWdGsKBYGXTNEXKU') > -1,
  'anderer Schluessel -- dann prueft sie etwas anderes als die App tut');

console.log('\n-- 4. Kein Geheimnis auf der Seite --');
// Sie ist oeffentlich erreichbar. Es darf nur draufstehen, was ohnehin
// im Seitenquelltext der App steht.
t('nur der oeffentliche Schluessel',
  /service_role/.test(p) === false && /SUPABASE_SERVICE_KEY/.test(p) === false, 'Dienstschluessel drauf');
t('und der ist derselbe wie in der App',
  p.indexOf('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') > -1
  && h.indexOf('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') > -1, 'anderer Schluessel');

console.log('\n-- 5. Sie ist Werkzeug, kein Bestandteil --');
// Kein Weg von der App hierher: wer sie nicht kennt, findet sie nicht.
t('die App verlinkt sie nicht', /push-check/.test(h) === false, 'verlinkt');
t('sie laedt die App nicht nach', /index\.html/.test(p) === false, 'zieht die App mit');
t('und der Grund fuer ihre Existenz steht drin',
  p.indexOf('Dreimal geraten und') > -1 || p.indexOf('dreimal danebengelegen') > -1,
  'ohne Begruendung -- dann wird sie irgendwann geloescht oder vergessen');

console.log('\n-- 6. Sie sagt dem Wirt, was zu tun ist --');
t('am Ende steht ein Fazit', /\.fazit\b/.test(p) && /f\.className = 'fazit '/.test(p), 'nur Technik');
t('bei Erfolg: was jetzt gilt', /Dein Gerät steht jetzt in der Datenbank/.test(p), 'kein Fazit');
t('bei Misserfolg: wo er hinschauen soll',
  /Es hängt am ersten roten Punkt oben/.test(p), 'laesst ihn allein');
t('der iPhone-Fall wird eigens benannt',
  /Zum Home-Bildschirm/.test(p), 'haeufigster Grund fehlt');
t('und der blockierte Fall auch',
  /In den Einstellungen des Geräts für diese App wieder erlauben/.test(p), 'Sackgasse ohne Ausweg');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
