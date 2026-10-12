// Bestellung in drei Schritten wie bei Lieferando (Ibo, 12.10.2026:
// "annehmen ist auch direkt zubereitet ... in drei Schritten und nicht wie
// bei uns"). Vorher: Annehmen -> Zubereiten -> Fertig -> Fahrer los ->
// Geliefert = 5 Klicks. Jetzt:
//   Lieferung:  Annehmen -> Unterwegs -> Zugestellt
//   Abholung:   Annehmen -> Fertig    -> Abgeholt
//   Vor Ort:    Annehmen -> Fertig    -> Serviert
// Die Wege werden AUSGEFUEHRT (annahmeStatus + naechsterSchritt).
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }
var S = new Function(fn('annahmeStatus') + fn('naechsterSchritt') + '; return { an: annahmeStatus, weiter: naechsterSchritt };')();

function weg(typ, extra) {
    var o = Object.assign({ status: 'received', order_type: typ }, extra || {}), klicks = ['Annehmen'];
    o.status = S.an(o);
    for (var i = 0; i < 6; i++) { var s = S.weiter(o); if (!s) break; klicks.push(s.text); o.status = s.status; }
    return { klicks: klicks, ende: o.status };
}
var l = weg('delivery'), a = weg('pickup'), v = weg('dine_in');
t('Lieferung: Annehmen → Unterwegs → Zugestellt (3 Klicks)', l.klicks.join(' → ') === 'Annehmen → Unterwegs → Zugestellt' && l.ende === 'delivered', l.klicks.join(' → '));
t('Abholung: Annehmen → Fertig → Abgeholt (3 Klicks)', a.klicks.join(' → ') === 'Annehmen → Fertig → Abgeholt' && a.ende === 'picked_up', a.klicks.join(' → '));
t('Vor Ort: Annehmen → Fertig → Serviert (3 Klicks)', v.klicks.join(' → ') === 'Annehmen → Fertig → Serviert' && v.ende === 'picked_up', v.klicks.join(' → '));
t('Annehmen = gleich "in Zubereitung"', S.an({ order_type: 'pickup' }) === 'preparing', S.an({ order_type: 'pickup' }));
var morgen = new Date(Date.now() + 20 * 3600e3).toISOString(), gleich = new Date(Date.now() + 30 * 60e3).toISOString();
t('Vorbestellung für später bleibt "bestätigt" (Gast liest nicht "wird zubereitet" für morgen)', S.an({ scheduled_at: morgen }) === 'accepted' && S.an({ scheduled_at: gleich }) === 'preparing', S.an({ scheduled_at: morgen }));
var vb = weg('pickup', { scheduled_at: morgen });
t('…und auch sie braucht nur drei Klicks', vb.klicks.length === 3, vb.klicks.join(' → '));
t('alte Bestellungen mitten im Ablauf kommen weiter (bereit + Lieferung → Unterwegs)', S.weiter({ status: 'ready', order_type: 'delivery' }).status === 'out_for_delivery', '');

// Einbau
var cq = fn('confirmAcceptOrder');
t('Annehmen schreibt den Status aus annahmeStatus, mit preparing_at', /var _neuerStatus = annahmeStatus\(_acOrder\);/.test(cq) && /status: _neuerStatus/.test(cq) && /_feld\.preparing_at = _jetztIso/.test(cq), '');
var rd = fn('renderDashboardOrders');
t('Bestellkarte: kein eigener Knopf "Zubereiten" mehr', !/updateOrderStatus\('\$\{order\.id\}', 'preparing'\)/.test(rd) && !/>\s*Zubereiten\s*</.test(rd), '');
t('Bestellkarte: genau EIN nächster Schritt aus naechsterSchritt()', /var _ns = naechsterSchritt\(order\)/.test(rd) && /data-schritt="\$\{_ns\.status\}"/.test(rd), '');
t('Filter: Tab "Angenommen" weg, "Zubereitung" zeigt auch angenommene', !/filterOrders\('accepted', this\)/.test(H) && /orderFilterStatus === 'preparing' \? _inArbeit\.indexOf\(o\.status\) >= 0/.test(rd), '');
var us = fn('updateOrderStatus');
t('Schritt speichern mit Probe: leere Antwort = "Nicht gespeichert" (Regel 6)', /'Prefer': 'return=representation'/.test(us) && /if \(!Array\.isArray\(_stZeilen\) \|\| !_stZeilen\.length\)/.test(us), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
