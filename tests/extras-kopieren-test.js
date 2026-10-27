// OPTIONSGRUPPE KOPIEREN (27.10.2026)
//
// Ibo: "Will z.B. eine Tabelle kopieren, dann die neue bearbeiten."
// Die Funktionen werden aus index.html gezogen und ECHT ausgefuehrt --
// auch der Kopiervorgang gegen eine nachgebaute Datenbank.

var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = H.indexOf('{', i), tiefe = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') tiefe++;
        else if (H[k] === '}') { tiefe--; if (tiefe === 0) return H.slice(i, k + 1); }
    }
    return '';
}
var kop = new Function('window', fn('optionGroupKopie') + '; return optionGroupKopie;')({});
var G = { id: 'g1', restaurant_id: 'A', name: 'Extra Zutaten Pizza', selection_type: 'multiple', min_selections: 0, max_selections: 3, internal_name: 'cats:Pizza', is_active: true, created_at: 'x' };
var O = [{ id: 'o1', group_id: 'g1', name: 'Käse', price: 1, price_type: 'add', sort_order: 1, created_at: 'x' }, { id: 'o2', group_id: 'g1', name: 'Salami', price: 1.5, price_type: 'add', sort_order: 2 }];
var k = kop(G, O, 'Extra Zutaten Pasta', 'B');
t('Kopie ohne alte id und Zeitstempel', !('id' in k.gruppe) && !('created_at' in k.gruppe));
t('neuer Name und Ziel-Haus', k.gruppe.name === 'Extra Zutaten Pasta' && k.gruppe.restaurant_id === 'B');
t('Einstellungen bleiben (Typ, Höchstens, Kategorien, aktiv)', k.gruppe.selection_type === 'multiple' && k.gruppe.max_selections === 3 && k.gruppe.internal_name === 'cats:Pizza' && k.gruppe.is_active === true);
t('alle Optionen mit Preisen, ohne alte id/group_id', k.optionen.length === 2 && k.optionen[1].price === 1.5 && !('id' in k.optionen[0]) && !('group_id' in k.optionen[0]));
t('Original bleibt unverändert', G.id === 'g1' && O[0].group_id === 'g1');

// Der ganze Ablauf gegen eine nachgebaute Datenbank
async function lauf(antwortGruppe) {
    var gesendet = [], toasts = [], geoeffnet = null, el = {
        ogKopieName: { value: 'Extra Zutaten Pasta' }, ogKopieZiel: { value: 'A' }, ogKopieStand: { textContent: '', style: {} },
        ogKopieKnopf: { disabled: false, textContent: '' }, optionsRestaurantSelect: { value: 'A' } };
    var antwort = function (status, daten) { return { ok: status < 300, status: status, json: async function () { return daten; }, text: async function () { return JSON.stringify(daten); } }; };
    var fetch = async function (u, o) {
        gesendet.push({ u: u, body: JSON.parse(o.body) });
        if (/menu_option_groups/.test(u)) return antwortGruppe(JSON.parse(o.body));
        return antwort(201, JSON.parse(o.body).map(function (x, i) { return Object.assign({ id: 'n' + i }, x); }));
    };
    var sbRead = async function (u) { return antwort(200, /menu_option_groups/.test(u) ? [G] : O); };
    var f = new Function('document', 'fetch', 'sbRead', 'showToast', 'closeGenericModal', 'loadOptionGroups', 'openEditOptionGroupModal', 'extrasRestaurantWahl', 'fehlerKlartext', 'istRechteFehler', 'SUPABASE_URL', 'SUPABASE_KEY', 'kmiToken', 'window',
        fn('optionGroupKopie') + 'async ' + fn('kopiereOptionGroup') + '; return kopiereOptionGroup;')(
        { getElementById: function (id) { return el[id] || null; } }, fetch, sbRead, function (m) { toasts.push(m); }, function () {}, async function () {},
        function (id) { geoeffnet = id; }, function () { return 'A'; }, function (x) { return x; }, function (x) { return /42501/.test(x); }, 'https://x', 'k', function () { return 't'; }, {});
    await f('g1');
    return { gesendet: gesendet, toasts: toasts, geoeffnet: geoeffnet, stand: el.ogKopieStand.textContent };
}
(async function () {
    var r = await lauf(function (b) { return { ok: true, status: 201, json: async function () { return [Object.assign({ id: 'neu1' }, b)]; } }; });
    t('Gruppe angelegt, dann Optionen mit der NEUEN group_id', r.gesendet.length === 2 && r.gesendet[1].body.every(function (o) { return o.group_id === 'neu1'; }), JSON.stringify(r.gesendet.map(function (g) { return g.u; })));
    t('danach öffnet sich die Kopie zum Bearbeiten', r.geoeffnet === 'neu1');
    t('Erfolg mit Zahl der Optionen', r.toasts.some(function (m) { return /Kopiert: „Extra Zutaten Pasta" mit 2 Optionen/.test(m); }), JSON.stringify(r.toasts));
    var leer = await lauf(function () { return { ok: true, status: 201, json: async function () { return []; } }; });
    t('Datenbank gibt nichts zurück: "Nicht kopiert", keine Optionen geschrieben, nichts geöffnet', /Nicht kopiert/.test(leer.stand) && leer.gesendet.length === 1 && leer.geoeffnet === null, leer.stand);
    t('Knopf "Kopieren" in der Liste', /onclick="kopiereOptionGroupFragen\(\\'' \+ g\.id \+ '\\'\)"/.test(fn('loadOptionGroups')));
    t('Admin kann in ein anderes Haus kopieren, der Wirt nicht', /istWirt \|\| liste\.length < 2 \? '' :/.test(fn('kopiereOptionGroupFragen')));
    console.log('\n' + ok + '/' + n + ' bestanden');
    if (ok !== n) process.exit(1);
})();
