'use strict';

// DIE STIMME — Text raus, Ton rein.
//
// Drei Wege, von gut nach notduerftig. Gewaehlt wird der beste, der auf
// diesem Rechner wirklich geht:
//
//   1. ElevenLabs   braucht ELEVENLABS_API_KEY und eine Stimme. Die beste.
//   2. macOS        SPRACH_STIMME=mac:Anna - der eingebaute "say"-Befehl.
//                   Kostet nichts, laeuft offline, und ist mit den
//                   Premium-Stimmen deutlich besser als der Browser.
//   3. Browser      passiert von allein, wenn hier nichts geliefert wird.
//
// Unterschied zum Telefon-Retter: dort wird ulaw_8000 fuer die Leitung
// bestellt, hier gute Qualitaet fuer die Lautsprecher. Der Schluessel ist
// derselbe (telefon-retter/.env wird mitgelesen).
//
// Aussuchen: node stimmen.js hoeren

const stimmen = require('./stimmen');

// Liefert { ton: Buffer, art: 'audio/mpeg'|'audio/wav' }.
// Wirft, wenn kein Weg da ist - dann spricht der Browser selbst.
async function spreche(text, optionen) {
  const o = optionen || {};

  const wieRuhig = o.stil || stimmen.stil();

  // Ausdruecklich eine Stimme verlangt (Probehoeren): die gilt.
  if (o.stimme && o.roh) return elevenlabs(text, o.stimme, wieRuhig);

  const weg = stimmen.welcherWeg();

  if (weg === 'mac') {
    const gewaehlt = stimmen.aktuelle();
    return { ton: await stimmen.sprichMac(text, gewaehlt.id, wieRuhig), art: 'audio/wav' };
  }

  if (weg === 'elevenlabs') return elevenlabs(text, o.stimme, wieRuhig);

  throw new Error('Keine eigene Stimme eingestellt - der Browser spricht dann selbst');
}

async function elevenlabs(text, stimmeId, wieRuhig) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = stimmeId || process.env.SPRACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt - der Browser spricht dann selbst');
  if (!voiceId) throw new Error('Keine Stimme gewaehlt - aussuchen mit: node stimmen.js hoeren');

  // Das Modell entscheidet ueber Klang UND Wartezeit - und das ist ein
  // Tausch:
  //   flash        am schnellsten, klingt am haertesten
  //   turbo        schnell und trotzdem gut  <- hier die Wahl
  //   multilingual am besten, aber man wartet darauf
  //
  // Ein Gespraech lebt davon, dass die Antwort kommt. Eine Stimme, auf
  // die man wartet, ist keine gute Stimme, egal wie schoen sie klingt.
  // Deshalb turbo: der Kompromiss, den man nicht merkt.
  //
  // Eigener Schluessel fuer den Assistenten, damit die Telefon-Einstellung
  // aus telefon-retter/.env nicht ungefragt mitgezogen wird.
  const modell = process.env.SPRACH_MODELL_STIMME || process.env.ELEVENLABS_MODELL || 'eleven_turbo_v2_5';
  const sprachHinweis = /flash|turbo/.test(modell) ? { language_code: 'de' } : {};
  const s = wieRuhig || stimmen.stil();

  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128',
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify(Object.assign({
        text: text,
        model_id: modell,
        voice_settings: {
          // Hoehere stability = gleichmaessiger und ruhiger. style auf 0
          // haelt sie sachlich statt theatralisch - ein Assistent soll
          // nicht schauspielern.
          stability: s.ruhe,
          similarity_boost: 0.8,
          style: 0,
          use_speaker_boost: true
        }
      }, sprachHinweis))
    }
  );

  if (!antwort.ok) {
    throw new Error('ElevenLabs ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
  }
  return { ton: Buffer.from(await antwort.arrayBuffer()), art: 'audio/mpeg' };
}

module.exports = { spreche };
