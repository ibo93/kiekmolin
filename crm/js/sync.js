/* ==========================================================
   Kurani CRM – Sync zwischen Mac und Handy
   Läuft über Supabase (eigene Tabelle crm_state, hinter Login
   und Row Level Security). Keine Bibliothek nötig – reines fetch.
   Ohne Login funktioniert das CRM ganz normal lokal weiter.
   ========================================================== */
const Sync = (() => {

  // Zugangsdaten stehen in den Einstellungen, nicht im Code –
  // so lässt sich das Supabase-Projekt jederzeit wechseln.
  const TABLE = 'crm_state';
  const cfg = () => {
    const s = Store.settings();
    /* Auch schon gespeicherte Adressen zurechtbiegen – wer einmal
       „…/rest/v1" eingetragen hat, soll nicht ewig damit festhängen. */
    return { url: normalisiereUrl(s.syncUrl).url, anon: s.syncKey||'', table: TABLE };
  };
  const konfiguriert = () => !!(cfg().url && cfg().anon);
  const AUTH_KEY = 'kurani_crm_auth';

  let auth = null;          // {access_token, refresh_token, expires_at, email, user_id}
  let status = 'aus';       // aus | bereit | laeuft | fehler | konflikt
  let lastError = '';
  let pushTimer = null;
  let busy = false;

  /* ---------- Gerätename ---------- */
  function device(){
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua))   return 'iPad';
    if (/Android/.test(ua))return 'Android';
    if (/Mac/.test(ua))    return 'Mac';
    if (/Win/.test(ua))    return 'Windows';
    return 'Gerät';
  }

  /* ---------- Login-Daten ---------- */
  function loadAuth(){
    try { auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch(e){ auth = null; }
    status = auth ? 'bereit' : 'aus';
    return auth;
  }
  function saveAuth(a){ auth = a; localStorage.setItem(AUTH_KEY, JSON.stringify(a)); }
  function clearAuth(){ auth = null; localStorage.removeItem(AUTH_KEY); status = 'aus'; }
  const isOn = () => !!auth;

  /* ---------- HTTP ---------- */
  async function api(path, opts={}, withToken=true){
    const c = cfg();
    if (!c.url || !c.anon) throw new Error('Sync ist noch nicht eingerichtet (Projekt-URL und Schlüssel fehlen).');
    const headers = { 'apikey': c.anon, 'Content-Type':'application/json', ...(opts.headers||{}) };
    if (withToken && auth?.access_token) headers['Authorization'] = 'Bearer ' + auth.access_token;
    const res = await fetch(c.url + path, {...opts, headers});
    if (res.status === 401 && withToken && auth?.refresh_token){
      const ok = await refresh();
      if (ok) return api(path, opts, withToken);
    }
    if (!res.ok){
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); msg = j.msg || j.message || j.error_description || j.hint || msg; } catch(e){}
      throw new Error(msg);
    }
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  /* Konto selbst anlegen – spart den Umweg über Authentication → Users.
     Je nach Projekteinstellung schickt Supabase noch eine Bestätigungsmail. */
  async function signUp(email, password){
    const r = await api('/auth/v1/signup', {
      method:'POST', body: JSON.stringify({ email, password })
    }, false);
    if (r.access_token){
      saveAuth({ access_token:r.access_token, refresh_token:r.refresh_token,
                 expires_at: Date.now() + (r.expires_in||3600)*1000,
                 email, user_id: r.user?.id });
      status = 'bereit';
      return { angemeldet: true };
    }
    /* Kein Token: Supabase will erst eine Bestätigung per Mail */
    return { angemeldet: false, bestaetigen: true };
  }

  async function login(email, password){
    const r = await api('/auth/v1/token?grant_type=password', {
      method:'POST', body: JSON.stringify({ email, password })
    }, false);
    saveAuth({ access_token:r.access_token, refresh_token:r.refresh_token,
               expires_at: Date.now() + (r.expires_in||3600)*1000,
               email, user_id: r.user?.id });
    status = 'bereit';
    return true;
  }

  async function refresh(){
    try {
      const r = await api('/auth/v1/token?grant_type=refresh_token', {
        method:'POST', body: JSON.stringify({ refresh_token: auth.refresh_token })
      }, false);
      saveAuth({...auth, access_token:r.access_token, refresh_token:r.refresh_token,
                expires_at: Date.now() + (r.expires_in||3600)*1000});
      return true;
    } catch(e){ clearAuth(); return false; }
  }

  function logout(){
    clearAuth();
    const d = Store.data();
    d.meta.lastSync = null; d.meta.dirty = false; Store.save();
    UI.toast('Sync ausgeschaltet – Daten bleiben lokal erhalten');
    App.rerender();
  }

  /* ---------- Stand holen / schicken ---------- */
  async function pull(){
    const rows = await api(`/rest/v1/${TABLE}?select=payload,updated_at,device&limit=1`);
    return rows && rows.length ? rows[0] : null;
  }

  async function push(){
    const d = Store.data();
    /* Ohne Zugangsschlüssel – die bleiben auf dem Gerät, auf dem sie eingetragen wurden */
    const payload = Store.dataOhneGeheim();
    const body = { user_id: auth.user_id, payload, updated_at: new Date().toISOString(), device: device() };
    await api(`/rest/v1/${TABLE}`, {
      method:'POST',
      headers:{ 'Prefer':'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body)
    });
    d.meta.lastSync = body.updated_at;
    d.meta.dirty = false;
    Store.save(true);
    return body.updated_at;
  }

  /* ---------- Zählung für den Konflikt-Dialog ---------- */
  function count(payload){
    const p = payload || Store.data();
    return ['customers','projects','documents','expenses','times','recurring','inbox','ideas','todos','campaigns']
      .reduce((n,k) => n + ((p[k]||[]).length), 0);
  }

  /* ---------- Automatischer Abgleich ---------- */
  async function run(silent=true){
    if (!isOn() || busy) return;
    busy = true; status = 'laeuft'; paint();
    try {
      const remote = await pull();
      const d = Store.data();
      const lokalGeaendert = !!d.meta.dirty;
      const remoteNeuer = remote && (!d.meta.lastSync || remote.updated_at > d.meta.lastSync);

      if (!remote){                                   // erste Sicherung
        /* Vorsicht bei der allerersten Ablage: Wer hier ein leeres Gerät
           hochlädt, muss sich später durch einen Konflikt kämpfen. Besser
           fängt man auf dem Gerät an, auf dem die Daten liegen. */
        if (count() === 0){
          status = 'bereit'; busy = false; paint();
          leerDialog();
          return;
        }
        await push();
        if (!silent) UI.toast(`Erstmalig hochgeladen – ${count()} Einträge liegen jetzt oben`,'ok');
      } else if (remoteNeuer && !lokalGeaendert){     // sauber übernehmen
        Store.importBackup(remote.payload, 'replace');
        Store.data().meta.lastSync = remote.updated_at;
        Store.data().meta.dirty = false;
        Store.save(true);
        if (!silent) UI.toast(`Stand von ${remote.device||'anderem Gerät'} übernommen`,'ok');
        App.rerender();
      } else if (remoteNeuer && lokalGeaendert){      // Konflikt
        status = 'konflikt'; busy = false; paint();
        conflictDialog(remote);
        return;
      } else if (lokalGeaendert){                     // hochladen
        await push();
        if (!silent) UI.toast('Hochgeladen','ok');
      }
      status = 'bereit'; lastError = '';
    } catch(e){
      status = 'fehler'; lastError = e.message;
      if (!silent) UI.toast('Sync-Fehler: ' + e.message, 'err');
    }
    busy = false; paint();
  }

  /* ---------- Konflikt ---------- */
  /* Dieses Gerät ist leer und in der Ablage liegt auch noch nichts.
     Dann bringt Hochladen nichts – erst das volle Gerät anmelden. */
  function leerDialog(){
    window.__syncTrotzdem = async () => {
      UI.closeModal();
      try { await push(); UI.toast('Leerer Stand hochgeladen','ok'); }
      catch(e){ UI.toast('Fehler: ' + e.message,'err'); }
      App.rerender();
    };
    UI.modal({
      title: 'Hier ist noch nichts drin',
      body: `<div style="line-height:1.75">
          Du bist angemeldet – aber auf diesem Gerät stehen keine Kunden, Rechnungen
          oder Projekte, und in der Ablage liegt auch noch nichts.
          <div class="card card-pad" style="background:var(--card-weich);border:none;margin-top:14px">
            <div style="line-height:1.7;font-size:13.5px">
              <b>Fang auf dem Gerät an, auf dem deine Daten liegen</b> – auf dem Mac.
              Dort anmelden, dann wandert alles nach oben. Danach hier nochmal
              <b>Jetzt abgleichen</b> drücken und der Stand kommt herunter.
            </div>
          </div>
          <div class="t-sub" style="margin-top:14px;line-height:1.7">
            Lädst du hier einen leeren Stand hoch, musst du dich später durch eine
            Konfliktabfrage arbeiten. Erspar dir das.
          </div>
        </div>`,
      foot: `<button class="btn left" onclick="window.__syncTrotzdem()">Trotzdem hochladen</button>
             <button class="btn btn-primary" onclick="UI.closeModal()">Alles klar</button>`
    });
  }

  function conflictDialog(remote){
    window.__syncTakeRemote = async () => {
      Store.importBackup(remote.payload, 'replace');
      Store.data().meta.lastSync = remote.updated_at;
      Store.data().meta.dirty = false;
      Store.save(true);
      UI.closeModal(); UI.toast('Stand vom anderen Gerät übernommen','ok');
      status='bereit'; App.rerender();
    };
    window.__syncTakeLocal = async () => {
      UI.closeModal();
      try { await push(); UI.toast('Dein Stand ist jetzt überall','ok'); status='bereit'; }
      catch(e){ UI.toast('Fehler: '+e.message,'err'); }
      App.rerender();
    };
    window.__syncBackupThen = () => { Store.exportBackup(); };

    const lokal = count();
    const fremd = count(remote.payload);
    UI.modal({
      title:'Zwei verschiedene Stände',
      body:`<p style="font-size:14px;line-height:1.7;margin-bottom:16px">
          Auf diesem Gerät und auf ${U.esc(remote.device||'einem anderen Gerät')} wurde jeweils etwas geändert,
          seit zuletzt abgeglichen wurde. Zusammenführen geht hier nicht automatisch –
          du musst einen Stand wählen. <b>Mach vorher ein Backup</b>, dann ist nichts verloren.</p>
        <div class="grid grid-2" style="gap:12px">
          <div class="card card-pad">
            <div class="t-strong">Dieses Gerät (${U.esc(device())})</div>
            <div class="t-sub" style="margin-top:5px;line-height:1.6">
              ${lokal} Einträge<br>zuletzt abgeglichen: ${Store.data().meta.lastSync ? U.de(Store.data().meta.lastSync.slice(0,10)) : 'nie'}</div>
            <button class="btn btn-sm btn-primary" style="margin-top:11px" onclick="window.__syncTakeLocal()">Diesen behalten</button>
          </div>
          <div class="card card-pad">
            <div class="t-strong">${U.esc(remote.device||'Anderes Gerät')}</div>
            <div class="t-sub" style="margin-top:5px;line-height:1.6">
              ${fremd} Einträge<br>gespeichert: ${U.de(remote.updated_at.slice(0,10))}</div>
            <button class="btn btn-sm btn-primary" style="margin-top:11px" onclick="window.__syncTakeRemote()">Diesen holen</button>
          </div>
        </div>`,
      foot:`<button class="btn left" onclick="window.__syncBackupThen()">Erst Backup sichern</button>
            <button class="btn" onclick="UI.closeModal()">Später entscheiden</button>`
    });
  }

  /* ---------- Änderungen melden (aus Store.save) ---------- */
  function onLocalChange(){
    if (!isOn()) return;
    const d = Store.data();
    if (!d.meta.dirty){ d.meta.dirty = true; }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { if (status !== 'konflikt') run(true); }, 4000);
    paint();
  }

  /* ---------- Anzeige in der Sidebar ---------- */
  function paint(){
    const el = document.getElementById('syncHint');
    if (!el) return;
    if (!isOn()){ el.innerHTML = `<span class="t-sub">Nur auf diesem Gerät</span>`; el.className='sync-hint'; return; }
    const d = Store.data();
    const txt = {
      laeuft:   'gleicht ab …',
      konflikt: 'zwei Stände – bitte klären',
      fehler:   'Sync-Fehler',
      bereit:   d.meta.dirty ? 'noch nicht hochgeladen' : (d.meta.lastSync ? 'alles abgeglichen' : 'bereit')
    }[status] || '';
    el.className = 'sync-hint ' + (status==='fehler'||status==='konflikt' ? 'warn' : status==='bereit' && !d.meta.dirty ? 'ok' : '');
    el.innerHTML = `<span class="sync-dot"></span>${U.esc(txt)}`;
  }

  /* ---------- Einstellungs-Bereich ---------- */
  function settingsCard(){
    const d = Store.data();
    return `<div class="card">
      <div class="card-head"><h3>Handy-Sync</h3>
        <div class="actions">${isOn()?'<span class="badge green">an</span>':'<span class="badge grey">aus</span>'}</div></div>
      <div class="card-pad">
        ${isOn() ? `
          <div class="meta-list" style="margin-bottom:14px">
            <div class="meta-row"><div class="k">Angemeldet</div><div class="v">${U.esc(auth.email||'')}</div></div>
            <div class="meta-row"><div class="k">Gerät</div><div class="v">${U.esc(device())}</div></div>
            <div class="meta-row"><div class="k">Zuletzt</div><div class="v">${d.meta.lastSync
              ? U.de(d.meta.lastSync.slice(0,10)) + ' ' + d.meta.lastSync.slice(11,16) + ' Uhr' : 'noch nie'}</div></div>
            <div class="meta-row"><div class="k">Status</div><div class="v">${
              status==='konflikt' ? 'zwei Stände offen' : d.meta.dirty ? 'lokale Änderungen noch nicht oben' : 'alles abgeglichen'}</div></div>
          </div>
          ${lastError ? `<div class="t-sub" style="color:var(--red);margin-bottom:12px">Letzter Fehler: ${U.esc(lastError)}</div>`:''}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="Sync.run(false)">Jetzt abgleichen</button>
            <button class="btn" onclick="Sync.forcePush()">Diesen Stand hochladen</button>
            <button class="btn" onclick="Sync.forcePull()">Stand herunterladen</button>
            <button class="btn btn-danger" onclick="Sync.logout()">Abmelden</button>
          </div>
          <div style="border-top:1px solid var(--line-soft);margin-top:16px;padding-top:14px">
            <button class="btn btn-sm" onclick="Sync.diagnose()">Warum kommt nichts an?</button>
            <div id="syDiagnose"></div>
          </div>
        ` : `
          <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);margin-bottom:16px">
            <b>Dieses Gerät ist noch nicht verbunden</b> – solange du diese Schritte hier siehst,
            liegen die Daten nur in diesem Browser. Sobald der Sync läuft, steht an dieser Stelle
            stattdessen dein Anmeldename und „Jetzt abgleichen“.
          </div>

          ${(() => {
            const s = Store.settings();
            if (!s.syncUrl && !s.syncKey) return '';
            const fehlt = [];
            if (!s.syncUrl) fehlt.push('die Projekt-URL');
            if (!s.syncKey) fehlt.push('der anon-Schlüssel');
            return fehlt.length
              ? `<div class="card card-pad" style="background:var(--amber-bg);border:none;margin-bottom:16px">
                   <div style="line-height:1.7;font-size:13.5px">
                     <b style="color:var(--amber)">Hier hängt es gerade:</b>
                     Es fehlt ${fehlt.join(' und ')} – siehe Schritt 3.
                     Solange das leer ist, bleibt der Anmelden-Knopf grau.
                   </div></div>`
              : `<div class="card card-pad" style="background:var(--amber-bg);border:none;margin-bottom:16px">
                   <div style="line-height:1.7;font-size:13.5px">
                     <b style="color:var(--amber)">Fast – aber noch nicht verbunden.</b>
                     Die Zugangsdaten stehen drin, <b>angemeldet bist du aber noch nicht</b>.
                     Erst damit fließt etwas. Geh runter zu <b>Schritt 3</b> und drück
                     <b>„Konto anlegen"</b> – beim zweiten Gerät <b>„Anmelden"</b>.
                     <div style="margin-top:9px">
                       <button class="btn btn-sm btn-primary" onclick="Sync.loginDialog()">
                         Jetzt anmelden</button>
                     </div>
                   </div></div>`;
          })()}

          <div class="sy-schritt">
            <div class="sy-nr">1</div>
            <div class="sy-text">
              <b>Tabelle in Supabase anlegen</b>
              <div>Im Supabase-Dashboard links auf <b>SQL Editor</b>, den Text hier einfügen
                   und auf <b>Run</b>. Du kannst dein bestehendes Projekt nehmen – es kommt
                   nur eine Tabelle dazu, an den Restaurant-Daten ändert sich nichts.</div>
              <button class="btn btn-sm" style="margin-top:9px" onclick="Sync.sqlZeigen()">SQL anzeigen und kopieren</button>
              ${dashboardLink('/sql/new', 'SQL Editor öffnen')}
            </div>
          </div>

          <div class="sy-schritt ${konfiguriert() ? 'fertig' : ''}">
            <div class="sy-nr">${konfiguriert() ? '&#10003;' : '2'}</div>
            <div class="sy-text">
              <b>Zugangsdaten eintragen</b>
              <div>Im Supabase-Dashboard auf <b>Project Settings → API</b>. Dort stehen
                beide Angaben. Der Schlüssel heißt <b>anon public</b> – in neueren Projekten
                <b>publishable</b>. Beides ist dasselbe und richtig. Finger weg vom
                <b>service_role</b> / <b>secret</b>: der hebelt den Zeilenschutz aus.</div>
              ${dashboardLink('/settings/api', 'Schlüssel-Seite öffnen',
                 'Bleibt die Seite leer, hat Supabase sie verschoben – dann ' +
                 '<a href="{basis}/settings/api-keys" target="_blank" rel="noopener">hier entlang</a>.')}
              <div class="field" style="margin-top:10px"><label>Projekt-URL</label>
                <input type="text" id="syCfgUrl" value="${U.esc(Store.settings().syncUrl||'')}"
                       placeholder="https://xxxxxxxx.supabase.co" autocomplete="off">
                <div class="hint">Steht dort als <b>Project URL</b></div></div>
              <div class="field"><label>anon / public key</label>
                <input type="password" id="syCfgKey" value="${U.esc(Store.settings().syncKey||'')}"
                       placeholder="eyJhbGciOi…" autocomplete="off">
                <div class="hint">Bleibt auf diesem Gerät, geht nicht ins Backup.</div></div>
            </div>
          </div>


          <div class="sy-schritt letzter">
            <div class="sy-nr">3</div>
            <div class="sy-text">
              <b>Konto anlegen und anmelden</b>
              <div>E-Mail und Passwort denkst du dir aus – die App legt das Konto selbst an.
                   Danach auf dem Handy <b>kurani-crm.netlify.app</b> öffnen, dieselbe URL
                   und denselben Schlüssel eintragen und mit <b>denselben</b> Zugangsdaten
                   anmelden. Ab dann sehen beide Geräte denselben Stand – was du hier
                   eintippst, steht dort, und umgekehrt.</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                <button class="btn" onclick="Sync.saveCfg()">Speichern</button>
                <button class="btn" onclick="Sync.testCfg()">Verbindung testen</button>
                <button class="btn btn-primary" ${konfiguriert()?'':'disabled'}
                        onclick="Sync.loginDialog()">Anmelden und einschalten</button>
              </div>
              <div id="syCfgMsg" class="t-sub" style="margin-top:10px"></div>
              <div style="border-top:1px solid var(--line-soft);margin-top:14px;padding-top:12px">
                <button class="btn btn-sm" onclick="Sync.diagnose()">Warum kommt nichts an?</button>
                <div id="syDiagnose"></div>
              </div>
            </div>
          </div>
        `}
      </div>
    </div>`;
  }

  /* ============================================================
     Selbstprüfung: geht die ganze Kette durch und sagt im Klartext,
     wo es klemmt. Gedacht für den Fall "auf dem Mac gespeichert,
     kommt aber nicht am Handy an".
     ============================================================ */
  async function diagnose(){
    const kasten = document.getElementById('syDiagnose');
    if (kasten) kasten.innerHTML = '<div class="t-sub">Prüfe …</div>';
    const zeilen = [];
    const sag = (art, text) => zeilen.push({ art, text });
    const c = cfg(), d = Store.data();

    /* 1 – Zugangsdaten */
    if (!c.url)  sag('fehler', 'Die Projekt-URL fehlt.');
    else if (!c.anon) sag('fehler', 'Der anon-Schlüssel fehlt – ohne den geht gar nichts.');
    else sag('ok', 'Zugangsdaten sind eingetragen.');

    /* 2 – Projekt erreichbar und Tabelle da */
    if (c.url && c.anon){
      try {
        const res = await fetch(`${c.url}/rest/v1/${TABLE}?select=updated_at&limit=1`, { headers:{ apikey: c.anon } });
        if (res.ok) sag('ok', 'Supabase antwortet, die Tabelle crm_state ist da.');
        else {
          const j = await res.json().catch(()=>({}));
          const m = j.message || `${res.status} ${res.statusText}`;
          if (/schema cache|does not exist/i.test(m))
            sag('fehler', 'Die Tabelle crm_state fehlt – Schritt 1 (SQL) wurde noch nicht ausgeführt.');
          else if (res.status === 401)
            sag('fehler', 'Der Schlüssel wird nicht angenommen. Ist das wirklich der anon/public key?');
          else sag('fehler', 'Supabase meldet: ' + m);
        }
      } catch(e){ sag('fehler', 'Keine Verbindung zu Supabase: ' + e.message); }
    }

    /* 3 – angemeldet? */
    if (!isOn()) sag('fehler', 'Du bist auf diesem Gerät NICHT angemeldet. Genau deshalb geht nichts raus.');
    else sag('ok', `Angemeldet als ${auth.email} (${device()}).`);

    /* 4 – was liegt oben, was liegt hier? */
    const hier = count();
    if (isOn()){
      try {
        const oben = await pull();
        if (!oben){
          sag(hier ? 'warn' : 'warn',
              hier ? `In der Ablage liegt noch nichts – deine ${hier} Einträge von hier müssen erst hoch.`
                   : 'In der Ablage liegt noch nichts, und dieses Gerät ist auch leer. Der Anfang muss vom Gerät mit den Daten kommen.');
        } else {
          const dort = count(oben.payload);
          const wann = `${U.de(oben.updated_at.slice(0,10))} ${oben.updated_at.slice(11,16)} Uhr`;
          sag(dort ? 'ok' : 'warn',
              `Oben liegen ${dort} Einträge, hochgeladen von ${oben.device||'unbekannt'} am ${wann}.`);
          sag(hier === dort ? 'ok' : 'warn',
              `Auf diesem Gerät sind ${hier} Einträge.` +
              (hier === dort ? ' Passt zusammen.' :
               hier > dort ? ' Hier ist mehr – dein Stand muss hoch.' :
                             ' Oben ist mehr – hol dir den Stand herunter.'));
        }
      } catch(e){ sag('fehler', 'Konnte die Ablage nicht lesen: ' + e.message); }
    }

    /* 5 – hängt noch was ungesendet herum? */
    if (isOn() && d.meta.dirty)
      sag('warn', 'Auf diesem Gerät gibt es Änderungen, die noch nicht hochgeladen sind. Drück „Jetzt abgleichen".');

    /* 6 – Klartext-Rat */
    /* Der Rat muss zur Lage passen – „kümmere dich um den roten Punkt"
       hilft niemandem, wenn der rote Punkt heisst: hier ist nichts drin. */
    const ersterFehler = zeilen.find(z => z.art === 'fehler');
    const leerHier = isOn() && hier === 0;
    const rat =
        !c.anon   ? 'Trag den anon-Schlüssel in Schritt 2 ein.'
      : !isOn()   ? 'Drück in Schritt 3 auf „Konto anlegen" bzw. „Anmelden". Erst dann geht überhaupt etwas raus.'
      : leerHier  ? 'Hier ist alles eingerichtet – es fehlt nur der Inhalt. Geh an das Gerät, auf dem deine ' +
                    'Daten liegen, melde dich dort mit denselben Zugangsdaten an und drück „Jetzt abgleichen". ' +
                    'Danach hier nochmal „Jetzt abgleichen", dann ist alles da.'
      : ersterFehler ? 'Kümmere dich zuerst um den roten Punkt oben.'
      : d.meta.dirty ? 'Drück „Jetzt abgleichen", dann ist dein Stand oben.'
      : 'Alles in Ordnung. Auf dem anderen Gerät „Jetzt abgleichen" drücken.';

    const farbe = { ok:'var(--green)', warn:'var(--amber)', fehler:'var(--red)' };
    if (kasten) kasten.innerHTML = `
      <div style="margin-top:6px">
        ${zeilen.map(z => `<div style="display:flex;gap:9px;align-items:flex-start;padding:5px 0;line-height:1.55">
            <span style="color:${farbe[z.art]};font-weight:700;flex-shrink:0">${
              z.art==='ok' ? '&#10003;' : z.art==='warn' ? '!' : '&#10007;'}</span>
            <span style="font-size:13px">${U.esc(z.text)}</span>
          </div>`).join('')}
        <div class="card card-pad" style="background:var(--card-weich);border:none;margin-top:10px">
          <div style="font-size:13.5px;line-height:1.7"><b>Was tun:</b> ${U.esc(rat)}</div>
        </div>
      </div>`;
    return zeilen;
  }

  /* ---------- Zugangsdaten ---------- */
  /* Das SQL steht hier im Code, damit du es nicht in einer Datei
     suchen musst – kopieren, im Supabase-SQL-Editor einfügen, Run. */
  const SETUP_SQL = `-- Kurani CRM – Handy-Sync einrichten
-- Supabase Dashboard -> SQL Editor -> alles einfuegen -> RUN
-- Laeuft auch mehrfach ohne Schaden.

-- 1) Tabelle: pro Benutzer genau eine Zeile mit dem kompletten CRM-Stand
create table if not exists public.crm_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  device     text
);

-- 2) Zeilenschutz einschalten: ohne Regel kommt niemand an die Daten
alter table public.crm_state enable row level security;

-- 3) Regeln: jeder sieht und aendert ausschliesslich seine eigene Zeile
drop policy if exists "eigene zeile lesen"   on public.crm_state;
drop policy if exists "eigene zeile anlegen" on public.crm_state;
drop policy if exists "eigene zeile aendern" on public.crm_state;

create policy "eigene zeile lesen" on public.crm_state
  for select using (auth.uid() = user_id);

create policy "eigene zeile anlegen" on public.crm_state
  for insert with check (auth.uid() = user_id);

create policy "eigene zeile aendern" on public.crm_state
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4) Kontrolle: muss "true" zeigen
select relname, relrowsecurity as zeilenschutz_aktiv
from pg_class
where relname = 'crm_state';`;

  /* Aus https://abcd1234.supabase.co wird der Link ins Dashboard.
     Erspart das Suchen – Supabase hat die Seite schon zweimal verschoben,
     darum beide Adressen. */
  /* Baut aus der Projekt-URL einen direkten Link ins Supabase-Dashboard.
     Erspart das Suchen – Supabase hat die Seiten schon mehrfach verschoben. */
  function dashboardLink(pfad, text, zusatz = ''){
    const ref = (Store.settings().syncUrl || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
    if (!ref) return `<div class="hint" style="margin-top:8px">
        Sobald die Projekt-URL unten steht, findest du hier den direkten Link dorthin.
      </div>`;
    const basis = `https://supabase.com/dashboard/project/${ref}`;
    return `<div style="margin:9px 0 2px">
        <a class="btn btn-sm" href="${basis}${pfad}" target="_blank" rel="noopener">${text}</a>
      </div>${zusatz ? `<div class="hint">${zusatz.split('{basis}').join(basis)}</div>` : ''}`;
  }

  function sqlZeigen(){
    UI.modal({
      title: 'SQL für den Sync',
      wide: true,
      body: `<p class="t-sub" style="margin-bottom:12px;line-height:1.7">
          Kopieren, im Supabase-Dashboard links auf <b>SQL Editor</b>, einfügen, <b>Run</b>.
          Das legt eine Tabelle an und schützt sie so, dass nur du an deine Zeile kommst.
          Mehrfach ausführen schadet nicht.
        </p>
        <textarea rows="18" id="sySql" readonly
          style="font-family:ui-monospace,monospace;font-size:12px;line-height:1.5">${U.esc(SETUP_SQL)}</textarea>`,
      foot: `<button class="btn" onclick="UI.closeModal()">Schließen</button>
             <button class="btn btn-primary" onclick="Sync.sqlKopieren()">Kopieren</button>`
    });
  }

  function sqlKopieren(){
    const f = document.getElementById('sySql');
    if (f){ f.select(); }
    U.copy(SETUP_SQL);
    UI.toast('Kopiert – jetzt im SQL Editor einfügen und Run', 'ok');
  }

  /* Erkennt den gefaehrlichen Schluessel. Der service_role bzw. sb_secret
     haengt den Zeilenschutz aus – wer ihn hat, kommt an alle Daten. Der
     darf niemals in eine Web-App, erst recht nicht in die Fassung im Netz. */
  function schluesselArt(key){
    const k = String(key || '').trim();
    if (!k) return 'leer';
    if (/^sb_secret_/.test(k)) return 'geheim';
    if (/^sb_publishable_/.test(k)) return 'oeffentlich';
    if (/^eyJ/.test(k)){
      const inhalt = jwtInhalt(k);
      if (inhalt?.role === 'service_role') return 'geheim';
      if (inhalt?.role === 'anon')         return 'oeffentlich';
      /* Nicht lesbar? Dann lieber misstrauisch sein als den geheimen
         Schlüssel durchzulassen. */
      return inhalt ? 'unbekannt' : 'unlesbar';
    }
    return 'unbekannt';
  }

  /* Base64 selbst dekodieren – atob gibt es nicht überall (Tests, ältere
     Umgebungen), und ausgerechnet hier darf die Prüfung nicht ausfallen. */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function jwtInhalt(token){
    try {
      const teil = String(token).split('.')[1];
      if (!teil) return null;
      const s = teil.replace(/-/g,'+').replace(/_/g,'/').replace(/=+$/,'');
      let bits = 0, wie = 0, aus = '';
      for (const z of s){
        const w = B64.indexOf(z);
        if (w < 0) return null;
        bits = (bits << 6) | w; wie += 6;
        if (wie >= 8){ wie -= 8; aus += String.fromCharCode((bits >> wie) & 0xFF); }
      }
      return JSON.parse(decodeURIComponent(escape(aus)));
    } catch(e){ return null; }
  }

  /* Bringt die Projektadresse in Form. Aus dem Dashboard kopiert man
     leicht die falsche Zeile – mit /rest/v1 hinten dran, oder gleich die
     Dashboard-Adresse. Beides ergibt eine kaputte Anfrage
     (/rest/v1/rest/v1/... -> "Invalid path specified in request URL").
     Darum hier: alles hinter dem Servernamen abschneiden. */
  function normalisiereUrl(eingabe){
    let s = String(eingabe || '').trim();
    if (!s) return { url:'', hinweis:'' };
    s = s.replace(/^https?:\/\//i, '');          // Protokoll runter
    s = s.replace(/\/+$/, '');                    // Schraegstriche hinten weg

    const schnitt = s.indexOf('/');
    const server  = (schnitt < 0 ? s : s.slice(0, schnitt)).toLowerCase();
    const pfad    = schnitt < 0 ? '' : s.slice(schnitt);

    /* Dashboard-Adresse? Daraus die richtige Projektadresse bauen. */
    if (/(^|\.)supabase\.com$/.test(server)){
      const ref = pfad.match(/\/project\/([a-z0-9]{15,})/i);
      if (ref) return {
        url: `https://${ref[1].toLowerCase()}.supabase.co`,
        hinweis: 'Das war die Dashboard-Adresse – ich habe daraus die Projektadresse gemacht.'
      };
    }

    return {
      url: 'https://' + server,
      hinweis: pfad
        ? `Ich habe „${pfad}" hinten abgeschnitten – dahin gehört nur der Servername.`
        : ''
    };
  }

  function saveCfg(){
    const roh = (document.getElementById('syCfgUrl')||{}).value?.trim() || '';
    const { url, hinweis } = normalisiereUrl(roh);
    const key = (document.getElementById('syCfgKey')||{}).value?.trim() || '';
    const art = schluesselArt(key);

    if (art === 'geheim' || art === 'unlesbar'){
      UI.modal({
        title: art === 'geheim' ? 'Das ist der falsche Schlüssel' : 'Schlüssel nicht lesbar',
        body: `<div style="line-height:1.75">
            ${art === 'geheim'
              ? 'Du hast den <b>service_role</b> bzw. <b>secret</b> Schlüssel erwischt. ' +
                'Der hebelt den Zeilenschutz aus – wer ihn in die Finger bekommt, kommt ' +
                'an alle deine Daten, egal wer angemeldet ist.'
              : 'Dieser Schlüssel lässt sich nicht lesen – ich kann nicht erkennen, ob er ' +
                'harmlos ist. Vielleicht ist beim Kopieren etwas abgeschnitten worden.'}
            <div class="card card-pad" style="background:var(--red-bg);border:none;margin-top:14px">
              <div style="line-height:1.7;font-size:13.5px">
                Ich habe ihn <b>nicht gespeichert</b>. Hol dir auf derselben Seite den
                Schlüssel mit der Bezeichnung <b>anon public</b> – bei neueren Projekten
                heißt er <b>publishable</b>. Der ist dafür gemacht, in einer App zu stehen.
              </div>
            </div>
            <div class="t-sub" style="margin-top:14px;line-height:1.7">
              Falls der geheime Schlüssel schon irgendwo unterwegs war: im Dashboard unter
              <b>Project Settings → API</b> kannst du ihn zurückziehen und neu ausstellen.
            </div>
          </div>`,
        foot: `<button class="btn btn-primary" onclick="UI.closeModal()">Verstanden</button>`
      });
      const feld = document.getElementById('syCfgKey');
      if (feld) feld.value = '';
      return;
    }

    Store.setSetting({ syncUrl: url, syncKey: key });
    const feld = document.getElementById('syCfgUrl');
    if (feld) feld.value = url;
    if (hinweis) UI.toast(hinweis, 'warn', 6000);
    else if (art === 'unbekannt' && key){
      UI.toast('Gespeichert – aber der Schlüssel sieht ungewöhnlich aus. Drück mal „Verbindung testen".', 'warn', 5200);
    } else {
      UI.toast('Zugangsdaten gespeichert','ok');
    }
    App.rerender();
  }

  async function testCfg(){
    saveCfg();
    const msg = document.getElementById('syCfgMsg');
    const setMsg = (t, farbe='var(--muted)') => { if (msg) msg.innerHTML = `<span style="color:${farbe}">${U.esc(t)}</span>`; };
    setMsg('Prüfe Verbindung …');
    const c = cfg();
    if (!c.url || !c.anon){ setMsg('Projekt-URL und Schlüssel eintragen.', 'var(--red)'); return; }
    try {
      const res = await fetch(`${c.url}/rest/v1/${TABLE}?select=updated_at&limit=1`, { headers:{ apikey: c.anon } });
      if (res.ok){
        setMsg('Passt – Tabelle gefunden und geschützt. Jetzt "Sync einschalten".', 'var(--green)');
      } else {
        const j = await res.json().catch(()=>({}));
        const m = j.message || res.status + ' ' + res.statusText;
        if (/schema cache|does not exist/i.test(m))
          setMsg('Verbindung steht, aber die Tabelle crm_state fehlt in diesem Projekt – SQL aus supabase-setup.sql ausführen.', 'var(--amber)');
        else if (res.status === 401)
          setMsg('Schlüssel wird nicht akzeptiert. Ist das wirklich der anon/public key?', 'var(--red)');
        else setMsg(m, 'var(--red)');
      }
    } catch(e){
      setMsg('Keine Verbindung: ' + e.message + ' – stimmt die Projekt-URL?', 'var(--red)');
    }
  }

  function loginDialog(){
    UI.modal({
      title:'Sync einschalten',
      body:`
        <div style="font-size:13.5px;line-height:1.7;color:var(--ink-soft);margin-bottom:16px">
          Denk dir hier ein Konto aus – E-Mail und Passwort frei wählbar.
          <b>Beim ersten Mal auf „Konto anlegen“</b>, danach und auf dem Handy
          auf „Anmelden“. Dieselben Daten auf beiden Geräten, dann sehen beide
          denselben Stand.</div>
        <div class="field"><label>E-Mail</label>
          <input type="email" id="syEmail" value="${U.esc(auth?.email || Store.settings().email || '')}" autocomplete="username"></div>
        <div class="field"><label>Passwort</label>
          <input type="password" id="syPass" autocomplete="current-password"></div>
        <div id="syMsg" class="t-sub"></div>`,
      foot:`<button class="btn left" onclick="Sync.doSignUp()">Konto anlegen</button>
            <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
            <button class="btn btn-primary" onclick="Sync.doLogin()">Anmelden</button>`
    });
  }

  async function doSignUp(){
    const email = document.getElementById('sySignEmail')?.value.trim()
               || document.getElementById('syEmail').value.trim();
    const pass  = document.getElementById('syPass').value;
    const msg   = document.getElementById('syMsg');
    if (!email || !pass){ msg.textContent = 'E-Mail und Passwort eintragen.'; return; }
    if (pass.length < 6){ msg.textContent = 'Das Passwort braucht mindestens 6 Zeichen.'; return; }
    msg.textContent = 'Lege Konto an …';
    try {
      const r = await signUp(email, pass);
      if (r.bestaetigen){
        msg.innerHTML = `<span style="color:var(--amber)">Konto angelegt.
          Supabase hat dir eine Mail an <b>${U.esc(email)}</b> geschickt – Link anklicken,
          dann hier auf <b>Anmelden</b>.</span>`;
        return;
      }
      Store.data().meta.dirty = true;
      Store.save(true);
      UI.closeModal();
      UI.toast('Konto angelegt und angemeldet','ok');
      await run(false);
      App.rerender();
    } catch(e){
      msg.innerHTML = `<span style="color:var(--red)">${U.esc(
        /already registered|already been registered/i.test(e.message)
          ? 'Das Konto gibt es schon – nimm „Anmelden“.'
          : /signup.*disabled/i.test(e.message)
          ? 'In deinem Supabase-Projekt sind Registrierungen ausgeschaltet. Dann den Benutzer im Dashboard anlegen (Schritt 2).'
          : e.message)}</span>`;
    }
  }

  async function doLogin(){
    const email = document.getElementById('syEmail').value.trim();
    const pass  = document.getElementById('syPass').value;
    const msg   = document.getElementById('syMsg');
    if (!email || !pass){ msg.textContent = 'E-Mail und Passwort eintragen.'; return; }
    msg.textContent = 'Melde an …';
    try {
      await login(email, pass);
      Store.data().meta.dirty = true;          // erster Abgleich lädt hoch bzw. erkennt Konflikt
      Store.save(true);
      UI.closeModal();
      UI.toast('Angemeldet – gleiche ab','ok');
      await run(false);
      App.rerender();
    } catch(e){
      msg.innerHTML = `<span style="color:var(--red)">${U.esc(
        /Invalid login/i.test(e.message) ? 'E-Mail oder Passwort stimmt nicht.' :
        /relation .* does not exist|schema cache/i.test(e.message) ? 'Die Tabelle crm_state fehlt noch – siehe ANLEITUNG.' :
        e.message)}</span>`;
    }
  }

  async function forcePush(){
    UI.confirm('Der Stand von diesem Gerät überschreibt den in der Cloud. Sicher?', async () => {
      try { await push(); UI.toast('Hochgeladen','ok'); status='bereit'; App.rerender(); }
      catch(e){ UI.toast('Fehler: '+e.message,'err'); }
    }, {yes:'Ja, hochladen'});
  }

  async function forcePull(){
    UI.confirm('Der Stand aus der Cloud ersetzt alles auf diesem Gerät. Vorher Backup gemacht?', async () => {
      try {
        const r = await pull();
        if (!r){ UI.toast('In der Cloud liegt noch nichts','err'); return; }
        Store.importBackup(r.payload, 'replace');
        Store.data().meta.lastSync = r.updated_at; Store.data().meta.dirty = false; Store.save(true);
        UI.toast('Heruntergeladen','ok'); status='bereit'; App.rerender();
      } catch(e){ UI.toast('Fehler: '+e.message,'err'); }
    }, {yes:'Ja, herunterladen'});
  }

  /* ---------- Start ---------- */
  function init(){
    /* Einmal beim Start aufräumen, falls eine krumme Adresse gespeichert ist */
    const s = Store.settings();
    if (s.syncUrl){
      const g = normalisiereUrl(s.syncUrl).url;
      if (g && g !== s.syncUrl) Store.setSetting({ syncUrl: g });
    }

    loadAuth();
    if (auth && !konfiguriert()) clearAuth();   // Zugangsdaten weg -> Anmeldung verwerfen
    paint();
    if (isOn()){
      run(true);
      // beim Zurückkommen auf den Tab nochmal schauen
      document.addEventListener('visibilitychange', () => { if (!document.hidden) run(true); });
      setInterval(() => { if (!document.hidden) run(true); }, 5*60*1000);
    }
  }

  return { init, isOn, login, signUp, doSignUp, logout, run, push, pull, onLocalChange, paint,
           schluesselArt, diagnose, normalisiereUrl,
           sqlZeigen, sqlKopieren,
           settingsCard, loginDialog, doLogin, forcePush, forcePull, device,
           saveCfg, testCfg, konfiguriert, get status(){ return status; } };
})();
