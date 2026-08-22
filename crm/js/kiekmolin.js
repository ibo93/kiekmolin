/* ==========================================================
   Kurani CRM – Kiek mol in anzapfen
   Die Restaurant-Datenbank deiner eigenen App als Akquiseliste
   und als Quelle für fehlende Kontaktdaten.
   Nur lesend – an Kiek mol in wird nichts verändert.
   ========================================================== */
const KMI = (() => {

  /* Zugang zu Kiek mol in steht in js/stammdaten.js – die Datei bleibt
     auf dem Rechner. Der Schluessel ist zwar der oeffentliche anon-Key
     und steht ohnehin im Quelltext von kiekmolin.de, aber in einem
     Code-Verzeichnis hat er nichts verloren. */
  const DEFAULT_URL = (typeof FIRMENDATEN !== 'undefined' && FIRMENDATEN.kmiUrl) || '';
  const DEFAULT_KEY = (typeof FIRMENDATEN !== 'undefined' && FIRMENDATEN.kmiKey) || '';

  let liste = null;      // geladene Restaurants
  let laden = false;
  let fehler = '';
  let filter = 'offen';  // offen | kunde | alle

  const cfg = () => ({
    url: (Store.settings().kmiUrl || DEFAULT_URL).replace(/\/+$/,''),
    key: Store.settings().kmiKey || DEFAULT_KEY
  });

  /* ---------- Namen vergleichbar machen ---------- */
  const WEG = /\b(restaurant|pizzeria|ristorante|caf[eé]|eiscaf[eé]|bistro|imbiss|gasthaus|gaststätte|hotel|zum|zur|der|die|das|und|the)\b/g;
  const norm = s => String(s||'').toLowerCase()
    .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss')
    .replace(WEG,' ').replace(/[^a-z0-9]+/g,' ').trim();

  function match(r){
    const rn = norm(r.name);
    if (!rn) return null;
    let best = null, score = 0;
    Store.all('customers').forEach(c => {
      const cn = norm(c.firma), ck = norm(c.kuerzel);
      let s = 0;
      if (cn && cn === rn) s = 100;
      else if (ck && ck === rn) s = 95;
      else if (cn && rn.includes(cn) && cn.length >= 4) s = 80;
      else if (cn && cn.includes(rn) && rn.length >= 4) s = 78;
      else if (ck && rn.includes(ck) && ck.length >= 4) s = 70;
      if (s && r.city && c.ort && norm(r.city) === norm(c.ort)) s += 5;
      if (s > score){ score = s; best = c; }
    });
    return score >= 70 ? { customer: best, score } : null;
  }

  /* ---------- Laden ---------- */
  async function load(force=false){
    if (liste && !force) return liste;
    laden = true; fehler = '';
    App.rerender();
    try {
      const c = cfg();
      const felder = 'id,name,slug,city,zip,street,phone,whatsapp,email,website,instagram,cuisine_type,is_active,region,tier';
      const res = await fetch(`${c.url}/rest/v1/restaurants?select=${felder}&order=name.asc`, { headers:{ apikey: c.key } });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      liste = await res.json();
    } catch(e){
      fehler = e.message; liste = null;
    }
    laden = false;
    App.rerender();
    return liste;
  }

  /* ================= ANSICHT ================= */
  function render(){
    if (!liste && !laden && !fehler){
      return `
      <div class="page-head">
        <div><h1>Kiek mol in</h1>
          <div class="sub">Deine Restaurant-Datenbank als Akquiseliste</div></div>
      </div>
      <div class="card card-pad">
        <div style="font-size:13.5px;line-height:1.75;color:var(--ink-soft);margin-bottom:16px">
          In Kiek mol in stehen Restaurants aus ganz Ostfriesland – mit Adresse, Telefon und
          teilweise WhatsApp. Ich gleiche die Liste mit deiner Kundenkartei ab und zeige dir:
          <b>wer ist schon Kunde, wer noch nicht</b> – und wo in deiner Kartei Kontaktdaten fehlen,
          die dort längst hinterlegt sind.
          <br><br><span class="t-sub">Es wird nur gelesen. An Kiek mol in ändert sich nichts.</span>
        </div>
        <button class="btn btn-primary" onclick="KMI.load()">Restaurants laden</button>
      </div>`;
    }
    if (laden) return `<div class="page-head"><div><h1>Kiek mol in</h1></div></div>
      <div class="card card-pad"><div class="t-sub">Lade Restaurants …</div></div>`;
    if (fehler) return `
      <div class="page-head"><div><h1>Kiek mol in</h1></div></div>
      <div class="card card-pad">
        <div class="t-strong" style="color:var(--red);margin-bottom:6px">Konnte nicht laden</div>
        <div class="t-sub" style="line-height:1.6;margin-bottom:12px">${U.esc(fehler)}<br>
          Prüf die Zugangsdaten in den Einstellungen oder ob du gerade online bist.</div>
        <button class="btn" onclick="KMI.load(true)">Nochmal versuchen</button>
      </div>`;

    const rows = liste.map(r => ({ r, m: match(r) }));
    const kunden = rows.filter(x => x.m);
    const offen  = rows.filter(x => !x.m);
    // Kunden, bei denen im CRM Kontaktdaten fehlen, die in Kiek mol in stehen
    const luecken = kunden.filter(x => {
      const c = x.m.customer, r = x.r;
      return (!c.telefon && (r.phone || r.whatsapp)) || (!c.email && r.email)
          || (!c.strasse && r.street) || (!c.ort && r.city);
    });

    const anzeigen = filter === 'offen' ? offen : filter === 'kunde' ? kunden : rows;

    return `
    <div class="page-head">
      <div><h1>Kiek mol in</h1>
        <div class="sub">${liste.length} Restaurants · ${kunden.length} sind schon Kunde · ${offen.length} noch nicht</div></div>
      <div class="actions">
        <button class="btn" onclick="KMI.load(true)">Neu laden</button>
        ${offen.length ? `<button class="btn btn-primary" onclick="KMI.kampagne()">Akquise-Aktion starten</button>`:''}
      </div>
    </div>

    ${luecken.length ? `<div class="card card-pad" style="margin-bottom:18px;background:var(--green-bg);border:none">
      <div class="t-strong" style="margin-bottom:5px">${luecken.length} deiner Kunden haben dort Kontaktdaten hinterlegt, die dir fehlen</div>
      <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft);margin-bottom:11px">
        Telefonnummern, Mailadressen, Adressen. Damit funktionieren WhatsApp-Knöpfe und
        Rechnungsadressen im ganzen CRM.</div>
      <button class="btn btn-sm btn-primary" onclick="KMI.fillGaps()">Kontaktdaten übernehmen</button>
    </div>`:''}

    <div class="filterbar">
      <div class="seg">
        <button class="${filter==='offen'?'active':''}" onclick="KMI.setFilter('offen')">Noch kein Kunde (${offen.length})</button>
        <button class="${filter==='kunde'?'active':''}" onclick="KMI.setFilter('kunde')">Schon Kunde (${kunden.length})</button>
        <button class="${filter==='alle'?'active':''}" onclick="KMI.setFilter('alle')">Alle</button>
      </div>
    </div>

    <div class="card table-wrap">
      ${anzeigen.length ? `<table>
        <thead><tr><th>Restaurant</th><th>Ort</th><th>Küche</th><th>Kontakt</th><th>Status</th><th></th></tr></thead>
        <tbody>${anzeigen.map(x => zeile(x)).join('')}</tbody></table>`
      : UI.empty('Nichts in dieser Ansicht.')}
    </div>`;
  }

  function zeile({r, m}){
    const idx = liste.indexOf(r);
    return `<tr>
      <td><div class="t-strong">${U.esc(r.name)}</div>
        ${r.street?`<div class="t-sub">${U.esc(r.street)}</div>`:''}</td>
      <td class="t-sub">${U.esc([r.zip, r.city].filter(Boolean).join(' ') || '–')}</td>
      <td class="t-sub">${U.esc(r.cuisine_type || '–')}</td>
      <td class="t-sub">${U.esc(r.phone || r.whatsapp || r.email || '–')}</td>
      <td>${m ? `<span class="badge green">Kunde</span>` : `<span class="badge grey">offen</span>`}</td>
      <td style="text-align:right;white-space:nowrap">
        ${m
          ? `<button class="btn btn-sm" onclick="location.hash='#/kunde/${m.customer.id}'">Öffnen</button>`
          : `${(r.phone||r.whatsapp) ? `<a class="btn btn-sm" target="_blank"
                href="${U.waLink(r.whatsapp||r.phone, akquiseText(r))}">WhatsApp</a>`:''}
             <button class="btn btn-sm btn-primary" onclick="KMI.anlegen(${idx})">+ Kunde</button>`}
      </td>
    </tr>`;
  }

  function setFilter(f){ filter = f; App.rerender(); }

  /* ---------- Akquise-Text ---------- */
  function akquiseText(r){
    const s = Store.settings();
    return `Moin! Ibo hier von Kurani Design aus Norden. Ich mache Speisekarten, Schilder und `
         + `Beschriftungen für Restaurants hier in der Gegend – unter anderem für ein paar Betriebe in Greetsiel. `
         + `Ich bin auf ${r.name} gestoßen: falls bei euch mal was ansteht, meld dich gern. `
         + `Unverbindlich schauen kostet nichts. Grüße, ${s.inhaber}`;
  }

  /* ---------- Als Kunde anlegen ---------- */
  function anlegen(idx){
    const r = liste[idx];
    const c = Store.add('customers', {
      nr: Store.nextCustomerNr(),
      firma: r.name,
      kuerzel: r.slug || U.slug(r.name),
      ansprechpartner: '',
      strasse: r.street || '',
      plz: r.zip || '',
      ort: r.city || '',
      telefon: r.phone || r.whatsapp || '',
      email: r.email || '',
      notizen: [
        'Aus Kiek mol in übernommen',
        r.cuisine_type ? 'Küche: ' + r.cuisine_type : '',
        r.instagram ? 'Instagram: ' + r.instagram : '',
        r.website ? 'Web: ' + r.website : ''
      ].filter(Boolean).join('\n'),
      stammkunde: false, kmiId: r.id
    });
    UI.toast(`${r.name} als Kunde angelegt (Nr. ${c.nr})`, 'ok');
    App.rerender();
  }

  /* ---------- Kontaktdaten nachtragen ---------- */
  function fillGaps(){
    const rows = liste.map(r => ({ r, m: match(r) })).filter(x => x.m);
    const plan = [];
    rows.forEach(({r, m}) => {
      const c = m.customer, patch = {};
      if (!c.telefon && (r.phone || r.whatsapp)) patch.telefon = r.phone || r.whatsapp;
      if (!c.email && r.email)     patch.email = r.email;
      if (!c.strasse && r.street)  patch.strasse = r.street;
      if (!c.plz && r.zip)         patch.plz = r.zip;
      if (!c.ort && r.city)        patch.ort = r.city;
      if (Object.keys(patch).length) plan.push({ c, patch, r });
    });
    if (!plan.length){ UI.toast('Es fehlt nichts – deine Kartei ist vollständig','ok'); return; }

    window.__kmiApply = () => {
      plan.forEach(x => Store.update('customers', x.c.id, x.patch));
      UI.closeModal();
      UI.toast(plan.length + ' Kunden ergänzt','ok');
      App.rerender();
    };
    UI.modal({
      title:'Kontaktdaten übernehmen',
      wide:true,
      body:`<p style="font-size:13.5px;line-height:1.7;margin-bottom:14px">
          Nur leere Felder werden gefüllt – vorhandene Angaben bleiben, wie sie sind.</p>
        <div class="table-wrap" style="max-height:50vh;overflow-y:auto"><table>
          <thead><tr><th>Kunde</th><th>wird ergänzt um</th></tr></thead>
          <tbody>${plan.map(x=>`<tr>
            <td class="t-strong">${U.esc(x.c.firma)}</td>
            <td class="t-sub">${Object.entries(x.patch).map(([k,v])=>`${k}: <b>${U.esc(v)}</b>`).join(' · ')}</td>
          </tr>`).join('')}</tbody></table></div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="window.__kmiApply()">${plan.length} Kunden ergänzen</button>`
    });
  }

  /* ---------- Akquise-Kampagne ---------- */
  function kampagne(){
    const offen = liste.map(r => ({ r, m: match(r) })).filter(x => !x.m);
    const mitTel = offen.filter(x => x.r.phone || x.r.whatsapp);
    window.__kmiCamp = () => {
      const angelegt = [];
      mitTel.forEach(({r}) => {
        const c = Store.add('customers', {
          nr: Store.nextCustomerNr(), firma: r.name, kuerzel: r.slug || U.slug(r.name),
          ansprechpartner:'', strasse: r.street||'', plz: r.zip||'', ort: r.city||'',
          telefon: r.phone || r.whatsapp || '', email: r.email||'',
          notizen:'Akquise aus Kiek mol in', stammkunde:false, aktiv:true, kmiId:r.id
        });
        angelegt.push(c.id);
      });
      const camp = Store.add('campaigns', {
        titel: 'Akquise Kiek mol in ' + new Date().getFullYear(),
        text: 'Moin {vorname}! Ibo hier von Kurani Design aus Norden. Ich mache Speisekarten, Schilder und Beschriftungen für Restaurants hier in der Gegend. Falls bei euch mal was ansteht – meld dich gern, unverbindlich schauen kostet nichts.',
        gruppe: 'gastro',
        ziele: angelegt.map(id => ({ customerId:id, status:'offen' }))
      });
      UI.closeModal();
      UI.toast(`${angelegt.length} Betriebe angelegt und in die Aktion übernommen`,'ok');
      Campaigns.work(camp.id);
    };
    UI.modal({
      title:'Akquise-Aktion aus Kiek mol in',
      body:`<p style="font-size:13.5px;line-height:1.7;margin-bottom:14px">
          ${offen.length} Betriebe sind noch keine Kunden, davon <b>${mitTel.length} mit Telefonnummer</b>.
          Die lege ich als Kunden an und packe sie in eine Aktion – dann arbeitest du die Liste
          mit vorformulierter Nachricht ab.</p>
        <div class="card card-pad" style="background:var(--card-weich);border:none">
          <div class="t-sub" style="line-height:1.7">
            <b>Ehrlich gesagt:</b> Kaltakquise per WhatsApp hat eine niedrige Trefferquote und kann
            als Werbung ohne Einwilligung heikel sein. Besser funktioniert: die Liste als
            <b>Fahrplan</b> nehmen und dort persönlich reinschauen, wenn du sowieso in der Ecke bist.
            Dafür ist sie gut – Name, Adresse, Nummer stehen dann im CRM.
          </div>
        </div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="window.__kmiCamp()">${mitTel.length} anlegen und Aktion starten</button>`
    });
  }

  return { render, load, setFilter, anlegen, fillGaps, kampagne, match, akquiseText,
           get liste(){ return liste; } };
})();
