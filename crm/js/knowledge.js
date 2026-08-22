/* ==========================================================
   Kurani CRM – Kunden-Gedächtnis
   Marken-Steckbrief · Objektmaße · Preis-Historie · Vorlagen
   Damit du beim Folgeauftrag nicht wieder suchst.
   ========================================================== */
const Knowledge = (() => {

  /* ================= MARKEN-STECKBRIEF ================= */
  const leereMarke = () => ({ farben:[], schriften:[], logoOrt:'', dateien:'', lieferant:'', notizen:'' });

  function brandCard(c){
    const m = c.marke || leereMarke();
    const hatWas = m.farben.length || m.schriften.length || m.logoOrt || m.lieferant || m.notizen;
    return `
    <div class="card">
      <div class="card-head"><h3>Marke &amp; Technik</h3>
        <div class="actions"><button class="btn btn-sm" onclick="Knowledge.editBrand('${c.id}')">Bearbeiten</button></div></div>
      <div class="card-pad">
        ${hatWas ? `
          ${m.farben.length ? `<div style="margin-bottom:14px">
            <div class="t-sub" style="margin-bottom:6px">Hausfarben</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${m.farben.map(f=>`<div style="display:flex;align-items:center;gap:7px;border:1px solid var(--line);
                    border-radius:8px;padding:5px 9px 5px 5px;cursor:pointer"
                    onclick="UI.copyText('${U.esc(f.hex)}','${U.esc(f.hex)} kopiert')">
                <span style="width:22px;height:22px;border-radius:5px;background:${U.esc(f.hex)};
                      border:1px solid rgba(0,0,0,.12);display:block"></span>
                <span style="font-size:12.5px"><b>${U.esc(f.hex)}</b>${f.name?'<br><span class="t-sub">'+U.esc(f.name)+'</span>':''}</span>
              </div>`).join('')}
            </div></div>`:''}

          ${m.schriften.length ? `<div style="margin-bottom:14px">
            <div class="t-sub" style="margin-bottom:5px">Schriften</div>
            ${m.schriften.map(s=>`<div style="font-size:13.5px">
              <b>${U.esc(s.name)}</b>${s.zweck?` <span class="t-sub">– ${U.esc(s.zweck)}</span>`:''}</div>`).join('')}
          </div>`:''}

          <div class="meta-list">
            ${m.logoOrt   ? `<div class="meta-row"><div class="k">Logo liegt</div><div class="v">${U.nl2br(m.logoOrt)}</div></div>`:''}
            ${m.dateien   ? `<div class="meta-row"><div class="k">Druckdaten</div><div class="v">${U.nl2br(m.dateien)}</div></div>`:''}
            ${m.lieferant ? `<div class="meta-row"><div class="k">Lieferant</div><div class="v">${U.nl2br(m.lieferant)}</div></div>`:''}
          </div>
          ${m.notizen ? `<div style="margin-top:12px;padding-top:11px;border-top:1px solid var(--line-soft);
            font-size:13.5px;line-height:1.6">${U.nl2br(m.notizen)}</div>`:''}
        ` : `<div class="t-sub" style="line-height:1.7">
            Noch nichts hinterlegt. Hier gehören Hausfarben, Schriften, wo das Logo liegt und bei
            wem du zuletzt gedruckt hast rein – beim nächsten Auftrag suchst du dann nicht mehr.
          </div>
          <button class="btn btn-sm btn-primary" style="margin-top:11px"
                  onclick="Knowledge.editBrand('${c.id}')">Steckbrief anlegen</button>`}
      </div>
    </div>`;
  }

  function editBrand(customerId){
    const c = Store.byId('customers', customerId);
    const m = c.marke || leereMarke();
    UI.modal({
      title:'Marke & Technik · ' + c.firma,
      wide:true,
      body:`
        <div class="field"><label>Hausfarben</label>
          <div id="kwFarben"></div>
          <button class="btn btn-sm" style="margin-top:7px" onclick="Knowledge.addFarbe()">+ Farbe</button>
        </div>
        <div class="field"><label>Schriften</label>
          <div id="kwSchriften"></div>
          <button class="btn btn-sm" style="margin-top:7px" onclick="Knowledge.addSchrift()">+ Schrift</button>
        </div>
        <div class="field"><label>Wo liegt das Logo</label>
          <textarea id="kwLogo" rows="2" placeholder="z.B. Dropbox / Kunden / Musterkunde / Logo_2025_vektor.ai">${U.esc(m.logoOrt)}</textarea></div>
        <div class="field"><label>Druckdaten / Ablage</label>
          <textarea id="kwDateien" rows="2" placeholder="z.B. Speisekarte InDesign auf der externen Platte">${U.esc(m.dateien)}</textarea></div>
        <div class="field"><label>Lieferant / Druckerei</label>
          <input type="text" id="kwLieferant" value="${U.esc(m.lieferant)}" placeholder="z.B. WIRmachenDRUCK, Folien über …"></div>
        <div class="field"><label>Was man sonst wissen sollte</label>
          <textarea id="kwNotizen" rows="3" placeholder="z.B. Chef will alles per WhatsApp, Freigabe dauert immer 3 Tage, Küche ist Montag zu">${U.esc(m.notizen)}</textarea></div>`,
      foot:`<button class="btn" onclick="location.hash='#/kunde/${customerId}';UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Knowledge.saveBrand('${customerId}')">Speichern</button>`
    });
    entwurf = JSON.parse(JSON.stringify(m));
    setTimeout(()=>{ paintFarben(); paintSchriften(); }, 40);
  }

  let entwurf = null;

  function paintFarben(){
    const box = document.getElementById('kwFarben');
    if (!box) return;
    box.innerHTML = entwurf.farben.length ? entwurf.farben.map((f,i)=>`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:7px">
        <input type="color" value="${/^#[0-9a-f]{6}$/i.test(f.hex)?f.hex:'#111111'}"
               style="width:44px;height:38px;padding:2px;cursor:pointer"
               oninput="Knowledge.setFarbe(${i},'hex',this.value)">
        <input type="text" value="${U.esc(f.hex)}" placeholder="#RRGGBB" style="max-width:120px"
               oninput="Knowledge.setFarbe(${i},'hex',this.value)">
        <input type="text" value="${U.esc(f.name||'')}" placeholder="wofür (Logo, Akzent …)"
               oninput="Knowledge.setFarbe(${i},'name',this.value)">
        <button class="pos-del" onclick="Knowledge.delFarbe(${i})">✕</button>
      </div>`).join('') : '<div class="t-sub">keine hinterlegt</div>';
  }
  function addFarbe(){ entwurf.farben.push({hex:'#111111', name:''}); paintFarben(); }
  function setFarbe(i,k,v){ entwurf.farben[i][k]=v; if(k==='hex') paintFarben(); }
  function delFarbe(i){ entwurf.farben.splice(i,1); paintFarben(); }

  function paintSchriften(){
    const box = document.getElementById('kwSchriften');
    if (!box) return;
    box.innerHTML = entwurf.schriften.length ? entwurf.schriften.map((s,i)=>`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:7px">
        <input type="text" value="${U.esc(s.name)}" placeholder="Schriftname"
               oninput="Knowledge.setSchrift(${i},'name',this.value)">
        <input type="text" value="${U.esc(s.zweck||'')}" placeholder="wofür (Überschrift, Fließtext)"
               oninput="Knowledge.setSchrift(${i},'zweck',this.value)">
        <button class="pos-del" onclick="Knowledge.delSchrift(${i})">✕</button>
      </div>`).join('') : '<div class="t-sub">keine hinterlegt</div>';
  }
  function addSchrift(){ entwurf.schriften.push({name:'', zweck:''}); paintSchriften(); }
  function setSchrift(i,k,v){ entwurf.schriften[i][k]=v; }
  function delSchrift(i){ entwurf.schriften.splice(i,1); paintSchriften(); }

  function saveBrand(customerId){
    const v = k => (document.getElementById(k)||{}).value?.trim() || '';
    const marke = {
      farben: entwurf.farben.filter(f=>f.hex),
      schriften: entwurf.schriften.filter(s=>s.name),
      logoOrt: v('kwLogo'), dateien: v('kwDateien'),
      lieferant: v('kwLieferant'), notizen: v('kwNotizen')
    };
    Store.update('customers', customerId, { marke });
    UI.closeModal(); UI.toast('Steckbrief gespeichert','ok'); App.rerender();
  }

  /* ================= OBJEKTMASSE ================= */
  function masseCard(c){
    const list = c.masse || [];
    return `
    <div class="card">
      <div class="card-head"><h3>Maße vor Ort</h3>
        <div class="actions"><button class="btn btn-sm" onclick="Knowledge.editMass('${c.id}')">+ Maß</button></div></div>
      ${list.length ? `<div class="table-wrap"><table><tbody>
        ${list.map((m,i)=>`<tr>
          <td><div class="t-strong">${U.esc(m.was)}</div>
            ${m.material?`<div class="t-sub">${U.esc(m.material)}</div>`:''}</td>
          <td class="num t-strong" style="white-space:nowrap">${U.esc(m.breite)} × ${U.esc(m.hoehe)} cm</td>
          <td class="t-sub" style="width:60px">${U.esc(m.jahr||'')}</td>
          <td style="width:70px;text-align:right">
            <button class="btn btn-sm" onclick="Knowledge.editMass('${c.id}',${i})">…</button></td>
        </tr>`).join('')}
      </tbody></table></div>`
      : `<div class="card-pad t-sub" style="line-height:1.7">
          Fassadenschild, Fensterfront, Speisekarten-Format, Fahrzeugseite – einmal gemessen,
          nie wieder hinfahren. Beim nächsten Auftrag steht die Zahl hier.</div>`}
    </div>`;
  }

  function editMass(customerId, index=null){
    const c = Store.byId('customers', customerId);
    const m = index !== null ? (c.masse||[])[index] : { was:'', breite:'', hoehe:'', material:'', jahr:new Date().getFullYear(), notiz:'' };
    UI.modal({
      title: index!==null ? 'Maß bearbeiten' : 'Maß aufnehmen',
      body:`
        <div class="field"><label>Was</label>
          <input type="text" id="kmWas" value="${U.esc(m.was)}" placeholder="z.B. Fassadenschild über Eingang"></div>
        <div class="row row-3">
          <div class="field"><label>Breite (cm)</label><input type="number" id="kmB" value="${U.esc(m.breite)}"></div>
          <div class="field"><label>Höhe (cm)</label><input type="number" id="kmH" value="${U.esc(m.hoehe)}"></div>
          <div class="field"><label>Jahr</label><input type="number" id="kmJ" value="${U.esc(m.jahr||'')}"></div>
        </div>
        <div class="field"><label>Material / Ausführung</label>
          <input type="text" id="kmM" value="${U.esc(m.material||'')}" placeholder="z.B. Alu-Dibond 3 mm, Klebefolie"></div>
        <div class="field"><label>Notiz</label>
          <input type="text" id="kmN" value="${U.esc(m.notiz||'')}" placeholder="z.B. Leiter nötig, Strom vorhanden"></div>`,
      foot:`${index!==null?`<button class="btn btn-danger left" onclick="Knowledge.delMass('${customerId}',${index})">Löschen</button>`:''}
            <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Knowledge.saveMass('${customerId}',${index})">Speichern</button>`
    });
  }

  function saveMass(customerId, index){
    const c = Store.byId('customers', customerId);
    const v = k => document.getElementById(k).value;
    const m = { was: v('kmWas').trim(), breite: U.parseNum(v('kmB')), hoehe: U.parseNum(v('kmH')),
                jahr: v('kmJ'), material: v('kmM').trim(), notiz: v('kmN').trim() };
    if (!m.was || !m.breite){ UI.toast('Was und Breite fehlen','err'); return; }
    c.masse = c.masse || [];
    if (index !== null && index !== undefined && index >= 0) c.masse[index] = m; else c.masse.push(m);
    Store.update('customers', customerId, c);
    UI.closeModal(); UI.toast('Maß gespeichert','ok'); App.rerender();
  }
  function delMass(customerId, index){
    const c = Store.byId('customers', customerId);
    c.masse.splice(index,1); Store.update('customers', customerId, c);
    UI.closeModal(); UI.toast('Gelöscht'); App.rerender();
  }

  /* ================= PREIS-HISTORIE ================= */
  const normalize = s => String(s||'').toLowerCase()
    .replace(/\d+([.,]\d+)?/g,'').replace(/[^a-zäöüß ]/g,' ').replace(/\s+/g,' ').trim().slice(0,42);

  function preisRows(){
    const m = {};
    Store.all('documents').filter(d => d.status !== 'storniert').forEach(d => {
      (d.positionen||[]).forEach(p => {
        const preis = U.parseNum(p.einzelpreis);
        if (!preis || preis < 0) return;
        const k = normalize(p.beschreibung);
        if (k.length < 4) return;
        (m[k] = m[k] || []).push({ preis, doc:d, text:p.beschreibung, customerId:d.customerId, datum:d.datum });
      });
    });
    return U.sortBy(Object.entries(m).map(([k, arr]) => {
      const preise = arr.map(x=>x.preis);
      return { key:k, label: arr[arr.length-1].text, anzahl: arr.length,
               min: Math.min(...preise), max: Math.max(...preise),
               schnitt: U.sum(preise)/preise.length, eintraege: U.sortBy(arr, x=>x.datum,'desc') };
    }).filter(x => x.anzahl > 0), x => x.anzahl, 'desc');
  }

  function renderPreise(){
    const rows = preisRows();
    const streuend = rows.filter(r => r.anzahl > 1 && r.max > r.min * 1.25);
    return `
    <div class="page-head">
      <div><h1>Preis-Historie</h1>
        <div class="sub">Was du wem berechnet hast – damit du nicht dem einen 350 und dem anderen 550 nennst</div></div>
    </div>

    ${streuend.length ? `<div class="card card-pad" style="margin-bottom:18px;background:var(--amber-bg);border:none">
      <div class="t-strong" style="margin-bottom:5px">${streuend.length} Leistung${streuend.length>1?'en':''} mit großer Spanne</div>
      <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft)">
        ${streuend.slice(0,3).map(r=>`<b>${U.esc(U.cut(r.label,34))}</b>: ${U.eur0(r.min)} bis ${U.eur0(r.max)}`).join(' · ')}.
        In Ostfriesland reden die Wirte miteinander – schau, ob die Unterschiede begründet sind
        (Umfang, Eile, Material) oder ob du irgendwo zu billig warst.
      </div>
    </div>`:''}

    <div class="card table-wrap">
      ${rows.length ? `<table>
        <thead><tr><th>Leistung</th><th class="num">wie oft</th><th class="num">günstigster</th>
          <th class="num">Schnitt</th><th class="num">teuerster</th><th></th></tr></thead>
        <tbody>${rows.map((r,i) => `<tr class="clickable" onclick="Knowledge.preisDetail(${i})">
          <td class="t-strong">${U.esc(U.cut(r.label,44))}</td>
          <td class="num t-sub">${r.anzahl}×</td>
          <td class="num t-sub">${U.eur0(r.min)}</td>
          <td class="num t-strong">${U.eur0(r.schnitt)}</td>
          <td class="num t-sub">${U.eur0(r.max)}</td>
          <td style="text-align:right">${r.max > r.min*1.25 ? '<span class="badge amber">streut</span>' : ''}</td>
        </tr>`).join('')}</tbody></table>`
      : UI.empty('Noch keine Positionen erfasst. Sobald du ein paar Rechnungen geschrieben hast, steht hier deine eigene Preisliste.')}
    </div>`;
  }

  function preisDetail(i){
    const r = preisRows()[i];
    if (!r) return;
    UI.modal({
      title: U.cut(r.label, 48),
      body:`<div class="grid grid-3" style="margin-bottom:16px">
          <div class="kpi"><div class="label">günstigster</div><div class="value">${U.eur0(r.min)}</div></div>
          <div class="kpi"><div class="label">Schnitt</div><div class="value">${U.eur0(r.schnitt)}</div></div>
          <div class="kpi"><div class="label">teuerster</div><div class="value">${U.eur0(r.max)}</div></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Kunde</th><th>Dokument</th><th class="num">Preis</th></tr></thead>
          <tbody>${r.eintraege.map(e=>`<tr class="clickable" onclick="UI.closeModal();Documents.open('${e.doc.id}')">
            <td class="t-sub">${U.de(e.datum)}</td>
            <td>${U.esc(Store.custName(e.customerId))}</td>
            <td class="t-sub mono">${U.esc(e.doc.nummer)}</td>
            <td class="num t-strong">${U.eur(e.preis)}</td>
          </tr>`).join('')}</tbody></table></div>`,
      foot:`<button class="btn btn-primary" onclick="UI.closeModal()">Schließen</button>`
    });
  }

  /* ================= AUFTRAGSVORLAGEN ================= */
  const STANDARD_VORLAGEN = [
    { name:'Speisekarte', typ:'Speisekarte', aufwandStd:6,
      positionen:[{beschreibung:'Speisekarte Design (4-seitig)', menge:1, einzelpreis:450},
                  {beschreibung:'Druckdatenerstellung', menge:1, einzelpreis:90}],
      checkliste:['Alte Karte vom Kunden bekommen','Preise gegengelesen','Allergene A–N geprüft',
                  'Zusatzstoffe 1–13 geprüft','Korrektur beim Kunden freigegeben','Druckdaten mit Beschnitt',
                  'Proof kontrolliert','Datei archiviert'] },
    { name:'Fensterfolie / Beschriftung', typ:'Folie / Beschriftung', aufwandStd:5,
      positionen:[{beschreibung:'Fensterfolie inkl. Gestaltung', menge:1, einzelpreis:0}],
      checkliste:['Maße vor Ort genommen','Untergrund geprüft (Glas, Lack, Struktur)','Spiegeln nötig? geklärt',
                  'Cutkontur angelegt','Montage-Termin vereinbart','Reinigungsmittel und Rakel dabei'] },
    { name:'Logo', typ:'Logo / Branding', aufwandStd:10,
      positionen:[{beschreibung:'Logodesign inkl. Reinzeichnung', menge:1, einzelpreis:550}],
      checkliste:['Briefing geklärt (Zielgruppe, Vorbilder, No-Gos)','Drei Entwürfe gezeigt','Freigabe schriftlich',
                  'Vektor-Reinzeichnung','Varianten: farbig, einfarbig, negativ','Dateien übergeben (AI, EPS, PNG, SVG, PDF)'] },
    { name:'Banner / Plane', typ:'Großformat / Banner', aufwandStd:3,
      positionen:[{beschreibung:'Banner inkl. Datenerstellung', menge:1, einzelpreis:0}],
      checkliste:['Maße und Befestigung geklärt','Ösen-Abstand festgelegt','Windlast bedacht (Mesh?)',
                  'Daten in Originalgröße','Freigabe eingeholt'] }
  ];

  function renderTemplates(){
    const ts = Store.all('templates');
    return `
    <div class="page-head">
      <div><h1>Vorlagen</h1>
        <div class="sub">Wiederkehrende Aufträge ohne Nachdenken – mit Checkliste, damit nichts vergessen wird</div></div>
      <div class="actions">
        ${ts.length ? '' : `<button class="btn" onclick="Knowledge.seedTemplates()">Standardvorlagen anlegen</button>`}
        <button class="btn btn-primary" onclick="Knowledge.editTemplate()">+ Vorlage</button>
      </div>
    </div>

    <div class="grid grid-2">
      ${ts.length ? ts.map(t => `<div class="card">
        <div class="card-head"><h3>${U.esc(t.name)}</h3>
          <div class="actions"><span class="t-sub">${t.aufwandStd||'?'} h</span></div></div>
        <div class="card-pad">
          <div style="font-size:13.5px;margin-bottom:10px">
            ${(t.positionen||[]).map(p=>`<div style="display:flex;justify-content:space-between;padding:2px 0">
              <span>${U.esc(p.beschreibung)}</span>
              <span class="t-strong">${p.einzelpreis?U.eur0(p.einzelpreis):'n. Aufwand'}</span></div>`).join('')}
          </div>
          ${(t.checkliste||[]).length ? `<div class="t-sub" style="line-height:1.7;margin-bottom:12px">
            ${(t.checkliste||[]).length} Punkte auf der Checkliste: ${U.esc(U.cut((t.checkliste||[]).join(' · '), 90))}</div>`:''}
          <div style="display:flex;gap:7px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" onclick="Knowledge.useTemplate('${t.id}')">Projekt daraus anlegen</button>
            <button class="btn btn-sm" onclick="Knowledge.editTemplate('${t.id}')">Bearbeiten</button>
          </div>
        </div>
      </div>`).join('')
      : `<div class="card">${UI.empty('Noch keine Vorlagen. Vier fertige für deine häufigsten Aufträge sind vorbereitet.',
          `<button class="btn btn-primary" onclick="Knowledge.seedTemplates()">Standardvorlagen anlegen</button>`)}</div>`}
    </div>`;
  }

  function seedTemplates(){
    STANDARD_VORLAGEN.forEach(v => Store.add('templates', JSON.parse(JSON.stringify(v))));
    UI.toast(STANDARD_VORLAGEN.length + ' Vorlagen angelegt','ok'); App.rerender();
  }

  function editTemplate(id=null){
    const t = id ? Store.byId('templates', id) : { name:'', typ:'', aufwandStd:'', positionen:[], checkliste:[] };
    UI.modal({
      title: id?'Vorlage bearbeiten':'Neue Vorlage',
      wide:true,
      body:`
        <div class="row row-3">
          <div class="field"><label>Name</label><input type="text" id="tvName" value="${U.esc(t.name)}"></div>
          <div class="field"><label>Auftragstyp</label>
            <select id="tvTyp"><option value="">–</option>
              ${Store.PROJECT_TYPES.map(x=>`<option ${x===t.typ?'selected':''}>${x}</option>`).join('')}</select></div>
          <div class="field"><label>Aufwand (Std.)</label>
            <input type="number" id="tvStd" value="${U.esc(t.aufwandStd)}" step="0.5"></div>
        </div>
        <div class="field"><label>Positionen <span class="t-sub">– eine pro Zeile: Text | Preis</span></label>
          <textarea id="tvPos" rows="4" placeholder="Speisekarte Design (4-seitig) | 450">${
            (t.positionen||[]).map(p=>`${p.beschreibung} | ${p.einzelpreis||''}`).join('\n')}</textarea></div>
        <div class="field"><label>Checkliste <span class="t-sub">– ein Punkt pro Zeile</span></label>
          <textarea id="tvCheck" rows="8" placeholder="Maße genommen&#10;Freigabe eingeholt">${
            (t.checkliste||[]).join('\n')}</textarea></div>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Store.remove('templates','${id}');UI.closeModal();App.rerender()">Löschen</button>`:''}
            <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Knowledge.saveTemplate('${id||''}')">Speichern</button>`
    });
  }

  function saveTemplate(id){
    const v = k => document.getElementById(k).value;
    const name = v('tvName').trim();
    if (!name){ UI.toast('Name fehlt','err'); return; }
    const positionen = v('tvPos').split('\n').filter(l=>l.trim()).map(l => {
      const [b, p] = l.split('|');
      return { beschreibung:(b||'').trim(), menge:1, einheit:'', einzelpreis:U.parseNum(p||0) };
    });
    const checkliste = v('tvCheck').split('\n').map(x=>x.trim()).filter(Boolean);
    const patch = { name, typ: v('tvTyp'), aufwandStd: U.parseNum(v('tvStd')), positionen, checkliste };
    if (id) Store.update('templates', id, patch); else Store.add('templates', patch);
    UI.closeModal(); UI.toast('Vorlage gespeichert','ok'); App.rerender();
  }

  function useTemplate(id){
    const t = Store.byId('templates', id);
    UI.modal({
      title:'Projekt aus Vorlage · ' + t.name,
      body:`<div class="field"><label>Kunde</label>
          <select id="utKunde">${UI.customerOptions()}</select></div>
        <div class="field"><label>Titel</label>
          <input type="text" id="utTitel" value="${U.esc(t.name)}"></div>
        <div class="field"><label>Deadline</label>
          <input type="date" id="utDeadline" value="${U.addDays(U.today(),14)}"></div>
        <div class="t-sub" style="line-height:1.7">
          Legt das Projekt an mit ${t.aufwandStd||0} h Aufwand, ${(t.checkliste||[]).length} Checklisten-Punkten
          und ${(t.positionen||[]).length} vorbereiteten Positionen fürs Angebot.</div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Knowledge.createFromTemplate('${id}')">Anlegen</button>`
    });
  }

  function createFromTemplate(id){
    const t = Store.byId('templates', id);
    const p = Store.add('projects', {
      titel: document.getElementById('utTitel').value.trim() || t.name,
      customerId: document.getElementById('utKunde').value,
      typ: t.typ, status:'anfrage',
      deadline: document.getElementById('utDeadline').value,
      budget: U.sum(t.positionen||[], x=>U.parseNum(x.einzelpreis)),
      aufwandStd: t.aufwandStd,
      checkliste: (t.checkliste||[]).map(x=>({text:x, erledigt:false})),
      templateId: id, notizen:''
    });
    UI.closeModal(); UI.toast('Projekt angelegt','ok');
    Projects.edit(p.id);
  }

  /* ---------- Checkliste im Projekt ---------- */
  function checklistBlock(p){
    const list = p.checkliste || [];
    if (!list.length){
      const passende = Store.all('templates').filter(t => !t.typ || t.typ === p.typ);
      return passende.length ? `<div style="border-top:1px solid var(--line);margin-top:8px;padding-top:16px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="font-size:15px">Checkliste</h3>
          <span class="t-sub">keine – aus Vorlage übernehmen:</span>
          ${passende.slice(0,3).map(t=>`<button class="btn btn-sm" onclick="Knowledge.applyChecklist('${p.id}','${t.id}')">${U.esc(t.name)}</button>`).join('')}
        </div></div>` : '';
    }
    const fertig = list.filter(x=>x.erledigt).length;
    return `<div style="border-top:1px solid var(--line);margin-top:8px;padding-top:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <h3 style="font-size:15px">Checkliste</h3>
        <span class="badge ${fertig===list.length?'green':'grey'}">${fertig} / ${list.length}</span>
        <div class="progress" style="flex:1;min-width:120px;margin:0">
          <span style="width:${fertig/list.length*100}%"></span></div>
      </div>
      ${list.map((x,i)=>`<label class="check" style="padding:4px 0">
        <input type="checkbox" ${x.erledigt?'checked':''} onchange="Knowledge.toggleCheck('${p.id}',${i})">
        <span style="${x.erledigt?'text-decoration:line-through;opacity:.55':''}">${U.esc(x.text)}</span>
      </label>`).join('')}
    </div>`;
  }
  function toggleCheck(projectId, i){
    const p = Store.byId('projects', projectId);
    p.checkliste[i].erledigt = !p.checkliste[i].erledigt;
    Store.update('projects', projectId, p);
    const el = document.querySelectorAll(`#modal .check`)[i];
    if (el) el.querySelector('span').style.cssText = p.checkliste[i].erledigt ? 'text-decoration:line-through;opacity:.55' : '';
  }
  function applyChecklist(projectId, templateId){
    const t = Store.byId('templates', templateId);
    const p = Store.byId('projects', projectId);
    p.checkliste = (t.checkliste||[]).map(x=>({text:x, erledigt:false}));
    Store.update('projects', projectId, p);
    UI.toast('Checkliste übernommen','ok');
    Projects.edit(projectId);
  }

  return { brandCard, editBrand, saveBrand, addFarbe, setFarbe, delFarbe,
           addSchrift, setSchrift, delSchrift,
           masseCard, editMass, saveMass, delMass,
           renderPreise, preisDetail, preisRows,
           renderTemplates, seedTemplates, editTemplate, saveTemplate, useTemplate,
           createFromTemplate, checklistBlock, toggleCheck, applyChecklist };
})();
