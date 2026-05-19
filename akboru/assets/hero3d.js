/* AK BORU PROFIL — Cinematic WebGL 3D hero (Three.js)
   Multi-object steel scene with studio lighting, reflective floor,
   scroll-driven camera dolly, mouse parallax, idle orbit.
*/
(function () {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;

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

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0d10, 0.07);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(0, 0.6, 8.0);
camera.lookAt(0, 0, 0);

// PBR environment
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
scene.environment = envRT.texture;

// ===== Steel profile geometries =====
function rhsGeometry(w, h, depth) {
  const r = 0.08;
  const outer = new THREE.Shape();
  outer.moveTo(-w + r, -h);
  outer.lineTo(w - r, -h);
  outer.quadraticCurveTo(w, -h, w, -h + r);
  outer.lineTo(w, h - r);
  outer.quadraticCurveTo(w, h, w - r, h);
  outer.lineTo(-w + r, h);
  outer.quadraticCurveTo(-w, h, -w, h - r);
  outer.lineTo(-w, -h + r);
  outer.quadraticCurveTo(-w, -h, -w + r, -h);

  const t = 0.16;
  const iw = w - t, ih = h - t, ri = 0.04;
  const inner = new THREE.Path();
  inner.moveTo(-iw + ri, -ih);
  inner.lineTo(iw - ri, -ih);
  inner.quadraticCurveTo(iw, -ih, iw, -ih + ri);
  inner.lineTo(iw, ih - ri);
  inner.quadraticCurveTo(iw, ih, iw - ri, ih);
  inner.lineTo(-iw + ri, ih);
  inner.quadraticCurveTo(-iw, ih, -iw, ih - ri);
  inner.lineTo(-iw, -ih + ri);
  inner.quadraticCurveTo(-iw, -ih, -iw + ri, -ih);
  outer.holes.push(inner);

  const geo = new THREE.ExtrudeGeometry(outer, {
    depth, bevelEnabled: true, bevelSegments: 6, steps: 2,
    bevelSize: 0.04, bevelThickness: 0.04, curveSegments: 16
  });
  geo.center();
  return geo;
}

function chsGeometry(rOuter, rInner, depth) {
  const outer = new THREE.Shape();
  outer.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  outer.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth, bevelEnabled: true, bevelSegments: 4, steps: 1,
    bevelSize: 0.03, bevelThickness: 0.03, curveSegments: 36
  });
  geo.center();
  return geo;
}

const chrome = new THREE.MeshPhysicalMaterial({
  color: 0xd2d4d8, metalness: 1.0, roughness: 0.13,
  clearcoat: 1.0, clearcoatRoughness: 0.05,
  reflectivity: 1.0, envMapIntensity: 1.7
});

const darkSteel = new THREE.MeshPhysicalMaterial({
  color: 0x9a9da4, metalness: 1.0, roughness: 0.32,
  envMapIntensity: 1.2
});

// ===== Main hero piece: large RHS =====
const main = new THREE.Mesh(rhsGeometry(1.55, 0.95, 4.6), chrome);
main.rotation.set(-0.18, 0.55, 0);
main.position.set(0, 0, 0);
scene.add(main);

// ===== Floating satellites =====
const satA = new THREE.Mesh(chsGeometry(0.42, 0.30, 1.6), chrome);
satA.position.set(-2.7, 1.2, -0.6);
satA.rotation.set(0.9, 0.3, 0.4);
scene.add(satA);

const satB = new THREE.Mesh(rhsGeometry(0.45, 0.45, 1.4), darkSteel);
satB.position.set(2.8, -1.2, 0.4);
satB.rotation.set(0.4, -0.8, 0.2);
scene.add(satB);

const satC = new THREE.Mesh(chsGeometry(0.28, 0.18, 1.1), chrome);
satC.position.set(2.4, 1.5, -1.0);
satC.rotation.set(-0.6, 0.5, 0.1);
scene.add(satC);

// ===== Reflective floor =====
const floor = new Reflector(new THREE.PlaneGeometry(40, 40), {
  textureWidth: 1024, textureHeight: 1024, color: 0x0a0c10
});
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.0;
scene.add(floor);
// Slight dark overlay on floor for fade
const floorTint = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshBasicMaterial({ color: 0x0a0d10, transparent: true, opacity: 0.55 })
);
floorTint.rotation.x = -Math.PI / 2;
floorTint.position.y = -1.999;
scene.add(floorTint);

