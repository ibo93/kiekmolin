// Reservierungen ausgebucht: Wirt traegt einen Zeitraum ein ("Rest dieses
// Monats"), Gaeste sehen "ausgebucht" + Warteliste, Bestellen geht weiter.
// Ibo, 12.10.2026. Rechnung und Server werden AUSGEFUEHRT.
'use strict';
var fs = require('fs'), path = require('path');
var R = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
var n = 0, ok = 0, warten = [];
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

var A = new Function(['ausgebuchtZeitraeume', 'ausgebuchtAm', 'ausgebuchtDatum', 'ausgebuchtText', 'monatsEnde', 'ausgebuchtVorschlag'].map(function (x) { return fn(x); }).join('\n')
    + '; return { z: ausgebuchtZeitraeume, am: ausgebuchtAm, text: ausgebuchtText, ende: monatsEnde, vor: ausgebuchtVorschlag };')();
var heute = new Date().toLocaleDateString('sv-SE');
function plus(t) { var d = new Date(); d.setDate(d.getDate() + t); return d.toLocaleDateString('sv-SE'); }
var haus = { features: ['delivery', 'ausgebucht:' + plus(2) + ':' + plus(5), 'ausgebucht:2020-01-01:2020-01-31', 'ausgebucht:kaputt', 'vacation:' + plus(40) + ':' + plus(45)] };
var z = A.z(haus);
t('Zeiträume: nur gültige, abgelaufene fallen weg', z.length === 1 && z[0].von === plus(2) && z[0].bis === plus(5), JSON.stringify(z));
t('ausgebuchtAm: erster und letzter Tag zählen mit, davor/danach nicht', !!A.am(haus, plus(2)) && !!A.am(haus, plus(5)) && !A.am(haus, plus(1)) && !A.am(haus, plus(6)), '');
t('Betriebsferien sind nicht "ausgebucht" (eigene Sache)', !A.am(haus, plus(41)), '');
t('Monatsende rechnet Schaltjahr und Dezember', A.ende('2028-02-10') === '2028-02-29' && A.ende('2026-12-03') === '2026-12-31' && A.ende('2026-10-12') === '2026-10-31', A.ende('2028-02-10'));
var v1 = A.vor('monat', '2026-10-12'), v2 = A.vor('naechster', '2026-12-20');
t('"Rest dieses Monats" = heute bis Monatsende; "Nächsten Monat" über den Jahreswechsel', v1.von === '2026-10-12' && v1.bis === '2026-10-31' && v2.von === '2027-01-01' && v2.bis === '2027-01-31', JSON.stringify([v1, v2]));
t('Text für Gäste: "vom 12. Oktober bis 31. Oktober ausgebucht"', /^vom 12\. Oktober bis 31\. Oktober ausgebucht$/.test(A.text({ von: '2026-10-12', bis: '2026-10-31' })), A.text({ von: '2026-10-12', bis: '2026-10-31' }));

