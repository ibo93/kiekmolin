/* ==========================================================
   Kurani CRM – Saison & Kampagnen
   Der Restaurant-Jahreszyklus in Ostfriesland + Sammelaktionen
   ========================================================== */
const Campaigns = (() => {

  /* ---------- Saison-Kalender ----------
     ab/bis = Zeitfenster, in dem du ansprechen solltest (nicht wann geliefert wird).
     In der Hochsaison bewusst nichts – da haben deine Kunden keine Minute. */
  const SAISON = [
    { key:'jahresstart', ab:'01-08', bis:'02-10', titel:'Ruhige Zeit nutzen',
      was:'Logo, Website, Kiek-mol-in-Einrichtung, alles was im Sommer keiner anfassen will',
      ziel:'alle',
      text:'Moin {vorname}! Jetzt ist die ruhige Zeit – gute Gelegenheit für die Sachen, die im Sommer immer liegen bleiben. Logo auffrischen, Website, oder mal in Ruhe die Karte überarbeiten. Soll ich dir was zusammenstellen?' },

    { key:'saisonstart', ab:'02-10', bis:'03-25', titel:'Saisonkarte & Saisonstart',
      was:'Speisekarte für die neue Saison, Aufsteller, Außenwerbung – Druck muss vor Ostern durch',
      ziel:'gastro',
      text:'Moin {vorname}! Die Saison steht vor der Tür. Wenn die Karte noch überarbeitet werden soll, wäre jetzt der richtige Moment – dann ist alles rechtzeitig vor Ostern gedruckt. Sag einfach kurz Bescheid, was sich geändert hat.' },

    { key:'terrasse', ab:'03-25', bis:'05-15', titel:'Terrassensaison',
      was:'Fensterfolie, Banner, Aufsteller, Fahnen, Speisekarten fürs Außenschild',
      ziel:'gastro',
      text:'Moin {vorname}! Bald sitzen die Leute wieder draußen. Wenn ihr für die Terrasse noch was braucht – Aufsteller, Fahne, Fensterbeschriftung – kann ich das jetzt gut einschieben. Später wird es eng.' },

    { key:'hochsaison', ab:'06-01', bis:'08-25', titel:'Hochsaison – Füße still halten',
      was:'Jetzt keine Akquise. Nur schnelle Sachen: Aushänge, Aktionsschilder, Social Media',
      ziel:'keine',
      text:'' },

    { key:'nachsaison', ab:'09-01', bis:'09-30', titel:'Nachsaison – Bilanz und Content',
      was:'Fotos und Videos vom Sommer verwerten, Content-Abo anbieten, Karte fürs Winterhalbjahr',
      ziel:'gastro',
      text:'Moin {vorname}! Saison geschafft. Habt ihr Material vom Sommer, das wir für Instagram verwerten können? Ich mach daraus gern was Vernünftiges für die ruhigere Zeit – dann bleibt ihr sichtbar, auch wenn weniger los ist.' },

    { key:'weihnachten', ab:'10-01', bis:'11-10', titel:'Weihnachtskarte & Gutscheine',
      was:'Weihnachtsmenü, Silvesterkarte, Gutscheine – Druck muss Mitte November durch',
      ziel:'gastro',
      text:'Moin {vorname}! Kurz vor Weihnachten wird es bei mir immer eng, deshalb frag ich jetzt: braucht ihr Weihnachtskarte, Silvestermenü oder Gutscheine? Gutscheine laufen im Dezember extrem gut – das ist Geld, das ihr sofort in der Kasse habt.' },

    { key:'jahresende', ab:'11-25', bis:'12-20', titel:'Feiertage & Jahresabschluss',
      was:'Öffnungszeiten über die Feiertage, Danke-Post, Neujahrsaktion',
      ziel:'alle',
      text:'Moin {vorname}! Denkt an die Aushänge für die Feiertage – Öffnungszeiten, Ruhetage. Wenn ihr was braucht, mach ich das schnell zwischendurch.' }
  ];

  /* ---------- Was ist gerade dran? ---------- */
  function aktuell(datum){
    const d = datum || U.today();
    const md = d.slice(5);
    return SAISON.filter(s => md >= s.ab && md <= s.bis);
  }
  function naechste(datum){
    const md = (datum || U.today()).slice(5);
    return SAISON.filter(s => s.ab > md).sort((a,b)=>a.ab.localeCompare(b.ab))[0] ||
           SAISON.sort((a,b)=>a.ab.localeCompare(b.ab))[0];
  }

  /* ---------- Zielgruppen ---------- */
  const GRUPPEN = {
    alle:      { label:'Alle Kunden',            f: () => Store.all('customers') },
    gastro:    { label:'Gastro-Kunden',          f: () => Store.all('customers').filter(istGastro) },
    stamm:     { label:'Nur Stammkunden',        f: () => Store.all('customers').filter(c => c.stammkunde) },
    schlafend: { label:'Schlafende Kunden',      f: () => Store.all('customers').filter(c => Customers.isSleeping(c)) },
    ohneAbo:   { label:'Kunden ohne Abo',        f: () => Store.all('customers').filter(c =>
                   !Store.all('recurring').some(r => r.customerId === c.id && r.aktiv)) },
    mitUmsatz: { label:'Kunden mit Umsatz',      f: () => Store.all('customers').filter(c => Store.customerRevenue(c.id) > 0) },
    keine:     { label:'–',                      f: () => [] }
  };

  /* Woran man einen Gastro-Betrieb am Namen erkennt. Bewusst nur Gattungs-
     begriffe – konkrete Kundennamen gehoeren nicht in den Quelltext.
     Eigene Ergaenzungen kannst du in js/stammdaten.js als
     FIRMENDATEN.gastroWorte = ['...'] nachreichen. */
  const GASTRO_STANDARD = ['pizz','restaurant','café','cafe','eis','kebab','bistro','imbiss',
                           'hafen','haven','börse','boerse','fisch','markt','trattoria','osteria',
                           'ristorante','taverne','grill','döner','doener','sushi','burger','steak'];
  const GASTRO_WORTE = GASTRO_STANDARD.concat(
    (typeof FIRMENDATEN !== 'undefined' && FIRMENDATEN.gastroWorte) || []);
  function istGastro(c){
    const s = (c.firma + ' ' + (c.kuerzel||'') + ' ' + (c.notizen||'')).toLowerCase();
    return GASTRO_WORTE.some(w => s.includes(w));
  }

  /* ---------- Jahrestage ---------- */
  function jahrestage(){
    const heute = U.today();
    return Store.all('projects')
      .filter(p => ['bezahlt','berechnet'].includes(p.status) && p.typ)
      .map(p => {
        const doc = Store.all('documents').filter(d => d.projectId === p.id && Store.isInvoice(d))
                      .sort((a,b)=>(b.datum||'').localeCompare(a.datum||''))[0];
        const datum = doc?.bezahltAm || doc?.datum || p.updatedAt || p.createdAt;
        if (!datum) return null;
        const tage = U.daysAgo(datum);
        if (tage < 330 || tage > 420) return null;      // Fenster um den ersten Jahrestag
        // schon wieder was Neues gelaufen? dann kein Anlass (das Projekt selbst zählt nicht)
        const neuer = Store.all('projects').some(x => x.id !== p.id && x.customerId === p.customerId &&
                        x.typ === p.typ && (x.createdAt||'') > datum);
        if (neuer) return null;
        return { p, datum, tage, kunde: Store.byId('customers', p.customerId) };
      }).filter(x => x && x.kunde);
  }

  const JAHRESTAG_TEXT = {
    'Speisekarte':'Moin {vorname}! Vor gut einem Jahr haben wir eure Karte gemacht. Hat sich seitdem was geändert – Preise, neue Gerichte? Eine Auffrischung ist deutlich günstiger als komplett neu.',
    'Logo / Branding':'Moin {vorname}! Unser Logo für euch ist jetzt ein Jahr im Einsatz. Falls ihr Sachen braucht, die es dafür noch nicht gibt – Schilder, Aufkleber, Social-Media-Vorlagen – sag Bescheid.',
    'Folie / Beschriftung':'Moin {vorname}! Die Beschriftung ist jetzt ein Jahr drauf. Schaut sie noch gut aus? Sonne und Salzluft nagen hier oben ordentlich – ich schau gern mal drüber.',
    'Großformat / Banner':'Moin {vorname}! Das Banner von letztem Jahr – noch in Ordnung oder soll was Neues her? Bei Aktionen wirkt ein frisches Motiv immer besser als das vom Vorjahr.',
    'Video / Content':'Moin {vorname}! Der Content von letztem Jahr läuft aus. Sollen wir für die neue Saison was Frisches drehen?'
  };
  const jahrestagText = typ => JAHRESTAG_TEXT[typ] ||
    'Moin {vorname}! Vor einem Jahr haben wir für euch gearbeitet. Steht bei euch wieder was an? Meld dich einfach.';

  /* ---------- Text personalisieren ---------- */
  function fill(text, c){
    const vorname = (c.ansprechpartner || '').trim().split(/\s+/)[0] || '';
    return String(text||'')
      .replace(/\{vorname\}/g, vorname)
      .replace(/\{name\}/g, c.ansprechpartner || c.firma)
      .replace(/\{firma\}/g, c.firma)
      .replace(/  +/g,' ')
      .replace(/Moin !/,'Moin!');
  }

  /* ================= ANSICHT ================= */
  function render(){
    const jetzt = aktuell();
    const next = naechste();
    const jt = jahrestage();
    const camps = U.sortBy(Store.all('campaigns'), c => c.createdAt, 'desc');

    return `
    <div class="page-head">
      <div><h1>Kampagnen</h1>
        <div class="sub">Der Jahreszyklus deiner Kunden – und Aktionen, die du in einem Rutsch abarbeitest</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="Campaigns.edit()">+ Neue Aktion</button></div>
    </div>

    ${jetzt.map(s => s.ziel === 'keine' ? `
      <div class="card card-pad" style="margin-bottom:16px;background:var(--grey-bg);border:none">
        <div style="font-family:'Playfair Display',serif;font-size:19px;font-weight:700;margin-bottom:5px">${U.esc(s.titel)}</div>
        <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft)">
          ${U.esc(s.was)}.<br>
          Deine Kunden stehen gerade im Laden und haben keine Sekunde. Jetzt anrufen nervt nur –
          und verbrennt einen Kontakt, den du im September gut gebrauchen kannst.
        </div>
      </div>` : `
      <div class="card card-pad" style="margin-bottom:16px;background:var(--amber-bg);border:none">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <div style="font-family:'Playfair Display',serif;font-size:19px;font-weight:700">${U.esc(s.titel)}</div>
          <span class="badge dark">jetzt dran</span>
        </div>
        <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft);margin-bottom:12px">
          ${U.esc(s.was)}.<br>Passende Kunden: <b>${GRUPPEN[s.ziel].f().length}</b> (${GRUPPEN[s.ziel].label})
        </div>
        <button class="btn btn-sm btn-primary" onclick="Campaigns.fromSeason('${s.key}')">Aktion daraus machen</button>
      </div>`).join('')}

    ${!jetzt.length ? `<div class="card card-pad" style="margin-bottom:16px">
      <div class="t-strong" style="margin-bottom:4px">Gerade kein Saison-Thema</div>
      <div class="t-sub" style="line-height:1.6">Als Nächstes: <b>${U.esc(next.titel)}</b> ab ${next.ab.split('-').reverse().join('.')}.
        ${U.esc(next.was)}.</div>
    </div>`:''}

    <div class="grid grid-2" style="margin-bottom:16px">
      <div class="card">
        <div class="card-head"><h3>Jahrestage</h3>
          <div class="actions t-sub">${jt.length} Anlässe</div></div>
        ${jt.length ? jt.slice(0,8).map(x => `<div class="task">
          <div class="task-icon blue">${U.initials(x.kunde.firma)}</div>
          <div class="task-body">
            <div class="task-title">${U.esc(x.kunde.firma)}</div>
            <div class="task-sub">${U.esc(x.p.typ)} · vor ${Math.round(x.tage/30)} Monaten (${U.de(x.datum)})</div>
          </div>
          <div class="task-act">
            ${x.kunde.telefon ? `<a class="btn btn-sm btn-primary" target="_blank"
              href="${U.waLink(x.kunde.telefon, fill(jahrestagText(x.p.typ), x.kunde))}">WhatsApp</a>`
              : `<button class="btn btn-sm" onclick="UI.copyText(Campaigns.jahrestagFuer('${x.p.id}'))">Text</button>`}
            <button class="btn btn-sm" onclick="location.hash='#/kunde/${x.kunde.id}'">Kunde</button>
          </div>
        </div>`).join('') : UI.empty('Aktuell keine Jahrestage. Kommt automatisch, sobald Aufträge ein Jahr alt sind.')}
      </div>

      <div class="card card-pad">
        <h3 style="font-size:16px;margin-bottom:12px">Dein Jahr</h3>
        <div style="display:flex;flex-direction:column;gap:9px">
          ${SAISON.map(s => {
            const ist = jetzt.some(x => x.key === s.key);
            return `<div style="display:flex;gap:11px;align-items:flex-start;padding:8px 10px;border-radius:9px;
              background:${ist?'var(--akzent)':'transparent'};color:${ist?'var(--akzent-kontrast)':'inherit'}">
              <div style="font-size:11.5px;min-width:74px;opacity:.7;padding-top:1px">
                ${s.ab.split('-').reverse().join('.')}–${s.bis.split('-').reverse().join('.')}</div>
              <div style="flex:1">
                <div style="font-size:13.5px;font-weight:600">${U.esc(s.titel)}</div>
                <div style="font-size:12px;opacity:.7;line-height:1.5;margin-top:2px">${U.esc(s.was)}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Aktionen</h3>
        <div class="actions"><button class="btn btn-sm" onclick="Campaigns.edit()">+ Neue Aktion</button></div></div>
      ${camps.length ? camps.map(campRow).join('')
        : UI.empty('Noch keine Aktion. Eine Aktion heißt: einmal Text schreiben, dann eine Liste abarbeiten.',
          `<button class="btn btn-primary" onclick="Campaigns.edit()">+ Erste Aktion</button>`)}
    </div>`;
  }

  function campRow(c){
    const ziele = c.ziele || [];
    const fertig = ziele.filter(z => z.status && z.status !== 'offen').length;
    const auftrag = ziele.filter(z => z.status === 'auftrag').length;
    const pct = ziele.length ? Math.round(fertig/ziele.length*100) : 0;
    return `<div class="task">
      <div class="task-icon ${pct===100?'green':'blue'}" style="font-weight:700">${pct}%</div>
      <div class="task-body">
        <div class="task-title">${U.esc(c.titel)}</div>
        <div class="task-sub">${fertig} von ${ziele.length} angeschrieben${auftrag?` · <b style="color:var(--green)">${auftrag} Auftrag</b>`:''} · ${U.relative(c.createdAt)}</div>
      </div>
      <div class="task-act">
        <button class="btn btn-sm btn-primary" onclick="Campaigns.work('${c.id}')">Abarbeiten</button>
        <button class="btn btn-sm" onclick="Campaigns.edit('${c.id}')">…</button>
      </div>
    </div>`;
  }

  const jahrestagFuer = pid => {
    const p = Store.byId('projects', pid);
    return fill(jahrestagText(p.typ), Store.byId('customers', p.customerId) || {});
  };

  /* ---------- Aus Saison-Vorschlag ---------- */
  function fromSeason(key){
    const s = SAISON.find(x => x.key === key);
    edit(null, { titel: s.titel + ' ' + new Date().getFullYear(), text: s.text, gruppe: s.ziel });
  }

  /* ---------- Anlegen / Bearbeiten ---------- */
  function edit(id=null, preset={}){
    const c = id ? Store.byId('campaigns', id) : {
      titel: preset.titel || '', text: preset.text || '', gruppe: preset.gruppe || 'gastro', ziele: []
    };
    const gruppe = c.gruppe || 'gastro';
    UI.modal({
      title: id ? 'Aktion bearbeiten' : 'Neue Aktion',
      wide: true,
      body: `
        <div class="field"><label>Worum geht's</label>
          <input type="text" id="caTitel" value="${U.esc(c.titel)}" placeholder="z.B. Weihnachtskarten 2026"></div>

        ${id ? '' : `<div class="field"><label>An wen</label>
          <select id="caGruppe" onchange="Campaigns.previewTargets()">
            ${Object.entries(GRUPPEN).filter(([k])=>k!=='keine').map(([k,g]) =>
              `<option value="${k}" ${k===gruppe?'selected':''}>${g.label} (${g.f().length})</option>`).join('')}
          </select>
          <div class="hint" id="caCount"></div></div>`}

        <div class="field"><label>Nachricht</label>
          <textarea id="caText" rows="6" placeholder="Moin {vorname}! …">${U.esc(c.text)}</textarea>
          <div class="hint">Platzhalter: <code>{vorname}</code> <code>{name}</code> <code>{firma}</code> –
            wird pro Kunde eingesetzt. Ohne Ansprechpartner wird daraus einfach „Moin!"</div></div>

        <div class="card card-pad" style="background:var(--card-weich);border:none">
          <div class="t-sub" style="margin-bottom:6px">So sieht es beim ersten Kunden aus:</div>
          <div id="caPreview" style="font-size:13.5px;line-height:1.6">${U.esc(fill(c.text, GRUPPEN[gruppe].f()[0] || {firma:'Kunde'}))}</div>
        </div>`,
      foot: `${id?`<button class="btn btn-danger left" onclick="Store.remove('campaigns','${id}');UI.closeModal();App.rerender()">Löschen</button>`:''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Campaigns.save('${id||''}')">${id?'Speichern':'Anlegen und abarbeiten'}</button>`
    });
    setTimeout(previewTargets, 60);
    const ta = document.getElementById('caText');
    if (ta) ta.addEventListener('input', previewTargets);
  }

  function previewTargets(){
    const sel = document.getElementById('caGruppe');
    const g = sel ? sel.value : 'gastro';
    const list = GRUPPEN[g].f();
    const cnt = document.getElementById('caCount');
    if (cnt){
      const ohneTel = list.filter(c => !c.telefon).length;
      cnt.innerHTML = `${list.length} Kunden${ohneTel?` · ${ohneTel} ohne Telefonnummer (die musst du anders erreichen)`:''}`;
    }
    const pv = document.getElementById('caPreview');
    const ta = document.getElementById('caText');
    if (pv && ta) pv.textContent = fill(ta.value, list[0] || {firma:'Kunde'});
  }

  function save(id){
    const titel = document.getElementById('caTitel').value.trim();
    const text  = document.getElementById('caText').value.trim();
    if (!titel){ UI.toast('Titel fehlt','err'); return; }
    if (!text){ UI.toast('Nachricht fehlt','err'); return; }
    if (id){
      Store.update('campaigns', id, { titel, text });
      UI.closeModal(); UI.toast('Gespeichert','ok'); App.rerender();
    } else {
      const g = document.getElementById('caGruppe').value;
      const ziele = GRUPPEN[g].f().map(c => ({ customerId: c.id, status:'offen' }));
      if (!ziele.length){ UI.toast('Diese Gruppe ist leer','err'); return; }
      const n = Store.add('campaigns', { titel, text, gruppe:g, ziele });
      UI.closeModal(); work(n.id);
    }
  }

  /* ---------- Abarbeiten ---------- */
  const STATUS = [
    ['offen','Offen','grey'], ['geschrieben','Geschrieben','blue'],
    ['interesse','Interesse','amber'], ['auftrag','Auftrag','green'], ['nein','Kein Bedarf','grey']
  ];

  function work(id){
    const c = Store.byId('campaigns', id);
    if (!c) return;
    const rows = c.ziele.map(z => ({ z, k: Store.byId('customers', z.customerId) })).filter(x => x.k);
    const fertig = c.ziele.filter(z => z.status !== 'offen').length;

    UI.modal({
      title: c.titel,
      wide: true,
      body: `
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
          <div class="progress" style="flex:1;min-width:180px;margin:0">
            <span style="width:${c.ziele.length?fertig/c.ziele.length*100:0}%"></span></div>
          <div class="t-sub">${fertig} / ${c.ziele.length}</div>
          ${STATUS.slice(1).map(([k,l,col]) => {
            const n = c.ziele.filter(z=>z.status===k).length;
            return n ? `<span class="badge ${col}">${n} ${l}</span>` : '';
          }).join('')}
        </div>

        <div class="table-wrap" style="max-height:52vh;overflow-y:auto">
          <table><tbody>
            ${rows.map((x,i) => `<tr>
              <td style="width:34%">
                <div class="t-strong">${U.esc(x.k.firma)}</div>
                <div class="t-sub">${U.esc(x.k.ansprechpartner || x.k.ort || '')}</div>
              </td>
              <td>
                ${x.k.telefon
                  ? `<a class="btn btn-sm ${x.z.status==='offen'?'btn-primary':''}" target="_blank"
                       href="${U.waLink(x.k.telefon, fill(c.text, x.k))}"
                       onclick="Campaigns.setStatus('${id}','${x.k.id}','geschrieben')">WhatsApp</a>`
                  : `<button class="btn btn-sm" onclick="UI.copyText(Campaigns.textFor('${id}','${x.k.id}'));Campaigns.setStatus('${id}','${x.k.id}','geschrieben')">Text kopieren</button>`}
                ${x.k.email ? `<a class="btn btn-sm" href="${U.mailto(x.k.email, c.titel, fill(c.text, x.k))}"
                     onclick="Campaigns.setStatus('${id}','${x.k.id}','geschrieben')">Mail</a>`:''}
              </td>
              <td style="width:32%;text-align:right">
                <select onchange="Campaigns.setStatus('${id}','${x.k.id}',this.value,true)" style="width:auto">
                  ${STATUS.map(([k,l]) => `<option value="${k}" ${x.z.status===k?'selected':''}>${l}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('')}
          </tbody></table>
        </div>`,
      foot: `<button class="btn left" onclick="Campaigns.edit('${id}')">Text ändern</button>
             <button class="btn" onclick="UI.closeModal()">Schließen</button>`
    });
  }

  function textFor(campId, custId){
    const c = Store.byId('campaigns', campId);
    return fill(c.text, Store.byId('customers', custId) || {});
  }

  function setStatus(campId, custId, status, reopen=false){
    const c = Store.byId('campaigns', campId);
    const z = c.ziele.find(x => x.customerId === custId);
    if (!z) return;
    // einmal geschrieben nicht wieder auf "geschrieben" zurückfallen lassen
    if (status === 'geschrieben' && ['interesse','auftrag','nein'].includes(z.status)) return;
    z.status = status;
    z.datum = U.today();
    Store.update('campaigns', campId, c);
    if (status === 'auftrag'){
      const k = Store.byId('customers', custId);
      UI.toast(`${k.firma}: Auftrag! Gleich ein Projekt anlegen?`);
    }
    if (reopen) work(campId);
  }

  /* ---------- Für die Aufgabenliste ---------- */
  function offeneAktionen(){
    return Store.all('campaigns').map(c => {
      const offen = c.ziele.filter(z => z.status === 'offen').length;
      return offen ? { c, offen } : null;
    }).filter(Boolean);
  }

  return { render, aktuell, naechste, jahrestage, jahrestagFuer, fromSeason, edit, save,
           previewTargets, work, setStatus, textFor, offeneAktionen, fill, GRUPPEN, SAISON, istGastro };
})();
