'use strict';

// DER BEWEIS-ZETTEL — was hat mein Geld gebracht?
//
// Das ist der wichtigste Kuendigungsschutz, den es gibt. Ein Wirt zahlt
// 199 Euro im Monat und SIEHT nichts. Nach drei Monaten fragt er sich,
// wofuer eigentlich - und kuendigt. Nicht weil es schlecht war, sondern
// weil niemand es ihm gezeigt hat.
//
// Die Zahlen liegen alle schon auf der Platte: in den Monats-Reports
// unter sichtbarkeit/data/<kunde>/JJJJ-MM.json steht, was der
// Telefon-Retter geleistet hat und wie die Sichtbarkeit stand. Es fehlte
// nur das Blatt.
//
// Zwei Regeln, die hier ueber allem stehen:
//   1. Nichts erfinden. Fehlt eine Zahl, steht sie nicht da - und der
//      Zettel sagt, dass sie fehlt.
//   2. Schaetzungen werden als Schaetzung ausgewiesen. "Bei 25 Euro pro
//      Gast" ist eine Annahme, keine Messung. Wer damit trickst, fliegt
//      beim ersten kritischen Wirt auf - und zu Recht.

const fs = require('fs');
const path = require('path');
const agentur = require('./agentur');

// Was ist ein Gast im Schnitt wert? Annahme, ueber .env anpassbar.
function gastWert() {
  return parseFloat(process.env.SPRACH_GAST_WERT || '25');
}

const MONATE = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function monatWort(monat) {
  const t = String(monat || '').split('-');
  const nr = parseInt(t[1], 10);
  return (MONATE[nr - 1] || monat) + ' ' + t[0];
}

function euro(betrag) {
  return Math.round(Number(betrag) || 0).toLocaleString('de-DE') + ' Euro';
}

// --------------------------------------------------------- Zusammenbauen ---

// Alles fuer einen Kunden: der letzte Monat, davor, und was daraus folgt.
function fuerKunden(slug) {
  const historie = agentur.historieVon(slug);      // neuester zuerst
  if (!historie.length) return null;

  const jetzt = historie[0];
  const vorher = historie[1] || null;
  const vorDrei = historie[3] || historie[historie.length - 1] || null;
  const t = jetzt.telefon || {};

  const gaeste = Number(t.gaeste) || 0;
  const bestellwert = Number(t.bestellwert) || 0;
  // Der geschaetzte Wert: Gaeste mal Gast-Wert plus die tatsaechlichen
  // Bestellwerte. Die Bestellwerte sind gemessen, die Gaeste geschaetzt.
  const geschaetzt = Number(t.gesamtGeschaetzt) || (gaeste * gastWert() + bestellwert);

  return {
    slug: slug,
    name: agentur.nameAus(slug),
    monat: jetzt.monat,
    monatWort: monatWort(jetzt.monat),
    telefon: {
      reservierungen: Number(t.reservierungen) || 0,
      gaeste: gaeste,
      bestellungen: Number(t.bestellungen) || 0,
      bestellwert: bestellwert,
      rueckrufe: Number(t.rueckrufe) || 0,
      hatDaten: !!jetzt.telefon
    },
    geschaetzterWert: Math.round(geschaetzt),
    gastWert: gastWert(),
    quote: { jetzt: jetzt.quote, vorher: vorher ? vorher.quote : null, vorDrei: vorDrei ? vorDrei.quote : null,
      vorDreiMonat: vorDrei ? vorDrei.monat : null },
    monateDabei: historie.length
  };
}

// Die Saetze, die auf dem Zettel stehen - und die der Assistent vorliest.
function saetze(b) {
  if (!b) return [];
  const zeilen = [];

  if (b.telefon.hatDaten && (b.telefon.reservierungen || b.telefon.bestellungen || b.telefon.rueckrufe)) {
    const teile = [];
    if (b.telefon.reservierungen) {
      teile.push(b.telefon.reservierungen + ' Reservierung' + (b.telefon.reservierungen === 1 ? '' : 'en') +
        (b.telefon.gaeste ? ' fuer ' + b.telefon.gaeste + ' Gaeste' : ''));
    }
    if (b.telefon.bestellungen) teile.push(b.telefon.bestellungen + ' Bestellungen ueber ' + euro(b.telefon.bestellwert));
    if (b.telefon.rueckrufe) teile.push(b.telefon.rueckrufe + ' Rueckrufwuensche');
    zeilen.push('Im ' + b.monatWort + ' hat der Telefon-Retter ' + teile.join(', ') + ' entgegengenommen - Anrufe, bei denen sonst niemand rangegangen waere.');

    if (b.geschaetzterWert > 0) {
      zeilen.push('Das sind geschaetzt rund ' + euro(b.geschaetzterWert) + ' Umsatz (gerechnet mit ' +
        euro(b.gastWert) + ' pro Gast - eine Annahme, keine Messung).');
    }
  } else {
    zeilen.push('Im ' + b.monatWort + ' liegen mir keine Telefon-Zahlen vor.');
  }

  if (typeof b.quote.jetzt === 'number') {
    if (typeof b.quote.vorDrei === 'number' && b.quote.vorDrei !== b.quote.jetzt) {
      const richtung = b.quote.jetzt > b.quote.vorDrei ? 'gestiegen' : 'gefallen';
      zeilen.push('Die Sichtbarkeit steht bei ' + b.quote.jetzt + ' Prozent, im ' +
        monatWort(b.quote.vorDreiMonat) + ' waren es ' + b.quote.vorDrei + ' - also ' + richtung + '.');
    } else {
      zeilen.push('Die Sichtbarkeit steht bei ' + b.quote.jetzt + ' Prozent.');
    }
  }

  return zeilen;
}

