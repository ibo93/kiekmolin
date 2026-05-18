/* AK BORU PROFIL — Leaflet map initializer
   Renders any [data-akb-map] element as a dark-themed interactive map
   pinned to the Akçataş OSB facility, with a custom radar-pulse marker.
*/
(function () {
  // Approximate coordinates for Akçataş OSB, Viranşehir / Şanlıurfa, Türkiye.
  // The official address pin via Google Maps button always wins for routing.
  const FACILITY = { lat: 37.236, lng: 39.770 };
  const GMAPS = "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Akçataş OSB 10. Cad No 5/1 Viranşehir Şanlıurfa");

  function injectLeafletCss() {
    if (document.querySelector('link[data-leaflet]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    link.setAttribute("data-leaflet", "1");
    document.head.appendChild(link);
  }

  function loadLeaflet() {
    return new Promise((resolve, reject) => {
      if (window.L) return resolve(window.L);
      injectLeafletCss();
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      s.crossOrigin = "";
      s.onload = () => resolve(window.L);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function buildMap(el) {
    const L = window.L;
    el.classList.add("is-locked"); // disable interaction until user opts in
    const height = el.getAttribute("data-akb-height") || "420px";
    el.style.height = height;

    const map = L.map(el, {
      center: [FACILITY.lat, FACILITY.lng],
      zoom: el.dataset.akbZoom ? +el.dataset.akbZoom : 13,
      zoomControl: true,
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      tap: false,
      attributionControl: false
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd"
    }).addTo(map);

    const pulseIcon = L.divIcon({
      className: "akb-pulse-icon",
      html: `<div class="akb-pulse"><span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="core"></span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const lang = (window.AKBORU && window.AKBORU.getLang && window.AKBORU.getLang()) || "en";
    const t = (k) => window.AKBORU ? window.AKBORU.translate(k, lang) : k;

    const marker = L.marker([FACILITY.lat, FACILITY.lng], { icon: pulseIcon }).addTo(map);

    function rebindPopup() {
      const cur = (window.AKBORU && window.AKBORU.getLang && window.AKBORU.getLang()) || "en";
      const tr = (k) => window.AKBORU ? window.AKBORU.translate(k, cur) : k;
      marker.bindPopup(
        `<div class="pop-title">AK BORU PROFIL</div>` +
        `<div>${tr("contact.info.hqVal").replace(/\n/g, "<br>")}</div>` +
        `<a href="${GMAPS}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;color:#E8F4FF;text-decoration:none;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">→ ${tr("map.openMaps")}</a>`
      );
    }
    rebindPopup();

    if (window.AKBORU && window.AKBORU.onLangChange) {
      window.AKBORU.onLangChange(() => {
        rebindPopup();
        if (marker.isPopupOpen()) marker.openPopup();
        const cover = el.parentElement && el.parentElement.querySelector(".akb-map-cover .cover-label");
        if (cover) cover.textContent = t("map.zoom");
      });
    }

    // Attribution chip (custom)
    const wrap = el.parentElement;
    if (wrap) {
      const attrib = document.createElement("div");
      attrib.className = "akb-map-attrib";
      attrib.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a> · <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
      wrap.appendChild(attrib);

      const cover = document.createElement("div");
      cover.className = "akb-map-cover";
      cover.innerHTML = `<div class="cover-chip">
        <span class="material-symbols-outlined" style="font-size:16px;">touch_app</span>
        <span class="cover-label" data-i18n="map.zoom">${t("map.zoom")}</span>
      </div>`;
      cover.addEventListener("click", () => {
        cover.hidden = true;
        el.classList.remove("is-locked");
        map.scrollWheelZoom.enable();
        if (L.Browser.mobile) map.dragging.enable();
        map.invalidateSize();
        marker.openPopup();
      }, { once: true });
      wrap.appendChild(cover);
    } else {
      el.classList.remove("is-locked");
      map.scrollWheelZoom.enable();
    }
  }

  function init() {
    const targets = document.querySelectorAll("[data-akb-map]");
    if (!targets.length) return;
    loadLeaflet().then(() => {
      targets.forEach(buildMap);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
