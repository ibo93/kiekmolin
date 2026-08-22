/* ==========================================================
   Kurani CRM – Agentur anzapfen

   Gegenstueck zu js/kiekmolin.js. Dort kommt die Restaurant-
   Datenbank rein, hier die Neukunden-Pipeline der Agentur-App:
   wer wurde angerufen, wo steht das Gespraech, was ist an
   seiner Website kaputt.

   Warum das zusammengehoert: die Agentur gewinnt Kunden, das
   CRM stellt ihnen Rechnungen. Solange beide nichts voneinander
   wissen, faellt genau dazwischen Geld runter – ein gewonnener
   Betrieb, den nie jemand als Kunde angelegt hat, bekommt auch
   nie eine Rechnung.

   Die Verbindung laeuft nur, wenn diese Seite VON der Agentur-App
   ausgeliefert wird (http://localhost:3200/crm/). Der Browser
   erlaubt einer Seite im Netz nicht, den Rechner daheim
   anzusprechen – und das ist gut so.
   ========================================================== */
const AG = (() => {

  let daten = null;      // Antwort von /api/crm-pipeline
  let laden = false;
  let fehler = '';
  let filter = 'offen';  // offen | kunde | alle
  let gemeldet = null;   // Ergebnis der letzten Kundenmeldung

  /* Laeuft das CRM unter der Agentur-App? Dann sind die Schnittstellen
     unter derselben Adresse erreichbar und wir duerfen sie fragen. */
  const angebunden = () => location.pathname.indexOf('/crm') === 0
                        && location.protocol.startsWith('http');

  /* ---------- Laden ---------- */
  async function load(force=false){
    if (daten && !force) return daten;
    if (!angebunden()) return null;
    laden = true; fehler = '';
    App.rerender();
    try {
      /* Erst melden, wer hier Kunde ist – dann kommt die Pipeline schon
         mit den Kundennummern zurueck. Uebertragen wird nur Nummer, Name
         und Ort; die Agentur braucht nicht zu wissen, was jemand zahlt. */
      await melde();
      const res = await fetch('/api/crm-pipeline');
      if (!res.ok){
        /* Die Agentur schickt bei einem Fehler einen Klartext mit. Den zu
           zeigen ist mehr wert als "500 Internal Server Error" – dann steht
           da etwa "Datenbank nicht erreichbar" statt einer Nummer. */
        let grund = '';
        try { grund = (await res.json()).fehler || ''; } catch(e){}
        throw new Error(grund || (res.status + ' ' + res.statusText));
      }
      daten = await res.json();
    } catch(e){
      fehler = e.message; daten = null;
    }
    laden = false;
    App.rerender();
    return daten;
  }

  /* ---------- Kunden an die Agentur melden ---------- */
  /* Absichtlich sparsam: id, nr, name, ort. Keine Adresse, keine
     Bankverbindung, keine Umsaetze. Was nicht rausgeht, kann auch nicht
     aus Versehen in einem Report landen. */
  async function melde(){
    const kunden = Store.all('customers')
      .filter(c => c.aktiv !== false)
      .map(c => ({ id: c.id, nr: c.nr, name: c.firma, ort: c.ort }));
    try {
      const res = await fetch('/api/crm-kunden', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ kunden, geraet: 'CRM' })
      });
      gemeldet = res.ok ? await res.json() : null;
    } catch(e){ gemeldet = null; }
    return gemeldet;
  }

  /* ================= ANSICHT ================= */
  function render(){
    if (!angebunden()) return nichtAngebunden();

    if (!daten && !laden && !fehler){
      return `
      <div class="page-head">
        <div><h1>Agentur</h1>
          <div class="sub">Die Neukunden-Pipeline aus der Agentur-App</div></div>
      </div>
      <div class="card card-pad">
        <div style="font-size:13.5px;line-height:1.75;color:var(--ink-soft);margin-bottom:16px">
          Die Agentur-App arbeitet Betriebe in Ostfriesland ab: anrufen, Website prüfen,
          Angebot machen. Hier siehst du, wo jedes Gespräch steht – und was daraus
          hier im CRM werden muss.
          <br><br>
          <span class="t-sub">Beim Laden meldet das CRM der Agentur, wer schon Kunde ist –
          Nummer, Name, Ort, sonst nichts. Damit ruft dort niemand deine eigenen Kunden
          kalt an.</span>
        </div>
        <button class="btn btn-primary" onclick="AG.load()">Pipeline laden</button>
      </div>`;
    }
    if (laden) return `<div class="page-head"><div><h1>Agentur</h1></div></div>
      <div class="card card-pad"><div class="t-sub">Lade Pipeline …</div></div>`;
    if (fehler) return `
      <div class="page-head"><div><h1>Agentur</h1></div></div>
      <div class="card card-pad">
        <div class="t-strong" style="color:var(--red);margin-bottom:6px">Konnte nicht laden</div>
        <div class="t-sub" style="line-height:1.6;margin-bottom:12px">${U.esc(fehler)}<br>
          Läuft die Agentur-App noch? Prüf das im Fenster, das beim Starten aufgeht –
          steht dort ein Fehler, ist das die eigentliche Ursache.</div>
        <button class="btn" onclick="AG.load(true)">Nochmal versuchen</button>
      </div>`;

    const rows = daten.liste || [];
    const offen  = rows.filter(x => !x.erledigt);
    const kunde  = rows.filter(x => x.stufe === 'kunde');
    const anzeigen = filter === 'offen' ? offen : filter === 'kunde' ? kunde : rows;
    const l = daten.luecken || { fehltImCrm:[], nurImCrm:[] };

    return `
    <div class="page-head">
      <div><h1>Agentur</h1>
        <div class="sub">${rows.length} Betriebe · ${offen.length} offen · ${kunde.length} gewonnen</div></div>
      <div class="actions">
        <button class="btn" onclick="AG.load(true)">Neu laden</button>
        <a class="btn" href="/" target="_blank">Agentur-App öffnen</a>
      </div>
    </div>

    ${l.fehltImCrm.length ? `<div class="card card-pad" style="margin-bottom:18px;background:var(--green-bg);border:none">
      <div class="t-strong" style="margin-bottom:5px">${l.fehltImCrm.length} gewonnene${l.fehltImCrm.length===1?'r':''} Betrieb${l.fehltImCrm.length===1?'':'e'} ${l.fehltImCrm.length===1?'steht':'stehen'} noch nicht in deiner Kartei</div>
      <div style="font-size:13.5px;line-height:1.65;color:var(--ink-soft);margin-bottom:11px">
        ${l.fehltImCrm.map(x=>U.esc(x.name)).join(' · ')}<br>
        ${l.fehltImCrm.length===1
          ? 'Solange er hier fehlt, kannst du ihm keine Rechnung schreiben und kein Abo einziehen.'
          : 'Solange sie hier fehlen, kannst du ihnen keine Rechnung schreiben und kein Abo einziehen.'}</div>
      <button class="btn btn-sm btn-primary" onclick="AG.gewonneneAnlegen()">Als Kunden anlegen</button>
    </div>`:''}

    ${l.nurImCrm.length ? `<div class="card card-pad" style="margin-bottom:18px;background:var(--card-weich);border:none">
      <div class="t-strong" style="margin-bottom:5px">${l.nurImCrm.length} deiner Kunden ${l.nurImCrm.length===1?'steht':'stehen'} drüben noch als offener Interessent</div>
      <div class="t-sub" style="line-height:1.65">
        ${l.nurImCrm.map(x=>`${U.esc(x.name)} <span style="opacity:.6">(Nr. ${U.esc(x.kundennr||'–')}, ${U.esc(x.stufe)})</span>`).join(' · ')}<br>
        Die Agentur weiß es jetzt – kalt angerufen wird da niemand mehr.</div>
    </div>`:''}

    <div class="filterbar">
      <div class="seg">
        <button class="${filter==='offen'?'active':''}" onclick="AG.setFilter('offen')">Offen (${offen.length})</button>
        <button class="${filter==='kunde'?'active':''}" onclick="AG.setFilter('kunde')">Gewonnen (${kunde.length})</button>
        <button class="${filter==='alle'?'active':''}" onclick="AG.setFilter('alle')">Alle (${rows.length})</button>
      </div>
    </div>

    <div class="card table-wrap">
      ${anzeigen.length ? `<table>
        <thead><tr><th>Betrieb</th><th>Ort</th><th>Stand</th><th>Website-Check</th><th>Im CRM</th><th></th></tr></thead>
        <tbody>${anzeigen.map(zeile).join('')}</tbody></table>`
      : UI.empty('Nichts in dieser Ansicht.')}
    </div>`;
  }

  /* Die Ampel des Betriebs-Checks: wie groß ist die Lücke, über die man
     mit dem Wirt redet. Ohne Check bleibt die Spalte leer statt zu raten. */
  const AMPEL = {
    gross:  ['red',   'große Lücke'],
    mittel: ['amber', 'einiges offen'],
    klein:  ['green', 'gut aufgestellt']
  };

  function zeile(x){
    const a = AMPEL[x.ampel];
    return `<tr>
      <td><div class="t-strong">${U.esc(x.name)}</div>
        ${x.quelle==='anfrage'?`<div class="t-sub">hat selbst angefragt</div>`:''}</td>
      <td class="t-sub">${U.esc(x.stadt || '–')}</td>
      <td><span class="badge ${x.faellig?'amber':'grey'}">${U.esc(stufeText(x.stufe))}</span>
        ${x.faellig?`<div class="t-sub">Wiedervorlage fällig</div>`:''}</td>
      <td class="t-sub">${a?`<span class="badge ${a[0]}">${a[1]}</span>`
          + (x.luecken!=null?` <span style="opacity:.6">${x.luecken} Punkt${x.luecken===1?'':'e'}</span>`:'')
        :'noch nicht geprüft'}</td>
      <td>${x.crm
        ? `<a class="t-strong" href="#/kunde/${U.esc(x.crm.id)}">Nr. ${U.esc(x.crm.nr||'–')}</a>`
        : `<span class="t-sub">–</span>`}</td>
      <td style="text-align:right;white-space:nowrap">
        ${x.crm
          ? `<button class="btn btn-sm" onclick="location.hash='#/kunde/${x.crm.id}'">Öffnen</button>`
          : `<button class="btn btn-sm btn-primary" onclick="AG.anlegen('${U.esc(x.schluessel)}')">+ Kunde</button>`}
      </td>
    </tr>`;
  }

  const stufeText = id => ((daten && daten.stufen || []).find(s => s.id === id) || {}).text || id;

  function setFilter(f){ filter = f; App.rerender(); }

  /* ---------- Einen Betrieb als Kunde anlegen ---------- */
  function anlegen(schluessel){
    const c = legeAn(schluessel);
    if (!c) return;
    UI.toast(`${c.firma} als Kunde angelegt (Nr. ${c.nr})`, 'ok');
    load(true);
  }

  /* Nur anlegen, ohne Meldung und ohne Neuladen: beim Anlegen mehrerer
     Betriebe auf einmal wuerde sonst jede einzelne Zeile die Pipeline
     neu holen – zehn Betriebe, zehn Abfragen. */
  function legeAn(schluessel){
    const x = (daten && daten.liste || []).find(e => e.schluessel === schluessel);
    if (!x) return null;
    return Store.add('customers', {
      nr: Store.nextCustomerNr(),
      firma: x.name,
      kuerzel: U.slug(x.name),
      ansprechpartner: x.ansprechpartner || '',
      strasse: '', plz: '', ort: x.stadt || '',
      telefon: x.telefon || '',
      email: (x.kontakt||'').includes('@') ? x.kontakt : '',
      notizen: [
        'Aus der Agentur-Pipeline übernommen',
        x.notiz ? 'Notiz: ' + x.notiz : '',
        x.aufhaenger ? 'Aufhänger: ' + x.aufhaenger : '',
        x.website ? 'Web: ' + x.website : '',
        x.anfrage ? 'Anfrage: ' + x.anfrage : ''
      ].filter(Boolean).join('\n'),
      stammkunde: false, agenturSchluessel: x.schluessel
    });
  }

  /* ---------- Alle gewonnenen auf einmal ---------- */
  function gewonneneAnlegen(){
    const fehlt = (daten.luecken && daten.luecken.fehltImCrm) || [];
    if (!fehlt.length) return;
    window.__agApply = () => {
      const angelegt = fehlt.map(f => legeAn(f.schluessel)).filter(Boolean);
      UI.closeModal();
      UI.toast(angelegt.length + (angelegt.length===1 ? ' Kunde angelegt' : ' Kunden angelegt'),'ok');
      load(true);
    };
    UI.modal({
      title:'Gewonnene Betriebe als Kunden anlegen',
      body:`<p style="font-size:13.5px;line-height:1.7;margin-bottom:14px">
          Diese Betriebe haben in der Agentur zugesagt, stehen hier aber noch nicht
          in der Kartei. Ich lege sie mit Name, Ort und Telefonnummer an – Adresse
          und Rechnungsdaten trägst du beim ersten Auftrag nach.</p>
        <div class="table-wrap" style="max-height:50vh;overflow-y:auto"><table>
          <thead><tr><th>Betrieb</th><th>Ort</th></tr></thead>
          <tbody>${fehlt.map(f=>`<tr>
            <td class="t-strong">${U.esc(f.name)}</td>
            <td class="t-sub">${U.esc(f.stadt||'–')}</td>
          </tr>`).join('')}</tbody></table></div>`,
      foot:`<button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="window.__agApply()">${fehlt.length} anlegen</button>`
    });
  }

  /* ---------- Wenn das CRM im Netz liegt ---------- */
  function nichtAngebunden(){
    return `
    <div class="page-head">
      <div><h1>Agentur</h1>
        <div class="sub">Neukunden-Pipeline, Telefon-Retter, Sichtbarkeits-Reports</div></div>
    </div>
    <div class="card card-pad">
      <div style="font-size:13.5px;line-height:1.75;color:var(--ink-soft)">
        Diese Fassung des CRM liegt im Netz. Die Agentur-App läuft dagegen auf
        deinem Mac – und eine Seite aus dem Netz darf deinen Rechner nicht
        ansprechen. Das ist eine Schutzregel des Browsers, keine Einstellung,
        die man umlegen kann.
        <br><br>
        <b>So kommst du an die Verbindung:</b> starte die Agentur-App
        (Doppelklick auf <i>Agentur starten.command</i>) und öffne das CRM dann
        unter
        <br><code style="background:var(--card-weich);padding:3px 7px;border-radius:5px;display:inline-block;margin-top:6px">http://localhost:3200/crm/</code>
        <br><br>
        Dort siehst du die Pipeline, legst gewonnene Betriebe mit einem Klick als
        Kunden an – und die Agentur weiß, wen sie nicht mehr anrufen darf.
        <br><br>
        <span class="t-sub">Deine Daten sind dabei nicht weg: das CRM speichert pro
        Adresse getrennt. Nutzt du den Handy-Sync, ist drüben derselbe Stand.
        Sonst einmal hier <b>Backup sichern</b> und drüben einlesen.</span>
      </div>
    </div>`;
  }

  return { render, load, setFilter, anlegen, legeAn, gewonneneAnlegen, melde, angebunden,
           get daten(){ return daten; } };
})();
