/* ==========================================================
   Kurani CRM – Datenspeicher
   Alles liegt lokal im Browser (localStorage). Kein Server,
   keine Cloud – Kundendaten bleiben auf deinem Rechner.
   Backup = JSON-Datei (Sidebar unten).
   ========================================================== */
const Store = (() => {

  const KEY  = 'kurani_crm_v1';
  const SNAP = 'kurani_crm_snapshots';

  /* ---------- Stammdaten Kurani Design ---------- */
  /* Persönliches (Firmenanschrift, IBAN, Steuernummer) steht in
     js/stammdaten.js – die Datei bleibt auf dem Rechner und wird nicht
     mit ins Netz geladen. Auf dem Handy kommen die Werte über den Sync. */
  const PERSOENLICH = (typeof FIRMENDATEN !== 'undefined') ? FIRMENDATEN : {};

  const DEFAULT_SETTINGS = {
    firma: '',
    inhaber: '',
    strasse: '',
    plz: '',
    ort: '',
    telefon: '',
    email: '',
    web: '',
    steuernummer: '',
    glaeubigerId:'',          // für SEPA-Lastschrift, von der Bundesbank
    iban: '',
    bic: '',
    bank: '',
    ustHinweis:  'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    kleinunternehmer: true,   // false = Regelbesteuerung mit ausgewiesener USt
    ustSatz:          19,     // Regelsatz
    ustSatzErmaessigt: 7,     // ermäßigter Satz
    ustId:            '',     // USt-IdNr., falls vorhanden
    preiseSindBrutto: false,  // eingegebene Preise sind Netto (Standard) oder Brutto

    zahlungszielTage: 7,      // Rechnungen
    kvGueltigTage:    30,     // KV / Angebote
    mahngebuehr:      5.00,   // ab Stufe 2
    stundensatz:      65,
    kapazitaetStd:    30,     // verfügbare Arbeitsstunden pro Woche
    umsatzzielJahr:   45000,
    ruecklageProzent: 25,     // Empfehlung Steuer-Rücklage
    grenzeVorjahr:    25000,  // §19 seit 2025
    grenzeLaufend:    100000,
    reaktivierungTage:180,    // ab wann ein Kunde als "schlafend" gilt

    kmPauschale:      0.30,   // € pro gefahrenem Kilometer (Betriebsausgabe)
    freieSchleifen:   2,      // Korrekturrunden, die im Preis enthalten sind
    anzahlungAbEuro:  500,    // ab dieser Auftragsgröße Anzahlung vorschlagen
    anzahlungProzent: 50,

    // Erscheinungsbild
    thema:   'hell',      // hell | dunkel | auto
    akzent:  'schwarz',
    groesse: 'normal',

    // Handy-Sync (Supabase). Die Projektadresse steht in js/stammdaten.js,
    // damit sie nicht in der Fassung landet, die im Netz liegt.
    // Der Schlüssel wird nie mitgeliefert – den trägt Ibo pro Gerät ein.
    syncUrl: '',
    syncKey: '',

    ...PERSOENLICH
  };

  /* ---------- Nummernkreise ---------- */
  const NUM_PREFIX = { rechnung:'', kv:'KV-', angebot:'ANG-', ab:'AB-', mahnung:'M-' };

  /* ---------- Stammkunden ----------
     Die Liste steht in js/stammkunden.js und fehlt absichtlich in der
     Fassung, die im Netz liegt. Ohne sie startet die App leer und holt
     sich die Kunden über den Sync. */
  const SEED_CUSTOMERS = (typeof STAMMKUNDEN !== 'undefined') ? STAMMKUNDEN : [];

  /* ---------- Auftragstypen ---------- */
  const PROJECT_TYPES = [
    'Logo / Branding','Speisekarte','Folie / Beschriftung','Großformat / Banner',
    'Schild / LED','Druckdaten','Video / Content','Website','Social Media','Sonstiges'
  ];

  /* ---------- Projekt-Pipeline ---------- */
  const PIPELINE = [
    { key:'anfrage',  label:'Anfrage',    color:'grey'  },
    { key:'kv',       label:'KV raus',    color:'blue'  },
    { key:'zugesagt', label:'Zugesagt',   color:'amber' },
    { key:'arbeit',   label:'In Arbeit',  color:'amber' },
    { key:'fertig',   label:'Fertig',     color:'green' },
    { key:'berechnet',label:'Berechnet',  color:'dark'  },
    { key:'bezahlt',  label:'Bezahlt',    color:'green' },
    { key:'verloren', label:'Verloren',   color:'red'   }
  ];

  /* ---------- Leistungskatalog (Richtwerte aus kurani-docs) ---------- */
  const CATALOG = [
    { t:'Logodesign inkl. Reinzeichnung',        p:550,  typ:'Logo / Branding' },
    { t:'Logo-Überarbeitung / Refresh',          p:250,  typ:'Logo / Branding' },
    { t:'Speisekarte Design (4-seitig)',         p:450,  typ:'Speisekarte' },
    { t:'Speisekarte Aktualisierung',            p:120,  typ:'Speisekarte' },
    { t:'Druckdatenerstellung',                  p:90,   typ:'Druckdaten' },
    { t:'Fensterfolie / Schaufensterbeschriftung',p:0,   typ:'Folie / Beschriftung' },
    { t:'Fahrzeugbeschriftung',                  p:0,    typ:'Folie / Beschriftung' },
    { t:'Banner / Plane inkl. Datenerstellung',  p:0,    typ:'Großformat / Banner' },
    { t:'LED-Schild Planung & Koordination',     p:350,  typ:'Schild / LED' },
    { t:'Instagram Content Set (10 Posts)',      p:120,  typ:'Social Media' },
    { t:'Content-Abo monatlich',                 p:249,  typ:'Video / Content' },
    { t:'Reel / Video-Produktion',               p:180,  typ:'Video / Content' },
    { t:'TV-Loop für Restaurant-Display',        p:150,  typ:'Video / Content' },
    { t:'Website / Landing Page',                p:0,    typ:'Website' },
    { t:'Kiek mol in – Einrichtung Restaurant',  p:0,    typ:'Website' },
    { t:'Visitenkarten Design',                  p:120,  typ:'Sonstiges' },
    { t:'Flyer A5 beidseitig',                   p:180,  typ:'Sonstiges' },
    { t:'Plakat A1',                             p:150,  typ:'Sonstiges' },
    { t:'Arbeitsstunde',                         p:65,   typ:'Sonstiges' }
  ];

  /* ---------- Ausgaben-Kategorien (EÜR-tauglich) ---------- */
  const EXPENSE_CATS = [
    'Material / Druck','Fremdleistung','Software / Abos','Fahrzeug / Fahrtkosten',
    'Büro / Porto','Werbung / Marketing','Telefon / Internet','Anschaffung (GWG)',
    'Fortbildung','Bewirtung','Versicherung / Beiträge','Sonstiges'
  ];

  /* ---------- Leerer Datensatz ---------- */
  const EMPTY = {
    version: 1,
    settings: {...DEFAULT_SETTINGS},
    customers: [],
    projects: [],
    documents: [],
    expenses: [],
    times: [],
    recurring: [],
    inbox: [],
    ideas: [],
    todos: [],
    campaigns: [],
    trips: [],
    appointments: [],
    orders: [],
    templates: [],
    mandate: [],        // SEPA-Lastschriftmandate
    sepalaeufe: [],     // eingereichte Einzugsdateien
    meta: { lastBackup:null, created: U.today(), lastAutorun:null, lastSync:null, dirty:false }
  };

  let db = null;

  /* ---------- Laden / Speichern ---------- */
  function load(){
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        db = JSON.parse(raw);
        // fehlende Felder nachziehen (Migration).
        // Aus EMPTY abgeleitet, damit neue Sammlungen automatisch dazukommen.
        db.settings = {...DEFAULT_SETTINGS, ...(db.settings||{})};
        for (const k of Object.keys(EMPTY))
          if (Array.isArray(EMPTY[k]) && !Array.isArray(db[k])) db[k] = [];
        db.meta = {...EMPTY.meta, ...(db.meta||{})};
      } else {
        db = JSON.parse(JSON.stringify(EMPTY));
        db.customers = SEED_CUSTOMERS;
        save();
      }
    } catch(e){
      console.error('Store.load', e);
      db = JSON.parse(JSON.stringify(EMPTY));
      db.customers = SEED_CUSTOMERS;
    }
    return db;
  }

  // fromSync = true -> Änderung kam vom Abgleich selbst, nicht neu markieren
  function save(fromSync = false){
    try {
      if (!fromSync && db.meta) db.meta.dirty = true;
      localStorage.setItem(KEY, JSON.stringify(db));
      if (!fromSync && typeof Sync !== 'undefined' && Sync.isOn()) Sync.onLocalChange();
      return true;
    } catch(e){
      console.error('Store.save', e);
      if (typeof UI !== 'undefined') UI.toast('Speichern fehlgeschlagen – Speicher voll? Bitte Backup machen.', 'err');
      return false;
    }
  }

  const data = () => db || load();
  const settings = () => data().settings;
  const all = coll => data()[coll] || [];
  const byId = (coll, id) => all(coll).find(x => x.id === id) || null;

  function add(coll, obj){
    obj.id = obj.id || U.uid(coll.slice(0,4));
    obj.createdAt = obj.createdAt || U.today();
    if (coll === 'documents' && obj.ustModus === undefined) stempelModus(obj);
    data()[coll].push(obj);
    save();
    return obj;
  }
  function update(coll, id, patch){
    const x = byId(coll, id);
    if (!x) return null;
    Object.assign(x, patch, { updatedAt: U.today() });
    save();
    return x;
  }
  function remove(coll, id){
    const arr = data()[coll];
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0){ arr.splice(i,1); save(); return true; }
    return false;
  }
  function setSetting(patch){ Object.assign(data().settings, patch); save(); }

  /* ---------- Nummernkreise ----------
     Rechnung: 2026001 · KV-2026-001 · ANG-2026-001 · AB-2026-001 · M-2026-001 */
  function nextNumber(typ, jahr){
    const y = String(jahr || new Date().getFullYear());
    const pre = NUM_PREFIX[typ] ?? '';
    let max = 0;
    all('documents').filter(d => d.typ === typ).forEach(d => {
      const s = String(d.nummer || '').trim();
      let n = 0;
      if (typ === 'rechnung'){
        // Format 2026001 – Jahr + dreistellige laufende Nummer
        if (s.startsWith(y) && s.length === y.length + 3) n = parseInt(s.slice(y.length), 10);
      } else {
        // Format KV-2026-001
        const parts = s.split('-');
        if (parts.length >= 3 && parts[parts.length-2] === y) n = parseInt(parts[parts.length-1], 10);
      }
      if (!isNaN(n)) max = Math.max(max, n);
    });
    const next = String(max + 1).padStart(3,'0');
    return typ === 'rechnung' ? `${y}${next}` : `${pre}${y}-${next}`;
  }

  /* ---------- Kundennummer ---------- */
  function nextCustomerNr(){
    const max = all('customers').reduce((m,c) => Math.max(m, parseInt(c.nr,10)||0), 1000);
    return String(max + 1);
  }

  /* ---------- Backup ---------- */

  /* Alles, was das Gerät nicht verlassen darf: Zugangsschlüssel.
     Gilt für Backup-Dateien genauso wie für den Handy-Sync. */
  const GEHEIM = ['kiKey', 'syncKey'];

  function dataOhneGeheim(){
    const kopie = JSON.parse(JSON.stringify(data()));
    GEHEIM.forEach(k => delete kopie.settings[k]);
    return kopie;
  }

  function exportBackup(){
    const d = data();
    d.meta.lastBackup = U.today();
    save();
    const name = `Kurani-CRM-Backup_${U.today()}.json`;
    U.download(name, JSON.stringify(dataOhneGeheim(), null, 2));
    if (typeof UI !== 'undefined'){ UI.toast('Backup gespeichert: ' + name, 'ok'); UI.refreshBackupHint(); }
  }

  function importBackup(json, mode='replace'){
    let incoming;
    try { incoming = typeof json === 'string' ? JSON.parse(json) : json; }
    catch(e){ throw new Error('Datei ist kein gültiges Backup (JSON konnte nicht gelesen werden).'); }
    if (!incoming || !Array.isArray(incoming.customers))
      throw new Error('Das sieht nicht nach einem Kurani-CRM-Backup aus.');

    if (mode === 'replace'){
      /* Die Schlüssel dieses Geräts überleben jeden Import –
         sie stehen nicht im Backup und dürfen nicht verloren gehen. */
      const behalten = {};
      GEHEIM.forEach(k => { if (db?.settings?.[k]) behalten[k] = db.settings[k]; });
      db = incoming;
      db.settings = {...DEFAULT_SETTINGS, ...(db.settings||{}), ...behalten};
    } else { // merge: nur neue IDs übernehmen
      for (const k of Object.keys(EMPTY).filter(k => Array.isArray(EMPTY[k]))){
        const have = new Set(all(k).map(x=>x.id));
        (incoming[k]||[]).forEach(x => { if (!have.has(x.id)) data()[k].push(x); });
      }
    }
    save();
    return true;
  }

  /* ---------- Auto-Snapshot (Sicherheitsnetz im Browser) ---------- */
  function snapshot(){
    try {
      const snaps = JSON.parse(localStorage.getItem(SNAP) || '[]');
      const last = snaps[snaps.length-1];
      if (last && last.date === U.today()) return;      // max 1x pro Tag
      snaps.push({ date: U.today(), payload: JSON.stringify(db) });
      while (snaps.length > 5) snaps.shift();           // nur die letzten 5
      localStorage.setItem(SNAP, JSON.stringify(snaps));
    } catch(e){ /* Speicher voll – egal, Snapshot ist Bonus */ }
  }
  const snapshots = () => { try { return JSON.parse(localStorage.getItem(SNAP)||'[]'); } catch(e){ return []; } };
  function restoreSnapshot(date){
    const s = snapshots().find(x => x.date === date);
    if (!s) return false;
    importBackup(s.payload, 'replace');
    return true;
  }

  /* ---------- Komplett zurücksetzen ---------- */
  function factoryReset(keepCustomers=true){
    const custs = keepCustomers ? all('customers') : SEED_CUSTOMERS;
    db = JSON.parse(JSON.stringify(EMPTY));
    db.customers = custs;
    save();
  }

  /* ---------- Abgeleitete Kennzahlen ---------- */
  // --- Beträge -------------------------------------------------------------
  // Kleinunternehmer (§19): Netto = Brutto, keine USt.
  // Regelbesteuerung: je Position ein Steuersatz, Summen getrennt ausgewiesen.
  const posBetrag = p => (U.parseNum(p.menge)||1) * U.parseNum(p.einzelpreis);

  // WICHTIG: Jedes Dokument trägt den Steuermodus, der beim Schreiben galt.
  // Sonst würde eine Umstellung alte Rechnungen rückwirkend verändern.
  function docModus(doc){
    const s = settings();
    return {
      klein:  doc && doc.ustModus   !== undefined ? doc.ustModus === 'kleinunternehmer' : s.kleinunternehmer,
      brutto: doc && doc.preiseBrutto !== undefined ? !!doc.preiseBrutto : s.preiseSindBrutto,
      satz:   doc && doc.ustStandard !== undefined ? U.parseNum(doc.ustStandard) : U.parseNum(s.ustSatz)
    };
  }
  // Steuermodus im Dokument festschreiben (beim Anlegen)
  function stempelModus(doc){
    const s = settings();
    doc.ustModus    = s.kleinunternehmer ? 'kleinunternehmer' : 'regel';
    doc.preiseBrutto = !!s.preiseSindBrutto;
    doc.ustStandard  = U.parseNum(s.ustSatz);
    return doc;
  }

  const posSatz = (p, doc) => {
    const m = docModus(doc);
    if (m.klein) return 0;
    return p.ust === undefined || p.ust === '' ? m.satz : U.parseNum(p.ust);
  };

  // Netto-Summe (bei Brutto-Eingabe wird herausgerechnet)
  function docNetto(doc){
    const m = docModus(doc);
    const brutto = m.brutto && !m.klein;
    let n = U.sum(doc.positionen||[], p => brutto ? posBetrag(p) / (1 + posSatz(p,doc)/100) : posBetrag(p));
    if (doc.mahngebuehr) n += U.parseNum(doc.mahngebuehr);   // Mahngebühr ist kein Entgelt, ohne USt
    return Math.round(n*100)/100;
  }

  // Umsatzsteuer je Satz: { "19": 123.45, "7": 6.30 }
  function docUstGruppen(doc){
    const m = docModus(doc);
    if (m.klein) return {};
    const g = {};
    (doc.positionen||[]).forEach(p => {
      const satz = posSatz(p, doc);
      if (!satz) return;
      const netto = m.brutto ? posBetrag(p) / (1 + satz/100) : posBetrag(p);
      g[satz] = Math.round(((g[satz]||0) + netto * satz/100) * 100)/100;
    });
    return g;
  }
  const docUst = doc => Math.round(U.sum(Object.values(docUstGruppen(doc))) * 100)/100;

  // Das, was der Kunde überweist
  const docTotal = doc => Math.round((docNetto(doc) + docUst(doc)) * 100)/100;
  const docPaid  = doc => U.sum(doc.zahlungen||[], z => U.parseNum(z.betrag));
  const docOpen  = doc => Math.max(0, docTotal(doc) - docPaid(doc));

  const isInvoice = d => d.typ === 'rechnung';
  const isOpenInvoice = d => isInvoice(d) && d.status !== 'bezahlt' && d.status !== 'storniert' && d.status !== 'entwurf';
  const isOverdue = d => isOpenInvoice(d) && U.daysAgo(d.faellig || d.datum) > 0;

  function customerRevenue(customerId, year){
    return U.sum(all('documents').filter(d =>
      d.customerId === customerId && isInvoice(d) && d.status === 'bezahlt' &&
      (!year || U.yearOf(d.bezahltAm || d.datum) === year)
    ), docTotal);
  }
  function customerOpen(customerId){
    return U.sum(all('documents').filter(d => d.customerId === customerId && isOpenInvoice(d)), docOpen);
  }
  function lastActivity(customerId){
    const dates = [
      ...all('documents').filter(d=>d.customerId===customerId).map(d=>d.datum),
      ...all('projects').filter(p=>p.customerId===customerId).map(p=>p.updatedAt||p.createdAt),
      ...all('inbox').filter(i=>i.customerId===customerId).map(i=>i.datum)
    ].filter(Boolean).sort();
    return dates.length ? dates[dates.length-1] : null;
  }

  const custName = id => (byId('customers', id)||{}).firma || 'Ohne Kunde';
  const projName = id => (byId('projects', id)||{}).titel || '';

  return {
    load, save, data, settings, all, byId, add, update, remove, setSetting,
    nextNumber, nextCustomerNr, exportBackup, importBackup, dataOhneGeheim, snapshot, snapshots,
    restoreSnapshot, factoryReset,
    docTotal, docNetto, docUst, docUstGruppen, posBetrag, posSatz, docModus, stempelModus,
    docPaid, docOpen, isInvoice, isOpenInvoice, isOverdue,
    customerRevenue, customerOpen, lastActivity, custName, projName,
    PROJECT_TYPES, PIPELINE, CATALOG, EXPENSE_CATS, DEFAULT_SETTINGS
  };
})();
