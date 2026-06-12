// Fortschritt: Gewichts-Chart (SVG), Wochen-Auswertung, Foto-Vergleich.
// Alles lokal auf dem Gerät – sofort da, auch offline.
import { db, state, toast, todayISO, onViewShow, setProfil, haptik } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function ladeAlles() {
  if (!state.profile) return;
  ladeGewicht();
  ladeWoche();
  ladeFotos();
}

// ---------- Gewichtsverlauf ----------

function gewichtsEintraege() {
  return db.alle('weight_entries').sort((a, b) => a.datum.localeCompare(b.datum));
}

function ladeGewicht() {
  const eintraege = gewichtsEintraege();
  // Leeres Diagramm ausblenden, damit keine große schwarze Lücke entsteht
  document.getElementById('weight-empty').hidden = eintraege.length > 0;
  document.getElementById('weight-chart').hidden = !eintraege.length;
  zeichneChart(eintraege);
}

function zeichneChart(eintraege) {
  const svg = document.getElementById('weight-chart');
  svg.innerHTML = '';
  if (eintraege.length === 0) return;

  const W = 320, H = 160, padL = 34, padR = 10, padT = 12, padB = 22;
  const werte = eintraege.map((e) => Number(e.gewicht_kg));
  const ziel = Number(state.profile?.zielgewicht_kg) || null;
  let min = Math.min(...werte, ziel ?? Infinity);
  let max = Math.max(...werte, ziel ?? -Infinity);
  if (max - min < 2) { min -= 1; max += 1; }
  const spanne = max - min;

  const x = (i) => eintraege.length === 1
    ? (padL + W - padR) / 2
    : padL + (i / (eintraege.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / spanne) * (H - padT - padB);

  // Horizontale Gitterlinien + Beschriftung
  for (let g = 0; g <= 3; g++) {
    const wert = min + (spanne * g) / 3;
    const gy = y(wert);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
    line.setAttribute('y1', gy); line.setAttribute('y2', gy);
    line.setAttribute('class', 'grid-line');
    svg.appendChild(line);
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', 2); label.setAttribute('y', gy + 3);
    label.setAttribute('class', 'axis-label');
    label.textContent = wert.toFixed(1);
    svg.appendChild(label);
  }

  // Ziellinie
  if (ziel) {
    const tl = document.createElementNS(SVG_NS, 'line');
    tl.setAttribute('x1', padL); tl.setAttribute('x2', W - padR);
    tl.setAttribute('y1', y(ziel)); tl.setAttribute('y2', y(ziel));
    tl.setAttribute('class', 'target-line');
    svg.appendChild(tl);
  }

  // Linie + Punkte
  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('points', werte.map((v, i) => `${x(i)},${y(v)}`).join(' '));
  poly.setAttribute('class', 'line');
  svg.appendChild(poly);

  werte.forEach((v, i) => {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v)); dot.setAttribute('r', 3.2);
    dot.setAttribute('class', 'dot');
    svg.appendChild(dot);
  });

  // Datums-Labels (erstes + letztes)
  const erstes = document.createElementNS(SVG_NS, 'text');
  erstes.setAttribute('x', padL); erstes.setAttribute('y', H - 6);
  erstes.setAttribute('class', 'axis-label');
  erstes.textContent = kurzDatum(eintraege[0].datum);
  svg.appendChild(erstes);
  if (eintraege.length > 1) {
    const letztes = document.createElementNS(SVG_NS, 'text');
    letztes.setAttribute('x', W - padR); letztes.setAttribute('y', H - 6);
    letztes.setAttribute('text-anchor', 'end');
    letztes.setAttribute('class', 'axis-label');
    letztes.textContent = kurzDatum(eintraege[eintraege.length - 1].datum);
    svg.appendChild(letztes);
  }
}

function kurzDatum(iso) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

// ---------- Wochen-Auswertung ----------

