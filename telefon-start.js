#!/usr/bin/env node
'use strict';

// KURANI · Telefon-Start
//   node telefon-start.js
//
// Verbindet den Telefon-Retter mit einer echten Twilio-Nummer - ohne
// Console-Geklicke: prueft das Konto, holt bei Bedarf eine kostenlose
// Test-Nummer, verbindet sie mit dem Server (Webhook) und speichert die
// oeffentliche Adresse (BASE_URL) in telefon-retter/.env.
//
// Voraussetzung: TWILIO_ACCOUNT_SID plus ENTWEDER Auth Token ODER
// API Key + Secret (macht "node schluessel-einrichten.js", Schritt 4).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

require('./telefon-retter/lib/env').ladeEnv();

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

const twilioAuth = require('./telefon-retter/lib/twilio-auth');
const SID = twilioAuth.kontoSid();

async function twilio(pfad, methode, formDaten) {
  const optionen = {
    method: methode || 'GET',
    headers: { Authorization: twilioAuth.authKopf() },
    signal: AbortSignal.timeout(25000)
  };
  if (formDaten) {
    optionen.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    optionen.body = new URLSearchParams(formDaten).toString();
  }
  const antwort = await fetch(twilioAuth.kontoUrl(pfad), optionen);
  const daten = await antwort.json().catch(() => ({}));
  return { ok: antwort.ok, status: antwort.status, daten };
}

function schreibeEnvWert(name, wert) {
  const ziel = path.join(__dirname, 'telefon-retter', '.env');
  let inhalt = fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : '';
  if (new RegExp('^' + name + '=.*$', 'm').test(inhalt)) {
    inhalt = inhalt.replace(new RegExp('^' + name + '=.*$', 'm'), name + '=' + wert);
  } else {
    inhalt += (inhalt.endsWith('\n') || !inhalt ? '' : '\n') + name + '=' + wert + '\n';
  }
  fs.writeFileSync(ziel, inhalt);
  console.log('   GESPEICHERT (' + name + ' in telefon-retter/.env)  ✓');
}

