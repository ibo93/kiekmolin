/* AK BORU PROFIL — Full-stage cinematic WebGL 3D (Three.js)
   Fullscreen scene behind entire homepage with 8 chrome steel pieces,
   floating chrome particles, auto-orbiting cinematic camera, scroll
   choreography, mouse parallax, idle motion.
   - Loading fade-in
   - Mobile: reduced particle count + DPR cap
   - Fallback: graceful static background if WebGL unavailable
*/
(function () {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;

  // Detect WebGL availability
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  if (!hasWebGL()) {
    canvas.style.background = 'radial-gradient(ellipse at center, #1a1c20 0%, #08090b 70%), url(https://images.unsplash.com/photo-1565793298595-6a879b1d9492?q=80&w=1600&auto=format&fit=crop) center/cover';
    canvas.style.opacity = '0.5';
    return;
  }

  // Hide canvas until first render
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 0.9s ease-out';

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower = isMobile || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  if (!document.querySelector('script[type="importmap"]')) {
    const im = document.createElement('script');
    im.type = 'importmap';
    im.textContent = JSON.stringify({
      imports: {
        'three': 'https://unpkg.com/three@0.160.0/build/three.module.js',
        'three/addons/': 'https://unpkg.com/three@0.160.0/examples/jsm/'
      }
    });
    document.head.appendChild(im);
  }

  const m = document.createElement('script');
  m.type = 'module';
  m.textContent = `
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const canvas = document.getElementById('hero3d');
const reduce = ${reduceMotion ? 'true' : 'false'};
const lowPower = ${lowPower ? 'true' : 'false'};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  canvas.style.background = 'radial-gradient(ellipse at center, #1a1c20 0%, #08090b 70%)';
  canvas.style.opacity = '0.5';
  console.warn('WebGL init failed', e);
  return;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080a0d, 0.055);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(0, 1.0, 9.0);
camera.lookAt(0, 0, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.035);
scene.environment = envRT.texture;

function rhsGeometry(w, h, depth) {
  const r = 0.08;
  const outer = new THREE.Shape();
  outer.moveTo(-w + r, -h);
  outer.lineTo(w - r, -h); outer.quadraticCurveTo(w, -h, w, -h + r);
  outer.lineTo(w, h - r);  outer.quadraticCurveTo(w, h, w - r, h);
  outer.lineTo(-w + r, h); outer.quadraticCurveTo(-w, h, -w, h - r);
  outer.lineTo(-w, -h + r); outer.quadraticCurveTo(-w, -h, -w + r, -h);
  const t = 0.16, iw = w - t, ih = h - t, ri = 0.04;
  const inner = new THREE.Path();
  inner.moveTo(-iw + ri, -ih);
  inner.lineTo(iw - ri, -ih); inner.quadraticCurveTo(iw, -ih, iw, -ih + ri);
  inner.lineTo(iw, ih - ri);  inner.quadraticCurveTo(iw, ih, iw - ri, ih);
  inner.lineTo(-iw + ri, ih); inner.quadraticCurveTo(-iw, ih, -iw, ih - ri);
  inner.lineTo(-iw, -ih + ri); inner.quadraticCurveTo(-iw, -ih, -iw + ri, -ih);
  outer.holes.push(inner);
  const segs = lowPower ? 8 : 14;
  const geo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSegments: lowPower ? 3 : 6, steps: 2, bevelSize: 0.04, bevelThickness: 0.04, curveSegments: segs });
  geo.center();
  return geo;
}
function chsGeometry(rOuter, rInner, depth) {
  const outer = new THREE.Shape();
  outer.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  outer.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSegments: lowPower ? 2 : 4, steps: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: lowPower ? 20 : 36 });
  geo.center();
  return geo;
}

const chrome = new THREE.MeshPhysicalMaterial({ color: 0xd6d8dc, metalness: 1.0, roughness: 0.14, clearcoat: 1.0, clearcoatRoughness: 0.04, reflectivity: 1.0, envMapIntensity: 1.8 });
const brushed = new THREE.MeshPhysicalMaterial({ color: 0xa8acb4, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.3 });
const ice = new THREE.MeshPhysicalMaterial({ color: 0xE8F4FF, metalness: 0.95, roughness: 0.08, clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 2.0, emissive: 0xE8F4FF, emissiveIntensity: 0.04 });

const pieces = [];
const hero = new THREE.Mesh(rhsGeometry(1.55, 0.95, 4.6), chrome);
hero.position.set(0, 0, 0); hero.rotation.set(-0.16, 0.55, 0);
scene.add(hero); pieces.push({ m: hero, baseY: 0, ampY: 0.18, sp: 0.4, rotSp: 0.0009, hero: true });

const satelliteSpecs = [
  { g: () => chsGeometry(0.45, 0.32, 2.0), mat: chrome, pos: [-3.4, 1.4, -1.0], rot: [0.9, 0.3, 0.5], baseY: 1.4, sp: 0.7, rotSp: 0.4 },
  { g: () => rhsGeometry(0.45, 0.45, 1.4), mat: brushed, pos: [3.2, -1.4, 0.5], rot: [0.4, -0.8, 0.2], baseY: -1.4, sp: 0.55, rotSp: -0.38 },
  { g: () => chsGeometry(0.28, 0.18, 1.0), mat: chrome, pos: [2.9, 1.6, -1.2], rot: [-0.6, 0.5, 0.1], baseY: 1.6, sp: 0.9, rotSp: 0.32 },
  { g: () => rhsGeometry(0.4, 0.6, 1.8), mat: chrome, pos: [-2.6, -1.6, 0.6], rot: [0.2, 0.7, -0.2], baseY: -1.6, sp: 0.6, rotSp: -0.28 },
  { g: () => chsGeometry(0.18, 0.10, 0.7), mat: ice, pos: [-1.6, 2.1, -2.0], rot: [0.5, 0.2, 0.0], baseY: 2.1, sp: 1.1, rotSp: 0.6 },
  { g: () => rhsGeometry(0.3, 0.3, 1.0), mat: ice, pos: [1.8, 2.0, -2.2], rot: [0.3, 0.4, -0.3], baseY: 2.0, sp: 0.95, rotSp: -0.45 },
  { g: () => chsGeometry(0.22, 0.14, 0.9), mat: brushed, pos: [0.0, -2.0, -1.6], rot: [-0.4, 0.7, 0.2], baseY: -2.0, sp: 0.75, rotSp: 0.55 }
];
const satCount = lowPower ? 4 : satelliteSpecs.length;
for (let i = 0; i < satCount; i++) {
  const s = satelliteSpecs[i];
  const mesh = new THREE.Mesh(s.g(), s.mat);
  mesh.position.set.apply(mesh.position, s.pos);
  mesh.rotation.set.apply(mesh.rotation, s.rot);
  scene.add(mesh);
  pieces.push({ m: mesh, baseY: s.baseY, ampY: 0.18, sp: s.sp, rotSp: s.rotSp });
}

// Reflective floor (skip on low-power)
if (!lowPower) {
  const floor = new Reflector(new THREE.PlaneGeometry(60, 60), { textureWidth: 1024, textureHeight: 1024, color: 0x080b0e });
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.5; scene.add(floor);
  const floorTint = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x080a0d, transparent: true, opacity: 0.6 }));
  floorTint.rotation.x = -Math.PI / 2; floorTint.position.y = -2.499; scene.add(floorTint);
}

// Particles
const partCount = lowPower ? 120 : 380;
const partGeo = new THREE.BufferGeometry();
const partPositions = new Float32Array(partCount * 3);
const partVel = new Float32Array(partCount * 3);
for (let i = 0; i < partCount; i++) {
  partPositions[i*3+0] = (Math.random() - 0.5) * 22;
  partPositions[i*3+1] = (Math.random() - 0.5) * 10;
  partPositions[i*3+2] = (Math.random() - 0.5) * 18 - 2;
  partVel[i*3+0] = (Math.random() - 0.5) * 0.04;
  partVel[i*3+1] = (Math.random() * 0.04 + 0.005);
  partVel[i*3+2] = (Math.random() - 0.5) * 0.03;
}
partGeo.setAttribute('position', new THREE.BufferAttribute(partPositions, 3));
const particles = new THREE.Points(partGeo, new THREE.PointsMaterial({ color: 0xE8F4FF, size: 0.025, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
scene.add(particles);

// Lights
const key  = new THREE.PointLight(0xE8F4FF, 28, 50, 2);  key.position.set(-6, 5, 5); scene.add(key);
const fill = new THREE.PointLight(0xffffff, 12, 38, 2);  fill.position.set(6, -1, 5); scene.add(fill);
const back = new THREE.PointLight(0xc8d6e0, 20, 45, 2);  back.position.set(0, 4, -7); scene.add(back);
const accent = new THREE.PointLight(0xE8F4FF, 8, 22, 2); accent.position.set(0, -3, 6); scene.add(accent);

// Composer
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1,1), lowPower ? 0.4 : 0.7, 0.75, 0.8);
composer.addPass(bloom);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
new ResizeObserver(resize).observe(canvas);

let mouseX = 0, mouseY = 0;
let dragging = false, lastX = 0, lastY = 0, dragDX = 0, dragDY = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup',   () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  mouseX = (e.clientX / window.innerWidth) - 0.5;
  mouseY = (e.clientY / window.innerHeight) - 0.5;
  if (dragging) {
    dragDX += (e.clientX - lastX) * 0.008;
    dragDY += (e.clientY - lastY) * 0.006;
    lastX = e.clientX; lastY = e.clientY;
  }
});

let scrollY = 0;
window.addEventListener('scroll', () => { scrollY = window.scrollY / (window.innerHeight || 1); }, { passive: true });

let running = true;
document.addEventListener('visibilitychange', () => { running = !document.hidden; });

let firstRender = true;
function animate() {
  requestAnimationFrame(animate);
  if (!running) return;
  const tt = performance.now() * 0.001;
  const sc = Math.min(2.5, scrollY);

  hero.rotation.y += (0.55 + Math.sin(tt * 0.35) * 0.7 + dragDX + mouseX * 0.5 - hero.rotation.y) * 0.04;
  hero.rotation.x += (-0.16 + Math.cos(tt * 0.28) * 0.12 - mouseY * 0.3 - dragDY - hero.rotation.x) * 0.04;
  if (!reduce) hero.position.y = Math.sin(tt * 0.55) * 0.2 - sc * 0.4;

  if (!reduce) {
    for (let i = 1; i < pieces.length; i++) {
      const p = pieces[i];
      p.m.rotation.y = tt * p.rotSp;
      p.m.rotation.x = Math.sin(tt * (p.sp * 0.7)) * 0.4 + 0.3;
      p.m.position.y = p.baseY + Math.sin(tt * p.sp) * p.ampY - sc * 0.3;
    }
    const pos = particles.geometry.attributes.position.array;
    for (let i = 0; i < partCount; i++) {
      pos[i*3+0] += partVel[i*3+0];
      pos[i*3+1] += partVel[i*3+1];
      pos[i*3+2] += partVel[i*3+2];
      if (pos[i*3+1] > 6) { pos[i*3+0] = (Math.random() - 0.5) * 22; pos[i*3+1] = -5; pos[i*3+2] = (Math.random() - 0.5) * 18 - 2; }
      if (pos[i*3+0] > 12 || pos[i*3+0] < -12) partVel[i*3+0] *= -1;
    }
    particles.geometry.attributes.position.needsUpdate = true;
    particles.rotation.y = tt * 0.02;
  }

  const orbit = reduce ? 0 : Math.sin(tt * 0.12) * 0.4;
  const targetX = orbit + mouseX * 0.6;
  const targetY = 0.6 + (reduce ? 0 : Math.sin(tt * 0.18) * 0.18) + sc * 1.4 - mouseY * 0.3;
  const targetZ = 9.0 - sc * 2.6;
  camera.position.x += (targetX - camera.position.x) * 0.03;
  camera.position.y += (targetY - camera.position.y) * 0.04;
  camera.position.z += (targetZ - camera.position.z) * 0.04;
  camera.lookAt(0, sc * 0.6, 0);

  if (!reduce) {
    key.position.x = -6 + Math.sin(tt * 0.3) * 2.0;
    key.position.y = 5 + Math.cos(tt * 0.25) * 0.8;
    back.position.x = Math.cos(tt * 0.22) * 3;
  }

  composer.render();

  if (firstRender) {
    firstRender = false;
    requestAnimationFrame(() => { canvas.style.opacity = '1'; });
  }
}
animate();
`;
  document.body.appendChild(m);
})();
