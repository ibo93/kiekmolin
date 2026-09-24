// KOMMT UEBER DIE RESTAURANTSEITEN UEBERHAUPT JEMAND?
//
// Ibo am 24.09.2026: "wir muessen mehr Werbung machen und Kunden holen".
//
// Auf hunderten Restaurantseiten steht der gruene Kasten "Ist das dein
// Restaurant?" und zeigt auf /gastro. Niemand konnte sagen, ob er 10 oder
// 10.000 Mal gesehen wurde. Werbung ohne Zaehler ist Geld ausgeben mit
// verbundenen Augen -- hinterher weiss niemand, was gewirkt hat.
//
// Drei Schritte: gesehen -> geklickt -> gesendet.
//
// Geprueft wird durch AUSFUEHREN: die Function laeuft wirklich, mit
// gestelltem Supabase, und das Seitenskript wird in einem gestellten
// Browser abgespielt.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const KMI = path.join(__dirname, '..');
const FN = path.join(KMI, 'netlify', 'functions', 'lead-zaehler.js');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

// ---- 1. Die Function -------------------------------------------------
async function ruf(koerper, opt) {
    opt = opt || {};
    const gesendet = [];
    const altFetch = global.fetch;
    const altKey = process.env.SUPABASE_SERVICE_KEY;
    if (opt.ohneKey) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = 'service-key-test';
    delete require.cache[require.resolve(FN)];

    global.fetch = function (url, o) {
        gesendet.push({ url: String(url), body: JSON.parse((o || {}).body || '{}') });
        if (opt.wirft) return Promise.reject(new Error('socket hang up'));
        if (opt.fehltTabelle) {
            return Promise.resolve({
                ok: false, status: 404,
                text: function () { return Promise.resolve('{"message":"Could not find the function public.lead_zaehlen in the schema cache"}'); }
            });
        }
        return Promise.resolve({ ok: true, status: 204, text: function () { return Promise.resolve(''); } });
    };
    const modul = require(FN);
    try {
        const e = await modul.handler({ httpMethod: opt.methode || 'POST', body: JSON.stringify(koerper) });
        return { antwort: e, koerper: JSON.parse(e.body), gesendet: gesendet, modul: modul };
    } finally {
        global.fetch = altFetch;
        if (altKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
        else process.env.SUPABASE_SERVICE_KEY = altKey;
    }
}

(async function () {
    console.log('-- Die drei Schritte --');
    for (const schritt of ['gesehen', 'geklickt', 'gesendet']) {
        const r = await ruf({ slug: 'pizzeria-pronto-riepe', schritt: schritt });
        t(schritt + ' wird gezaehlt', r.koerper.ok === true, r.koerper);
        const ruf1 = r.gesendet[0];
        t(schritt + ': geht an die Hochzaehl-Funktion',
          ruf1 && /\/rest\/v1\/rpc\/lead_zaehlen$/.test(ruf1.url), ruf1 && ruf1.url);
        t(schritt + ': mit Seite und Schritt',
          ruf1 && ruf1.body.p_slug === 'pizzeria-pronto-riepe' && ruf1.body.p_schritt === schritt,
          ruf1 && ruf1.body);
    }

    console.log('\n-- Was NICHT gezaehlt wird --');
    const erfunden = await ruf({ slug: 'a', schritt: 'gekauft' });
    t('ein erfundener Schritt wird abgewiesen',
      erfunden.koerper.ok === false && erfunden.gesendet.length === 0, erfunden.koerper);
    // Was von aussen kommt, darf in der Datenbank nichts anlegen, was wir
    // nicht kennen.
    const boese = await ruf({ slug: 'A/../../etc/passwd?x=1 <script>', schritt: 'gesehen' });
    t('ein erfundener Seitenname wird auf Buchstaben und Ziffern gestutzt',
      boese.gesendet[0].body.p_slug === 'aetcpasswdx1script', boese.gesendet[0].body.p_slug);
    const leer = await ruf({ schritt: 'gesehen' });
    t('ohne Seitenname steht ein Strich drin, nicht leer',
      leer.gesendet[0].body.p_slug === '-', leer.gesendet[0].body.p_slug);

    console.log('\n-- Der Zaehler darf NIE eine Seite kaputtmachen --');
    // Eine Verkaufsseite, die wegen einer Zaehlung nicht laedt, waere der
    // teuerste Zaehler der Welt.
    const faelle = [
        ['fehlt das SQL noch', { fehltTabelle: true }],
        ['bricht die Verbindung weg', { wirft: true }],
        ['fehlt der Service-Key', { ohneKey: true }],
        ['kommt ein GET statt POST', { methode: 'GET' }]
    ];
    for (const [name, opt] of faelle) {
        const r = await ruf({ slug: 'x', schritt: 'gesehen' }, opt);
        t(name + ': trotzdem 200', r.antwort.statusCode === 200, r.antwort.statusCode);
        t(name + ': und ehrlich "nicht gezaehlt"', r.koerper.ok === false, r.koerper);
    }
    const ohneSql = await ruf({ slug: 'x', schritt: 'gesehen' }, { fehltTabelle: true });
    t('fehlt das SQL, sagt die Antwort genau das',
      /SQL 35/.test(ohneSql.koerper.grund || ''), ohneSql.koerper);

    const kaputt = await ruf(undefined, {});
    t('unlesbare Anfrage stuerzt nicht ab', kaputt.antwort.statusCode === 200, kaputt.antwort.statusCode);

    console.log('\n-- Das Skript auf der Restaurantseite --');
    const B = require(path.join(KMI, 'build-seo-pages.js'));
    const skript = B.zaehlSkript('cafe-test-norden');
    t('es laesst sich fehlerfrei einlesen', (function () {
        try { new vm.Script(skript.replace(/<\/?script>/g, '')); return true; } catch (e) { return false; }
    })(), 'SyntaxError');

    // Wirklich abspielen: ein gestellter Browser, und wir schauen zu.
    function spielen(userAgent, klicken) {
        const geschickt = [];
        const knopf = { zuhoerer: {}, addEventListener: function (art, fn) { this.zuhoerer[art] = fn; } };
        const welt = {
            navigator: {
                userAgent: userAgent,
                sendBeacon: function (url, blob) { geschickt.push({ url: url, daten: blob.teile }); return true; }
            },
            Blob: function (teile) { return { teile: JSON.parse(teile[0]) }; },
            document: { getElementById: function (id) { return id === 'inhaberKnopf' ? knopf : null; } },
            fetch: function () { return Promise.resolve({}); },
            console: console
        };
        vm.createContext(welt);
        vm.runInContext(skript.replace(/<\/?script>/g, ''), welt);
        if (klicken && knopf.zuhoerer.click) knopf.zuhoerer.click();
        return geschickt;
    }

    const mensch = spielen('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', false);
    t('ein Mensch loest "gesehen" aus',
      mensch.length === 1 && mensch[0].daten.schritt === 'gesehen', JSON.stringify(mensch));
    t('mit dem richtigen Seitennamen',
      mensch[0].daten.slug === 'cafe-test-norden', mensch[0].daten.slug);
    t('und per sendBeacon -- ein fetch waere beim Wegklicken abgebrochen',
      /lead-zaehler/.test(mensch[0].url), mensch[0].url);

    const geklickt = spielen('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', true);
    t('der Klick auf den Inhaber-Knopf zaehlt zusaetzlich',
      geklickt.length === 2 && geklickt[1].daten.schritt === 'geklickt', JSON.stringify(geklickt));
    // Seit dem 24.09.2026 gibt es ZWEI Stellen: die schmale Zeile oben bei
    // den Stammdaten und den Kasten unten. Beide muessen zaehlen -- sonst
    // sieht die Zahl nach der Umstellung schlechter aus, obwohl mehr
    // geklickt wurde, und man wuerde die Verbesserung zurueckdrehen.
    t('auch die Zeile oben zaehlt', /inhaberZeile/.test(skript), 'nur der Knopf unten');
    t('und beide ueber dieselbe Schleife -- keine zweite Fassung',
      /\["inhaberKnopf","inhaberZeile"\]\.forEach/.test(skript), 'zweimal ausgeschrieben');

    // Automaten wuerden die Zahl aufblaehen -- und Ibo richtete sein
    // Werbebudget an Maschinen aus.
    for (const bot of ['Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0)',
                       'HeadlessChrome/120', 'Mozilla/5.0 Yahoo! Slurp']) {
        t('"' + bot.slice(0, 22) + '" zaehlt NICHT mit', spielen(bot, true).length === 0, 'doch');
    }

    console.log('\n-- Das Formular meldet "gesendet" --');
    const lead = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'agentur-lead.js'), 'utf8');
    t('agentur-lead zaehlt den dritten Schritt',
      /require\('\.\/lead-zaehler'\)\.hoch\(quelle, 'gesendet'\)/.test(lead), 'zaehlt nicht');
    t('und zwar in einem try -- eine Anfrage darf daran nie scheitern',
      /try \{\s*require\('\.\/lead-zaehler'\)/.test(lead), 'ungeschuetzt');
    t('es wird NICHT gewartet -- der Zaehler haelt keine Anfrage auf',
      !/await require\('\.\/lead-zaehler'\)/.test(lead), 'await davor');

    console.log('\n-- Keine Personendaten --');
    // Ohne IP, Kennung oder Cookie braucht es keine Einwilligung.
    const q = fs.readFileSync(FN, 'utf8');
    ['headers.*x-forwarded-for', 'clientContext', 'document.cookie', 'localStorage'].forEach(function (verboten) {
        t('die Function fasst "' + verboten + '" nicht an',
          !new RegExp(verboten, 'i').test(q), 'steht drin');
    });
    t('und das Seitenskript setzt kein Cookie',
      !/cookie|localStorage|sessionStorage/i.test(skript), 'setzt etwas');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
