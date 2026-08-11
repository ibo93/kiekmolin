// DER SELBSTCHECK IN DER APP -- UND WARUM ER NICHT LUEGEN DARF.
//
// GEWUENSCHT WURDE
// ----------------
// "ein Waechter in der App der kontrolliert die App bestellungen,
//  Reservierungen, alle technischen liest er ab gibt Bericht der muss aber
//  echt sein kein Demo".
//
// Der letzte Halbsatz ist die eigentliche Anforderung. Ein Bericht mit
// Beispielzahlen waere schlimmer als gar keiner: der Wirt verlaesst sich
// dann auf etwas, das nie gemessen wurde.
//
// DIE REGEL, DIE DIESE DATEI DURCHSETZT
// -------------------------------------
// Wenn eine Pruefung nicht laufen kann -- Tabelle fehlt, Netz weg, keine
// Rechte --, dann meldet sie "unbekannt" und nennt den Grund. Sie meldet
// NIEMALS "ok". Und der Bericht sagt oben, wie viele Pruefungen wirklich
// gelaufen sind.
//
// Die Tests unten pruefen deshalb vor allem den Fehlerfall. Dass ein
// Waechter bei heiler Welt gruen zeigt, ist leicht; dass er bei kaputter
// Welt nicht gruen zeigt, ist der ganze Punkt.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('async function ' + name + '(');
    if (i < 0) i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// Eine nachgebaute Welt. antworten: pro Tabellenname entweder ein Array
// (gelungene Abfrage) oder ein Fehlertext.
function welt(antworten, extras) {
    extras = extras || {};
    var gefragt = [];
    function fetchStub(url, opt) {
        gefragt.push(url);
        var tabelle = String(url).split('/rest/v1/')[1].split('?')[0];
        var a = antworten[tabelle];
        if (typeof a === 'string') return Promise.resolve({ ok: false, status: 500, text: function () { return Promise.resolve(a); } });
        if (a === 'werfen') return Promise.reject(new Error('Netz weg'));
        var reihen = a || [];
        return Promise.resolve({
            ok: true,
            headers: { get: function (k) { return k === 'content-range' ? '0-0/' + reihen.length : null; } },
            json: function () { return Promise.resolve(reihen); }
        });
    }
    if (antworten.__werfen) fetchStub = function () { return Promise.reject(new Error('Netz weg')); };

    var code = 'var SELBSTCHECK_STAND = { ok: "ok", warnung: "warnung", fehler: "fehler", unbekannt: "unbekannt" };\n'
        + schneide('_scHole') + '\n' + schneide('_scHeuteVon') + '\n' + schneide('_scVorTagen') + '\n'
        + schneide('selbstcheckAusfuehren')
        + '; return selbstcheckAusfuehren;';
    var F = new Function('fetch', 'SUPABASE_URL', 'SUPABASE_KEY', 'AbortController', 'setTimeout',
        'clearTimeout', 'sb', 'window', 'navigator', 'localStorage', 'Notification', '_resolveEventsRestaurantId',
        code)(
        fetchStub, 'https://x.supabase.co', 'schluessel',
        function () { return { abort: function () {}, signal: 'S' }; },
        function () { return 1; }, function () {},
        extras.sb !== undefined ? extras.sb : { getChannels: function () { return [{ state: 'joined' }]; } },
        { Notification: extras.Notification || { permission: 'granted' } },
        extras.navigator || { serviceWorker: { getRegistration: function () { return Promise.resolve({ active: true }); } } },
        extras.localStorage || { getItem: function () { return null; } },
        extras.Notification || { permission: 'granted' },
        function () { return extras.rid !== undefined ? extras.rid : 'r-1'; });
    return { lauf: F, gefragt: gefragt };
}
function finde(b, titel) { return b.filter(function (x) { return x.titel === titel; })[0]; }

var HEILE = {
    restaurants: [{ id: 'r-1' }],
    orders: [{ id: 'o1' }, { id: 'o2' }],
    restaurant_events: [],
    reservations: [],
    menu_items: []
};