(async () => {
  console.log('\n=== KURANI · Telefon-Start ===');
  console.log('Verbindet den Telefon-Retter mit deiner Twilio-Nummer.\n');

  // 1. Zugangsdaten pruefen
  if (!twilioAuth.istKonfiguriert()) {
    console.log('Es fehlen die Twilio-Zugangsdaten.');
    console.log('Du brauchst die Account SID plus ENTWEDER den Auth Token ODER einen API Key + Secret.');
    console.log('-> Erst "node schluessel-einrichten.js" ausfuehren (Schritt 4), dann hier weiter.');
    rl.close();
    return;
  }
  process.stdout.write('1/4  Pruefe Twilio-Konto (' + twilioAuth.beschreibung() + ')... ');
  const konto = await twilio('.json');
  if (!konto.ok) {
    console.log('FEHLER ' + konto.status + ' - die Zugangsdaten stimmen nicht. "node schluessel-einrichten.js" (Schritt 4) wiederholen.');
    rl.close();
    return;
  }
  const istTestKonto = (konto.daten.type || '').toLowerCase() === 'trial';
  console.log('ok ✓  (' + (konto.daten.friendly_name || 'Konto') + (istTestKonto ? ', Testversion' : '') + ')');

  // 2. Nummer finden oder holen
  process.stdout.write('2/4  Suche deine Twilio-Nummern... ');
  const vorhandene = await twilio('/IncomingPhoneNumbers.json?PageSize=20');
  let nummern = (vorhandene.daten.incoming_phone_numbers || []);
  console.log(nummern.length + ' gefunden.');

  if (!nummern.length) {
    const holen = await frage('     Noch keine Nummer. Kostenlose Test-Nummer (USA) jetzt automatisch holen? (j/n): ');
    if (holen.toLowerCase().startsWith('j')) {
      process.stdout.write('     Suche freie Nummer... ');
      const frei = await twilio('/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&PageSize=1');
      const kandidat = (frei.daten.available_phone_numbers || [])[0];
      if (!kandidat) {
        console.log('keine gefunden - bitte in der Twilio-Console eine Nummer holen (Phone Numbers -> Buy a Number).');
      } else {
        process.stdout.write(kandidat.phone_number + ' - hole... ');
        const kauf = await twilio('/IncomingPhoneNumbers.json', 'POST', { PhoneNumber: kandidat.phone_number });
        if (kauf.ok) {
          console.log('ok ✓');
          nummern = [kauf.daten];
        } else {
          console.log('FEHLER ' + kauf.status + ': ' + JSON.stringify(kauf.daten).slice(0, 200));
          console.log('     -> Dann bitte einmal in der Console holen: Phone Numbers -> Buy a Number.');
        }
      }
    }
  }
  if (!nummern.length) { console.log('\nOhne Nummer geht es nicht weiter - spaeter einfach nochmal starten.'); rl.close(); return; }

  let nummer = nummern[0];
  if (nummern.length > 1) {
    console.log('     Deine Nummern:');
    nummern.forEach((n, i) => console.log('       ' + (i + 1) + '. ' + n.phone_number + (n.friendly_name ? '  (' + n.friendly_name + ')' : '')));
    const wahl = parseInt(await frage('     Welche Nummer soll der Telefon-Retter nutzen? (1-' + nummern.length + '): '), 10);
    if (wahl >= 1 && wahl <= nummern.length) nummer = nummern[wahl - 1];
  }
  console.log('     Nummer: ' + nummer.phone_number + '  ✓');

  // 3. Oeffentliche Adresse (BASE_URL)
  console.log('\n3/4  Oeffentliche Server-Adresse (damit Twilio deinen Mac erreicht):');
  console.log('     Oeffne ein ZWEITES Terminal-Fenster (Cmd+N) und fuege dort ein:');
  console.log('       npx -y untun@latest tunnel http://localhost:3100');
  console.log('     -> Nach ein paar Sekunden erscheint eine https://...-Adresse. Die hier einfuegen.');
  if (process.env.BASE_URL) console.log('     Aktuell gespeichert: ' + process.env.BASE_URL + '  (Enter = so lassen)');
  let basis = await frage('     Adresse einfuegen (beginnt mit https://): ');
  if (!basis && process.env.BASE_URL) basis = process.env.BASE_URL;
  basis = basis.replace(/\/+$/, '');
  if (!/^https:\/\/.+/.test(basis)) {
    console.log('     -> Keine gueltige https-Adresse - Tunnel starten und dann hier nochmal: node telefon-start.js');
    rl.close();
    return;
  }
  schreibeEnvWert('BASE_URL', basis);

  // 4. Webhook setzen: Anrufe auf die Nummer landen bei unserem Server
  //
  // Ohne Auth Token kann der Server die Twilio-Signatur nicht nachrechnen.
  // Dann bekommt die Adresse eine geheime Zeichenkette angehaengt, die nur
  // bei Twilio hinterlegt ist - Fremde kommen so nicht an den Webhook.
  let anrufPfad = '/anruf';
  if (!twilioAuth.kannSignaturPruefen()) {
    let schluessel = process.env.TELEFON_WEBHOOK_SCHLUESSEL;
    if (!schluessel) {
      schluessel = crypto.randomBytes(24).toString('hex');
      schreibeEnvWert('TELEFON_WEBHOOK_SCHLUESSEL', schluessel);
    }
    anrufPfad = '/anruf?schluessel=' + schluessel;
    console.log('     Hinweis: Konto ohne Auth Token -> Webhook wird mit geheimem Schluessel geschuetzt.');
  }

  process.stdout.write('4/4  Verbinde Nummer mit deinem Server... ');
  const webhook = await twilio('/IncomingPhoneNumbers/' + nummer.sid + '.json', 'POST', {
    VoiceUrl: basis + anrufPfad,
    VoiceMethod: 'POST'
  });
  if (!webhook.ok) {
    console.log('FEHLER ' + webhook.status + ': ' + JSON.stringify(webhook.daten).slice(0, 200));
    rl.close();
    return;
  }
  console.log('ok ✓  (' + basis + anrufPfad + ')');

  console.log('\n=== FERTIG - SO TESTEST DU ===');
  console.log('  1. Tunnel-Terminal OFFEN lassen (npx untun ...)');
  console.log('  2. Drittes Terminal:  cd ~/kiekmolin/telefon-retter && node server.js');
  console.log('  3. Mit deinem Handy anrufen:  ' + nummer.phone_number);
  if (istTestKonto) {
    console.log('\n  Hinweise zur Testversion:');
    console.log('  - Twilio spielt zuerst eine kurze Test-Ansage; danach uebernimmt DEIN Assistent.');
    console.log('  - Es klappt nur von der Handynummer, die du bei Twilio bestaetigt hast.');
    console.log('  - Die US-Nummer anzurufen kann je nach Handytarif Geld kosten (kurz halten!).');
    console.log('  - Fuer den echten Betrieb spaeter: Upgrade + deutsche Nummer (README).');
  }
  console.log('\nViel Spass beim ersten Gespraech mit deinem Telefon-Retter!');
  rl.close();
})().catch((e) => { console.log('FEHLER: ' + e.message); rl.close(); });
