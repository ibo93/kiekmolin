/* ==========================================================
   Kurani CRM – Posteingang
   Mails, WhatsApp, Telefonnotizen an einer Stelle.
   Der Browser kommt allein nicht an dein Postfach – deshalb:
   1) Text reinkopieren (WhatsApp/Mail) → wird automatisch zerlegt
   2) Claude schiebt gelesene Mails per JSON-Import rein
   ========================================================== */
const Inbox = (() => {

  let filter = 'offen';   // offen | alle | mail | whatsapp

  /* ---------- Erkennungs-Muster ---------- */
  const PATTERNS = [
    { key:'anfrage',    label:'Anfrage',        color:'blue',
      words:['was kostet','kosten','preis','angebot','kostenvoranschlag','kv ','anfrage','bräuchte','brauche',
             'könnt ihr','kannst du','machst du','wäre möglich','interesse','wieviel','wie viel'] },
    { key:'zusage',     label:'Zusage',         color:'green',
      words:['passt so','machen wir','einverstanden','geht klar','ja bitte','beauftrag','auftrag erteilt',
             'nehmen wir','ist ok','in ordnung','gebucht','leg los','mach das'] },
    { key:'zahlung',    label:'Zahlung',        color:'green',
      words:['überwiesen','bezahlt','zahlung','geld ist raus','angewiesen','rechnung beglichen'] },
    { key:'reklamation',label:'Reklamation',    color:'red',
      words:['problem','fehler','falsch','stimmt nicht','nicht zufrieden','reklamation','beschwerde',
             'passt nicht','schlecht','ärger','kaputt','defekt'] },
    { key:'termin',     label:'Termin',         color:'amber',
      words:['termin','wann','treffen','vorbeikommen','besprechen','uhr','montag','dienstag','mittwoch',
             'donnerstag','freitag','samstag','sonntag'] },
    { key:'dringend',   label:'Dringend',       color:'red',
      words:['dringend','asap','eilig','schnell','sofort','morgen früh','heute noch','ganz kurzfristig'] }
  ];

  function analyze(text){
    const t = String(text||'').toLowerCase();
    const tags = PATTERNS.filter(p => p.words.some(w => t.includes(w))).map(p => p.key);

    // Beträge
    const betraege = [...t.matchAll(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euro)/gi)]
      .map(m => U.parseNum(m[1])).filter(n => n > 0);

    // Datumsangaben (14.08. / 14.08.2026)
    const daten = [...text.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/g)].map(m => {
      const j = m[3] ? (m[3].length===2 ? '20'+m[3] : m[3]) : String(new Date().getFullYear());
      return `${j}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }).filter(d => !isNaN(new Date(d)));

    const customer = Customers.findByText(text);

    return { tags, betraege, daten, customer,
             betrag: betraege.length ? Math.max(...betraege) : 0,
             datum: daten[0] || '' };
  }

  /* ---------- WhatsApp-Export zerlegen ---------- */
  function parseWhatsApp(raw){
    const lines = String(raw||'').split('\n');
    const re = /^\[?(\d{1,2}[./]\d{1,2}[./]\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s*[-–]?\s*([^:]{1,40}):\s*(.*)$/;
    const msgs = [];
    lines.forEach(l => {
      const m = l.match(re);
      if (m){
        const [,d,zeit,von,txt] = m;
        const p = d.split(/[./]/);
        const jahr = p[2] ? (p[2].length===2 ? '20'+p[2] : p[2]) : String(new Date().getFullYear());
        msgs.push({ datum:`${jahr}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`, zeit, von:von.trim(), text:txt });
      } else if (msgs.length && l.trim()){
        msgs[msgs.length-1].text += '\n' + l;   // Folgezeile
      }
    });
    return msgs;
  }

  /* ---------- Icons ---------- */
  const ICONS = {
    mail:'<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    whatsapp:'<svg viewBox="0 0 24 24"><path d="M20 3.9A10 10 0 003.5 17.6L2 22l4.5-1.5A10 10 0 1020 3.9zM12 20a8 8 0 01-4.1-1.1l-.3-.2-2.7.9.9-2.6-.2-.3A8 8 0 1112 20zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.7.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4c0-.1-.5-1.3-.7-1.7-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.5 3.9 3.4.5.2 1 .4 1.3.5.5.2 1 .1 1.4.1.4-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1 0-.1-.2-.2-.4-.3z"/></svg>',
    telefon:'<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>',
    notiz:'<svg viewBox="0 0 24 24"><path d="M3 17.2V21h3.8L17.8 10 14 6.2 3 17.2zM20.7 7.1c.4-.4.4-1 0-1.4l-2.4-2.4c-.4-.4-1-.4-1.4 0l-1.8 1.8L18.9 8.9l1.8-1.8z"/></svg>'
  };
  const sourceIcon  = q => ICONS[q] || ICONS.notiz;
  const sourceColor = q => ({mail:'blue', whatsapp:'green', telefon:'amber', notiz:'grey'}[q] || 'grey');
  const sourceLabel = q => ({mail:'E-Mail', whatsapp:'WhatsApp', telefon:'Telefon', notiz:'Notiz'}[q] || 'Notiz');

  /* ================= ANSICHT ================= */
  function render(){
    const items = list();
    const offen = Store.all('inbox').filter(i => i.status !== 'erledigt').length;
    return `
    <div class="page-head">
      <div><h1>Posteingang</h1>
        <div class="sub">${offen} unbearbeitet · alles was reinkommt landet hier</div></div>
      <div class="actions">
        <button class="btn" onclick="Inbox.importDialog()">Von Claude importieren</button>
        <button class="btn btn-primary" onclick="Inbox.pasteDialog()">+ Text einfügen</button>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:18px;background:var(--card-weich)">
      <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft)">
        <b>So kommt was rein:</b> WhatsApp-Chat oder Mail markieren, kopieren, hier auf
        <i>„Text einfügen"</i> – das CRM erkennt Kunde, Preis, Termin und was der andere will,
        und macht dir daraus direkt Projekt, KV oder Aufgabe.
        Oder du sagst zu Claude: <i>„lies meine Mails und pack sie ins CRM"</i>.
      </div>
    </div>

    <div class="filterbar">
      <div class="seg">
        ${[['offen','Unbearbeitet'],['alle','Alle'],['mail','Mails'],['whatsapp','WhatsApp']]
          .map(([k,l])=>`<button class="${filter===k?'active':''}" onclick="Inbox.setFilter('${k}')">${l}</button>`).join('')}
      </div>
    </div>

    <div class="card">
      ${items.length ? items.map(itemRow).join('')
        : UI.empty('Nichts im Posteingang.',
          `<button class="btn btn-primary" onclick="Inbox.pasteDialog()">+ Text einfügen</button>`)}
    </div>`;
  }

  function list(){
    let is = Store.all('inbox');
    if (filter === 'offen') is = is.filter(i => i.status !== 'erledigt');
    else if (filter === 'mail' || filter === 'whatsapp') is = is.filter(i => i.quelle === filter);
    return U.sortBy(is, i => (i.datum||'') + (i.createdAt||''), 'desc');
  }
  function setFilter(f){ filter = f; App.rerender(); }

  function itemRow(i){
    const a = i.analyse || analyze(i.text);
    return `<div class="task">
      <div class="task-icon ${sourceColor(i.quelle)}">${sourceIcon(i.quelle)}</div>
      <div class="task-body">
        <div class="task-title">${U.esc(i.betreff || U.cut(i.text, 60))}
          ${i.status === 'erledigt' ? '<span class="badge grey" style="margin-left:6px">erledigt</span>' : ''}</div>
        <div class="task-sub">
          ${U.esc(i.von || sourceLabel(i.quelle))} · ${U.de(i.datum)}
          ${i.customerId ? ' · <b>'+U.esc(Store.custName(i.customerId))+'</b>' : (a.customer ? ' · '+U.esc(a.customer.firma)+'?' : '')}
        </div>
        <div style="margin-top:6px;font-size:13px;color:var(--ink-soft);line-height:1.5">${U.esc(U.cut(i.text, 170))}</div>
        <div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">
          ${(a.tags||[]).map(t => { const p = PATTERNS.find(x=>x.key===t);
            return `<span class="badge ${p.color}">${p.label}</span>`; }).join('')}
          ${a.betrag ? `<span class="badge grey">${U.eur(a.betrag)} erkannt</span>` : ''}
          ${a.datum ? `<span class="badge grey">${U.de(a.datum)}</span>` : ''}
        </div>
      </div>
      <div class="task-act">
        <button class="btn btn-sm" onclick="Inbox.open('${i.id}')">Öffnen</button>
        ${i.status !== 'erledigt' ? `<button class="btn btn-sm" onclick="Inbox.done('${i.id}')">Erledigt</button>` : ''}
      </div>
    </div>`;
  }

  /* ================= TEXT EINFÜGEN ================= */
  function pasteDialog(){
    UI.modal({
      title:'Text einfügen',
      wide:true,
      body:`
        <div class="row row-3">
          <div class="field"><label>Woher?</label>
            <select id="iQuelle">
              <option value="whatsapp">WhatsApp</option><option value="mail">E-Mail</option>
              <option value="telefon">Telefon</option><option value="notiz">Notiz</option>
            </select></div>
          <div class="field"><label>Von wem</label>
            <input type="text" id="iVon" placeholder="Name oder Nummer"></div>
          <div class="field"><label>Datum</label>
            <input type="date" id="iDatum" value="${U.today()}"></div>
        </div>
        <div class="field"><label>Betreff <span class="t-sub">(leer = wird aus dem Text gebaut)</span></label>
          <input type="text" id="iBetreff"></div>
        <div class="field"><label>Text</label>
          <textarea id="iText" rows="9" oninput="Inbox.livePreview()"
            placeholder="WhatsApp-Chat oder Mail hier reinkopieren…"></textarea></div>
        <div id="iPreview"></div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Inbox.savePaste()">Übernehmen</button>`
    });
  }

  function livePreview(){
    const text = document.getElementById('iText').value;
    const box = document.getElementById('iPreview');
    if (!text.trim()){ box.innerHTML = ''; return; }
    const a = analyze(text);
    const wa = parseWhatsApp(text);
    box.innerHTML = `<div class="card card-pad" style="background:var(--card-weich);border:none">
      <div class="t-sub" style="margin-bottom:8px">Das lese ich raus:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${a.tags.length ? a.tags.map(t=>{const p=PATTERNS.find(x=>x.key===t);
          return `<span class="badge ${p.color}">${p.label}</span>`;}).join('') : '<span class="t-sub">nichts Eindeutiges</span>'}
        ${a.customer ? `<span class="badge dark">Kunde: ${U.esc(a.customer.firma)}</span>` : ''}
        ${a.betrag ? `<span class="badge grey">Betrag ${U.eur(a.betrag)}</span>` : ''}
        ${a.datum ? `<span class="badge grey">Datum ${U.de(a.datum)}</span>` : ''}
        ${wa.length>1 ? `<span class="badge grey">${wa.length} WhatsApp-Nachrichten erkannt</span>` : ''}
      </div>
      <div class="t-sub" style="line-height:1.6">${suggestText(a)}</div>
    </div>`;
  }

  function suggestText(a){
    if (a.tags.includes('reklamation')) return 'Reklamation – <b>Mahnstopp</b> für diesen Kunden. Erst klären, dann Geld.';
    if (a.tags.includes('anfrage'))  return 'Riecht nach neuer Anfrage → ich lege dir gleich ein Projekt an, daraus wird direkt ein KV.';
    if (a.tags.includes('zusage'))   return 'Der Kunde sagt zu → Projekt auf „Zugesagt", bei Neukunde oder über 500 € eine Auftragsbestätigung raus.';
    if (a.tags.includes('zahlung'))  return 'Zahlungseingang angekündigt → gleich bei der Rechnung als bezahlt buchen.';
    if (a.tags.includes('termin'))   return 'Da steht ein Termin drin – als Aufgabe mit Datum ablegen.';
    return 'Kein klares Muster – leg es als Notiz ab oder mach direkt eine Aufgabe draus.';
  }

  function savePaste(){
    const text = document.getElementById('iText').value.trim();
    if (!text){ UI.toast('Kein Text drin','err'); return; }
    const quelle = document.getElementById('iQuelle').value;
    const a = analyze(text);
    const wa = parseWhatsApp(text);
    const item = Store.add('inbox', {
      quelle,
      von: document.getElementById('iVon').value.trim() || (wa[0]?.von || ''),
      datum: document.getElementById('iDatum').value || wa[0]?.datum || U.today(),
      betreff: document.getElementById('iBetreff').value.trim() || U.cut(text.replace(/\n/g,' '), 55),
      text, status:'neu',
      customerId: a.customer?.id || '',
      analyse: { tags:a.tags, betrag:a.betrag, datum:a.datum }
    });
    UI.closeModal(); UI.toast('Im Posteingang abgelegt','ok');
    open(item.id);
  }

  /* ================= ITEM ÖFFNEN ================= */
  function open(id){
    const i = Store.byId('inbox', id);
    if (!i) return;
    const a = i.analyse || analyze(i.text);
    const cust = i.customerId ? Store.byId('customers', i.customerId) : a.customer;

    UI.modal({
      title: i.betreff || sourceLabel(i.quelle),
      wide:true,
      body:`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <span class="badge ${sourceColor(i.quelle)}">${sourceLabel(i.quelle)}</span>
          <span class="badge grey">${U.de(i.datum)}</span>
          ${i.von?`<span class="badge grey">${U.esc(i.von)}</span>`:''}
          ${(a.tags||[]).map(t=>{const p=PATTERNS.find(x=>x.key===t);
            return `<span class="badge ${p.color}">${p.label}</span>`;}).join('')}
        </div>

        <div class="field"><label>Kunde zuordnen</label>
          <select id="ixKunde" onchange="Inbox.assign('${id}', this.value)">
            ${UI.customerOptions(cust?.id || '')}
          </select>
          ${!cust ? `<div class="hint">Keiner erkannt – neuen Kunden anlegen?
            <button class="btn btn-sm" style="margin-left:6px" onclick="Inbox.newCustomerFrom('${id}')">+ Kunde anlegen</button></div>`:''}
        </div>

        <div class="card card-pad" style="background:var(--card-weich);border:none;margin-bottom:16px">
          <div style="font-size:13.5px;line-height:1.65;white-space:pre-wrap">${U.esc(i.text)}</div>
        </div>

        <div class="card card-pad" style="border:1px solid var(--line)">
          <div class="t-strong" style="margin-bottom:4px">Was jetzt?</div>
          <div class="t-sub" style="line-height:1.6;margin-bottom:12px">${suggestText(a)}</div>
          <div style="display:flex;gap:7px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" onclick="Inbox.toProject('${id}')">→ Projekt anlegen</button>
            <button class="btn btn-sm" onclick="Inbox.toDoc('${id}','kv')">→ KV schreiben</button>
            <button class="btn btn-sm" onclick="Inbox.toDoc('${id}','rechnung')">→ Rechnung</button>
            <button class="btn btn-sm" onclick="Inbox.toTodo('${id}')">→ Aufgabe</button>
          </div>
        </div>`,
      foot:`<button class="btn btn-danger left" onclick="Store.remove('inbox','${id}');UI.closeModal();App.rerender()">Löschen</button>
            <button class="btn" onclick="UI.closeModal()">Schließen</button>
            ${i.status!=='erledigt'?`<button class="btn btn-primary" onclick="Inbox.done('${id}',true)">Als erledigt markieren</button>`:''}`
    });
  }

  function assign(id, customerId){ Store.update('inbox', id, { customerId }); UI.toast('Kunde zugeordnet'); }

  function newCustomerFrom(id){
    const i = Store.byId('inbox', id);
    UI.closeModal();
    Customers.edit();
    setTimeout(() => {
      const f = document.getElementById('cFirma');
      if (f && i.von) f.value = i.von;
      const n = document.getElementById('cNotiz');
      if (n) n.value = `Erstkontakt ${U.de(i.datum)} über ${sourceLabel(i.quelle)}:\n${U.cut(i.text,200)}`;
    }, 100);
  }

  function toProject(id){
    const i = Store.byId('inbox', id);
    const a = i.analyse || analyze(i.text);
    Store.update('inbox', id, { status:'erledigt' });
    UI.closeModal();
    Projects.edit(null, i.customerId || a.customer?.id || '');
    setTimeout(() => {
      const t = document.getElementById('pTitel');
      if (t) t.value = i.betreff || U.cut(i.text.replace(/\n/g,' '), 50);
      const n = document.getElementById('pNotiz');
      if (n) n.value = `Aus ${sourceLabel(i.quelle)} vom ${U.de(i.datum)}:\n${i.text}`;
      const b = document.getElementById('pBudget');
      if (b && a.betrag) b.value = a.betrag;
      const d = document.getElementById('pDeadline');
      if (d && a.datum) d.value = a.datum;
    }, 100);
  }

  function toDoc(id, typ){
    const i = Store.byId('inbox', id);
    const a = i.analyse || analyze(i.text);
    Store.update('inbox', id, { status:'erledigt' });
    UI.closeModal();
    Documents.newDoc(typ, i.customerId || a.customer?.id || '', {
      betreff: i.betreff || '',
      positionen: [{ beschreibung: U.cut(i.betreff || i.text.replace(/\n/g,' '), 60), detail:'',
                     menge:1, einheit:'', einzelpreis: a.betrag || '' }]
    });
  }

  function toTodo(id){
    const i = Store.byId('inbox', id);
    const a = i.analyse || analyze(i.text);
    Store.add('todos', {
      text: i.betreff || U.cut(i.text.replace(/\n/g,' '), 60),
      faellig: a.datum || U.today(),
      customerId: i.customerId || a.customer?.id || '',
      erledigt:false, quelle:'inbox', inboxId:id
    });
    Store.update('inbox', id, { status:'erledigt' });
    UI.closeModal(); UI.toast('Als Aufgabe angelegt','ok'); App.rerender();
  }

  function done(id, close=false){
    Store.update('inbox', id, { status:'erledigt' });
    if (close) UI.closeModal();
    UI.toast('Erledigt'); App.rerender();
  }

  /* ================= IMPORT (für Claude) =================
     Format: [{quelle,von,datum,betreff,text}]  */
  function importDialog(){
    UI.modal({
      title:'Nachrichten importieren',
      wide:true,
      body:`
        <div class="card card-pad" style="background:var(--card-weich);border:none;margin-bottom:16px">
          <div style="font-size:13.5px;line-height:1.7">
            <b>So geht's:</b> Sag im Claude-Chat einfach:<br>
            <i style="color:var(--ink)">„Lies meine Mails der letzten Tage und gib mir das JSON fürs CRM."</i><br>
            Claude gibt dir dann eine Liste – die hier reinkopieren und importieren.
          </div>
        </div>
        <div class="field"><label>JSON</label>
          <textarea id="impJson" rows="10" placeholder='[{"quelle":"mail","von":"info@lapiazza.de","datum":"2026-08-14","betreff":"Neue Speisekarte","text":"Moin Ibo, wir bräuchten…"}]'></textarea>
          <div class="hint">Felder: quelle (mail/whatsapp/telefon/notiz), von, datum, betreff, text</div></div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Inbox.runImport()">Importieren</button>`
    });
  }

  function runImport(){
    let arr;
    try { arr = JSON.parse(document.getElementById('impJson').value); }
    catch(e){ UI.toast('Das ist kein gültiges JSON','err'); return; }
    if (!Array.isArray(arr)){ UI.toast('Erwartet wird eine Liste [ … ]','err'); return; }
    const n = importJson(arr);
    UI.closeModal(); UI.toast(n + ' Nachricht(en) importiert','ok'); App.rerender();
  }

  // auch direkt aufrufbar: Inbox.importJson([...])
  function importJson(arr){
    let n = 0;
    arr.forEach(x => {
      if (!x || !x.text) return;
      const a = analyze(x.text + ' ' + (x.betreff||'') + ' ' + (x.von||''));
      Store.add('inbox', {
        quelle: x.quelle || 'mail',
        von: x.von || '',
        datum: x.datum || U.today(),
        betreff: x.betreff || U.cut(String(x.text).replace(/\n/g,' '), 55),
        text: x.text,
        status: 'neu',
        customerId: x.customerId || a.customer?.id || '',
        externalId: x.id || '',
        analyse: { tags:a.tags, betrag:a.betrag, datum:a.datum }
      });
      n++;
    });
    return n;
  }

  return { render, setFilter, pasteDialog, livePreview, savePaste, open, assign, newCustomerFrom,
           toProject, toDoc, toTodo, done, importDialog, runImport, importJson,
           analyze, parseWhatsApp, sourceIcon, sourceColor, sourceLabel, PATTERNS };
})();
