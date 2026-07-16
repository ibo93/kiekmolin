'use strict';

// Teil B - Der Monats-Report (das Kernstueck).
// Fuehrt alle Checks aus, speichert das Ergebnis als Historie
// (data/<slug>/JJJJ-MM.json), vergleicht mit dem Vormonat und rendert
// einen sauberen Report: schlicht, schwarz/grau, EIN Akzent (Kurani-Stil).
//
// WICHTIG (steht auch im Report selbst): Es wird NIE "Platz 1 garantiert"
// versprochen. Der Report zeigt Richtung und ist transparent darueber,
// was automatisch getestet wurde und was nicht.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const checks = require('./checks');

const DATEN_ORDNER = path.join(__dirname, '..', 'data');
const AKZENT = process.env.AKZENT_FARBE || '#f59e0b';

const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function monatsSchluessel(datum) {
  const d = datum || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function monatsLabel(schluessel) {
  const [jahr, monat] = schluessel.split('-').map(Number);
  return MONATSNAMEN[monat - 1] + ' ' + jahr;
}

// --- Checks ausfuehren -------------------------------------------------------
async function fuehreChecksAus(restaurant, fragenListe) {
  const basis = {
    kiekmolin: await checks.checkKiekmolinSeite(restaurant),
    website: await checks.checkEigeneWebsite(restaurant)
  };
  const fragen = [];
  for (const f of fragenListe) {
    process.stdout.write('  Teste: "' + f.frage + '" ... ');
    const [google, ki] = await Promise.all([
      checks.checkGoogle(f.frage, restaurant),
      checks.checkKI(f.frage, restaurant)
    ]);
    console.log('Google: ' + google.status + ' / KI: ' + ki.status);
    fragen.push({ id: f.id, frage: f.frage, google, ki });
  }
  return { basis, fragen };
}

// --- Auswertung ---------------------------------------------------------------
// Quote = gefunden / automatisch getestet. 'manuell' und 'fehler' zaehlen
// bewusst NICHT als getestet - keine geschoenten Zahlen.
function quote(ergebnis) {
  let getestet = 0;
  let gefunden = 0;
  for (const f of ergebnis.fragen) {
    for (const seite of [f.google, f.ki]) {
      if (seite.status === 'gefunden' || seite.status === 'nicht-gefunden') {
        getestet++;
        if (seite.status === 'gefunden') gefunden++;
      }
    }
  }
  return { getestet, gefunden, prozent: getestet ? Math.round((gefunden / getestet) * 100) : null };
}

function naechsteSchritte(ergebnis, restaurant) {
  const schritte = [];
  const b = ergebnis.basis;

  if (b.kiekmolin.status !== 'gefunden') {
    schritte.push('Profil auf kiekmolin.de pruefen: Der Betrieb ist dort aktuell nicht auffindbar - das ist die Basis fuer alles Weitere.');
  } else if (b.kiekmolin.jsonLd === false) {
    schritte.push('Schema.org-Markup auf der Kiek-mol-in-Seite ergaenzen (fertiges JSON-LD liegt im Ordner aufbereitung/).');
  }
  if (b.website.status === 'manuell') {
    schritte.push('Eigene Website oder Landing-Page pruefen/anlegen und in der Datenbank hinterlegen - KI-Assistenten lesen bevorzugt eigene Seiten.');
  } else if (b.website.status === 'fehler') {
    schritte.push('Die hinterlegte Website ist nicht erreichbar - Link korrigieren oder Hosting pruefen.');
  } else if (b.website.jsonLd === false) {
    schritte.push('JSON-LD-Markup in die eigene Website einbauen (fertig generiert im Ordner aufbereitung/).');
  }

  const googleVerloren = ergebnis.fragen.filter((f) => f.google.status === 'nicht-gefunden');
  if (googleVerloren.length) {
    schritte.push('Google-Business-Profil nach Checkliste optimieren (Kategorien, Fotos, Beitraege) - bei ' +
      googleVerloren.length + ' von ' + ergebnis.fragen.length + ' Suchfragen noch nicht in den Top 10.');
  }
  const kiVerloren = ergebnis.fragen.filter((f) => f.ki.status === 'nicht-gefunden');
  if (kiVerloren.length) {
    schritte.push('Maschinenlesbare Inhalte staerken (Beschreibung, Speisekarte als Text, Schema.org), damit KI-Assistenten den Betrieb empfehlen koennen - aktuell bei ' +
      kiVerloren.length + ' von ' + ergebnis.fragen.length + ' KI-Fragen nicht genannt.');
  }
  const manuell = ergebnis.fragen.filter((f) => f.google.status === 'manuell' || f.ki.status === 'manuell');
  if (manuell.length) {
    schritte.push('API-Zugaenge in .env eintragen (siehe README), damit alle Tests automatisch laufen - ' +
      manuell.length + ' Frage(n) sind diesen Monat als "manuell pruefen" markiert.');
  }
  if (!schritte.length) {
    schritte.push('Stand halten: Bewertungen weiter beantworten, monatlich 1-2 Google-Beitraege, Fotos aktuell halten.');
  }
  return schritte;
}

// --- Historie -----------------------------------------------------------------
function speichereHistorie(slug, monat, daten) {
  const ordner = path.join(DATEN_ORDNER, slug);
  fs.mkdirSync(ordner, { recursive: true });
  const pfad = path.join(ordner, monat + '.json');
  // Zweitlauf im selben Monat: alten Stand als .vorher.json sichern,
  // damit ein misslungener Re-Run (z.B. ohne Keys) gute Daten nicht vernichtet.
  if (fs.existsSync(pfad)) {
    try { fs.copyFileSync(pfad, path.join(ordner, monat + '.vorher.json')); } catch (_e) { /* Backup ist nice-to-have */ }
  }
  fs.writeFileSync(pfad, JSON.stringify(daten, null, 2));
}

function ladeVormonat(slug, aktuellerMonat) {
  const ordner = path.join(DATEN_ORDNER, slug);
  if (!fs.existsSync(ordner)) return null;
  const monate = fs.readdirSync(ordner)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .filter((m) => m < aktuellerMonat)
    .sort();
  if (!monate.length) return null;
  const letzter = monate[monate.length - 1];
  try {
    return JSON.parse(fs.readFileSync(path.join(ordner, letzter + '.json'), 'utf8'));
  } catch (_e) {
    return null;
  }
}

// --- HTML-Report ----------------------------------------------------------------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusChip(check) {
  const map = {
    'gefunden': { txt: 'gefunden', cls: 'ok' },
    'nicht-gefunden': { txt: 'nicht gefunden', cls: 'nein' },
    'manuell': { txt: 'manuell prüfen', cls: 'manuell' },
    'fehler': { txt: 'Fehler', cls: 'manuell' }
  };
  const m = map[check.status] || map['manuell'];
  const platz = check.platz ? ' · Platz ' + check.platz : '';
  return '<span class="chip ' + m.cls + '" title="' + esc(check.detail || '') + '">' + m.txt + platz + '</span>';
}