(async function () {
    // ---- 1. Heile Welt: es wird wirklich gemessen ---------------------------
    var w = welt(HEILE);
    var b = await w.lauf();
    t('es kommen ueberhaupt Befunde zurueck', b.length >= 8, b.length);
    t('jeder Befund nennt Bereich, Titel, Stand und Wert',
      b.every(function (f) { return f.bereich && f.titel && f.stand && f.wert !== undefined; }));
    t('die Datenbank wurde wirklich gefragt, nicht behauptet',
      w.gefragt.some(function (u) { return /restaurants\?/.test(u); }), w.gefragt.length + ' Abfragen');
    t('jede Abfrage ist auf DAS Restaurant eingegrenzt',
      w.gefragt.filter(function (u) { return !/restaurants\?/.test(u); })
              .every(function (u) { return /restaurant_id=eq\.r-1/.test(u); }),
      w.gefragt.join('\n         '));
    t('die Bestellzahl kommt aus der Abfrage (2 Zeilen -> "2 Bestellungen")',
      finde(b, 'Bestellungen heute').wert === '2 Bestellungen', finde(b, 'Bestellungen heute').wert);
    t('bei heiler Welt steht kein Fehler drin',
      b.filter(function (f) { return f.stand === 'fehler'; }).length === 0);

    // ---- 2. DER KERN: kaputte Welt darf NICHT gruen sein --------------------
    var tot = await welt({ __werfen: true }).lauf();
    t('Datenbank weg -> Fehler, nicht "in Ordnung"',
      finde(tot, 'Datenbank erreichbar').stand === 'fehler', finde(tot, 'Datenbank erreichbar').stand);
    t('KEIN einziger Befund meldet dann "ok" fuer den Betrieb',
      tot.filter(function (f) { return f.bereich === 'Betrieb' && f.stand === 'ok'; }).length === 0,
      JSON.stringify(tot.filter(function (f) { return f.bereich === 'Betrieb'; }).map(function (f) { return f.titel + '=' + f.stand; })));
    t('die Betriebszahlen stehen als "unbekannt" da, nicht als 0',
      tot.filter(function (f) { return f.bereich === 'Betrieb'; })
         .every(function (f) { return f.stand === 'unbekannt' && /nicht ermittelbar/.test(f.wert); }));
    t('und der Grund wird genannt',
      tot.filter(function (f) { return f.stand === 'unbekannt'; }).every(function (f) { return !!f.hinweis; }));

    // Eine einzelne kaputte Tabelle darf die anderen nicht mitreissen -- und
    // sich selbst nicht als in Ordnung ausgeben.
    var ohneProtokoll = await welt(Object.assign({}, HEILE, { restaurant_events: 'relation does not exist' })).lauf();
    t('fehlende Ereignis-Tabelle -> "unbekannt", nicht "keine Fehler"',
      finde(ohneProtokoll, 'Fehlgeschlagene Bestellungen').stand === 'unbekannt',
      finde(ohneProtokoll, 'Fehlgeschlagene Bestellungen').stand);
    t('der Hinweis sagt, was zu tun ist',
      /restaurant_events/.test(finde(ohneProtokoll, 'Fehlgeschlagene Bestellungen').hinweis));
    t('die uebrigen Pruefungen laufen trotzdem durch',
      finde(ohneProtokoll, 'Bestellungen heute').stand === 'ok');

    // ---- 3. Echte Funde werden auch als Fund gemeldet -----------------------
    var mitFehlern = await welt(Object.assign({}, HEILE, {
        restaurant_events: [{ type: 'order_save_failed', message: 'Server-Fehler 500.', created_at: '2026-08-10T18:22:00Z' }]
    })).lauf();
    var ff = finde(mitFehlern, 'Fehlgeschlagene Bestellungen');
    t('eine verlorene Bestellung ist ein Fehler, keine Warnung', ff.stand === 'fehler', ff.stand);
    t('mit Anzahl', /1 in den letzten 7 Tagen/.test(ff.wert), ff.wert);
    // Die Meldung steht jetzt nicht mehr im Hinweis, sondern als Beleg --
    // dort, wo auch Nummer und Zeitpunkt stehen.
    t('und mit der Meldung im Klartext', /Server-Fehler 500/.test(ff.belege[0]), ff.belege[0]);

    var alt = new Date(Date.now() - 30 * 3600000).toISOString();
    var wartend = await welt(Object.assign({}, HEILE, {
        reservations: [{ id: 'x', created_at: alt, guest_name: 'Meier' }]
    })).lauf();
    var rr = finde(wartend, 'Offene Reservierungen');
    t('eine Reservierung, die 30 Stunden wartet, ist eine Warnung', rr.stand === 'warnung', rr.stand);
    t('und der Wirt erfaehrt, wie lange schon', /seit 30 Stunden/.test(rr.hinweis), rr.hinweis);

    var frisch = await welt(Object.assign({}, HEILE, {
        reservations: [{ id: 'x', created_at: new Date().toISOString() }]
    })).lauf();
    t('eine Reservierung von eben ist noch keine Warnung',
      finde(frisch, 'Offene Reservierungen').stand === 'ok');

    var gratis = await welt(Object.assign({}, HEILE, {
        menu_items: [{ id: 'm1', name: 'Pizza Margherita' }]
    })).lauf();
    t('ein Gericht ohne Preis wird gemeldet',
      finde(gratis, 'Speisekarte').stand === 'warnung' && /1 Gericht ohne Preis/.test(finde(gratis, 'Speisekarte').wert),
      finde(gratis, 'Speisekarte').wert);
    t('mit Namen, damit der Wirt es findet',
      /Pizza Margherita/.test(finde(gratis, 'Speisekarte').belege[0]),
      finde(gratis, 'Speisekarte').belege[0]);

    // ---- 4. Technik wird gemessen, nicht geraten ----------------------------
    var langsam = welt(HEILE);
    var kanalWeg = await welt(HEILE, { sb: { getChannels: function () { return [{ state: 'joined' }, { state: 'errored' }]; } } }).lauf();
    t('haengender Echtzeit-Kanal wird gemeldet',
      finde(kanalWeg, 'Echtzeit-Verbindung').stand === 'warnung'
      && /1 von 2/.test(finde(kanalWeg, 'Echtzeit-Verbindung').wert),
      finde(kanalWeg, 'Echtzeit-Verbindung').wert);
    var ohneLib = await welt(HEILE, { sb: null }).lauf();
    t('ohne Supabase-Bibliothek: "unbekannt", nicht "verbunden"',
      finde(ohneLib, 'Echtzeit-Verbindung').stand === 'unbekannt');

    var ohneSw = await welt(HEILE, { navigator: {} }).lauf();
    t('fehlender Service Worker wird als Warnung gemeldet',
      finde(ohneSw, 'Offline-Fähigkeit').stand === 'warnung');
    var swKaputt = await welt(HEILE, { navigator: { serviceWorker: { getRegistration: function () { return Promise.reject(new Error('boom')); } } } }).lauf();
    t('kippt der Service-Worker-Test, heisst es "unbekannt"',
      finde(swKaputt, 'Offline-Fähigkeit').stand === 'unbekannt', finde(swKaputt, 'Offline-Fähigkeit').stand);

    var keinePush = await welt(HEILE, { Notification: { permission: 'denied' } }).lauf();
    t('abgelehnte Benachrichtigungen werden gemeldet',
      finde(keinePush, 'Benachrichtigungen').stand === 'warnung'
      && /abgelehnt/.test(finde(keinePush, 'Benachrichtigungen').wert),
      finde(keinePush, 'Benachrichtigungen').wert);

    // ---- 5. Die liegengebliebene Bestellung aus Schritt 1 -------------------
    var geparkt = await welt(HEILE, {
        localStorage: { getItem: function (k) {
            return k === 'kmi_offene_bestellung'
                ? JSON.stringify({ nummer: 'KI-260811-000123', zeit: Date.now(), grund: 'Netzwerkfehler' }) : null;
        } }
    }).lauf();
    var lg = finde(geparkt, 'Liegengebliebene Bestellung');
    t('eine geparkte Bestellung taucht im Bericht auf', !!lg && lg.stand === 'warnung', lg && lg.stand);
    t('mit Nummer und Grund',
      /KI-260811-000123/.test(lg.belege[0]) && /Netzwerkfehler/.test(lg.belege[0]), lg.belege && lg.belege[0]);
    t('ohne geparkte Bestellung steht dort auch nichts',
      finde(b, 'Liegengebliebene Bestellung') === undefined);

    // ---- 6. Ohne Restaurant wird nichts behauptet ---------------------------
    var ohneRid = await welt(HEILE, { rid: '' }).lauf();
    t('ohne Restaurant-Zuordnung: ein Fehler statt erfundener Zahlen',
      ohneRid.length === 1 && ohneRid[0].stand === 'fehler', JSON.stringify(ohneRid));

    // ---- 7. Der Bericht sagt, wie viel wirklich geprueft wurde --------------
    var B = new Function('escapeHtml', schneide('selbstcheckBericht') + '; return selbstcheckBericht;')(
        function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ''); });

    var berichtTot = B(tot);
    t('bei kaputter Datenbank steht NICHT "Alles in Ordnung" im Bericht',
      berichtTot.indexOf('Alles in Ordnung') < 0);
    t('sondern die Zahl der Fehler', /1 Sache braucht/.test(berichtTot));
    t('und wie viele Pruefungen nicht ermittelbar waren',
      /nicht ermittelbar/.test(berichtTot), berichtTot.slice(0, 200));
    t('der Bericht nennt die Zahl der gelaufenen Pruefungen',
      /von \d+ Prüfungen gelaufen/.test(berichtTot));

    var berichtHeil = B(b);
    t('bei heiler Welt darf "Alles in Ordnung" stehen',
      berichtHeil.indexOf('Alles in Ordnung') > 0);
    t('der Bericht sagt in jedem Fall dazu, dass Ungeprueftes nicht gruen ist',
      /nicht als .In Ordnung/.test(berichtHeil) && /nicht als .In Ordnung/.test(berichtTot));

    // Fremder Text im Bericht bleibt Text -- die Meldungen kommen aus der
    // Datenbank und koennten alles enthalten.
    var boese = B([{ bereich: 'Betrieb', titel: 'X', stand: 'fehler',
                     wert: '<img src=x onerror=alert(1)>', hinweis: '<script>alert(2)</' + 'script>' }]);
    t('Befundtexte werden escapt', boese.indexOf('<img') < 0 && boese.indexOf('<script') < 0);

    // ---- 7b. PRAEZISION: welches Restaurant, welche Bestellung, welcher Gast --
    // "2 fehlgeschlagene Bestellungen" hilft niemandem. Der Wirt muss
    // nachschlagen und anrufen koennen.
    t('der Bericht nennt zuerst das geprueft Restaurant',
      b[0].bereich === 'Geprüft wurde' && /Kennung r-1/.test(b[0].wert), JSON.stringify(b[0]));

    var mitNummern = await welt(Object.assign({}, HEILE, {
        restaurant_events: [
            { type: 'order_save_failed', message: 'Server-Fehler 500.', created_at: '2026-08-10T18:22:00Z',
              payload: { order_number: 'KI-260810-004417' } },
            { type: 'order_verify_failed', message: 'nicht auffindbar', created_at: '2026-08-09T12:03:00Z',
              payload: { order_number: 'KI-260809-002210' } }
        ]
    })).lauf();
    var fb = finde(mitNummern, 'Fehlgeschlagene Bestellungen');
    t('jede fehlgeschlagene Bestellung bekommt eine eigene Zeile', fb.belege.length === 2, fb.belege);
    t('mit Bestellnummer', /KI-260810-004417/.test(fb.belege[0]), fb.belege[0]);
    t('mit Zeitpunkt', /10\.8\.2026/.test(fb.belege[0]), fb.belege[0]);
    t('und im Klartext, WAS schiefging -- nicht der technische Schluessel',
      /nicht gespeichert/.test(fb.belege[0]) && !/order_save_failed/.test(fb.belege[0]), fb.belege[0]);
    t('der zweite Fall wird anders benannt als der erste',
      /nicht auffindbar/.test(fb.belege[1]), fb.belege[1]);

    var gaeste = await welt(Object.assign({}, HEILE, {
        reservations: [{ id: 'a', created_at: alt, guest_name: 'Familie Janssen', party_size: 4,
                         reservation_date: '2026-08-14', reservation_time: '19:00:00' }]
    })).lauf();
    var rb = finde(gaeste, 'Offene Reservierungen').belege;
    t('eine wartende Reservierung nennt den Gast beim Namen', /Familie Janssen/.test(rb[0]), rb[0]);
    t('mit Personenzahl', /4 Pers\./.test(rb[0]), rb[0]);
    t('mit dem gewuenschten Termin', /14\.8\.2026 19:00/.test(rb[0]), rb[0]);
    t('und wie lange schon gewartet wird', /wartet seit 30 Std\./.test(rb[0]), rb[0]);
    t('fehlt der Name, wird keiner erfunden',
      /ohne Namen/.test((await welt(Object.assign({}, HEILE, {
          reservations: [{ id: 'a', created_at: alt }] })).lauf()
      ).filter(function (f) { return f.titel === 'Offene Reservierungen'; })[0].belege[0]));

    var gb = finde(gratis, 'Speisekarte').belege;
    t('ein Gericht ohne Preis wird namentlich genannt', /Pizza Margherita/.test(gb[0]), gb[0]);
    t('mit Kennung, damit es auffindbar ist', /Kennung m1/.test(gb[0]), gb[0]);

    var kanal = finde(kanalWeg, 'Echtzeit-Verbindung');
    t('bei haengender Echtzeit steht da, WELCHER Kanal', kanal.belege.length === 1, kanal.belege);
    t('mit Zustand', /errored/.test(kanal.belege[0]), kanal.belege[0]);

    // ---- 7c. BEHEBEN -- und wo die Grenze liegt ------------------------------
    var R = new Function('return ' + H.slice(H.indexOf('var SELBSTCHECK_REPARATUR = {') + 'var SELBSTCHECK_REPARATUR = '.length,
                                             H.indexOf('async function selbstcheckReparieren')).trim().replace(/;\s*$/, ''))();

    t('Technik-Fehler duerfen behoben werden',
      ['echtzeit', 'offline', 'hinweise', 'geparkt'].every(function (k) { return typeof R[k].lauf === 'function'; }));
    // Der wichtigste Test dieser Datei: eine Reservierung zu beantworten
    // waere eine Nachricht an einen echten Gast. Das entscheidet kein Programm.
    t('eine wartende Reservierung wird NICHT automatisch beantwortet',
      R.zuReservierungen.lauf === undefined && typeof R.zuReservierungen.hinfuehren === 'function');
    t('ein fehlender Preis wird NICHT automatisch gesetzt',
      R.zurSpeisekarte.lauf === undefined && typeof R.zurSpeisekarte.hinfuehren === 'function');
    t('stattdessen fuehren beide nur an die Stelle hin',
      /showDashboardSection\('reservations'\)/.test(H) && /showDashboardSection\('menu'\)/.test(H));
    t('der Befund zur Reservierung verweist auf das Hinfuehren, nicht aufs Beheben',
      finde(gaeste, 'Offene Reservierungen').reparatur === 'zuReservierungen');
    t('und sagt dem Wirt auch, warum er das selbst tun muss',
      /geht an einen echten\s*Gast raus|geht an einen echten Gast raus/.test(finde(gaeste, 'Offene Reservierungen').hinweis),
      finde(gaeste, 'Offene Reservierungen').hinweis);

    // Die geparkte Bestellung: erst nachsehen, sonst kocht die Kueche doppelt.
    t('vor dem Nachreichen wird geprueft, ob sie schon angekommen ist',
      /_bestellungNachpruefen\(g\.nummer\)/.test(H));
    t('bei "unklar" wird NICHT abgeschickt', /keine doppelte Bestellung zu erzeugen/.test(H));

    // Nach jeder Reparatur wird neu gemessen statt Erfolg zu behaupten.
    t('nach dem Beheben wird neu gemessen',
      /await selbstcheckNeuLaden\(\);/.test(schneide('selbstcheckReparieren')));
    t('scheitert die Reparatur, wird das gesagt statt stillzuhalten',
      /Nicht behoben: /.test(schneide('selbstcheckReparieren')));
    t('und der Knopf wird wieder freigegeben',
      /knopf\.disabled = false/.test(schneide('selbstcheckReparieren')));
    t('nichts laeuft von allein -- jede Reparatur braucht einen Klick',
      /onclick="selbstcheckReparieren/.test(H));
    t('die Grenze steht im Quelltext',
      /ER DARF NICHT BEHEBEN/.test(H) && /Das entscheidet kein Programm/.test(H));

    // ---- 8. Nur der Admin ----------------------------------------------------
    var E = new Function('currentAdmin', schneide('selbstcheckErlaubt') + '; return selbstcheckErlaubt;');
    t('Admin darf', E({ isAdmin: true })() === true);
    t('Gastronom darf nicht', E({ isAdmin: false })() === false);
    t('niemand angemeldet: darf nicht', E(null)() === false);
    t('der Menuepunkt traegt admin-only-nav',
      /class="dash-nav-item admin-only-nav" id="navSelbstcheck"/.test(H));
    // Ein verstecktes Menue ist keine Sperre -- die Funktion selbst muss fragen.
    t('openSelbstcheck fragt zuerst nach der Berechtigung',
      /function openSelbstcheck\(\) \{\s*\n\s*if \(!selbstcheckErlaubt\(\)\)/.test(H));
    t('und bricht dann ab, statt nur eine Meldung zu zeigen',
      /Der Selbstcheck ist der Verwaltung vorbehalten[\s\S]{0,80}return;/.test(H));

    // ---- 8b. Verdrahtung -----------------------------------------------------
    t('der Selbstcheck ist im Dashboard-Menue erreichbar',
      /id="navSelbstcheck" onclick="openSelbstcheck\(\)"/.test(H));
    t('openSelbstcheck ist auch wirklich definiert', /function openSelbstcheck\(\)/.test(H));
    t('es gibt einen Knopf zum erneuten Messen',
      /onclick="selbstcheckNeuLaden\(\)"/.test(H));
    t('jede Abfrage hat einen Zeitdeckel', /new AbortController\(\)/.test(schneide('_scHole')));
    t('scheitert der Selbstcheck selbst, sagt er das statt gruen zu zeigen',
      /Der Selbstcheck selbst ist gescheitert/.test(H));

    // ---- 8c. Im Hintergrund mitlaufen ----------------------------------------
    // Der echte Hintergrunddienst liegt auf dem Server (waechter.js). Das
    // hier ist die Ergaenzung fuers offene Dashboard.
    function taktWelt(istAdmin, versteckt) {
        var gesetzt = [], geleert = [], nav = { appendChild: function (e) { nav.kind = e; } };
        var el = { navSelbstcheck: nav, scPunkt: null };
        var F = new Function('currentAdmin', 'document', 'setInterval', 'clearInterval',
            'selbstcheckAusfuehren', 'selbstcheckPunktSetzen',
            'var _scTakt = null;\n'
            + schneide('selbstcheckErlaubt') + '\n'
            + schneide('selbstcheckHintergrundStarten') + '\n'
            + schneide('selbstcheckHintergrundStoppen') + '\n'
            + schneide('selbstcheckStillMessen')
            + '; return { start: selbstcheckHintergrundStarten, stop: selbstcheckHintergrundStoppen,'
            + ' still: selbstcheckStillMessen, takt: function () { return _scTakt; } };')(
            istAdmin ? { isAdmin: true } : { isAdmin: false },
            { hidden: !!versteckt, getElementById: function (id) { return el[id] || null; } },
            function (fn, ms) { gesetzt.push(ms); return 'T1'; },
            function (t) { geleert.push(t); },
            function () { return Promise.resolve([{ stand: 'fehler' }, { stand: 'warnung' }]); },
            function (f, w) { el._punkt = { fehler: f, warnung: w }; });
        return { F: F, gesetzt: gesetzt, geleert: geleert, el: el };
    }

    var adm = taktWelt(true);
    adm.F.start();
    t('beim Admin startet der Takt', adm.gesetzt.length === 1, adm.gesetzt);
    t('und misst alle fuenf Minuten', adm.gesetzt[0] === 300000, adm.gesetzt[0]);
    adm.F.start();
    t('zweimal starten legt keinen zweiten Takt an', adm.gesetzt.length === 1, adm.gesetzt.length);
    adm.F.stop();
    t('stoppen raeumt den Takt ab', adm.geleert.length === 1);

    var gastro = taktWelt(false);
    gastro.F.start();
    t('beim Gastronom startet gar nichts', gastro.gesetzt.length === 0);

    // Im Hintergrund liegende Seite: nicht messen. Schont Akku und Datenbank.
    var versteckt = taktWelt(true, true);
    await versteckt.F.still();
    t('liegt die Seite im Hintergrund, wird nicht gemessen',
      versteckt.el._punkt === undefined, JSON.stringify(versteckt.el._punkt));
    var sichtbar = taktWelt(true, false);
    await sichtbar.F.still();
    t('sichtbar wird gemessen und der Punkt gesetzt',
      sichtbar.el._punkt && sichtbar.el._punkt.fehler === 1 && sichtbar.el._punkt.warnung === 1,
      JSON.stringify(sichtbar.el._punkt));

    // Der Punkt selbst
    var P = new Function('document', schneide('selbstcheckPunktSetzen') + '; return selbstcheckPunktSetzen;');
    function punktWelt() {
        var kind = null;
        var nav = { appendChild: function (e) { kind = e; el.scPunkt = e; } };
        var el = { navSelbstcheck: nav, scPunkt: null };
        return { setz: P({ getElementById: function (id) { return el[id] || null; },
                           createElement: function () { return { style: {}, remove: function () { el.scPunkt = null; } }; } }),
                 el: el, kind: function () { return kind; } };
    }
    var pw = punktWelt();
    pw.setz(2, 0);
    t('bei Fehlern ist der Punkt rot', pw.el.scPunkt.style.background === '#dc2626', pw.el.scPunkt.style.background);
    t('und zeigt die Anzahl', pw.el.scPunkt.textContent === '2', pw.el.scPunkt.textContent);
    t('mit verstaendlichem Titel', /2 Fehler im Betrieb/.test(pw.el.scPunkt.title), pw.el.scPunkt.title);
    var pw2 = punktWelt();
    pw2.setz(0, 3);
    t('nur Hinweise: gelb', pw2.el.scPunkt.style.background === '#f59e0b');
    var pw3 = punktWelt();
    pw3.setz(1, 0); pw3.setz(0, 0);
    t('ist nichts mehr da, verschwindet der Punkt', pw3.el.scPunkt === null);

    t('der Takt haengt an der Anmeldung als Verwaltung',
      /removeGastroRestrictions[\s\S]{0,400}selbstcheckHintergrundStarten\(\)/.test(H));
    t('und wird beim Gastronom-Konto wieder abgeschaltet',
      /applyGastroRestrictions[\s\S]{0,300}selbstcheckHintergrundStoppen\(\)/.test(H));
    t('nichts springt auf -- waehrend des Services will das niemand',
      /Kein Fenster, das aufspringt, kein Ton/.test(H));

    // ---- 9. Der Grund steht im Quelltext ------------------------------------
    t('die Regel gegen erfundene Zahlen steht in der Datei',
      /KEINE ERFUNDENEN ZAHLEN/.test(H));
    t('und warum gruen-bei-Fehlschlag schlimmer waere als nichts',
      /schlimmer als gar keiner/.test(H));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
