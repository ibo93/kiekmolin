// Reservierungsseite des Wirts, Ansicht "Heute" (27.10.2026) -- nach dem
// Entwurf "Reservierungen – Tablet quer" aus Claude Design.
//
// AUSGEFUEHRT, nicht nachgelesen:
//   - die Tagesansicht zeigt ALLE Reservierungen einer Uhrzeit (vorher
//     find(): bei zwei Tischen um 18:00 sah der Wirt nur einen),
//   - "zu spaet" erst ab 15 Minuten, nur heute, nur bestaetigt,
//   - je Uhrzeit "N Tische · M Gäste" -- keine erfundene Auslastung,
//   - "Nicht gekommen" fragt nach,
//   - nicht geladen ist nicht "nichts offen".
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
function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function tag(d) { return d.toLocaleDateString('sv-SE'); }

// Kleine DOM-Attrappe: nur getElementById mit innerHTML/textContent.
function dom() {
    var el = {};
    return {
        el: el,
        getElementById: function (id) { if (!el[id]) el[id] = { innerHTML: '', textContent: '' }; return el[id]; },
        querySelectorAll: function () { return []; }
    };
}
var namen = ['resHeuteZeitMin', 'resZuSpaet', 'resQuelleChip', 'resTagWort', 'resPersonenHtml', 'resTischHtml', 'resOffenKarteHtml', 'resGastZeileHtml', 'resHeuteZeichnen'];
function welt(alle, jetzt, kaputt) {
    var d = dom();
    var code = 'var _resHeuteTag = null;\n' + namen.map(fn).join('\n') + '; return { zeichnen: resHeuteZeichnen, spaet: resZuSpaet, zeile: resGastZeileHtml };';
    var DateEcht = Date;
    function D(a) { if (!arguments.length) return new DateEcht(jetzt.getTime()); return new (Function.prototype.bind.apply(DateEcht, [null].concat([].slice.call(arguments))))(); }
    D.now = function () { return jetzt.getTime(); };
    var f = new Function('window', 'document', 'escapeHtml', 'localDayStr', 'getTimeAgo', 'kinSym', 'waNummer', 'gpChipHtml', 'ladeStandFehlt', 'bestellSchalterZeigen', 'gastProfileLaden', 'Date', code);
    var api = f({ resAllReservations: alle, resCurrentRestaurant: null }, d, esc, tag, function () { return 'vor 3 Min'; }, function () { return '<svg/>'; },
        function (x) { return x ? '49' + String(x).replace(/\D/g, '').replace(/^0/, '') : ''; }, function () { return ''; },
        function () { return !!kaputt; }, function () {}, function () {}, D);
    return { api: api, dom: d.el };
}

var jetzt = new Date(2026, 9, 27, 18, 20, 0);   // Di 27.10.2026, 18:20
var heute = tag(jetzt);
var morgen = tag(new Date(2026, 9, 28, 12));

console.log('\n-- 1. Alle Gaeste einer Uhrzeit --');
var alle = [
    { id: 'a', date: heute, time: '18:00:00', name: 'Schmidt', persons: 2, status: 'confirmed', source: 'app' },
    { id: 'b', date: heute, time: '18:00:00', name: 'Hinrichs', persons: 6, table: 8, table_id: 't8', status: 'confirmed' },
    { id: 'c', date: heute, time: '17:30:00', name: 'Meyer', persons: 4, table: 3, table_id: 't3', status: 'seated' },
    { id: 'd', date: heute, time: '19:00:00', name: 'Tammen', persons: 2, status: 'confirmed' },
    { id: 'p', date: morgen, time: '19:30:00', name: 'Janssen', persons: 6, status: 'pending', source: 'app', phone: '0170 1234412', notes: 'Kinderstuhl' },
    { id: 'q', date: heute, time: '20:00:00', name: 'Peters', persons: 2, status: 'pending', source: 'telefon' }
];
var w = welt(alle, jetzt);
w.api.zeichnen();
var tagHtml = w.dom.resTagListe.innerHTML;
t('beide Gaeste um 18:00 stehen da', tagHtml.indexOf('Schmidt') >= 0 && tagHtml.indexOf('Hinrichs') >= 0, tagHtml.slice(0, 200));
t('18:00: "2 Tische · 8 Gäste"', /18:00<\/b><span>2 Tische · 8 Gäste/.test(tagHtml), (tagHtml.match(/18:00<\/b><span>[^<]*/) || [''])[0]);
t('17:30: "1 Tisch · 4 Gäste"', /17:30<\/b><span>1 Tisch · 4 Gäste/.test(tagHtml), '');
t('keine erfundene Auslastung ("Plätze")', tagHtml.indexOf('Plätze') < 0, '');
t('Uhrzeiten in der richtigen Reihenfolge', tagHtml.indexOf('17:30') < tagHtml.indexOf('18:00') && tagHtml.indexOf('18:00') < tagHtml.indexOf('19:00'), '');
t('Offene stehen NICHT doppelt im Tag', tagHtml.indexOf('Peters') < 0, '');

