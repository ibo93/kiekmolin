// WIE OFT DARF EIN WAECHTER STOEREN?
//
// Gemeldet am 27.08.2026: "die wache nervt zu viel kommt das mit die
// signale".
//
// Nachgemessen in seinem Postfach: 96 E-Mails zwischen dem 26.08.
// 22:30 und dem 27.08. 07:45 deutscher Zeit -- alle 15 Minuten zwei
// bis drei Stueck, jede mit demselben Satz, die ganze Nacht durch.
//
// Die Stoerung war echt (der Preis-Schutz war tatsaechlich aus). Das
// aendert nichts: eine Warnung, die alle 15 Minuten kommt, liest
// niemand mehr -- und dann geht die naechste echte mit unter.
//
// wache-test.js prueft, dass die WACHE sich daran haelt. Diese Datei
// prueft die Regel selbst, mit gestellter Uhrzeit -- sonst liesse sich
// "erst nach 24 Stunden" und "nachts nicht" gar nicht pruefen, ohne
// einen Tag zu warten.

var path = require('path');

// VOR dem require setzen: das Modul liest den Schluessel beim Laden.
// Steht er spaeter da, kommt lies() nie an die Tabelle -- und dann
// waere jede Meldung wieder "die erste", ohne dass es auffaellt.
process.env.SUPABASE_SERVICE_KEY = 'probe-schluessel';
var G = require(path.join(__dirname, '..', 'netlify', 'functions', 'lib', 'wache-gedaechtnis.js'));

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Die Tabelle im Speicher nachbauen -- dieselbe Tuer, die PostgREST
// anbietet, nur ohne Netz.
var tabelle = {};
global.fetch = async function (url, opt) {
    if (url.indexOf('/wache_status') === -1) return { ok: true, json: async function () { return []; } };
    if (!opt || !opt.method || opt.method === 'GET') {
        var k = decodeURIComponent((url.match(/kennung=eq\.([^&]+)/) || [])[1] || '');
        return { ok: true, status: 200, json: async function () { return tabelle[k] ? [tabelle[k]] : []; } };
    }
    var z = JSON.parse(opt.body);
    var alt = tabelle[z.kennung] || {};
    Object.keys(z).forEach(function (f) { alt[f] = z[f]; });
    tabelle[z.kennung] = alt;
    return { ok: true, status: 201, json: async function () { return []; } };
};

// Feste Zeitpunkte in deutscher Zeit (Sommerzeit, also UTC+2).
function uhr(tag, stundeDeutsch) {
    return new Date(Date.UTC(2026, 7, tag, stundeDeutsch - 2, 0, 0));
}

