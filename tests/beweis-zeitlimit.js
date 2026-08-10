// BEWEIS: alter Scanner gegen neuen, unter dem echten Netlify-Zeitlimit.
//
// Warum es diese Datei gibt: es wurde fünf Runden lang behauptet, der Scanner
// sei besser geworden, ohne dass jemand eine Zahl gesehen hat. Hier läuft der
// ECHTE Server-Code (beide Fassungen) und der ECHTE Client-Code aus index.html
// gegen eine Speisekarte mit 60 Gerichten -- mit einer Anthropic-Attrappe, die
// so schnell schreibt wie das echte Modell, und mit einer Netlify-Attrappe, die
// nach 10 Sekunden abschneidet.
//
// Das prüft NICHT, ob die Anthropic-API die gesendeten Felder mag (dafür
// bräuchte es einen Schlüssel). Es prüft die Sache, an der der Scanner
// tatsächlich gescheitert ist: die Zeit.
//
// Aufruf:  node tests/beweis-zeitlimit.js
'use strict';

var fs = require('fs'), path = require('path'), cp = require('child_process');

// --- Wie schnell schreibt ein Modell? -----------------------------------
// Sonnet 5 liegt bei rund 90 Wortteilen pro Sekunde, ein Wortteil sind rund
// 4 Zeichen -> etwa 360 Zeichen pro Sekunde. Konservativ gerechnet.
var ZEICHEN_PRO_SEK = 360;
var NETLIFY_LIMIT_MS = 10000;      // Standard ohne [functions] in netlify.toml

