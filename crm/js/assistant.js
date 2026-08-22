/* ============================================================
   Kurani CRM – Assistent
   Redet mit dir über deine eigenen Zahlen und schreibt Texte.
   Läuft direkt gegen die Claude API, ohne Server dazwischen.
   Der Schlüssel liegt nur in deinem Browser (localStorage).
   ============================================================ */
const Assist = (() => {

  const API = 'https://api.anthropic.com/v1/messages';
  const VERSION = '2023-06-01';

  /* Preise in Dollar je 1 Mio Token (Stand 08/2026) */
  const MODELLE = {
    'claude-opus-5': {
      name:  'Claude Opus 5',
      hint:  'am schlausten – für Analysen und schwierige Texte',
      in: 5.00, out: 25.00, denkt: true, effort: true
    },
    'claude-sonnet-5': {
      name:  'Claude Sonnet 5',
      hint:  'schnell und deutlich günstiger – reicht für den Alltag',
      in: 3.00, out: 15.00, denkt: true, effort: true
    },
    'claude-haiku-4-5': {
      name:  'Claude Haiku 4.5',
      hint:  'am günstigsten – kurze Fragen, einfache Texte',
      in: 1.00, out: 5.00, denkt: false, effort: false
    }
  };
  const STD_MODELL = 'claude-opus-5';
  const USD_EUR = 0.92;              // grober Umrechnungskurs für die Anzeige

  let verlauf   = [];                // {rolle, text}
  let laeuft    = false;
  let abbruch   = null;

  /* ---------- Einstellungen ---------- */

  const key      = () => (Store.settings().kiKey || '').trim();
  const modell   = () => Store.settings().kiModell || STD_MODELL;
  const modellInfo = () => MODELLE[modell()] || MODELLE[STD_MODELL];
  const bereit   = () => key().startsWith('sk-ant-');

  /* ---------- Kostenkonto ---------- */

  function kosten(){
    const k = Store.data().kiKosten || {};
    return { monat: k.monat || U.monthKey(U.today()), cent: k.cent || 0, fragen: k.fragen || 0 };
  }
  function kostenBuchen(usd){
    const d = Store.data();
    const jetzt = U.monthKey(U.today());
    let k = d.kiKosten || {};
    if (k.monat !== jetzt) k = { monat: jetzt, cent: 0, fragen: 0 };
    k.cent   = Math.round((k.cent + usd * USD_EUR * 100) * 100) / 100;
    k.fragen = (k.fragen || 0) + 1;
    d.kiKosten = k;
    Store.save();
  }
  const preisFuer = u => {
    const m = modellInfo();
    const ein = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25
              + (u.cache_read_input_tokens || 0) * 0.1;
    return (ein * m.in + (u.output_tokens || 0) * m.out) / 1e6;
  };

  /* ============================================================
     Der Lagebericht – das, was der Assistent über dich weiß
     ============================================================ */

  function lage(){
    const s  = Store.settings();
    const h  = U.today();
    const j  = U.yearOf(h);
    const z  = [];
    const F  = (typeof Finance !== 'undefined') ? Finance : null;

    z.push(`STAND: ${U.de(h)}`);
    z.push(`BETRIEB: ${s.firma}, ${s.inhaber}, ${s.strasse}, ${s.plz} ${s.ort}`);
    z.push(`STEUER: ${s.kleinunternehmer
      ? 'Kleinunternehmer nach § 19 UStG, keine Umsatzsteuer auf Rechnungen'
      : `Regelbesteuerung, ${U.num(s.ustSatz)} % Umsatzsteuer`}`);
    z.push(`STUNDENSATZ: ${U.eur(s.stundensatz)} · KAPAZITÄT: ${s.kapazitaetStd} Std/Woche · JAHRESZIEL: ${U.eur(s.umsatzzielJahr)}`);

    /* --- Geld --- */
    if (F){
      const ein = F.einnahmen(j), aus = F.betriebsausgaben(j), gew = F.gewinn(j);
      const ziel = U.parseNum(s.umsatzzielJahr) || 0;
      z.push('');
      z.push(`GELD ${j} (nur bezahlte Rechnungen zählen als Einnahme):`);
      z.push(`  Einnahmen ${U.eur(ein)} · Betriebsausgaben ${U.eur(aus)} · Gewinn ${U.eur(gew)}`);
      if (ziel) z.push(`  Jahresziel ${U.eur(ziel)} – erreicht: ${Math.round(ein / ziel * 100)} %`);
      z.push(`  Empfohlene Steuer-Rücklage (${s.ruecklageProzent} %): ${U.eur(gew * U.parseNum(s.ruecklageProzent) / 100)}`);
      z.push(`  Noch offen (unbezahlte Rechnungen): ${U.eur(F.offenGesamt())}`);
      /* Nur die Monate, die schon vorbei sind – nicht die leeren am Jahresende */
      const m = F.monthly ? F.monthly(j) : null;
      if (m && m.length){
        const bisJetzt = m.slice(0, new Date(h).getMonth() + 1);
        const letzte = bisJetzt.slice(-6)
          .map(x => `${x.label}: ${U.eur(x.ein)} rein, ${U.eur(x.aus)} raus`).join(' · ');
        if (letzte) z.push(`  Monate: ${letzte}`);
      }
    }

    /* --- Offene Rechnungen --- */
    const offen = Store.all('documents').filter(Store.isOpenInvoice)
      .sort((a,b) => (a.faellig||'').localeCompare(b.faellig||''));
    z.push('');
    z.push(`OFFENE RECHNUNGEN (${offen.length}):`);
    if (!offen.length) z.push('  keine – alles bezahlt');
    offen.slice(0, 40).forEach(d => {
      const tage = U.daysAgo(d.faellig || d.datum);
      const stufe = (typeof Documents !== 'undefined' && Documents.mahnLevel) ? Documents.mahnLevel(d) : 0;
      z.push(`  ${d.nummer} · ${Store.custName(d.customerId)} · ${U.eur(Store.docOpen(d))} · fällig ${U.de(d.faellig)}`
        + (tage > 0 ? ` · ${tage} Tage überfällig` : '')
        + (stufe > 0 ? ` · nächste Mahnstufe ${stufe}` : ''));
    });

    /* --- Abos und Lastschrift --- */
    const abos = Store.all('recurring').filter(r => r.aktiv);
    if (abos.length || (typeof Sepa !== 'undefined' && Sepa.mandate().length)){
      const proMonat = U.sum(abos, r => U.parseNum(r.betrag) /
        ({monatlich:1,quartal:3,halbjahr:6,jahr:12}[r.intervall]||1));
      z.push('');
      z.push(`WIEDERKEHRENDE EINNAHMEN: ${U.eur(proMonat)} pro Monat aus ${abos.length} ${abos.length===1?'Abo':'Abos'}`);
      abos.slice(0, 15).forEach(r => {
        const m = (typeof Sepa !== 'undefined') ? Sepa.mandatFuer(r.customerId) : null;
        z.push(`  ${Store.custName(r.customerId)} · ${r.titel} · ${U.eur(r.betrag)} ${r.intervall}`
          + ` · nächste Rechnung ${U.de(r.naechstesDatum)}`
          + (m ? ' · wird per Lastschrift eingezogen' : ' · zahlt auf Rechnung, kein Lastschriftmandat'));
      });
      if (typeof Sepa !== 'undefined'){
        const rueck = Store.all('documents').filter(d => d.einzug === 'zurueck' && Store.isOpenInvoice(d));
        if (rueck.length) z.push(`  ACHTUNG: ${rueck.length} Lastschrift(en) kamen zurück: `
          + rueck.map(d => `${d.nummer} ${Store.custName(d.customerId)} ${U.eur(Store.docOpen(d))}`).join(', '));
      }
    }

    /* --- Aufgaben --- */
    if (typeof App !== 'undefined' && App.Agenda){
      const t = App.Agenda.build();
      z.push('');
      z.push(`WAS ANSTEHT (${t.length} Punkte, wichtigste zuerst):`);
      if (!t.length) z.push('  nichts Dringendes');
      t.slice(0, 20).forEach(x => z.push(`  [${x.prio===1?'dringend':x.prio===2?'bald':'irgendwann'}] ${x.titel} – ${U.cut(x.sub||'', 110)}`));
    }

    /* --- Projekte --- */
    const proj = Store.all('projects').filter(p => p.status !== 'fertig' && p.status !== 'abgelehnt');
    z.push('');
    z.push(`LAUFENDE PROJEKTE (${proj.length}):`);
    if (!proj.length) z.push('  keine offenen Projekte');
    proj.slice(0, 30).forEach(p => {
      const std = U.sum(Store.all('times').filter(t => t.projectId === p.id), t => U.parseNum(t.stunden));
      z.push(`  ${p.titel} · ${Store.custName(p.customerId)} · Status ${p.status || 'offen'}`
        + (p.deadline ? ` · Deadline ${U.de(p.deadline)}` : '')
        + (p.wert ? ` · Wert ${U.eur(p.wert)}` : '')
        + (std ? ` · bisher ${U.num(std)} Std` : ''));
    });

    /* --- Kunden --- */
    const kunden = Store.all('customers').map(c => ({
      c, umsatz: Store.customerRevenue(c.id), letzte: Store.lastActivity(c.id)
    })).sort((a,b) => b.umsatz - a.umsatz);
    z.push('');
    z.push(`KUNDEN (${kunden.length}, nach Umsatz):`);
    kunden.slice(0, 35).forEach(k => {
      const mat = (typeof Customers !== 'undefined' && Customers.materialFuer)
        ? Customers.materialFuer(k.c.id).summe : 0;
      z.push(`  ${k.c.firma}${k.c.ort ? ', ' + k.c.ort : ''} · Umsatz gesamt ${U.eur(k.umsatz)}`
        + (mat ? ` · Material ${U.eur(mat)} (bleiben ${U.eur(k.umsatz - mat)})` : '')
        + (k.letzte ? ` · zuletzt ${U.de(k.letzte)}` : ' · noch kein Auftrag')
        + (k.c.email ? ` · ${k.c.email}` : '')
        + (k.c.telefon ? ` · ${k.c.telefon}` : ''));
    });

    /* --- Termine --- */
    if (typeof Cal !== 'undefined'){
      const bis = U.addDays(h, 14);
      const term = Store.all('events')
        .filter(e => e.datum >= h && e.datum <= bis)
        .sort((a,b) => (a.datum+(a.zeit||'')).localeCompare(b.datum+(b.zeit||'')));
      z.push('');
      z.push(`TERMINE NÄCHSTE 14 TAGE (${term.length}):`);
      if (!term.length) z.push('  keine');
      term.slice(0, 20).forEach(e => z.push(`  ${U.de(e.datum)}${e.zeit ? ' '+e.zeit : ''} · ${e.titel}`
        + (e.ort ? ` · ${e.ort}` : '') + (e.customerId ? ` · ${Store.custName(e.customerId)}` : '')));
    }

    /* --- Letzte Dokumente --- */
    const docs = Store.all('documents').slice().sort((a,b) => (b.datum||'').localeCompare(a.datum||''));
    z.push('');
    z.push('ZULETZT GESCHRIEBEN:');
    docs.slice(0, 12).forEach(d => z.push(`  ${U.de(d.datum)} · ${d.typ} ${d.nummer} · ${Store.custName(d.customerId)} · ${U.eur(Store.docTotal(d))} · ${d.bezahlt ? 'bezahlt' : d.status || 'offen'}`));

    /* --- Posteingang --- */
    const inbox = Store.all('inbox').filter(i => i.status !== 'erledigt');
    if (inbox.length){
      z.push('');
      z.push(`UNBEARBEITET IM POSTEINGANG (${inbox.length}):`);
      inbox.slice(0, 12).forEach(i => z.push(`  ${i.kanal || 'Nachricht'} von ${i.von || Store.custName(i.customerId) || 'unbekannt'}: ${U.cut(i.text, 130)}`));
    }

    /* --- Preise, die du wirklich genommen hast --- */
    if (typeof Knowledge !== 'undefined' && Knowledge.preisRows){
      const p = Knowledge.preisRows();
      if (p && p.length){
        z.push('');
        z.push('WAS DU FÜR SOWAS BISHER GENOMMEN HAST:');
        p.slice(0, 25).forEach(r => z.push(`  ${r.was || r.leistung} · ${U.eur(r.preis)}`
          + (r.kunde ? ` · ${r.kunde}` : '') + (r.datum ? ` · ${U.de(r.datum)}` : '')));
      }
    }

    return z.join('\n');
  }

  /* ---------- Was der Assistent sein soll ---------- */

  function anleitung(){
    const s = Store.settings();
    return `Du bist der Assistent im CRM von ${s.firma} – der Werbetechnik- und Grafikagentur von ${s.inhaber} in ${s.ort} (Ostfriesland).
Du sprichst mit ${s.inhaber.split(' ')[0]} selbst. Du duzt ihn und antwortest auf Deutsch, ruhig und ohne Werbesprache.

So arbeitest du:
- Fass dich kurz. Auf eine einfache Frage kommt eine einfache Antwort, kein Vortrag und keine Überschriften.
- Du bekommst unten seinen aktuellen Stand. Rechne nur mit diesen Zahlen. Erfinde nie eine Zahl, einen Kunden oder einen Termin dazu.
- Fehlt dir etwas für eine saubere Antwort, sag genau das und nenne, was fehlt.
- Nennst du Geld, dann im Format 1.234,56 €. Datum als 17.08.2026.
- Wenn du rechnest, zeig die Rechnung in einer Zeile, damit er sie nachvollziehen kann.

Wenn er einen Text will (Mail, WhatsApp, Angebotstext, Mahnung):
- Schreib ihn fertig zum Abschicken, ohne Platzhalter wie [Name] – die Namen stehen unten in den Daten.
- Sein Ton: höflich, direkt, norddeutsch-knapp. Keine Floskeln, kein "wir freuen uns sehr", keine Ausrufezeichen-Ketten.
- Bei Mahnungen: sachlich, ohne Drohung, mit konkreter Rechnungsnummer, Betrag und neuem Datum.

Grenzen, an die du dich hältst:
- Du bist kein Steuerberater. Bei Steuerfragen rechnest und erklärst du, sagst aber dazu, dass die verbindliche Auskunft vom Steuerberater kommt.
- Du verschickst nichts und änderst nichts in den Daten. Du schreibst Vorschläge, abschicken tut er selbst.
- Bei Preisen orientierst du dich an dem, was er in vergleichbaren Fällen genommen hat, und an seinem Stundensatz von ${U.eur(s.stundensatz)}.`;
  }

  /* ============================================================
     API-Aufruf mit laufender Ausgabe
     ============================================================ */

  async function frage(text, onText){
    const m = modellInfo();
    const body = {
      model: modell(),
      max_tokens: 8000,
      stream: true,
      system: [
        { type:'text', text: anleitung() },
        { type:'text', text: 'AKTUELLER STAND SEINES BETRIEBS:\n\n' + lage(),
          cache_control: { type:'ephemeral' } }
      ],
      messages: verlauf.map(v => ({ role: v.rolle, content: v.text }))
    };
    /* Nur Modelle, die das können, bekommen Denk-Einstellungen */
    if (m.denkt)  body.thinking = { type:'adaptive' };
    if (m.effort) body.output_config = { effort: Store.settings().kiEffort || 'low' };

    abbruch = new AbortController();
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        signal: abbruch.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key(),
          'anthropic-version': VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body)
      });
    } catch(e){
      if (e.name === 'AbortError') return { abgebrochen:true };
      throw new Error('Keine Verbindung zu Claude. Bist du online?');
    }

    if (!res.ok){
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch(e){}
      throw new Error(fehlerText(res.status, detail));
    }

    const leser = res.body.getReader();
    const dec = new TextDecoder();
    let puffer = '', usage = {}, antwort = '';

    while (true){
      let stueck;
      try { stueck = await leser.read(); }
      catch(e){ if (e.name === 'AbortError') break; throw e; }
      if (stueck.done) break;

      puffer += dec.decode(stueck.value, { stream:true });
      const zeilen = puffer.split('\n');
      puffer = zeilen.pop();

      for (const zeile of zeilen){
        if (!zeile.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(zeile.slice(5).trim()); } catch(e){ continue; }

        if (ev.type === 'message_start' && ev.message?.usage){
          Object.assign(usage, ev.message.usage);
        }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta'){
          antwort += ev.delta.text;
          onText(antwort);
        }
        if (ev.type === 'message_delta'){
          if (ev.usage) Object.assign(usage, ev.usage);
          if (ev.delta?.stop_reason === 'refusal'){
            antwort += '\n\n(Claude hat diese Anfrage abgelehnt. Formulier sie anders.)';
            onText(antwort);
          }
        }
        if (ev.type === 'error'){
          throw new Error(ev.error?.message || 'Claude hat einen Fehler gemeldet.');
        }
      }
    }

    const usd = preisFuer(usage);
    if (usd > 0) kostenBuchen(usd);
    return { text: antwort, usd };
  }

  function fehlerText(status, detail){
    if (status === 401) return 'Der Schlüssel wird nicht akzeptiert. Prüf ihn in den Einstellungen – er fängt mit sk-ant- an.';
    if (status === 400) return 'Claude konnte mit der Anfrage nichts anfangen: ' + (detail || 'unbekannter Grund');
    if (status === 429) return 'Zu viele Anfragen hintereinander oder das Guthaben ist leer. Warte kurz und probier es nochmal.';
    if (status === 529) return 'Claude ist gerade überlastet. Probier es in einer Minute nochmal.';
    if (status >= 500)  return 'Bei Claude ist etwas schiefgelaufen. Probier es gleich nochmal.';
    return `Fehler ${status}${detail ? ': ' + detail : ''}`;
  }

  /* ============================================================
     Oberfläche
     ============================================================ */

  const SCHNELL = [
    'Was ist heute das Wichtigste?',
    'Wie stehe ich dieses Jahr finanziell da?',
    'Welche Rechnung hängt am längsten und was schreibe ich dazu?',
    'Habe ich nächste Woche noch Zeit für einen neuen Auftrag?',
    'Welcher Kunde meldet sich lange nicht mehr?',
    'Was muss ich für die Steuer zurücklegen?'
  ];

  function render(){
    if (!bereit()) return renderSetup();
    const k = kosten();
    const m = modellInfo();

    return `
    <div class="page-head">
      <div><h1>Assistent</h1><div class="sub">Fragen zu deinen Zahlen, Texte zum Abschicken</div></div>
      <div class="actions">
        <span class="t-sub" style="margin-right:12px">${m.name} · diesen Monat ${U.eur(k.cent/100)} für ${k.fragen} ${k.fragen===1?'Frage':'Fragen'}</span>
        <button class="btn btn-ghost" onclick="Assist.leeren()">Neues Gespräch</button>
      </div>
    </div>

    <div class="card">
      <div id="chatVerlauf" class="chat-verlauf">
        ${verlauf.length ? verlauf.map(blase).join('') : begruessung()}
      </div>
      <div class="chat-eingabe">
        <textarea id="chatText" rows="2" placeholder="Frag mich was, oder sag mir, was ich schreiben soll…"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();Assist.senden()}"></textarea>
        <button class="btn btn-primary" id="chatSenden" onclick="Assist.senden()">Fragen</button>
      </div>
    </div>

    <div class="t-sub" style="margin-top:14px;line-height:1.6">
      Für jede Frage geht dein aktueller Stand – Kunden, Rechnungen, Zahlen – an Claude.
      Der Schlüssel liegt nur auf diesem Gerät. Der Assistent ändert nichts, er schlägt nur vor.
    </div>`;
  }

  function begruessung(){
    const std = new Date().getHours();
    const gruss = std < 11 ? 'Moin' : std < 18 ? 'Hallo' : 'Nabend';
    return `
    <div class="chat-start">
      <div class="chat-start-titel">${gruss}, Ibo.</div>
      <div class="chat-start-text">Ich kenne deine Kunden, Rechnungen, Projekte und Zahlen. Frag einfach.</div>
      <div class="chat-schnell">
        ${SCHNELL.map(f => `<button class="chip" onclick="Assist.schnell(${JSON.stringify(f).replace(/"/g,'&#34;')})">${U.esc(f)}</button>`).join('')}
      </div>
    </div>`;
  }

  function blase(v){
    return v.rolle === 'user'
      ? `<div class="chat-ich"><div class="chat-blase">${U.esc(v.text).replace(/\n/g,'<br>')}</div></div>`
      : `<div class="chat-du"><div class="chat-text">${md(v.text)}</div></div>`;
  }

  /* Kleiner Markdown-Übersetzer – reicht für das, was zurückkommt */
  function md(t){
    let h = U.esc(t);
    h = h.replace(/```([\s\S]*?)```/g, (m,c) => `<pre class="chat-pre">${c.trim()}</pre>`);
    h = h.replace(/^### (.+)$/gm, '<b>$1</b>');
    h = h.replace(/^## (.+)$/gm,  '<b>$1</b>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/^[-*] (.+)$/gm, '<span class="chat-li">$1</span>');
    h = h.replace(/^(\d+)\. (.+)$/gm, '<span class="chat-li"><b>$1.</b> $2</span>');
    return h.replace(/\n/g, '<br>');
  }

  function renderSetup(){
    return `
    <div class="page-head">
      <div><h1>Assistent</h1><div class="sub">Einmal einrichten, dann kannst du reden</div></div>
    </div>
    <div class="card" style="max-width:640px">
      <div class="card-pad">
        <p style="line-height:1.7;margin-bottom:16px">
          Der Assistent liest deine Zahlen und beantwortet Fragen dazu. Dafür braucht er einen
          Zugang zu Claude. Den holst du dir einmal – er kostet nach Verbrauch, ohne Abo.
        </p>
        <ol style="line-height:2;margin:0 0 20px 20px">
          <li>Auf <b>console.anthropic.com</b> anmelden</li>
          <li>Etwas Guthaben aufladen (5 € reichen für den Anfang lange)</li>
          <li>Unter <b>API Keys</b> einen Schlüssel erzeugen und kopieren</li>
          <li>Hier einsetzen:</li>
        </ol>
        <div class="field">
          <label>Dein Schlüssel</label>
          <input type="password" id="kiKeySetup" placeholder="sk-ant-…" autocomplete="off">
        </div>
        <button class="btn btn-primary" onclick="Assist.keySpeichern()">Speichern und loslegen</button>
        <div class="t-sub" style="margin-top:16px;line-height:1.6">
          Der Schlüssel wird nur in diesem Browser gespeichert und geht ausschließlich an Anthropic.
          Er landet nicht im Backup und nicht im Handy-Sync.
        </div>
      </div>
    </div>`;
  }

  /* ---------- Aktionen ---------- */

  function keySpeichern(){
    const el = document.getElementById('kiKeySetup');
    const v = (el.value || '').trim();
    if (!v.startsWith('sk-ant-')) return UI.toast('Das sieht nicht nach einem Schlüssel aus – er fängt mit sk-ant- an.', 'warn');
    Store.setSetting({ kiKey: v });
    UI.toast('Fertig. Frag mich was.');
    App.rerender();
  }

  function schnell(text){
    const el = document.getElementById('chatText');
    if (el) el.value = text;
    senden();
  }

  function leeren(){
    if (laeuft && abbruch) abbruch.abort();
    verlauf = []; laeuft = false;
    App.rerender();
  }

  async function senden(){
    if (laeuft) return;
    const el = document.getElementById('chatText');
    const text = (el?.value || '').trim();
    if (!text) return;
    if (!bereit()) return UI.toast('Erst den Schlüssel in den Einstellungen eintragen.', 'warn');

    el.value = '';
    verlauf.push({ rolle:'user', text });
    laeuft = true;
    zeichnen(true);

    const knopf = document.getElementById('chatSenden');
    if (knopf){ knopf.textContent = 'Stopp'; knopf.onclick = () => abbruch && abbruch.abort(); }

    try {
      const r = await frage(text, teil => {
        const el2 = document.getElementById('chatLaeuft');
        if (el2) el2.innerHTML = md(teil);
        const v = document.getElementById('chatVerlauf');
        if (v) v.scrollTop = v.scrollHeight;
      });
      if (r.abgebrochen){
        verlauf.push({ rolle:'assistant', text:'(abgebrochen)' });
      } else {
        verlauf.push({ rolle:'assistant', text: r.text || '(keine Antwort)' });
      }
    } catch(e){
      verlauf.push({ rolle:'assistant', text:'⚠ ' + e.message });
    }

    laeuft = false;
    App.rerender();
    setTimeout(() => {
      const v = document.getElementById('chatVerlauf');
      if (v) v.scrollTop = v.scrollHeight;
      document.getElementById('chatText')?.focus();
    }, 30);
  }

  function zeichnen(mitLaeuft){
    const v = document.getElementById('chatVerlauf');
    if (!v) return;
    v.innerHTML = verlauf.map(blase).join('')
      + (mitLaeuft ? '<div class="chat-du"><div class="chat-text" id="chatLaeuft"><span class="chat-punkte"><i></i><i></i><i></i></span></div></div>' : '');
    v.scrollTop = v.scrollHeight;
  }

  /* ---------- Von außen aufrufbar: Text für etwas Bestimmtes ---------- */

  function textFuer(auftrag){
    location.hash = '#/assistent';
    setTimeout(() => {
      const el = document.getElementById('chatText');
      if (el){ el.value = auftrag; senden(); }
    }, 60);
  }

  /* ---------- Größe des Lageberichts, für die Einstellungen ---------- */
  function lageInfo(){
    const t = lage();
    return { zeichen: t.length, tokenCa: Math.round(t.length / 3.4) };
  }

  /* Verlauf von außen setzen – für Tests und für gezielte Aufträge */
  function setVerlauf(v){ verlauf = v || []; }

  return { render, senden, schnell, leeren, keySpeichern, textFuer,
           frage, setVerlauf, lage, lageInfo, anleitung, bereit, kosten,
           MODELLE, STD_MODELL };
})();
