// AUS DEM ENTWURF EINE FASSUNG -- und der Vertrag als PDF.
//
// Ibo am 25.09.2026: "ja mach und vertrag als Pdf und unterschreiben".
//
// Unterschreiben war schon gebaut (Leinwand, SHA-256-Abdruck,
// RLS-gepruefter Schreibvorgang). Gefehlt haben die Platzhalter und das
// PDF.
//
// WAS DIESER TEST VERTEIDIGT
// ==========================
//   1. Aus dem Entwurf wird eine NEUE Fassung -- niemals ein Update.
//      Eine Unterschrift zeigt ueber den Abdruck auf den Text, der
//      damals dastand; ein Update wuerde jeden frueheren Abdruck
//      ungueltig machen.
//   2. Die neue Fassung ist wieder 'entwurf'. Freischalten bleibt ein
//      eigener, bewusster Schritt nach der Anwaltspruefung.
//   3. Es wird NICHTS ERFUNDEN. Firmierungen und Sitze der
//      Unterauftragsverarbeiter bleiben offene Stellen -- Geratenes in
//      einem Vertrag ist schlimmer als eine Luecke.
//   4. Die Liste der Verarbeiter ist VOLLSTAENDIG. Eine unvollstaendige
//      ist das eigentliche Risiko bei Art. 28 DSGVO.
//   5. Der Abdruck steht mit auf dem Papier. Sonst belegt ein Ausdruck
//      nur, DASS jemand unterschrieben hat, nicht WAS dastand.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const KMI = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
const Q = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'vertrag-fassung.js'), 'utf8');
const SQL = fs.readFileSync(path.join(KMI, 'datenbank', '32-vertrag.sql'), 'utf8');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

process.env.SUPABASE_SERVICE_KEY = 'test-dienst';
const V = require(path.join(KMI, 'netlify', 'functions', 'vertrag-fassung.js'));

const A = { firmierung: 'Kurani Design', inhaber: 'Ibrahim Kuran', strasse: 'Musterstr. 1',
            plz: '26624', ort: 'Südbrookmerland', email: 'ibo@kurani.de',
            telefon: '0170 1234567', steuernummer: '12/345/67890', kleinunternehmer: true };

// ===========================================================================
console.log('-- 1. Die echten Platzhalter aus 32-vertrag.sql --');
// ===========================================================================
// NICHT gestellte Platzhalter, sondern die aus der SQL-Datei. Sonst
// prueft der Test seine eigene Erfindung.
const ECHTE = (SQL.match(/\[\[[^\]]*\]\]/g) || []);
t('die SQL-Datei hat noch offene Stellen', ECHTE.length >= 4, String(ECHTE.length));
['ANBIETER', 'UMSATZSTEUER', 'GERICHTSSTAND', 'UNTERAUFTRAGSVERARBEITER'].forEach(function (k) {
    t('es gibt eine Stelle ' + k,
      ECHTE.some(function (x) { return x.indexOf('[[' + k) === 0; }), 'fehlt');
});
t('ANBIETER kommt zweimal vor (Vertrag und AVV)',
  ECHTE.filter(function (x) { return x.indexOf('[[ANBIETER') === 0; }).length === 2,
  String(ECHTE.filter(function (x) { return x.indexOf('[[ANBIETER') === 0; }).length));
// Mindestens zwei gehen ueber mehrere Zeilen -- ein Muster, das nur auf
// einer Zeile sucht, wuerde sie verfehlen.
t('mindestens eine Stelle geht ueber mehrere Zeilen',
  ECHTE.some(function (x) { return x.indexOf('\n') >= 0; }), 'alle einzeilig');

// Genau diese Stellen durch die echte Funktion schicken.
const GEFUELLT = V._fuellen(ECHTE.join('\n\n'), A);
t('nach dem Fuellen steht keine ANBIETER-Stelle mehr da',
  GEFUELLT.indexOf('[[ANBIETER') < 0, 'noch drin');
t('auch die zweite nicht -- global ersetzt',
  (GEFUELLT.match(/Kurani Design/g) || []).length >= 2,
  String((GEFUELLT.match(/Kurani Design/g) || []).length));
