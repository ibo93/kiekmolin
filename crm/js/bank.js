/* ============================================================
   Kurani CRM – Kontoabgleich
   Kontoauszug als CSV rein, Zahlungen den offenen Rechnungen
   zuordnen, Ausgaben erkennen. Gebucht wird nur, was du bestätigst.
   ============================================================ */
const Bank = (() => {

  let umsaetze = [];      // eingelesene Zeilen
  let treffer  = [];      // Zuordnungsvorschläge
  let filter   = 'offen';

  /* ---------- CSV lesen ---------- */

  /* Zerlegt eine CSV-Zeile und beachtet Anführungszeichen */
  function zeileSplitten(zeile, trenn){
    const felder = [];
    let feld = '', inQuote = false;
    for (let i = 0; i < zeile.length; i++){
      const c = zeile[i];
      if (c === '"'){
        if (inQuote && zeile[i+1] === '"'){ feld += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === trenn && !inQuote){
        felder.push(feld); feld = '';
      } else feld += c;
    }
    felder.push(feld);
    return felder.map(f => f.trim());
  }

  function trennzeichen(text){
    const kopf = text.split('\n')[0] || '';
    const semi = (kopf.match(/;/g) || []).length;
    const kom  = (kopf.match(/,/g) || []).length;
    const tab  = (kopf.match(/\t/g) || []).length;
    if (tab > semi && tab > kom) return '\t';
    return semi >= kom ? ';' : ',';
  }

  /* Deutsche Beträge: 1.234,56 · -45,00 · 1234.56 */
  function betrag(s){
    if (!s) return 0;
    let t = String(s).replace(/[€\s]/g, '').replace(/"/g, '');
    if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.includes(',')) t = t.replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }

  /* Datum: 17.08.2026 · 17.08.26 · 2026-08-17 */
  function datum(s){
    if (!s) return '';
    const t = String(s).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m){
      let j = m[3];
      if (j.length === 2) j = (parseInt(j,10) > 70 ? '19' : '20') + j;
      return `${j}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    }
    return '';
  }

  /* Findet heraus, in welcher Spalte was steht */
  function spalten(kopf){
    const norm = kopf.map(h => h.toLowerCase().replace(/[^a-zäöüß]/g, ''));
    const finde = (...begriffe) => {
      for (const b of begriffe){
        const i = norm.findIndex(h => h.includes(b));
        if (i >= 0) return i;
      }
      return -1;
    };
    return {
      datum:   finde('buchungstag','buchungsdatum','valuta','datum','date'),
      zweck:   finde('verwendungszweck','buchungstext','vorgang','beschreibung','zweck','description','text'),
      betrag:  finde('betrag','umsatz','amount','soll','haben'),
      partner: finde('beguenstigter','zahlungspflichtiger','auftraggeber','empfaenger','name','partner','kontoinhaber')
    };
  }

  function einlesen(text){
    const trenn = trennzeichen(text);
    const zeilen = text.split(/\r?\n/).filter(z => z.trim());
    if (zeilen.length < 2) throw new Error('Die Datei hat keine Zeilen, mit denen ich etwas anfangen kann.');

    /* Kopfzeile suchen – manche Banken schreiben Müll davor */
    let kopfIdx = 0, sp = null;
    for (let i = 0; i < Math.min(zeilen.length, 12); i++){
      const test = spalten(zeileSplitten(zeilen[i], trenn));
      if (test.datum >= 0 && test.betrag >= 0){ kopfIdx = i; sp = test; break; }
    }
    if (!sp) throw new Error('Ich finde keine Spalten für Datum und Betrag. Exportier den Auszug als CSV mit Kopfzeile.');

    const raus = [];
    for (let i = kopfIdx + 1; i < zeilen.length; i++){
      const f = zeileSplitten(zeilen[i], trenn);
      const d = datum(f[sp.datum]);
      const b = betrag(f[sp.betrag]);
      if (!d || !b) continue;
      raus.push({
        datum: d,
        betrag: b,
        zweck: sp.zweck >= 0 ? (f[sp.zweck] || '') : '',
        partner: sp.partner >= 0 ? (f[sp.partner] || '') : '',
        id: kennung(d, b, (f[sp.zweck]||'') + (f[sp.partner]||''))
      });
    }
    if (!raus.length) throw new Error('Keine Buchungen gefunden. Stimmt das Format?');
    return raus.sort((a,b) => b.datum.localeCompare(a.datum));
  }

  /* Erkennungsmerkmal einer Buchung, damit nichts zweimal gebucht wird */
  function kennung(d, b, text){
    const s = d + '|' + b.toFixed(2) + '|' + String(text).replace(/\s+/g,'').slice(0,40).toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++){ h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return 'b' + Math.abs(h).toString(36);
  }

  const erledigt = () => new Set(Store.data().bankErledigt || []);
  function abhaken(id){
    const d = Store.data();
    d.bankErledigt = d.bankErledigt || [];
    if (!d.bankErledigt.includes(id)) d.bankErledigt.push(id);
    if (d.bankErledigt.length > 3000) d.bankErledigt = d.bankErledigt.slice(-2000);
    Store.save();
  }

  /* ---------- Zuordnung ---------- */

  const nurZiffern = s => String(s || '').toLowerCase().replace(/[^0-9a-z]/g, '');

  /* Steht in der Buchung die Nummer einer Rechnung, die längst bezahlt ist?
     Dann gehört das Geld dorthin und darf nicht woanders gebucht werden. */
  function schonBezahlteRechnung(u){
    const text = nurZiffern(u.zweck + ' ' + u.partner);
    return Store.all('documents').find(d => {
      if (!Store.isInvoice(d) || Store.isOpenInvoice(d)) return false;
      const nr = nurZiffern(d.nummer);
      return nr.length >= 4 && text.includes(nr);
    }) || null;
  }

  function zuordnen(u){
    const offen = Store.all('documents').filter(Store.isOpenInvoice);
    const text  = (u.zweck + ' ' + u.partner).toLowerCase();
    const zifferText = nurZiffern(text);
    const kand  = [];

    offen.forEach(d => {
      let punkte = 0;
      const gruende = [];
      const rest = Store.docOpen(d);
      const nr   = nurZiffern(d.nummer);

      /* Rechnungsnummer im Verwendungszweck – das beste Signal */
      const nummerPasst = nr.length >= 4 && zifferText.includes(nr);
      if (nummerPasst){ punkte += 60; gruende.push('Rechnungsnummer steht im Verwendungszweck'); }

      /* Betrag */
      const diff = Math.abs(rest - u.betrag);
      if (diff < 0.01){ punkte += 30; gruende.push('Betrag stimmt genau'); }
      else if (diff < 1){ punkte += 20; gruende.push('Betrag stimmt fast'); }
      else if (u.betrag < rest && u.betrag > rest * 0.25){ punkte += 8; gruende.push('könnte eine Teilzahlung sein'); }
      else if (u.betrag > rest + 1){
        /* Mehr überwiesen als offen ist – ohne Rechnungsnummer ist das kein guter Treffer */
        punkte -= 20; gruende.push(`${U.eur(u.betrag - rest)} mehr als offen`);
      }

      /* Kundenname */
      const c = Store.byId('customers', d.customerId);
      if (c && c.firma){
        const teile = c.firma.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (teile.some(w => text.includes(w))){ punkte += 25; gruende.push('Kundenname passt'); }
      }
      if (punkte >= 20) kand.push({ doc: d, punkte, gruende, rest });
    });

    kand.sort((a,b) => b.punkte - a.punkte);
    return kand.slice(0, 3);
  }

  /* ---------- Lastschrift-Sonderfälle ----------
     Die Bank bucht eine eingereichte Lastschrift meist als eine Zeile über die
     Gesamtsumme. Und Rückläufer kommen als Abbuchung zurück. */

  function sammelGutschrift(u){
    if (typeof Sepa === 'undefined') return null;
    return Store.all('sepalaeufe').find(l => {
      if (Math.abs(U.parseNum(l.summe) - u.betrag) > 0.01) return false;
      /* Muss zeitlich passen: ab dem Einzugstag, aber nicht ewig danach */
      const tage = U.daysBetween(l.ausfuehrung, u.datum);
      if (tage < -1 || tage > 14) return false;
      /* Nur wenn davon überhaupt noch etwas offen ist */
      return (l.docIds || []).some(id => {
        const d = Store.byId('documents', id);
        return d && Store.isOpenInvoice(d);
      });
    }) || null;
  }

  function ruecklastschrift(u){
    if (u.betrag >= 0 || typeof Sepa === 'undefined') return null;
    const betrag = Math.abs(u.betrag);
    const text = (u.zweck + ' ' + u.partner).toLowerCase();
    const eingezogen = Store.all('documents').filter(d => d.einzug === 'eingezogen' && Store.isOpenInvoice(d));
    /* Erst über den Betrag, dann über den Namen */
    return eingezogen.find(d => Math.abs(Store.docOpen(d) - betrag) < 0.01)
        || eingezogen.find(d => {
             const c = Store.byId('customers', d.customerId);
             if (!c || !c.firma) return false;
             return c.firma.toLowerCase().split(/\s+/).filter(w => w.length > 3).some(w => text.includes(w));
           })
        || null;
  }

  function analysieren(){
    const fertig = erledigt();
    treffer = umsaetze.map(u => {
      const eingang = u.betrag > 0;
      const sammel  = eingang ? sammelGutschrift(u) : null;
      const rueck   = !eingang ? ruecklastschrift(u) : null;
      const bereits = (eingang && !sammel) ? schonBezahlteRechnung(u) : null;
      const kand = (eingang && !bereits && !sammel) ? zuordnen(u) : [];
      const best = kand[0] || null;
      return {
        u, kand, best, bereits, sammel, rueck,
        eingang,
        schon: fertig.has(u.id),
        sicher: (!!best && best.punkte >= 55) || !!sammel
      };
    });
  }

  /* Eine Sammelgutschrift auflösen: alle Rechnungen des Laufs auf bezahlt */
  function sammelBuchen(idx){
    const t = treffer[idx];
    if (!t || !t.sammel) return;
    const offen = (t.sammel.docIds || [])
      .map(id => Store.byId('documents', id))
      .filter(d => d && Store.isOpenInvoice(d));

    offen.forEach(d => {
      d.zahlungen = d.zahlungen || [];
      d.zahlungen.push({ datum: t.u.datum, betrag: Store.docOpen(d),
                         notiz: `Lastschrifteinzug vom ${U.de(t.sammel.ausfuehrung)}` });
      d.status = 'bezahlt';
      d.bezahltAm = t.u.datum;
      d.einzug = '';
      Store.update('documents', d.id, d);
      if (d.projectId) Store.update('projects', d.projectId, { status:'bezahlt' });
    });
    abhaken(t.u.id);
    UI.toast(`${offen.length} ${offen.length===1?'Rechnung':'Rechnungen'} aus dem Einzug verbucht`, 'ok');
    analysieren(); App.rerender();
  }

  /* ---------- Buchen ---------- */

  function buchen(idx){
    const t = treffer[idx];
    if (!t || !t.best) return;
    const d = t.best.doc;
    d.zahlungen = d.zahlungen || [];
    d.zahlungen.push({ datum: t.u.datum, betrag: Math.min(t.u.betrag, t.best.rest),
                       notiz: 'Kontoauszug: ' + U.cut(t.u.zweck || t.u.partner, 60) });
    const rest = Store.docOpen(d);
    d.status = rest <= 0.01 ? 'bezahlt' : 'versendet';
    if (d.status === 'bezahlt') d.bezahltAm = t.u.datum;
    Store.update('documents', d.id, d);
    if (d.projectId && d.status === 'bezahlt') Store.update('projects', d.projectId, { status:'bezahlt' });
    abhaken(t.u.id);
    UI.toast(rest <= 0.01 ? `${d.nummer} ist bezahlt` : `Teilzahlung auf ${d.nummer}, offen ${U.eur(rest)}`, 'ok');
    analysieren(); App.rerender();
  }

  function alleSicheren(){
    const liste = treffer.map((t,i) => ({t,i})).filter(x => x.t.sicher && !x.t.schon && x.t.eingang);
    if (!liste.length) return UI.toast('Nichts dabei, was ich mich alleine zu buchen traue.', 'warn');
    UI.confirm(`${liste.length} ${liste.length===1?'Zahlung wird':'Zahlungen werden'} gebucht. Weiter?`, () => {
      liste.reverse().forEach(x => x.t.sammel ? sammelBuchen(x.i) : buchen(x.i));
      UI.toast(`${liste.length} gebucht`, 'ok');
    }, { yes:'Buchen', danger:false, title:'Zahlungen buchen' });
  }

  function ignorieren(idx){
    abhaken(treffer[idx].u.id);
    analysieren(); App.rerender();
  }

  /* Ausgabe aus einer Abbuchung anlegen */
  function alsAusgabe(idx){
    const u = treffer[idx].u;
    Store.add('expenses', {
      datum: u.datum,
      betrag: Math.abs(u.betrag),
      was: U.cut(u.partner || u.zweck, 60),
      kategorie: 'sonstiges',
      notiz: U.cut(u.zweck, 120)
    });
    abhaken(u.id);
    UI.toast('Als Ausgabe gespeichert – Kategorie und Beleg kannst du noch nachtragen.', 'ok');
    analysieren(); App.rerender();
  }

  /* ---------- Oberfläche ---------- */

  function render(){
    const fertig = erledigt();
    const offeneR = Store.all('documents').filter(Store.isOpenInvoice);

    if (!umsaetze.length) return `
    <div class="page-head">
      <div><h1>Kontoabgleich</h1><div class="sub">Wer hat bezahlt – und was ist abgegangen</div></div>
    </div>
    <div class="card" style="max-width:660px">
      <div class="card-pad">
        <p style="line-height:1.75;margin-bottom:18px">
          Lade den Kontoauszug bei deiner Bank als <b>CSV</b> herunter und zieh ihn hier rein.
          Ich suche zu jedem Eingang die passende Rechnung und schlage vor, sie als bezahlt zu buchen.
          Gebucht wird erst, wenn du bestätigst.
        </p>
        <div class="bank-drop" id="bankDrop"
             ondragover="event.preventDefault();this.classList.add('an')"
             ondragleave="this.classList.remove('an')"
             ondrop="Bank.drop(event)">
          <input type="file" id="bankFile" accept=".csv,.txt" style="display:none" onchange="Bank.datei(this)">
          <div style="margin-bottom:12px">CSV hierher ziehen<div class="t-sub">oder</div></div>
          <button class="btn" onclick="document.getElementById('bankFile').click()">Datei auswählen</button>
        </div>
        <div class="field" style="margin-top:20px">
          <label>Oder Zeilen direkt einfügen</label>
          <textarea id="bankText" rows="5" placeholder="Buchungstag;Verwendungszweck;Betrag;…"></textarea>
        </div>
        <button class="btn btn-primary" onclick="Bank.ausText()">Einlesen</button>
        <div class="t-sub" style="margin-top:16px;line-height:1.6">
          Offen sind gerade ${offeneR.length} ${offeneR.length===1?'Rechnung':'Rechnungen'} über
          ${U.eur(U.sum(offeneR, Store.docOpen))}.
        </div>
      </div>
    </div>`;

    const zeigen = treffer.filter(t => {
      if (filter === 'offen')    return !t.schon && (t.eingang ? true : true);
      if (filter === 'eingang')  return t.eingang;
      if (filter === 'ausgang')  return !t.eingang;
      return true;
    });
    const sicher = treffer.filter(t => t.sicher && !t.schon).length;

    return `
    <div class="page-head">
      <div><h1>Kontoabgleich</h1>
        <div class="sub">${umsaetze.length} Buchungen gelesen · ${sicher} eindeutig zuzuordnen</div></div>
      <div class="actions">
        ${sicher ? `<button class="btn btn-primary" onclick="Bank.alleSicheren()">${sicher} eindeutige buchen</button>` : ''}
        <button class="btn btn-ghost" onclick="Bank.neu()">Anderer Auszug</button>
      </div>
    </div>

    <div class="tabs">
      ${[['offen','Noch offen'],['eingang','Eingänge'],['ausgang','Abbuchungen'],['alle','Alles']]
        .map(([k,l]) => `<button class="${filter===k?'active':''}" onclick="Bank.setFilter('${k}')">${l}</button>`).join('')}
    </div>

    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th style="width:92px">Datum</th><th>Buchung</th>
          <th style="width:110px;text-align:right">Betrag</th>
          <th>Zuordnung</th><th style="width:190px"></th>
        </tr></thead>
        <tbody>
          ${zeigen.length ? zeigen.map(zeile).join('')
            : '<tr><td colspan="5" class="t-sub" style="padding:26px;text-align:center">Hier ist nichts mehr offen.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  }

  function zeile(t){
    const i = treffer.indexOf(t);
    const u = t.u;
    const wer = U.esc(u.partner || '—');
    const zweck = U.esc(U.cut(u.zweck, 80));

    let zuordnung, knoepfe;
    if (t.schon){
      zuordnung = '<span class="t-sub">erledigt</span>';
      knoepfe = '';
    } else if (t.sammel){
      /* Eine Zeile, viele Rechnungen: der eingereichte Lastschriftlauf */
      const offen = (t.sammel.docIds||[]).map(id => Store.byId('documents', id))
                     .filter(d => d && Store.isOpenInvoice(d));
      zuordnung = `<span class="badge green">Lastschrifteinzug vom ${U.deShort(t.sammel.ausfuehrung)}</span>
        <div class="t-sub" style="margin-top:3px">${offen.length} Rechnungen: ${
          U.esc(offen.slice(0,3).map(d => d.nummer).join(', '))}${offen.length>3?' …':''}</div>`;
      knoepfe = `<button class="btn btn-sm btn-primary" onclick="Bank.sammelBuchen(${i})">Alle buchen</button>`;
    } else if (t.rueck){
      zuordnung = `<span class="badge red">Lastschrift zurück</span>
        <b style="margin-left:6px">${U.esc(Store.custName(t.rueck.customerId))}</b>
        <div class="t-sub" style="margin-top:3px">${t.rueck.nummer} · ${U.eur(Store.docOpen(t.rueck))} war eingezogen</div>`;
      knoepfe = `<button class="btn btn-sm btn-primary" onclick="Sepa.ruecklauf('${t.rueck.id}')">Erfassen</button>
                 <button class="btn btn-sm btn-ghost" onclick="Bank.alsAusgabe(${i})">Nur Ausgabe</button>`;
    } else if (t.bereits){
      /* Die Nummer im Zweck gehört zu einer Rechnung, die schon als bezahlt im System steht */
      zuordnung = `<span class="badge green">${t.bereits.nummer} steht schon auf bezahlt</span>
        <div class="t-sub" style="margin-top:3px">nichts zu tun – nicht doppelt buchen</div>`;
      knoepfe = `<button class="btn btn-sm btn-ghost" onclick="Bank.ignorieren(${i})">Abhaken</button>`;
    } else if (!t.eingang){
      const schon = Store.all('expenses').some(e => e.datum === u.datum && Math.abs(U.parseNum(e.betrag) - Math.abs(u.betrag)) < 0.01);
      zuordnung = schon ? '<span class="badge green">steht schon als Ausgabe drin</span>'
                        : '<span class="t-sub">noch keine Ausgabe erfasst</span>';
      knoepfe = schon ? `<button class="btn btn-sm btn-ghost" onclick="Bank.ignorieren(${i})">Abhaken</button>`
                      : `<button class="btn btn-sm" onclick="Bank.alsAusgabe(${i})">Als Ausgabe</button>
                         <button class="btn btn-sm btn-ghost" onclick="Bank.ignorieren(${i})">Ignorieren</button>`;
    } else if (t.best){
      const d = t.best.doc;
      const farbe = t.sicher ? 'green' : 'amber';
      zuordnung = `<div><span class="badge ${farbe}">${d.nummer}</span>
          <b style="margin-left:6px">${U.esc(Store.custName(d.customerId))}</b></div>
        <div class="t-sub" style="margin-top:3px">${U.eur(t.best.rest)} offen · ${U.esc(t.best.gruende.join(', '))}</div>`;
      knoepfe = `<button class="btn btn-sm btn-primary" onclick="Bank.buchen(${i})">Buchen</button>
                 <button class="btn btn-sm btn-ghost" onclick="Bank.waehlen(${i})">Andere…</button>`;
    } else {
      zuordnung = '<span class="t-sub">keine passende Rechnung gefunden</span>';
      knoepfe = `<button class="btn btn-sm" onclick="Bank.waehlen(${i})">Zuordnen…</button>
                 <button class="btn btn-sm btn-ghost" onclick="Bank.ignorieren(${i})">Ignorieren</button>`;
    }

    return `<tr${t.schon?' style="opacity:.5"':''}>
      <td>${U.deShort(u.datum)}</td>
      <td><b>${wer}</b><div class="t-sub">${zweck}</div></td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:${u.betrag<0?'var(--red)':'var(--green)'}">
        ${u.betrag > 0 ? '+' : ''}${U.eur(u.betrag)}</td>
      <td>${zuordnung}</td>
      <td style="text-align:right;white-space:nowrap">${knoepfe}</td>
    </tr>`;
  }

  /* Von Hand einer Rechnung zuordnen */
  function waehlen(idx){
    const t = treffer[idx];
    const offen = Store.all('documents').filter(Store.isOpenInvoice)
      .sort((a,b) => Math.abs(Store.docOpen(a) - t.u.betrag) - Math.abs(Store.docOpen(b) - t.u.betrag));
    UI.modal({
      title: 'Zahlung zuordnen',
      body: `<p class="t-sub" style="margin-bottom:14px">
          ${U.deShort(t.u.datum)} · ${U.eur(t.u.betrag)} · ${U.esc(t.u.partner || t.u.zweck)}</p>
        <div class="field"><label>Auf welche Rechnung?</label>
          <select id="bankZuDoc">
            ${offen.map(d => `<option value="${d.id}">${d.nummer} · ${U.esc(Store.custName(d.customerId))} · ${U.eur(Store.docOpen(d))} offen</option>`).join('')}
          </select></div>`,
      foot: `<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
             <button class="btn btn-primary" onclick="Bank.zuordnenManuell(${idx})">Buchen</button>`
    });
  }

  function zuordnenManuell(idx){
    const id = document.getElementById('bankZuDoc').value;
    const d = Store.byId('documents', id);
    treffer[idx].best = { doc: d, punkte: 100, gruende: ['von Hand zugeordnet'], rest: Store.docOpen(d) };
    UI.closeModal();
    buchen(idx);
  }

  /* ---------- Eingang ---------- */

  function ausText(){
    const t = (document.getElementById('bankText')?.value || '').trim();
    if (!t) return UI.toast('Da ist nichts zum Einlesen.', 'warn');
    laden(t);
  }
  function datei(input){
    const f = input.files[0];
    if (f) leseDatei(f);
  }
  function drop(e){
    e.preventDefault();
    e.currentTarget.classList.remove('drop-an');
    const f = e.dataTransfer.files[0];
    if (f) leseDatei(f);
  }
  function leseDatei(f){
    const r = new FileReader();
    r.onload = ev => laden(ev.target.result);
    r.onerror = () => UI.toast('Datei konnte nicht gelesen werden.', 'err');
    /* Bank-Exporte kommen oft in Windows-Kodierung */
    r.readAsText(f, 'ISO-8859-1');
  }
  function laden(text){
    try {
      /* Umlaute prüfen: kommt Kauderwelsch, war es doch UTF-8 */
      umsaetze = einlesen(text);
      analysieren();
      filter = 'offen';
      UI.toast(`${umsaetze.length} Buchungen gelesen`, 'ok');
      App.rerender();
    } catch(e){
      UI.toast(e.message, 'err', 6000);
    }
  }
  function neu(){ umsaetze = []; treffer = []; App.rerender(); }
  function setFilter(f){ filter = f; App.rerender(); }

  /* ---------- Zahl für das Dashboard ---------- */
  const offeneVorschlaege = () => treffer.filter(t => t.sicher && !t.schon).length;

  return { render, ausText, datei, drop, laden, neu, setFilter,
           buchen, sammelBuchen, alleSicheren, ignorieren, alsAusgabe, waehlen, zuordnenManuell,
           offeneVorschlaege, einlesen, betrag, datum,
           sammelGutschrift, ruecklastschrift };
})();
