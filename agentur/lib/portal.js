'use strict';

// Kunden-Portal per Magic-Link: Jeder Wirt bekommt EINEN privaten Link
// (kein Login, kein Passwort) zu seiner eigenen Ergebnis-Seite - Zahlen,
// Verlauf, Reports. Wer taeglich "sein Dashboard" anschaut, kuendigt nicht.
//
// Sicherheit: Der Token ist ein HMAC aus Kunden-Slug + PORTAL_SECRET.
// Ohne PORTAL_SECRET in der .env ist das Portal AUS (ehrlicher Hinweis).
// Der Link ist so gut wie sein Geheimnis - nicht oeffentlich posten.

const crypto = require('crypto');

function istAktiv() {
  return !!process.env.PORTAL_SECRET;
}

// Stabiler, nicht erratbarer Token je Kunde (16 Bytes hex)
function portalToken(slug) {
  return crypto.createHmac('sha256', String(process.env.PORTAL_SECRET))
    .update(String(slug)).digest('hex').slice(0, 32);
}

function euro(n) { return Number(n || 0).toFixed(2).replace('.', ',') + ' €'; }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Die Portal-Seite des Wirts: schlicht, Kurani-Stil, nur SEINE Daten.
function bauePortalHtml({ kunde, zahlen, historie, token }) {
  const z = zahlen || {};
  const verlauf = (historie || []).slice(0, 6).reverse();
  const maxQ = Math.max(1, ...verlauf.map((h) => (h.quote && h.quote.prozent) || 0));
  const balken = verlauf.map((h) => {
    const p = h.quote && h.quote.prozent != null ? h.quote.prozent : null;
    return '<div style="flex:1;text-align:center"><div style="font-size:11px;font-weight:700">' + (p == null ? '–' : p + '%') + '</div>' +
      '<div style="height:' + (p == null ? 2 : Math.max(4, Math.round((p / maxQ) * 56))) + 'px;background:' + (p == null ? '#e2e2e2' : '#f59e0b') + ';border-radius:3px 3px 0 0;width:60%;max-width:40px;margin:2px auto 0"></div>' +
      '<div style="font-size:10px;color:#666;margin-top:3px">' + esc(String(h.monat).slice(5)) + '/' + esc(String(h.monat).slice(2, 4)) + '</div></div>';
  }).join('');
  const reports = (historie || []).filter((h) => h.html).slice(0, 6).map((h) =>
    '<li><a href="/portal/' + esc(token) + '/report/' + esc(h.monat) + '">' + esc(h.label) + ' – Report ansehen</a></li>').join('');

  return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(kunde.name) + ' · Kurani</title>' +
    '<style>body{font-family:Helvetica,Arial,sans-serif;color:#111;max-width:680px;margin:0 auto;padding:36px 20px;line-height:1.5}' +
    'h1{font-size:24px;margin:6px 0 2px}h2{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;border-left:4px solid #f59e0b;padding-left:10px;margin:28px 0 12px}' +
    '.marke{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#666}.zahlen{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}' +
    '.z{border:1px solid #e2e2e2;border-radius:8px;padding:12px 14px}.z b{font-size:22px}.z div{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px}' +
    'ul{padding-left:18px}a{color:#111}</style></head><body>' +
    '<div class="marke">Kurani · Ihr Ergebnis-Portal</div><h1>' + esc(kunde.name) + '</h1>' +
    '<h2>Ihr Telefon-Assistent · dieser Monat</h2><div class="zahlen">' +
    '<div class="z"><b style="color:#f59e0b">' + euro(z.gesamtGeschaetzt) + '</b><div>Umsatz am Telefon (geschätzt)</div></div>' +
    '<div class="z"><b>' + (z.reservierungen || 0) + '</b><div>Reservierungen (' + (z.gaeste || 0) + ' Gäste)</div></div>' +
    '<div class="z"><b>' + (z.bestellungen || 0) + '</b><div>Bestellungen (' + euro(z.bestellwert) + ')</div></div></div>' +
    (verlauf.length >= 2 ? '<h2>Ihre Sichtbarkeit im Verlauf</h2><div style="display:flex;align-items:flex-end;gap:8px;min-height:80px;border:1px solid #e2e2e2;border-radius:8px;padding:12px">' + balken + '</div>' : '') +
    (reports ? '<h2>Ihre Monats-Reports</h2><ul>' + reports + '</ul>' : '') +
    '<p style="font-size:12px;color:#666;margin-top:28px">Fragen? Einfach anrufen oder auf die Report-Mail antworten. – Kurani Design, Norden</p>' +
    '</body></html>';
}

module.exports = { istAktiv, portalToken, bauePortalHtml };
