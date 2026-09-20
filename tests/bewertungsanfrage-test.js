// BEWERTUNGSANFRAGE -- die Funktion lief stuendlich und tat NICHTS.
//
// BEFUND (18./19.09.2026, postgres_logs von Supabase):
//
//     column orders.review_consent does not exist
//     column reservations.review_consent does not exist
//
// review-mail.js laeuft stuendlich und verschickt nur an Vorgaenge mit
// review_consent = true. Die Spalte gab es nicht, den Haken im Formular
// auch nicht. Es ist noch NIE eine Bewertungsanfrage rausgegangen -- und
// gemeldet hat sich das nie, weil die Funktion den Ausfall sauber
// wegfaengt und weiterlaeuft. Ein stiller Ausfall der gefaehrlichsten
// Sorte: sie lief, sie meldete nichts, sie tat nichts.
//
// WARUM DAS HAEKCHEN PFLICHT IST
//
// BGH 2018, VI ZR 225/17: eine Bewertungsbitte in einer
// Kundenzufriedenheits-Mail ist Werbung. Die Ausnahme in
// § 7 Abs. 3 UWG greift nur, wenn der Gast BEI der Adresserhebung
// hingewiesen wurde und widersprechen konnte. Ohne Haken keine Mail --
// sonst waere jede dieser Nachrichten abmahnfaehig, und zwar gegen
// Kiek mol in, nicht gegen den Wirt.
//
// WAS HIER AUSGEFUEHRT WIRD, nicht nur verglichen:
//   * der Ausdruck aus dem Bestellformular, mit gestelltem DOM
//   * der Ausdruck aus dem Reservierformular, ebenso
//   * sauber() aus reservation-guest.js
//   * die ALLOWED-Liste aus order-save.js
//   * der ganze reservation-guest-Handler mit gestellter Datenbank --
//     einmal mit fehlender Spalte. Die Reservierung MUSS trotzdem
//     durchgehen.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function lies(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

// lib/alarm zieht web-push nach, und das ist in der Testumgebung nicht
// installiert. Deshalb wird das Modul vorab in den require-Zwischenspeicher
// gelegt. Folge, und die gehoert dazugesagt: der Alarm-Weg selbst wird hier
// NICHT geprueft -- dafuer ist waechter-dienst-test.js da.
var alarmPfad = require.resolve(path.join(KMI, 'netlify', 'functions', 'lib', 'alarm.js'));
var alarmRufe = [];
require.cache[alarmPfad] = {
    id: alarmPfad, filename: alarmPfad, loaded: true, children: [], paths: [],
    exports: { alarm: function (titel) { alarmRufe.push(titel); return Promise.resolve(); } }
};

var H = lies(path.join(KMI, 'index.html'));
var OS = lies(path.join(KMI, 'netlify', 'functions', 'order-save.js'));
var RG = lies(path.join(KMI, 'netlify', 'functions', 'reservation-guest.js'));
var RM = lies(path.join(KMI, 'netlify', 'functions', 'review-mail.js'));
var SQL = lies(path.join(KMI, 'datenbank', '33-bewertungsanfrage.sql'));

// Eine Funktion aus dem Quelltext herausschneiden -- ueber die Klammern
// gezaehlt, nicht ueber eine Leerzeile geraten.
function schneide(quelle, kopf) {
    var i = quelle.indexOf(kopf);
    if (i < 0) return '';
    var j = quelle.indexOf('{', i), tiefe = 0;
    for (var k = j; k < quelle.length; k++) {
        if (quelle[k] === '{') tiefe++;
        else if (quelle[k] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, k + 1); }
    }
    return '';
}

// ====================================================================
console.log('\n-- 1. Das Haekchen steht im Formular, und zwar leer --');
// ====================================================================

