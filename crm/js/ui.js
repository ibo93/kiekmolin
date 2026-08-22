/* ==========================================================
   Kurani CRM – UI-Bausteine
   Modal, Toast, Badges, kleine Renderer
   ========================================================== */
const UI = (() => {

  /* ---------- Toast ---------- */
  function toast(msg, kind='', ms=3400){
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)';
      setTimeout(()=>el.remove(), 220); }, ms);
  }

  /* ---------- Modal ---------- */
  let onCloseCb = null;
  function modal({title, body, foot, wide=false, onClose=null}){
    const bd = document.getElementById('modalBackdrop');
    const m  = document.getElementById('modal');
    m.className = 'modal' + (wide ? ' wide' : '');
    m.innerHTML = `
      <div class="modal-head">
        <h2>${U.esc(title)}</h2>
        <button class="x" onclick="UI.closeModal()" aria-label="Schließen">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
    bd.classList.add('show');
    onCloseCb = onClose;
    setTimeout(()=>{ const f = m.querySelector('input:not([type=hidden]),textarea,select'); if(f) f.focus(); }, 60);
  }
  function closeModal(){
    document.getElementById('modalBackdrop').classList.remove('show');
    if (onCloseCb){ const cb = onCloseCb; onCloseCb = null; cb(); }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* ---------- Bestätigen ---------- */
  function confirm(text, onYes, {yes='Ja, machen', danger=true, title='Sicher?'} = {}){
    window.__uiConfirm = () => { closeModal(); onYes(); };
    modal({
      title,
      body: `<p style="font-size:14.5px;line-height:1.6">${U.esc(text)}</p>`,
      foot: `<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
             <button class="btn ${danger?'btn-danger':'btn-primary'}" onclick="window.__uiConfirm()">${U.esc(yes)}</button>`
    });
  }

  /* ---------- Prompt (einzeiliger Text) ---------- */
  function prompt({title, label, value='', placeholder='', multiline=false, onOk, okText='Speichern'}){
    window.__uiPromptOk = () => {
      const v = document.getElementById('uiPromptField').value;
      closeModal(); onOk(v);
    };
    modal({
      title,
      body: `<div class="field"><label>${U.esc(label)}</label>
        ${multiline
          ? `<textarea id="uiPromptField" rows="6" placeholder="${U.esc(placeholder)}">${U.esc(value)}</textarea>`
          : `<input type="text" id="uiPromptField" value="${U.esc(value)}" placeholder="${U.esc(placeholder)}">`}
      </div>`,
      foot: `<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
             <button class="btn btn-primary" onclick="window.__uiPromptOk()">${U.esc(okText)}</button>`
    });
  }

  /* ---------- Badges ---------- */
  const DOC_STATUS = {
    entwurf:  { label:'Entwurf',   cls:'grey'  },
    versendet:{ label:'Versendet', cls:'blue'  },
    bezahlt:  { label:'Bezahlt',   cls:'green' },
    teilweise:{ label:'Teilzahlung',cls:'amber'},
    storniert:{ label:'Storniert', cls:'grey'  }
  };
  function docBadge(d){
    if (d.status === 'storniert') return `<span class="badge grey">Storniert</span>`;
    if (Store.isInvoice(d)){
      if (d.status === 'bezahlt') return `<span class="badge green">Bezahlt</span>`;
      if (d.status === 'entwurf') return `<span class="badge grey">Entwurf</span>`;
      const paid = Store.docPaid(d);
      if (paid > 0) return `<span class="badge amber">Teilzahlung</span>`;
      const od = U.daysAgo(d.faellig || d.datum);
      if (od > 0) return `<span class="badge red">${od} Tage überfällig</span>`;
      return `<span class="badge blue">Offen</span>`;
    }
    if (d.typ === 'kv' || d.typ === 'angebot'){
      if (d.status === 'angenommen') return `<span class="badge green">Angenommen</span>`;
      if (d.status === 'abgelehnt')  return `<span class="badge red">Abgelehnt</span>`;
      if (d.status === 'entwurf')    return `<span class="badge grey">Entwurf</span>`;
      const age = U.daysAgo(d.datum);
      if (age > (Store.settings().kvGueltigTage||30)) return `<span class="badge amber">Abgelaufen</span>`;
      return `<span class="badge blue">Offen</span>`;
    }
    const s = DOC_STATUS[d.status] || DOC_STATUS.entwurf;
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }
  const DOC_LABEL = { rechnung:'Rechnung', kv:'Kostenvoranschlag', angebot:'Angebot',
                      ab:'Auftragsbestätigung', mahnung:'Mahnung' };
  const docLabel = t => DOC_LABEL[t] || t;

  function pipeBadge(status){
    const p = Store.PIPELINE.find(x => x.key === status) || Store.PIPELINE[0];
    return `<span class="badge ${p.color}">${p.label}</span>`;
  }

  /* ---------- Leerzustand ---------- */
  function empty(text, btnHtml=''){
    return `<div class="empty">
      <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h10v2H7zm0 4h7v2H7zm0-8h10v2H7z"/></svg>
      <p>${U.esc(text)}</p>${btnHtml}</div>`;
  }

  /* ---------- Kunden-Dropdown ---------- */
  function customerOptions(selected=''){
    return `<option value="">– kein Kunde –</option>` +
      U.sortBy(Store.all('customers'), c => c.firma.toLowerCase())
       .map(c => `<option value="${c.id}" ${c.id===selected?'selected':''}>${U.esc(c.firma)}${c.nr?' · '+c.nr:''}</option>`).join('');
  }
  function projectOptions(selected='', customerId=''){
    let ps = Store.all('projects');
    if (customerId) ps = ps.filter(p => p.customerId === customerId);
    return `<option value="">– kein Projekt –</option>` +
      U.sortBy(ps, p => p.titel.toLowerCase())
       .map(p => `<option value="${p.id}" ${p.id===selected?'selected':''}>${U.esc(p.titel)}</option>`).join('');
  }

  /* ---------- Backup-Hinweis ---------- */
  function refreshBackupHint(){
    const el = document.getElementById('backupHint');
    if (!el) return;
    const lb = Store.data().meta.lastBackup;
    if (!lb){ el.textContent = 'Noch kein Backup gemacht'; el.className = 'backup-hint warn'; return; }
    const d = U.daysAgo(lb);
    el.textContent = d === 0 ? 'Backup: heute' : `Letztes Backup: ${U.de(lb)}`;
    el.className = 'backup-hint' + (d > 7 ? ' warn' : '');
  }

  /* ---------- Text kopieren ---------- */
  async function copyText(txt, msg='In die Zwischenablage kopiert'){
    await U.copy(txt); toast(msg, 'ok');
  }

  /* ---------- Mini-Balkendiagramm ---------- */

  /* ---------- Symbole ----------
     Ein kleines Set, damit Listen und Kacheln nicht nur Text sind. */
  const SYM = {
    geld:     'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
    rechnung: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    kunde:    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    projekt:  'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
    uhr:      'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    warnung:  'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    haken:    'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    hoch:     'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
    runter:   'M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z',
    karte:    'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
    beleg:    'M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2v20l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5zM19 19.09H5V4.91h14v14.18zM6 15h12v2H6zm0-4h12v2H6zm0-4h12v2H6z',
    termin:   'M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z',
    ziel:     'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z',
    nachricht:'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z'
  };

  /* <svg> für ein Symbol – für Kacheln und Listen */
  const sym = name => `<svg viewBox="0 0 24 24"><path d="${SYM[name] || SYM.rechnung}"/></svg>`;

  /* Runde Plakette mit Symbol */
  const plakette = (name, farbe='') => `<div class="plakette ${farbe}">${sym(name)}</div>`;

  /* Zeitraum-Umschalter: [{key,label}], aktiv, Funktionsname */
  const zeitraum = (punkte, aktiv, fn) => `<div class="zeitraum">${
    punkte.map(p => `<button class="${p.key===aktiv?'aktiv':''}"
      onclick="${fn}('${p.key}')">${U.esc(p.label)}</button>`).join('')}</div>`;

  function barChart(items){ // [{label, value}]
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div class="chart">` + items.map(i => `
      <div class="chart-col">
        <div class="chart-bar" style="height:${Math.max(2, (i.value/max)*100)}%">
          <span class="tip">${U.eur(i.value)}</span>
        </div>
        <div class="chart-lbl">${U.esc(i.label)}</div>
      </div>`).join('') + `</div>`;
  }

  return { toast, modal, closeModal, confirm, prompt, docBadge, docLabel, pipeBadge,
           empty, customerOptions, projectOptions, refreshBackupHint, copyText, barChart, DOC_LABEL,
           sym, plakette, zeitraum, SYM };
})();
