/* ============================================================
   Kurani CRM – Erscheinungsbild
   Hell, dunkel oder automatisch. Akzentfarbe und Schriftgröße.
   Gedacht wie in den Systemeinstellungen vom Mac: auswählen,
   sofort sehen, fertig.
   ============================================================ */
const Aussehen = (() => {

  const THEMEN = [
    { key:'hell',   name:'Hell' },
    { key:'dunkel', name:'Dunkel' },
    { key:'auto',   name:'Automatisch' }
  ];

  const FARBEN = [
    { key:'schwarz', name:'Schwarz',  ton:'#111111' },
    { key:'blau',    name:'Blau',     ton:'#2563eb' },
    { key:'petrol',  name:'Petrol',   ton:'#0e7490' },
    { key:'gruen',   name:'Grün',     ton:'#15803d' },
    { key:'sand',    name:'Sand',     ton:'#8a6a3d' },
    { key:'orange',  name:'Orange',   ton:'#c2620e' },
    { key:'rot',     name:'Rot',      ton:'#c0392b' },
    { key:'lila',    name:'Lila',     ton:'#6d28d9' }
  ];

  const GROESSEN = [
    { key:'klein',  name:'Klein' },
    { key:'normal', name:'Normal' },
    { key:'gross',  name:'Groß' }
  ];

  /* ---------- Lesen und Anwenden ---------- */

  const jetzt = () => {
    const s = (typeof Store !== 'undefined') ? Store.settings() : {};
    return {
      thema:   s.thema   || 'hell',
      akzent:  s.akzent  || 'schwarz',
      groesse: s.groesse || 'normal'
    };
  };

  /* Setzt die Merkmale am <html> – der Rest passiert über CSS */
  function anwenden(){
    const a = jetzt();
    const w = document.documentElement;
    w.setAttribute('data-thema',   a.thema);
    w.setAttribute('data-akzent',  a.akzent);
    w.setAttribute('data-groesse', a.groesse);

    /* Steht der Mac gerade auf dunkel? Dann gelten bei „Automatisch"
       dieselben Farben wie bei „Dunkel" – die Klasse schaltet sie frei. */
    const systemDunkel = !!(window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    const dunkel = a.thema === 'dunkel' || (a.thema === 'auto' && systemDunkel);
    w.classList.toggle('sys-dunkel', a.thema === 'auto' && systemDunkel);
    w.classList.toggle('ist-dunkel', dunkel);

    /* Die Leiste oben im Handy-Browser mitfärben */
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dunkel ? '#0d0d0c' : '#111111');
  }

  function setzen(was, wert){
    Store.setSetting({ [was]: wert });
    anwenden();
    if (typeof App !== 'undefined') App.rerender();
  }

  /* Wechselt das System zwischen hell und dunkel, folgen wir mit */
  function init(){
    anwenden();
    if (window.matchMedia){
      const abfrage = window.matchMedia('(prefers-color-scheme: dark)');
      const reagieren = () => { if (jetzt().thema === 'auto') anwenden(); };
      if (abfrage.addEventListener) abfrage.addEventListener('change', reagieren);
      else if (abfrage.addListener) abfrage.addListener(reagieren);
    }
  }

  /* Schnell umschalten – für den Knopf in der Seitenleiste */
  function umschalten(){
    const a = jetzt();
    setzen('thema', a.thema === 'dunkel' ? 'hell' : 'dunkel');
    UI.toast(jetzt().thema === 'dunkel' ? 'Dunkel' : 'Hell');
  }

  /* ---------- Kleine Vorschau je Erscheinungsbild ---------- */
  function vorschau(key){
    /* Automatisch zeigt beide Hälften */
    const bild = (bg, karte, seite, strich) => `
      <div class="thema-bild">
        <div class="seite" style="background:${seite}"></div>
        <div class="inhalt" style="background:${bg}">
          <div class="zeile" style="background:${karte};width:80%"></div>
          <div class="zeile" style="background:${strich};width:55%"></div>
          <div class="zeile" style="background:${strich};width:66%"></div>
        </div>
      </div>`;
    if (key === 'hell')   return bild('#f6f6f4', '#111111', '#111111', '#d8d8d4');
    if (key === 'dunkel') return bild('#141413', '#f2f2f0', '#0d0d0c', '#3a3a35');
    /* auto: links hell, rechts dunkel */
    return `<div class="thema-bild" style="position:relative">
      <div style="position:absolute;inset:0;display:flex">
        <div style="width:50%;background:#f6f6f4"></div>
        <div style="width:50%;background:#141413"></div>
      </div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                  font-family:'Playfair Display',serif;font-size:17px;font-weight:700">
        <span style="color:#111">A</span><span style="color:#f2f2f0">A</span>
      </div>
    </div>`;
  }

  /* ---------- Karte für die Einstellungen ---------- */
  function settingsCard(){
    const a = jetzt();
    return `
    <div class="card">
      <div class="card-head"><h3>Erscheinungsbild</h3>
        <div class="actions t-sub">gilt auf diesem Gerät</div></div>
      <div class="card-pad">

        <div class="field">
          <label>Hell oder dunkel</label>
          <div class="thema-wahl">
            ${THEMEN.map(t => `
              <button class="thema-karte ${a.thema===t.key?'aktiv':''}"
                      onclick="Aussehen.setzen('thema','${t.key}')">
                ${vorschau(t.key)}
                <div class="thema-name">${t.name}</div>
              </button>`).join('')}
          </div>
          <div class="hint" style="margin-top:8px">
            Automatisch folgt deinem Mac – abends dunkel, tagsüber hell.
            Zum schnellen Wechseln gibt es oben rechts den Sonne-/Mond-Knopf.
          </div>
        </div>

        <div class="field" style="margin-top:20px">
          <label>Akzentfarbe</label>
          <div class="farb-wahl">
            ${FARBEN.map(f => `
              <button class="farb-punkt ${a.akzent===f.key?'aktiv':''}"
                      style="background:${f.ton}" title="${f.name}"
                      onclick="Aussehen.setzen('akzent','${f.key}')"></button>`).join('')}
          </div>
          <div class="hint" style="margin-top:8px">
            Färbt Knöpfe, den aktiven Menüpunkt und die Balken in den Auswertungen.
          </div>
        </div>

        <div class="field" style="margin-top:20px">
          <label>Schriftgröße</label>
          <div class="zeitraum">
            ${GROESSEN.map(g => `
              <button class="${a.groesse===g.key?'aktiv':''}"
                      onclick="Aussehen.setzen('groesse','${g.key}')">${g.name}</button>`).join('')}
          </div>
        </div>

        <div style="border-top:1px solid var(--line-soft);margin-top:20px;padding-top:16px">
          <div class="t-sub" style="line-height:1.7">
            Die Einstellung liegt bei deinen Daten – wenn der Handy-Sync läuft,
            sieht das CRM auf dem iPhone genauso aus.
            <br>Der Rechnungsdruck bleibt davon unberührt: Papier ist immer weiß.
          </div>
        </div>
      </div>
    </div>`;
  }

  return { init, anwenden, setzen, umschalten, settingsCard, jetzt, vorschau,
           THEMEN, FARBEN, GROESSEN };
})();
