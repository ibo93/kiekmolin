/* ==========================================================
   Kurani CRM – Kunden
   ========================================================== */
const Customers = (() => {

  let filter = { q:'', typ:'alle' };

  /* ---------- Liste ---------- */
  function render(){
    const cs = list();
    const jahr = new Date().getFullYear();
    return `
    <div class="page-head">
      <div>
        <h1>Kunden</h1>
        <div class="sub">${Store.all('customers').length} Kunden · ${Store.all('customers').filter(c=>c.stammkunde).length} Stammkunden</div>
      </div>
      <div class="actions">
        <button class="btn" onclick="Customers.exportCsv()">CSV</button>
        <button class="btn btn-primary" onclick="Customers.edit()">+ Neuer Kunde</button>
      </div>
    </div>

    <div class="filterbar">
      <input type="text" id="custSearch" placeholder="Suchen…" value="${U.esc(filter.q)}"
             oninput="Customers.setFilter('q', this.value)">
      <div class="seg">
        ${[['alle','Alle'],['stamm','Stammkunden'],['schlafend','Schlafend'],['offen','Mit offenen Posten']]
          .map(([k,l]) => `<button class="${filter.typ===k?'active':''}" onclick="Customers.setFilter('typ','${k}')">${l}</button>`).join('')}
      </div>
    </div>

    <div class="card table-wrap">
      ${cs.length ? `<table>
        <thead><tr>
          <th>Nr.</th><th>Kunde</th><th>Ort</th><th>Kontakt</th>
          <th class="num">Umsatz ${jahr}</th><th class="num">Offen</th><th>Letzte Aktivität</th>
        </tr></thead>
        <tbody>${cs.map(c => row(c, jahr)).join('')}</tbody>
      </table>` : UI.empty('Keine Kunden gefunden.',
        `<button class="btn btn-primary" onclick="Customers.edit()">+ Neuer Kunde</button>`)}
    </div>`;
  }

  function list(){
    let cs = Store.all('customers');
    const q = filter.q.toLowerCase().trim();
    if (q) cs = cs.filter(c => (c.firma+' '+c.kuerzel+' '+c.ort+' '+c.nr+' '+(c.ansprechpartner||'')).toLowerCase().includes(q));
    if (filter.typ === 'stamm')     cs = cs.filter(c => c.stammkunde);
    if (filter.typ === 'offen')     cs = cs.filter(c => Store.customerOpen(c.id) > 0);
    if (filter.typ === 'schlafend') cs = cs.filter(c => isSleeping(c));
    return U.sortBy(cs, c => c.firma.toLowerCase());
  }

  function isSleeping(c){
    const la = Store.lastActivity(c.id);
    const grenze = Store.settings().reaktivierungTage || 180;
    return !la || U.daysAgo(la) > grenze;
  }

  function row(c, jahr){
    const rev  = Store.customerRevenue(c.id, jahr);
    const open = Store.customerOpen(c.id);
    const la   = Store.lastActivity(c.id);
    return `<tr class="clickable" onclick="location.hash='#/kunde/${c.id}'">
      <td class="t-sub mono">${U.esc(c.nr||'–')}</td>
      <td>
        <div class="t-strong">${U.esc(c.firma)}</div>
        ${c.ansprechpartner ? `<div class="t-sub">${U.esc(c.ansprechpartner)}</div>` : ''}
      </td>
      <td class="t-sub">${U.esc(c.ort||'–')}</td>
      <td class="t-sub">${U.esc(c.telefon || c.email || '–')}</td>
      <td class="num">${rev ? U.eur(rev) : '<span class="t-sub">–</span>'}</td>
      <td class="num">${open ? `<span style="color:var(--red);font-weight:600">${U.eur(open)}</span>` : '<span class="t-sub">–</span>'}</td>
      <td class="t-sub">${la ? U.relative(la) : '<span class="badge amber">nie</span>'}</td>
    </tr>`;
  }

  function setFilter(k, v){
    filter[k] = v;
    App.rerender();
    if (k === 'q'){ const el = document.getElementById('custSearch'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  }

  /* ---------- Detailseite ---------- */
  /* ---------- Was ein Kunde an Material gekostet hat ----------
     Ausgaben hängen am Projekt, das Projekt am Kunden. Ausgaben ohne
     Projekt lassen sich niemandem zuordnen und bleiben außen vor. */
  function materialFuer(customerId){
    const projIds = new Set(Store.all('projects').filter(p => p.customerId === customerId).map(p => p.id));
    const posten = Store.all('expenses').filter(e => e.projectId && projIds.has(e.projectId));
    const summe = U.sum(posten, e => U.parseNum(e.betrag));
    const nachKategorie = U.groupBy(posten, e => e.kategorie || 'Sonstiges');
    return {
      summe, posten,
      kategorien: U.sortBy(Object.entries(nachKategorie).map(([k, liste]) => ({
        kategorie: k, betrag: U.sum(liste, e => U.parseNum(e.betrag)), anzahl: liste.length
      })), x => x.betrag, 'desc')
    };
  }

  /* Material je Projekt – für die Auflistung im Kundendetail */
  const materialJeProjekt = projectId =>
    U.sum(Store.all('expenses').filter(e => e.projectId === projectId), e => U.parseNum(e.betrag));

  function detail(id){
    const c = Store.byId('customers', id);
    if (!c) return `<div class="empty"><p>Kunde nicht gefunden.</p></div>`;
    const mat = materialFuer(id);
    const jahr  = new Date().getFullYear();
    const docs  = U.sortBy(Store.all('documents').filter(d => d.customerId === id), d => d.datum, 'desc');
    const projs = U.sortBy(Store.all('projects').filter(p => p.customerId === id), p => p.createdAt, 'desc');
    const inbox = U.sortBy(Store.all('inbox').filter(i => i.customerId === id), i => i.datum, 'desc').slice(0,8);
    const open  = Store.customerOpen(id);
    const revY  = Store.customerRevenue(id, jahr);
    const revAll= Store.customerRevenue(id);
    const la    = Store.lastActivity(id);

    return `
    <div class="detail-head">
      <div style="flex:1;min-width:250px">
        <div class="back" onclick="location.hash='#/kunden'">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Alle Kunden
        </div>
        <h1 style="font-size:28px">${U.esc(c.firma)}</h1>
        <div class="sub" style="color:var(--muted);margin-top:4px">
          Kunden-Nr. ${U.esc(c.nr||'–')}
          ${c.stammkunde ? ' · <span class="badge dark">Stammkunde</span>' : ''}
          ${isSleeping(c) ? ' · <span class="badge amber">schläft seit '+(la?U.daysAgo(la):'?')+' Tagen</span>' : ''}
        </div>
      </div>
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
        ${c.telefon ? `<a class="btn" href="tel:${U.esc(c.telefon)}">Anrufen</a>
        <a class="btn" href="${U.waLink(c.telefon,'Moin '+(c.ansprechpartner||'')+'!')}" target="_blank">WhatsApp</a>`:''}
        <button class="btn" onclick="Customers.edit('${c.id}')">Bearbeiten</button>
        <button class="btn" onclick="Projects.edit(null,'${c.id}')">+ Projekt</button>
        <button class="btn btn-primary" onclick="Documents.newDoc('rechnung','${c.id}')">+ Rechnung</button>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi"><div class="label">Umsatz ${jahr}</div><div class="value">${U.eur0(revY)}</div>
        <div class="foot">gesamt ${U.eur0(revAll)}</div></div>
      <div class="kpi ${mat.summe?'accent-amber':''}"><div class="label">Material &amp; Fremdkosten</div>
        <div class="value">${U.eur0(mat.summe)}</div>
        <div class="foot">${revAll > 0
          ? `${Math.round(mat.summe / revAll * 100)} % vom Umsatz · bleiben ${U.eur0(revAll - mat.summe)}`
          : (mat.summe ? 'noch kein Umsatz dagegen' : 'nichts erfasst')}</div></div>
      <div class="kpi ${open?'accent-red':''}"><div class="label">Offen</div><div class="value">${U.eur0(open)}</div>
        <div class="foot">${docs.filter(Store.isOpenInvoice).length} offene Rechnung(en)</div></div>
      <div class="kpi"><div class="label">Zahlungsmoral</div><div class="value">${payMorale(id)}</div>
        <div class="foot">Ø Tage bis Zahlung</div></div>
    </div>

    <div class="grid grid-2-1">
      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="card">
          <div class="card-head"><h3>Dokumente</h3>
            <div class="actions">
              <button class="btn btn-sm" onclick="Documents.newDoc('kv','${c.id}')">+ KV</button>
              <button class="btn btn-sm" onclick="Documents.newDoc('rechnung','${c.id}')">+ Rechnung</button>
            </div>
          </div>
          <div class="table-wrap">${docs.length ? `<table><tbody>
            ${docs.map(d => `<tr class="clickable" onclick="Documents.open('${d.id}')">
              <td style="width:130px"><div class="t-strong mono">${U.esc(d.nummer)}</div>
                <div class="t-sub">${UI.docLabel(d.typ)}</div></td>
              <td><div>${U.esc(U.cut(d.betreff || (d.positionen||[])[0]?.beschreibung || '–', 46))}</div>
                <div class="t-sub">${U.de(d.datum)}</div></td>
              <td class="num t-strong">${U.eur(Store.docTotal(d))}</td>
              <td style="width:130px;text-align:right">${UI.docBadge(d)}</td>
            </tr>`).join('')}
          </tbody></table>` : UI.empty('Noch keine Dokumente für diesen Kunden.')}</div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Projekte</h3>
            <div class="actions"><button class="btn btn-sm" onclick="Projects.edit(null,'${c.id}')">+ Projekt</button></div>
          </div>
          <div class="table-wrap">${projs.length ? `<table><tbody>
            ${projs.map(p => {
              const m = materialJeProjekt(p.id);
              return `<tr class="clickable" onclick="Projects.edit('${p.id}')">
              <td><div class="t-strong">${U.esc(p.titel)}</div><div class="t-sub">${U.esc(p.typ||'')}</div></td>
              <td class="t-sub">${p.deadline ? 'bis '+U.de(p.deadline) : ''}</td>
              <td class="num">${p.budget ? U.eur(p.budget) : ''}
                ${m ? `<div class="t-sub">− ${U.eur(m)} Material</div>` : ''}</td>
              <td style="text-align:right">${UI.pipeBadge(p.status)}</td>
            </tr>`;
            }).join('')}
          </tbody></table>` : UI.empty('Noch keine Projekte.')}</div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Material &amp; Fremdkosten</h3>
            <div class="actions">
              ${mat.summe ? `<span class="t-sub" style="margin-right:10px">${U.eur(mat.summe)} gesamt</span>` : ''}
              <button class="btn btn-sm btn-primary" onclick="Analysis.kostenErfassen('${c.id}')">+ Kosten</button>
            </div>
          </div>
          ${mat.posten.length ? `
            <div class="table-wrap"><table><tbody>
              ${U.sortBy(mat.posten, e => e.datum, 'desc').map(e => `<tr>
                <td style="width:92px" class="t-sub">${U.deShort(e.datum)}</td>
                <td><div class="t-strong">${U.esc(e.haendler || e.kategorie || 'Ausgabe')}</div>
                  <div class="t-sub">${U.esc(Store.projName(e.projectId))}${e.notiz ? ' · '+U.esc(U.cut(e.notiz,40)) : ''}</div></td>
                <td class="num t-strong">${U.eur(e.betrag)}</td>
                <td style="width:70px;text-align:right">
                  <button class="btn btn-sm" onclick="Finance.editExpense('${e.id}')">Ändern</button></td>
              </tr>`).join('')}
            </tbody></table></div>
            <div class="card-pad" style="border-top:1px solid var(--line-soft);padding-top:12px">
              <div class="t-sub" style="line-height:1.7">
                ${mat.kategorien.map(k => `${U.esc(k.kategorie)}: <b>${U.eur(k.betrag)}</b>`).join(' · ')}
                ${revAll > 0 ? `<br>Bei ${U.eur(revAll)} Umsatz bleiben nach Material <b>${U.eur(revAll - mat.summe)}</b>.` : ''}
              </div>
            </div>`
          : UI.empty('Für diesen Kunden ist noch kein Material erfasst. Beim Anlegen einer Ausgabe unter „Projekt" den passenden Auftrag wählen – dann landet sie hier.')}
        </div>

        ${inbox.length ? `<div class="card">
          <div class="card-head"><h3>Verlauf (Mails, WhatsApp, Notizen)</h3></div>
          <div>${inbox.map(i => `<div class="task">
            <div class="task-icon ${Inbox.sourceColor(i.quelle)}">${Inbox.sourceIcon(i.quelle)}</div>
            <div class="task-body">
              <div class="task-title">${U.esc(i.betreff||'(ohne Betreff)')}</div>
              <div class="task-sub">${U.de(i.datum)} · ${U.esc(U.cut(i.text, 110))}</div>
            </div>
            <div class="task-act"><button class="btn btn-sm" onclick="Inbox.open('${i.id}')">Ansehen</button></div>
          </div>`).join('')}</div>
        </div>` : ''}
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:14px">Stammdaten</h3>
          <div class="meta-list">
            ${metaRow('Firma', c.firma)}
            ${metaRow('Ansprechpartner', c.ansprechpartner)}
            ${metaRow('Adresse', [c.strasse, [c.plz,c.ort].filter(Boolean).join(' ')].filter(Boolean).join('\n'))}
            ${metaRow('Telefon', c.telefon)}
            ${metaRow('E-Mail', c.email)}
            ${metaRow('Kürzel', c.kuerzel)}
            ${metaRow('Kunde seit', U.de(c.createdAt))}
          </div>
          ${c.notizen ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line-soft)">
            <div class="t-sub" style="margin-bottom:5px">Notizen</div>
            <div style="font-size:13.5px;line-height:1.6">${U.nl2br(c.notizen)}</div></div>` : ''}
        </div>

        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:10px">Nächster Schritt</h3>
          ${suggestion(c)}
        </div>

        ${Knowledge.brandCard(c)}
        ${Knowledge.masseCard(c)}
      </div>
    </div>`;
  }

  const metaRow = (k, v) => v ? `<div class="meta-row"><div class="k">${k}</div><div class="v">${U.nl2br(v)}</div></div>` : '';

  function payMorale(id){
    const paid = Store.all('documents').filter(d => d.customerId===id && Store.isInvoice(d) && d.status==='bezahlt' && d.bezahltAm);
    if (!paid.length) return '–';
    const avg = U.sum(paid, d => U.daysBetween(d.datum, d.bezahltAm)) / paid.length;
    return Math.round(avg) + ' T';
  }

  /* ---------- Vorschlag „was tun mit dem Kunden" ---------- */
  function suggestion(c){
    const open = Store.customerOpen(c.id);
    const la = Store.lastActivity(c.id);
    const tage = la ? U.daysAgo(la) : 9999;
    const out = [];
    if (open > 0){
      const od = Store.all('documents').filter(d => d.customerId===c.id && Store.isOverdue(d));
      if (od.length) out.push(`<div class="badge red" style="margin-bottom:8px">${od.length} Rechnung(en) überfällig</div>
        <p style="font-size:13.5px;line-height:1.6;margin-bottom:10px">${c.stammkunde
          ? 'Stammkunde – erst kurz anrufen oder WhatsApp, bevor eine schriftliche Erinnerung rausgeht.'
          : 'Zahlungserinnerung fällig. Text steht fertig bereit.'}</p>
        <button class="btn btn-sm btn-primary" onclick="Documents.open('${od[0].id}')">Rechnung öffnen</button>`);
    }
    if (!out.length && tage > (Store.settings().reaktivierungTage||180)){
      out.push(`<p style="font-size:13.5px;line-height:1.6;margin-bottom:10px">
        Seit ${tage===9999?'immer':U.relative(la)} nichts mehr gelaufen. Guter Moment für ein kurzes „Moin, alles gut bei euch?" –
        oft kommt daraus direkt ein Auftrag.</p>
        ${c.telefon?`<a class="btn btn-sm btn-primary" target="_blank" href="${U.waLink(c.telefon, Growth.reactivationText(c))}">WhatsApp schreiben</a>`:''}
        <button class="btn btn-sm" onclick="UI.copyText(Growth.reactivationText(Store.byId('customers','${c.id}')))">Text kopieren</button>`);
    }
    if (!out.length){
      const ideen = Growth.upsellIdeas(c);
      out.push(`<p style="font-size:13.5px;line-height:1.6;margin-bottom:8px">Läuft. Was du hier noch anbieten könntest:</p>
        <ul style="font-size:13.5px;line-height:1.75;padding-left:17px;color:var(--ink-soft)">
          ${ideen.map(i=>`<li>${U.esc(i)}</li>`).join('')}</ul>`);
    }
    return out.join('');
  }

  /* ---------- Bearbeiten ---------- */
  function edit(id=null){
    const c = id ? Store.byId('customers', id) : {
      nr: Store.nextCustomerNr(), firma:'', kuerzel:'', ansprechpartner:'',
      strasse:'', plz:'', ort:'', telefon:'', email:'', notizen:'', stammkunde:false
    };
    UI.modal({
      title: id ? 'Kunde bearbeiten' : 'Neuer Kunde',
      body: `
        <div class="row row-2-1">
          <div class="field"><label>Firma / Name *</label>
            <input type="text" id="cFirma" value="${U.esc(c.firma)}" placeholder="z.B. Pizzeria am Markt"></div>
          <div class="field"><label>Kunden-Nr.</label>
            <input type="text" id="cNr" value="${U.esc(c.nr)}"></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>Ansprechpartner</label>
            <input type="text" id="cAp" value="${U.esc(c.ansprechpartner)}" placeholder="Vor- und Nachname"></div>
          <div class="field"><label>Kürzel (für Suche)</label>
            <input type="text" id="cKuerzel" value="${U.esc(c.kuerzel)}" placeholder="roma"></div>
        </div>
        <div class="field"><label>Straße</label>
          <input type="text" id="cStrasse" value="${U.esc(c.strasse)}"></div>
        <div class="row row-2">
          <div class="field"><label>PLZ</label><input type="text" id="cPlz" value="${U.esc(c.plz)}"></div>
          <div class="field"><label>Ort</label><input type="text" id="cOrt" value="${U.esc(c.ort)}"></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>Telefon</label>
            <input type="tel" id="cTel" value="${U.esc(c.telefon)}" placeholder="0151 …">
            <div class="hint">Wird für WhatsApp-Links gebraucht</div></div>
          <div class="field"><label>E-Mail</label><input type="email" id="cMail" value="${U.esc(c.email)}"></div>
        </div>
        <div class="field"><label>Notizen</label>
          <textarea id="cNotiz" placeholder="Was man über den Kunden wissen sollte…">${U.esc(c.notizen)}</textarea></div>
        <label class="check"><input type="checkbox" id="cStamm" ${c.stammkunde?'checked':''}>
          Stammkunde <span class="t-sub">(sanfteres Mahnwesen: erst anrufen, Erinnerung frühestens Tag 14)</span></label>`,
      foot: `${id?`<button class="btn btn-danger left" onclick="Customers.del('${id}')">Löschen</button>`:''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Customers.save('${id||''}')">Speichern</button>`
    });
  }

  function save(id){
    const v = k => (document.getElementById(k)||{}).value?.trim() || '';
    const firma = v('cFirma');
    if (!firma){ UI.toast('Firma/Name fehlt', 'err'); return; }
    const patch = {
      firma, nr: v('cNr'), kuerzel: v('cKuerzel') || U.slug(firma),
      ansprechpartner: v('cAp'), strasse: v('cStrasse'), plz: v('cPlz'), ort: v('cOrt'),
      telefon: v('cTel'), email: v('cMail'), notizen: v('cNotiz'),
      stammkunde: document.getElementById('cStamm').checked
    };
    if (id) Store.update('customers', id, patch);
    else { const n = Store.add('customers', patch); id = n.id; }
    UI.closeModal(); UI.toast('Kunde gespeichert', 'ok'); App.rerender();
  }

  function del(id){
    const docs = Store.all('documents').filter(d => d.customerId === id).length;
    UI.confirm(
      docs ? `Zu diesem Kunden gibt es ${docs} Dokument(e). Die bleiben erhalten, verlieren aber die Zuordnung. Trotzdem löschen?`
           : 'Kunde wirklich löschen?',
      () => { Store.remove('customers', id); UI.closeModal(); UI.toast('Kunde gelöscht');
              location.hash = '#/kunden'; App.rerender(); });
  }

  function exportCsv(){
    const rows = [['Nr','Firma','Ansprechpartner','Straße','PLZ','Ort','Telefon','E-Mail','Stammkunde','Umsatz gesamt','Offen']];
    Store.all('customers').forEach(c => rows.push([
      c.nr, c.firma, c.ansprechpartner, c.strasse, c.plz, c.ort, c.telefon, c.email,
      c.stammkunde?'ja':'nein', U.num(Store.customerRevenue(c.id)), U.num(Store.customerOpen(c.id))
    ]));
    U.download(`Kunden_${U.today()}.csv`, '﻿'+U.csv(rows), 'text/csv');
    UI.toast('CSV exportiert', 'ok');
  }

  /* ---------- Kunde per Name finden/anlegen (für Posteingang) ---------- */
  function findByText(text){
    const t = String(text||'').toLowerCase();
    let best = null, bestLen = 0;
    Store.all('customers').forEach(c => {
      [c.firma, c.kuerzel, c.ansprechpartner, c.email].filter(Boolean).forEach(n => {
        const nn = String(n).toLowerCase();
        if (nn.length > 3 && t.includes(nn) && nn.length > bestLen){ best = c; bestLen = nn.length; }
      });
    });
    return best;
  }

  return { render, detail, edit, save, del, setFilter, exportCsv, isSleeping, findByText,
           materialFuer, materialJeProjekt };
})();
