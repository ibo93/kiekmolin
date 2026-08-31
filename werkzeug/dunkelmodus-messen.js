// DEN DUNKELMODUS IM ECHTEN BROWSER NACHMESSEN.
//
// Gemeldet am 27.08.2026: "der Dunkel Modus muss viel besser sein es
// ist eine reine Katastrophe".
//
// WARUM DIESES WERKZEUG NEBEN DEN TESTS STEHT
// tests/dunkelmodus-test.js liest Quelltext: er prueft, dass fuer jede
// weisse Flaeche eine Regel existiert. Was er NICHT kann: nachsehen,
// was am Ende wirklich auf dem Bildschirm steht. Genau daran ist der
// Dunkelmodus gescheitert -- die Regeln waren da, sie trafen nur die
// falschen Namen.
//
// Das hier laedt index.html in einem echten Chromium, schaltet dunkel
// und misst den Kontrast zwischen Schrift und dem Grund, der wirklich
// dahinterliegt (durchsichtige Flaechen werden dabei aufeinandergelegt,
// bis eine deckende kommt).
//
// AUFRUF
//     node werkzeug/dunkelmodus-messen.js
//
// Es laeuft NICHT in tests/run-all.js. Ein Test, der einen Browser
// braucht, ist auf einem Rechner ohne Browser entweder rot ohne Grund
// oder gruen ohne Pruefung -- beides waere schlimmer als keiner.
// Playwright liegt hier nicht als Abhaengigkeit; fehlt es, sagt das
// Werkzeug das und hoert auf.
//
// GEFORDERT: 4.5:1 -- die Schwelle der WCAG fuer normalen Text. Wer bei
// Sonne auf ein Handy schaut, braucht sie wirklich.

'use strict';

var path = require('path');
var GRENZE = 4.5;
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

var chromium;
try {
    chromium = require('playwright-core').chromium;
} catch (e) {
    console.log('playwright-core ist hier nicht installiert -- nichts gemessen.');
    console.log('  npm i playwright-core   und dann noch einmal.');
    process.exit(0);
}