// Nach der Kennung suchen, nicht nach der Reihenfolge der Attribute.
// Erste Fassung stand hier /<input type="checkbox" id="..."/ -- und ein
// eingeschobenes checked liess dann die FALSCHE Zusicherung anschlagen
// ("Kaestchen fehlt" statt "Kaestchen ist vorgesetzt"). Rot war beides,
// aber ein Test soll den Grund nennen, den er gefunden hat.
function kaestchen(id) {
    return (H.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>')) || [''])[0];
}
var kastenBestellung = kaestchen('checkoutReviewConsent');
var kastenReservierung = kaestchen('resReviewConsent');

t('im Bestellformular steht ein Kaestchen', kastenBestellung.length > 0, 'fehlt');
t('im Reservierformular steht eines', kastenReservierung.length > 0, 'fehlt');

// DAS ist die Zusicherung, auf die es ankommt. Ein vorgesetztes Haekchen
// ist nach DSGVO keine Einwilligung (EuGH C-673/17, Planet49).
t('das Kaestchen beim Bestellen ist NICHT vorgesetzt',
  kastenBestellung.indexOf('checked') < 0, kastenBestellung);
t('das Kaestchen beim Reservieren ist NICHT vorgesetzt',
  kastenReservierung.indexOf('checked') < 0, kastenReservierung);

// Der Gast muss lesen koennen, worauf er sich einlaesst.
t('beim Bestellen steht dabei, dass es genau eine Mail ist',
  /Genau eine Mail, kein Newsletter/.test(H), 'kein Hinweis auf die Anzahl');
t('und wie man widerruft',
  (H.match(/widerrufen kannst du jederzeit an info@kiekmolin\.de/g) || []).length === 2,
  'Widerrufsweg fehlt in einem der beiden Formulare');
t('beide Kaestchen haben ein label mit for=',
  /<label for="checkoutReviewConsent"/.test(H) && /<label for="resReviewConsent"/.test(H),
  'ohne label ist es fuer Screenreader stumm');

// ====================================================================
console.log('\n-- 2. Der Wert wird ausgerechnet, nicht geraten --');
// ====================================================================

// Gestelltes DOM: nur die zwei Felder, die der Ausdruck anfasst.
function domMit(felder) {
    return { getElementById: function (id) { return felder[id] || null; } };
}

// Den Ausdruck hinter "feld:" herausholen -- ueber die Klammern gezaehlt.
// Ein /.../-Muster mit "))" davor ist hier dreimal danebengegangen, weil
// die eine Fassung auf .trim()) endet und die andere auf .value).
function ausdruck(quelle, feld, name) {
    var i = quelle.indexOf(feld + ': !!(');
    if (i < 0) return null;
    var start = i + feld.length + 2;
    var tiefe = 0, ende = -1;
    for (var k = start; k < quelle.length; k++) {
        if (quelle[k] === '(') tiefe++;
        else if (quelle[k] === ')') { tiefe--; if (tiefe === 0) { ende = k + 1; break; } }
    }
    if (ende < 0) return null;
    var text = quelle.slice(start, ende).trim();
    try { return new Function('document', 'return ' + text + ';'); }
    catch (e) { console.log('     (' + name + ' nicht auswertbar: ' + e.message + ')'); return null; }
}

var fBestellung = ausdruck(H, 'review_consent', 'Bestellung');
t('der Ausdruck aus dem Bestellformular ist auswertbar', typeof fBestellung === 'function');

if (fBestellung) {
    t('Haken + Adresse -> true',
      fBestellung(domMit({ checkoutReviewConsent: { checked: true }, checkoutEmail: { value: ' a@b.de ' } })) === true);
    t('Haken OHNE Adresse -> false (Einwilligung ins Leere)',
      fBestellung(domMit({ checkoutReviewConsent: { checked: true }, checkoutEmail: { value: '   ' } })) === false);
    t('Adresse ohne Haken -> false',
      fBestellung(domMit({ checkoutReviewConsent: { checked: false }, checkoutEmail: { value: 'a@b.de' } })) === false);
    t('gar kein Feld da -> false statt Absturz',
      fBestellung(domMit({})) === false);
}

var fReservierung = ausdruck(H, 'reviewConsent', 'Reservierung');
t('der Ausdruck aus dem Reservierformular ist auswertbar', typeof fReservierung === 'function');

if (fReservierung) {
    t('Haken + Adresse -> true',
      fReservierung(domMit({ resReviewConsent: { checked: true }, guestEmail: { value: 'a@b.de' } })) === true);
    t('Haken OHNE Adresse -> false',
      fReservierung(domMit({ resReviewConsent: { checked: true }, guestEmail: { value: '' } })) === false);
    t('Adresse ohne Haken -> false',
      fReservierung(domMit({ resReviewConsent: { checked: false }, guestEmail: { value: 'a@b.de' } })) === false);
    t('gar kein Feld da -> false statt Absturz', fReservierung(domMit({})) === false);
}

t('die Reservierung schickt das Feld auch an die Servertuer',
  /review_consent: reservation\.reviewConsent === true/.test(H), 'wird nie uebertragen');

// ====================================================================
console.log('\n-- 3. Die Servertuer nimmt es an, aber nur echt --');
// ====================================================================

var quellSauber = schneide(RG, 'function sauber(r)');
t('sauber() ist herausschneidbar', quellSauber.length > 100, quellSauber.length);

var sauber = null;
try {
    sauber = vm.runInNewContext('(' + quellSauber + ')', { parseInt: parseInt, String: String });
} catch (e) { console.log('     (sauber nicht ausfuehrbar: ' + e.message + ')'); }

t('sauber() ist ausfuehrbar', typeof sauber === 'function');

if (sauber) {
    var basis = { restaurant_id: 'r1', guest_name: 'Ibo', guest_phone: '0491', party_size: 2,
                  reservation_date: '2026-10-01', reservation_time: '19:00' };
    function mit(extra) {
        var o = {}; Object.keys(basis).forEach(function (k) { o[k] = basis[k]; });
        Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
        return sauber(o);
    }
    t('true + Adresse wird uebernommen',
      mit({ review_consent: true, guest_email: 'a@b.de' }).review_consent === true);
    t('true ohne Adresse wird zu false',
      mit({ review_consent: true, guest_email: '' }).review_consent === false);
    t('der Text "ja" gilt NICHT als Einwilligung',
      mit({ review_consent: 'ja', guest_email: 'a@b.de' }).review_consent === false,
      'ein wahrheitsaehnlicher Wert kommt durch');
    t('die Zahl 1 gilt ebenfalls nicht',
      mit({ review_consent: 1, guest_email: 'a@b.de' }).review_consent === false);
    t('ohne Angabe: false',
      mit({ guest_email: 'a@b.de' }).review_consent === false);
    t('das Feld ist immer dabei -- nie undefined',
      mit({}).review_consent === false, mit({}).review_consent);
}

// order-save: die Liste der erlaubten Spalten wirklich auswerten.
var mListe = OS.match(/var ALLOWED = \[([\s\S]*?)\];/);
var ALLOWED = mListe ? vm.runInNewContext('[' + mListe[1] + ']', {}) : null;
t('die ALLOWED-Liste aus order-save ist auswertbar', Array.isArray(ALLOWED), ALLOWED);
if (ALLOWED) {
    t('review_consent steht drin -- sonst wirft order-save es weg',
      ALLOWED.indexOf('review_consent') > -1, ALLOWED.join(','));
    t('customer_email steht weiter drin (nichts kaputt gemacht)',
      ALLOWED.indexOf('customer_email') > -1);
}

// ====================================================================
console.log('\n-- 4. Eine fehlende Spalte darf keinen Gast kosten --');
// ====================================================================

// Der ganze Handler, mit gestellter Datenbank. Die erste Antwort auf das
// POST ist genau die, die Postgres schickt, wenn die Spalte fehlt.
function morgen() {
    return new Date(Date.now() + 36 * 3600000).toISOString().slice(0, 10);
}

async function reserviereMit(spalteFehlt) {
    var protokoll = [];
    var altFetch = global.fetch;
    var altKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_SERVICE_KEY = 'dienst-schluessel';
    delete require.cache[require.resolve(path.join(KMI, 'netlify', 'functions', 'reservation-guest.js'))];

    var postZaehler = 0;
    global.fetch = function (url, opt) {
        var o = opt || {}, methode = o.method || 'GET';
        protokoll.push({ url: String(url), methode: methode, body: o.body });

        function antwort(status, koerper) {
            return Promise.resolve({
                ok: status >= 200 && status < 300,
                status: status,
                json: function () { return Promise.resolve(koerper); },
                text: function () { return Promise.resolve(JSON.stringify(koerper)); }
            });
        }
        if (/restaurants\?/.test(url)) return antwort(200, [{ id: 'r1', name: 'Test', features: [] }]);
        if (methode === 'GET' && /reservations\?/.test(url)) return antwort(200, []);
        if (methode === 'POST' && /reservations$/.test(url)) {
            postZaehler++;
            var gesendet = JSON.parse(o.body);
            if (spalteFehlt && Object.prototype.hasOwnProperty.call(gesendet, spalteFehlt)) {
                return antwort(400, { code: 'PGRST204',
                    message: "Could not find the '" + spalteFehlt + "' column of 'reservations' in the schema cache" });
            }
            return antwort(201, [{ id: 'neu-1', track_token: 'geheim', status: 'pending' }]);
        }
        return antwort(200, []);
    };

    try {
        var modul = require(path.join(KMI, 'netlify', 'functions', 'reservation-guest.js'));
        var e = await modul.handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                restaurant_id: 'r1', guest_name: 'Ibo', guest_phone: '049311234',
                // Morgen, nicht 2030: die Servertuer weist alles ab, was mehr
                // als ein Jahr voraus liegt.
                party_size: 2, reservation_date: morgen(), reservation_time: '19:00',
                guest_email: 'ibo@example.de', review_consent: true
            })
        });
        return { antwort: e, protokoll: protokoll, posts: postZaehler };
    } finally {
        global.fetch = altFetch;
        if (altKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
        else process.env.SUPABASE_SERVICE_KEY = altKey;
    }
}

