// Kalorien-Tracker: Tagesübersicht, Ring, Makros, Mahlzeiten, Wasser.
import {
  db, state, toast, escapeHtml, todayISO, formatDate, verschiebeDatum,
  fetchMitTimeout, authHeaders, onViewShow, haptik, animiereZahl,
} from './state.js';
import { hoereZu, sprachEingabeVerfuegbar, sprich } from './speech.js';
import { wochenBis, zielFortschritt } from './calc.js';
import { sucheLebensmittel, naehrwerteFuer } from './foods.js';

const ZIEL_LABEL = {
  abnehmen: 'Abnehmen',
  muskelaufbau: 'Muskelaufbau',
  rekomposition: 'Rekomposition',
};

const MAHLZEITEN = [
  { key: 'fruehstueck', label: 'Frühstück', icon: 'i-sunrise' },
  { key: 'mittag', label: 'Mittag', icon: 'i-sun' },
  { key: 'abend', label: 'Abend', icon: 'i-moon' },
  { key: 'snack', label: 'Snacks', icon: 'i-cookie' },
];

const RING_UMFANG = 2 * Math.PI * 52; // r=52 aus dem SVG

let favoriten = [];

// Tagesrest (Ziel minus gegessen) – Grundlage für die Coach-Vorschläge
let tagesRest = { kcal: 0, protein: 0, carbs: 0, fett: 0 };

// ---------- Tagesdaten laden & rendern ----------

