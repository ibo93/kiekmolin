// Training: Plan-Vorlagen (Push/Pull/Beine, Ganzkörper), Sätze loggen, abhaken.
import { sb, state, toast, escapeHtml, todayISO, onViewShow } from './state.js';

const VORLAGEN = [
  {
    name: 'Push',
    beschreibung: 'Brust, Schultern, Trizeps',
    uebungen: ['Bankdrücken', 'Schulterdrücken', 'Schrägbankdrücken KH', 'Seitheben', 'Trizepsdrücken am Kabel'],
  },
  {
    name: 'Pull',
    beschreibung: 'Rücken, Bizeps',
    uebungen: ['Klimmzüge / Latzug', 'Rudern Langhantel', 'Rudern am Kabel', 'Face Pulls', 'Bizepscurls'],
  },
  {
    name: 'Beine',
    beschreibung: 'Quadrizeps, Beinbeuger, Waden',
    uebungen: ['Kniebeugen', 'Rumänisches Kreuzheben', 'Beinpresse', 'Beincurls', 'Wadenheben'],
  },
  {
    name: 'Ganzkörper A',
    beschreibung: 'Alle großen Muskelgruppen',
    uebungen: ['Kniebeugen', 'Bankdrücken', 'Rudern Langhantel', 'Schulterdrücken', 'Plank'],
  },
  {
    name: 'Ganzkörper B',
    beschreibung: 'Alle großen Muskelgruppen',
    uebungen: ['Kreuzheben', 'Schrägbankdrücken', 'Latzug', 'Ausfallschritte', 'Bizepscurls'],
  },
];

const SAETZE_PRO_UEBUNG = 3;
let aktivesWorkout = null; // { id, plan_name, sets: [...] }

// ---------- Vorlagen-Liste ----------

function renderVorlagen() {
  document.getElementById('workout-templates').innerHTML = VORLAGEN.map((v, i) => `
    <div class="glass card template-card" data-template="${i}">
      <div class="row">
        <div>
          <h3>${v.name}</h3>
          <p class="exercises">${v.uebungen.join(' · ')}</p>
        </div>
        <button class="btn small primary">Start</button>
      </div>
    </div>`).join('');
}

// ---------- Workout starten ----------

async function starteWorkout(vorlage) {
  if (!navigator.onLine) { toast('Workout-Logging braucht Internet'); return; }

  const { data: workout, error } = await sb.from('workouts')
    .insert({ user_id: state.user.id, datum: todayISO(), plan_name: vorlage.name })
    .select()
    .single();
  if (error) { toast('Fehler: ' + error.message); return; }

  // Letzte Gewichte derselben Übungen als Vorbelegung laden
  const { data: letzte } = await sb.from('workout_sets')
    .select('uebung, gewicht_kg, wiederholungen, created_at')
    .in('uebung', vorlage.uebungen)
    .order('created_at', { ascending: false })
    .limit(100);
  const vorbelegung = {};
  for (const s of letzte || []) {
    vorbelegung[s.uebung] ||= { gewicht: s.gewicht_kg, wdh: s.wiederholungen };
  }

  const sets = [];
  for (const uebung of vorlage.uebungen) {
    for (let nr = 1; nr <= SAETZE_PRO_UEBUNG; nr++) {
      sets.push({
        workout_id: workout.id,
        user_id: state.user.id,
        uebung,
        satz_nr: nr,
        gewicht_kg: vorbelegung[uebung]?.gewicht ?? null,
        wiederholungen: vorbelegung[uebung]?.wdh ?? null,
        erledigt: false,
      });
    }
  }
  const { data: inserted, error: setErr } = await sb.from('workout_sets').insert(sets).select();
  if (setErr) { toast('Fehler: ' + setErr.message); return; }

  aktivesWorkout = { ...workout, sets: inserted };
  renderAktiv();
}

