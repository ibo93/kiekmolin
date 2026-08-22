/* ==========================================================
   Kurani CRM – Termine & Bestellungen
   Montage, Kundentermine, Drehtage – und was wann geliefert wird.
   Export als .ics für den iPhone-Kalender.
   ========================================================== */
const Cal = (() => {

  let ab = U.startOfWeek(U.today());   // erste angezeigte Woche
  let tab = 'termine';                 // termine | bestellungen

  const ARTEN = {
    montage:  { label:'Montage',      farbe:'amber' },
    kunde:    { label:'Kundentermin', farbe:'blue'  },
    aufmass:  { label:'Aufmaß',       farbe:'grey'  },
    dreh:     { label:'Dreh / Fotos', farbe:'green' },
    liefer:   { label:'Lieferung',    farbe:'dark'  },
    privat:   { label:'Geblockt',     farbe:'grey'  }
  };

  const artLabel = a => (ARTEN[a]||ARTEN.kunde).label;
  const artFarbe = a => (ARTEN[a]||ARTEN.kunde).farbe;

  /* ---------- Termine einer Woche ---------- */
  function wocheTage(start){
    return Array.from({length:7}, (_,i) => {
      const tag = U.addDays(start, i);
      const termine = U.sortBy(Store.all('appointments').filter(t => t.datum === tag), t => t.zeit || '');
      const lieferungen = Store.all('orders').filter(o => o.erwartetAm === tag && !o.geliefertAm)
        .map(o => ({ id:o.id, datum:tag, zeit:'', titel:'Lieferung: '+o.was, art:'liefer',
                     customerId:o.customerId, projectId:o.projectId, ort:o.lieferant, istBestellung:true }));
      const deadlines = Store.all('projects').filter(p => p.deadline === tag &&
        !['bezahlt','verloren'].includes(p.status))
        .map(p => ({ id:p.id, datum:tag, zeit:'', titel:'Deadline: '+p.titel, art:'privat',
                     customerId:p.customerId, istDeadline:true }));
      return { tag, items: [...termine, ...lieferungen, ...deadlines] };
    });
  }

  /* ================= ANSICHT ================= */
  function render(){
    const tage = wocheTage(ab);
    const heute = U.today();
    const kw = U.kw(ab);
    const offeneBestellungen = Store.all('orders').filter(o => !o.geliefertAm);

    return `
    <div class="page-head">
      <div><h1>Termine</h1>
        <div class="sub">KW ${kw} · ${U.de(ab)} bis ${U.de(U.addDays(ab,6))}</div></div>
      <div class="actions">
        <div class="seg">
          <button class="${tab==='termine'?'active':''}" onclick="Cal.setTab('termine')">Woche</button>
          <button class="${tab==='bestellungen'?'active':''}" onclick="Cal.setTab('bestellungen')">Bestellungen${offeneBestellungen.length?' ('+offeneBestellungen.length+')':''}</button>
        </div>
        <button class="btn" onclick="Cal.exportIcs()">Kalender-Datei</button>
        <button class="btn btn-primary" onclick="${tab==='termine'?'Cal.edit()':'Cal.editOrder()'}">
          + ${tab==='termine'?'Termin':'Bestellung'}</button>
      </div>
    </div>

    ${tab === 'termine' ? `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="Cal.shift(-7)">← Woche</button>
        <button class="btn btn-sm" onclick="Cal.heute()">Diese Woche</button>
        <button class="btn btn-sm" onclick="Cal.shift(7)">Woche →</button>
      </div>

      <div class="week-grid">
        ${tage.map(({tag, items}) => {
          const istHeute = tag === heute;
          const wt = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date(tag).getDay()];
          const we = [0,6].includes(new Date(tag).getDay());
          return `<div class="card day ${istHeute?'today':''} ${we?'weekend':''} ${items.length?'':'leer'}">
            <div class="day-head ${istHeute?'is-today':''}">
              <div class="wt">${wt}</div>
              <div class="dt">${U.deShort(tag).replace(/\.$/,'')}</div>
            </div>
            <div style="padding:7px 8px;cursor:pointer" onclick="Cal.edit(null,'${tag}')">
              ${items.length ? items.map(t => `<div onclick="event.stopPropagation();${
                    t.istBestellung ? `Cal.editOrder('${t.id}')` : t.istDeadline ? `Projects.edit('${t.id}')` : `Cal.edit('${t.id}')`}"
                  style="margin-bottom:5px;padding:6px 7px;border-radius:7px;background:var(--bg);
                         border-left:3px solid ${farbeCss(t.art)};font-size:11.5px;line-height:1.35">
                  ${t.zeit?`<b>${U.esc(t.zeit)}</b> `:''}${U.esc(U.cut(t.titel,26))}
                  ${t.customerId?`<div style="color:var(--muted)">${U.esc(U.cut(Store.custName(t.customerId),20))}</div>`:''}
                </div>`).join('')
                : `<div class="t-sub" style="font-size:11px;padding:4px 2px">frei</div>`}
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="card card-pad" style="margin-top:16px">
        <div class="t-sub" style="line-height:1.7">
          Klick auf einen Tag legt dort einen Termin an. Deadlines aus Projekten und erwartete
          Lieferungen erscheinen automatisch – die musst du nicht doppelt eintragen.
          Über <b>Kalender-Datei</b> bekommst du alles als .ics, das du in den iPhone-Kalender importieren kannst.
        </div>
      </div>
    ` : renderOrders()}`;
  }

  const farbeCss = a => ({amber:'var(--amber)', blue:'var(--blue)', green:'var(--green)', dark:'var(--ink)', grey:'var(--muted)'}[artFarbe(a)] || 'var(--muted)');

  function setTab(t){ tab = t; App.rerender(); }
  function shift(tage){ ab = U.addDays(ab, tage); App.rerender(); }
  function heute(){ ab = U.startOfWeek(U.today()); App.rerender(); }

  /* ---------- Termin bearbeiten ---------- */
  function edit(id=null, datum=null){
    const t = id ? Store.byId('appointments', id) : {
      datum: datum || U.today(), zeit:'09:00', dauer:60, titel:'', art:'kunde',
      customerId:'', projectId:'', ort:'', notiz:''
    };
    UI.modal({
      title: id?'Termin':'Neuer Termin',
      body:`
        <div class="field"><label>Was</label>
          <input type="text" id="apTitel" value="${U.esc(t.titel)}" placeholder="z.B. Montage Fensterfolie"></div>
        <div class="row row-3">
          <div class="field"><label>Datum</label><input type="date" id="apDatum" value="${U.esc(t.datum)}"></div>
          <div class="field"><label>Uhrzeit</label><input type="time" id="apZeit" value="${U.esc(t.zeit||'')}"></div>
          <div class="field"><label>Dauer (Min.)</label><input type="number" id="apDauer" value="${U.esc(t.dauer||60)}" step="15"></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>Art</label>
            <select id="apArt">${Object.entries(ARTEN).map(([k,v])=>`<option value="${k}" ${k===t.art?'selected':''}>${v.label}</option>`).join('')}</select></div>
          <div class="field"><label>Kunde</label>
            <select id="apKunde" onchange="Cal.fillOrt(this.value)">${UI.customerOptions(t.customerId)}</select></div>
        </div>
        <div class="field"><label>Ort</label>
          <input type="text" id="apOrt" value="${U.esc(t.ort||'')}" placeholder="Adresse oder Treffpunkt"></div>
        <div class="field"><label>Notiz</label>
          <textarea id="apNotiz" rows="2" placeholder="Was mitnehmen, worauf achten">${U.esc(t.notiz||'')}</textarea></div>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Cal.del('${id}')">Löschen</button>
              <button class="btn" onclick="Cal.icsOne('${id}')">In Kalender</button>`:''}
            <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Cal.save('${id||''}')">Speichern</button>`
    });
  }

  function fillOrt(customerId){
    if (!customerId) return;
    const c = Store.byId('customers', customerId);
    const el = document.getElementById('apOrt');
    if (el && !el.value) el.value = [c.strasse, [c.plz,c.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }

  function save(id){
    const v = k => document.getElementById(k).value;
    const patch = {
      titel: v('apTitel').trim(), datum: v('apDatum'), zeit: v('apZeit'),
      dauer: U.parseNum(v('apDauer'))||60, art: v('apArt'),
      customerId: v('apKunde'), ort: v('apOrt').trim(), notiz: v('apNotiz').trim()
    };
    if (!patch.titel){ UI.toast('Was steht an?','err'); return; }
    if (id) Store.update('appointments', id, patch); else Store.add('appointments', patch);
    UI.closeModal(); UI.toast('Termin gespeichert','ok'); App.rerender();
  }
  function del(id){
    UI.confirm('Termin löschen?', () => { Store.remove('appointments', id); UI.closeModal();
      UI.toast('Gelöscht'); App.rerender(); });
  }

  /* ================= BESTELLUNGEN ================= */
  function renderOrders(){
    const os = U.sortBy(Store.all('orders'), o => o.erwartetAm || '9999');
    const offen = os.filter(o => !o.geliefertAm);
    const summe = U.sum(offen, o => U.parseNum(o.betrag));
    return `
    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi"><div class="label">Unterwegs</div><div class="value">${offen.length}</div>
        <div class="foot">${U.eur0(summe)} bestellt</div></div>
      <div class="kpi ${offen.filter(o=>U.daysUntil(o.erwartetAm)<0).length?'accent-red':''}">
        <div class="label">Überfällig</div>
        <div class="value">${offen.filter(o=>o.erwartetAm && U.daysUntil(o.erwartetAm)<0).length}</div>
        <div class="foot">hätte da sein müssen</div></div>
      <div class="kpi"><div class="label">Diese Woche</div>
        <div class="value">${offen.filter(o=>o.erwartetAm && U.daysUntil(o.erwartetAm)>=0 && U.daysUntil(o.erwartetAm)<=7).length}</div>
        <div class="foot">erwartete Lieferungen</div></div>
      <div class="kpi"><div class="label">Geliefert ${new Date().getFullYear()}</div>
        <div class="value">${os.filter(o=>o.geliefertAm && U.yearOf(o.geliefertAm)===new Date().getFullYear()).length}</div></div>
    </div>

    <div class="card table-wrap">
      ${os.length ? `<table>
        <thead><tr><th>Was</th><th>Lieferant</th><th>Projekt</th><th>Bestellt</th>
          <th>Erwartet</th><th class="num">Betrag</th><th></th></tr></thead>
        <tbody>${os.map(o => {
          const tage = o.erwartetAm ? U.daysUntil(o.erwartetAm) : null;
          return `<tr class="clickable" onclick="Cal.editOrder('${o.id}')">
            <td class="t-strong">${U.esc(o.was)}</td>
            <td class="t-sub">${U.esc(o.lieferant||'–')}</td>
            <td class="t-sub">${U.esc(U.cut(Store.projName(o.projectId)||'',22))}</td>
            <td class="t-sub">${o.bestelltAm?U.de(o.bestelltAm):'–'}</td>
            <td>${o.geliefertAm
              ? `<span class="badge green">geliefert ${U.de(o.geliefertAm)}</span>`
              : o.erwartetAm
                ? `<span class="badge ${tage<0?'red':tage<=2?'amber':'grey'}">${tage<0?'überfällig':U.de(o.erwartetAm)}</span>`
                : '<span class="t-sub">offen</span>'}</td>
            <td class="num">${o.betrag?U.eur(o.betrag):'–'}</td>
            <td style="text-align:right" onclick="event.stopPropagation()">
              ${!o.geliefertAm?`<button class="btn btn-sm btn-primary" onclick="Cal.markDelivered('${o.id}')">Da</button>`:''}
            </td>
          </tr>`; }).join('')}</tbody></table>`
      : UI.empty('Noch keine Bestellungen. Trag ein was du wo bestellt hast – dann weißt du, worauf du wartest.',
          `<button class="btn btn-primary" onclick="Cal.editOrder()">+ Erste Bestellung</button>`)}
    </div>`;
  }

  function editOrder(id=null){
    const o = id ? Store.byId('orders', id) : {
      was:'', lieferant:'', betrag:'', bestelltAm:U.today(), erwartetAm:U.addDays(U.today(),5),
      projectId:'', customerId:'', notiz:'', geliefertAm:''
    };
    UI.modal({
      title: id?'Bestellung':'Neue Bestellung',
      body:`
        <div class="field"><label>Was</label>
          <input type="text" id="obWas" value="${U.esc(o.was)}" placeholder="z.B. Banner 300×80 mit Ösen"></div>
        <div class="row row-2">
          <div class="field"><label>Lieferant</label>
            <input type="text" id="obLief" value="${U.esc(o.lieferant)}" placeholder="WIRmachenDRUCK"></div>
          <div class="field"><label>Betrag €</label>
            <input type="number" id="obBetrag" value="${U.esc(o.betrag)}" step="1"></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>Bestellt am</label><input type="date" id="obBestellt" value="${U.esc(o.bestelltAm)}"></div>
          <div class="field"><label>Erwartet am</label><input type="date" id="obErwartet" value="${U.esc(o.erwartetAm)}"></div>
        </div>
        <div class="field"><label>Projekt</label>
          <select id="obProjekt">${UI.projectOptions(o.projectId)}</select>
          <div class="hint">Damit die Kosten beim richtigen Auftrag landen</div></div>
        <div class="field"><label>Notiz</label>
          <input type="text" id="obNotiz" value="${U.esc(o.notiz||'')}" placeholder="Auftragsnummer, Sendungsnummer"></div>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Cal.delOrder('${id}')">Löschen</button>`:''}
            <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Cal.saveOrder('${id||''}')">Speichern</button>`
    });
  }

  function saveOrder(id){
    const v = k => document.getElementById(k).value;
    const patch = {
      was: v('obWas').trim(), lieferant: v('obLief').trim(), betrag: U.parseNum(v('obBetrag')),
      bestelltAm: v('obBestellt'), erwartetAm: v('obErwartet'),
      projectId: v('obProjekt'), notiz: v('obNotiz').trim()
    };
    if (!patch.was){ UI.toast('Was hast du bestellt?','err'); return; }
    const p = Store.byId('projects', patch.projectId);
    if (p) patch.customerId = p.customerId;
    if (id) Store.update('orders', id, patch); else Store.add('orders', patch);
    UI.closeModal(); UI.toast('Bestellung gespeichert','ok'); App.rerender();
  }
  function delOrder(id){
    UI.confirm('Bestellung löschen?', () => { Store.remove('orders', id); UI.closeModal();
      UI.toast('Gelöscht'); App.rerender(); });
  }

  function markDelivered(id){
    const o = Store.byId('orders', id);
    Store.update('orders', id, { geliefertAm: U.today() });
    if (o.betrag){
      UI.confirm(`Geliefert. Soll ich ${U.eur(o.betrag)} gleich als Ausgabe buchen?`, () => {
        Store.add('expenses', {
          datum: U.today(), betrag: U.parseNum(o.betrag), haendler: o.lieferant || 'Lieferant',
          kategorie: 'Material / Druck', projectId: o.projectId, notiz: o.was, beleg: false, foto: null
        });
        UI.toast('Als Ausgabe gebucht – Beleg nicht vergessen','ok'); App.rerender();
      }, { yes:'Ja, buchen', danger:false, title:'Lieferung angekommen' });
    } else { UI.toast('Als geliefert markiert','ok'); App.rerender(); }
  }

  /* ================= ICS-EXPORT ================= */
  const pad = n => String(n).padStart(2,'0');
  function icsDate(datum, zeit, plusMin=0){
    const [y,m,d] = datum.split('-').map(Number);
    const [hh,mm] = (zeit||'09:00').split(':').map(Number);
    const dt = new Date(y, m-1, d, hh, mm + plusMin);
    return `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  }
  const esc = s => String(s||'').replace(/[\\;,]/g, m => '\\'+m).replace(/\n/g,'\\n');

  function icsEvent(t){
    const ganztag = !t.zeit;
    const beschreibung = [t.notiz, t.customerId?('Kunde: '+Store.custName(t.customerId)):''].filter(Boolean).join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:${t.id}@kurani-crm`,
      `SUMMARY:${esc(t.titel)}`,
      ganztag
        ? `DTSTART;VALUE=DATE:${t.datum.replace(/-/g,'')}\r\nDTEND;VALUE=DATE:${U.addDays(t.datum,1).replace(/-/g,'')}`
        : `DTSTART:${icsDate(t.datum, t.zeit)}\r\nDTEND:${icsDate(t.datum, t.zeit, t.dauer||60)}`,
      t.ort ? `LOCATION:${esc(t.ort)}` : '',
      beschreibung ? `DESCRIPTION:${esc(beschreibung)}` : '',
      'END:VEVENT'
    ].filter(Boolean).join('\r\n');
  }

  function icsFile(events){
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kurani Design//CRM//DE','CALSCALE:GREGORIAN',
            ...events, 'END:VCALENDAR'].join('\r\n');
  }

  function exportIcs(){
    const termine = Store.all('appointments');
    const lieferungen = Store.all('orders').filter(o => o.erwartetAm && !o.geliefertAm)
      .map(o => ({ id:'ord_'+o.id, datum:o.erwartetAm, zeit:'', titel:'Lieferung: '+o.was,
                   ort:o.lieferant, notiz:o.notiz, customerId:o.customerId, dauer:0 }));
    const deadlines = Store.all('projects').filter(p => p.deadline && !['bezahlt','verloren'].includes(p.status))
      .map(p => ({ id:'prj_'+p.id, datum:p.deadline, zeit:'', titel:'Abgabe: '+p.titel,
                   notiz:p.notizen, customerId:p.customerId, dauer:0 }));
    const all = [...termine, ...lieferungen, ...deadlines];
    if (!all.length){ UI.toast('Nichts zu exportieren','err'); return; }
    U.download(`Kurani_Termine_${U.today()}.ics`, icsFile(all.map(icsEvent)), 'text/calendar');
    UI.toast(all.length + ' Termine exportiert – Datei öffnen, dann fragt dein Kalender','ok');
  }

  function icsOne(id){
    const t = Store.byId('appointments', id);
    U.download(`${U.slug(t.titel)||'termin'}.ics`, icsFile([icsEvent(t)]), 'text/calendar');
    UI.toast('Termin-Datei erstellt – öffnen und in den Kalender legen','ok');
  }

  /* ---------- Für die Aufgabenliste ---------- */
  function heuteUndMorgen(){
    const t1 = U.today(), t2 = U.addDays(t1,1);
    return U.sortBy(Store.all('appointments').filter(t => t.datum === t1 || t.datum === t2),
                    t => t.datum + (t.zeit||''));
  }
  function faelligeLieferungen(){
    return Store.all('orders').filter(o => !o.geliefertAm && o.erwartetAm && U.daysUntil(o.erwartetAm) <= 0);
  }

  return { render, setTab, shift, heute, edit, save, del, fillOrt,
           editOrder, saveOrder, delOrder, markDelivered,
           exportIcs, icsOne, heuteUndMorgen, faelligeLieferungen, ARTEN, artLabel };
})();
