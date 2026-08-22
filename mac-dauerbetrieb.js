#!/usr/bin/env node
'use strict';

// KURANI · Dauerbetrieb auf dem Mac
//   node mac-dauerbetrieb.js
//
// Haelt alles am Laufen, was fuer den Telefon-Retter noetig ist, und zwar
// so, dass es einen Neustart, einen Absturz und eine gekappte Leitung
// ueberlebt. Ein Fenster statt drei, und keine Handgriffe mehr.
//
// Was hier laeuft:
//   1. Der Tunnel (cloudflared), damit Twilio den Mac von aussen erreicht
//   2. Der Telefon-Retter (Port 3100)
//   3. Die Agentur-App (Port 3200)
//   4. caffeinate, damit der Mac nicht einschlaeft und die Anrufe annimmt
//
// DAS EIGENTLICHE PROBLEM, das dieses Skript loest:
//
// Ein kostenloser Cloudflare-Tunnel bekommt bei JEDEM Start eine neue
// Adresse. Bisher hiess das: Tunnel neu starten, Adresse abschreiben, bei
// Twilio eintragen - jedes Mal. Wer das vergisst, hat einen Telefon-Retter,
// der laeuft, aber keinen einzigen Anruf bekommt. Und er merkt es nicht,
// weil nichts kaputt aussieht.
//
// Deshalb liest dieses Skript die neue Adresse aus der Tunnel-Ausgabe und
// traegt sie selbst bei Twilio ein. Auch nach jedem Neustart des Tunnels.
//
// EHRLICH ZU DEN GRENZEN: Ein Mac im Wohnzimmer ist kein Server. Wenn der
// Strom weg ist, das WLAN spinnt oder jemand den Deckel zuklappt und die
// Energieeinstellungen nicht stimmen, ist das Telefon tot. Fuer die ersten
// Kunden geht das - aber sag keinem Wirt "rund um die Uhr", bevor das hier
// nicht ein paar Wochen ohne Ausfall gelaufen ist.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

require('./telefon-retter/lib/env').ladeEnv();
const twilioAuth = require('./telefon-retter/lib/twilio-auth');

const LOG_DATEI = path.join(__dirname, 'dauerbetrieb.log');
const TUNNEL_MUSTER = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

let aktuelleAdresse = null;
let beendet = false;
const kinder = [];

function zeit() {
  return new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
}

function log(text) {
  const zeile = '[' + zeit() + '] ' + text;
  console.log(zeile);
  try { fs.appendFileSync(LOG_DATEI, zeile + '\n'); } catch (_e) { /* Log ist nicht kritisch */ }
}

// --------------------------------------------------------- Twilio-Webhook ---
// Traegt die aktuelle Tunnel-Adresse als Anruf-Adresse der Nummer ein.
// Ohne diesen Schritt klingelt es bei Twilio ins Leere.
async function webhookSetzen(basis) {
  const nummer = String(process.env.TWILIO_NUMMER || process.env.TWILIO_SMS_VON || '').trim();
  const schluessel = process.env.TELEFON_WEBHOOK_SCHLUESSEL;
  const ziel = basis + '/anruf' + (schluessel ? '?schluessel=' + encodeURIComponent(schluessel) : '');

  let sid;
  try {
    sid = twilioAuth.kontoSid();
  } catch (e) {
    log('Webhook NICHT gesetzt: ' + e.message + ' - Anrufe kommen nicht an.');
    return false;
  }

  try {
    // Die Nummer suchen: entweder die aus der .env oder die einzige im Konto.
    const liste = await fetch(twilioAuth.kontoUrl('/IncomingPhoneNumbers.json?PageSize=50'), {
      headers: { Authorization: twilioAuth.authKopf() }, signal: AbortSignal.timeout(20000)
    });
    if (!liste.ok) throw new Error('Twilio antwortet mit ' + liste.status);
    const nummern = (await liste.json()).incoming_phone_numbers || [];
    if (!nummern.length) {
      log('Bei Twilio ist keine Nummer hinterlegt. Erst eine Nummer kaufen (Console), dann hier neu starten.');
      return false;
    }
    const treffer = nummer
      ? nummern.find((n) => String(n.phone_number).replace(/\s/g, '') === nummer.replace(/\s/g, ''))
      : nummern[0];
    if (!treffer) {
      log('Die Nummer ' + nummer + ' gehoert nicht zu diesem Twilio-Konto. TWILIO_NUMMER in der .env pruefen.');
      return false;
    }

    const antwort = await fetch(twilioAuth.kontoUrl('/IncomingPhoneNumbers/' + treffer.sid + '.json'), {
      method: 'POST',
      headers: {
        Authorization: twilioAuth.authKopf(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ VoiceUrl: ziel, VoiceMethod: 'POST' }).toString(),
      signal: AbortSignal.timeout(20000)
    });
    if (!antwort.ok) throw new Error('Twilio antwortet mit ' + antwort.status);
    log('Twilio zeigt jetzt auf ' + ziel.replace(/\?schluessel=.*/, '?schluessel=***'));
    log('Nummer bereit: ' + treffer.phone_number);
    return true;
  } catch (e) {
    log('Webhook NICHT gesetzt (' + e.message + ') - Anrufe kommen gerade nicht an.');
    return false;
  }
}

