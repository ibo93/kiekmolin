// KIN AGENT-READY -- DIE REGELN FUER KI-ASSISTENTEN.
//
// Auftrag vom 25.09.2026: ChatGPT, Claude, Gemini & Co. sollen Restaurants
// auf Kiek mol in finden, die Karte lesen und Tische ANFRAGEN koennen.
// Mit harten Regeln:
//   * keine Personendaten nach aussen
//   * Reservierungen ueber Agenten NUR als Anfrage, nie automatisch fest
//   * Drossel pro Quelle
//
// Dieser Test fuehrt die echten Werkzeuge (lib/ki-werkzeuge.js) gegen eine
// nachgebaute Datenbank aus -- ohne Netz, ohne SDK. Jede Regel oben hat
// hier mindestens einen Test, der rot wird, wenn man sie bricht.

'use strict';

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');
var KI = require(KMI + '/netlify/functions/lib/ki-agent.js');
var WZ = require(KMI + '/netlify/functions/lib/ki-werkzeuge.js');
var mcpQuelle = fs.readFileSync(KMI + '/netlify/functions/mcp.js', 'utf8');
var toml = fs.readFileSync(KMI + '/netlify.toml', 'utf8');
var sql = fs.readFileSync(KMI + '/datenbank/36-ki-assistent.sql', 'utf8');
var seo = fs.readFileSync(KMI + '/build-seo-pages.js', 'utf8');

var n = 0, ok = 0, laeuft = [];
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function spaeter(fn) { laeuft.push(fn); }

// Fester Zeitpunkt: Freitag, 25.09.2026, 10:00 Uhr in Greetsiel (08:00 UTC).
var JETZT = new Date('2026-09-25T08:00:00Z');
var MORGEN = '2026-09-26';
var BOERSE = '888dc5bc-1649-4762-a8ee-2eb1e5e1dfad';
var ANDERES = '11111111-2222-3333-4444-555555555555';
var NICHT_FREIGEGEBEN = '99999999-2222-3333-4444-555555555555';

function haus(extra) {
    return Object.assign({
        id: BOERSE, slug: 'greetsieler-boerse', name: 'Greetsieler Börse', city: 'Greetsiel', zip: '26736',
        street: 'Mühlenstraße 29', phone: '+4949269279747', cuisine: 'fisch', cuisine_type: ['bar'],
        tags: ['hunde_erlaubt', 'terrasse'], features: [], opening_time: '12:00', closing_time: '21:30',
        opening_hours: { pause_enabled: false }, rest_day: null, slot_interval_minutes: 30
    }, extra || {});
}

