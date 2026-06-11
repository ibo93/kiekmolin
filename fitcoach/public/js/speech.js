// KI-Voice: Spracheingabe (Web Speech API, läuft im Browser) und
// Coach-Stimme (ElevenLabs über die Netlify Function /api/speak).
import { sb, toast } from './state.js';

const VOICE_KEY = 'fc_voice_output';
const VOICE_ID_KEY = 'fc_voice_id';

// Auswählbare ElevenLabs-Stimmen (alle für Deutsch über eleven_multilingual_v2)
export const STIMMEN = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (weiblich, ruhig)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (weiblich, sanft)' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (weiblich, jung)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (männlich, tief)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (männlich, warm)' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (männlich, kräftig)' },
];

export function gewaehlteStimme() {
  return localStorage.getItem(VOICE_ID_KEY) || STIMMEN[0].id;
}

// ---------- Spracheingabe (Diktat) ----------

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const sprachEingabeVerfuegbar = Boolean(SR);

// Startet eine einmalige Erkennung (de-DE) und liefert den Transkript-Text.
export function hoereZu({ onStart, onEnd } = {}) {
  return new Promise((resolve, reject) => {
    if (!SR) { reject(new Error('Spracheingabe wird von diesem Browser nicht unterstützt')); return; }
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => onStart?.();
    rec.onresult = (e) => resolve(e.results[0][0].transcript);
    rec.onerror = (e) => reject(new Error(
      e.error === 'not-allowed' ? 'Mikrofon-Zugriff verweigert' : 'Spracherkennung fehlgeschlagen'
    ));
    rec.onend = () => onEnd?.();
    rec.start();
  });
}

// ---------- Coach-Stimme (ElevenLabs) ----------

export function stimmeAktiv() {
  return localStorage.getItem(VOICE_KEY) === '1';
}

export function setStimmeAktiv(an) {
  localStorage.setItem(VOICE_KEY, an ? '1' : '0');
}

let aktuellesAudio = null;
let aktuelleUrl = null;

// ---------- TTS-Cache ----------
// Wiederkehrende kurze Phrasen ("Eintrag gespeichert") werden nur EINMAL
// bei ElevenLabs generiert und danach lokal aus der Cache API bedient.
// Spart API-Kosten und macht die Stimme ab dem zweiten Mal verzögerungsfrei.

const TTS_CACHE = 'fc-tts-v1';
const CACHE_MAX_LEN = 160; // nur kurze, wiederkehrende Phrasen cachen

// Kleiner, stabiler String-Hash (djb2) für den Cache-Schlüssel
function ttsKey(voiceId, text) {
  let h = 5381;
  const s = `${voiceId}|${text}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `/tts-cache/${h.toString(36)}`;
}

async function ausCache(key) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(TTS_CACHE);
    const hit = await cache.match(key);
    return hit ? hit.blob() : null;
  } catch { return null; }
}

async function inCache(key, res) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(TTS_CACHE);
    await cache.put(key, res);
  } catch { /* Cache voll/gesperrt – dann eben nicht */ }
}

function spieleAb(blob) {
  aktuellesAudio?.pause();
  if (aktuelleUrl) URL.revokeObjectURL(aktuelleUrl); // Memory-Leak vermeiden
  aktuelleUrl = URL.createObjectURL(blob);
  aktuellesAudio = new Audio(aktuelleUrl);
  aktuellesAudio.play().catch(() => {});
}

// Spricht einen kurzen Text – scheitert leise (Feature ist optional).
export async function sprich(text) {
  if (!stimmeAktiv() || !text) return;
  const voiceId = gewaehlteStimme();
  const kurz = text.length <= CACHE_MAX_LEN;
  const key = ttsKey(voiceId, text);

  // 1. Cache-Treffer? Dann kein API-Call – funktioniert sogar offline.
  if (kurz) {
    const gecacht = await ausCache(key);
    if (gecacht) { spieleAb(gecacht); return; }
  }

  if (!navigator.onLine) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ text: text.slice(0, 400), voice_id: voiceId }),
    });
    if (!res.ok) {
      if (res.status === 503) {
        // Server hat keinen ElevenLabs-Key – Feature deaktivieren statt nerven
        setStimmeAktiv(false);
        toast('Coach-Stimme ist auf dem Server nicht konfiguriert');
        const cb = document.getElementById('voice-toggle');
        if (cb) cb.checked = false;
      }
      return;
    }
    // 2. Kurze Phrasen für das nächste Mal merken
    if (kurz) await inCache(key, res.clone());
    const blob = await res.blob();
    spieleAb(blob);
  } catch { /* still bleiben */ }
}

// ---------- Einstellungs-Toggle (Profil) ----------

export function initSpeech() {
  const cb = document.getElementById('voice-toggle');
  if (!cb) return;
  cb.checked = stimmeAktiv();
  cb.addEventListener('change', () => {
    setStimmeAktiv(cb.checked);
    if (cb.checked) sprich('Coach-Stimme ist aktiv. Lass uns loslegen!');
  });

  // Stimmen-Auswahl füllen
  const sel = document.getElementById('voice-select');
  if (sel) {
    sel.innerHTML = STIMMEN.map((s) =>
      `<option value="${s.id}">${s.name}</option>`
    ).join('');
    sel.value = gewaehlteStimme();
    sel.addEventListener('change', () => {
      localStorage.setItem(VOICE_ID_KEY, sel.value);
      // Stimme aktivieren falls noch aus, damit man die Probe hört
      if (!stimmeAktiv()) { setStimmeAktiv(true); cb.checked = true; }
      sprich('So klinge ich. Gefällt dir diese Stimme?');
    });
  }
}