// Gästeseite
var las = fn('loadAvailableSlots');
t('Datum gewählt + ausgebucht: keine Uhrzeiten, Hinweis, Anruf-Knopf (ohne Nummer Warteliste)', /var _ab = _abRest \? ausgebuchtAm\(_abRest, date\) : null;/.test(las) && /ausgebuchtAngebotSetzen\(document\.getElementById\('waitlistOption'\), _abRest\);/.test(las) && /return;\s*\}\s*\} catch \(e\) \{\}\s*try \{\s*\/\/ Bestehende Reservierungen/.test(las), '');
t('Kalender: ausgebuchte Tage durchgestrichen, aber wählbar (Warteliste)', /class="kmi-cal-voll" onclick="resCalSelectDate/.test(fn('resCalRender')) && /text-decoration:line-through/.test(fn('resCalRender')), '');
var vollText = new Function(fn('reservierungVollText') + '; return reservierungVollText;')();
t('Server lehnt ab -> Gast liest "Ausgebucht", nicht "HTTP 409"', /if \(antwort && antwort\.ausgebucht\) \{\s*_resFehler\.gastText = reservierungVollText\(antwort\);/.test(fn('saveReservationToSupabase'))
  && /^Ausgebucht – /.test(vollText({ ausgebucht: true })), vollText({ ausgebucht: true }));
t('Silvester-Kontingent mit Restplätzen: "nur noch 3 Plätze frei", nicht "ausgebucht"', /nur noch 3 Plätze frei/.test(vollText({ ausgebucht: true, kontingent: true, frei: 3, titel: 'Silvester' })) && /^Ausgebucht/.test(vollText({ ausgebucht: true, kontingent: true, frei: 0 })), vollText({ ausgebucht: true, kontingent: true, frei: 3 }));

// Dashboard
t('Dashboard: Knöpfe "Rest dieses Monats" / "Nächsten Monat" / eigener Zeitraum', /data-ausgebucht="monat"/.test(H) && /data-ausgebucht="naechster"/.test(H) && /data-ausgebucht="eigen"/.test(H) && /id="ausgebuchtListe"/.test(H), '');
var sp = fn('ausgebuchtSpeichern');
t('Speichern mit Probe: return=representation, leere Antwort = Fehler (Regel 6)', /'Prefer': 'return=representation'/.test(sp) && /if \(!Array\.isArray\(zeilen\) \|\| !zeilen\.length\) throw new Error\('keine Berechtigung/.test(sp), '');
t('Dashboard zeigt Stand nach dem Laden (ausgebuchtUI beim Einlesen der Einstellungen)', /if \(typeof ausgebuchtUI === 'function'\) ausgebuchtUI\(features\);/.test(H), '');

// Server
// In CI laeuft kein npm install: web-push (ueber lib/alarm) gibt es dort
// nicht. Netlify installiert es -- fuer den Test reicht ein Ersatz, wie in
// aktionen-test.js. Ohne ihn brach dieser Test in CI nach 12 Pruefungen ab.
var Module = require('module'), echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    return echtLaden.apply(this, arguments);
};
var SV = require(path.join(R, 'netlify/functions/reservation-guest.js'));
t('Server: ausgebuchtAm erkennt den Zeitraum', !!SV._ausgebuchtAm(['ausgebucht:2026-10-12:2026-10-31'], '2026-10-31') && !SV._ausgebuchtAm(['ausgebucht:2026-10-12:2026-10-31'], '2026-11-01'), '');
t('Server: Warteliste erkannt', SV._istWarteliste({ notes: '[Warteliste] Tag war ausgebucht' }) && !SV._istWarteliste({ notes: 'Fensterplatz [Warteliste]' }), '');

function lauf(features, notes) {
    process.env.SUPABASE_SERVICE_KEY = 'x';
    var p = require.resolve(path.join(R, 'netlify/functions/reservation-guest.js')); delete require.cache[p];
    var zl = path.join(R, 'netlify/functions/lib/zahlsperre.js'); try { delete require.cache[require.resolve(zl)]; } catch (e) {}
    var F = require(p), gespeichert = null, alt = global.fetch, w = console.warn, l = console.log;
    console.warn = function () {}; console.log = function () {};
    global.fetch = function (url, o) {
        url = String(url);
        var antw = function (d, s) { return Promise.resolve({ ok: (s || 200) < 300, status: s || 200, json: function () { return Promise.resolve(d); }, text: function () { return Promise.resolve(JSON.stringify(d)); } }); };
        if (/\/restaurants\?id=eq\./.test(url) && /features/.test(url)) return antw([{ id: 'r1', is_active: true, features: features }]);
        if (/\/reservations$/.test(url) && o && o.method === 'POST') { gespeichert = JSON.parse(o.body); return antw([Object.assign({ id: 'neu', track_token: 'tt' }, gespeichert)], 201); }
        return antw([]);
    };
    var tag = plus(3);
    return F.handler({ httpMethod: 'POST', body: JSON.stringify({ restaurant_id: '11111111-1111-4111-8111-111111111111', guest_name: 'Ayse', guest_phone: '0176 1234567', party_size: 2, reservation_date: tag, reservation_time: '19:00', notes: notes }) })
        .then(function (r) { return { code: r.statusCode, body: JSON.parse(r.body), gespeichert: gespeichert }; })
        .finally(function () { global.fetch = alt; console.warn = w; console.log = l; });
}
var ZR = 'ausgebucht:' + plus(1) + ':' + plus(10);
warten.push(lauf([ZR], '').then(function (r) {
    t('Server: normale Reservierung an ausgebuchtem Tag -> 409, nichts gespeichert', r.code === 409 && r.body.ausgebucht === true && r.gespeichert === null, JSON.stringify(r));
}).then(function () { return lauf([ZR, 'auto_confirm_reservations'], '[Warteliste] Tag war ausgebucht · Uhrzeit egal'); }).then(function (r) {
    t('Server: Warteliste an ausgebuchtem Tag geht durch, IMMER "pending" (auch bei Auto-Bestätigung)', r.code === 200 && r.gespeichert && r.gespeichert.status === 'pending', JSON.stringify(r));
}).then(function () { return lauf(['auto_confirm_reservations'], ''); }).then(function (r) {
    t('Server: ohne Eintrag normal, Auto-Bestätigung bleibt', r.code === 200 && r.gespeichert && r.gespeichert.status === 'confirmed', JSON.stringify(r));
}).then(function () { return lauf(['ausgebucht:' + plus(20) + ':' + plus(25)], ''); }).then(function (r) {
    t('Server: anderer Zeitraum sperrt diesen Tag nicht', r.code === 200, JSON.stringify(r));
}));

Promise.all(warten).then(function () {
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
}).catch(function (e) { console.error(e); process.exit(1); });
