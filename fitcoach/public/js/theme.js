// Theme-System: Akzentfarbe per CSS-Variable, live umschaltbar.
// Auswahl landet in localStorage (sofort beim Start, auch offline)
// und im Supabase-Profil (gleiches Theme auf jedem Gerät).
import { sb, state, toast } from './state.js';

export const ACCENTS = [
  { name: 'Acid-Lime', hex: '#C8FF00' },
  { name: 'Elektro-Orange', hex: '#FF5C00' },
  { name: 'Cyan', hex: '#00E5FF' },
  { name: 'Hot-Pink', hex: '#FF2E88' },
  { name: 'Violett', hex: '#A78BFA' },
];

export const DEFAULT_ACCENT = ACCENTS[0].hex;
const STORAGE_KEY = 'fc_accent';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Lesbare Textfarbe auf der Akzentfläche (YIQ-Luminanz)
function kontrastFarbe(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#0A0A0A' : '#FFFFFF';
}

// Setzt die Farbe sofort im ganzen UI – das gesamte CSS hängt an --accent.
export function applyAccent(hex) {
  if (!HEX_RE.test(hex)) hex = DEFAULT_ACCENT;
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-contrast', kontrastFarbe(hex));
  localStorage.setItem(STORAGE_KEY, hex);
  markiereAuswahl(hex);
}

// Anwenden + im Profil speichern
export async function setAccent(hex) {
  applyAccent(hex);
  if (state.user && navigator.onLine) {
    const { error } = await sb.from('profiles')
      .update({ akzentfarbe: hex })
      .eq('id', state.user.id);
    if (error) {
      toast('Theme konnte nicht gespeichert werden');
      return;
    }
    if (state.profile) state.profile.akzentfarbe = hex;
  }
}

function markiereAuswahl(hex) {
  const custom = document.getElementById('accent-custom-wrap');
  if (!custom) return; // Picker noch nicht gerendert (App-Start)
  const istPreset = ACCENTS.some((a) => a.hex.toLowerCase() === hex.toLowerCase());
  document.querySelectorAll('#accent-picker .swatch[data-hex]').forEach((b) =>
    b.classList.toggle('active', b.dataset.hex.toLowerCase() === hex.toLowerCase())
  );
  custom.classList.toggle('active', !istPreset);
  document.getElementById('accent-custom').value = hex;
}

export function initTheme() {
  const picker = document.getElementById('accent-picker');
  picker.innerHTML = ACCENTS.map((a) => `
    <button type="button" class="swatch" data-hex="${a.hex}"
            style="--swatch:${a.hex}" title="${a.name}" aria-label="${a.name}"></button>
  `).join('') + `
    <label class="swatch custom" id="accent-custom-wrap" title="Eigene Farbe">
      <input type="color" id="accent-custom" value="${DEFAULT_ACCENT}">
      <span>+</span>
    </label>`;

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.swatch[data-hex]');
    if (btn) setAccent(btn.dataset.hex);
  });
  document.getElementById('accent-custom').addEventListener('input', (e) => {
    applyAccent(e.target.value); // live während des Ziehens im Farbwähler
  });
  document.getElementById('accent-custom').addEventListener('change', (e) => {
    setAccent(e.target.value);   // erst beim Bestätigen speichern
  });

  // Sofort beim Start anwenden – noch bevor Login/Profil geladen sind
  applyAccent(localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT);
}