// ---------------------------------------------------------------- Kinder ----
// Jeder Dienst laeuft als eigener Prozess. Stirbt einer, wird er neu
// gestartet - mit wachsender Pause, damit ein dauerhaft kaputter Dienst
// nicht im Sekundentakt neu startet und das Log flutet.
function starte(name, befehl, argumente, optionen) {
  const o = optionen || {};
  let versuche = 0;
  let gemeldeterPortfehler = false;

  function los() {
    if (beendet) return;
    const kind = spawn(befehl, argumente, {
      cwd: o.cwd || __dirname,
      env: Object.assign({}, process.env, o.env || {})
    });
    kinder.push(kind);

    const lies = (stueck) => {
      for (const zeile of String(stueck).split('\n')) {
        const z = zeile.trim();
        if (!z) continue;
        if (o.aufZeile) o.aufZeile(z);
        // Der mit Abstand haeufigste Startfehler: der Port ist schon belegt,
        // weil in einem anderen Fenster noch ein Server von vorhin laeuft.
        // Die Meldung von Node ("EADDRINUSE") sagt einem Nicht-Techniker
        // nichts - deshalb steht hier gleich der Befehl, der es loest.
        if (z.includes('EADDRINUSE') && !gemeldeterPortfehler) {
          gemeldeterPortfehler = true;
          const port = (z.match(/:(\d{4,5})/) || [])[1] || (name === 'telefon' ? '3100' : '3200');
          log('');
          log('>>> Port ' + port + ' ist schon belegt. Da laeuft noch ein Server von vorhin.');
          log('    In einem freien Terminal-Fenster:  lsof -ti :' + port + ' | xargs kill');
          log('    Danach faengt sich der Dauerbetrieb von selbst wieder.');
          log('');
        }
        if (o.leise && !/fehler|error|warn/i.test(z)) continue;
        log(name + ' | ' + z.slice(0, 200));
      }
    };
    kind.stdout.on('data', lies);
    kind.stderr.on('data', lies);

    let laeuftNoch = true;
    kind.on('exit', (code) => {
      laeuftNoch = false;
      if (beendet) return;
      versuche++;

      // Ein Dienst, der immer wieder abstuerzt, ist kaputt - und das Log
      // im Sekundentakt vollzuschreiben hilft niemandem. Ab dem fuenften
      // Fehlversuch wird die Pause lang UND es steht einmal deutlich da,
      // was zu tun ist. Sonst laeuft der Dauerbetrieb wochenlang scheinbar
      // normal, waehrend der Telefon-Retter in Wahrheit nie hochkommt.
      if (versuche === 5) {
        log('');
        log('!!! ' + name.toUpperCase() + ' STARTET NICHT !!!');
        log('    Fuenf Versuche hintereinander gescheitert. Die letzte Meldung');
        log('    von "' + name + '" steht ein paar Zeilen weiter oben - da steht,');
        log('    was fehlt. Haeufig: ein Eintrag in der .env oder npm install.');
        log('    Bis das behoben ist, wird nur noch alle 5 Minuten probiert.');
        log('');
      }
      const pause = versuche >= 5 ? 300 : 3 * versuche;
      log(name + ' ist beendet (Code ' + code + '). Neustart in ' + pause + ' Sekunden.');
      setTimeout(los, pause * 1000);
    });
    kind.on('error', (e) => log(name + ' liess sich nicht starten: ' + e.message));

    // Laeuft ein Dienst zwei Minuten am Stueck, gilt er als stabil und die
    // Zaehlung faengt von vorn an - sonst waere die Pause nach Wochen
    // Betrieb dauerhaft bei fuenf Minuten. Geprueft wird ausdruecklich, ob
    // der Prozess NOCH LEBT: sonst wuerde der Zaehler auch fuer einen
    // Dienst zurueckgesetzt, der laengst abgestuerzt ist.
    setTimeout(() => { if (laeuftNoch) versuche = 0; }, 120000);
  }
  los();
}

