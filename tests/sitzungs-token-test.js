// Prueft die Umstellung von "jeder ist anonym" auf "wer angemeldet ist,
// gibt sich zu erkennen".
//
// Warum das ein eigener Test ist: die Umstellung aendert 268 Aufrufe auf
// einmal. Geht dabei etwas schief, faellt es nicht in einer Ecke der App
// auf, sondern ueberall gleichzeitig -- und zwar erst beim Gast, denn im
// Dashboard laeuft man selbst meist mit gueltiger Sitzung.
//
// Der gefaehrlichste Fall ist das abgelaufene Token: es ist SCHLECHTER
// als gar keines. Der oeffentliche Schluessel haette funktioniert, das
// abgelaufene Token wird abgewiesen. Wer diesen Fall nicht abfaengt,
// baut sich einen Fehler, der genau eine Stunde nach dem Anmelden
// auftritt und beim Nachstellen nie.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// --- die echten Funktionen aus index.html herausschneiden -----------------
var von = html.indexOf('var _kmiToken = null;');
var bis = html.indexOf('window.kmiKopf = kmiKopf;');
t('die Helfer stehen in index.html', von > 0 && bis > von, von + '/' + bis);

var quelle = html.slice(von, bis + 'window.kmiKopf = kmiKopf;'.length);

var ANON = 'anon-schluessel-aus-index-html';
var welt = { window: {}, SUPABASE_KEY: ANON, Date: Date, Object: Object };
vm.createContext(welt);
vm.runInContext(quelle, welt);

var kmiToken = welt.kmiToken;
var kmiTokenSetzen = welt.kmiTokenSetzen;
var kmiKopf = welt.kmiKopf;

function inSekunden(s) { return Math.floor(Date.now() / 1000) + s; }

// =========================================================================
console.log('\n-- Ohne Anmeldung bleibt alles wie bisher --');

t('ohne Sitzung kommt der oeffentliche Schluessel', kmiToken() === ANON);
kmiTokenSetzen(null);
t('auch nach ausdruecklichem "keine Sitzung"', kmiToken() === ANON);
kmiTokenSetzen(undefined);
t('und bei undefined (kein Absturz)', kmiToken() === ANON);
kmiTokenSetzen({});
t('und bei einer Sitzung ohne Token', kmiToken() === ANON);

// =========================================================================
console.log('\n-- Mit Anmeldung gibt sich der Nutzer zu erkennen --');

kmiTokenSetzen({ access_token: 'token-des-wirts', expires_at: inSekunden(3600) });
t('das Sitzungs-Token wird benutzt', kmiToken() === 'token-des-wirts', kmiToken());

kmiTokenSetzen({ access_token: 'neues-token', expires_at: inSekunden(3600) });
t('eine Erneuerung ersetzt das alte Token', kmiToken() === 'neues-token');

kmiTokenSetzen(null);
t('nach dem Abmelden wieder der oeffentliche Schluessel', kmiToken() === ANON);

// =========================================================================
console.log('\n-- Der gefaehrliche Fall: abgelaufen --');

kmiTokenSetzen({ access_token: 'altes-token', expires_at: inSekunden(-1) });
t('ein abgelaufenes Token wird NICHT gesendet', kmiToken() === ANON, kmiToken());

kmiTokenSetzen({ access_token: 'gleich-abgelaufen', expires_at: inSekunden(30) });
t('auch nicht, wenn es in 30 Sekunden ablaeuft (Sicherheitsabstand)',
  kmiToken() === ANON, kmiToken());

kmiTokenSetzen({ access_token: 'noch-lange-gueltig', expires_at: inSekunden(300) });
t('bei 5 Minuten Restlaufzeit wird es benutzt', kmiToken() === 'noch-lange-gueltig');

kmiTokenSetzen({ access_token: 'ohne-ablauf' });
t('ohne Ablaufdatum lieber der oeffentliche Schluessel als ein Blindflug',
  kmiToken() === ANON, kmiToken());

// =========================================================================
console.log('\n-- Die Kopfzeilen --');

kmiTokenSetzen({ access_token: 'token-des-wirts', expires_at: inSekunden(3600) });
var kopf = kmiKopf();
t('apikey bleibt der oeffentliche Schluessel (daran erkennt Supabase das Projekt)',
  kopf.apikey === ANON, kopf.apikey);
t('Authorization traegt das Sitzungs-Token', kopf.Authorization === 'Bearer token-des-wirts', kopf.Authorization);

var kopf2 = kmiKopf({ 'Prefer': 'count=exact', 'Content-Type': 'application/json' });
t('zusaetzliche Kopfzeilen kommen mit', kopf2.Prefer === 'count=exact' && kopf2['Content-Type'] === 'application/json');
t('und ueberschreiben apikey nicht versehentlich', kopf2.apikey === ANON);

kmiTokenSetzen(null);
t('ohne Sitzung sieht der Kopf aus wie frueher',
  kmiKopf().Authorization === 'Bearer ' + ANON);

// =========================================================================
console.log('\n-- Keine Stelle sendet mehr den anon-Schluessel als Ausweis --');

var uebrig = (html.match(/Authorization[^,}]*SUPA[A-Z_]*KEY/g) || []);
t('kein Aufruf haengt den oeffentlichen Schluessel mehr an Authorization',
  uebrig.length === 0, uebrig.slice(0, 3).join(' | '));

var umgestellt = (html.match(/Bearer '? ?\+? ?kmiToken\(\)|Bearer \$\{kmiToken\(\)\}/g) || []).length;
t('und es sind wirklich alle umgestellt (>250)', umgestellt > 250, umgestellt);

t('apikey wird weiterhin gesetzt -- ohne ihn antwortet Supabase gar nicht',
  (html.match(/'apikey': SUPABASE_KEY/g) || []).length > 200);

// =========================================================================
console.log('\n-- Verdrahtung --');

t('der Auth-Listener uebernimmt das Token', /onAuthStateChange[\s\S]{0,400}kmiTokenSetzen\(session\)/.test(html));

// Reihenfolge: erst merken, dann anmelden. Andersherum wuerden ausgerechnet
// die Abfragen, die die Berechtigung pruefen, noch anonym rausgehen.
//
// Verglichen wird der echte AUFRUF, nicht die blosse Erwaehnung: im
// Kommentar darueber steht der Name auch, und danach richtet sich hier
// nichts. (Genau darauf ist dieser Test beim ersten Lauf hereingefallen.)
var block = html.slice(html.indexOf('supabaseClient.auth.onAuthStateChange'));
block = block.slice(0, block.indexOf('});') + 3);
var pTok = block.indexOf('kmiTokenSetzen(session);');
var pLogin = block.indexOf('handleGoogleLoginSuccess(session.user);');
t('das Token wird VOR handleGoogleLoginSuccess gesetzt',
  pTok > -1 && pLogin > -1 && pTok < pLogin, pTok + '/' + pLogin);

t('beim Neuladen wird die bestehende Sitzung geholt',
  /getSession\(\)\.then\(function \(r\) \{[\s\S]{0,120}kmiTokenSetzen/.test(html));

t('TOKEN_REFRESHED ist kein leerer Zweig mehr', !/TOKEN_REFRESHED'\) \{\n\s*\}/.test(html));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
