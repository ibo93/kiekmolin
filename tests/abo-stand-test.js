// WER HAT BEZAHLT? -- und warum die Antwort vorher gelogen hat.
//
// DER BEFUND, den dieser Test festhaelt (25.09.2026):
//
//   customers.payment_status wurde an acht Stellen GELESEN und nur an
//   zwei gesetzt -- 'pending' beim Anlegen, 'paid' wenn Ibo von Hand
//   drueckte. Auf 'overdue' hat sie NIRGENDS jemand gesetzt. Der Zaehler
//   "Ueberfaellig" stand deshalb immer auf 0. next_payment_date wurde
//   einmal geschrieben und nie gelesen.
//
// Ibo: "stripe ist besser so komme ich auch rein dann laeuft es auf eine
// ebene".
//
// WAS DIESER TEST VERTEIDIGT:
//
//   1. "active" heisst NICHT bezahlt. Bei Rechnung statt Lastschrift
//      bleibt das Abo aktiv, waehrend die Rechnung offen daliegt.
//   2. Ohne Messung gibt es kein Gruen. Kein Stripe-Schluessel, Stripe
//      stumm, Abo unbekannt -> "unbekannt", niemals "bezahlt".
//   3. Ein 'unbekannt' ueberschreibt nichts in der Datenbank.
//   4. Der Webhook hoert auf invoice.payment_failed -- das war der
//      blinde Fleck.
//   5. Die Abschaltknoepfe stehen NUR bei denen, die nicht bezahlt
//      haben.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const KMI = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
const WH = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'stripe-webhook.js'), 'utf8');
const ZS = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'zahlsperre.js'), 'utf8');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

// Der Dienstschluessel wird in abo-stand.js BEIM LADEN gelesen, nicht
// beim Aufruf. Also muss er vor dem require dastehen -- sonst antwortet
// die Function 500 "nicht eingerichtet", und der Test misst das statt
// dessen, was er messen will.
process.env.SUPABASE_SERVICE_KEY = 'test-dienst';

// ---- Stripe durch eine Attrappe ersetzen, BEVOR abo-stand geladen wird.
// Sonst braeuchte der Test einen echten Schluessel und ein Netz.
//
// UND OHNE DAS ECHTE PAKET. Am 25.09.2026 stand hier zuerst
// require.resolve('stripe') und der Cache-Trick darauf. Bei mir lief das
// -- node_modules/stripe lag auf der Platte. Auf dem Bauserver nicht:
// die Reihe wird dort mit "node tests/run-all.js" gestartet, ohne npm
// install. Ergebnis:
//
//     abo-stand-test.js  -  ABGESTUERZT (kein einziger Test gelaufen)
//     Error: Cannot find module 'stripe'
//
// 74 Tests, die bei mir gruen waren und dort nie liefen. Ein Test, der
// nur auf einem Rechner laeuft, ist kein Test.
//
// Deshalb wird jetzt das LADEN abgefangen, nicht der Cache gefuellt:
// require('stripe') bekommt die Attrappe, egal ob das Paket existiert.
let STRIPE_ANTWORT = { data: [] };
let STRIPE_WIRFT = null;
const STRIPE_ATTRAPPE = function () {
    return { subscriptions: { list: async function () {
        if (STRIPE_WIRFT) throw new Error(STRIPE_WIRFT);
        return STRIPE_ANTWORT;
    } } };
};
let attrappeBenutzt = false;
const echtesLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'stripe') { attrappeBenutzt = true; return STRIPE_ATTRAPPE; }
    return echtesLaden.apply(this, arguments);
};

const AS = require(path.join(KMI, 'netlify', 'functions', 'abo-stand.js'));
const VERWALTER = require(path.join(KMI, 'netlify', 'functions', 'lib', 'verwalter.js'));

t('der Test laeuft OHNE das echte stripe-Paket (der Bauserver hat keines)',
  attrappeBenutzt === true, 'echtes Paket geladen -- faellt in CI aus');