// ---- Nachgebaute Datenbank ---------------------------------------------------
function falscheDb(opt) {
    opt = opt || {};
    var db = {
        restaurants: opt.restaurants || [haus(), haus({ id: ANDERES, slug: 'la-piazza-greetsiel', name: 'La Piazza', cuisine: 'pizza', tags: ['terrasse'] }),
                                         haus({ id: NICHT_FREIGEGEBEN, slug: 'geheim', name: 'Nicht freigegeben' })],
        optin: opt.optin || [BOERSE, ANDERES],
        menu: opt.menu || [],
        belegung: opt.belegung || [],
        protokoll: [], reservierungen: [], pfade: [],
        protokollKaputt: !!opt.protokollKaputt,
        zaehlenKaputt: !!opt.zaehlenKaputt
    };
    function filter(zeilen, pfad) {
        var q = pfad.split('?')[1] || '';
        return zeilen.filter(function (z) {
            return q.split('&').every(function (teil) {
                var kv = teil.split('='); var k = kv[0], v = decodeURIComponent(kv.slice(1).join('='));
                if (!k || k === 'select' || k === 'order' || k === 'limit') return true;
                var op = v.split('.')[0], wert = v.split('.').slice(1).join('.');
                if (op === 'eq') return String(z[k]) === wert;
                if (op === 'neq') return String(z[k]) !== wert;
                if (op === 'gte') return String(z[k]) >= wert;
                return true;
            });
        });
    }
    db.lesen = async function (pfad) {
        db.pfade.push(pfad);
        var tab = pfad.split('?')[0];
        if (tab === 'agent_optin') return db.optin.map(function (id) { return { restaurant_id: id }; });
        if (tab === 'agent_restaurants_v') {
            var ids = /id=in\.\(([^)]*)\)/.exec(pfad)[1].split(',');
            return db.restaurants.filter(function (r) { return ids.indexOf(r.id) >= 0; });
        }
        if (tab === 'agent_menu_v') return db.menu;
        if (tab === 'agent_belegung_v') return db.belegung;
        if (tab === 'agent_tische_v') return [{ tische: opt.tische || 30 }];
        if (tab === 'agent_requests') return filter(db.protokoll, pfad);
        throw new Error('unerwartete Tabelle ' + tab);
    };
    db.zaehlen = async function (pfad) {
        db.pfade.push(pfad);
        if (db.zaehlenKaputt) throw new Error('HTTP 404');
        return filter(db.protokoll, pfad).length;
    };
    db.anlegen = async function (tab, zeile) {
        db.pfade.push(tab);
        if (tab === 'agent_requests') {
            if (db.protokollKaputt) throw new Error('HTTP 404');
            db.protokoll.push(Object.assign({ created_at: new Date(JETZT.getTime() - 1000).toISOString() }, zeile));
            return null;
        }
        if (tab === 'reservations') { var z = Object.assign({ id: 'res-' + (db.reservierungen.length + 1) }, zeile); db.reservierungen.push(z); return [z]; }
        throw new Error('unerwartete Tabelle ' + tab);
    };
    return db;
}
function ctx(extra) { return Object.assign({ jetzt: JETZT, ipHash: 'ip1', client: 'Claude', ua: 'Claude-User', salz: 's' }, extra || {}); }
var ANFRAGE = { restaurant_id: 'greetsieler-boerse', datum: MORGEN, uhrzeit: '19:30', personen: 4, gast_name: 'Anke Janssen', telefon: '+49 176 1234567', notiz: 'mit Hund' };

// ==================== 1. Allergene: keine Angabe ist keine Zusage ====================
console.log('\n-- 1. Allergene --');
var ohne = KI.gerichtFuerAgent({ name: 'Scholle', allergens: null });
t('ein Gericht ohne eingetragene Allergene heisst "keine Angabe", nicht leer',
  ohne.allergene === 'keine Angabe' && ohne.allergene_angegeben === false, JSON.stringify(ohne.allergene));
var mit = KI.gerichtFuerAgent({ name: 'Calamari', allergens: ['weichtiere', 'eier', 'gluten'], additives: ['nr:3', '2'] });
t('Kuerzel werden zu LMIV-Buchstaben, sortiert',
  mit.allergene.map(function (a) { return a.code; }).join('') === 'ACR', JSON.stringify(mit.allergene));
t('die Gerichtnummer (nr:3) ist kein Zusatzstoff',
  mit.zusatzstoffe.length === 1 && mit.zusatzstoffe[0] === 'mit Konservierungsstoff', JSON.stringify(mit.zusatzstoffe));
t('Postgres-Array-Text wird gelesen', KI.gerichtFuerAgent({ allergens: '{milch,senf}' }).allergene.length === 2, '');
t('die Buchstabenreihe geht bis R (Weichtiere), nicht nur bis N', KI.ALLERGENE.weichtiere.code === 'R', KI.ALLERGENE.weichtiere.code);
t('alle 14 Pflichtallergene haben einen eigenen Buchstaben',
  Object.keys(KI.ALLERGENE).map(function (k) { return KI.ALLERGENE[k].code; }).filter(function (c, i, a) { return a.indexOf(c) === i; }).length === 14, '');
t('vegan zaehlt auch als vegetarisch', KI.gerichtFuerAgent({ is_vegan: true }).vegetarisch === true, '');
t('HTML und unsichtbare Zeichen aus Texten des Wirts werden entfernt',
  KI.sauber('Fisch <b>frisch</b>​ vom Kutter') === 'Fisch frisch vom Kutter', KI.sauber('Fisch <b>frisch</b>​ vom Kutter'));

