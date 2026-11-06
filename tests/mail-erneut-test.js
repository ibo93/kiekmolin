// GAST-E-MAIL KORRIGIEREN UND BESTAETIGUNG ERNEUT SENDEN (06.11.2026).
//
// Ibo, mit Resend offen: "Recipient not found" bei einem Gast, der sich
// bei der Adresse vertippt hatte. Danach gab es keinen Weg, die Mail an die
// richtige Adresse zu schicken. "ja mach das da kann ich machen."
//
// Diese Datei laesst order-email WIRKLICH laufen (Datenbank und Resend
// nachgebaut) und fuehrt die Knopf-Logik der App aus. Gefragt wird vor
// allem: Wie sieht es aus, wenn es kaputt ist? -- fremdes Lokal, keine
// Anmeldung, Speichern ohne Recht (Supabase sagt 200 mit []).
'use strict';
var fs = require('fs'), path = require('path');
var KMI = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}

// ---------------------------------------------------------------- Server
process.env.RESEND_API_KEY = 're_probe';
process.env.SUPABASE_SERVICE_KEY = 'dienst-probe';
var DB = {
    'aaaaaaaa-0001': { id: 'aaaaaaaa-0001', restaurant_id: 'haus-a', status: 'confirmed', guest_name: 'Lars', guest_email: 'lars.jansen@autohaus.de', reservation_date: '2026-11-08', reservation_time: '20:00:00', party_size: 4, confirmation_email_sent_at: '2026-11-06T16:07:00Z' },
    'aaaaaaaa-0002': { id: 'aaaaaaaa-0002', restaurant_id: 'haus-a', status: 'pending', guest_name: 'Sabrina', guest_email: 'sabrina@beispiel.se', reservation_date: '2026-11-08', reservation_time: '19:00:00', party_size: 2, confirmation_email_sent_at: '2026-11-06T16:07:00Z' },
    'aaaaaaaa-0003': { id: 'aaaaaaaa-0003', restaurant_id: 'haus-a', status: 'confirmed', guest_name: 'Ohne', guest_email: null, reservation_date: '2026-11-08', reservation_time: '19:00:00', party_size: 2 }
};
// Der Wirt von haus-a sieht nur haus-a (Lese-Regel aus 09-alles-in-einem).
var TOKEN_A = 'wirt-a-token', TOKEN_B = 'wirt-b-token';
var mails = [], aufrufe = [];
global.fetch = async function (url, opt) {
    opt = opt || {};
    var h = opt.headers || {};
    aufrufe.push({ url: url, method: opt.method || 'GET', auth: h.Authorization || h.authorization });
    if (/api\.resend\.com/.test(url)) {
        mails.push(JSON.parse(opt.body));
        return { ok: true, status: 200, json: async function () { return { id: 'm' }; }, text: async function () { return ''; } };
    }
    var m = /reservations\?id=eq\.([^&]+)/.exec(url);
    if (m) {
        var r = DB[decodeURIComponent(m[1])];
        var auth = String(h.Authorization || '');
        var zeilen;
        if (auth === 'Bearer dienst-probe') zeilen = r ? [r] : [];
        else if (auth === 'Bearer ' + TOKEN_A) zeilen = r && r.restaurant_id === 'haus-a' ? [{ id: r.id, status: r.status }] : [];
        else if (auth === 'Bearer abgelaufen') return { ok: false, status: 401, json: async function () { return {}; }, text: async function () { return ''; } };
        else zeilen = [];
        return { ok: true, status: 200, json: async function () { return zeilen; }, text: async function () { return JSON.stringify(zeilen); } };
    }
    if (/restaurants\?/.test(url)) return { ok: true, status: 200, json: async function () { return [{ id: 'haus-a', name: 'Taverna Jever', city: 'Jever' }]; } };
    return { ok: true, status: 200, json: async function () { return []; }, text: async function () { return '[]'; } };
};
var OE = require(path.join(KMI, 'netlify', 'functions', 'order-email.js'));
function post(body, token) {
    var headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return OE.handler({ httpMethod: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (r) { r.d = JSON.parse(r.body); return r; });
}

// ---------------------------------------------------------------- App
var SANDBOX = function (antworten) {
    var log = [];
    var dom = {};
    function el(id, extra) { dom[id] = Object.assign({ id: id, value: '', attrs: {}, disabled: false, textContent: '', className: '',
        getAttribute: function (k) { return this.attrs[k] == null ? null : this.attrs[k]; },
        setAttribute: function (k, v) { this.attrs[k] = String(v); }, focus: function () {} }, extra || {}); return dom[id]; }
    var f = new Function('document', 'fetch', 'SUPABASE_URL', 'SUPABASE_KEY', 'kmiToken', 'showToast', 'escapeHtml', 'window',
        ['resMailGueltig', 'resMailBlockHtml', 'resMailSpeichern', 'resBestaetigungErneut'].map(fn).join('\n')
        + '; return { gueltig: resMailGueltig, block: resMailBlockHtml, speichern: resMailSpeichern, erneut: resBestaetigungErneut };');
    var win = { resAllReservations: [{ id: 'aaaaaaaa-0001', email: 'lars.janasen@autohaus.de' }] };
    var api = f({ getElementById: function (id) { return dom[id] || null; } },
        async function (url, opt) {
            log.push({ url: url, method: (opt && opt.method) || 'GET', body: opt && opt.body ? JSON.parse(opt.body) : null, headers: (opt && opt.headers) || {} });
            var a = antworten(url, opt);
            return { ok: a.status < 300, status: a.status, json: async function () { return a.json; } };
        },
        'https://sb', 'anon', function () { return TOKEN_A; }, function () {},
        function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
        win);
    return { api: api, log: log, el: el, dom: dom, win: win };
};

(async function () {
    // ---- Server: wer darf ----
    var r = await post({ reservation_id: 'aaaaaaaa-0001', event: 'erneut' });
    t('Ohne Anmeldung: 401, keine Mail', r.statusCode === 401 && mails.length === 0, r.statusCode + ' ' + mails.length);
    r = await post({ reservation_id: 'aaaaaaaa-0001', event: 'erneut' }, TOKEN_B);
    t('Fremdes Lokal: 403 mit klarem Satz, keine Mail', r.statusCode === 403 && /nicht zu deinem Lokal/.test(r.d.fehler) && mails.length === 0, r.statusCode + ' ' + JSON.stringify(r.d));
    r = await post({ reservation_id: 'aaaaaaaa-0001', event: 'erneut' }, 'abgelaufen');
    t('Abgelaufene Anmeldung: sagt es, keine Mail', r.statusCode === 401 && /neu anmelden/.test(r.d.fehler) && mails.length === 0, JSON.stringify(r.d));
    // Die Pruefung laeuft mit dem Schluessel des WIRTS, nicht dem Dienstschluessel.
    var pruef = aufrufe.filter(function (a) { return a.auth === 'Bearer ' + TOKEN_B; });
    t('Berechtigung wird mit dem Schluessel des Wirts gelesen (Lese-Regel)', pruef.length === 1, pruef.length);

    // ---- Server: senden ----
    aufrufe.length = 0;
    r = await post({ reservation_id: 'aaaaaaaa-0001', event: 'erneut' }, TOKEN_A);
    t('Eigenes Lokal: gesendet an die gespeicherte Adresse', r.statusCode === 200 && r.d.sent === true && r.d.an === 'lars.jansen@autohaus.de' && mails.length === 1 && mails[0].to[0] === 'lars.jansen@autohaus.de', JSON.stringify(r.d));
    t('Bestaetigt -> Betreff "Reservierung bestätigt"', /^Reservierung bestätigt – Taverna Jever, 20:00 Uhr/.test(mails[0].subject), mails[0].subject);
    t('Kein Duplikatschutz-Stempel blockiert das erneute Senden', !aufrufe.some(function (a) { return a.method === 'PATCH'; }), JSON.stringify(aufrufe.map(function (a) { return a.method; })));
    r = await post({ reservation_id: 'aaaaaaaa-0001', event: 'erneut' }, TOKEN_A);
    t('Zweimal druecken = zweimal senden (genau das ist "erneut")', r.d.sent === true && mails.length === 2, mails.length);
    r = await post({ reservation_id: 'aaaaaaaa-0002', event: 'erneut' }, TOKEN_A);
    t('Offene Anfrage -> "Reservierungsanfrage eingegangen", trotz altem Stempel', r.d.sent === true && /^Reservierungsanfrage eingegangen/.test(mails[2].subject), mails[2] && mails[2].subject);
    r = await post({ reservation_id: 'aaaaaaaa-0003', event: 'erneut' }, TOKEN_A);
    t('Ohne Adresse: sagt es, statt still nichts zu tun', r.d.ok === false && /Keine E-Mail/.test(r.d.fehler) && mails.length === 3, JSON.stringify(r.d));
    // Der alte Weg bleibt wie er war: received mit Stempel wird nicht doppelt gesendet.
    var vorher = mails.length;
    r = await post({ reservation_id: 'aaaaaaaa-0001', event: 'confirmed' });
    t('Alter Weg (confirmed, ohne Anmeldung) unveraendert', r.d.sent === true && mails.length === vorher + 1, JSON.stringify(r.d));
    t('Authorization ist als Kopfzeile erlaubt (CORS)', /'Access-Control-Allow-Headers': 'Content-Type, Authorization'/.test(fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'order-email.js'), 'utf8')), '');

    // ---- App: Formular ----
    var S = SANDBOX(function () { return { status: 200, json: [] }; });
    var b = S.api.block('editRes', 'aaaaaaaa-0001', 'a"b@x.de', 'S', 'L');
    t('Formular-Block: Feld mit alter Adresse, Knopf, Meldezeile', /type="email" id="editResEmail" data-alt="a&quot;b@x\.de" value="a&quot;b@x\.de"/.test(b) && /Bestätigung erneut senden/.test(b) && /id="editResMailHinweis"[^>]*role="status"/.test(b), b);
    t('Adresse pruefen: richtig / falsch', S.api.gueltig('lars.jansen@autohaus-wirdemann.de') && !S.api.gueltig('lars.jansen@autohaus') && !S.api.gueltig('lars jansen@x.de') && !S.api.gueltig(''), '');
    t('Beide Bearbeiten-Fenster haben das Feld', /resMailBlockHtml\('editRes', res\.id, res\.email,/.test(H) && /resMailBlockHtml\('greRes', res\.id, res\.guest_email,/.test(H), '');
    t('Liste uebernimmt guest_email (sonst waere das Feld immer leer)', /email: r\.guest_email \|\| '',/.test(H), '');
    // Speichern vor der RPC -- sie kennt das Feld nicht.
    var sp1 = H.indexOf("var _mail = await resMailSpeichern(resId, 'editRes');"), rpc1 = H.indexOf('update_reservation_details', sp1);
    var sp2 = H.indexOf("var _mail = await resMailSpeichern(resId, 'greRes');"), rpc2 = H.indexOf('update_reservation_details', sp2);
    t('Speichern schreibt die E-Mail VOR der RPC (beide Fenster)', sp1 > 0 && rpc1 > sp1 && rpc1 - sp1 < 1500 && sp2 > 0 && rpc2 > sp2 && rpc2 - sp2 < 1500, sp1 + '/' + sp2);

    // ---- App: Speichern ----
    S = SANDBOX(function () { return { status: 200, json: [] }; });
    S.el('editResEmail', { value: 'lars.janasen@autohaus.de', attrs: { 'data-alt': 'lars.janasen@autohaus.de' } });
    var g = await S.api.speichern('aaaaaaaa-0001', 'editRes');
    t('Unveraendert: kein Schreibaufruf', g.ok && g.gleich && S.log.length === 0, JSON.stringify(g));
    S.dom.editResEmail.value = 'lars.jansen@autohaus.de';
    g = await S.api.speichern('aaaaaaaa-0001', 'editRes');
    t('Speichern ohne Recht (200 mit []) gilt NICHT als gespeichert', g.ok === false && /nicht zu deinem Lokal/.test(g.fehler) && S.dom.editResEmail.attrs['data-alt'] === 'lars.janasen@autohaus.de', JSON.stringify(g));
    t('PATCH mit return=representation und der Anmeldung des Wirts', S.log[0].method === 'PATCH' && S.log[0].headers.Prefer === 'return=representation' && S.log[0].headers.Authorization === 'Bearer ' + TOKEN_A && S.log[0].body.guest_email === 'lars.jansen@autohaus.de', JSON.stringify(S.log[0]));
    S = SANDBOX(function () { return { status: 200, json: [{ id: 'aaaaaaaa-0001' }] }; });
    S.el('editResEmail', { value: 'lars.jansen@autohaus.de', attrs: { 'data-alt': 'lars.janasen@autohaus.de' } });
    g = await S.api.speichern('aaaaaaaa-0001', 'editRes');
    t('Gespeichert: merkt sich die neue Adresse (Liste + Feld)', g.ok === true && S.dom.editResEmail.attrs['data-alt'] === 'lars.jansen@autohaus.de' && S.win.resAllReservations[0].email === 'lars.jansen@autohaus.de', JSON.stringify(g));
    S.dom.editResEmail.value = 'kaputt@';
    g = await S.api.speichern('aaaaaaaa-0001', 'editRes');
    t('Falsche Adresse wird nicht gespeichert', g.ok === false && /sieht nicht richtig aus/.test(g.fehler), JSON.stringify(g));

    // ---- App: Knopf ----
    async function knopf(feld, antworten) {
        var K = SANDBOX(antworten);
        K.el('editResEmail', { value: feld, attrs: { 'data-alt': 'lars.janasen@autohaus.de' } });
        K.el('editResMailHinweis'); K.el('editResMailKnopf');
        await K.api.erneut('aaaaaaaa-0001', 'editRes');
        return K;
    }
    var K = await knopf('lars.jansen@autohaus.de', function (url) {
        if (/order-email/.test(url)) return { status: 200, json: { ok: true, sent: true, an: 'lars.jansen@autohaus.de' } };
        return { status: 200, json: [{ id: 'aaaaaaaa-0001' }] };
    });
    t('Knopf: erst speichern, dann senden (mit Anmeldung, event erneut)', K.log.length === 2 && K.log[0].method === 'PATCH' && /order-email/.test(K.log[1].url) && K.log[1].body.event === 'erneut' && K.log[1].headers.Authorization === 'Bearer ' + TOKEN_A, JSON.stringify(K.log.map(function (l) { return l.method + ' ' + l.url; })));
    t('Knopf: sagt, an wen gesendet wurde', /Gesendet an lars\.jansen@autohaus\.de/.test(K.dom.editResMailHinweis.textContent) && /gut/.test(K.dom.editResMailHinweis.className) && K.dom.editResMailKnopf.disabled === false, K.dom.editResMailHinweis.textContent);
    K = await knopf('lars.jansen@autohaus.de', function () { return { status: 200, json: [] }; });
    t('Knopf: Speichern scheitert -> NICHT senden, Fehler zeigen', K.log.length === 1 && /fehler/.test(K.dom.editResMailHinweis.className) && /nicht zu deinem Lokal/.test(K.dom.editResMailHinweis.textContent), K.dom.editResMailHinweis.textContent);
    K = await knopf('lars.jansen@', function () { return { status: 200, json: [] }; });
    t('Knopf: falsche Adresse -> gar kein Aufruf, Hinweis', K.log.length === 0 && /richtige E-Mail/.test(K.dom.editResMailHinweis.textContent), K.dom.editResMailHinweis.textContent);
    K = await knopf('lars.jansen@autohaus.de', function (url) {
        if (/order-email/.test(url)) return { status: 403, json: { ok: false, fehler: 'Diese Reservierung gehört nicht zu deinem Lokal.' } };
        return { status: 200, json: [{ id: 'aaaaaaaa-0001' }] };
    });
    t('Knopf: Server sagt nein -> Satz des Servers steht da', /gehört nicht zu deinem Lokal/.test(K.dom.editResMailHinweis.textContent) && /fehler/.test(K.dom.editResMailHinweis.className), K.dom.editResMailHinweis.textContent);
    K = await knopf('lars.jansen@autohaus.de', function (url) {
        if (/order-email/.test(url)) return { status: 200, json: { ok: true, skipped: true, reason: 'RESEND_API_KEY nicht gesetzt' } };
        return { status: 200, json: [{ id: 'aaaaaaaa-0001' }] };
    });
    t('Knopf: Versand nicht eingerichtet -> sagt es, nicht "gesendet"', /nicht eingerichtet/.test(K.dom.editResMailHinweis.textContent) && !/Gesendet/.test(K.dom.editResMailHinweis.textContent), K.dom.editResMailHinweis.textContent);

    // ---- Auslieferung ----
    t('Dunkelmodus: Hinweisfarben gegen ".dark-mode p" durchgesetzt', /\.dark-mode p\.res-mail-hinweis\.fehler \{ color: #fca5a5 !important; \}/.test(H) && /\.dark-mode p\.res-mail-hinweis\.gut \{ color: #86efac !important; \}/.test(H), '');
    var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
    t('sw.js CACHE hochgezaehlt (mind. v131)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 131, '');

    console.log('\n' + ok + '/' + n + ' OK');
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