function trendText(aktuell, vormonat) {
  if (!vormonat || vormonat.quote == null || vormonat.quote.prozent == null || aktuell.prozent == null) {
    return null;
  }
  // Ehrlicher Vergleich nur bei gleicher Testbasis: liefen diesen Monat mehr/
  // weniger automatische Tests (z.B. Keys neu dazugekommen), sagt die Differenz
  // der Prozentwerte nichts aus - dann lieber transparent aussetzen.
  if (vormonat.quote.getestet !== aktuell.getestet) {
    return {
      txt: 'Testbasis geändert (' + aktuell.getestet + ' statt ' + vormonat.quote.getestet +
        ' automatische Tests) – Vergleich zu ' + monatsLabel(vormonat.monat) + ' ausgesetzt',
      cls: 'neutral'
    };
  }
  const diff = aktuell.prozent - vormonat.quote.prozent;
  if (diff > 0) return { txt: '+' + diff + ' Punkte gegenüber ' + monatsLabel(vormonat.monat), cls: 'ok' };
  if (diff < 0) return { txt: diff + ' Punkte gegenüber ' + monatsLabel(vormonat.monat), cls: 'nein' };
  return { txt: 'unverändert gegenüber ' + monatsLabel(vormonat.monat), cls: 'neutral' };
}

function euroBetrag(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' €';
}

// Sektion "Was der Telefon-Retter gebracht hat" - der Umsatz-Nachweis.
// Wird nur gerendert, wenn Telefon-Zahlen vorliegen und der Assistent in
// dem Monat etwas getan hat (sonst waere die Sektion irrefuehrend).
function telefonSektion(telefon) {
  if (!telefon) return '';
  const aktiv = (telefon.reservierungen || 0) + (telefon.bestellungen || 0) + (telefon.rueckrufe || 0);
  if (!aktiv) return '';
  return `
<h2>Was der Telefon-Retter gebracht hat</h2>
<div class="kacheln">
  <div class="kachel">
    <div class="wert akzent">${euroBetrag(telefon.gesamtGeschaetzt)}</div>
    <div class="label">Umsatz am Telefon (geschätzt)</div>
    <span class="trend neutral">Bestellwert + Reservierungs-Schätzung</span>
  </div>
  <div class="kachel">
    <div class="wert">${telefon.reservierungen}</div>
    <div class="label">Reservierungen</div>
    <span class="trend neutral">${telefon.gaeste} Gäste am Tisch</span>
  </div>
  <div class="kachel">
    <div class="wert">${telefon.bestellungen}</div>
    <div class="label">Bestellungen</div>
    <span class="trend neutral">${euroBetrag(telefon.bestellwert)} Bestellwert (echt)</span>
  </div>
  ${telefon.rueckrufe ? `<div class="kachel">
    <div class="wert">${telefon.rueckrufe}</div>
    <div class="label">Rückruf-Wünsche</div>
    <span class="trend neutral">kein Anruf ging verloren</span>
  </div>` : ''}
</div>
<div class="hinweis" style="margin-top:14px;border-top:none;padding-top:0">
  Jeder dieser Anrufe kam an, während das Team nicht ans Telefon konnte – ohne den Assistenten
  wäre er womöglich bei der Konkurrenz gelandet. Der Bestellwert ist die echte Summe der
  telefonisch aufgegebenen Bestellungen. Der Reservierungs-Umsatz ist bewusst konservativ
  geschätzt: ${telefon.gaeste} Gäste × ${euroBetrag(telefon.bonProGast)} Durchschnittsbon
  = ${euroBetrag(telefon.reservierungsUmsatz)}.
</div>`;
}

