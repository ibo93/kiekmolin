// Kalorien-Tracker: Tagesübersicht, Ring, Makros, Mahlzeiten, Wasser.
import {
  sb, state, toast, escapeHtml, todayISO, formatDate,
  onViewShow, queueInsert, getQueued,
} from './state.js';
import { hoereZu, sprachEingabeVerfuegbar, sprich } from './speech.js';

const MAHLZEITEN = [
  { key: 'fruehstueck', label: 'Frühstück', icon: 'i-sunrise' },
  { key: 'mittag', label: 'Mittag', icon: 'i-sun' },
  { key: 'abend', label: 'Abend', icon: 'i-moon' },
  { key: 'snack', label: 'Snacks', icon: 'i-cookie' },
];

const RING_UMFANG = 2 * Math.PI * 52; // r=52 aus dem SVG

let aktuelleMahlzeit = 'snack';
let favoriten = [];

// ---------- Tagesdaten laden & rendern ----------

export async function refreshTracker() {
  document.getElementById('tracker-date-label').textContent = formatDate(state.date);
  document.getElementById('date-next').disabled = state.date >= todayISO();

  let entries = [];
  let wasser = 0;

  if (navigator.onLine) {
    const [foodRes, waterRes] = await Promise.all([
      sb.from('food_entries').select('*').eq('datum', state.date).order('created_at'),
      sb.from('water_entries').select('menge_ml').eq('datum', state.date),
    ]);
    entries = foodRes.data || [];
    wasser = (waterRes.data || []).reduce((s, w) => s + w.menge_ml, 0);
  }

  // Offline erfasste, noch nicht synchronisierte Einträge ergänzen
  const queuedFood = getQueued('food_entries', state.date).map((r) => ({ ...r, _pending: true }));
  const queuedWater = getQueued('water_entries', state.date);
  entries = entries.concat(queuedFood);
  wasser += queuedWater.reduce((s, w) => s + w.menge_ml, 0);

  renderZusammenfassung(entries);
  renderWasser(wasser);
  renderMahlzeiten(entries);
}

