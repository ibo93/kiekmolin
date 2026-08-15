'use strict';

// WELCHE STIMME SOLL ER HABEN?
//
// Drei Wege, von gut nach notduerftig:
//
//   1. ElevenLabs   die beste. Kostet Geld und braucht einen Schluessel.
//   2. macOS        der eingebaute "say"-Befehl. Kostet nichts, laeuft
//                   offline - und ist mit den Premium-Stimmen deutlich
//                   besser als das, was der Browser kann.
//   3. Browser      die Notloesung. Blechern, aber immer da.
//
// Der mittlere Weg wird gern uebersehen. Auf einem Mac liegen richtig
// gute deutsche Stimmen bereit (Anna, Markus, die Siri-Stimmen) - man
// muss sie nur einmal laden und auswaehlen. Genau dafuer ist das hier.
//
// Ausgesucht wird mit dem Ohr, nicht mit dem Auge: "node stimmen.js
// hoeren" spielt alle durch, dann "node stimmen.js nimm 4".

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const fuehreAus = promisify(execFile);

// Der Probesatz. Bewusst aus Ibos Alltag: deutsche Umlaute, ein
// Eigenname, eine Zahl - daran hoert man, ob eine Stimme taugt.
const PROBE = 'Moin Ibo. La Piazza wartet auf die Speisekarte, ' +
  'und fuer morgen sind 19 Grad und Regen gemeldet.';

const AUF_MAC = process.platform === 'darwin';

// WIE soll sie sprechen?
//
// Zwei Sachen, die NICHTS miteinander zu tun haben - und die hier
// deshalb getrennt eingestellt werden:
//
//   TEMPO  wie schnell. Woerter pro Minute.
//   RUHE   wie sanft. Gleichmaessig und unaufgeregt statt hektisch
//          betont. Bei ElevenLabs ist das "stability".
//
// Der Unterschied ist wichtig: eine Stimme kann zuegig UND sanft sein -
// so redet ein ruhiger Mensch, der weiss, was er sagen will. Langsam
// heisst nicht sanft, es heisst nur langsam.
const TEMPO_NORMAL = 190;      // zuegig, aber nicht gehetzt

const STILE = {
  lebhaft: { name: 'lebhaft', ruhe: 0.35 },     // betont stark, wirkt unruhig
  sanft: { name: 'sanft', ruhe: 0.55 },         // Standard
  ruhig: { name: 'ruhig', ruhe: 0.75 }          // sehr gleichmaessig
};

function stil(wunsch, tempoWunsch) {
  const gewuenscht = String(wunsch || process.env.SPRACH_STIL || 'sanft').toLowerCase();
  const gefunden = STILE[gewuenscht] || STILE.sanft;
  const tempo = parseInt(tempoWunsch || process.env.SPRACH_TEMPO || TEMPO_NORMAL, 10);
  return {
    name: gefunden.name,
    // Sicherheitsnetz: unter 120 versteht man ihn nicht mehr als Assistent,
    // ueber 260 ueberschlaegt er sich.
    tempo: Math.max(120, Math.min(260, isFinite(tempo) ? tempo : TEMPO_NORMAL)),
    ruhe: parseFloat(process.env.SPRACH_RUHE || process.env.ELEVENLABS_STABILITAET || gefunden.ruhe)
  };
}

// ------------------------------------------------------- macOS-Stimmen ----

// "say -v ?" listet alles, was installiert ist:
//   Anna (Premium)      de_DE    # Hallo, ich heisse Anna ...
//   Alex                en_US    # Most people recognize me by my voice.
function macZeilenLesen(ausgabe) {
  const stimmen = [];
  for (const zeile of String(ausgabe || '').split('\n')) {
    // Der Name kann Leerzeichen enthalten ("Anna (Premium)") - getrennt
    // wird deshalb erst bei ZWEI Leerzeichen.
    const t = /^(.+?)\s\s+([a-z]{2,3}[-_][A-Z]{2})\s*#?\s*(.*)$/.exec(zeile.trimEnd());
    if (!t) continue;
    stimmen.push({
      art: 'mac',
      id: t[1].trim(),
      name: t[1].trim(),
      sprache: t[2].replace('-', '_'),
      beschreibung: (t[3] || '').trim()
    });
  }
  return stimmen;
}

async function macStimmen() {
  if (!AUF_MAC) return [];
  try {
    const { stdout } = await fuehreAus('say', ['-v', '?'], { timeout: 10000, maxBuffer: 1024 * 1024 });
    return macZeilenLesen(stdout);
  } catch (_e) {
    return [];                                  // kein say - dann eben nicht
  }
}

// Text -> WAV. WAV, weil der Browser das ohne Umweg abspielt; das AIFF,
// das "say" von Haus aus schreibt, kann er nicht zuverlaessig.
async function sprichMac(text, name, wieRuhig) {
  if (!AUF_MAC) throw new Error('Die eingebauten Stimmen gibt es nur auf dem Mac');
  const s = wieRuhig && wieRuhig.tempo ? wieRuhig : stil();
  const datei = path.join(os.tmpdir(), 'kurani-stimme-' + process.pid + '-' + Date.now() + '.wav');
  // 22 kHz reicht fuer Sprache und ist schnell geschrieben; -r bremst sie
  // auf ein Tempo, bei dem man zuhoeren mag.
  const argumente = ['-r', String(s.tempo), '-o', datei, '--data-format=LEI16@22050'];
  if (name) argumente.unshift('-v', name);
  argumente.push(String(text));

  try {
    await fuehreAus('say', argumente, { timeout: 20000 });
    return fs.readFileSync(datei);
  } finally {
    try { fs.unlinkSync(datei); } catch (_e) { /* war schon weg */ }
  }
}

