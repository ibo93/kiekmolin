/* ==========================================================
   Kurani CRM – Fahrtenbuch
   Jede betriebliche Fahrt mit dem Privatwagen ist eine
   Betriebsausgabe. 0,30 €/km, die du sonst verschenkst.
   ========================================================== */
const Trips = (() => {

  let jahr = new Date().getFullYear();

  const ZWECKE = ['Kundentermin','Montage','Aufmaß','Material abholen','Druckerei','Dreh / Fotos','Post / Bank','Fortbildung','Sonstiges'];

  const km = t => U.parseNum(t.km) * (t.hinRueck ? 2 : 1);
  const wert = t => km(t) * (Store.settings().kmPauschale || 0.30);
  const imJahr = y => Store.all('trips').filter(t => U.yearOf(t.datum) === y);

  const kmJahr   = y => U.sum(imJahr(y||jahr), km);
  const wertJahr = y => U.sum(imJahr(y||jahr), wert);

  /* ---------- Strecken, die schon mal gefahren wurden ---------- */
  function strecken(){
    const m = {};
    Store.all('trips').forEach(t => {
      const k = (t.von||'') + ' → ' + (t.nach||'');
      if (!t.von || !t.nach) return;
      if (!m[k]) m[k] = { von:t.von, nach:t.nach, km:U.parseNum(t.km), anzahl:0, customerId:t.customerId };
      m[k].anzahl++;
    });
    return U.sortBy(Object.values(m), s => s.anzahl, 'desc').slice(0, 8);
  }

  /* ================= ANSICHT ================= */
  function render(){
    const ts = U.sortBy(imJahr(jahr), t => t.datum, 'desc');
    const monate = U.groupBy(ts, t => U.monthKey(t.datum));
    const s = Store.settings();
    const proKunde = U.sortBy(Object.entries(U.groupBy(ts.filter(t=>t.customerId), t=>t.customerId))
      .map(([id, arr]) => ({ id, km:U.sum(arr,km), fahrten:arr.length })), x => x.km, 'desc').slice(0,6);

    return `
    <div class="page-head">
      <div><h1>Fahrten</h1>
        <div class="sub">${U.num(kmJahr()).replace(',00','')} km in ${jahr} · ${U.eur(wertJahr())} Betriebsausgabe</div></div>
      <div class="actions">
        ${yearSelect()}
        <button class="btn" onclick="Trips.exportCsv()">CSV</button>
        <button class="btn btn-primary" onclick="Trips.edit()">+ Fahrt</button>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi accent-green"><div class="label">Absetzbar ${jahr}</div><div class="value">${U.eur0(wertJahr())}</div>
        <div class="foot">${U.num(kmJahr()).replace(',00','')} km à ${U.eur(s.kmPauschale)}</div></div>
      <div class="kpi"><div class="label">Fahrten</div><div class="value">${ts.length}</div>
        <div class="foot">Ø ${ts.length?Math.round(kmJahr()/ts.length):0} km</div></div>
      <div class="kpi"><div class="label">Diesen Monat</div>
        <div class="value">${U.eur0(U.sum(ts.filter(t=>U.monthKey(t.datum)===U.monthKey(U.today())), wert))}</div>
        <div class="foot">${U.sum(ts.filter(t=>U.monthKey(t.datum)===U.monthKey(U.today())), km)} km</div></div>
      <div class="kpi"><div class="label">Spart dir grob</div><div class="value">${U.eur0(wertJahr()*0.3)}</div>
        <div class="foot">bei ~30% Steuerlast</div></div>
    </div>

    ${strecken().length ? `<div class="card card-pad" style="margin-bottom:16px">
      <div class="t-sub" style="margin-bottom:9px">Häufige Strecken – ein Klick, Fahrt ist drin:</div>
      <div class="catalog">
        ${strecken().map((st,i)=>`<button class="cat-chip" onclick="Trips.quick(${i})">
          ${U.esc(U.cut(st.von,14))} → ${U.esc(U.cut(st.nach,14))} · ${st.km} km</button>`).join('')}
      </div>
    </div>`:''}

    <div class="grid grid-2-1">
      <div class="card table-wrap">
        ${ts.length ? Object.keys(monate).sort().reverse().map(mk => {
          const items = monate[mk];
          return `<div class="card-head" style="background:var(--card-weich)">
              <h3 style="font-size:14px">${U.monthName(mk)}</h3>
              <div class="actions t-sub">${U.num(U.sum(items,km)).replace(',00','')} km · ${U.eur(U.sum(items,wert))}</div></div>
            <table><tbody>${items.map(t => `<tr class="clickable" onclick="Trips.edit('${t.id}')">
              <td class="t-sub" style="width:92px">${U.de(t.datum)}</td>
              <td>
                <div class="t-strong">${U.esc(t.von||'?')} → ${U.esc(t.nach||'?')}${t.hinRueck?' und zurück':''}</div>
                <div class="t-sub">${U.esc(t.zweck||'')}${t.customerId?' · '+U.esc(Store.custName(t.customerId)):''}</div>
              </td>
              <td class="num t-strong" style="width:80px">${U.num(km(t)).replace(',00','')} km</td>
              <td class="num t-sub" style="width:80px">${U.eur(wert(t))}</td>
              <td style="width:38px;text-align:right" onclick="event.stopPropagation()">
                <button class="pos-del" onclick="Trips.del('${t.id}')">✕</button></td>
            </tr>`).join('')}</tbody></table>`;
        }).join('') : UI.empty('Noch keine Fahrten für '+jahr+'. Jede Fahrt zum Kunden zählt.',
          `<button class="btn btn-primary" onclick="Trips.edit()">+ Erste Fahrt</button>`)}
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:12px">Wohin fährst du am meisten</h3>
          ${proKunde.length ? proKunde.map(x => `<div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:3px">
              <span style="cursor:pointer" onclick="location.hash='#/kunde/${x.id}'">${U.esc(U.cut(Store.custName(x.id),22))}</span>
              <span class="t-strong">${U.num(x.km).replace(',00','')} km</span></div>
            <div class="progress" style="margin:0"><span style="width:${x.km/proKunde[0].km*100}%"></span></div>
          </div>`).join('') : '<div class="t-sub">Ordne Fahrten einem Kunden zu, dann siehst du hier wo deine Zeit hingeht.</div>'}
        </div>

        <div class="card card-pad" style="background:var(--card-weich)">
          <h3 style="font-size:15px;margin-bottom:8px">So machst du es richtig</h3>
          <div style="font-size:13px;line-height:1.7;color:var(--ink-soft)">
            Die Pauschale von ${U.eur(s.kmPauschale)}/km gilt für betriebliche Fahrten mit dem
            <b>privaten</b> Wagen – Kundentermine, Montage, Material holen, zur Post.
            Aufschreiben musst du: Datum, Ziel, Zweck, Kilometer. Genau das steht hier drin.<br><br>
            Fahrten zwischen Wohnung und einem festen Betriebssitz zählen anders (Entfernungspauschale).
            Wenn dein Büro zu Hause ist, betrifft dich das meist nicht – im Zweifel einmal mit dem
            Steuerberater klären.
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------- Erfassen ---------- */
  function edit(id=null){
    const t = id ? Store.byId('trips', id) : {
      datum: U.today(), von: Store.settings().ort || '', nach:'', km:'',
      hinRueck:true, zweck:'Kundentermin', customerId:'', projectId:'', notiz:''
    };
    UI.modal({
      title: id ? 'Fahrt bearbeiten' : 'Fahrt eintragen',
      body:`
        <div class="row row-2">
          <div class="field"><label>Datum</label><input type="date" id="fDatum" value="${U.esc(t.datum)}"></div>
          <div class="field"><label>Zweck</label>
            <select id="fZweck">${ZWECKE.map(z=>`<option ${z===t.zweck?'selected':''}>${z}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Kunde <span class="t-sub">(setzt das Ziel automatisch)</span></label>
          <select id="fKunde" onchange="Trips.fillZiel(this.value)">${UI.customerOptions(t.customerId)}</select></div>
        <div class="row row-2">
          <div class="field"><label>Von</label><input type="text" id="fVon" value="${U.esc(t.von)}" placeholder="Norden"></div>
          <div class="field"><label>Nach</label><input type="text" id="fNach" value="${U.esc(t.nach)}" placeholder="Greetsiel"></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>Kilometer (einfache Strecke)</label>
            <input type="number" id="fKm" value="${U.esc(t.km)}" step="1" oninput="Trips.preview()"></div>
          <div class="field"><label>&nbsp;</label>
            <label class="check" style="padding-top:9px"><input type="checkbox" id="fHin" ${t.hinRueck?'checked':''}
              onchange="Trips.preview()"> Hin und zurück</label></div>
        </div>
        <div class="field"><label>Notiz</label><input type="text" id="fNotiz" value="${U.esc(t.notiz||'')}"></div>
        <div id="fPreview" class="card card-pad" style="background:var(--card-weich);border:none"></div>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Trips.del('${id}',true)">Löschen</button>`:''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Trips.save('${id||''}')">Speichern</button>`
    });
    setTimeout(preview, 40);
  }

  function fillZiel(customerId){
    if (!customerId) return;
    const c = Store.byId('customers', customerId);
    const nach = document.getElementById('fNach');
    if (nach && !nach.value) nach.value = c.ort || c.firma;
    // km aus einer früheren Fahrt zu diesem Kunden übernehmen
    const alt = Store.all('trips').filter(x => x.customerId === customerId && U.parseNum(x.km)).pop();
    const kmF = document.getElementById('fKm');
    if (alt && kmF && !kmF.value) kmF.value = alt.km;
    preview();
  }

  function preview(){
    const box = document.getElementById('fPreview');
    if (!box) return;
    const k = U.parseNum(document.getElementById('fKm').value) * (document.getElementById('fHin').checked ? 2 : 1);
    const w = k * (Store.settings().kmPauschale || 0.30);
    box.innerHTML = k
      ? `<div style="font-size:13.5px;line-height:1.6">
           <b>${U.num(k).replace(',00','')} km</b> gefahren = <b>${U.eur(w)}</b> Betriebsausgabe.
           <span class="t-sub">Senkt deine Steuer um grob ${U.eur(w*0.3)}.</span></div>`
      : `<span class="t-sub">Kilometer eintragen, dann rechne ich dir aus was es bringt.</span>`;
  }

  function save(id){
    const v = k => document.getElementById(k).value;
    const patch = {
      datum: v('fDatum'), von: v('fVon').trim(), nach: v('fNach').trim(),
      km: U.parseNum(v('fKm')), hinRueck: document.getElementById('fHin').checked,
      zweck: v('fZweck'), customerId: v('fKunde'), notiz: v('fNotiz').trim()
    };
    if (!patch.km){ UI.toast('Kilometer fehlen','err'); return; }
    if (id) Store.update('trips', id, patch); else Store.add('trips', patch);
    UI.closeModal(); UI.toast('Fahrt gespeichert','ok'); App.rerender();
  }

  function quick(i){
    const st = strecken()[i];
    edit();
    setTimeout(() => {
      document.getElementById('fVon').value = st.von;
      document.getElementById('fNach').value = st.nach;
      document.getElementById('fKm').value = st.km;
      if (st.customerId) document.getElementById('fKunde').value = st.customerId;
      preview();
    }, 60);
  }

  function del(id, fromModal=false){
    UI.confirm('Fahrt löschen?', () => {
      Store.remove('trips', id); if (fromModal) UI.closeModal();
      UI.toast('Gelöscht'); App.rerender();
    });
  }

  function exportCsv(){
    const rows = [['Datum','Von','Nach','Hin und zurück','Kilometer','Zweck','Kunde','Pauschale €','Notiz']];
    U.sortBy(imJahr(jahr), t=>t.datum).forEach(t => rows.push([
      U.de(t.datum), t.von, t.nach, t.hinRueck?'ja':'nein', U.num(km(t)).replace(',00',''),
      t.zweck, Store.custName(t.customerId), U.num(wert(t)), t.notiz||''
    ]));
    rows.push([],['Summe','','','',U.num(kmJahr()).replace(',00',''),'','',U.num(wertJahr())]);
    U.download(`Fahrtenbuch_${jahr}.csv`, '﻿'+U.csv(rows), 'text/csv');
    UI.toast('CSV exportiert','ok');
  }

  function yearSelect(){
    const jahre = new Set([new Date().getFullYear()]);
    Store.all('trips').forEach(t => jahre.add(U.yearOf(t.datum)));
    return `<select onchange="Trips.setYear(this.value)" style="width:auto">
      ${[...jahre].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${y===jahr?'selected':''}>${y}</option>`).join('')}
    </select>`;
  }
  function setYear(y){ jahr = Number(y); App.rerender(); }

  return { render, edit, save, del, quick, preview, fillZiel, exportCsv, setYear,
           km, wert, kmJahr, wertJahr, strecken, ZWECKE };
})();
