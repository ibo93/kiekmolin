// STEMPELKARTE -- neu gebaut am 21.10.2026 (datenbank/46-stempelkarte.sql).
//
// Ibo: "mach das so gut, dass es fuer Kunden einfach ist und keine Fehler".
//
// Die alte Fassung dieses Tests las fast nur Quelltext -- und einer seiner
// Checks war fest auf "bestanden" gesetzt. Waehrenddessen konnte sich jeder
// Gast Stempel selbst eintragen, jede Bestellung stempelte doppelt (einmal
// mit der Restaurant-ID als Telefonnummer), und einloesen ging nicht.
//
// Dieser Test FUEHRT den Code der Gaesteseite aus (vm, mit nachgebautem
// fetch und DOM) und prueft, was der Gast sieht -- auch, wenn der Server
// nicht antwortet. Ob die DATENBANK richtig stempelt, prueft
// werkzeug/stempelkarte-sql-pruefen.js in einer echten Postgres.

var path = require('path'), fs = require('fs'), vm = require('vm');
var R = path.join(__dirname, '..');
var H = fs.readFileSync(R + '/index.html', 'utf8');
var SQL = fs.readFileSync(R + '/datenbank/46-stempelkarte.sql', 'utf8');
var OS = fs.readFileSync(R + '/netlify/functions/order-save.js', 'utf8');
var LP = fs.readFileSync(R + '/netlify/functions/loyalty-push.js', 'utf8');
var PP = fs.readFileSync(R + '/netlify/functions/pos-print.js', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var a = H.indexOf('// ==================== STEMPELKARTE (21.10.2026, vom Server gefuehrt)');
var e = H.indexOf('window.closeStempelkarten = closeStempelkarten;');
var BLOCK = a > 0 && e > a ? H.slice(a, e) : '';
t('der neue Block ist da', BLOCK.length > 3000, BLOCK.length);

console.log('\n-- 1. Der Browser schreibt keine Stempel mehr --');
// Kommentare duerfen die alte Tabelle nennen (sie erklaeren, warum sie weg ist) -- Code nicht.
var CODE = BLOCK.replace(/^\s*\/\/.*$/gm, '');
t('kein Zugriff auf die alte Tabelle loyalty_stamps', CODE.indexOf('loyalty_stamps') < 0, 'noch da');
t('kein PATCH/POST auf eine Tabelle -- nur die zwei Lese-Funktionen', !/rest\/v1\/(?!rpc\/kmi_stempel_(stand|meine))/.test(BLOCK) && !/method: 'PATCH'/.test(BLOCK), 'schreibt');
t('der doppelte Stempel-Aufruf mit vertauschten Werten ist weg', H.indexOf('addLoyaltyPoint') < 0, 'addLoyaltyPoint noch da');
t('die tote zweite Stempelkarte im Warenkorb ist weg', H.indexOf('id="loyaltyCardCheckout"') < 0 && H.indexOf('function updateLoyaltyCardCheckout') < 0, 'noch da');

// ---------- Sandbox ----------
var els = {};
function el(id) { return els[id] || (els[id] = { id: id, innerHTML: '', value: '' }); }
var antworten = [], aufrufe = [];
var sb = {
    console: { warn: function () {}, log: function () {} },
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'anon',
    kmiToken: function () { return 'tok'; },
    localStorage: { removeItem: function () {}, getItem: function () { return null; } },
    APP_DATA: { restaurants: [{ id: 'r1', name: 'Zum Kutter', slug: 'kutter', features: ['loyalty_points'] }] },
    currentOrderRestaurant: { id: 'r1', name: 'Zum <b>Kutter</b>', features: ['loyalty_points'] },
    document: { getElementById: el, body: { contains: function () { return true; }, appendChild: function () {} }, createElement: function () { return { style: {}, addEventListener: function () {} }; } },
    window: { matchMedia: function () { return { matches: true }; } },
    navigator: {},
    escapeHtml: function (s) { return String(s).replace(/</g, '&lt;'); },
    fetch: function (url, opt) {
        aufrufe.push({ url: url, opt: opt });
        var ant = antworten.shift() || { status: 500, body: {} };
        return Promise.resolve({ ok: ant.status >= 200 && ant.status < 300, status: ant.status, json: function () { return Promise.resolve(ant.body); } });
    }
};
vm.createContext(sb);
vm.runInContext(BLOCK + '\nthis._schl = _stempelSchluessel;', sb);
function warte() { return new Promise(function (r) { setTimeout(r, 0); }); }
function stand(s) { return { status: 200, body: Object.assign({ aktiv: true, ziel: 10, belohnung: 'ein Gratis-Gericht', stempel: 0, guthaben: 0, gesamt: 0 }, s) }; }

(async function () {
    console.log('\n-- 2. Stand vom Server --');
    antworten.push(stand({ stempel: 3, ziel: 5, belohnung: 'ein Dessert', gesamt: 3 }));
    el('checkoutPhone').value = '0176 555 0001';
    await sb.stempelCheckout();
    var c = aufrufe[0] || { opt: {} };
    t('fragt kmi_stempel_stand per POST mit Lokal und Nummer', /rpc\/kmi_stempel_stand$/.test(c.url) && c.opt.method === 'POST' && /"p_restaurant":"r1"/.test(c.opt.body) && /"p_telefon":"0176 555 0001"/.test(c.opt.body), JSON.stringify(c));
    var h = el('loyaltyCardSection').innerHTML;
    t('Warenkorb: "3 von 5 Stempeln", 5 Felder, Ziel und Belohnung des Lokals', /3 von 5 Stempeln/.test(h) && (h.match(/kmi-stempel-punkt/g) || []).length === 5 && /Noch 2 Bestellungen, dann gibt es ein Dessert\./.test(h), h.slice(0, 300));
    t('der Stempel dieser Bestellung ist als "kommt" markiert', (h.match(/kmi-stempel-punkt kommt/g) || []).length === 1 && /sobald das Lokal deine Bestellung annimmt/.test(h), '');
    t('Lokalname ohne HTML', /<em>Zum &lt;b&gt;Kutter&lt;\/b&gt;<\/em>/.test(h), (h.match(/<em>.*?<\/em>/) || [''])[0]);
    t('ohne Guthaben gibt es nichts einzuloesen', !/kmi-stempel-einloesen/.test(h) && sb.stempelEinloesenFuer('r1', '0176 555 0001') === false, '');

    console.log('\n-- 3. Einloesen --');
    antworten.push(stand({ stempel: 0, guthaben: 1, gesamt: 10, belohnung: 'ein Gratis-Gericht' }));
    el('checkoutPhone').value = '0176 555 0002';
    await sb.stempelCheckout();
    h = el('loyaltyCardSection').innerHTML;
    t('mit Guthaben: ein Schalter "… einloesen", noch aus', /role="switch" aria-checked="false"/.test(h) && /ein Gratis-Gericht einlösen/.test(h), h.slice(0, 400));
    t('nicht angetippt: die Bestellung loest NICHT ein', sb.stempelEinloesenFuer('r1', '0176 555 0002') === false, '');
    sb.stempelEinloesenUmschalten(); await warte();
    h = el('loyaltyCardSection').innerHTML;
    t('angetippt: Schalter an, Satz "das Lokal sieht es"', /aria-checked="true"/.test(h) && /das Lokal sieht es bei deiner Bestellung/.test(h), '');
    t('… und die Bestellung loest ein -- aber nur fuer GENAU diese Nummer und dieses Lokal',
      sb.stempelEinloesenFuer('r1', '01765550002') === true && sb.stempelEinloesenFuer('r1', '0176 555 0001') === false && sb.stempelEinloesenFuer('r2', '0176 555 0002') === false, '');

    console.log('\n-- 4. Wenn es kaputt ist (Regel 6) --');
    // datenbank/46 noch nicht eingespielt (404): dann gibt es keine Stempel --
    // die Karte verschwindet, statt "kommt trotzdem" zu versprechen.
    antworten.push({ status: 404, body: {} });
    el('checkoutPhone').value = '0176 555 0006';
    await sb.stempelCheckout();
    t('SQL fehlt (404): keine Karte, kein falsches Versprechen', el('loyaltyCardSection').innerHTML === '', el('loyaltyCardSection').innerHTML.slice(0, 200));
    antworten.push({ status: 503, body: {} });
    el('checkoutPhone').value = '0176 555 0003';
    await sb.stempelCheckout();
    h = el('loyaltyCardSection').innerHTML;
    t('Server antwortet nicht: KEIN "0 von 10", sondern der Grund und dass der Stempel trotzdem kommt',
      /können gerade nicht angezeigt werden/.test(h) && /kommt trotzdem/.test(h) && !/0 von 10/.test(h), h.slice(0, 300));
    t('bei Fehler loest die Bestellung nichts ein', sb.stempelEinloesenFuer('r1', '0176 555 0003') === false, '');
    // Fehler-Status, aber eine Antwort, die wie ein Stand aussieht: der Status zaehlt.
    antworten.push({ status: 500, body: { aktiv: true, ziel: 10, belohnung: 'x', stempel: 0, guthaben: 0, gesamt: 0 } });
    el('checkoutPhone').value = '0176 555 0004';
    await sb.stempelCheckout();
    t('HTTP 500 mit stand-aehnlicher Antwort: trotzdem Fehler, nicht "0 von 10"', /können gerade nicht angezeigt werden/.test(el('loyaltyCardSection').innerHTML), el('loyaltyCardSection').innerHTML.slice(0, 200));
    // Angetippt, dann ist das Guthaben weg (anderswo eingeloest), spaeter wieder da:
    // der Schalter darf NICHT von selbst wieder an sein.
    antworten.push(stand({ guthaben: 1, gesamt: 10 }));
    el('checkoutPhone').value = '0176 555 0005';
    await sb.stempelCheckout(); sb.stempelEinloesenUmschalten(); await warte();
    antworten.push(stand({ guthaben: 0, gesamt: 10 })); await sb.stempelStand('r1', '0176 555 0005', true); await sb.stempelCheckout();
    antworten.push(stand({ guthaben: 1, gesamt: 20 })); await sb.stempelStand('r1', '0176 555 0005', true); await sb.stempelCheckout();
    t('Guthaben weg und wieder da: Einloesen bleibt aus, bis der Gast es neu antippt', /aria-checked="false"/.test(el('loyaltyCardSection').innerHTML) && sb.stempelEinloesenFuer('r1', '0176 555 0005') === false, el('loyaltyCardSection').innerHTML.slice(0, 300));
    var vorAufrufe = aufrufe.length;
    el('checkoutPhone').value = '12';
    await sb.stempelCheckout();
    t('ohne Telefonnummer: Hinweis, kein Abruf', /Gib unten deine Telefonnummer an/.test(el('loyaltyCardSection').innerHTML) && aufrufe.length === vorAufrufe, aufrufe.length);
    sb.currentOrderRestaurant = { id: 'r9', name: 'Ohne', features: [] };
    await sb.stempelCheckout();
    t('Lokal ohne Stempelkarte: nichts', el('loyaltyCardSection').innerHTML === '', el('loyaltyCardSection').innerHTML);
    sb.currentOrderRestaurant = { id: 'r1', name: 'Zum Kutter', features: ['loyalty_points'] };

    console.log('\n-- 5. Nach der Bestellung --');
    // vorher 3 Stempel (aus Abschnitt 2 im Zwischenspeicher), Lokal hat noch nicht angenommen
    antworten.push(stand({ stempel: 3, ziel: 5, belohnung: 'ein Dessert', gesamt: 3 }));
    sb.stempelNachBestellung('0176 555 0001', 'r1', 'Zum Kutter', false); await warte(); await warte();
    h = el('ocStempelMoment').innerHTML;
    t('noch nicht angenommen: "kommt, sobald das Lokal annimmt", Punkt 4 wartet', /Dein Stempel kommt, sobald das Lokal annimmt/.test(h) && /kmi-stempel-punkt kommt/.test(h) && /Noch 1 Bestellung, dann gibt es ein Dessert\./.test(h), h.slice(0, 400));
    antworten.push(stand({ stempel: 4, ziel: 5, belohnung: 'ein Dessert', gesamt: 4 }));
    sb.stempelNachBestellung('0176 555 0001', 'r1', 'Zum Kutter', false); await warte(); await warte();
    h = el('ocStempelMoment').innerHTML;
    t('sofort angenommen: "Neuer Stempel! 4 von 5", der vierte frisch', /Neuer Stempel! 4 von 5/.test(h) && /voll neu/.test(h), h.slice(0, 400));
    antworten.push(stand({ stempel: 0, guthaben: 1, ziel: 5, belohnung: 'ein Dessert', gesamt: 5 }));
    sb.stempelNachBestellung('0176 555 0001', 'r1', 'Zum Kutter', false); await warte(); await warte();
    h = el('ocStempelMoment').innerHTML;
    t('Karte voll: "ein Dessert wartet", alle 5 voll, Einloesen beim naechsten Mal', /Karte voll – ein Dessert wartet auf dich!/.test(h) && (h.match(/kmi-stempel-punkt voll/g) || []).length === 5 && /Beim nächsten Mal im Warenkorb einlösen/.test(h), h.slice(0, 400));
    antworten.push(stand({ stempel: 1, guthaben: 0, gesamt: 11 }));
    sb.stempelNachBestellung('0176 555 0002', 'r1', 'Zum Kutter', true); await warte(); await warte();
    t('eingeloest: steht dabei, mit der Belohnung', /Eingelöst: ein Gratis-Gericht/.test(el('ocStempelMoment').innerHTML), el('ocStempelMoment').innerHTML.slice(0, 300));
    antworten.push({ status: 500, body: {} });
    sb.stempelNachBestellung('0176 555 0001', 'r1', 'Zum Kutter', false); await warte(); await warte();
    t('Server kaputt: trotzdem ehrlich -- Stempel kommt beim Annehmen', /Dein Stempel kommt, sobald das Lokal die Bestellung annimmt/.test(el('ocStempelMoment').innerHTML), el('ocStempelMoment').innerHTML.slice(0, 300));

    console.log('\n-- 6. Meine Stempelkarten --');
    antworten.push({ status: 500, body: {} });
    var f = await sb.loyaltyAlleHaeuser('0176 555 0001');
    t('Fehler ist ein Fehler, keine leere Liste', f && f.fehler === 'Fehler 500', JSON.stringify(f));
    antworten.push({ status: 200, body: [{ restaurant_id: 'r1', aktiv: true, ziel: 8, belohnung: 'ein Dessert', stempel: 2, guthaben: 1, gesamt: 10 },
                                          { restaurant_id: 'rX', aktiv: false, ziel: 10, belohnung: 'x', stempel: 4, guthaben: 2, gesamt: 4 }] });
    var k = await sb.loyaltyAlleHaeuser('0176 555 0001');
    t('Karten mit Ziel und Belohnung des Hauses', k.length === 2 && k[0].name === 'Zum Kutter' && k[0].ziel === 8 && k[0].gratisOffen === 1 && k[0].belohnung === 'ein Dessert', JSON.stringify(k[0]));
    t('abgeschaltetes Haus: kein offenes Versprechen, unbekanntes Haus heisst "Restaurant"', k[1].gratisOffen === 0 && k[1].name === 'Restaurant', JSON.stringify(k[1]));
    t('fragt kmi_stempel_meine mit der Nummer', /rpc\/kmi_stempel_meine$/.test(aufrufe[aufrufe.length - 1].url), aufrufe[aufrufe.length - 1].url);
    t('zu kurze Nummer: kein Abruf', (await sb.loyaltyAlleHaeuser('12')).length === 0, '');
    var ansicht = H.slice(H.indexOf('async function openMeineStempelkarten'), H.indexOf('function closeStempelkarten'));
    t('Ansicht unterscheidet "kann nicht laden" von "noch keine Stempel"', /karten && karten\.fehler/.test(ansicht) && /können gerade nicht geladen werden/.test(ansicht) && /Noch keine Stempel/.test(ansicht), '');
    t('es steht dabei, dass die Stempel pro Haus gelten', /Stempel gelten pro Haus/.test(ansicht), '');

    console.log('\n-- 7. Bestellung, Server, Bon --');
    t('die Bestellung traegt stempel_einloesen (nur nach stempelEinloesenFuer)', /stempel_einloesen: _stempelEingeloest/.test(H) && /_stempelEingeloest = stempelEinloesenFuer\(currentOrderRestaurant && currentOrderRestaurant\.id, phone\)/.test(H), '');
    t('order-save laesst das Feld durch und prueft das Guthaben vorher', /'stempel_einloesen'/.test(OS) && /if \(order\.stempel_einloesen\) order\.stempel_einloesen = await stempelGuthabenDa\(order\);\s*else delete order\.stempel_einloesen;/.test(OS) && /rpc\/kmi_stempel_stand/.test(OS), '');
    t('sagt der Server "kein Guthaben", steht beim Gast nicht "eingeloest"', /if \(_srvj\.stempel_einloesen === false\) _stempelEingeloest = false;/.test(H), '');
    t('der Bon zeigt STEMPELKARTE (nicht bei kein Guthaben)', /gross\('STEMPELKARTE'\)/.test(PP) && /stempel_ergebnis !== 'kein_guthaben'/.test(PP), '');

    console.log('\n-- 8. Dashboard --');
    t('Bestellkarte zeigt die Einloesung VOR dem Annehmen, und "kein Guthaben" danach', /Stempelkarte eingelöst: <b>/.test(H) && /kein Guthaben mehr – <b>nicht<\/b> gratis/.test(H), '');
    t('Schalter wird beim Oeffnen aus features geladen (stand vorher immer auf "aus")', /stAn\.checked = features\.indexOf\('loyalty_points'\) !== -1;/.test(H), '');
    t('Wirt: Ziel und Belohnung speichern, mit Pruefung auf leere Antwort', /stempel_ziel: ziel, stempel_belohnung: bel\.slice\(0, 60\)/.test(H) && /Die Datenbank hat die Änderung verworfen/.test(H), '');
    t('Wirt: Stammgaeste und von Hand stempeln/einloesen ueber die gesicherten Funktionen', /_stvRpc\('kmi_stempel_liste'/.test(H) && /_stvRpc\('kmi_stempel_hand'/.test(H), '');
    t('fehlt datenbank/46, sagt das Dashboard es (statt leerer Liste)', /bitte datenbank\/46-stempelkarte\.sql in Supabase einspielen/.test(H), '');

    console.log('\n-- 9. Datenbank und Erinnerungen --');
    t('Trigger an orders: beim Annehmen, einmal je Bestellung', /after insert or update of status on public\.orders/.test(SQL) && /stempel_buchungen_einmal/.test(SQL), '');
    t('Einloesen atomar (where guthaben > 0)', /where restaurant_id = rid and telefon = tel and guthaben > 0/.test(SQL), '');
    t('RLS an, keine Regeln -- der Browser kommt nicht direkt heran', /alter table public\.stempelkarten\s+enable row level security/.test(SQL) && !/create policy/i.test(SQL), '');
    t('ein Fehler im Trigger haelt keine Bestellung auf', /exception when others then\s*\n\s*-- Die Bestellung geht IMMER durch/.test(SQL), '');
    t('Erinnerungen aus der neuen Tabelle, alle Seiten, Ziel und Belohnung vom Lokal', /'stempelkarten\?or=\(letzter_push/.test(LP) && /offset=/.test(LP) && /stampsInCard === ziel - 1/.test(LP) && LP.indexOf("'loyalty_stamps?") < 0, '');

    console.log('\n' + ok + '/' + n + ' bestanden');
    if (ok !== n) process.exit(1);
})();
