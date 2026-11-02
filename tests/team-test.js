// TEAM-ZUGANG (31.10.2026). Ibo: "beim Anmelden soll auch Arbeiter oder
// Manager, auch deren E-Mail fuer die Anmeldung gehen".
// Der Test FUEHRT netlify/functions/team.js gegen ein nachgebautes Netz aus
// und die Rechte-Logik der App.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
process.env.SUPABASE_SERVICE_KEY = 'dienst';
var RID = '11111111-2222-3333-4444-555555555555';
var ich = 'chef@lokal.de', zeilen, eingefuegt, geloescht, superadmin = false, insertFehler = null;
function antw(status, body) { return { ok: status < 400, status: status, json: async function () { return body; }, text: async function () { return typeof body === 'string' ? body : JSON.stringify(body); } }; }
global.fetch = async function (url, opt) {
    url = decodeURIComponent(String(url)); opt = opt || {};
    if (/\/auth\/v1\/user/.test(url)) return ich ? antw(200, { email: ich }) : antw(401, {});
    if (/customers\?role=eq\.superadmin/.test(url)) return antw(200, superadmin ? [{ email: ich }] : []);
    if (opt.method === 'POST' && /\/customers$/.test(url)) {
        if (insertFehler) return antw(400, insertFehler);
        var z = JSON.parse(opt.body); z.id = 'neu1'; eingefuegt.push(z); return antw(201, [z]);
    }
    if (opt.method === 'DELETE' && /\/customers\?/.test(url)) {
        var treffer = zeilen.filter(function (z) { return url.indexOf('id=eq.' + z.id) >= 0 && z.restaurant_id === RID && z.role === 'team'; });
        geloescht.push(url); return antw(200, treffer);
    }
    if (opt.method === 'DELETE' && /push_subscriptions/.test(url)) { geloescht.push(url); return antw(204, ''); }
    if (/customers\?restaurant_id=eq\..*&email=ilike\./.test(url)) {
        var m = /email=ilike\.([^&]+)/.exec(url)[1];
        return antw(200, zeilen.filter(function (z) { return z.restaurant_id === RID && z.email === m; }).map(function (z) { return { role: z.role }; }));
    }
    if (/customers\?restaurant_id=eq\..*&role=eq\.team/.test(url)) return antw(200, zeilen.filter(function (z) { return z.role === 'team'; }));
    if (/customers\?email=ilike\./.test(url)) { var e = /email=ilike\.([^&]+)/.exec(url)[1]; return antw(200, zeilen.filter(function (z) { return z.email === e; })); }
    return antw(200, []);
};
var T = require(path.join(__dirname, '..', 'netlify', 'functions', 'team.js'));
function ruf(methode, b, q) { return T.handler({ httpMethod: methode, headers: { authorization: 'Bearer tok' }, body: b ? JSON.stringify(b) : null, queryStringParameters: q || {} }).then(function (r) { r.j = JSON.parse(r.body); return r; }); }
function neu() { zeilen = [{ id: 'c1', email: 'chef@lokal.de', restaurant_id: RID, role: 'restaurant' }, { id: 't1', email: 'koch@lokal.de', restaurant_id: RID, role: 'team', team_rolle: 'mitarbeiter' }]; eingefuegt = []; geloescht = []; }

