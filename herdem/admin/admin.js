/* =====================================================================
   Herdem Admin
   localStorage-backed CMS. Schreibt herdem.cms.* keys, die der
   Hauptapp gelesen werden. JSON-Export/Import für Portabilität.
   ===================================================================== */
"use strict";

/* ---------- Constants ---------- */
const PASSWORD = "herdem2026";
const KEYS = {
  auth: "herdem.cms.auth",
  products: "herdem.cms.products",
  bundles: "herdem.cms.bundles",
  copy: "herdem.cms.copy",
  settings: "herdem.cms.settings",
  orders: "herdem.cms.orders",
};

const CATEGORIES = [
  ["fleisch", "Fleisch & Helal"],
  ["obst", "Obst & Gemüse"],
  ["milch", "Milchprodukte"],
  ["gewuerze", "Gewürze & Öl"],
  ["snacks", "Snacks & Süßes"],
  ["getraenke", "Getränke"],
];

/* ---------- Seeds (mirror defaults in main app) ---------- */
const SEED_PRODUCTS = [
  { id:"sucuk", category:"fleisch", price:7.99, oldPrice:9.49, unit:"500 g, 15,98 € / kg", popularity:98, tags:["Helal","Angebot"], origin:"Helal Metzgerei", active:true,
    name:{de:"Egetürk Rinder Sucuk · Parmak 500g", tr:"Egetürk Dana Sucuk · Parmak 500g"},
    note:{de:"Kräftig gewürzt, perfekt für Pfanne und Grill.", tr:"Yoğun baharatlı, tava ve mangal için ideal."}, image:"" },
  { id:"huhn", category:"fleisch", price:11.49, unit:"1 kg", popularity:92, tags:["Helal","Frisch"], origin:"Frischetheke", active:true,
    name:{de:"Helal Hähnchenbrust · Tavuk Göğsü 1 kg", tr:"Helal Tavuk Göğsü · 1 kg"},
    note:{de:"Mager geschnitten, ideal für Spieße und Pfanne.", tr:"Yağsız kesim, şiş ve tava için uygun."}, image:"" },
  { id:"gemuese", category:"obst", price:8.95, unit:"Saisonkorb", popularity:88, tags:["Frisch","Vegan"], origin:"Tagesmarkt", active:true,
    name:{de:"Gemüsekorb Saison · Sebze Sepeti", tr:"Mevsim Sebze Sepeti"},
    note:{de:"Knackig gepackt für Salat, Suppe und Mezze.", tr:"Salata, çorba ve meze için taze."}, image:"" },
  { id:"fladenbrot", category:"obst", price:1.59, unit:"1 Stück, ca. 320 g", popularity:84, tags:["Frisch","Vegan"], origin:"Bäckerei", active:true,
    name:{de:"Frisches Fladenbrot · Pide", tr:"Taze Pide"},
    note:{de:"Weich, luftig — am besten noch warm.", tr:"Yumuşak, kabarık — sıcakken servis edin."}, image:"" },
  { id:"granatapfel", category:"obst", price:1.99, unit:"1 Stück", popularity:74, tags:["Frisch","Vegan"], origin:"Tagesmarkt", active:true,
    name:{de:"Granatapfel · Nar", tr:"Nar"},
    note:{de:"Süß-säuerlich für Salate, Desserts und Saft.", tr:"Salata, tatlı ve sular için."}, image:"" },
  { id:"tomatenmark", category:"gewuerze", price:1.79, oldPrice:2.29, unit:"830 g, 2,16 € / kg", popularity:94, tags:["Vegan","Angebot"], origin:"Vorratskammer", active:true,
    name:{de:"Tomatenmark · Salça 830 g", tr:"Domates Salçası · 830 g"},
    note:{de:"Basis für Menemen, Eintopf und Saucen.", tr:"Menemen, yahni ve soslar için."}, image:"" },
  { id:"bulgur", category:"gewuerze", price:1.49, oldPrice:1.99, unit:"1 kg", popularity:86, tags:["Vegan","Angebot"], origin:"Anatolische Küche", active:true,
    name:{de:"Köftelik Bulgur · Feine Körnung 1 kg", tr:"Köftelik Bulgur · İnce 1 kg"},
    note:{de:"Feine Körnung für Köfte, Kısır und Salate.", tr:"Köfte, kısır ve salatalar için ince."}, image:"" },
  { id:"oliven", category:"gewuerze", price:4.99, unit:"900 g, 5,54 € / kg", popularity:81, tags:["Vegan","Helal"], origin:"Gemlik", active:true,
    name:{de:"Schwarze Oliven · Gemlik 900 g", tr:"Siyah Zeytin · Gemlik 900 g"},
    note:{de:"Dunkel, mild und glänzend — Klassiker der Meze-Platte.", tr:"Koyu, yumuşak ve parlak — meze klasiği."}, image:"" },
  { id:"linsen", category:"gewuerze", price:2.69, unit:"1 kg", popularity:67, tags:["Vegan"], origin:"Vorrat", active:true,
    name:{de:"Rote Linsen · Kırmızı Mercimek 1 kg", tr:"Kırmızı Mercimek · 1 kg"},
    note:{de:"Für Mercimek Çorbası, Eintöpfe und Bowls.", tr:"Mercimek çorbası ve yahnilik."}, image:"" },
  { id:"olivenoel", category:"gewuerze", price:8.99, unit:"1 l", popularity:84, tags:["Vegan","Beliebt"], origin:"Ägäis", active:true,
    name:{de:"Natives Olivenöl extra · Zeytinyağı 1 l", tr:"Sızma Zeytinyağı · 1 l"},
    note:{de:"Fruchtig für Salate, Dips und warme Gerichte.", tr:"Salata, sos ve sıcak yemekler için."}, image:"" },
  { id:"feta", category:"milch", price:5.79, unit:"800 g, 7,24 € / kg", popularity:83, tags:["Kühlung","Helal"], origin:"Kühlregal", active:true,
    name:{de:"Weichkäse in Salzlake · Beyaz Peynir 800 g", tr:"Beyaz Peynir · 800 g"},
    note:{de:"Cremig, salzig — stark zum Frühstück.", tr:"Kremamsı, hafif tuzlu — kahvaltıya ideal."}, image:"" },
  { id:"joghurt", category:"milch", price:3.49, unit:"900 g, 3,88 € / kg", popularity:79, tags:["Kühlung","Helal"], origin:"Kühlregal", active:true,
    name:{de:"Süzme Joghurt cremig 900 g", tr:"Süzme Yoğurt · 900 g"},
    note:{de:"Dick, mild und perfekt für Cacık.", tr:"Yoğun ve hafif — cacık için ideal."}, image:"" },
  { id:"ayran", category:"getraenke", price:0.79, unit:"250 ml, 3,16 € / l", popularity:78, tags:["Kühlung","Helal"], origin:"Kühlregal", active:true,
    name:{de:"Ayran Joghurtgetränk 250 ml", tr:"Ayran · 250 ml"},
    note:{de:"Eiskalt zum Lahmacun, Grillteller oder Börek.", tr:"Lahmacun ve mangal ile soğuk servis."}, image:"" },
  { id:"tee", category:"getraenke", price:6.99, oldPrice:7.99, unit:"1 kg", popularity:73, tags:["Vegan","Angebot"], origin:"Çay-Regal", active:true,
    name:{de:"Schwarzer Tee · Türk Çayı 1 kg", tr:"Siyah Türk Çayı · 1 kg"},
    note:{de:"Starker Aufguss für den Samowar.", tr:"Demli, semaver için güçlü demleme."}, image:"" },
  { id:"baklava", category:"snacks", price:8.49, unit:"500 g, 16,98 € / kg", popularity:76, tags:["Beliebt","Helal"], origin:"Süßwaren", active:true,
    name:{de:"Baklava Pistazie · Fıstıklı 500 g", tr:"Fıstıklı Baklava · 500 g"},
    note:{de:"Knusprig, süß und nussig zum Tee.", tr:"Çıtır, tatlı ve cevizli — çay ile."}, image:"" },
  { id:"lahmacun", category:"snacks", price:4.49, oldPrice:5.29, unit:"4 Stück", popularity:82, tags:["Helal","Angebot"], origin:"Tiefkühlung", active:true,
    name:{de:"Lahmacun · Türkische Pizza 4 Stück", tr:"Lahmacun · 4 Adet"},
    note:{de:"Schnell im Ofen, stark mit Zitrone und Petersilie.", tr:"Hızlı fırın — limon ve maydanozla."}, image:"" },
];