(async function () {
    var browser = await chromium.launch({ executablePath: CHROM }).catch(function (e) {
        console.log('Chromium nicht startbar (' + CHROM + '):', e.message);
        console.log('Pfad ueber CHROMIUM_PFAD setzen.');
        return null;
    });
    if (!browser) process.exit(0);

    var page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', function () {});   // die App braucht Supabase, das fehlt hier
    // Optional ein anderer Pfad -- damit sich VORHER und NACHHER
    // vergleichen laesst, statt "hab ich nicht kaputtgemacht" zu sagen.
    var datei = process.argv[2] || path.resolve(__dirname, '..', 'index.html');
    await page.goto('file://' + path.resolve(datei),
                    { waitUntil: 'domcontentloaded' }).catch(function () {});
    await page.waitForTimeout(1200);

    // KMI_HELL=1 misst denselben Weg im Hellmodus. Gebraucht, um zu
    // belegen, dass eine Reparatur am Dunkelmodus das Helle nicht
    // kaputtgemacht hat -- behaupten kann man das schnell.
    var dunkel = !process.env.KMI_HELL;
    if (dunkel) await page.evaluate(function () {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        document.documentElement.setAttribute('data-theme', 'dark');
    });
    // Der Uebergang auf <body> dauert 0.3s. Wer frueher misst, misst die
    // alte Farbe -- das ist mir beim Bauen selbst passiert und sah aus
    // wie ein Fehler in der App.
    await page.waitForTimeout(600);

    var funde = await page.evaluate(function (arg) {
        var grenze = arg.grenze, grundfarbe = arg.grund;
        function zahlen(s) {
            var m = String(s).match(/rgba?\(([^)]+)\)/);
            if (!m) return null;
            var t = m[1].split(',').map(parseFloat);
            return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 };
        }
        function drauf(v, h) {
            return [ v.r * v.a + h[0] * (1 - v.a), v.g * v.a + h[1] * (1 - v.a), v.b * v.a + h[2] * (1 - v.a) ];
        }
        function leucht(c) {
            var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
        }
        // Den Grund suchen, der wirklich dahinterliegt: nach oben durch
        // die Eltern, durchsichtige Schichten aufeinanderlegen.
        //
        // WAS DAS WERKZEUG NICHT KANN: hinter ein BILD schauen. Liegt
        // ueber einem Elternteil ein Foto oder ein Verlauf, ist die
        // Farbe darunter nicht berechenbar -- weisse Schrift auf einem
        // dunklen Hero-Bild saehe dann aus wie weiss auf weiss.
        //
        // Beim ersten Lauf im Hellmodus meldete es genau deshalb 15
        // Fehler, die keine waren (Splash, Hero, Landingpage). Ein
        // Werkzeug, das Falsches meldet, wird nach dem zweiten Mal
        // ignoriert -- also sagt es lieber "nicht messbar" und zaehlt
        // das getrennt.
        function grundVon(el) {
            var schichten = [];
            for (var k = el; k && k !== document.documentElement; k = k.parentElement) {
                var st = getComputedStyle(k);
                if (st.backgroundImage && st.backgroundImage !== 'none') return null;
                var f = zahlen(st.backgroundColor);
                if (f && f.a > 0) { schichten.push(f); if (f.a >= 0.999) break; }
            }
            var farbe = grundfarbe.slice();
            for (var i = schichten.length - 1; i >= 0; i--) farbe = drauf(schichten[i], farbe);
            return farbe;
        }

        var raus = [], unklar = 0;
        var alle = document.querySelectorAll('body *');
        for (var i = 0; i < alle.length; i++) {
            var el = alle[i];
            // Nur sichtbarer, echter Text
            var text = '';
            for (var j = 0; j < el.childNodes.length; j++) {
                if (el.childNodes[j].nodeType === 3) text += el.childNodes[j].nodeValue;
            }
            text = text.trim();
            if (text.length < 2) continue;
            var s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.3) continue;
            var kasten = el.getBoundingClientRect();
            if (kasten.width < 4 || kasten.height < 4) continue;
            if (el.closest('[hidden]')) continue;

            var tf = zahlen(s.color); if (!tf) continue;
            var grund = grundVon(el);
            if (!grund) { unklar++; continue; }
            var schrift = drauf(tf, grund);
            var l1 = leucht(schrift), l2 = leucht(grund);
            var k = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (k >= grenze) continue;
            raus.push({
                text: text.slice(0, 40),
                klasse: (el.className && String(el.className).slice(0, 40)) || el.tagName.toLowerCase(),
                farbe: s.color,
                grund: 'rgb(' + grund.map(Math.round).join(',') + ')',
                k: Math.round(k * 100) / 100
            });
            if (raus.length > 80) break;
        }
        return { schlecht: raus, geprueft: alle.length, unklar: unklar };
    }, { grenze: GRENZE, grund: dunkel ? [14, 14, 14] : [250, 250, 250] });

    console.log('\n' + (dunkel ? 'Dunkelmodus' : 'Hellmodus') + ', im Browser gemessen (Schwelle ' + GRENZE + ':1)');
    console.log('Elemente durchgesehen: ' + funde.geprueft
              + '   (nicht messbar, weil ein Bild dahinterliegt: ' + funde.unklar + ')');
    if (!funde.schlecht.length) {
        console.log('Kein sichtbarer Text unter der Schwelle.');
    } else {
        console.log('Zu schwacher Kontrast: ' + funde.schlecht.length + '\n');
        funde.schlecht.forEach(function (f) {
            console.log('  ' + String(f.k).padStart(5) + ':1  "' + f.text + '"');
            console.log('           ' + f.klasse + '   Schrift ' + f.farbe + ' auf ' + f.grund);
        });
    }
    await browser.close();
    process.exit(funde.schlecht.length ? 1 : 0);
})();