(async function () {
    // ---- Server: nur der Inhaber ----
    neu(); ich = 'chef@lokal.de';
    var r = await ruf('GET', null, { r: RID });
    t('Inhaber sieht sein Team', r.statusCode === 200 && r.j.team.length === 1 && r.j.team[0].email === 'koch@lokal.de', r.body);
    ich = 'koch@lokal.de';
    r = await ruf('POST', { r: RID, email: 'neu@x.de', rolle: 'manager' });
    t('ein Teammitglied darf das Team NICHT verwalten (403, nichts angelegt)', r.statusCode === 403 && eingefuegt.length === 0, r.body);
    ich = 'fremd@anderes.de';
    r = await ruf('GET', null, { r: RID });
    t('ein Fremder sieht nichts (403)', r.statusCode === 403, r.body);
    ich = ''; r = await ruf('GET', null, { r: RID });
    t('ohne Anmeldung 401', r.statusCode === 401, r.body);
    ich = 'ibo@kiekmolin.de'; superadmin = true; r = await ruf('GET', null, { r: RID });
    t('Superadmin darf', r.statusCode === 200, r.body); superadmin = false;

    // ---- Anlegen ----
    neu(); ich = 'chef@lokal.de';
    r = await ruf('POST', { r: RID, email: ' Neu@Mail.DE ', rolle: 'manager' });
    t('Inhaber legt Manager an: role team, team_rolle manager, E-Mail klein, aktiv', r.statusCode === 200 && eingefuegt.length === 1 && eingefuegt[0].role === 'team' && eingefuegt[0].team_rolle === 'manager' && eingefuegt[0].email === 'neu@mail.de' && eingefuegt[0].is_active === true && eingefuegt[0].restaurant_id === RID, JSON.stringify(eingefuegt));
    neu(); r = await ruf('POST', { r: RID, email: 'koch@lokal.de', rolle: 'mitarbeiter' });
    t('E-Mail mit vorhandenem Konto -> 409, nichts angelegt (sonst oeffnet beim Anmelden das falsche Lokal)', r.statusCode === 409 && eingefuegt.length === 0, r.body);
    r = await ruf('POST', { r: RID, email: 'x@y.de', rolle: 'chef' });
    t('unbekannte Rolle -> 400', r.statusCode === 400 && eingefuegt.length === 0, r.body);
    r = await ruf('POST', { r: RID, email: 'kaputt', rolle: 'mitarbeiter' });
    t('kaputte E-Mail -> 400', r.statusCode === 400, r.body);
    r = await ruf('POST', { r: RID, email: 'chef@lokal.de', rolle: 'mitarbeiter' });
    t('eigene Adresse -> 400', r.statusCode === 400, r.body);
    insertFehler = '{"message":"column \\"team_rolle\\" of relation \\"customers\\" does not exist"}';
    r = await ruf('POST', { r: RID, email: 'x@y.de', rolle: 'mitarbeiter' });
    t('SQL 49 fehlt -> sagt es (sqlFehlt), nicht still', r.statusCode === 409 && r.j.sqlFehlt === true && /49-team\.sql/.test(r.j.error), r.body);
    insertFehler = null;

    // ---- Entfernen ----
    neu(); r = await ruf('DELETE', { r: RID, id: 't1' });
    t('Teammitglied entfernt', r.statusCode === 200 && r.j.ok === true, r.body);
    t('… nur Team-Zeilen dieses Lokals (role=eq.team, restaurant_id)', geloescht.some(function (u) { return /customers\?id=eq\.t1&restaurant_id=eq\./.test(u) && /role=eq\.team/.test(u); }), geloescht.join(' | '));
    t('… und seine Handys bekommen keine Bestellungen mehr', geloescht.some(function (u) { return /push_subscriptions\?restaurant_id=eq\./.test(u) && /customer_email=ilike\.koch@lokal\.de/.test(u); }), geloescht.join(' | '));
    neu(); r = await ruf('DELETE', { r: RID, id: 'c1' });
    t('den Inhaber kann man nicht entfernen (404, keine Team-Zeile)', r.statusCode === 404, r.body);

    // ---- App: Rechte ----
    var A = new Function('currentAdmin', ['teamRolleVon', 'teamRolle', 'teamDarfNicht'].map(fn).join('\n')
        + '\nvar TEAM_BEREICHE_GESPERRT = ' + /var TEAM_BEREICHE_GESPERRT = (\{[\s\S]*?\});/.exec(H)[1]
        + ';\nreturn { von: teamRolleVon, darfNicht: function (s, ca) { currentAdmin = ca; return teamDarfNicht(s); } };')(null);
    t('Rolle aus customers: restaurant -> inhaber, team+manager -> manager, team ohne Angabe -> mitarbeiter',
      A.von({ role: 'restaurant' }) === 'inhaber' && A.von({ role: 'team', team_rolle: 'Manager' }) === 'manager' && A.von({ role: 'team' }) === 'mitarbeiter', '');
    var ma = { teamRolle: 'mitarbeiter' }, mg = { teamRolle: 'manager' }, ih = { teamRolle: 'inhaber' };
    t('Mitarbeiter: kein Dashboard/Umsatz/Angebote, aber Bestellungen und Reservierungen', A.darfNicht('dashboard', ma) && A.darfNicht('revenue', ma) && A.darfNicht('offers', ma) && !A.darfNicht('orders', ma) && !A.darfNicht('reservations', ma), '');
    t('Manager und Inhaber: alle Bereiche', !A.darfNicht('revenue', mg) && !A.darfNicht('offers', mg) && !A.darfNicht('dashboard', ih), '');
    t('Superadmin wird nie eingeschraenkt', !A.darfNicht('revenue', { isAdmin: true, teamRolle: 'mitarbeiter' }), '');
    var EL = /var TEAM_ELEMENTE_GESPERRT = (\{[\s\S]*?\});/.exec(H)[1];
    t('Manager sieht keine Einstellungen (PayPal/Fristen), keine Vertraege, kein Team', /manager: \[[^\]]*'ordersEinstKnopf'/.test(EL) && /manager: \[[^\]]*'stornoFristKarte'/.test(EL) && /manager: \[[^\]]*'navTeam'/.test(EL) && /manager: \[[^\]]*'navVertraege'/.test(EL), EL);
    t('Mitarbeiter sieht auch keine Reservierungs-Einstellungen und keinen Tagesabschluss', /mitarbeiter: \[[^\]]*'resTabBtnSettings'/.test(EL) && /mitarbeiter: \[[^\]]*'navDayClose'/.test(EL), EL);
    t('Bereichswechsel prueft die Rechte (auch Knoepfe im Dashboard)', /if \(typeof teamDarfNicht === 'function' && teamDarfNicht\(section\)\) \{/.test(fn('showDashboardSection')), '');
    t('Anmeldung uebernimmt die Rolle aus customers', /teamRolle: teamRolleVon\(customer\),/.test(fn('showGastroDashboard')), '');
    t('Rechte werden bei jedem Wirt-Dashboard angewandt', /teamRechteAnwenden\(\)/.test(fn('applyGastroRestrictions')), '');
    t('Team-Knopf nur fuer den Inhaber', /team\.style\.display = rolle === 'inhaber' && !\(currentAdmin && currentAdmin\.isAdmin\) \? '' : 'none';/.test(fn('teamRechteAnwenden')), '');
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