const SEED_BUNDLES = {
  grillTable:  { key:"grillTable", color:"green", eyebrow:"Grill", titleDe:"Grillabend", titleTr:"Mangal akşamı",
                 descDe:"Sucuk, Hähnchen, Salatgemüse, Ayran & Joghurt.", descTr:"Sucuk, tavuk, sebze, ayran & yoğurt.",
                 productIds:["sucuk","huhn","gemuese","ayran","joghurt"] },
  mezzeTable:  { key:"mezzeTable", color:"red", eyebrow:"Mezze", titleDe:"Mezze-Tisch", titleTr:"Meze sofrası",
                 descDe:"Fladenbrot, Oliven, Feta, Gemüse, Olivenöl.", descTr:"Pide, zeytin, beyaz peynir, sebze, zeytinyağı.",
                 productIds:["fladenbrot","oliven","feta","gemuese","olivenoel"] },
  sweetTable:  { key:"sweetTable", color:"amber", eyebrow:"Teezeit", titleDe:"Teezeit", titleTr:"Çay saati",
                 descDe:"Baklava, Çay, Joghurt, Granatapfel.", descTr:"Baklava, çay, yoğurt, nar.",
                 productIds:["baklava","tee","joghurt","granatapfel"] },
  breakfast:   { key:"breakfast", color:"blue", eyebrow:"Kahvaltı", titleDe:"Frühstück", titleTr:"Kahvaltı",
                 descDe:"Fladenbrot, Feta, Oliven und Çay.", descTr:"Pide, beyaz peynir, zeytin ve çay.",
                 productIds:["fladenbrot","feta","oliven","tee"] },
};