// Fuer den Bildschirm reicht die sprechbare Schreibweise ("Gaeste") - auf
// einem Blatt, das beim WIRT landet, sieht sie nach Nachlaessigkeit aus.
// Deshalb hier eine Wortliste statt blindem Ersetzen: "ae" pauschal zu "ä"
// zu machen wuerde aus Michael einen Michäl.
const SCHOEN = [
  ['Gaeste', 'Gäste'], ['Rueckrufwuensche', 'Rückrufwünsche'], ['Rueckrufe', 'Rückrufe'],
  ['geschaetzt', 'geschätzt'], ['Geschaetzt', 'Geschätzt'], ['waere', 'wäre'],
  ['ueber', 'über'], ['Ueber', 'Über'], ['Maerz', 'März'], ['naechsten', 'nächsten'],
  ['Kuendigung', 'Kündigung'], ['fuer', 'für'], ['Fuer', 'Für']
];

function schoen(text) {
  let t = String(text || '');
  for (const [roh, gut] of SCHOEN) t = t.split(roh).join(gut);
  // Auf einem Blatt gehoert ein Gedankenstrich hin, kein Bindestrich.
  t = t.replace(/ - /g, ' \u2014 ');
  return t;
}

function alsText(b) {
  if (!b) return 'Zu diesem Kunden finde ich keine Report-Daten.';
  return ['Beweis-Zettel ' + b.name + ' - ' + b.monatWort, ''].concat(saetze(b)).join('\n');
}

