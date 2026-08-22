/* ==========================================================
   Kurani CRM – Was lohnt sich wirklich
   Stundenertrag je Auftragsart · Deckungsbeitrag je Auftrag
   · Angebotsquote · Verschätzungs-Faktor
   ========================================================== */
const Analysis = (() => {

  let jahr = 'alle';

  const inJahr = d => jahr === 'alle' || U.yearOf(d) === Number(jahr);

  /* ---------- Rohdaten je Projekt ---------- */
  function projectRows(){
    return Store.all('projects').map(p => {
      const docs = Store.all('documents').filter(d => d.projectId === p.id && Store.isInvoice(d) && d.status === 'bezahlt');
      const umsatz = U.sum(docs.filter(d => inJahr(d.bezahltAm || d.datum)), Store.docTotal);
      if (!umsatz) return null;
      const material = U.sum(Store.all('expenses').filter(e => e.projectId === p.id), e => U.parseNum(e.betrag));
      const stunden  = U.sum(Store.all('times').filter(t => t.projectId === p.id), t => U.parseNum(t.stunden));
      const db = umsatz - material;
      return { p, umsatz, material, stunden, db,
               proStunde: stunden ? db / stunden : null,
               geplant: U.parseNum(p.aufwandStd) };
    }).filter(Boolean);
  }

  /* ---------- Nach Auftragstyp ---------- */
  function byType(){
    const rows = projectRows();
    const g = U.groupBy(rows, r => r.p.typ || 'Ohne Typ');
    return U.sortBy(Object.entries(g).map(([typ, rs]) => {
      const umsatz = U.sum(rs, r => r.umsatz);
      const material = U.sum(rs, r => r.material);
      const stunden = U.sum(rs, r => r.stunden);
      const db = umsatz - material;
      return { typ, anzahl: rs.length, umsatz, material, stunden, db,
               proStunde: stunden ? db / stunden : null,
               proAuftrag: db / rs.length };
    }), x => x.proStunde ?? -1, 'desc');
  }

  /* ---------- Angebotsquote ---------- */
  function offerStats(){
    const kvs = Store.all('documents').filter(d => (d.typ==='kv'||d.typ==='angebot') && inJahr(d.datum));
    const gueltig = Store.settings().kvGueltigTage || 30;
    const klass = b => b < 250 ? 'bis 250 €' : b < 500 ? '250–500 €' : b < 1000 ? '500–1.000 €' : 'über 1.000 €';
    const g = U.groupBy(kvs, d => klass(Store.docTotal(d)));
    const reihe = ['bis 250 €','250–500 €','500–1.000 €','über 1.000 €'];
    const rows = reihe.filter(k => g[k]).map(k => {
      const items = g[k];
      const ja   = items.filter(d => d.status === 'angenommen').length;
      const nein = items.filter(d => d.status === 'abgelehnt').length;
      const tot  = items.filter(d => d.status !== 'entwurf' && (d.status==='angenommen'||d.status==='abgelehnt'||
                    U.daysAgo(d.datum) > gueltig)).length;
      return { klasse:k, gesamt:items.length, ja, nein,
               offen: items.filter(d => d.status==='versendet' && U.daysAgo(d.datum) <= gueltig).length,
               quote: tot ? Math.round(ja/tot*100) : null,
               volumen: U.sum(items, Store.docTotal) };
    });
    const entschieden = kvs.filter(d => d.status==='angenommen'||d.status==='abgelehnt');
    return { rows, gesamt: kvs.length,
             quote: entschieden.length ? Math.round(kvs.filter(d=>d.status==='angenommen').length/entschieden.length*100) : null };
  }

  /* ---------- Verschätzung ---------- */
  function estimateStats(){
    const rows = projectRows().filter(r => r.geplant && r.stunden);
    if (!rows.length) return null;
    const faktor = U.sum(rows, r => r.stunden / r.geplant) / rows.length;
    const schlimmste = U.sortBy(rows, r => r.stunden / r.geplant, 'desc')[0];
    return { faktor, anzahl: rows.length, schlimmste };
  }

  /* ================= KUNDEN-AMPEL =================
     Was ein Kunde einbringt, gemessen an dem, was er kostet:
     echter Stundenertrag, Korrekturrunden, Zahlungsmoral. */

  function ampelRows(){
    const s = Store.settings();
    const soll = U.parseNum(s.stundensatz) || 65;
    const freieSchleifen = U.parseNum(s.freieSchleifen) || 2;

    return Store.all('customers').map(c => {
      const projekte = Store.all('projects').filter(p => p.customerId === c.id);
      const rechnungen = Store.all('documents').filter(d =>
        d.customerId === c.id && Store.isInvoice(d) && d.status !== 'storniert');
      const bezahlt = rechnungen.filter(d => d.status === 'bezahlt');

      const umsatz = U.sum(bezahlt.filter(d => inJahr(d.bezahltAm || d.datum)), Store.docTotal);
      const projIds = new Set(projekte.map(p => p.id));
      const material = U.sum(Store.all('expenses').filter(e => projIds.has(e.projectId)), e => U.parseNum(e.betrag));
      const stunden = U.sum(Store.all('times').filter(t => projIds.has(t.projectId)), t => U.parseNum(t.stunden));
      const db = umsatz - material;
      /* Ohne bezahlten Umsatz gibt es keinen Stundenertrag – eine offene
         Rechnung darf den Kunden nicht schlechtrechnen. */
      const proStunde = (stunden && umsatz > 0) ? db / stunden : null;

      /* Korrekturrunden: Schnitt über Projekte, die überhaupt welche haben */
      const mitSchleifen = projekte.filter(p => (p.schleifen || []).length);
      const schleifenSchnitt = mitSchleifen.length
        ? U.sum(mitSchleifen, p => p.schleifen.length) / mitSchleifen.length : 0;
      const ueberzogen = projekte.filter(p => (p.schleifen || []).length > freieSchleifen).length;

      /* Zahlungsmoral: Tage nach Fälligkeit bis zum Geldeingang */
      const mitDatum = bezahlt.filter(d => d.bezahltAm && d.faellig);
      const verzugSchnitt = mitDatum.length
        ? U.sum(mitDatum, d => U.daysBetween(d.faellig, d.bezahltAm)) / mitDatum.length : null;
      const mahnungen = Store.all('documents').filter(d => d.customerId === c.id && d.typ === 'mahnung').length;
      const offen = U.sum(rechnungen.filter(Store.isOpenInvoice), Store.docOpen);
      const ueberfaellig = rechnungen.filter(Store.isOverdue).length;

      /* Bewertung – jeder Bereich zählt gleich viel */
      const noten = [];
      if (proStunde !== null){
        noten.push(proStunde >= soll ? 2 : proStunde >= soll * 0.75 ? 1 : 0);
      }
      if (verzugSchnitt !== null){
        noten.push(verzugSchnitt <= 3 ? 2 : verzugSchnitt <= 14 ? 1 : 0);
      }
      if (mitSchleifen.length){
        noten.push(schleifenSchnitt <= freieSchleifen ? 2 : schleifenSchnitt <= freieSchleifen + 1 ? 1 : 0);
      }
      if (mahnungen) noten.push(mahnungen >= 3 ? 0 : 1);

      const genug = noten.length >= 2 && (bezahlt.length >= 1);
      const schnitt = noten.length ? U.sum(noten, n => n) / noten.length : null;
      const ampel = !genug ? 'grau' : schnitt >= 1.6 ? 'gruen' : schnitt >= 0.9 ? 'gelb' : 'rot';

      return { c, umsatz, db, material, stunden, proStunde, soll,
               schleifenSchnitt, ueberzogen, verzugSchnitt, mahnungen, offen, ueberfaellig,
               auftraege: bezahlt.length, projekte: projekte.length, ampel, genug };
    }).filter(r => r.auftraege || r.projekte)
      .sort((a,b) => b.umsatz - a.umsatz);
  }

  /* ---------- Kosten direkt hier erfassen ----------
     Material, Druck, Fremdleistung – ohne Umweg über den Ausgaben-Bereich.
     Sobald es drin ist, steht die Marge in der Zeile. */

  function kostenErfassen(customerId){
    const c = Store.byId('customers', customerId);
    const projekte = U.sortBy(Store.all('projects').filter(p => p.customerId === customerId),
                              p => p.createdAt || p.id, 'desc');
    const mat = (typeof Customers !== 'undefined') ? Customers.materialFuer(customerId) : { summe:0 };
    const umsatz = Store.customerRevenue(customerId);

    UI.modal({
      title: 'Kosten erfassen · ' + (c ? c.firma : ''),
      body: `
        <div class="row row-2">
          <div class="field"><label>Betrag €</label>
            <input type="text" id="kBetrag" inputmode="decimal" placeholder="0,00"
                   oninput="Analysis.margeVorschau('${customerId}')" autofocus></div>
          <div class="field"><label>Datum</label>
            <input type="date" id="kDatum" value="${U.today()}"></div>
        </div>
        <div class="field"><label>Wofür / bei wem</label>
          <input type="text" id="kWas" placeholder="z.B. Folienhandel Nord, Druckerei, Fremdmontage"></div>
        <div class="row row-2">
          <div class="field"><label>Art</label>
            <select id="kKat">
              ${['Material / Druck','Fremdleistung','Anschaffung (GWG)','Sonstiges']
                .map(k => `<option${k==='Material / Druck'?' selected':''}>${k}</option>`).join('')}
            </select></div>
          <div class="field"><label>Auftrag</label>
            <select id="kProjekt">
              ${projekte.length
                ? projekte.map((p,i) => `<option value="${p.id}"${i===0?' selected':''}>${U.esc(p.titel)}</option>`).join('')
                : '<option value="">– noch kein Auftrag angelegt –</option>'}
            </select>
            <div class="hint">Ohne Auftrag lässt sich die Ausgabe keinem Kunden zurechnen</div></div>
        </div>
        <label class="check"><input type="checkbox" id="kBeleg" checked> Beleg habe ich</label>

        <div class="card card-pad" id="kVorschau" style="background:var(--card-weich);border:none;margin-top:6px">
          ${margeText(umsatz, mat.summe, 0)}
        </div>`,
      foot: `<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
             <button class="btn btn-primary" onclick="Analysis.kostenSpeichern('${customerId}')">Eintragen</button>`
    });
  }

  function margeText(umsatz, bisher, neu){
    const gesamt = bisher + neu;
    const marge = umsatz - gesamt;
    const quote = umsatz > 0 ? Math.round(marge / umsatz * 100) : null;
    if (!umsatz) return `<div class="t-sub" style="line-height:1.7">
      Für diesen Kunden ist noch kein bezahlter Umsatz da – die Marge steht, sobald die Rechnung bezahlt ist.
      Kosten bisher: <b>${U.eur(gesamt)}</b></div>`;
    const farbe = quote >= 60 ? 'var(--green)' : quote >= 35 ? 'var(--amber)' : 'var(--red)';
    return `<div style="line-height:1.8;font-size:13.5px">
      Umsatz <b>${U.eur(umsatz)}</b> − Kosten <b>${U.eur(gesamt)}</b>${neu ? ` <span class="t-sub">(davon ${U.eur(neu)} neu)</span>` : ''}<br>
      <span style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:${farbe}">
        ${U.eur(marge)} Marge</span>
      <span class="t-sub"> · das sind ${quote} % vom Umsatz</span>
    </div>`;
  }

  function margeVorschau(customerId){
    const el = document.getElementById('kVorschau');
    if (!el) return;
    const neu = U.parseNum((document.getElementById('kBetrag')||{}).value);
    const mat = (typeof Customers !== 'undefined') ? Customers.materialFuer(customerId) : { summe:0 };
    el.innerHTML = margeText(Store.customerRevenue(customerId), mat.summe, neu);
  }

  function kostenSpeichern(customerId){
    const v = k => (document.getElementById(k)||{}).value || '';
    const betrag = U.parseNum(v('kBetrag'));
    if (betrag <= 0) return UI.toast('Betrag fehlt','err');
    const projektId = v('kProjekt');
    if (!projektId) return UI.toast('Ohne Auftrag kann ich die Kosten keinem Kunden zurechnen. Leg erst ein Projekt an.','warn', 6000);

    Store.add('expenses', {
      datum: v('kDatum') || U.today(),
      betrag,
      haendler: v('kWas').trim() || v('kKat'),
      kategorie: v('kKat'),
      projectId: projektId,
      beleg: (document.getElementById('kBeleg')||{}).checked !== false,
      notiz: ''
    });
    UI.closeModal();
    UI.toast(`${U.eur(betrag)} eingetragen – Marge ist aktualisiert`, 'ok');
    App.rerender();
  }

  const AMPEL_TEXT = {
    gruen: { label:'Läuft gut',      farbe:'green', erklaerung:'Zahlt ordentlich, der Aufwand passt zum Preis.' },
    gelb:  { label:'Genau hinsehen', farbe:'amber', erklaerung:'Einer der Werte kippt – beim nächsten Angebot einrechnen.' },
    rot:   { label:'Kostet dich Geld',farbe:'red',   erklaerung:'Rechnet sich so nicht. Preis anheben oder Grenzen setzen.' },
    grau:  { label:'Zu wenig Daten', farbe:'grey',  erklaerung:'Buch Zeiten und Zahlungen, dann kann ich das beurteilen.' }
  };

  function urteil(r){
    if (!r.genug) return AMPEL_TEXT.grau.erklaerung;
    const gruende = [];
    if (r.proStunde !== null && r.proStunde < r.soll)
      gruende.push(`du verdienst hier ${U.eur0(r.proStunde)} die Stunde statt ${U.eur0(r.soll)}`);
    if (r.verzugSchnitt !== null && r.verzugSchnitt > 14)
      gruende.push(`zahlt im Schnitt ${Math.round(r.verzugSchnitt)} Tage zu spät`);
    else if (r.verzugSchnitt !== null && r.verzugSchnitt > 3)
      gruende.push(`zahlt ein paar Tage nach Frist`);
    if (r.ueberzogen)
      gruende.push(`${r.ueberzogen} ${r.ueberzogen===1?'Auftrag ging':'Aufträge gingen'} über die vereinbarten Korrekturrunden`);
    if (r.mahnungen >= 2) gruende.push(`${r.mahnungen} Mahnungen`);
    if (!gruende.length) return AMPEL_TEXT.gruen.erklaerung;
    return gruende.join(' · ');
  }

  function renderAmpel(){
    const rows = ampelRows();
    const soll = U.parseNum(Store.settings().stundensatz) || 65;
    const zaehl = k => rows.filter(r => r.ampel === k).length;

    return `
    <div class="page-head">
      <div><h1>Kunden-Ampel</h1>
        <div class="sub">Was jeder Kunde einbringt – und was er dich an Zeit und Geduld kostet</div></div>
      <div class="actions">${yearSelect()}</div>
    </div>

    ${!rows.length ? UI.empty('Noch keine Kunden mit Aufträgen. Sobald Rechnungen und Zeiten drin sind, steht hier die Auswertung.') : `

    ${(() => {
      const umsatz = U.sum(rows, r => r.umsatz);
      const kosten = U.sum(rows, r => r.material);
      const marge  = umsatz - kosten;
      const quote  = umsatz > 0 ? Math.round(marge / umsatz * 100) : null;
      const ohne   = rows.filter(r => r.umsatz > 0 && !r.material).length;
      return `
      <div class="grid grid-4" style="margin-bottom:18px">
        <div class="kpi"><div class="label">Umsatz${jahr!=='alle'?' '+jahr:''}</div>
          <div class="value">${U.eur0(umsatz)}</div>
          <div class="foot">über alle Kunden</div></div>
        <div class="kpi accent-amber"><div class="label">Material &amp; Fremdkosten</div>
          <div class="value">${U.eur0(kosten)}</div>
          <div class="foot">${ohne ? `${ohne} ${ohne===1?'Kunde hat':'Kunden haben'} noch keine erfasst` : 'überall erfasst'}</div></div>
        <div class="kpi ${quote===null?'':quote>=60?'accent-green':quote>=35?'accent-amber':'accent-red'}">
          <div class="label">Marge</div><div class="value">${U.eur0(marge)}</div>
          <div class="foot">${quote !== null ? quote + ' % vom Umsatz' : '–'}</div></div>
        <div class="kpi"><div class="label">Ampel</div>
          <div class="value" style="font-size:20px">
            <span style="color:var(--green)">${zaehl('gruen')}</span> ·
            <span style="color:var(--amber)">${zaehl('gelb')}</span> ·
            <span style="color:var(--red)">${zaehl('rot')}</span></div>
          <div class="foot">gut · hinsehen · kostet Geld${zaehl('grau')?` · ${zaehl('grau')} unklar`:''}</div></div>
      </div>`;
    })()}

    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Kunde</th>
          <th style="width:104px;text-align:right">Umsatz</th>
          <th style="width:112px;text-align:right">Kosten</th>
          <th style="width:118px;text-align:right">Marge</th>
          <th style="width:104px;text-align:right">pro Stunde</th>
          <th style="width:92px;text-align:right">zahlt nach</th>
          <th style="width:130px">Urteil</th>
          <th style="width:104px"></th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const a = AMPEL_TEXT[r.ampel];
            const schlecht = r.proStunde !== null && r.proStunde < r.soll;
            const quote = r.umsatz > 0 ? Math.round(r.db / r.umsatz * 100) : null;
            const mFarbe = quote === null ? '' : quote >= 60 ? 'var(--green)' : quote >= 35 ? 'var(--amber)' : 'var(--red)';
            return `<tr style="cursor:pointer" onclick="location.hash='#/kunde/${r.c.id}'">
              <td><b>${U.esc(r.c.firma)}</b>
                <div class="t-sub">${r.auftraege} bezahlte ${r.auftraege===1?'Rechnung':'Rechnungen'}${
                  r.offen > 0.01 ? ` · ${U.eur(r.offen)} offen` : ''}${
                  r.ueberfaellig ? ` · ${r.ueberfaellig} überfällig` : ''}</div>
                <div class="t-sub" style="margin-top:3px">${U.esc(urteil(r))}</div></td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${U.eur0(r.umsatz)}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${r.material
                ? `${U.eur0(r.material)}<div class="t-sub">${r.umsatz ? Math.round(r.material/r.umsatz*100)+' %' : ''}</div>`
                : '<span class="t-sub">nichts erfasst</span>'}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${r.umsatz > 0
                ? `<b style="color:${mFarbe}">${U.eur0(r.db)}</b><div class="t-sub">${quote} % vom Umsatz</div>`
                : '<span class="t-sub">–</span>'}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums;${schlecht?'color:var(--red);font-weight:600':''}">
                ${r.proStunde !== null ? U.eur0(r.proStunde) : '<span class="t-sub">keine Zeiten</span>'}</td>
              <td style="text-align:right">${r.verzugSchnitt !== null
                ? (r.verzugSchnitt <= 0 ? '<span style="color:var(--green)">pünktlich</span>'
                   : `${Math.round(r.verzugSchnitt)} Tage${r.verzugSchnitt > 14 ? ' <span style="color:var(--red)">spät</span>' : ''}`)
                : '<span class="t-sub">–</span>'}</td>
              <td><span class="badge ${a.farbe}">${a.label}</span>
                ${r.schleifenSchnitt ? `<div class="t-sub" style="margin-top:3px">${
                  String(Math.round(r.schleifenSchnitt*10)/10).replace('.',',')} Runden je Auftrag</div>` : ''}</td>
              <td style="text-align:right" onclick="event.stopPropagation()">
                <button class="btn btn-sm" onclick="Analysis.kostenErfassen('${r.c.id}')">+ Kosten</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>

    <div class="card card-pad" style="margin-top:18px">
      <h3 style="font-size:15px;margin-bottom:8px">Wie das gerechnet ist</h3>
      <div class="t-sub" style="line-height:1.75">
        <b>Kosten</b> sind Material, Druck und Fremdleistungen, die auf den Aufträgen des Kunden liegen.
        Über <b>+ Kosten</b> trägst du sie direkt hier ein – die Marge steht sofort daneben.<br>
        <b>Marge</b> ist Umsatz minus diese Kosten. Was übrig bleibt für deine Arbeit, deine Zeit und deinen Gewinn.<br>
        <b>Pro Stunde</b> ist die Marge geteilt durch die Stunden, die du auf den Auftrag gebucht hast.
        Ohne gebuchte Zeiten kann ich das nicht ausrechnen.<br>
        <b>Zahlt nach</b> ist der Schnitt der Tage zwischen Fälligkeit und Geldeingang. Negativ heißt: zahlt vor Frist.<br>
        Ein Kunde wird erst bewertet, wenn mindestens zwei dieser Werte vorliegen.
      </div>
    </div>`}`;
  }

  /* ================= ANSICHT ================= */
  function render(){
    const typen = byType();
    const rows = projectRows();
    const stundensatz = Store.settings().stundensatz || 65;
    const gesStunden = U.sum(rows, r => r.stunden);
    const gesDB = U.sum(rows, r => r.db);
    const schnitt = gesStunden ? gesDB / gesStunden : null;
    const off = offerStats();
    const est = estimateStats();
    const ohneZeiten = rows.filter(r => !r.stunden).length;

    return `
    <div class="page-head">
      <div><h1>Was lohnt sich</h1>
        <div class="sub">Umsatz minus Material, geteilt durch die Stunden die du wirklich gebraucht hast</div></div>
      <div class="actions">${yearSelect()}</div>
    </div>

    ${!rows.length ? UI.empty('Noch keine bezahlten Rechnungen mit Projektbezug. Ordne Rechnungen einem Projekt zu, dann rechnet sich das hier von allein.') : `

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi ${schnitt && schnitt < stundensatz ? 'accent-red' : 'accent-green'}">
        <div class="label">Dein echter Stundenertrag</div>
        <div class="value">${schnitt ? U.eur0(schnitt) : '–'}</div>
        <div class="foot">angesetzt sind ${U.eur0(stundensatz)}</div></div>
      <div class="kpi"><div class="label">Deckungsbeitrag</div><div class="value">${U.eur0(gesDB)}</div>
        <div class="foot">Umsatz ${U.eur0(U.sum(rows,r=>r.umsatz))} − Material ${U.eur0(U.sum(rows,r=>r.material))}</div></div>
      <div class="kpi"><div class="label">Erfasste Stunden</div><div class="value">${U.num(gesStunden).replace(',00','')}</div>
        <div class="foot">${ohneZeiten ? ohneZeiten+' Aufträge ohne Zeiten' : 'alle Aufträge erfasst'}</div></div>
      <div class="kpi"><div class="label">Angebotsquote</div><div class="value">${off.quote !== null ? off.quote+'%' : '–'}</div>
        <div class="foot">${off.gesamt} Angebote insgesamt</div></div>
    </div>

    ${schnitt ? `<div class="card card-pad" style="margin-bottom:18px;background:${schnitt < stundensatz ? 'var(--red-bg)' : 'var(--green-bg)'};border:none">
      <div style="font-family:'Playfair Display',serif;font-size:19px;font-weight:700;margin-bottom:6px;
                  color:${schnitt < stundensatz ? 'var(--red)' : 'var(--green)'}">
        ${schnitt < stundensatz
          ? `Du arbeitest für ${U.eur0(schnitt)} die Stunde – nicht für ${U.eur0(stundensatz)}.`
          : `${U.eur0(schnitt)} die Stunde. Über deinem Ansatz.`}
      </div>
      <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft)">${fazit(typen, schnitt, stundensatz)}</div>
    </div>` : ''}

    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Nach Auftragsart</h3>
        <div class="actions t-sub">sortiert nach Ertrag pro Stunde</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Art</th><th class="num">Aufträge</th><th class="num">Umsatz</th>
          <th class="num">Material</th><th class="num">Stunden</th><th class="num">pro Stunde</th><th class="num">pro Auftrag</th></tr></thead>
        <tbody>${typen.map(t => `<tr>
          <td class="t-strong">${U.esc(t.typ)}</td>
          <td class="num t-sub">${t.anzahl}</td>
          <td class="num">${U.eur0(t.umsatz)}</td>
          <td class="num t-sub">${t.material?U.eur0(t.material):'–'}</td>
          <td class="num t-sub">${t.stunden?U.num(t.stunden).replace(',00',''):'–'}</td>
          <td class="num t-strong" style="color:${t.proStunde===null?'var(--muted)':t.proStunde<stundensatz?'var(--red)':'var(--green)'}">
            ${t.proStunde===null?'keine Zeiten':U.eur0(t.proStunde)}</td>
          <td class="num">${U.eur0(t.proAuftrag)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="grid grid-2" style="margin-bottom:16px">
      <div class="card">
        <div class="card-head"><h3>Einzelne Aufträge</h3><div class="actions t-sub">schlechteste zuerst</div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Auftrag</th><th class="num">Ertrag</th><th class="num">Std.</th><th class="num">pro Std.</th></tr></thead>
          <tbody>${U.sortBy(rows.filter(r=>r.stunden), r=>r.proStunde).slice(0,10).map(r => `<tr class="clickable"
            onclick="Projects.edit('${r.p.id}')">
            <td><div class="t-strong">${U.esc(U.cut(r.p.titel,30))}</div>
              <div class="t-sub">${U.esc(Store.custName(r.p.customerId))}</div></td>
            <td class="num">${U.eur0(r.db)}</td>
            <td class="num t-sub">${U.num(r.stunden).replace(',00','')}</td>
            <td class="num t-strong" style="color:${r.proStunde<stundensatz?'var(--red)':'var(--green)'}">${U.eur0(r.proStunde)}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="t-sub">Noch keine Zeiten gebucht.</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Angebote – was wird angenommen</h3></div>
        <div class="table-wrap">${off.rows.length ? `<table>
          <thead><tr><th>Preisklasse</th><th class="num">Angebote</th><th class="num">Zugesagt</th>
            <th class="num">Abgelehnt</th><th class="num">Quote</th></tr></thead>
          <tbody>${off.rows.map(r => `<tr>
            <td class="t-strong">${r.klasse}</td>
            <td class="num t-sub">${r.gesamt}</td>
            <td class="num" style="color:var(--green)">${r.ja}</td>
            <td class="num t-sub">${r.nein}</td>
            <td class="num t-strong">${r.quote!==null?r.quote+'%':'–'}</td>
          </tr>`).join('')}</tbody>
        </table>` : UI.empty('Noch keine Angebote erfasst.')}</div>
        ${off.quote !== null ? `<div class="card-pad t-sub" style="line-height:1.65;border-top:1px solid var(--line-soft)">
          ${off.quote >= 80
            ? `<b>${off.quote}% Zusagen.</b> Fast alles wird angenommen – das heißt in der Regel: du bist zu billig.
               Nimm beim nächsten Angebot 15 % mehr. Wenn die Quote dann auf 60 % fällt, verdienst du trotzdem mehr.`
            : off.quote >= 45
            ? `<b>${off.quote}% Zusagen.</b> Gesunder Bereich. Deine Preise passen zum Markt.`
            : `<b>${off.quote}% Zusagen.</b> Da geht viel verloren. Meist liegt es nicht am Preis, sondern daran,
               dass zu spät nachgefasst wird oder der Nutzen im Angebot nicht klar steht.`}
        </div>`:''}
      </div>
    </div>

    ${est ? `<div class="card card-pad">
      <h3 style="font-size:16px;margin-bottom:8px">Verschätzt du dich?</h3>
      <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft)">
        Du brauchst im Schnitt das <b>${est.faktor.toFixed(1)}-fache</b> deiner Schätzung
        (${est.anzahl} Aufträge mit Plan und erfasster Zeit).
        ${est.faktor > 1.25
          ? `Schlag bei der nächsten Kalkulation ${Math.round((est.faktor-1)*100)} % drauf – das ist keine Vorsicht, das ist deine Erfahrung.
             Am deutlichsten war „${U.esc(est.schlimmste.p.titel)}": geplant ${est.schlimmste.geplant} h, gebraucht ${U.num(est.schlimmste.stunden).replace(',00','')} h.`
          : est.faktor < 0.85
          ? 'Du schätzt großzügig – da ist Luft für schnellere Zusagen oder engere Termine.'
          : 'Deine Schätzungen sitzen. Darauf kannst du dich verlassen.'}
      </div>
    </div>`:''}
    `}`;
  }

  function fazit(typen, schnitt, satz){
    const mit = typen.filter(t => t.proStunde !== null);
    if (!mit.length) return 'Buch bei ein paar Aufträgen die Zeiten mit, dann steht hier eine ehrliche Zahl statt einer Vermutung.';
    const best = mit[0], schlecht = mit[mit.length-1];
    let s = `Am besten läuft <b>${U.esc(best.typ)}</b> mit ${U.eur0(best.proStunde)} die Stunde.`;
    if (mit.length > 1 && schlecht.proStunde < satz)
      s += ` Am schlechtesten <b>${U.esc(schlecht.typ)}</b> mit ${U.eur0(schlecht.proStunde)} – `
         + `entweder Preis hoch, schneller werden, oder bewusst nur noch als Türöffner machen.`;
    if (schnitt < satz)
      s += ` Um auf deine ${U.eur0(satz)} zu kommen, fehlen dir ${U.eur0(satz-schnitt)} pro Stunde – `
         + `das sind bei 25 Stunden die Woche rund ${U.eur0((satz-schnitt)*25*4)} im Monat.`;
    return s;
  }

  function yearSelect(){
    const jahre = new Set();
    Store.all('documents').forEach(d => jahre.add(U.yearOf(d.datum)));
    return `<select onchange="Analysis.setYear(this.value)" style="width:auto">
      <option value="alle" ${jahr==='alle'?'selected':''}>Alle Jahre</option>
      ${[...jahre].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${String(jahr)===String(y)?'selected':''}>${y}</option>`).join('')}
    </select>`;
  }
  function setYear(y){ jahr = y; App.rerender(); }

  return { render, renderAmpel, setYear, byType, offerStats, estimateStats, projectRows,
           ampelRows, urteil, AMPEL_TEXT,
           kostenErfassen, kostenSpeichern, margeVorschau, margeText };
})();