const SEED_COPY = {
  heroEyebrowDe: "Heute frisch gepackt",
  heroEyebrowTr: "Bugün taze paketlendi",
  heroTitleDe: "Türkisch-mediterrane Frische, geliefert in 38 Minuten.",
  heroTitleTr: "Türk-Akdeniz tazeliği, 38 dakikada kapına.",
  heroLeadDe: "Helal-Fleisch von der Theke, knackiges Gemüse vom Tagesmarkt, Baklava aus der Süßwarenecke — eine App, ein sauberer Flow.",
  heroLeadTr: "Helal et, tezgâhtan; taze sebze, günlük pazardan; baklava, tatlı köşesinden — tek bir akış.",
  p1TitleDe: "Frischetheke", p1TitleTr: "Taze Tezgâh",
  p1TextDe: "Fleisch, Brot und Gemüse täglich vorbereitet", p1TextTr: "Et, ekmek ve sebze her gün hazırlanır",
  p2TitleDe: "Helal Sortiment", p2TitleTr: "Helal Ürün Yelpazesi",
  p2TextDe: "Klare Kennzeichnung, ausgewählte Marken", p2TextTr: "Açık etiketleme, seçilmiş markalar",
  p3TitleDe: "Drei Wege, ein Flow", p3TitleTr: "Üç yol, tek akış",
  p3TextDe: "Lieferung, Abholung oder Versand in einem Klick", p3TextTr: "Teslimat, mağazadan al veya kargo — tek tıkla",
  footerTaglineDe: "Türkisch-mediterrane Frische, geliefert in 38 Minuten.",
  footerTaglineTr: "Türk-Akdeniz tazeliği, 38 dakikada teslim.",
};

const SEED_SETTINGS = {
  storeName: "Herdem",
  storeTaglineDe: "Türkisch-mediterrane Frische",
  storeTaglineTr: "Türk-Akdeniz tazeliği",
  addrStreet: "Beispielstraße 1",
  addrZip: "60311",
  addrCity: "Frankfurt am Main",
  phone: "+49 69 0000 0000",
  email: "hallo@herdem.example.com",
  hours: "Mo–Sa 08:00–22:00",
  minOrder: 15,
  feeDelivery: 3.9,
  freeDelivery: 39,
  feeShipping: 4.9,
  freeShipping: 49,
  whatsappNumber: "",
  paypalHandle: "",
  accountHolder: "",
  iban: "",
  bic: "",
  zipList: ["60311","60313","60314","60316","60318","60320","60322","60325","60327","60329","60385","60486","60594","60596","63065","63067","63069","63071","63073","63075"],
  storeOpen: true,
  promos: [
    { code: "HERDEM10", type: "percent", value: 10, min: 0, max: 10 },
    { code: "FRISCH5",  type: "fixed",   value: 5,  min: 25, max: 5 },
  ],
};

const SEED_ORDERS = [
  { code:"HDM-4218", at: Date.now()-3*3600*1000, status:"packing", entries:[
    {id:"sucuk", qty:2, price:7.99, name:{de:"Sucuk 500g", tr:"Sucuk 500g"}},
    {id:"ayran", qty:6, price:0.79, name:{de:"Ayran 250ml", tr:"Ayran 250ml"}},
  ], subtotal: 20.72, fee:3.9, tip:1, discount:0, total:25.62, slot:"Heute 18:00–20:00", address:"Kaiserstraße 12, 60311 Frankfurt", note:"Klingel Yılmaz" },
  { code:"HDM-5521", at: Date.now()-90*60*1000, status:"onway", entries:[
    {id:"baklava", qty:1, price:8.49, name:{de:"Baklava 500g", tr:"Baklava 500g"}},
    {id:"tee",     qty:1, price:6.99, name:{de:"Türk Çayı 1kg", tr:"Türk Çayı 1kg"}},
  ], subtotal:15.48, fee:3.9, tip:0, discount:0, total:19.38, slot:"Heute 19:00–21:00", address:"Berliner Str. 80, 63065 Offenbach", note:"" },
  { code:"HDM-6180", at: Date.now()-15*60*1000, status:"new", entries:[
    {id:"gemuese", qty:1, price:8.95, name:{de:"Gemüsekorb", tr:"Sebze Sepeti"}},
    {id:"feta",    qty:1, price:5.79, name:{de:"Beyaz Peynir 800g", tr:"Beyaz Peynir 800g"}},
    {id:"oliven",  qty:1, price:4.99, name:{de:"Gemlik Oliven", tr:"Gemlik Zeytin"}},
  ], subtotal:19.73, fee:0, tip:0, discount:0, total:19.73, slot:"Heute 20:00–22:00", address:"Eschersheimer Landstr. 14, 60322 Frankfurt", note:"3. Stock" },
];

const STATUS_LABELS = {
  new: "Neu", packing: "Wird gepackt", onway: "Unterwegs",
  delivered: "Geliefert", cancelled: "Storniert"
};

/* ---------- Storage helpers ---------- */
const lsGet = (key, fallback) => {
  try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
};
const lsSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { showToast("Speichern fehlgeschlagen (Speicher voll?)", true); return false; }
};

/* ---------- State ---------- */
const state = {
  products: [],
  bundles: {},
  copy: {},
  settings: {},
  orders: [],
  productSort: { key: "popularity", dir: "desc" },
  productFilter: { search: "", category: "all" },
  orderFilter: "all",
};

