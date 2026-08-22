/* ==========================================================
   Kurani CRM – Dokumente
   KV · Angebot · Auftragsbestätigung · Rechnung · Mahnung
   inkl. Nummernkreise, §19, Mahnwesen, Druck im Hausstil
   ========================================================== */
const Documents = (() => {

  let filter = { typ:'alle', status:'alle', q:'' };
  let editing = null;   // Arbeitskopie im Editor

  /* ================= LISTE ================= */
  function render(){
    const ds = list();
    const jahr = new Date().getFullYear();
    const rech = Store.all('documents').filter(Store.isInvoice);
    const offen = U.sum(rech.filter(Store.isOpenInvoice), Store.docOpen);
    const ueber = U.sum(rech.filter(Store.isOverdue), Store.docOpen);
    const bezahlt = U.sum(rech.filter(d => d.status==='bezahlt' && U.yearOf(d.bezahltAm||d.datum)===jahr), Store.docTotal);

    return `
    <div class="page-head">
      <div><h1>Rechnungen &amp; KV</h1>
        <div class="sub">${rech.length} Rechnungen · ${Store.all('documents').filter(d=>d.typ==='kv').length} Kostenvoranschläge</div></div>
      <div class="actions">
        <button class="btn" onclick="Documents.exportCsv()">CSV</button>
        <button class="btn" onclick="Documents.newDoc('kv')">+ KV</button>
        <button class="btn btn-primary" onclick="Documents.newDoc('rechnung')">+ Rechnung</button>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi accent-green"><div class="label">Bezahlt ${jahr}</div><div class="value">${U.eur0(bezahlt)}</div></div>
      <div class="kpi"><div class="label">Offen</div><div class="value">${U.eur0(offen)}</div>
        <div class="foot">${rech.filter(Store.isOpenInvoice).length} Rechnungen</div></div>
      <div class="kpi accent-red"><div class="label">Überfällig</div><div class="value">${U.eur0(ueber)}</div>
        <div class="foot">${rech.filter(Store.isOverdue).length} Rechnungen</div></div>
      <div class="kpi"><div class="label">Entwürfe</div><div class="value">${Store.all('documents').filter(d=>d.status==='entwurf').length}</div>
        <div class="foot">noch nicht raus</div></div>
    </div>

    <div class="filterbar">
      <input type="text" placeholder="Nummer, Kunde, Betreff…" value="${U.esc(filter.q)}"
             oninput="Documents.setFilter('q',this.value)" id="docSearch">
      <select onchange="Documents.setFilter('typ',this.value)">
        ${[['alle','Alle Typen'],['rechnung','Rechnungen'],['kv','Kostenvoranschläge'],
           ['angebot','Angebote'],['ab','Auftragsbestätigungen'],['mahnung','Mahnungen']]
          .map(([k,l])=>`<option value="${k}" ${filter.typ===k?'selected':''}>${l}</option>`).join('')}
      </select>
      <select onchange="Documents.setFilter('status',this.value)">
        ${[['alle','Alle Status'],['offen','Offen'],['ueberfaellig','Überfällig'],
           ['bezahlt','Bezahlt'],['entwurf','Entwurf']]
          .map(([k,l])=>`<option value="${k}" ${filter.status===k?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>

    <div class="card table-wrap">
      ${ds.length ? `<table>
        <thead><tr><th>Nummer</th><th>Kunde</th><th>Betreff</th><th>Datum</th><th>Fällig</th>
          <th class="num">Betrag</th><th>Status</th><th></th></tr></thead>
        <tbody>${ds.map(rowHtml).join('')}</tbody></table>`
      : UI.empty('Keine Dokumente gefunden.',
          `<button class="btn btn-primary" onclick="Documents.newDoc('rechnung')">+ Erste Rechnung</button>`)}
    </div>`;
  }

  function list(){
    let ds = Store.all('documents');
    if (filter.typ !== 'alle') ds = ds.filter(d => d.typ === filter.typ);
    if (filter.status === 'offen')       ds = ds.filter(Store.isOpenInvoice);
    if (filter.status === 'ueberfaellig')ds = ds.filter(Store.isOverdue);
    if (filter.status === 'bezahlt')     ds = ds.filter(d => d.status === 'bezahlt');
    if (filter.status === 'entwurf')     ds = ds.filter(d => d.status === 'entwurf');
    const q = filter.q.toLowerCase().trim();
    if (q) ds = ds.filter(d => (d.nummer+' '+Store.custName(d.customerId)+' '+(d.betreff||'')+' '+
      (d.positionen||[]).map(p=>p.beschreibung).join(' ')).toLowerCase().includes(q));
    return U.sortBy(ds, d => d.datum + d.nummer, 'desc');
  }

  function rowHtml(d){
    const od = Store.isOverdue(d);
    return `<tr class="clickable" onclick="Documents.open('${d.id}')">
      <td><div class="t-strong mono">${U.esc(d.nummer)}</div><div class="t-sub">${UI.docLabel(d.typ)}</div></td>
      <td>${U.esc(Store.custName(d.customerId))}</td>
      <td class="t-sub">${U.esc(U.cut(d.betreff || (d.positionen||[])[0]?.beschreibung || '–', 40))}</td>
      <td class="t-sub">${U.de(d.datum)}</td>
      <td class="t-sub">${d.faellig ? `<span style="${od?'color:var(--red);font-weight:600':''}">${U.de(d.faellig)}</span>` : '–'}</td>
      <td class="num t-strong">${U.eur(Store.docTotal(d))}</td>
      <td>${UI.docBadge(d)}</td>
      <td style="text-align:right" onclick="event.stopPropagation()">
        <button class="btn btn-sm" onclick="Documents.alsPdf('${d.id}')">PDF</button></td>
    </tr>`;
  }

  function setFilter(k,v){
    filter[k]=v; App.rerender();
    if (k==='q'){ const el=document.getElementById('docSearch'); if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);} }
  }

  /* ================= NEU / ÖFFNEN ================= */
  function newDoc(typ='rechnung', customerId='', preset={}){
    const s = Store.settings();
    const datum = U.today();
    editing = {
      id:null, typ, nummer: Store.nextNumber(typ), datum, customerId, projectId:'',
      betreff:'', anschreiben:'', positionen:[{beschreibung:'',detail:'',menge:1,einheit:'',einzelpreis:''}],
      status:'entwurf', notiz:'', zahlungen:[],
      faellig: typ==='rechnung' ? U.dueDate(datum, s.zahlungszielTage) : '',
      gueltigBis: (typ==='kv'||typ==='angebot') ? U.dueDate(datum, s.kvGueltigTage) : '',
      ...preset
    };
    openEditor();
  }

  function open(id){
    const d = Store.byId('documents', id);
    if (!d) return;
    editing = JSON.parse(JSON.stringify(d));
    if (!editing.positionen?.length) editing.positionen = [{beschreibung:'',menge:1,einzelpreis:''}];
    openEditor();
  }

  /* ================= EDITOR ================= */
  function openEditor(){
    const d = editing;
    const isNew = !d.id;
    const isRech = d.typ === 'rechnung';
    const isKV   = d.typ === 'kv' || d.typ === 'angebot';
    const isMahn = d.typ === 'mahnung';
    const total  = Store.docTotal(d);
    const paid   = Store.docPaid(d);
    const c      = Store.byId('customers', d.customerId);

    UI.modal({
      title: (isNew ? 'Neu: ' : '') + UI.docLabel(d.typ) + ' ' + d.nummer,
      wide: true,
      body: `
        <div class="row row-3">
          <div class="field"><label>Typ</label>
            <select id="dTyp" onchange="Documents.changeTyp(this.value)">
              ${Object.entries(UI.DOC_LABEL).map(([k,l])=>`<option value="${k}" ${k===d.typ?'selected':''}>${l}</option>`).join('')}
            </select></div>
          <div class="field"><label>Nummer</label><input type="text" id="dNummer" value="${U.esc(d.nummer)}"></div>
          <div class="field"><label>Datum</label>
            <input type="date" id="dDatum" value="${U.esc(d.datum)}" onchange="Documents.recalcDates()"></div>
        </div>

        <div class="row row-2">
          <div class="field"><label>Kunde</label>
            <select id="dKunde" onchange="Documents.changeCustomer(this.value)">${UI.customerOptions(d.customerId)}</select>
            ${c && !c.strasse ? `<div class="hint" style="color:var(--amber)">Adresse fehlt – für den Druck bitte beim Kunden ergänzen.</div>`:''}
          </div>
          <div class="field"><label>Projekt</label>
            <select id="dProjekt">${UI.projectOptions(d.projectId, d.customerId)}</select></div>
        </div>

        <div class="field"><label>Betreff</label>
          <input type="text" id="dBetreff" value="${U.esc(d.betreff)}" placeholder="z.B. Speisekarte Sommer 2026"></div>

        <div class="field"><label>Anschreiben <span class="t-sub">(steht über der Tabelle)</span></label>
          <textarea id="dAnschreiben" rows="3" placeholder="${U.esc(defaultIntro(d))}">${U.esc(d.anschreiben)}</textarea>
          ${!d.anschreiben ? `<div class="hint">Leer lassen = Standardtext wird gedruckt.</div>`:''}</div>

        <div style="margin-top:6px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <label style="font-size:12.5px;font-weight:600">Positionen</label>
            <button class="btn btn-sm" style="margin-left:auto" onclick="Documents.addPos()">+ Position</button>
          </div>
          <table class="pos-table">
            <thead><tr>
              <th style="width:42%">Beschreibung</th><th style="width:11%">Menge</th>
              <th style="width:12%">Einheit</th>
              ${Store.settings().kleinunternehmer ? '' : '<th style="width:11%">USt %</th>'}
              <th style="width:17%">Preis €${Store.settings().kleinunternehmer ? '' : (Store.settings().preiseSindBrutto ? ' brutto' : ' netto')}</th><th></th>
            </tr></thead>
            <tbody id="posBody">${d.positionen.map(posRow).join('')}</tbody>
          </table>

          <div class="catalog">
            <span class="t-sub" style="align-self:center;margin-right:4px">Schnell einfügen:</span>
            ${Store.CATALOG.slice(0,10).map((k,i)=>`<button class="cat-chip" onclick="Documents.addFromCatalog(${i})">${U.esc(k.t.split('(')[0].trim())}${k.p?` · ${k.p}€`:''}</button>`).join('')}
            <button class="cat-chip" onclick="Documents.showCatalog()">alle …</button>
            <button class="cat-chip" style="border-color:var(--ink)" onclick="Documents.openCalc()">Preis kalkulieren</button>
          </div>

          ${isMahn ? `<div class="row row-2" style="margin-top:14px">
            <div class="field"><label>Mahngebühr €</label>
              <input type="number" id="dMahngebuehr" step="1" value="${U.esc(d.mahngebuehr||0)}" oninput="Documents.recalcSum()"></div>
            <div class="field"><label>Mahnstufe</label>
              <select id="dMahnstufe">
                ${[[1,'Stufe 1 – Zahlungserinnerung'],[2,'Stufe 2 – 1. Mahnung'],[3,'Stufe 3 – Letzte Mahnung']]
                  .map(([k,l])=>`<option value="${k}" ${Number(d.mahnstufe)===k?'selected':''}>${l}</option>`).join('')}
              </select></div>
          </div>`:''}

          <div class="pos-sum">
            <div><span class="lbl">Gesamt</span></div>
            <div><span class="val" id="posSum">${U.eur(total)}</span></div>
          </div>
          <div class="t-sub" style="text-align:right;margin-top:2px" id="posSumSub">${sumSub(d)}</div>
        </div>

        <div class="row row-2" style="margin-top:16px">
          ${isRech ? `<div class="field"><label>Zahlbar bis</label>
              <input type="date" id="dFaellig" value="${U.esc(d.faellig)}">
              <div class="hint">${Store.settings().zahlungszielTage} Tage · Wochenende wird automatisch auf Montag geschoben</div></div>`:''}
          ${isKV ? `<div class="field"><label>Gültig bis</label>
              <input type="date" id="dGueltig" value="${U.esc(d.gueltigBis)}">
              <div class="hint">${Store.settings().kvGueltigTage} Tage Gültigkeit</div></div>`:''}
          <div class="field"><label>Status</label>
            <select id="dStatus">${statusOptions(d)}</select></div>
        </div>

        <div class="field"><label>Hinweis in der Info-Box <span class="t-sub">(optional)</span></label>
          <textarea id="dNotiz" rows="2" placeholder="z.B. Druckkosten werden separat abgerechnet">${U.esc(d.notiz)}</textarea></div>

        ${paid || (d.zahlungen||[]).length ? `
        <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:6px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <h3 style="font-size:15px">Zahlungen</h3>
            <span class="t-sub">${U.eur(paid)} von ${U.eur(total)}${total-paid>0?` · offen ${U.eur(total-paid)}`:''}</span>
          </div>
          ${(d.zahlungen||[]).map((z,i)=>`<div style="display:flex;gap:10px;align-items:center;font-size:13.5px;padding:4px 0">
            <span class="t-sub">${U.de(z.datum)}</span><span class="t-strong">${U.eur(z.betrag)}</span>
            <span class="t-sub">${U.esc(z.notiz||'')}</span>
            <button class="pos-del" style="margin-left:auto" onclick="Documents.delPayment(${i})">✕</button>
          </div>`).join('')}
        </div>`:''}

        ${d.id && d.typ==='rechnung' ? mahnInfo(d) : ''}
      `,
      foot: `
        ${d.id ? (d.status==='entwurf'
            ? `<button class="btn btn-danger left" onclick="Documents.del('${d.id}')">Löschen</button>`
            : `<button class="btn btn-danger left" onclick="Documents.stornoDialog('${d.id}')">Stornieren</button>`) : ''}
        ${d.id && isRech && d.status!=='bezahlt' && d.status!=='storniert' ? `<button class="btn" onclick="Documents.markPaid('${d.id}')">Bezahlt</button>` : ''}
        ${d.id && isKV ? `<button class="btn" onclick="Documents.convert('${d.id}','ab')">→ Auftragsbest.</button>
                          <button class="btn" onclick="Documents.anzahlungDialog('${d.id}')">→ Anzahlung</button>
                          <button class="btn" onclick="Documents.convert('${d.id}','rechnung')">→ Rechnung</button>` : ''}
        ${d.id && isRech && d.art !== 'anzahlung' && d.projectId && anzahlungenZu(d.projectId).length && d.art !== 'schluss'
            ? `<button class="btn" onclick="Documents.schlussrechnung('${d.projectId}','${d.id}')">→ Schlussrechnung</button>` : ''}
        ${d.id ? `<button class="btn" onclick="Documents.sendMenu('${d.id}')">Senden</button>
                  <button class="btn" onclick="Documents.alsPdf('${d.id}')">Als PDF speichern</button>
                  <button class="btn" onclick="Documents.print('${d.id}')">Drucken</button>` : ''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Documents.save()">Speichern</button>`,
      onClose: () => { editing = null; App.rerender(); }
    });
  }

  function statusOptions(d){
    const opts = Store.isInvoice(d) || d.typ==='mahnung'
      ? [['entwurf','Entwurf'],['versendet','Versendet / Offen'],['bezahlt','Bezahlt'],['storniert','Storniert']]
      : [['entwurf','Entwurf'],['versendet','Versendet'],['angenommen','Angenommen'],['abgelehnt','Abgelehnt']];
    return opts.map(([k,l])=>`<option value="${k}" ${d.status===k?'selected':''}>${l}</option>`).join('');
  }

  function posRow(p, i){
    return `<tr data-i="${i}">
      <td>
        <input type="text" value="${U.esc(p.beschreibung)}" placeholder="Leistung"
               oninput="Documents.setPos(${i},'beschreibung',this.value)">
        <textarea rows="1" placeholder="Details (optional, kommt klein drunter)"
               oninput="Documents.setPos(${i},'detail',this.value)"
               style="margin-top:4px">${U.esc(p.detail||'')}</textarea>
      </td>
      <td><input type="text" value="${U.esc(p.menge ?? 1)}" oninput="Documents.setPos(${i},'menge',this.value)"></td>
      <td><input type="text" value="${U.esc(p.einheit||'')}" placeholder="Stk."
                 oninput="Documents.setPos(${i},'einheit',this.value)"></td>
      ${Store.settings().kleinunternehmer ? '' : `<td>
        <select onchange="Documents.setPos(${i},'ust',this.value)">
          ${[Store.settings().ustSatz, Store.settings().ustSatzErmaessigt, 0].map(sz =>
            `<option value="${sz}" ${Store.posSatz(p)==sz?'selected':''}>${sz} %</option>`).join('')}
        </select></td>`}
      <td><input type="text" value="${U.esc(p.einzelpreis ?? '')}" placeholder="0,00"
                 oninput="Documents.setPos(${i},'einzelpreis',this.value)"></td>
      <td><button class="pos-del" onclick="Documents.delPos(${i})" title="Zeile löschen">✕</button></td>
    </tr>`;
  }

  function refreshPos(){
    document.getElementById('posBody').innerHTML = editing.positionen.map(posRow).join('');
    recalcSum();
  }
  function setPos(i, key, val){ editing.positionen[i][key] = key==='ust' ? U.parseNum(val) : val; recalcSum(); }
  function addPos(){ editing.positionen.push({beschreibung:'',detail:'',menge:1,einheit:'',einzelpreis:''}); refreshPos(); }
  function delPos(i){ editing.positionen.splice(i,1);
    if(!editing.positionen.length) editing.positionen.push({beschreibung:'',menge:1,einzelpreis:''}); refreshPos(); }
  // Zeile unter der Summe: §19-Hinweis oder Netto/USt-Aufteilung
  function sumSub(d){
    const s = Store.settings();
    if (s.kleinunternehmer) return U.esc(s.ustHinweis);
    const g = Store.docUstGruppen(d);
    return `netto ${U.eur(Store.docNetto(d))}`
         + Object.entries(g).map(([satz,b]) => ` · ${satz} % USt ${U.eur(b)}`).join('')
         + ` · brutto ${U.eur(Store.docTotal(d))}`;
  }

  function recalcSum(){
    const mg = document.getElementById('dMahngebuehr');
    if (mg) editing.mahngebuehr = U.parseNum(mg.value);
    const el = document.getElementById('posSum');
    if (el) el.textContent = U.eur(Store.docTotal(editing));
    const sub = document.getElementById('posSumSub');
    if (sub) sub.innerHTML = sumSub(editing);
  }
  function addFromCatalog(i){
    const k = Store.CATALOG[i];
    const empty = editing.positionen.findIndex(p => !p.beschreibung && !p.einzelpreis);
    const pos = { beschreibung:k.t, detail:'', menge:1, einheit:'', einzelpreis:k.p||'' };
    if (empty >= 0) editing.positionen[empty] = pos; else editing.positionen.push(pos);
    refreshPos();
  }
  function showCatalog(){
    const html = Store.CATALOG.map((k,i)=>`<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-soft)">
      <div style="flex:1"><div class="t-strong">${U.esc(k.t)}</div><div class="t-sub">${U.esc(k.typ)}</div></div>
      <div class="num t-strong">${k.p?U.eur(k.p):'nach Aufwand'}</div>
      <button class="btn btn-sm" onclick="Documents.addFromCatalog(${i});UI.toast('Position eingefügt')">Einfügen</button>
    </div>`).join('');
    UI.modal({ title:'Leistungskatalog', body: html + `<p class="t-sub" style="margin-top:14px">
      Richtwerte – im Dokument jederzeit überschreibbar. Dauerhaft ändern: js/store.js → CATALOG.</p>`,
      foot:`<button class="btn btn-primary" onclick="Documents.openEditor()">Zurück zum Dokument</button>` });
  }

  function changeTyp(typ){
    editing.typ = typ;
    if (!editing.id) editing.nummer = Store.nextNumber(typ);
    recalcDates(); openEditor();
  }
  function changeCustomer(id){ editing.customerId = id;
    const sel = document.getElementById('dProjekt'); if (sel) sel.innerHTML = UI.projectOptions(editing.projectId, id); }
  function recalcDates(){
    const s = Store.settings();
    const dt = document.getElementById('dDatum')?.value || editing.datum;
    editing.datum = dt;
    if (editing.typ === 'rechnung'){
      editing.faellig = U.dueDate(dt, s.zahlungszielTage);
      const f = document.getElementById('dFaellig'); if (f) f.value = editing.faellig;
    }
    if (editing.typ === 'kv' || editing.typ === 'angebot'){
      editing.gueltigBis = U.dueDate(dt, s.kvGueltigTage);
      const g = document.getElementById('dGueltig'); if (g) g.value = editing.gueltigBis;
    }
  }

  /* ---------- Eingaben aus dem Formular in die Arbeitskopie holen ---------- */
  function captureEditor(){
    if (!editing || !document.getElementById('dNummer')) return false;
    const v = k => (document.getElementById(k)||{}).value ?? '';
    Object.assign(editing, {
      typ: v('dTyp') || editing.typ,
      nummer: v('dNummer').trim() || editing.nummer,
      datum: v('dDatum') || editing.datum,
      customerId: v('dKunde'), projectId: v('dProjekt'),
      betreff: v('dBetreff').trim(), anschreiben: v('dAnschreiben').trim(),
      notiz: v('dNotiz').trim(), status: v('dStatus') || editing.status
    });
    if (document.getElementById('dFaellig')) editing.faellig = v('dFaellig');
    if (document.getElementById('dGueltig')) editing.gueltigBis = v('dGueltig');
    return true;
  }
  const hasEditor = () => !!editing;

  /* ---------- Position von außen (z.B. Kalkulator) ---------- */
  function addPositionFromOutside(pos){
    if (!editing) return false;
    const leer = editing.positionen.findIndex(p => !p.beschreibung && !U.parseNum(p.einzelpreis));
    if (leer >= 0) editing.positionen[leer] = pos; else editing.positionen.push(pos);
    return true;
  }

  /* ---------- Kalkulator aus dem Editor heraus ---------- */
  function openCalc(){
    captureEditor();
    // passt der Kalkulator zum Auftragstyp des Projekts? dann direkt richtig aufmachen
    const p = editing && editing.projectId ? Store.byId('projects', editing.projectId) : null;
    if (p && p.typ) Calc.fuerTyp(p.typ); else Calc.open();
  }

  /* ---------- Speichern ---------- */
  function save(){
    const v = k => (document.getElementById(k)||{}).value ?? '';
    Object.assign(editing, {
      typ: v('dTyp') || editing.typ,
      nummer: v('dNummer').trim() || editing.nummer,
      datum: v('dDatum') || editing.datum,
      customerId: v('dKunde'),
      projectId: v('dProjekt'),
      betreff: v('dBetreff').trim(),
      anschreiben: v('dAnschreiben').trim(),
      notiz: v('dNotiz').trim(),
      status: v('dStatus') || editing.status
    });
    if (document.getElementById('dFaellig')) editing.faellig = v('dFaellig');
    if (document.getElementById('dGueltig')) editing.gueltigBis = v('dGueltig');
    if (document.getElementById('dMahngebuehr')) editing.mahngebuehr = U.parseNum(v('dMahngebuehr'));
    if (document.getElementById('dMahnstufe')) editing.mahnstufe = Number(v('dMahnstufe'));

    editing.positionen = editing.positionen
      .filter(p => p.beschreibung || U.parseNum(p.einzelpreis))
      .map(p => ({...p, menge: U.parseNum(p.menge)||1, einzelpreis: U.parseNum(p.einzelpreis),
                   ...(p.ust !== undefined ? { ust: U.parseNum(p.ust) } : {})}));
    if (!editing.positionen.length){ UI.toast('Mindestens eine Position eintragen','err'); return; }

    if (editing.status === 'bezahlt' && !editing.bezahltAm) editing.bezahltAm = U.today();
    if (editing.status === 'versendet' && !editing.versendetAm) editing.versendetAm = U.today();

    const id = editing.id;
    if (id) Store.update('documents', id, editing);
    else { const n = Store.add('documents', editing); editing.id = n.id; }

    // Projekt-Status mitziehen
    if (editing.projectId){
      const p = Store.byId('projects', editing.projectId);
      if (p){
        if (editing.typ==='rechnung' && editing.status==='bezahlt') Store.update('projects', p.id, {status:'bezahlt'});
        else if (editing.typ==='rechnung' && ['anfrage','kv','zugesagt','arbeit','fertig'].includes(p.status))
          Store.update('projects', p.id, {status:'berechnet'});
        else if ((editing.typ==='kv'||editing.typ==='angebot') && p.status==='anfrage')
          Store.update('projects', p.id, {status:'kv'});
      }
    }
    UI.toast(UI.docLabel(editing.typ)+' gespeichert','ok');
    UI.closeModal();
  }

  function del(id){
    UI.confirm('Dokument wirklich löschen? Das lässt sich nicht rückgängig machen.', () => {
      Store.remove('documents', id); UI.closeModal(); UI.toast('Gelöscht'); App.rerender();
    });
  }

  /* ---------- Zahlung ---------- */
  function markPaid(id){
    const d = Store.byId('documents', id);
    const offen = Store.docOpen(d);
    UI.modal({
      title:'Zahlung erfassen · ' + d.nummer,
      body:`<div class="row row-2">
          <div class="field"><label>Datum</label><input type="date" id="zDatum" value="${U.today()}"></div>
          <div class="field"><label>Betrag €</label><input type="text" id="zBetrag" value="${U.num(offen)}"></div>
        </div>
        <div class="field"><label>Notiz</label><input type="text" id="zNotiz" placeholder="Überweisung / bar"></div>
        <p class="t-sub">Offen: ${U.eur(offen)} von ${U.eur(Store.docTotal(d))}</p>`,
      foot:`<button class="btn" onclick="Documents.open('${id}')">Zurück</button>
            <button class="btn btn-primary" onclick="Documents.savePayment('${id}')">Zahlung buchen</button>`
    });
  }
  function savePayment(id){
    const d = Store.byId('documents', id);
    const z = { datum: document.getElementById('zDatum').value,
                betrag: U.parseNum(document.getElementById('zBetrag').value),
                notiz: document.getElementById('zNotiz').value.trim() };
    d.zahlungen = d.zahlungen || [];
    d.zahlungen.push(z);
    const rest = Store.docOpen(d);
    d.status = rest <= 0.01 ? 'bezahlt' : 'versendet';
    if (d.status === 'bezahlt') d.bezahltAm = z.datum;
    Store.update('documents', id, d);
    if (d.projectId && d.status==='bezahlt') Store.update('projects', d.projectId, {status:'bezahlt'});
    UI.closeModal(); UI.toast(rest<=0.01 ? 'Rechnung ist bezahlt – sauber!' : `Teilzahlung gebucht, offen: ${U.eur(rest)}`, 'ok');
    App.rerender();
  }
  function delPayment(i){ editing.zahlungen.splice(i,1); openEditor(); }

  /* ================= ANZAHLUNG & SCHLUSSRECHNUNG ================= */
  const anzahlungenZu = projectId => Store.all('documents').filter(d =>
    d.projectId && d.projectId === projectId && d.art === 'anzahlung' && d.status !== 'storniert');

  function anzahlungDialog(srcId){
    const src = Store.byId('documents', srcId);
    const s = Store.settings();
    const gesamt = Store.docTotal(src);
    const vorschlag = Math.round(gesamt * (s.anzahlungProzent/100) / 5) * 5;
    UI.modal({
      title:'Anzahlung anfordern',
      body:`
        <p style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);margin-bottom:16px">
          Bei ${U.eur(gesamt)} Auftragswert ist eine Anzahlung normal – du gehst sonst in Vorleistung
          für Material und Zeit. Die Schlussrechnung zieht den Betrag später automatisch ab.</p>
        <div class="row row-2">
          <div class="field"><label>Anzahlung €</label>
            <input type="number" id="azBetrag" value="${vorschlag}" step="10"></div>
          <div class="field"><label>Anteil</label>
            <input type="text" value="${Math.round(vorschlag/gesamt*100)}% von ${U.eur(gesamt)}" disabled></div>
        </div>
        <div class="field"><label>Text auf der Rechnung</label>
          <input type="text" id="azText" value="Anzahlung für ${U.esc(src.betreff || 'den erteilten Auftrag')}"></div>`,
      foot:`<button class="btn" onclick="Documents.open('${srcId}')">Zurück</button>
            <button class="btn btn-primary" onclick="Documents.createAnzahlung('${srcId}')">Anzahlungsrechnung erstellen</button>`
    });
  }

  function createAnzahlung(srcId){
    const src = Store.byId('documents', srcId);
    const s = Store.settings();
    const betrag = U.parseNum(document.getElementById('azBetrag').value);
    const text = document.getElementById('azText').value.trim();
    if (!betrag){ UI.toast('Betrag fehlt','err'); return; }
    const datum = U.today();
    const n = Store.add('documents', {
      typ:'rechnung', art:'anzahlung', nummer: Store.nextNumber('rechnung'), datum,
      customerId: src.customerId, projectId: src.projectId,
      betreff: src.betreff, refDocId: src.id, gesamtauftrag: Store.docTotal(src),
      positionen: [{ beschreibung: text, detail:`Gesamtauftrag ${U.eur(Store.docTotal(src))}`,
                     menge:1, einheit:'', einzelpreis: betrag }],
      status:'entwurf', faellig: U.dueDate(datum, s.zahlungszielTage), zahlungen:[],
      notiz:'Die Anzahlung wird in der Schlussrechnung verrechnet.'
    });
    UI.closeModal(); UI.toast('Anzahlungsrechnung '+n.nummer+' erstellt','ok');
    open(n.id);
  }

  function schlussrechnung(projectId, srcId){
    const src = Store.byId('documents', srcId);
    const s = Store.settings();
    const az = anzahlungenZu(projectId);
    const azSumme = U.sum(az, Store.docTotal);
    const datum = U.today();
    const pos = JSON.parse(JSON.stringify(src.positionen || []));
    az.forEach(a => pos.push({
      beschreibung: `abzüglich Anzahlung (Rechnung ${a.nummer} vom ${U.de(a.datum)})`,
      detail:'', menge:1, einheit:'', einzelpreis: -Store.docTotal(a)
    }));
    const n = Store.add('documents', {
      typ:'rechnung', art:'schluss', nummer: Store.nextNumber('rechnung'), datum,
      customerId: src.customerId, projectId,
      betreff: src.betreff, refDocId: src.id,
      positionen: pos, status:'entwurf',
      faellig: U.dueDate(datum, s.zahlungszielTage), zahlungen:[],
      notiz: azSumme ? `Bereits gezahlte Anzahlung von ${U.eur(azSumme)} ist verrechnet.` : ''
    });
    UI.closeModal(); UI.toast('Schlussrechnung '+n.nummer+' erstellt','ok');
    open(n.id);
  }

  /* ================= STORNO / KORREKTURRECHNUNG ================= */
  function stornoDialog(id){
    const d = Store.byId('documents', id);
    window.__stornoOnly = () => {
      Store.update('documents', id, { status:'storniert', storniertAm: U.today() });
      UI.closeModal(); UI.toast('Rechnung storniert'); App.rerender();
    };
    UI.modal({
      title:'Rechnung stornieren · ' + d.nummer,
      body:`<p style="font-size:13.5px;line-height:1.7;margin-bottom:14px">
          Eine rausgegangene Rechnung wird nicht gelöscht und nicht überschrieben – sie wird
          storniert und bei Bedarf durch eine neue mit eigener Nummer ersetzt. So bleibt die
          Nummernfolge lückenlos, und dein Steuerberater kann es nachvollziehen.</p>
        <div class="card card-pad" style="background:var(--card-weich);border:none">
          <div class="t-sub" style="line-height:1.7">
            <b>Nur stornieren</b> – wenn der Auftrag nicht zustande kam.<br>
            <b>Korrigiert neu erstellen</b> – wenn Betrag oder Positionen falsch waren.
            Die neue Rechnung trägt den Vermerk „ersetzt Rechnung Nr. ${U.esc(d.nummer)}".</div>
        </div>`,
      foot:`<button class="btn" onclick="Documents.open('${id}')">Abbrechen</button>
            <button class="btn btn-danger" onclick="window.__stornoOnly()">Nur stornieren</button>
            <button class="btn btn-primary" onclick="Documents.korrekturRechnung('${id}')">Korrigiert neu erstellen</button>`
    });
  }

  function korrekturRechnung(id){
    const alt = Store.byId('documents', id);
    const s = Store.settings();
    const datum = U.today();
    Store.update('documents', id, { status:'storniert', storniertAm: datum });
    const n = Store.add('documents', {
      typ: alt.typ, art: alt.art || 'normal', nummer: Store.nextNumber(alt.typ), datum,
      customerId: alt.customerId, projectId: alt.projectId,
      betreff: alt.betreff, ersetztDocId: alt.id,
      positionen: JSON.parse(JSON.stringify(alt.positionen||[])),
      status:'entwurf', faellig: U.dueDate(datum, s.zahlungszielTage), zahlungen:[],
      notiz: `Diese Rechnung ersetzt Rechnung Nr. ${alt.nummer} vom ${U.de(alt.datum)}, die hiermit storniert ist.`
    });
    UI.closeModal(); UI.toast(`${n.nummer} erstellt · ${alt.nummer} storniert`,'ok');
    open(n.id);
  }

  /* ---------- Umwandeln KV → AB → Rechnung ---------- */
  function convert(id, ziel){
    const src = Store.byId('documents', id);
    const s = Store.settings();
    const datum = U.today();
    const neu = {
      typ: ziel, nummer: Store.nextNumber(ziel), datum,
      customerId: src.customerId, projectId: src.projectId,
      betreff: src.betreff, anschreiben:'',
      positionen: JSON.parse(JSON.stringify(src.positionen)),
      status:'entwurf', notiz: src.notiz, zahlungen:[], refDocId: src.id,
      faellig: ziel==='rechnung' ? U.dueDate(datum, s.zahlungszielTage) : '',
      gueltigBis: ''
    };
    const n = Store.add('documents', neu);
    if (ziel === 'rechnung' && (src.typ==='kv'||src.typ==='angebot')) Store.update('documents', src.id, {status:'angenommen'});
    if (src.projectId) Store.update('projects', src.projectId, { status: ziel==='rechnung' ? 'berechnet' : 'zugesagt' });
    UI.closeModal();
    UI.toast(UI.docLabel(ziel)+' '+n.nummer+' aus '+src.nummer+' erstellt','ok');
    open(n.id);
  }

  /* ================= MAHNWESEN =================
     Regeln aus kurani-docs: Tag 10–14 Erinnerung (Stufe 1),
     Tag 21 1. Mahnung + 5 € (Stufe 2), Tag 35 letzte Mahnung (Stufe 3).
     Stammkunden: erst anrufen, Stufe 1 frühestens Tag 14. */
  function mahnLevel(inv){
    if (!Store.isOpenInvoice(inv)) return 0;
    const tage = U.daysAgo(inv.faellig || inv.datum);
    const c = Store.byId('customers', inv.customerId);
    const stamm = c?.stammkunde;
    const done = mahnungenZu(inv.id).map(m => Number(m.mahnstufe)||1);
    const hoechste = done.length ? Math.max(...done) : 0;
    let faellig = 0;
    if (tage >= 35) faellig = 3;
    else if (tage >= 21) faellig = 2;
    else if (tage >= (stamm ? 7 : 3)) faellig = 1;   // Rechnung fällig + 3 (bzw. 7) Tage ≈ Tag 10/14
    if (faellig <= hoechste) return 0;
    // nie eine Stufe überspringen – auch bei alten Rechnungen sauber von unten anfangen
    return Math.min(faellig, hoechste + 1);
  }
  const mahnungenZu = invId => Store.all('documents').filter(d => d.typ==='mahnung' && d.refDocId === invId);

  function mahnInfo(d){
    const lvl = mahnLevel(d);
    const ms = mahnungenZu(d.id);
    if (!lvl && !ms.length) return '';
    return `<div style="border-top:1px solid var(--line);padding-top:14px;margin-top:14px">
      <h3 style="font-size:15px;margin-bottom:8px">Mahnwesen</h3>
      ${ms.map(m=>`<div style="display:flex;gap:10px;align-items:center;font-size:13.5px;padding:4px 0">
        <span class="mono t-strong">${U.esc(m.nummer)}</span>
        <span class="badge ${m.mahnstufe==3?'red':m.mahnstufe==2?'amber':'blue'}">Stufe ${m.mahnstufe}</span>
        <span class="t-sub">${U.de(m.datum)}</span>
        <button class="btn btn-sm" style="margin-left:auto" onclick="Documents.open('${m.id}')">Öffnen</button>
      </div>`).join('')}
      ${lvl ? `<div class="card card-pad" style="background:var(--amber-bg);border:none;margin-top:10px">
        <div class="t-strong" style="margin-bottom:4px">${mahnTitel(lvl)} ist fällig</div>
        <div class="t-sub" style="line-height:1.6">${mahnHinweis(d, lvl)}</div>
        <button class="btn btn-sm btn-primary" style="margin-top:10px"
          onclick="Documents.createMahnung('${d.id}',${lvl})">${mahnTitel(lvl)} erstellen</button>
      </div>`:''}
    </div>`;
  }

  const mahnTitel = lvl => lvl===1 ? 'Zahlungserinnerung' : lvl===2 ? '1. Mahnung' : 'Letzte Mahnung';

  function mahnHinweis(inv, lvl){
    const c = Store.byId('customers', inv.customerId);
    if (c?.stammkunde && lvl === 1)
      return 'Stammkunde – ruf lieber erst kurz an oder schreib per WhatsApp. Wenn das nichts bringt, geht die Erinnerung raus.';
    if (lvl === 2) return `Mit ${U.eur(Store.settings().mahngebuehr)} Mahngebühr. Ton: bestimmt und sachlich, ohne Entschuldigung.`;
    if (lvl === 3) return 'Letzte Frist, danach entscheidest du selbst (Anruf, Inkasso, Mahnbescheid). Nichts eskaliert automatisch.';
    return 'Freundlich – vermutlich einfach übersehen. Das Wort „Mahnung" kommt hier nicht vor.';
  }

  function createMahnung(invId, lvl){
    const inv = Store.byId('documents', invId);
    const s = Store.settings();
    const datum = U.today();
    const frist = U.dueDate(datum, 7);
    const offen = Store.docOpen(inv);
    const stufe1 = mahnungenZu(invId).find(m => Number(m.mahnstufe)===1);
    const gebuehr = lvl >= 2 ? s.mahngebuehr : 0;

    let text;
    if (lvl === 1){
      text = `Zur Rechnung Nr. ${inv.nummer} vom ${U.de(inv.datum)} über ${U.eur(offen)} konnten wir noch keinen Zahlungseingang feststellen. `
           + `Sicher ist das nur übersehen worden — wir bitten um Ausgleich bis zum ${U.de(frist)}.`;
    } else if (lvl === 2){
      text = stufe1
        ? `Trotz unserer Erinnerung vom ${U.de(stufe1.datum)} ist die Rechnung Nr. ${inv.nummer} `
          + `vom ${U.de(inv.datum)} über ${U.eur(offen)} weiterhin offen. `
          + `Wir bitten um Zahlung des Gesamtbetrags inkl. Mahngebühr bis zum ${U.de(frist)}.`
        : `Die Rechnung Nr. ${inv.nummer} vom ${U.de(inv.datum)} über ${U.eur(offen)} war am `
          + `${U.de(inv.faellig || inv.datum)} zur Zahlung fällig und ist weiterhin offen. `
          + `Wir bitten um Zahlung des Gesamtbetrags inkl. Mahngebühr bis zum ${U.de(frist)}.`;
    } else {
      text = `Wir fordern Sie letztmalig auf, den offenen Betrag von ${U.eur(offen + gebuehr)} bis zum ${U.de(frist)} auszugleichen. `
           + `Nach Ablauf dieser Frist übergeben wir die Forderung ohne weitere Ankündigung zur weiteren Durchsetzung.`;
    }

    const neu = {
      typ:'mahnung', nummer: Store.nextNumber('mahnung'), datum,
      customerId: inv.customerId, projectId: inv.projectId,
      betreff: `${mahnTitel(lvl)} zur Rechnung ${inv.nummer}`,
      anschreiben: text,
      positionen: [{ beschreibung:`Rechnung Nr. ${inv.nummer} vom ${U.de(inv.datum)}`,
                     detail: Store.docPaid(inv) > 0 ? `abzüglich Ihrer Zahlung über ${U.eur(Store.docPaid(inv))}` : '',
                     menge:1, einheit:'', einzelpreis: offen }],
      mahngebuehr: gebuehr, mahnstufe: lvl, refDocId: invId,
      status:'entwurf', faellig: frist, zahlungen:[],
      notiz: lvl===1
        ? 'Sollte sich die Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos. Vielen Dank!'
        : `Zahlbar bis ${U.de(frist)} auf das unten genannte Konto.`
    };
    const n = Store.add('documents', neu);
    UI.closeModal();
    UI.toast(mahnTitel(lvl) + ' ' + n.nummer + ' erstellt','ok');
    open(n.id);
  }

  /* ================= SENDEN ================= */
  function sendMenu(id){
    const d = Store.byId('documents', id);
    const c = Store.byId('customers', d.customerId) || {};
    const mail = mailText(d);
    const wa = waText(d);
    UI.modal({
      title:'Senden · ' + d.nummer,
      body:`
        <p class="t-sub" style="line-height:1.6;margin-bottom:14px">
          Text ist fertig formuliert. Das PDF sicherst du über „Als PDF speichern" und hängst es an.</p>

        <div class="field"><label>E-Mail${c.email?` an ${U.esc(c.email)}`:' (keine Adresse hinterlegt)'}</label>
          <textarea id="sendMail" rows="9">${U.esc(mail.body)}</textarea></div>
        <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
          <a class="btn btn-primary" href="${U.mailto(c.email, mail.subject, mail.body)}"
             onclick="Documents.markSent('${id}')">Mail öffnen</a>
          <button class="btn" onclick="UI.copyText(document.getElementById('sendMail').value)">Text kopieren</button>
        </div>

        <div class="field"><label>WhatsApp${c.telefon?` an ${U.esc(c.telefon)}`:' (keine Nummer hinterlegt)'}</label>
          <textarea id="sendWa" rows="5">${U.esc(wa)}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${c.telefon?`<a class="btn btn-primary" target="_blank" href="${U.waLink(c.telefon, wa)}"
             onclick="Documents.markSent('${id}')">WhatsApp öffnen</a>`:''}
          <button class="btn" onclick="UI.copyText(document.getElementById('sendWa').value)">Text kopieren</button>
        </div>

        ${(typeof Assist !== 'undefined' && Assist.bereit()) ? `
        <div style="border-top:1px solid var(--line-soft);margin-top:20px;padding-top:16px">
          <div class="t-sub" style="margin-bottom:10px">Passt der Ton nicht? Lass ihn neu schreiben:</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm" onclick="Documents.textNeu('${id}','freundlicher und lockerer')">Freundlicher</button>
            <button class="btn btn-sm" onclick="Documents.textNeu('${id}','deutlich bestimmter, aber weiter höflich')">Bestimmter</button>
            <button class="btn btn-sm" onclick="Documents.textNeu('${id}','kürzer, nur das Nötigste')">Kürzer</button>
          </div>
        </div>` : ''}`,
      foot:`<button class="btn" onclick="Documents.open('${id}')">Zurück</button>
            <button class="btn btn-primary" onclick="Documents.markSent('${id}',true)">Als versendet markieren</button>`
    });
  }

  /* Den Begleittext vom Assistenten neu formulieren lassen */
  function textNeu(id, wie){
    const d = Store.byId('documents', id);
    const c = Store.byId('customers', d.customerId) || {};
    UI.closeModal();
    Assist.textFuer(
      `Schreib mir den Begleittext zu ${UI.docLabel(d.typ)} ${d.nummer} an ${c.firma || 'den Kunden'} neu – ${wie}. `
      + `Es geht um ${U.eur(Store.docOpen(d) || Store.docTotal(d))}`
      + (d.faellig ? `, Frist ${U.de(d.faellig)}` : '')
      + `. Gib mir eine Fassung für E-Mail und eine kurze für WhatsApp.`);
  }

  function markSent(id, close=false){
    const d = Store.byId('documents', id);
    if (d.status === 'entwurf') Store.update('documents', id, { status:'versendet', versendetAm: U.today() });
    if (close){ UI.closeModal(); UI.toast('Als versendet markiert','ok'); App.rerender(); }
  }

  function mailText(d){
    const c = Store.byId('customers', d.customerId) || {};
    const s = Store.settings();
    const anrede = c.ansprechpartner ? `Moin ${c.ansprechpartner},` : 'Moin,';
    const total = Store.docTotal(d);
    let body, subject;
    if (d.typ === 'rechnung'){
      subject = `Rechnung ${d.nummer} · ${s.firma}`;
      body = `${anrede}\n\nanbei die Rechnung ${d.nummer}${d.betreff?` für ${d.betreff}`:''} über ${U.eur(total)}.\n`
           + `Zahlbar bis ${U.de(d.faellig)} auf das Konto:\n${s.iban} (${s.bank})\n\n`
           + `${s.ustHinweis}\n\nBei Fragen einfach melden.\n\nBeste Grüße\n${s.inhaber}\n${s.firma} · ${s.telefon}`;
    } else if (d.typ === 'kv' || d.typ === 'angebot'){
      subject = `${UI.docLabel(d.typ)} ${d.nummer} · ${s.firma}`;
      body = `${anrede}\n\nwie besprochen schicke ich dir den ${UI.docLabel(d.typ)} ${d.nummer}${d.betreff?` für ${d.betreff}`:''} `
           + `über ${U.eur(total)}.\nDas Angebot gilt bis ${U.de(d.gueltigBis)}.\n\n`
           + `Wenn du einverstanden bist, gib mir kurz Bescheid – dann lege ich los.\n\n`
           + `Beste Grüße\n${s.inhaber}\n${s.firma} · ${s.telefon}`;
    } else if (d.typ === 'mahnung'){
      subject = `${mahnTitel(Number(d.mahnstufe)||1)} zur Rechnung ${(Store.byId('documents',d.refDocId)||{}).nummer||''}`;
      body = `${anrede}\n\n${d.anschreiben}\n\n`
           + (Number(d.mahnstufe)===1 ? 'Sollte sich die Zahlung mit dieser Mail überschnitten haben, betrachte sie bitte als gegenstandslos. Vielen Dank!\n\n' : '')
           + `Kontodaten:\n${s.iban} (${s.bank})\n\nBeste Grüße\n${s.inhaber}\n${s.firma} · ${s.telefon}`;
    } else {
      subject = `${UI.docLabel(d.typ)} ${d.nummer} · ${s.firma}`;
      body = `${anrede}\n\nanbei ${UI.docLabel(d.typ)} ${d.nummer}${d.betreff?` für ${d.betreff}`:''} über ${U.eur(total)}.\n\n`
           + `Beste Grüße\n${s.inhaber}\n${s.firma} · ${s.telefon}`;
    }
    return { subject, body };
  }

  function waText(d){
    const c = Store.byId('customers', d.customerId) || {};
    const s = Store.settings();
    const total = Store.docTotal(d);
    const anrede = c.ansprechpartner ? `Moin ${c.ansprechpartner}!` : 'Moin!';
    if (d.typ === 'rechnung')
      return `${anrede} Ich hab dir die Rechnung ${d.nummer}${d.betreff?` (${d.betreff})`:''} über ${U.eur(total)} geschickt. `
           + `Zahlbar bis ${U.de(d.faellig)}. Sag Bescheid wenn was unklar ist. Grüße, ${s.inhaber}`;
    if (d.typ === 'mahnung')
      return `${anrede} Kurze Erinnerung: die Rechnung ${(Store.byId('documents',d.refDocId)||{}).nummer||''} über `
           + `${U.eur(total)} ist noch offen. Kannst du da nochmal draufschauen? Danke dir! ${s.inhaber}`;
    return `${anrede} Ich hab dir den ${UI.docLabel(d.typ)} ${d.nummer}${d.betreff?` für ${d.betreff}`:''} über `
         + `${U.eur(total)} geschickt. Schau mal rein und sag mir kurz Bescheid. Grüße, ${s.inhaber}`;
  }

  /* ================= DRUCK (Kurani-Hausformat v2) ================= */
  function defaultIntro(d){
    const c = Store.byId('customers', d.customerId) || {};
    const anrede = c.ansprechpartner ? `Sehr geehrte/r ${c.ansprechpartner},` : 'Moin,';
    if (d.typ === 'rechnung')  return `${anrede}\nvielen Dank für den Auftrag. Wie vereinbart stelle ich folgende Leistungen in Rechnung:`;
    if (d.typ === 'kv')        return `${anrede}\nvielen Dank für Ihre Anfrage. Gern unterbreite ich Ihnen folgenden Kostenvoranschlag:`;
    if (d.typ === 'angebot')   return `${anrede}\nvielen Dank für Ihr Interesse. Gern biete ich Ihnen folgende Leistungen an:`;
    if (d.typ === 'ab')        return `${anrede}\nvielen Dank für Ihren Auftrag. Hiermit bestätige ich folgende Leistungen:`;
    return '';
  }

  function printHtml(d){
    const s = Store.settings();
    const klein = Store.docModus(d).klein;   // Modus des Dokuments, nicht der aktuelle
    const c = Store.byId('customers', d.customerId) || {};
    const total = Store.docTotal(d);
    const paid  = Store.docPaid(d);
    const titel = d.typ === 'mahnung' ? mahnTitel(Number(d.mahnstufe)||1).toUpperCase()
                : d.art === 'anzahlung' ? 'ANZAHLUNGSRECHNUNG'
                : d.art === 'schluss'   ? 'SCHLUSSRECHNUNG'
                : UI.docLabel(d.typ).toUpperCase();
    const intro = d.anschreiben || defaultIntro(d);

    const konditionen = [];
    if (d.typ === 'rechnung'){
      konditionen.push(['Zahlbar bis', U.de(d.faellig)]);
      konditionen.push(['Zahlungsweise', 'Überweisung']);
    } else if (d.typ === 'kv' || d.typ === 'angebot'){
      konditionen.push(['Gültig bis', U.de(d.gueltigBis || U.dueDate(d.datum, s.kvGueltigTage))]);
      konditionen.push(['Zahlungsziel', s.zahlungszielTage + ' Tage nach Rechnungsstellung']);
    } else if (d.typ === 'mahnung'){
      konditionen.push(['Frist', U.de(d.faellig)]);
    }
    konditionen.push(['Bankverbindung', `${s.iban} · ${s.bank}`]);

    return `
    <div class="pr-head">
      <div class="firm">${U.esc(s.firma)}<small>${U.esc(s.inhaber)}</small></div>
      <div class="contact">
        ${U.esc(s.strasse)}<br>${U.esc(s.plz)} ${U.esc(s.ort)}<br>
        ${U.esc(s.telefon)}<br>${U.esc(s.email)}
      </div>
    </div>

    <div class="pr-title">
      <div class="t">${U.esc(titel)}</div>
      <div class="meta">
        Nr. <b>${U.esc(d.nummer)}</b><br>
        Datum <b>${U.de(d.datum)}</b>
        ${c.nr ? `<br>Kunden-Nr. <b>${U.esc(c.nr)}</b>` : ''}
      </div>
    </div>

    <div class="pr-addr">
      <div>
        <div class="lbl">Auftraggeber</div>
        <div class="name">${U.esc(c.firma || '–')}</div>
        <div class="lines">
          ${c.ansprechpartner ? U.esc(c.ansprechpartner)+'<br>' : ''}
          ${c.strasse ? U.esc(c.strasse)+'<br>' : ''}
          ${(c.plz||c.ort) ? U.esc((c.plz||'')+' '+(c.ort||'')) : ''}
        </div>
      </div>
      <div>
        <div class="lbl">Auftragnehmer</div>
        <div class="name">${U.esc(s.firma)}</div>
        <div class="lines">${U.esc(s.inhaber)}<br>${U.esc(s.strasse)}<br>${U.esc(s.plz)} ${U.esc(s.ort)}<br>
          St.-Nr. ${U.esc(s.steuernummer)}</div>
      </div>
    </div>

    ${d.betreff ? `<div style="font-weight:700;font-size:11pt;margin-bottom:5mm">${U.esc(d.betreff)}</div>` : ''}
    ${intro ? `<div class="pr-intro">${U.esc(intro)}</div>` : ''}

    <table class="pr-pos">
      <thead><tr>
        <th style="width:7%">Pos</th><th>Beschreibung</th>
        <th class="c" style="width:11%">Menge</th>
        ${klein ? '' : '<th class="c" style="width:8%">USt</th>'}
        <th class="r" style="width:16%">Einzelpreis</th>
        <th class="r" style="width:16%">Gesamt</th>
      </tr></thead>
      <tbody>
        ${(d.positionen||[]).map((p,i) => {
          const menge = U.parseNum(p.menge)||1;
          const ep = U.parseNum(p.einzelpreis);
          return `<tr>
            <td class="c">${i+1}</td>
            <td><div class="desc-title">${U.esc(p.beschreibung)}</div>
              ${p.detail ? `<div class="desc-sub">${U.esc(p.detail)}</div>` : ''}</td>
            <td class="c">${U.num(menge).replace(',00','')}${p.einheit?' '+U.esc(p.einheit):''}</td>
            ${klein ? '' : `<td class="c">${Store.posSatz(p,d)} %</td>`}
            <td class="r">${U.eur(ep)}</td>
            <td class="r">${U.eur(menge*ep)}</td>
          </tr>`;
        }).join('')}
        ${d.mahngebuehr ? `<tr><td class="c">${(d.positionen||[]).length+1}</td>
          <td><div class="desc-title">Mahngebühr</div></td>
          <td class="c">1</td>${klein?'':'<td class="c">–</td>'}
          <td class="r">${U.eur(d.mahngebuehr)}</td><td class="r">${U.eur(d.mahngebuehr)}</td></tr>`:''}
      </tbody>
    </table>

    <!-- Konditionen und Summe stehen nebeneinander – spart eine Blockhöhe,
         damit eine normale Rechnung auf ein Blatt passt -->
    <div class="pr-schluss">
      <div class="pr-info">
        <div class="h">Konditionen</div>
        ${konditionen.map(([k,v]) => `<div class="kv"><div class="k">${U.esc(k)}</div><div class="v">${U.esc(v)}</div></div>`).join('')}
        ${d.notiz ? `<div class="note">${U.esc(d.notiz)}</div>` : ''}
      </div>

      <div class="pr-sum">
        ${!klein ? `
          <div class="line"><span>Nettobetrag</span><span>${U.eur(Store.docNetto(d))}</span></div>
          ${Object.entries(Store.docUstGruppen(d)).map(([satz,betrag]) =>
            `<div class="line"><span>zzgl. ${satz} % USt</span><span>${U.eur(betrag)}</span></div>`).join('')}
        ` : ''}
        ${paid ? `<div class="line"><span>Zwischensumme</span><span>${U.eur(total)}</span></div>
                  <div class="line"><span>abzüglich Zahlung</span><span>− ${U.eur(paid)}</span></div>` : ''}
        <div class="total">
          <span class="l">${paid ? 'Noch offen' : 'Gesamtbetrag'}</span>
          <span class="v">${U.eur(paid ? total - paid : total)}</span>
        </div>
        ${klein ? `<div class="ust">${U.esc(s.ustHinweis)}</div>` : ''}
      </div>
    </div>

    <div class="pr-greet">${d.typ==='mahnung'
      ? 'Mit freundlichen Grüßen\n' + U.esc(s.inhaber)
      : '<span class="dank">Vielen Dank für die gute Zusammenarbeit.</span>Mit freundlichen Grüßen\n' + U.esc(s.inhaber)}</div>

    <div class="pr-foot">
      <div class="col"><b>${U.esc(s.firma)}</b>${U.esc(s.strasse)}<br>${U.esc(s.plz)} ${U.esc(s.ort)}<br>${U.esc(s.telefon)}</div>
      <div class="col"><b>Bankverbindung</b>${U.esc(s.bank)}<br>IBAN ${U.esc(s.iban)}<br>BIC ${U.esc(s.bic)}</div>
      <div class="col"><b>Steuer</b>St.-Nr. ${U.esc(s.steuernummer)}<br>${
        klein ? '§ 19 UStG' : (s.ustId ? 'USt-IdNr. '+U.esc(s.ustId) : 'Regelbesteuerung')
      }<br>${U.esc(s.email)}</div>
    </div>`;
  }

  /* Wie eng muss gesetzt werden, damit es auf ein Blatt passt?
     Gezählt wird der Platzbedarf: eine Position mit Beschreibungstext
     braucht etwa doppelt so viel Höhe wie eine ohne. */
  function enge(d){
    const pos = d.positionen || [];
    const zeilen = pos.length + pos.filter(p => (p.detail||'').trim()).length
                 + (d.mahngebuehr ? 1 : 0)
                 + Math.ceil((d.anschreiben || '').length / 95)
                 + Math.ceil((d.notiz || '').length / 70);
    if (zeilen <= 8)  return '';          // normal, mit voller Luft
    if (zeilen <= 13) return 'pr-eng';    // etwas enger
    return 'pr-sehr-eng';                 // maximal verdichtet
  }

  /* Dateiname für „Als PDF sichern" – der Browser übernimmt den Seitentitel.
     Aus „Kurani CRM.pdf" wird so „Rechnung 2026042 Musterkunde.pdf". */
  function dateiname(d){
    const art = d.typ === 'mahnung' ? mahnTitel(Number(d.mahnstufe)||1)
              : d.art === 'anzahlung' ? 'Anzahlungsrechnung'
              : d.art === 'schluss'   ? 'Schlussrechnung'
              : UI.docLabel(d.typ);
    const kunde = Store.custName(d.customerId);
    return [art, d.nummer, kunde].filter(x => x && x !== 'Ohne Kunde').join(' ')
           .replace(/[\/\\:*?"<>|]/g, '-');
  }

  function print(id){
    const d = Store.byId('documents', id) || editing;
    if (!d) return;
    const blatt = document.getElementById('printSheet');
    blatt.className = enge(d);
    blatt.innerHTML = printHtml(d);
    document.body.classList.add('printing');

    /* Titel kurz umbiegen, damit die gespeicherte Datei richtig heißt */
    const titelVorher = document.title;
    document.title = dateiname(d);

    const zurueck = () => {
      document.body.classList.remove('printing');
      document.title = titelVorher;
      window.removeEventListener('afterprint', zurueck);
    };
    window.addEventListener('afterprint', zurueck);

    setTimeout(() => {
      window.print();
      /* Falls der Browser kein afterprint meldet: nach kurzer Zeit selbst aufräumen */
      setTimeout(zurueck, 1500);
    }, 120);
  }

  /* Erklärt einmal, wo im Druckdialog das PDF steckt – und merkt sich, dass es gezeigt wurde */
  /* Ein Browser kann keine PDF-Datei selbst schreiben. Unter Mac ist der
     Druckdialog der PDF-Erzeuger: einmal das Ziel auf „Als PDF speichern"
     stellen, dann merkt Chrome sich das für immer.
     Darum erklärt dieser Dialog immer wieder, wo der Schalter sitzt –
     hier wird bewusst nichts übersprungen. */
  function alsPdf(id){
    const d = Store.byId('documents', id) || editing;
    if (!d) return;

    const ua   = navigator.userAgent || '';
    const mac  = /Mac|iPhone|iPad/.test(navigator.platform || ua);
    const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);

    const schritte = safari ? `
        <li>Links unten steht ein Knopf <b>PDF</b> – draufklicken</li>
        <li><b>Als PDF sichern</b> wählen</li>`
      : `
        <li>Ganz oben steht <b>Ziel</b> (oder <b>Drucker</b>) – da steht jetzt dein Drucker drin</li>
        <li>Draufklicken und <b>Als PDF speichern</b> auswählen
            ${mac ? '<span class="t-sub">(ganz oben in der Liste)</span>' : ''}</li>
        <li>Rechts oben auf <b>Speichern</b></li>`;

    UI.modal({
      title: 'Als PDF speichern',
      body: `
        <p style="line-height:1.75;margin-bottom:6px">
          Gleich geht der Druckdialog auf. <b>Der ist gleichzeitig dein PDF-Speicher</b> –
          du musst nur das Ziel umstellen:
        </p>
        <ol style="line-height:2.1;margin:0 0 14px 20px">
          ${schritte}
          <li>Die Datei heißt schon richtig:<br>
              <b style="font-size:13px">${U.esc(dateiname(d))}.pdf</b></li>
        </ol>

        <div class="card card-pad" style="background:var(--green-bg);border:none;margin-bottom:12px">
          <div style="line-height:1.7;font-size:13.5px">
            <b>Nur einmal nötig:</b> Hast du das Ziel einmal auf „Als PDF speichern“ gestellt,
            merkt der Browser sich das. Ab dann ist es beim nächsten Mal schon eingestellt.
          </div>
        </div>

        <div class="card card-pad" style="background:var(--card-weich);border:none">
          <div class="t-sub" style="line-height:1.7">
            <b>Einmal einstellen, damit der Bogen sauber aussieht:</b> unter
            „Weitere Einstellungen“ die <b>Kopf- und Fußzeilen ausschalten</b> – sonst druckt
            der Browser Datum und Adresse mit auf deinen Bogen. Und <b>Hintergrundgrafiken</b>
            anhaken, damit die schwarzen Balken mitkommen.
          </div>
        </div>`,
      foot: `<button class="btn left" onclick="Documents.alsDatei('${d.id}')">Stattdessen als Datei sichern</button>
             <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
             <button class="btn btn-primary" onclick="Documents.pdfWeiter('${d.id}')">Druckdialog öffnen</button>`
    });
  }

  function pdfWeiter(id){
    UI.closeModal();
    setTimeout(() => print(id), 150);
  }

  /* Notausgang: der fertige Bogen als eigenständige Datei. Die kannst du
     verschicken, archivieren und in jedem Browser öffnen – und von dort
     genauso drucken. Kein PDF, aber ohne Dialog gespeichert. */
  function alsDatei(id){
    const d = Store.byId('documents', id) || editing;
    if (!d) return;
    /* Die Druckregeln aus print.css mit in die Datei schreiben, damit der
       Bogen auch auf einem fremden Rechner richtig aussieht. */
    let css = '';
    try {
      css = Array.from(document.styleSheets || [])
        .filter(s => (s.href||'').includes('print.css'))
        .flatMap(s => { try { return Array.from(s.cssRules).map(r => r.cssText); } catch(e){ return []; } })
        .join('\n');
    } catch(e){ css = ''; }
    if (!css) return UI.toast('Die Druckvorlage liess sich nicht lesen – nimm den Druckdialog.', 'warn');

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${U.esc(dateiname(d))}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#ececeb;padding:12mm 0}
#printSheet{background:#fff;width:210mm;margin:0 auto;padding:15mm 15mm 12mm;
  box-shadow:0 2px 24px rgba(0,0,0,.16)}
@media print{ body{background:#fff;padding:0} #printSheet{width:auto;margin:0;padding:0;box-shadow:none} }
${css}
</style></head><body>
<div id="printSheet" class="${enge(d)}">${printHtml(d)}</div>
</body></html>`;

    U.download(`${dateiname(d)}.html`, html, 'text/html');
    UI.closeModal();
    UI.toast('Als Datei gesichert – öffnen und von dort drucken', 'ok');
  }

  /* ---------- CSV ---------- */
  function exportCsv(){
    const rows = [['Nummer','Typ','Datum','Kunde','Betreff','Betrag','Bezahlt','Offen','Status','Fällig','Bezahlt am']];
    U.sortBy(Store.all('documents'), d=>d.datum).forEach(d => rows.push([
      d.nummer, UI.docLabel(d.typ), U.de(d.datum), Store.custName(d.customerId), d.betreff||'',
      U.num(Store.docTotal(d)), U.num(Store.docPaid(d)), U.num(Store.docOpen(d)),
      d.status, d.faellig?U.de(d.faellig):'', d.bezahltAm?U.de(d.bezahltAm):''
    ]));
    U.download(`Dokumente_${U.today()}.csv`, '﻿'+U.csv(rows), 'text/csv');
    UI.toast('CSV exportiert','ok');
  }

  /* ================= ABOS (wiederkehrende Rechnungen) ================= */
  function renderRecurring(){
    const rs = Store.all('recurring');
    const monatlich = U.sum(rs.filter(r=>r.aktiv), r => U.parseNum(r.betrag) / ({monatlich:1,quartal:3,halbjahr:6,jahr:12}[r.intervall]||1));
    return `
    <div class="page-head">
      <div><h1>Abos</h1>
        <div class="sub">${rs.filter(r=>r.aktiv).length} aktiv · ${U.eur0(monatlich)} planbarer Umsatz pro Monat</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="Documents.editRecurring()">+ Neues Abo</button></div>
    </div>

    <div class="card card-pad" style="margin-bottom:18px;background:var(--card-weich)">
      <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft)">
        <b>Warum das wichtig ist:</b> Einzelaufträge musst du jeden Monat neu jagen. Ein Abo läuft weiter.
        ${monatlich > 0
          ? `Du hast aktuell ${U.eur0(monatlich)} im Monat planbar – das sind ${U.eur0(monatlich*12)} im Jahr, bevor du morgens aufstehst.`
          : `Noch kein Abo angelegt. Content-Abo (249 €/Monat) oder Speisekarten-Pflege sind die einfachsten Einstiege bei deinen Restaurant-Kunden.`}
      </div>
    </div>

    <div class="card table-wrap">
      ${rs.length ? `<table>
        <thead><tr><th>Abo</th><th>Kunde</th><th>Intervall</th><th>Nächste Rechnung</th>
          <th class="num">Betrag</th><th>Status</th><th></th></tr></thead>
        <tbody>${U.sortBy(rs, r=>r.naechstesDatum).map(r => {
          const faellig = U.daysUntil(r.naechstesDatum) <= 0;
          return `<tr class="clickable" onclick="Documents.editRecurring('${r.id}')">
            <td class="t-strong">${U.esc(r.titel)}</td>
            <td class="t-sub">${U.esc(Store.custName(r.customerId))}</td>
            <td class="t-sub">${intervalLabel(r.intervall)}</td>
            <td>${faellig?`<span class="badge amber">jetzt fällig</span>`:`<span class="t-sub">${U.de(r.naechstesDatum)}</span>`}</td>
            <td class="num t-strong">${U.eur(r.betrag)}</td>
            <td>${r.aktiv?'<span class="badge green">aktiv</span>':'<span class="badge grey">pausiert</span>'}</td>
            <td style="text-align:right" onclick="event.stopPropagation()">
              <button class="btn btn-sm btn-primary" onclick="Documents.runRecurring('${r.id}')">Rechnung erzeugen</button></td>
          </tr>`;
        }).join('')}</tbody></table>`
      : UI.empty('Noch keine Abos. Damit machst du Umsatz planbar.',
        `<button class="btn btn-primary" onclick="Documents.editRecurring()">+ Erstes Abo anlegen</button>`)}
    </div>`;
  }

  const intervalLabel = i => ({monatlich:'monatlich',quartal:'vierteljährlich',halbjahr:'halbjährlich',jahr:'jährlich'}[i]||i);
  const intervalMonths = i => ({monatlich:1,quartal:3,halbjahr:6,jahr:12}[i]||1);

  function editRecurring(id=null){
    const r = id ? Store.byId('recurring', id) : {
      titel:'Content-Abo', customerId:'', betrag:249, intervall:'monatlich',
      naechstesDatum: U.addMonths(U.today(),1), aktiv:true, beschreibung:''
    };
    UI.modal({
      title: id?'Abo bearbeiten':'Neues Abo',
      body:`
        <div class="field"><label>Bezeichnung</label>
          <input type="text" id="rTitel" value="${U.esc(r.titel)}" placeholder="z.B. Content-Abo, Speisekarten-Pflege"></div>
        <div class="row row-2">
          <div class="field"><label>Kunde</label><select id="rKunde">${UI.customerOptions(r.customerId)}</select></div>
          <div class="field"><label>Betrag € pro Abrechnung</label>
            <input type="number" id="rBetrag" value="${U.esc(r.betrag)}" step="10"></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>Intervall</label>
            <select id="rIntervall">${['monatlich','quartal','halbjahr','jahr']
              .map(i=>`<option value="${i}" ${r.intervall===i?'selected':''}>${intervalLabel(i)}</option>`).join('')}</select></div>
          <div class="field"><label>Nächste Rechnung am</label>
            <input type="date" id="rDatum" value="${U.esc(r.naechstesDatum)}"></div>
        </div>
        <div class="field"><label>Was ist enthalten (kommt auf die Rechnung)</label>
          <textarea id="rBeschreibung" rows="3" placeholder="z.B. 8 Posts, 2 Reels, Story-Betreuung">${U.esc(r.beschreibung||'')}</textarea></div>
        <label class="check"><input type="checkbox" id="rAktiv" ${r.aktiv?'checked':''}> Abo ist aktiv</label>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Store.remove('recurring','${id}');UI.closeModal();App.rerender()">Löschen</button>`:''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Documents.saveRecurring('${id||''}')">Speichern</button>`
    });
  }

  function saveRecurring(id){
    const v = k => document.getElementById(k).value;
    const patch = {
      titel: v('rTitel').trim() || 'Abo', customerId: v('rKunde'),
      betrag: U.parseNum(v('rBetrag')), intervall: v('rIntervall'),
      naechstesDatum: v('rDatum'), beschreibung: v('rBeschreibung').trim(),
      aktiv: document.getElementById('rAktiv').checked
    };
    if (id) Store.update('recurring', id, patch); else Store.add('recurring', patch);
    UI.closeModal(); UI.toast('Abo gespeichert','ok'); App.rerender();
  }

  function runRecurring(id){
    const r = Store.byId('recurring', id);
    const s = Store.settings();
    const datum = U.today();
    const zeitraum = U.MONTHS[new Date(r.naechstesDatum).getMonth()] + ' ' + U.yearOf(r.naechstesDatum);
    const doc = Store.add('documents', {
      typ:'rechnung', nummer: Store.nextNumber('rechnung'), datum,
      customerId: r.customerId, projectId:'',
      betreff: `${r.titel} · ${zeitraum}`,
      anschreiben:'',
      positionen: [{ beschreibung: r.titel, detail: r.beschreibung||'', menge:1, einheit:'', einzelpreis: U.parseNum(r.betrag) }],
      status:'entwurf', faellig: U.dueDate(datum, s.zahlungszielTage), zahlungen:[],
      notiz:'', recurringId: id
    });
    Store.update('recurring', id, { naechstesDatum: U.addMonths(r.naechstesDatum, intervalMonths(r.intervall)) });
    UI.toast(`Rechnung ${doc.nummer} aus Abo erstellt`,'ok');
    open(doc.id);
  }

  return { render, list, newDoc, open, openEditor, save, del, setFilter, addPos, delPos, setPos,
           sumSub, captureEditor, hasEditor, addPositionFromOutside, openCalc,
           anzahlungDialog, createAnzahlung, schlussrechnung, anzahlungenZu,
           stornoDialog, korrekturRechnung,
           recalcSum, addFromCatalog, showCatalog, changeTyp, changeCustomer, recalcDates,
           markPaid, savePayment, delPayment, convert, mahnLevel, mahnungenZu, mahnTitel,
           createMahnung, sendMenu, markSent, textNeu, mailText, waText, print, printHtml, exportCsv,
           renderRecurring, editRecurring, saveRecurring, runRecurring, intervalLabel, intervalMonths,
           enge, alsPdf, pdfWeiter, alsDatei, dateiname };
})();
