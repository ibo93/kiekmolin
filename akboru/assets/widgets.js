/* AK BORU PROFIL — Floating widgets: WhatsApp + AK Assistant
   Depends on i18n.js (window.AKBORU.translate / .getLang / .onLangChange).
*/
(function () {
  const WA_NUMBER = "+905550000000"; // PLATZHALTER — auf echte Firmen-Nummer ändern
  const WA_DIGITS = WA_NUMBER.replace(/[^0-9]/g, "");

  function t(key) {
    const lang = (window.AKBORU && window.AKBORU.getLang && window.AKBORU.getLang()) || "en";
    return window.AKBORU.translate(key, lang);
  }

  function waUrl(extraPrefill) {
    const base = t("wa.prefill");
    const text = extraPrefill ? base + "\n\n" + extraPrefill : base;
    return "https://wa.me/" + WA_DIGITS + "?text=" + encodeURIComponent(text);
  }

  /* ----- Intent classifier (multilingual, keyword based) ----- */
  // Each rule: list of patterns (lowercased substrings) -> response key + optional CTAs
  const RULES = [
    { key: "ai.r.products",   words: ["product","ürün", "urun", "profil","produkt","منتج","rhs","chs","shs","hohl","kesit"] },
    { key: "ai.r.standards",  words: ["standard","norm","iso","en 10","s235","s275","s355","sertifika","zertifik","certif","معيار","شهاد"] },
    { key: "ai.r.lead",       words: ["lead","liefer","teslim","versand","ship","deliver","wann","ne zaman","time","tarih","موعد","تسليم","شحن"] },
    { key: "ai.r.custom",     words: ["custom","special","sonder","özel","ozel","maß","mass","cut","kesim","zuschnitt","مخصص","قطع"] },
    { key: "ai.r.quote",      words: ["quote","price","offer","preis","angebot","fiyat","teklif","kosten","cost","سعر","عرض","تكلفة"] },
    { key: "ai.r.sustain",    words: ["sustain","nachhalt","recycl","reciklaj","sürdürül","surdurul","carbon","co2","استدام","تدوير"] },
    { key: "ai.r.location",   words: ["location","where","wo ","nerede","türkiye","turkey","türkei","turkei","export","ihrac","موقع","تركيا","تصدير"] }
  ];

  function classify(text) {
    const q = " " + text.toLowerCase() + " ";
    for (const rule of RULES) {
      if (rule.words.some((w) => q.includes(w))) return rule.key;
    }
    return "ai.r.fallback";
  }

  /* ----- DOM building ----- */
  function build() {
    if (document.querySelector(".fab-stack")) return;

    const waSvg = `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.385.69 4.61 1.882 6.49L4 28l6.69-1.852A11.93 11.93 0 0016 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 21.667a9.62 9.62 0 01-4.91-1.341l-.353-.21-3.97 1.1 1.06-3.866-.23-.397A9.62 9.62 0 1125.667 15c0 5.34-4.327 9.667-9.666 9.667zm5.273-7.235c-.286-.143-1.694-.834-1.956-.93-.262-.095-.453-.143-.643.143-.19.286-.738.93-.905 1.12-.167.19-.333.214-.62.072-.286-.143-1.21-.446-2.306-1.422-.852-.76-1.428-1.7-1.595-1.985-.167-.286-.018-.44.125-.583.128-.128.286-.333.43-.5.143-.167.19-.286.286-.476.095-.19.048-.357-.024-.5-.072-.143-.643-1.548-.881-2.12-.232-.557-.469-.482-.643-.49l-.548-.01a1.05 1.05 0 00-.762.357c-.262.286-1 1.012-1 2.467s1.024 2.86 1.167 3.05c.143.19 2.012 3.07 4.873 4.305.682.294 1.214.469 1.629.6.683.217 1.305.187 1.797.114.548-.082 1.694-.692 1.933-1.36.238-.667.238-1.238.167-1.357-.072-.119-.262-.19-.548-.333z"/>
      </svg>`;

    const root = document.createElement("div");
    root.className = "fab-stack";
    root.innerHTML = `
      <button type="button" class="fab fab-ai" aria-label="AK Assistant" data-fab="ai">
        <span class="ai-pulse"></span>
        <span class="ai-glyph">AK</span>
        <span class="fab-tooltip" data-i18n="ai.tooltip">AK Assistant</span>
      </button>
      <a class="fab fab-wa" href="${waUrl()}" target="_blank" rel="noopener" aria-label="WhatsApp" data-fab="wa">
        ${waSvg}
        <span class="fab-tooltip" data-i18n="wa.tooltip">Chat on WhatsApp</span>
      </a>
    `;
    document.body.appendChild(root);

    const panel = document.createElement("aside");
    panel.className = "ai-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", "AK Assistant");
    panel.innerHTML = `
      <div class="ai-header">
        <div class="ai-avatar">AK</div>
        <div class="ai-header-text">
          <div class="ai-header-title" data-i18n="ai.title">AK Assistant</div>
          <div class="ai-header-sub" data-i18n="ai.subtitle">Engineering & Sales · Instant reply</div>
        </div>
        <button type="button" class="ai-close" aria-label="Close" data-ai-close>
          <span class="material-symbols-outlined" style="font-size:20px;">close</span>
        </button>
      </div>
      <div class="ai-body" data-ai-body></div>
      <form class="ai-footer" data-ai-form>
        <div class="ai-input-row">
          <input type="text" data-ai-input data-i18n-attr="placeholder:ai.input.ph" placeholder="Ask anything…" autocomplete="off" />
          <button type="submit" aria-label="Send">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="ai-disclaimer" data-i18n="ai.disclaimer">Answers are informational. Our team confirms binding offers.</div>
      </form>
    `;
    document.body.appendChild(panel);

    // Refresh WA link whenever language changes (so prefill text matches lang)
    function refreshWaLink() {
      const a = root.querySelector('a[data-fab="wa"]');
      if (a) a.href = waUrl();
    }
    if (window.AKBORU && window.AKBORU.onLangChange) {
      window.AKBORU.onLangChange(refreshWaLink);
    }

    // Wire up open/close
    const aiBtn = root.querySelector('[data-fab="ai"]');
    const closeBtn = panel.querySelector("[data-ai-close]");
    const body = panel.querySelector("[data-ai-body]");
    const form = panel.querySelector("[data-ai-form]");
    const input = panel.querySelector("[data-ai-input]");
    let primed = false;

    aiBtn.addEventListener("click", () => {
      const willOpen = !panel.classList.contains("open");
      panel.classList.toggle("open", willOpen);
      if (willOpen && !primed) {
        primed = true;
        primeGreeting(body);
      }
      if (willOpen) {
        setTimeout(() => input.focus(), 200);
      }
    });
    closeBtn.addEventListener("click", () => panel.classList.remove("open"));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      addUserMsg(body, text);
      respondTo(body, text);
    });
  }

  function scroll(body) {
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
  }

  function addBotMsg(body, html) {
    const div = document.createElement("div");
    div.className = "ai-msg ai-bot";
    div.innerHTML = html;
    body.appendChild(div);
    scroll(body);
    return div;
  }
  function addUserMsg(body, text) {
    const div = document.createElement("div");
    div.className = "ai-msg ai-me";
    div.textContent = text;
    body.appendChild(div);
    scroll(body);
  }
  function addTyping(body) {
    const div = document.createElement("div");
    div.className = "ai-typing";
    div.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(div);
    scroll(body);
    return div;
  }
  function addChips(body, chipKeys, onPick) {
    const wrap = document.createElement("div");
    wrap.className = "ai-chips";
    chipKeys.forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-chip";
      btn.setAttribute("data-i18n", key);
      btn.textContent = t(key);
      btn.addEventListener("click", () => { onPick(key, btn.textContent); });
      wrap.appendChild(btn);
    });
    body.appendChild(wrap);
    scroll(body);
    return wrap;
  }
  function addActions(body, includeForm) {
    const wrap = document.createElement("div");
    wrap.className = "ai-actions";
    wrap.innerHTML = `
      <a class="act-wa" href="${waUrl()}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.07L2 22l5.07-1.34A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>
        <span data-i18n="ai.cta.wa">Open WhatsApp</span>
      </a>
      ${includeForm ? `<a class="act-form" href="./contact.html"><span data-i18n="ai.cta.form">Open form</span></a>` : ""}
    `;
    body.appendChild(wrap);
    scroll(body);
  }

  function primeGreeting(body) {
    addBotMsg(body, `<span data-i18n="ai.greeting">${t("ai.greeting")}</span>`);
    addChips(body, ["ai.chip.products","ai.chip.standards","ai.chip.lead","ai.chip.custom","ai.chip.quote"], (chipKey, label) => {
      addUserMsg(body, label);
      const intent = ({
        "ai.chip.products":  "ai.r.products",
        "ai.chip.standards": "ai.r.standards",
        "ai.chip.lead":      "ai.r.lead",
        "ai.chip.custom":    "ai.r.custom",
        "ai.chip.quote":     "ai.r.quote"
      })[chipKey];
      respondWith(body, intent);
    });
  }

  function respondWith(body, intentKey) {
    const typing = addTyping(body);
    setTimeout(() => {
      typing.remove();
      const div = addBotMsg(body, `<span data-i18n="${intentKey}">${t(intentKey)}</span>`);
      // For quote/custom/fallback also show CTAs
      if (intentKey === "ai.r.quote" || intentKey === "ai.r.custom" || intentKey === "ai.r.fallback") {
        addActions(body, true);
      }
      // Update lang-bound text after lang switch
      div.setAttribute("data-i18n-msg", intentKey);
    }, 420 + Math.random() * 280);
  }

  function respondTo(body, text) {
    const intentKey = classify(text);
    respondWith(body, intentKey);
  }

  // Re-translate dynamic messages on lang change
  function reTranslateMessages() {
    document.querySelectorAll(".ai-body [data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    document.querySelectorAll(".ai-body .ai-actions [data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
  }

  function start() {
    build();
    if (window.AKBORU && window.AKBORU.onLangChange) {
      window.AKBORU.onLangChange(reTranslateMessages);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
