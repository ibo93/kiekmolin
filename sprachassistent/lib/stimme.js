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

  // Ausdruecklich eine Stimme verlangt (Probehoeren): die gilt.
  if (o.stimme && o.roh) return elevenlabs(text, o.stimme);

  const weg = stimmen.welcherWeg();

  if (weg === 'mac') {
    const gewaehlt = stimmen.aktuelle();
    return { ton: await stimmen.sprichMac(text, gewaehlt.id), art: 'audio/wav' };
  }

  if (weg === 'elevenlabs') return elevenlabs(text, o.stimme);

  throw new Error('Keine eigene Stimme eingestellt - der Browser spricht dann selbst');
}

async function elevenlabs(text, stimmeId) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = stimmeId || process.env.SPRACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt - der Browser spricht dann selbst');
  if (!voiceId) throw new Error('Keine Stimme gewaehlt - aussuchen mit: node stimmen.js hoeren');

  const modell = process.env.ELEVENLABS_MODELL || 'eleven_flash_v2_5';
  const sprachHinweis = /flash|turbo/.test(modell) ? { language_code: 'de' } : {};

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
          stability: parseFloat(process.env.ELEVENLABS_STABILITAET || '0.42'),
          similarity_boost: 0.8
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
