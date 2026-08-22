/* ============================================================
   Kurani CRM – Bildschirmsperre
   Eine PIN vor den Daten. Gedacht für den Fall, dass das Handy
   auf dem Tresen liegen bleibt oder wegkommt.

   Ehrlich dazu: Das hält jemanden ab, der das Gerät in die Hand
   nimmt. Es ist keine Verschlüsselung – wer den Browser-Speicher
   ausliest, kommt an die Daten. Der echte Schutz für unterwegs
   ist die Gerätesperre vom Handy selbst.
   ============================================================ */
const Sperre = (() => {

  const SESSION = 'kurani_offen';
  const RUHE_MINUTEN = 30;
  let letzteAktion = Date.now();
  let wacht = null;

  const eingerichtet = () => !!(Store.settings().pinHash);

  /* ---------- PIN verrechnen ---------- */

  async function hash(pin){
    const text = 'kurani:' + String(pin);
    if (window.crypto?.subtle && window.isSecureContext){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
    }
    /* Ohne sichere Umgebung (z.B. Datei direkt geöffnet): einfacher Abgleich.
       Reicht hier, weil die Sperre lokal gilt und nicht über das Netz geprüft wird. */
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < text.length; i++){
      h1 = (h1 ^ text.charCodeAt(i)) >>> 0; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 + text.charCodeAt(i) * (i+7)) >>> 0;
    }
    return 'einfach:' + h1.toString(16) + h2.toString(16);
  }

  /* ---------- Zustand ---------- */

  const offen = () => sessionStorage.getItem(SESSION) === 'ja';

  function merken(){
    sessionStorage.setItem(SESSION, 'ja');
    letzteAktion = Date.now();
    starteWache();
  }

  function zu(){
    sessionStorage.removeItem(SESSION);
    stoppeWache();
    zeichnen();
  }

  /* Nach längerer Ruhe von selbst zusperren */
  function starteWache(){
    stoppeWache();
    ['click','keydown','touchstart','scroll'].forEach(e =>
      document.addEventListener(e, tick, { passive:true }));
    wacht = setInterval(() => {
      if (Date.now() - letzteAktion > RUHE_MINUTEN * 60000){
        zu();
        UI.toast(`Nach ${RUHE_MINUTEN} Minuten ohne Bedienung wieder gesperrt`, 'ok');
      }
    }, 30000);
  }
  function stoppeWache(){
    if (wacht) clearInterval(wacht);
    wacht = null;
    ['click','keydown','touchstart','scroll'].forEach(e => document.removeEventListener(e, tick));
  }
  const tick = () => { letzteAktion = Date.now(); };

  /* ---------- Sperrbildschirm ---------- */

  function zeichnen(){
    let box = document.getElementById('sperrschirm');
    if (eingerichtet() && !offen()){
      if (!box){
        box = document.createElement('div');
        box.id = 'sperrschirm';
        box.className = 'sperre';
        box.innerHTML = `
          <div class="sperre-box">
            <div class="sperre-logo">KD</div>
            <div class="sperre-titel">Kurani CRM</div>
            <div class="sperre-text" id="sperrText">PIN eingeben</div>
            <input type="password" id="sperrPin" inputmode="numeric" autocomplete="off"
                   maxlength="12" placeholder="••••">
            <button class="btn btn-primary" id="sperrKnopf">Öffnen</button>
          </div>`;
        document.body.appendChild(box);
        const feld = box.querySelector('#sperrPin');
        box.querySelector('#sperrKnopf').onclick = pruefen;
        feld.onkeydown = e => { if (e.key === 'Enter') pruefen(); };
        setTimeout(() => feld.focus(), 60);
      }
      document.body.classList.add('gesperrt');
    } else {
      if (box) box.remove();
      document.body.classList.remove('gesperrt');
    }
  }

  let fehlversuche = 0;

  async function pruefen(){
    const feld = document.getElementById('sperrPin');
    const text = document.getElementById('sperrText');
    const pin = (feld?.value || '').trim();
    if (!pin) return;

    if (await hash(pin) === Store.settings().pinHash){
      fehlversuche = 0;
      merken();
      zeichnen();
      if (typeof App !== 'undefined') App.rerender();
      return;
    }

    fehlversuche++;
    feld.value = '';
    /* Nach mehreren Fehlversuchen kurz bremsen */
    if (fehlversuche >= 3){
      const warten = Math.min(fehlversuche - 2, 10) * 3;
      text.textContent = `Falsch. Noch ${warten} Sekunden warten.`;
      text.style.color = 'var(--red)';
      feld.disabled = true;
      let rest = warten;
      const zaehler = setInterval(() => {
        rest--;
        if (rest <= 0){
          clearInterval(zaehler);
          feld.disabled = false; feld.focus();
          text.textContent = 'PIN eingeben'; text.style.color = '';
        } else text.textContent = `Falsch. Noch ${rest} Sekunden warten.`;
      }, 1000);
    } else {
      text.textContent = 'Falsche PIN';
      text.style.color = 'var(--red)';
      feld.focus();
      setTimeout(() => { text.textContent = 'PIN eingeben'; text.style.color = ''; }, 2000);
    }
  }

  /* ---------- Einrichten ---------- */

  function einrichten(){
    const an = eingerichtet();
    UI.modal({
      title: an ? 'PIN ändern' : 'PIN einrichten',
      body: `
        <p style="line-height:1.75;margin-bottom:16px">
          ${an ? 'Zum Ändern erst die alte PIN eingeben.' :
          `Damit ist das CRM nach jedem Öffnen erst nach PIN-Eingabe zu sehen –
           sinnvoll, sobald es auch auf dem Handy läuft.`}
        </p>
        ${an ? `<div class="field"><label>Alte PIN</label>
          <input type="password" id="pinAlt" inputmode="numeric" autocomplete="off"></div>` : ''}
        <div class="row row-2">
          <div class="field"><label>${an?'Neue ':''}PIN <span class="t-sub">(mindestens 4 Zeichen)</span></label>
            <input type="password" id="pinNeu" inputmode="numeric" autocomplete="off" maxlength="12"></div>
          <div class="field"><label>Nochmal</label>
            <input type="password" id="pinNeu2" inputmode="numeric" autocomplete="off" maxlength="12"></div>
        </div>
        <div class="card card-pad" style="background:var(--card-weich);border:none">
          <div class="t-sub" style="line-height:1.7">
            Die PIN gilt auf allen Geräten, die sich abgleichen. Nach ${RUHE_MINUTEN} Minuten
            ohne Bedienung sperrt sich das CRM von selbst.<br><br>
            <b>Vergiss sie nicht.</b> Es gibt kein Zurücksetzen von außen – nur über
            ein Backup oder indem du den Browser-Speicher löschst.
          </div>
        </div>`,
      foot: `${an ? `<button class="btn btn-danger left" onclick="Sperre.abschalten()">Sperre aus</button>` : ''}
        <button class="btn" onclick="UI.closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="Sperre.speichern()">${an?'Ändern':'Einschalten'}</button>`
    });
  }

  async function speichern(){
    const v = k => (document.getElementById(k)||{}).value || '';
    if (eingerichtet()){
      if (await hash(v('pinAlt')) !== Store.settings().pinHash)
        return UI.toast('Die alte PIN stimmt nicht','err');
    }
    const neu = v('pinNeu').trim();
    if (neu.length < 4)          return UI.toast('Mindestens 4 Zeichen','err');
    if (neu !== v('pinNeu2').trim()) return UI.toast('Die beiden Eingaben sind nicht gleich','err');

    Store.setSetting({ pinHash: await hash(neu) });
    merken();
    UI.closeModal();
    UI.toast('PIN gesetzt – ab jetzt fragt das CRM beim Öffnen danach','ok', 6000);
    App.rerender();
  }

  function abschalten(){
    UI.confirm('Sperre abschalten? Dann ist das CRM ohne PIN zu sehen.', () => {
      Store.setSetting({ pinHash: '' });
      zeichnen();
      UI.toast('Sperre ist aus');
      App.rerender();
    });
  }

  /* Von Hand zusperren – z.B. bevor man das Handy weglegt */
  function jetztSperren(){
    if (!eingerichtet()) return UI.toast('Erst eine PIN einrichten','warn');
    zu();
  }

  /* ---------- Karte für die Einstellungen ---------- */

  function settingsCard(){
    const an = eingerichtet();
    return `
    <div class="card">
      <div class="card-head"><h3>Bildschirmsperre</h3>
        <div class="actions">${an
          ? '<span class="badge green">an</span>'
          : '<span class="badge grey">aus</span>'}</div></div>
      <div class="card-pad">
        <div class="t-sub" style="line-height:1.7;margin-bottom:14px">
          ${an
            ? `Beim Öffnen wird nach der PIN gefragt, nach ${RUHE_MINUTEN} Minuten Ruhe sperrt sie sich wieder.`
            : `Ohne PIN sieht jeder, der das Gerät in die Hand nimmt, deine Zahlen.
               Spätestens wenn das CRM auf dem Handy läuft, solltest du das einschalten.`}
        </div>
        <button class="btn ${an?'':'btn-primary'}" onclick="Sperre.einrichten()">
          ${an ? 'PIN ändern' : 'PIN einrichten'}</button>
        ${an ? `<button class="btn" onclick="Sperre.jetztSperren()">Jetzt sperren</button>` : ''}
      </div>
    </div>`;
  }

  /* ---------- Start ---------- */

  function init(){
    if (eingerichtet() && !offen()) zeichnen();
    else if (eingerichtet()) starteWache();
  }

  return { init, zeichnen, einrichten, speichern, abschalten, jetztSperren,
           settingsCard, eingerichtet, offen, hash };
})();
