// KI-Voice: Spracheingabe (Web Speech API, läuft im Browser) und
// Coach-Stimme (ElevenLabs über die Netlify Function /api/speak).
import { sb, toast } from './state.js';

const VOICE_KEY = 'fc_voice_output';

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

// Spricht einen kurzen Text – scheitert leise (Feature ist optional).
export async function sprich(text) {
  if (!stimmeAktiv() || !navigator.onLine || !text) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ text: text.slice(0, 400) }),
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
    const blob = await res.blob();
    aktuellesAudio?.pause();
    aktuellesAudio = new Audio(URL.createObjectURL(blob));
    aktuellesAudio.play().catch(() => {});
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
}