// ------------------------------------------------------------------ Start ---
log('=== Dauerbetrieb startet ===');
log('Log-Datei: ' + LOG_DATEI);

// 1. Mac wachhalten. Ohne das nimmt niemand den Anruf um halb zwoelf an.
//    -i verhindert das Einschlafen des Systems, -m das der Festplatten.
if (process.platform === 'darwin') {
  starte('wach', 'caffeinate', ['-i', '-m'], { leise: true });
  log('caffeinate laeuft - der Mac schlaeft nicht mehr ein.');
  log('WICHTIG: Bei einem MacBook zusaetzlich in den Energieeinstellungen');
  log('  "Bei geschlossenem Display nicht in den Ruhezustand" erlauben,');
  log('  sonst hilft caffeinate beim Zuklappen nichts.');
} else {
  log('Kein macOS - caffeinate wird uebersprungen.');
}

// 2. Der Tunnel. Aus seiner Ausgabe faellt die oeffentliche Adresse.
starte('tunnel', 'npx', ['-y', 'cloudflared', 'tunnel', '--url', 'http://localhost:3100'], {
  leise: true,
  aufZeile: (zeile) => {
    const treffer = zeile.match(TUNNEL_MUSTER);
    if (!treffer) return;
    const adresse = treffer[0];
    if (adresse === aktuelleAdresse) return;
    aktuelleAdresse = adresse;
    log('Neue oeffentliche Adresse: ' + adresse);
    webhookSetzen(adresse);
  }
});

// 3. Die beiden Server. Meldet sich die Agentur-App, wird sie im Browser
//    geoeffnet - aber NUR, wenn das Skript von Hand im Terminal gestartet
//    wurde. Startet launchd es beim Anmelden, waere ein Browserfenster bei
//    jeder Anmeldung eine Zumutung.
let schonGeoeffnet = false;
starte('telefon', 'node', ['server.js'], { cwd: path.join(__dirname, 'telefon-retter') });
starte('agentur', 'node', ['server.js'], {
  cwd: path.join(__dirname, 'agentur'),
  aufZeile: (zeile) => {
    if (schonGeoeffnet || !/http:\/\/localhost:\d+/.test(zeile)) return;
    schonGeoeffnet = true;
    if (process.platform !== 'darwin' || !process.stdout.isTTY) return;
    const adresse = zeile.match(/http:\/\/localhost:\d+/)[0];
    spawn('open', [adresse], { stdio: 'ignore' }).on('error', () => {
      log('Browser liess sich nicht oeffnen - bitte selbst aufmachen: ' + adresse);
    });
    log('Agentur-App im Browser geoeffnet: ' + adresse);
  }
});

log('Alles gestartet. Die Agentur-App: http://localhost:3200');
log('(Oeffnet sich gleich von selbst. Falls nicht: Adresse im Browser eintippen.)');
log('Das CRM liegt unter: http://localhost:3200/crm/');
log('(NUR unter dieser Adresse kennen CRM und Agentur einander.)');
log('Zum Beenden: Strg+C - dann sind auch Telefon und Tunnel aus.');

// Sauber aufhoeren, damit keine Prozesse verwaist zurueckbleiben.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    beendet = true;
    log('Wird beendet - alle Dienste werden gestoppt.');
    for (const k of kinder) { try { k.kill(); } catch (_e) { /* schon weg */ } }
    setTimeout(() => process.exit(0), 500);
  });
}