function renderAktiv() {
  const wrap = document.getElementById('workout-active');
  document.getElementById('workout-templates').hidden = true;
  wrap.hidden = false;

  const uebungen = [...new Set(aktivesWorkout.sets.map((s) => s.uebung))];
  wrap.innerHTML = `
    <div class="glass card stack">
      <div class="row">
        <h3>🔥 ${escapeHtml(aktivesWorkout.plan_name)}</h3>
        <button class="btn small ghost" id="workout-abort">Abbrechen</button>
      </div>
      ${uebungen.map((u) => `
        <div class="exercise-block">
          <h4>${escapeHtml(u)}</h4>
          ${aktivesWorkout.sets.filter((s) => s.uebung === u).map((s) => `
            <div class="set-row" data-set="${s.id}">
              <span class="muted">${s.satz_nr}.</span>
              <input type="number" inputmode="decimal" placeholder="kg" step="0.5" min="0"
                     value="${s.gewicht_kg ?? ''}" data-field="gewicht_kg">
              <input type="number" inputmode="numeric" placeholder="Wdh" min="0"
                     value="${s.wiederholungen ?? ''}" data-field="wiederholungen">
              <button type="button" class="set-check ${s.erledigt ? 'done' : ''}">✓</button>
            </div>`).join('')}
        </div>`).join('')}
      <button class="btn primary full big-btn" id="workout-finish">Workout abschließen ✓</button>
    </div>`;
}

async function speichereSatz(setId, feld, wert) {
  const s = aktivesWorkout.sets.find((x) => x.id === setId);
  if (!s) return;
  s[feld] = wert;
  await sb.from('workout_sets').update({ [feld]: wert }).eq('id', setId);
}

async function beendeWorkout(abgebrochen) {
  if (abgebrochen) {
    await sb.from('workouts').delete().eq('id', aktivesWorkout.id); // löscht Sätze per Cascade
  } else {
    await sb.from('workouts').update({ abgeschlossen: true }).eq('id', aktivesWorkout.id);
    toast('Workout abgeschlossen – stark! 💪');
  }
  aktivesWorkout = null;
  document.getElementById('workout-active').hidden = true;
  document.getElementById('workout-templates').hidden = false;
  ladeHistorie();
}

// ---------- Historie ----------

async function ladeHistorie() {
  if (!navigator.onLine) return;
  const { data } = await sb.from('workouts')
    .select('datum, plan_name, abgeschlossen')
    .order('datum', { ascending: false })
    .limit(10);
  const liste = (data || []).filter((w) => w.abgeschlossen);
  document.getElementById('workout-history').innerHTML = liste.length
    ? liste.map((w) => `
        <div class="history-entry">
          <span>${escapeHtml(w.plan_name)}</span>
          <span class="muted">${w.datum.split('-').reverse().join('.')}</span>
        </div>`).join('')
    : '<p class="muted">Noch keine Workouts.</p>';
}

// ---------- Initialisierung ----------

export function initWorkout() {
  renderVorlagen();
  onViewShow('workout', ladeHistorie);

  document.getElementById('workout-templates').addEventListener('click', (e) => {
    const card = e.target.closest('[data-template]');
    if (card) starteWorkout(VORLAGEN[Number(card.dataset.template)]);
  });

  const aktiv = document.getElementById('workout-active');

  aktiv.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const setId = input.closest('.set-row').dataset.set;
    const wert = input.value === '' ? null : Number(input.value);
    speichereSatz(setId, input.dataset.field, wert);
  });

  aktiv.addEventListener('click', async (e) => {
    if (e.target.id === 'workout-finish') { beendeWorkout(false); return; }
    if (e.target.id === 'workout-abort') {
      if (confirm('Workout abbrechen? Die Sätze werden verworfen.')) beendeWorkout(true);
      return;
    }
    const check = e.target.closest('.set-check');
    if (check) {
      const setId = check.closest('.set-row').dataset.set;
      const s = aktivesWorkout.sets.find((x) => x.id === setId);
      s.erledigt = !s.erledigt;
      check.classList.toggle('done', s.erledigt);
      await sb.from('workout_sets').update({ erledigt: s.erledigt }).eq('id', setId);
    }
  });
}
