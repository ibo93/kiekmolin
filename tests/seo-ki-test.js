// SEO UND KI (22.10.2026)
//
// Ibo: "der SEO muss richtig sein und bei KI muessen wir gut vertreten sein".
// Gemessen vorher:
//   - Speisekarte auf der Google-Seite: nur 30 Gerichte (limit=30), Luett
//     Italia hat ~140. Was nicht drauf ist, findet weder Google noch KI.
//   - llms.txt schrieb bei JEDEM Betrieb "Online bestellen & Tisch
//     reservieren" -- auch bei Haeusern ohne Bestellung.
//   - "Luett Italia ist ein Pizzeria" (falscher Artikel) im Google-Treffer.
//   - "Restaurant Taverna ist Italian in Jever" (OSM-Kueche auf Englisch).
//   - Ueber jedem Treffer "kiekmolin.de" statt "Kiek mol in": der
//     WebSite-Eintrag stand nur verschachtelt.
// Dieser Test ruft die Funktionen echt auf (mit eigenem Ausgabeordner).
var path = require('path'), fs = require('fs'), os = require('os');
var R = path.join(__dirname, '..');
var AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-seo-'));
process.env.SEO_OUT_DIR = AUS;
var S = require(R + '/build-seo-pages.js');
var B = fs.readFileSync(R + '/build-seo-pages.js', 'utf8');
var H = fs.readFileSync(R + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

(async function () {
    console.log('-- Artikel und Kueche --');
    t('"eine Pizzeria", nicht "ein Pizzeria"', S.lokalArt('Pizzeria') === 'eine Pizzeria', S.lokalArt('Pizzeria'));
    t('"ein griechisches Restaurant", "ein Döner-Imbiss"', S.lokalArt('Griechisches Restaurant') === 'ein griechisches Restaurant' && S.lokalArt('Döner') === 'ein Döner-Imbiss', '');
    t('OSM "italian;pizza" -> "Italienische Küche, Pizza"', S.kuecheText('italian;pizza') === 'Italienische Küche, Pizza', S.kuecheText('italian;pizza'));
    t('zwei Kuechen: "Italienische und griechische Küche"', S.kuecheText('italian;greek') === 'Italienische und griechische Küche', S.kuecheText('italian;greek'));
    t('unbekannter englischer Schluessel faellt weg statt englisch dazustehen', S.kuecheText('fusion_bowls') === '' && S.kuecheText('') === '', S.kuecheText('fusion_bowls'));
    t('der Satz mit "ist ein " + Kategorie ist weg', !/' ist ein ' \+ escapeHtml\(catLabel\)/.test(B) && /' ist ' \+ escapeHtml\(lokalArt\(catLabel\)\)/.test(B), '');
    t('OSM-Seite: Kueche aus kuecheText, nicht roh', /const kueche = kuecheText\(p\.cuisine\);/.test(B) && !/String\(p\.cuisine\)\.charAt\(0\)\.toUpperCase\(\)/.test(B), '');

    console.log('\n-- Ganze Speisekarte --');
    var urls = [], antworten = [{ status: 400, body: { message: 'column menu_categories.sort_order does not exist' } },
        { status: 200, body: [{ name: 'B', sort_order: 2, menu_categories: { name: 'Pizza' } }, { name: 'A', sort_order: 1, menu_categories: { name: 'Pizza' } }] }];
    global.fetch = function (u) { urls.push(u); var a = antworten.shift(); return Promise.resolve({ ok: a.status === 200, status: a.status, json: function () { return Promise.resolve(a.body); } }); };
    var warn = console.warn, gewarnt = []; console.warn = function (m) { gewarnt.push(String(m)); };
    var karte = await S.fetchMenuItems('r1');
    console.warn = warn;
    t('alle Gerichte: limit=500 statt 30', /limit=500/.test(urls[0]) && !/limit=30\b/.test(urls[0]), urls[0]);
    t('Reihenfolge der Karte (Kategorie, dann Gericht)', /menu_categories\(name,sort_order\)/.test(urls[0]) && /order=sort_order\.asc/.test(urls[0]), urls[0]);
    t('Fehler (400) steht im Protokoll und es gibt einen zweiten Versuch', gewarnt.some(function (g) { return /HTTP 400/.test(g); }) && urls.length === 2, JSON.stringify(gewarnt));
    t('… und die Gerichte kommen trotzdem, sortiert', karte.length === 2 && karte[0].name === 'A', JSON.stringify(karte));
    var sortiert = S.karteSortieren([{ name: 'Tiramisu', sort_order: 1, menu_categories: { name: 'Dessert', sort_order: 9 } }, { name: 'Margherita', sort_order: 5, menu_categories: { name: 'Pizza', sort_order: 1 } }, { name: 'Diavola', sort_order: 2, menu_categories: { name: 'Pizza', sort_order: 1 } }]);
    t('karteSortieren: Pizza vor Dessert, Diavola vor Margherita', sortiert.map(function (x) { return x.name; }).join(',') === 'Diavola,Margherita,Tiramisu', sortiert.map(function (x) { return x.name; }).join(','));
    t('Seite sagt "Alle N Gerichte der Karte" (nicht mehr "die beliebtesten")', /'Alle ' \+ gerichteZahl\(menuItems\.length\) \+ ' der Karte'/.test(B) && !/beliebtesten Gerichte – komplette Karte/.test(B), '');
    t('Beschreibung im Google-Treffer: die beliebtesten zuerst', /beliebteZuerst\(menuItems\)\.slice\(0, 5\)/.test(B), '');

    console.log('\n-- KI: llms.txt und llms-full.txt --');
    var R1 = { id: 'r1', slug: 'luett-italia', name: 'Lütt Italia', city: 'Wittmund', street: 'Drostenstraße 5', zip: '26409', cuisine: 'Pizzeria', features: [] };
    var R2 = { id: 'r2', slug: 'nur-karte', name: 'Nur Karte', city: 'Esens', features: ['no_ordering', 'no_reservations'] };
    var karten = { r1: [{ name: 'Margherita', base_price: 8.5, menu_categories: { name: 'Pizza' } }, { name: 'Diavola', base_price: 10.9, is_popular: true, description: 'Salami piccante', menu_categories: { name: 'Pizza' } }] };
    S.writeLlmsTxt([R1, R2], karten);
    var L = fs.readFileSync(path.join(AUS, 'llms.txt'), 'utf8'), F = fs.readFileSync(path.join(AUS, 'llms-full.txt'), 'utf8');
    var zeile1 = (L.match(/- \[Lütt Italia\][^\n]*/) || [''])[0], zeile2 = (L.match(/- \[Nur Karte\][^\n]*/) || [''])[0];
    t('llms.txt: Haus mit Bestellung + Reservierung sagt das', /online bestellen und Tisch reservieren/.test(zeile1), zeile1);
    t('llms.txt: Haus OHNE beides verspricht nichts', /Auf Kiek mol in: Speisekarte\./.test(zeile2) && !/bestellen|reservieren/.test(zeile2), zeile2);
    t('llms.txt: beliebte Gerichte mit Preis, das beliebteste zuerst', /Beliebt: Diavola \(10,90\s?€\), Margherita/.test(zeile1), zeile1);
    t('llms.txt verweist auf llms-full.txt', /\/llms-full\.txt\)/.test(L), '');
    t('llms-full.txt: jedes Gericht mit Preis und Beschreibung, nach Kategorie', /## Lütt Italia \(Wittmund\)/.test(F) && /\*\*Pizza\*\*/.test(F) && /- Diavola: 10,90\s?€ – Salami piccante/.test(F), F.slice(0, 400));
    t('llms-full.txt: richtiger Artikel und Adresse', /- Art: eine Pizzeria/.test(F) && /Drostenstraße 5, 26409 Wittmund/.test(F), F.slice(0, 300));
    t('llms-full.txt: Haus ohne Bestellung -> nur "Speisekarte"', /## Nur Karte \(Esens\)[\s\S]*?- Auf Kiek mol in: Speisekarte – /.test(F), '');

    console.log('\n-- Website-Name --');
    var bloecke = [], re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, m;
    while ((m = re.exec(H))) { try { bloecke.push(JSON.parse(m[1])); } catch (e) { bloecke.push({ kaputt: e.message }); } }
    t('alle JSON-LD-Bloecke auf der Startseite sind gueltig', bloecke.every(function (b) { return !b.kaputt; }), JSON.stringify(bloecke.filter(function (b) { return b.kaputt; })));
    var ws = bloecke.find(function (b) { return b['@type'] === 'WebSite'; });
    t('eigener WebSite-Eintrag mit Namen "Kiek mol in" (oberste Ebene)', !!ws && ws.name === 'Kiek mol in' && ws.url === 'https://kiekmolin.de/', JSON.stringify(ws));

    fs.rmSync(AUS, { recursive: true, force: true });
    console.log('\n' + ok + '/' + n + ' bestanden');
    if (ok !== n) process.exit(1);
})();