(async function () {
    console.log('\n-- 1. Tag und Nacht auseinanderhalten --');
    // Eine NEUE Stoerung darf um 23 Uhr wecken -- da bestellen Gaeste.
    // Eine BEKANNTE nicht: die stand um 3 Uhr schon im Postfach. Genau
    // dieser Unterschied hat in der Nacht vom 26.08. gefehlt.
    t('10 Uhr ist Tag', G.tagsueber(uhr(27, 10)) === true, 'nein');
    t('20 Uhr ist noch Tag', G.tagsueber(uhr(27, 20)) === true, 'nein');
    t('8 Uhr ist der Anfang', G.tagsueber(uhr(27, 8)) === true, 'nein');
    t('7 Uhr noch nicht', G.tagsueber(uhr(27, 7)) === false, 'weckt zu frueh');
    t('21 Uhr nicht mehr', G.tagsueber(uhr(27, 21)) === false, 'stoert abends');
    t('3 Uhr nachts erst recht nicht', G.tagsueber(uhr(27, 3)) === false, 'weckt nachts');

    console.log('\n-- 2. Die Leiter: sofort, dann Ruhe, dann taeglich --');
    tabelle = {};
    var k = 'probe-weg';

    // Das erste Mal geht IMMER sofort raus, auch mitten in der Nacht.
    t('erste Stoerung um 23 Uhr -> sofort',
      (await G.bewerten(k, true, uhr(26, 23))) === 'neu', tabelle[k]);

    // Und danach: eine Viertelstunde spaeter, eine Stunde spaeter,
    // sechs Stunden spaeter -- alles still. Das sind die 96 Mails.
    t('15 Minuten spaeter -> still',
      (await G.bewerten(k, true, new Date(uhr(26, 23).getTime() + 15 * 60000))) === 'still', 'meldet erneut');
    t('mitten in der Nacht um 3 Uhr -> still',
      (await G.bewerten(k, true, uhr(27, 3))) === 'still', 'weckt ihn');
    t('am naechsten Morgen um 7 Uhr -> noch still',
      (await G.bewerten(k, true, uhr(27, 7))) === 'still', 'weckt ihn zu frueh');

    // Nach einem Tag einmal nachfassen -- damit eine Stoerung, die
    // liegen bleibt, nicht in Vergessenheit geraet. Aber nur einmal.
    t('nach mehr als 24 Stunden, tagsueber -> eine Erinnerung',
      (await G.bewerten(k, true, uhr(28, 10))) === 'erinnerung', 'erinnert nie');
    t('und danach wieder still',
      (await G.bewerten(k, true, uhr(28, 11))) === 'still', 'erinnert im Takt');
    t('auch am selben Abend noch',
      (await G.bewerten(k, true, uhr(28, 20))) === 'still', 'erinnert zweimal am Tag');

    console.log('\n-- 3. Entwarnung: genau eine --');
    // Ohne Entwarnung weiss er nie, ob er noch etwas tun muss -- und
    // faengt an, jede Meldung selbst nachzupruefen. Dann kann man sie
    // auch weglassen.
    t('geht es wieder -> Entwarnung',
      (await G.bewerten(k, false, uhr(28, 21))) === 'entwarnung', 'sagt nichts');
    t('und dann ist Ruhe',
      (await G.bewerten(k, false, uhr(28, 22))) === 'still', 'meldet "geht wieder" im Takt');
    t('der Stand steht auf ok', tabelle[k].zustand === 'ok', tabelle[k].zustand);
    t('und die Zaehlung faengt von vorn an', tabelle[k].fehlversuche === 0, tabelle[k].fehlversuche);

    console.log('\n-- 4. Und wenn es wieder klemmt, ist das wieder neu --');
    // Die gefaehrliche Richtung waere: einmal gemeldet, danach fuer
    // immer still. Ein Waechter, der nach der ersten Meldung verstummt,
    // ist beim zweiten Mal nutzlos.
    t('erneut kaputt -> wieder sofort',
      (await G.bewerten(k, true, uhr(28, 23))) === 'neu', 'schweigt beim zweiten Mal');

    console.log('\n-- 5. Ruhe gilt je Pruefung, nie pauschal --');
    // Sonst verschluckt eine bekannte Stoerung die naechste unbekannte:
    // Preis-Schutz meldet sich, danach Ruhe, und wenn eine Stunde
    // spaeter das Reservieren zumacht, sagt niemand etwas.
    t('eine andere Pruefung hat ihr eigenes Gedaechtnis',
      (await G.bewerten('andere-pruefung', true, uhr(28, 23))) === 'neu', 'wird mitverschluckt');

    console.log('\n-- 6. Kein Gedaechtnis -> lieber zu laut als stumm --');
    // Solange datenbank/21-wache-gedaechtnis.sql nicht eingespielt ist,
    // antwortet die Tabelle mit 404. Ein Waechter, der dann schweigt,
    // waere schlimmer als einer, der zu oft ruft -- man verlaesst sich
    // ja auf ihn.
    var vorher = global.fetch;
    global.fetch = async function () { return { ok: false, status: 404, json: async function () { return {}; } }; };
    G.zuruecksetzen();
    try { require('fs').unlinkSync('/tmp/kmi-wache-ohne-tabelle'); } catch (e) {}
    t('ohne Tabelle wird trotzdem gemeldet',
      (await G.bewerten('ohne-tabelle', true, uhr(28, 12))) === 'neu', 'verstummt');
    t('aber "alles gut" loest keine Entwarnung aus, die niemand belegen kann',
      (await G.bewerten('ohne-tabelle', false, uhr(28, 12))) === 'still', 'entwarnt ins Blaue');
    global.fetch = vorher;
    G.zuruecksetzen();

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