console.log('\n-- 2. Wartet auf Bestaetigung --');
var offen = w.dom.resOffenListe.innerHTML;
t('beide offenen (heute und morgen)', offen.indexOf('Peters') >= 0 && offen.indexOf('Janssen') >= 0, '');
t('heute zuerst', offen.indexOf('Peters') < offen.indexOf('Janssen'), '');
t('Zahl stimmt', String(w.dom.resOffenZahl.textContent) === '2', w.dom.resOffenZahl.textContent);
t('Bestaetigen ueber confirmDashReservation (RPC, Mail)', /confirmDashReservation\('p'/.test(offen), '');
t('Ablehnen ueber rejectDashReservation (Grund-Dialog)', /rejectDashReservation\('p'/.test(offen), '');
t('WhatsApp mit Landesvorwahl, nicht "0170..."', /wa\.me\/49170/.test(offen), (offen.match(/wa\.me\/\d+/) || [''])[0]);
t('Herkunft sichtbar: Online / Telefon-Assistent', /Online/.test(offen) && /Telefon-Assistent/.test(offen), '');
t('Hinweis des Gastes steht da', /Kinderstuhl/.test(offen), '');
t('Kopf: "2 offen · heute 4 Tische · 14 Gäste"', /2 offen<\/b> · heute 4 Tische · 14 Gäste/.test(w.dom.resHeuteKopf.innerHTML), w.dom.resHeuteKopf.innerHTML);

console.log('\n-- 3. Zu spaet --');
t('18:00 bestaetigt, jetzt 18:20 -> zu spaet', w.api.spaet({ status: 'confirmed', date: heute, time: '18:00' }, jetzt) === true, '');
t('18:10 -> erst 10 Min, noch nicht', w.api.spaet({ status: 'confirmed', date: heute, time: '18:10' }, jetzt) === false, '');
t('sitzt schon -> nie zu spaet', w.api.spaet({ status: 'seated', date: heute, time: '17:00' }, jetzt) === false, '');
t('anderer Tag -> nie zu spaet', w.api.spaet({ status: 'confirmed', date: morgen, time: '10:00' }, jetzt) === false, '');
var zeile = w.api.zeile(alle[0], jetzt);
t('Zeile zeigt "20 Min über" und "Nicht gekommen …"', /20 Min über/.test(zeile) && /Nicht gekommen …/.test(zeile), zeile.slice(0, 160));
t('ohne Tisch: "Tisch zuweisen"', /Tisch zuweisen/.test(zeile), '');
t('sitzt -> "Tisch frei" (finished)', /resStatusSetzen\('c', 'finished'\)/.test(w.api.zeile(alle[2], jetzt)), '');
t('bestaetigt, noch nicht da -> "Ist da" (seated)', /resStatusSetzen\('d', 'seated'\)/.test(w.api.zeile(alle[3], jetzt)), '');

console.log('\n-- 4. Nicht geladen ist nicht leer --');
var w2 = welt([], jetzt, true); w2.api.zeichnen();
t('statt "Nichts offen": "Nicht geladen"', /Nicht geladen/.test(w2.dom.resOffenListe.innerHTML), w2.dom.resOffenListe.innerHTML);
t('und im Tag ebenso', /Nicht geladen/.test(w2.dom.resTagListe.innerHTML), w2.dom.resTagListe.innerHTML);
var w3 = welt([], jetzt, false); w3.api.zeichnen();
t('wirklich leer: "Nichts offen"', /Nichts offen/.test(w3.dom.resOffenListe.innerHTML), '');

console.log('\n-- 5. Nachfragen und Verdrahtung --');
// AUSGEFUEHRT: sagt der Wirt "Nein", geht NICHTS an die Datenbank.
var setzen = function (antwort) {
    var gesendet = [];
    var f = new Function('kinConfirm', 'updateReservationStatus', 'showToast', fn('resStatusSetzen') + '; return resStatusSetzen;');
    return { los: f(function () { return Promise.resolve(antwort); }, function (id, st) { gesendet.push(st); return Promise.resolve(true); }, function () {}), gesendet: gesendet };
};
var nein = setzen(false), ja = setzen(true), da = setzen(false);
Promise.all([nein.los('x', 'no_show'), ja.los('x', 'no_show'), da.los('x', 'seated')]).then(function () {
    t('"Nicht gekommen" + Nein -> nichts gespeichert', nein.gesendet.length === 0, JSON.stringify(nein.gesendet));
    t('"Nicht gekommen" + Ja -> no_show', ja.gesendet.join() === 'no_show', JSON.stringify(ja.gesendet));
    t('"Ist da" fragt nicht erst', da.gesendet.join() === 'seated', JSON.stringify(da.gesendet));
    console.log('\n' + ok + '/' + n + ' bestanden');
    if (ok !== n) process.exitCode = 1;
});
t('Status geht ueber updateReservationStatus (RPC, umgeht RLS)', /await updateReservationStatus\(id, status\)/.test(fn('resStatusSetzen')), '');
t('nach jedem Laden wird "Heute" neu gezeichnet', /window\.resHeuteZeichnen\(\); \} catch \(e\)/.test(H), '');
t('"Heute" ist der erste Reiter und vorausgewaehlt', /id="resTabBtnHeute"/.test(H) && /<div id="resTabHeute" class="res-tab-content active"/.test(H) && /<div id="resTabCalendar" class="res-tab-content" style="display: none;">/.test(H), '');
t('kein Ton-Schalter, der nichts taete', !/kin-bk-res[\s\S]{0,2500}toggleOrderSound/.test(H), '');

console.log('\n-- 6. Kalender-Tagesansicht: alle Gaeste einer Uhrzeit --');
// resRenderDaySlots ist window.resRenderDaySlots = function() -- per Text holen
var i = H.indexOf('window.resRenderDaySlots = function()'), j = H.indexOf('// ===== RESERVIERUNG DETAILS ANZEIGEN', i);
var tagesCode = H.slice(i, j);
t('filter statt find', /var _amSlot = window\.resAllReservations\.filter\(/.test(tagesCode) && !/var res = window\.resAllReservations\.find\(/.test(tagesCode), '');
(function () {
    var cont = { innerHTML: '', querySelectorAll: function () { return []; } };
    var win = { resSelectedDate: new Date(2026, 9, 27, 12), resCurrentRestaurant: null,
        resAllReservations: [{ id: 'x1', date: '2026-10-27', time: '18:00:00', name: 'Erster', persons: 2, status: 'confirmed' },
                             { id: 'x2', date: '2026-10-27', time: '18:00:00', name: 'Zweiter', persons: 4, status: 'confirmed' }] };
    var f = new Function('window', 'document', 'localDayStr', 'generateReservationSlots', 'console', tagesCode.replace('window.resRenderDaySlots = function()', 'return function()'));
    f(win, { getElementById: function () { return cont; } }, tag, function () { return ['17:30', '18:00', '18:30']; }, { error: function () {} })();
    t('beide Namen in der Tagesansicht (ausgefuehrt)', cont.innerHTML.indexOf('Erster') >= 0 && cont.innerHTML.indexOf('Zweiter') >= 0, cont.innerHTML.length);
})();