// -------------------------------------------------- ElevenLabs-Stimmen ----

async function elevenStimmen() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [];
  try {
    const antwort = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(15000)
    });
    if (!antwort.ok) return [];
    const daten = await antwort.json();
    return (daten.voices || []).map((v) => ({
      art: 'elevenlabs',
      id: v.voice_id,
      name: v.name,
      sprache: (v.labels && (v.labels.language || v.labels.accent)) || '',
      beschreibung: [v.labels && v.labels.description, v.labels && v.labels.age,
        v.labels && v.labels.gender].filter(Boolean).join(', ')
    }));
  } catch (_e) {
    return [];
  }
}

// ------------------------------------------------------------- Auswahl ----

// Deutsche Stimmen zuerst - alles andere braucht Ibo nicht.
function deutschZuerst(stimmen) {
  const deutsch = stimmen.filter((s) => /^de/i.test(s.sprache));
  const rest = stimmen.filter((s) => !/^de/i.test(s.sprache));
  return { deutsch: deutsch, rest: rest };
}

// Alles, was auf diesem Rechner zur Verfuegung steht.
async function alle() {
  const [mac, eleven] = await Promise.all([macStimmen(), elevenStimmen()]);
  // ElevenLabs zuerst: wer den Schluessel hat, will die auch.
  return eleven.concat(mac);
}

// Was ist gerade eingestellt? Gibt { art, id, name } oder null zurueck.
function aktuelle() {
  // Eine ausdrueckliche Wahl gewinnt IMMER gegen die Automatik. Wer
  // "browser" eingestellt hat, will den Browser - auch wenn ein
  // ElevenLabs-Schluessel herumliegt.
  const gewaehlt = String(process.env.SPRACH_STIMME || '').trim();
  if (gewaehlt.toLowerCase().indexOf('mac:') === 0) {
    const name = gewaehlt.slice(4).trim();
    return { art: 'mac', id: name, name: name };
  }
  if (gewaehlt.toLowerCase() === 'browser') return { art: 'browser', id: '', name: 'Browser' };

  const voiceId = process.env.SPRACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;
  if (process.env.ELEVENLABS_API_KEY && voiceId) {
    return { art: 'elevenlabs', id: voiceId, name: voiceId };
  }
  return null;                                  // nichts gewaehlt -> Browser
}

// Welcher Weg wird tatsaechlich benutzt? Das steht im Fenster und in der
// Selbstpruefung - und muss zur Wahrheit passen, nicht zum Wunsch.
function welcherWeg() {
  const a = aktuelle();
  if (!a || a.art === 'browser') return 'browser';
  if (a.art === 'mac') return AUF_MAC ? 'mac' : 'browser';
  return 'elevenlabs';
}

// Eine Stimme anhoeren (liefert Ton als Buffer).
async function probe(stimme, text, wieRuhig) {
  const satz = text || PROBE;
  if (!stimme) throw new Error('Keine Stimme angegeben');
  const s = wieRuhig || stil();
  if (stimme.art === 'mac') return { ton: await sprichMac(satz, stimme.id, s), art: 'audio/wav' };
  const stimmeModul = require('./stimme');
  return stimmeModul.spreche(satz, { stimme: stimme.id, roh: true, stil: s });
}

// ------------------------------------------------------ .env schreiben ----

// Einen Wert in der .env setzen: vorhandene Zeile ersetzen, sonst
// anhaengen. Nie die ganze Datei neu schreiben - da stehen Schluessel drin.
function setzeEnv(schluessel, wert, datei) {
  const pfad = datei || path.join(__dirname, '..', '.env');
  let zeilen = [];
  if (fs.existsSync(pfad)) zeilen = fs.readFileSync(pfad, 'utf8').split('\n');

  const muster = new RegExp('^\\s*#?\\s*' + schluessel + '\\s*=');
  let gesetzt = false;
  const neu = zeilen.map((z) => {
    if (!muster.test(z) || gesetzt) return z;
    gesetzt = true;
    return schluessel + '=' + wert;
  });

  if (!gesetzt) {
    if (neu.length && neu[neu.length - 1].trim() !== '') neu.push('');
    neu.push('# Von "node stimmen.js nimm" gesetzt.');
    neu.push(schluessel + '=' + wert);
    neu.push('');
  }

  fs.writeFileSync(pfad, neu.join('\n'));
  return pfad;
}

module.exports = {
  alle, macStimmen, elevenStimmen, sprichMac, macZeilenLesen,
  deutschZuerst, aktuelle, welcherWeg, probe, setzeEnv, stil,
  PROBE, AUF_MAC, STILE, TEMPO_NORMAL
};
