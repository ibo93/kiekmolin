'use strict';

// Oeffentliche Landingpage: der kostenlose "KI-Sichtbarkeits-Check" als
// Lead-Koeder. Ein Restaurant-Inhaber liest, versteht sofort das Problem
// ("wirst du von der KI empfohlen?") und traegt seinen Betrieb + Kontakt
// ein - und wird so zum Inbound-Lead.
//
// Ehrlich bleibt ehrlich: kein "Platz 1"-Versprechen, echter Nutzen im
// Vordergrund. Die Seite ist bewusst schlicht, laedt schnell, funktioniert
// am Handy - denn Wirte schauen unterwegs.

function baueLandingHtml() {
  const akzent = process.env.AKZENT_FARBE || '#f59e0b';
  const marke = process.env.AGENTUR_MARKE || 'Kurani';
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wirst du von der KI empfohlen? · Kostenloser Sichtbarkeits-Check</title>
<meta name="description" content="Kostenloser Check: Wird dein Restaurant von Google und KI-Assistenten wie ChatGPT empfohlen? Ehrliche Analyse, kein Risiko.">
<style>
  :root { --akzent: ${akzent}; --tinte: #14110d; --grau: #6b6459; --bg: #faf8f4; --linie: #e7e2d8; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--tinte);
         background: var(--bg); line-height: 1.55; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 40px 22px 60px; }
  .marke { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: var(--grau); }
  h1 { font-size: 30px; line-height: 1.2; margin: 12px 0 10px; }
  h1 b { color: var(--akzent); }
  .sub { font-size: 17px; color: #40382e; margin-bottom: 26px; }
  .karte { background: #fff; border: 1px solid var(--linie); border-radius: 14px; padding: 22px; margin-bottom: 18px;
           box-shadow: 0 6px 24px rgba(0,0,0,.05); }
  .frage { font-size: 15px; margin: 0 0 14px; }
  .frage b { color: var(--akzent); }
  label { display: block; font-size: 13px; font-weight: 700; margin: 12px 0 4px; }
  input, textarea { width: 100%; padding: 12px 14px; font-size: 15px; border: 1px solid var(--linie);
                    border-radius: 10px; font-family: inherit; background: #fff; }
  input:focus, textarea:focus { outline: none; border-color: var(--akzent); }
  button { width: 100%; margin-top: 18px; padding: 15px; font-size: 16px; font-weight: 700; color: #fff;
           background: var(--akzent); border: none; border-radius: 10px; cursor: pointer; }
  button:disabled { opacity: .6; }
  .klein { font-size: 12.5px; color: var(--grau); margin-top: 12px; }
  .punkte { list-style: none; padding: 0; margin: 0 0 8px; }
  .punkte li { padding: 7px 0 7px 26px; position: relative; font-size: 14.5px; }
  .punkte li::before { content: '✓'; position: absolute; left: 0; color: var(--akzent); font-weight: 700; }
  .danke { display: none; text-align: center; padding: 20px 0; }
  .danke h2 { color: var(--akzent); }
  footer { text-align: center; font-size: 12px; color: var(--grau); margin-top: 30px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="marke">${marke} · für Restaurants</div>
  <h1>Fragt heute jemand die KI nach einem Restaurant – <b>wirst du empfohlen?</b></h1>
  <div class="sub">Immer mehr Gäste fragen ChatGPT, Google & Co.: „Wo essen in meiner Stadt?" Wir prüfen kostenlos, ob dein Betrieb dabei genannt wird – und was du dagegen tun kannst.</div>

  <div class="karte" id="formKarte">
    <p class="frage">Kostenloser <b>KI-Sichtbarkeits-Check</b> für deinen Betrieb:</p>
    <ul class="punkte">
      <li>Wirst du von Google und KI-Assistenten empfohlen?</li>
      <li>Welche Konkurrenz steht vor dir?</li>
      <li>Ehrliche Einschätzung – kein „Platz 1"-Versprechen, kein Risiko.</li>
    </ul>
    <form id="leadForm" onsubmit="return absenden(event)">
      <label>Name deines Restaurants *</label>
      <input name="restaurant" required placeholder="z. B. Greetsieler Börse">
      <label>Ort</label>
      <input name="ort" placeholder="z. B. Greetsiel">
      <label>Dein Name</label>
      <input name="name" placeholder="Vor- und Nachname">
      <label>Wie erreichen wir dich? * (Telefon oder E-Mail)</label>
      <input name="kontakt" required placeholder="Telefon oder E-Mail">
      <label>Nachricht (optional)</label>
      <textarea name="nachricht" rows="2" placeholder="Worum geht's dir konkret?"></textarea>
      <button type="submit" id="btn">Kostenlosen Check anfordern</button>
      <div class="klein">Kostenlos & unverbindlich. Wir melden uns mit deinem persönlichen Check. Kein Spam.</div>
    </form>
  </div>

  <div class="karte danke" id="danke">
    <h2>Danke! 🎉</h2>
    <p>Wir schauen uns deinen Betrieb an und melden uns in Kürze mit deinem persönlichen Sichtbarkeits-Check.</p>
  </div>

  <footer>${marke} Design · Bahnhofstr. 2 · 26506 Norden</footer>
</div>
<script>
async function absenden(e) {
  e.preventDefault();
  var btn = document.getElementById('btn');
  btn.disabled = true; btn.textContent = 'Wird gesendet…';
  var f = e.target;
  var daten = {
    restaurant: f.restaurant.value, ort: f.ort.value, name: f.name.value,
    kontakt: f.kontakt.value, nachricht: f.nachricht.value
  };
  try {
    var r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten) });
    if (!r.ok) throw new Error();
    document.getElementById('formKarte').style.display = 'none';
    document.getElementById('danke').style.display = 'block';
    window.scrollTo(0, 0);
  } catch (_e) {
    btn.disabled = false; btn.textContent = 'Nochmal versuchen';
  }
  return false;
}
</script>
</body>
</html>`;
}

module.exports = { baueLandingHtml };
