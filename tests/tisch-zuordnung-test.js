// TISCH-ZUORDNUNG (07.10.2026) -- reservations.table_id zeigte auf "tables".
//
// Gemessen in postgres_logs: 11 x 409 "violates foreign key constraint
// reservations_table_id_fkey -- Key is not present in table "tables"",
// als Ibo im Tischplan Tisch 4 reservierte. Die App nutzt restaurant_tables.
//
// Hier laeuft reservation-guest ECHT gegen eine nachgebaute Datenbank, die
// wie die echte antwortet: mit Tisch -> 409. Erwartet: der Gast wird NICHT
// abgewiesen, zweiter Versuch ohne table_id, "Tisch: Tisch 4" in der Notiz.
// Dazu Quelltext-Pruefungen fuer Tischplan, Listen und die SQL-Datei.
// Den Tischplan im Browser misst werkzeug/tischplan-messen.js (Fall "altFk").
//
// Gegenprobe (jede rot): Rueckfall im Server entfernt, Rueckfall im Plan
// entfernt, Listen wieder fest auf tables:table_id(...seats), SQL ohne
// "not valid" (wuerde an alten Zeilen scheitern).
'use strict';
var fs = require('fs'), path = require('path'), Module = require('module');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var FN = path.join(__dirname, '..', 'netlify', 'functions');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + JSON.stringify(x))); }

(async function () {
  var echtLaden = Module._load;
  Module._load = function (anfrage) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function () {} };
    if (/[\\/]lib[\\/]alarm$/.test(anfrage) || anfrage === './lib/alarm') return { alarm: async function () { alarmiert++; }, senden: async function () {} };
    return echtLaden.apply(this, arguments);
  };
  var alarmiert = 0;
  process.env.SUPABASE_SERVICE_KEY = 'test';
  var RG = require(path.join(FN, 'reservation-guest.js'));
  Module._load = echtLaden;
  var RID = '11111111-2222-3333-4444-555555555555', TID = '99999999-8888-4777-8666-555555555555';
  var eingefuegt = [];
  global.fetch = async function (url, init) {
    url = String(url);
    if (/\/rest\/v1\/aktionen\?/.test(url)) return { ok: true, status: 200, json: async function () { return []; } };
    if (/select=zahlsperre/.test(url)) return { ok: true, json: async function () { return [{ zahlsperre: 'keine' }]; } };
    if (/\/rest\/v1\/restaurants\?/.test(url)) return { ok: true, json: async function () { return [{ id: RID, is_active: true, features: [] }]; } };
    if (/\/rest\/v1\/restaurant_tables\?id=eq\./.test(url)) return { ok: true, json: async function () { return [{ table_number: 4, table_name: 'Tisch 4' }]; } };
    if (/\/rest\/v1\/reservations\?guest_phone/.test(url)) return { ok: true, json: async function () { return []; } };
    if (/\/rest\/v1\/reservations$/.test(url) && init && init.method === 'POST') {
      var k = JSON.parse(init.body); eingefuegt.push(k);
      if (k.table_id) return { ok: false, status: 409, text: async function () { return '{"code":"23503","details":"Key is not present in table \\"tables\\".","message":"insert or update on table \\"reservations\\" violates foreign key constraint \\"reservations_table_id_fkey\\""}'; } };
      return { ok: true, status: 201, json: async function () { return [{ id: 'r1', track_token: 'x'.repeat(32), status: 'pending' }]; } };
    }
    return { ok: true, json: async function () { return []; } };
  };
  var r = await RG.handler({ httpMethod: 'POST', body: JSON.stringify({ restaurant_id: RID, guest_name: 'Celina', guest_phone: '0151', party_size: 2, reservation_date: '2026-10-15', reservation_time: '19:00', table_id: TID, notes: 'Kinderstuhl' }) });
  var a = JSON.parse(r.body), zweiter = eingefuegt[1] || {};
  t('Gast mit Tischwunsch wird NICHT abgewiesen', a.ok === true && r.statusCode === 200, { code: r.statusCode, a: a });
  t('zweiter Versuch ohne table_id', eingefuegt.length === 2 && eingefuegt[0].table_id === TID && !('table_id' in zweiter), eingefuegt);
  t('Wunsch steht vorn in der Notiz, eigene Notiz bleibt', zweiter.notes === 'Tisch: Tisch 4 · Kinderstuhl', zweiter.notes);
  t('kein Alarm (der Gast hat ja reserviert)', alarmiert === 0, alarmiert);

  // Tischplan
  t('Tischplan: bei reservations_table_id_fkey zweiter Versuch ohne Tisch, Notiz "Tisch: <Name>"',
    /if \(!\/reservations_table_id_fkey\|23503\/\.test\(String\(e1 && e1\.message\)\)\) throw e1;\s*delete daten\.table_id; daten\.notes = tischNotiz\(t\)( \+ \(verbund \? ' · ' \+ verbund : ''\))?;/.test(H), '');
  t('... sagt es als Hinweis mit Dateiname', /datenbank\/40-tisch-zuordnung\.sql in Supabase einspielen\.' : '', ohneTisch \? 'hinweis'/.test(H), '');
  t('... und zeigt solche Reservierungen am Tisch', /\(!r\.table_id && notizTisch\(r\) === t\.name\)/.test(H) && /function notizTisch\(r\) \{ var n = String\(r && r\.notes \|\| ''\); if \(n\.indexOf\('Tisch: '\) !== 0\) return null; return n\.slice\(7\)\.split\(' · '\)\[0\]\.trim\(\); \}/.test(H), '');
  // Listen
  t('keine Liste mehr fest auf tables:table_id(...seats) -- alle ueber den Rueckfall',
    !/select=\*,tables:table_id\(id,table_number,seats\)/.test(H) && !/\.select\('\*, tables:table_id\(id, table_number, seats\)'\)/.test(H) && (H.match(/resMitTischLaden\(function \(sel\)/g) || []).length === 2 && /RES_TISCH_EINBETTUNG\[_st\]/.test(H), '');
  t('Rueckfall-Reihenfolge: alt, neu (seats:max_capacity), ohne', /var RES_TISCH_EINBETTUNG = \['tables:table_id\(id,table_number,seats\)', 'tables:table_id\(id,table_number,seats:max_capacity\)', ''\];/.test(H), '');
  // SQL
  var sql = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '40-tisch-zuordnung.sql'), 'utf8');
  t('SQL: Regel zeigt auf restaurant_tables, "not valid" (alte Zeilen unangetastet), on delete set null',
    /references public\.restaurant_tables\(id\)\s*on delete set null\s*not valid;/.test(sql) && /drop constraint if exists reservations_table_id_fkey/.test(sql), '');
  t('SQL: loescht und leert nichts', !/\bdelete from\b|\bupdate public\.reservations\b|\btruncate\b/i.test(sql), '');
  console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
  process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
