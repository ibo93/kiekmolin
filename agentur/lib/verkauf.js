'use strict';

// Verkaufs-Leitfaden: eine ausdruckbare Seite, die Ibo Schritt fuer Schritt
// durchs Erstgespraech fuehrt - was zeigen, was sagen, wie auf Einwaende
// reagieren. Nutzt die App-Werkzeuge in der richtigen Reihenfolge und bleibt
// ehrlich (keine Platz-1-Versprechen, keine Loesch-Garantie).
//
// Personalisiert auf den konkreten Betrieb, damit Ibo mit Namen und echten
// Zahlen ins Gespraech geht.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// kontext: { quoteProzent, kiKonkurrenz: [{name,anzahl}], telefonUmsatz }
function baueVerkaufHtml(kunde, kontext) {
  const o = kontext || {};
  const name = esc(kunde.name || 'der Betrieb');
  const stadt = esc(kunde.city || kunde.stadt || 'eurer Region');
  const akzent = process.env.AKZENT_FARBE || '#f59e0b';
  const kontakt = esc('KURANI · Bahnhofstr. 2 · 26506 Norden · kuranidesign.de');

  const konkurrenz = (o.kiKonkurrenz || []).slice(0, 3).map((k) => k.name);
  const konkurrenzSatz = konkurrenz.length
    ? 'Die KI empfiehlt in ' + stadt + ' gerade vor allem: <b>' + konkurrenz.map(esc).join(', ') + '</b> – ' + name + ' aber (noch) nicht.'
    : 'Wir messen jeden Monat, welche Restaurants die KI in ' + stadt + ' empfiehlt – und arbeiten daran, dass ' + name + ' dazugehört.';
  const quoteSatz = (o.quoteProzent != null)
    ? 'Aktuell wird ' + name + ' bei <b>' + o.quoteProzent + '%</b> der Testfragen gefunden. Genau diese Zahl heben wir Monat für Monat.'
    : 'Im ersten Monats-Report messen wir die Ausgangslage – ab dann zeigt jede Kurve, wohin es geht.';

  const schritte = [
    {
      n: 'Einstieg (30 Sek.)',
      titel: 'Die Frage, die sitzt',
      text: '„Haben Sie schon mal Ihr Handy gefragt: <i>Welches Restaurant in ' + stadt + ' kannst du empfehlen?</i> – und geschaut, ob <b>' + name + '</b> genannt wird?" Kurze Pause. Meistens: nein. Genau da setzen wir an.'
    },
    {
      n: 'Zeigen 1 (2 Min.)',
      titel: 'Der Beweis – Konkurrenz-Liste',
      text: konkurrenzSatz + ' Zeig die Liste am Laptop. Das erzeugt den „Aha, ich verliere Gäste an die"-Moment – ohne Druck, nur Fakten.'
    },
    {
      n: 'Zeigen 2 (3 Min.)',
      titel: 'Der Wow-Moment – Anruf-Demo',
      text: 'Öffne die Anruf-Demo und sag: „Sprechen Sie einfach – das ist Ihre echte Speisekarte." Lass den Wirt selbst mit der KI reden (Tisch reservieren, nach einem Gericht fragen). Nichts überzeugt mehr, als es selbst zu erleben.'
    },
    {
      n: 'Zeigen 3 (1 Min.)',
      titel: 'Der Report',
      text: quoteSatz + ' „Diesen Report bekommen Sie jeden Monat – schwarz auf weiß, was sich bewegt. Keine leeren Versprechen."'
    },
    {
      n: 'Angebot (2 Min.)',
      titel: 'Das Angebot auf den Tisch',
      text: 'Leg die ausgedruckte Angebots-Seite hin. Erklär die drei Bausteine in einem Satz jeder. Dann still sein und den Wirt schauen lassen. Wer zuerst redet, verliert.'
    },
    {
      n: 'Abschluss',
      titel: 'Der einfache nächste Schritt',
      text: '„Wir fangen mit einem Monat an – Sie müssen nichts installieren, ich richte alles ein. Wenn Sie nach dem ersten Report nicht überzeugt sind, hören wir auf. Fair?" Klein anfangen senkt die Hürde.'
    }
  ];

  const einwaende = [
    { e: '„Das ist mir zu teuer."', a: '„Verstehe ich. Rechnen wir kurz: Ein einziger geretteter Tisch pro Woche zahlt das Paket. Der Telefon-Retter fängt genau die Anrufe, die Sie heute verpassen."' },
    { e: '„Ich hab keine Zeit dafür."', a: '„Genau deshalb bin ich da – Sie müssen nichts tun. Ich richte alles ein, ich kümmere mich monatlich. Sie bekommen nur den Report."' },
    { e: '„Können Sie mich auf Platz 1 bei Google bringen?"', a: '„Nein – und wer das verspricht, lügt. Ich sorge dafür, dass Sie überall stehen, wo Google und die KI lesen, und beweise jeden Monat, was sich bewegt. Ehrliche Arbeit statt leerer Versprechen."' },
    { e: '„Können Sie schlechte Bewertungen löschen?"', a: '„Keine Garantie – das kann niemand seriös. Aber: Was gegen Google-Regeln verstößt, melde ich mit der richtigen Begründung. Auf alles andere antworte ich so professionell, dass es neue Gäste sogar überzeugt."' },
    { e: '„Ich überleg es mir."', a: '„Klar. Sollen wir einfach mit einem Monat starten? Wenn der erste Report Sie nicht überzeugt, sind Sie raus – ohne Bindung. So sehen Sie es, statt es sich vorzustellen."' }
  ];

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Verkaufs-Leitfaden · ${name}</title>
<style>
  :root { --akzent: ${akzent}; --tinte: #111; --grau: #666; --linie: #e2e2e2; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--tinte);
         max-width: 780px; margin: 0 auto; padding: 44px 30px; line-height: 1.5; }
  header { border-bottom: 3px solid var(--tinte); padding-bottom: 16px; margin-bottom: 24px; }
  .marke { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: var(--grau); }
  h1 { font-size: 26px; margin: 8px 0 2px; }
  .unterzeile { color: var(--grau); font-size: 14px; }
  h2 { font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase; margin: 28px 0 12px;
       border-left: 4px solid var(--akzent); padding-left: 10px; }
  .schritt { display: flex; gap: 14px; margin-bottom: 14px; align-items: flex-start; }
  .schritt .n { flex: none; width: 88px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
                color: var(--akzent); font-weight: 700; padding-top: 2px; }
  .schritt .k b { display: block; margin-bottom: 3px; font-size: 15px; }
  .schritt .k span { font-size: 13.5px; color: #333; }
  .einwand { border: 1px solid var(--linie); border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
  .einwand .frage { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
  .einwand .antwort { font-size: 13.5px; color: #333; }
  .merke { background: #fafafa; border: 1px solid var(--linie); border-radius: 8px; padding: 14px 18px;
           font-size: 13.5px; margin-top: 18px; }
  footer { margin-top: 24px; font-size: 12px; color: var(--grau); border-top: 1px solid var(--linie); padding-top: 12px; }
  @media print { body { padding: 0; } .schritt, .einwand { break-inside: avoid; } }
</style>
</head>
<body>
<header>
  <div class="marke">Kurani · Verkaufs-Leitfaden (nur für dich)</div>
  <h1>Erstgespräch: ${name}</h1>
  <div class="unterzeile">${stadt} · dein roter Faden fürs Gespräch – ca. 10 Minuten</div>
</header>

<h2>Der Ablauf – Schritt für Schritt</h2>
${schritte.map((s) => '<div class="schritt"><div class="n">' + esc(s.n) + '</div><div class="k"><b>' + esc(s.titel) + '</b><span>' + s.text + '</span></div></div>').join('\n')}

<h2>Wenn Einwände kommen</h2>
${einwaende.map((x) => '<div class="einwand"><div class="frage">' + esc(x.e) + '</div><div class="antwort">' + esc(x.a) + '</div></div>').join('\n')}

<div class="merke"><b>Merke:</b> Du verkaufst keine Technik – du verkaufst <b>mehr Gäste und weniger Sorgen</b>. Zeig, statt zu erklären (Demo!). Bleib ehrlich – das unterscheidet dich von jeder Abzocker-Agentur. Und: Klein anfangen, ein Monat, keine Bindung. Der erste zufriedene Kunde bringt dir den zweiten.</div>

<footer>${kontakt}</footer>
</body>
</html>`;
}

module.exports = { baueVerkaufHtml };
