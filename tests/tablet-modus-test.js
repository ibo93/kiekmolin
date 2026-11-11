// TABLET-MODUS FUER DIE LIVE-BESTELLUNGEN.
//
// Ibo am 10.11.2026: "Der Wirt muss ja nicht alle Einstellungen sehen, weil
// die Flaeche wirkt klein" -- und dann: "muss schoen schick sein und schnell".
//
// Auf dem Tablet am Tresen stand die ganze Bestellseite: Seitenleiste, zwei
// Zeilen Werkzeuge und Schalter, Restaurant- und Zeitraum-Wahl. Fuer die
// Bestellungen selbst blieb der Rest.
//
// WAS DIESER TEST FESTHAELT -- und wie es kaputt aussaehe:
//  1. Der Modus baut KEINE zweite Bestellansicht. Er legt die vorhandene
//     ueber den Bildschirm. Gaebe es eine zweite, liefe sie irgendwann
//     anders als die erste (Annehmen, Fertig, Bon ...).
//  2. Die drei Spalten stehen im Tablet-Modus schon ab 700 px. Ein Tablet
//     hochkant hat ~800 px; mit der alten Grenze 1000 stuende dort die
//     schmale Liste -- genau da, wo die Spalten gebraucht werden.
//  3. Raus nur durch GEDRUECKTHALTEN. Ein kurzer Tipp in die Ecke darf den
//     Mitarbeiter nicht in die Einstellungen bringen.
//  4. Die Bestellseite liegt UNTER den Dialogen. Laege sie darueber, waeren
//     "Andere Zeit" und "Ablehnen" unsichtbar -- der Knopf taete nichts.
//  5. "Keine Verbindung" steht in der Leiste. Eine Tafel, die still nicht
//     mehr nachlaedt, sieht aus wie ein ruhiger Abend (Regel 6).
//  6. Nach dem Neuladen bleibt das Tablet im Tablet-Modus.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, quelle) {
    quelle = quelle || H;
    var i = quelle.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++;
    var d = 0, j = quelle.indexOf('{', i);
    for (var k = j; k < quelle.length; k++) { if (quelle[k] === '{') d++; else if (quelle[k] === '}') { d--; if (!d) return quelle.slice(i, k + 1); } }
}

