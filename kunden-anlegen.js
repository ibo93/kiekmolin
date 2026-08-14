#!/usr/bin/env node
'use strict';

// KURANI · Kunde anlegen aus der Webseite
//   node kunden-anlegen.js https://pizzeria-beispiel.de
//
// Holt die Webseite (und die Speisekarten-Unterseiten), laesst die KI die
// Stammdaten und Gerichte rausziehen, zeigt dir das Ergebnis und legt nach
// deiner Bestaetigung telefon-retter/kunden/<name>.json an.
//
// Danach nur noch die Zeile fuer nummern.json einfuegen - fertig ist ein
// Telefon-Retter-Kunde OHNE Kiek mol in.
//
// EHRLICH: Der Import ist ein Vorschlag. Was die Webseite nicht hergibt
// (Preise als Bild, PDF-Karte), sagt das Skript ausdruecklich - dann
// ergaenzt du es von Hand, statt dass die KI am Telefon raet.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

require('./telefon-retter/lib/env').ladeEnv();
require('./sichtbarkeit/lib/env').ladeEnv(); // dort liegt oft der Anthropic-Key

const {
  textAusHtml, findeSpeisekartenLinks, baueImportPrompt, parseImportAntwort, slugAusName
} = require('./telefon-retter/lib/webseite-import');

const KUNDEN_ORDNER = path.join(__dirname, 'telefon-retter', 'kunden');
const MAX_TEXT = 60000; // reicht fuer eine grosse Karte, bleibt bezahlbar

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const zeilenPuffer = [];
let zeilenWarter = null;
let eingabeZu = false;
rl.on('line', (z) => {
  if (zeilenWarter) { const w = zeilenWarter; zeilenWarter = null; w(z.trim()); }
  else zeilenPuffer.push(z.trim());
});
rl.on('close', () => {
  eingabeZu = true;
  if (zeilenWarter) { const w = zeilenWarter; zeilenWarter = null; w(''); }
});
function frage(text) {
  return new Promise((r) => {
    process.stdout.write(text);
    if (zeilenPuffer.length) r(zeilenPuffer.shift());
    else if (eingabeZu) r('');
    else zeilenWarter = r;
  });
}

async function holeSeite(url) {
  const antwort = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (kompatibel; KURANI-Import)' },
    signal: AbortSignal.timeout(20000),
    redirect: 'follow'
  });
  if (!antwort.ok) throw new Error('Seite antwortet mit ' + antwort.status);
  return antwort.text();
}

async function frageKi(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY fehlt - erst "node schluessel-einrichten.js" (Schritt 1)');
  const antwort = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODELL || 'claude-sonnet-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!antwort.ok) {
    throw new Error('Anthropic ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
  }
  const daten = await antwort.json();
  return (daten.content || []).filter((t) => t.type === 'text').map((t) => t.text).join('');
}

function euro(n) {
  return n == null ? '—' : Number(n).toFixed(2).replace('.', ',') + ' €';
}