function loadAll() {
  // Products: write seed to localStorage on first visit so customer view reflects it
  const sp = lsGet(KEYS.products, null);
  if (sp) state.products = sp;
  else { state.products = JSON.parse(JSON.stringify(SEED_PRODUCTS)); saveProducts(); }

  const sb = lsGet(KEYS.bundles, null);
  if (sb) state.bundles = sb;
  else { state.bundles = JSON.parse(JSON.stringify(SEED_BUNDLES)); saveBundles(); }

  state.copy     = { ...SEED_COPY,     ...(lsGet(KEYS.copy,     {}) || {}) };
  state.settings = { ...SEED_SETTINGS, ...(lsGet(KEYS.settings, {}) || {}) };
  const userS = lsGet(KEYS.settings, null);
  if (userS) {
    if (Array.isArray(userS.promos)) state.settings.promos = userS.promos;
    if (Array.isArray(userS.zipList)) state.settings.zipList = userS.zipList;
  }

  const so = lsGet(KEYS.orders, null);
  if (so) {
    // Merge customer-placed orders with seed mock orders (unique by code)
    const codes = new Set(so.map(o => o.code));
    const missing = SEED_ORDERS.filter(s => !codes.has(s.code));
    state.orders = [...so, ...missing];
    if (missing.length) saveOrders();
  } else {
    state.orders = JSON.parse(JSON.stringify(SEED_ORDERS));
    saveOrders();
  }
}

function saveProducts() { lsSet(KEYS.products, state.products); }
function saveBundles()  { lsSet(KEYS.bundles, state.bundles); }
function saveCopy()     { lsSet(KEYS.copy, state.copy); }
function saveSettings() { lsSet(KEYS.settings, state.settings); }
function saveOrders()   { lsSet(KEYS.orders, state.orders); }

/* ---------- DOM helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const productImage = (p) => p.image || `../assets/products/${p.id}.svg`;
const fallbackImg = "../assets/logo.svg";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tagClass = (t) => ({ "Helal":"helal","Angebot":"angebot","Vegan":"vegan","Frisch":"frisch","Kühlung":"kuhlung","Beliebt":"beliebt" }[t] || "");
const moneyFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const money = (n) => moneyFmt.format(Number(n) || 0);

let toastTimer;
function showToast(msg, error = false) {
  const el = $("#adminToast");
  el.textContent = msg;
  el.classList.toggle("is-error", error);
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

/* ============================================================
   AUTH GATE
   ============================================================ */
function checkAuth() {
  const ok = sessionStorage.getItem(KEYS.auth) === "1" || localStorage.getItem(KEYS.auth) === "1";
  if (ok) {
    $("#loginGate").classList.add("is-hidden");
    $("#adminShell").hidden = false;
    init();
  } else {
    $("#loginGate").classList.remove("is-hidden");
    $("#adminShell").hidden = true;
  }
}
$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#loginInput").value.trim();
  if (v === PASSWORD) {
    sessionStorage.setItem(KEYS.auth, "1");
    showToast("Willkommen, Admin.");
    checkAuth();
  } else {
    showToast("Falscher Code", true);
    $("#loginInput").select();
  }
});
$("#logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(KEYS.auth);
  localStorage.removeItem(KEYS.auth);
  checkAuth();
});

/* ============================================================
   TABS
   ============================================================ */
$$(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    $$(".nav-item").forEach(b => b.classList.toggle("is-active", b === btn));
    $$(".panel").forEach(p => p.hidden = p.dataset.panel !== tab);
    if (tab === "products") renderProducts();
    if (tab === "bundles") renderBundles();
    if (tab === "copy") fillCopyForm();
    if (tab === "settings") fillSettingsForm();
    if (tab === "orders") renderOrders();
  });
});

/* ============================================================
   PRODUCTS
   ============================================================ */