function renderZusammenfassung(entries) {
  const p = state.profile;
  const sum = (k) => Math.round(entries.reduce((s, e) => s + Number(e[k] || 0), 0));
  const kcal = sum('kalorien');
  const rest = p.kalorienziel - kcal;

  document.getElementById('kcal-eaten').textContent = kcal;
  document.getElementById('kcal-goal').textContent = p.kalorienziel;
  document.getElementById('kcal-burned').textContent = '—';
  const restEl = document.getElementById('kcal-rest');
  restEl.textContent = Math.abs(rest);
  restEl.classList.toggle('over', rest < 0);
  document.getElementById('kcal-rest-label').textContent = rest >= 0 ? 'kcal übrig' : 'kcal drüber';

  const ring = document.getElementById('kcal-ring-fg');
  const anteil = Math.min(kcal / p.kalorienziel, 1);
  ring.style.strokeDashoffset = RING_UMFANG * (1 - anteil);
  ring.classList.toggle('over', rest < 0);

  setMakro('p', sum('protein_g'), p.protein_g);
  setMakro('c', sum('carbs_g'), p.carbs_g);
  setMakro('f', sum('fett_g'), p.fett_g);
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
  container.innerHTML = MAHLZEITEN.map(({ key, label, icon }) => {
    const list = entries.filter((e) => e.mahlzeit === key);
    const kcal = Math.round(list.reduce((s, e) => s + Number(e.kalorien), 0));
    const items = list.map((e) => `
      <div class="meal-entry">
        <div>
          <div>${escapeHtml(e.name)} ${e._pending ? '<span class="pending-badge">ausstehend</span>' : ''}</div>
          <div class="entry-meta">
            ${e.menge_g ? Math.round(e.menge_g) + ' g · ' : ''}P ${Math.round(e.protein_g)} · C ${Math.round(e.carbs_g)} · F ${Math.round(e.fett_g)}
            ${e.quelle === 'ki_scan' ? ' · KI-Scan' : ''}${e.quelle === 'ki_text' ? ' · KI' : ''}
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

// ---------- Eintrag speichern (online direkt, offline in die Queue) ----------

export async function speichereEintrag(row) {
  row.user_id = state.user.id;
  row.datum = state.date;
  if (navigator.onLine) {
    const { error } = await sb.from('food_entries').insert(row);
    if (error) {
      toast('Fehler: ' + error.message);
      return false;
    }
  } else {
    queueInsert('food_entries', row);
  }
  return true;
}

// ---------- Modal: manuell / Favoriten / zuletzt gegessen ----------

function öffneFoodModal(mahlzeit) {
  aktuelleMahlzeit = mahlzeit;
  document.getElementById('food-form').reset();
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

async function ladeFavoriten() {
  const ziel = document.getElementById('food-favs');
  if (!navigator.onLine) { ziel.innerHTML = '<p class="muted">Offline nicht verfügbar.</p>'; return; }
  const { data } = await sb.from('favorites').select('*').order('name');
  favoriten = data || [];
  ziel.innerHTML = favoriten.length
    ? favoriten.map((f, i) => favHtml(f, `fav:${i}`)).join('')
    : '<p class="muted">Noch keine Favoriten. Hake beim manuellen Eintrag „Als Favorit speichern" an.</p>';
}

let zuletzt = [];
async function ladeZuletzt() {
  const ziel = document.getElementById('food-recent');
  if (!navigator.onLine) { ziel.innerHTML = '<p class="muted">Offline nicht verfügbar.</p>'; return; }
  const { data } = await sb.from('food_entries')
    .select('name, menge_g, kalorien, protein_g, carbs_g, fett_g')
    .order('created_at', { ascending: false })
    .limit(30);
  // Duplikate nach Name entfernen
  const seen = new Set();
  zuletzt = (data || []).filter((e) => !seen.has(e.name) && seen.add(e.name)).slice(0, 12);
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
    mahlzeit: aktuelleMahlzeit,
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Nicht eingeloggt');
    const res = await fetch('/api/analyze-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
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
    toast('KI-Schätzung fehlgeschlagen: ' + (err.name === 'AbortError' ? 'Zeitüberschreitung' : err.message));
  } finally {
    clearTimeout(timeout);
    btn.disabled = false;
  }
}

// ---------- Initialisierung ----------

export function initTracker() {
  onViewShow('tracker', refreshTracker);

  // Datum blättern
  document.getElementById('date-prev').addEventListener('click', () => {
    const d = new Date(state.date);
    d.setDate(d.getDate() - 1);
    state.date = d.toISOString().slice(0, 10);
    refreshTracker();
  });
  document.getElementById('date-next').addEventListener('click', () => {
    if (state.date >= todayISO()) return;
    const d = new Date(state.date);
    d.setDate(d.getDate() + 1);
    state.date = d.toISOString().slice(0, 10);
    refreshTracker();
  });

  // Wasser-Buttons
  document.querySelectorAll('[data-water]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = { user_id: state.user.id, datum: state.date, menge_ml: Number(btn.dataset.water) };
      if (navigator.onLine) {
        const { error } = await sb.from('water_entries').insert(row);
        if (error) { toast('Fehler: ' + error.message); return; }
      } else {
        queueInsert('water_entries', row);
      }
      refreshTracker();
    });
  });

  // Mahlzeit hinzufügen / Eintrag löschen (delegiert)
  document.getElementById('meals').addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add-meal]');
    if (addBtn) { öffneFoodModal(addBtn.dataset.addMeal); return; }

    const delBtn = e.target.closest('.entry-del');
    if (delBtn) {
      await sb.from('food_entries').delete().eq('id', delBtn.dataset.id);
      refreshTracker();
    }
  });

  // Spracheingabe + KI-Schätzung
  const micBtn = document.getElementById('food-mic');
  micBtn.hidden = !sprachEingabeVerfuegbar;
  micBtn.addEventListener('click', starteDiktat);
  document.getElementById('food-ki').addEventListener('click', schaetzePerKI);

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

  // Manueller Eintrag
  document.getElementById('food-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('food-name').value.trim();
    const row = {
      mahlzeit: aktuelleMahlzeit,
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

    if (document.getElementById('food-fav').checked && navigator.onLine) {
      await sb.from('favorites').upsert(
        {
          user_id: state.user.id, name,
          menge_g: row.menge_g, kalorien: row.kalorien,
          protein_g: row.protein_g, carbs_g: row.carbs_g, fett_g: row.fett_g,
        },
        { onConflict: 'user_id,name' }
      );
    }

    document.getElementById('food-modal').close();
    toast('Eintrag gespeichert ✓');
    refreshTracker();
  });
}
