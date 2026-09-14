// GASTTRICHTER -- zaehlt er Besuche, oder zaehlt er Abrufe?
//
// Der Fehler, den dieser Test verhindern soll, habe ich am 14.09.2026
// beinahe selbst gemacht: 1.902 Speisekarten-Abrufe, 114 Bestellungen,
// "also 6 %". Falsch. Ein Gast loest mehrere Abrufe aus.
//
// Darum prueft hier nichts, ob der Quelltext "distinct" enthaelt --
// es wird gerechnet, mit Zeilen, die genau diese Falle stellen.

var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

var T = require(path.join(__dirname, '..', 'netlify', 'functions', 'lib', 'trichter.js'));

var ok = 0, fail = 0;
function t(label, cond, extra) {
    if (cond) { ok++; console.log('OK   | ' + label); }
    else { fail++; console.log('FAIL | ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}

function zeilen(n, korb, best) {
    var z = [];
    for (var i = 0; i < n; i++) {
        z.push({ besuch: 'b' + i, schritt: 'karte' });
        if (i < korb) z.push({ besuch: 'b' + i, schritt: 'warenkorb' });
        if (i < best) z.push({ besuch: 'b' + i, schritt: 'bestellt' });
    }
    return z;
}

console.log('\n-- 1. BESUCHE, NICHT ABRUFE --');

// DIE FALLE. Ein einziger Gast, der die Karte zehnmal laedt.
var einer = [];
for (var i = 0; i < 10; i++) einer.push({ besuch: 'derselbe', schritt: 'karte' });
t('ein Gast, zehn Abrufe -> 1 Besuch', T.zaehlen(einer).karte === 1, T.zaehlen(einer).karte);

var zwei = einer.concat([{ besuch: 'anderer', schritt: 'karte' }]);
t('zwei Gaeste -> 2, nicht 11', T.zaehlen(zwei).karte === 2, T.zaehlen(zwei).karte);

t('Zeile ohne Besuchsnummer zaehlt nicht',
  T.zaehlen([{ besuch: '', schritt: 'karte' }]).karte === 0);
t('erfundener Schritt zaehlt nicht',
  T.zaehlen([{ besuch: 'b', schritt: 'gekocht' }]).karte === 0);
t('kaputte Eingabe wirft nicht',
  T.zaehlen(null).karte === 0 && T.zaehlen([null, undefined]).karte === 0);

console.log('\n-- 2. DIE QUOTE --');

var a = T.auswerten(zeilen(100, 40, 10));
t('100 / 40 / 10 -> 40 %', a.quoteWarenkorb === 40, a.quoteWarenkorb);
t('100 / 40 / 10 -> 10 %', a.quoteBestellt === 10, a.quoteBestellt);
t('die Bestell-Quote wird an der KARTE gemessen, nicht am Warenkorb',
  a.quoteBestellt === 10, a.quoteBestellt);

console.log('\n-- 3. ZU WENIGE ZAHLEN SIND KEINE ZAHL --');
//
// Bei 4 Besuchen und 1 Bestellung stuenden "25 %" im Bericht, naechste
// Woche "20 %", und Ibo suchte nach einem Einbruch, den es nie gab.
var wenig = T.auswerten(zeilen(4, 2, 1));
t('4 Besuche -> keine Quote', wenig.quoteBestellt === null && wenig.quoteWarenkorb === null,
  wenig.quoteBestellt);
t('aber die nackte Zahl steht da', wenig.karte === 4, wenig.karte);
t('genau an der Grenze wird gerechnet', T.auswerten(zeilen(T.GENUG, 5, 1)).quoteBestellt !== null);
t('einer darunter noch nicht', T.auswerten(zeilen(T.GENUG - 1, 5, 1)).quoteBestellt === null);
t('der Satz sagt, ab wann', /ab 20/.test(T.satz(zeilen(4, 2, 1)) || ''), T.satz(zeilen(4, 2, 1)));

console.log('\n-- 4. LEER IST KEIN EINBRUCH --');
//
// Ist SQL 31 noch nicht eingespielt, ist die Tabelle leer. Dann darf
// NICHTS in der Mail stehen -- "0 %" saehe aus wie ein Absturz und waere
// nur ein fehlendes SQL. Regel 6: stille Ausfaelle sehen aus wie Antworten.
t('gar keine Zeilen -> kein Abschnitt', T.satz([]) === null, T.satz([]));
t('gar keine Zeilen -> kein Absprung-Satz', T.absprung([]) === null);
t('null -> kein Abschnitt', T.satz(null) === null);
t('nirgends steht 0 %', !/0 %/.test(String(T.satz([]))));

console.log('\n-- 5. WO SPRINGEN SIE AB --');

var frueh = T.absprung(zeilen(100, 20, 15));   // 80 vor dem Korb, 5 danach
t('Verlust vor dem Warenkorb wird benannt', /nichts ausgewählt/.test(frueh || ''), frueh);
t('und mit der richtigen Zahl', /^80 /.test(frueh || ''), frueh);

var spaet = T.absprung(zeilen(100, 90, 20));   // 10 vor dem Korb, 70 danach
t('Verlust NACH dem Warenkorb wird benannt', /Warenkorb voll/.test(spaet || ''), spaet);
t('und mit der richtigen Zahl', /^70 /.test(spaet || ''), spaet);
t('alle bestellen -> kein Absprung-Satz', T.absprung(zeilen(30, 30, 30)) === null,
  T.absprung(zeilen(30, 30, 30)));

console.log('\n-- 6. DEUTSCH --');
t('einer: "1 Gast hat"', /1 Gast hat /.test(T.satz(zeilen(1, 0, 0)) || ''), T.satz(zeilen(1, 0, 0)));
t('mehrere: "2 Gäste haben"', /2 Gäste haben /.test(T.satz(zeilen(2, 0, 0)) || ''), T.satz(zeilen(2, 0, 0)));
t('Absprung einer: "1 Gast hat"', /^1 Gast hat /.test(T.absprung(zeilen(21, 20, 20)) || ''),
  T.absprung(zeilen(21, 20, 20)));

console.log('\n-- 7. WAS DER BROWSER SCHICKT --');
//
// trichter() wird hier WIRKLICH ausgefuehrt, mit nachgebautem
// sessionStorage und fetch. Ein Textvergleich haette den Fehler
// "der Wirt wird mitgezaehlt" nie gesehen.
var quelle = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function schneide(name) {
    var i = quelle.indexOf('function ' + name + '(');
    if (i < 0) throw new Error(name + ' nicht gefunden');
    var tiefe = 0, j = quelle.indexOf('{', i);
    for (var k = j; k < quelle.length; k++) {
        if (quelle[k] === '{') tiefe++;
        else if (quelle[k] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, k + 1); }
    }
    throw new Error(name + ' nicht geschlossen');
}

function welt(angemeldet) {
    var speicher = {};
    var gesendet = [];
    var ctx = {
        SUPABASE_URL: 'https://x.test',
        SUPABASE_KEY: 'anon-schluessel',
        kmiToken: function () { return 'anon-schluessel'; },
        sessionStorage: {
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(speicher, k) ? speicher[k] : null; },
            setItem: function (k, v) { speicher[k] = String(v); }
        },
        fetch: function (url, opt) {
            gesendet.push({ url: url, body: JSON.parse(opt.body), kopf: opt.headers });
            return { catch: function () {} };
        },
        window: {},
        console: console
    };
    if (angemeldet) ctx.currentUser = { role: 'gastronom' };
    vm.createContext(ctx);
    vm.runInContext(schneide('_trichterBesuch') + '\n' + schneide('trichter'), ctx);
    return { ctx: ctx, gesendet: gesendet, speicher: speicher };
}

var w = welt(false);
w.ctx.trichter('karte', 'haus-1');
t('Gast: es geht genau eine Zeile raus', w.gesendet.length === 1, w.gesendet.length);
t('und zwar an guest_funnel', /\/rest\/v1\/guest_funnel$/.test(w.gesendet[0].url), w.gesendet[0].url);
t('mit Haus und Schritt',
  w.gesendet[0].body.restaurant_id === 'haus-1' && w.gesendet[0].body.schritt === 'karte',
  JSON.stringify(w.gesendet[0].body));
t('die Besuchsnummer ist lang genug fuer die Datenbank-Schranke (8..64)',
  w.gesendet[0].body.besuch.length >= 8 && w.gesendet[0].body.besuch.length <= 64,
  w.gesendet[0].body.besuch);

// KEINE PERSONENDATEN. Wer hier etwas dazulegt, faellt auf.
t('es gehen genau drei Felder raus',
  Object.keys(w.gesendet[0].body).sort().join(',') === 'besuch,restaurant_id,schritt',
  Object.keys(w.gesendet[0].body).join(','));

// Zweiter Aufruf desselben Schritts -- der Gast laedt neu.
w.ctx.trichter('karte', 'haus-1');
t('derselbe Schritt zweimal -> nur eine Zeile', w.gesendet.length === 1, w.gesendet.length);
w.ctx.trichter('warenkorb', 'haus-1');
t('ein anderer Schritt geht aber durch', w.gesendet.length === 2, w.gesendet.length);
t('und die Besuchsnummer bleibt dieselbe',
  w.gesendet[0].body.besuch === w.gesendet[1].body.besuch);

t('ohne Haus wird nichts geschickt', (function () {
    var x = welt(false); x.ctx.trichter('karte', null); return x.gesendet.length === 0;
})());
t('erfundener Schritt wird nicht geschickt', (function () {
    var x = welt(false); x.ctx.trichter('gekocht', 'haus-1'); return x.gesendet.length === 0;
})());

// DER WIRT. Er sieht sich seine Karte taeglich an -- wuerde er mitgezaehlt,
// waere die Quote gerade bei den kleinen Haeusern wertlos.
var wirt = welt(true);
wirt.ctx.trichter('karte', 'haus-1');
t('der angemeldete Wirt wird NICHT mitgezaehlt', wirt.gesendet.length === 0, wirt.gesendet.length);

console.log('\n-- 8. DIE DREI STELLEN IM GASTWEG --');
[['karte', 'openMenuModal'], ['warenkorb', 'addItemToCart'], ['bestellt', '_saveOk = true']]
    .forEach(function (paar) {
        var n = (quelle.match(new RegExp("trichter\\('" + paar[0] + "'", 'g')) || []).length;
        t(paar[0] + ' wird genau einmal gemeldet', n === 1, n);
    });

// "bestellt" MUSS hinter _saveOk stehen. Davor waere es eine Bestellung,
// die vielleicht nie gespeichert wurde -- und die Quote waere zu gut.
var iSave = quelle.indexOf('_saveOk = true;');
var iBest = quelle.indexOf("trichter('bestellt'");
t('"bestellt" steht HINTER dem gelungenen Speichern', iSave > 0 && iBest > iSave, iSave + ' / ' + iBest);

console.log('\n-- 9. DIE DATENBANK-REGEL --');
var sql = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '31-gasttrichter.sql'), 'utf8');
t('RLS wird eingeschaltet', /enable row level security/i.test(sql));
t('es gibt eine insert-Regel fuer anon', /for insert to anon/i.test(sql));
t('es gibt KEINE select-Regel -- sonst saehe jeder Gast alle Haeuser',
  !/for\s+select/i.test(sql));
