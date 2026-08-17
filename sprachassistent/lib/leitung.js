'use strict';

// DIE LEITUNG WARM HALTEN.
//
// Bei jeder Antwort gehen zwei Anrufe raus: einer ans Modell
// (api.anthropic.com), einer an die Stimme (api.elevenlabs.io). Wer
// anruft, muss erst verbinden - TCP aufbauen, TLS aushandeln, Zertifikat
// pruefen. Das sind pro Anruf ueber den Daumen 100 bis 250 Millisekunden,
// BEVOR die Frage ueberhaupt gestellt ist.
//
// Solange man ohne Pause redet, faellt das nicht auf: Node haelt eine
// benutzte Leitung noch ein paar Sekunden offen. Aber ein Gespraech hat
// Pausen. Man denkt nach, man macht was anderes, man redet mit jemandem
// im Laden - und in genau diesen Pausen macht die Leitung zu. Die naechste
// Frage zahlt dann wieder voll drauf.
//
// Deshalb wird alle paar Sekunden ein winziger Gruss geschickt, solange
// ein Live-Fenster offen ist. Das kostet nichts (die angefragten Listen
// sind kostenlos) und haelt die Leitung offen. ChatGPT macht im Grunde
// dasselbe, nur radikaler: dort bleibt fuer das ganze Gespraech EINE
// Leitung offen.
//
// Aus damit: SPRACH_WARM=0

// Node macht eine unbenutzte Leitung nach etwa drei Sekunden zu. Der Takt
// muss also knapp darunter liegen - sonst waermt man eine Leitung, die
// schon kalt ist.
const TAKT = parseInt(process.env.SPRACH_WARM_MS || '2500', 10);

// Kostenlose Auskuenfte. Bewusst NICHT die Modell-Anfrage selbst: die
// wuerde Geld kosten und den Tagesdeckel anknabbern.
const ZIELE = [
  {
    name: 'modell',
    url: 'https://api.anthropic.com/v1/models?limit=1',
    schluessel: () => process.env.ANTHROPIC_API_KEY,
    kopf: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' })
  },
  {
    name: 'stimme',
    url: 'https://api.elevenlabs.io/v1/models',
    schluessel: () => process.env.ELEVENLABS_API_KEY,
    kopf: (k) => ({ 'xi-api-key': k })
  }
];

let takt = null;
let offen = 0;              // wie viele Fenster gerade waermen wollen

function angemeldet() {
  return ZIELE.filter((z) => !!z.schluessel());
}

// Einmal alle Ziele antippen. Fehler sind egal: ein misslungener Gruss
// darf nie ein Gespraech stoeren, und der naechste Takt kommt gleich.
async function tippAn() {
  await Promise.all(angemeldet().map(async (ziel) => {
    try {
      await fetch(ziel.url, {
        method: 'GET',
        headers: ziel.kopf(ziel.schluessel()),
        signal: AbortSignal.timeout(4000)
      });
    } catch (_e) { /* egal - beim naechsten Takt wieder */ }
  }));
}

// Solange mindestens ein Fenster offen ist, bleibt die Leitung warm.
// Zurueck kommt der Abmelder - beim Schliessen des Fensters aufrufen.
function warm() {
  if (process.env.SPRACH_WARM === '0' || !angemeldet().length) return { aus() {} };

  offen++;
  if (!takt) {
    tippAn();                                  // sofort, nicht erst in 2,5 s
    takt = setInterval(tippAn, Math.max(1000, TAKT));
    if (takt.unref) takt.unref();              // haelt den Server nicht am Leben
  }

  let ab = false;
  return {
    aus() {
      if (ab) return;
      ab = true;
      offen--;
      if (offen <= 0 && takt) { clearInterval(takt); takt = null; offen = 0; }
    }
  };
}

// Zum Nachsehen im Test und in pruefe.js.
function lage() {
  return { an: !!takt, fenster: offen, takt: TAKT, ziele: angemeldet().map((z) => z.name) };
}

module.exports = { warm, lage, tippAn, ZIELE, TAKT };