function filteredSortedProducts() {
  const q = state.productFilter.search.trim().toLowerCase();
  const cat = state.productFilter.category;
  let list = state.products.filter(p => {
    const inCat = cat === "all" || p.category === cat;
    if (!q) return inCat;
    const hay = `${p.name.de} ${p.name.tr} ${p.id} ${p.tags.join(" ")} ${p.origin}`.toLowerCase();
    return inCat && hay.includes(q);
  });
  const { key, dir } = state.productSort;
  list.sort((a, b) => {
    let av, bv;
    if (key === "name") { av = a.name.de; bv = b.name.de; }
    else if (key === "category") { av = a.category; bv = b.category; }
    else { av = a[key]; bv = b[key]; }
    if (typeof av === "string") { return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
    return dir === "asc" ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
  });
  return list;
}

function renderProducts() {
  const tbody = $("#productsBody");
  const list = filteredSortedProducts();
  tbody.innerHTML = list.map(p => `
    <tr data-id="${esc(p.id)}">
      <td><img class="thumb" src="${esc(productImage(p))}" alt="" onerror="this.onerror=null;this.src='${fallbackImg}'"></td>
      <td>
        <strong>${esc(p.name.de)}</strong>
        ${p.name.tr ? `<br><small style="color:var(--muted)">${esc(p.name.tr)}</small>` : ""}
      </td>
      <td>${esc(categoryLabel(p.category))}</td>
      <td class="num">${money(p.price)}</td>
      <td class="num">${p.oldPrice ? money(p.oldPrice) : '<span style="color:var(--muted)">—</span>'}</td>
      <td><div class="tag-pills">${p.tags.map(t => `<span class="${tagClass(t)}">${esc(t)}</span>`).join("")}</div></td>
      <td class="num">${p.popularity || 0}</td>
      <td><span class="status-pill ${p.active === false ? "off" : "on"}">${p.active === false ? "Inaktiv" : "Aktiv"}</span></td>
      <td>
        <div class="row-actions">
          <button class="row-btn" data-edit="${esc(p.id)}" title="Bearbeiten" aria-label="Bearbeiten">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4-1 11-11-3-3L5 16z M14 6l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="row-btn" data-toggle="${esc(p.id)}" title="${p.active === false ? "Aktivieren" : "Deaktivieren"}" aria-label="Status umschalten">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="${p.active === false ? "M9 12h6" : "m9 12 2 2 4-4"}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
          <button class="row-btn" data-duplicate="${esc(p.id)}" title="Duplizieren" aria-label="Duplizieren">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
  $("#navProductCount").textContent = state.products.length;
}

function categoryLabel(key) {
  return (CATEGORIES.find(([k]) => k === key) || [key, key])[1];
}

$("#productSearch").addEventListener("input", (e) => {
  state.productFilter.search = e.target.value;
  renderProducts();
});
$("#productCategoryFilter").addEventListener("change", (e) => {
  state.productFilter.category = e.target.value;
  renderProducts();
});
$$("[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (state.productSort.key === key) state.productSort.dir = state.productSort.dir === "asc" ? "desc" : "asc";
    else { state.productSort.key = key; state.productSort.dir = key === "name" ? "asc" : "desc"; }
    renderProducts();
  });
});

/* Product edit dialog */
const productDialog = $("#productDialog");
const productForm = $("#productForm");

$("#addProduct").addEventListener("click", () => openProductDialog(null));

document.addEventListener("click", (ev) => {
  const ed = ev.target.closest("[data-edit]");
  if (ed) { openProductDialog(ed.dataset.edit); return; }
  const tg = ev.target.closest("[data-toggle]");
  if (tg) {
    const p = state.products.find(x => x.id === tg.dataset.toggle);
    if (p) { p.active = !(p.active !== false); saveProducts(); renderProducts(); showToast(p.active ? "Aktiviert" : "Deaktiviert"); }
    return;
  }
  const du = ev.target.closest("[data-duplicate]");
  if (du) {
    const p = state.products.find(x => x.id === du.dataset.duplicate);
    if (p) {
      let baseId = p.id + "-copy";
      let n = 1, newId = baseId;
      while (state.products.some(x => x.id === newId)) newId = `${baseId}-${++n}`;
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = newId; copy.name.de = `${p.name.de} (Kopie)`;
      state.products.unshift(copy);
      saveProducts(); renderProducts(); showToast("Produkt dupliziert");
    }
    return;
  }
});

function openProductDialog(id) {
  const isNew = !id;
  const p = isNew ? newProductTemplate() : state.products.find(x => x.id === id);
  if (!p) return;
  $("#productDialogTitle").textContent = isNew ? "Neues Produkt" : "Produkt bearbeiten";
  productForm.elements.id.value = p.id;
  productForm.elements.nameDe.value = p.name.de || "";
  productForm.elements.nameTr.value = p.name.tr || "";
  productForm.elements.category.value = p.category;
  productForm.elements.origin.value = p.origin || "";
  productForm.elements.price.value = p.price ?? "";
  productForm.elements.oldPrice.value = p.oldPrice ?? "";
  productForm.elements.unit.value = p.unit || "";
  productForm.elements.popularity.value = p.popularity ?? 50;
  productForm.elements.noteDe.value = p.note?.de || "";
  productForm.elements.noteTr.value = p.note?.tr || "";
  productForm.elements.tags.value = (p.tags || []).join(", ");
  productForm.elements.image.value = p.image || "";
  productForm.elements.active.checked = p.active !== false;

  // Image preview
  const preview = $("#imgPreview");
  if (p.image) preview.innerHTML = `<img src="${esc(p.image)}" alt="">`;
  else preview.innerHTML = `<img src="${esc(productImage(p))}" alt="" onerror="this.onerror=null;this.src='${fallbackImg}'">`;

  $("#deleteProduct").hidden = isNew;
  productDialog.showModal();
}

function newProductTemplate() {
  let n = state.products.length + 1, id = `produkt-${n}`;
  while (state.products.some(x => x.id === id)) id = `produkt-${++n}`;
  return { id, category: "obst", price: 0, oldPrice: null, unit: "",
    popularity: 50, tags: [], origin: "", active: true,
    name: { de: "", tr: "" }, note: { de: "", tr: "" }, image: "" };
}

$("#imgFile").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  if (file.size > 220_000) {
    showToast("Bild zu groß (max 200 KB). Bitte vorher komprimieren.", true);
    ev.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    productForm.elements.image.value = reader.result;
    $("#imgPreview").innerHTML = `<img src="${esc(reader.result)}" alt="">`;
  };
  reader.readAsDataURL(file);
});

$("#useDefaultImg").addEventListener("click", () => {
  const id = productForm.elements.id.value;
  productForm.elements.image.value = "";
  $("#imgPreview").innerHTML = `<img src="${esc(productImage({ id }))}" alt="" onerror="this.onerror=null;this.src='${fallbackImg}'">`;
  $("#imgFile").value = "";
});

$("#deleteProduct").addEventListener("click", () => {
  const id = productForm.elements.id.value;
  if (!confirm("Produkt wirklich löschen?")) return;
  state.products = state.products.filter(p => p.id !== id);
  saveProducts();
  productDialog.close();
  renderProducts();
  showToast("Produkt gelöscht");
});

productForm.addEventListener("submit", (ev) => {
  if (ev.submitter && ev.submitter.value === "cancel") return; // close only
  ev.preventDefault();
  const f = productForm.elements;
  const id = f.id.value.trim();
  if (!id) return;
  const data = {
    id,
    category: f.category.value,
    price: parseFloat(f.price.value) || 0,
    oldPrice: f.oldPrice.value ? parseFloat(f.oldPrice.value) : null,
    unit: f.unit.value.trim(),
    popularity: Math.max(1, Math.min(100, parseInt(f.popularity.value, 10) || 50)),
    tags: f.tags.value.split(",").map(s => s.trim()).filter(Boolean),
    origin: f.origin.value.trim(),
    active: f.active.checked,
    name: { de: f.nameDe.value.trim(), tr: f.nameTr.value.trim() },
    note: { de: f.noteDe.value.trim(), tr: f.noteTr.value.trim() },
    image: f.image.value || "",
  };
  const idx = state.products.findIndex(p => p.id === id);
  if (idx >= 0) state.products[idx] = data;
  else state.products.unshift(data);
  saveProducts();
  productDialog.close();
  renderProducts();
  showToast(idx >= 0 ? "Produkt aktualisiert" : "Produkt angelegt");
});

/* ============================================================
   BUNDLES
   ============================================================ */
function renderBundles() {
  const grid = $("#bundleGrid");
  const arr = Object.values(state.bundles);
  grid.innerHTML = arr.map(b => `
    <article class="bundle-card" data-color="${esc(b.color)}">
      <span class="bc-eyebrow">${esc(b.eyebrow || "Paket")}</span>
      <h3>${esc(b.titleDe)}</h3>
      <p>${esc(b.descDe)}</p>
      <div class="bc-products">
        ${(b.productIds || []).map(pid => {
          const p = state.products.find(x => x.id === pid);
          return `<span>${esc(p ? p.name.de : pid)}</span>`;
        }).join("")}
      </div>
      <footer>
        <button class="t-btn" data-edit-bundle="${esc(b.key)}">Bearbeiten</button>
      </footer>
    </article>
  `).join("");
  $("#navBundleCount").textContent = arr.length;
}

$("#addBundle").addEventListener("click", () => openBundleDialog(null));
document.addEventListener("click", (ev) => {
  const eb = ev.target.closest("[data-edit-bundle]");
  if (eb) openBundleDialog(eb.dataset.editBundle);
});

const bundleDialog = $("#bundleDialog");
const bundleForm = $("#bundleForm");

function openBundleDialog(key) {
  const isNew = !key;
  const b = isNew ? { key: "", color: "green", eyebrow: "", titleDe: "", titleTr: "", descDe: "", descTr: "", productIds: [] } : state.bundles[key];
  if (!b) return;
  const f = bundleForm.elements;
  f.id.value = key || "";
  f.key.value = b.key || "";
  f.color.value = b.color || "green";
  f.eyebrow.value = b.eyebrow || "";
  f.titleDe.value = b.titleDe || "";
  f.titleTr.value = b.titleTr || "";
  f.descDe.value = b.descDe || "";
  f.descTr.value = b.descTr || "";

  // Product chip pool
  const pool = $("#bundleProductPool");
  pool.innerHTML = state.products.map(p => `
    <label>
      <input type="checkbox" value="${esc(p.id)}" ${b.productIds.includes(p.id) ? "checked" : ""}>
      <span>${esc(p.name.de)}</span>
    </label>
  `).join("");

  $("#deleteBundle").hidden = isNew;
  bundleDialog.showModal();
}

$("#deleteBundle").addEventListener("click", () => {
  const key = bundleForm.elements.id.value;
  if (!key || !confirm("Paket wirklich löschen?")) return;
  delete state.bundles[key];
  saveBundles();
  bundleDialog.close();
  renderBundles();
  showToast("Paket gelöscht");
});

bundleForm.addEventListener("submit", (ev) => {
  if (ev.submitter && ev.submitter.value === "cancel") return;
  ev.preventDefault();
  const f = bundleForm.elements;
  const oldKey = f.id.value;
  const newKey = f.key.value.trim();
  if (!newKey) return;
  const productIds = $$("#bundleProductPool input:checked").map(i => i.value);
  const data = {
    key: newKey, color: f.color.value, eyebrow: f.eyebrow.value.trim(),
    titleDe: f.titleDe.value.trim(), titleTr: f.titleTr.value.trim(),
    descDe: f.descDe.value.trim(), descTr: f.descTr.value.trim(),
    productIds,
  };
  if (oldKey && oldKey !== newKey) delete state.bundles[oldKey];
  state.bundles[newKey] = data;
  saveBundles();
  bundleDialog.close();
  renderBundles();
  showToast(oldKey ? "Paket aktualisiert" : "Paket angelegt");
});

/* ============================================================
   COPY
   ============================================================ */
function fillCopyForm() {
  const f = $("#copyForm").elements;
  Object.keys(state.copy).forEach(k => { if (f[k]) f[k].value = state.copy[k] ?? ""; });
}
$("#saveCopy").addEventListener("click", () => {
  const f = $("#copyForm").elements;
  Object.keys(state.copy).forEach(k => { if (f[k]) state.copy[k] = f[k].value.trim(); });
  saveCopy();
  showToast("Texte gespeichert");
});

/* ============================================================
   SETTINGS
   ============================================================ */
function fillSettingsForm() {
  const f = $("#settingsForm").elements;
  Object.keys(state.settings).forEach(k => {
    if (!f[k]) return;
    if (k === "storeOpen") f[k].checked = !!state.settings[k];
    else if (k === "zipList") f[k].value = (state.settings.zipList || []).join("\n");
    else f[k].value = state.settings[k] ?? "";
  });
  renderPromos();
}

function renderPromos() {
  const wrap = $("#promoList");
  wrap.innerHTML = (state.settings.promos || []).map((p, i) => `
    <div class="promo-row" data-idx="${i}">
      <input data-field="code" value="${esc(p.code)}" placeholder="CODE">
      <select data-field="type">
        <option value="percent" ${p.type === "percent" ? "selected" : ""}>Prozent (%)</option>
        <option value="fixed" ${p.type === "fixed" ? "selected" : ""}>Fix (€)</option>
      </select>
      <input data-field="value" type="number" min="0" step="0.5" value="${esc(p.value)}" placeholder="Wert">
      <input data-field="min" type="number" min="0" step="1" value="${esc(p.min)}" placeholder="Mindestwert €">
      <button class="promo-rm" type="button" data-rm="${i}" aria-label="Code entfernen">×</button>
    </div>
  `).join("");
}

$("#addPromo").addEventListener("click", () => {
  state.settings.promos = state.settings.promos || [];
  state.settings.promos.push({ code: "NEU", type: "percent", value: 5, min: 0 });
  renderPromos();
});

$("#promoList").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rm]");
  if (!rm) return;
  state.settings.promos.splice(Number(rm.dataset.rm), 1);
  renderPromos();
});

$("#saveSettings").addEventListener("click", () => {
  const f = $("#settingsForm").elements;
  ["storeName","storeTaglineDe","storeTaglineTr","addrStreet","addrZip","addrCity","phone","email","hours","whatsappNumber","paypalHandle","accountHolder","iban","bic"]
    .forEach(k => { if (f[k]) state.settings[k] = f[k].value.trim(); });
  ["minOrder","feeDelivery","freeDelivery","feeShipping","freeShipping"]
    .forEach(k => { if (f[k]) state.settings[k] = parseFloat(f[k].value) || 0; });
  state.settings.storeOpen = f.storeOpen.checked;
  state.settings.zipList = f.zipList.value.split(/\r?\n/).map(s => s.trim()).filter(s => /^\d{5}$/.test(s));

  // Promos
  state.settings.promos = $$("#promoList .promo-row").map(row => {
    return {
      code: row.querySelector('[data-field="code"]').value.trim().toUpperCase(),
      type: row.querySelector('[data-field="type"]').value,
      value: parseFloat(row.querySelector('[data-field="value"]').value) || 0,
      min: parseFloat(row.querySelector('[data-field="min"]').value) || 0,
    };
  }).filter(p => p.code);

  saveSettings();
  renderStoreStatus();
  showToast("Einstellungen gespeichert");
});

function renderStoreStatus() {
  const el = $("#topStatus");
  el.classList.toggle("is-paused", !state.settings.storeOpen);
  $("#storeStatusText").textContent = state.settings.storeOpen ? "Shop offen" : "Shop pausiert";
}

/* ============================================================
   ORDERS
   ============================================================ */
function renderOrders() {
  const filter = state.orderFilter;
  const list = state.orders
    .filter(o => filter === "all" || o.status === filter)
    .sort((a, b) => b.at - a.at);
  const wrap = $("#ordersList");
  if (!list.length) {
    wrap.innerHTML = `<div class="orders-empty">Keine Bestellungen mit diesem Status.</div>`;
  } else {
    wrap.innerHTML = list.map(o => {
      const ago = relTime(o.at);
      return `
        <div class="order-row" data-code="${esc(o.code)}">
          <div class="o-code">${esc(o.code)}</div>
          <div class="o-info">
            <strong>${o.entries.reduce((s,e)=>s+e.qty,0)} Artikel · ${esc(o.address || "—")}</strong>
            <span>${esc(o.slot || "")} · ${esc(ago)}${o.note ? ` · Notiz: ${esc(o.note)}` : ""}</span>
          </div>
          <div class="o-amount">${money(o.total)}</div>
          <div class="o-status">
            <select class="${esc(o.status)}" data-status="${esc(o.code)}">
              ${Object.entries(STATUS_LABELS).map(([k, v]) =>
                `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </div>
          <button class="t-btn" data-order-detail="${esc(o.code)}">Details</button>
        </div>
      `;
    }).join("");
  }
  $("#navOrderCount").textContent = state.orders.filter(o => o.status === "new" || o.status === "packing").length;
}

function relTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} h`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

$("#orderStatusFilter").addEventListener("change", (e) => {
  state.orderFilter = e.target.value;
  renderOrders();
});

document.addEventListener("change", (e) => {
  const s = e.target.closest("[data-status]");
  if (!s) return;
  const o = state.orders.find(x => x.code === s.dataset.status);
  if (o) { o.status = s.value; saveOrders(); renderOrders(); showToast(`${o.code}: ${STATUS_LABELS[s.value]}`); }
});

document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-order-detail]");
  if (!d) return;
  const o = state.orders.find(x => x.code === d.dataset.orderDetail);
  if (!o) return;
  $("#orderDialogTitle").textContent = `Bestellung ${o.code}`;
  $("#orderDetail").innerHTML = `
    <div style="padding: 20px 24px; display: grid; gap: 14px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div><strong>Status:</strong> ${STATUS_LABELS[o.status]}</div>
        <div><strong>Slot:</strong> ${esc(o.slot)}</div>
        <div style="grid-column: 1/-1;"><strong>Adresse:</strong> ${esc(o.address)}</div>
        ${o.note ? `<div style="grid-column: 1/-1;"><strong>Notiz:</strong> ${esc(o.note)}</div>` : ""}
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${o.entries.map(e => `
          <tr style="border-bottom: 1px solid var(--line);">
            <td style="padding: 8px 0;">${e.qty}× ${esc(e.name.de)}</td>
            <td style="padding: 8px 0; text-align: right; font-variant-numeric: tabular-nums;">${money(e.price * e.qty)}</td>
          </tr>
        `).join("")}
        <tr><td style="padding: 12px 0; color: var(--muted)">Zwischensumme</td><td style="text-align: right;">${money(o.subtotal)}</td></tr>
        ${o.discount ? `<tr><td style="padding: 4px 0; color: var(--muted)">Gutschein</td><td style="text-align: right;">−${money(o.discount)}</td></tr>` : ""}
        ${o.tip ? `<tr><td style="padding: 4px 0; color: var(--muted)">Trinkgeld</td><td style="text-align: right;">${money(o.tip)}</td></tr>` : ""}
        <tr><td style="padding: 4px 0; color: var(--muted)">Lieferung</td><td style="text-align: right;">${o.fee ? money(o.fee) : "Kostenlos"}</td></tr>
        <tr><td style="padding: 12px 0; font-weight: 800; border-top: 1px solid var(--line);">Gesamt</td><td style="padding: 12px 0; text-align: right; font-family: 'Archivo Black', sans-serif; font-size: 20px; border-top: 1px solid var(--line);">${money(o.total)}</td></tr>
      </table>
    </div>
  `;
  $("#orderDialog").showModal();
});

/* ============================================================
   EXPORT / IMPORT / RESET
   ============================================================ */
$("#exportBtn").addEventListener("click", () => {
  const dump = {
    exportedAt: new Date().toISOString(),
    version: 1,
    products: state.products,
    bundles: state.bundles,
    copy: state.copy,
    settings: state.settings,
    orders: state.orders,
  };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `herdem-cms-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("JSON exportiert");
});