function schlaf(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// --- Die Testkarte: 60 Gerichte, wie eine echte Karte ---------------------
var KATEGORIEN = ['Vorspeisen', 'Suppen', 'Pizzen', 'Pasta', 'Vom Grill', 'Von de Waterkant', 'Desserts', 'Getränke'];
var GERICHTE = [];
(function () {
    var namen = ['Bruschetta', 'Carpaccio', 'Vitello Tonnato', 'Caprese', 'Antipasti-Teller',
        'Tomatensuppe', 'Fischsuppe', 'Zwiebelsuppe',
        'Margherita', 'Salami', 'Prosciutto', 'Quattro Formaggi', 'Diavolo', 'Tonno', 'Hawaii', 'Vegetaria',
        'Spaghetti Bolognese', 'Penne Arrabbiata', 'Lasagne', 'Tagliatelle Salmone', 'Gnocchi Gorgonzola',
        'Rumpsteak', 'Filetsteak', 'Lammkoteletts', 'Schweinemedaillons', 'Hähnchenbrust', 'Currywurst',
        'Matjes', 'Backfisch', 'Scholle Finkenwerder Art', 'Krabbenbrot', 'Seelachsfilet', 'Lachssteak',
        'Tiramisu', 'Panna Cotta', 'Rote Grütze', 'Eisbecher', 'Apfelstrudel',
        'Cola 0,3l', 'Cola 0,5l', 'Fanta 0,3l', 'Sprite 0,3l', 'Apfelschorle 0,3l', 'Wasser 0,25l',
        'Pils 0,3l', 'Pils 0,5l', 'Weizen 0,5l', 'Rotwein 0,2l', 'Weißwein 0,2l', 'Espresso',
        'Cappuccino', 'Latte Macchiato', 'Tee', 'Ostfriesentee', 'Grog', 'Eierlikör',
        'Knoblauchbrot', 'Oliven', 'Sardellen', 'Focaccia'];
    var kIdx = 0, proKat = [5, 3, 8, 5, 6, 6, 5, 22];
    var lauf = 0;
    namen.forEach(function (n, i) {
        while (kIdx < proKat.length - 1 && i >= lauf + proKat[kIdx]) { lauf += proKat[kIdx]; kIdx++; }
        GERICHTE.push({
            name: n,
            description: 'Hausgemacht, frisch zubereitet, dazu Beilage nach Wahl',
            price: Math.round((4 + (i % 23) * 1.3) * 10) / 10,
            category: KATEGORIEN[kIdx],
            dish_number: String(i + 1),
            is_vegetarian: i % 4 === 0, is_vegan: false, is_spicy: i % 9 === 0,
            is_beef: false, is_chicken: false, is_pork: false, is_fish: i > 26 && i < 33, is_seafood: false,
            allergens: i % 3 === 0 ? ['gluten'] : [], additives: i % 5 === 0 ? ['1'] : []
        });
    });
})();

var ALS_JSON = JSON.stringify({ items: GERICHTE });

// Dieselbe Karte in der kompakten Zeilenform, die der neue Prompt verlangt.
function alsZeilen(liste) {
    return liste.map(function (g) {
        var mk = (g.is_vegetarian ? 'v' : '') + (g.is_vegan ? 'V' : '') + (g.is_spicy ? 's' : '') +
                 (g.is_fish ? 'f' : '');
        return [g.dish_number, g.name, g.description, g.price.toFixed(2), g.category,
                g.allergens.join(','), g.additives.join(','), mk].join('|');
    }).join('\n');
}
var ALS_ZEILEN = alsZeilen(GERICHTE);

// --- Anthropic-Attrappe --------------------------------------------------
// Verhält sich wie das echte Modell: sie braucht Zeit zum Schreiben.
// "alt": gibt erst die FERTIGE Antwort zurück (so hat der alte Code gelesen).
// "neu": schickt einen Datenstrom und beachtet den Fortsetzungs-Punkt.
function macheFetch(art, zaehler) {
    return async function (url, opts) {
        var u = String(url);
        if (u.indexOf('vision.googleapis') >= 0) return { ok: false, status: 403, text: async () => 'aus' };

        var body = JSON.parse(opts.body);
        zaehler.aufrufe++;

        // Ab welchem Gericht soll geschrieben werden?
        var ab = 0;
        var bl = body.messages[0].content.filter(function (c) { return c.type === 'text'; })
                     .map(function (c) { return c.text; }).join('\n');
        var m = bl.match(/(\d+) Positionen sind schon erfasst/);
        if (m) ab = parseInt(m[1], 10);
        var rest = GERICHTE.slice(ab);
        var text = art === 'alt' ? JSON.stringify({ items: rest }) : alsZeilen(rest);

        if (art === 'alt') {
            // Der alte Code wartete auf die fertige Antwort. Die ist erst da,
            // wenn das Modell alles geschrieben hat.
            await schlaf(Math.round(text.length / ZEICHEN_PRO_SEK * 1000));
            if (opts.signal && opts.signal.aborted) throw abbruch();
            return { ok: true, json: async () => ({ content: [{ text: text }] }) };
        }

        // Datenstrom, Häppchen für Häppchen -- mit realistischem Tempo.
        var STUECK = 180;
        var teile = [];
        for (var i = 0; i < text.length; i += STUECK) {
            teile.push('data: ' + JSON.stringify({ type: 'content_block_delta',
                delta: { type: 'text_delta', text: text.slice(i, i + STUECK) } }) + '\n\n');
        }
        teile.push('data: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + '\n\n');

        var enc = new TextEncoder(), idx = 0;
        var pauseProStueck = Math.round(STUECK / ZEICHEN_PRO_SEK * 1000);
        return {
            ok: true, status: 200,
            body: { getReader: function () { return { read: async function () {
                if (idx >= teile.length) return { done: true };
                await warteOderAbbruch(pauseProStueck, opts.signal);
                return { done: false, value: enc.encode(teile[idx++]) };
            } }; } }
        };
    };
}

function abbruch() { var e = new Error('The operation was aborted'); e.name = 'AbortError'; return e; }

function warteOderAbbruch(ms, signal) {
    return new Promise(function (ok, ab) {
        if (signal && signal.aborted) return ab(abbruch());
        var t = setTimeout(ok, ms);
        if (signal) signal.addEventListener('abort', function () { clearTimeout(t); ab(abbruch()); });
    });
}

// --- Netlify-Attrappe: schneidet nach 10 Sekunden ab ---------------------
async function netlify(handler, anfrage) {
    var t0 = Date.now();
    var erg = await Promise.race([
        handler({ httpMethod: 'POST', body: JSON.stringify(anfrage) }),
        schlaf(NETLIFY_LIMIT_MS).then(function () { return { statusCode: 504, body: '{"ok":false,"error":"Task timed out after 10.00 seconds"}', _limit: true }; })
    ]);
    return { res: erg, ms: Date.now() - t0 };
}

// --- Echten Client-Code aus index.html holen -----------------------------
function schneideFunktion(src, name) {
    var i = src.indexOf('async function ' + name + '(');
    if (i < 0) i = src.indexOf('function ' + name + '(');
    var j = src.indexOf('{', i), d = 0;
    for (var k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    throw new Error('nicht gefunden: ' + name);
}

// --- Ein Durchlauf -------------------------------------------------------
async function lauf(titel, funktionsDatei, art, clientQuelle) {
    process.env.ANTHROPIC_API_KEY = 'test';
    delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_VISION_API_KEY;
    delete require.cache[require.resolve(funktionsDatei)];
    var handler = require(funktionsDatei).handler;

    var zaehler = { aufrufe: 0 };
    global.fetch = macheFetch(art, zaehler);
    global.window = { _lastMenuScanError: null };

    var runden = [];
    // Der echte Client ruft über fetch('/.netlify/functions/menu-scan') auf.
    // Wir leiten das auf den Handler um -- inklusive 10-Sekunden-Wand.
    var echterFetch = global.fetch;
    global.fetch = async function (url, opts) {
        if (String(url).indexOf('/.netlify/functions/menu-scan') < 0) return echterFetch(url, opts);
        var r = await netlify(handler, JSON.parse(opts.body));
        runden.push({ ms: r.ms, code: r.res.statusCode, limit: !!r.res._limit });
        return { ok: r.res.statusCode < 400, status: r.res.statusCode, json: async () => JSON.parse(r.res.body) };
    };

    var t0 = Date.now();
    var ergebnis;
    if (clientQuelle === 'neu') {
        var mod = new Function('return (async function(){' +
            schneideFunktion(HTML, 'aiMenuScan') + ';' +
            schneideFunktion(HTML, 'scanSeiteKomplett') + ';' +
            'return await scanSeiteKomplett("data:image/jpeg;base64,QUJD", ["Pizzen"], null);})()');
        ergebnis = await mod();
    } else {
        // Alter Client: EIN Aufruf, danach ist Schluss.
        var r = await global.fetch('/.netlify/functions/menu-scan',
            { body: JSON.stringify({ images: ['data:image/jpeg;base64,QUJD'], categories: ['Pizzen'] }) });
        var j = await r.json();
        ergebnis = { items: (j && j.ok && j.items) ? j.items : [] };
    }
    var ms = Date.now() - t0;

    console.log('\n' + titel);
    console.log('  Aufrufe an das Modell : ' + zaehler.aufrufe);
    runden.forEach(function (r, i) {
        console.log('    Runde ' + (i + 1) + ': ' + (r.ms / 1000).toFixed(1) + ' s  HTTP ' + r.code +
                    (r.limit ? '  <-- VON NETLIFY ABGESCHNITTEN' : ''));
    });
    console.log('  Dauer gesamt          : ' + (ms / 1000).toFixed(1) + ' s');
    console.log('  Gerichte im Ergebnis  : ' + ergebnis.items.length + ' von ' + GERICHTE.length);
    if (ergebnis.items.length === 0) {
        console.log('  -> NICHTS. In der App uebernimmt hier die einfache Texterkennung.');
    } else if (ergebnis.items.length < GERICHTE.length) {
        console.log('  -> UNVOLLSTAENDIG.');
    } else {
        var kats = {}; ergebnis.items.forEach(function (x) { kats[x.category] = 1; });
        console.log('  -> VOLLSTAENDIG. Kategorien: ' + Object.keys(kats).join(', '));
    }
    return ergebnis.items.length;
}

var HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async function () {
    console.log('Speisekarte: ' + GERICHTE.length + ' Gerichte.');
    console.log('  Als JSON (alt)    : ' + ALS_JSON.length + ' Zeichen  -> ' +
                (ALS_JSON.length / ZEICHEN_PRO_SEK).toFixed(1) + ' s Schreibzeit');
    console.log('  Als Zeilen (neu)  : ' + ALS_ZEILEN.length + ' Zeichen  -> ' +
                (ALS_ZEILEN.length / ZEICHEN_PRO_SEK).toFixed(1) + ' s Schreibzeit');
    console.log('Netlify schneidet nach ' + (NETLIFY_LIMIT_MS / 1000) + ' s ab.');

    // Alte Fassung aus dem Git-Stand vor dem Umbau holen.
    var altDatei = path.join(__dirname, '.beweis-menu-scan-alt.js');
    fs.writeFileSync(altDatei, cp.execSync('git -C ' + JSON.stringify(path.join(__dirname, '..')) +
        ' show c904b1c:netlify/functions/menu-scan.js', { encoding: 'utf8' }));

    var alt = await lauf('ALT (Stand c904b1c, wie auf kiekmolin.de)', altDatei, 'alt', 'alt');
    var neu = await lauf('NEU (dieser Branch)', path.join(__dirname, '..', 'netlify', 'functions', 'menu-scan.js'), 'neu', 'neu');

    fs.unlinkSync(altDatei);

    console.log('\n' + '─'.repeat(52));
    console.log('  ALT: ' + alt + ' Gerichte     NEU: ' + neu + ' Gerichte');
    console.log('─'.repeat(52));
    process.exit(neu === GERICHTE.length && alt < GERICHTE.length ? 0 : 1);
})();
