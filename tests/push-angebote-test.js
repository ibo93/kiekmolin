// Push-Werbung nur mit eigener Zustimmung + tote WhatsApp-Reste entfernt.
//
// Gefunden am 09.10.2026: Gäste erlauben Push, um ihren Bestellstatus zu
// sehen. marketing-push ("Angebot an alle") und loyalty-push (Stempel-
// Erinnerung) schickten über genau diese Erlaubnis Werbung. Anderer Zweck,
// eigene Zustimmung (datenbank/43, Spalte push_subscriptions.angebote).
'use strict';
var fs = require('fs'), path = require('path');
var R = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
var MP = fs.readFileSync(path.join(R, 'netlify/functions/marketing-push.js'), 'utf8');
var LP = fs.readFileSync(path.join(R, 'netlify/functions/loyalty-push.js'), 'utf8');
var S = fs.readFileSync(path.join(R, 'datenbank/43-push-angebote-kasse.sql'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

// ---- Server: nur angebote = true
var mpSubs = (MP.match(/sbGet\('push_subscriptions\?[^']*'\)/) || [''])[0];
t('marketing-push holt nur Abos mit angebote=eq.true', /angebote=eq\.true/.test(mpSubs), mpSubs);
t('marketing-push ohne Spalte (400): niemand bekommt etwas, Hinweis auf datenbank/43', /if \(\/-> 400\/\.test\(e\.message\)\) return json\(200, \{ ok: false, error: 'Angebote per Push sind noch nicht eingerichtet: datenbank\/43/.test(MP), '');
t('marketing-push: sbGet wirft wirklich "-> 400" (sonst greift der Zweig nie)', /throw new Error\(.*' -> ' \+ res\.status\)/.test(fn('sbGet', MP)), fn('sbGet', MP));
var lpSubs = (LP.match(/'push_subscriptions\?customer_phone=eq\.'[^;]*;/) || [''])[0];
t('loyalty-push holt nur Abos mit angebote=eq.true', /&angebote=eq\.true/.test(lpSubs), lpSubs);
t('loyalty-push ohne Spalte: bricht ab statt allen zu senden', /if \(\/-> 400\/\.test\(e\.message\)\) { console\.warn\([^;]*; break; \}/.test(LP) && /throw new Error\(.*' -> ' \+ res\.status\)/.test(fn('sbGet', LP)), '');
t('SQL 43: Spalte angebote, Standard false', /add column if not exists angebote boolean not null default false/.test(S), '');

// ---- Gerät: Haken, Standard aus
var speicher = {};
var ls = { getItem: function (k) { return k in speicher ? speicher[k] : null; }, setItem: function (k, v) { speicher[k] = String(v); } };
var P = new Function('localStorage', 'subscribeWebPush', 'showToast', 'window', fn('pushAngebote') + fn('pushAngeboteSetzen') + '; return { an: pushAngebote, setzen: pushAngeboteSetzen };');
var abos = 0, P1 = P(ls, function () { abos++; }, function () {}, {});
var vorher = P1.an(); P1.setzen(true); var danach = P1.an(); P1.setzen(false);
t('Haken: Standard aus; an/aus wird gemerkt und das Abo neu gespeichert', vorher === false && danach === true && P1.an() === false && abos === 2, JSON.stringify({ vorher: vorher, danach: danach, abos: abos }));
var kaputt = P({ getItem: function () { throw new Error('privat'); } }, function () {}, function () {}, {});
t('Haken: gesperrter Speicher (privates Fenster) = aus, kein Absturz', kaputt.an() === false, '');
var sw = fn('subscribeWebPush');
t('Abo speichert angebote + Zeitpunkt aus dem Haken', /angebote: pushAngebote\(\),/.test(sw) && /angebote_at: pushAngebote\(\) \? new Date\(\)\.toISOString\(\) : null/.test(sw), '');
t('Abo ohne SQL 43 (400 "angebote"): nochmal OHNE die Felder -- der Status-Push darf daran nicht scheitern', /if \(r\.ok \|\| r\.status !== 400\) return;/.test(sw) && /delete record\.angebote; delete record\.angebote_at;\s*return _pushSpeichern\(record\);/.test(sw), '');
var ban = fn('renderPushOptInBanner');
t('Banner (Push an): eigener Kasten, nur angehakt wenn gewählt, Text sagt wofür', /id="pushAngeboteKasten" onchange="pushAngeboteSetzen\(this\.checked\)"' \+ \(pushAngebote\(\) \? ' checked' : ''\)/.test(ban) && /Auch Angebote und Stempel-Erinnerungen/.test(ban), '');

// ---- Tote Reste (R-2): weg, und niemand ruft sie noch auf
var weg = ['loadMarketingCampaigns', 'renderMarketingCampaigns', 'openCreateCampaignModal', 'saveCampaign', 'deleteCampaign', 'toggleCampaign',
           'executeCampaign', 'sendWhatsAppOrderConfirmation', 'fallbackWhatsApp', 'buildOrderSummaryText', 'sendCustomerStatusWhatsApp'];
var noch = weg.filter(function (f) { return new RegExp('\\b' + f + '\\b').test(H); });
t('alte Kampagnen-Tafel und nie gelesene WhatsApp-Texte entfernt, kein Aufruf übrig (sonst ReferenceError)', !noch.length, noch.join(', '));
t('kein currentOrderRestaurant._lastOrderWhatsAppUrl mehr gesetzt', !/_lastOrderWhatsAppUrl\s*=/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
