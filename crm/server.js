/* ============================================================
   Kurani CRM – kleiner Server fuer den eigenen Rechner

   Warum ueberhaupt ein Server? Weil der Browser deine Daten pro
   Adresse getrennt speichert. Als Datei geoeffnet (file://) ist das
   eine andere Adresse als http://localhost:8899 – und beide sehen
   sich gegenseitig nicht.

   Der Port 8899 ist deshalb fest: Dort liegen deine Daten.
   Bitte nicht aendern, sonst sind sie auf einmal "weg"
   (sie waeren noch da, nur unter der alten Adresse).
   ============================================================ */
const http = require('http'), fs = require('fs'), path = require('path');

const WURZEL = __dirname;
const PORT   = 8899;

const TYP = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',   '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json', '.txt':'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';

  /* Nicht aus dem Ordner herausklettern lassen */
  const datei = path.normalize(path.join(WURZEL, p));
  if (!datei.startsWith(WURZEL)){
    res.writeHead(403, {'Content-Type':'text/plain; charset=utf-8'});
    return res.end('Nicht erlaubt');
  }

  fs.readFile(datei, (err, inhalt) => {
    if (err){
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
      return res.end('Nicht gefunden: ' + p);
    }
    res.writeHead(200, {
      'Content-Type': TYP[path.extname(datei).toLowerCase()] || 'application/octet-stream',
      /* Immer frisch ausliefern – sonst siehst du nach einer Aenderung
         tagelang den alten Stand. */
      'Cache-Control': 'no-store'
    });
    res.end(inhalt);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Kurani CRM laeuft auf http://localhost:${PORT}`);
});
