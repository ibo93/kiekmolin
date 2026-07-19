'use strict';

// Angebots-Seite: eine ausdruckbare/teilbare Seite mit den drei Kurani-
// Dienstleistungen, ehrlichen Versprechen und Preisen - zum Mitbringen ins
// Kundengespraech oder als Link. Preise kommen aus .env (Standardwerte unten),
// damit Ibo sie ohne Code-Aenderung anpassen kann.
//
// Ehrlichkeit wie ueberall: keine "Platz 1"-Versprechen, alles was zugesagt
// wird, kann die Agentur auch halten.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function euro(n) {
  return Number(n || 0).toFixed(0) + ' €';
}

// Preise (netto/Monat) aus .env oder Standard. Combo mit Rabatt.
function preise() {
  const z = (name, standard) => parseInt(process.env[name], 10) || standard;
  const sicht = z('PREIS_SICHTBARKEIT', 99);
  const telefon = z('PREIS_TELEFON', 149);
  const bewertung = z('PREIS_BEWERTUNG', 79);
  const einzelSumme = sicht + telefon + bewertung;
  const komplett = z('PREIS_KOMPLETT', 249);
  return {
    sicht, telefon, bewertung, komplett,
    einrichtung: z('PREIS_EINRICHTUNG', 199),
    ersparnis: einzelSumme - komplett
  };
}

function bauePakete(p) {
  return [
    {
      name: 'KI-Sichtbarkeit',
      preis: p.sicht,
      claim: 'Überall gefunden werden – bei Google UND bei ChatGPT & Co.',
      punkte: [
        'Eigene Profilseite mit Speisekarte auf kiekmolin.de – maschinenlesbar für Google und KI-Assistenten',
        'Monatlicher Sichtbarkeits-Report: wo Sie bei Google und KI stehen, in welche Richtung es geht',
        'Google-Business-Beiträge & optimierte Texte – jeden Monat frisch',
        'Online-Bestellung & Tisch-Reservierung ohne Portal-Provision'
      ]
    },
    {
      name: 'Telefon-Retter',
      preis: p.telefon,
      claim: 'Kein verpasster Anruf mehr – 24/7 ein freundlicher KI-Assistent am Telefon.',
      punkte: [
        'Nimmt Reservierungen & Bestellungen an, wenn niemand ans Telefon kann',
        'Spricht natürlich Deutsch, prüft echte Verfügbarkeit, bestätigt jede Buchung',
        'Läuft parallel zu Ihrem Telefon – der Mensch bleibt erste Wahl, die KI rettet die verpassten Anrufe',
        'Monatlicher Nachweis: wie viele Anrufe gerettet, wie viel Umsatz dazugekommen ist'
      ]
    },
    {
      name: 'Bewertungs-Management',
      preis: p.bewertung,
      claim: 'Ihr Ruf in guten Händen – schlechte Bewertungen professionell gemanagt.',
      punkte: [
        'Jede schlechte Bewertung wird geprüft: meldbar (Fake/Beleidigung) oder nicht?',
        'Fertige Melde-Begründung für Google + formelle Beschwerde bei falschen Behauptungen',
        'Professionelle öffentliche Antworten – souverän, überzeugt mitlesende Gäste',
        'Mehr echte gute Bewertungen sammeln – damit einzelne schlechte untergehen'
      ]
    }
  ];
}