// ---- Kleine Welt mit DOM-Ersatz ------------------------------------------
function welt(opt) {
    opt = opt || {};
    var klassen = {}, speicher = opt.speicher || {}, els = {};
    function el(id) {
        if (!els[id]) {
            var cl = {};
            els[id] = { id: id, hidden: id === 'thekeLeiste', textContent: '', innerHTML: '', attrs: {}, style: { setProperty: function () {} },
                classList: { add: function (c) { cl[c] = 1; }, remove: function (c) { delete cl[c]; }, contains: function (c) { return !!cl[c]; },
                    toggle: function (c, an) { if (an) cl[c] = 1; else delete cl[c]; } },
                setAttribute: function (k, v) { this.attrs[k] = v; },
                parentNode: null, lastChild: { textContent: '' } };
            if (id === 'thekeNeu') els[id].parentNode = { classList: els[id].classList };
        }
        return els[id];
    }
    if (opt.sektionAktiv) el('sectionOrders').classList.add('active');
    var aufrufe = [];
    var w = {
        console: console, Date: Date, String: String,
        document: {
            body: { classList: { add: function (c) { klassen[c] = 1; }, remove: function (c) { delete klassen[c]; }, contains: function (c) { return !!klassen[c]; } },
                    attrs: {}, getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
                    setAttribute: function (k, v) { this.attrs[k] = String(v); }, removeAttribute: function (k) { delete this.attrs[k]; },
                    appendChild: function (e) { e.parentNode = this; }, style: { setProperty: function () {} } },
            documentElement: { requestFullscreen: function () { aufrufe.push('vollbild'); return Promise.resolve(); } },
            fullscreenElement: null,
            getElementById: function (id) { return (opt.ohne || []).indexOf(id) >= 0 ? null : el(id); },
            querySelector: function () { return null; }
        },
        window: { matchMedia: function (q) { var px = parseInt(/(\d+)px/.exec(q)[1], 10); return { matches: (opt.breite || 820) >= px }; },
                  APP_DATA: { restaurants: [{ id: 'r1', name: 'Pizza Pronto', features: opt.features || [] }] },
                  resAllReservations: opt.reservierungen || [],
                  resLoadReservations: function () { aufrufe.push('resladen'); } },
        localDayStr: function () { return '2026-11-11'; },
        _resHeuteTag: '2026-11-15', resHeuteZeichnen: function () { aufrufe.push('resheute'); },
        localStorage: { getItem: function (k) { return k in speicher ? speicher[k] : null; }, setItem: function (k, v) { speicher[k] = String(v); }, removeItem: function (k) { delete speicher[k]; } },
        orderFilterStatus: 'all', ordersRestaurantFilter: '', dashboardOrders: opt.bestellungen || [], orderSoundEnabled: true,
        currentAdmin: { restaurant_id: 'r1' },
        showDashboardSection: function (s) { aufrufe.push('seite:' + s); },
        setTimeout: function (f) { f(); },
        renderDashboardOrders: function () { aufrufe.push('render'); },
        kinBildschirmWach: function (an) { aufrufe.push('wach:' + an); },
        btWiederAnmelden: function () { aufrufe.push('bt'); },
        btAlleBtDrucker: function () { return []; },
        ladeStandFehlt: function () { return !!opt.kaputt; },
        filterOrders: function () {}, showToast: function () {},
        setInterval: function () { return 1; }, clearInterval: function () {},
        bestellSpalte: null
    };
    w.window.APP_DATA = w.window.APP_DATA; w.APP_DATA = w.window.APP_DATA;
    vm.createContext(w);
    var quelle = [fn('bestellSpalte'), fn('bestellBrettAn'), 'var THEKE_SCHLUESSEL = "kin_theke"; var THEKE_HALTEN_MS = 900;',
        fn('thekeAktiv'), fn('thekeAn'), fn('thekeZahlen'), fn('thekeLeisteZeichnen'), fn('thekeWiederherstellen'),
        fn('thekeHaus'), fn('thekeReiterArten'), fn('thekeResZahlen'), fn('thekeReiterZeichnen'), fn('thekeAnsichtSetzen'),
        fn('thekeAnsicht'), fn('thekeReservierungenLaden')].join('\n');
    if (opt.umbau) quelle = opt.umbau(quelle);
    vm.runInContext(quelle, w);
    w.resAllReservations = w.window.resAllReservations; w.resLoadReservations = w.window.resLoadReservations;
    return { w: w, el: el, aufrufe: aufrufe, speicher: speicher, klassen: klassen };
}

var B = [
    { id: 'a', status: 'received', restaurant_id: 'r1' },
    { id: 'b', status: 'received', restaurant_id: 'r1' },
    { id: 'c', status: 'accepted', restaurant_id: 'r1' },
    { id: 'd', status: 'preparing', restaurant_id: 'r1' },
    { id: 'e', status: 'confirmed', restaurant_id: 'r1' },
    { id: 'f', status: 'ready', restaurant_id: 'r1' },
    { id: 'g', status: 'out_for_delivery', restaurant_id: 'r1' },
    { id: 'h', status: 'picked_up', restaurant_id: 'r1' },
    { id: 'i', status: 'cancelled', restaurant_id: 'r1' },
    { id: 'j', status: 'received', restaurant_id: 'r2' }
];

// ---- 1. Zaehler: dieselbe Einteilung wie die Spalten --------------------
(function () {
    var W = welt();
    var z = W.w.thekeZahlen(B, 'r1');
    t('Zaehler: 2 neu, 3 in Arbeit, 2 fertig (Lokal r1)', z.neu === 2 && z.arbeit === 3 && z.fertig === 2, JSON.stringify(z));
    var alle = W.w.thekeZahlen(B, '');
    t('ohne Lokal-Filter zaehlt alle Haeuser (3 neu)', alle.neu === 3, JSON.stringify(alle));
    // Mutation: Zaehler ohne Lokal-Filter -> r2 wuerde in r1 mitgezaehlt
    var M = welt({ umbau: function (q) { return q.replace('if (restaurantFilter && o.restaurant_id !== restaurantFilter) return;', ''); } });
    t('Gegenprobe: ohne Lokal-Filter waeren es 3 statt 2 -- Test wird rot', M.w.thekeZahlen(B, 'r1').neu === 3, '');
    t('Zaehler nutzt bestellSpalte (dieselbe Regel wie die Spalten)', /bestellSpalte\(o\.status\)/.test(fn('thekeZahlen')), '');
})();

