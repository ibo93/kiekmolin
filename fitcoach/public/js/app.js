// Einstiegspunkt: automatische Anmeldung, Navigation, Offline-Sync, Service Worker.
import { sb, state, showView, toast, flushQueue, onViewShow, cacheProfil, gecachtesProfil } from './state.js';
import { APP_VERSION } from './config.js';
import { initTheme, applyAccent } from './theme.js';
import { initSpeech } from './speech.js';
import { initOnboarding } from './onboarding.js';
import { initTracker, refreshTracker } from './tracker.js';
import { initScan } from './scan.js';
import { initProgress } from './progress.js';
import { initWorkout } from './workout.js';

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Auto-Update: Übernimmt ein neuer Service Worker die Seite, einmal neu
  // laden – damit nie wieder eine alte Version "festklebt" (das berüchtigte
  // 2×-neu-laden-Ritual entfällt).
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neuGeladen) return; // Schleifen-Schutz
    neuGeladen = true;
    location.reload();
  });
}

// ---------- Offline-Anzeige + Sync ----------
const offlineBanner = document.getElementById('offline-banner');
function updateOnlineStatus() {
  offlineBanner.hidden = navigator.onLine;
}
window.addEventListener('online', async () => {
  updateOnlineStatus();
  const sent = await flushQueue();
  if (sent > 0) {
    toast(`${sent} Offline-Einträge synchronisiert`);
    refreshTracker();
  }
});
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ---------- Start-Bildschirm (kein Login, nur Status/Fehler) ----------
const authMessage = document.getElementById('auth-message');
const authLoader = document.getElementById('auth-loader');
const authRetry = document.getElementById('auth-retry');

authRetry.addEventListener('click', () => {
  zeigeStartStatus('Wird gestartet …');
  autoLogin();
});

function zeigeStartStatus(text, fehler = false) {
  showView('auth');
  authMessage.textContent = text;
  authLoader.hidden = fehler;
  authRetry.hidden = !fehler;
}

// ---------- Navigation ----------
document.getElementById('bottom-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (btn) showView(btn.dataset.view);
});

// ---------- Profil-Ansicht ----------
onViewShow('profile', () => {
  const p = state.profile;
  if (!p) return;
  document.getElementById('profile-kcal').textContent = p.kalorienziel;
  document.getElementById('profile-tdee').textContent = p.tdee;
  document.getElementById('profile-bmr').textContent = p.grundumsatz;
  document.getElementById('profile-zielgewicht').textContent = p.zielgewicht_kg ?? '–';
});
document.getElementById('profile-edit').addEventListener('click', () => showView('onboarding'));

// ---------- Start: Session prüfen, Profil laden ----------
async function loadProfile() {
  let { data } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  if (data) {
    cacheProfil(data); // für Offline-Starts merken
  } else if (!navigator.onLine) {
    // Offline-Start: zuletzt geladenes Profil verwenden, statt fälschlich
    // im Onboarding zu landen
    data = gecachtesProfil();
  }
  state.profile = data;
  if (data?.akzentfarbe) applyAccent(data.akzentfarbe);
  return data;
}

async function handleSession(session) {
  if (!session) {
    state.user = null;
    state.profile = null;
    await autoLogin(); // kein Login-Screen – einfach automatisch anmelden
    return;
  }
  state.user = session.user;
  const profile = await loadProfile();
  // App-Shortcut (Homescreen) kann eine Ziel-Ansicht mitgeben, z. B. /?view=scan
  const wunsch = new URLSearchParams(location.search).get('view');
  const zielView = profile && ['scan', 'tracker', 'progress', 'workout'].includes(wunsch)
    ? wunsch
    : (profile ? 'tracker' : 'onboarding');
  showView(zielView);
}

// Anonyme Anmeldung – ganz ohne E-Mail/Passwort. Die Session bleibt im
// Browser erhalten, sodass deine Daten beim nächsten Öffnen wieder da sind.
let autoLoginLaeuft = false;
async function autoLogin() {
  if (autoLoginLaeuft) return;
  autoLoginLaeuft = true;
  try {
    if (!navigator.onLine) {
      zeigeStartStatus('Beim ersten Start brauchst du einmal Internet. Tippe zum Erneut-Versuchen.', true);
      return;
    }
    const { error } = await sb.auth.signInAnonymously();
    if (error) {
      if (/anonymous/i.test(error.message) || /disabled/i.test(error.message)) {
        zeigeStartStatus(
          'Aktiviere in Supabase: Authentication → Sign In / Providers → „Anonymous sign-ins" einschalten, dann erneut versuchen.',
          true
        );
      } else {
        zeigeStartStatus('Start fehlgeschlagen: ' + error.message, true);
      }
      return;
    }
    // Erfolg → onAuthStateChange übernimmt das Weiterleiten
  } finally {
    autoLoginLaeuft = false;
  }
}

// Module initialisieren (Event-Handler einmalig verdrahten).
// Schutzwand: Wenn ein Modul beim Start crasht, blockiert es nicht die
// anderen – und der Fehler wird sichtbar gemacht statt verschluckt.
for (const init of [initTheme, initSpeech, initOnboarding, initTracker, initScan, initProgress, initWorkout]) {
  try {
    init();
  } catch (err) {
    console.error('Init-Fehler:', init.name, err);
    toast(`Fehler in ${init.name}: ${err.message}`);
  }
}

// Unerwartete Fehler auf dem Bildschirm zeigen (zum Abfotografieren),
// statt Buttons stumm sterben zu lassen.
window.addEventListener('error', (e) => {
  toast(`Fehler: ${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  toast('Fehler: ' + (e.reason?.message || e.reason));
});

sb.auth.onAuthStateChange((event, session) => {
  // INITIAL_SESSION behandeln wir unten selbst – sonst lädt das Profil
  // bei jedem Start doppelt
  if (event === 'INITIAL_SESSION') return;
  handleSession(session);
});

// Versionsnummer zentral eintragen (eine Quelle statt verstreuter Labels)
document.querySelectorAll('[data-version]').forEach((el) => {
  el.textContent = 'Version ' + APP_VERSION;
});

zeigeStartStatus('Wird gestartet …');
const { data: { session } } = await sb.auth.getSession();
await handleSession(session);

