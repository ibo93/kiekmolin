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
  return t;
}

function alsText(b) {
  if (!b) return 'Zu diesem Kunden finde ich keine Report-Daten.';
  return ['Beweis-Zettel ' + b.name + ' - ' + b.monatWort, ''].concat(saetze(b)).join('\n');
}

// Ein Blatt zum Ausdrucken oder als PDF verschicken. Bewusst nuechtern:
// grosse Zahlen, wenig Text, nichts zu klicken.
function alsHtml(b) {
  if (!b) return '<p>Keine Daten.</p>';
  const kachel = (zahl, wozu) => '<div class="k"><div class="z">' + zahl + '</div><div class="w">' + wozu + '</div></div>';

  const kacheln = [];
  if (b.telefon.reservierungen) kacheln.push(kachel(b.telefon.reservierungen, 'Reservierungen am Telefon'));
  if (b.telefon.gaeste) kacheln.push(kachel(b.telefon.gaeste, 'Gäste'));
  if (b.telefon.bestellungen) kacheln.push(kachel(b.telefon.bestellungen, 'Bestellungen'));
  if (b.telefon.rueckrufe) kacheln.push(kachel(b.telefon.rueckrufe, 'Rückrufwünsche'));
  if (typeof b.quote.jetzt === 'number') kacheln.push(kachel(b.quote.jetzt + '%', 'Sichtbarkeit in der KI'));

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<title>Beweis-Zettel ${b.name} - ${b.monatWort}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #10131a; margin: 0; padding: 48px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .monat { color: #5c6472; margin-bottom: 32px; }
  .kacheln { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 32px; }
  .k { border: 1px solid #e3e7ee; border-radius: 16px; padding: 20px 24px; min-width: 150px; }
  .z { font-size: 34px; font-weight: 650; letter-spacing: -0.02em; }
  .w { color: #5c6472; font-size: 14px; margin-top: 4px; }
  .wert { background: #f4f6f9; border-radius: 16px; padding: 20px 24px; margin-bottom: 24px; }
  .wert b { font-size: 22px; }
  p { line-height: 1.6; max-width: 640px; }
  .fuss { color: #5c6472; font-size: 12.5px; margin-top: 40px; border-top: 1px solid #e3e7ee; padding-top: 16px; }
  @media print { body { padding: 24px; } }
</style></head><body>
<h1>Was Ihr Geld gebracht hat</h1>
<div class="monat">${b.name} · ${b.monatWort}</div>
<div class="kacheln">${kacheln.join('')}</div>
${b.geschaetzterWert > 0 ? `<div class="wert">Geschätzter Umsatz aus diesen Anrufen: <b>${euro(b.geschaetzterWert)}</b><br>
<span style="color:#5c6472;font-size:13px">Gerechnet mit ${euro(b.gastWert)} pro Gast — eine Annahme, keine Messung.</span></div>` : ''}
<p>${saetze(b).map(schoen).join('<br><br>')}</p>
<div class="fuss">Kurani Design · Erstellt am ${new Date().toLocaleDateString('de-DE')} ·
Zahlen aus dem Monats-Report. Fehlende Angaben werden nicht geschätzt, sondern weggelassen.</div>
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
