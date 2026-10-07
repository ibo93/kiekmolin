// "DA KOMMT KEINE ANFRAGE REIN"
//
// Ibo am 24.09.2026. Gemessen an einer echten, gebauten Prospect-Seite:
// der gruene Kasten "Ist das dein Restaurant?" begann auf dem Handy bei
// Pixel 1333 von 3497 -- ANDERTHALB BILDSCHIRME weit unten. Ein Wirt, der
// seinen eigenen Betrieb googelt, liest Adresse und Telefon und ist weg,
// lange bevor er erfaehrt, dass er die Seite uebernehmen kann.
//
// Der Kasten BLEIBT trotzdem, wo er ist. Diese Seite gehoert zuerst dem
// Gast, der etwas essen will -- deshalb rankt sie ueberhaupt bei Google.
// Eine Verkaufskachel ganz oben wuerde den Gast vertreiben und damit den
// Weg zerstoeren, auf dem der Wirt ueberhaupt herkommt.
//
// Stattdessen: eine schmale Zeile direkt unter den Stammdaten.
//
// Geprueft wird im ECHTEN BROWSER. Wo etwas auf einer Seite steht, sieht
// kein Textvergleich.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const KMI = path.join(__dirname, '..');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

const AUS = fs.mkdtempSync(path.join(os.tmpdir(), 'kmi-inhaber-'));
process.env.SEO_OUT_DIR = AUS;
const B = require(path.join(KMI, 'build-seo-pages.js'));

const BETRIEB = { name: 'Gasthaus Zur Linde', city: 'Norden', street: 'Am Markt 4',
                  postcode: '26506', phone: '04931 123456', category: 'Restaurant', source: 'osm' };
B.generateProspectPage(BETRIEB, [], []);
const datei = path.join(AUS, 'gasthaus-zur-linde-norden.html');
t('die Seite wurde gebaut', fs.existsSync(datei), AUS);
const H = fs.readFileSync(datei, 'utf8');

console.log('\n-- Beide Wege sind da --');
t('die Zeile oben existiert', /id="inhaberZeile"/.test(H), 'fehlt');
t('der Kasten unten existiert weiter', /id="inhaberKnopf"/.test(H), 'verschwunden');
t('die Zeile steht VOR dem Kasten',
  H.indexOf('id="inhaberZeile"') < H.indexOf('id="inhaberKnopf"'), 'falsche Reihenfolge');
t('beide zeigen auf /gastro',
  (H.match(/href="\/gastro"/g) || []).length >= 2, (H.match(/href="\/gastro"/g) || []).length);

(async function () {
    let pw;
    try { pw = require('playwright-core'); }
    catch (e) { console.log('\n(playwright-core fehlt -- Browsermessung uebersprungen)');
                console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
                process.exit(ok === n ? 0 : 1); }

    const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    console.log('\n-- Wo es wirklich steht, im echten Browser --');
    for (const [wie, breite] of [['Handy', 390], ['Rechner', 1280]]) {
        const pg = await browser.newPage({ viewport: { width: breite, height: 844 } });
        await pg.goto('file://' + datei, { waitUntil: 'load' });
        await pg.waitForTimeout(1200);          // die Seite blendet ein
        const m = await pg.evaluate(function () {
            function pos(id) {
                var e = document.getElementById(id);
                if (!e) return -1;
                var r = e.getBoundingClientRect();
                return Math.round(r.top + window.scrollY);
            }
            var e = document.getElementById('inhaberZeile');
            var st = e ? getComputedStyle(e) : null;
            var r = e ? e.getBoundingClientRect() : null;
            return {
                hoehe: document.documentElement.scrollHeight,
                zeile: pos('inhaberZeile'), kasten: pos('inhaberKnopf'),
                fenster: window.innerHeight,
                sichtbar: st ? st.opacity : '0',
                schrift: st ? parseInt(st.fontSize, 10) : 0,
                ueberRand: r ? r.right > breiteDesFensters() : false
            };
            function breiteDesFensters() { return document.documentElement.clientWidth + 1; }
        });
        const schirme = m.zeile / m.fenster;
        t(wie + ': die Zeile ist nach unter EINEM Bildschirm erreicht',
          schirme < 1.0, schirme.toFixed(2) + ' Bildschirme (Pixel ' + m.zeile + ' von ' + m.hoehe + ')');
        t(wie + ': und deutlich frueher als der Kasten',
          m.kasten - m.zeile > 300, 'Abstand ' + (m.kasten - m.zeile) + ' px');
        t(wie + ': sie ist wirklich sichtbar, nicht nur im Quelltext',
          m.sichtbar === '1', 'Deckkraft ' + m.sichtbar);
        t(wie + ': lesbar gross', m.schrift >= 14, m.schrift + 'px');
        t(wie + ': laeuft nicht ueber den Rand', m.ueberRand === false, 'ragt raus');
        await pg.close();
    }

    console.log('\n-- Was die Seite bleiben muss --');
    // Wenn der Gast vertrieben wird, faellt das Ranking, und dann kommt
    // auch der Wirt nicht mehr. Die Zeile darf nicht vor den Inhalt.
    const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pg.goto('file://' + datei, { waitUntil: 'load' });
    await pg.waitForTimeout(1200);
    const g = await pg.evaluate(function () {
        function oben(sel) {
            var e = document.querySelector(sel);
            return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1;
        }
        var e = document.getElementById('inhaberZeile');
        return { h1: oben('h1'), telefon: oben('a[href^="tel:"]'),
                 zeile: e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1 };
    });
    t('der Name des Betriebs steht weiter ganz oben', g.h1 < g.zeile, g.h1 + ' vs ' + g.zeile);
    t('die Telefonnummer kommt vor der Verkaufszeile', g.telefon > 0 && g.telefon < g.zeile,
      g.telefon + ' vs ' + g.zeile);
    await pg.close();
    await browser.close();

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
