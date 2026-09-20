// Ein Leerzeichen MITTEN im PayPal-Schluessel.
//
// Am 20.09.2026 hat Ibo eine Stunde an dieser Stelle verloren. Er hat die
// Client-ID bei PayPal mit der Maus markiert; im Dashboard bricht der Wert
// um, und beim Kopieren kam ein Leerzeichen mitten hinein. Die Function
// sagte "Die Client-ID sieht nicht richtig aus -- bitte vollstaendig
// kopieren". Er hat dreimal nachgesehen und dreimal nichts gefunden.
// Ein Leerzeichen sieht man nicht.
//
// Gemessen waren es in 24 Stunden NULL Schreibzugriffe auf paypal_konten.
//
// Geprueft wird durch AUSFUEHREN: die Function laeuft wirklich, mit
// gestelltem Supabase und gestelltem PayPal. Ein Textvergleich haette den
// Fehler nie gefunden -- .trim() steht ja da und sieht richtig aus.
'use strict';

const path = require('path');
const KMI = path.join(__dirname, '..');
const FN = path.join(KMI, 'netlify', 'functions', 'paypal-zahlung.js');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

const REST = 'a599f99c-2476-477b-99ee-b5c1d8d3cf45';
// So lang wie echte PayPal-Schluessel: rund 80 Zeichen aus A-Z a-z 0-9 _ -
const ECHTE_ID = 'AeA1QIZXiflr1_-hVHDaLZahdheVAfvKl_1dBHRLAqGMQ2vQ4hLLhnmYtGSHzVfjZfvGcWYlPWJz9kYx';
const ECHTES_SECRET = 'EGnHDxD_qRPdaLdZz8iCr8N7_MzF-YHPTkjs6NKYQvQSBngp4PTTVWkPZRbL_MEWjvXGpXaPvmZkBTEp';

