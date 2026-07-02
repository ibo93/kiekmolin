#!/usr/bin/env node
'use strict';

// Gespraechs-Simulator: testet den kompletten Telefon-Retter-Dialog
// als Text-Chat im Terminal - ohne Twilio, Deepgram oder ElevenLabs.
// Nur ANTHROPIC_API_KEY wird gebraucht (das "Denken").
//
//   node simulator.js --demo              Demo-Restaurant, schreibt NICHTS in die DB
//   node simulator.js                     echtes Restaurant aus .env, schreibt echt!
//   node simulator.js --demo --stufe 3    Demo mit Bestellungen
//
// Perfekt fuer die Test-Checkliste, bevor es an die Twilio-Nummer geht.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { ladeEnv } = require('./lib/env');
const { DialogSitzung } = require('./lib/dialog');

ladeEnv();

const argv = process.argv.slice(2);
const demo = argv.includes('--demo');
const stufeIdx = argv.indexOf('--stufe');
const stufe = stufeIdx !== -1 ? parseInt(argv[stufeIdx + 1], 10) : parseInt(process.env.STUFE || '1', 10);

// Demo-Datenquelle: haelt alles im Speicher, schreibt NIE in die echte Datenbank
function demoDatenquelle(demoDaten) {
  const reservierungen = [...(demoDaten.reservierungen || [])];
  return {
    async reservierungenAm(_rid, datum) {
      return reservierungen.filter((r) => r.reservation_date === datum);
    },
    async anzahlAktiveTische() { return demoDaten.tischanzahl || 8; },
    async neueReservierung(payload) {
      reservierungen.push(payload);
      console.log('\n  [DEMO-DB] Reservierung gespeichert: ' + JSON.stringify(payload) + '\n');
      return { ok: true, daten: Object.assign({ id: 'demo-' + reservierungen.length }, payload) };
    },
    async neueBestellung(payload) {
      console.log('\n  [DEMO-DB] Bestellung gespeichert: ' + JSON.stringify(payload, null, 2) + '\n');
      return { ok: true, daten: Object.assign({ id: 'demo-bestellung' }, payload) };
    },
    async neuerBestellArtikel(payload) {
      console.log('  [DEMO-DB] Bestell-Artikel: ' + payload.quantity + 'x ' + payload.item_name);
      return { ok: true };
    }
    // Kein resilienterInsert im Demo-Modus -> Rueckruf nutzt den Reservierungs-Fallback
  };
}

async function main() {
  let restaurant, menue, datenquelle;

  if (demo) {
    const demoDaten = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo', 'demo-daten.json'), 'utf8'));
    restaurant = demoDaten.restaurant;
    menue = demoDaten.speisekarte;
    datenquelle = demoDatenquelle(demoDaten);
    console.log('DEMO-MODUS: "' + restaurant.name + '" · Stufe ' + stufe + ' · es wird NICHTS in die echte Datenbank geschrieben.');
  } else {
    const supabase = require('./lib/supabase');
    const kennung = process.env.RESTAURANT_ID || process.env.RESTAURANT_NAME;
    if (!kennung) { console.error('RESTAURANT_ID oder RESTAURANT_NAME in .env setzen (oder --demo nutzen).'); process.exit(1); }
    restaurant = await supabase.findeRestaurant(kennung);
    if (!restaurant) { console.error('Restaurant "' + kennung + '" nicht gefunden.'); process.exit(1); }
    menue = stufe >= 2 ? await supabase.speisekarte(restaurant.id) : [];
    datenquelle = supabase;
    console.log('ECHT-MODUS: "' + restaurant.name + '" · Stufe ' + stufe + ' · Reservierungen/Bestellungen landen WIRKLICH in der Datenbank!');
  }

  const dialog = new DialogSitzung({
    restaurant, menue, stufe,
    anrufer: '+49 4931 000000 (Simulator)',
    datenquelle,
    log: (z) => { if (argv.includes('--debug')) console.log('  [' + z + ']'); }
  });

  console.log('\n  AGENT: ' + dialog.begruessung());
  console.log('  (tippe deine Antworten; "auflegen" beendet)\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const frage = () => {
    rl.question('  GAST:  ', async (eingabe) => {
      const text = eingabe.trim();
      if (!text || text.toLowerCase() === 'auflegen') { rl.close(); return; }
      try {
        const { text: antwort, beenden } = await dialog.antwortAuf(text);
        console.log('\n  AGENT: ' + antwort + '\n');
        if (beenden) { console.log('  (Agent hat aufgelegt)'); rl.close(); return; }
      } catch (e) {
        console.error('\n  FEHLER: ' + e.message + '\n');
      }
      frage();
    });
  };
  frage();
}

main().catch((e) => { console.error('Fehler: ' + e.message); process.exit(1); });