export async function refreshTracker() {
  if (!state.profile) return; // Ansicht ist ohne Profil nicht sinnvoll
  // Kopfzeile: "Mittwoch, 10. Juni" + Begrüßung (bzw. Datum beim Blättern)
  document.getElementById('tracker-date-long').textContent =
    new Date(state.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('tracker-date-label').textContent =
    state.date === todayISO() ? 'Moin!' : formatDate(state.date);
  document.getElementById('date-next').disabled = state.date >= todayISO();

  // Alles lokal – sofort da, auch offline
  const entries = db.alle('food_entries', (e) => e.datum === state.date);
  const wasser = db.alle('water_entries', (w) => w.datum === state.date)
    .reduce((s, w) => s + w.menge_ml, 0);

  renderZusammenfassung(entries);
  renderWasser(wasser);
  renderMahlzeiten(entries);
  renderZiel();
}

// Ziel-Karte mit Zeitfenster: Wochen bis Ziel + Fortschrittsbalken.
function renderZiel() {
  const p = state.profile;
  const card = document.getElementById('goal-card');
  if (!p.zielgewicht_kg || !p.zieldatum || p.ziel === 'rekomposition') {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  const wochen = wochenBis(p.zieldatum);
  const aktuell = Number(p.gewicht_kg);
  const start = p.startgewicht_kg != null ? Number(p.startgewicht_kg) : aktuell;
  const ziel = Number(p.zielgewicht_kg);
  const offen = Math.abs(ziel - aktuell).toFixed(1);

  document.getElementById('goal-label').textContent =
    `${ZIEL_LABEL[p.ziel]} · Ziel ${ziel} kg`;
  document.getElementById('goal-title').textContent =
    wochen === 0 ? 'Endspurt!' : `Noch ${offen} kg`;
  document.getElementById('goal-weeks').textContent = wochen;

  const fortschritt = zielFortschritt({ start, aktuell, ziel });
  document.getElementById('goal-bar').style.width =
    (fortschritt != null ? Math.round(fortschritt * 100) : 0) + '%';

  const geschafft = Math.abs(aktuell - start).toFixed(1);
  document.getElementById('goal-sub').textContent = fortschritt != null
    ? `${geschafft} kg geschafft · ${start} → ${ziel} kg · Zieldatum ${formatDate(p.zieldatum)}`
    : `Zieldatum ${formatDate(p.zieldatum)}`;
}

function renderZusammenfassung(entries) {
  const p = state.profile;
  const sum = (k) => Math.round(entries.reduce((s, e) => s + Number(e[k] || 0), 0));
  const kcal = sum('kalorien');
  const rest = p.kalorienziel - kcal;

  animiereZahl(document.getElementById('kcal-eaten'), kcal);
  document.getElementById('kcal-goal').textContent = p.kalorienziel;
  document.getElementById('kcal-burned').textContent = '—';
  const restEl = document.getElementById('kcal-rest');
  animiereZahl(restEl, Math.abs(rest));
  restEl.classList.toggle('over', rest < 0);
  document.getElementById('kcal-rest-label').textContent = rest >= 0 ? 'kcal übrig' : 'kcal drüber';

  const ring = document.getElementById('kcal-ring-fg');
  const anteil = Math.min(kcal / p.kalorienziel, 1);
  ring.style.strokeDashoffset = RING_UMFANG * (1 - anteil);
  ring.classList.toggle('over', rest < 0);

  setMakro('p', sum('protein_g'), p.protein_g);
  setMakro('c', sum('carbs_g'), p.carbs_g);
  setMakro('f', sum('fett_g'), p.fett_g);

  tagesRest = {
    kcal: rest,
    protein: p.protein_g - sum('protein_g'),
    carbs: p.carbs_g - sum('carbs_g'),
    fett: p.fett_g - sum('fett_g'),
  };
}

function setMakro(kürzel, ist, soll) {
  document.getElementById(`macro-${kürzel}-label`).textContent = `${ist}/${soll} g`;
  document.getElementById(`macro-${kürzel}-bar`).style.width =
    Math.min((ist / soll) * 100, 100) + '%';
}

function renderWasser(ml) {
  const ziel = state.profile.wasserziel_ml || 2500;
  document.getElementById('water-current').textContent = ml;
  document.getElementById('water-goal').textContent = ziel;
  document.getElementById('water-bar').style.width = Math.min((ml / ziel) * 100, 100) + '%';
}

function renderMahlzeiten(entries) {
  const container = document.getElementById('meals');

  // Designter Leer-Zustand statt vier leerer Karten
  const leerHinweis = entries.length === 0 ? `
    <div class="glass card empty-state">
      <svg class="icon"><use href="#i-sparkle"/></svg>
      <div>
        <h3>Noch nichts getrackt ${state.date === todayISO() ? 'heute' : 'an diesem Tag'}</h3>
        <p class="muted">Scanne dein Gericht mit der Kamera unten – oder trag es oben von Hand ein.</p>
      </div>
    </div>` : '';

  container.innerHTML = leerHinweis + MAHLZEITEN.map(({ key, label, icon }) => {
    const list = entries.filter((e) => e.mahlzeit === key);
    const kcal = Math.round(list.reduce((s, e) => s + Number(e.kalorien), 0));
    const items = list.map((e) => `
      <div class="meal-entry">
        <div>
          <div>${escapeHtml(e.name)}</div>
          <div class="entry-meta">
            ${e.menge_g ? Math.round(e.menge_g) + ' g · ' : ''}P ${Math.round(e.protein_g)} · C ${Math.round(e.carbs_g)} · F ${Math.round(e.fett_g)}
            ${e.quelle === 'ki_scan' ? ' · KI-Scan' : ''}
          </div>
        </div>
        <div class="row">
          <strong>${Math.round(e.kalorien)}</strong>
          ${e.id ? `<button class="entry-del" data-id="${e.id}" aria-label="Löschen"><svg class="icon sm"><use href="#i-x"/></svg></button>` : ''}
        </div>
      </div>`).join('');
    return `
      <div class="glass card meal-card">
        <div class="meal-head">
          <div><h3><svg class="icon"><use href="#${icon}"/></svg> ${label}</h3><small>${kcal} kcal</small></div>
          <button class="btn small" data-add-meal="${key}">+ Hinzufügen</button>
        </div>
        ${items ? `<div class="meal-entries">${items}</div>` : ''}
      </div>`;
  }).join('');
}

// ---------- Eintrag speichern (lokal, sofort) ----------

export async function speichereEintrag(row) {
  db.insert('food_entries', { ...row, datum: state.date });
  haptik();
  return true;
}

// ---------- Modal: manuell / Favoriten / zuletzt gegessen ----------

// Mahlzeit anhand der Uhrzeit vorschlagen
function mahlzeitNachUhrzeit() {
  const h = new Date().getHours();
  if (h < 11) return 'fruehstueck';
  if (h < 15) return 'mittag';
  if (h < 21) return 'abend';
  return 'snack';
}

// Aktuell im Dropdown gewählte Mahlzeit
function gewaehlteMahlzeit() {
  return document.getElementById('food-mahlzeit').value;
}

function öffneFoodModal(mahlzeit) {
  document.getElementById('food-form').reset();
  document.getElementById('food-mahlzeit').value = mahlzeit || mahlzeitNachUhrzeit();
  zeigeFoodTab('manual');
  ladeFavoriten();
  ladeZuletzt();
  document.getElementById('food-modal').showModal();
}

function zeigeFoodTab(tab) {
  for (const t of ['manual', 'favs', 'recent']) {
    document.getElementById(`food-${t}`).hidden = t !== tab;
    document.getElementById(`food-tab-${t}`).classList.toggle('active', t === tab);
  }
  document.getElementById('food-submit').hidden = tab !== 'manual';
}

function ladeFavoriten() {
  const ziel = document.getElementById('food-favs');
  favoriten = db.alle('favorites').sort((a, b) => a.name.localeCompare(b.name));
  ziel.innerHTML = favoriten.length
    ? favoriten.map((f, i) => favHtml(f, `fav:${i}`)).join('')
    : '<p class="muted">Noch keine Favoriten. Hake beim manuellen Eintrag „Als Favorit speichern" an.</p>';
}

let zuletzt = [];
function ladeZuletzt() {
  const ziel = document.getElementById('food-recent');
  const alle = db.alle('food_entries')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  // Duplikate nach Name entfernen
  const seen = new Set();
  zuletzt = alle.filter((e) => !seen.has(e.name) && seen.add(e.name)).slice(0, 12);
  ziel.innerHTML = zuletzt.length
    ? zuletzt.map((f, i) => favHtml(f, `recent:${i}`)).join('')
    : '<p class="muted">Noch keine Einträge.</p>';
}

function favHtml(f, ref) {
  return `
    <button type="button" class="fav-item" data-ref="${ref}">
      <span>${escapeHtml(f.name)}<br><small>${f.menge_g ? Math.round(f.menge_g) + ' g · ' : ''}P ${Math.round(f.protein_g)} · C ${Math.round(f.carbs_g)} · F ${Math.round(f.fett_g)}</small></span>
      <strong>${Math.round(f.kalorien)} kcal</strong>
    </button>`;
}

async function übernehmeVorlage(ref) {
  const [art, idx] = ref.split(':');
  const f = (art === 'fav' ? favoriten : zuletzt)[Number(idx)];
  if (!f) return;
  const ok = await speichereEintrag({
    mahlzeit: gewaehlteMahlzeit(),
    name: f.name,
    menge_g: f.menge_g,
    kalorien: f.kalorien,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fett_g: f.fett_g,
    quelle: 'favorit',
  });
  if (ok) {
    document.getElementById('food-modal').close();
    toast(`${f.name} eingetragen ✓`);
    refreshTracker();
  }
}

// ---------- Spracheingabe + KI-Schätzung im Modal ----------

async function starteDiktat() {
  const micBtn = document.getElementById('food-mic');
  // Falls der Browser keine eigene Spracherkennung hat (häufig iPhone/Safari):
  // Eingabefeld fokussieren, damit der Nutzer das Tastatur-Mikrofon nutzt.
  if (!sprachEingabeVerfuegbar) {
    document.getElementById('food-name').focus();
    toast('Tippe ins Feld und nutze das Mikrofon-Symbol auf deiner Tastatur zum Diktieren');
    return;
  }
  try {
    const text = await hoereZu({
      onStart: () => micBtn.classList.add('listening'),
      onEnd: () => micBtn.classList.remove('listening'),
    });
    document.getElementById('food-name').value = text;
    schaetzePerKI(); // direkt schätzen – eine Handbewegung weniger
  } catch (err) {
    micBtn.classList.remove('listening');
    toast(err.message);
  }
}

async function schaetzePerKI() {
  const text = document.getElementById('food-name').value.trim();
  if (!text) { toast('Beschreibe zuerst das Gericht'); return; }
  if (!navigator.onLine) { toast('KI-Schätzung braucht Internet'); return; }

  const btn = document.getElementById('food-ki');
  btn.disabled = true;
  try {
    const res = await fetchMitTimeout('/api/analyze-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fehler ${res.status}`);
    }
    const e = await res.json();
    if (!e.erkannt) { toast('Das klingt nicht nach Essen – beschreibe es genauer'); return; }

    document.getElementById('food-name').value = e.gericht;
    document.getElementById('food-menge').value = e.portionsgroesse_g;
    document.getElementById('food-kcal').value = e.kalorien;
    document.getElementById('food-protein').value = e.protein_g;
    document.getElementById('food-carbs').value = e.carbs_g;
    document.getElementById('food-fett').value = e.fett_g;
    toast('KI-Schätzung übernommen – prüfe die Werte');
    sprich(`${e.gericht}, geschätzt ${e.kalorien} Kilokalorien und ${e.protein_g} Gramm Protein.`);
  } catch (err) {
    toast('KI-Schätzung fehlgeschlagen: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Coach: "Was soll ich heute noch essen?" ----------

let coachVorschlaege = [];

async function oeffneCoach() {
  if (!navigator.onLine) { toast('Der Coach braucht eine Internetverbindung'); return; }
  const status = document.getElementById('coach-status');
  const liste = document.getElementById('coach-list');
  liste.innerHTML = '';
  status.textContent = 'Dein Coach überlegt …';
  document.getElementById('coach-modal').showModal();

  try {
    const res = await fetchMitTimeout('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        ziel: state.profile.ziel,
        kalorienziel: state.profile.kalorienziel,
        rest_kalorien: tagesRest.kcal,
        rest_protein: tagesRest.protein,
        rest_carbs: tagesRest.carbs,
        rest_fett: tagesRest.fett,
        uhrzeit: new Date().getHours(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fehler ${res.status}`);
    }
    const data = await res.json();
    coachVorschlaege = data.vorschlaege || [];
    status.textContent = data.hinweis || '';
    liste.innerHTML = coachVorschlaege.map((v, i) => `
      <div class="coach-item">
        <div class="row">
          <strong>${escapeHtml(v.gericht)}</strong>
          <span class="coach-kcal">${Math.round(v.kalorien)} kcal</span>
        </div>
        <p class="muted">${escapeHtml(v.beschreibung)}</p>
        <div class="row">
          <small class="muted">P ${Math.round(v.protein_g)} · C ${Math.round(v.carbs_g)} · F ${Math.round(v.fett_g)}</small>
          <button type="button" class="btn small" data-coach="${i}">+ Eintragen</button>
        </div>
      </div>`).join('');
  } catch (err) {
    status.textContent = 'Coach gerade nicht erreichbar: ' + err.message;
  }
}

async function uebernehmeCoachVorschlag(i) {
  const v = coachVorschlaege[i];
  if (!v) return;
  const ok = await speichereEintrag({
    mahlzeit: mahlzeitNachUhrzeit(),
    name: v.gericht,
    menge_g: null,
    kalorien: v.kalorien,
    protein_g: v.protein_g,
    carbs_g: v.carbs_g,
    fett_g: v.fett_g,
    quelle: 'manuell',
  });
  if (ok) {
    document.getElementById('coach-modal').close();
    toast(`${v.gericht} eingetragen ✓`);
    refreshTracker();
  }
}

// ---------- Initialisierung ----------

export function initTracker() {
  // Coach-Vorschläge
  document.getElementById('coach-btn').addEventListener('click', oeffneCoach);
  document.getElementById('coach-close').addEventListener('click', () =>
    document.getElementById('coach-modal').close()
  );
  document.getElementById('coach-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-coach]');
    if (btn) uebernehmeCoachVorschlag(Number(btn.dataset.coach));
  });
  onViewShow('tracker', refreshTracker);

  // Datum blättern
  document.getElementById('date-prev').addEventListener('click', () => {
    state.date = verschiebeDatum(state.date, -1);
    refreshTracker();
  });
  document.getElementById('date-next').addEventListener('click', () => {
    if (state.date >= todayISO()) return;
    state.date = verschiebeDatum(state.date, 1);
    refreshTracker();
  });

  // Wasser-Buttons
  document.querySelectorAll('[data-water]').forEach((btn) => {
    btn.addEventListener('click', () => {
      db.insert('water_entries', { datum: state.date, menge_ml: Number(btn.dataset.water) });
      haptik();
      refreshTracker();
    });
  });

  // Mahlzeit hinzufügen / Eintrag löschen (delegiert)
  document.getElementById('meals').addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add-meal]');
    if (addBtn) { öffneFoodModal(addBtn.dataset.addMeal); return; }

    const delBtn = e.target.closest('.entry-del');
    if (delBtn) {
      db.delete('food_entries', delBtn.dataset.id);
      refreshTracker();
    }
  });

  // Großer „+ Essen eintragen"-Button (Mahlzeit nach Uhrzeit vorgewählt)
  document.getElementById('add-food-quick').addEventListener('click', () => öffneFoodModal());

  // Spracheingabe + KI-Schätzung – Mikro-Button immer sichtbar
  // (auf iPhone/Safari springt er aufs Tastatur-Mikrofon, siehe starteDiktat)
  document.getElementById('food-mic').hidden = false;
  document.getElementById('food-mic').addEventListener('click', starteDiktat);
  document.getElementById('food-ki').addEventListener('click', schaetzePerKI);

  // ---------- Eingebaute Lebensmittel-Suche ----------
  // Beim Tippen Treffer aus der lokalen Datenbank zeigen (offline, ohne KI).
  // Tap übernimmt Name + Portion + Nährwerte; Mengen-Änderung rechnet live mit.
  let dbAuswahl = null; // aktuell gewähltes DB-Lebensmittel (Basis pro 100 g)
  const nameInput = document.getElementById('food-name');
  const mengeInput = document.getElementById('food-menge');
  const suggestBox = document.getElementById('food-suggest');

  function zeigeVorschlaege() {
    const q = nameInput.value;
    const treffer = q.trim().length >= 2 ? sucheLebensmittel(q) : [];
    suggestBox.hidden = !treffer.length;
    suggestBox.innerHTML = treffer.map((f, i) => `
      <button type="button" class="suggest-item" data-suggest="${i}">
        <span>${escapeHtml(f.name)}</span>
        <small>${f.kcal} kcal · ${f.protein} P / 100 g</small>
      </button>`).join('');
    suggestBox._treffer = treffer;
  }

  function setzeWerte(food, gramm) {
    const w = naehrwerteFuer(food, gramm);
    document.getElementById('food-kcal').value = w.kalorien;
    document.getElementById('food-protein').value = w.protein_g;
    document.getElementById('food-carbs').value = w.carbs_g;
    document.getElementById('food-fett').value = w.fett_g;
  }

  nameInput.addEventListener('input', () => {
    dbAuswahl = null; // Nutzer tippt selbst → Kopplung an DB-Eintrag lösen
    zeigeVorschlaege();
  });

  suggestBox.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-suggest]');
    if (!btn) return;
    const food = suggestBox._treffer?.[Number(btn.dataset.suggest)];
    if (!food) return;
    dbAuswahl = food;
    nameInput.value = food.name;
    mengeInput.value = food.portion; // übliche Portion vorbelegen
    setzeWerte(food, food.portion);
    suggestBox.hidden = true;
    suggestBox.innerHTML = `<p class="suggest-hint">Werte pro ${food.portion} g – Menge anpassen, Rest rechnet mit.</p>`;
    suggestBox.hidden = false;
    haptik();
  });

  // Menge geändert? Solange ein DB-Eintrag gewählt ist, alles neu berechnen.
  mengeInput.addEventListener('input', () => {
    if (!dbAuswahl) return;
    const g = parseFloat(mengeInput.value);
    if (g > 0 && g <= 5000) setzeWerte(dbAuswahl, g);
  });

  // Beim Öffnen des Modals Suche zurücksetzen
  document.getElementById('food-modal').addEventListener('close', () => {
    dbAuswahl = null;
    suggestBox.hidden = true;
    suggestBox.innerHTML = '';
  });

  // Modal-Tabs
  document.getElementById('food-tab-manual').addEventListener('click', () => zeigeFoodTab('manual'));
  document.getElementById('food-tab-favs').addEventListener('click', () => zeigeFoodTab('favs'));
  document.getElementById('food-tab-recent').addEventListener('click', () => zeigeFoodTab('recent'));
  document.getElementById('food-cancel').addEventListener('click', () =>
    document.getElementById('food-modal').close()
  );

  // Favoriten / zuletzt anklicken
  document.getElementById('food-modal').addEventListener('click', (e) => {
    const item = e.target.closest('.fav-item');
    if (item) übernehmeVorlage(item.dataset.ref);
  });

  // Manueller Eintrag (Doppel-Tap-Schutz: Button sperren, solange gespeichert wird)
  document.getElementById('food-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('food-submit');
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    try {
      const name = document.getElementById('food-name').value.trim();
      const row = {
        mahlzeit: gewaehlteMahlzeit(),
        name,
        menge_g: parseFloat(document.getElementById('food-menge').value) || null,
        kalorien: parseFloat(document.getElementById('food-kcal').value) || 0,
        protein_g: parseFloat(document.getElementById('food-protein').value) || 0,
        carbs_g: parseFloat(document.getElementById('food-carbs').value) || 0,
        fett_g: parseFloat(document.getElementById('food-fett').value) || 0,
        quelle: 'manuell',
      };
      const ok = await speichereEintrag(row);
      if (!ok) return;

      if (document.getElementById('food-fav').checked) {
        db.upsert('favorites', {
          name,
          menge_g: row.menge_g, kalorien: row.kalorien,
          protein_g: row.protein_g, carbs_g: row.carbs_g, fett_g: row.fett_g,
        }, ['name']);
      }

      document.getElementById('food-modal').close();
      toast('Eintrag gespeichert ✓');
      refreshTracker();
    } finally {
      submitBtn.disabled = false;
    }
  });
}
