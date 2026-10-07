// FREIE UHRZEITEN: NICHTS ERFINDEN (07.10.2026).
//
// getTableAvailabilityByTime nahm bei einer Stoerung 13 Tische und null
// Reservierungen an -- die Karte zeigte dann "12 Uhrzeiten verfuegbar",
// der Assistent "Ausgebucht" oder alles frei, je nach Stelle. Gemessen in
// edge_logs am 07.10.2026: ein Betrieb hat GAR KEINE Tische eingetragen
// (Antwort []) und bekam ebenfalls 13 untergeschoben.
//
// Hier laeuft der echte Code in einer Sandbox, mit absichtlich
// ausfallender Belegung.
//
// Gegenprobe (jede rot): "totalTables = 13" zurueck, "if (!_bel.ok) throw"
// entfernt, Karten-catch wieder "Reservierung möglich", Assistent-catch
// ohne _ungeprueft, submit ohne _resNurAnfrage, Gast-Tischplan ohne ok-Pruefung.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; if (H.slice(i - 6, i) === 'async ') i -= 6; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var lage = {};
function antwort(body, ok) { return Promise.resolve({ ok: ok !== false, json: function () { return Promise.resolve(body); } }); }
var sb = {
  SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k', kmiToken: function () { return 'k'; },
  todayStrLocal: function () { return '2026-10-07'; },
  generateReservationSlots: function () { return ['23:00', '23:30']; },   // spaet: nie "vergangen"
  sbRead: function () { if (lage.tische === 'kaputt') return Promise.reject(new Error('500')); return antwort(lage.tische); },
  fetch: function () { return lage.belegung === 'kaputt' ? antwort({ ok: false }, false) : antwort({ ok: true, belegung: lage.belegung }); },
  encodeURIComponent: encodeURIComponent, parseInt: parseInt, Array: Array, Date: Date, Promise: Promise, Error: Error, Math: Math
};
vm.createContext(sb);
vm.runInContext(fn('belegungHolen') + '\n' + fn('getTableAvailabilityByTime'), sb);

