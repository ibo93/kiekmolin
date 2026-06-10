// Onboarding: Daten erfassen, Ziele live berechnen, Profil speichern.
import { sb, state, showView, toast, onViewShow, todayISO } from './state.js';
import { berechneZiele, schaetzeZeitfenster, zieldatum } from './calc.js';

function leseFormular() {
  const ziel = document.querySelector('#ob-ziel .goal-btn.active')?.dataset.ziel;
  return {
    alter: parseInt(document.getElementById('ob-alter').value, 10),
    geschlecht: document.getElementById('ob-geschlecht').value,
    groesse: parseFloat(document.getElementById('ob-groesse').value),
    gewicht: parseFloat(document.getElementById('ob-gewicht').value),
    aktivitaet: parseFloat(document.getElementById('ob-aktivitaet').value),
    zielgewicht: parseFloat(document.getElementById('ob-zielgewicht').value) || null,
    ziel,
  };
}

function aktualisiereVorschau() {
  const f = leseFormular();
  const resultCard = document.getElementById('ob-result');
  if (!f.alter || !f.groesse || !f.gewicht || !f.ziel) {
    resultCard.hidden = true;
    return;
  }
  const z = berechneZiele(f);
  resultCard.hidden = false;
  document.getElementById('ob-res-kcal').textContent = z.kalorienziel;
  document.getElementById('ob-res-protein').textContent = z.protein;
  document.getElementById('ob-res-carbs').textContent = z.carbs;
  document.getElementById('ob-res-fett').textContent = z.fett;

  let info = `Grundumsatz ${z.grundumsatz} kcal · TDEE ${z.tdee} kcal.`;
  const zeit = schaetzeZeitfenster({ ...f, tdee: z.tdee, kalorienziel: z.kalorienziel });
  if (zeit) {
    info += ` Realistisch erreichst du ${f.zielgewicht} kg in ca. ${zeit.wochen} Wochen (~${zeit.rate} kg/Woche).`;
  } else if (f.zielgewicht) {
    info += ' Hinweis: Dein Zielgewicht passt nicht zur gewählten Kalorienbilanz.';
  }
  document.getElementById('ob-res-info').textContent = info;
}

export function initOnboarding() {
  // Zielwahl-Buttons
  document.querySelectorAll('#ob-ziel .goal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ob-ziel .goal-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      aktualisiereVorschau();
    });
  });

  document.getElementById('onboarding-form').addEventListener('input', aktualisiereVorschau);

  // Beim Bearbeiten: vorhandene Profilwerte vorbefüllen
  onViewShow('onboarding', () => {
    const p = state.profile;
    if (!p) return;
    document.getElementById('ob-alter').value = p.alter;
    document.getElementById('ob-geschlecht').value = p.geschlecht;
    document.getElementById('ob-groesse').value = p.groesse_cm;
    document.getElementById('ob-gewicht').value = p.gewicht_kg;
    document.getElementById('ob-aktivitaet').value = String(p.aktivitaetslevel);
    document.getElementById('ob-zielgewicht').value = p.zielgewicht_kg ?? '';
    document.querySelectorAll('#ob-ziel .goal-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.ziel === p.ziel)
    );
    aktualisiereVorschau();
  });

  document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = leseFormular();
    if (!f.ziel) {
      toast('Bitte wähle ein Ziel aus');
      return;
    }
    const z = berechneZiele(f);
    const zeit = schaetzeZeitfenster({ ...f, tdee: z.tdee, kalorienziel: z.kalorienziel });

    const row = {
      id: state.user.id,
      alter: f.alter,
      groesse_cm: f.groesse,
      gewicht_kg: f.gewicht,
      geschlecht: f.geschlecht,
      aktivitaetslevel: f.aktivitaet,
      ziel: f.ziel,
      zielgewicht_kg: f.zielgewicht,
      // Startgewicht nur beim ersten Setup festhalten (Basis für Fortschritt),
      // bei späterer Neuberechnung nicht überschreiben.
      startgewicht_kg: state.profile?.startgewicht_kg ?? f.gewicht,
      zieldatum: zeit ? zieldatum(zeit.wochen) : null,
      grundumsatz: z.grundumsatz,
      tdee: z.tdee,
      kalorienziel: z.kalorienziel,
      protein_g: z.protein,
      carbs_g: z.carbs,
      fett_g: z.fett,
      wasserziel_ml: Math.round(f.gewicht * 33 / 50) * 50, // ~33 ml/kg, auf 50 ml gerundet
    };

    const { error } = await sb.from('profiles').upsert(row);
    if (error) {
      toast('Speichern fehlgeschlagen: ' + error.message);
      return;
    }
    state.profile = row;

    // Startgewicht direkt in den Verlauf übernehmen
    await sb.from('weight_entries').upsert(
      { user_id: state.user.id, datum: todayISO(), gewicht_kg: f.gewicht },
      { onConflict: 'user_id,datum' }
    );

    toast('Dein Plan steht!');
    showView('tracker');
  });
}
