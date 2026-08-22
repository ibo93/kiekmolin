/* ==========================================================
   Kurani CRM – Geld
   Ausgaben · EÜR · Steuer · Auswertung
   Hinweis: Rechenhilfe, kein Ersatz für den Steuerberater.
   ========================================================== */
const Finance = (() => {

  let jahr = new Date().getFullYear();

  /* ---------- Basiszahlen ---------- */
  const bezahlteRechnungen = y => Store.all('documents').filter(d =>
    Store.isInvoice(d) && d.status==='bezahlt' && U.yearOf(d.bezahltAm||d.datum)===y);
  // Brutto = was auf dem Konto landete (Zufluss-Prinzip)
  const einnahmen = y => U.sum(bezahlteRechnungen(y), Store.docTotal);
  // Netto = dein tatsächlicher Umsatz, ohne die USt die dem Finanzamt gehört
  const einnahmenNetto = y => U.sum(bezahlteRechnungen(y), Store.docNetto);
  // Vereinnahmte Umsatzsteuer = deine Zahllast ans Finanzamt (ohne Vorsteuer)
  const ustEinnahmen = y => U.sum(bezahlteRechnungen(y), Store.docUst);
  const ausgaben = y => U.sum(Store.all('expenses').filter(e => U.yearOf(e.datum)===y), e => U.parseNum(e.betrag));
  // Kilometerpauschale ist ebenfalls Betriebsausgabe, hat aber keinen Beleg
  const fahrtkosten = y => (typeof Trips !== 'undefined' ? Trips.wertJahr(y) : 0);
  const betriebsausgaben = y => ausgaben(y) + fahrtkosten(y);
  // Bei Regelbesteuerung ist die USt durchlaufend – sie gehört nicht zum Gewinn
  const gewinn = y => (Store.settings().kleinunternehmer ? einnahmen(y) : einnahmenNetto(y)) - betriebsausgaben(y);
  const offenGesamt = () => U.sum(Store.all('documents').filter(Store.isOpenInvoice), Store.docOpen);

  /* ---------- Zahlen für einen einzelnen Monat ----------
     monat = 'JJJJ-MM'. Rechnet wie das Jahr, nur enger gefasst:
     Einnahme zählt am Tag des Geldeingangs, nicht am Rechnungsdatum. */
  function monatsZahlen(monat){
    const s = Store.settings();
    const bezahlt = Store.all('documents').filter(d =>
      Store.isInvoice(d) && d.status === 'bezahlt' && U.monthKey(d.bezahltAm || d.datum) === monat);

    const brutto = U.sum(bezahlt, Store.docTotal);
    const netto  = U.sum(bezahlt, Store.docNetto);
    const ust    = U.sum(bezahlt, Store.docUst);

    const belege = U.sum(Store.all('expenses').filter(e => U.monthKey(e.datum) === monat),
                         e => U.parseNum(e.betrag));
    const fahrten = (typeof Trips !== 'undefined')
      ? U.sum(Store.all('trips').filter(t => U.monthKey(t.datum) === monat), Trips.wert) : 0;
    const aus = belege + fahrten;

    /* Bei Regelbesteuerung gehört die Umsatzsteuer nicht dir – sie ist durchlaufend */
    const umsatz = s.kleinunternehmer ? brutto : netto;

    return {
      monat, brutto, netto, ust, umsatz,
      ausgaben: aus, belege, fahrten,
      gewinn: umsatz - aus,
      anzahl: bezahlt.length,
      rechnungen: bezahlt
    };
  }

  /* Was in dem Monat noch aussteht: gestellt, aber nicht bezahlt */
  function monatsOffen(monat){
    const offen = Store.all('documents').filter(d =>
      Store.isOpenInvoice(d) && U.monthKey(d.datum) === monat);
    return { betrag: U.sum(offen, Store.docOpen), anzahl: offen.length };
  }

  function monthly(y){
    return U.MONTHS.map((m,i) => {
      const key = `${y}-${String(i+1).padStart(2,'0')}`;
      const ein = U.sum(Store.all('documents').filter(d => Store.isInvoice(d) && d.status==='bezahlt' &&
        U.monthKey(d.bezahltAm||d.datum)===key), Store.docTotal);
      const aus = U.sum(Store.all('expenses').filter(e => U.monthKey(e.datum)===key), e=>U.parseNum(e.betrag))
                + (typeof Trips !== 'undefined' ? U.sum(Store.all('trips').filter(t => U.monthKey(t.datum)===key), Trips.wert) : 0);
      return { label:m, key, ein, aus, gewinn: ein-aus };
    });
  }

  /* ================= AUSGABEN ================= */
  function renderExpenses(){
    const es = U.sortBy(Store.all('expenses').filter(e => U.yearOf(e.datum)===jahr), e=>e.datum, 'desc');
    const proKat = U.groupBy(es, e => e.kategorie || 'Sonstiges');
    const gesamt = U.sum(es, e => U.parseNum(e.betrag));
    const ohneBeleg = es.filter(e => !e.beleg).length;

    return `
    <div class="page-head">
      <div><h1>Ausgaben</h1>
        <div class="sub">${U.eur(gesamt)} in ${jahr} · ${es.length} Belege${ohneBeleg?` · <span style="color:var(--amber)">${ohneBeleg} ohne Beleg</span>`:''}</div></div>
      <div class="actions">
        ${yearSelect()}
        <button class="btn" onclick="Finance.exportExpenses()">CSV</button>
        <button class="btn btn-primary" onclick="Finance.editExpense()">+ Ausgabe</button>
      </div>
    </div>

    <div class="grid grid-2-1">
      <div class="card table-wrap">
        ${es.length ? `<table>
          <thead><tr><th>Datum</th><th>Wofür</th><th>Kategorie</th><th class="num">Betrag</th><th>Beleg</th><th></th></tr></thead>
          <tbody>${es.map(e => `<tr class="clickable" onclick="Finance.editExpense('${e.id}')">
            <td class="t-sub">${U.de(e.datum)}</td>
            <td><div class="t-strong">${U.esc(e.haendler||'–')}</div>
              ${e.projectId ? `<div class="t-sub">${U.esc(Store.custName(
                  (Store.byId('projects', e.projectId)||{}).customerId))} · ${U.esc(Store.projName(e.projectId))}</div>`
                : '<div class="t-sub">keinem Auftrag zugeordnet</div>'}
              ${e.notiz?`<div class="t-sub">${U.esc(U.cut(e.notiz,50))}</div>`:''}</td>
            <td class="t-sub">${U.esc(e.kategorie||'–')}</td>
            <td class="num t-strong">${U.eur(e.betrag)}</td>
            <td>${e.foto ? '<span class="badge green">Foto</span>'
                          : e.beleg ? '<span class="badge green">da</span>' : '<span class="badge amber">fehlt</span>'}</td>
            <td style="text-align:right" onclick="event.stopPropagation()">
              <button class="pos-del" onclick="Finance.delExpense('${e.id}')">✕</button></td>
          </tr>`).join('')}</tbody></table>`
        : UI.empty('Noch keine Ausgaben erfasst für '+jahr+'.',
            `<button class="btn btn-primary" onclick="Finance.editExpense()">+ Erste Ausgabe</button>`)}
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:12px">Nach Kategorie</h3>
          ${Object.keys(proKat).length ? U.sortBy(Object.entries(proKat), ([,v])=>U.sum(v,e=>U.parseNum(e.betrag)),'desc')
            .map(([k,v]) => {
              const s = U.sum(v, e=>U.parseNum(e.betrag));
              return `<div style="margin-bottom:11px">
                <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:3px">
                  <span>${U.esc(k)}</span><span class="t-strong">${U.eur(s)}</span></div>
                <div class="progress" style="margin:0"><span style="width:${(s/gesamt*100)}%"></span></div>
              </div>`;
            }).join('') : '<div class="t-sub">Noch nichts erfasst.</div>'}
        </div>

        <div class="card card-pad" style="background:var(--card-weich)">
          <h3 style="font-size:15px;margin-bottom:8px">Nicht vergessen</h3>
          <div style="font-size:13px;line-height:1.7;color:var(--ink-soft)">
            Handy, Internet, Software-Abos (Canva, Adobe, Higgsfield), Fahrten zu Kunden,
            Druckmaterial, Werbung, Porto, Fachliteratur, Arbeitszimmer-Anteil.
            <br><br>Belege sammeln – ohne Beleg keine Betriebsausgabe.
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------- Belegfoto ---------- */
  let fotoBuffer = null;   // Data-URL des gerade gewählten Bildes

  function compress(file, maxSide=1200, quality=0.6){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Das ist kein lesbares Bild'));
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  async function onPhoto(input){
    const f = input.files[0];
    if (!f) return;
    const box = document.getElementById('eFotoBox');
    box.innerHTML = `<span class="t-sub">verkleinere Bild …</span>`;
    try {
      fotoBuffer = await compress(f);
      paintFoto();
      const kb = Math.round(fotoBuffer.length * 0.75 / 1024);
      UI.toast(`Beleg übernommen (${kb} KB)`, 'ok');
      document.getElementById('eBeleg').checked = true;
    } catch(err){
      box.innerHTML = `<span class="t-sub" style="color:var(--red)">${U.esc(err.message)}</span>`;
    }
    input.value = '';
  }

  function paintFoto(){
    const box = document.getElementById('eFotoBox');
    if (!box) return;
    box.innerHTML = fotoBuffer
      ? `<div style="display:flex;gap:10px;align-items:flex-start">
           <img src="${fotoBuffer}" style="width:86px;height:86px;object-fit:cover;border-radius:9px;
             border:1px solid var(--line);cursor:pointer" onclick="Finance.showFoto()">
           <div>
             <div class="t-sub" style="margin-bottom:6px">Beleg hängt am Datensatz</div>
             <button class="btn btn-sm" onclick="Finance.showFoto()">Groß ansehen</button>
             <button class="btn btn-sm btn-danger" onclick="Finance.dropFoto()">Entfernen</button>
           </div>
         </div>`
      : `<button class="btn btn-sm" onclick="document.getElementById('eFoto').click()">Beleg fotografieren / wählen</button>
         <div class="hint">Auf dem Handy geht direkt die Kamera auf. Das Bild wird klein gerechnet.</div>`;
  }
  function dropFoto(){ fotoBuffer = null; paintFoto(); }
  function showFoto(){
    if (!fotoBuffer) return;
    const w = window.open('');
    if (w) w.document.write(`<title>Beleg</title><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh">
      <img src="${fotoBuffer}" style="max-width:100%;max-height:100vh"></body>`);
    else UI.toast('Popup wurde blockiert','err');
  }

  function editExpense(id=null){
    const e = id ? Store.byId('expenses', id) : {
      datum: U.today(), haendler:'', kategorie:'Material / Druck', betrag:'', notiz:'', beleg:true, projectId:''
    };
    fotoBuffer = e.foto || null;
    UI.modal({
      title: id?'Ausgabe bearbeiten':'Neue Ausgabe',
      body:`
        <div class="row row-2">
          <div class="field"><label>Datum</label><input type="date" id="eDatum" value="${U.esc(e.datum)}"></div>
          <div class="field"><label>Betrag €</label><input type="text" id="eBetrag" value="${e.betrag?U.num(e.betrag):''}" placeholder="0,00"></div>
        </div>
        <div class="field"><label>Beleg</label>
          <input type="file" id="eFoto" accept="image/*" capture="environment" style="display:none"
                 onchange="Finance.onPhoto(this)">
          <div id="eFotoBox"></div>
        </div>
        <div class="field"><label>Wofür / bei wem</label>
          <input type="text" id="eHaendler" value="${U.esc(e.haendler)}" placeholder="z.B. WIRmachenDRUCK, Adobe, Tankstelle"></div>
        <div class="row row-2">
          <div class="field"><label>Kategorie</label>
            <select id="eKat">${Store.EXPENSE_CATS.map(k=>`<option ${k===e.kategorie?'selected':''}>${k}</option>`).join('')}</select></div>
          <div class="field"><label>Projekt (optional)</label>
            <select id="eProj">${UI.projectOptions(e.projectId)}</select></div>
        </div>
        <div class="field"><label>Notiz</label><input type="text" id="eNotiz" value="${U.esc(e.notiz)}"></div>
        <label class="check"><input type="checkbox" id="eBeleg" ${e.beleg?'checked':''}> Beleg vorhanden / abgeheftet</label>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Finance.delExpense('${id}',true)">Löschen</button>`:''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Finance.saveExpense('${id||''}')">Speichern</button>`
    });
    setTimeout(paintFoto, 40);
  }

  function saveExpense(id){
    const v = k => document.getElementById(k).value;
    const patch = {
      datum: v('eDatum'), betrag: U.parseNum(v('eBetrag')), haendler: v('eHaendler').trim(),
      kategorie: v('eKat'), projectId: v('eProj'), notiz: v('eNotiz').trim(),
      beleg: document.getElementById('eBeleg').checked,
      foto: fotoBuffer || null
    };
    if (!patch.betrag){ UI.toast('Betrag fehlt','err'); return; }
    if (id) Store.update('expenses', id, patch); else Store.add('expenses', patch);
    UI.closeModal(); UI.toast('Ausgabe gespeichert','ok'); App.rerender();
  }

  function delExpense(id, fromModal=false){
    UI.confirm('Ausgabe löschen?', () => {
      Store.remove('expenses', id); if (fromModal) UI.closeModal(); UI.toast('Gelöscht'); App.rerender();
    });
  }

  function exportExpenses(){
    const rows = [['Datum','Wofür','Kategorie','Betrag','Beleg','Projekt','Notiz']];
    U.sortBy(Store.all('expenses').filter(e=>U.yearOf(e.datum)===jahr), e=>e.datum).forEach(e => rows.push([
      U.de(e.datum), e.haendler, e.kategorie, U.num(e.betrag), e.beleg?'ja':'nein',
      Store.projName(e.projectId), e.notiz
    ]));
    U.download(`Ausgaben_${jahr}.csv`, '﻿'+U.csv(rows), 'text/csv');
    UI.toast('CSV exportiert','ok');
  }

  /* ================= AUSWERTUNG ================= */
  function renderReport(){
    const ms = monthly(jahr);
    const ein = einnahmen(jahr), aus = betriebsausgaben(jahr), gew = gewinn(jahr);
    const ziel = Store.settings().umsatzzielJahr || 0;
    const zielPct = ziel ? Math.round(ein/ziel*100) : 0;

    // Top-Kunden
    const proKunde = U.sortBy(Store.all('customers').map(c => ({
      c, umsatz: Store.customerRevenue(c.id, jahr)
    })).filter(x => x.umsatz > 0), x => x.umsatz, 'desc').slice(0,8);

    // Nach Auftragstyp
    const typen = {};
    Store.all('documents').filter(d => Store.isInvoice(d) && d.status==='bezahlt' && U.yearOf(d.bezahltAm||d.datum)===jahr)
      .forEach(d => { const p = Store.byId('projects', d.projectId);
        const t = p?.typ || 'Ohne Zuordnung'; typen[t] = (typen[t]||0) + Store.docTotal(d); });

    // Zahlungsmoral
    const bez = Store.all('documents').filter(d => Store.isInvoice(d) && d.status==='bezahlt' && d.bezahltAm);
    const avgTage = bez.length ? Math.round(U.sum(bez, d => U.daysBetween(d.datum, d.bezahltAm))/bez.length) : 0;

    return `
    <div class="page-head">
      <div><h1>Auswertung ${jahr}</h1>
        <div class="sub">Alles was bezahlt wurde – so rechnet auch das Finanzamt (Zufluss)</div></div>
      <div class="actions">${yearSelect()}</div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi accent-green"><div class="label">Einnahmen</div><div class="value">${U.eur0(ein)}</div>
        <div class="foot">${bez.filter(d=>U.yearOf(d.bezahltAm)===jahr).length} bezahlte Rechnungen</div></div>
      <div class="kpi"><div class="label">Ausgaben</div><div class="value">${U.eur0(aus)}</div>
        <div class="foot">${Store.all('expenses').filter(e=>U.yearOf(e.datum)===jahr).length} Belege</div></div>
      <div class="kpi ${gew<0?'accent-red':''}"><div class="label">Gewinn</div><div class="value">${U.eur0(gew)}</div>
        <div class="foot">Einnahmen − Ausgaben</div></div>
      <div class="kpi"><div class="label">Noch offen</div><div class="value">${U.eur0(offenGesamt())}</div>
        <div class="foot">Ø ${avgTage} Tage bis Zahlung</div></div>
    </div>

    ${ziel ? `<div class="card card-pad" style="margin-bottom:18px">
      <div style="display:flex;gap:26px;align-items:center;flex-wrap:wrap">
        ${Chart.ring(ein, ziel, { titel:'vom Jahresziel', groesse:132 })}
        <div style="flex:1;min-width:230px">
          <h3 style="font-size:16px;margin-bottom:6px">Jahresziel ${jahr}</h3>
          <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;margin-bottom:4px">
            ${U.eur0(ein)} <span style="font-size:15px;color:var(--muted);font-family:'DM Sans',sans-serif">
              von ${U.eur0(ziel)}</span></div>
          <div class="t-sub" style="line-height:1.65">${zielCommentar(ein, ziel)}</div>
        </div>
      </div>
    </div>`:''}

    <div class="grid grid-2-1" style="margin-bottom:16px">
      <div class="card card-pad">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <h3 style="font-size:16px">Rein und raus je Monat</h3>
          <span class="t-sub">Gewinn = die Differenz</span>
        </div>
        ${Chart.balken(ms.map(m => ({ label:m.label, wert:m.ein, wert2:m.aus })),
          { label:'eingenommen', label2:'ausgegeben', hoehe:200, farbe2:'var(--red)' })}
        <div style="border-top:1px solid var(--line-soft);margin-top:16px;padding-top:14px">
          <div class="t-sub" style="margin-bottom:10px">Gewinnverlauf</div>
          ${Chart.verlauf(ms.map(m => ({ label:m.label, wert:Math.max(0, m.gewinn) })), { hoehe:140 })}
        </div>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:16px;margin-bottom:14px">Wer bringt das Geld</h3>
        ${Chart.verteilung(proKunde.map(x => ({ label:x.c.firma, wert:x.umsatz, id:x.c.id })),
          { klick: "location.hash='#/kunde/{id}'" })}
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card card-pad">
        <h3 style="font-size:16px;margin-bottom:14px">Womit verdienst du das Geld?</h3>
        ${Object.keys(typen).length
          ? Chart.verteilung(Object.entries(typen).map(([t,v]) => ({ label:t, wert:v })))
          : '<div class="t-sub">Ordne Rechnungen einem Projekt zu, dann siehst du hier die Verteilung.</div>'}
      </div>

      <div class="card card-pad">
        <h3 style="font-size:16px;margin-bottom:12px">Monatsübersicht</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Monat</th><th class="num">Ein</th><th class="num">Aus</th><th class="num">Gewinn</th></tr></thead>
          <tbody>${ms.filter(m=>m.ein||m.aus).map(m=>`<tr>
            <td>${m.label}</td><td class="num">${U.eur0(m.ein)}</td>
            <td class="num t-sub">${U.eur0(m.aus)}</td>
            <td class="num t-strong" style="color:${m.gewinn<0?'var(--red)':'inherit'}">${U.eur0(m.gewinn)}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="t-sub">Noch keine Bewegungen.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>`;
  }

  function zielCommentar(ein, ziel){
    const monat = new Date().getMonth() + 1;
    const soll = ziel / 12 * monat;
    const diff = ein - soll;
    if (diff >= 0) return `Du liegst ${U.eur0(diff)} <b>über</b> dem Schnitt für diese Jahreszeit. Weiter so – und Preise beim nächsten Auftrag ruhig testen.`;
    const proMonat = (ziel - ein) / Math.max(1, 12 - monat);
    return `Dir fehlen ${U.eur0(Math.abs(diff))} auf den Schnitt. Für das Ziel brauchst du ab jetzt ${U.eur0(proMonat)} pro Monat –
            das sind z.B. ${Math.ceil(proMonat/450)} Speisekarten oder ${Math.ceil(proMonat/249)} Content-Abos monatlich.`;
  }

  /* ================= STEUER ================= */
  function renderTax(){
    const s = Store.settings();
    const y = jahr, vy = jahr-1;
    const ein = einnahmen(y), aus = betriebsausgaben(y), gew = gewinn(y);
    const einVJ = einnahmen(vy);
    const ruecklage = Math.max(0, gew * (s.ruecklageProzent||25) / 100);
    const pctVJ = s.grenzeVorjahr ? Math.round(einVJ / s.grenzeVorjahr * 100) : 0;
    const pctLJ = s.grenzeLaufend ? Math.round(ein / s.grenzeLaufend * 100) : 0;
    const kritisch = pctVJ >= 80 || ein > s.grenzeVorjahr;

    return `
    <div class="page-head">
      <div><h1>Steuer</h1>
        <div class="sub">Einnahmen-Überschuss-Rechnung ${y} · Kleinunternehmer § 19 UStG</div></div>
      <div class="actions">
        ${yearSelect()}
        <button class="btn" onclick="Finance.exportEUR()">EÜR exportieren</button>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:18px;background:var(--card-weich)">
      <div style="font-size:13px;line-height:1.6;color:var(--muted)">
        Das hier ist deine laufende Rechenhilfe, damit du jederzeit weißt wo du stehst –
        <b>kein Ersatz für deinen Steuerberater</b>. Für die echte Erklärung nimmt er diese Zahlen als Grundlage.
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi accent-green"><div class="label">${s.kleinunternehmer?'Einnahmen':'Umsatz netto'} ${y}</div>
        <div class="value">${U.eur0(s.kleinunternehmer ? ein : einnahmenNetto(y))}</div>
        <div class="foot">${s.kleinunternehmer ? 'tatsächlich zugeflossen'
          : 'brutto '+U.eur0(ein)+' zugeflossen'}</div></div>
      <div class="kpi"><div class="label">Betriebsausgaben</div><div class="value">${U.eur0(aus)}</div>
        <div class="foot">${fahrtkosten(y) ? `davon ${U.eur0(fahrtkosten(y))} Fahrtkosten` : 'Belege erfasst'}</div></div>
      <div class="kpi"><div class="label">Gewinn (EÜR)</div><div class="value">${U.eur0(gew)}</div>
        <div class="foot">wird versteuert</div></div>
      <div class="kpi accent-amber"><div class="label">Rücklage empfohlen</div><div class="value">${U.eur0(ruecklage)}</div>
        <div class="foot">${s.ruecklageProzent}% vom Gewinn</div></div>
    </div>

    <div class="grid grid-2-1">
      <div style="display:flex;flex-direction:column;gap:16px">

        ${!s.kleinunternehmer ? `<div class="card">
          <div class="card-head"><h3>Umsatzsteuer ${y}</h3>
            <div class="actions"><span class="badge dark">Regelbesteuerung</span></div></div>
          <div class="card-pad">
            <div class="grid grid-3" style="margin-bottom:14px">
              <div class="kpi"><div class="label">Vereinnahmt</div><div class="value">${U.eur0(ustEinnahmen(y))}</div>
                <div class="foot">von Kunden kassiert</div></div>
              <div class="kpi"><div class="label">Dieses Quartal</div>
                <div class="value">${U.eur0(ustQuartal(y))}</div>
                <div class="foot">${quartalLabel()}</div></div>
              <div class="kpi accent-amber"><div class="label">Ans Finanzamt</div>
                <div class="value">${U.eur0(ustEinnahmen(y))}</div>
                <div class="foot">abzüglich Vorsteuer</div></div>
            </div>
            <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);background:var(--amber-bg);
                        padding:12px 14px;border-radius:10px">
              <b>Das Geld gehört dir nicht.</b> Die ${U.eur0(ustEinnahmen(y))}, die du von Kunden kassiert hast,
              gehen ans Finanzamt – abzüglich der Vorsteuer aus deinen eigenen Rechnungen (Druckerei, Material,
              Software). Die Vorsteuer rechnet dein Steuerberater aus den Belegen; hier steht bewusst nur die
              Seite, die du sicher kennst.<br><br>
              Leg die vereinnahmte Umsatzsteuer aufs zweite Konto, sonst fehlt sie bei der Voranmeldung.
            </div>
          </div>
        </div>` : ''}

        <div class="card" style="${s.kleinunternehmer?'':'display:none'}">
          <div class="card-head"><h3>Kleinunternehmer-Grenzen</h3></div>
          <div class="card-pad">
            <div style="margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:4px">
                <span>Umsatz ${vy} (Vorjahr) – Grenze ${U.eur0(s.grenzeVorjahr)}</span>
                <span class="t-strong">${U.eur0(einVJ)} · ${pctVJ}%</span></div>
              <div class="progress"><span class="${pctVJ>=100?'danger':pctVJ>=80?'warn':''}" style="width:${U.clamp(pctVJ,0,100)}%"></span></div>
            </div>
            <div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:4px">
                <span>Umsatz ${y} (laufend) – Grenze ${U.eur0(s.grenzeLaufend)}</span>
                <span class="t-strong">${U.eur0(ein)} · ${pctLJ}%</span></div>
              <div class="progress"><span class="${pctLJ>=100?'danger':pctLJ>=80?'warn':''}" style="width:${U.clamp(pctLJ,0,100)}%"></span></div>
            </div>
            <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);
                        background:${kritisch?'var(--amber-bg)':'var(--grey-bg)'};padding:12px 14px;border-radius:10px">
              ${kritisch
                ? `<b>Achtung:</b> Du kommst an die Grenze. Wenn der Vorjahresumsatz über ${U.eur0(s.grenzeVorjahr)} liegt,
                   fällt § 19 weg – dann musst du Umsatzsteuer ausweisen und abführen.
                   Sprich <b>rechtzeitig</b> mit dem Steuerberater, bevor die erste Rechnung falsch rausgeht.`
                : `Alles im grünen Bereich. Solange Vorjahr unter ${U.eur0(s.grenzeVorjahr)} und laufendes Jahr unter
                   ${U.eur0(s.grenzeLaufend)} bleibt, gilt § 19 weiter: keine Umsatzsteuer auf deinen Rechnungen –
                   aber auch kein Vorsteuerabzug.`}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Was gilt als Betriebsausgabe</h3></div>
          <div class="card-pad" style="font-size:13.5px;line-height:1.8;color:var(--ink-soft)">
            <b>Voll absetzbar:</b> Druck- und Materialkosten, Fremdleistungen (Druckerei, Werbetechniker),
            Software-Abos (Adobe, Canva, KI-Tools), Fachliteratur, Werbung, Porto, Büromaterial,
            Versicherungen fürs Gewerbe, Fortbildung.<br>
            <b>Anteilig:</b> Handy und Internet (geschäftlicher Anteil), Auto (Fahrtenbuch oder 0,30 €/km),
            Arbeitszimmer wenn abgetrennt.<br>
            <b>Teilweise:</b> Bewirtung von Geschäftspartnern (70%).<br>
            <b>Über 800 € netto:</b> nicht sofort – über die Nutzungsdauer abschreiben (z.B. Rechner, Kamera).<br>
            <b>Als Kleinunternehmer:</b> du buchst immer den Bruttobetrag, Vorsteuer gibt es für dich nicht.
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div class="card-head"><h3>Fristen ${y}</h3></div>
          <div>${fristen(y).map(f => {
            const tage = U.daysUntil(f.datum);
            const cls = tage < 0 ? 'grey' : tage <= 30 ? 'amber' : 'grey';
            return `<div class="task" style="padding:11px 16px">
              <div class="task-body">
                <div class="task-title" style="font-size:13.5px">${U.esc(f.was)}</div>
                <div class="task-sub">${U.de(f.datum)}${tage>=0?` · in ${tage} Tagen`:' · vorbei'}</div>
              </div>
              ${tage>=0&&tage<=30?`<div class="task-act"><span class="badge ${cls}">bald</span></div>`:''}
            </div>`;
          }).join('')}</div>
        </div>

        <div class="card card-pad">
          <h3 style="font-size:16px;margin-bottom:10px">Fürs Steuerberater-Gespräch</h3>
          <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft)">
            Mit einem Klick hast du alles beisammen: Einnahmen, Ausgaben nach Kategorie, offene Posten.
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">
            <button class="btn btn-sm btn-primary" onclick="Finance.exportEUR()">EÜR ${y} als CSV</button>
            <button class="btn btn-sm" onclick="Documents.exportCsv()">Rechnungen</button>
            <button class="btn btn-sm" onclick="Finance.exportExpenses()">Ausgaben</button>
          </div>
        </div>

        <div class="card card-pad" style="background:var(--amber-bg)">
          <h3 style="font-size:15px;margin-bottom:8px">Rücklage</h3>
          <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft)">
            Leg dir ${U.eur0(ruecklage)} zur Seite – Einkommensteuer kommt später, meist auf einen Schlag,
            plus Vorauszahlungen fürs nächste Jahr. Am einfachsten: zweites Konto, nach jeder bezahlten
            Rechnung ${s.ruecklageProzent}% rüberschieben.
          </div>
        </div>
      </div>
    </div>`;
  }

  function ustQuartal(y){
    const q = Math.floor(new Date().getMonth()/3);
    return U.sum(bezahlteRechnungen(y).filter(d => {
      const m = new Date(d.bezahltAm||d.datum).getMonth();
      return Math.floor(m/3) === q;
    }), Store.docUst);
  }
  const quartalLabel = () => 'Q' + (Math.floor(new Date().getMonth()/3)+1);

  function fristen(y){
    const s = Store.settings();
    const ustFristen = s.kleinunternehmer ? [] : [
      { datum:`${y}-01-10`, was:'Umsatzsteuer-Voranmeldung Q4 Vorjahr' },
      { datum:`${y}-04-10`, was:'Umsatzsteuer-Voranmeldung Q1' },
      { datum:`${y}-07-10`, was:'Umsatzsteuer-Voranmeldung Q2' },
      { datum:`${y}-10-10`, was:'Umsatzsteuer-Voranmeldung Q3' }
    ];
    return [...ustFristen,
      { datum:`${y}-03-10`, was:'Einkommensteuer-Vorauszahlung Q1' },
      { datum:`${y}-06-10`, was:'Einkommensteuer-Vorauszahlung Q2' },
      { datum:`${y}-07-31`, was:`Steuererklärung ${y-1} (ohne Berater)` },
      { datum:`${y}-09-10`, was:'Einkommensteuer-Vorauszahlung Q3' },
      { datum:`${y}-12-10`, was:'Einkommensteuer-Vorauszahlung Q4' },
      { datum:`${y}-12-31`, was:'Belege ablegen, Kasse abschließen' }
    ].sort((a,b) => a.datum.localeCompare(b.datum));
  }

  function exportEUR(){
    const y = jahr;
    const kl = Store.settings().kleinunternehmer;
    const rows = [['EÜR '+y+' – Kurani Design'],
                  [kl ? 'Kleinunternehmer nach § 19 UStG' : 'Regelbesteuerung mit Umsatzsteuer'],[],
                  ['EINNAHMEN'],
                  kl ? ['Datum','Rechnung','Kunde','Betrag']
                     : ['Datum','Rechnung','Kunde','Netto','USt','Brutto']];
    U.sortBy(bezahlteRechnungen(y), d=>d.bezahltAm||d.datum).forEach(d => rows.push(
      kl ? [U.de(d.bezahltAm||d.datum), d.nummer, Store.custName(d.customerId), U.num(Store.docTotal(d))]
         : [U.de(d.bezahltAm||d.datum), d.nummer, Store.custName(d.customerId),
            U.num(Store.docNetto(d)), U.num(Store.docUst(d)), U.num(Store.docTotal(d))]));
    rows.push([]);
    rows.push(kl ? ['Summe Einnahmen','','',U.num(einnahmen(y))]
                 : ['Summe','','',U.num(einnahmenNetto(y)), U.num(ustEinnahmen(y)), U.num(einnahmen(y))]);
    if (!kl) rows.push(['Hinweis','Die vereinnahmte Umsatzsteuer ist durchlaufend und kein Gewinn.']);
    rows.push([],['AUSGABEN'],['Datum','Wofür','Kategorie','Betrag']);
    U.sortBy(Store.all('expenses').filter(e=>U.yearOf(e.datum)===y), e=>e.datum)
      .forEach(e => rows.push([U.de(e.datum), e.haendler, e.kategorie, U.num(e.betrag)]));
    if (fahrtkosten(y)){
      rows.push([]);
      rows.push(['FAHRTKOSTEN (Kilometerpauschale)']);
      rows.push(['Datum','Strecke','Zweck','Betrag']);
      U.sortBy(Store.all('trips').filter(t=>U.yearOf(t.datum)===y), t=>t.datum).forEach(t =>
        rows.push([U.de(t.datum), (t.von||'')+' - '+(t.nach||'')+(t.hinRueck?' und zurueck':''),
                   t.zweck||'', U.num(Trips.wert(t))]));
      rows.push(['Summe Fahrtkosten','','',U.num(fahrtkosten(y))]);
    }
    rows.push([],['Summe Betriebsausgaben','','',U.num(betriebsausgaben(y))],[],['GEWINN','','',U.num(gewinn(y))]);
    rows.push([],['Hinweis', kl ? 'Kleinunternehmer § 19 UStG – keine Umsatzsteuer ausgewiesen'
                                 : 'Vorsteuer aus Eingangsrechnungen ist hier nicht enthalten – bitte über die Belege ermitteln']);
    U.download(`EUER_${y}_KuraniDesign.csv`, '﻿'+U.csv(rows), 'text/csv');
    UI.toast('EÜR exportiert','ok');
  }

  /* ---------- Jahres-Auswahl ---------- */
  function yearSelect(){
    const jahre = new Set([new Date().getFullYear()]);
    Store.all('documents').forEach(d => jahre.add(U.yearOf(d.datum)));
    Store.all('expenses').forEach(e => jahre.add(U.yearOf(e.datum)));
    return `<select onchange="Finance.setYear(this.value)" style="width:auto">
      ${[...jahre].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${y===jahr?'selected':''}>${y}</option>`).join('')}
    </select>`;
  }
  function setYear(y){ jahr = Number(y); App.rerender(); }

  /* ---------- Belegfotos eines Jahres entfernen (Speicher freimachen) ---------- */
  function fotoSize(){
    return Store.all('expenses').reduce((n,e) => n + (e.foto ? e.foto.length*0.75 : 0), 0);
  }
  function clearFotos(y){
    const betroffen = Store.all('expenses').filter(e => U.yearOf(e.datum) === Number(y) && e.foto);
    if (!betroffen.length){ UI.toast('Für '+y+' sind keine Fotos gespeichert'); return; }
    UI.confirm(
      `${betroffen.length} Belegfotos aus ${y} entfernen? Mach vorher ein Backup – im Backup sind die Bilder enthalten. `
      + `Die Ausgaben selbst bleiben natürlich stehen.`,
      () => { betroffen.forEach(e => Store.update('expenses', e.id, { foto:null }));
              UI.toast(betroffen.length + ' Fotos entfernt','ok'); App.rerender(); },
      {yes:'Fotos entfernen'});
  }

  /* ---------- Ausgaben von außen importieren (z.B. aus Belegen, die Claude gelesen hat) ---------- */
  function importExpenses(arr){
    let n = 0;
    (arr||[]).forEach(x => {
      if (!x || !U.parseNum(x.betrag)) return;
      Store.add('expenses', {
        datum: x.datum || U.today(), betrag: U.parseNum(x.betrag),
        haendler: x.haendler || x.wofuer || '', kategorie: x.kategorie || 'Sonstiges',
        notiz: x.notiz || '', beleg: x.beleg !== false, projectId: x.projectId || '', foto: null
      });
      n++;
    });
    return n;
  }

  return { renderExpenses, editExpense, saveExpense, delExpense, exportExpenses,
           renderReport, renderTax, exportEUR, setYear, einnahmen, ausgaben, gewinn,
           offenGesamt, monthly, monatsZahlen, monatsOffen, fristen, fahrtkosten, betriebsausgaben,
           einnahmenNetto, ustEinnahmen, ustQuartal, bezahlteRechnungen, onPhoto, dropFoto, showFoto, paintFoto,
           fotoSize, clearFotos, importExpenses };
})();
