'use strict';

// Die Ohren: Aufnahme aus dem Browser -> Text.
//
// Der Browser nimmt einen Schnipsel auf (webm/opus) und schickt ihn hierher;
// wir reichen ihn an Deepgram weiter (gleicher Schluessel wie im
// Telefon-Retter) und bekommen deutschen Text zurueck.
//
// KEIN Deepgram-Schluessel? Dann faellt die Oberflaeche automatisch auf die
// Spracherkennung des Browsers zurueck - dieser Weg wird dann gar nicht
// aufgerufen. Der Assistent laeuft also auch ohne jeden Schluessel.

async function hoere(audio, typ) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error('DEEPGRAM_API_KEY fehlt - der Browser hoert dann selbst zu');
  if (!audio || !audio.length) throw new Error('Keine Aufnahme angekommen');

  const url = 'https://api.deepgram.com/v1/listen?' + new URLSearchParams({
    model: process.env.DEEPGRAM_MODELL || 'nova-2',
    language: 'de',
    smart_format: 'true',
    punctuate: 'true'
  }).toString();

  const antwort = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Token ' + key,
      'Content-Type': typ || 'audio/webm'
    },
    body: audio,
    signal: AbortSignal.timeout(30000)
  });

  if (!antwort.ok) {
    throw new Error('Deepgram ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
  }

  const daten = await antwort.json();
  return textAus(daten);
}

// Aus der Deepgram-Antwort den Text ziehen (defensiv - fehlt ein Feld,
// kommt lieber ein leerer Text als ein Absturz).
function textAus(daten) {
  const kanal = daten && daten.results && daten.results.channels && daten.results.channels[0];
  const alternative = kanal && kanal.alternatives && kanal.alternatives[0];
  return alternative && alternative.transcript ? alternative.transcript.trim() : '';
}

module.exports = { hoere, textAus };
