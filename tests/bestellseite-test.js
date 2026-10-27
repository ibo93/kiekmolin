// Bestellseite des Wirts (Ibo, 27.10.2026): "der wirt muss schnell sich
// bedienen koennen" -- Entwurf "Bestellseite Wirt" in Claude Design,
// eins zu eins uebernommen.
//
// Geprueft wird AUSGEFUEHRT, wo es geht:
//   - die Minuten-Tasten (schnellZeiten),
//   - EIN Tipp = angenommen, doppelt tippen nimmt NICHT doppelt an,
//   - die Spalten Neu / In Arbeit / Fertig,
//   - der Countdown (erfindet nichts, wenn die Zeit fehlt),
//   - der Hinweis des Gastes (stand auf dem Bon, nie auf der Karte),
//   - die Felder beim Laden (scheduled_at fiel weg -> Vorbestellung
//     sprang beim Annehmen auf "wird zubereitet").
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}

console.log('\n-- 1. Minuten-Tasten --');
var Z = new Function(fn('schnellZeiten') + '; return schnellZeiten;')();
t('Abholung: 15 / 20 / 30', JSON.stringify(Z(0, 'pickup')) === '[15,20,30]', JSON.stringify(Z(0, 'pickup')));
t('Lieferung: 30 / 45 / 60', JSON.stringify(Z(0, 'delivery')) === '[30,45,60]', JSON.stringify(Z(0, 'delivery')));
t('die Voreinstellung des Hauses ist immer dabei (25 bei Abholung)', Z(25, 'pickup').indexOf(25) >= 0, JSON.stringify(Z(25, 'pickup')));
t('und sortiert', JSON.stringify(Z(25, 'pickup')) === '[15,20,25,30]', JSON.stringify(Z(25, 'pickup')));
t('Unsinn als Voreinstellung kommt nicht rein', JSON.stringify(Z(999, 'pickup')) === '[15,20,30]', JSON.stringify(Z(999, 'pickup')));

console.log('\n-- 2. Ein Tipp = angenommen, nur einmal --');
(function () {
    var aufrufe = 0, feldWerte = [], disabled = [];
    var feld = { value: '' };
    var knoepfe = [{ disabled: false }, { disabled: false }];
    var welt = {
        document: {
            getElementById: function (id) { return id === 'customTimeInput' ? feld : null; },
            querySelectorAll: function (q) { return q.indexOf('data-schnell') >= 0 ? knoepfe : []; }
        },
        acceptOrder: function () { throw new Error('Dialog statt Annahme'); },
        confirmAcceptOrder: function () {
            aufrufe++; feldWerte.push(feld.value + '|' + welt.currentAcceptModus + '|' + welt.currentAcceptOrderId);
            disabled.push(knoepfe[0].disabled);
            return new Promise(function (r) { setTimeout(r, 30); });
        },
        currentAcceptOrderId: null, currentAcceptModus: 'zeit', window: {}
    };
    var code = 'var _schnellLaeuft = {};\n' + fn('schnellAnnehmen') + '; return schnellAnnehmen;';
    var f = new Function('document', 'acceptOrder', 'confirmAcceptOrder', 'W',
        'var window = W.window; var currentAcceptOrderId, currentAcceptModus;'
        + 'var api = (function(){ ' + code + ' })();'
        + 'return { los: api, stand: function(){ return [currentAcceptOrderId, currentAcceptModus]; } };');
    var api = f(welt.document, welt.acceptOrder, function () {
        var r = api.stand(); welt.currentAcceptOrderId = r[0]; welt.currentAcceptModus = r[1];
        return welt.confirmAcceptOrder();
    }, welt);
    var p1 = api.los('o1', 20), p2 = api.los('o1', 20), p3 = api.los('o1', 30);
    Promise.all([p1, p2, p3]).then(function () {
        t('drei schnelle Tipps -> EINE Annahme (sonst zwei Bons, Kueche kocht doppelt)', aufrufe === 1, aufrufe);
        t('mit der getippten Zeit, im Modus "annehmen", fuer die richtige Bestellung', feldWerte[0] === '20|annehmen|o1', feldWerte[0]);
        t('waehrend der Annahme sind die Tasten gesperrt', disabled[0] === true, disabled[0]);
        t('danach ist das Feld wieder leer (sonst steht 20 im naechsten Dialog)', feld.value === '', feld.value);
        t('und die Tasten wieder frei (falls die Annahme scheiterte)', knoepfe[0].disabled === false, knoepfe[0].disabled);
        weiter();
    });
})();

