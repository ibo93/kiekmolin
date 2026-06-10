// KI-Foto-Scan: Bild verkleinern, an die Netlify Function schicken,
// Schätzung anzeigen, Portionsgröße anpassen, ins Protokoll speichern.
import { sb, state, toast, showView, todayISO } from './state.js';
import { refreshTracker } from './tracker.js';
import { sprich } from './speech.js';

let basis = null;        // KI-Schätzung bei 100 % Portion
let fotoBlob = null;     // komprimiertes Foto für den Storage-Upload

function zeigeSchritt(schritt) {
  document.getElementById('scan-start').hidden = schritt !== 'start';
  document.getElementById('scan-loading').hidden = schritt !== 'loading';
  document.getElementById('scan-result').hidden = schritt !== 'result';
}

// Bild auf max. 1024 px verkleinern und als JPEG komprimieren –
// schnellerer Upload, schnellere Analyse, für die Erkennung mehr als genug.
async function komprimiereBild(file) {
  const bitmap = await createImageBitmap(file);
  const maxKante = 1024;
  const faktor = Math.min(1, maxKante / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * faktor);
  canvas.height = Math.round(bitmap.height * faktor);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

function blobZuBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function analysiere(file) {
  if (!navigator.onLine) {
    toast('Der KI-Scan braucht eine Internetverbindung');
    return;
  }
  zeigeSchritt('loading');

  try {
    fotoBlob = await komprimiereBild(file);
    const vorschauUrl = URL.createObjectURL(fotoBlob);
    document.getElementById('scan-preview').src = vorschauUrl;
    document.getElementById('scan-result-img').src = vorschauUrl;

    const base64 = await blobZuBase64(fotoBlob);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Nicht eingeloggt – bitte neu anmelden');

    // Harter Timeout: bricht ab, falls der Server nicht antwortet,
    // damit die Vorschau nicht ewig lädt.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let res;
    try {
      res = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ image_base64: base64, media_type: 'image/jpeg' }),
        signal: controller.signal,
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError'
        ? 'Zeitüberschreitung – Server antwortet nicht'
        : 'Keine Verbindung zum Server');
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fehler ${res.status}`);
    }

    const ergebnis = await res.json().catch(() => {
      throw new Error('Ungültige Antwort – ist die KI-Function deployt?');
    });
    if (!ergebnis.erkannt) {
      toast('Kein Essen erkannt – probiere ein anderes Foto');
      zeigeSchritt('start');
      return;
    }
    basis = ergebnis;
    zeigeErgebnis();
  } catch (err) {
    toast('Analyse fehlgeschlagen: ' + err.message);
    zeigeSchritt('start');
  }
}

function zeigeErgebnis() {
  document.getElementById('scan-gericht').textContent = basis.gericht;
  // Zutaten kommen als Objekte mit Einzelschätzung: "Reis (180 g) · Hähnchen (150 g)"
  document.getElementById('scan-zutaten').textContent = (basis.zutaten || [])
    .map((z) => (z && typeof z === 'object') ? `${z.name} (${z.menge_g} g)` : String(z))
    .join(' · ');
  document.getElementById('scan-hinweis').textContent =
    `${basis.hinweis || ''} (Sicherheit: ${basis.sicherheit})`.trim();
  document.getElementById('scan-portion').value = 100;
  aktualisiereWerte();
  zeigeSchritt('result');
  sprich(
    `Erkannt: ${basis.gericht}. Geschätzt ${basis.kalorien} Kilokalorien, ` +
    `${basis.protein_g} Gramm Protein. Du kannst die Portionsgröße noch anpassen.`
  );
}

// Portionsgrößen-Slider skaliert alle Werte linear (100 % = KI-Schätzung)
function aktualisiereWerte() {
  const prozent = Number(document.getElementById('scan-portion').value) / 100;
  const gramm = Math.round(basis.portionsgroesse_g * prozent);
  document.getElementById('scan-portion-label').textContent = `${gramm} g`;
  document.getElementById('scan-kcal').textContent = Math.round(basis.kalorien * prozent);
  document.getElementById('scan-protein').textContent = Math.round(basis.protein_g * prozent);
  document.getElementById('scan-carbs').textContent = Math.round(basis.carbs_g * prozent);
  document.getElementById('scan-fett').textContent = Math.round(basis.fett_g * prozent);
}

async function speichere() {
  const btn = document.getElementById('scan-save');
  btn.disabled = true;
  const prozent = Number(document.getElementById('scan-portion').value) / 100;

  // Foto privat in Supabase Storage ablegen (optional – Eintrag klappt auch ohne)
  let fotoPfad = null;
  try {
    const pfad = `${state.user.id}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from('food-photos').upload(pfad, fotoBlob, {
      contentType: 'image/jpeg',
    });
    if (!error) fotoPfad = pfad;
  } catch { /* Upload-Fehler ignorieren */ }

  const { error } = await sb.from('food_entries').insert({
    user_id: state.user.id,
    datum: todayISO(),
    mahlzeit: document.getElementById('scan-mahlzeit').value,
    name: basis.gericht,
    menge_g: Math.round(basis.portionsgroesse_g * prozent),
    kalorien: Math.round(basis.kalorien * prozent),
    protein_g: Math.round(basis.protein_g * prozent),
    carbs_g: Math.round(basis.carbs_g * prozent),
    fett_g: Math.round(basis.fett_g * prozent),
    quelle: 'ki_scan',
    foto_pfad: fotoPfad,
    ki_details: basis,
  });

  btn.disabled = false;
  if (error) {
    toast('Speichern fehlgeschlagen: ' + error.message);
    return;
  }
  toast(`${basis.gericht} eingetragen ✓`);
  zeigeSchritt('start');
  document.getElementById('scan-file').value = '';
  state.date = todayISO();
  await refreshTracker();
  showView('tracker');
}

export function initScan() {
  document.getElementById('scan-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast('Bild zu groß (max. 15 MB)');
      return;
    }
    analysiere(file);
  });

  document.getElementById('scan-portion').addEventListener('input', aktualisiereWerte);
  document.getElementById('scan-save').addEventListener('click', speichere);
  document.getElementById('scan-retry').addEventListener('click', () => {
    document.getElementById('scan-file').value = '';
    zeigeSchritt('start');
  });
}