// ---- 2. Drei Spalten ab 700 px im Tablet-Modus --------------------------
(function () {
    var W = welt({ breite: 820 });
    t('normal, 820 px: keine Spalten (Grenze 1000)', W.w.bestellBrettAn() === false, '');
    W.w.thekeAn(true);
    t('Tablet-Modus, 820 px (Tablet hochkant): Spalten an', W.w.bestellBrettAn() === true, '');
    var schmal = welt({ breite: 600 }); schmal.w.thekeAn(true);
    t('Tablet-Modus, 600 px (Handy): keine Spalten', schmal.w.bestellBrettAn() === false, '');
    var M = welt({ breite: 820, umbau: function (q) { return q.replace('(thekeAktiv() ? 700 : 1000)', '1000'); } });
    M.w.thekeAn(true);
    t('Gegenprobe: mit fester Grenze 1000 blieben die Spalten aus -- Test wird rot', M.w.bestellBrettAn() === false, '');
    var F = welt({ breite: 1200 }); F.w.orderFilterStatus = 'received'; F.w.thekeAn(true);
    // thekeAn stellt den Filter zurueck auf "alle" (querySelector liefert hier null -> direkt gesetzt)
    t('Tablet-Modus setzt den Reiter auf "Alle" zurueck', F.w.orderFilterStatus === 'all', F.w.orderFilterStatus);
})();

// ---- 3. An/Aus, Speicher, Bildschirm wach --------------------------------
(function () {
    var W = welt();
    W.w.thekeAn(true);
    t('an: body bekommt kin-theke', W.klassen['kin-theke'] === 1, '');
    t('an: Leiste sichtbar', W.el('thekeLeiste').hidden === false, '');
    t('an: gemerkt (localStorage kin_theke=1)', W.speicher.kin_theke === '1', JSON.stringify(W.speicher));
    t('an: Bildschirm bleibt wach', W.aufrufe.indexOf('wach:true') >= 0, W.aufrufe.join(','));
    t('an: Bluetooth-Drucker wieder anmelden', W.aufrufe.indexOf('bt') >= 0, '');
    t('an: zeichnet die Liste neu', W.aufrufe.indexOf('render') >= 0, '');
    W.w.thekeAn(false);
    t('aus: body ohne kin-theke', !W.klassen['kin-theke'], '');
    t('aus: Leiste versteckt', W.el('thekeLeiste').hidden === true, '');
    t('aus: vergessen', !('kin_theke' in W.speicher), JSON.stringify(W.speicher));

    // Bestellseite schon offen -> NICHT neu laden (sonst blinkt die Tafel leer)
    var A = welt({ sektionAktiv: true }); A.w.thekeAn(true);
    t('Bestellseite offen: kein Seitenwechsel (kein Neuladen)', A.aufrufe.indexOf('seite:orders') < 0, A.aufrufe.join(','));
    var Z = welt(); Z.w.thekeAn(true);
    t('Bestellseite zu: wechselt hin', Z.aufrufe.indexOf('seite:orders') >= 0, Z.aufrufe.join(','));
})();

// ---- 4. Wiederherstellen nach dem Neuladen -------------------------------
(function () {
    var W = welt({ speicher: { kin_theke: '1' } });
    W.w.thekeWiederherstellen();
    t('nach Neuladen: Tablet-Modus wieder an', W.w.thekeAktiv() === true, '');
    var O = welt({ speicher: {} });
    O.w.thekeWiederherstellen();
    t('ohne Merker: bleibt normal', O.w.thekeAktiv() === false, '');
    t('Wiederherstellen nur fuer angemeldete Wirte (currentAdmin)',
        /currentAdmin\) thekeWiederherstellen\(\)/.test(H), '');
})();