$("#importInput").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.products) || typeof data.bundles !== "object") {
      throw new Error("Ungültiges Format");
    }
    if (!confirm("Aktuelle Daten überschreiben?")) { ev.target.value = ""; return; }
    state.products = data.products;
    state.bundles = data.bundles;
    state.copy = { ...SEED_COPY, ...(data.copy || {}) };
    state.settings = { ...SEED_SETTINGS, ...(data.settings || {}) };
    state.orders = data.orders || [];
    saveProducts(); saveBundles(); saveCopy(); saveSettings(); saveOrders();
    renderProducts(); renderBundles(); fillCopyForm(); fillSettingsForm(); renderOrders(); renderStoreStatus();
    showToast("JSON importiert");
  } catch (e) {
    showToast("Import fehlgeschlagen: " + e.message, true);
  }
  ev.target.value = "";
});

$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Alle CMS-Daten auf Standard zurücksetzen? (Login bleibt.)")) return;
  [KEYS.products, KEYS.bundles, KEYS.copy, KEYS.settings, KEYS.orders].forEach(k => localStorage.removeItem(k));
  loadAll();
  renderProducts(); renderBundles(); fillCopyForm(); fillSettingsForm(); renderOrders(); renderStoreStatus();
  showToast("Auf Standard zurückgesetzt");
});

/* ============================================================
   INIT
   ============================================================ */
function init() {
  loadAll();
  renderProducts();
  renderStoreStatus();
  $("#navProductCount").textContent = state.products.length;
  $("#navBundleCount").textContent = Object.keys(state.bundles).length;
  $("#navOrderCount").textContent = state.orders.filter(o => o.status === "new" || o.status === "packing").length;
}

checkAuth();
