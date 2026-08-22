/* ==========================================================
   Kurani CRM – Wachstum
   Schlafende Kunden, Upsell, Ideen, Potenzial
   ========================================================== */
const Growth = (() => {

  /* ---------- Was der Kunde noch nicht hat ---------- */
  const LEITER = [
    { typ:'Logo / Branding',      angebot:'Logo schärfen oder neu machen',            preis:550 },
    { typ:'Speisekarte',          angebot:'Speisekarte neu gestalten (inkl. Allergene)', preis:450 },
    { typ:'Folie / Beschriftung', angebot:'Schaufenster- oder Fahrzeugbeschriftung',  preis:0   },
    { typ:'Schild / LED',         angebot:'Außenwerbung / LED-Schild',                preis:350 },
    { typ:'Video / Content',      angebot:'TV-Loop für den Bildschirm im Laden',      preis:150 },
    { typ:'Social Media',         angebot:'Content-Abo – jeden Monat Posts und Reels',preis:249 },
    { typ:'Website',              angebot:'Kiek mol in: eigene Seite mit Bestellung', preis:0   },
    { typ:'Großformat / Banner',  angebot:'Banner oder Plane für Aktionen',           preis:0   }
  ];

  function boughtTypes(customerId){
    const set = new Set();
    Store.all('projects').filter(p => p.customerId === customerId && p.typ).forEach(p => set.add(p.typ));
    Store.all('documents').filter(d => d.customerId === customerId).forEach(d => {
      const p = Store.byId('projects', d.projectId); if (p?.typ) set.add(p.typ);
      (d.positionen||[]).forEach(pos => {
        const k = Store.CATALOG.find(c => pos.beschreibung && c.t.toLowerCase().includes(String(pos.beschreibung).toLowerCase().slice(0,12)));
        if (k) set.add(k.typ);
      });
    });
    return set;
  }

  function upsellIdeas(c){
    const hat = boughtTypes(c.id);
    const offen = LEITER.filter(l => !hat.has(l.typ));
    if (!offen.length) return ['Der Kunde hat schon fast alles – frag nach einer Empfehlung an einen Nachbarbetrieb.'];
    return offen.slice(0,3).map(l => l.angebot + (l.preis ? ` (ca. ${U.eur0(l.preis)})` : ''));
  }

  function upsellValue(c){
    const hat = boughtTypes(c.id);
    return U.sum(LEITER.filter(l => !hat.has(l.typ) && l.preis), l => l.preis);
  }

  /* ---------- Texte ---------- */
  function reactivationText(c){
    const s = Store.settings();
    const name = c.ansprechpartner ? ' ' + c.ansprechpartner.split(' ')[0] : '';
    const idee = upsellIdeas(c)[0] || '';
    return `Moin${name}! Hier ist Ibo von Kurani Design. Lange nichts voneinander gehört – läuft alles gut bei euch? `
         + `Ich hab gerade Kapazität frei und dachte an euch: ${idee.replace(/ \(ca\..*\)/,'')}. `
         + `Wenn's passt, meld dich einfach kurz.`;
  }

  function offerText(c, idee){
    const name = c.ansprechpartner ? ' ' + c.ansprechpartner.split(' ')[0] : '';
    return `Moin${name}! Kurze Idee für euch: ${idee}. `
         + `Ich mach dir gern einen unverbindlichen Kostenvoranschlag – sag einfach Bescheid. Grüße, Ibo`;
  }

  /* ================= ANSICHT ================= */
  function render(){
    const s = Store.settings();
    const jahr = new Date().getFullYear();
    const schlafend = U.sortBy(
      Store.all('customers').filter(c => Customers.isSleeping(c) && c.aktiv !== false)
        .map(c => ({ c, letzte: Store.lastActivity(c.id), umsatz: Store.customerRevenue(c.id) })),
      x => x.umsatz, 'desc');

    const potenzial = U.sortBy(
      Store.all('customers').map(c => ({ c, wert: upsellValue(c), ideen: upsellIdeas(c) }))
        .filter(x => x.wert > 0), x => x.wert, 'desc').slice(0,10);

    const aboKandidaten = Store.all('customers').filter(c =>
      !Store.all('recurring').some(r => r.customerId === c.id && r.aktiv) &&
      Store.customerRevenue(c.id) > 0);

    const ideen = Store.all('ideas');
    const ein = Finance.einnahmen(jahr);

    return `
    <div class="page-head">
      <div><h1>Wachstum</h1>
        <div class="sub">Wo noch Geld liegt, das du noch nicht eingesammelt hast</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="Growth.editIdea()">+ Idee</button></div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi"><div class="label">Umsatz ${jahr}</div><div class="value">${U.eur0(ein)}</div>
        <div class="foot">Ziel ${U.eur0(s.umsatzzielJahr)}</div></div>
      <div class="kpi accent-amber"><div class="label">Schlafende Kunden</div><div class="value">${schlafend.length}</div>
        <div class="foot">seit über ${s.reaktivierungTage} Tagen still</div></div>
      <div class="kpi accent-green"><div class="label">Upsell-Potenzial</div><div class="value">${U.eur0(U.sum(potenzial, x=>x.wert))}</div>
        <div class="foot">bei bestehenden Kunden</div></div>
      <div class="kpi"><div class="label">Planbar pro Monat</div>
        <div class="value">${U.eur0(U.sum(Store.all('recurring').filter(r=>r.aktiv), r => U.parseNum(r.betrag)/Documents.intervalMonths(r.intervall)))}</div>
        <div class="foot">${aboKandidaten.length} Kunden ohne Abo</div></div>
    </div>

    <div class="grid grid-2" style="margin-bottom:16px">

      <div class="card">
        <div class="card-head"><h3>Kunden zurückholen</h3>
          <div class="actions t-sub">${schlafend.length} still</div></div>
        ${schlafend.length ? schlafend.slice(0,8).map(x => `<div class="task">
          <div class="task-icon amber">${U.initials(x.c.firma)}</div>
          <div class="task-body">
            <div class="task-title">${U.esc(x.c.firma)}</div>
            <div class="task-sub">
              ${x.letzte ? 'zuletzt '+U.relative(x.letzte) : 'noch nie was gelaufen'}
              ${x.umsatz ? ' · bisher '+U.eur0(x.umsatz) : ''}</div>
            <div class="task-sub" style="margin-top:4px;color:var(--ink-soft)">${U.esc(upsellIdeas(x.c)[0]||'')}</div>
          </div>
          <div class="task-act">
            ${x.c.telefon ? `<a class="btn btn-sm btn-primary" target="_blank"
              href="${U.waLink(x.c.telefon, reactivationText(x.c))}">WhatsApp</a>` :
              `<button class="btn btn-sm" onclick="UI.copyText(Growth.reactivationText(Store.byId('customers','${x.c.id}')))">Text</button>`}
            <button class="btn btn-sm" onclick="location.hash='#/kunde/${x.c.id}'">Öffnen</button>
          </div>
        </div>`).join('') : UI.empty('Kein Kunde schläft – stark.')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Wem du was verkaufen kannst</h3></div>
        ${potenzial.length ? potenzial.slice(0,8).map(x => `<div class="task">
          <div class="task-icon green">${U.initials(x.c.firma)}</div>
          <div class="task-body">
            <div class="task-title">${U.esc(x.c.firma)} <span class="t-sub">· ${U.eur0(x.wert)} möglich</span></div>
            <div class="task-sub" style="line-height:1.6">${x.ideen.map(U.esc).join(' · ')}</div>
          </div>
          <div class="task-act">
            ${x.c.telefon ? `<a class="btn btn-sm" target="_blank"
              href="${U.waLink(x.c.telefon, offerText(x.c, x.ideen[0]))}">Anbieten</a>` : ''}
            <button class="btn btn-sm" onclick="Documents.newDoc('kv','${x.c.id}')">KV</button>
          </div>
        </div>`).join('') : UI.empty('Keine offenen Möglichkeiten gefunden.')}
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px">
      <h3 style="font-size:16px;margin-bottom:10px">Wenn du das durchziehst</h3>
      <div style="font-size:13.5px;line-height:1.75;color:var(--ink-soft)">
        Du hast <b>${Store.all('customers').length} Kunden</b> in der Kartei.
        Würde nur jeder Fünfte ein Content-Abo für 249 € nehmen, wären das
        <b>${U.eur0(Math.floor(Store.all('customers').length/5)*249)} pro Monat</b> –
        ${U.eur0(Math.floor(Store.all('customers').length/5)*249*12)} im Jahr, ohne einen einzigen Neukunden.<br><br>
        Die schnellste Runde: die ${Math.min(5,schlafend.length)} schlafenden Kunden oben anschreiben.
        Erfahrungsgemäß meldet sich jeder Dritte – das reicht meist schon für den Monat.
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Ideen &amp; Vorhaben</h3>
        <div class="actions"><button class="btn btn-sm" onclick="Growth.editIdea()">+ Idee</button></div></div>
      ${ideen.length ? U.sortBy(ideen, i => i.status==='dran'?0:i.status==='idee'?1:2).map(i => `<div class="task">
        <div class="task-icon ${i.status==='dran'?'blue':i.status==='erledigt'?'green':'grey'}">
          ${i.status==='erledigt'
            ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>'}
        </div>
        <div class="task-body">
          <div class="task-title" style="${i.status==='erledigt'?'text-decoration:line-through;opacity:.6':''}">${U.esc(i.text)}</div>
          <div class="task-sub">${U.esc(i.kategorie||'')}${i.wirkung?' · Wirkung: '+U.esc(i.wirkung):''}</div>
        </div>
        <div class="task-act">
          ${i.status!=='erledigt'?`<button class="btn btn-sm" onclick="Growth.setIdeaStatus('${i.id}','${i.status==='dran'?'idee':'dran'}')">
            ${i.status==='dran'?'Zurücklegen':'Dranbleiben'}</button>
          <button class="btn btn-sm" onclick="Growth.setIdeaStatus('${i.id}','erledigt')">Erledigt</button>`:''}
          <button class="btn btn-sm" onclick="Growth.editIdea('${i.id}')">…</button>
        </div>
      </div>`).join('') : UI.empty('Noch keine Ideen notiert. Alles was dir zwischendurch einfällt – hier rein.',
        `<button class="btn btn-primary" onclick="Growth.editIdea()">+ Erste Idee</button>`)}
    </div>`;
  }

  /* ---------- Ideen ---------- */
  function editIdea(id=null){
    const i = id ? Store.byId('ideas', id) : { text:'', kategorie:'Angebot', wirkung:'mittel', status:'idee', notiz:'' };
    UI.modal({
      title: id?'Idee':'Neue Idee',
      body:`
        <div class="field"><label>Idee</label>
          <input type="text" id="gText" value="${U.esc(i.text)}" placeholder="z.B. Allen Restaurants im Ort ein TV-Loop-Paket anbieten"></div>
        <div class="row row-2">
          <div class="field"><label>Kategorie</label>
            <select id="gKat">${['Angebot','Neukunden','Preis','Prozess','Marketing','Tool','Sonstiges']
              .map(k=>`<option ${k===i.kategorie?'selected':''}>${k}</option>`).join('')}</select></div>
          <div class="field"><label>Wirkung</label>
            <select id="gWirkung">${['klein','mittel','groß'].map(k=>`<option ${k===i.wirkung?'selected':''}>${k}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Notiz</label>
          <textarea id="gNotiz" rows="3">${U.esc(i.notiz||'')}</textarea></div>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Store.remove('ideas','${id}');UI.closeModal();App.rerender()">Löschen</button>`:''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Growth.saveIdea('${id||''}')">Speichern</button>`
    });
  }
  function saveIdea(id){
    const patch = {
      text: document.getElementById('gText').value.trim(),
      kategorie: document.getElementById('gKat').value,
      wirkung: document.getElementById('gWirkung').value,
      notiz: document.getElementById('gNotiz').value.trim()
    };
    if (!patch.text){ UI.toast('Text fehlt','err'); return; }
    if (id) Store.update('ideas', id, patch); else Store.add('ideas', {...patch, status:'idee'});
    UI.closeModal(); UI.toast('Gespeichert','ok'); App.rerender();
  }
  function setIdeaStatus(id, status){ Store.update('ideas', id, {status}); App.rerender(); }

  return { render, upsellIdeas, upsellValue, reactivationText, offerText, boughtTypes,
           editIdea, saveIdea, setIdeaStatus, LEITER };
})();