// ---- 5. Leiste: Zahlen, Verbindung, Ton ---------------------------------
(function () {
    var W = welt({ bestellungen: B }); W.w.ordersRestaurantFilter = 'r1';
    W.w.thekeAn(true);
    t('Leiste: 2 neu', W.el('thekeNeu').textContent === 2 || W.el('thekeNeu').textContent === '2', W.el('thekeNeu').textContent);
    t('Leiste: neu-Chip leuchtet (da)', W.el('thekeNeu').classList.contains('da'), '');
    t('Leiste: Lokalname', W.el('thekeLokal').textContent === 'Pizza Pronto', W.el('thekeLokal').textContent);
    t('Leiste: Live', W.el('thekeLive').lastChild.textContent === 'Live' && !W.el('thekeLive').classList.contains('aus'), W.el('thekeLive').lastChild.textContent);
    var K = welt({ kaputt: true }); K.w.thekeAn(true);
    t('Leiste: ohne Verbindung steht "Keine Verbindung" (nicht still leer)',
        K.el('thekeLive').lastChild.textContent === 'Keine Verbindung' && K.el('thekeLive').classList.contains('aus'), K.el('thekeLive').lastChild.textContent);
    var T = welt(); T.w.orderSoundEnabled = false; T.w.thekeAn(true);
    t('Leiste: Ton aus wird angezeigt', T.el('thekeTon').textContent === 'Ton aus' && T.el('thekeTon').attrs['aria-pressed'] === 'false', T.el('thekeTon').textContent);
})();