// ===========================================================================
console.log('-- 1. Die Uebersetzung: Stripe-Zustand -> Entscheidung --');
// ===========================================================================
const FAELLE = [
    [{ status: 'active',   latest_invoice: { status: 'paid' } },  'bezahlt'],
    [{ status: 'active',   latest_invoice: { status: 'open' } },  'offen'],
    [{ status: 'active',   latest_invoice: { status: 'draft' } }, 'offen'],
    [{ status: 'active',   latest_invoice: { status: 'uncollectible' } }, 'ueberfaellig'],
    [{ status: 'active' },                                        'bezahlt'],
    [{ status: 'trialing' },                                      'testphase'],
    [{ status: 'past_due' },                                      'ueberfaellig'],
    [{ status: 'unpaid' },                                        'ueberfaellig'],
    [{ status: 'incomplete' },                                    'offen'],
    [{ status: 'incomplete_expired' },                            'gekuendigt'],
    [{ status: 'canceled' },                                      'gekuendigt'],
    [{ status: 'paused' },                                        'pausiert'],
    [{ status: 'active', pause_collection: { behavior: 'void' } }, 'pausiert'],
    [{ status: 'irgendwas_neues' },                               'unbekannt'],
    [null,                                                        'unbekannt']
];
FAELLE.forEach(function (f) {
    const erg = AS._standAus(f[0]);
    t((f[0] ? (f[0].status + (f[0].latest_invoice ? '+' + f[0].latest_invoice.status : '')
        + (f[0].pause_collection ? '+pause' : '')) : 'null') + ' -> ' + f[1],
      erg.stand === f[1], erg.stand);
});

// DER WICHTIGSTE EINZELFALL. Bei Rechnung statt Lastschrift
// (collection_method: send_invoice) bleibt das Abo "active", waehrend
// die Rechnung offen daliegt. Wer nur auf den Abo-Zustand schaut, sieht
// gruen in genau dem Zeitraum, in dem das Geld fehlt.
t('"active" allein macht NICHT bezahlt -- die Rechnung zaehlt mit',
  AS._standAus({ status: 'active', latest_invoice: { status: 'open' } }).stand === 'offen'
  && AS._standAus({ status: 'active', latest_invoice: { status: 'paid' } }).stand === 'bezahlt',
  'Rechnung wird ignoriert');
t('und jeder gesperrte Zustand nennt einen Grund',
  ['past_due', 'unpaid', 'incomplete', 'canceled'].every(function (st) {
      return String(AS._standAus({ status: st }).grund || '').length > 5; }), 'Grund fehlt');

console.log('\n-- 2. Seit wann offen --');
const tg = 86400;
const jetzt = Math.floor(Date.now() / 1000);
t('aus dem Faelligkeitsdatum der Rechnung',
  AS._offenSeitTagen({ latest_invoice: { due_date: jetzt - 12 * tg } }) === 12,
  String(AS._offenSeitTagen({ latest_invoice: { due_date: jetzt - 12 * tg } })));
t('noch nicht faellig ergibt 0, nicht minus',
  AS._offenSeitTagen({ latest_invoice: { due_date: jetzt + 5 * tg } }) === 0,
  String(AS._offenSeitTagen({ latest_invoice: { due_date: jetzt + 5 * tg } })));
t('ohne Rechnung: null, nicht 0 -- das ist ein Unterschied',
  AS._offenSeitTagen({ status: 'active' }) === null,
  String(AS._offenSeitTagen({ status: 'active' })));

// ===========================================================================
console.log('\n-- 3. Nur der Verwalter, im Zweifel nein --');
// ===========================================================================
const echtesFetch = global.fetch;
function mitFetch(fn, tu) {
    global.fetch = fn;
    return tu().then(function (r) { global.fetch = echtesFetch; return r; },
                     function (e) { global.fetch = echtesFetch; throw e; });
}
function ereignis(extra) {
    return Object.assign({ httpMethod: 'POST', headers: { authorization: 'Bearer tok' }, body: '{}' }, extra || {});
}
// Ein fetch, das den Verwalter bestaetigt und die Kundenliste liefert.
function fetchMitKunden(kunden, gemerkt) {
    return async function (url, opt) {
        url = String(url);
        if (url.indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'ibo@x.de' }) };
        if (url.indexOf('role=eq.superadmin') >= 0) return { ok: true, json: async () => [{ email: 'ibo@x.de' }] };
        if (url.indexOf('/rest/v1/customers') >= 0 && opt && opt.method === 'PATCH') {
            if (gemerkt) gemerkt.push(JSON.parse(opt.body)); return { ok: true, text: async () => '' };
        }
        if (url.indexOf('/rest/v1/customers') >= 0) return { ok: true, json: async () => kunden };
        return { ok: false, status: 404, text: async () => '' };
    };
}