(async function () {
  // 1) Alles da: echte Zahl
  lage = { tische: [{ id: 1 }, { id: 2 }], belegung: [{ reservation_time: '23:00:00', status: 'confirmed' }] };
  var s = await sb.getTableAvailabilityByTime('r1');
  t('2 Tische, 1 Buchung um 23:00 -> 23:00 noch 1 frei, 23:30 noch 2', s.length === 2 && s[0].free === 1 && s[1].free === 2, JSON.stringify(s));

  // 2) Belegung kaputt: werfen, nicht "alles frei"
  lage = { tische: [{ id: 1 }], belegung: 'kaputt' };
  var fehler = null; try { s = await sb.getTableAvailabilityByTime('r1'); } catch (e) { fehler = e; }
  t('Belegung nicht abrufbar -> Fehler statt "alles frei"', !!fehler, JSON.stringify(s));

  // 3) Tische kaputt: werfen, nicht 13
  lage = { tische: 'kaputt', belegung: [] };
  fehler = null; try { s = await sb.getTableAvailabilityByTime('r1'); } catch (e) { fehler = e; }
  t('Tische nicht abrufbar -> Fehler statt 13 Tische', !!fehler, JSON.stringify(s));

  // 4) Keine Tische eingetragen: keine Zahl erfinden
  lage = { tische: [], belegung: [] };
  s = await sb.getTableAvailabilityByTime('r1');
  t('keine Tische eingetragen -> free/total = null (keine 13)', s.length === 2 && s[0].free === null && s[0].total === null, JSON.stringify(s));
  t('im Code keine 13 mehr', !/totalTables = 13/.test(fn('getTableAvailabilityByTime')), '');

  // ---------- Karte ----------
  var info = { innerHTML: '' };
  var sb2 = { _slotSpeicher: {}, getTableAvailabilityByTime: null };
  vm.createContext(sb2);
  vm.runInContext('var _slotSpeicher = {};\n' + fn('_slotEinerKarte'), sb2);
  sb2.getTableAvailabilityByTime = function () { return Promise.reject(new Error('x')); };
  await sb2._slotEinerKarte('r1', info);
  t('Karte bei Stoerung: "Freie Plätze gerade nicht prüfbar"', /Freie Plätze gerade nicht prüfbar/.test(info.innerHTML) && !/verfügbar|ausgebucht|Reservierung möglich/.test(info.innerHTML), info.innerHTML);
  sb2.getTableAvailabilityByTime = function () { return Promise.resolve([{ time: '18:00', free: null }, { time: '18:30', free: null }]); };
  await sb2._slotEinerKarte('r1', info);
  t('Karte ohne Tischplan: "2 Uhrzeiten wählbar", keine Ampel', /2 Uhrzeiten wählbar/.test(info.innerHTML) && !/#22c55e|#ef4444|ausgebucht/i.test(info.innerHTML), info.innerHTML);
  sb2.getTableAvailabilityByTime = function () { return Promise.resolve([{ time: '18:00', free: 0 }]); };
  await sb2._slotEinerKarte('r1', info);
  t('echt ausgebucht bleibt "Heute ausgebucht"', /Heute ausgebucht/.test(info.innerHTML), info.innerHTML);

  // ---------- Assistent ----------
  var ass = fn('handleAsyncTableQuery');
  t('Assistent: Stoerung heisst "Gerade nicht prüfbar", nicht "Ausgebucht"',
    /catch\(e\) \{ slots = \[\]; _ungeprueft = true; \}/.test(ass) && /_ungeprueft \? 'Gerade nicht prüfbar'/.test(ass), '');

  // ---------- Gast-Tischplan ----------
  var plan = fn('loadCustomerTablePlan');
  t('Gast-Tischplan: ohne Belegung keine "freien" Tische', /if \(!_bel\.ok\) \{[^}]*lässt sich gerade nicht prüfen[\s\S]*?return;/.test(plan), '');

  // ---------- Nur-Anfrage im Formular ----------
  var box = { innerHTML: '' };
  var sb3 = { document: { getElementById: function () { return box; } }, window: {}, localDayStr: function (d) { return d.toLocaleDateString('sv-SE'); }, parseInt: parseInt, Date: Date };
  vm.createContext(sb3); vm.runInContext(fn('slotsNurAnfrage'), sb3);
  sb3.slotsNurAnfrage(['12:00', '19:00'], '2099-01-01');
  t('Nur-Anfrage: Hinweis + beide Zeiten waehlbar, Merker gesetzt',
    /Freie Plätze gerade nicht prüfbar/.test(box.innerHTML) && /das Restaurant bestätigt/.test(box.innerHTML)
    && (box.innerHTML.match(/class="slot-btn"/g) || []).length === 2 && sb3.window._resNurAnfrage === true, box.innerHTML.slice(0, 120));
  t('... ohne "Noch ganz ruhig"/"Empfehlung" (waere geraten)', !/ruhig|Empfehlung|Beliebt/.test(box.innerHTML), '');
  t('Fallback bei Rechenfehler geht auch in Nur-Anfrage', /slotsNurAnfrage\(times, _fDatum\)/.test(fn('renderFallbackSlots')), '');
  t('Absenden: im Nur-Anfrage-Modus immer "pending", auch bei Auto-Bestaetigung',
    /var resStatus = \(isAutoConfirm && !window\._resNurAnfrage\) \? 'confirmed' : 'pending';/.test(H), '');
  t('Merker wird bei jedem neuen Laden zurueckgesetzt', /if \(!date \|\| !partySize\) return;\s*window\._resNurAnfrage = false;/.test(H), '');
  t('Tischzahl nicht ladbar -> nicht still 30, sondern Nur-Anfrage', /window\._realTableCount = 30; window\._tischZahlUnbekannt = true;/.test(H) && /if \(!r\.ok\) throw/.test(H), '');

  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