spaeter(async function () {
    var db = falscheDb({ menu: [
        { name: 'Calamari', kategorie: 'Vorspeisen', allergens: ['weichtiere', 'gluten'] },
        { name: 'Salat', kategorie: 'Salate', allergens: ['milch'], is_vegetarian: true },
        { name: 'Scholle', kategorie: 'Haupt', allergens: null }
    ] });
    var r = await WZ.werkzeuge(db, ctx()).get_menu({ restaurant_id: 'greetsieler-boerse', ohne_allergene: ['A'] });
    var namen = [].concat.apply([], r.kategorien.map(function (k) { return k.gerichte.map(function (g) { return g.name; }); }));
    t('"ohne Gluten" laesst Gerichte OHNE Angabe weg -- sie koennten Gluten enthalten',
      namen.join(',') === 'Salat' && r.ausgelassen_ohne_allergenangabe === 1, namen.join(','));
    t('die Karte traegt den Hinweis, dass die Angaben vom Restaurant stammen', /Restaurant/.test(r.hinweis), r.hinweis);
});

// ==================== 2. Zeiten: Berlin, Ruhetag, Ferien ====================
console.log('\n-- 2. Oeffnungszeiten und freie Zeiten --');
t('Netlify rechnet in UTC -- "heute" ist trotzdem Greetsiel',
  KI.berlin(new Date('2026-09-25T22:30:00Z')).datum === '2026-09-26', KI.berlin(new Date('2026-09-25T22:30:00Z')).datum);
t('"morgen" wird zum Datum', KI.datumLesen('morgen', JETZT) === MORGEN, KI.datumLesen('morgen', JETZT));
t('Unsinn wird nicht geraten', KI.datumLesen('naechsten Freitag', JETZT) === null, '');
t('rest_day null heisst KEIN Ruhetag (nicht Montag)',
  KI.oeffnungAm(haus({ rest_day: null }), '2026-09-28').status === 'offen', KI.oeffnungAm(haus({ rest_day: null }), '2026-09-28').status);
t('am Ruhetag gibt es keine freien Zeiten',
  KI.freieZeiten(haus({ rest_day: 5 }), MORGEN, [], 10, JETZT).zeiten.length === 0, '');   // 26.09. = Samstag = 5
t('in den Betriebsferien auch nicht',
  KI.freieZeiten(haus({ features: ['vacation:2026-09-20:2026-10-05'] }), MORGEN, [], 10, JETZT).geschlossen === true, '');
var flach = haus({ opening_hours: { sa_start: '17:00', sa_end: '22:00', mo_start: '12:00', mo_end: '22:00' }, opening_time: '12:00', closing_time: '22:00' });
var fzFlach = KI.freieZeiten(flach, MORGEN, [], 10, JETZT).zeiten;
t('Tagesschichten im Dashboard-Format begrenzen das Raster (Sa ab 17 Uhr)',
  fzFlach[0] === '17:00' && fzFlach[fzFlach.length - 1] === '21:30', fzFlach.join(','));
t('ein Tag ohne Zeiten im Dashboard-Format ist geschlossen',
  KI.oeffnungAm(flach, '2026-09-29').status === 'geschlossen', KI.oeffnungAm(flach, '2026-09-29').status);
var heute = KI.freieZeiten(haus(), '2026-09-25', [], 10, new Date('2026-09-25T16:10:00Z')).zeiten;   // 18:10 Berlin
t('heute: vergangene Zeiten fallen weg', heute[0] === '18:30', heute[0]);
var voll = KI.freieZeiten(haus(), MORGEN, [{ reservation_time: '19:00:00', status: 'confirmed' }, { reservation_time: '19:00:00', status: 'pending' }], 2, JETZT).zeiten;
t('ist jeder Tisch belegt, ist die Zeit nicht frei', voll.indexOf('19:00') < 0 && voll.indexOf('19:30') >= 0, voll.join(','));
t('eine Ganztags-Sperre schliesst den Tag',
  KI.freieZeiten(haus(), MORGEN, [{ reservation_time: '00:00:00', status: 'blocked', table_id: null }], 10, JETZT).geschlossen === true, '');
