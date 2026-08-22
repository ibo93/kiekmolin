/* ==========================================================
   Kurani CRM – Kalkulator
   Sechs Rechenarten, damit "nach Aufwand" eine Zahl wird,
   die du am Telefon verteidigen kannst.
   Alle Zeitwerte sind Erfahrungswerte und unten anpassbar.
   ========================================================== */
const Calc = (() => {

  /* ---------- Materialien für Flächen-Aufträge ---------- */
  const MATERIAL = [
    { k:'folie_mono',  n:'Klebefolie monomer, bedruckt',      preis:12, montage:0.30, extra:0    },
    { k:'folie_poly',  n:'Klebefolie polymer / gegossen',     preis:22, montage:0.35, extra:0    },
    { k:'plott',       n:'Plottfolie einfarbig (geschnitten)',preis:15, montage:0.35, extra:0.40 },
    { k:'milchglas',   n:'Fensterfolie Milchglas',            preis:18, montage:0.30, extra:0    },
    { k:'plane',       n:'PVC-Plane 510 g, mit Ösen',         preis:7,  montage:0.15, extra:0    },
    { k:'mesh',        n:'Mesh-Plane (winddurchlässig)',      preis:9,  montage:0.15, extra:0    },
    { k:'hohlkammer',  n:'Hohlkammerplatte 4 mm',             preis:18, montage:0.20, extra:0    },
    { k:'forex',       n:'PVC-Hartschaum 5 mm',               preis:28, montage:0.20, extra:0    },
    { k:'dibond',      n:'Alu-Dibond 3 mm',                   preis:45, montage:0.25, extra:0    }
  ];

  /* ---------- Wie gut ist die Vorlage vom Kunden ---------- */
  const VORLAGE = [
    { k:'digital', n:'Digitale Datei (Word, Excel, InDesign)', f:0.35 },
    { k:'pdf',     n:'PDF oder Ausdruck der alten Karte',      f:0.65 },
    { k:'foto',    n:'Foto / Scan, gut lesbar',                f:1.00 },
    { k:'chaos',   n:'Handschrift, Zettelwirtschaft, Sprachnachricht', f:1.60 }
  ];

  let modus = 'karte';
  let werte = {};
  let fromEditor = false;

  /* ================= RECHENARTEN ================= */
  const MODI = {

    /* ---------- Speisekarte ---------- */
    karte: {
      label:'Speisekarte',
      typ:'Speisekarte',
      richtwert: 450,
      def: { neu:'neu', seiten:4, gerichte:60, vorlage:'foto', allergene:true,
             bilder:0, druckdaten:true, express:false },
      felder: () => `
        <div class="row row-2">
          <div class="field"><label>Was ist zu tun</label>
            <select data-c="neu">
              <option value="neu" ${werte.neu==='neu'?'selected':''}>Karte neu gestalten</option>
              <option value="update" ${werte.neu==='update'?'selected':''}>Bestehende Karte aktualisieren</option>
            </select></div>
          <div class="field"><label>Vorlage vom Kunden</label>
            <select data-c="vorlage">
              ${VORLAGE.map(v=>`<option value="${v.k}" ${werte.vorlage===v.k?'selected':''}>${v.n}</option>`).join('')}
            </select>
            <div class="hint">Handschrift kostet dich das Vierfache an Tipparbeit</div></div>
        </div>
        <div class="row row-3">
          <div class="field"><label>Seiten</label>
            <input type="number" data-c="seiten" value="${werte.seiten}" min="1"></div>
          <div class="field"><label>Gerichte / Positionen</label>
            <input type="number" data-c="gerichte" value="${werte.gerichte}" min="0"></div>
          <div class="field"><label>Bilder einbauen</label>
            <input type="number" data-c="bilder" value="${werte.bilder}" min="0">
            <div class="hint">freistellen, retuschieren</div></div>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:6px">
          <label class="check"><input type="checkbox" data-c="allergene" ${werte.allergene?'checked':''}>
            Allergene A–N und Zusatzstoffe ergänzen</label>
          <label class="check"><input type="checkbox" data-c="druckdaten" ${werte.druckdaten?'checked':''}>
            Druckdaten erstellen</label>
          <label class="check"><input type="checkbox" data-c="express" ${werte.express?'checked':''}>
            Express (unter 3 Tagen)</label>
        </div>`,
      rechne: (x) => {
        const vf = (VORLAGE.find(v=>v.k===x.vorlage)||VORLAGE[2]).f;
        const p = [];
        if (x.neu === 'neu'){
          p.push(['Layout und Aufbau', 1.5]);
          p.push([`Gestaltung ${x.seiten} Seiten`, x.seiten * 0.6]);
          p.push([`${x.gerichte} Positionen erfassen und setzen`, x.gerichte * 0.03 * vf]);
        } else {
          p.push(['Datei öffnen, Stand prüfen', 0.5]);
          p.push([`${x.seiten} Seiten durchgehen`, x.seiten * 0.3]);
          p.push([`${x.gerichte} Positionen aktualisieren`, x.gerichte * 0.015 * vf]);
        }
        if (x.allergene)  p.push([`Allergene und Zusatzstoffe für ${x.gerichte} Gerichte`, x.gerichte * 0.02]);
        if (x.bilder)     p.push([`${x.bilder} Bilder bearbeiten`, x.bilder * 0.25]);
        if (x.druckdaten) p.push(['Druckdaten mit Beschnitt und Proof', 0.5]);
        p.push([`Korrekturrunden (${Store.settings().freieSchleifen ?? 2} inklusive)`,
                (Store.settings().freieSchleifen ?? 2) * 0.4]);
        return { posten:p, express:x.express, material:0 };
      },
      text: x => `Speisekarte ${x.seiten}-seitig${x.neu==='neu'?' neu gestaltet':' aktualisiert'}`,
      detail: x => [
        `${x.gerichte} Positionen`,
        x.allergene ? 'inklusive Allergene A–N und Zusatzstoffe' : '',
        x.bilder ? `${x.bilder} Bilder bearbeitet` : '',
        x.druckdaten ? 'inklusive Druckdaten' : '',
        `${Store.settings().freieSchleifen ?? 2} Korrekturrunden enthalten`
      ].filter(Boolean).join('\n')
    },

    /* ---------- Fläche: Folie, Plane, Schild ---------- */
    flaeche: {
      label:'Folie / Plane / Schild',
      typ:'Folie / Beschriftung',
      richtwert: 0,
      def: { breite:300, hoehe:80, anzahl:1, material:'plane', preis:7, verschnitt:10,
             gestaltung:1, montage:true, km:0, aufschlag:40, express:false },
      felder: () => `
        <div class="row row-3">
          <div class="field"><label>Breite (cm)</label><input type="number" data-c="breite" value="${werte.breite}"></div>
          <div class="field"><label>Höhe (cm)</label><input type="number" data-c="hoehe" value="${werte.hoehe}"></div>
          <div class="field"><label>Stückzahl</label><input type="number" data-c="anzahl" value="${werte.anzahl}" min="1"></div>
        </div>
        <div class="field"><label>Material</label>
          <select data-c="material" data-mat="1">
            ${MATERIAL.map(m=>`<option value="${m.k}" ${m.k===werte.material?'selected':''}>${m.n} · ca. ${m.preis} €/m²</option>`).join('')}
          </select></div>
        <div class="row row-3">
          <div class="field"><label>Materialpreis €/m²</label>
            <input type="number" data-c="preis" value="${werte.preis}" step="0.5">
            <div class="hint">deinen echten Einkaufspreis eintragen</div></div>
          <div class="field"><label>Verschnitt %</label><input type="number" data-c="verschnitt" value="${werte.verschnitt}"></div>
          <div class="field"><label>Aufschlag Material %</label><input type="number" data-c="aufschlag" value="${werte.aufschlag}"></div>
        </div>
        <div class="row row-3">
          <div class="field"><label>Gestaltung / Daten (Std.)</label>
            <input type="number" data-c="gestaltung" value="${werte.gestaltung}" step="0.25"></div>
          <div class="field"><label>Anfahrt (km einfach)</label><input type="number" data-c="km" value="${werte.km}"></div>
          <div class="field"><label>&nbsp;</label>
            <label class="check" style="padding-top:9px"><input type="checkbox" data-c="montage" ${werte.montage?'checked':''}>
              Montage durch dich</label></div>
        </div>
        <label class="check"><input type="checkbox" data-c="express" ${werte.express?'checked':''}> Express (unter 3 Tagen)</label>`,
      rechne: (x) => {
        const mat = MATERIAL.find(m=>m.k===x.material) || MATERIAL[0];
        const qm  = (x.breite/100) * (x.hoehe/100) * Math.max(1,x.anzahl);
        const qmV = qm * (1 + x.verschnitt/100);
        const p = [];
        if (x.gestaltung) p.push(['Gestaltung und Druckdaten', x.gestaltung]);
        if (mat.extra)    p.push([`Entgittern und Vorbereiten (${U.num(qm).replace(',00','')} m²)`, mat.extra * qm]);
        if (x.montage)    p.push([`Montage vor Ort (${U.num(qm).replace(',00','')} m²)`, mat.montage * qm]);
        if (x.km)         p.push([`Fahrzeit ${x.km*2} km`, (x.km*2)/50]);
        return { posten:p, express:x.express,
                 material: qmV * x.preis * (1 + x.aufschlag/100),
                 materialEK: qmV * x.preis,
                 km: x.km * 2 * (Store.settings().kmPauschale || 0.30),
                 zusatz:[[`Material ${U.num(qmV).replace(',00','')} m² à ${U.eur(x.preis)} inkl. ${x.aufschlag}% Aufschlag`,
                          qmV * x.preis * (1 + x.aufschlag/100)],
                         ...(x.km ? [[`Anfahrt ${x.km*2} km`, x.km*2*(Store.settings().kmPauschale||0.30)]] : [])] };
      },
      text: x => `${(MATERIAL.find(m=>m.k===x.material)||{}).n}, ${x.breite} × ${x.hoehe} cm`,
      detail: x => [
        `${x.anzahl} Stück · ${U.num((x.breite/100)*(x.hoehe/100)*Math.max(1,x.anzahl)).replace(',00','')} m² gesamt`,
        x.gestaltung ? 'inklusive Gestaltung und Druckdaten' : '',
        x.montage ? 'inklusive Montage vor Ort' : 'ohne Montage',
        x.km ? 'inklusive Anfahrt' : ''
      ].filter(Boolean).join('\n')
    },

    /* ---------- Logo / Branding ---------- */
    logo: {
      label:'Logo / Branding',
      typ:'Logo / Branding',
      richtwert: 550,
      def: { entwuerfe:3, recherche:true, varianten:true, geschaeftsausstattung:false,
             handbuch:false, express:false },
      felder: () => `
        <div class="field"><label>Wie viele Entwürfe zeigst du</label>
          <input type="number" data-c="entwuerfe" value="${werte.entwuerfe}" min="1" max="6">
          <div class="hint">Drei ist der Standard. Mehr heißt: mehr Arbeit, nicht bessere Auswahl.</div></div>
        <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:6px">
          <label class="check"><input type="checkbox" data-c="recherche" ${werte.recherche?'checked':''}>
            Briefing und Recherche (Wettbewerb ansehen, Richtung klären)</label>
          <label class="check"><input type="checkbox" data-c="varianten" ${werte.varianten?'checked':''}>
            Varianten: farbig, einfarbig, negativ, quadratisch</label>
          <label class="check"><input type="checkbox" data-c="geschaeftsausstattung" ${werte.geschaeftsausstattung?'checked':''}>
            Visitenkarte und Briefbogen dazu</label>
          <label class="check"><input type="checkbox" data-c="handbuch" ${werte.handbuch?'checked':''}>
            Kleines Handbuch (Farben, Schriften, Abstände)</label>
          <label class="check"><input type="checkbox" data-c="express" ${werte.express?'checked':''}>
            Express (unter 3 Tagen)</label>
        </div>`,
      rechne: (x) => {
        const p = [];
        if (x.recherche) p.push(['Briefing und Recherche', 1.5]);
        p.push([`${x.entwuerfe} Entwürfe entwickeln`, x.entwuerfe * 1.8]);
        p.push(['Ausarbeitung des gewählten Entwurfs', 2]);
        p.push(['Vektor-Reinzeichnung und Dateiübergabe', 1.5]);
        if (x.varianten) p.push(['Varianten anlegen', 1]);
        if (x.geschaeftsausstattung) p.push(['Visitenkarte und Briefbogen', 2]);
        if (x.handbuch) p.push(['Kurz-Handbuch', 2]);
        p.push([`Korrekturrunden (${Store.settings().freieSchleifen ?? 2} inklusive)`,
                (Store.settings().freieSchleifen ?? 2) * 0.5]);
        return { posten:p, express:x.express, material:0 };
      },
      text: () => 'Logodesign inklusive Reinzeichnung',
      detail: x => [
        `${x.entwuerfe} Entwürfe zur Auswahl`,
        x.varianten ? 'Varianten farbig, einfarbig, negativ' : '',
        'Dateien als AI, EPS, PDF, PNG, SVG',
        x.geschaeftsausstattung ? 'inklusive Visitenkarte und Briefbogen' : '',
        x.handbuch ? 'inklusive Kurz-Handbuch' : ''
      ].filter(Boolean).join('\n')
    },

    /* ---------- Print: Flyer, Plakat, Visitenkarte ---------- */
    print: {
      label:'Flyer / Plakat / Karte',
      typ:'Sonstiges',
      richtwert: 0,
      def: { was:'Flyer A5', seiten:2, textmenge:'mittel', bilder:2, vorlage:'pdf',
             vorhandenesLayout:false, druckdaten:true, express:false },
      felder: () => `
        <div class="row row-2">
          <div class="field"><label>Was</label>
            <select data-c="was">
              ${['Flyer A6','Flyer A5','Flyer A4','Plakat A3','Plakat A2','Plakat A1','Visitenkarte',
                 'Einleger / Tischaufsteller','Gutschein','Aufkleber','Sonstiges']
                .map(o=>`<option ${o===werte.was?'selected':''}>${o}</option>`).join('')}
            </select></div>
          <div class="field"><label>Seiten</label>
            <input type="number" data-c="seiten" value="${werte.seiten}" min="1"></div>
        </div>
        <div class="row row-3">
          <div class="field"><label>Textmenge</label>
            <select data-c="textmenge">
              ${[['wenig','wenig (Headline, paar Zeilen)'],['mittel','mittel'],['viel','viel (durchgehender Text)']]
                .map(([k,l])=>`<option value="${k}" ${werte.textmenge===k?'selected':''}>${l}</option>`).join('')}
            </select></div>
          <div class="field"><label>Bilder</label>
            <input type="number" data-c="bilder" value="${werte.bilder}" min="0"></div>
          <div class="field"><label>Vorlage</label>
            <select data-c="vorlage">
              ${VORLAGE.map(v=>`<option value="${v.k}" ${werte.vorlage===v.k?'selected':''}>${v.n}</option>`).join('')}
            </select></div>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap">
          <label class="check"><input type="checkbox" data-c="vorhandenesLayout" ${werte.vorhandenesLayout?'checked':''}>
            Es gibt schon ein Layout (nur anpassen)</label>
          <label class="check"><input type="checkbox" data-c="druckdaten" ${werte.druckdaten?'checked':''}>
            Druckdaten erstellen</label>
          <label class="check"><input type="checkbox" data-c="express" ${werte.express?'checked':''}>
            Express</label>
        </div>`,
      rechne: (x) => {
        const vf = (VORLAGE.find(v=>v.k===x.vorlage)||VORLAGE[1]).f;
        const tf = { wenig:0.6, mittel:1, viel:1.6 }[x.textmenge] || 1;
        const p = [];
        p.push([x.vorhandenesLayout ? 'Bestehendes Layout anpassen' : 'Layout entwickeln',
                x.vorhandenesLayout ? 0.75 : 2]);
        p.push([`Satz ${x.seiten} Seite(n)`, x.seiten * 0.8 * tf * vf]);
        if (x.bilder) p.push([`${x.bilder} Bilder bearbeiten`, x.bilder * 0.25]);
        if (x.druckdaten) p.push(['Druckdaten mit Beschnitt', 0.4]);
        p.push([`Korrekturrunden (${Store.settings().freieSchleifen ?? 2} inklusive)`,
                (Store.settings().freieSchleifen ?? 2) * 0.4]);
        return { posten:p, express:x.express, material:0 };
      },
      text: x => `${x.was}${x.seiten>1?`, ${x.seiten}-seitig`:''}`,
      detail: x => [
        x.vorhandenesLayout ? 'Anpassung eines bestehenden Layouts' : 'Layout neu entwickelt',
        x.bilder ? `${x.bilder} Bilder bearbeitet` : '',
        x.druckdaten ? 'inklusive Druckdaten' : ''
      ].filter(Boolean).join('\n')
    },

    /* ---------- Video / Content ---------- */
    video: {
      label:'Video / Content',
      typ:'Video / Content',
      richtwert: 0,
      def: { clips:3, drehStunden:2, km:0, musikText:true, untertitel:true,
             abo:false, express:false },
      felder: () => `
        <div class="row row-3">
          <div class="field"><label>Fertige Clips</label>
            <input type="number" data-c="clips" value="${werte.clips}" min="1"></div>
          <div class="field"><label>Drehzeit vor Ort (Std.)</label>
            <input type="number" data-c="drehStunden" value="${werte.drehStunden}" step="0.5"></div>
          <div class="field"><label>Anfahrt (km einfach)</label>
            <input type="number" data-c="km" value="${werte.km}"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <label class="check"><input type="checkbox" data-c="untertitel" ${werte.untertitel?'checked':''}>
            Untertitel und Texteinblendungen</label>
          <label class="check"><input type="checkbox" data-c="musikText" ${werte.musikText?'checked':''}>
            Musikauswahl und Caption-Texte</label>
          <label class="check"><input type="checkbox" data-c="abo" ${werte.abo?'checked':''}>
            Läuft als monatliches Abo (Preis pro Monat)</label>
          <label class="check"><input type="checkbox" data-c="express" ${werte.express?'checked':''}>
            Express</label>
        </div>`,
      rechne: (x) => {
        const p = [];
        p.push(['Planung und Absprache', 0.75]);
        p.push([`Dreh vor Ort ${x.drehStunden} Std.`, x.drehStunden]);
        if (x.km) p.push([`Fahrzeit ${x.km*2} km`, (x.km*2)/50]);
        p.push(['Sichtung und Auswahl', x.clips * 0.3]);
        p.push([`Schnitt ${x.clips} Clips`, x.clips * 1.1]);
        if (x.untertitel) p.push(['Untertitel und Einblendungen', x.clips * 0.35]);
        if (x.musikText)  p.push(['Musik und Caption-Texte', x.clips * 0.2]);
        return { posten:p, express:x.express, material:0,
                 km: x.km * 2 * (Store.settings().kmPauschale || 0.30),
                 zusatz: x.km ? [[`Anfahrt ${x.km*2} km`, x.km*2*(Store.settings().kmPauschale||0.30)]] : [] };
      },
      text: x => x.abo ? `Content-Abo · ${x.clips} Clips pro Monat` : `Video-Produktion · ${x.clips} Clips`,
      detail: x => [
        `${x.drehStunden} Std. Dreh vor Ort`,
        `${x.clips} geschnittene Clips`,
        x.untertitel ? 'mit Untertiteln' : '',
        x.abo ? 'monatlich, jederzeit kündbar' : ''
      ].filter(Boolean).join('\n')
    },

    /* ---------- Reine Stunden ---------- */
    stunden: {
      label:'Nach Stunden',
      typ:'Sonstiges',
      richtwert: 0,
      def: { was:'', stunden:2, km:0, express:false },
      felder: () => `
        <div class="field"><label>Was machst du</label>
          <input type="text" data-c="was" value="${U.esc(werte.was||'')}" placeholder="z.B. Datenaufbereitung, Beratung vor Ort"></div>
        <div class="row row-2">
          <div class="field"><label>Stunden</label>
            <input type="number" data-c="stunden" value="${werte.stunden}" step="0.25"></div>
          <div class="field"><label>Anfahrt (km einfach)</label>
            <input type="number" data-c="km" value="${werte.km}"></div>
        </div>
        <label class="check"><input type="checkbox" data-c="express" ${werte.express?'checked':''}> Express</label>`,
      rechne: (x) => ({
        posten: [[x.was || 'Arbeitszeit', x.stunden], ...(x.km ? [[`Fahrzeit ${x.km*2} km`, (x.km*2)/50]] : [])],
        express: x.express, material: 0,
        km: x.km * 2 * (Store.settings().kmPauschale || 0.30),
        zusatz: x.km ? [[`Anfahrt ${x.km*2} km`, x.km*2*(Store.settings().kmPauschale||0.30)]] : []
      }),
      text: x => x.was || 'Arbeitszeit nach Aufwand',
      detail: x => `${U.num(x.stunden).replace(',00','')} Stunden`
    }
  };

  /* ================= FENSTER ================= */
  function open(preset={}){
    if (preset.modus) modus = preset.modus;
    werte = {...MODI[modus].def, ...werte, ...(preset.werte||{})};
    // fehlende Felder des Modus ergänzen
    Object.entries(MODI[modus].def).forEach(([k,v]) => { if (werte[k] === undefined) werte[k] = v; });
    fromEditor = typeof Documents !== 'undefined' ? Documents.hasEditor() : false;

    UI.modal({
      title:'Kalkulator',
      wide:true,
      body:`
        <div class="seg" style="margin-bottom:16px;flex-wrap:wrap;display:flex">
          ${Object.entries(MODI).map(([k,m])=>
            `<button class="${k===modus?'active':''}" onclick="Calc.setModus('${k}')">${m.label}</button>`).join('')}
        </div>
        <div id="calcFelder">${MODI[modus].felder()}</div>
        <div id="kResult"></div>`,
      foot:`<button class="btn left" onclick="Calc.reset()">Zurücksetzen</button>
            <button class="btn" onclick="Calc.close()">${fromEditor?'Zurück zum Dokument':'Schließen'}</button>
            <button class="btn" onclick="Calc.copy()">Aufstellung kopieren</button>
            <button class="btn btn-primary" onclick="Calc.toPosition()">Als Position übernehmen</button>`
    });
    bind();
    recalc();
  }

  function setModus(k){
    modus = k;
    werte = {...MODI[k].def};
    document.getElementById('calcFelder').innerHTML = MODI[k].felder();
    document.querySelectorAll('.seg button').forEach(b =>
      b.classList.toggle('active', b.textContent.trim() === MODI[k].label));
    bind();
    recalc();
  }

  /* ---------- Eingaben einsammeln ---------- */
  function bind(){
    document.querySelectorAll('#calcFelder [data-c]').forEach(el => {
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
        // Material gewechselt -> Preisvorschlag nachziehen
        if (el.dataset.mat){
          const m = MATERIAL.find(x => x.k === el.value);
          const pf = document.querySelector('[data-c="preis"]');
          if (m && pf){ pf.value = m.preis; werte.preis = m.preis; }
        }
        recalc();
      });
    });
  }

  function read(){
    const x = {...werte};
    document.querySelectorAll('#calcFelder [data-c]').forEach(el => {
      const k = el.dataset.c;
      x[k] = el.type === 'checkbox' ? el.checked
           : el.type === 'number'   ? U.parseNum(el.value)
           : el.value;
    });
    werte = x;
    return x;
  }

  /* ---------- Rechnen ---------- */
  function ergebnis(){
    const x = read();
    const m = MODI[modus];
    const satz = Store.settings().stundensatz || 65;
    const r = m.rechne(x);

    const stunden = U.sum(r.posten, p => p[1]);
    const arbeit  = stunden * satz;
    const zwischensumme = arbeit + (r.material || 0) + (r.km || 0);
    const expressAufschlag = r.express ? zwischensumme * 0.25 : 0;
    const summe = zwischensumme + expressAufschlag;
    const preis = Math.ceil(summe / 5) * 5;
    const mindest = 90;
    const eigen = preis - (r.materialEK || 0) - (r.km || 0);

    return { x, m, satz, r, stunden, arbeit, zwischensumme, expressAufschlag, summe, preis, mindest,
             proStunde: stunden ? eigen / stunden : null };
  }

  function recalc(){
    const e = ergebnis();
    const box = document.getElementById('kResult');
    if (!box) return;
    const warnungen = [];
    if (e.preis < e.mindest)
      warnungen.push(`Unter ${U.eur0(e.mindest)} lohnt sich der ganze Vorgang nicht – Angebot, Abstimmung und Rechnung kosten dich auch Zeit.`);
    if (e.proStunde !== null && e.proStunde < e.satz * 0.85)
      warnungen.push(`Du landest bei ${U.eur0(e.proStunde)} die Stunde statt ${U.eur0(e.satz)}. Aufschlag hoch oder Umfang kleiner.`);
    if (e.m.richtwert && e.preis > e.m.richtwert * 1.4)
      warnungen.push(`Dein Richtwert für so einen Auftrag sind ${U.eur0(e.m.richtwert)}. Dieser hier ist aufwendiger – erklär dem Kunden warum, dann ist der Preis kein Problem.`);
    if (e.m.richtwert && e.preis < e.m.richtwert * 0.7)
      warnungen.push(`Das liegt deutlich unter deinem Richtwert von ${U.eur0(e.m.richtwert)}. Prüf, ob du nichts vergessen hast.`);

    box.innerHTML = `
      <div class="card card-pad" style="background:var(--sidebar);color:var(--auf-sidebar);border:none;margin-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;opacity:.6">Angebotspreis</div>
            <div style="font-family:'Playfair Display',serif;font-size:31px;font-weight:700;margin-top:2px">${U.eur(e.preis)}</div>
          </div>
          <div style="text-align:right;font-size:12.5px;line-height:1.7;opacity:.75">
            ${U.num(e.stunden).replace(',00','')} Std. Arbeit<br>
            ${e.proStunde ? U.eur0(e.proStunde)+' pro Stunde' : ''}${e.r.express?'<br>inkl. 25% Express':''}
          </div>
        </div>
        ${warnungen.map(w=>`<div style="margin-top:11px;font-size:12.5px;color:var(--warn-hell);line-height:1.55">${U.esc(w)}</div>`).join('')}
      </div>

      <div class="table-wrap" style="margin-top:12px"><table><tbody>
        ${e.r.posten.map(([t,std])=>`<tr>
          <td>${U.esc(t)}<div class="t-sub">${U.num(std).replace(',00','')} Std.</div></td>
          <td class="num t-sub">${U.eur(std * e.satz)}</td></tr>`).join('')}
        ${(e.r.zusatz||[]).map(([t,betrag])=>`<tr>
          <td>${U.esc(t)}</td><td class="num t-sub">${U.eur(betrag)}</td></tr>`).join('')}
        ${e.expressAufschlag ? `<tr><td>Express-Aufschlag 25%</td>
          <td class="num t-sub">${U.eur(e.expressAufschlag)}</td></tr>`:''}
        <tr><td class="t-strong">Summe</td><td class="num t-strong">${U.eur(e.summe)}</td></tr>
        <tr><td class="t-sub">gerundet auf volle 5 €</td><td class="num t-strong">${U.eur(e.preis)}</td></tr>
      </tbody></table></div>`;
  }

  /* ---------- Ausgabe ---------- */
  function text(){
    const e = ergebnis();
    return `${e.m.text(e.x)}\n`
         + e.r.posten.map(([t,std])=>`· ${t} (${U.num(std).replace(',00','')} Std.)`).join('\n')
         + `\n${U.num(e.stunden).replace(',00','')} Std. Arbeit`
         + (e.r.material ? `\nMaterial: ${U.eur(e.r.material)}` : '')
         + `\nAngebotspreis: ${U.eur(e.preis)}`;
  }
  const copy = () => UI.copyText(text(), 'Aufstellung kopiert');
  const reset = () => { werte = {...MODI[modus].def}; open(); };
  const close = () => { if (fromEditor) Documents.openEditor(); else UI.closeModal(); };

  function toPosition(){
    const e = ergebnis();
    const pos = { beschreibung: e.m.text(e.x), detail: e.m.detail(e.x),
                  menge: 1, einheit: '', einzelpreis: e.preis };
    if (fromEditor && Documents.hasEditor()){
      Documents.addPositionFromOutside(pos);
      Documents.openEditor();
      UI.toast('Position eingefügt','ok');
    } else {
      UI.closeModal();
      Documents.newDoc('kv', '', { betreff: e.m.text(e.x), positionen:[pos] });
    }
  }

  /* ---------- Von außen: passenden Modus vorwählen ---------- */
  function fuerTyp(typ){
    const treffer = Object.entries(MODI).find(([,m]) => m.typ === typ);
    open({ modus: treffer ? treffer[0] : 'stunden' });
  }

  return { open, setModus, recalc, copy, reset, close, toPosition, fuerTyp,
           ergebnis, text, MATERIAL, MODI, VORLAGE };
})();
