'use strict';

// Bewertungs-Motor: Bewertungen sind DER Hebel fuer lokales Ranking
// (Sterne in den Suchergebnissen -> mehr Klicks -> besseres Ranking -> mehr
// Bewertungen). Grosse Ketten sammeln sie systematisch am Tisch - genau das
// bekommt jeder Partner-Betrieb hier: eine druckfertige Tischkarte mit
// QR-Code, der Gaeste direkt zum Bewerten fuehrt.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Kurz-URL des Betriebs (die SEO-Seite leitet echte Besucher in die App)
function bewertungsUrl(kunde) {
  const slug = kunde.slug || String(kunde.id || '');
  return 'https://kiekmolin.de/' + slug;
}

// QR als Bild vom offenen qrserver.com-Dienst - kein API-Key noetig.
// Der QR laedt beim Oeffnen/Drucken der Karte (Internet noetig).
function qrBildUrl(daten, groesse) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' + (groesse || 340) + 'x' + (groesse || 340) +
    '&data=' + encodeURIComponent(daten);
}

// Druckfertige Tischkarte (A6 quer, 2 Stueck pro A4-Blatt zum Schneiden).
function baueTischkarte(kunde) {
  const name = esc(kunde.name || 'Unser Restaurant');
  const url = bewertungsUrl(kunde);
  const qr = qrBildUrl(url, 340);
  const akzent = process.env.AKZENT_FARBE || '#f59e0b';

  const karte = `
  <div class="karte">
    <div class="links">
      <div class="sterne">★★★★★</div>
      <h1>Hat es geschmeckt?</h1>
      <p class="sub">Deine Bewertung hilft ${name} mehr als du denkst – 30 Sekunden genügen.</p>
      <div class="url">${esc(url.replace('https://', ''))}</div>
      <p class="danke">Danke &amp; bis bald!</p>
    </div>
    <div class="rechts">
      <img src="${esc(qr)}" alt="QR-Code: ${name} bewerten" width="170" height="170">
      <div class="scan">Einfach scannen</div>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Bewertungs-Tischkarte · ${name}</title>
<style>
  :root { --akzent: ${akzent}; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f5f5f5; padding: 24px; }
  .hinweis { max-width: 640px; margin: 0 auto 18px; font-size: 13px; color: #666; background: #fff;
             border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px 16px; }
  .karte { width: 148mm; height: 105mm; background: #fff; margin: 0 auto 12mm; display: flex;
           border: 1px dashed #bbb; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
  .links { flex: 1; padding: 12mm 10mm; display: flex; flex-direction: column; justify-content: center; }
  .sterne { color: var(--akzent); font-size: 26px; letter-spacing: 4px; margin-bottom: 6mm; }
  h1 { font-size: 26px; color: #111; margin-bottom: 4mm; }
  .sub { font-size: 13.5px; color: #444; line-height: 1.5; }
  .url { margin-top: 6mm; font-weight: 700; font-size: 15px; color: #111; }
  .danke { margin-top: 4mm; font-size: 12.5px; color: #888; }
  .rechts { width: 60mm; background: #111; color: #fff; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 4mm; padding: 8mm; }
  .rechts img { background: #fff; padding: 3mm; border-radius: 4mm; width: 42mm; height: 42mm; }
  .scan { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; }
  @media print { body { background: #fff; padding: 0; } .hinweis { display: none; } .karte { border: none; } }
</style>
</head>
<body>
<div class="hinweis"><strong>Drucken:</strong> Strg+P → A4. Zwei Karten pro Blatt, an der gestrichelten
Linie schneiden, laminieren oder in einen Aufsteller stecken – auf jeden Tisch und an den Tresen.
Der QR-Code führt zu ${esc(url)} (Bewertung direkt im Profil).</div>
${karte}
${karte}
</body>
</html>`;
}

module.exports = { baueTischkarte, bewertungsUrl, qrBildUrl };
