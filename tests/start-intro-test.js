// START-INTRO: Ibos Video statt des alten Splash (08.10.2026).
//
// Ibo: "ich will genau das haben, das andere geht dann weg". Was dabei
// schiefgehen kann, ohne dass es jemand merkt:
//   - das Original hat 4,4 MB -- auf Mobilfunk laedt es laenger, als das
//     Intro dauert, und man sieht nur Gruen
//   - ohne "muted" + "playsinline" spielt kein Handy es von selbst ab
//   - faengt der Service Worker die Videodatei ab, spielt Safari sie nicht
//     (iPhone laedt Videos in Teilstuecken, Range-Anfragen)
//   - ohne Ausweg bleibt der gruene Schirm stehen (Stromsparmodus, kein Netz)
// Ob das Video im Browser wirklich laeuft, misst werkzeug/start-intro-messen.js.
'use strict';
var fs = require('fs'), path = require('path');
var W = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(W, 'index.html'), 'utf8');
var SW = fs.readFileSync(path.join(W, 'sw.js'), 'utf8');
var NT = fs.readFileSync(path.join(W, 'netlify.toml'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

var block = H.slice(H.indexOf('<div id="splashScreen"'), H.indexOf('</script>', H.indexOf('<div id="splashScreen"')));
var video = (block.match(/<video[^>]*>/) || [''])[0];
t('das Intro ist ein Video', /id="splashVideo"/.test(video), video);
t('stumm, im Bild, startet von selbst (sonst spielt kein Handy es ab)', /\bmuted\b/.test(video) && /\bplaysinline\b/.test(video) && /\bautoplay\b/.test(video), video);
var quellen = (block.match(/<source src="([^"]+)"/g) || []).map(function (q) { return q.replace(/.*src="/, '').replace(/"$/, ''); });
t('zwei Quellen: webm und mp4 (mp4 für ältere iPhones)', quellen.length === 2 && /\.webm$/.test(quellen[0]) && /\.mp4$/.test(quellen[1]), quellen.join(', '));
quellen.forEach(function (q) {
    var f = path.join(W, q), da = fs.existsSync(f), gr = da ? fs.statSync(f).size : 0;
    var grenze = /\.webm$/.test(q) ? 250000 : 1100000;  // mp4 nur für alte Safaris
    t(q + ' liegt im Repo und ist klein (' + Math.round(gr / 1024) + ' KB, Original 4,4 MB)', da && gr > 20000 && gr < grenze, gr);
    if (da) {
        var b = fs.readFileSync(f).toString('latin1');
        var ton = /\.mp4$/.test(q) ? /hdlr[\s\S]{8}soun/.test(b) : /A_OPUS|A_VORBIS/.test(b);
        t(q + ' ohne Tonspur (spielt ohnehin nur stumm)', !ton, 'Tonspur gefunden');
    }
});
t('Fassung im Dateinamen (darf ein Jahr im Gerät bleiben)', quellen.every(function (q) { return /-v\d+(-[a-z0-9]+)?\./.test(q); }) && /for = "\/intro\/\*"[\s\S]{0,80}max-age=31536000, immutable/.test(NT), '');
var bildRegel = (SW.match(/if \(\/\\\.\(([^)]*)\)\$\/i\.test\(url\.pathname\)\)/) || [])[1] || '';
t('Service Worker fasst Videos nicht an (Safari lädt sie in Teilstücken)', bildRegel.length > 0 && !/mp4|webm|mov/.test(bildRegel), bildRegel);
// Kein Haengen
t('Abspielen blockiert (Stromsparmodus) -> weiter', /spiel\.catch\(function \(\) \{ videoAus = true; vielleicht\(\); \}\)/.test(block), '');
t('Ladefehler (auch an <source>) -> weiter', /v\.addEventListener\('error', function \(\) \{ videoAus = true; vielleicht\(\); \}, true\);/.test(block), '');
t('läuft nach 1,5 s nicht -> weiter; nach 4,5 s in jedem Fall weg', /if \(!v\.currentTime\) \{ videoAus = true; geladen = true; vielleicht\(\); \} \}, 1500\)/.test(block) && /weiter\(false\); \}, 4500\)/.test(block), '');
t('einmal pro Sitzung, "Bewegung reduzieren" -> gar nicht', /sessionStorage\.getItem\('kmi_splash_seen'\)/.test(block) && /prefers-reduced-motion: reduce/.test(block) && /if \(gesehen \|\| ruhig \|\| !v\) \{ weiter\(true\); return; \}/.test(block), '');
t('danach geht es wie bisher weiter (Einführung für neue Gäste)', /typeof showOnboarding === 'function'\) showOnboarding\(\)/.test(block), '');
// Ibo: "Bildqualität nicht gut, wirkt zu groß" -- randlos aufgezogen war das
// Logo quer ~1000 px breit und auf dem iPad mehr als doppelt hochgerechnet.
t('nie randlos aufgezogen: höchstens 78 % der Höhe, Seitenverhältnis bleibt', /height: min\(78vh, 138vw\); width: auto; aspect-ratio: 9 \/ 16/.test(block) && !/object-fit: cover/.test(block), '');
t('der Flug durch das i füllt das ganze Bild (kein Oval): Video wächst, Rand geht auf', /#splashScreen\.flug #splashVideo \{ -webkit-mask-size: 420% 420%; mask-size: 420% 420%; \}/.test(block) && /if \(t > 1\.28 && !s\.classList\.contains\('flug'\)\)/.test(block) && /scale\(' \+ k\.toFixed\(3\)/.test(block), '');
t('Ränder laufen weich in den Grünverlauf aus (auch Safari)', /-webkit-mask-image: radial-gradient/.test(block) && /[^-]mask-image: radial-gradient/.test(block), '');
t('alter Splash ist raus (Partikel, Ringe, Ladebalken)', !/splashParticles|splash-ring|splashBar|splashCinematicOut/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