// ===== Studio lights =====
const key  = new THREE.PointLight(0xE8F4FF, 24, 40, 2);  key.position.set(-5, 4, 4); scene.add(key);
const fill = new THREE.PointLight(0xffffff, 10, 30, 2);  fill.position.set(5.5, -1.5, 4); scene.add(fill);
const back = new THREE.PointLight(0xc8d6e0, 18, 36, 2);  back.position.set(0, 3, -6); scene.add(back);

// Volumetric light pillars (subtle backdrop columns)
const pillarGeo = new THREE.CylinderGeometry(0.04, 0.04, 8, 12);
const pillarMat = new THREE.MeshBasicMaterial({ color: 0xE8F4FF, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending });
for (let i = 0; i < 5; i++) {
  const p = new THREE.Mesh(pillarGeo, pillarMat);
  p.position.set(-4 + i * 2, 0, -6 - Math.random() * 2);
  scene.add(p);
}

// ===== Post FX =====
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1,1), 0.55, 0.7, 0.82);
composer.addPass(bloom);

// ===== Sizing =====
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
new ResizeObserver(resize).observe(canvas);

// ===== Interaction =====
let mouseX = 0, mouseY = 0;
let dragging = false, lastX = 0, lastY = 0, dragDX = 0, dragDY = 0;

canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup',   () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX - r.left) / r.width - 0.5;
  mouseY = (e.clientY - r.top)  / r.height - 0.5;
  if (dragging) {
    dragDX += (e.clientX - lastX) * 0.008;
    dragDY += (e.clientY - lastY) * 0.006;
    lastX = e.clientX; lastY = e.clientY;
  }
});

let scrollY = 0;
window.addEventListener('scroll', () => {
  scrollY = window.scrollY / (window.innerHeight || 1);
}, { passive: true });

let running = true;
const io = new IntersectionObserver(([e]) => running = e.isIntersecting, { threshold: 0 });
io.observe(canvas);

const reduce = ${reduceMotion ? 'true' : 'false'};

// ===== Animation loop =====
let t0 = performance.now();
function animate() {
  requestAnimationFrame(animate);
  if (!running) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - t0) / 1000);
  t0 = now;

  const tt = now * 0.001;
  const scrollEase = Math.min(1, scrollY * 0.6);

  // Main piece: float + drag-applied rotation + idle Y rotation
  const idleRotY = reduce ? 0.55 : 0.55 + Math.sin(tt * 0.4) * 0.6 + dragDX;
  const idleRotX = -0.18 + (reduce ? 0 : Math.cos(tt * 0.32) * 0.12) - mouseY * 0.4 - dragDY;
  main.rotation.y += (idleRotY + mouseX * 0.6 - main.rotation.y) * 0.05;
  main.rotation.x += (idleRotX - main.rotation.x) * 0.05;
  if (!reduce) main.position.y = Math.sin(tt * 0.6) * 0.18 - scrollEase * 0.6;

  // Satellites: subtle drift + counter-rotation
  if (!reduce) {
    satA.rotation.y = tt * 0.25;
    satA.rotation.x = Math.sin(tt * 0.4) * 0.4 + 0.6;
    satA.position.y = 1.2 + Math.sin(tt * 0.7) * 0.18;

    satB.rotation.y = -tt * 0.32;
    satB.rotation.x = Math.cos(tt * 0.35) * 0.3 + 0.4;
    satB.position.y = -1.2 + Math.cos(tt * 0.55) * 0.16;

    satC.rotation.y = tt * 0.18;
    satC.rotation.x = -0.6 + Math.sin(tt * 0.5) * 0.3;
    satC.position.y = 1.5 + Math.sin(tt * 0.9) * 0.22;
  }

  // Scroll-driven camera dolly
  const targetCamZ = 8.0 - scrollEase * 2.2;
  const targetCamY = 0.6 + scrollEase * 1.2;
  camera.position.z += (targetCamZ - camera.position.z) * 0.05;
  camera.position.y += (targetCamY - camera.position.y) * 0.05;
  camera.position.x = mouseX * 0.4;
  camera.lookAt(0, scrollEase * 0.4, 0);

  // Slow drift on key light to animate reflections
  if (!reduce) {
    key.position.x = -5 + Math.sin(tt * 0.3) * 1.5;
    key.position.y = 4 + Math.cos(tt * 0.25) * 0.6;
  }

  composer.render();
}
animate();

window.addEventListener('beforeunload', () => {
  renderer.dispose(); envRT.dispose(); pmrem.dispose();
  floor.dispose && floor.dispose();
});
`;
  document.body.appendChild(m);
})();
