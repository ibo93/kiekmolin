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

// Am Stueck oder im Strom?
//
//   spreche()  wartet, bis die ganze Datei fertig ist, und gibt sie zurueck.
//   stromen()  gibt weiter, was schon da ist, waehrend der Rest noch entsteht.
//
// Der Unterschied ist der zwischen "er antwortet" und "er ueberlegt noch":
// bis ElevenLabs einen ganzen Satz gebaut hat, vergeht rund eine halbe bis
// eine Sekunde. Die ersten Bytes sind aber viel frueher da. Wer sie sofort
// abspielt, hoert das erste Wort ungefaehr eine halbe Sekunde eher - bei
// gleicher Stimme und gleicher Qualitaet, denn es ist derselbe Auftrag,
// nur anders abgeholt.

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

// Kann dieser Rechner ueberhaupt streamen? Nur ElevenLabs kann das - die
// Mac-Stimme baut eine fertige Datei, da gibt es nichts zu streamen (sie
// ist dafuer auch sofort da, weil sie hier laeuft und nicht in Amerika).
function kannStroemen() {
  return process.env.SPRACH_STROM !== '0' && stimmen.welcherWeg() === 'elevenlabs';
}

// Ton im Strom holen. onStueck(Buffer) wird aufgerufen, sobald etwas da
// ist. Zurueck kommt { art }, sobald alles durch ist.
//
// Abbrechen ueber optionen.signal - beim Dazwischenreden zaehlt jede
// Zehntelsekunde, und ein Satz, den keiner mehr hoeren will, muss auch
// nicht mehr fertig gebaut werden.
async function stromen(text, optionen, onStueck) {
  const o = optionen || {};
  const antwort = await bestelle(text, o.stimme, o.stil || stimmen.stil(), true, o.signal);

  const leser = antwort.body.getReader();
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    if (value && value.length) onStueck(Buffer.from(value));
  }
  return { art: 'audio/mpeg' };
}

// Abbrechen kann zwei Gruende haben: Ibo redet dazwischen (das Signal von
// aussen) oder ElevenLabs antwortet gar nicht mehr (die Frist). Beides muss
// greifen - ohne Frist stuende die Sprech-Kette bei einer haengenden
// Leitung fuer immer, und danach kaeme kein einziger Satz mehr.
function mitFrist(signal, ms) {
  const frist = AbortSignal.timeout(ms);
  if (!signal) return frist;
  return AbortSignal.any ? AbortSignal.any([signal, frist]) : signal;
}

async function elevenlabs(text, stimmeId, wieRuhig) {
  const antwort = await bestelle(text, stimmeId, wieRuhig, false, null);
  return { ton: Buffer.from(await antwort.arrayBuffer()), art: 'audio/mpeg' };
}

// Der eine Auftrag an ElevenLabs - einmal am Stueck, einmal im Strom.
// Beide bestellen genau dasselbe: gleiche Stimme, gleiches Modell,
// gleiche Einstellungen. Nur die Abholung ist anders.
async function bestelle(text, stimmeId, wieRuhig, imStrom, signal) {
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

  const frage = new URLSearchParams({ output_format: 'mp3_44100_128' });
  // Im Strom darf ElevenLabs frueher anfangen zu liefern, statt auf den
  // schoensten Gesamtklang zu optimieren.
  if (imStrom) frage.set('optimize_streaming_latency', process.env.SPRACH_STROM_EILE || '3');

  const antwort = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) +
      (imStrom ? '/stream' : '') + '?' + frage.toString(),
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      signal: mitFrist(signal, 20000),
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
          use_speaker_boost: true,
          // Das Tempo galt bisher NUR fuer die Mac-Stimmen. Wer es
          // hochgestellt hat und dann eine ElevenLabs-Stimme nahm, hat
          // sich zu Recht gewundert, dass sich nichts aendert.
          speed: stimmen.elevenTempo(s.tempo)
        }
      }, sprachHinweis))
    }
  );

  if (!antwort.ok) {
    throw new Error('ElevenLabs ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
  }
  return antwort;
}

module.exports = { spreche, stromen, kannStroemen };