// Ein Blatt, das man einem Wirt in die Hand druecken kann.
//
// Gestalterisch drei Entscheidungen:
//   1. EINE Zahl ist der Held - der gerettete Umsatz. Alles andere ordnet
//      sich unter. Ein Blatt mit fuenf gleich grossen Zahlen sagt nichts.
//   2. Viel Weissraum, eine Akzentfarbe, ruhige Typo. Es soll nach
//      Rechenschaft aussehen, nicht nach Werbung.
//   3. Fuer A4 gebaut: nichts bricht mitten in einer Kachel um.
function alsHtml(b) {
  if (!b) return '<p>Keine Daten.</p>';

  const zahl = (n) => Number(n).toLocaleString('de-DE');
  const kachel = (wert, wozu) =>
    '<div class="kachel"><div class="wert">' + wert + '</div><div class="wozu">' + wozu + '</div></div>';

  const kacheln = [];
  if (b.telefon.reservierungen) kacheln.push(kachel(zahl(b.telefon.reservierungen), 'Reservierungen<br>am Telefon'));
  if (b.telefon.gaeste) kacheln.push(kachel(zahl(b.telefon.gaeste), 'Gäste'));
  if (b.telefon.bestellungen) kacheln.push(kachel(zahl(b.telefon.bestellungen), 'Bestellungen'));
  if (b.telefon.rueckrufe) kacheln.push(kachel(zahl(b.telefon.rueckrufe), 'Rückruf&shy;wünsche'));

  // Die Sichtbarkeit bekommt eine eigene Zeile mit Richtung - eine Zahl
  // ohne Vergleich ist keine Aussage.
  let sicht = '';
  if (typeof b.quote.jetzt === 'number') {
    const alt = b.quote.vorDrei;
    const diff = typeof alt === 'number' ? b.quote.jetzt - alt : null;
    const pfeil = diff === null ? '' :
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + (diff >= 0 ? '0' : '90') + 'deg)">' +
      '<path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    sicht =
      '<div class="sicht' + (diff !== null && diff < 0 ? ' runter' : '') + '">' +
        '<div class="sichtZahl">' + b.quote.jetzt + '<span>%</span></div>' +
        '<div class="sichtText"><strong>Sichtbarkeit in KI-Antworten</strong>' +
          (diff === null ? '' :
            '<div class="trend">' + pfeil + (diff >= 0 ? '+' : '') + diff +
            ' Punkte seit ' + monatWort(b.quote.vorDreiMonat) + '</div>') +
        '</div>' +
      '</div>';
  }

  const held = b.geschaetzterWert > 0 ? `
  <div class="held">
    <div class="heldLabel">Geschätzter Umsatz aus diesen Anrufen</div>
    <div class="heldZahl">${zahl(b.geschaetzterWert)}<span>&thinsp;€</span></div>
    <div class="heldFuss">Gerechnet mit ${zahl(b.gastWert)}&thinsp;€ pro Gast — eine Annahme, keine Messung.</div>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${b.name} · ${b.monatWort}</title>
<style>
  :root {
    --tinte: #0e1116;
    --leise: #6b7280;
    --linie: #e7e9ee;
    --akzent: #007AFF;
    --flaeche: #f6f7f9;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    color: var(--tinte); margin: 0; padding: 56px 56px 40px;
    -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums;
  }
  .blatt { max-width: 720px; margin: 0 auto; }

  .marke {
    font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--leise); margin-bottom: 40px;
  }
  h1 {
    font-size: 34px; line-height: 1.15; letter-spacing: -0.025em;
    font-weight: 640; margin: 0 0 6px;
  }
  .unterzeile { color: var(--leise); font-size: 16px; margin-bottom: 40px; }

  .held {
    border-top: 2px solid var(--tinte); padding: 24px 0 28px; margin-bottom: 36px;
    break-inside: avoid;
  }
  .heldLabel { font-size: 14px; color: var(--leise); margin-bottom: 6px; }
  .heldZahl {
    font-size: 68px; line-height: 1; letter-spacing: -0.035em; font-weight: 660;
  }
  .heldZahl span { font-size: 34px; font-weight: 500; color: var(--leise); }
  .heldFuss { font-size: 12.5px; color: var(--leise); margin-top: 12px; }

  .kacheln { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
    background: var(--linie); border: 1px solid var(--linie); border-radius: 14px;
    overflow: hidden; margin-bottom: 32px; break-inside: avoid; }
  .kachel { background: #fff; padding: 20px 18px 18px; }
  .wert { font-size: 30px; font-weight: 620; letter-spacing: -0.02em; line-height: 1.1; }
  .wozu { font-size: 12.5px; color: var(--leise); margin-top: 6px; line-height: 1.35; }

  .sicht {
    display: flex; align-items: center; gap: 20px;
    background: var(--flaeche); border-radius: 14px; padding: 20px 24px;
    margin-bottom: 32px; break-inside: avoid;
  }
  .sichtZahl { font-size: 40px; font-weight: 640; letter-spacing: -0.03em; color: var(--akzent); }
  .sichtZahl span { font-size: 22px; font-weight: 500; }
  .sicht.runter .sichtZahl, .sicht.runter .trend { color: #FF3B30; }
  .sichtText strong { display: block; font-size: 15px; font-weight: 600; }
  .trend { display: flex; align-items: center; gap: 5px; margin-top: 4px;
    font-size: 13.5px; color: #1f9d55; font-weight: 550; }

  .text { line-height: 1.65; font-size: 15.5px; color: #2b3038; }
  .text p { margin: 0 0 14px; }

  .fuss {
    margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--linie);
    color: var(--leise); font-size: 12px; line-height: 1.6;
    display: flex; justify-content: space-between; gap: 20px;
  }
  @page { size: A4; margin: 16mm; }
  @media print { body { padding: 0; } .kacheln { border-radius: 0; } }
  @media (max-width: 640px) {
    body { padding: 28px 20px; }
    .kacheln { grid-template-columns: repeat(2, 1fr); }
    .heldZahl { font-size: 52px; }
  }
</style></head><body>
<div class="blatt">
  <div class="marke">Kurani Design</div>
  <h1>Was Ihr Geld gebracht hat</h1>
  <div class="unterzeile">${b.name} · ${b.monatWort}</div>
  ${held}
  ${kacheln.length ? '<div class="kacheln">' + kacheln.join('') + '</div>' : ''}
  ${sicht}
  <div class="text"><p>${saetze(b)
    .filter((z) => !(b.geschaetzterWert > 0 && /geschaetzt rund/.test(z)))
    .map(schoen).join('</p><p>')}</p></div>
  <div class="fuss">
    <span>Kurani Design · Ostfriesland</span>
    <span>Erstellt am ${new Date().toLocaleDateString('de-DE')} · Zahlen aus dem Monats-Report,
    fehlende Angaben werden weggelassen statt geschätzt.</span>
  </div>
</div>
</body></html>`;
}

// Fuer alle Kunden auf einmal (Monatslauf).
function fuerAlle() {
  return agentur.kundenSlugs().map(fuerKunden).filter(Boolean);
}

// Wo landen die Zettel?
function schreibe(b, ordner) {
  const ziel = ordner || path.join(__dirname, '..', 'beweise');
  fs.mkdirSync(ziel, { recursive: true });
  const datei = path.join(ziel, b.slug + '-' + b.monat + '.html');
  fs.writeFileSync(datei, alsHtml(b));
  return datei;
}

module.exports = { fuerKunden, fuerAlle, saetze, alsText, alsHtml, schreibe, monatWort, euro, gastWert, schoen };
