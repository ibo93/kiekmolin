// Sichere Minifizierung: entfernt nur Whitespace/Kommentare aus den inline-
// JS-Bloecken von index.html. KEIN Umbenennen, KEIN Dead-Code-Entfernen
// (compress:false, mangle:false) -> das Verhalten bleibt 1:1 identisch.
// Wird zur Build-Zeit nach build-seo-pages.js ausgefuehrt. Fault-tolerant:
// faellt pro Block auf das Original zurueck, wenn terser nicht parsen kann.

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const FILE = process.argv[2] || 'index.html';

(async () => {
  let html;
  try { html = fs.readFileSync(FILE, 'utf8'); }
  catch (e) { console.log('[minify] ' + FILE + ' nicht gefunden – uebersprungen'); return; }

  const before = html.length;
  // Nur attribut-lose <script> ... </script> (kein src, kein type) -> reines JS.
  const re = /<script>([\s\S]*?)<\/script>/g;
  let out = '';
  let last = 0, m, ok = 0, skipped = 0;

  while ((m = re.exec(html)) !== null) {
    out += html.slice(last, m.index);
    const code = m[1];
    try {
      const res = await minify(code, {
        compress: false,
        mangle: false,
        format: { comments: false }
      });
      if (res && typeof res.code === 'string') { out += '<script>' + res.code + '</script>'; ok++; }
      else { out += m[0]; skipped++; }
    } catch (e) {
      out += m[0]; skipped++;
      console.log('[minify] Block uebersprungen: ' + e.message);
    }
    last = m.index + m[0].length;
  }
  out += html.slice(last);

  fs.writeFileSync(FILE, out);
  const saved = before - out.length;
  console.log('[minify] ' + ok + ' JS-Bloecke minifiziert, ' + skipped + ' uebersprungen. '
    + before + ' -> ' + out.length + ' Bytes (-' + (saved / 1024).toFixed(0) + ' KB, -'
    + ((saved / before) * 100).toFixed(1) + '%)');

  // sw.js mit aktuellem Build-Zeitstempel versehen. Dadurch aendern sich die
  // Bytes der Datei bei jedem Deploy, der Browser erkennt "neuer Service-Worker"
  // -> existierender updatefound-Handler in index.html reloadet die Seite
  // automatisch und der Nutzer sieht ohne Cache-Aerger die neue Version.
  try {
    const swPath = path.join(path.dirname(path.resolve(FILE)), 'sw.js');
    if (fs.existsSync(swPath)) {
      let sw = fs.readFileSync(swPath, 'utf8');
      sw = sw.replace(/^\/\/ build-version: [^\n]*\n/, '');
      const stamp = '// build-version: ' + new Date().toISOString() + '\n';
      fs.writeFileSync(swPath, stamp + sw, 'utf8');
      console.log('[minify] sw.js gestempelt: ' + stamp.trim());
    } else {
      console.log('[minify] sw.js nicht gefunden – uebersprungen');
    }
  } catch (e) {
    console.warn('[minify] sw.js Stempel fehlgeschlagen: ' + e.message);
  }
})();
