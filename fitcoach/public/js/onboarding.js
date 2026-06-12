// Onboarding: Daten erfassen, Ziele live berechnen, Profil speichern.
import { db, state, showView, toast, onViewShow, todayISO, setProfil } from './state.js';
import {
  berechneZiele, schaetzeZeitfenster, zieldatum,
  kalorienzielFuerZeitraum, makros,
} from './calc.js';

function leseFormular() {
  const ziel = document.querySelector('#ob-ziel .goal-btn.active')?.dataset.ziel;
  return {
    alter: parseInt(document.getElementById('ob-alter').value, 10),
    geschlecht: document.getElementById('ob-geschlecht').value,
    groesse: parseFloat(document.getElementById('ob-groesse').value),
    gewicht: parseFloat(document.getElementById('ob-gewicht').value),
    aktivitaet: parseFloat(document.getElementById('ob-aktivitaet').value),
    zielgewicht: parseFloat(document.getElementById('ob-zielgewicht').value) || null,
    tempo: document.getElementById('ob-tempo').value,
    wochen: parseInt(document.getElementById('ob-wochen').value, 10) || null,
    ziel,
  };
}

// Plan aus den Formularwerten: entweder empfohlenes Tempo oder der vom
// Nutzer gewählte Zeitraum ("X kg in Y Wochen"), mit ehrlicher Prüfung.
function berechnePlan(f) {
  const basis = berechneZiele(f);
  const eigenAktiv = f.tempo === 'eigen' && f.zielgewicht && f.wochen && f.ziel !== 'rekomposition';
  if (!eigenAktiv) return { ...basis, eigenerZeitraum: null };

  const z = kalorienzielFuerZeitraum({
    gewicht: f.gewicht, zielgewicht: f.zielgewicht,
    wochen: f.wochen, tdee: basis.tdee, geschlecht: f.geschlecht,
  });
  if (!z) return { ...basis, eigenerZeitraum: null };

  return {
    ...basis,
    kalorienziel: z.kalorienziel,
    ...makros(z.kalorienziel, f.gewicht, f.ziel),
    eigenerZeitraum: z,
  };
}

function tempoHinweis(z, f) {
  const el = document.getElementById('ob-tempo-check');
  if (!z) { el.hidden = true; return; }
  el.hidden = false;
  const diff = Math.abs(f.zielgewicht - f.gewicht).toFixed(1);
  if (z.status === 'zu_schnell') {
    el.textContent = `${diff} kg in ${f.wochen} Wochen ist zu schnell, um gesund zu bleiben. `
      + `Ich plane mit dem sicheren Maximum: realistisch sind ca. ${z.sichereWochen} Wochen.`;
    el.style.color = 'var(--danger)';
  } else if (z.status === 'ambitioniert') {
    el.textContent = `Sportlich, aber machbar: ${z.bilanz} kcal/Tag Bilanz (~${z.rate.toFixed(2)} kg/Woche). Zieh es konsequent durch.`;
    el.style.color = 'var(--warn)';
  } else {
    el.textContent = `Gut machbar: ${z.bilanz} kcal/Tag Bilanz, ~${z.rate.toFixed(2)} kg/Woche.`;
    el.style.color = 'var(--text-muted)';
  }
}

function aktualisiereVorschau() {
  const f = leseFormular();
  document.getElementById('ob-wochen-wrap').hidden = f.tempo !== 'eigen';

  const resultCard = document.getElementById('ob-result');
  if (!f.alter || !f.groesse || !f.gewicht || !f.ziel) {
    resultCard.hidden = true;
    document.getElementById('ob-tempo-check').hidden = true;
    return;
  }
  const z = berechnePlan(f);
  tempoHinweis(z.eigenerZeitraum, f);

  resultCard.hidden = false;
  document.getElementById('ob-res-kcal').textContent = z.kalorienziel;
  document.getElementById('ob-res-protein').textContent = z.protein;
  document.getElementById('ob-res-carbs').textContent = z.carbs;
  document.getElementById('ob-res-fett').textContent = z.fett;

  let info = `Grundumsatz ${z.grundumsatz} kcal · TDEE ${z.tdee} kcal.`;
  if (z.eigenerZeitraum) {
    const e = z.eigenerZeitraum;
    const wochen = e.status === 'zu_schnell' ? e.sichereWochen : f.wochen;
    info += ` Dein Weg: ${z.kalorienziel} kcal/Tag → ${f.zielgewicht} kg in ca. ${wochen} Wochen.`;
  } else {
    const zeit = schaetzeZeitfenster({ ...f, tdee: z.tdee, kalorienziel: z.kalorienziel });
    if (zeit) {
      info += ` Realistisch erreichst du ${f.zielgewicht} kg in ca. ${zeit.wochen} Wochen (~${zeit.rate} kg/Woche).`;
    } else if (f.zielgewicht) {
      info += ' Hinweis: Dein Zielgewicht passt nicht zur gewählten Kalorienbilanz.';
    }
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

  document.getElementById('onboarding-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = leseFormular();
    if (!f.ziel) {
      toast('Bitte wähle ein Ziel aus');
      return;
    }
    const z = berechnePlan(f);
    // Zieldatum: eigener Zeitraum (ggf. auf das gesunde Maximum verlängert)
    // oder die automatische Schätzung
    let planWochen = null;
    if (z.eigenerZeitraum) {
      planWochen = z.eigenerZeitraum.status === 'zu_schnell'
        ? z.eigenerZeitraum.sichereWochen
        : f.wochen;
    } else {
      const zeit = schaetzeZeitfenster({ ...f, tdee: z.tdee, kalorienziel: z.kalorienziel });
      planWochen = zeit ? zeit.wochen : null;
    }

    const row = {
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
      zieldatum: planWochen ? zieldatum(planWochen) : null,
      grundumsatz: z.grundumsatz,
      tdee: z.tdee,
      kalorienziel: z.kalorienziel,
      protein_g: z.protein,
      carbs_g: z.carbs,
      fett_g: z.fett,
      wasserziel_ml: Math.round(f.gewicht * 33 / 50) * 50, // ~33 ml/kg, auf 50 ml gerundet
    };

    // Akzentfarbe behalten, falls schon gewählt
    setProfil({ ...row, akzentfarbe: state.profile?.akzentfarbe });

    // Startgewicht direkt in den Verlauf übernehmen
    db.upsert('weight_entries', { datum: todayISO(), gewicht_kg: f.gewicht }, ['datum']);

    toast('Dein Plan steht!');
    showView('tracker');
  });
}