t('die Schritte sind auch in der Datenbank begrenzt',
  /check \(schritt in \('karte', 'warenkorb', 'bestellt'\)\)/.test(sql));
t('derselbe Schritt kann nicht zweimal je Besuch drin stehen',
  /unique index[\s\S]{0,120}\(besuch, schritt\)/.test(sql));

console.log('\n-- 10. DER BERICHT UEBERLEBT DIE FEHLENDE TABELLE --');
//
// Fehlt SQL 31, antwortet PostgREST mit 404. Ohne eigenes try waere der
// GANZE Wochenbericht weg -- fuer alle Haeuser, wegen einer Zusatzzahl.
var wr = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'weekly-report.js'), 'utf8');
var block = wr.slice(wr.indexOf('var trichterZeilen'), wr.indexOf('var sent = 0'));
t('guest_funnel wird in einem EIGENEN try geholt',
  /try\s*\{[\s\S]*guest_funnel[\s\S]*\}\s*catch/.test(block), block.slice(0, 80));
t('und der Fehler fuehrt NICHT zu return 500',
  block.indexOf('statusCode: 500') < 0);
// NICHT per Textvergleich. Beim Gegenpruefen hat genau diese Zusicherung
// die Filterzeile der RESERVIERUNGEN erwischt ("x.restaurant_id === r.id")
// und blieb gruen, obwohl der Trichter-Filter raus war. Jetzt wird
// gerechnet.
var gemischt = [
    { restaurant_id: 'h1', besuch: 'a', schritt: 'karte' },
    { restaurant_id: 'h1', besuch: 'b', schritt: 'karte' },
    { restaurant_id: 'h2', besuch: 'c', schritt: 'karte' },
    { restaurant_id: 'h2', besuch: 'd', schritt: 'karte' }
];
t('je Haus wird gefiltert -- sonst steht bei jedem Wirt die Summe aller',
  T.zaehlen(T.fuerHaus(gemischt, 'h1')).karte === 2,
  T.zaehlen(T.fuerHaus(gemischt, 'h1')).karte);
t('und das andere Haus taucht nicht auf',
  T.fuerHaus(gemischt, 'h1').every(function (z) { return z.restaurant_id === 'h1'; }));
t('ohne Haus-Nummer lieber gar nichts als alles',
  T.fuerHaus(gemischt, null).length === 0);
t('der Bericht benutzt genau diesen Filter', /TRICHTER\.fuerHaus\(trichterZeilen, r\.id\)/.test(wr));
t('der Bericht raeumt nach 90 Tagen auf',
  /method: 'DELETE'[\s\S]{0,200}guest_funnel|guest_funnel\?created_at=lt\./.test(wr));

console.log('\n' + (fail === 0 ? 'Alle ' + ok + ' Tests bestanden.' : fail + ' von ' + (ok + fail) + ' FEHLGESCHLAGEN.'));
process.exit(fail === 0 ? 0 : 1);
