// Fortschritt: Gewichts-Chart (SVG), Wochen-Auswertung, Foto-Vergleich.
// Alles lokal auf dem Gerät – sofort da, auch offline.
import { db, state, toast, todayISO, onViewShow, setProfil, haptik } from './state.js';
import { makros } from './calc.js';

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
  renderPrognose(eintraege);
}

// Linearer Trend der letzten Wiegungen in kg/Woche (+ = zunehmen)
function gewichtsTrend(punkte) {
  if (punkte.length < 2) return null;
  const t0 = new Date(punkte[0].datum).getTime();
  const xs = punkte.map((p) => (new Date(p.datum).getTime() - t0) / 86400000);
  const ys = punkte.map((p) => Number(p.gewicht_kg));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b) / n;
  const my = ys.reduce((a, b) => a + b) / n;
  const steigung = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
    / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
  return steigung * 7;
}

// Schlaue Prognose: linearer Trend der letzten Wiegungen → wann ist das
// Ziel erreicht? Ehrlich, wenn der Trend in die falsche Richtung zeigt.
function renderPrognose(eintraege) {
  const el = document.getElementById('weight-forecast');
  const ziel = Number(state.profile?.zielgewicht_kg);
  const punkte = eintraege.slice(-6);
  if (!ziel || punkte.length < 3) { el.hidden = true; return; }

  const proWoche = gewichtsTrend(punkte);
  const steigung = proWoche / 7; // kg pro Tag
  const aktuell = Number(punkte[punkte.length - 1].gewicht_kg);
  const benoetigt = ziel - aktuell;              // negativ = abnehmen nötig

  el.hidden = false;
  if (Math.abs(proWoche) < 0.05) {
    el.textContent = 'Dein Gewicht ist gerade stabil – für eine Prognose braucht es etwas Bewegung im Trend.';
  } else if (benoetigt * steigung <= 0) {
    el.textContent = `Achtung: Dein Trend zeigt gerade ${proWoche > 0 ? 'nach oben' : 'nach unten'} (${Math.abs(proWoche).toFixed(1)} kg/Woche) – entgegen deinem Ziel. Bleib bei deinem Kalorienziel.`;
  } else {
    const tage = Math.round(benoetigt / steigung);
    if (tage > 0 && tage < 400) {
      const datum = new Date(Date.now() + tage * 86400000)
        .toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
      el.textContent = `Prognose: Bei deinem Tempo (${Math.abs(proWoche).toFixed(1)} kg/Woche) erreichst du ${ziel} kg um den ${datum}.`;
    } else {
      el.hidden = true;
    }
  }
}