function baueAngebotHtml(kunde, optionen) {
  const o = optionen || {};
  const name = esc(kunde.name || 'Ihr Betrieb');
  const stadt = esc(kunde.city || kunde.stadt || '');
  const akzent = process.env.AKZENT_FARBE || '#f59e0b';
  const kontakt = esc(o.kontakt || 'KURANI · Bahnhofstr. 2 · 26506 Norden · kuranidesign.de');
  const p = preise();
  const pakete = bauePakete(p);

  const paketKarten = pakete.map((k) => `
  <div class="paket">
    <div class="p-kopf"><b>${esc(k.name)}</b><span class="preis">${euro(k.preis)}<small>/Monat</small></span></div>
    <div class="claim">${esc(k.claim)}</div>
    <ul>${k.punkte.map((pt) => '<li>' + esc(pt) + '</li>').join('')}</ul>
  </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Angebot · ${name}</title>
<style>
  :root { --akzent: ${akzent}; --tinte: #111; --grau: #666; --linie: #e2e2e2; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--tinte);
         max-width: 820px; margin: 0 auto; padding: 44px 30px; line-height: 1.5; }
  header { border-bottom: 3px solid var(--tinte); padding-bottom: 16px; margin-bottom: 26px; }
  .marke { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: var(--grau); }
  h1 { font-size: 27px; margin: 8px 0 2px; }
  .unterzeile { color: var(--grau); font-size: 14px; }
  h2 { font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase; margin: 30px 0 14px;
       border-left: 4px solid var(--akzent); padding-left: 10px; }
  .pakete { display: flex; gap: 14px; flex-wrap: wrap; }
  .paket { flex: 1; min-width: 220px; border: 1px solid var(--linie); border-radius: 10px; padding: 18px 20px; }
  .p-kopf { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .p-kopf b { font-size: 16px; }
  .preis { font-size: 22px; font-weight: 700; color: var(--akzent); white-space: nowrap; }
  .preis small { font-size: 12px; color: var(--grau); font-weight: 400; }
  .claim { font-size: 13.5px; color: #333; margin-bottom: 10px; }
  .paket ul { margin: 0; padding-left: 18px; }
  .paket li { font-size: 13px; margin-bottom: 6px; color: #444; }
  .komplett { margin-top: 18px; background: var(--tinte); color: #fff; border-radius: 12px; padding: 22px 26px;
              display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .komplett .txt b { font-size: 18px; }
  .komplett .txt p { margin: 4px 0 0; color: #ccc; font-size: 13.5px; }
  .komplett .zahl { text-align: right; }
  .komplett .gross { font-size: 30px; font-weight: 800; color: var(--akzent); }
  .komplett .gross small { font-size: 13px; color: #ccc; font-weight: 400; }
  .komplett .durch { color: #999; text-decoration: line-through; font-size: 14px; }
  .ehrlich { background: #fafafa; border: 1px solid var(--linie); border-radius: 8px; padding: 14px 18px;
             font-size: 13.5px; margin-top: 20px; }
  .konditionen { font-size: 12.5px; color: var(--grau); margin-top: 16px; }
  footer { margin-top: 26px; font-size: 12px; color: var(--grau); border-top: 1px solid var(--linie); padding-top: 12px; }
  @media print { body { padding: 0; } .paket, .komplett { break-inside: avoid; } }
</style>
</head>
<body>
<header>
  <div class="marke">Kurani · Angebot für die Gastronomie</div>
  <h1>${name}</h1>
  <div class="unterzeile">${stadt ? stadt + ' · ' : ''}Ihre digitale Sichtbarkeit, Ihr Telefon, Ihr Ruf – aus einer Hand${o.datum ? ' · ' + esc(o.datum) : ''}</div>
</header>

<h2>Drei Bausteine – einzeln oder zusammen</h2>
<div class="pakete">
${paketKarten}
</div>

<div class="komplett">
  <div class="txt">
    <b>Komplett-Paket: alle drei Bausteine</b>
    <p>Volle Sichtbarkeit, gerettete Anrufe und ein sauberer Ruf – alles betreut, ein Ansprechpartner.</p>
  </div>
  <div class="zahl">
    <div class="durch">statt ${euro(p.sicht + p.telefon + p.bewertung)}/Monat</div>
    <div class="gross">${euro(p.komplett)}<small>/Monat</small></div>
    <div style="color:var(--akzent);font-size:13px">Sie sparen ${euro(p.ersparnis)}/Monat</div>
  </div>
</div>

<div class="ehrlich"><b>Ehrlich gesagt:</b> Niemand kann seriös „Platz 1 bei Google" oder „wir löschen jede Bewertung" versprechen – wir auch nicht. Was wir versprechen: Arbeit an den richtigen Hebeln, jeden Monat schwarz auf weiß dokumentiert. Sie sehen genau, was passiert – und können jederzeit monatlich kündigen.</div>

<div class="konditionen">
  Alle Preise netto zzgl. MwSt. · Einmalige Einrichtung ${euro(p.einrichtung)} (entfällt beim Komplett-Paket) ·
  Monatlich kündbar · Keine Installation nötig, wir richten alles ein.
</div>

<footer>${kontakt}</footer>
</body>
</html>`;
}

module.exports = { baueAngebotHtml, preise, bauePakete };
