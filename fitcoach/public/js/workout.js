// Training: Plan-Vorlagen (Push/Pull/Beine, Ganzkörper), Sätze loggen, abhaken.
// Alles lokal auf dem Gerät – sofort da, auch offline.
import { db, toast, escapeHtml, todayISO, onViewShow, haptik } from './state.js';

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

function starteWorkout(vorlage) {
  const workout = db.insert('workouts', {
    datum: todayISO(),
    plan_name: vorlage.name,
    abgeschlossen: false,
  });

  // Letzte Gewichte derselben Übungen als Vorbelegung laden
  const alleSets = db.alle('workout_sets')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const vorbelegung = {};
  for (const s of alleSets) {
    if (vorlage.uebungen.includes(s.uebung) && !vorbelegung[s.uebung]) {
      vorbelegung[s.uebung] = { gewicht: s.gewicht_kg, wdh: s.wiederholungen };
    }
  }

  const sets = [];
  for (const uebung of vorlage.uebungen) {
    for (let nr = 1; nr <= SAETZE_PRO_UEBUNG; nr++) {
      sets.push(db.insert('workout_sets', {
        workout_id: workout.id,
        uebung,
        satz_nr: nr,
        gewicht_kg: vorbelegung[uebung]?.gewicht ?? null,
        wiederholungen: vorbelegung[uebung]?.wdh ?? null,
        erledigt: false,
      }));
    }
  }

  aktivesWorkout = { ...workout, sets };
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
        <h3><svg class="icon"><use href="#i-flame"/></svg> ${escapeHtml(aktivesWorkout.plan_name)}</h3>
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

function speichereSatz(setId, feld, wert) {
  const s = aktivesWorkout.sets.find((x) => x.id === setId);
  if (!s) return;
  s[feld] = wert;
  db.update('workout_sets', setId, { [feld]: wert });
}

function beendeWorkout(abgebrochen) {
  if (abgebrochen) {
    db.delete('workouts', aktivesWorkout.id);
    db.deleteWo('workout_sets', (s) => s.workout_id === aktivesWorkout.id);
  } else {
    db.update('workouts', aktivesWorkout.id, { abgeschlossen: true });
    haptik(25);
    toast('Workout abgeschlossen – stark!');
  }
  aktivesWorkout = null;
  document.getElementById('workout-active').hidden = true;
  document.getElementById('workout-templates').hidden = false;
  ladeHistorie();
}

// ---------- Historie ----------

function ladeHistorie() {
  const liste = db.alle('workouts', (w) => w.abgeschlossen)
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 10);
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

  aktiv.addEventListener('click', (e) => {
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
      if (s.erledigt) haptik();
      db.update('workout_sets', setId, { erledigt: s.erledigt });
    }
  });
}
