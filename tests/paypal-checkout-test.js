// ERST DAS GELD, DANN DIE BESTELLUNG.
//
// Ibo am 13.09.2026: "es bei paypal gehen wenn die bestellung mit paypal
// geht und dann kommt die bestellung bei restaurant an wie bei allen
// anderen bestellungen."
//
// Mit einem PayPal.Me-Link ging das nicht -- ein Link hat keinen
// Rueckkanal, PayPal meldet uns nie, dass jemand bezahlt hat. Der Wirt
// hat ein Geschaeftskonto, also geht der richtige Weg:
//
//   anlegen -> Gast bezahlt im PayPal-Fenster -> buchen -> Bestellung
//
// DIE STELLEN, AN DENEN HIER GELD VERLORENGEHT:
//
// 1. Zwei Bestellungen fuer dieselbe Zahlung. Der Gast klickt zweimal,
//    laedt neu, drueckt zurueck. Ohne eindeutige Vorgangsnummer kocht
//    die Kueche zweimal.
// 2. Bezahlt, aber nicht gespeichert. Das Geld ist weg, die Bestellung
//    existiert nicht. Der Gast darf hier NICHT "hat nicht geklappt"
//    lesen -- und der Wirt muss es sofort erfahren.
// 3. Ein anderer Betrag als bestellt. "Es kam eine Antwort von PayPal"
//    ist kein Beweis, dass der richtige Betrag bezahlt wurde.
// 4. Der Preis-Schutz. Ein zweiter Weg in die Tabelle orders, der die
//    Pruefung nicht macht, waere eine offene Tuer -- genau der Fall aus
//    README-preise.md.
// 5. Das Secret. Es liegt in der Datenbank; kaeme es in features oder
//    ueber den anon-Schluessel heraus, waere das PayPal-Konto des Wirts
//    offen.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var fn = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'paypal-zahlung.js'), 'utf8');
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var sqlPfad = path.join(KMI, 'datenbank', '30-paypal-konto.sql');
var sql = fs.existsSync(sqlPfad) ? fs.readFileSync(sqlPfad, 'utf8') : '';

// ---- 1. Das Secret ----------------------------------------------------
console.log('\n-- Die Zugangsdaten --');
t('es gibt die SQL-Datei', fs.existsSync(sqlPfad), 'fehlt');
t('eigene Tabelle, nicht features', /create table if not exists public\.paypal_konten/i.test(sql), 'liegt woanders');
t('RLS ist an', /alter table public\.paypal_konten\s+enable row level security/i.test(sql), 'offen');
t('es gibt KEINE Freigabe fuer anon oder authenticated',
  !/create policy/i.test(sql), 'jemand darf lesen');
t('Sandbox ist der Standard -- wer vergisst umzuschalten, verliert kein Geld',
  /live\s+boolean not null default false/i.test(sql), 'startet mit echtem Geld');
t('die Bestellung merkt sich die Zahlung',
  /add column if not exists payment_status text/.test(sql) && /add column if not exists payment_reference text/.test(sql), 'fehlt');
t('die Vorgangsnummer ist EINDEUTIG -- sonst zwei Bestellungen fuer ein Geld',
  /create unique index if not exists orders_payment_reference_uniq/i.test(sql), 'kein Riegel');