t('eine stornierte Reservierung belegt nichts',
  KI.freieZeiten(haus(), MORGEN, [{ reservation_time: '19:00', status: 'cancelled' }], 1, JETZT).zeiten.indexOf('19:00') >= 0, '');

// ==================== 3. Suche ====================
console.log('\n-- 3. Suche --');
spaeter(async function () {
    var db = falscheDb();
    var w = WZ.werkzeuge(db, ctx());
    var r = await w.search_restaurants({ ort: 'Greetsiel', kueche: 'fisch', hunde_erlaubt: true });
    t('"Greetsiel, Fisch, mit Hund" findet die Boerse', r.anzahl === 1 && r.restaurants[0].restaurant_id === 'greetsieler-boerse', JSON.stringify(r));
    t('die Kueche steht lesbar da, nicht als Kuerzel', r.restaurants[0].kueche.indexOf('Fischrestaurant') >= 0, JSON.stringify(r.restaurants[0].kueche));
    var p = await w.search_restaurants({ kueche: 'pizza', hunde_erlaubt: true });
    t('Hunde-Filter greift (La Piazza hat den Tag nicht)', p.anzahl === 0, p.anzahl);
    var alle = await w.search_restaurants({});
    t('ein Haus ohne Freigabe in agent_optin erscheint nicht',
      alle.restaurants.every(function (x) { return x.restaurant_id !== 'geheim'; }) && alle.anzahl === 2, alle.anzahl);
    var menu = await w.get_menu({ restaurant_id: 'geheim' }).catch(function (e) { return e; });
    t('... und seine Karte ist auch nicht abrufbar', menu instanceof Error && menu.absage === true, String(menu));
    t('Suchergebnisse enthalten keine E-Mail und keine Kennung aus der Datenbank',
      JSON.stringify(alle).indexOf('@') < 0 && JSON.stringify(alle).indexOf(BOERSE) < 0, '');
});

