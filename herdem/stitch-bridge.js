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
          <img class="w-full h-full object-contain bg-soft p-2 group-hover:scale-110 transition-all duration-500" src="${productImage(p.id)}" alt="${p.name.de}"/>
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
          <img class="w-full h-full object-contain bg-soft p-2 group-hover:scale-105 transition-all duration-700" src="${productImage(p.id)}" alt="${p.name.de}"/>
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
          <img class="w-full h-full object-contain bg-soft p-2 group-hover:scale-110 transition-all" src="${productImage(p.id)}" alt="${p.name.de}"/>
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
        <img class="w-16 h-16 rounded-xl object-contain bg-soft p-2" src="${productImage(p.id)}" alt=""/>
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
      el.innerHTML = `<div class="grid grid-cols-2 gap-4">${favs.map(popularCard).join("")}</div>`;
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
    const imgEl = document.getElementById("detail-img");
    const titleEl = document.getElementById("detail-title");
    const subEl = document.getElementById("detail-subtitle");
    const priceEl = document.getElementById("detail-price");
    const descEl = document.getElementById("detail-desc");
    if (imgEl) imgEl.src = productImage(p.id);
    if (titleEl) titleEl.textContent = p.name.de;
    if (subEl) subEl.textContent = p.origin || p.unit || "";
    if (priceEl) priceEl.textContent = money(p.price);
    if (descEl) descEl.textContent = p.note?.de || "";
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

  function wireCheckout() {
    const btn = document.getElementById("cart-checkout-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (cartCount() === 0) return;
      const sub = cartSubtotal();
      alert("Bestellung über " + money(sub) + "\n\nLieferadresse + Zahlung (Bar / WhatsApp / Überweisung / PayPal) im nächsten Update.");
    });
  }

  function init() {
    if (!ready()) {
      setTimeout(init, 50);
      return;
    }
    wireCategoryChips();
    wireSearch();
    wireCheckout();
    renderAll();
    console.log("[stitch-bridge] OK · " + products.length + " Produkte, " + cartCount() + " im Korb");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
