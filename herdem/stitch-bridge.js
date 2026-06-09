/* =====================================================================
   Herdem · Stitch-Bridge
   Verbindet Stitch's Single-File-SPA mit unserer Datenschicht aus app.js.
   - Liest products, state.cart, state.favorites aus app.js
   - Rendert Home/Explore/Favorites/Cart dynamisch in Stitch's HTML
   - Hookt alle Buttons (Add/Remove/Heart/Suche/Checkout)
   - Schreibt das CMS aus dem Admin-Panel automatisch durch
   ===================================================================== */
"use strict";

(function () {
  // ---- 1. Wait for app.js globals ----
  function ready() {
    return typeof products !== "undefined" && typeof state !== "undefined" && typeof money === "function";
  }

  // ---- 2. Cart utilities ----
  function cartCount() {
    return Object.values(state.cart || {}).reduce((s, n) => s + n, 0);
  }
  function cartSubtotal() {
    return Object.entries(state.cart || {}).reduce((s, [id, qty]) => {
      const p = products.find(x => x.id === id);
      return s + (p ? p.price * qty : 0);
    }, 0);
  }
  function activeProducts() {
    return products.filter(p => p.active !== false);
  }

  // ---- 3. Card templates ----
  function popularCard(p) {
    const inCart = state.cart[p.id] || 0;
    const fav = state.favorites.includes(p.id);
    return `
      <div class="bg-white rounded-2xl p-3 border border-line/5 shadow-sm group relative cursor-pointer" data-product="${p.id}">
        <div class="aspect-square rounded-xl overflow-hidden bg-surface-container mb-3 relative">
          <img class="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" src="${productImage(p.id)}" alt="${p.name.de}"/>
          <button class="absolute top-2 right-2 bg-white/90 backdrop-blur p-1.5 rounded-full shadow ${fav ? 'text-error' : 'text-muted'}" data-fav="${p.id}" aria-label="Favorit">
            <svg class="icon-21" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-9.5-9C1.2 9.6 2.4 6 6 6c1.9 0 3.4 1 4 2 .6-1 2.1-2 4-2 3.6 0 4.8 3.6 3.5 6-2.5 4.5-9.5 9-9.5 9z"/></svg>
          </button>
        </div>
        <p class="text-sm font-bold text-ink mb-0.5 truncate">${p.name.de}</p>
        <div class="flex justify-between items-end">
          <p class="font-price-lg text-lg text-primary">${money(p.price)}</p>
          ${inCart > 0
            ? `<div class="flex items-center gap-1 bg-primary text-white rounded-full px-1 py-0.5 font-bold text-xs">
                 <button class="w-7 h-7 rounded-full flex items-center justify-center active:scale-90" data-dec="${p.id}">−</button>
                 <span class="min-w-[18px] text-center">${inCart}</span>
                 <button class="w-7 h-7 rounded-full flex items-center justify-center active:scale-90" data-inc="${p.id}">+</button>
               </div>`
            : `<button class="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-md active:scale-90 transition-all" data-inc="${p.id}" aria-label="Hinzufügen">
                 <svg class="icon-21" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>
               </button>`
          }
        </div>
      </div>
    `;
  }

  function freshCard(p) {
    const inCart = state.cart[p.id] || 0;
    return `
      <div class="flex-none w-[280px] bg-cream/30 rounded-2xl overflow-hidden border border-line/20 shadow-sm group cursor-pointer" data-product="${p.id}">
        <div class="h-40 overflow-hidden">
          <img class="w-full h-full object-cover group-hover:scale-105 transition-all duration-700" src="${productImage(p.id)}" alt="${p.name.de}"/>
        </div>
        <div class="p-4">
          <span class="px-2 py-0.5 bg-primary text-white text-[9px] font-black rounded-md uppercase tracking-widest">Täglich frisch</span>
          <h4 class="font-headline-md text-lg text-ink mt-2 truncate">${p.name.de}</h4>
          <div class="flex justify-between items-center mt-3">
            <p class="font-price-lg text-lg text-primary">${money(p.price)}</p>
            <button class="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold text-xs active:scale-95" data-inc="${p.id}">
              ${inCart > 0 ? inCart + "× im Korb" : "Hinzufügen"}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function exploreCard(p) {
    const inCart = state.cart[p.id] || 0;
    const hasDiscount = p.oldPrice && p.oldPrice > p.price;
    const discountPct = hasDiscount ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    return `
      <div class="bg-white rounded-2xl overflow-hidden border border-line/30 shadow-sm relative group cursor-pointer" data-product="${p.id}">
        <div class="relative aspect-square">
          <img class="w-full h-full object-cover group-hover:scale-110 transition-all" src="${productImage(p.id)}" alt="${p.name.de}"/>
          ${hasDiscount ? `<div class="absolute top-2 left-2 bg-error text-white text-[9px] font-black px-2 py-1 rounded-full uppercase">-${discountPct}%</div>` : ""}
        </div>
        <div class="p-3">
          <h4 class="text-sm font-bold text-ink truncate">${p.name.de}</h4>
          <div class="flex justify-between items-center mt-2">
            <div>
              <p class="font-price-lg text-lg text-primary">${money(p.price)}</p>
              ${hasDiscount ? `<p class="text-[10px] text-muted line-through">${money(p.oldPrice)}</p>` : ""}
            </div>
            ${inCart > 0
              ? `<div class="flex items-center gap-1 bg-primary text-white rounded-full px-1 py-0.5 font-bold text-xs">
                   <button class="w-6 h-6 rounded-full flex items-center justify-center" data-dec="${p.id}">−</button>
                   <span>${inCart}</span>
                   <button class="w-6 h-6 rounded-full flex items-center justify-center" data-inc="${p.id}">+</button>
                 </div>`
              : `<button class="bg-primary text-white p-2 rounded-xl active:scale-90 transition-transform" data-inc="${p.id}" aria-label="Hinzufügen">
                   <svg class="icon-24" viewBox="0 0 24 24" fill="currentColor"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3zm-4 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.17 14h9.45a2 2 0 0 0 1.8-1.13l3.18-6.66a1 1 0 0 0-.9-1.44H6.27L5.3 2.8A1 1 0 0 0 4.4 2H1v2h2.4l3.6 7.59L5.25 14.04A2 2 0 0 0 7 16h12v-2H7l1.1-2z"/></svg>
                 </button>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function cartRow(p, qty) {
    return `
      <div class="bg-white p-4 rounded-2xl border border-line/30 flex gap-4 shadow-sm items-center" data-cart-row="${p.id}">
        <img class="w-16 h-16 rounded-xl object-cover" src="${productImage(p.id)}" alt=""/>
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-sm truncate">${p.name.de}</h4>
          <p class="font-price-lg text-primary">${money(p.price)}</p>
        </div>
        <div class="flex items-center gap-3 bg-soft p-1 rounded-full font-bold">
          <button class="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-primary active:scale-90" data-dec="${p.id}" aria-label="Weniger">−</button>
          <span class="text-sm min-w-[18px] text-center">${qty}</span>
          <button class="w-8 h-8 rounded-full bg-primary text-white shadow-sm flex items-center justify-center active:scale-90" data-inc="${p.id}" aria-label="Mehr">+</button>
        </div>
      </div>
    `;
  }

  // ---- 4. Render functions ----
  function renderHome() {
    const popularEl = document.getElementById("home-popular-grid");
    const freshEl = document.getElementById("home-fresh-scroll");
    if (popularEl) {
      const popular = activeProducts()
        .slice()
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 4);
      popularEl.innerHTML = popular.map(popularCard).join("");
    }
    if (freshEl) {
      const fresh = activeProducts().filter(p => p.tags.includes("Frisch")).slice(0, 6);
      freshEl.innerHTML = fresh.length ? fresh.map(freshCard).join("") : "";
    }
  }

  function renderExplore(filterCat) {
    const el = document.getElementById("explore-grid");
    if (!el) return;
    let list = activeProducts();
    if (filterCat && filterCat !== "all") {
      if (filterCat === "angebote") list = list.filter(p => p.tags.includes("Angebot"));
      else list = list.filter(p => p.category === filterCat);
    }
    el.innerHTML = list.length
      ? list.map(exploreCard).join("")
      : `<div class="col-span-2 text-center py-12 text-muted">Keine Produkte in dieser Kategorie.</div>`;
    const title = document.getElementById("explore-title");
    if (title) {
      const labels = {
        all: "Alle Produkte", angebote: "Angebote",
        fleisch: "Fleisch & Helal", obst: "Obst & Gemüse",
        milch: "Milchprodukte", gewuerze: "Gewürze & Öl",
        snacks: "Snacks & Süßes", getraenke: "Getränke"
      };
      title.textContent = labels[filterCat] || "Alle Produkte";
    }
  }

  function renderFavorites() {
    const el = document.getElementById("favorites-content");
    if (!el) return;
    const favs = activeProducts().filter(p => state.favorites.includes(p.id));
    if (!favs.length) {
      el.innerHTML = `
        <div class="bg-surface-container-low p-12 rounded-[32px] text-center flex flex-col items-center gap-4">
          <div class="w-20 h-20 bg-soft rounded-full flex items-center justify-center mb-2">
            <svg class="icon-24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9C1.2 9.6 2.4 6 6 6c1.9 0 3.4 1 4 2 .6-1 2.1-2 4-2 3.6 0 4.8 3.6 3.5 6-2.5 4.5-9.5 9-9.5 9z"/></svg>
          </div>
          <p class="text-muted text-sm font-medium">Noch keine Favoriten gespeichert.</p>
          <button class="bg-primary text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20" onclick="switchView('explore')">Jetzt entdecken</button>
        </div>
      `;
    } else {
      el.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">${favs.map(popularCard).join("")}</div>`;
    }
  }

  function renderCart() {
    const itemsEl = document.getElementById("cart-items");
    const subEl = document.getElementById("cart-subtotal");
    const totalEl = document.getElementById("cart-total");
    const lblEl = document.getElementById("cart-summary-label");
    const footerEl = document.getElementById("cart-footer");
    if (!itemsEl) return;

    const entries = Object.entries(state.cart || {}).filter(([, q]) => q > 0);
    const sub = cartSubtotal();
    const count = cartCount();

    if (lblEl) lblEl.textContent = `${count} ${count === 1 ? "Artikel" : "Artikel"}`;
    if (subEl) subEl.textContent = money(sub);
    if (totalEl) totalEl.textContent = money(sub);

    if (!entries.length) {
      itemsEl.innerHTML = `
        <div class="bg-surface-container-low p-12 rounded-[32px] text-center flex flex-col items-center gap-4">
          <div class="w-20 h-20 bg-soft rounded-full flex items-center justify-center mb-2">
            <svg class="icon-24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.17 14h9.45a2 2 0 0 0 1.8-1.13l3.18-6.66a1 1 0 0 0-.9-1.44H6.27L5.3 2.8A1 1 0 0 0 4.4 2H1v2h2.4l3.6 7.59L5.25 14.04A2 2 0 0 0 7 16h12v-2H7l1.1-2z"/></svg>
          </div>
          <p class="text-muted text-sm font-medium">Dein Warenkorb ist leer.</p>
          <button class="bg-primary text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20" onclick="switchView('home')">Jetzt einkaufen</button>
        </div>
      `;
      if (footerEl) footerEl.style.display = "none";
    } else {
      itemsEl.innerHTML = entries.map(([id, qty]) => {
        const p = products.find(x => x.id === id);
        return p ? cartRow(p, qty) : "";
      }).join("");
      if (footerEl) footerEl.style.display = "";
    }
  }

  function renderCartBadge() {
    const el = document.getElementById("cart-count");
    if (!el) return;
    const c = cartCount();
    el.textContent = c;
    el.style.display = c === 0 ? "none" : "";
  }

  function renderAll() {
    renderHome();
    renderExplore("all");
    renderFavorites();
    renderCart();
    renderCartBadge();
  }

  // ---- 5. Wire interactions ----
  function setQty(id, q) {
    if (q <= 0) delete state.cart[id];
    else state.cart[id] = q;
    try { localStorage.setItem("herdem.cart", JSON.stringify(state.cart)); } catch (_) {}
    renderAll();
  }

  function toggleFav(id) {
    const i = state.favorites.indexOf(id);
    if (i >= 0) state.favorites.splice(i, 1);
    else state.favorites.push(id);
    try { localStorage.setItem("herdem.favorites", JSON.stringify(state.favorites)); } catch (_) {}
    renderAll();
  }

  document.addEventListener("click", (ev) => {
    const inc = ev.target.closest("[data-inc]");
    if (inc) {
      ev.stopPropagation();
      setQty(inc.dataset.inc, (state.cart[inc.dataset.inc] || 0) + 1);
      return;
    }
    const dec = ev.target.closest("[data-dec]");
    if (dec) {
      ev.stopPropagation();
      const id = dec.dataset.dec;
      setQty(id, Math.max(0, (state.cart[id] || 0) - 1));
      return;
    }
    const fav = ev.target.closest("[data-fav]");
    if (fav) {
      ev.stopPropagation();
      toggleFav(fav.dataset.fav);
      return;
    }
    const prod = ev.target.closest("[data-product]");
    if (prod) {
      openStitchProduct(prod.dataset.product);
      return;
    }
  });

  // Override openProduct globally (Stitch HTML uses this name)
  window.openProduct = function (id) { openStitchProduct(id); };

  function openStitchProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    currentDetailId = p.id;
    const imgEl = document.getElementById("detail-img");
    const titleEl = document.getElementById("detail-title");
    const subEl = document.getElementById("detail-subtitle");
    const priceEl = document.getElementById("detail-price");
    const descEl = document.getElementById("detail-desc");
    const qtyEl = document.getElementById("detail-qty");
    if (imgEl) imgEl.src = productImage(p.id);
    if (titleEl) titleEl.textContent = p.name.de;
    if (subEl) subEl.textContent = p.origin || p.unit || "";
    if (priceEl) priceEl.textContent = money(p.price);
    if (descEl) descEl.textContent = p.note?.de || "";
    if (qtyEl) qtyEl.textContent = "1";
    if (typeof switchView === "function") switchView("product-details");
  }

  function wireSearch() {
    const inp = document.getElementById("home-search");
    if (!inp) return;
    let t = 0;
    inp.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const q = inp.value.trim().toLowerCase();
        if (!q) { renderHome(); return; }
        const matches = activeProducts().filter(p =>
          (p.name.de + " " + (p.name.tr || "") + " " + p.tags.join(" ")).toLowerCase().includes(q)
        );
        const popularEl = document.getElementById("home-popular-grid");
        if (popularEl) {
          popularEl.innerHTML = matches.length
            ? matches.slice(0, 8).map(popularCard).join("")
            : `<div class="col-span-2 text-center py-8 text-muted text-sm">Nichts gefunden für „${inp.value}".</div>`;
        }
        const freshEl = document.getElementById("home-fresh-scroll");
        if (freshEl) freshEl.innerHTML = "";
      }, 180);
    });
  }

  function wireCategoryChips() {
    const chipsContainer = document.querySelector("#view-home .overflow-x-auto");
    if (!chipsContainer) return;
    chipsContainer.innerHTML = [
      ["all", "Alle"],
      ["angebote", "Angebote"],
      ["fleisch", "Fleisch"],
      ["obst", "Obst"],
      ["milch", "Milch"],
      ["gewuerze", "Gewürze"],
      ["snacks", "Snacks"],
      ["getraenke", "Getränke"],
    ].map(([key, label], i) => `
      <button class="flex-none px-5 py-2.5 ${i === 0 ? "bg-primary text-on-primary" : "bg-soft text-ink"} rounded-xl text-[13px] font-bold ${i === 0 ? "shadow-sm" : ""}" data-cat="${key}">${label}</button>
    `).join("");
    chipsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      chipsContainer.querySelectorAll("[data-cat]").forEach(b => {
        b.classList.remove("bg-primary", "text-on-primary", "shadow-sm");
        b.classList.add("bg-soft", "text-ink");
      });
      btn.classList.remove("bg-soft", "text-ink");
      btn.classList.add("bg-primary", "text-on-primary", "shadow-sm");
      renderExplore(btn.dataset.cat);
      if (typeof switchView === "function") switchView("explore");
    });
  }

  /* ---------- 6. Checkout-View + Place-Order ---------- */
  let chosenPay = "cash";

  function renderCheckoutSummary() {
    const sum = document.getElementById("checkout-summary");
    const tot = document.getElementById("checkout-total");
    if (!sum || !tot) return;
    const entries = Object.entries(state.cart || {}).filter(([, q]) => q > 0);
    sum.innerHTML = entries.map(([id, qty]) => {
      const p = products.find(x => x.id === id);
      if (!p) return "";
      return `<div class="flex justify-between text-sm">
        <span class="text-ink/90 truncate pr-2">${qty}× ${p.name.de}</span>
        <span class="font-mono font-bold shrink-0">${money(p.price * qty)}</span>
      </div>`;
    }).join("");
    tot.textContent = money(cartSubtotal());
  }

  const PAY_HINTS = {
    cash:     "Du bezahlst dem Fahrer bei Lieferung — bitte den Betrag möglichst passend bereithalten.",
    whatsapp: "Wir öffnen WhatsApp mit deiner Bestellung. Du sendest die Nachricht ab, der Shop bestätigt und liefert.",
    transfer: "Du bekommst nach der Bestellung Kontodaten und Bestellnummer als Verwendungszweck. Lieferung startet nach Zahlungseingang.",
    paypal:   "Du wirst zu PayPal.me mit dem Betrag weitergeleitet. Schließe die Zahlung dort ab.",
  };

  function selectPay(method) {
    chosenPay = method;
    const hint = document.getElementById("checkout-pay-hint");
    if (hint) hint.textContent = PAY_HINTS[method] || PAY_HINTS.cash;
    document.querySelectorAll("#checkout-pay-grid [data-pay]").forEach(b => {
      if (b.dataset.pay === method) {
        b.classList.remove("bg-soft", "text-ink", "border", "border-line/30");
        b.classList.add("bg-primary", "text-on-primary", "shadow-md");
      } else {
        b.classList.add("bg-soft", "text-ink", "border", "border-line/30");
        b.classList.remove("bg-primary", "text-on-primary", "shadow-md");
      }
    });
  }

  // Read CMS settings for payment delivery details
  let cmsSettings = null;
  function loadCmsSettings() {
    try {
      const raw = localStorage.getItem("herdem.cms.settings");
      cmsSettings = raw ? JSON.parse(raw) : {};
    } catch { cmsSettings = {}; }
  }

  function newOrderCode() {
    return "HDM-" + String(Math.floor(1000 + Math.random() * 9000));
  }

  function buildWhatsAppUrl(receipt) {
    const num = (cmsSettings?.whatsappNumber || "").replace(/[^\d]/g, "");
    if (!num) return null;
    const lines = receipt.entries.map(e => `• ${e.qty}× ${e.name} — ${money(e.price * e.qty)}`);
    const txt = [
      `Hallo Herdem, ich möchte folgende Bestellung aufgeben (Code: ${receipt.code}):`,
      "",
      ...lines,
      ``,
      `Gesamt: ${money(receipt.total)}`,
      ``,
      `Adresse: ${receipt.address}`,
      receipt.hint ? `Hinweis: ${receipt.hint}` : "",
    ].filter(Boolean).join("\n");
    return `https://wa.me/${num}?text=${encodeURIComponent(txt)}`;
  }

  function buildPaypalUrl(receipt) {
    const handle = (cmsSettings?.paypalHandle || "").replace(/^@/, "").trim();
    if (!handle) return null;
    return `https://www.paypal.me/${encodeURIComponent(handle)}/${receipt.total.toFixed(2)}EUR`;
  }

  function fillTransferView(receipt) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const formatIban = (s) => String(s || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
    set("tr-holder", cmsSettings?.accountHolder || cmsSettings?.storeName || "Herdem");
    set("tr-iban", formatIban(cmsSettings?.iban));
    set("tr-bic", cmsSettings?.bic || "—");
    set("tr-amount", money(receipt.total));
    set("tr-ref", receipt.code);
  }

  function pushOrderToCms(receipt) {
    try {
      const raw = localStorage.getItem("herdem.cms.orders");
      const list = raw ? JSON.parse(raw) : [];
      list.unshift({
        code: receipt.code, at: Date.now(), status: "new",
        entries: receipt.entries.map(e => ({
          id: e.id, qty: e.qty, price: e.price,
          name: { de: e.name, tr: e.name }
        })),
        subtotal: receipt.total, discount: 0, tip: 0, fee: 0, total: receipt.total,
        slot: "—", address: receipt.address, note: receipt.hint || "",
      });
      localStorage.setItem("herdem.cms.orders", JSON.stringify(list.slice(0, 200)));
    } catch { /* quota */ }
  }

  let lastReceipt = null;

  function placeOrder(e) {
    if (e) e.preventDefault();
    const form = document.getElementById("checkout-form");
    if (!form || !form.reportValidity()) return;

    if (cartCount() === 0) return;
    loadCmsSettings();

    const fd = new FormData(form);
    const entries = Object.entries(state.cart || {}).filter(([, q]) => q > 0).map(([id, qty]) => {
      const p = products.find(x => x.id === id);
      return p ? { id, qty, price: p.price, name: p.name.de } : null;
    }).filter(Boolean);

    const receipt = {
      code: newOrderCode(),
      entries,
      total: cartSubtotal(),
      address: `${fd.get("street")}, ${fd.get("zip")} ${fd.get("city")}`,
      hint: (fd.get("hint") || "").toString().trim(),
      name: fd.get("name"),
      phone: fd.get("phone"),
      payment: chosenPay,
    };

    // Validation per method
    if (chosenPay === "whatsapp" && !cmsSettings?.whatsappNumber) {
      showStitchToast("WhatsApp-Nummer fehlt — bitte Bar oder Überweisung wählen.");
      return;
    }
    if (chosenPay === "paypal" && !cmsSettings?.paypalHandle) {
      showStitchToast("PayPal.me-Handle fehlt — bitte Bar oder Überweisung wählen.");
      return;
    }
    if (chosenPay === "transfer" && (!cmsSettings?.iban || !cmsSettings?.accountHolder)) {
      showStitchToast("Konto-Daten fehlen — bitte Bar wählen.");
      return;
    }

    lastReceipt = receipt;
    pushOrderToCms(receipt);

    if (chosenPay === "whatsapp") {
      const url = buildWhatsAppUrl(receipt);
      if (url) window.open(url, "_blank", "noopener");
      finishOrder(receipt);
    } else if (chosenPay === "paypal") {
      const url = buildPaypalUrl(receipt);
      if (url) window.open(url, "_blank", "noopener");
      finishOrder(receipt);
    } else if (chosenPay === "transfer") {
      fillTransferView(receipt);
      switchView("transfer");
    } else {
      // cash
      finishOrder(receipt);
    }
  }

  function finishOrder(receipt) {
    const codeEl = document.getElementById("success-code");
    if (codeEl) codeEl.textContent = receipt.code;
    switchView("success");
    fireConfettiStitch();
  }

  function fireConfettiStitch() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#063b29", "#f0b429", "#c33d2e", "#2a6da3", "#fff", "#fdbf35"];
    for (let i = 0; i < 50; i++) {
      const c = document.createElement("span");
      c.style.cssText = `position:fixed;top:-10px;left:${Math.random() * 100}vw;width:${5 + Math.random() * 6}px;height:${10 + Math.random() * 8}px;background:${colors[i % colors.length]};z-index:200;pointer-events:none;border-radius:1px;animation:cfall 2400ms cubic-bezier(.25,.5,.5,1) forwards;animation-delay:${Math.random() * 250}ms;transform:rotate(${Math.random() * 360}deg);`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3000);
    }
    if (!document.getElementById("cfall-keyframes")) {
      const st = document.createElement("style");
      st.id = "cfall-keyframes";
      st.textContent = "@keyframes cfall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }";
      document.head.appendChild(st);
    }
  }

  let toastTimer = 0;
  function showStitchToast(msg) {
    let t = document.getElementById("stitch-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "stitch-toast";
      t.style.cssText = "position:fixed;left:50%;bottom:96px;transform:translate(-50%,16px);padding:12px 20px;background:#14241c;color:#fff;border-radius:999px;font-weight:800;font-size:13px;opacity:0;transition:opacity 200ms,transform 200ms;z-index:200;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:90vw;text-align:center;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translate(-50%,0)"; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translate(-50%,16px)"; }, 2400);
  }

  function wireCheckout() {
    const goBtn = document.getElementById("cart-checkout-btn");
    if (goBtn) {
      goBtn.addEventListener("click", () => {
        if (cartCount() === 0) return;
        loadCmsSettings();
        renderCheckoutSummary();
        selectPay(chosenPay);
        switchView("checkout");
      });
    }
    // Pay selection
    document.querySelectorAll("#checkout-pay-grid [data-pay]").forEach(b => {
      b.addEventListener("click", () => selectPay(b.dataset.pay));
    });
    // Form submit
    document.getElementById("checkout-form")?.addEventListener("submit", placeOrder);
    // Transfer done → success
    document.getElementById("tr-done-btn")?.addEventListener("click", () => {
      if (lastReceipt) finishOrder(lastReceipt);
    });
    // Transfer copy buttons
    document.querySelectorAll("[data-tr-copy]").forEach(b => {
      b.addEventListener("click", () => {
        const el = document.getElementById(b.dataset.trCopy);
        if (!el) return;
        const txt = el.textContent.trim();
        if (!txt || txt === "—") return;
        (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => {
          const o = b.textContent; b.textContent = "Kopiert ✓"; b.classList.add("bg-secondary");
          setTimeout(() => { b.textContent = o; b.classList.remove("bg-secondary"); }, 1400);
        }).catch(() => showStitchToast("Kopieren fehlgeschlagen — manuell auswählen."));
      });
    });
    // Success close → reset cart + go home
    document.getElementById("success-close-btn")?.addEventListener("click", () => {
      state.cart = {}; try { localStorage.setItem("herdem.cart", "{}"); } catch (_) {}
      renderAll();
      switchView("home");
    });
  }

  /* ---------- 7. Detail view +/- ---------- */
  let currentDetailId = null;
  function wireDetailView() {
    const inc = document.getElementById("detail-inc");
    const dec = document.getElementById("detail-dec");
    const qty = document.getElementById("detail-qty");
    const add = document.getElementById("detail-add-btn");
    if (inc) inc.addEventListener("click", () => {
      const n = parseInt(qty?.textContent || "1", 10) + 1;
      if (qty) qty.textContent = n;
    });
    if (dec) dec.addEventListener("click", () => {
      const n = Math.max(1, parseInt(qty?.textContent || "1", 10) - 1);
      if (qty) qty.textContent = n;
    });
    if (add) add.addEventListener("click", () => {
      if (!currentDetailId) return;
      const n = parseInt(qty?.textContent || "1", 10);
      setQty(currentDetailId, (state.cart[currentDetailId] || 0) + n);
      switchView("cart");
      if (qty) qty.textContent = "1";
    });
  }

  function init() {
    if (!ready()) {
      setTimeout(init, 50);
      return;
    }
    loadCmsSettings();
    wireCategoryChips();
    wireSearch();
    wireCheckout();
    wireDetailView();
    renderAll();
    console.log("[stitch-bridge] OK · " + products.length + " Produkte, " + cartCount() + " im Korb");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