// Laesst die Function einmal laufen. `netz` protokolliert jeden Aufruf,
// damit wir sehen koennen, WAS bei PayPal und Supabase ankam.
async function speichern(nutzlast, paypalLehntAb) {
    const gesendet = [];
    const altFetch = global.fetch;
    const altKey = process.env.SUPABASE_SERVICE_KEY;
    process.env.SUPABASE_SERVICE_KEY = 'service-key-test';
    delete require.cache[require.resolve(FN)];

    global.fetch = function (url, opt) {
        const u = String(url);
        opt = opt || {};
        gesendet.push({ url: u, opt: opt });
        const antwort = function (status, koerper) {
            return Promise.resolve({
                ok: status >= 200 && status < 300, status: status,
                json: function () { return Promise.resolve(koerper); },
                text: function () { return Promise.resolve(JSON.stringify(koerper)); }
            });
        };
        if (/\/auth\/v1\/user/.test(u)) return antwort(200, { email: 'ibo@example.de' });
        if (/\/rest\/v1\/customers/.test(u)) return antwort(200, [{ restaurant_id: REST }]);
        if (/oauth2\/token/.test(u)) {
            return paypalLehntAb ? antwort(401, { error: 'invalid_client' })
                                 : antwort(200, { access_token: 'tok' });
        }
        // PostgREST antwortet bei return=representation mit einem Array.
        if (/paypal_konten/.test(u)) return antwort(201, [{ restaurant_id: REST }]);
        return antwort(200, {});
    };

    const modul = require(FN);
    try {
        const e = await modul.handler({
            httpMethod: 'POST',
            queryStringParameters: { action: 'speichern' },
            headers: { authorization: 'Bearer anmelde-token' },
            body: JSON.stringify(Object.assign({ restaurant_id: REST, live: true }, nutzlast))
        });
        return { antwort: e, koerper: JSON.parse(e.body), gesendet: gesendet };
    } finally {
        global.fetch = altFetch;
        if (altKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
        else process.env.SUPABASE_SERVICE_KEY = altKey;
    }
}

(async function () {
    console.log('-- Der saubere Fall: so muss es laufen --');
    const gut = await speichern({ client_id: ECHTE_ID, secret: ECHTES_SECRET });
    t('richtige Schluessel werden gespeichert', gut.koerper.ok === true, gut.koerper);
    t('und landen wirklich in paypal_konten',
      gut.gesendet.some(function (g) { return /paypal_konten\?on_conflict/.test(g.url); }),
      gut.gesendet.map(function (g) { return g.url; }).join(', '));

    console.log('\n-- Leerraum MITTEN im Schluessel --');
    // Genau Ibos Fall: beim Markieren mit der Maus bricht der Wert um.
    const FAELLE = [
        { name: 'ein Leerzeichen in der Mitte', mach: function (v) { return v.slice(0, 40) + ' ' + v.slice(40); } },
        { name: 'ein Zeilenumbruch in der Mitte', mach: function (v) { return v.slice(0, 40) + '\n' + v.slice(40); } },
        { name: 'ein geschuetztes Leerzeichen', mach: function (v) { return v.slice(0, 40) + ' ' + v.slice(40); } },
        { name: 'Leerzeichen vorne und hinten', mach: function (v) { return '  ' + v + '\n'; } },
        // Die gemeinsten: Breite null. Der Wert sieht Zeichen fuer Zeichen
        // richtig aus -- und \s erwischt sie NICHT. Genau so sah Ibos Feld
        // aus: 38 erlaubte Zeichen, sichtbar zu Ende, und trotzdem rot.
        { name: 'ein Zero-Width Space (U+200B)', mach: function (v) { return v.slice(0, 20) + '\u200b' + v.slice(20); } },
        { name: 'ein Soft Hyphen (U+00AD)', mach: function (v) { return v.slice(0, 20) + '\u00ad' + v.slice(20); } },
        { name: 'ein Zero-Width Joiner (U+200D)', mach: function (v) { return v.slice(0, 20) + '\u200d' + v.slice(20); } },
        { name: 'ein BOM (U+FEFF) am Anfang', mach: function (v) { return '\ufeff' + v; } },
        { name: 'ein Links-nach-rechts-Zeichen (U+200E)', mach: function (v) { return v + '\u200e'; } }
    ];
    for (const fall of FAELLE) {
        const r = await speichern({ client_id: fall.mach(ECHTE_ID), secret: ECHTES_SECRET });
        t(fall.name + ': geht trotzdem durch', r.koerper.ok === true, r.koerper);
        // Und zwar GEPUTZT -- nicht etwa mit dem Leerzeichen an PayPal weiter.
        const beiPaypal = r.gesendet.filter(function (g) { return /oauth2\/token/.test(g.url); })[0];
        const kopf = beiPaypal && beiPaypal.opt.headers && beiPaypal.opt.headers.Authorization || '';
        const roh = Buffer.from(kopf.replace('Basic ', ''), 'base64').toString();
        t(fall.name + ': PayPal bekommt den Schluessel ohne Leerraum',
          roh === ECHTE_ID + ':' + ECHTES_SECRET, JSON.stringify(roh.slice(0, 50)));
    }
    // Dasselbe fuer das Secret -- es wird genauso kopiert.
    const s2 = await speichern({
        client_id: ECHTE_ID,
        secret: ECHTES_SECRET.slice(0, 30) + ' ' + ECHTES_SECRET.slice(30)
    });
    t('auch ein Leerzeichen im Secret wird weggeputzt', s2.koerper.ok === true, s2.koerper);

    console.log('\n-- Die Meldung sagt jetzt, WAS stoert --');
    // Die alte Meldung lautete "sieht nicht richtig aus, bitte vollstaendig
    // kopieren". Sie stimmte und half niemandem.
    const kurz = await speichern({ client_id: 'AbCdEf123', secret: ECHTES_SECRET });
    t('zu kurz: die Zahl steht in der Meldung',
      kurz.antwort.statusCode === 400 && /9 Zeichen/.test(kurz.koerper.error), kurz.koerper.error);
    t('und der Grund: die Uebersicht kuerzt ab',
      /Übersicht/.test(kurz.koerper.error), kurz.koerper.error);

    // Ibos echter Wert: 38 Zeichen. Der ist NICHT verboten -- wir erfinden
    // keine Regel, die PayPal nicht hat. Er geht durch die Formpruefung und
    // wird von PayPal selbst abgelehnt. Genau dann muss die Laenge in der
    // Meldung stehen, sonst sucht er beim Bereich statt beim Kopieren.
    const IBOS_WERT = 'BAAIsJzIG7CW9gZy-juPkrDPOHC2U6Xb_sF6-4';
    const echt = await speichern({ client_id: IBOS_WERT, secret: ECHTES_SECRET }, true);
    t('38 Zeichen kommen bis zu PayPal durch',
      echt.gesendet.some(function (g) { return /oauth2\/token/.test(g.url); }),
      'schon vorher abgewiesen');
    t('und die Absage nennt die Laenge',
      /38 Zeichen/.test(echt.koerper.error), echt.koerper.error);
    t('und sagt, woher der gekuerzte Wert kommt',
      /Übersicht/.test(echt.koerper.error), echt.koerper.error);
    t('ein VOLLER Schluessel bekommt diesen Hinweis NICHT',
      !/auffällig kurz/.test((await speichern({ client_id: ECHTE_ID, secret: ECHTES_SECRET }, true)).koerper.error),
      'Hinweis kommt auch bei richtiger Laenge');

    const punkte = await speichern({ client_id: ECHTE_ID.slice(0, 40) + '…', secret: ECHTES_SECRET });
    t('drei Puenktchen werden beim Namen genannt',
      /Pünktchen|Puenktchen/.test(punkte.koerper.error), punkte.koerper.error);

    const fremd = await speichern({ client_id: ECHTE_ID.slice(0, 40) + '"', secret: ECHTES_SECRET });
    t('ein Anfuehrungszeichen wird beim Namen genannt',
      /Anführungszeichen|Anfuehrungszeichen/.test(fremd.koerper.error), fremd.koerper.error);

    const langS = await speichern({ client_id: ECHTE_ID, secret: 'x'.repeat(250) });
    t('ein zu langes Secret wird als zu lang gemeldet',
      /zu lang/.test(langS.koerper.error) && /250/.test(langS.koerper.error), langS.koerper.error);

    // Die Grenze: was man SIEHT, wird nicht heimlich weggeputzt. Sonst
    // entstuende aus einem falschen Wert ein anderer falscher Wert, und die
    // Meldung koennte nicht mehr sagen, was los war.
    const sichtbar = await speichern({ client_id: ECHTE_ID.slice(0, 40) + '.', secret: ECHTES_SECRET });
    t('ein sichtbarer Punkt wird NICHT heimlich entfernt, sondern gemeldet',
      sichtbar.antwort.statusCode === 400 && /Punkt/.test(sichtbar.koerper.error),
      sichtbar.koerper.error);

    console.log('\n-- Das Geheimnis bleibt geheim --');
    // Eine hilfreiche Meldung darf kein Secret ausplaudern -- auch nicht
    // "nur den Anfang". Sie nennt Laenge und Art des Zeichens, sonst nichts.
    const geheim = 'GEHEIMER-WERT-DEN-NIEMAND-SEHEN-DARF' + '"';
    const leck = await speichern({ client_id: ECHTE_ID, secret: geheim });
    t('das Secret steht NICHT in der Fehlermeldung',
      leck.koerper.error.indexOf('GEHEIMER') === -1, leck.koerper.error);
    const leck2 = await speichern({ client_id: ECHTE_ID, secret: 'zu-kurz' });
    t('auch ein zu kurzes Secret wird nicht zitiert',
      leck2.koerper.error.indexOf('zu-kurz') === -1, leck2.koerper.error);

    console.log('\n-- Was NICHT durchrutschen darf --');
    const leer = await speichern({ client_id: '   ', secret: ECHTES_SECRET });
    t('nur Leerzeichen bleibt ein Fehler',
      leer.antwort.statusCode === 400, leer.antwort.statusCode);
    t('und es wurde nichts gespeichert',
      !leer.gesendet.some(function (g) { return /paypal_konten\?on_conflict/.test(g.url); }), 'doch');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
