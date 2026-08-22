/* ============================================================
   Kurani CRM – Diagramme
   Alles SVG, keine fremde Bibliothek. Skaliert scharf auf jedem
   Bildschirm, druckt sauber, funktioniert offline.
   Farben kommen aus dem Design-System (CSS-Variablen).
   ============================================================ */
const Chart = (() => {

  const id = () => 'c' + Math.random().toString(36).slice(2, 9);
  const esc = s => U.esc(String(s));

  /* Runde Ecken für einen Pfad zwischen Punkten (weiche Kurve) */
  function glatt(punkte, spannung = 0.34){
    if (punkte.length < 2) return '';
    let d = `M ${punkte[0][0]} ${punkte[0][1]}`;
    for (let i = 0; i < punkte.length - 1; i++){
      const p0 = punkte[i - 1] || punkte[i];
      const p1 = punkte[i];
      const p2 = punkte[i + 1];
      const p3 = punkte[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6 * spannung * 2;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6 * spannung * 2;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6 * spannung * 2;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6 * spannung * 2;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  /* Achsenbeschriftung: schöne runde Schritte statt krummer Zahlen */
  function schritte(max, anzahl = 4){
    if (max <= 0) return [0];
    const roh = max / anzahl;
    const groesse = Math.pow(10, Math.floor(Math.log10(roh)));
    const schritt = [1, 2, 2.5, 5, 10].map(f => f * groesse).find(s => s >= roh) || groesse * 10;
    const werte = [];
    for (let v = 0; v <= max + schritt * 0.01; v += schritt) werte.push(v);
    return werte;
  }

  const kurz = n => {
    const a = Math.abs(n);
    if (a >= 1000000) return (n/1000000).toFixed(a >= 10000000 ? 0 : 1).replace('.',',') + ' Mio';
    if (a >= 1000)    return (n/1000).toFixed(a >= 10000 ? 0 : 1).replace('.',',') + 'k';
    return String(Math.round(n));
  };

  /* ============================================================
     Verlauf: Fläche + Linie, optional mit Vergleichslinie
     daten:     [{label, wert}]
     vergleich: [{label, wert}] – z.B. das Vorjahr
     ============================================================ */
  function verlauf(daten, { hoehe = 190, vergleich = null, label = '', vergleichLabel = '',
                            einheit = '€', ziel = null } = {}){
    if (!daten || !daten.length) return leer('Noch keine Zahlen für ein Diagramm.');

    const W = 640, H = hoehe, links = 46, rechts = 12, oben = 14, unten = 26;
    const bx = W - links - rechts, by = H - oben - unten;
    const alle = daten.map(d => d.wert).concat(vergleich ? vergleich.map(d => d.wert) : [], ziel ? [ziel] : []);
    const max = Math.max(1, ...alle);
    const marken = schritte(max);
    const skala = Math.max(max, marken[marken.length - 1]);

    const x = i => links + (daten.length === 1 ? bx/2 : (i / (daten.length - 1)) * bx);
    const y = v => oben + by - (v / skala) * by;

    const punkte = daten.map((d, i) => [x(i), y(d.wert)]);
    const linie = glatt(punkte);
    const flaeche = linie + ` L ${x(daten.length-1)} ${oben+by} L ${x(0)} ${oben+by} Z`;
    const gid = id();

    const vLinie = vergleich && vergleich.length
      ? glatt(vergleich.map((d, i) => [x(i), y(d.wert)])) : '';

    return `
    <div class="dia">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="dia-svg" role="img"
           aria-label="${esc(label || 'Verlauf')}">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stop-color="var(--ink)" stop-opacity=".16"/>
            <stop offset="100%" stop-color="var(--ink)" stop-opacity="0"/>
          </linearGradient>
        </defs>

        ${marken.map(m => `
          <line x1="${links}" y1="${y(m)}" x2="${W-rechts}" y2="${y(m)}"
                stroke="var(--line)" stroke-width=".8" ${m===0?'':'stroke-dasharray="2 4"'}/>
          <text x="${links-8}" y="${y(m)+3.5}" text-anchor="end"
                font-size="10" fill="var(--muted)">${kurz(m)}</text>`).join('')}

        ${ziel ? `<line x1="${links}" y1="${y(ziel)}" x2="${W-rechts}" y2="${y(ziel)}"
                        stroke="var(--green)" stroke-width="1.2" stroke-dasharray="5 4"/>` : ''}

        ${vLinie ? `<path d="${vLinie}" fill="none" stroke="var(--muted)"
                          stroke-width="1.5" stroke-dasharray="4 4" opacity=".7"/>` : ''}

        <path d="${flaeche}" fill="url(#${gid})"/>
        <path d="${linie}" fill="none" stroke="var(--ink)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>

        ${punkte.map(([px, py], i) => `
          <circle cx="${px}" cy="${py}" r="${daten[i].wert ? 3 : 0}" fill="var(--card)"
                  stroke="var(--ink)" stroke-width="1.8"/>`).join('')}

        ${daten.map((d, i) => {
          const zeig = daten.length <= 13 || i % Math.ceil(daten.length/12) === 0;
          return zeig ? `<text x="${x(i)}" y="${H-8}" text-anchor="middle"
            font-size="10" fill="var(--muted)">${esc(d.label)}</text>` : '';
        }).join('')}
      </svg>

      <div class="dia-punkte">
        ${daten.map((d, i) => `<div class="dia-punkt" style="left:${x(i)/W*100}%"
          data-wert="${esc(d.label)}: ${einheit === '€' ? U.eur(d.wert) : U.num(d.wert)+' '+einheit}${
            vergleich && vergleich[i] ? ` · ${esc(vergleichLabel||'Vorjahr')} ${
              einheit === '€' ? U.eur(vergleich[i].wert) : U.num(vergleich[i].wert)}` : ''}"></div>`).join('')}
      </div>

      ${(label || vergleichLabel) ? `<div class="dia-legende">
        ${label ? `<span><i class="l-linie"></i>${esc(label)}</span>` : ''}
        ${vergleichLabel ? `<span><i class="l-strich"></i>${esc(vergleichLabel)}</span>` : ''}
        ${ziel ? `<span><i class="l-ziel"></i>Ziel ${U.eur0(ziel)}</span>` : ''}
      </div>` : ''}
    </div>`;
  }

  /* ============================================================
     Balken – auch zweifarbig (rein / raus)
     daten: [{label, wert, wert2}]
     ============================================================ */
  function balken(daten, { hoehe = 180, farbe = 'var(--ink)', farbe2 = 'var(--red)',
                           label = '', label2 = '', einheit = '€' } = {}){
    if (!daten || !daten.length) return leer('Noch keine Zahlen für ein Diagramm.');

    const zwei = daten.some(d => d.wert2 !== undefined);
    const W = 640, H = hoehe, links = 46, rechts = 12, oben = 12, unten = 26;
    const bx = W - links - rechts, by = H - oben - unten;
    const max = Math.max(1, ...daten.map(d => Math.max(d.wert || 0, d.wert2 || 0)));
    const marken = schritte(max);
    const skala = Math.max(max, marken[marken.length - 1]);
    const y = v => oben + by - (v / skala) * by;

    const proSpalte = bx / daten.length;
    const breite = Math.min(zwei ? proSpalte * 0.32 : proSpalte * 0.56, 26);
    const lueck = zwei ? 2 : 0;

    return `
    <div class="dia">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="dia-svg">
        ${marken.map(m => `
          <line x1="${links}" y1="${y(m)}" x2="${W-rechts}" y2="${y(m)}"
                stroke="var(--line)" stroke-width=".8" ${m===0?'':'stroke-dasharray="2 4"'}/>
          <text x="${links-8}" y="${y(m)+3.5}" text-anchor="end"
                font-size="10" fill="var(--muted)">${kurz(m)}</text>`).join('')}

        ${daten.map((d, i) => {
          const mitte = links + proSpalte * i + proSpalte/2;
          const h1 = Math.max(0, oben + by - y(d.wert || 0));
          const x1 = zwei ? mitte - breite - lueck/2 : mitte - breite/2;
          const st = `<rect x="${x1}" y="${y(d.wert||0)}" width="${breite}" height="${h1}"
                       fill="${farbe}" rx="2"/>`;
          if (!zwei) return st;
          const h2 = Math.max(0, oben + by - y(d.wert2 || 0));
          return st + `<rect x="${mitte + lueck/2}" y="${y(d.wert2||0)}" width="${breite}"
                        height="${h2}" fill="${farbe2}" rx="2" opacity=".82"/>`;
        }).join('')}

        ${daten.map((d, i) => `<text x="${links + proSpalte*i + proSpalte/2}" y="${H-8}"
          text-anchor="middle" font-size="10" fill="var(--muted)">${esc(d.label)}</text>`).join('')}
      </svg>

      <div class="dia-punkte">
        ${daten.map((d, i) => `<div class="dia-punkt" style="left:${(links + proSpalte*i + proSpalte/2)/W*100}%"
          data-wert="${esc(d.label)}: ${einheit==='€'?U.eur(d.wert||0):U.num(d.wert||0)}${
            zwei ? ` · ${esc(label2||'zweite Reihe')} ${einheit==='€'?U.eur(d.wert2||0):U.num(d.wert2||0)}` : ''}"></div>`).join('')}
      </div>

      ${zwei && (label || label2) ? `<div class="dia-legende">
        <span><i style="background:${farbe}"></i>${esc(label)}</span>
        <span><i style="background:${farbe2};opacity:.82"></i>${esc(label2)}</span>
      </div>` : ''}
    </div>`;
  }

  /* ============================================================
     Ring – Anteil am Ziel, z.B. Jahresumsatz
     ============================================================ */
  function ring(wert, ziel, { titel = '', unten = '', groesse = 150 } = {}){
    const anteil = ziel > 0 ? Math.min(wert / ziel, 1) : 0;
    const prozent = ziel > 0 ? Math.round(wert / ziel * 100) : 0;
    const r = 54, umfang = 2 * Math.PI * r;
    const farbe = prozent >= 100 ? 'var(--green)' : prozent >= 60 ? 'var(--ink)' : 'var(--amber)';

    return `
    <div class="dia-ring" style="max-width:${groesse}px">
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--line)" stroke-width="11"/>
        <circle cx="70" cy="70" r="${r}" fill="none" stroke="${farbe}" stroke-width="11"
                stroke-linecap="round" transform="rotate(-90 70 70)"
                stroke-dasharray="${(umfang*anteil).toFixed(1)} ${umfang.toFixed(1)}"/>
        <text x="70" y="66" text-anchor="middle" font-family="'Playfair Display',serif"
              font-size="27" font-weight="700" fill="var(--ink)">${prozent}%</text>
        ${titel ? `<text x="70" y="86" text-anchor="middle" font-size="10.5"
                     fill="var(--muted)">${esc(titel)}</text>` : ''}
      </svg>
      ${unten ? `<div class="dia-ring-fuss">${esc(unten)}</div>` : ''}
    </div>`;
  }

  /* ============================================================
     Verteilung – waagerechte Balken mit Beschriftung
     daten: [{label, wert, farbe?}]
     ============================================================ */
  function verteilung(daten, { einheit = '€', max_zeilen = 8, klick = null } = {}){
    if (!daten || !daten.length) return leer('Noch nichts zu verteilen.');
    const sortiert = U.sortBy(daten, d => d.wert, 'desc');
    const zeigen = sortiert.slice(0, max_zeilen);
    const rest = sortiert.slice(max_zeilen);
    if (rest.length) zeigen.push({ label: `${rest.length} weitere`, wert: U.sum(rest, r => r.wert), grau: true });

    const gesamt = U.sum(sortiert, d => d.wert) || 1;
    const max = Math.max(...zeigen.map(d => d.wert), 1);

    return `<div class="dia-vert">
      ${zeigen.map(d => `
        <div class="dia-vert-zeile"${klick && d.id ? ` onclick="${klick.replace('{id}', d.id)}" style="cursor:pointer"` : ''}>
          <div class="dia-vert-lbl">${esc(d.label)}</div>
          <div class="dia-vert-bahn">
            <div class="dia-vert-bar${d.grau?' grau':''}" style="width:${Math.max(2, d.wert/max*100)}%;
              ${d.farbe?`background:${d.farbe}`:''}"></div>
          </div>
          <div class="dia-vert-wert">${einheit==='€'?U.eur0(d.wert):U.num(d.wert).replace(',00','')}
            <span class="dia-vert-pct">${Math.round(d.wert/gesamt*100)}%</span></div>
        </div>`).join('')}
    </div>`;
  }

  /* Kleine Trendlinie für Kacheln */
  function funke(werte, { breite = 90, hoehe = 26, farbe = 'var(--ink)' } = {}){
    if (!werte || werte.length < 2) return '';
    const max = Math.max(...werte, 1), min = Math.min(...werte, 0);
    const spanne = (max - min) || 1;
    const p = werte.map((v, i) => [
      (i / (werte.length - 1)) * breite,
      hoehe - ((v - min) / spanne) * (hoehe - 3) - 1.5
    ]);
    return `<svg class="dia-funke" viewBox="0 0 ${breite} ${hoehe}" preserveAspectRatio="none">
      <path d="${glatt(p)}" fill="none" stroke="${farbe}" stroke-width="1.6"
            stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${p[p.length-1][0]}" cy="${p[p.length-1][1]}" r="2" fill="${farbe}"/>
    </svg>`;
  }

  const leer = text => `<div class="dia-leer">${esc(text)}</div>`;

  return { verlauf, balken, ring, verteilung, funke, schritte, kurz };
})();