// ==================== 4. Anfrage, nie fest ====================
console.log('\n-- 4. Reservierung nur als Anfrage --');
spaeter(async function () {
    var db = falscheDb({ restaurants: [haus({ features: ['auto_confirm_reservations'] })], optin: [BOERSE] });
    var r = await WZ.werkzeuge(db, ctx()).request_reservation(ANFRAGE);
    var z = db.reservierungen[0] || {};
    t('die Anfrage ist pending -- AUCH wenn das Haus sofort bestaetigen eingeschaltet hat', z.status === 'pending', z.status);
    t('source ist ki-assistent', z.source === 'ki-assistent', z.source);
    t('die Notiz sagt dem Wirt, woher sie kommt', /^\[KI-Assistent via Claude/.test(z.notes), z.notes);
    t('die Antwort sagt ausdruecklich: nicht bestaetigt', r.bestaetigt === false && /NICHT bestätigt/.test(r.text_fuer_gast), r.text_fuer_gast);
    t('die Antwort enthaelt keine Telefonnummer des Gastes', JSON.stringify(r).indexOf('1234567') < 0, '');
    t('das Protokoll enthaelt weder Name noch Nummer',
      JSON.stringify(db.protokoll).indexOf('Anke') < 0 && JSON.stringify(db.protokoll).indexOf('1234567') < 0, '');
    t('das Protokoll zaehlt die Anfrage (ok, mit reservation_id)',
      db.protokoll.some(function (p) { return p.werkzeug === 'request_reservation' && p.ergebnis === 'ok' && p.reservation_id === 'res-1'; }), '');

    var nochmal = await WZ.werkzeuge(db, ctx()).request_reservation(ANFRAGE);
    t('dieselbe Anfrage zweimal ergibt EINE Reservierung', db.reservierungen.length === 1 && nochmal.wiederholt === true, db.reservierungen.length);

    var belegt = await WZ.werkzeuge(falscheDb({ belegung: [{ reservation_time: '19:30:00', status: 'confirmed' }], tische: 1 }), ctx())
        .request_reservation(ANFRAGE).catch(function (e) { return e; });
    t('eine belegte Zeit wird nicht angefragt', belegt instanceof Error && /nicht anfragbar/.test(belegt.message), String(belegt));

    var ohneTel = await WZ.werkzeuge(falscheDb(), ctx()).request_reservation(Object.assign({}, ANFRAGE, { telefon: '' })).catch(function (e) { return e; });
    t('ohne Telefonnummer keine Anfrage (der Wirt muss zurueckrufen koennen)', ohneTel instanceof Error && /telefon/.test(ohneTel.message), String(ohneTel));

    var gestern = await WZ.werkzeuge(falscheDb(), ctx()).request_reservation(Object.assign({}, ANFRAGE, { datum: '2026-09-24' })).catch(function (e) { return e; });
    t('ein Datum in der Vergangenheit wird abgelehnt', gestern instanceof Error && /Vergangenheit/.test(gestern.message), String(gestern));

    var keineRes = await WZ.werkzeuge(falscheDb({ restaurants: [haus({ features: ['no_reservations'] })], optin: [BOERSE] }), ctx())
        .request_reservation(ANFRAGE).catch(function (e) { return e; });
    t('ein Haus ohne Online-Reservierung nimmt auch ueber den Assistenten keine an', keineRes instanceof Error, String(keineRes));
});

// ==================== 5. Drossel und fail closed ====================
console.log('\n-- 5. Drossel --');
spaeter(async function () {
    var db = falscheDb();
    var w = WZ.werkzeuge(db, ctx());
    var zeiten = ['18:00', '18:30', '19:00', '19:30'], letzte;
    for (var i = 0; i < zeiten.length; i++) {
        // Einmal mit +49, einmal mit 0 -- dieselbe Nummer
        letzte = await w.request_reservation(Object.assign({}, ANFRAGE, { uhrzeit: zeiten[i], telefon: i % 2 ? '0176 1234567' : '+49 176 1234567' }))
            .catch(function (e) { return e; });
    }
    t('die vierte Anfrage derselben Nummer an einem Tag wird gedrosselt -- egal ob +49 oder 0',
      letzte instanceof Error && /Telefonnummer/.test(letzte.message) && db.reservierungen.length === 3, db.reservierungen.length);
    t('... und die Drossel steht im Protokoll', db.protokoll.some(function (p) { return p.ergebnis === 'gedrosselt'; }), '');

    var kaputt = falscheDb({ zaehlenKaputt: true });
    var e1 = await WZ.werkzeuge(kaputt, ctx()).request_reservation(ANFRAGE).catch(function (e) { return e; });
    t('laesst sich nicht zaehlen, wird keine Anfrage angenommen (fail closed)',
      e1 instanceof Error && kaputt.reservierungen.length === 0, kaputt.reservierungen.length);

    var ohneProtokoll = falscheDb({ protokollKaputt: true });
    var e2 = await WZ.werkzeuge(ohneProtokoll, ctx()).request_reservation(ANFRAGE).catch(function (e) { return e; });
    t('fehlt die Protokoll-Tabelle, wird auch nicht reserviert',
      e2 instanceof Error && ohneProtokoll.reservierungen.length === 0, ohneProtokoll.reservierungen.length);
    var lesen = await WZ.werkzeuge(falscheDb({ protokollKaputt: true, zaehlenKaputt: true }), ctx()).search_restaurants({ ort: 'Greetsiel' });
    t('Lesen geht auch ohne Protokoll (es verraet nichts, was nicht auf der Seite steht)', lesen.anzahl >= 1, lesen.anzahl);

    t('Grenze pro Telefon und Tag: 3', KI.GRENZEN.anfragen_pro_telefon_tag === 3, KI.GRENZEN.anfragen_pro_telefon_tag);
    t('die IP-Grenze fuers Lesen ist grosszuegig (Claude/ChatGPT teilen sich Rechenzentrums-IPs)',
      KI.GRENZEN.lesen_pro_ip_10min >= 100, KI.GRENZEN.lesen_pro_ip_10min);
    t('+49 176 ... und 0176 ... sind dieselbe Nummer', KI.telefonSchluessel('+49 176 1234567') === KI.telefonSchluessel('0176/1234567'), '');
});

// ==================== 6. Nur Sichten, nichts Neues offen ====================
console.log('\n-- 6. Datenbank und Auslieferung --');
spaeter(async function () {
    var db = falscheDb({ menu: [{ name: 'x' }] });
    var w = WZ.werkzeuge(db, ctx());
    await w.search_restaurants({});
    await w.get_menu({ restaurant_id: 'greetsieler-boerse' });
    await w.check_availability({ restaurant_id: 'greetsieler-boerse', datum: MORGEN, personen: 2 });
    await w.request_reservation(ANFRAGE);
    var tabellen = db.pfade.map(function (p) { return p.split('?')[0]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
    var erlaubt = ['agent_belegung_v', 'agent_menu_v', 'agent_optin', 'agent_requests', 'agent_restaurants_v', 'agent_tische_v', 'reservations'];
    t('die Werkzeuge lesen nur agent_*-Sichten und schreiben nur reservations + Protokoll',
      tabellen.every(function (x) { return erlaubt.indexOf(x) >= 0; }), tabellen.join(','));
    t('reservations wird nie GELESEN, nur angelegt',
      db.pfade.every(function (p) { return p.indexOf('reservations?') !== 0; }), '');
});
t('SQL: keine Sicht und keine neue Tabelle ist fuer anon lesbar',
  /revoke all on public\.agent_restaurants_v\s+from anon, authenticated/.test(sql)
  && /revoke all on public\.agent_menu_v\s+from anon, authenticated/.test(sql)
  && /revoke all on public\.agent_belegung_v\s+from anon, authenticated/.test(sql)
  && /revoke all on public\.agent_requests from anon, authenticated/.test(sql)
  && !/grant [^;]* to anon/.test(sql), '');
t('SQL: bestehende Tabellen werden nicht geaendert',
  !/alter table public\.(restaurants|menu_items|reservations|menu_categories|restaurant_tables)\b/i.test(sql)
  && !/drop (table|column)/i.test(sql), '');
t('SQL: die Sichten laufen mit den Rechten des Fragenden', (sql.match(/security_invoker = true/g) || []).length === 4, '');
t('SQL: die Belegungs-Sicht zeigt keine Gaestedaten', !/guest_|notes/.test(sql.split('agent_belegung_v')[1].split(';')[0]), '');
t('/mcp steht VOR dem Catch-All', toml.indexOf('from = "/mcp"') > 0 && toml.indexOf('from = "/mcp"') < toml.indexOf('from = "/*"'), '');
t('der MCP-Server ist zustandslos und antwortet als JSON',
  /sessionIdGenerator: undefined/.test(mcpQuelle) && /enableJsonResponse: true/.test(mcpQuelle), '');
t('GET wird abgewiesen (kein offener Stream, der als 502 endet)', /req\.method !== 'POST'/.test(mcpQuelle), '');
t('request_reservation ist als schreibend gekennzeichnet', /request_reservation[\s\S]*?readOnlyHint: false/.test(mcpQuelle), '');
t('ohne Service-Schluessel antwortet der Server 503 statt leer', /if \(!SERVICE_KEY\)[\s\S]{0,120}503/.test(mcpQuelle), '');
t('SEO: Allergen-Spalten haben einen Rueckweg (sonst Seite ohne Gerichte)', /res\.status === 400[\s\S]{0,400}MENU_FELDER_KI/.test(seo), '');
t('SEO: die Seite verspricht nur mit auto_confirm eine Sofort-Bestaetigung', /auto_confirm_reservations'\) >= 0\s*\n?\s*\? 'Bestätigung kommt sofort/.test(seo), '');

(async function () {
    for (var i = 0; i < laeuft.length; i++) {
        try { await laeuft[i](); } catch (e) { t('Abschnitt ' + (i + 1) + ' lief durch', false, e.stack); }
    }
    console.log('\n' + ok + '/' + n + ' gruen');
    process.exit(ok === n ? 0 : 1);
})();