function zeichneChart(eintraege) {
  const svg = document.getElementById('weight-chart');
  svg.innerHTML = '';
  if (eintraege.length === 0) return;

  const W = 320, H = 160, padL = 34, padR = 10, padT = 12, padB = 22;
  const p = state.profile || {};
  const zeit = (iso) => new Date(iso).getTime();

  // Die Reise: Start → Ziel als Zeitachse, deine Wiegungen darauf
  const startDatum = p.startdatum || eintraege[0].datum;
  const startGewicht = p.startgewicht_kg != null ? Number(p.startgewicht_kg) : Number(eintraege[0].gewicht_kg);
  const zielGewicht = Number(p.zielgewicht_kg) || null;
  const planAktiv = Boolean(zielGewicht && p.zieldatum);

  const t0 = Math.min(zeit(startDatum), zeit(eintraege[0].datum));
  const t1 = Math.max(
    planAktiv ? zeit(p.zieldatum) : 0,
    zeit(eintraege[eintraege.length - 1].datum),
    t0 + 7 * 86400000 // mindestens eine Woche Spannweite
  );

  const werte = eintraege.map((e) => Number(e.gewicht_kg));
  let min = Math.min(...werte, planAktiv ? zielGewicht : Infinity, startGewicht);
  let max = Math.max(...werte, planAktiv ? zielGewicht : -Infinity, startGewicht);
  if (max - min < 2) { min -= 1; max += 1; }
  const spanne = max - min;

  const x = (t) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
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

  // Plan-Linie: die Soll-Gerade von (Start, Startgewicht) zu (Zieldatum, Ziel)
  if (planAktiv) {
    const plan = document.createElementNS(SVG_NS, 'line');
    plan.setAttribute('x1', x(zeit(startDatum))); plan.setAttribute('y1', y(startGewicht));
    plan.setAttribute('x2', x(zeit(p.zieldatum))); plan.setAttribute('y2', y(zielGewicht));
    plan.setAttribute('class', 'target-line');
    svg.appendChild(plan);
  }

  // Heute-Marker: wo im Zeitraum stehst du gerade?
  const jetzt = Date.now();
  if (jetzt > t0 && jetzt < t1) {
    const heute = document.createElementNS(SVG_NS, 'line');
    heute.setAttribute('x1', x(jetzt)); heute.setAttribute('x2', x(jetzt));
    heute.setAttribute('y1', padT); heute.setAttribute('y2', H - padB);
    heute.setAttribute('class', 'today-line');
    svg.appendChild(heute);
    const hl = document.createElementNS(SVG_NS, 'text');
    hl.setAttribute('x', Math.min(x(jetzt) + 3, W - 40)); hl.setAttribute('y', padT + 8);
    hl.setAttribute('class', 'axis-label');
    hl.textContent = 'heute';
    svg.appendChild(hl);
  }

  // Ist-Linie + Punkte (auf der Zeitachse)
  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('points', eintraege.map((e) => `${x(zeit(e.datum))},${y(Number(e.gewicht_kg))}`).join(' '));
  poly.setAttribute('class', 'line');
  svg.appendChild(poly);

  eintraege.forEach((e) => {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', x(zeit(e.datum))); dot.setAttribute('cy', y(Number(e.gewicht_kg))); dot.setAttribute('r', 3.2);
    dot.setAttribute('class', 'dot');
    svg.appendChild(dot);
  });

  // Datums-Labels: Start links, Ziel (oder letzte Wiegung) rechts
  const erstes = document.createElementNS(SVG_NS, 'text');
  erstes.setAttribute('x', padL); erstes.setAttribute('y', H - 6);
  erstes.setAttribute('class', 'axis-label');
  erstes.textContent = 'Start ' + kurzDatum(startDatum);
  svg.appendChild(erstes);
  const letztes = document.createElementNS(SVG_NS, 'text');
  letztes.setAttribute('x', W - padR); letztes.setAttribute('y', H - 6);
  letztes.setAttribute('text-anchor', 'end');
  letztes.setAttribute('class', 'axis-label');
  letztes.textContent = planAktiv
    ? `Ziel ${kurzDatum(p.zieldatum)}`
    : kurzDatum(eintraege[eintraege.length - 1].datum);
  svg.appendChild(letztes);
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

// ---------- Wiege-Check-in: die App reagiert auf deine Wiegung ----------
// Vergleicht dein echtes Tempo mit dem nötigen Tempo bis zum Zieldatum.
// Lob auf Kurs, Klartext bei Stillstand, Druck wenn die Zeit knapp wird –
// und auf Wunsch passt sie das Tagesziel per Tap an.

function wiegeCheckIn() {
  const p = state.profile;
  const ziel = Number(p?.zielgewicht_kg);
  if (!ziel || p.ziel === 'rekomposition') return;

  const punkte = gewichtsEintraege().slice(-6);
  if (punkte.length < 2) return; // noch kein Trend möglich

  const aktuell = Number(punkte[punkte.length - 1].gewicht_kg);
  const offen = ziel - aktuell;                       // negativ = abnehmen nötig
  const richtung = Math.sign(offen) || 1;
  const rate = gewichtsTrend(punkte);                 // kg/Woche, + = zunehmen

  // Verbleibende Zeit bis zum Zieldatum
  const wochenLeft = p.zieldatum
    ? Math.max(0, (new Date(p.zieldatum) - Date.now()) / (7 * 86400000))
    : null;
  const noetig = wochenLeft > 0.5 ? offen / wochenLeft : null; // kg/Woche nötig

  const fortschrittGut = rate * richtung;             // >0 = richtige Richtung
  const minKcal = p.geschlecht === 'm' ? 1500 : 1200;
  const zielWort = richtung < 0 ? 'abnehmen' : 'aufbauen';

  let titel, text, dringend = false;
  const aktionen = [];

  if (Math.abs(offen) <= 0.5) {
    titel = 'Ziel erreicht!';
    text = `${aktuell} kg – du bist da. Stark durchgezogen! Zeit für ein neues Ziel im Profil.`;
  } else if (fortschrittGut < 0.05) {
    // Stillstand oder falsche Richtung
    titel = fortschrittGut < -0.1 ? 'Falsche Richtung.' : 'Stillstand.';
    text = `Dein Trend: ${rate >= 0 ? '+' : ''}${rate.toFixed(1)} kg/Woche – du willst aber ${zielWort}. `
      + 'Die häufigsten Gründe: untracktes Essen (Soßen, Snacks, Getränke), zu großzügige Schätzungen, Wochenende. '
      + 'Die Hebel: 3 Tage ALLES tracken (auch den Schuss Öl), Protein hoch, 8.000+ Schritte täglich.';
    aktionen.push('kcal');
    dringend = wochenLeft !== null && wochenLeft < 6;
  } else if (noetig !== null && fortschrittGut < Math.abs(noetig) * 0.65) {
    // Richtige Richtung, aber zu langsam fürs Zieldatum
    const wochenBrauchst = Math.ceil(Math.abs(offen) / fortschrittGut);
    titel = wochenLeft < 5 ? 'Es wird knapp – Gas geben!' : 'Zu langsam für dein Zieldatum.';
    text = `Noch ${Math.abs(offen).toFixed(1)} kg in ${Math.ceil(wochenLeft)} Wochen = ${Math.abs(noetig).toFixed(2)} kg/Woche nötig. `
      + `Aktuell schaffst du ${fortschrittGut.toFixed(2)} kg/Woche – so brauchst du ca. ${wochenBrauchst} Wochen. `
      + (wochenLeft < 5
        ? 'Jetzt zählt jede Mahlzeit: kein untracktes Essen mehr, Protein zuerst, Alkohol streichen.'
        : 'Entweder Tempo erhöhen oder das Zieldatum ehrlich anpassen – beides ist okay, nur Selbstbetrug nicht.');
    aktionen.push('kcal', 'datum');
    dringend = wochenLeft < 5;
  } else {
    titel = 'Voll auf Kurs!';
    text = `${fortschrittGut.toFixed(1)} kg/Woche in die richtige Richtung – noch ${Math.abs(offen).toFixed(1)} kg. `
      + 'Genau so weitermachen: gleiche Routinen, gleiche Konsequenz.';
  }

  // Modal befüllen
  document.getElementById('checkin-label').textContent = dringend ? 'Check-in · Zeit wird knapp' : 'Wiege-Check-in';
  document.getElementById('checkin-titel').textContent = titel;
  document.getElementById('checkin-text').textContent = text;

  const wrap = document.getElementById('checkin-actions');
  wrap.innerHTML = '';
  if (aktionen.includes('kcal')) {
    const delta = richtung < 0 ? -150 : 150;
    const neu = richtung < 0 ? Math.max(minKcal, p.kalorienziel + delta) : p.kalorienziel + delta;
    if (neu !== p.kalorienziel) {
      const b = document.createElement('button');
      b.className = 'btn primary full';
      b.textContent = `Tagesziel anpassen: ${p.kalorienziel} → ${neu} kcal`;
      b.onclick = () => {
        setProfil({ ...p, kalorienziel: neu, ...prefixMakros(makros(neu, aktuell, p.ziel)) });
        toast(`Neues Tagesziel: ${neu} kcal – Makros angepasst`);
        haptik(20);
        document.getElementById('checkin-modal').close();
      };
      wrap.appendChild(b);
    }
  }
  if (aktionen.includes('datum') && fortschrittGut > 0.05) {
    const wochenNeu = Math.ceil(Math.abs(offen) / fortschrittGut);
    const datumNeu = new Date(Date.now() + wochenNeu * 7 * 86400000).toISOString().slice(0, 10);
    const b = document.createElement('button');
    b.className = 'btn full';
    b.textContent = `Zieldatum ehrlich anpassen (+${wochenNeu} Wochen)`;
    b.onclick = () => {
      setProfil({ ...state.profile, zieldatum: datumNeu });
      toast('Zieldatum angepasst – realistisch schlägt perfekt');
      document.getElementById('checkin-modal').close();
      ladeGewicht();
    };
    wrap.appendChild(b);
  }

  document.getElementById('checkin-modal').showModal();
  haptik(dringend ? 30 : 12);
}

// makros() liefert {protein, carbs, fett} – das Profil braucht *_g-Namen
function prefixMakros(m) {
  return { protein_g: m.protein, carbs_g: m.carbs, fett_g: m.fett };
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
    // Die App reagiert: Kurs-Check mit Empfehlungen direkt nach dem Wiegen
    wiegeCheckIn();
  });

  document.getElementById('checkin-close').addEventListener('click', () =>
    document.getElementById('checkin-modal').close()
  );

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
