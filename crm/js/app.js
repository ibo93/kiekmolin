/* ==========================================================
   Kurani CRM – App
   Router · Dashboard · Aufgaben-Automatik · Einstellungen
   ========================================================== */
const App = (() => {

  let route = 'dashboard';
  let param = '';
  let diaZeitraum = 'jahr';   // Zeitraum im Dashboard-Diagramm

  function setDiaZeitraum(k){ diaZeitraum = k; rerender(); }

  /* Monatsreihe für den gewählten Zeitraum:
     jahr    = Januar bis Dezember dieses Jahres
     12m     = die letzten zwölf Monate, über den Jahreswechsel hinweg
     quartal = die letzten drei Monate */
  function diaMonate(){
    const heute = U.today();
    const jetzt = new Date(heute);
    if (diaZeitraum === 'jahr'){
      const j = U.yearOf(heute);
      return { reihe: Finance.monthly(j), vergleich: Finance.monthly(j - 1), vLabel: String(j - 1) };
    }
    const anzahl = diaZeitraum === 'quartal' ? 3 : 12;
    const reihe = [], vergleich = [];
    for (let i = anzahl - 1; i >= 0; i--){
      const d = U.addMonths(heute, -i);
      const j = U.yearOf(d), m = new Date(d).getMonth();
      reihe.push(Finance.monthly(j)[m]);
      vergleich.push(Finance.monthly(j - 1)[m]);
    }
    return { reihe, vergleich, vLabel: 'Vorjahr' };
  }

  /* ================= AUFGABEN-AUTOMATIK =================
     Baut jeden Tag neu, was wirklich ansteht.
     Reihenfolge = Priorität: 1 = heute machen, 3 = wenn Zeit ist. */
  const Agenda = (() => {

    function build(){
      const t = [];
      const s = Store.settings();

      /* --- Reklamationen: Mahnstopp --- */
      const rekl = Store.all('inbox').filter(i => i.status!=='erledigt' &&
        (i.analyse?.tags||[]).includes('reklamation'));
      rekl.forEach(i => t.push({
        prio:1, farbe:'red', icon:'!',
        titel:`Reklamation klären: ${Store.custName(i.customerId) || i.von || 'unbekannt'}`,
        sub:`${U.cut(i.text,90)} · Solange das offen ist: keine Mahnung an diesen Kunden.`,
        akt:[{l:'Ansehen', f:`Inbox.open('${i.id}')`, p:true}]
      }));
      const reklKunden = new Set(rekl.map(i => i.customerId).filter(Boolean));

      /* --- Überfällige Rechnungen --- */
      Store.all('documents').filter(Store.isOverdue).forEach(d => {
        const c = Store.byId('customers', d.customerId);
        const tage = U.daysAgo(d.faellig || d.datum);
        const lvl = Documents.mahnLevel(d);
        if (reklKunden.has(d.customerId)){
          t.push({ prio:2, farbe:'amber', icon:'€',
            titel:`${d.nummer} überfällig (${tage} Tage) – aber Reklamation offen`,
            sub:`${Store.custName(d.customerId)} · ${U.eur(Store.docOpen(d))} · erst die Reklamation klären`,
            akt:[{l:'Rechnung', f:`Documents.open('${d.id}')`}]});
          return;
        }
        if (lvl){
          const stamm = c?.stammkunde && lvl === 1;
          t.push({
            prio:1, farbe:'red', icon:'€',
            titel:`${Documents.mahnTitel(lvl)} für ${Store.custName(d.customerId)}`,
            sub:`${d.nummer} · ${U.eur(Store.docOpen(d))} · ${tage} Tage überfällig${stamm?' · Stammkunde: erst anrufen':''}`,
            akt:[
              ...(stamm && c.telefon ? [{l:'WhatsApp', f:`window.open('${U.waLink(c.telefon, `Moin${c.ansprechpartner?' '+c.ansprechpartner.split(' ')[0]:''}! Kurze Sache: die Rechnung ${d.nummer} über ${U.eur(Store.docOpen(d))} ist noch offen. Kannst du da nochmal draufschauen? Danke dir!`)}','_blank')`, p:true}] : []),
              {l:`${Documents.mahnTitel(lvl)} erstellen`, f:`Documents.createMahnung('${d.id}',${lvl})`, p:!stamm},
              {l:'Bezahlt', f:`Documents.markPaid('${d.id}')`}
            ]});
        } else {
          t.push({ prio:2, farbe:'amber', icon:'€',
            titel:`${d.nummer} ist ${tage} Tage überfällig`,
            sub:`${Store.custName(d.customerId)} · ${U.eur(Store.docOpen(d))} · Mahnstufe schon raus, Frist läuft`,
            akt:[{l:'Öffnen', f:`Documents.open('${d.id}')`},{l:'Bezahlt', f:`Documents.markPaid('${d.id}')`}]});
        }
      });

      /* --- Fertige Projekte ohne Rechnung: SOFORT abrechnen --- */
      Store.all('projects').filter(p => p.status === 'fertig').forEach(p => {
        const hat = Store.all('documents').some(d => d.projectId === p.id && Store.isInvoice(d));
        if (!hat) t.push({
          prio:1, farbe:'green', icon:'✓',
          titel:`Rechnung stellen: ${p.titel}`,
          sub:`${Store.custName(p.customerId)}${p.budget?' · '+U.eur(p.budget):''} · Leistung ist fertig – nicht sammeln, sofort raus damit`,
          akt:[{l:'Rechnung schreiben', f:`Projects.toDoc('${p.id}','rechnung')`, p:true}]
        });
      });

      /* --- Lastschrift: Monatslauf, Einzug, Rückläufer --- */
      if (typeof Sepa !== 'undefined'){
        const rueck = Store.all('documents').filter(d => d.einzug === 'zurueck' && Store.isOpenInvoice(d));
        rueck.forEach(d => t.push({
          prio:1, farbe:'red', icon:'!',
          titel:`Lastschrift kam zurück: ${Store.custName(d.customerId)}`,
          sub:`${d.nummer} · ${U.eur(Store.docOpen(d))} · das Geld ist wieder weg – nachhaken`,
          akt:[{l:'Anschreiben', f:`Documents.sendMenu('${d.id}')`, p:true},
               {l:'Rechnung', f:`Documents.open('${d.id}')`}]
        }));

        const faellig = Sepa.faelligeAbos();
        if (faellig.length) t.push({
          prio:1, farbe:'green', icon:'€',
          titel:`Monatslauf: ${faellig.length} ${faellig.length===1?'Abo ist':'Abos sind'} fällig`,
          sub:`${U.eur(U.sum(faellig, r => U.parseNum(r.betrag)))} · Rechnungen erzeugen und einziehen`,
          akt:[{l:'Monatslauf starten', f:`Sepa.laufStarten()`, p:true}]
        });

        const einzug = Sepa.einzugsfaehig();
        if (einzug.length) t.push({
          prio:1, farbe:'green', icon:'€',
          titel:`${einzug.length} ${einzug.length===1?'Rechnung wartet':'Rechnungen warten'} auf den Einzug`,
          sub:`${U.eur(U.sum(einzug, x => x.betrag))} · Datei erzeugen und bei der Bank hochladen`,
          akt:[{l:'Einzug vorbereiten', f:`Sepa.dateiDialog()`, p:true}]
        });

        /* Abos ohne Mandat – da bleibt Geld liegen */
        const ohne = Store.all('recurring').filter(r => r.aktiv && !Sepa.mandatFuer(r.customerId));
        if (ohne.length) t.push({
          prio:3, farbe:'blue', icon:'i',
          titel:`${ohne.length} ${ohne.length===1?'Abo läuft':'Abos laufen'} ohne Lastschrift`,
          sub:`${ohne.map(r => Store.custName(r.customerId)).slice(0,3).join(', ')}${ohne.length>3?' …':''} · mit Mandat holst du das Geld automatisch`,
          akt:[{l:'Mandat anlegen', f:`Sepa.mandatBearbeiten()`}]
        });
      }

      /* --- Entwürfe, die noch nicht raus sind --- */
      Store.all('documents').filter(d => d.status === 'entwurf' && U.daysAgo(d.createdAt||d.datum) >= 1).forEach(d => {
        t.push({ prio:1, farbe:'blue', icon:'→',
          titel:`${UI.docLabel(d.typ)} ${d.nummer} liegt seit ${U.daysAgo(d.createdAt||d.datum)} Tagen als Entwurf`,
          sub:`${Store.custName(d.customerId)} · ${U.eur(Store.docTotal(d))} · muss noch raus`,
          akt:[{l:'Senden', f:`Documents.sendMenu('${d.id}')`, p:true},{l:'Öffnen', f:`Documents.open('${d.id}')`}]});
      });

      /* --- KV nachfassen (älter als Gültigkeit, keine Antwort) --- */
      Store.all('documents').filter(d => (d.typ==='kv'||d.typ==='angebot') && d.status==='versendet').forEach(d => {
        const alter = U.daysAgo(d.datum);
        if (alter >= (s.kvGueltigTage||30) && !d.nachgefasst){
          const c = Store.byId('customers', d.customerId);
          const txt = `Moin${c?.ansprechpartner?' '+c.ansprechpartner.split(' ')[0]:''}! Ich wollte nur kurz nachhaken wegen meinem Angebot ${d.nummer} über ${U.eur(Store.docTotal(d))}. Passt das so für euch oder soll ich nochmal was anpassen?`;
          t.push({ prio:2, farbe:'amber', icon:'?',
            titel:`Nachfassen: ${UI.docLabel(d.typ)} ${d.nummer}`,
            sub:`${Store.custName(d.customerId)} · ${U.eur(Store.docTotal(d))} · seit ${alter} Tagen keine Antwort · einmal freundlich nachfragen`,
            akt:[
              ...(c?.telefon?[{l:'WhatsApp', f:`window.open('${U.waLink(c.telefon, txt)}','_blank');App.markFollowUp('${d.id}')`, p:true}]:[]),
              {l:'Erledigt', f:`App.markFollowUp('${d.id}',true)`}
            ]});
        }
      });

      /* --- Abo-Rechnungen fällig --- */
      Store.all('recurring').filter(r => r.aktiv && U.daysUntil(r.naechstesDatum) <= 0).forEach(r => {
        t.push({ prio:1, farbe:'green', icon:'↻',
          titel:`Abo abrechnen: ${r.titel}`,
          sub:`${Store.custName(r.customerId)} · ${U.eur(r.betrag)} · fällig seit ${U.de(r.naechstesDatum)}`,
          akt:[{l:'Rechnung erzeugen', f:`Documents.runRecurring('${r.id}')`, p:true}]});
      });

      /* --- Deadlines --- */
      Store.all('projects').filter(p => p.deadline && !['bezahlt','berechnet','verloren'].includes(p.status)).forEach(p => {
        const tage = U.daysUntil(p.deadline);
        if (tage <= 7){
          t.push({ prio: tage < 0 ? 1 : 2, farbe: tage < 0 ? 'red' : 'amber', icon:'◷',
            titel: tage < 0 ? `Deadline überschritten: ${p.titel}` : `Deadline ${tage===0?'heute':'in '+tage+' Tagen'}: ${p.titel}`,
            sub:`${Store.custName(p.customerId)} · ${U.de(p.deadline)}${p.aufwandStd?' · '+p.aufwandStd+' h geplant':''}`,
            akt:[{l:'Projekt', f:`Projects.edit('${p.id}')`, p:true}]});
        }
      });

      /* --- Termine heute und morgen --- */
      Cal.heuteUndMorgen().forEach(x => {
        const heute = x.datum === U.today();
        t.push({ prio: heute ? 1 : 2, farbe:'blue', icon:'◷',
          titel:`${heute?'Heute':'Morgen'}${x.zeit?' '+x.zeit:''}: ${x.titel}`,
          sub:[x.customerId?Store.custName(x.customerId):'', x.ort, Cal.artLabel(x.art)].filter(Boolean).join(' · '),
          akt:[{l:'Termin', f:`Cal.edit('${x.id}')`, p:true},
               ...(x.ort?[{l:'Route', f:`window.open('https://maps.apple.com/?q='+encodeURIComponent('${x.ort.replace(/'/g,"")}'),'_blank')`}]:[])]});
      });

      /* --- Lieferungen, die da sein müssten --- */
      Cal.faelligeLieferungen().forEach(o => {
        const tage = Math.abs(U.daysUntil(o.erwartetAm));
        t.push({ prio:2, farbe:'amber', icon:'⊞',
          titel:`Lieferung: ${o.was}`,
          sub:`${o.lieferant||'Lieferant'} · erwartet ${U.de(o.erwartetAm)}${tage?` · ${tage} Tage drüber`:''}`,
          akt:[{l:'Ist da', f:`Cal.markDelivered('${o.id}')`, p:true},
               {l:'Öffnen', f:`Cal.editOrder('${o.id}')`}]});
      });

      /* --- Projekte mit offener Checkliste, die fertig gemeldet sind --- */
      Store.all('projects').filter(p => p.status === 'fertig' && (p.checkliste||[]).some(x => !x.erledigt))
        .forEach(p => {
          const offen = (p.checkliste||[]).filter(x=>!x.erledigt);
          t.push({ prio:2, farbe:'amber', icon:'☑',
            titel:`${p.titel}: ${offen.length} Punkt(e) noch offen`,
            sub:`${offen.slice(0,2).map(x=>x.text).join(' · ')} – vor der Rechnung abhaken`,
            akt:[{l:'Checkliste', f:`Projects.edit('${p.id}')`, p:true}]});
        });

      /* --- Posteingang --- */
      const inboxOffen = Store.all('inbox').filter(i => i.status !== 'erledigt' &&
        !(i.analyse?.tags||[]).includes('reklamation'));
      if (inboxOffen.length) t.push({
        prio:2, farbe:'blue', icon:'✉',
        titel:`${inboxOffen.length} Nachricht(en) im Posteingang`,
        sub: inboxOffen.slice(0,2).map(i => (i.betreff||U.cut(i.text,30))).join(' · '),
        akt:[{l:'Durchgehen', f:`location.hash='#/posteingang'`, p:true}]
      });

      /* --- Kapazität --- */
      const cap = Projects.capacity(2);
      if (cap[0] && cap[0].frei < 0) t.push({
        prio:2, farbe:'amber', icon:'◔',
        titel:`Diese Woche bist du überbucht (${cap[0].geplant} von ${cap[0].cap} h)`,
        sub:`${Math.abs(cap[0].frei)} h zu viel. Was kann warten, was muss der Kunde verschieben?`,
        akt:[{l:'Board', f:`location.hash='#/projekte'`},{l:'Zeit-Check', f:`Projects.capacityCheck()`, p:true}]
      });

      /* --- Manuelle Aufgaben --- */
      Store.all('todos').filter(x => !x.erledigt).forEach(x => {
        const tage = x.faellig ? U.daysUntil(x.faellig) : 99;
        t.push({ prio: tage <= 0 ? 1 : tage <= 3 ? 2 : 3, farbe: tage <= 0 ? 'red' : 'grey', icon:'□',
          titel: x.text,
          sub: [x.customerId?Store.custName(x.customerId):'', x.faellig?(tage<0?'überfällig seit '+U.de(x.faellig):'bis '+U.de(x.faellig)):'']
                .filter(Boolean).join(' · '),
          akt:[{l:'Erledigt', f:`App.doneTodo('${x.id}')`, p:true},{l:'✕', f:`Store.remove('todos','${x.id}');App.rerender()`}]});
      });

      /* --- Schlafende Kunden (max 2) --- */
      const schlaf = Store.all('customers').filter(c => Customers.isSleeping(c) &&
        Store.customerRevenue(c.id) > 0);
      U.sortBy(schlaf, c => Store.customerRevenue(c.id), 'desc').slice(0,2).forEach(c => {
        t.push({ prio:3, farbe:'grey', icon:'↺',
          titel:`${c.firma} melden – seit ${U.daysAgo(Store.lastActivity(c.id))} Tagen still`,
          sub:`Bisher ${U.eur0(Store.customerRevenue(c.id))} Umsatz · ${Growth.upsellIdeas(c)[0]||''}`,
          akt:[
            ...(c.telefon?[{l:'WhatsApp', f:`window.open('${U.waLink(c.telefon, Growth.reactivationText(c))}','_blank')`, p:true}]:[]),
            {l:'Kunde', f:`location.hash='#/kunde/${c.id}'`}
          ]});
      });

      /* --- Saison-Thema --- */
      Campaigns.aktuell().filter(s => s.ziel !== 'keine').forEach(s => {
        const schonGemacht = Store.all('campaigns').some(c =>
          c.titel === s.titel + ' ' + new Date().getFullYear());
        if (!schonGemacht) t.push({
          prio:2, farbe:'amber', icon:'☀',
          titel:`Saison: ${s.titel}`,
          sub:`${s.was} · ${Campaigns.GRUPPEN[s.ziel].f().length} Kunden passen dazu`,
          akt:[{l:'Aktion starten', f:`Campaigns.fromSeason('${s.key}')`, p:true},
               {l:'Später', f:`location.hash='#/kampagnen'`}]
        });
      });

      /* --- Offene Kampagnen --- */
      Campaigns.offeneAktionen().forEach(x => t.push({
        prio:3, farbe:'blue', icon:'✉',
        titel:`${x.c.titel}: noch ${x.offen} Kunden offen`,
        sub:`${x.c.ziele.length - x.offen} von ${x.c.ziele.length} erledigt · Text steht fertig`,
        akt:[{l:'Weitermachen', f:`Campaigns.work('${x.c.id}')`, p:true}]
      }));

      /* --- Jahrestage (max 2) --- */
      Campaigns.jahrestage().slice(0,2).forEach(x => t.push({
        prio:3, farbe:'grey', icon:'↺',
        titel:`${x.kunde.firma}: ${x.p.typ} ist ein Jahr alt`,
        sub:`${U.de(x.datum)} · guter Anlass für ein Update-Angebot`,
        akt:[
          ...(x.kunde.telefon ? [{l:'WhatsApp', f:`window.open('${U.waLink(x.kunde.telefon, Campaigns.jahrestagFuer(x.p.id))}','_blank')`, p:true}] : []),
          {l:'Kunde', f:`location.hash='#/kunde/${x.kunde.id}'`}
        ]
      }));

      /* --- Backup --- */
      const lb = Store.data().meta.lastBackup;
      if (!lb || U.daysAgo(lb) > 14) t.push({
        prio:3, farbe:'grey', icon:'↓',
        titel:'Backup machen',
        sub: lb ? `Letztes Backup vor ${U.daysAgo(lb)} Tagen` : 'Noch nie gesichert – alles liegt nur in diesem Browser',
        akt:[{l:'Jetzt sichern', f:`Store.exportBackup()`, p:true}]
      });

      /* --- Steuer-Frist in den nächsten 30 Tagen --- */
      Finance.fristen(new Date().getFullYear()).forEach(f => {
        const tage = U.daysUntil(f.datum);
        if (tage >= 0 && tage <= 30) t.push({
          prio: tage <= 7 ? 2 : 3, farbe:'amber', icon:'§',
          titel: f.was, sub:`Frist ${U.de(f.datum)} · in ${tage} Tagen`,
          akt:[{l:'Steuer', f:`location.hash='#/steuer'`}]});
      });

      return U.sortBy(t, x => x.prio);
    }

    return { build };
  })();

  /* ================= AUFGABEN-SEITE ================= */
  function renderTasks(){
    const tasks = Agenda.build();
    const heute = tasks.filter(t => t.prio === 1);
    const bald  = tasks.filter(t => t.prio === 2);
    const rest  = tasks.filter(t => t.prio === 3);

    const geldOffen = Finance.offenGesamt();
    const ueberfaellig = U.sum(Store.all('documents').filter(Store.isOverdue), Store.docOpen);

    return `
    <div class="page-head">
      <div><h1>Was ist dran</h1>
        <div class="sub">${U.de(U.today())} · ${heute.length} Sachen für heute</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="App.newTodo()">+ Aufgabe</button></div>
    </div>

    ${ueberfaellig > 0 ? `<div class="card card-pad" style="margin-bottom:18px;background:var(--red-bg);border:none">
      <div style="font-family:'Playfair Display',serif;font-size:19px;font-weight:700;color:var(--red);margin-bottom:4px">
        ${U.eur0(ueberfaellig)} liegen bei deinen Kunden fest</div>
      <div style="font-size:13.5px;line-height:1.6;color:var(--ink-soft)">
        Das ist Geld, das du schon verdient hast. Die Texte stehen fertig unten – 10 Minuten und es ist raus.</div>
    </div>` : ''}

    ${section('Heute', heute, 'Nichts Dringendes. Guter Tag zum Arbeiten.')}
    ${bald.length ? section('Diese Woche', bald) : ''}
    ${rest.length ? section('Wenn Zeit ist', rest) : ''}`;
  }

  function section(titel, items, leer=''){
    return `<div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>${titel}</h3><div class="actions t-sub">${items.length}</div></div>
      ${items.length ? items.map(taskRow).join('') : UI.empty(leer||'Nichts hier.')}
    </div>`;
  }

  function taskRow(t){
    return `<div class="task">
      <div class="task-icon ${t.farbe}" style="font-weight:700;font-size:15px">${t.icon}</div>
      <div class="task-body">
        <div class="task-title">${U.esc(t.titel)}</div>
        <div class="task-sub">${U.esc(t.sub)}</div>
      </div>
      <div class="task-act">${(t.akt||[]).map(a =>
        `<button class="btn btn-sm ${a.p?'btn-primary':''}" onclick="${a.f.replace(/"/g,'&quot;')}">${U.esc(a.l)}</button>`).join('')}</div>
    </div>`;
  }

  function newTodo(){
    UI.modal({
      title:'Neue Aufgabe',
      body:`<div class="field"><label>Was?</label>
          <input type="text" id="tdText" placeholder="z.B. Druckdaten prüfen"></div>
        <div class="row row-2">
          <div class="field"><label>Bis wann</label><input type="date" id="tdDatum" value="${U.today()}"></div>
          <div class="field"><label>Kunde</label><select id="tdKunde">${UI.customerOptions()}</select></div>
        </div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="App.saveTodo()">Anlegen</button>`
    });
  }
  function saveTodo(){
    const text = document.getElementById('tdText').value.trim();
    if (!text){ UI.toast('Text fehlt','err'); return; }
    Store.add('todos', { text, faellig: document.getElementById('tdDatum').value,
      customerId: document.getElementById('tdKunde').value, erledigt:false, quelle:'manuell' });
    UI.closeModal(); UI.toast('Aufgabe angelegt','ok'); rerender();
  }
  function doneTodo(id){ Store.update('todos', id, { erledigt:true, erledigtAm:U.today() }); UI.toast('Erledigt','ok'); rerender(); }
  function markFollowUp(id, silent=false){
    Store.update('documents', id, { nachgefasst: U.today() });
    if (!silent) UI.toast('Als nachgefasst markiert');
    rerender();
  }

  /* ================= DASHBOARD ================= */
  /* ---------- Der laufende Monat auf einen Blick ----------
     Die Zahl, die Ibo als erstes wissen will: was ist reingekommen,
     was ist rausgegangen, was bleibt. Mit Vergleich zum Vormonat. */
  function monatsKarte(){
    const heute = U.today();
    const jetzt = U.monthKey(heute);
    const vor   = U.monthKey(U.addMonths(heute, -1));
    const m  = Finance.monatsZahlen(jetzt);
    const v  = Finance.monatsZahlen(vor);
    const o  = Finance.monatsOffen(jetzt);
    const s  = Store.settings();

    const name = U.monatLang(jetzt);
    const tagImMonat = new Date(heute).getDate();
    const tageGesamt = new Date(U.yearOf(heute), new Date(heute).getMonth()+1, 0).getDate();

    /* Hochrechnung: so läuft der Monat, wenn es so weitergeht */
    const hoch = tagImMonat >= 5 ? m.umsatz / tagImMonat * tageGesamt : null;

    const diff = v.umsatz > 0 ? Math.round((m.umsatz - v.umsatz) / v.umsatz * 100) : null;
    const besser = diff !== null && diff >= 0;

    return `
    <div class="monat-karte">
      <div class="monat-kopf">
        <div>
          <div class="monat-name">${name}</div>
          <div class="monat-tag">Tag ${tagImMonat} von ${tageGesamt}</div>
        </div>
        ${diff !== null ? `<div class="monat-trend ${besser?'gut':'schlecht'}">
          ${besser?'+':''}${diff} %<span>zum Vormonat</span></div>` : ''}
      </div>

      <div class="monat-zahlen">
        <div class="monat-block">
          <div class="monat-label">${s.kleinunternehmer ? 'Eingenommen' : 'Umsatz netto'}</div>
          <div class="monat-wert">${U.eur(m.umsatz)}</div>
          <div class="monat-fuss">${m.anzahl} ${m.anzahl===1?'Rechnung':'Rechnungen'} bezahlt</div>
        </div>
        <div class="monat-block">
          <div class="monat-label">Ausgegeben</div>
          <div class="monat-wert minus">− ${U.eur(m.ausgaben)}</div>
          <div class="monat-fuss">${U.eur(m.belege)} Belege${m.fahrten ? ` · ${U.eur(m.fahrten)} Fahrten` : ''}</div>
        </div>
        <div class="monat-block gewinn">
          <div class="monat-label">Bleibt dir</div>
          <div class="monat-wert">${U.eur(m.gewinn)}</div>
          <div class="monat-fuss">${m.gewinn > 0
            ? `davon ${U.eur(m.gewinn * U.parseNum(s.ruecklageProzent) / 100)} für die Steuer zurücklegen`
            : 'noch nichts verdient in dem Monat'}</div>
        </div>
      </div>

      <div class="monat-fuszeile">
        ${o.betrag > 0
          ? `<span><b>${U.eur(o.betrag)}</b> aus ${o.anzahl} ${o.anzahl===1?'Rechnung':'Rechnungen'} noch nicht bezahlt</span>`
          : `<span>Alles bezahlt, was du diesen Monat gestellt hast</span>`}
        ${hoch !== null ? `<span>Läuft es so weiter: <b>${U.eur0(hoch)}</b> zum Monatsende</span>` : ''}
        <a href="#/auswertung">Auswertung ansehen</a>
      </div>
    </div>`;
  }

  function renderDashboard(){
    const jahr = new Date().getFullYear();
    const ein = Finance.einnahmen(jahr);
    const offen = Finance.offenGesamt();
    const ueber = U.sum(Store.all('documents').filter(Store.isOverdue), Store.docOpen);
    const monat = Finance.monthly(jahr)[new Date().getMonth()];
    const tasks = Agenda.build();
    const heute = tasks.filter(t => t.prio === 1);
    const ziel = Store.settings().umsatzzielJahr;
    const aktiv = Store.all('projects').filter(p => ['zugesagt','arbeit'].includes(p.status));
    const letzte = U.sortBy(Store.all('documents'), d => d.createdAt||d.datum, 'desc').slice(0,6);
    const cap = Projects.capacity(1)[0];

    return `
    <div class="page-head">
      <div><h1>Moin Ibo</h1>
        <div class="sub">${['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][new Date().getDay()]},
          ${U.de(U.today())}${heute.length?` · ${heute.length} Sachen stehen an`:' · nichts Dringendes'}</div></div>
      <div class="actions">
        <button class="btn" onclick="Inbox.pasteDialog()">Nachricht einfügen</button>
        <!-- Auf dem Handy steht + Rechnung schon oben in der Leiste -->
        <button class="btn btn-primary nur-gross" onclick="Documents.newDoc('rechnung')">+ Rechnung</button>
      </div>
    </div>

    ${monatsKarte()}

    <div class="grid grid-3" style="margin-bottom:18px">
      <div class="kpi accent-green"><div class="sym">${UI.sym('ziel')}</div>
        <div class="label">Umsatz ${jahr}</div><div class="value">${U.eur0(ein)}</div>
        <div class="foot">${ziel?`${Math.round(ein/ziel*100)} % vom Jahresziel`:''}</div></div>
      <div class="kpi ${offen?'accent-amber':''}"><div class="sym">${UI.sym('uhr')}</div>
        <div class="label">Offene Posten</div><div class="value">${U.eur0(offen)}</div>
        <div class="foot">${Store.all('documents').filter(Store.isOpenInvoice).length} Rechnungen unterwegs</div></div>
      <div class="kpi ${ueber?'accent-red':''}"><div class="sym">${UI.sym(ueber?'warnung':'haken')}</div>
        <div class="label">Überfällig</div><div class="value">${U.eur0(ueber)}</div>
        <div class="foot">${ueber ? Store.all('documents').filter(Store.isOverdue).length+' Rechnungen – da musst du ran'
                                  : 'nichts überfällig'}</div></div>
    </div>

    <div class="grid grid-2-1">
      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="card">
          <div class="card-head"><h3>Heute dran</h3>
            <div class="actions"><button class="btn btn-sm" onclick="location.hash='#/aufgaben'">Alle ansehen</button></div></div>
          ${heute.length ? heute.slice(0,5).map(taskRow).join('')
            : UI.empty('Nichts Dringendes offen. Guter Moment für Akquise oder eine Idee aus dem Wachstums-Bereich.')}
        </div>

        ${(() => {
          const zr = diaMonate();
          const m  = zr.reihe;
          const vj = zr.vergleich;
          const hatVorjahr = U.sum(vj, x => x.ein) > 0;
          const zielMonat = ziel ? U.parseNum(ziel) / 12 : null;
          return `
        <div class="card card-pad">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
            <div>
              <h3 style="font-size:16px">Umsatz und Ausgaben</h3>
              <div class="t-sub" style="margin-top:2px">Einnahmen zählen am Tag des Geldeingangs</div>
            </div>
            ${UI.zeitraum([{key:'jahr',label:'Dieses Jahr'},{key:'12m',label:'12 Monate'},{key:'quartal',label:'Quartal'}],
                          diaZeitraum, 'App.setDiaZeitraum')}
          </div>
          ${Chart.verlauf(
            m.map(x => ({ label: x.label, wert: x.ein })),
            { vergleich: hatVorjahr ? vj.map(x => ({ label:x.label, wert:x.ein })) : null,
              label: 'Eingenommen',
              vergleichLabel: hatVorjahr ? zr.vLabel : '',
              ziel: zielMonat, hoehe: 200 })}
          <div style="border-top:1px solid var(--line-soft);margin-top:16px;padding-top:14px">
            ${Chart.balken(
              m.map(x => ({ label: x.label, wert: x.ein, wert2: x.aus })),
              { label: 'rein', label2: 'raus', hoehe: 130, farbe2: 'var(--red)' })}
          </div>
        </div>`;
        })()}

        <div class="card">
          <div class="card-head"><h3>In Arbeit</h3>
            <div class="actions"><button class="btn btn-sm" onclick="location.hash='#/projekte'">Board</button></div></div>
          ${aktiv.length ? `<div class="table-wrap"><table><tbody>
            ${U.sortBy(aktiv, p=>p.deadline||'9999').slice(0,6).map(p => {
              const tage = p.deadline ? U.daysUntil(p.deadline) : null;
              return `<tr class="clickable" onclick="Projects.edit('${p.id}')">
                <td><div class="t-strong">${U.esc(p.titel)}</div>
                  <div class="t-sub">${U.esc(Store.custName(p.customerId))}</div></td>
                <td class="num">${p.budget?U.eur0(p.budget):''}</td>
                <td style="width:130px;text-align:right">${p.deadline
                  ? `<span class="badge ${tage<0?'red':tage<=3?'amber':'grey'}">${tage<0?'überfällig':'bis '+U.deShort(p.deadline)}</span>`
                  : ''}</td>
              </tr>`; }).join('')}
          </tbody></table></div>` : UI.empty('Nichts in Arbeit.',
            `<button class="btn btn-primary" onclick="Projects.edit()">+ Projekt anlegen</button>`)}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">

        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:10px">Diese Woche</h3>
          <div class="progress"><span class="${cap.frei<0?'danger':cap.frei<5?'warn':''}"
            style="width:${U.clamp(cap.geplant/cap.cap*100,0,100)}%"></span></div>
          <div style="font-size:13.5px;margin-top:9px;line-height:1.6;color:var(--ink-soft)">
            ${cap.geplant} von ${cap.cap} Stunden verplant.
            ${cap.frei > 0 ? `<b>${cap.frei} h frei</b> – da passt noch was rein.`
                           : `<b style="color:var(--red)">${Math.abs(cap.frei)} h zu viel.</b> Was schiebst du?`}
          </div>
          <button class="btn btn-sm" style="margin-top:11px" onclick="Projects.capacityCheck()">Auftrag durchrechnen</button>
        </div>

        <div class="card">
          <div class="card-head"><h3>Zuletzt</h3></div>
          ${letzte.length ? letzte.map(d => {
            /* Farbe der Plakette sagt auf einen Blick, wie es um das Dokument steht */
            const farbe = d.status === 'bezahlt' ? 'gruen'
                        : Store.isOverdue(d)     ? 'rot'
                        : d.status === 'entwurf'  ? ''
                        : d.typ === 'mahnung'     ? 'rot' : 'blau';
            const bild  = d.typ === 'mahnung' ? 'warnung'
                        : d.typ === 'rechnung' ? 'rechnung' : 'projekt';
            return `<div class="zeile" style="cursor:pointer" onclick="Documents.open('${d.id}')">
              ${UI.plakette(bild, farbe)}
              <div class="zeile-text">
                <div class="zeile-titel">${U.esc(U.cut(Store.custName(d.customerId), 24))}</div>
                <div class="zeile-sub">${UI.docLabel(d.typ)} ${U.esc(d.nummer)} · ${U.relative(d.datum)}</div>
              </div>
              <div class="zeile-wert">${U.eur0(Store.docTotal(d))}
                <small>${d.status === 'bezahlt' ? 'bezahlt'
                       : Store.isOverdue(d) ? U.daysAgo(d.faellig||d.datum) + ' Tage über'
                       : d.status === 'entwurf' ? 'Entwurf' : 'offen'}</small></div>
            </div>`;
          }).join('') : UI.empty('Noch keine Dokumente.')}
        </div>

        <div class="card card-pad" style="background:var(--sidebar);color:var(--auf-sidebar);border:none">
          <h3 style="font-size:16px;margin-bottom:8px;color:var(--auf-sidebar)">Gedanke des Tages</h3>
          <div style="font-size:13.5px;line-height:1.7;color:var(--sidebar-soft)">${tipp()}</div>
        </div>
      </div>
    </div>`;
  }

  const TIPPS = [
    'Rechnung sofort nach Lieferung schreiben – nicht sammeln. Jeder Tag Verzögerung ist ein Tag später Geld.',
    'Ein Abo bringt dir jeden Monat Geld, ohne dass du neu verkaufen musst. Frag deinen nächsten zufriedenen Kunden.',
    'Der teuerste Kunde ist der, den du nicht wieder anrufst. Reaktivierung kostet nichts außer 2 Minuten.',
    'Preis nie am Telefon nennen, wenn du unsicher bist. „Ich schick dir heute Abend einen KV" – dann in Ruhe rechnen.',
    'Wer nach dem Preis fragt, hat Interesse. Wer nach dem Rabatt fragt, hat gekauft.',
    'Leg 25 % von jeder bezahlten Rechnung auf ein zweites Konto. Dann tut die Steuer nicht weh.',
    'Kunden vergleichen nicht Qualität, sondern das was sie verstehen. Zeig Vorher/Nachher.',
    'Zwei Stunden Akquise am Montagmorgen sind mehr wert als zehn Stunden Warten.',
    'Wenn ein Auftrag sich falsch anfühlt, ist er meist auch zu billig. Rechne ihn nochmal durch.',
    'Bestandskunden kaufen 5× leichter als Neukunden. Deine Kundenliste ist dein Kapital.'
  ];
  const tipp = () => TIPPS[new Date().getDate() % TIPPS.length];

  /* ================= EINSTELLUNGEN ================= */

  /* Karte für den Assistenten: Zugang, Modell, Kosten */
  function assistCard(s){
    if (typeof Assist === 'undefined') return '';
    const k    = Assist.kosten();
    const info = Assist.lageInfo();
    const akt  = s.kiModell || Assist.STD_MODELL;
    const key  = (s.kiKey || '').trim();
    const eff  = s.kiEffort || 'low';

    return `
    <div class="card">
      <div class="card-head"><h3>Assistent</h3>
        <div class="actions t-sub">${key ? 'eingerichtet' : 'noch kein Zugang'}</div></div>
      <div class="card-pad">
        <div class="field">
          <label>Zugangsschlüssel von Anthropic</label>
          <input type="password" id="sKiKey" value="${U.esc(key)}" placeholder="sk-ant-…" autocomplete="off">
          <div class="hint">Bekommst du auf console.anthropic.com unter API Keys. Bleibt nur auf diesem Gerät –
            nicht im Backup, nicht im Handy-Sync.</div>
        </div>
        <div class="field">
          <label>Welches Modell antwortet</label>
          <select id="sKiModell">
            ${Object.entries(Assist.MODELLE).map(([id,m]) => `
              <option value="${id}" ${akt===id?'selected':''}>${m.name} – ${m.hint}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Wie gründlich</label>
          <select id="sKiEffort">
            <option value="low"    ${eff==='low'?'selected':''}>Schnell – für normale Fragen und Texte</option>
            <option value="medium" ${eff==='medium'?'selected':''}>Gründlicher – wenn er rechnen und abwägen soll</option>
            <option value="high"   ${eff==='high'?'selected':''}>Sehr gründlich – dauert länger, kostet mehr</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="App.saveSettings()">Speichern</button>

        <div style="border-top:1px solid var(--line-soft);margin-top:16px;padding-top:14px" class="t-sub">
          <div style="line-height:1.7">
            Diesen Monat: <b>${U.eur(k.cent/100)}</b> für ${k.fragen} ${k.fragen===1?'Frage':'Fragen'}.<br>
            Bei jeder Frage gehen rund ${U.num(Math.round(info.tokenCa/100)*100)} Token deiner Daten mit –
            das sind ${U.eur(info.tokenCa/1e6*5*0.92)} pro Frage, wenn sich nichts geändert hat, deutlich weniger.
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderSettings(){
    const s = Store.settings();
    const d = Store.data();
    return `
    <div class="page-head">
      <div><h1>Einstellungen</h1><div class="sub">Stammdaten, Konditionen, Sicherung</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Firmendaten</h3><div class="actions t-sub">stehen auf jedem Dokument</div></div>
        <div class="card-pad">
          <div class="row row-2">
            <div class="field"><label>Firma</label><input type="text" id="sFirma" value="${U.esc(s.firma)}"></div>
            <div class="field"><label>Inhaber</label><input type="text" id="sInhaber" value="${U.esc(s.inhaber)}"></div>
          </div>
          <div class="field"><label>Straße</label><input type="text" id="sStrasse" value="${U.esc(s.strasse)}"></div>
          <div class="row row-2">
            <div class="field"><label>PLZ</label><input type="text" id="sPlz" value="${U.esc(s.plz)}"></div>
            <div class="field"><label>Ort</label><input type="text" id="sOrt" value="${U.esc(s.ort)}"></div>
          </div>
          <div class="row row-2">
            <div class="field"><label>Telefon</label><input type="text" id="sTelefon" value="${U.esc(s.telefon)}"></div>
            <div class="field"><label>E-Mail</label><input type="text" id="sEmail" value="${U.esc(s.email)}"></div>
          </div>
          <div class="field"><label>Steuernummer</label><input type="text" id="sSteuernummer" value="${U.esc(s.steuernummer)}"></div>
          <div class="field"><label>Gläubiger-Identifikationsnummer</label>
            <input type="text" id="sGlaeubigerId" value="${U.esc(s.glaeubigerId||'')}" placeholder="DE98ZZZ09999999999">
            <div class="hint">Nur für Lastschrifteinzug. Kostenlos bei glaeubiger-id.bundesbank.de</div></div>
          <div class="row row-2">
            <div class="field"><label>IBAN</label><input type="text" id="sIban" value="${U.esc(s.iban)}"></div>
            <div class="field"><label>BIC</label><input type="text" id="sBic" value="${U.esc(s.bic)}"></div>
          </div>
          <div class="field"><label>Bank</label><input type="text" id="sBank" value="${U.esc(s.bank)}"></div>
          <div style="border-top:1px solid var(--line);margin:16px 0 14px;padding-top:16px">
            <h3 style="font-size:15px;margin-bottom:4px">Umsatzsteuer</h3>
            <div class="t-sub" style="line-height:1.6;margin-bottom:12px">
              Wechselst du hier, ändern sich sofort alle neuen Rechnungen: Steuerspalte,
              Summenblock und Fußzeile. <b>Bereits geschriebene Rechnungen bleiben, wie sie waren</b> –
              die dürfen sich nicht rückwirkend ändern.
            </div>
            <div class="field"><label>Wie versteuerst du</label>
              <select id="sKleinunternehmer" onchange="App.toggleUst(this.value)">
                <option value="ja" ${s.kleinunternehmer?'selected':''}>Kleinunternehmer nach § 19 UStG – keine Umsatzsteuer</option>
                <option value="nein" ${!s.kleinunternehmer?'selected':''}>Regelbesteuerung – Umsatzsteuer wird ausgewiesen</option>
              </select></div>
            <div id="ustFelder" style="${s.kleinunternehmer?'display:none':''}">
              <div class="row row-3">
                <div class="field"><label>Regelsatz %</label>
                  <input type="number" id="sUstSatz" value="${s.ustSatz}"></div>
                <div class="field"><label>Ermäßigt %</label>
                  <input type="number" id="sUstErm" value="${s.ustSatzErmaessigt}"></div>
                <div class="field"><label>Preise eingeben als</label>
                  <select id="sPreisBrutto">
                    <option value="netto" ${!s.preiseSindBrutto?'selected':''}>netto (üblich bei Geschäftskunden)</option>
                    <option value="brutto" ${s.preiseSindBrutto?'selected':''}>brutto (Endpreis inkl. USt)</option>
                  </select></div>
              </div>
              <div class="field"><label>USt-IdNr. <span class="t-sub">(falls vorhanden)</span></label>
                <input type="text" id="sUstId" value="${U.esc(s.ustId||'')}" placeholder="DE123456789"></div>
              <div class="card card-pad" style="background:var(--amber-bg);border:none;font-size:13px;line-height:1.7">
                <b>Bevor du umstellst, sprich mit dem Steuerberater.</b> Er klärt den richtigen Zeitpunkt,
                ob du monatlich oder vierteljährlich voranmelden musst, und ob Ist- oder Soll-Versteuerung
                für dich günstiger ist. Und eine Sache betrifft deine Kunden direkt: Restaurants ziehen die
                Vorsteuer ab, für die ändert sich nichts – dann kannst du die 19 % einfach draufschlagen.
                Bei Privatkunden wird es dagegen teurer, da musst du entscheiden ob du den Preis hältst.
              </div>
            </div>
            <div class="field" style="margin-top:14px"><label>Hinweis auf dem Dokument (nur bei § 19)</label>
              <input type="text" id="sUst" value="${U.esc(s.ustHinweis)}"></div>
          </div>
          <button class="btn btn-primary" onclick="App.saveSettings()">Speichern</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        ${typeof Aussehen !== 'undefined' ? Aussehen.settingsCard() : ''}

        ${typeof Sperre !== 'undefined' ? Sperre.settingsCard() : ''}

        ${assistCard(s)}

        ${Sync.settingsCard()}

        <div class="card">
          <div class="card-head"><h3>Konditionen &amp; Arbeit</h3></div>
          <div class="card-pad">
            <div class="row row-2">
              <div class="field"><label>Zahlungsziel Rechnung (Tage)</label>
                <input type="number" id="sZahlungsziel" value="${s.zahlungszielTage}"></div>
              <div class="field"><label>Gültigkeit KV (Tage)</label>
                <input type="number" id="sKvGueltig" value="${s.kvGueltigTage}"></div>
            </div>
            <div class="row row-2">
              <div class="field"><label>Mahngebühr €</label>
                <input type="number" id="sMahngebuehr" value="${s.mahngebuehr}" step="1"></div>
              <div class="field"><label>Stundensatz €</label>
                <input type="number" id="sStundensatz" value="${s.stundensatz}" step="5"></div>
            </div>
            <div class="row row-2">
              <div class="field"><label>Kapazität Std./Woche</label>
                <input type="number" id="sKapazitaet" value="${s.kapazitaetStd}">
                <div class="hint">Wie viele Stunden du realistisch arbeiten kannst</div></div>
              <div class="field"><label>Umsatzziel Jahr €</label>
                <input type="number" id="sZiel" value="${s.umsatzzielJahr}" step="1000"></div>
            </div>
            <div class="row row-2">
              <div class="field"><label>Steuer-Rücklage %</label>
                <input type="number" id="sRuecklage" value="${s.ruecklageProzent}"></div>
              <div class="field"><label>Kunde gilt als schlafend nach (Tage)</label>
                <input type="number" id="sReaktivierung" value="${s.reaktivierungTage}"></div>
            </div>
            <div class="row row-3">
              <div class="field"><label>Kilometerpauschale €</label>
                <input type="number" id="sKm" value="${s.kmPauschale}" step="0.05">
                <div class="hint">pro gefahrenem km</div></div>
              <div class="field"><label>Freie Korrekturrunden</label>
                <input type="number" id="sSchleifen" value="${s.freieSchleifen}">
                <div class="hint">danach wird berechnet</div></div>
              <div class="field"><label>Anzahlung %</label>
                <input type="number" id="sAnzProzent" value="${s.anzahlungProzent}">
                <div class="hint">ab ${U.eur0(s.anzahlungAbEuro)} Auftragswert</div></div>
            </div>
            <button class="btn btn-primary" onclick="App.saveSettings()">Speichern</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Daten &amp; Sicherung</h3></div>
          <div class="card-pad">
            <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);margin-bottom:14px">
              Alle Daten liegen <b>nur in diesem Browser</b> auf diesem Rechner – nichts geht ins Netz.
              Das heißt aber auch: Browserdaten löschen = alles weg. Mach regelmäßig ein Backup.<br>
              <span class="t-sub">Stand: ${d.customers.length} Kunden · ${d.documents.length} Dokumente ·
              ${d.expenses.length} Ausgaben · ${d.projects.length} Projekte${
                Finance.fotoSize() ? ` · ${Math.round(Finance.fotoSize()/1024)} KB Belegfotos` : ''}</span>
            </div>
            ${Finance.fotoSize() > 2.5*1024*1024 ? `<div class="card card-pad" style="background:var(--amber-bg);border:none;margin-bottom:14px">
              <div class="t-strong" style="margin-bottom:4px">Belegfotos brauchen viel Platz</div>
              <div class="t-sub" style="line-height:1.6;margin-bottom:9px">
                ${Math.round(Finance.fotoSize()/1024/1024*10)/10} MB. Der Browser gibt jeder Seite nur begrenzt Speicher.
                Mach ein Backup (da sind die Bilder drin) und räum dann die Fotos vom Vorjahr weg.</div>
              <button class="btn btn-sm" onclick="Finance.clearFotos(${new Date().getFullYear()-1})">
                Fotos aus ${new Date().getFullYear()-1} entfernen</button>
            </div>`:''}
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
              <button class="btn btn-primary" onclick="Store.exportBackup()">Backup herunterladen</button>
              <button class="btn" onclick="document.getElementById('restoreFile').click()">Backup einspielen</button>
              <input type="file" id="restoreFile" accept=".json" style="display:none" onchange="App.restoreFile(this)">
            </div>
            ${Store.snapshots().length ? `<div class="t-sub" style="margin-bottom:6px">Automatische Sicherungen im Browser:</div>
              ${Store.snapshots().slice().reverse().map(s2=>`<div style="display:flex;gap:10px;align-items:center;padding:4px 0;font-size:13px">
                <span>${U.de(s2.date)}</span>
                <button class="btn btn-sm" style="margin-left:auto" onclick="App.restoreSnapshot('${s2.date}')">Wiederherstellen</button>
              </div>`).join('')}`:''}
            <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
              <button class="btn btn-danger" onclick="App.reset()">Alle Daten löschen</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function toggleUst(v){
    const box = document.getElementById('ustFelder');
    if (box) box.style.display = v === 'ja' ? 'none' : '';
  }

  function saveSettings(){
    const v = k => (document.getElementById(k)||{}).value;
    const patch = {};
    const map = { sFirma:'firma', sInhaber:'inhaber', sStrasse:'strasse', sPlz:'plz', sOrt:'ort',
      sTelefon:'telefon', sEmail:'email', sSteuernummer:'steuernummer', sIban:'iban', sBic:'bic',
      sBank:'bank', sUst:'ustHinweis', sGlaeubigerId:'glaeubigerId' };
    Object.entries(map).forEach(([id,key]) => { if (v(id) !== undefined) patch[key] = v(id); });
    const nums = { sZahlungsziel:'zahlungszielTage', sKvGueltig:'kvGueltigTage', sMahngebuehr:'mahngebuehr',
      sStundensatz:'stundensatz', sKapazitaet:'kapazitaetStd', sZiel:'umsatzzielJahr',
      sRuecklage:'ruecklageProzent', sReaktivierung:'reaktivierungTage',
      sKm:'kmPauschale', sSchleifen:'freieSchleifen', sAnzProzent:'anzahlungProzent',
      sUstSatz:'ustSatz', sUstErm:'ustSatzErmaessigt' };
    Object.entries(nums).forEach(([id,key]) => { if (v(id) !== undefined) patch[key] = U.parseNum(v(id)); });
    if (v('sKleinunternehmer') !== undefined) patch.kleinunternehmer = v('sKleinunternehmer') === 'ja';
    if (v('sPreisBrutto') !== undefined)      patch.preiseSindBrutto = v('sPreisBrutto') === 'brutto';
    if (v('sUstId') !== undefined)            patch.ustId = v('sUstId');
    if (v('sKiKey') !== undefined)            patch.kiKey = (v('sKiKey')||'').trim();
    if (v('sKiModell') !== undefined)         patch.kiModell = v('sKiModell');
    if (v('sKiEffort') !== undefined)         patch.kiEffort = v('sKiEffort');
    const vorher = Store.settings().kleinunternehmer;
    Store.setSetting(patch);
    if (vorher !== patch.kleinunternehmer){
      UI.toast(patch.kleinunternehmer
        ? 'Umgestellt auf § 19 – neue Rechnungen ohne Umsatzsteuer'
        : `Umgestellt auf Regelbesteuerung – neue Rechnungen mit ${patch.ustSatz||19} % USt`, 'ok', 6000);
    }
    UI.toast('Einstellungen gespeichert','ok'); rerender();
  }

  function restoreFile(input){
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = e => {
      UI.confirm('Backup einspielen? Die aktuellen Daten werden dabei ersetzt.', () => {
        try { Store.importBackup(e.target.result, 'replace'); UI.toast('Backup eingespielt','ok'); rerender(); }
        catch(err){ UI.toast(err.message,'err'); }
      }, {yes:'Ja, ersetzen'});
    };
    r.readAsText(f);
    input.value = '';
  }

  function restoreSnapshot(date){
    UI.confirm(`Stand vom ${U.de(date)} wiederherstellen? Aktuelle Daten werden ersetzt.`, () => {
      Store.restoreSnapshot(date); UI.toast('Wiederhergestellt','ok'); rerender();
    }, {yes:'Wiederherstellen'});
  }

  function reset(){
    UI.confirm('Wirklich ALLE Daten löschen? Rechnungen, Kunden, Ausgaben – alles weg. Vorher Backup machen!', () => {
      Store.factoryReset(true); UI.toast('Zurückgesetzt'); location.hash = '#/dashboard'; rerender();
    }, {yes:'Ja, alles löschen'});
  }

  /* ================= SUCHE ================= */
  function search(q){
    const box = document.getElementById('searchResults');
    q = q.trim().toLowerCase();
    if (q.length < 2){ box.classList.remove('show'); return; }
    const res = [];
    Store.all('customers').filter(c => (c.firma+' '+c.kuerzel+' '+c.ort+' '+c.nr).toLowerCase().includes(q))
      .slice(0,5).forEach(c => res.push({kind:'Kunde', label:c.firma, sub:c.ort||c.nr, go:`location.hash='#/kunde/${c.id}'`}));
    Store.all('documents').filter(d => (d.nummer+' '+(d.betreff||'')+' '+Store.custName(d.customerId)).toLowerCase().includes(q))
      .slice(0,5).forEach(d => res.push({kind:UI.docLabel(d.typ), label:d.nummer+' · '+Store.custName(d.customerId),
        sub:U.eur(Store.docTotal(d)), go:`Documents.open('${d.id}')`}));
    Store.all('projects').filter(p => (p.titel+' '+(p.typ||'')).toLowerCase().includes(q))
      .slice(0,4).forEach(p => res.push({kind:'Projekt', label:p.titel, sub:Store.custName(p.customerId),
        go:`Projects.edit('${p.id}')`}));

    box.innerHTML = res.length
      ? res.map(r => `<div class="sr-item" onclick="App.goSearch(&quot;${r.go.replace(/"/g,'&quot;')}&quot;)">
          <span class="sr-kind">${U.esc(r.kind)}</span>
          <div style="flex:1;min-width:0"><div class="t-strong">${U.esc(r.label)}</div>
            <div class="t-sub">${U.esc(r.sub||'')}</div></div></div>`).join('')
      : `<div class="sr-item"><span class="t-sub">Nichts gefunden für „${U.esc(q)}"</span></div>`;
    box.classList.add('show');
  }
  function goSearch(code){
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('globalSearch').value = '';
    try { eval(code); } catch(e){ console.error(e); }
  }

  /* ================= KOPFZEILE ================= */
  /* Rechts oben: was diesen Monat hängen geblieben ist, was ansteht,
     hell/dunkel und ein Knopf, der alles Neue anlegt. */

  const ICON = {
    glocke: 'M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.63 5.36 6 7.92 6 11v5l-1.7 1.7a1 1 0 00.7 1.7h14a1 1 0 00.7-1.7L18 16z',
    plus:   'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
    pfeil:  'M7 10l5 5 5-5z',
    beleg:  'M6 2h9l5 5v15H6zM14 3v5h5',
    person: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-7 2-7 4.5V21h14v-2.5C19 16 16 14 12 14z',
    euro:   'M15 18.5A6.5 6.5 0 018.6 13H14v-2H8.5v-1H14V8H8.6A6.5 6.5 0 0115 3.5c1.6 0 3 .6 4.1 1.5l1.4-1.5A8.5 8.5 0 0015 1.5 8.5 8.5 0 006.5 8H4v2h2.2v1H4v2h2.5a8.5 8.5 0 008.5 8.5c2 0 3.8-.7 5.2-1.9l-1.4-1.5c-1 .9-2.4 1.4-3.8 1.4z',
    uhr:    'M12 2a10 10 0 100 20 10 10 0 000-20zm1 10.6l4 2.3-.8 1.4-5.2-3V6h2z',
    kalender:'M7 2v2H5a2 2 0 00-2 2v13a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z'
  };
  const svg = (d, extra='') => `<svg viewBox="0 0 24 24" ${extra}><path d="${d}"/></svg>`;

  function topbarRechts(){
    const jetzt  = U.monthKey(U.today());
    const m      = Finance.monatsZahlen(jetzt);
    const offen  = Agenda.build().filter(t => t.prio === 1).length;

    /* Kleine Linie: die letzten sechs Monate Gewinn */
    let funke = '';
    if (typeof Chart !== "undefined"){
      const werte = [];
      for (let i = 5; i >= 0; i--){
        const k = U.monthKey(U.addMonths(U.today(), -i));
        werte.push(Finance.monatsZahlen(k).gewinn);
      }
      if (werte.some(w => w)) funke = `<span class="funke">${Chart.funke(werte)}</span>`;
    }

    const richtung = m.gewinn > 0 ? 'plus' : m.gewinn < 0 ? 'minus' : '';

    return `
      <div class="tb-monat ${richtung}" onclick="location.hash='#/auswertung'"
           title="Diesen Monat eingenommen minus ausgegeben – klick für die ganze Auswertung">
        <div>
          <div class="lbl">${U.monatLang(jetzt).split(' ')[0]} · bleibt dir</div>
          <div class="wert">${U.eur0(m.gewinn)}</div>
        </div>
        ${funke}
      </div>

      <div class="tb-trenn"></div>

      <button class="tb-rund" onclick="location.hash='#/aufgaben'" title="Was heute ansteht">
        ${svg(ICON.glocke)}
        <span class="tb-punkt ${offen ? 'show' : ''}">${offen}</span>
      </button>

      <button class="tb-rund" onclick="Aussehen.umschalten()" title="Hell oder dunkel">
        <svg viewBox="0 0 24 24" class="s-hell"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4l2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
        <svg viewBox="0 0 24 24" class="s-dunkel"><path d="M12.3 3a9 9 0 108.7 11.4A7.2 7.2 0 0112.3 3z"/></svg>
      </button>

      <div class="tb-neu">
        <button class="btn btn-primary" onclick="App.neuMenu(event)">
          ${svg(ICON.plus)} Neu ${svg(ICON.pfeil)}
        </button>
        <div class="tb-menu" id="tbMenu">
          <button onclick="App.neuTun(&quot;Documents.newDoc('rechnung')&quot;)">${svg(ICON.beleg)} Rechnung schreiben</button>
          <button onclick="App.neuTun(&quot;Documents.newDoc('kv')&quot;)">${svg(ICON.beleg)} Kostenvoranschlag</button>
          <div class="trenner"></div>
          <button onclick="App.neuTun('Customers.edit()')">${svg(ICON.person)} Kunde anlegen</button>
          <button onclick="App.neuTun('Projects.edit()')">${svg(ICON.uhr)} Auftrag anlegen</button>
          <button onclick="App.neuTun('Finance.editExpense()')">${svg(ICON.euro)} Ausgabe buchen</button>
          <button onclick="App.neuTun('Cal.edit()')">${svg(ICON.kalender)} Termin eintragen</button>
        </div>
      </div>`;
  }

  function paintTopbar(){
    /* Beim Neuzeichnen ist das alte Menü weg – den Wächter mit aufräumen */
    if (menuWaechter){ document.removeEventListener('click', menuWaechter); menuWaechter = null; }
    const box = document.getElementById('topbarRechts');
    if (box) box.innerHTML = topbarRechts();
    const t = document.getElementById('suchTaste');
    if (t && !/Mac|iPhone|iPad/.test(navigator.platform || '')) t.textContent = 'Strg K';
  }

  /* Der öffnende Klick wird gestoppt, darum sieht der Wächter unten
     erst den nächsten Klick – kein setTimeout nötig. */
  let menuWaechter = null;
  function menuZu(){
    const m = document.getElementById('tbMenu');
    if (m) m.classList.remove('auf');
    if (menuWaechter){ document.removeEventListener('click', menuWaechter); menuWaechter = null; }
  }
  function neuMenu(ev){
    ev.stopPropagation();
    const m = document.getElementById('tbMenu');
    if (!m) return;
    const auf = m.classList.toggle('auf');
    if (menuWaechter){ document.removeEventListener('click', menuWaechter); menuWaechter = null; }
    if (auf){
      menuWaechter = e => {
        if (e.target.closest('.tb-neu')) return;
        m.classList.remove('auf');
        document.removeEventListener('click', menuWaechter);
        menuWaechter = null;
      };
      document.addEventListener('click', menuWaechter);
    }
  }
  function neuTun(code){
    menuZu();
    try { eval(code); } catch(e){ console.error(e); UI.toast('Geht gerade nicht', 'warn'); }
  }

  /* ================= ROUTER ================= */
  const ROUTES = {
    dashboard:   renderDashboard,
    assistent:   () => Assist.render(),
    aufgaben:    renderTasks,
    posteingang: () => Inbox.render(),
    kontoabgleich: () => Bank.render(),
    lastschrift: () => Sepa.render(),
    kunden:      () => Customers.render(),
    kunde:       () => Customers.detail(param),
    projekte:    () => Projects.render(),
    zeiten:      () => Projects.renderTimes(),
    dokumente:   () => Documents.render(),
    abos:        () => Documents.renderRecurring(),
    ausgaben:    () => Finance.renderExpenses(),
    steuer:      () => Finance.renderTax(),
    auswertung:  () => Finance.renderReport(),
    lohnt:       () => Analysis.render(),
    ampel:       () => Analysis.renderAmpel(),
    termine:     () => Cal.render(),
    fahrten:     () => Trips.render(),
    preise:      () => Knowledge.renderPreise(),
    vorlagen:    () => Knowledge.renderTemplates(),
    kampagnen:   () => Campaigns.render(),
    kiekmolin:   () => KMI.render(),
    agentur:     () => AG.render(),
    wachstum:    () => Growth.render(),
    einstellungen: renderSettings
  };

  function parseHash(){
    const h = (location.hash || '#/dashboard').replace(/^#\//,'');
    const parts = h.split('/');
    route = parts[0] || 'dashboard';
    param = parts[1] || '';
    if (!ROUTES[route]) route = 'dashboard';
  }

  function rerender(){
    parseHash();
    document.getElementById('view').innerHTML = ROUTES[route]();
    document.querySelectorAll('#nav a').forEach(a => {
      const r = a.dataset.route;
      a.classList.toggle('active', r === route || (route==='kunde' && r==='kunden'));
    });
    // Aufgaben-Badge
    const offen = Agenda.build().filter(t => t.prio === 1).length;
    const badge = document.getElementById('navBadgeTasks');
    if (badge){ badge.textContent = offen; badge.classList.toggle('show', offen > 0); }
    const inboxOffen = Store.all('inbox').filter(i => i.status !== 'erledigt').length;
    const bi = document.getElementById('navBadgeInbox');
    if (bi){ bi.textContent = inboxOffen; bi.classList.toggle('show', inboxOffen > 0); }
    if (typeof Sepa !== 'undefined'){
      /* Fällige Abos, wartende Einzüge und Rückläufer zusammen */
      const sepaOffen = Sepa.faelligeAbos().length + Sepa.einzugsfaehig().length
        + Store.all('documents').filter(d => d.einzug === 'zurueck' && Store.isOpenInvoice(d)).length;
      const bs = document.getElementById('navBadgeSepa');
      if (bs){ bs.textContent = sepaOffen; bs.classList.toggle('show', sepaOffen > 0); }
    }
    paintTopbar();
    UI.refreshBackupHint();
    Sync.paint();
    document.body.classList.remove('nav-open');
    window.scrollTo(0,0);
  }

  /* ================= AUTOMATIK BEIM START ================= */
  function autorun(){
    const meta = Store.data().meta;
    if (meta.lastAutorun === U.today()) return;

    // Rechnungen ohne Fälligkeit nachziehen
    Store.all('documents').filter(d => Store.isInvoice(d) && !d.faellig).forEach(d => {
      d.faellig = U.dueDate(d.datum, Store.settings().zahlungszielTage);
    });
    // Abgelaufene KV markieren
    Store.all('documents').filter(d => (d.typ==='kv'||d.typ==='angebot') && !d.gueltigBis).forEach(d => {
      d.gueltigBis = U.dueDate(d.datum, Store.settings().kvGueltigTage);
    });

    meta.lastAutorun = U.today();
    Store.snapshot();
    Store.save();
  }

  /* ================= START ================= */
  function init(){
    Store.load();
    /* Erscheinungsbild vor dem ersten Zeichnen setzen, sonst blitzt es hell auf */
    if (typeof Aussehen !== 'undefined') Aussehen.init();
    /* Sperre vor allem anderen – erst die PIN, dann die Zahlen */
    if (typeof Sperre !== 'undefined') Sperre.init();
    autorun();
    Sync.init();
    window.addEventListener('hashchange', rerender);

    const si = document.getElementById('globalSearch');
    si.addEventListener('input', e => search(e.target.value));
    si.addEventListener('blur', () => setTimeout(()=>document.getElementById('searchResults').classList.remove('show'), 180));
    document.addEventListener('keydown', e => {
      if ((e.metaKey||e.ctrlKey) && e.key === 'k'){ e.preventDefault(); si.select(); si.focus(); }
      if (e.key === 'Escape'){
        menuZu();
        if (document.activeElement === si){ si.value=''; si.blur();
          document.getElementById('searchResults').classList.remove('show'); }
      }
    });

    rerender();

    const heute = Agenda.build().filter(t => t.prio===1).length;
    if (heute) setTimeout(() => UI.toast(`${heute} Sachen stehen heute an – schau unter „Was ist dran"`), 900);
  }

  return { init, rerender, search, goSearch, newTodo, saveTodo, doneTodo, markFollowUp, toggleUst,
           setDiaZeitraum, paintTopbar, neuMenu, neuTun,
           saveSettings, restoreFile, restoreSnapshot, reset, Agenda };
})();

document.addEventListener('DOMContentLoaded', App.init);