function renderHtml({ restaurant, kategorie, monat, ergebnis, vormonat, telefon }) {
  const q = quote(ergebnis);
  const schritte = naechsteSchritte(ergebnis, restaurant);
  const trend = trendText(q, vormonat);

  const fragenZeilen = ergebnis.fragen.map((f) => {
    const vorher = vormonat && vormonat.ergebnis
      ? (vormonat.ergebnis.fragen || []).find((v) => v.id === f.id)
      : null;
    const neuGefunden = vorher &&
      ((vorher.google.status === 'nicht-gefunden' && f.google.status === 'gefunden') ||
       (vorher.ki.status === 'nicht-gefunden' && f.ki.status === 'gefunden'));
    return '<tr>' +
      '<td>„' + esc(f.frage) + '“' + (neuGefunden ? ' <span class="neu">NEU sichtbar</span>' : '') + '</td>' +
      '<td>' + statusChip(f.google) + '</td>' +
      '<td>' + statusChip(f.ki) + '</td>' +
      '</tr>';
  }).join('\n');

  const kiAuszuege = ergebnis.fragen
    .filter((f) => f.ki.antwortAuszug)
    .map((f) => '<div class="auszug"><div class="auszug-frage">„' + esc(f.frage) + '“</div><div>' + esc(f.ki.antwortAuszug) + '</div></div>')
    .join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>KI-Sichtbarkeit · ${esc(restaurant.name)} · ${esc(monatsLabel(monat))}</title>
<style>
  :root { --akzent: ${AKZENT}; --tinte: #111; --grau: #666; --linie: #e2e2e2; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--tinte);
         max-width: 800px; margin: 0 auto; padding: 48px 32px; line-height: 1.55; }
  header { border-bottom: 3px solid var(--tinte); padding-bottom: 16px; margin-bottom: 32px; }
  .marke { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: var(--grau); }
  h1 { font-size: 30px; margin: 8px 0 2px; }
  .unterzeile { color: var(--grau); font-size: 14px; }
  .vertraulich { float: right; font-size: 11px; color: var(--grau); border: 1px solid var(--linie);
                 padding: 2px 8px; border-radius: 3px; margin-top: 4px; }
  h2 { font-size: 15px; letter-spacing: 1.5px; text-transform: uppercase; margin: 36px 0 12px;
       border-left: 4px solid var(--akzent); padding-left: 10px; }
  .kacheln { display: flex; gap: 16px; }
  .kachel { flex: 1; border: 1px solid var(--linie); border-radius: 6px; padding: 16px 18px; }
  .kachel .wert { font-size: 34px; font-weight: 700; }
  .kachel .wert.akzent { color: var(--akzent); }
  .kachel .label { font-size: 12px; color: var(--grau); text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
       color: var(--grau); border-bottom: 2px solid var(--tinte); padding: 6px 8px; }
  td { border-bottom: 1px solid var(--linie); padding: 9px 8px; vertical-align: top; }
  .chip { display: inline-block; font-size: 12px; padding: 2px 9px; border-radius: 10px; white-space: nowrap; }
  .chip.ok { background: var(--akzent); color: #fff; }
  .chip.nein { background: #f0f0f0; color: #333; border: 1px solid #ccc; }
  .chip.manuell { background: #fff; color: var(--grau); border: 1px dashed #bbb; }
  .neu { font-size: 11px; color: var(--akzent); font-weight: 700; margin-left: 6px; }
  .trend { display: inline-block; margin-top: 6px; font-size: 13px; }
  .trend.ok { color: var(--akzent); font-weight: 600; }
  .trend.nein { color: #b00; font-weight: 600; }
  .trend.neutral { color: var(--grau); }
  ol.schritte li { margin-bottom: 8px; }
  .auszug { border: 1px solid var(--linie); border-radius: 6px; padding: 10px 14px; margin-bottom: 10px;
            font-size: 12.5px; color: #333; }
  .auszug-frage { font-weight: 600; margin-bottom: 4px; }
  .hinweis { font-size: 12px; color: var(--grau); border-top: 1px solid var(--linie);
             margin-top: 40px; padding-top: 14px; }
  footer { margin-top: 28px; font-size: 12px; color: var(--grau); display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } .kachel { break-inside: avoid; } }
</style>
</head>
<body>
<header>
  <span class="vertraulich">vertraulich</span>
  <div class="marke">Kurani · KI-Sichtbarkeit</div>
  <h1>${esc(restaurant.name)}</h1>
  <div class="unterzeile">${esc(kategorie)}${restaurant.city ? ' · ' + esc(restaurant.city) : ''} · Monats-Report ${esc(monatsLabel(monat))}</div>
</header>

<h2>Wo stehst du</h2>
<div class="kacheln">
  <div class="kachel">
    <div class="wert akzent">${q.prozent == null ? '–' : q.prozent + '%'}</div>
    <div class="label">Sichtbarkeits-Quote</div>
    ${trend ? '<span class="trend ' + trend.cls + '">' + esc(trend.txt) + '</span>' : '<span class="trend neutral">erster Report – ab nächstem Monat mit Vergleich</span>'}
  </div>
  <div class="kachel">
    <div class="wert">${q.gefunden}<span style="font-size:18px;color:var(--grau)"> / ${q.getestet}</span></div>
    <div class="label">Tests mit Treffer</div>
    <span class="trend neutral">automatisch getestete Suchfragen</span>
  </div>
</div>
${telefonSektion(telefon)}
<h2>Basis-Check</h2>
<table>
  <tr><th>Prüfung</th><th>Ergebnis</th><th>Detail</th></tr>
  <tr><td>Eintrag auf kiekmolin.de</td><td>${statusChip(ergebnis.basis.kiekmolin)}</td><td>${esc(ergebnis.basis.kiekmolin.detail)}</td></tr>
  <tr><td>Eigene Website</td><td>${statusChip(ergebnis.basis.website)}</td><td>${esc(ergebnis.basis.website.detail)}</td></tr>
</table>

<h2>Suchfragen im Test</h2>
<table>
  <tr><th style="width:50%">Suchfrage</th><th>Google</th><th>KI-Assistent</th></tr>
  ${fragenZeilen}
</table>

${kiAuszuege ? '<h2>So antwortet die KI (Auszüge)</h2>\n' + kiAuszuege : ''}

<h2>Was kommt nächsten Monat</h2>
<ol class="schritte">
  ${schritte.map((s) => '<li>' + esc(s) + '</li>').join('\n  ')}
</ol>

<div class="hinweis">
  <strong>Transparenz statt Versprechen:</strong> Sichtbarkeit bei Google und KI-Assistenten lässt sich
  nicht garantieren – niemand kann seriös „Platz&nbsp;1“ zusagen. Dieser Report zeigt jeden Monat mit
  denselben Suchfragen, wo der Betrieb steht und in welche Richtung es sich entwickelt.
  Fragen mit „manuell prüfen“ wurden diesen Monat nicht automatisch getestet und fließen nicht in die Quote ein.
  Google-Platzierungen stammen aus der offiziellen Such-API und sind ein Richtwert – das persönliche
  Ranking auf google.de kann je nach Standort und Verlauf leicht abweichen.
</div>

<footer>
  <span>Kurani Design · Bahnhofstr. 2 · 26506 Norden</span>
  <span>Gestaltung, die man fühlt.</span>
</footer>
</body>
</html>`;
}

// --- HTML -> PDF (falls Chrome/Chromium vorhanden) -------------------------------
function htmlZuPdf(htmlPfad, pdfPfad) {
  const kandidaten = [
    process.env.CHROME_PFAD,
    '/opt/pw-browsers/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);

  for (const chrome of kandidaten) {
    if (!fs.existsSync(chrome)) continue;
    try {
      execFileSync(chrome, [
        '--headless', '--disable-gpu', '--no-sandbox',
        '--no-pdf-header-footer',
        '--print-to-pdf=' + pdfPfad,
        'file://' + htmlPfad
      ], { stdio: 'pipe', timeout: 60000 });
      return true;
    } catch (_e) { /* naechsten Kandidaten versuchen */ }
  }
  return false;
}

module.exports = {
  fuehreChecksAus, quote, naechsteSchritte, renderHtml, telefonSektion,
  speichereHistorie, ladeVormonat, monatsSchluessel, monatsLabel, htmlZuPdf
};