// ---- 6. Zurueck ins Dashboard: sichtbarer Knopf + kurze Rueckfrage -------
// 11.11.2026, Ibo: "Tablett Modus hat kein zurueck Knopf". Vorher nur
// Gedrueckthalten, und unter 900 px ein Ring ohne Text.
(function () {
    function dom() {
        var els = {}, timers = [];
        function el(id) { return els[id] || (els[id] = { id: id, hidden: id === 'thekeRausFrage', attrs: {}, h: {},
            setAttribute: function (k, v) { this.attrs[k] = v; }, addEventListener: function (e, f) { this.h[e] = f; }, focus: function () {} }); }
        ['thekeRaus', 'thekeRausFrage', 'thekeRausJa', 'thekeRausBleiben'].forEach(el);
        var aus = [];
        var api = new Function('document', 'setTimeout', 'clearTimeout', 'window', 'thekeAn',
            fn('thekeRausFrage') + fn('thekeRausEinrichten') + '; thekeRausEinrichten(); return {};')(
            { getElementById: function (id) { return els[id] || null; } },
            function (f, ms) { timers.push({ f: f, ms: ms }); return timers.length; }, function () {}, {},
            function (an) { aus.push(an); });
        return { els: els, aus: aus, timers: timers };
    }
    var d = dom();
    d.els.thekeRaus.h.click();
    t('Tipp auf "Dashboard" oeffnet die Rueckfrage, beendet noch nicht', d.els.thekeRausFrage.hidden === false && d.aus.length === 0, JSON.stringify(d.aus));
    t('aria-expanded zeigt die offene Rueckfrage', d.els.thekeRaus.attrs['aria-expanded'] === 'true', '');
    d.els.thekeRausJa.h.click();
    t('"Zum Dashboard" beendet den Tablet-Modus', d.aus.join() === 'false' && d.els.thekeRausFrage.hidden === true, JSON.stringify(d.aus));
    var b2 = dom(); b2.els.thekeRaus.h.click(); b2.els.thekeRausBleiben.h.click();
    t('"Bleiben" schliesst nur die Frage', b2.aus.length === 0 && b2.els.thekeRausFrage.hidden === true, '');
    var c = dom(); c.els.thekeRaus.h.click();
    t('Rueckfrage schliesst von selbst (Zeitgeber 3-10 s)', c.timers.length === 1 && c.timers[0].ms >= 3000 && c.timers[0].ms <= 10000, JSON.stringify(c.timers.map(function (x) { return x.ms; })));
    c.timers[0].f();
    t('... und ist danach zu, ohne zu beenden', c.els.thekeRausFrage.hidden === true && c.aus.length === 0, '');
    // Gegenprobe: beendet der Knopf sofort, muss der erste Test rot werden.
    var kaputt = H.replace("thekeRausFrage(!!(f && f.hidden));", "thekeAn(false);");
    var g = (function () { var H0 = H; H = kaputt; try { var x = dom(); x.els.thekeRaus.h.click(); return x; } finally { H = H0; } })();
    t('Gegenprobe: Knopf ohne Rueckfrage wird erkannt', g.aus.length === 1, JSON.stringify(g.aus));
    // Sichtbarkeit: der Text darf nirgends ausgeblendet werden
    t('Text "Dashboard" steht im Knopf', /id="thekeRaus"[\s\S]{0,600}<span class="kin-theke-raus-text">Dashboard<\/span>/.test(H), '');
    t('Text wird in keiner Ansicht/Breite versteckt', !/\.kin-theke-raus-text \{ display: none/.test(H), '');
})();

// ---- 6b. Reservierungen als zweiter Reiter ------------------------------
(function () {
    var R = [
        { id: 'p1', status: 'pending', date: '2026-11-11' },
        { id: 'p2', status: 'pending', date: '2026-11-14' },
        { id: 'p0', status: 'pending', date: '2026-11-01' },
        { id: 'c1', status: 'confirmed', date: '2026-11-11' },
        { id: 's1', status: 'seated', date: '2026-11-11' },
        { id: 'f1', status: 'finished', date: '2026-11-11' },
        { id: 'x1', status: 'cancelled', date: '2026-11-11' }
    ];
    var W = welt({ reservierungen: R, bestellungen: B });
    var rz = W.w.thekeResZahlen(R, '2026-11-11');
    t('Reiter-Zahl: 2 offen (heute + spaeter, nicht die alte vom 01.11.)', rz.offen === 2, JSON.stringify(rz));
    t('Reiter-Zahl ohne Offene: 2 heute erwartet/da (ohne fertig/storniert)', rz.heute === 2, JSON.stringify(rz));
    W.w.thekeAn(true);
    t('an: Leiste haengt am body (gilt fuer beide Reiter)', W.el('thekeLeiste').parentNode === W.w.document.body, '');
    t('an: startet auf Bestellungen', W.w.document.body.getAttribute('data-theke-ansicht') === 'bestellungen', W.w.document.body.getAttribute('data-theke-ansicht'));
    t('an: Reservierungen werden gleich geladen (sonst zaehlt der Reiter 0)', W.aufrufe.indexOf('resladen') >= 0, W.aufrufe.join(','));
    t('Reiter sichtbar, wenn der Betrieb beides nutzt', W.el('thekeReiter').hidden === false, '');
    t('Reiter Reservierungen zeigt "2 neu" und leuchtet', W.el('thekeReiterRZahl').textContent === '2 neu' && W.el('thekeReiterRZahl').classList.contains('neu')
        && W.el('thekeReiterR').classList.contains('ruft'), W.el('thekeReiterRZahl').textContent);
    W.w.thekeAnsicht('reservierungen');
    t('Wechsel: Seite Reservierungen geoeffnet', W.aufrufe.indexOf('seite:reservations') >= 0, W.aufrufe.join(','));
    t('Wechsel: Ansicht reservierungen', W.w.document.body.getAttribute('data-theke-ansicht') === 'reservierungen', '');
    t('Wechsel: immer HEUTE (vorher gewaehlter Tag zurueckgesetzt)', W.w._resHeuteTag === null, String(W.w._resHeuteTag));
    t('Wechsel: Reiter Reservierungen aktiv, Bestellungen nicht', W.el('thekeReiterR').classList.contains('aktiv') && !W.el('thekeReiterB').classList.contains('aktiv'), '');
    W.w.thekeAn(false);
    t('aus aus den Reservierungen: Dashboard bleibt bei Reservierungen', W.aufrufe.lastIndexOf('seite:reservations') > W.aufrufe.indexOf('seite:reservations'), W.aufrufe.join(','));
    t('aus: Ansicht-Merker weg', W.w.document.body.getAttribute('data-theke-ansicht') === null, '');

    var N = welt({ features: ['no_reservations'] });
    N.w.thekeAn(true);
    t('Betrieb ohne Reservierungen: keine Reiter', N.el('thekeReiter').hidden === true, '');
    t('Betrieb ohne Reservierungen: nichts geladen', N.aufrufe.indexOf('resladen') < 0, N.aufrufe.join(','));
    var O = welt({ features: ['no_ordering'] });
    O.w.thekeAn(true);
    t('Betrieb nur mit Reservierungen: Tafel steht auf Reservierungen', O.w.document.body.getAttribute('data-theke-ansicht') === 'reservierungen', O.w.document.body.getAttribute('data-theke-ansicht'));
    // Gegenprobe: Reservierungen nicht beim Einschalten laden -> Reiter zaehlt 0
    var M = welt({ reservierungen: [], umbau: function (q) { return q.replace('thekeReservierungenLaden(true);', ''); } });
    M.w.thekeAn(true);
    t('Gegenprobe: ohne Laden beim Einschalten kein Ladeaufruf -- Test wird rot', M.aufrufe.indexOf('resladen') < 0, '');
    t('Reservierungs-Alarm fuehrt im Tablet-Modus zum Reiter', /closeResAlert\(\);\s*try \{ if \(typeof thekeAktiv === 'function' && thekeAktiv\(\)\) thekeAnsicht\('reservierungen'\);/.test(H), '');
    t('showDashboardSection haelt den Tablet-Modus im Takt', /thekeAktiv\(\) && \(section === 'orders' \|\| section === 'reservations'\)/.test(H), '');
    t('Reservierungen im Tablet-Modus: nur "Heute", Rest aus', /#sectionReservations > \*:not\(#resTabHeute\):not\(\.kmi-stand\) \{ display: none !important; \}/.test(H), '');
    t('Reservierungs-Liste meldet den Reiter-Stand (resHeuteZeichnen -> thekeLeisteZeichnen)', /function resHeuteZeichnen\(\) \{[\s\S]*?thekeLeisteZeichnen\(\); \} catch \(e\) \{\}\n\}/.test(H), '');
})();

// ---- 7. HTML und CSS -----------------------------------------------------
(function () {
    t('Knopf "Tablet-Modus" in der Bestellseite', /id="thekeKnopf"[^>]*onclick="thekeAn\(true\)"/.test(H), '');
    t('Leiste in #sectionOrders, anfangs versteckt', /id="sectionOrders"[\s\S]{0,600}id="thekeLeiste" class="kin-theke-leiste" hidden/.test(H), '');
    t('Rueckfrage ist ein Dialog mit Namen', /id="thekeRausFrage"[^>]*role="dialog"[^>]*aria-label="Tablet-Modus verlassen\?"/.test(H), '');
    var z = parseInt((/body\.kin-theke\[data-theke-ansicht="reservierungen"\] #sectionReservations \{[^}]*z-index: (\d+)/.exec(H) || [])[1], 10);
    var modal = parseInt((/\.modal-overlay \{[^}]*z-index: (\d+)/.exec(H) || [])[1], 10);
    t('Tablet-Modus liegt UNTER den Dialogen (' + z + ' < ' + modal + ')', z > 0 && modal > 0 && z < modal, z + ' / ' + modal);
    t('Kopf mit Werkzeugen ist im Tablet-Modus aus', /body\.kin-theke #sectionOrders > header\.kin-bk,/.test(H), '');
    t('Einstellungen sind im Tablet-Modus aus', /body\.kin-theke #ordersEinstellungen,/.test(H), '');
    t('"Zahlen & Bestseller" ist im Tablet-Modus aus', /body\.kin-theke #ordersMehr,/.test(H), '');
    t('Dunkelmodus fuer die Flaeche', /\.dark-mode body\.kin-theke\[data-theke-ansicht="bestellungen"\] #sectionOrders/.test(H)
        && /\.dark-mode body\.kin-theke\[data-theke-ansicht="reservierungen"\] #sectionReservations/.test(H), '');
    t('Keine zweite Bestellansicht: kein eigenes Kartenrendern im Tablet-Modus',
        !/function theke[A-Za-z]*Karte/.test(H) && !/thekeKarte\(/.test(H), '');
    t('Zaehler bei jedem Neuzeichnen der Bestellliste', /function renderDashboardOrders\(\) \{[\s\S]{0,500}thekeLeisteZeichnen\(\)/.test(H), '');
    t('Bildschirm wird beim Zurueckkommen wieder wach gehalten', /visibilityState === 'visible' && thekeAktiv\(\)\) \{ try \{ kinBildschirmWach\(true\)/.test(H), '');
    t('sw.js CACHE hochgezaehlt (mind. v143)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 143, (/kmi-shell-v(\d+)/.exec(sw) || [])[0]);
})();

console.log('\n' + ok + '/' + n + ' OK');
process.exit(ok === n ? 0 : 1);
