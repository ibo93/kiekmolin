'use strict';

// Interessenten-Pipeline: Aus den Verzeichnis-Betrieben (prospects.json)
// werden Neukunden. Fuer jeden Interessenten baut die Agentur-App eine
// personalisierte Pitch-Seite: Was ihm heute sichtbar fehlt, was die
// Agentur liefert - zum Mitbringen ins Gespraech oder als Link.
//
// Ehrlichkeit: Die Luecken kommen aus den vorhandenen Daten des Betriebs,
// und es wird nichts versprochen, was die Agentur nicht halten kann
// (kein "Platz 1 garantiert").

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Sichtbare Luecken eines Interessenten - nur datengedeckte Aussagen.
function pitchLuecken(prospect) {
  const luecken = [];
  if (!prospect.website) {
    luecken.push({
      titel: 'Keine eigene Website auffindbar',
      folge: 'Google und KI-Assistenten (ChatGPT, Claude) haben fast nichts, was sie über den Betrieb lesen können – empfohlen wird, wer lesbar ist.'
    });
  }
  luecken.push({
    titel: 'Keine Online-Speisekarte, keine Online-Bestellung',
    folge: 'Gäste, die abends „' + (prospect.category || 'Restaurant') + ' ' + (prospect.city || '') + '" suchen, bestellen dort, wo sie mit zwei Klicks bestellen können – heute meist bei Portalen mit hoher Provision.'
  });
  luecken.push({
    titel: 'Keine Online-Tischreservierung',
    folge: 'Wer nachts oder in der Mittagspause nicht durchkommt, reserviert woanders. Jeder verpasste Anruf ist ein verlorener Tisch.'
  });
  luecken.push({
    titel: 'Verpasste Anrufe = verlorener Umsatz',
    folge: 'In Stoßzeiten kann niemand ans Telefon. Ein KI-Telefon-Assistent nimmt Reservierungen und Bestellungen an – 24/7, ohne Personal.'
  });
  return luecken;
}

// Die Pitch-Seite: eine Seite, die das Problem zeigt und die Loesung anbietet.
function bauePitchHtml(prospect, optionen) {
  const o = optionen || {};
  const name = esc(prospect.name || 'Ihr Betrieb');
  const stadt = esc(prospect.city || 'Ostfriesland');
  const luecken = pitchLuecken(prospect);
  const akzent = process.env.AKZENT_FARBE || '#f59e0b';
  const kontakt = esc(o.kontakt || 'KURANI · Bahnhofstr. 2 · 26506 Norden');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Sichtbarkeits-Schnellcheck · ${name}</title>
<style>
  :root { --akzent: ${akzent}; --tinte: #111; --grau: #666; --linie: #e2e2e2; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--tinte);
         max-width: 760px; margin: 0 auto; padding: 48px 32px; line-height: 1.55; }
  header { border-bottom: 3px solid var(--tinte); padding-bottom: 16px; margin-bottom: 28px; }
  .marke { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: var(--grau); }
  h1 { font-size: 28px; margin: 8px 0 2px; }
  .unterzeile { color: var(--grau); font-size: 14px; }
  h2 { font-size: 15px; letter-spacing: 1.5px; text-transform: uppercase; margin: 32px 0 12px;
       border-left: 4px solid var(--akzent); padding-left: 10px; }
  .luecke { border: 1px solid var(--linie); border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; }
  .luecke b { display: block; margin-bottom: 3px; }
  .luecke span { color: #444; font-size: 14px; }
  .loesung { display: flex; gap: 14px; margin-bottom: 10px; align-items: flex-start; }
  .loesung .n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--akzent);
                color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .beweis { background: #fafafa; border: 1px solid var(--linie); border-radius: 8px; padding: 14px 18px;
            font-size: 14px; margin-top: 8px; }
  .cta { margin-top: 30px; background: var(--tinte); color: #fff; border-radius: 10px; padding: 20px 24px; }
  .cta b { font-size: 17px; }
  .cta p { margin: 6px 0 0; color: #ddd; font-size: 14px; }
  footer { margin-top: 28px; font-size: 12px; color: var(--grau); }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<header>
  <div class="marke">Kurani · Sichtbarkeits-Schnellcheck</div>
  <h1>${name}</h1>
  <div class="unterzeile">${stadt} · unverbindliche Bestandsaufnahme · ${esc(o.datum || '')}</div>
</header>

<h2>Was Gästen heute auffällt (und was nicht)</h2>
${luecken.map((l) => '<div class="luecke"><b>' + esc(l.titel) + '</b><span>' + esc(l.folge) + '</span></div>').join('\n')}

<h2>Was wir dagegen tun</h2>
<div class="loesung"><div class="n">1</div><div><b>Sichtbar werden:</b> eigene Profilseite mit Speisekarte auf kiekmolin.de – maschinenlesbar für Google UND KI-Assistenten (Schema.org, llms.txt), inklusive Online-Bestellung und Tisch-Reservierung ohne Portal-Provision.</div></div>
<div class="loesung"><div class="n">2</div><div><b>Kein Anruf geht mehr verloren:</b> der KI-Telefon-Assistent nimmt Reservierungen und Bestellungen an, wenn niemand ans Telefon kann – rund um die Uhr, auf Deutsch, mit Bestätigung.</div></div>
<div class="loesung"><div class="n">3</div><div><b>Jeden Monat schwarz auf weiß:</b> ein Report zeigt, wo der Betrieb bei Google und KI-Assistenten steht, wer vor ihm liegt – und wie viel Umsatz übers Telefon dazukam.</div></div>

<div class="beweis"><b>Ehrlich gesagt:</b> Niemand kann seriös „Platz 1 bei Google" versprechen – wir auch nicht.
Was wir versprechen: messbare Arbeit an den richtigen Hebeln, jeden Monat dokumentiert. Der Report zeigt
die Richtung – und den Euro-Wert der geretteten Anrufe.</div>

<div class="cta">
  <b>15 Minuten reichen für den Start.</b>
  <p>Wir richten alles ein – Sie müssen nichts installieren und nichts ändern. Erster Monats-Report inklusive.</p>
</div>

<footer>${kontakt}</footer>
</body>
</html>`;
}

// Ist ein Interessent in Wahrheit schon Partner? (Namens-Abgleich,
// Umlaut-tolerant) - Bestandskunden gehoeren nicht in die Pipeline.
function normalisiereName(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function istSchonPartner(prospect, kundenNamen) {
  const p = normalisiereName(prospect && prospect.name);
  if (!p) return false;
  return (kundenNamen || []).some((n) => {
    const k = normalisiereName(n);
    return k && (k === p || k.includes(p) || p.includes(k));
  });
}

module.exports = { pitchLuecken, bauePitchHtml, istSchonPartner, normalisiereName };
