// WhatsApp-Einwilligung: Kästchen bei Bestellung + Reservierung, der Server
// prüft Nummer und Bezug, Abmelden per Link. Siehe datenbank/42.
//
// Ibo, 09.10.2026: "eine WhatsApp-Bestätigung, dass sie die Angebote
// erhalten dürfen, und für Reservierungen sowas auch".
'use strict';
var fs = require('fs'), path = require('path');
var W = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(W, 'index.html'), 'utf8');
var SQL = fs.readFileSync(path.join(W, 'datenbank', '42-whatsapp-angebote.sql'), 'utf8');
var TOML = fs.readFileSync(path.join(W, 'netlify.toml'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

// ---- App
['checkoutWaAngebote', 'resWaAngebote'].forEach(function (id) {
    var m = H.match(new RegExp('<input type="checkbox" id="' + id + '"[^>]*>'));
    t(id + ': Kästchen da und NICHT vorangekreuzt', !!m && !/checked/.test(m[0]), m && m[0]);
});
t('Text sagt WAS, WIE und wie man abmeldet', (H.match(/Ja, schickt mir Angebote und Gutscheine dieses Lokals per WhatsApp an meine Telefonnummer\. Abmelden jederzeit mit einem Klick/g) || []).length === 2, '');
t('Bestellung: erst nach dem Speichern, mit echter id und Nummer', /if \(document\.getElementById\('checkoutWaAngebote'\)\?\.checked && _neueZeile && _neueZeile\.id && _orderPayload\.customer_phone\) \{\s*waEinwilligung\('bestellung', _neueZeile\.id, _orderPayload\.customer_phone\);/.test(H), '');
t('Reservierung: nur mit Haken und Nummer, nach dem Speichern', /waAngebote: !!\(document\.getElementById\('resWaAngebote'\)\?\.checked\s*&& document\.getElementById\('guestPhone'\)\?\.value\)/.test(H) && /if \(reservation\.waAngebote && r\.id\) waEinwilligung\('reservierung', r\.id, r\.guest_phone\);/.test(H), '');
t('Fehlschlag bleibt nicht still: Fehlerprotokoll', /WhatsApp-Einwilligung nicht gespeichert: /.test(H) && /WhatsApp-Einwilligung nicht gesendet: /.test(H), '');

// ---- Datenbank
t('SQL: Tabelle mit Quelle, Satz, Zeit, Widerruf, Abmelde-Token, einmal je Gast+Lokal',
    /create table if not exists public\.gast_einwilligungen/.test(SQL) && /quelle\s+text\s+not null check \(quelle in \('bestellung', 'reservierung'\)\)/.test(SQL)
    && /text_fassung\s+text\s+not null/.test(SQL) && /widerrufen_at\s+timestamptz/.test(SQL) && /abmelde_token\s+uuid\s+not null default gen_random_uuid\(\)/.test(SQL)
    && /unique \(restaurant_id, telefon, kanal\)/.test(SQL), '');
t('SQL: Inhaber liest nur, schreibt NICHT (Nachweis, den der Wirt selbst schreibt, ist keiner)',
    /grant select on public\.gast_einwilligungen to authenticated;/.test(SQL) && !/grant[^;]*(insert|update)[^;]*on public\.gast_einwilligungen/.test(SQL) && !/on public\.gast_einwilligungen for (insert|update|all)/.test(SQL), '');
t('SQL: Kampagnen-Empfänger nur mit gültiger Einwilligung (Datenbank weist ab)', /before insert on public\.wa_kampagnen_empfaenger/.test(SQL) && /and e\.widerrufen_at is null/.test(SQL), '');

// ---- Abmelde-Weg
t('kurzer Link /abmelden führt zur Funktion (vor der Sammel-Weiterleitung)', TOML.indexOf('from = "/abmelden"') > 0 && TOML.indexOf('from = "/abmelden"') < TOML.indexOf('from = "/*"') && /to = "\/\.netlify\/functions\/whatsapp-abmelden"/.test(TOML), '');

(async function () {
    var WA = require(path.join(W, 'netlify/functions/lib/wa-angebote'));
    t('Nummer wie in der App: 0176…, +49…, 0049… -> 49176…', WA.nummer('0176 123 4567') === '491761234567' && WA.nummer('+49 176-1234567') === '491761234567' && WA.nummer('0049 1761234567') === '491761234567' && WA.nummer('12') === '', '');

    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    delete require.cache[require.resolve(path.join(W, 'netlify/functions/wa-einwilligung'))];
    var E = require(path.join(W, 'netlify/functions/wa-einwilligung'));
    var jetzt = Date.parse('2026-10-09T18:00:00Z'), aufrufe = [], zeile, upsertAntwort;
    global.fetch = async function (u, o) {
        aufrufe.push({ u: u, o: o || {} });
        if (/gast_einwilligungen/.test(u)) return upsertAntwort;
        return { ok: true, status: 200, json: async function () { return zeile ? [zeile] : []; } };
    };
    function antwort(status, text) { return { ok: status < 300, status: status, text: async function () { return text || ''; } }; }

    zeile = { id: '11111111-2222-3333-4444-555555555555', restaurant_id: 'r1', customer_phone: '0176 1234567', customer_name: 'Ayse', created_at: '2026-10-09T17:55:00Z' };
    upsertAntwort = antwort(201);
    var r = await E._speichern('bestellung', zeile.id, '+49 176 1234567', jetzt);
    var up = aufrufe.filter(function (a) { return /gast_einwilligungen/.test(a.u); })[0];
    var b = up && JSON.parse(up.o.body);
    t('Bestellung passt: gespeichert mit Name, Quelle, Satz, normierter Nummer', r.code === 200 && b.telefon === '491761234567' && b.quelle === 'bestellung' && b.name === 'Ayse' && /^wa-v1: /.test(b.text_fassung) && b.widerrufen_at === null, JSON.stringify(r) + ' ' + JSON.stringify(b));
    t('Upsert je Gast+Lokal; erstmals_at und Token bleiben (nicht mitgeschickt)', /on_conflict=restaurant_id,telefon,kanal/.test(up.u) && /merge-duplicates/.test(up.o.headers.Prefer) && !('erstmals_at' in b) && !('abmelde_token' in b), up.u);

    aufrufe = []; r = await E._speichern('bestellung', zeile.id, '0171 9999999', jetzt);
    t('fremde Nummer: abgelehnt, nichts gespeichert', r.code === 403 && !aufrufe.some(function (a) { return /gast_einwilligungen/.test(a.u); }), JSON.stringify(r));
    aufrufe = []; r = await E._speichern('bestellung', zeile.id, '01761234567', jetzt + 3600000);
    t('alte Bestellung (> 30 Min): abgelehnt', r.code === 403 && /zu alt/.test(r.antwort.error), JSON.stringify(r));
    zeile = null; r = await E._speichern('reservierung', '11111111-2222-3333-4444-555555555555', '01761234567', jetzt);
    t('unbekannte id: abgelehnt', r.code === 404, JSON.stringify(r));
    zeile = { id: 'aaaaaaaa-2222-3333-4444-555555555555', restaurant_id: 'r1', guest_phone: '01761234567', guest_name: 'Jan', created_at: '2026-10-09T17:59:00Z' };
    aufrufe = []; await E._speichern('reservierung', zeile.id, '01761234567', jetzt);
    var b2 = JSON.parse(aufrufe.filter(function (a) { return /gast_einwilligungen/.test(a.u); })[0].o.body);
    t('Reservierung: Quelle "reservierung", Name aus guest_name', b2.quelle === 'reservierung' && b2.name === 'Jan', JSON.stringify(b2));
    upsertAntwort = antwort(404, '{"message":"relation \\"public.gast_einwilligungen\\" does not exist"}');
    r = await E._speichern('reservierung', zeile.id, '01761234567', jetzt);
    t('Tabelle fehlt (SQL 42 nicht eingespielt): klarer Fehler, nicht still', r.code === 502 && /datenbank\/42 einspielen/.test(r.antwort.error), JSON.stringify(r));
    r = await E._speichern('werbung', zeile.id, '01761234567', jetzt);
    t('unbekannte Art: abgelehnt', r.code === 400, JSON.stringify(r));

    delete require.cache[require.resolve(path.join(W, 'netlify/functions/whatsapp-abmelden'))];
    var A = require(path.join(W, 'netlify/functions/whatsapp-abmelden'));
    var s1 = await A.handler({ queryStringParameters: { t: 'kaputt' } });
    t('Abmelden mit kaputtem Link: Seite mit Hinweis "STOP", kein Absturz', s1.statusCode === 400 && /STOP/.test(s1.body), s1.statusCode);
    aufrufe = [];
    global.fetch = async function (u, o) { aufrufe.push({ u: u, o: o }); return { ok: true, status: 200, json: async function () { return [{ id: 'x' }]; } }; };
    var s2 = await A.handler({ queryStringParameters: { t: '11111111-2222-3333-4444-555555555555' } });
    t('Abmelden: setzt widerrufen_at, nur wenn noch nicht abgemeldet', s2.statusCode === 200 && /Abgemeldet/.test(s2.body) && /abmelde_token=eq\.11111111-2222-3333-4444-555555555555&widerrufen_at=is\.null/.test(aufrufe[0].u) && aufrufe[0].o.method === 'PATCH' && /widerrufen_at/.test(aufrufe[0].o.body), aufrufe[0] && aufrufe[0].u);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
