// BESONDERER ABEND GANZ OBEN (Silvester ...) -- Ibo, 12.10.2026, Luett Italia:
// "der QR-Code geht direkt auf die Hauptseite und der Silvester-Block kommt
// rein" -- mit Menue, Ablauf und Restplaetzen.
//
// Ausgefuehrt, nicht nur gelesen: Plaetze zaehlen, Server-Sperre bei vollem
// Abend, die Auswahl, welche Aktion oben steht, und was der Gast liest.
'use strict';
var fs = require('fs'), path = require('path'), Module = require('module');
var R = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
var SQL = fs.readFileSync(path.join(R, 'datenbank', '45-besonderer-abend.sql'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }
var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };

// web-push gibt es in CI nicht (kein npm install) -- wie in aktionen-test.js.
var echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    return echtLaden.apply(this, arguments);
};

(async function () {
    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    var A = require('../netlify/functions/lib/aktionen.js');

    console.log('-- 1. Plaetze zaehlen --');
    t('belegt = Personen ohne Absagen und ohne Warteliste',
      A.belegtePlaetze([{ party_size: 4, status: 'confirmed' }, { party_size: 2, status: 'cancelled' }, { party_size: 6, status: 'rejected' },
                        { party_size: 3, notes: '[Warteliste] Silvester' }, { party_size: 5, status: 'pending' }, { party_size: 2, status: 'no_show' }]) === 9, '');

    function welt(o) {
        global.fetch = async function (url, opt) {
            url = String(url);
            var antw = function (d, s) { return { ok: (s || 200) < 300, status: s || 200, json: async function () { return d; }, text: async function () { return JSON.stringify(d); } }; };
            if (/\/aktionen\?/.test(url) && /plaetze=not\.is\.null/.test(url)) return o.aktionKaputt ? antw({}, 400) : antw(o.abend ? [o.abend] : []);
            if (/\/reservations\?restaurant_id=eq\./.test(url)) return antw(o.res || []);
            if (/\/restaurants\?id=eq\./.test(url)) return antw([{ id: 'r1', is_active: true, features: o.features || [] }]);
            if (/\/reservations$/.test(url) && opt && opt.method === 'POST') { o.gespeichert = JSON.parse(opt.body); return antw([Object.assign({ id: 'neu', track_token: 'tt' }, o.gespeichert)], 201); }
            return antw([]);
        };
    }
    var abend = { id: 'a1', titel: 'Silvester', plaetze: 10 };
    welt({ abend: abend, res: [{ party_size: 4, status: 'confirmed' }, { party_size: 3, status: 'pending' }] });
    var k = await A.kontingent('r1', '2026-12-31', 'dienst');
    t('Kontingent: 10 Plätze, 7 belegt, 3 frei', k && k.plaetze === 10 && k.belegt === 7 && k.frei === 3, JSON.stringify(k));
    welt({});
    t('ohne Abend mit Plätzen: kein Kontingent (null)', (await A.kontingent('r1', '2026-12-31', 'dienst')) === null, '');
    welt({ aktionKaputt: true });
    t('SQL 45 fehlt / Datenbank klemmt: null -- fällt offen aus, sperrt niemanden', (await A.kontingent('r1', '2026-12-31', 'dienst')) === null, '');

    console.log('\n-- 2. Restplätze für die Seite (aktion-plaetze) --');
    var P = require('../netlify/functions/aktion-plaetze.js');
    welt({ abend: abend, res: [{ party_size: 8, status: 'confirmed' }] });
    var p1 = JSON.parse((await P.handler({ httpMethod: 'GET', queryStringParameters: { restaurant: '11111111-1111-4111-8111-111111111111', datum: '2026-12-31' } })).body);
    t('gibt nur Zahlen heraus: plaetze 10, frei 2', p1.ok && p1.plaetze === 10 && p1.frei === 2 && Object.keys(p1).sort().join(',') === 'frei,ok,plaetze', JSON.stringify(p1));
    welt({ aktionKaputt: true });
    var p2 = JSON.parse((await P.handler({ httpMethod: 'GET', queryStringParameters: { restaurant: '11111111-1111-4111-8111-111111111111', datum: '2026-12-31' } })).body);
    t('nicht zählbar: plaetze null -- die Seite zeigt dann keine Zahl', p2.ok && p2.plaetze === null && p2.frei === undefined, JSON.stringify(p2));
    var p3 = await P.handler({ httpMethod: 'GET', queryStringParameters: { restaurant: '11111111-1111-4111-8111-111111111111', datum: '31.12.' } });
    t('Unsinn im Datum: 400', p3.statusCode === 400, p3.statusCode);

    console.log('\n-- 3. Der Server nimmt nicht mehr an, als frei ist --');
    var G = require('../netlify/functions/reservation-guest.js');
    var tag = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    async function buchen(o, personen, notes) {
        welt(o);
        var w = console.warn, l = console.log; console.warn = function () {}; console.log = function () {};
        try {
            var r = await G.handler({ httpMethod: 'POST', body: JSON.stringify({ restaurant_id: '11111111-1111-4111-8111-111111111111', guest_name: 'Ayse', guest_phone: '0176 1', party_size: personen, reservation_date: tag, reservation_time: '19:00', notes: notes || '' }) });
            return { code: r.statusCode, body: JSON.parse(r.body), gespeichert: o.gespeichert || null };
        } finally { console.warn = w; console.log = l; }
    }
    var b1 = await buchen({ abend: abend, res: [{ party_size: 7, status: 'confirmed' }] }, 4);
    t('4 Personen bei 3 freien: 409, nichts gespeichert, mit "frei: 3"', b1.code === 409 && b1.body.kontingent === true && b1.body.frei === 3 && b1.gespeichert === null, JSON.stringify(b1));
    var b2 = await buchen({ abend: abend, res: [{ party_size: 7, status: 'confirmed' }] }, 3);
    t('3 Personen bei 3 freien: geht durch', b2.code === 200 && b2.gespeichert && b2.gespeichert.party_size === 3, JSON.stringify(b2.body));
    var b3 = await buchen({ abend: abend, res: [{ party_size: 10, status: 'confirmed' }] }, 2, '[Warteliste] Silvester');
    t('voller Abend: die Warteliste geht trotzdem durch (pending)', b3.code === 200 && b3.gespeichert && b3.gespeichert.status === 'pending', JSON.stringify(b3.body));
    var b4 = await buchen({ aktionKaputt: true }, 6);
    t('Plätze nicht lesbar: Reservierung geht durch (fällt offen aus)', b4.code === 200, JSON.stringify(b4.body));

    console.log('\n-- 4. Welche Aktion oben steht --');
    var ctx = 'var AKTION_TAGE_KURZ=["Mo","Di","Mi","Do","Fr","Sa","So"],AKTION_TAGE_LANG=[];' + fn('aktionWochentag') + fn('aktionZeitplanText') + fn('aktionDatumVon');
    var auswahl = new Function(ctx + 'var ABEND_TAGE_VORAUS = 120;' + fn('abendAktionen') + '; return abendAktionen;')();
    var heute = '2026-10-12';
    var liste = [
        { id: 'ladies', titel: 'Ladies Night', wochentage: [3], aktiv: true },
        { id: 'silv', titel: 'Silvester', datum: '2026-12-31', menue: 'Antipasti', aktiv: true },
        { id: 'leer', titel: 'Party', datum: '2026-11-01', aktiv: true },
        { id: 'alt', titel: 'Oktoberfest', datum: '2026-10-03', menue: 'Brezn', aktiv: true },
        { id: 'weit', titel: 'Ostern', datum: '2027-04-04', menue: 'Lamm', aktiv: true },
        { id: 'pause', titel: 'Weinabend', datum: '2026-11-20', plaetze: 30, aktiv: false }
    ];
    var gew = auswahl(liste, heute).map(function (a) { return a.id; });
    t('nur Silvester: einmalig, mit Menü, nicht vorbei, nicht zu weit voraus, nicht pausiert', gew.join(',') === 'silv', gew.join(','));
    t('am 31.12. noch da, am 1.1. weg', auswahl(liste, '2026-12-31').map(function (a) { return a.id; }).indexOf('silv') >= 0 && auswahl(liste, '2027-01-01').map(function (a) { return a.id; }).indexOf('silv') < 0, '');

    console.log('\n-- 5. Was der Gast liest --');
    var anker = new Function(fn('abendAnker') + '; return abendAnker;')();
    t('Sprungmarke: "Silvester 2026" passt auf #silvester und #silvester-2026', anker('Silvester 2026').join(' ') === 'silvester-2026 silvester' && anker('Silvester').join(' ') === 'silvester', anker('Silvester 2026').join(' '));
    var platz = new Function(fn('abendPlaetzeText') + '; return abendPlaetzeText;')();
    t('Restplätze: viele frei -> keine leer wirkende Zahl, wenige -> Zahl, keine -> Warteliste, unbekannt -> nichts',
      platz(45) === 'Noch Plätze frei' && platz(12) === 'Nur noch 12 Plätze frei' && platz(1) === 'Nur noch 1 Platz frei' && /Warteliste/.test(platz(0)) && platz(null) === '', [platz(45), platz(12), platz(0)].join(' | '));
    var preis = new Function(fn('abendPreis') + '; return abendPreis;')();
    t('Preis: "89 € pro Person", "89,50 € pro Person"', preis(89) === '89 € pro Person' && preis('89.5') === '89,50 € pro Person', preis(89) + ' / ' + preis('89.5'));
    var zeilen = new Function('escapeHtml', fn('abendZeilenHtml') + '; return abendZeilenHtml;')(esc);
    var abl = zeilen('19:00 Empfang mit Prosecco\n20.30 Uhr – Menü\nFeuerwerk um Mitternacht', true);
    t('Ablauf: Uhrzeit links, Text rechts (auch "20.30 Uhr –")', /<span class="abend-uhr">19:00<\/span><span>Empfang mit Prosecco<\/span>/.test(abl) && /<span class="abend-uhr">20:30<\/span><span>Menü<\/span>/.test(abl) && /<li>Feuerwerk um Mitternacht<\/li>/.test(abl), abl);
    t('Text des Wirts wird escapt', zeilen('<img src=x onerror=alert(1)>', false).indexOf('<img') < 0, zeilen('<img src=x>', false));
    var voll = 'Ausgebucht';
    var vt = new Function(fn('reservierungVollText') + '; return reservierungVollText;')();
    t('Server sagt "nur noch 3": der Gast liest das, nicht "ausgebucht"', /nur noch 3 Plätze frei/.test(vt({ ausgebucht: true, kontingent: true, frei: 3, titel: 'Silvester' })) && vt({ ausgebucht: true }).indexOf(voll) === 0, '');

    console.log('\n-- 6. Verdrahtung --');
    t('der Block sitzt GANZ OBEN (vor Tagesangeboten und Aktionen) und wird gefüllt', H.indexOf('<div id="lpAbend"></div>') > 0 && H.indexOf('<div id="lpAbend"></div>') < H.indexOf('<div id="lpSpecials"></div>') && /renderRestaurantAbend\(rest\.id\)/.test(H), '');
    t('Reservieren aus dem Block: der Tag ist schon gewählt', /function openReservation\(restaurantId, datum\)/.test(H) && /resCalSelectDate\(datum\);/.test(fn('openReservation')), '');
    var zr = new Function('window', fn('ausgebuchtZeitraeume') + '; return ausgebuchtZeitraeume;');
    var mitVoll = zr({ _abendVoll: { r1: [{ von: '2026-12-31', bis: '2026-12-31', titel: 'Silvester' }] } })({ id: 'r1', features: [] }, '2026-10-12');
    t('voller Abend = ausgebucht im Reservierungsfenster (Warteliste statt Uhrzeiten)', mitVoll.length === 1 && mitVoll[0].von === '2026-12-31', JSON.stringify(mitVoll));
    t('fehlt SQL 45, bleiben die übrigen Aktionen sichtbar (zweite Abfrage ohne die neuen Felder)', /if \(res\.status !== 400\)[\s\S]{0,120}return fetch\(basis \+ ende, kopf\)/.test(fn('aktionenLaden')), '');
    t('ohne SQL 45 und ohne Abend-Felder werden keine neuen Spalten mitgeschickt', /if \(menue \|\| ablauf \|\| preis != null \|\| plaetze != null \|\| wert\('akAbendVorher'\)\)/.test(fn('aktionAusFormular')) && /45-besonderer-abend\.sql/.test(fn('aktionAusFormular')), '');
    t('Vorlage "Silvester" im Dashboard, ohne erfundenes Menü', /aktionFormular\('silvester'\)/.test(H) && /silvester: \{ titel: 'Silvester'[^}]*menue: '', ablauf: ''/.test(H), '');
    t('Datenbank: Plätze nur für einen Abend mit Datum', /check \(plaetze is null or \(plaetze between 1 and 5000 and datum is not null\)\)/.test(SQL), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
