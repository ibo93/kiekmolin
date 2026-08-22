/* ==========================================================
   Kurani CRM – Projekte, Zeiten, Kapazität
   ========================================================== */
const Projects = (() => {

  let view = 'board';   // board | liste
  let showDone = false;

  /* ================= LISTE / BOARD ================= */
  function render(){
    const aktiv = Store.all('projects').filter(p => !['bezahlt','verloren'].includes(p.status));
    const cap = capacity();
    return `
    <div class="page-head">
      <div>
        <h1>Projekte</h1>
        <div class="sub">${aktiv.length} laufend · ${U.eur0(U.sum(aktiv, p=>U.parseNum(p.budget)))} in der Pipeline</div>
      </div>
      <div class="actions">
        <div class="seg">
          <button class="${view==='board'?'active':''}" onclick="Projects.setView('board')">Board</button>
          <button class="${view==='liste'?'active':''}" onclick="Projects.setView('liste')">Liste</button>
        </div>
        <button class="btn" onclick="Calc.open()">Kalkulator</button>
        <button class="btn" onclick="Projects.capacityCheck()">Hab ich Zeit?</button>
        <button class="btn btn-primary" onclick="Projects.edit()">+ Neues Projekt</button>
      </div>
    </div>

    ${capacityBar(cap)}

    ${view === 'board' ? board() : liste()}`;
  }

  function setView(v){ view = v; App.rerender(); }

  function board(){
    const cols = Store.PIPELINE.filter(p => showDone || !['bezahlt','verloren'].includes(p.key));
    return `<div class="kanban">${cols.map(col => {
      const items = U.sortBy(Store.all('projects').filter(p => p.status === col.key),
                            p => p.deadline || '9999');
      return `<div class="kan-col" ondragover="event.preventDefault();this.classList.add('drag-over')"
                   ondragleave="this.classList.remove('drag-over')"
                   ondrop="Projects.drop(event,'${col.key}')">
        <div class="kan-head">${col.label}<span class="cnt">${items.length}</span></div>
        ${items.map(card).join('')}
      </div>`;
    }).join('')}</div>
    <div style="margin-top:12px">
      <label class="check"><input type="checkbox" ${showDone?'checked':''} onchange="Projects.toggleDone()">
        Abgeschlossene (bezahlt / verloren) mitzeigen</label>
    </div>`;
  }

  function card(p){
    const dl = p.deadline ? U.daysUntil(p.deadline) : null;
    const dlCls = dl === null ? '' : dl < 0 ? 'red' : dl <= 3 ? 'amber' : 'grey';
    return `<div class="kan-card" draggable="true"
      ondragstart="Projects.dragStart(event,'${p.id}')" ondragend="this.classList.remove('dragging')"
      onclick="Projects.edit('${p.id}')">
      <div class="t">${U.esc(p.titel)}</div>
      <div class="c">${U.esc(Store.custName(p.customerId))}</div>
      <div class="m">
        ${p.budget ? `<span class="t-strong">${U.eur0(p.budget)}</span>` : ''}
        ${p.aufwandStd ? `<span>${p.aufwandStd} h</span>` : ''}
        ${p.deadline ? `<span class="badge ${dlCls}">${dl<0?'überfällig':'bis '+U.deShort(p.deadline)}</span>` : ''}
      </div>
    </div>`;
  }

  function liste(){
    const ps = U.sortBy(Store.all('projects').filter(p => showDone || !['bezahlt','verloren'].includes(p.status)),
                        p => p.deadline || '9999');
    return `<div class="card table-wrap">${ps.length ? `<table>
      <thead><tr><th>Projekt</th><th>Kunde</th><th>Typ</th><th>Deadline</th>
        <th class="num">Budget</th><th class="num">Zeit</th><th>Status</th></tr></thead>
      <tbody>${ps.map(p => {
        const std = U.sum(Store.all('times').filter(t=>t.projectId===p.id), t=>U.parseNum(t.stunden));
        const dl = p.deadline ? U.daysUntil(p.deadline) : null;
        return `<tr class="clickable" onclick="Projects.edit('${p.id}')">
          <td class="t-strong">${U.esc(p.titel)}</td>
          <td class="t-sub">${U.esc(Store.custName(p.customerId))}</td>
          <td class="t-sub">${U.esc(p.typ||'–')}</td>
          <td>${p.deadline ? `<span class="${dl<0?'badge red':dl<=3?'badge amber':'t-sub'}">${U.de(p.deadline)}</span>` : '<span class="t-sub">–</span>'}</td>
          <td class="num">${p.budget?U.eur(p.budget):'<span class="t-sub">–</span>'}</td>
          <td class="num t-sub">${std?U.num(std)+' h':'–'}${p.aufwandStd?` / ${p.aufwandStd}`:''}</td>
          <td>${UI.pipeBadge(p.status)}</td>
        </tr>`; }).join('')}</tbody></table>`
      : UI.empty('Noch keine Projekte.', `<button class="btn btn-primary" onclick="Projects.edit()">+ Neues Projekt</button>`)}
    </div>
    <div style="margin-top:12px"><label class="check"><input type="checkbox" ${showDone?'checked':''}
      onchange="Projects.toggleDone()"> Abgeschlossene mitzeigen</label></div>`;
  }

  function toggleDone(){ showDone = !showDone; App.rerender(); }

  /* ---------- Drag & Drop ---------- */
  let dragId = null;
  function dragStart(e, id){ dragId = id; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
  function drop(e, status){
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!dragId) return;
    const p = Store.byId('projects', dragId);
    const war = p ? p.status : '';
    Store.update('projects', dragId, { status });
    const fertigId = dragId;
    dragId = null; App.rerender();
    if (status === 'fertig' && war !== 'fertig') rechnungVorschlagen(fertigId);
  }

  /* ================= KAPAZITÄT ================= */
  // Wie viele Stunden sind pro Woche bereits verplant?
  function capacity(weeks=6){
    const cap = Store.settings().kapazitaetStd || 30;
    const start = U.startOfWeek(U.today());

    // Restaufwand je Projekt gleichmäßig auf die Wochen bis zur Deadline verteilen
    const offene = Store.all('projects')
      .filter(p => !['bezahlt','verloren','fertig','berechnet'].includes(p.status))
      .map(p => {
        const std = U.parseNum(p.aufwandStd);
        if (!std) return null;
        const gebucht = U.sum(Store.all('times').filter(t => t.projectId === p.id), t => U.parseNum(t.stunden));
        const rest = Math.max(0, std - gebucht);
        if (!rest) return null;
        // Deadline in der Vergangenheit oder keine Deadline -> diese bzw. nächste 3 Wochen
        const dl = p.deadline && U.daysUntil(p.deadline) > 0 ? p.deadline : U.addDays(U.today(), p.deadline ? 0 : 21);
        const endWeek = U.startOfWeek(dl);
        const n = Math.max(1, Math.round((new Date(endWeek) - new Date(start)) / (7*86400000)) + 1);
        return { endWeek, proWoche: rest / n };
      }).filter(Boolean);

    const buckets = [];
    for (let w = 0; w < weeks; w++){
      const from = U.addDays(start, w*7), to = U.addDays(from, 6);
      const geplant = U.sum(offene.filter(o => from <= o.endWeek), o => o.proWoche);
      buckets.push({ from, to, geplant: Math.round(geplant*10)/10, cap,
                     frei: Math.round((cap - geplant)*10)/10, kw: U.kw(from) });
    }
    return buckets;
  }

  function capacityBar(buckets){
    return `<div class="card card-pad" style="margin-bottom:18px">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px">
        <h3 style="font-size:16px">Deine Auslastung</h3>
        <span class="t-sub">${Store.settings().kapazitaetStd} h pro Woche eingeplant · in Einstellungen änderbar</span>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto">
        ${buckets.map(b => {
          const pct = U.clamp(Math.round(b.geplant / b.cap * 100), 0, 130);
          const cls = pct > 100 ? 'danger' : pct > 80 ? 'warn' : '';
          return `<div style="flex:1;min-width:104px">
            <div class="t-sub" style="margin-bottom:4px">KW ${b.kw}</div>
            <div class="progress"><span class="${cls}" style="width:${U.clamp(pct,0,100)}%"></span></div>
            <div style="font-size:12px;margin-top:5px;color:${pct>100?'var(--red)':'var(--muted)'}">
              ${b.geplant} / ${b.cap} h${pct>100?' — voll':''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  /* ---------- „Hab ich noch Zeit?" ---------- */
  function capacityCheck(){
    UI.modal({
      title:'Hab ich noch Zeit für den Auftrag?',
      body:`
        <p style="font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:16px">
          Sag mir wie lange du dafür brauchst und bis wann es fertig sein soll –
          ich rechne gegen alles was schon in deinem Board steht.</p>
        <div class="row row-2">
          <div class="field"><label>Geschätzter Aufwand (Stunden)</label>
            <input type="number" id="capStd" value="8" min="0.5" step="0.5"></div>
          <div class="field"><label>Fertig bis</label>
            <input type="date" id="capDate" value="${U.addDays(U.today(),14)}"></div>
        </div>
        <div id="capResult"></div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Schließen</button>
            <button class="btn btn-primary" onclick="Projects.runCapacityCheck()">Rechnen</button>`
    });
    setTimeout(runCapacityCheck, 80);
  }

  function runCapacityCheck(){
    const std  = U.parseNum(document.getElementById('capStd').value);
    const bis  = document.getElementById('capDate').value;
    const tage = Math.max(1, U.daysUntil(bis));
    const wochen = Math.max(1, Math.ceil(tage/7));
    const buckets = capacity(wochen);
    const freiGesamt = U.sum(buckets, b => Math.max(0, b.frei));
    const passt = freiGesamt >= std;
    const eng   = freiGesamt >= std * 0.7;

    document.getElementById('capResult').innerHTML = `
      <div class="card card-pad" style="background:${passt?'var(--green-bg)':eng?'var(--amber-bg)':'var(--red-bg)'};border:none;margin-top:6px">
        <div style="font-family:'Playfair Display',serif;font-size:19px;font-weight:700;margin-bottom:6px;
                    color:${passt?'var(--green)':eng?'var(--amber)':'var(--red)'}">
          ${passt ? 'Ja, das geht.' : eng ? 'Wird eng.' : 'Nein – das schaffst du nicht.'}
        </div>
        <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft)">
          Bis ${U.de(bis)} sind das ${wochen} Woche(n).<br>
          Frei: <b>${Math.round(freiGesamt)} h</b> · gebraucht: <b>${std} h</b>
          ${passt ? `<br>Danach bleiben dir noch ${Math.round(freiGesamt-std)} h Luft.`
                  : `<br>Dir fehlen ${Math.round(std-freiGesamt)} h. Entweder Termin nach hinten (${U.de(U.addDays(U.today(), Math.ceil(std/((Store.settings().kapazitaetStd||30)*0.8))*7))}),
                     Aufpreis für Express, oder was anderes schieben.`}
        </div>
      </div>
      <div style="margin-top:12px">${buckets.map(b=>`
        <div style="display:flex;gap:10px;align-items:center;font-size:13px;padding:5px 0">
          <span class="t-sub" style="min-width:66px">KW ${b.kw}</span>
          <div class="progress" style="flex:1;margin:0"><span class="${b.frei<0?'danger':b.frei<5?'warn':''}"
            style="width:${U.clamp(b.geplant/b.cap*100,0,100)}%"></span></div>
          <span style="min-width:74px;text-align:right;color:${b.frei<=0?'var(--red)':'var(--muted)'}">
            ${b.frei>0?b.frei+' h frei':'voll'}</span>
        </div>`).join('')}</div>`;
  }

  /* ================= PROJEKT BEARBEITEN ================= */
  function edit(id=null, customerId=''){
    const p = id ? Store.byId('projects', id) : {
      titel:'', customerId, typ:'', status:'anfrage', deadline:'', budget:'', aufwandStd:'', notizen:''
    };
    const times = id ? U.sortBy(Store.all('times').filter(t => t.projectId===id), t=>t.datum, 'desc') : [];
    const gebucht = U.sum(times, t => U.parseNum(t.stunden));
    const docs = id ? Store.all('documents').filter(d => d.projectId === id) : [];

    UI.modal({
      title: id ? 'Projekt' : 'Neues Projekt',
      wide: !!id,
      body: `
        <div class="field"><label>Titel *</label>
          <input type="text" id="pTitel" value="${U.esc(p.titel)}" placeholder="z.B. Speisekarte Sommer 2026"></div>
        <div class="row row-2">
          <div class="field"><label>Kunde</label>
            <select id="pKunde">${UI.customerOptions(p.customerId)}</select></div>
          <div class="field"><label>Auftragstyp</label>
            <select id="pTyp"><option value="">– wählen –</option>
              ${Store.PROJECT_TYPES.map(t=>`<option ${t===p.typ?'selected':''}>${t}</option>`).join('')}
            </select></div>
        </div>
        <div class="row row-3">
          <div class="field"><label>Status</label>
            <select id="pStatus">${Store.PIPELINE.map(s=>`<option value="${s.key}" ${s.key===p.status?'selected':''}>${s.label}</option>`).join('')}</select></div>
          <div class="field"><label>Deadline</label>
            <input type="date" id="pDeadline" value="${U.esc(p.deadline)}"></div>
          <div class="field"><label>Budget (€)</label>
            <input type="number" id="pBudget" value="${U.esc(p.budget)}" step="10" placeholder="0"></div>
        </div>
        <div class="field"><label>Geschätzter Aufwand (Stunden)</label>
          <input type="number" id="pAufwand" value="${U.esc(p.aufwandStd)}" step="0.5" placeholder="z.B. 6">
          <div class="hint">Wird für die Auslastungs-Rechnung gebraucht${gebucht?` · schon gebucht: ${U.num(gebucht)} h`:''}</div></div>
        <div class="field"><label>Notizen</label>
          <textarea id="pNotiz" placeholder="Absprachen, Maße, Dateien, was der Kunde will…">${U.esc(p.notizen)}</textarea></div>

        ${id ? `
        ${Knowledge.checklistBlock(p)}
        ${schleifenBlock(p)}

        <div style="border-top:1px solid var(--line);margin-top:8px;padding-top:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <h3 style="font-size:15px">Zeiten</h3>
            <span class="t-sub">${U.num(gebucht)} h gebucht${p.aufwandStd?` von ${p.aufwandStd} h`:''}</span>
            <button class="btn btn-sm" style="margin-left:auto" onclick="Projects.addTime('${id}')">+ Zeit buchen</button>
          </div>
          ${times.length ? `<table><tbody>${times.map(t=>`<tr>
              <td class="t-sub" style="width:96px">${U.de(t.datum)}</td>
              <td>${U.esc(t.beschreibung||'–')}</td>
              <td class="num t-strong" style="width:70px">${U.num(t.stunden)} h</td>
              <td style="width:36px;text-align:right">
                <button class="pos-del" onclick="Projects.delTime('${t.id}','${id}')" title="Löschen">✕</button></td>
            </tr>`).join('')}</tbody></table>`
            : `<div class="t-sub" style="padding:6px 0">Noch keine Zeiten gebucht.</div>`}
          ${gebucht ? `<div style="margin-top:10px"><button class="btn btn-sm"
              onclick="Projects.timesToInvoice('${id}')">Zeiten in Rechnung übernehmen (${U.eur(gebucht*(Store.settings().stundensatz||65))})</button></div>`:''}
        </div>

        ${docs.length ? `<div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
          <h3 style="font-size:15px;margin-bottom:8px">Dokumente</h3>
          ${docs.map(d=>`<div style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:13.5px">
            <span class="mono t-strong">${U.esc(d.nummer)}</span>
            <span class="t-sub">${UI.docLabel(d.typ)}</span>
            <span style="margin-left:auto">${U.eur(Store.docTotal(d))}</span>
            ${UI.docBadge(d)}
            <button class="btn btn-sm" onclick="UI.closeModal();Documents.open('${d.id}')">Öffnen</button>
          </div>`).join('')}</div>`:''}
        ` : ''}`,
      foot: `${id ? `<button class="btn btn-danger left" onclick="Projects.del('${id}')">Löschen</button>
              <button class="btn" onclick="Projects.openCalc('${id}')">Kalkulieren</button>
              <button class="btn" onclick="Projects.toDoc('${id}','kv')">→ KV</button>
              <button class="btn" onclick="Projects.toDoc('${id}','rechnung')">→ Rechnung</button>` : ''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Projects.save('${id||''}')">Speichern</button>`
    });
  }

  /* ---------- Kalkulator passend zum Auftragstyp ---------- */
  function openCalc(id){
    const p = Store.byId('projects', id);
    if (p && p.typ) Calc.fuerTyp(p.typ); else Calc.open();
  }

  /* ================= KORREKTURSCHLEIFEN =================
     Der größte versteckte Zeitfresser. Wer mitzählt, kann ab
     einer bestimmten Runde sauber Geld dafür nehmen. */
  function schleifenBlock(p){
    const s = Store.settings();
    const frei = s.freieSchleifen ?? 2;
    const list = p.schleifen || [];
    const drueber = Math.max(0, list.length - frei);
    return `
    <div style="border-top:1px solid var(--line);margin-top:8px;padding-top:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <h3 style="font-size:15px">Korrekturschleifen</h3>
        <span class="badge ${drueber?'red':list.length===frei?'amber':'grey'}">${list.length} von ${frei} frei</span>
        <button class="btn btn-sm" style="margin-left:auto" onclick="Projects.addSchleife('${p.id}')">+ Schleife</button>
      </div>
      ${list.length ? list.map((x,i)=>`<div style="display:flex;gap:10px;align-items:center;font-size:13px;padding:4px 0">
          <span class="t-sub" style="min-width:78px">${i+1}. Runde</span>
          <span class="t-sub">${U.de(x.datum)}</span>
          <span>${U.esc(x.notiz||'')}</span>
          <button class="pos-del" style="margin-left:auto" onclick="Projects.delSchleife('${p.id}',${i})">✕</button>
        </div>`).join('')
        : `<div class="t-sub">Noch keine Änderungsrunde. Trag jede ein, sobald der Kunde Korrekturen schickt.</div>`}

      ${drueber ? `<div class="card card-pad" style="background:var(--amber-bg);border:none;margin-top:12px">
        <div class="t-strong" style="margin-bottom:5px">${drueber} Runde${drueber>1?'n':''} über der Abmachung</div>
        <div class="t-sub" style="line-height:1.6;margin-bottom:10px">
          Das ist Arbeit, die du gerade verschenkst. Sag es freundlich, aber sag es –
          der Text steht fertig bereit.</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="UI.copyText(Projects.schleifenText('${p.id}'))">Text kopieren</button>
          ${Store.byId('customers',p.customerId)?.telefon
            ? `<a class="btn btn-sm" target="_blank" href="${U.waLink(Store.byId('customers',p.customerId).telefon, schleifenText(p.id))}">WhatsApp</a>`:''}
          <button class="btn btn-sm btn-primary" onclick="Projects.schleifeBerechnen('${p.id}')">Als Position berechnen</button>
        </div>
      </div>`:''}
    </div>`;
  }

  function addSchleife(id){
    UI.prompt({
      title:'Korrekturrunde eintragen',
      label:'Was wollte der Kunde geändert haben?',
      placeholder:'z.B. Preise angepasst, Foto getauscht',
      okText:'Eintragen',
      onOk: (txt) => {
        const p = Store.byId('projects', id);
        p.schleifen = p.schleifen || [];
        p.schleifen.push({ datum: U.today(), notiz: txt.trim() });
        Store.update('projects', id, p);
        const frei = Store.settings().freieSchleifen ?? 2;
        UI.toast(p.schleifen.length > frei
          ? `Runde ${p.schleifen.length} – das ist über der Abmachung.`
          : `Runde ${p.schleifen.length} von ${frei} eingetragen`);
        edit(id);
      }
    });
  }
  function delSchleife(id, i){
    const p = Store.byId('projects', id);
    p.schleifen.splice(i,1); Store.update('projects', id, p); edit(id);
  }

  function schleifenText(id){
    const p = Store.byId('projects', id);
    const c = Store.byId('customers', p.customerId) || {};
    const s = Store.settings();
    const frei = s.freieSchleifen ?? 2;
    const name = (c.ansprechpartner||'').trim().split(/\s+/)[0];
    return `Moin${name?' '+name:''}! Kurz zur Transparenz: bei mir sind ${frei} Korrekturrunden im Preis enthalten – `
         + `die haben wir mit „${p.titel}" jetzt genutzt. Weitere Änderungen rechne ich nach Aufwand ab `
         + `(${U.eur(s.stundensatz)}/Std., meist eine halbe bis eine Stunde pro Runde). `
         + `Sag einfach kurz Bescheid, dann mach ich weiter.`;
  }

  function schleifeBerechnen(id){
    const p = Store.byId('projects', id);
    const s = Store.settings();
    const frei = s.freieSchleifen ?? 2;
    const extra = Math.max(0, (p.schleifen||[]).length - frei);
    UI.closeModal();
    Documents.newDoc('rechnung', p.customerId, {
      projectId: id,
      betreff: p.titel,
      positionen: [{
        beschreibung: 'Zusätzliche Korrekturrunden',
        detail: (p.schleifen||[]).slice(frei).map((x,i)=>`${frei+i+1}. Runde vom ${U.de(x.datum)}${x.notiz?': '+x.notiz:''}`).join('\n'),
        menge: extra, einheit:'Runde', einzelpreis: s.stundensatz
      }]
    });
  }

  function save(id){
    const v = k => (document.getElementById(k)||{}).value ?? '';
    const titel = v('pTitel').trim();
    if (!titel){ UI.toast('Titel fehlt','err'); return; }
    const patch = {
      titel, customerId: v('pKunde'), typ: v('pTyp'), status: v('pStatus'),
      deadline: v('pDeadline'), budget: U.parseNum(v('pBudget')),
      aufwandStd: U.parseNum(v('pAufwand')), notizen: v('pNotiz')
    };
    const vorher = id ? (Store.byId('projects', id)||{}).status : '';
    if (id) Store.update('projects', id, patch); else Store.add('projects', patch);
    UI.closeModal(); UI.toast('Projekt gespeichert','ok'); App.rerender();
    if (id && patch.status === 'fertig' && vorher !== 'fertig') rechnungVorschlagen(id);
  }

  /* ---------- Projekt fertig? Dann gleich die Rechnung ----------
     Baut aus gebuchten Zeiten oder dem Budget einen Entwurf und
     rechnet geleistete Anzahlungen heraus. Geschrieben wird erst auf Klick. */

  function rechnungsEntwurf(id){
    const p = Store.byId('projects', id);
    if (!p) return null;
    const s = Store.settings();

    const zeiten = Store.all('times').filter(t => t.projectId === id);
    const std = U.sum(zeiten, t => U.parseNum(t.stunden));
    const budget = U.parseNum(p.budget);

    let positionen, grundlage;
    if (budget > 0){
      positionen = [{ beschreibung: p.titel, detail: p.notizen || '', menge: 1, einzelpreis: budget }];
      grundlage = `vereinbarter Preis ${U.eur(budget)}`;
    } else if (std > 0){
      /* Zeiten zusammenfassen: gleiche Tätigkeit = eine Position */
      const nach = U.groupBy(zeiten, t => (t.text || p.titel).trim());
      positionen = Object.entries(nach).map(([text, liste]) => ({
        beschreibung: text,
        detail: '',
        menge: Math.round(U.sum(liste, t => U.parseNum(t.stunden)) * 100) / 100,
        einheit: 'Std',
        einzelpreis: U.parseNum(s.stundensatz)
      }));
      grundlage = `${U.num(std)} gebuchte Stunden à ${U.eur(s.stundensatz)}`;
    } else {
      positionen = [{ beschreibung: p.titel, detail: p.notizen || '', menge: 1, einzelpreis: 0 }];
      grundlage = 'weder Preis noch Zeiten hinterlegt – Betrag musst du eintragen';
    }

    /* Bereits gestellte Anzahlungen abziehen */
    const anz = (typeof Documents !== 'undefined' && Documents.anzahlungenZu)
      ? Documents.anzahlungenZu(id) : [];
    anz.forEach(a => positionen.push({
      beschreibung: `Abzüglich Anzahlung ${a.nummer} vom ${U.de(a.datum)}`,
      menge: 1, einzelpreis: -Store.docNetto(a)
    }));

    const summe = U.sum(positionen, x => U.parseNum(x.menge) * U.parseNum(x.einzelpreis));
    return { p, positionen, summe, grundlage, std, anz };
  }

  function rechnungVorschlagen(id){
    const schon = Store.all('documents').filter(d =>
      d.projectId === id && d.typ === 'rechnung' && d.art !== 'anzahlung' && d.status !== 'storniert');
    if (schon.length) return;

    const e = rechnungsEntwurf(id);
    if (!e) return;

    UI.modal({
      title: 'Fertig – Rechnung gleich schreiben?',
      body: `
        <p style="font-size:14.5px;line-height:1.7;margin-bottom:16px">
          <b>${U.esc(e.p.titel)}</b> für ${U.esc(Store.custName(e.p.customerId) || 'ohne Kunde')} steht auf fertig.
          Wer sofort schreibt, wird schneller bezahlt. Grundlage: ${U.esc(e.grundlage)}.
        </p>
        <div class="table-wrap"><table>
          <thead><tr><th>Position</th><th style="width:70px;text-align:right">Menge</th>
            <th style="width:100px;text-align:right">Einzel</th><th style="width:110px;text-align:right">Summe</th></tr></thead>
          <tbody>${e.positionen.map(x => `<tr>
            <td>${U.esc(x.beschreibung)}</td>
            <td style="text-align:right">${U.num(x.menge)}${x.einheit ? ' '+x.einheit : ''}</td>
            <td style="text-align:right">${U.eur(x.einzelpreis)}</td>
            <td style="text-align:right">${U.eur(U.parseNum(x.menge)*U.parseNum(x.einzelpreis))}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="3" style="text-align:right;font-weight:600;padding-top:10px">Netto</td>
            <td style="text-align:right;font-weight:600;padding-top:10px">${U.eur(e.summe)}</td></tr></tfoot>
        </table></div>
        ${e.summe <= 0 ? '<p class="t-sub" style="margin-top:12px;color:var(--amber)">Der Betrag steht auf null – trag ihn im Editor noch ein.</p>' : ''}`,
      foot: `<button class="btn" onclick="UI.closeModal()">Später</button>
             <button class="btn btn-primary" onclick="Projects.rechnungSchreiben('${id}')">Rechnung anlegen</button>`
    });
  }

  function rechnungSchreiben(id){
    const e = rechnungsEntwurf(id);
    if (!e) return;
    UI.closeModal();
    Documents.newDoc('rechnung', e.p.customerId, {
      projectId: id,
      betreff: e.p.titel,
      positionen: e.positionen
    });
  }

  function del(id){
    UI.confirm('Projekt wirklich löschen? Gebuchte Zeiten gehen mit.', () => {
      Store.all('times').filter(t=>t.projectId===id).forEach(t=>Store.remove('times',t.id));
      Store.remove('projects', id); UI.closeModal(); UI.toast('Projekt gelöscht'); App.rerender();
    });
  }

  function toDoc(id, typ){
    const p = Store.byId('projects', id);
    UI.closeModal();
    Documents.newDoc(typ, p.customerId, {
      projectId: id,
      betreff: p.titel,
      positionen: [{ beschreibung: p.titel, detail: p.notizen||'', menge:1, einzelpreis: U.parseNum(p.budget) }]
    });
  }

  /* ---------- Zeiten ---------- */
  function addTime(projectId){
    const p = Store.byId('projects', projectId);
    UI.modal({
      title:'Zeit buchen · ' + p.titel,
      body:`<div class="row row-2">
          <div class="field"><label>Datum</label><input type="date" id="tDatum" value="${U.today()}"></div>
          <div class="field"><label>Stunden</label><input type="number" id="tStd" step="0.25" value="1" min="0"></div>
        </div>
        <div class="field"><label>Was gemacht?</label>
          <input type="text" id="tText" placeholder="z.B. Entwurf Speisekarte, Korrekturen"></div>`,
      foot:`<button class="btn" onclick="Projects.edit('${projectId}')">Zurück</button>
            <button class="btn btn-primary" onclick="Projects.saveTime('${projectId}')">Buchen</button>`
    });
  }
  function saveTime(projectId){
    Store.add('times', {
      projectId, datum: document.getElementById('tDatum').value,
      stunden: U.parseNum(document.getElementById('tStd').value),
      beschreibung: document.getElementById('tText').value.trim(),
      satz: Store.settings().stundensatz, abgerechnet:false
    });
    UI.toast('Zeit gebucht','ok'); edit(projectId);
  }
  function delTime(id, projectId){ Store.remove('times', id); edit(projectId); }

  function timesToInvoice(projectId){
    const p = Store.byId('projects', projectId);
    const ts = Store.all('times').filter(t => t.projectId === projectId && !t.abgerechnet);
    const std = U.sum(ts, t => U.parseNum(t.stunden));
    const satz = Store.settings().stundensatz || 65;
    UI.closeModal();
    Documents.newDoc('rechnung', p.customerId, {
      projectId,
      betreff: p.titel,
      positionen: [{
        beschreibung: p.titel,
        detail: ts.map(t => `${U.de(t.datum)} · ${t.beschreibung||'Arbeitszeit'} · ${U.num(t.stunden)} h`).join('\n'),
        menge: std, einzelpreis: satz, einheit:'Std.'
      }]
    });
  }

  /* ---------- Zeiten-Übersicht (eigener Menüpunkt) ---------- */
  function renderTimes(){
    const ts = U.sortBy(Store.all('times'), t => t.datum, 'desc');
    const wochen = U.groupBy(ts, t => U.weekKey(t.datum));
    const satz = Store.settings().stundensatz || 65;
    const monat = ts.filter(t => U.monthKey(t.datum) === U.monthKey(U.today()));
    const stdMonat = U.sum(monat, t=>U.parseNum(t.stunden));
    return `
    <div class="page-head">
      <div><h1>Zeiten</h1>
        <div class="sub">${U.num(stdMonat)} h diesen Monat · Wert ${U.eur(stdMonat*satz)}</div></div>
      <div class="actions">
        <button class="btn" onclick="Projects.exportTimes()">CSV</button>
        <button class="btn btn-primary" onclick="Projects.quickTime()">+ Zeit buchen</button>
      </div>
    </div>

    ${capacityBar(capacity())}

    <div class="card table-wrap">
      ${ts.length ? Object.keys(wochen).sort().reverse().map(w => {
        const items = wochen[w];
        const sum = U.sum(items, t=>U.parseNum(t.stunden));
        return `<div class="card-head" style="background:var(--card-weich)">
            <h3 style="font-size:14px">${w.replace('-KW',' · KW ')}</h3>
            <div class="actions t-sub">${U.num(sum)} h · ${U.eur(sum*satz)}</div></div>
          <table><tbody>${items.map(t => `<tr>
            <td class="t-sub" style="width:100px">${U.de(t.datum)}</td>
            <td><div class="t-strong">${U.esc(Store.projName(t.projectId)||'Ohne Projekt')}</div>
              <div class="t-sub">${U.esc(t.beschreibung||'')}</div></td>
            <td class="num t-strong" style="width:80px">${U.num(t.stunden)} h</td>
            <td class="num t-sub" style="width:90px">${U.eur(U.parseNum(t.stunden)*(t.satz||satz))}</td>
            <td style="width:40px;text-align:right"><button class="pos-del"
              onclick="Store.remove('times','${t.id}');App.rerender()">✕</button></td>
          </tr>`).join('')}</tbody></table>`;
      }).join('') : UI.empty('Noch keine Zeiten gebucht.',
        `<button class="btn btn-primary" onclick="Projects.quickTime()">+ Zeit buchen</button>`)}
    </div>`;
  }

  function quickTime(){
    UI.modal({
      title:'Zeit buchen',
      body:`<div class="field"><label>Projekt</label>
          <select id="qProj">${UI.projectOptions()}</select></div>
        <div class="row row-2">
          <div class="field"><label>Datum</label><input type="date" id="qDatum" value="${U.today()}"></div>
          <div class="field"><label>Stunden</label><input type="number" id="qStd" step="0.25" value="1"></div>
        </div>
        <div class="field"><label>Was gemacht?</label><input type="text" id="qText"></div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Projects.saveQuickTime()">Buchen</button>`
    });
  }
  function saveQuickTime(){
    Store.add('times', {
      projectId: document.getElementById('qProj').value,
      datum: document.getElementById('qDatum').value,
      stunden: U.parseNum(document.getElementById('qStd').value),
      beschreibung: document.getElementById('qText').value.trim(),
      satz: Store.settings().stundensatz, abgerechnet:false
    });
    UI.closeModal(); UI.toast('Zeit gebucht','ok'); App.rerender();
  }

  function exportTimes(){
    const rows = [['Datum','Projekt','Kunde','Beschreibung','Stunden','Satz','Wert']];
    U.sortBy(Store.all('times'), t=>t.datum).forEach(t => {
      const p = Store.byId('projects', t.projectId) || {};
      rows.push([U.de(t.datum), p.titel||'', Store.custName(p.customerId), t.beschreibung||'',
        U.num(t.stunden), U.num(t.satz||0), U.num(U.parseNum(t.stunden)*(t.satz||0))]);
    });
    U.download(`Zeiten_${U.today()}.csv`, '﻿'+U.csv(rows), 'text/csv');
    UI.toast('CSV exportiert','ok');
  }

  return { render, renderTimes, setView, toggleDone, board, edit, save, del, toDoc,
           openCalc, schleifenBlock, addSchleife, delSchleife, schleifenText, schleifeBerechnen,
           rechnungVorschlagen, rechnungSchreiben, rechnungsEntwurf,
           dragStart, drop, addTime, saveTime, delTime, timesToInvoice, quickTime,
           saveQuickTime, exportTimes, capacity, capacityCheck, runCapacityCheck };
})();