t('UMSATZSTEUER ist weg', GEFUELLT.indexOf('[[UMSATZSTEUER') < 0, 'noch drin');
t('GERICHTSSTAND ist weg', GEFUELLT.indexOf('[[GERICHTSSTAND') < 0, 'noch drin');
t('UNTERAUFTRAGSVERARBEITER ist weg', GEFUELLT.indexOf('[[UNTERAUFTRAG') < 0, 'noch drin');

console.log('\n-- 2. Was eingesetzt wird, stimmt --');
t('die Anschrift steht drin', /Musterstr\. 1/.test(GEFUELLT) && /26624 Südbrookmerland/.test(GEFUELLT));
t('Kleinunternehmer -> § 19 UStG, keine Umsatzsteuer',
  /§ 19 UStG/.test(GEFUELLT) && !/zzgl\./.test(GEFUELLT), 'falscher Satz');
const REGEL = V._fuellen('[[UMSATZSTEUER: x]]', Object.assign({}, A, { kleinunternehmer: false }));
t('ohne Kleinunternehmer -> zzgl. gesetzlicher Umsatzsteuer',
  /zzgl\./.test(REGEL) && !/§ 19/.test(REGEL), REGEL);
t('Gerichtsstand ist der Sitz des Anbieters',
  V._fuellen('[[GERICHTSSTAND: Ort]]', A) === 'Südbrookmerland',
  V._fuellen('[[GERICHTSSTAND: Ort]]', A));

// ===========================================================================
console.log('\n-- 3. Es wird NICHTS ERFUNDEN --');
// ===========================================================================
const LISTE = V._verarbeiterText();
// Die Firmierungen und Sitze stehen in den AVV der Anbieter und aendern
// sich. Sie aus dem Gedaechtnis hinzuschreiben waere geraten -- und
// Geratenes in einem Vertrag ist schlimmer als eine offene Stelle.
t('keine erfundene Rechtsform in der Verarbeiterliste',
  !/\b(Inc\.|Ltd\.|LLC|GmbH|PBC|B\.V\.|S\.à r\.l\.)/.test(LISTE),
  (LISTE.match(/\b(Inc\.|Ltd\.|LLC|GmbH|PBC)\b/) || [''])[0]);
t('keine erfundene Anschrift',
  !/\d{4,5}\s+[A-ZÄÖÜ][a-zäöü]+,?\s*(USA|Irland|Ireland)/.test(LISTE), 'Adresse erfunden');
