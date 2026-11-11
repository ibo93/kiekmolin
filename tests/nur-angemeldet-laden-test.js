// VERWALTER- UND DASHBOARD-ANFRAGEN NUR MIT ANMELDUNG.
//
// Gemessen am 11.11.2026 (Netlify, 7 Tage): rund 400x 403 bei
// admin-meldungen, 121x bei push-status, 33x bei mahnung -- von echten
// Handys. Ursache: init() ruft bei JEDEM Seitenaufruf loadCustomers()
// (Verwalter-Kundenliste + Meldungs- und Mahnungsstand) und ueber
// updateDashboard() auch dashLaden() (Wirt-Zahlen + push-status). Auch fuer
// Gaeste. Der Server lehnte richtig ab; es ging nichts raus -- aber jedes
// Gast-Handy schickte ein halbes Dutzend Anfragen umsonst.
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name, q) {
    q = q || H;
    var i = q.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name);
    i++; var d = 0, j = q.indexOf('{', i);
    for (var k = j; k < q.length; k++) { if (q[k] === '{') d++; else if (q[k] === '}') { d--; if (!d) return q.slice(i, k + 1); } }
}
(async function () {
    function kunden(verwalter, quelle) {
        var anfragen = [];
        var f = new Function('istVerwalter', 'adminMeldungenLaden', 'fetch', 'SUPABASE_URL', 'SUPABASE_KEY', 'kmiToken', 'mahnStaendeHolen', 'renderCustomers', 'updateCustomerStats', 'populateRestaurantDropdown', 'ladeStandSetzen', '_listeLeerWennLaedt',
            'var customers;' + fn('loadCustomers', quelle) + '; return loadCustomers;')(
            function () { return verwalter; }, function () { anfragen.push('admin-meldungen'); },
            async function (u) { anfragen.push('customers'); return { ok: true, json: async function () { return []; } }; },
            'https://x', 'k', function () { return 't'; }, async function () { anfragen.push('mahnung'); },
            function () {}, function () {}, function () {}, function () {}, function () {});
        return f().then(function () { return anfragen; });
    }
    var gast = await kunden(false);
    t('Gast/Wirt: keine Verwalter-Anfragen (admin-meldungen, customers, mahnung)', gast.length === 0, gast.join(','));
    var admin = await kunden(true);
    t('Verwalter: laedt wie vorher', admin.indexOf('admin-meldungen') >= 0 && admin.indexOf('customers') >= 0 && admin.indexOf('mahnung') >= 0, admin.join(','));
    var mut = await kunden(false, H.replace("    if (typeof istVerwalter === 'function' && !istVerwalter()) return;\n    try { adminMeldungenLaden(); } catch (e) {}", "    try { adminMeldungenLaden(); } catch (e) {}"));
    t('Gegenprobe: ohne Sperre fragt auch der Gast -- Test wird rot', mut.length > 0, mut.join(','));

    var quelleDash = fn('dashLaden');
    var vorRid = quelleDash.slice(0, quelleDash.indexOf('var rid = getControlRestaurantId();'));
    function laeuft(admin, q) {
        var erreicht = false;
        new Function('document', 'currentAdmin', 'markiere', q + ' markiere(); }; return dashLaden;')(
            { getElementById: function () { return {}; } }, admin, function () { erreicht = true; })();
        return erreicht;
    }
    t('Dashboard-Zahlen: Gast (kein currentAdmin) fragt nichts ab', laeuft(null, vorRid) === false, '');
    t('Dashboard-Zahlen: angemeldeter Wirt laedt', laeuft({ role: 'Gastronom' }, vorRid) === true, '');
    var ohneSperre = vorRid.replace("    if (typeof currentAdmin === 'undefined' || !currentAdmin) return;\n", '');
    t('Gegenprobe: ohne Sperre laedt auch der Gast -- Test wird rot', laeuft(null, ohneSperre) === true, '');
    t('Beide Anmeldewege zeichnen das Dashboard danach neu', (H.match(/showDashboardSection\('dashboard'\);[\s\S]{0,400}updateDashboard\(\);/g) || []).length >= 2, '');
    console.log('\n' + ok + '/' + n + ' OK');
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