// ---- 2. Der Server ----------------------------------------------------
console.log('\n-- Die Funktion --');
t('sie braucht den Service-Key', /SUPABASE_SERVICE_KEY/.test(fn), 'liest mit anon');
t('ohne ihn laeuft sie gar nicht erst', /if \(!KEY\) return json\(500/.test(fn), 'laeuft halb');
t('das Secret verlaesst die Funktion NIE',
  /client_id: k0\.client_id/.test(fn) && !/secret: k0?\.?secret/.test(fn), 'Secret geht raus');
t('Sandbox und echtes Konto sind getrennt',
  /api-m\.paypal\.com/.test(fn) && /api-m\.sandbox\.paypal\.com/.test(fn), 'nur eine Umgebung');
t('ohne hinterlegtes Konto wird nicht kassiert',
  /code: 'kein_konto'/.test(fn), 'versucht es trotzdem');

// ---- 3. Der Preis-Schutz ---------------------------------------------
console.log('\n-- Preis --');
t('es wird DIESELBE Pruefung benutzt, nicht eine zweite',
  /require\('\.\/lib\/preis-pruefung'\)/.test(fn), 'eigene Regeln -- offene Tuer');
// NICHT auf das erste "preisCheck(order)" im Text pruefen -- das trifft die
// DEFINITION weiter oben und beweist gar nichts. Gemeint ist die Reihenfolge
// INNERHALB des anlegen-Zweigs: erst rechnen, dann bei PayPal kassieren.
var zweigA = fn.slice(fn.indexOf("if (aktion === 'anlegen')"), fn.indexOf("if (aktion === 'buchen')"));
t('der anlegen-Zweig wurde gefunden', zweigA.length > 500, zweigA.length + ' Zeichen');
t('geprueft wird VOR dem Kassieren',
  zweigA.indexOf('await preisCheck(order)') > 0
  && zweigA.indexOf('await preisCheck(order)') < zweigA.indexOf("'/v2/checkout/orders'"),
  'kassiert erst');
t('stimmt der Preis nicht, wird gar nicht erst kassiert',
  /return json\(422, \{ ok: false, error: 'Der Preis stimmt nicht/.test(fn), 'nimmt das Geld trotzdem');
t('klemmt die Pruefung, verhindert das keine Zahlung -- wird aber vermerkt',
  /unpruefbar: e\.message/.test(fn) && /console\.warn\('\[paypal-zahlung\] Preis nicht pruefbar/.test(fn), 'still oder blockierend');

// ---- 4. Abholen und pruefen ------------------------------------------
console.log('\n-- Die Zahlung abholen --');
t('es wird wirklich capture aufgerufen', /\/capture'/.test(fn), 'nur angelegt');
t('der Status muss COMPLETED sein', /status !== 'COMPLETED'/.test(fn), 'glaubt jeder Antwort');
t('der BETRAG wird verglichen', /betragStr\(bezahlt\) !== soll/.test(fn), 'nimmt jeden Betrag');
t('und die Waehrung', /waehrung !== 'EUR'/.test(fn), 'nimmt jede Waehrung');
t('bei falschem Betrag entsteht KEINE Bestellung',
  fn.indexOf('Der bezahlte Betrag passt nicht') < fn.indexOf('bestellungSchreiben(nutz)'), 'schreibt trotzdem');

// ---- 5. Doppelte Bestellungen ----------------------------------------
console.log('\n-- Zweimal geklickt --');
t('vor dem Abholen wird nachgesehen, ob es die Bestellung schon gibt',
  /schonGebucht\(ppId\)/.test(fn), 'legt sie zweimal an');
t('dann wird die vorhandene zurueckgegeben statt einer neuen',
  /return json\(200, \{ ok: true, doppelt: true/.test(fn), 'zweite Bestellung');
t('ein bei PayPal schon abgeholter Auftrag ist KEIN Fehler -- das Geld ist da',
  /ORDER_ALREADY_CAPTURED/.test(fn), 'verliert die bezahlte Bestellung');

// ---- 6. Bezahlt, aber nicht gespeichert -------------------------------
console.log('\n-- Der schlimmste Fall --');
t('er wird als eigener Fall behandelt', /BEZAHLT ABER NICHT GESPEICHERT/.test(fn), 'faellt in den Sammelfehler');
t('der Wirt erfaehrt es sofort ueber restaurant_events',
  /'paypal_bezahlt_ohne_bestellung'/.test(fn), 'niemand erfaehrt es');
t('der Gast bekommt die Vorgangsnummer, nicht nur "Fehler"',
  /bitte ruf kurz an und nenne diese Nummer/.test(fn), 'steht ohne alles da');
t('und die Antwort sagt, dass bezahlt wurde',
  /ok: false, bezahlt: true, paypal_id: ppId/.test(fn), 'sieht aus wie nicht bezahlt');

// ---- 7. Die Bestellung ------------------------------------------------
console.log('\n-- Die Bestellung --');
t('sie wird als bezahlt markiert', /payment_status: 'paid'/.test(fn), 'sieht aus wie unbezahlt');
t('mit der PayPal-Vorgangsnummer', /payment_reference: ppId/.test(fn), 'nicht zuzuordnen');
t('fehlt eine Spalte, geht die Bestellung trotzdem durch -- das Geld ist da',
  /Could not find the '\(\[\^'\]\+\)'/.test(fn), 'verliert sie an einer Spalte');
t('nur bekannte Felder gehen in die Tabelle', /var ALLOWED = \[/.test(fn), 'reicht alles durch');

// ---- 8. Der Gast ------------------------------------------------------
console.log('\n-- Beim Gast --');
t('das PayPal-Skript wird erst geladen, wenn jemand damit zahlen will',
  /skript\(clientId\)/.test(h) && /paypal\.com\/sdk\/js\?client-id=/.test(h), 'auf jeder Seite');
t('die Bestellung entsteht erst nach der Zahlung',
  h.indexOf('var _ppcFertig = false;') < h.indexOf("if (!_ppcFertig) {"), 'Reihenfolge falsch');
t('bei PayPal wird order-save uebersprungen -- sonst zwei Bestellungen',
  /Bei PayPal hat der Server die Bestellung schon geschrieben/.test(h), 'legt zweimal an');
t('und der Notweg-Insert auch', /if \(!_orderRes\.ok && !_ppcFertig\)/.test(h), 'zweite Bestellung ueber den Notweg');
t('Abbruch loest KEINE Bestellung aus',
  /Zahlung abgebrochen — es wurde nichts abgebucht und keine Bestellung ausgelöst/.test(h), 'bestellt trotzdem');
t('nach Abbruch ist der Knopf wieder benutzbar',
  /submitBtn\.innerHTML = originalBtnText; \}\n\s*return;/.test(h), 'toter Knopf');
t('bezahlt-aber-nicht-gespeichert wird dem Gast anders gesagt als ein Abbruch',
  /_ppcErg\.bezahlt/.test(h), 'sieht gleich aus');
t('nach echter Zahlung erscheint KEIN "jetzt bezahlen"-Banner mehr',
  /paymentMethod === 'paypal' && currentOrderRestaurant && !_ppcFertig/.test(h), 'fordert zweimal Geld');
t('das Fenster sagt, dass erst nach der Bestaetigung bestellt wird',
  /erst an das Restaurant geschickt, wenn PayPal die Zahlung bestätigt hat/.test(h), 'unklar');
t('waehrend der Bestaetigung wird gebeten, nicht zu schliessen',
  /bitte dieses Fenster nicht schließen/.test(h), 'Gast schliesst mitten drin');

// ---- 9. Auslieferung ---------------------------------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var m = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!m, 'keine gefunden');
t('sie ist mindestens 30', !!m && Number(m[1]) >= 30, m ? m[1] : '?');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