t('stattdessen je Anbieter eine offene Stelle fuer Firmierung und Sitz',
  (LISTE.match(/\[\[SITZ /g) || []).length === V._VERARBEITER.length,
  (LISTE.match(/\[\[SITZ /g) || []).length + ' von ' + V._VERARBEITER.length);
t('und dabei steht, WO es nachzulesen ist',
  V._VERARBEITER.every(function (v) { return LISTE.indexOf(v.quelle) >= 0; }), 'Quelle fehlt');
t('damit blockiert die App weiter -- die Stellen bleiben zaehlbar',
  V._offeneStellen(LISTE).length === V._VERARBEITER.length,
  String(V._offeneStellen(LISTE).length));

console.log('\n-- 4. Die Liste ist vollstaendig --');
// Am 25.09.2026 im Quelltext gemessen: jeder Dienst, an den etwas
// hinausgeht. Eine unvollstaendige Liste ist bei Art. 28 DSGVO das
// eigentliche Risiko.
['Supabase', 'Netlify', 'Resend', 'Anthropic', 'Google', 'Groq',
 'OpenStreetMap', 'Push'].forEach(function (d) {
    t(d + ' steht in der Liste',
      V._VERARBEITER.some(function (v) { return v.name.indexOf(d) >= 0; }), 'fehlt');
});
t('jeder Eintrag nennt Zweck und Verarbeitungsort',
  V._VERARBEITER.every(function (v) { return v.zweck.length > 20 && v.wo.length > 3; }), 'unvollstaendig');
t('und jeder nennt den Beleg im Projekt',
  V._VERARBEITER.every(function (v) { return v.beleg && v.beleg.length > 5; }), 'ohne Beleg');

// Die drei bewussten Auslassungen -- mit Begruendung im Quelltext.
['Stripe', 'PayPal', 'tillhub'].forEach(function (d) {
    t(d + ' steht ABSICHTLICH nicht drin',
      !V._VERARBEITER.some(function (v) { return v.name.indexOf(d) >= 0; }), 'doch drin');
});
t('und der Grund dafuer steht als Kommentar dabei',
  /NICHT IN DIESER LISTE/.test(Q) && /30-paypal-konto\.sql/.test(Q), 'nicht begruendet');
t('samt dem Hinweis, dass der Anwalt entscheidet',
  /entscheidet der Anwalt/.test(Q), 'als Tatsache verkauft');

// ===========================================================================
console.log('\n-- 5. Fassungsnummern --');
// ===========================================================================
const heute = new Date();
const stamm = heute.getFullYear() + '-' + String(heute.getMonth() + 1).padStart(2, '0');
t('ohne Vorgaenger beginnt es bei 1', V._naechsteNummer([]) === stamm + '-1', V._naechsteNummer([]));
t('sonst eins hoeher',
  V._naechsteNummer([{ fassung: stamm + '-1' }, { fassung: stamm + '-3' }]) === stamm + '-4',
  V._naechsteNummer([{ fassung: stamm + '-1' }, { fassung: stamm + '-3' }]));
t('Fassungen aus anderen Monaten stoeren nicht',
  V._naechsteNummer([{ fassung: '2020-01-9' }]) === stamm + '-1',
  V._naechsteNummer([{ fassung: '2020-01-9' }]));

// ===========================================================================
console.log('\n-- 6. Die Function: neu anlegen, nie aendern --');
// ===========================================================================
const echtesFetch = global.fetch;
let GESCHRIEBEN = [], METHODEN = [];
function welt(anbieter, fassungen) {
    return async function (url, opt) {
        url = String(url);
        if (opt && opt.method) METHODEN.push(opt.method + ' ' + url.split('/rest/v1/')[1]);
        if (url.indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'ibo@x.de' }) };
        if (url.indexOf('role=eq.superadmin') >= 0) return { ok: true, json: async () => [{ email: 'ibo@x.de' }] };
        if (url.indexOf('/rest/v1/anbieter') >= 0) {
            return anbieter ? { ok: true, json: async () => [anbieter] }
                            : { ok: false, status: 404, text: async () => 'relation does not exist' };
        }
        if (url.indexOf('/rest/v1/vertrag_fassungen') >= 0) {
            if (opt && opt.method === 'POST') {
                GESCHRIEBEN = JSON.parse(opt.body);
                return { ok: true, text: async () => JSON.stringify(GESCHRIEBEN) };
            }
            return { ok: true, json: async () => (fassungen || []) };
        }
        return { ok: false, status: 404, text: async () => '' };
    };
}
function ereignis(b) {
    return { httpMethod: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify(b || {}) };
}
async function ruf(aktion, fetchImpl) {
    global.fetch = fetchImpl;
    try { return await V.handler(ereignis({ action: aktion })); }
    finally { global.fetch = echtesFetch; }
}

const ENTWURF = [
    { id: 'f1', art: 'dienstleistung', fassung: stamm + '-1', titel: 'Nutzungsvertrag',
      inhalt: 'Zwischen\n[[ANBIETER: Firmierung, Inhaber, Anschrift, Kontakt]]\nGerichtsstand [[GERICHTSSTAND: Ort]].',
      status: 'entwurf', erstellt_am: '2026-09-17T10:00:00Z' },
    { id: 'f2', art: 'avv', fassung: stamm + '-1', titel: 'Anlage 1',
      inhalt: '[[ANBIETER: x]]\n[[UNTERAUFTRAGSVERARBEITER: y]]',
      status: 'entwurf', erstellt_am: '2026-09-17T10:00:00Z' }
];

(async function () {
    let a = await ruf('vorschau', async function (url) {
        if (String(url).indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: 'gast@x.de' }) };
        return { ok: true, json: async () => [] };
    });
    t('ein Nicht-Verwalter bekommt 403', a.statusCode === 403, String(a.statusCode));

    a = await ruf('vorschau', welt(null, ENTWURF));
    let j = JSON.parse(a.body);
    t('ohne Firmendaten: 409 mit Hinweis auf SQL 37',
      a.statusCode === 409 && /SQL 37/.test(j.fehler), j.fehler);

    a = await ruf('vorschau', welt(Object.assign({}, A, { iban: '', strasse: '' }), ENTWURF));
    j = JSON.parse(a.body);
    t('unvollstaendige Firmendaten: es wird gesagt, welches Feld fehlt',
      j.absender_unvollstaendig === true && (j.fehlende_felder || []).join() === 'Straße',
      JSON.stringify(j.fehlende_felder));
    // Die IBAN braucht der VERTRAG nicht -- nur die Mahnung. Wer sie hier
    // verlangt, blockiert ohne Grund.
    t('die IBAN ist fuer den Vertrag NICHT Pflicht',
      V._fehlendeFelder(Object.assign({}, A, { iban: '' })).length === 0, 'zu streng');

    a = await ruf('vorschau', welt(A, []));
    j = JSON.parse(a.body);
    t('ohne Entwuerfe: 409 mit Hinweis auf 32-vertrag.sql',
      a.statusCode === 409 && /32-vertrag\.sql/.test(j.fehler), j.fehler);

    METHODEN = [];
    a = await ruf('vorschau', welt(A, ENTWURF));
    j = JSON.parse(a.body);
    // EIN TEST DARF NICHT ABSTUERZEN, WENN DIE ANTWORT ANDERS AUSFAELLT.
    //
    // Am 25.09.2026 bei zwei Gegenproben passiert: j.fassungen war
    // undefined, der Zugriff warf, und statt eines roten Tests stand ein
    // Stapelabbild da. run-all meldet das als ABGESTUERZT -- man sieht,
    // DASS etwas kaputt ist, aber nicht was. Und alle Zusicherungen
    // danach laufen gar nicht erst.
    var ff = (j && j.fassungen) || [];
    t('Vorschau liefert beide Arten', a.statusCode === 200 && ff.length === 2,
      a.statusCode + ' / ' + ff.length + ' Fassungen'
      + (j && j.fehler ? ' / ' + j.fehler : ''));
    t('und sagt, wie viele Stellen vorher offen waren und nachher sind',
      !!ff[0] && ff[0].vorher_offen === 2 && Array.isArray(ff[0].nachher_offen),
      JSON.stringify(ff[0] && ff[0].vorher_offen));
    t('die Vorschau SCHREIBT NICHTS', METHODEN.filter(function (m) { return /POST|PATCH/.test(m); }).length === 0,
      JSON.stringify(METHODEN));

    METHODEN = []; GESCHRIEBEN = [];
    a = await ruf('erstellen', welt(A, ENTWURF));
    j = JSON.parse(a.body);
    t('erstellen legt beide Arten an', a.statusCode === 200 && GESCHRIEBEN.length === 2,
      a.statusCode + ' / ' + GESCHRIEBEN.length + (j && j.fehler ? ' / ' + j.fehler : ''));
    t('mit einer NEUEN Fassungsnummer',
      GESCHRIEBEN.every(function (z) { return z.fassung === stamm + '-2'; }),
      JSON.stringify(GESCHRIEBEN.map(function (z) { return z.fassung; })));
    // DIE ZUSICHERUNG, AN DER ALLES HAENGT.
    t('es wird ANGELEGT, nicht geaendert -- kein PATCH, kein PUT',
      METHODEN.every(function (m) { return !/PATCH|PUT/.test(m); }), JSON.stringify(METHODEN));
    t('und der Status ist wieder "entwurf", nie "aktiv"',
      GESCHRIEBEN.every(function (z) { return z.status === 'entwurf'; }),
      JSON.stringify(GESCHRIEBEN.map(function (z) { return z.status; })));
    t('die alten Fassungen bleiben unberuehrt',
      ENTWURF[0].inhalt.indexOf('[[ANBIETER') >= 0, 'Entwurf veraendert');

    // ===================================================================
    console.log('\n-- 7. Der Ausdruck --');
    // ===================================================================
    const w = { window: {}, console: console, document: { getElementById: function () { return null; } } };
    w.window = w;
    w.vertragEsc = function (x) { return String(x == null ? '' : x)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    vm.createContext(w);
    vm.runInContext(H.slice(H.indexOf('function vertragDruckRegeln()'),
                            H.indexOf('function vertragDrucken(')), w);

    const F = { id: 'f1', art: 'dienstleistung', fassung: '2026-09-2', titel: 'Nutzungsvertrag',
                inhalt: 'NUTZUNGSVERTRAG\n\n§ 1 ...', status: 'entwurf',
                erstellt_am: '2026-09-25T10:00:00Z' };
    const U = { id: 'u1', unterzeichner_name: 'Talal Misafirci', unterzeichner_funktion: 'Inhaber',
                unterschrift: 'data:image/png;base64,AAA', unterzeichnet_am: '2026-09-25T12:00:00Z',
                text_abdruck: 'ab12cd34' };

    let blatt = w.vertragDruckblatt(F, U);
    t('der Ausdruck traegt den Titel', /Nutzungsvertrag/.test(blatt), 'fehlt');
    t('und die Fassungsnummer', /2026-09-2/.test(blatt), 'fehlt');
    t('den Vertragstext', /NUTZUNGSVERTRAG/.test(blatt), 'fehlt');
    t('die Unterschrift als Bild', /data:image\/png/.test(blatt), 'fehlt');
    t('den Namen des Unterzeichners', /Talal Misafirci/.test(blatt), 'fehlt');
    // Ohne den Abdruck belegt ein Ausdruck nur, DASS jemand
    // unterschrieben hat -- nicht, WAS dastand.
    t('und die Pruefsumme des unterzeichneten Textes',
      /SHA-256/.test(blatt) && /ab12cd34/.test(blatt), 'fehlt');
    t('ein Entwurf wird als Entwurf gekennzeichnet',
      /ENTWURF/.test(blatt), 'sieht aus wie ein gueltiger Vertrag');
    t('eine aktive Fassung nicht',
      !/ENTWURF/.test(w.vertragDruckblatt(Object.assign({}, F, { status: 'aktiv' }), U)),
      'faelschlich als Entwurf');

    blatt = w.vertragDruckblatt(F, null);
    t('ohne Unterschrift gibt es eine Linie zum Unterschreiben',
      /Unterschrift Betrieb/.test(blatt) && /Ort, Datum/.test(blatt), 'fehlt');
    t('und keine erfundene Unterschrift', !/data:image/.test(blatt), 'Bild erfunden');
    t('der Text ist escapt',
      w.vertragDruckblatt(Object.assign({}, F, { inhalt: '<script>x</script>' }), null)
        .indexOf('&lt;script&gt;') >= 0, 'roh eingesetzt');

    console.log('\n-- 8. Keine PDF-Bibliothek, und die Regeln raeumen auf --');
    const druck = H.slice(H.indexOf('function vertragDruckRegeln()'),
                          H.indexOf('window.vertragDruckblatt'));
    t('es wird keine PDF-Bibliothek geladen',
      !/jspdf|pdfmake|html2pdf/i.test(H), 'Bibliothek eingebaut');
    t('gedruckt wird mit dem Browser', /window\.print\(\)/.test(druck), 'kein print');
    t('die Klasse am body wird wieder entfernt',
      /classList\.remove\('kmi-drucken'\)/.test(druck), 'bleibt haengen');
    t('auch wenn der Druckdialog abgebrochen wird',
      /setTimeout\(fertig/.test(druck), 'nur bei afterprint');
    t('und das Druckblatt wird abgeraeumt',
      /b\.remove\(\)/.test(druck), 'bleibt stehen');
    t('der Unterschriftenblock wird nicht umbrochen',
      /break-inside: avoid/.test(druck), 'Umbruch mitten drin');

    console.log('\n-- 9. Was schon da war, bleibt --');
    // Unterschreiben war am 17.09.2026 gebaut worden. Hier steht nur,
    // dass es dabei bleibt -- geaendert wurde daran nichts.
    t('die Sperre gegen Platzhalter gilt weiter',
      /function vertragFreigabeGrund/.test(H) && /Im Text stehen noch/.test(H), 'weg');
    t('der SHA-256-Abdruck wird weiter gebildet',
      /crypto\.subtle\.digest\('SHA-256'/.test(H), 'weg');
    t('und eine Zeile ist der Beleg, nicht der Statuscode',
      /201 allein reicht nicht/.test(H), 'weg');

    console.log('\n-- 10. Von Hand --');
    t('vertrag-fassung steht in keinem Zeitplan',
      !/vertrag-fassung/i.test(fs.readFileSync(path.join(KMI, 'netlify.toml'), 'utf8')), 'steht drin');

    console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.'
        : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    if (n - ok > 0) process.exitCode = 1;
})();
