/* ============================================================
   Kurani CRM – SEPA-Lastschrift
   Mandate verwalten, Monatslauf über alle fälligen Abos,
   Einzugsdatei für die Bank erzeugen, Rücklastschriften erfassen.

   Wichtig: Hier wird kein Geld bewegt. Das CRM schreibt die Datei,
   hochgeladen und eingezogen wird bei der Bank.
   ============================================================ */
const Sepa = (() => {

  /* ---------- SEPA-Zeichensatz ----------
     Erlaubt sind nur a-z A-Z 0-9 und / - ? : ( ) . , ' + Leerzeichen.
     Alles andere lehnt die Bank ab – Umlaute werden umgeschrieben. */
  const ERSATZ = {
    'ä':'ae','ö':'oe','ü':'ue','Ä':'Ae','Ö':'Oe','Ü':'Ue','ß':'ss',
    'á':'a','à':'a','â':'a','å':'a','ã':'a','é':'e','è':'e','ê':'e','ë':'e',
    'í':'i','ì':'i','î':'i','ï':'i','ó':'o','ò':'o','ô':'o','õ':'o','ø':'o',
    'ú':'u','ù':'u','û':'u','ç':'c','ñ':'n','&':'und','§':'',
    'É':'E','È':'E','Ê':'E','Á':'A','À':'A','Ó':'O','Ò':'O','Ú':'U','Ù':'U','Ç':'C','Ñ':'N'
  };

  function sepaText(s, max = 70){
    let t = String(s || '');
    t = t.replace(/[äöüÄÖÜßáàâåãéèêëíìîïóòôõøúùûçñÉÈÊÁÀÓÒÚÙÇÑ&§]/g, c => ERSATZ[c] || c);
    t = t.replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t.slice(0, max);
  }

  const xmlEsc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                       .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* ---------- IBAN ---------- */

  const ibanRoh = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  /* Prüfziffer nach Modulo 97 – fängt Zahlendreher ab */
  function ibanGueltig(s){
    const i = ibanRoh(s);
    if (i.length < 15 || i.length > 34) return false;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(i)) return false;
    const um = i.slice(4) + i.slice(0, 4);
    const zahl = um.replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
    let rest = 0;
    for (let p = 0; p < zahl.length; p += 7){
      rest = Number(String(rest) + zahl.substr(p, 7)) % 97;
    }
    return rest === 1;
  }

  const ibanHuebsch = s => ibanRoh(s).replace(/(.{4})/g, '$1 ').trim();
  const ibanKurz    = s => { const i = ibanRoh(s); return i ? i.slice(0,4) + '…' + i.slice(-4) : ''; };

  /* ---------- Mandate ---------- */

  const mandate    = () => Store.all('mandate');
  const mandatFuer = customerId => mandate().find(m => m.customerId === customerId && m.status === 'aktiv') || null;

  /* Mandatsreferenz: eindeutig, max 35 Zeichen, eingeschränkter Zeichensatz */
  function neueReferenz(customerId){
    const c = Store.byId('customers', customerId);
    const basis = sepaText(`KMI-${c?.nr || 'X'}`, 20).replace(/ /g,'-');
    const vorhanden = new Set(mandate().map(m => m.referenz));
    let ref = basis, n = 1;
    while (vorhanden.has(ref)) ref = `${basis}-${++n}`;
    return ref;
  }

  function mandatBearbeiten(id = null){
    const m = id ? Store.byId('mandate', id) : {
      customerId:'', referenz:'', iban:'', bic:'', kontoinhaber:'',
      datum: U.today(), art:'CORE', status:'aktiv', notiz:''
    };
    UI.modal({
      title: id ? 'Mandat bearbeiten' : 'Neues Lastschriftmandat',
      body:`
        <div class="field"><label>Kunde</label>
          <select id="mKunde" onchange="Sepa.kundeGewechselt()">${UI.customerOptions(m.customerId)}</select></div>
        <div class="row row-2">
          <div class="field"><label>Kontoinhaber</label>
            <input type="text" id="mInhaber" value="${U.esc(m.kontoinhaber)}" placeholder="wie auf dem Konto">
            <div class="hint">Muss zum Konto passen, nicht zwingend zum Kundennamen</div></div>
          <div class="field"><label>Mandatsreferenz</label>
            <input type="text" id="mRef" value="${U.esc(m.referenz)}" placeholder="wird gesetzt" maxlength="35">
            <div class="hint">Steht auf jedem Einzug – nicht mehr ändern</div></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>IBAN</label>
            <input type="text" id="mIban" value="${U.esc(ibanHuebsch(m.iban))}"
              placeholder="DE.. .... .... .... .... .." oninput="Sepa.ibanPruefen()">
            <div class="hint" id="mIbanHint">&nbsp;</div></div>
          <div class="field"><label>BIC <span class="t-sub">(meist nicht nötig)</span></label>
            <input type="text" id="mBic" value="${U.esc(m.bic)}" placeholder="nur falls die Bank ihn verlangt"></div>
        </div>
        <div class="row row-2">
          <div class="field"><label>Unterschrieben am</label>
            <input type="date" id="mDatum" value="${U.esc(m.datum)}">
            <div class="hint">Datum vom unterschriebenen Mandat</div></div>
          <div class="field"><label>Art</label>
            <select id="mArt">
              <option value="CORE" ${m.art==='CORE'?'selected':''}>Basis-Lastschrift – für alle</option>
              <option value="B2B"  ${m.art==='B2B'?'selected':''}>Firmen-Lastschrift – kein Widerspruch, muss der Kunde bei seiner Bank anmelden</option>
            </select></div>
        </div>
        <div class="field"><label>Notiz</label>
          <input type="text" id="mNotiz" value="${U.esc(m.notiz||'')}" placeholder="z.B. Mandat liegt im Ordner / als Foto"></div>
        ${id ? `<div class="field"><label>Status</label>
          <select id="mStatus">
            <option value="aktiv"      ${m.status==='aktiv'?'selected':''}>aktiv</option>
            <option value="widerrufen" ${m.status==='widerrufen'?'selected':''}>widerrufen – kein Einzug mehr</option>
          </select></div>` : ''}
        <div class="card card-pad" style="background:var(--card-weich);border:none;margin-top:6px">
          <div class="t-sub" style="line-height:1.65">
            Das Mandat muss dir der Kunde unterschrieben geben – auf Papier oder als Bild.
            Heb es auf: Ohne Mandat kann er den Einzug noch 13 Monate später zurückholen.
            <button class="btn btn-sm" style="margin-top:9px" onclick="Sepa.mandatstext()">Mandatsbogen drucken</button>
          </div>
        </div>`,
      foot:`${id?`<button class="btn btn-danger left" onclick="Sepa.mandatLoeschen('${id}')">Löschen</button>`:''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Sepa.mandatSpeichern('${id||''}')">Speichern</button>`
    });
    setTimeout(() => { if (!id) kundeGewechselt(); }, 20);
  }

  function kundeGewechselt(){
    const id = document.getElementById('mKunde')?.value;
    if (!id) return;
    const c = Store.byId('customers', id);
    const inh = document.getElementById('mInhaber');
    const ref = document.getElementById('mRef');
    if (inh && !inh.value) inh.value = c?.firma || '';
    if (ref && !ref.value) ref.value = neueReferenz(id);
  }

  function ibanPruefen(){
    const el = document.getElementById('mIban');
    const hint = document.getElementById('mIbanHint');
    if (!el || !hint) return;
    const roh = ibanRoh(el.value);
    if (!roh){ hint.innerHTML = '&nbsp;'; hint.style.color = ''; return; }
    if (ibanGueltig(roh)){ hint.textContent = 'IBAN ist gültig'; hint.style.color = 'var(--green)'; }
    else { hint.textContent = 'Prüfziffer stimmt nicht – da hat sich ein Zahlendreher eingeschlichen'; hint.style.color = 'var(--red)'; }
  }

  function mandatSpeichern(id){
    const v = k => (document.getElementById(k)||{}).value || '';
    const iban = ibanRoh(v('mIban'));
    if (!v('mKunde'))        return UI.toast('Kunde fehlt','err');
    if (!ibanGueltig(iban))  return UI.toast('Die IBAN stimmt nicht – bitte nochmal prüfen','err');
    if (!v('mRef').trim())   return UI.toast('Mandatsreferenz fehlt','err');
    if (!v('mDatum'))        return UI.toast('Datum der Unterschrift fehlt','err');

    const ref = sepaText(v('mRef'), 35);
    const doppelt = mandate().find(m => m.referenz === ref && m.id !== id);
    if (doppelt) return UI.toast('Diese Mandatsreferenz gibt es schon','err');

    const patch = {
      customerId: v('mKunde'), referenz: ref,
      iban, bic: v('mBic').toUpperCase().replace(/\s/g,''),
      kontoinhaber: v('mInhaber').trim(), datum: v('mDatum'),
      art: v('mArt') || 'CORE', notiz: v('mNotiz').trim(),
      status: v('mStatus') || 'aktiv'
    };
    if (id) Store.update('mandate', id, patch); else Store.add('mandate', patch);
    UI.closeModal(); UI.toast('Mandat gespeichert','ok'); App.rerender();
  }

  function mandatLoeschen(id){
    UI.confirm('Mandat löschen? Für laufende Abos kannst du dann nicht mehr einziehen.', () => {
      Store.remove('mandate', id); UI.closeModal(); App.rerender();
    });
  }

  /* Vorgeschriebener Wortlaut – so muss ein Mandat aussehen */
  /* ============================================================
     Mandatsformular zum Ausdrucken
     Ein fertiger Bogen im Hausstil: oben deine Daten, unten die des
     Kunden schon eingetragen. Er muss nur noch IBAN und Unterschrift
     ausfüllen. Den Wortlaut in der Mitte schreibt die Bank vor –
     daran darf nichts geändert werden.
     ============================================================ */

  function mandatstext(customerId = ''){
    const s = Store.settings();
    const kunden = U.sortBy(Store.all('customers'), c => (c.firma||'').toLowerCase());

    UI.modal({
      title: 'Mandat zum Unterschreiben',
      body: `
        ${!s.glaeubigerId ? `
        <div class="card card-pad" style="background:var(--amber-bg);border:none;margin-bottom:14px">
          <b style="color:var(--amber)">Deine Gläubiger-ID fehlt noch.</b>
          <div style="font-size:13px;line-height:1.7;margin-top:5px">
            Ohne die darf keine Lastschrift laufen. Kostenlos beantragen bei der Bundesbank
            unter <b>glaeubiger-id.bundesbank.de</b>, kommt per Mail. Du kannst den Bogen
            trotzdem schon drucken – dann bleibt die Zeile leer und du trägst sie später ein.
          </div>
        </div>` : ''}

        <div class="field">
          <label>Für welchen Kunden?</label>
          <select id="mfKunde">
            <option value="">– Bogen ohne Namen, zum Von-Hand-Ausfüllen –</option>
            ${kunden.map(c => `<option value="${c.id}" ${c.id===customerId?'selected':''}>${U.esc(c.firma||'Ohne Namen')}</option>`).join('')}
          </select>
          <div class="hint">Name und Anschrift stehen dann schon drauf – der Kunde trägt nur noch IBAN und Unterschrift ein.</div>
        </div>

        <div class="field" style="margin-top:14px">
          <label>Art des Mandats</label>
          <div class="zeitraum" id="mfArt">
            <button class="aktiv" onclick="Sepa.mfArt(this,'wiederkehrend')">Wiederkehrend</button>
            <button onclick="Sepa.mfArt(this,'einmalig')">Einmalig</button>
          </div>
          <div class="hint">Für die Monatsabos: wiederkehrend. Das gilt dann für alle künftigen Einzüge.</div>
        </div>

        <div class="hint" style="margin-top:16px;line-height:1.7">
          Heb den unterschriebenen Bogen auf – ohne ihn kann der Kunde den Einzug
          noch 13 Monate später zurückholen. Ein Foto reicht, aber es muss lesbar sein.
        </div>`,
      foot: `<button class="btn" onclick="UI.closeModal()">Schließen</button>
             <button class="btn btn-primary" onclick="Sepa.mandatDrucken()">Bogen drucken</button>`
    });
  }

  let mfArtWahl = 'wiederkehrend';
  function mfArt(knopf, wert){
    mfArtWahl = wert;
    knopf.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('aktiv', b === knopf));
  }

  /* Baut den Bogen als eigenständige HTML-Seite – bewusst ohne unsere
     App-Farben, damit er auf Papier immer gleich aussieht. */
  function mandatBogen(customerId){
    const s = Store.settings();
    const c = customerId ? Store.byId('customers', customerId) : null;
    const ref = c ? (mandatFuer(c.id)?.referenz || neueReferenz(c.id)) : '';
    const linie = (breite = '100%') =>
      `<span style="display:inline-block;width:${breite};border-bottom:.6pt solid #333;height:13pt"></span>`;

    const empfaenger = c
      ? [c.firma, c.ansprechpartner, c.strasse, [c.plz, c.ort].filter(Boolean).join(' ')]
          .filter(Boolean).map(U.esc).join('<br>')
      : linie('88%') + '<br>' + linie('88%') + '<br>' + linie('88%');

    return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>SEPA-Lastschriftmandat${c ? ' ' + (c.firma||'') : ''}</title>
<style>
  @page{size:A4;margin:18mm 18mm 14mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#111;font-size:10pt;line-height:1.45}
  .kopf{display:flex;justify-content:space-between;align-items:flex-start;
        padding-bottom:3.5mm;border-bottom:.4pt solid #cfcfcf;margin-bottom:5mm}
  .kopf .firm{font-size:13pt;font-weight:700;letter-spacing:.02em}
  .kopf .firm small{display:block;font-size:8pt;font-weight:400;color:#666;
        letter-spacing:.14em;text-transform:uppercase;margin-top:1mm}
  .kopf .kontakt{text-align:right;font-size:8pt;color:#555;line-height:1.45}
  .titel{background:#111;color:#fff;padding:4mm 7mm;margin-bottom:5mm;
         -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .titel .t{font-size:16pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1}
  .titel .u{font-size:8.5pt;color:#e8e8e8;margin-top:1.5mm}
  .block{margin-bottom:5mm}
  .lbl{font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:#777;margin-bottom:1.5mm}
  .kasten{border:.5pt solid #d5d5d5;padding:3.5mm 5mm;background:#fafafa;
          -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .zwei{display:flex;gap:7mm}
  .zwei>div{flex:1}
  .paare{width:100%;border-collapse:collapse}
  .paare td{padding:1mm 0;vertical-align:bottom}
  .paare td.k{width:38mm;color:#555;font-size:9pt}
  .wortlaut{border-left:2.5pt solid #111;padding:1mm 0 1mm 5mm;margin:5mm 0;line-height:1.65}
  .klein{font-size:8.5pt;color:#555;line-height:1.55}
  .felder td{padding:2.6mm 0}
  .unterschrift{margin-top:8mm;display:flex;gap:10mm}
  .unterschrift>div{flex:1}
  .unterschrift .strich{border-bottom:.6pt solid #333;height:11mm}
  .unterschrift .was{font-size:8pt;color:#666;margin-top:1.5mm}
  .fuss{margin-top:9mm;padding-top:3mm;border-top:.4pt solid #cfcfcf;
        font-size:7.5pt;color:#777;line-height:1.5;display:flex;justify-content:space-between;gap:8mm}
</style></head><body>

  <div class="kopf">
    <div class="firm">${U.esc(s.firma || 'Kurani Design')}
      <small>${U.esc(s.inhaber || '')}</small></div>
    <div class="kontakt">
      ${U.esc(s.strasse || '')}<br>
      ${U.esc([s.plz, s.ort].filter(Boolean).join(' '))}<br>
      ${U.esc(s.telefon || '')}<br>${U.esc(s.email || '')}
    </div>
  </div>

  <div class="titel">
    <div class="t">SEPA-Lastschriftmandat</div>
    <div class="u">${mfArtWahl === 'einmalig' ? 'Einmalige Zahlung' : 'Wiederkehrende Zahlungen'}</div>
  </div>

  <div class="block">
    <div class="lbl">Zahlungsempfänger (Gläubiger)</div>
    <div class="kasten">
      <table class="paare">
        <tr><td class="k">Name</td><td><b>${U.esc(s.firma || '')}</b></td></tr>
        <tr><td class="k">Anschrift</td><td>${U.esc([s.strasse, s.plz && s.ort ? s.plz+' '+s.ort : ''].filter(Boolean).join(', '))}</td></tr>
        <tr><td class="k">Gläubiger-ID</td><td>${s.glaeubigerId ? '<b>'+U.esc(s.glaeubigerId)+'</b>' : linie('62mm')}</td></tr>
        <tr><td class="k">Mandatsreferenz</td><td>${ref ? '<b>'+U.esc(ref)+'</b>' : linie('62mm')}</td></tr>
      </table>
    </div>
  </div>

  <div class="block">
    <div class="lbl">Zahlungspflichtiger (Kontoinhaber)</div>
    <div class="kasten">
      <table class="paare felder">
        <tr><td class="k">Name / Firma</td><td>${c ? '<b>'+U.esc(c.firma||'')+'</b>' : linie('88%')}</td></tr>
        <tr><td class="k">Anschrift</td><td>${c
          ? U.esc([c.strasse, [c.plz, c.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))
          : linie('88%')}</td></tr>
        <tr><td class="k">IBAN</td><td>${linie('88%')}</td></tr>
        <tr><td class="k">BIC</td><td>${linie('60%')}
          <span style="color:#999;font-size:8pt;margin-left:4mm">bei deutschen Konten nicht nötig</span></td></tr>
        <tr><td class="k">Kreditinstitut</td><td>${linie('88%')}</td></tr>
      </table>
    </div>
  </div>

  <div class="wortlaut">
    Ich ermächtige ${U.esc(s.firma || '')}, ${mfArtWahl === 'einmalig'
      ? 'eine einmalige Zahlung' : 'Zahlungen'} von meinem Konto mittels Lastschrift einzuziehen.
    Zugleich weise ich mein Kreditinstitut an, die von ${U.esc(s.firma || '')} auf mein Konto
    gezogene${mfArtWahl === 'einmalig' ? '' : 'n'} Lastschrift${mfArtWahl === 'einmalig' ? '' : 'en'} einzulösen.
    <div class="klein" style="margin-top:2.5mm">
      Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung
      des belasteten Betrages verlangen. Es gelten dabei die mit meinem Kreditinstitut vereinbarten
      Bedingungen.
    </div>
  </div>

  <div class="unterschrift">
    <div><div class="strich"></div><div class="was">Ort, Datum</div></div>
    <div style="flex:1.4"><div class="strich"></div><div class="was">Unterschrift des Kontoinhabers</div></div>
  </div>

  <div class="fuss">
    <div><b>${U.esc(s.firma || '')}</b><br>${U.esc(s.strasse || '')}<br>${U.esc([s.plz, s.ort].filter(Boolean).join(' '))}</div>
    <div>${U.esc(s.telefon || '')}<br>${U.esc(s.email || '')}</div>
    <div style="text-align:right">Bitte unterschrieben zurück –<br>per Post, Mail oder als Foto.</div>
  </div>

</body></html>`;
  }

  function mandatDrucken(){
    const id = document.getElementById('mfKunde')?.value || '';
    const w = window.open('');
    if (!w) return UI.toast('Der Browser hat das Fenster blockiert – erlaube Pop-ups für diese Seite.', 'warn');
    w.document.write(mandatBogen(id));
    w.document.close();
    setTimeout(() => w.print(), 350);

    /* Wenn für den Kunden noch kein Mandat angelegt ist, gleich anbieten */
    if (id && !mandatFuer(id)){
      const c = Store.byId('customers', id);
      setTimeout(() => UI.confirm(
        `Bogen ist raus. Soll ich das Mandat für ${c?.firma || 'den Kunden'} schon anlegen? ` +
        `IBAN und Unterschriftsdatum trägst du nach, sobald der Bogen zurück ist.`,
        () => { UI.closeModal(); mandatBearbeiten(); },
        { yes:'Ja, anlegen', danger:false, title:'Mandat anlegen?' }), 700);
    }
  }

  /* ============================================================
     Monatslauf – alle fälligen Abos auf einmal
     ============================================================ */

  const faelligeAbos = (bis = U.today()) =>
    Store.all('recurring').filter(r => r.aktiv && r.naechstesDatum && r.naechstesDatum <= bis);

  function laufVorschau(){
    const s = Store.settings();
    return faelligeAbos().map(r => {
      const m = mandatFuer(r.customerId);
      return {
        r, m,
        kunde: Store.custName(r.customerId),
        betrag: U.parseNum(r.betrag),
        einzug: !!m,
        grund: m ? '' : 'kein Mandat – Rechnung geht raus, Geld musst du selbst holen'
      };
    });
  }

  function laufStarten(){
    const liste = laufVorschau();
    if (!liste.length) return UI.toast('Gerade ist kein Abo fällig.','warn');
    const summe = U.sum(liste, x => x.betrag);
    const mitMandat = liste.filter(x => x.einzug).length;

    UI.modal({
      title:'Monatslauf',
      wide:true,
      body:`
        <p style="font-size:14.5px;line-height:1.7;margin-bottom:16px">
          ${liste.length} ${liste.length===1?'Abo ist':'Abos sind'} fällig, zusammen <b>${U.eur(summe)}</b>.
          ${mitMandat ? `Für ${mitMandat} davon liegt ein Mandat vor – die kannst du gleich einziehen.` : ''}
        </p>
        <div class="table-wrap"><table>
          <thead><tr><th>Kunde</th><th>Abo</th><th style="width:110px;text-align:right">Betrag</th><th style="width:220px">Einzug</th></tr></thead>
          <tbody>${liste.map(x => `<tr>
            <td><b>${U.esc(x.kunde)}</b></td>
            <td class="t-sub">${U.esc(x.r.titel)}</td>
            <td style="text-align:right">${U.eur(x.betrag)}</td>
            <td>${x.einzug
              ? `<span class="badge green">Lastschrift</span> <span class="t-sub">${ibanKurz(x.m.iban)}</span>`
              : `<span class="badge amber">auf Rechnung</span>`}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        ${liste.some(x => !x.einzug) ? `<p class="t-sub" style="margin-top:12px">
          Für Kunden ohne Mandat wird nur die Rechnung erzeugt. Willst du da auch einziehen,
          leg erst ein Mandat an.</p>` : ''}`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Sepa.laufAusfuehren()">${liste.length} Rechnungen erzeugen</button>`
    });
  }

  function laufAusfuehren(){
    const liste = laufVorschau();
    const erzeugt = [];
    liste.forEach(x => {
      if (typeof Documents !== 'undefined' && Documents.runRecurring){
        /* Die vorhandene Abo-Logik nutzen, aber ohne Dialog dazwischen */
        const doc = aboRechnung(x.r);
        if (doc) erzeugt.push(doc);
      }
    });
    UI.closeModal();
    UI.toast(`${erzeugt.length} ${erzeugt.length===1?'Rechnung':'Rechnungen'} erzeugt`, 'ok');
    App.rerender();
  }

  /* Wie Documents.runRecurring, aber ohne den Editor zu öffnen */
  function aboRechnung(r){
    const s = Store.settings();
    const datum = U.today();
    const zeitraum = U.MONTHS[new Date(r.naechstesDatum).getMonth()] + ' ' + U.yearOf(r.naechstesDatum);
    const m = mandatFuer(r.customerId);
    const doc = Store.add('documents', {
      typ:'rechnung', nummer: Store.nextNumber('rechnung'), datum,
      customerId: r.customerId, projectId:'',
      betreff: `${r.titel} · ${zeitraum}`,
      anschreiben: m ? `der Betrag wird wie vereinbart von deinem Konto ${ibanKurz(m.iban)} eingezogen. Du musst nichts weiter tun.` : '',
      positionen: [{ beschreibung: r.titel, detail: r.beschreibung||'', menge:1, einheit:'', einzelpreis: U.parseNum(r.betrag) }],
      status:'versendet', versendetAm: datum,
      faellig: U.dueDate(datum, s.zahlungszielTage), zahlungen:[],
      notiz:'', recurringId: r.id,
      einzug: m ? 'offen' : ''          // offen · eingezogen · zurueck
    });
    Store.update('recurring', r.id, {
      naechstesDatum: U.addMonths(r.naechstesDatum, Documents.intervalMonths(r.intervall))
    });
    return doc;
  }

  /* ============================================================
     Einzugsdatei für die Bank
     ============================================================ */

  /* Alle Rechnungen, die per Lastschrift eingezogen werden sollen */
  function einzugsfaehig(){
    return Store.all('documents').filter(d =>
      Store.isOpenInvoice(d) && d.einzug === 'offen' && mandatFuer(d.customerId)
    ).map(d => ({ d, m: mandatFuer(d.customerId), betrag: Store.docOpen(d) }));
  }

  function pruefeStammdaten(){
    const s = Store.settings();
    const fehlt = [];
    if (!s.glaeubigerId) fehlt.push('Gläubiger-Identifikationsnummer');
    if (!ibanGueltig(s.iban)) fehlt.push('deine eigene IBAN in den Firmendaten');
    if (!s.firma) fehlt.push('Firmenname');
    return fehlt;
  }

  /* Frühestes Einzugsdatum: 1 Bankarbeitstag Vorlauf, Wochenenden übersprungen */
  function fruehesterEinzug(){
    let d = U.addDays(U.today(), 1);
    for (let i = 0; i < 6; i++){
      const wt = new Date(d).getDay();
      if (wt !== 0 && wt !== 6) break;
      d = U.addDays(d, 1);
    }
    return d;
  }

  function dateiDialog(){
    const fehlt = pruefeStammdaten();
    const liste = einzugsfaehig();

    if (fehlt.length) return UI.modal({
      title:'Da fehlt noch was',
      body:`<p style="line-height:1.75">Bevor du einziehen kannst, brauche ich:</p>
        <ul style="line-height:2;margin:10px 0 16px 20px">${fehlt.map(f=>`<li>${U.esc(f)}</li>`).join('')}</ul>
        <p class="t-sub" style="line-height:1.7">
          Die Gläubiger-Identifikationsnummer beantragst du kostenlos bei der Deutschen Bundesbank
          unter <b>glaeubiger-id.bundesbank.de</b>. Dauert online ein paar Minuten, die Nummer kommt
          per Mail. Sie sieht so aus: DE98ZZZ09999999999.</p>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Später</button>
            <button class="btn btn-primary" onclick="UI.closeModal();location.hash='#/einstellungen'">Zu den Einstellungen</button>`
    });

    if (!liste.length) return UI.toast('Gerade ist nichts zum Einziehen da.','warn');

    const summe = U.sum(liste, x => x.betrag);
    /* Wer noch nie eingezogen wurde und keine Vorabinfo bekommen hat */
    const ohneInfo = liste.filter(x => !x.m.vorabAm && !schonEingezogen(x.d.customerId));

    UI.modal({
      title:'Einzug vorbereiten',
      wide:true,
      body:`
        ${ohneInfo.length ? `<div class="card card-pad" style="background:var(--amber-bg);border:none;margin-bottom:16px">
          <div style="line-height:1.7;font-size:14px">
            <b>${ohneInfo.length === 1 ? 'Ein Kunde weiß' : ohneInfo.length + ' Kunden wissen'} noch nichts davon:</b>
            ${U.esc(ohneInfo.map(x => Store.custName(x.d.customerId)).join(', '))}.<br>
            Vor dem ersten Einzug musst du einmal Bescheid geben – sonst kann die Lastschrift
            zurückgehen.
            ${ohneInfo.map(x => `<button class="btn btn-sm" style="margin:8px 6px 0 0"
              onclick="Sepa.vorabDialog('${x.d.customerId}')">${U.esc(Store.custName(x.d.customerId))} anschreiben</button>`).join('')}
          </div>
        </div>` : ''}
        <div class="row row-2">
          <div class="field"><label>Einzug am</label>
            <input type="date" id="sepaDatum" value="${fruehesterEinzug()}" min="${fruehesterEinzug()}">
            <div class="hint">Frühestens der nächste Bankarbeitstag</div></div>
          <div class="field"><label>Dateiformat</label>
            <select id="sepaFormat">
              <option value="08">pain.008.001.08 – aktuell, für die meisten Banken</option>
              <option value="02">pain.008.001.02 – älter, falls die Bank meckert</option>
            </select></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Kunde</th><th>Rechnung</th><th>Mandat</th><th style="width:110px;text-align:right">Betrag</th></tr></thead>
          <tbody>${liste.map(x => `<tr>
            <td><b>${U.esc(sepaText(x.m.kontoinhaber || Store.custName(x.d.customerId)))}</b>
              <div class="t-sub">${ibanKurz(x.m.iban)}</div></td>
            <td>${x.d.nummer}</td>
            <td class="t-sub">${U.esc(x.m.referenz)} · ${x.m.art}</td>
            <td style="text-align:right">${U.eur(x.betrag)}</td>
          </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="3" style="text-align:right;font-weight:600;padding-top:10px">Summe</td>
            <td style="text-align:right;font-weight:600;padding-top:10px">${U.eur(summe)}</td></tr></tfoot>
        </table></div>
        <div class="card card-pad" style="background:var(--card-weich);border:none;margin-top:14px">
          <div class="t-sub" style="line-height:1.7">
            <b>So geht es weiter:</b> Datei herunterladen, im Online-Banking deiner Sparkasse unter
            <i>Lastschrift → Datei einreichen</i> hochladen, freigeben. Das Geld ist ein bis zwei Tage
            später da. Die Rechnungen stehen hier so lange auf „eingezogen“, bis du sie beim
            Kontoabgleich als bezahlt buchst.
          </div>
        </div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Sepa.dateiErzeugen()">Datei erzeugen</button>`
    });
  }

  function dateiErzeugen(){
    const datum  = document.getElementById('sepaDatum').value;
    const format = document.getElementById('sepaFormat').value;
    const liste  = einzugsfaehig();
    if (!liste.length) return;

    const xml = bauXml(liste, datum, format);
    const name = `SEPA-Einzug_${datum}.xml`;
    U.download(name, xml);

    /* Merken, was in der Datei steckt */
    const lauf = Store.add('sepalaeufe', {
      datum: U.today(), ausfuehrung: datum, format,
      anzahl: liste.length, summe: U.sum(liste, x => x.betrag),
      datei: name, docIds: liste.map(x => x.d.id)
    });
    liste.forEach(x => Store.update('documents', x.d.id, { einzug:'eingezogen', sepaLaufId: lauf.id }));

    UI.closeModal();
    UI.toast(`${name} gespeichert – jetzt bei der Bank hochladen`, 'ok', 7000);
    App.rerender();
  }

  /* ---------- Die eigentliche XML-Datei ---------- */

  function bauXml(liste, ausfuehrung, format = '08'){
    const s = Store.settings();
    const alt = format === '02';
    const ns  = alt ? 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.02'
                    : 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.08';
    const bicTag = alt ? 'BIC' : 'BICFI';
    const jetzt  = new Date().toISOString().slice(0,19);
    const msgId  = 'KMI' + Date.now().toString(36).toUpperCase();
    const summe  = U.sum(liste, x => x.betrag).toFixed(2);

    /* Basis- und Firmenlastschriften müssen in getrennte Blöcke */
    const gruppen = U.groupBy(liste, x => x.m.art || 'CORE');

    const bloecke = Object.entries(gruppen).map(([art, items], nr) => {
      const teilSumme = U.sum(items, x => x.betrag).toFixed(2);
      const posten = items.map(x => {
        const inhaber = sepaText(x.m.kontoinhaber || Store.custName(x.d.customerId), 70);
        const zweck   = sepaText(`Rechnung ${x.d.nummer} ${x.d.betreff || ''}`, 140);
        return `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${xmlEsc(sepaText(x.d.nummer, 35))}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${x.betrag.toFixed(2)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${xmlEsc(x.m.referenz)}</MndtId>
            <DtOfSgntr>${x.m.datum}</DtOfSgntr>
            <AmdmntInd>false</AmdmntInd>
          </MndtRltdInf>
        </DrctDbtTx>${x.m.bic ? `
        <DbtrAgt><FinInstnId><${bicTag}>${xmlEsc(x.m.bic)}</${bicTag}></FinInstnId></DbtrAgt>` : (alt ? `
        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>` : '')}
        <Dbtr><Nm>${xmlEsc(inhaber)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${xmlEsc(ibanRoh(x.m.iban))}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${xmlEsc(zweck)}</Ustrd></RmtInf>
      </DrctDbtTxInf>`;
      }).join('\n');

      return `    <PmtInf>
      <PmtInfId>${xmlEsc(msgId)}-${nr+1}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${items.length}</NbOfTxs>
      <CtrlSum>${teilSumme}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>${art}</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${ausfuehrung}</ReqdColltnDt>
      <Cdtr><Nm>${xmlEsc(sepaText(s.firma, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${xmlEsc(ibanRoh(s.iban))}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId>${s.bic ? `<${bicTag}>${xmlEsc(s.bic.replace(/\s/g,''))}</${bicTag}>` : `<Othr><Id>NOTPROVIDED</Id></Othr>`}</FinInstnId></CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id><PrvtId><Othr>
          <Id>${xmlEsc(String(s.glaeubigerId).replace(/\s/g,''))}</Id>
          <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
        </Othr></PrvtId></Id>
      </CdtrSchmeId>
${posten}
    </PmtInf>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${xmlEsc(msgId)}</MsgId>
      <CreDtTm>${jetzt}</CreDtTm>
      <NbOfTxs>${liste.length}</NbOfTxs>
      <CtrlSum>${summe}</CtrlSum>
      <InitgPty><Nm>${xmlEsc(sepaText(s.firma, 70))}</Nm></InitgPty>
    </GrpHdr>
${bloecke}
  </CstmrDrctDbtInitn>
</Document>`;
  }

  /* ---------- Vorabinformation ----------
     Vor dem ersten Einzug muss der Kunde einmal Bescheid bekommen. */

  /* Wurde bei dem Kunden schon mal eingezogen? */
  const schonEingezogen = customerId => Store.all('documents').some(d =>
    d.customerId === customerId && (d.einzug === 'eingezogen' || d.sepaLaufId));

  function vorabDialog(customerId){
    const c = Store.byId('customers', customerId) || {};
    const text = vorabText(customerId);
    if (!text) return UI.toast('Für den Kunden gibt es kein aktives Abo mit Mandat.','warn');

    UI.modal({
      title:'Bescheid geben · ' + (c.firma || ''),
      body:`
        <p class="t-sub" style="line-height:1.7;margin-bottom:14px">
          Vor dem ersten Einzug muss der Kunde einmal informiert werden – Betrag, Termin,
          Mandatsreferenz. Danach reicht die Rechnung.
        </p>
        <div class="field"><label>Text</label>
          <textarea id="vorabFeld" rows="13">${U.esc(text)}</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${c.email ? `<a class="btn btn-primary" href="${U.mailto(c.email,
              'Umstellung auf Lastschrift', text)}">Mail öffnen</a>` : ''}
          ${c.telefon ? `<a class="btn" target="_blank" href="${U.waLink(c.telefon, text)}">WhatsApp</a>` : ''}
          <button class="btn" onclick="UI.copyText(document.getElementById('vorabFeld').value)">Kopieren</button>
        </div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Schließen</button>
            <button class="btn btn-primary" onclick="Sepa.vorabErledigt('${customerId}')">Erledigt</button>`
    });
  }

  function vorabErledigt(customerId){
    const m = mandatFuer(customerId);
    if (m) Store.update('mandate', m.id, { vorabAm: U.today() });
    UI.closeModal(); UI.toast('Abgehakt – jetzt kannst du einziehen','ok'); App.rerender();
  }

  function vorabText(customerId){
    const s = Store.settings();
    const m = mandatFuer(customerId);
    const abos = Store.all('recurring').filter(r => r.customerId === customerId && r.aktiv);
    if (!m || !abos.length) return '';
    const betrag = U.sum(abos, r => U.parseNum(r.betrag));
    const c = Store.byId('customers', customerId) || {};
    const anrede = c.ansprechpartner ? `Moin ${c.ansprechpartner.split(' ')[0]},` : 'Moin,';
    return `${anrede}

kurze Info vorab, damit du Bescheid weißt: Ab sofort ziehe ich ${U.eur(betrag)} monatlich
per Lastschrift von deinem Konto ${ibanKurz(m.iban)} ein, jeweils zum Monatsanfang.

Mandatsreferenz: ${m.referenz}
Gläubiger-ID: ${s.glaeubigerId || '(folgt)'}

Die Rechnung bekommst du wie gewohnt vorher per Mail. Du musst nichts tun.

Viele Grüße
${s.inhaber}`;
  }

  /* ---------- Rücklastschrift ---------- */

  function ruecklauf(docId){
    const d = Store.byId('documents', docId);
    UI.modal({
      title:'Lastschrift kam zurück · ' + d.nummer,
      body:`
        <p style="line-height:1.7;margin-bottom:14px">
          Das Geld ist zurückgebucht worden. Die Rechnung steht damit wieder offen.
        </p>
        <div class="field"><label>Warum</label>
          <select id="rlGrund">
            <option value="deckung">Konto nicht gedeckt</option>
            <option value="widerspruch">Kunde hat widersprochen</option>
            <option value="konto">Konto gibt es nicht mehr / falsche IBAN</option>
            <option value="mandat">Kein gültiges Mandat</option>
            <option value="sonstiges">Anderer Grund</option>
          </select></div>
        <div class="row row-2">
          <div class="field"><label>Rücklastschrift-Gebühr €</label>
            <input type="number" id="rlGebuehr" value="0" step="0.50">
            <div class="hint">Was deine Bank dir berechnet hat</div></div>
          <div class="field"><label>Datum</label>
            <input type="date" id="rlDatum" value="${U.today()}"></div>
        </div>
        <label class="check"><input type="checkbox" id="rlMandat">
          Mandat sperren – bei diesem Kunden nicht mehr einziehen</label>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Sepa.ruecklaufSpeichern('${docId}')">Speichern</button>`
    });
  }

  function ruecklaufSpeichern(docId){
    const v = k => (document.getElementById(k)||{}).value;
    const d = Store.byId('documents', docId);
    const grund = v('rlGrund');
    const gebuehr = U.parseNum(v('rlGebuehr'));
    const sperren = document.getElementById('rlMandat')?.checked;

    Store.update('documents', docId, {
      einzug: 'zurueck',
      status: 'versendet',
      notiz: (d.notiz ? d.notiz + '\n' : '') + `Lastschrift zurück am ${U.de(v('rlDatum'))} (${grund})`
    });
    if (gebuehr > 0){
      Store.add('expenses', {
        datum: v('rlDatum'), betrag: gebuehr, was: `Rücklastschrift ${d.nummer}`,
        kategorie: 'bankgebuehren', notiz: `${Store.custName(d.customerId)} · ${grund}`
      });
    }
    if (sperren){
      const m = mandatFuer(d.customerId);
      if (m) Store.update('mandate', m.id, { status:'widerrufen',
        notiz: (m.notiz ? m.notiz + ' · ' : '') + `gesperrt nach Rücklastschrift ${U.de(v('rlDatum'))}` });
    }
    UI.closeModal();
    UI.toast('Rücklastschrift erfasst – die Rechnung steht wieder offen', 'ok');
    App.rerender();
  }

  /* ============================================================
     Ansicht
     ============================================================ */

  function render(){
    const s = Store.settings();
    const ms = mandate();
    const aktiv = ms.filter(m => m.status === 'aktiv');
    const faellig = faelligeAbos();
    const einzug = einzugsfaehig();
    const laeufe = U.sortBy(Store.all('sepalaeufe'), l => l.datum, 'desc');
    const unterwegs = Store.all('documents').filter(d => d.einzug === 'eingezogen' && Store.isOpenInvoice(d));
    const zurueck = Store.all('documents').filter(d => d.einzug === 'zurueck' && Store.isOpenInvoice(d));
    const abos = Store.all('recurring').filter(r => r.aktiv);
    const monatlich = U.sum(abos, r => U.parseNum(r.betrag) /
      ({monatlich:1,quartal:3,halbjahr:6,jahr:12}[r.intervall]||1));

    return `
    <div class="page-head">
      <div><h1>Lastschrift</h1>
        <div class="sub">Monatliche Beträge selbst einziehen – ohne Zahlungsdienstleister</div></div>
      <div class="actions">
        <button class="btn" onclick="Sepa.mandatBearbeiten()">+ Mandat</button>
        ${faellig.length ? `<button class="btn" onclick="Sepa.laufStarten()">Monatslauf (${faellig.length})</button>` : ''}
        ${einzug.length ? `<button class="btn btn-primary" onclick="Sepa.dateiDialog()">${einzug.length} einziehen · ${U.eur0(U.sum(einzug,x=>x.betrag))}</button>` : ''}
      </div>
    </div>

    ${!s.glaeubigerId ? `
    <div class="card card-pad" style="margin-bottom:18px;background:var(--amber-bg);border:none">
      <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;margin-bottom:6px;color:var(--amber)">
        Ein Schritt fehlt noch</div>
      <div style="line-height:1.75;font-size:14px">
        Zum Einziehen brauchst du eine <b>Gläubiger-Identifikationsnummer</b>. Die gibt es kostenlos
        bei der Deutschen Bundesbank unter <b>glaeubiger-id.bundesbank.de</b> – online beantragt,
        kommt per Mail. Danach trägst du sie in den Einstellungen ein, dann läuft das hier.
      </div>
    </div>` : ''}

    <div class="grid grid-4" style="margin-bottom:18px">
      <div class="kpi accent-green"><div class="label">Planbar im Monat</div><div class="value">${U.eur0(monatlich)}</div>
        <div class="foot">${abos.length} ${abos.length===1?'Abo':'Abos'} aktiv</div></div>
      <div class="kpi"><div class="label">Mandate</div><div class="value">${aktiv.length}</div>
        <div class="foot">${ms.length - aktiv.length ? (ms.length-aktiv.length)+' widerrufen' : 'alle gültig'}</div></div>
      <div class="kpi ${einzug.length?'accent-amber':''}"><div class="label">Bereit zum Einzug</div><div class="value">${einzug.length}</div>
        <div class="foot">${einzug.length ? U.eur0(U.sum(einzug,x=>x.betrag)) : 'nichts offen'}</div></div>
      <div class="kpi ${zurueck.length?'accent-red':''}"><div class="label">Zurückgekommen</div><div class="value">${zurueck.length}</div>
        <div class="foot">${zurueck.length ? 'nachhaken' : 'keine Rückläufer'}</div></div>
    </div>

    ${zurueck.length ? `
    <div class="card" style="margin-bottom:18px">
      <div class="card-head"><h3>Zurückgekommen</h3>
        <div class="actions t-sub">Geld ist wieder weg – da musst du ran</div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Kunde</th><th>Rechnung</th><th style="width:110px;text-align:right">Betrag</th><th style="width:180px"></th></tr></thead>
        <tbody>${zurueck.map(d => `<tr>
          <td><b>${U.esc(Store.custName(d.customerId))}</b></td>
          <td>${d.nummer}<div class="t-sub">${U.esc(U.cut(d.notiz||'',60))}</div></td>
          <td style="text-align:right">${U.eur(Store.docOpen(d))}</td>
          <td style="text-align:right">
            <button class="btn btn-sm" onclick="Documents.open('${d.id}')">Öffnen</button>
            <button class="btn btn-sm" onclick="Documents.sendMenu('${d.id}')">Anschreiben</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    ${unterwegs.length ? `
    <div class="card" style="margin-bottom:18px">
      <div class="card-head"><h3>Eingezogen, Geld noch nicht da</h3>
        <div class="actions t-sub">wird beim Kontoabgleich verbucht</div></div>
      <div class="table-wrap"><table>
        <tbody>${unterwegs.map(d => `<tr>
          <td><b>${U.esc(Store.custName(d.customerId))}</b> <span class="t-sub">${d.nummer}</span></td>
          <td style="text-align:right">${U.eur(Store.docOpen(d))}</td>
          <td style="text-align:right;width:210px">
            <button class="btn btn-sm" onclick="Documents.markPaid('${d.id}')">Ist da</button>
            <button class="btn btn-sm btn-ghost" onclick="Sepa.ruecklauf('${d.id}')">Kam zurück</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card" style="margin-bottom:18px">
      <div class="card-head"><h3>Mandate</h3>
        <div class="actions"><button class="btn btn-sm" onclick="Sepa.mandatstext()">Mandat zum Unterschreiben</button></div></div>
      ${ms.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Kunde</th><th>Konto</th><th>Referenz</th><th style="width:100px">Seit</th>
          <th style="width:110px;text-align:right">Abo</th><th style="width:190px">Status</th></tr></thead>
        <tbody>${ms.map(m => {
          const abo = U.sum(Store.all('recurring').filter(r => r.customerId===m.customerId && r.aktiv),
                            r => U.parseNum(r.betrag));
          /* Vor dem ersten Einzug muss der Kunde Bescheid bekommen */
          const vorabNoetig = m.status === 'aktiv' && !m.vorabAm && !schonEingezogen(m.customerId);
          return `<tr class="clickable" onclick="Sepa.mandatBearbeiten('${m.id}')">
            <td><b>${U.esc(Store.custName(m.customerId))}</b>
              ${m.kontoinhaber && m.kontoinhaber !== Store.custName(m.customerId)
                ? `<div class="t-sub">Konto: ${U.esc(m.kontoinhaber)}</div>` : ''}</td>
            <td class="t-sub">${ibanKurz(m.iban)}</td>
            <td class="t-sub">${U.esc(m.referenz)}${m.art==='B2B'?' <span class="badge blue">B2B</span>':''}</td>
            <td class="t-sub">${U.deShort(m.datum)}</td>
            <td style="text-align:right">${abo ? U.eur(abo) : '<span class="t-sub">–</span>'}</td>
            <td onclick="event.stopPropagation()">${m.status !== 'aktiv'
              ? '<span class="badge red">widerrufen</span>'
              : vorabNoetig
                ? `<button class="btn btn-sm" onclick="Sepa.vorabDialog('${m.customerId}')">Bescheid geben</button>`
                : '<span class="badge green">gültig</span>'}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`
      : UI.empty('Noch kein Mandat. Ohne unterschriebenes Mandat darfst du nicht einziehen.',
          `<button class="btn btn-primary" onclick="Sepa.mandatBearbeiten()">+ Erstes Mandat</button>`)}
    </div>

    ${laeufe.length ? `
    <div class="card">
      <div class="card-head"><h3>Eingereichte Dateien</h3></div>
      <div class="table-wrap"><table>
        <thead><tr><th style="width:100px">Erstellt</th><th style="width:110px">Einzug am</th>
          <th>Datei</th><th style="width:80px;text-align:right">Posten</th>
          <th style="width:110px;text-align:right">Summe</th></tr></thead>
        <tbody>${laeufe.slice(0,12).map(l => `<tr>
          <td class="t-sub">${U.deShort(l.datum)}</td>
          <td>${U.deShort(l.ausfuehrung)}</td>
          <td class="t-sub">${U.esc(l.datei)}</td>
          <td style="text-align:right">${l.anzahl}</td>
          <td style="text-align:right">${U.eur(l.summe)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card card-pad" style="margin-top:18px">
      <h3 style="font-size:15px;margin-bottom:8px">Wie das abläuft</h3>
      <div class="t-sub" style="line-height:1.8">
        <b>1.</b> Kunde unterschreibt das Mandat – ausdrucken über den Knopf oben. Aufheben!<br>
        <b>2.</b> Mandat hier eintragen, Abo anlegen (unter <i>Abos</i>).<br>
        <b>3.</b> Einmal vorab Bescheid geben, dass jetzt eingezogen wird.<br>
        <b>4.</b> Monatslauf drücken – die Rechnungen entstehen automatisch.<br>
        <b>5.</b> Datei erzeugen, im Online-Banking hochladen, freigeben.<br>
        <b>6.</b> Ein bis zwei Tage später ist das Geld da und wird beim Kontoabgleich verbucht.<br><br>
        Kommt eine Lastschrift zurück, trägst du das hier ein – die Rechnung steht dann wieder
        offen und die Bankgebühr landet in den Ausgaben.
      </div>
    </div>`;
  }

  return { render, mandatBearbeiten, mandatSpeichern, mandatLoeschen, kundeGewechselt, ibanPruefen,
           mandatstext, mandatDrucken, mandatBogen, mfArt, laufStarten, laufAusfuehren, dateiDialog, dateiErzeugen,
           ruecklauf, ruecklaufSpeichern, vorabText, vorabDialog, vorabErledigt, schonEingezogen,
           mandatFuer, mandate, einzugsfaehig, faelligeAbos, laufVorschau, bauXml,
           ibanGueltig, ibanRoh, ibanHuebsch, ibanKurz, sepaText, fruehesterEinzug, pruefeStammdaten };
})();