(async () => {
  console.log('\n=== KURANI · Kunde aus Webseite anlegen ===');

  let url = process.argv[2] || await frage('Webseite des Betriebs (z.B. https://pizzeria-beispiel.de): ');
  if (!url) { console.log('Ohne Adresse geht es nicht. Abbruch.'); rl.close(); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  // 1. Startseite holen
  process.stdout.write('1/4  Hole ' + url + ' ... ');
  let html;
  try {
    html = await holeSeite(url);
    console.log('ok ✓ (' + Math.round(html.length / 1024) + ' KB)');
  } catch (e) {
    console.log('FEHLER');
    console.log('     -> ' + e.message);
    console.log('     -> Adresse pruefen (mit https://) oder Kundendatei von Hand anlegen:');
    console.log('        cp telefon-retter/kunden/beispiel.json.example telefon-retter/kunden/name.json');
    rl.close();
    return;
  }

  // 2. Speisekarten-Unterseiten dazu
  const links = findeSpeisekartenLinks(html, url);
  let text = textAusHtml(html);
  if (links.length) {
    console.log('2/4  Speisekarten-Seiten gefunden: ' + links.length);
    for (const link of links) {
      process.stdout.write('     ' + link + ' ... ');
      try {
        const unterseite = await holeSeite(link);
        text += '\n\n--- ' + link + ' ---\n' + textAusHtml(unterseite);
        console.log('ok ✓');
      } catch (e) {
        console.log('uebersprungen (' + e.message + ')');
      }
    }
  } else {
    console.log('2/4  Keine eigene Speisekarten-Seite gefunden - nutze die Startseite.');
  }
  if (text.length > MAX_TEXT) {
    text = text.slice(0, MAX_TEXT);
    console.log('     (Text gekuerzt - sehr lange Seite)');
  }

  // 3. KI zerlegt den Text
  process.stdout.write('3/4  Lasse die KI Stammdaten und Speisekarte rausziehen... ');
  let ergebnis;
  try {
    ergebnis = parseImportAntwort(await frageKi(baueImportPrompt(text, url)));
    console.log('ok ✓');
  } catch (e) {
    console.log('FEHLER');
    console.log('     -> ' + e.message);
    rl.close();
    return;
  }

  // 4. Zeigen, was gefunden wurde - und ehrlich, was fehlt
  const k = ergebnis.kunde;
  console.log('\n--- GEFUNDEN ---');
  console.log('  Name:       ' + k.name);
  console.log('  Ort:        ' + [k.adresse, k.plz, k.stadt].filter(Boolean).join(', ') || '—');
  console.log('  Telefon:    ' + (k.telefon || '—'));
  console.log('  Geoeffnet:  ' + (k.oeffnet && k.schliesst ? k.oeffnet + ' bis ' + k.schliesst : '—'));
  if (k.liefergebuehr) console.log('  Lieferung:  ' + euro(k.liefergebuehr));
  console.log('  Gerichte:   ' + k.speisekarte.length);
  for (const g of k.speisekarte.slice(0, 12)) {
    console.log('     ' + euro(g.preis).padStart(9) + '  ' + g.name + (g.kategorie ? '  [' + g.kategorie + ']' : ''));
  }
  if (k.speisekarte.length > 12) console.log('     ... und ' + (k.speisekarte.length - 12) + ' weitere');

  if (ergebnis.unklar.length) {
    console.log('\n--- BITTE PRUEFEN ---');
    for (const u of ergebnis.unklar) console.log('  ! ' + u);
  }

  // 5. Wohin sollen die Bestellungen gemeldet werden? Ohne das nuetzt alles nichts.
  console.log('\n--- WOHIN MIT DEN BESTELLUNGEN? ---');
  console.log('    Der Wirt hat keine Kiek-mol-in-App - er muss SOFORT Bescheid bekommen.');
  const sms = await frage('    Handynummer des Wirts fuer SMS (+49..., Enter = keine): ');
  const email = await frage('    E-Mail des Wirts (Enter = keine): ');
  if (!sms && !email) {
    console.log('    ACHTUNG: Ohne Meldeweg erfaehrt der Wirt NICHTS von seinen Anrufen.');
    console.log('    Du kannst "melden" spaeter in der Datei ergaenzen - vor dem Scharfschalten unbedingt!');
  }
  const tische = await frage('    Anzahl Tische (fuer Reservierungen, Enter = 8): ');

  const datensatz = Object.assign({}, k, {
    webseite: url,
    tische: parseInt(tische, 10) > 0 ? parseInt(tische, 10) : 8,
    melden: {
      sms: sms || undefined,
      email: email && email.includes('@') ? email : undefined
    },
    _quelle: 'Automatisch von ' + url + ' eingelesen am ' + new Date().toISOString().slice(0, 10) +
      ' - Preise und Oeffnungszeiten bitte gegenpruefen.'
  });

  const slug = slugAusName(k.name);
  const ziel = path.join(KUNDEN_ORDNER, slug + '.json');
  if (fs.existsSync(ziel)) {
    const ueber = await frage('\n    ' + slug + '.json gibt es schon. Ueberschreiben? (j/n): ');
    if (!ueber.toLowerCase().startsWith('j')) { console.log('    Abgebrochen, nichts geaendert.'); rl.close(); return; }
  }
  fs.mkdirSync(KUNDEN_ORDNER, { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(datensatz, null, 2) + '\n');
  console.log('\n4/4  GESPEICHERT: telefon-retter/kunden/' + slug + '.json  ✓');

  console.log('\n=== SO SCHALTEST DU IHN SCHARF ===');
  console.log('  1. Datei durchsehen und Preise gegenpruefen:');
  console.log('       open telefon-retter/kunden/' + slug + '.json');
  console.log('  2. Twilio-Nummer holen und diese Zeile in telefon-retter/nummern.json eintragen:');
  console.log('       "+49DEINE_TWILIO_NUMMER": { "datei": "kunden/' + slug + '.json", "kann": ["bestellung"] }');
  console.log('     ("kann": ["reservierung"] wenn er nur Tische will, beides zusammen geht auch)');
  console.log('  3. Telefon-Retter neu starten:  cd telefon-retter && node server.js');
  console.log('  4. Der Wirt richtet die Rufumleitung auf die Twilio-Nummer ein.');

  rl.close();
})().catch((e) => { console.log('\nFEHLER: ' + e.message); rl.close(); });
