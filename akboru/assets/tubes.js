/* AK BORU PROFIL — 3D steel renderings
   Injects photoreal-style SVG renders into [data-tube3d="rhs|chs|shs|hero"]
   placeholders. Each instance has unique gradient IDs so multiple can coexist.
*/
(function () {
  let uid = 0;
  const nid = () => "tg" + (++uid);

  function rhsTube(id) {
    return `
<svg class="tube-3d" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="${id}-top" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="#fafbff"/>
      <stop offset="35%" stop-color="#b0b4c2"/>
      <stop offset="70%" stop-color="#5e6270"/>
      <stop offset="100%" stop-color="#15171c"/>
    </linearGradient>
    <linearGradient id="${id}-front" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#2c2f3a"/>
      <stop offset="8%"   stop-color="#a0a4b0"/>
      <stop offset="20%"  stop-color="#ecedf1"/>
      <stop offset="34%"  stop-color="#9ea1ac"/>
      <stop offset="50%"  stop-color="#5a5d68"/>
      <stop offset="68%"  stop-color="#3a3d48"/>
      <stop offset="85%"  stop-color="#878a95"/>
      <stop offset="100%" stop-color="#1c1e26"/>
    </linearGradient>
    <linearGradient id="${id}-right" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#6a6d78"/>
      <stop offset="55%"  stop-color="#2a2d38"/>
      <stop offset="100%" stop-color="#0a0d18"/>
    </linearGradient>
    <radialGradient id="${id}-cavity" cx="40%" cy="35%" r="80%">
      <stop offset="0%"   stop-color="#1a1c24" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="${id}-band" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%"  stop-color="#E8F4FF" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Outer box: three visible faces in 3/4 view -->
  <polygon points="120,200 470,200 530,120 180,120" fill="url(#${id}-top)"   stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5"/>
  <polygon points="470,200 530,120 530,500 470,560" fill="url(#${id}-right)" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5"/>
  <rect    x="120" y="200" width="350" height="360" fill="url(#${id}-front)" stroke="#ffffff" stroke-opacity="0.4"  stroke-width="1.5"/>

  <!-- Inner cavity (hollow rectangular tube) -->
  <polygon points="170,250 420,250 470,170 220,170" fill="#000000" opacity="0.96"/>
  <polygon points="420,250 470,170 470,490 420,510" fill="url(#${id}-cavity)"/>
  <rect    x="170" y="250" width="250" height="260" fill="url(#${id}-cavity)" opacity="0.96"/>
  <polyline points="170,250 420,250 420,510" fill="none" stroke="#7a7d88" stroke-opacity="0.35" stroke-width="0.8"/>

  <!-- Edge highlights -->
  <line x1="120" y1="200" x2="470" y2="200" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.5"/>
  <line x1="470" y1="200" x2="530" y2="120" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1.5"/>
  <line x1="180" y1="120" x2="530" y2="120" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>

  <!-- Animated light sweep -->
  <rect class="light-sweep" x="120" y="200" width="50" height="360" fill="url(#${id}-band)" opacity="0.6"/>

  <!-- Technical markings -->
  <g fill="none" stroke="rgba(232,244,255,0.35)" stroke-width="0.6">
    <line x1="100" y1="200" x2="60" y2="200"/>
    <line x1="100" y1="560" x2="60" y2="560"/>
    <line x1="60"  y1="200" x2="60" y2="560"/>
  </g>
  <text x="40" y="385" font-family="JetBrains Mono, monospace" font-size="11" fill="rgba(232,244,255,0.5)" letter-spacing="2" transform="rotate(-90 40 385)">RHS · EN 10219</text>
</svg>`;
  }

  function shsTube(id) {
    return `
<svg class="tube-3d" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="${id}-top" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="#fafbff"/>
      <stop offset="40%" stop-color="#a8acba"/>
      <stop offset="100%" stop-color="#1a1c24"/>
    </linearGradient>
    <linearGradient id="${id}-front" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#2c2f3a"/>
      <stop offset="12%"  stop-color="#ecedf1"/>
      <stop offset="32%"  stop-color="#9ea1ac"/>
      <stop offset="55%"  stop-color="#4a4d58"/>
      <stop offset="80%"  stop-color="#878a95"/>
      <stop offset="100%" stop-color="#1c1e26"/>
    </linearGradient>
    <linearGradient id="${id}-right" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#5a5d68"/>
      <stop offset="100%" stop-color="#0a0d18"/>
    </linearGradient>
    <radialGradient id="${id}-cavity" cx="40%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#1a1c24"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="${id}-band" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"  stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#E8F4FF" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <polygon points="150,180 450,180 510,100 210,100" fill="url(#${id}-top)"   stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5"/>
  <polygon points="450,180 510,100 510,480 450,540" fill="url(#${id}-right)" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5"/>
  <rect    x="150" y="180" width="300" height="360" fill="url(#${id}-front)" stroke="#ffffff" stroke-opacity="0.4"  stroke-width="1.5"/>

  <polygon points="200,230 400,230 450,150 250,150" fill="#000000"/>
  <polygon points="400,230 450,150 450,470 400,490" fill="url(#${id}-cavity)"/>
  <rect    x="200" y="230" width="200" height="260" fill="url(#${id}-cavity)"/>

  <rect class="light-sweep" x="150" y="180" width="45" height="360" fill="url(#${id}-band)" opacity="0.6"/>
  <text x="60" y="370" font-family="JetBrains Mono, monospace" font-size="11" fill="rgba(232,244,255,0.5)" letter-spacing="2" transform="rotate(-90 60 370)">SHS · EN 10219</text>
</svg>`;
  }

  function chsTube(id) {
    return `
<svg class="tube-3d" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <radialGradient id="${id}-outer" cx="35%" cy="35%" r="80%">
      <stop offset="0%"  stop-color="#fafbff"/>
      <stop offset="25%" stop-color="#d4d7de"/>
      <stop offset="55%" stop-color="#7a7d88"/>
      <stop offset="85%" stop-color="#2a2d38"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <radialGradient id="${id}-rim" cx="50%" cy="40%" r="65%">
      <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="40%" stop-color="#e8eaf0" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-cavity" cx="50%" cy="35%" r="70%">
      <stop offset="0%"  stop-color="#15171c"/>
      <stop offset="60%" stop-color="#05060a"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="${id}-body" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"  stop-color="#1a1c24"/>
      <stop offset="10%" stop-color="#a0a4b0"/>
      <stop offset="25%" stop-color="#e8eaf0"/>
      <stop offset="50%" stop-color="#5a5d68"/>
      <stop offset="80%" stop-color="#7a7d88"/>
      <stop offset="100%" stop-color="#0a0d18"/>
    </linearGradient>
    <linearGradient id="${id}-band" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"  stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#E8F4FF" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Tube body (long cylinder, slight 3/4 view) -->
  <ellipse cx="300" cy="200" rx="180" ry="46" fill="url(#${id}-outer)" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.5"/>
  <rect x="120" y="200" width="360" height="280" fill="url(#${id}-body)"/>
  <ellipse cx="300" cy="480" rx="180" ry="46" fill="url(#${id}-outer)" opacity="0.7"/>

  <!-- Inner cavity (hole) -->
  <ellipse cx="300" cy="200" rx="120" ry="30" fill="url(#${id}-cavity)"/>
  <ellipse cx="300" cy="200" rx="120" ry="30" fill="none" stroke="rgba(232,244,255,0.15)" stroke-width="0.8"/>

  <!-- Rim highlight (top opening edge) -->
  <ellipse cx="300" cy="195" rx="178" ry="44" fill="none" stroke="url(#${id}-rim)" stroke-width="2"/>

  <!-- Side highlights -->
  <line x1="125" y1="200" x2="125" y2="480" stroke="#E8F4FF" stroke-opacity="0.3" stroke-width="1.5"/>
  <line x1="475" y1="200" x2="475" y2="480" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/>

  <!-- Light sweep -->
  <rect class="light-sweep" x="120" y="200" width="50" height="280" fill="url(#${id}-band)" opacity="0.55"/>

  <text x="55" y="350" font-family="JetBrains Mono, monospace" font-size="11" fill="rgba(232,244,255,0.5)" letter-spacing="2" transform="rotate(-90 55 350)">CHS · Ø323.9 mm</text>
</svg>`;
  }

  function heroTube(id) {
    // Larger, more dramatic hero tube — combines a rectangular hollow section + technical overlay
    return `
<svg class="tube-3d" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="${id}-top" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="#ffffff"/>
      <stop offset="25%" stop-color="#c8ccda"/>
      <stop offset="60%" stop-color="#5a5d68"/>
      <stop offset="100%" stop-color="#0a0d18"/>
    </linearGradient>
    <linearGradient id="${id}-front" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#1c1e26"/>
      <stop offset="6%"   stop-color="#878a95"/>
      <stop offset="16%"  stop-color="#f5f7fc"/>
      <stop offset="28%"  stop-color="#aab0bc"/>
      <stop offset="42%"  stop-color="#4a4d58"/>
      <stop offset="58%"  stop-color="#2a2d38"/>
      <stop offset="75%"  stop-color="#5a5d68"/>
      <stop offset="88%"  stop-color="#aab0bc"/>
      <stop offset="100%" stop-color="#0a0d18"/>
    </linearGradient>
    <linearGradient id="${id}-right" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#7a7d88"/>
      <stop offset="60%"  stop-color="#1a1d28"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <radialGradient id="${id}-cavity" cx="35%" cy="30%" r="85%">
      <stop offset="0%"   stop-color="#202329" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="${id}-band" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"  stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#E8F4FF" stop-opacity="1"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <!-- Ambient glow under tube -->
  <ellipse cx="400" cy="540" rx="280" ry="22" fill="#E8F4FF" opacity="0.08" filter="url(#${id}-glow)"/>

  <!-- Tube faces -->
  <polygon points="180,210 540,210 620,110 260,110" fill="url(#${id}-top)"   stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>
  <polygon points="540,210 620,110 620,510 540,560" fill="url(#${id}-right)" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
  <rect    x="180" y="210" width="360" height="350" fill="url(#${id}-front)" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2"/>

  <!-- Inner cavity -->
  <polygon points="230,260 490,260 550,160 290,160" fill="#000000" opacity="0.97"/>
  <polygon points="490,260 550,160 550,490 490,510" fill="url(#${id}-cavity)"/>
  <rect    x="230" y="260" width="260" height="250" fill="url(#${id}-cavity)" opacity="0.97"/>

  <!-- Inner edge thin highlights -->
  <polyline points="230,260 490,260 490,510" fill="none" stroke="#7a7d88" stroke-opacity="0.55" stroke-width="1"/>
  <polyline points="490,260 550,160" fill="none" stroke="#5a5d68" stroke-opacity="0.4" stroke-width="0.8"/>

  <!-- Outer rim highlights -->
  <line x1="180" y1="210" x2="540" y2="210" stroke="#ffffff" stroke-opacity="0.65" stroke-width="2"/>
  <line x1="540" y1="210" x2="620" y2="110" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1.5"/>
  <line x1="260" y1="110" x2="620" y2="110" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1.2"/>

  <!-- Animated light sweep -->
  <rect class="light-sweep" x="180" y="210" width="60" height="350" fill="url(#${id}-band)" opacity="0.55"/>

  <!-- Technical markings -->
  <g fill="none" stroke="rgba(232,244,255,0.4)" stroke-width="0.7">
    <line x1="180" y1="580" x2="540" y2="580"/>
    <line x1="180" y1="580" x2="180" y2="600"/>
    <line x1="540" y1="580" x2="540" y2="600"/>
  </g>
  <text x="360" y="598" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" fill="rgba(232,244,255,0.6)" letter-spacing="3">400 × 300 mm</text>
  <g fill="none" stroke="rgba(232,244,255,0.4)" stroke-width="0.7">
    <line x1="640" y1="210" x2="660" y2="210"/>
    <line x1="640" y1="510" x2="660" y2="510"/>
    <line x1="660" y1="210" x2="660" y2="510"/>
  </g>
  <text x="690" y="365" font-family="JetBrains Mono, monospace" font-size="11" fill="rgba(232,244,255,0.6)" letter-spacing="3" transform="rotate(-90 690 365)">±0.05 mm</text>
</svg>`;
  }

  const renderers = { rhs: rhsTube, shs: shsTube, chs: chsTube, hero: heroTube };

  function render() {
    document.querySelectorAll("[data-tube3d]").forEach((slot) => {
      if (slot.dataset.tube3dRendered === "1") return;
      const kind = slot.getAttribute("data-tube3d");
      const fn = renderers[kind];
      if (!fn) return;
      slot.innerHTML = fn(nid());
      slot.dataset.tube3dRendered = "1";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