(async function () {
    // a) Spalte ist da: durchgeschrieben, mit Einwilligung.
    var a = await reserviereMit(null);
    t('mit vorhandener Spalte: Reservierung geht durch', a.antwort.statusCode === 200, a.antwort.statusCode);
    var gesendetA = JSON.parse(a.protokoll.filter(function (r) {
        return r.methode === 'POST'; })[0].body);
    t('und die Einwilligung steht im Datensatz', gesendetA.review_consent === true, gesendetA.review_consent);
    t('genau ein POST -- kein Wiederholen ohne Grund', a.posts === 1, a.posts);

    // b) Spalte fehlt noch: MUSS trotzdem durchgehen, nur ohne das Feld.
    var b = await reserviereMit('review_consent');
    t('fehlende Spalte review_consent: die Reservierung geht TROTZDEM durch',
      b.antwort.statusCode === 200, b.antwort.statusCode + ' ' + b.antwort.body);
    t('sie wurde zweimal versucht -- einmal ohne das Feld', b.posts === 2, b.posts);
    var letzter = JSON.parse(b.protokoll.filter(function (r) { return r.methode === 'POST'; }).pop().body);
    t('im zweiten Versuch fehlt das Feld',
      !Object.prototype.hasOwnProperty.call(letzter, 'review_consent'), Object.keys(letzter).join(','));
    t('der Name steht noch drin -- nur das eine Feld ist weg',
      letzter.guest_name === 'Ibo', letzter.guest_name);
    var koerperB = JSON.parse(b.antwort.body);
    t('der Gast bekommt sein Verfolgen-Geheimnis', koerperB.track_token === 'geheim', koerperB.track_token);

    // c) Fehlt dagegen ein PFLICHTFELD, darf NICHT stillschweigend
    //    gespeichert werden -- dann ist die Tabelle kaputt.
    var c = await reserviereMit('guest_name');
    t('fehlt guest_name in der Tabelle, wird NICHT ohne den Namen gespeichert',
      c.antwort.statusCode === 502, c.antwort.statusCode);
    t('und es bleibt bei einem Versuch', c.posts === 1, c.posts);

    // ================================================================
    console.log('\n-- 5. review-mail bleibt an die Einwilligung gebunden --');
    // ================================================================

    t('die Reservierungs-Abfrage verlangt review_consent=is.true',
      /reservations\?[\s\S]{0,400}review_consent=is\.true/.test(RM), 'Filter fehlt');
    t('die Bestell-Abfrage ebenso',
      /orders\?[\s\S]{0,200}review_consent=is\.true/.test(RM), 'Filter fehlt');
    t('das BGH-Urteil steht als Begruendung im Quelltext',
      RM.indexOf('VI ZR 225/17') > -1, 'keine Begruendung');

    // ================================================================
    console.log('\n-- 6. Datenbank und Datenschutzerklaerung --');
    // ================================================================

    ['orders', 'reservations'].forEach(function (tab) {
        t(tab + ': review_consent wird angelegt',
          new RegExp('alter table public\\.' + tab + '\\s+add column if not exists review_consent boolean').test(SQL),
          'fehlt');
        t(tab + ': review_email_sent_at wird angelegt',
          new RegExp('alter table public\\.' + tab + '\\s+add column if not exists review_email_sent_at timestamptz').test(SQL),
          'fehlt');
    });
    t('zweimal einspielen ist harmlos (if not exists ueberall)',
      (SQL.match(/add column if not exists/g) || []).length === 4, 'nicht alle vier abgesichert');
    t('die Voreinstellung ist false, nicht true',
      !/review_consent boolean[^;]*default true/i.test(SQL), 'default true waere eine erschlichene Einwilligung');
    t('es gibt einen Index fuer genau die Abfrage von review-mail',
      /create index if not exists orders_bewertungsanfrage_idx/.test(SQL)
      && /create index if not exists reservations_bewertungsanfrage_idx/.test(SQL), 'fehlt');

    t('die Datenschutzerklaerung nennt die Bewertungsanfrage',
      /<strong>Bewertungsanfrage:<\/strong>/.test(H), 'steht nicht drin');
    t('mit Rechtsgrundlage',
      /Bewertungsanfrage[\s\S]{0,400}Art\. 6 Abs\. 1 lit\. a DSGVO/.test(H), 'keine Rechtsgrundlage');
    t('und mit dem Widerrufsweg',
      /Bewertungsanfrage[\s\S]{0,500}Widerruf jederzeit an info@kiekmolin\.de/.test(H), 'kein Widerruf');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