function weiter() {
    console.log('\n-- 3. Spalten --');
    var S = new Function(fn('bestellSpalte') + '; return bestellSpalte;')();
    t('received -> Neu', S('received') === 'neu', S('received'));
    t('accepted / confirmed / preparing -> In Arbeit', ['accepted', 'confirmed', 'preparing'].every(function (x) { return S(x) === 'arbeit'; }), '');
    t('ready / out_for_delivery -> Fertig', S('ready') === 'fertig' && S('out_for_delivery') === 'fertig', S('out_for_delivery'));
    t('der Rest -> Erledigt', S('picked_up') === 'erledigt' && S('cancelled') === 'erledigt', S('cancelled'));

    console.log('\n-- 4. Countdown --');
    var R = new Function(fn('bestellRest') + fn('bestellRestHtml') + '; return { rest: bestellRest, html: bestellRestHtml };')();
    var jetzt = Date.parse('2026-10-27T18:00:00Z');
    var o = { id: 'x', status: 'preparing', estimated_minutes: 20, estimated_time: '2026-10-27T18:08:00Z' };
    t('noch 8 Min', R.rest(o, jetzt) === 8 && /noch 8 Min/.test(R.html(o, jetzt)), R.html(o, jetzt));
    var spaet = { id: 'y', status: 'preparing', estimated_minutes: 30, estimated_time: '2026-10-27T17:56:00Z' };
    t('4 Min drüber, rot markiert', /4 Min drüber/.test(R.html(spaet, jetzt)) && /drueber/.test(R.html(spaet, jetzt)), R.html(spaet, jetzt));
    t('ohne estimated_time: aus accepted_at + Minuten', R.rest({ accepted_at: '2026-10-27T17:50:00Z', estimated_minutes: 15 }, jetzt) === 5, '');
    t('ohne jede Zeit: KEIN Balken (kein erfundener Countdown)', R.html({ id: 'z', status: 'preparing' }, jetzt) === '', R.html({ id: 'z', status: 'preparing' }, jetzt));
    t('eine Vorbestellung fuer spaeter zaehlt nicht runter', R.html({ id: 'v', status: 'accepted', scheduled_at: '2026-10-28T12:00:00Z', estimated_time: '2026-10-27T18:30:00Z' }, jetzt) === '', '');
    t('eine neue Bestellung hat keinen Countdown', R.html({ id: 'n', status: 'received', estimated_time: '2026-10-27T18:30:00Z' }, jetzt) === '', '');

    console.log('\n-- 5. Hinweis des Gastes --');
    var B = new Function(fn('bestellHinweis') + '; return bestellHinweis;')();
    t('der Hinweis steht da', B({ notes: 'Bitte klingeln' }) === 'Bitte klingeln', B({ notes: 'Bitte klingeln' }));
    t('doppelt (notes = delivery_notes) nur einmal', B({ notes: 'Bitte klingeln', delivery_notes: 'Bitte klingeln' }) === 'Bitte klingeln', '');
    t('"[Tisch 7]" allein ist kein Hinweis', B({ notes: '[Tisch 7] ' }) === '', JSON.stringify(B({ notes: '[Tisch 7] ' })));
    var rd = fn('renderDashboardOrders');
    t('und er steht auf der Karte', /bestellHinweis\(order\)/.test(rd) && /class="kin-hinweis"/.test(rd), '');

    console.log('\n-- 6. Felder beim Laden --');
    var lade = fn('loadDashboardOrders');
    ['scheduled_at', 'stempel_einloesen', 'stempel_ergebnis', 'estimated_time', 'accepted_at'].forEach(function (f) {
        t('dashboardOrders behaelt ' + f, new RegExp('\\b' + f + ': order\\.' + f).test(lade), 'faellt weg');
    });

    console.log('\n-- 7. Die Karte --');
    var karte = rd.slice(rd.indexOf("case 'received':"), rd.indexOf("case 'accepted':"));
    t('neue Bestellung: Minuten-Tasten mit schnellAnnehmen', /schnellAnnehmen\(/.test(karte) && /schnellZeiten\(/.test(karte), '');
    t('Ablehnen nur noch als kleiner Link', /kin-text-btn kin-ablehnen[^]*rejectOrder/.test(karte) && !/kin-order-btn reject/.test(karte), '');
    t('und rejectOrder fragt nach, bevor es ablehnt', /kinConfirm\('Bestellung wirklich ablehnen\?/.test(fn('rejectOrder')), '');
    t('"Für Kasse kopieren" nicht vor dem Annehmen', /order\.status !== 'received'\) \{[\s\S]{0,200}copyForKasseBtn/.test(rd) || /order\.status !== 'cancelled' && order\.status !== 'received'/.test(rd), '');
    t('"✓ Bon gedruckt" nur mit printed_at (vom Drucker gesetzt)', /order\.printed_at \? '<span class="kin-bon-gedruckt">/.test(rd), '');
    t('auf dem Tablet drei Spalten', /grid\.innerHTML = _brett \? bestellBrettHtml\(_spalten, _anzahl\) : _alleKarten/.test(rd), '');

    console.log('\n-- 8. Kopf und Schalter --');
    var A = H.indexOf('<div id="sectionOrders"'), E = H.indexOf('<!-- SPEISEKARTE SECTION', A), sek = H.slice(A, E);
    t('der alte Werbesatz ist weg', sek.indexOf('Echtzeit-Bestellverwaltung') < 0, 'steht noch da');
    ['orderSoundBtn', 'fsAlarmBtn', 'autoPrintBtn', 'pushNotifBtn', 'printerStatusBadge', 'kasseStatusBadge', 'druckerMeldungZeile', 'ordersRestaurantSelect', 'ordersTimeFilter', 'ordersConnectionStatus'].forEach(function (id) {
        t('Kennung ' + id + ' gibt es genau einmal', (H.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1, (H.match(new RegExp('id="' + id + '"', 'g')) || []).length);
    });
    t('Zahlen und Bestelloptionen stehen zugeklappt UNTER den Bestellungen', sek.indexOf('id="ordersMehr"') > sek.indexOf('id="ordersGrid"') && sek.indexOf('id="orderSettingsPanel"') > sek.indexOf('id="ordersMehr"'), '');
    t('die Bestelloptionen sind noch da (nicht geloescht)', (H.match(/id="orderSettingsPanel"/g) || []).length === 1, '');
    t('vier Reiter: Alle / Neu / In Arbeit / Fertig', (sek.match(/class="kin-filter-tab/g) || []).length === 4, (sek.match(/class="kin-filter-tab/g) || []).length);
    t('"Fertig" zaehlt auch "Unterwegs"', /ordersCountReady'\); if \(el\) el\.textContent = dashboardOrders\.filter\(o => o\.status === 'ready' \|\| o\.status === 'out_for_delivery'\)/.test(H), '');
    // Der alte Fehler: SVG-Inhalt in einen Material-<span> -- Symbol weg.
    t('Ton-Schalter schreibt kein SVG mehr in den Material-Span', !/icon\.innerHTML = '<polygon/.test(fn('toggleOrderSound')), '');
    t('Auto-Druck ebenso', !/icon\.innerHTML = autoPrintKitchenBon/.test(fn('toggleAutoPrint')), '');
    t('AN/AUS kommt aus EINER Stelle', /bestellSchalterZeigen\(\)/.test(fn('toggleOrderSound')) && /bestellSchalterZeigen\(\)/.test(fn('toggleAutoPrint')) && /bestellSchalterZeigen\(\)/.test(fn('updateFsAlarmBtn')), '');

    console.log('\n-- 9. Eins zu eins wie der Entwurf, aber nichts Erfundenes --');
    t('payment_status bleibt beim Laden (sonst "PayPal · offen" auch wenn bezahlt)', /payment_status: order\.payment_status/.test(lade), 'faellt weg');
    t('ready_at bleibt (fuer "ABHOLBEREIT · 6 MIN")', /ready_at: order\.ready_at/.test(lade), 'faellt weg');
    var st = fn('updateOrderStats');
    t('"Ø Zeit" ist gemessen, nicht fest "38 Min"', st.indexOf("textContent = '38 Min'") < 0 && /o\.ready_at \|\| o\.out_for_delivery_at/.test(st), 'erfundene Zahl');
    t('der Kopf zeigt "N offen · Umsatz" (vorher setzte ihn niemand)', /getElementById\('ordersActiveCount'\)[\s\S]{0,400} offen<\/b> · ' \+ formatPrice\(revenue\)/.test(st), '');
    t('"Fertig" verspricht keine Benachrichtigung, die es nicht gibt', rd.indexOf('Gast benachrichtigen') < 0 && /'Fertig – abholbereit'/.test(rd) && /'Fertig – Fahrer los'/.test(rd), '');
    t('neue Bestellungen: die AELTESTE oben', /if \(a\.status === 'received'\) return new Date\(a\.created_at\) - new Date\(b\.created_at\);/.test(rd), '');
    t('weitere neue Bestellungen kompakt in einer Zeile', /_kompakt = _brett && _sp0 === 'neu' && \(_neuGezeigt\+\+ > 0\)/.test(rd) && /bestellPosKurz\(order\.items\)/.test(rd), '');
    t('Zeit aendern / Stornieren / Fuer Kasse hinter "⋯" (nicht weg)', /kin-links-offen/.test(rd) && /zeitAendern\(/.test(rd) && /openCancelOrderDialog\(/.test(rd) && /\.kin-links \{ display: none !important; \}/.test(H), '');
    var P = new Function('escapeHtml', 'formatPrice', fn('bestellExtrasText') + fn('bestellPosHtml') + '; return bestellPosHtml;')(function (x) { return String(x); }, function (x) { return x + ' €'; });
    var pos = P([{ quantity: 2, name: 'Pizza', options: 'Extra Käse, Peperoni', notes: 'ohne Zwiebeln', price: 23 }], false);
    t('Extras gold darunter: "+ Extra Käse, + Peperoni"', /kin-pos-extra">\+ Extra Käse, \+ Peperoni/.test(pos), pos);
    t('Sonderwunsch der Position steht da', /kin-pos-notiz">✎ ohne Zwiebeln/.test(pos), pos);
    t('In Arbeit ohne Preise', pos.indexOf('23 €') < 0, pos);
    t('Neu mit Preisen', P([{ quantity: 1, name: 'A', price: 4 }], true).indexOf('4 €') >= 0, '');
    var F = new Function(fn('bestellFertigSchild') + '; return bestellFertigSchild;')();
    var j2 = Date.parse('2026-10-27T18:00:00Z');
    t('"Abholbereit · 6 Min"', F({ status: 'ready', order_type: 'pickup', ready_at: '2026-10-27T17:54:00Z' }, j2) === 'Abholbereit · 6 Min', F({ status: 'ready', order_type: 'pickup', ready_at: '2026-10-27T17:54:00Z' }, j2));
    t('"Unterwegs · 3 Min"', F({ status: 'out_for_delivery', order_type: 'delivery', out_for_delivery_at: '2026-10-27T17:57:00Z' }, j2) === 'Unterwegs · 3 Min', '');
    t('ohne Zeit keine erfundenen Minuten', F({ status: 'ready', order_type: 'pickup' }, j2) === 'Abholbereit', F({ status: 'ready', order_type: 'pickup' }, j2));

    console.log('\n' + ok + '/' + n + ' bestanden');
    if (ok !== n) process.exitCode = 1;
}