(async function () {
    t('ohne Token: nein',
      (await VERWALTER.istSuperadmin('', 'k')) === false);
    let r = await mitFetch(async function () { throw new Error('Netz weg'); },
        function () { return VERWALTER.istSuperadmin('tok', 'k'); });
    t('Supabase nicht erreichbar: nein (anders als bei der Zahlsperre selbst)', r === false, String(r));
    r = await mitFetch(async function (url) {
        if (String(url).indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'gast@x.de' }) };
        return { ok: true, json: async () => [] };          // nicht in customers als superadmin
    }, function () { return VERWALTER.istSuperadmin('tok', 'k'); });
    t('angemeldet ist nicht dasselbe wie berechtigt', r === false, String(r));

    let antwort = await mitFetch(async function (url) {
        if (String(url).indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'gast@x.de' }) };
        return { ok: true, json: async () => [] };
    }, function () { return AS.handler(ereignis()); });
    t('abo-stand weist einen Nicht-Verwalter mit 403 ab', antwort.statusCode === 403, String(antwort.statusCode));

    // =======================================================================
    console.log('\n-- 4. OHNE MESSUNG KEIN GRUEN --');
    // =======================================================================
    const KUNDEN = [
        { id: 'k1', name: 'Mit Abo',  restaurant_id: 'r1', payment_status: 'paid', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' },
        { id: 'k2', name: 'Ohne Abo', restaurant_id: 'r2', payment_status: 'paid', stripe_subscription_id: null }
    ];

    // a) Kein Stripe-Schluessel in Netlify
    delete process.env.STRIPE_SECRET_KEY;
    antwort = await mitFetch(fetchMitKunden(KUNDEN), function () { return AS.handler(ereignis()); });
    let j = JSON.parse(antwort.body);
    t('ohne STRIPE_SECRET_KEY kommt trotzdem eine Liste', antwort.statusCode === 200 && j.ok === true);
    t('aber stripe_erreichbar ist false und ein Hinweis steht dabei',
      j.stripe_erreichbar === false && /STRIPE_SECRET_KEY/.test(j.hinweis), j.hinweis);
    t('und KEIN einziger Kunde steht auf "bezahlt"',
      j.kunden.every(function (k) { return k.stand !== 'bezahlt'; }),
      JSON.stringify(j.kunden.map(function (k) { return k.stand; })));
    t('der mit Abo heisst "unbekannt", der ohne "kein_abo" -- das ist ein Unterschied',
      j.kunden[0].stand === 'unbekannt' && j.kunden[1].stand === 'kein_abo',
      j.kunden[0].stand + ' / ' + j.kunden[1].stand);

    // b) Stripe antwortet nicht
    process.env.STRIPE_SECRET_KEY = 'sk_test_attrappe';
    STRIPE_WIRFT = 'Stripe down';
    let gemerkt = [];
    antwort = await mitFetch(fetchMitKunden(KUNDEN, gemerkt), function () { return AS.handler(ereignis()); });
    j = JSON.parse(antwort.body);
    STRIPE_WIRFT = null;
    t('Stripe stumm -> "unbekannt", nicht "bezahlt"',
      j.kunden[0].stand === 'unbekannt' && j.stripe_erreichbar === false, j.kunden[0].stand);
    t('und der Grund steht dabei', /nicht erreichbar/.test(j.kunden[0].grund), j.kunden[0].grund);
    t('ein "unbekannt" ueberschreibt NICHTS in der Datenbank',
      gemerkt.length === 0, JSON.stringify(gemerkt));

    // c) Abo bei uns hinterlegt, Stripe kennt es nicht
    STRIPE_ANTWORT = { data: [] };
    gemerkt = [];
    antwort = await mitFetch(fetchMitKunden(KUNDEN, gemerkt), function () { return AS.handler(ereignis()); });
    j = JSON.parse(antwort.body);
    t('Abo bei Stripe nicht gefunden -> "unbekannt", kein Gruen',
      j.kunden[0].stand === 'unbekannt', j.kunden[0].stand);
    t('und auch das merkt sich nichts', gemerkt.length === 0, JSON.stringify(gemerkt));

    // =======================================================================
    console.log('\n-- 5. Und wenn Stripe antwortet, stimmt es --');
    // =======================================================================
    STRIPE_ANTWORT = { data: [{
        id: 'sub_1', status: 'past_due', current_period_end: jetzt + 3 * tg,
        latest_invoice: { status: 'open', due_date: jetzt - 9 * tg, amount_due: 5990,
                          hosted_invoice_url: 'https://invoice.stripe.com/abc' }
    }] };
    gemerkt = [];
    antwort = await mitFetch(fetchMitKunden(KUNDEN, gemerkt), function () { return AS.handler(ereignis()); });
    j = JSON.parse(antwort.body);
    const k1 = j.kunden[0];
    t('past_due wird als ueberfaellig gemeldet', k1.stand === 'ueberfaellig', k1.stand);
    t('mit der Anzahl Tage', k1.offen_seit_tagen === 9, String(k1.offen_seit_tagen));
    t('mit dem Betrag in Euro, nicht in Cent', k1.betrag === 59.9, String(k1.betrag));
    t('und mit dem Link in die echte Rechnung ("so komme ich auch rein")',
      k1.rechnung_url === 'https://invoice.stripe.com/abc', String(k1.rechnung_url));
    t('der Link kommt von Stripe und wird nicht selbst gebaut',
      !/stripe\.com\/invoices\/' \+|dashboard\.stripe\.com/.test(
          fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'abo-stand.js'), 'utf8')),
      'URL zusammengebastelt');
    t('JETZT wird auch gemerkt -- payment_status overdue',
      gemerkt.length === 1 && gemerkt[0].payment_status === 'overdue', JSON.stringify(gemerkt));
    t('gemessen_am traegt eine Uhrzeit', !!Date.parse(j.gemessen_am), String(j.gemessen_am));

    // Ein Fehler beim Merken darf die Antwort nicht kippen.
    antwort = await mitFetch(async function (url, opt) {
        url = String(url);
        if (url.indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'ibo@x.de' }) };
        if (url.indexOf('role=eq.superadmin') >= 0) return { ok: true, json: async () => [{ email: 'ibo@x.de' }] };
        if (opt && opt.method === 'PATCH') return { ok: false, status: 500, text: async () => 'kaputt' };
        return { ok: true, json: async () => KUNDEN };
    }, function () { return AS.handler(ereignis()); });
    j = JSON.parse(antwort.body);
    t('misslingt das Merken, steht der gemessene Stand trotzdem da',
      antwort.statusCode === 200 && j.kunden[0].stand === 'ueberfaellig' && j.gemerkt === 0,
      antwort.statusCode + ' ' + j.kunden[0].stand);

    // EIN Aufruf bei Stripe, nicht einer je Kunde.
    const quelle = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'abo-stand.js'), 'utf8');
    t('Stripe wird EINMAL gefragt, nicht je Kunde',
      /subscriptions\.list\(/.test(quelle) && !/subscriptions\.retrieve\(/.test(quelle),
      'eine Runde je Kunde');

    // =======================================================================
    console.log('\n-- 6. Der Webhook: der blinde Fleck --');
    // =======================================================================
    t('er hoert jetzt auf invoice.payment_failed',
      /invoice\.payment_failed/.test(WH), 'hoert weiter weg');
    t('und setzt dabei payment_status auf overdue',
      /payment_failed'[\s\S]{0,400}payment_status: 'overdue'/.test(WH), 'setzt nichts');
    t('er hoert auf invoice.paid',
      /invoice\.paid/.test(WH), 'fehlt');
    t('und nimmt das naechste Faelligkeitsdatum von Stripe',
      /obj\.period_end/.test(WH) && !/setMonth\(|\+ 30 \* 24/.test(WH),
      'rechnet selbst -- geht bei Jahresabos daneben');
    t('die Einrichtungsanleitung im Kopf nennt die neuen Ereignisse',
      /Events:[\s\S]{0,300}invoice\.payment_failed/.test(WH), 'Anleitung veraltet');
    t('gefiltert wird ueber stripe_customer_id (eine Rechnung hat kein Abo-Feld)',
      /payment_failed'[\s\S]{0,400}stripe_customer_id=eq\./.test(WH), 'falscher Filter');

    // =======================================================================
    console.log('\n-- 7. EINE Verwalter-Pruefung, nicht zwei --');
    // =======================================================================
    t('zahlsperre benutzt dieselbe Pruefung',
      /require\('\.\/lib\/verwalter'\)/.test(ZS), 'eigene Fassung');
    t('und hat keine eigene mehr',
      !/async function istSuperadmin/.test(ZS), 'doppelt');
    t('abo-stand auch', /require\('\.\/lib\/verwalter'\)/.test(quelle), 'eigene Fassung');

    // =======================================================================
    console.log('\n-- 8. Der Bildschirm luegt nicht mehr --');
    // =======================================================================
    const welt = { window: {}, console: console, APP_DATA: { restaurants: [] } };
    welt.window = welt;
    vm.createContext(welt);
    vm.runInContext(H.slice(H.indexOf('var ABO_ANZEIGE = {'),
                            H.indexOf('async function aboStandHolen()')), welt);

    t('gemessen "bezahlt" zaehlt als paid',
      welt.aboStandWort({ _aboStand: { stand: 'bezahlt' } }) === 'paid');
    t('gemessen "ueberfaellig" zaehlt als overdue',
      welt.aboStandWort({ _aboStand: { stand: 'ueberfaellig' } }) === 'overdue');
    // Das war der Kern des Fehlers: ein gekuendigter oder unbekannter
    // Kunde darf in KEINER der drei Zahlen auftauchen, sonst ist eine
    // davon falsch.
    ['gekuendigt', 'pausiert', 'kein_abo', 'unbekannt'].forEach(function (st) {
        t('"' + st + '" zaehlt in keinem der drei Kaesten mit',
          welt.aboStandWort({ _aboStand: { stand: st } }) === null,
          String(welt.aboStandWort({ _aboStand: { stand: st } })));
    });
    t('ohne Messung zaehlt der gespeicherte Wert weiter -- WENN ein Abo da ist',
      welt.aboStandWort({ payment_status: 'overdue', stripe_subscription_id: 'sub_x' }) === 'overdue');
    t('aber Datenmuell zaehlt nirgends',
      welt.aboStandWort({ payment_status: 'irgendwas', stripe_subscription_id: 'sub_x' }) === null);
    t('und ohne Abo zaehlt er nirgends mit, auch bei "paid" im Feld',
      welt.aboStandWort({ payment_status: 'paid', stripe_subscription_id: null }) === null,
      String(welt.aboStandWort({ payment_status: 'paid', stripe_subscription_id: null })));

    // DIE EIGENSCHAFT, die den Widerspruch vom 25.09. fuer immer
    // ausschliesst: die Zeile und die Zahl duerfen ueber denselben
    // Kunden nie etwas Verschiedenes behaupten. Alle Kombinationen.
    var STAENDE = ['bezahlt','testphase','offen','ueberfaellig','pausiert','gekuendigt','kein_abo','unbekannt', null];
    var FELDER  = ['paid','pending','overdue','', null];
    var ABOS    = ['sub_x', null];
    var streit = [];
    STAENDE.forEach(function (st) { FELDER.forEach(function (f) { ABOS.forEach(function (ab) {
        var c = { payment_status: f, stripe_subscription_id: ab };
        if (st) c._aboStand = { stand: st };
        var wort = welt.aboStandWort(c);
        var text = welt.aboAnzeige(c).text;
        // Wer als "bezahlt" MITGEZAEHLT wird, darf in der Zeile nicht
        // "Kein Abo", "Gekuendigt" oder "Unbekannt" heissen.
        if (wort === 'paid' && /Kein Abo|Gekündigt|Unbekannt|Überfällig/.test(text)) {
            streit.push(JSON.stringify(c) + ' -> Zahl: ' + wort + ' / Zeile: ' + text);
        }
        if (wort === 'overdue' && /Bezahlt|Kein Abo/.test(text)) {
            streit.push(JSON.stringify(c) + ' -> Zahl: ' + wort + ' / Zeile: ' + text);
        }
    }); }); });
    t('Zeile und Zaehler widersprechen sich in KEINER Kombination (90 geprueft)',
      streit.length === 0, streit.slice(0, 3).join(' | '));

    let a = welt.aboAnzeige({ _aboStand: { stand: 'ueberfaellig', offen_seit_tagen: 9, grund: 'Zahlung fehlgeschlagen' } });
    t('ueberfaellig zeigt die Tage mit an', /9 Tage/.test(a.text), a.text);
    t('und den Grund', /fehlgeschlagen/.test(a.grundText), a.grundText);
    a = welt.aboAnzeige({ payment_status: 'paid', stripe_subscription_id: 'sub_x' });
    t('ein NICHT geprueftes "bezahlt" wird als ungeprueft gekennzeichnet',
      /ungeprüft/.test(a.text) && a.gemessen === false, a.text);
    t('und es ist nicht gruen -- gruen heisst gemessen',
      a.farbe !== 'var(--success)', a.farbe);
    a = welt.aboAnzeige({ payment_status: 'paid', stripe_subscription_id: null });
    t('ohne Abo heisst es "Kein Abo", egal was gespeichert steht',
      a.text === 'Kein Abo', a.text);

    // =======================================================================
    console.log('\n-- 9. Die Bruecke: Knoepfe nur, wo sie hingehoeren --');
    // =======================================================================
    const br = H.slice(H.indexOf('function zahlsperreBeimKunden'), H.indexOf('function renderCustomers()'));
    t('nur fuer den Verwalter', /istVerwalter\(\)/.test(br), 'jeder');
    t('nur bei offen oder ueberfaellig',
      /=== 'ueberfaellig' \|\| m === 'offen'/.test(br), 'auch bei bezahlt');
    t('aber eine bestehende Sperre bleibt immer erreichbar -- sonst kaeme er nicht mehr an den Aufmach-Knopf',
      /!faellig && jetzt === 'keine'/.test(br), 'nach der Zahlung eingesperrt');
    // Geprueft wird die EIGENSCHAFT, nicht der Wortlaut des Ausdrucks.
    //
    // Vorher stand hier /escapeHtml\(k\.hilfe\)/. Am 25.09.2026 kam die
    // Verriegelung dazu und daraus wurde escapeHtml(zu ? grund : k.hilfe)
    // -- dieselbe Absicht, anderes Muster, Test rot. Ein Test, der an
    // einer Schreibweise haengt, prueft die Schreibweise.
    t('was in title= landet, geht durch escapeHtml',
      /title="' \+ escapeHtml\(/.test(br), 'roh eingesetzt');
    t('und nach dem Setzen wird die Kundenliste mit aufgefrischt',
      /renderCustomers === 'function'[\s\S]{0,80}renderCustomers\(\)/.test(H), 'zwei Wahrheiten');
    t('der Rechnungslink oeffnet in einem neuen Fenster mit noopener',
      /rel="noopener"/.test(H.slice(H.indexOf('function aboRechnungLink'), H.indexOf('function zahlsperreBeimKunden'))),
      'ohne noopener');

    // =======================================================================
    console.log('\n-- 10. Die Auslieferung --');
    // =======================================================================
    const SW = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
    const WACHE = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'gastweg-wache.js'), 'utf8');
    const vSW = Number((SW.match(/kmi-shell-v(\d+)/) || [])[1]);
    const vW = Number((WACHE.match(/CACHE_MINDESTENS = (\d+)/) || [])[1]);
    t('neue Huellen-Nummer', vSW >= 52, 'v' + vSW);
    t('und die Wache verlangt dieselbe', vW === vSW, vSW + ' / ' + vW);

    console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.'
        : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    if (n - ok > 0) process.exitCode = 1;
})();