function ladeWoche() {
  const seit = todayISO(-6);
  const food = db.alle('food_entries', (e) => e.datum >= seit);
  const workouts = db.alle('workouts', (w) => w.datum >= seit && w.abgeschlossen);
  const gewichte = gewichtsEintraege().filter((g) => g.datum >= todayISO(-13));

  const proTag = {};
  for (const e of food) {
    proTag[e.datum] ||= { kcal: 0, protein: 0 };
    proTag[e.datum].kcal += Number(e.kalorien);
    proTag[e.datum].protein += Number(e.protein_g);
  }
  const tage = Object.values(proTag);
  const avgKcal = tage.length ? Math.round(tage.reduce((s, t) => s + t.kcal, 0) / tage.length) : null;
  const proteinTage = tage.filter((t) => t.protein >= state.profile.protein_g).length;

  document.getElementById('week-avg-kcal').textContent = avgKcal ?? '–';
  document.getElementById('week-protein-days').textContent = `${proteinTage}/7`;
  document.getElementById('week-workouts').textContent = workouts.length;

  // Gewichtstrend: letzter Wert vs. Wert vor ≥ 7 Tagen
  let diff = null;
  if (gewichte.length >= 2) {
    const letzter = gewichte[gewichte.length - 1];
    const vorWoche = [...gewichte].reverse().find((g) => g.datum <= todayISO(-6));
    if (vorWoche && vorWoche.datum !== letzter.datum) {
      diff = (Number(letzter.gewicht_kg) - Number(vorWoche.gewicht_kg)).toFixed(1);
    }
  }
  document.getElementById('week-weight-diff').textContent = diff !== null ? (diff > 0 ? `+${diff}` : diff) : '–';

  const ziel = state.profile.kalorienziel;
  let fazit = '';
  if (avgKcal !== null) {
    fazit = avgKcal <= ziel
      ? `Stark! Du liegst im Schnitt ${ziel - avgKcal} kcal unter deinem Ziel. `
      : `Du liegst im Schnitt ${avgKcal - ziel} kcal über deinem Ziel – bleib dran. `;
    fazit += proteinTage >= 5
      ? 'Protein-Ziel meistens erreicht.'
      : `Protein-Ziel an ${proteinTage} von 7 Tagen erreicht – da geht mehr.`;
  } else {
    fazit = 'Tracke deine Mahlzeiten, um eine Auswertung zu sehen.';
  }
  document.getElementById('week-summary').textContent = fazit;
}

// ---------- Fortschrittsfotos (lokal als kleines JPEG gespeichert) ----------

function ladeFotos() {
  const grid = document.getElementById('photo-grid');
  const fotos = db.alle('progress_photos')
    .sort((a, b) => (b.datum || '').localeCompare(a.datum || ''))
    .slice(0, 8);
  if (!fotos.length) {
    grid.innerHTML = '<p class="muted">Lade ein „Vorher"-Foto hoch – in 8 Wochen wirst du den Unterschied sehen.</p>';
    return;
  }
  grid.innerHTML = fotos.map((f) => `
    <div class="photo-item">
      <img src="${f.bild}" alt="Fortschrittsfoto vom ${f.datum}" loading="lazy">
      <span class="photo-date">${kurzDatum(f.datum)}${f.datum.slice(0, 4)}</span>
      <button class="photo-del" data-id="${f.id}">✕</button>
    </div>`).join('');
}

// Foto auf 700 px verkleinern und als Daten-URL speichern (passt in den
// lokalen Speicher; iOS-sicher über <img> + decode statt createImageBitmap)
async function fotoVerkleinern(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const maxKante = 700;
    const faktor = Math.min(1, maxKante / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * faktor));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * faktor));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fotoHochladen(file) {
  try {
    const bild = await fotoVerkleinern(file);
    db.insert('progress_photos', { datum: todayISO(), bild });
    haptik();
    toast('Foto gespeichert ✓');
    ladeFotos();
  } catch {
    toast('Dieses Bild kann nicht gelesen werden – bitte wähle ein anderes Foto');
  }
}

// ---------- Initialisierung ----------

export function initProgress() {
  onViewShow('progress', ladeAlles);

  document.getElementById('weight-add').addEventListener('click', () => {
    document.getElementById('weight-input').value = '';
    document.getElementById('weight-modal').showModal();
  });
  document.getElementById('weight-cancel').addEventListener('click', () =>
    document.getElementById('weight-modal').close()
  );
  document.getElementById('weight-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const gewicht = parseFloat(document.getElementById('weight-input').value);
    if (!(gewicht >= 30 && gewicht <= 350)) {
      toast('Bitte ein Gewicht zwischen 30 und 350 kg eingeben');
      return;
    }
    db.upsert('weight_entries', { datum: todayISO(), gewicht_kg: gewicht }, ['datum']);
    // aktuelles Gewicht auch im Profil nachziehen
    if (state.profile) {
      setProfil({ ...state.profile, gewicht_kg: gewicht });
    }
    document.getElementById('weight-modal').close();
    haptik();
    toast('Gewicht gespeichert ✓');
    ladeGewicht();
    ladeWoche();
  });

  document.getElementById('progress-photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) fotoHochladen(file);
    e.target.value = '';
  });

  document.getElementById('photo-grid').addEventListener('click', (e) => {
    const del = e.target.closest('.photo-del');
    if (!del) return;
    if (!confirm('Foto wirklich löschen?')) return;
    db.delete('progress_photos', del.dataset.id);
    ladeFotos();
  });
}
