/* AK BORU PROFIL — Full-stage cinematic WebGL 3D (Three.js)
   Fullscreen scene behind entire homepage with 8 chrome steel pieces,
   floating chrome particles, auto-orbiting cinematic camera, scroll
   choreography, mouse parallax, idle motion. Drop-in hero3d.js.
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
scene.fog = new THREE.FogExp2(0x080a0d, 0.055);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(0, 1.0, 9.0);
camera.lookAt(0, 0, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.035);
scene.environment = envRT.texture;

// ===== Geometries =====
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
  const geo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSegments: 6, steps: 2, bevelSize: 0.04, bevelThickness: 0.04, curveSegments: 14 });
  geo.center();
  return geo;
}
function chsGeometry(rOuter, rInner, depth) {
  const outer = new THREE.Shape();
  outer.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  outer.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 36 });
  geo.center();
  return geo;
}

// ===== Materials =====
const chrome = new THREE.MeshPhysicalMaterial({
  color: 0xd6d8dc, metalness: 1.0, roughness: 0.14,
  clearcoat: 1.0, clearcoatRoughness: 0.04,
  reflectivity: 1.0, envMapIntensity: 1.8
});
const brushed = new THREE.MeshPhysicalMaterial({
  color: 0xa8acb4, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.3
});
const ice = new THREE.MeshPhysicalMaterial({
  color: 0xE8F4FF, metalness: 0.95, roughness: 0.08,
  clearcoat: 1.0, clearcoatRoughness: 0.02,
  envMapIntensity: 2.0, emissive: 0xE8F4FF, emissiveIntensity: 0.04
});

// ===== Steel composition (8 pieces) =====
const pieces = [];

// Hero piece — largest, central, slow Y rotation
const hero = new THREE.Mesh(rhsGeometry(1.55, 0.95, 4.6), chrome);
hero.position.set(0, 0, 0);
hero.rotation.set(-0.16, 0.55, 0);
scene.add(hero); pieces.push({ m: hero, baseY: 0, ampY: 0.18, sp: 0.4, rotSp: 0.0009, hero: true });

// Cluster of satellites floating around
const s1 = new THREE.Mesh(chsGeometry(0.45, 0.32, 2.0), chrome);
s1.position.set(-3.4, 1.4, -1.0); s1.rotation.set(0.9, 0.3, 0.5);
scene.add(s1); pieces.push({ m: s1, baseY: 1.4, ampY: 0.22, sp: 0.7, rotSp: 0.4 });

const s2 = new THREE.Mesh(rhsGeometry(0.45, 0.45, 1.4), brushed);
s2.position.set(3.2, -1.4, 0.5); s2.rotation.set(0.4, -0.8, 0.2);
scene.add(s2); pieces.push({ m: s2, baseY: -1.4, ampY: 0.18, sp: 0.55, rotSp: -0.38 });

const s3 = new THREE.Mesh(chsGeometry(0.28, 0.18, 1.0), chrome);
s3.position.set(2.9, 1.6, -1.2); s3.rotation.set(-0.6, 0.5, 0.1);
scene.add(s3); pieces.push({ m: s3, baseY: 1.6, ampY: 0.24, sp: 0.9, rotSp: 0.32 });

const s4 = new THREE.Mesh(rhsGeometry(0.4, 0.6, 1.8), chrome);
s4.position.set(-2.6, -1.6, 0.6); s4.rotation.set(0.2, 0.7, -0.2);
scene.add(s4); pieces.push({ m: s4, baseY: -1.6, ampY: 0.2, sp: 0.6, rotSp: -0.28 });

const s5 = new THREE.Mesh(chsGeometry(0.18, 0.10, 0.7), ice);
s5.position.set(-1.6, 2.1, -2.0); s5.rotation.set(0.5, 0.2, 0.0);
scene.add(s5); pieces.push({ m: s5, baseY: 2.1, ampY: 0.16, sp: 1.1, rotSp: 0.6 });

const s6 = new THREE.Mesh(rhsGeometry(0.3, 0.3, 1.0), ice);
s6.position.set(1.8, 2.0, -2.2); s6.rotation.set(0.3, 0.4, -0.3);
scene.add(s6); pieces.push({ m: s6, baseY: 2.0, ampY: 0.18, sp: 0.95, rotSp: -0.45 });

const s7 = new THREE.Mesh(chsGeometry(0.22, 0.14, 0.9), brushed);
s7.position.set(0.0, -2.0, -1.6); s7.rotation.set(-0.4, 0.7, 0.2);
scene.add(s7); pieces.push({ m: s7, baseY: -2.0, ampY: 0.15, sp: 0.75, rotSp: 0.55 });

// ===== Reflective floor =====
const floor = new Reflector(new THREE.PlaneGeometry(60, 60), {
  textureWidth: 1024, textureHeight: 1024, color: 0x080b0e
});
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.5;
scene.add(floor);
const floorTint = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshBasicMaterial({ color: 0x080a0d, transparent: true, opacity: 0.6 })
);
floorTint.rotation.x = -Math.PI / 2;
floorTint.position.y = -2.499;
scene.add(floorTint);

// ===== Floating chrome particles =====
const partCount = 380;
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
const partMat = new THREE.PointsMaterial({
  color: 0xE8F4FF, size: 0.025, transparent: true, opacity: 0.85,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
});
const particles = new THREE.Points(partGeo, partMat);
scene.add(particles);

// ===== Light setup =====
const key  = new THREE.PointLight(0xE8F4FF, 28, 50, 2);  key.position.set(-6, 5, 5); scene.add(key);
const fill = new THREE.PointLight(0xffffff, 12, 38, 2);  fill.position.set(6, -1, 5); scene.add(fill);
const back = new THREE.PointLight(0xc8d6e0, 20, 45, 2);  back.position.set(0, 4, -7); scene.add(back);
const accent = new THREE.PointLight(0xE8F4FF, 8, 22, 2); accent.position.set(0, -3, 6); scene.add(accent);

// Background light pillars
const pillarGeo = new THREE.CylinderGeometry(0.05, 0.05, 14, 12);
const pillarMat = new THREE.MeshBasicMaterial({ color: 0xE8F4FF, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending });
const pillars = [];
for (let i = 0; i < 7; i++) {
  const p = new THREE.Mesh(pillarGeo, pillarMat);
  p.position.set(-7 + i * 2.4, 0, -8 - Math.random() * 3);
  scene.add(p); pillars.push(p);
}

// ===== Post FX =====
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1,1), 0.7, 0.75, 0.8);
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
canvas.addEventListener('pointerup', () => { dragging = false; });
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

const reduce = ${reduceMotion ? 'true' : 'false'};
const camAnchor = new THREE.Vector3(0, 0.6, 9.0);

// ===== Animation loop =====
let t0 = performance.now();
function animate() {
  requestAnimationFrame(animate);
  if (!running) return;
  const now = performance.now();
  t0 = now;
  const tt = now * 0.001;
  const sc = Math.min(2.5, scrollY);

  // Hero piece
  hero.rotation.y += (0.55 + Math.sin(tt * 0.35) * 0.7 + dragDX + mouseX * 0.5 - hero.rotation.y) * 0.04;
  hero.rotation.x += (-0.16 + Math.cos(tt * 0.28) * 0.12 - mouseY * 0.3 - dragDY - hero.rotation.x) * 0.04;
  if (!reduce) hero.position.y = Math.sin(tt * 0.55) * 0.2 - sc * 0.4;

  // Satellites
  if (!reduce) {
    for (let i = 1; i < pieces.length; i++) {
      const p = pieces[i];
      p.m.rotation.y = tt * p.rotSp;
      p.m.rotation.x = Math.sin(tt * (p.sp * 0.7)) * 0.4 + 0.3;
      p.m.position.y = p.baseY + Math.sin(tt * p.sp) * p.ampY - sc * 0.3;
    }
  }

  // Particles drift
  if (!reduce) {
    const pos = particles.geometry.attributes.position.array;
    for (let i = 0; i < partCount; i++) {
      pos[i*3+0] += partVel[i*3+0];
      pos[i*3+1] += partVel[i*3+1];
      pos[i*3+2] += partVel[i*3+2];
      // Recycle when out of bounds
      if (pos[i*3+1] > 6) {
        pos[i*3+0] = (Math.random() - 0.5) * 22;
        pos[i*3+1] = -5;
        pos[i*3+2] = (Math.random() - 0.5) * 18 - 2;
      }
      if (pos[i*3+0] > 12 || pos[i*3+0] < -12) partVel[i*3+0] *= -1;
    }
    particles.geometry.attributes.position.needsUpdate = true;
    particles.rotation.y = tt * 0.02;
  }

  // Camera orbit + scroll dolly
  const orbit = reduce ? 0 : Math.sin(tt * 0.12) * 0.4;
  const targetX = orbit + mouseX * 0.6;
  const targetY = camAnchor.y + (reduce ? 0 : Math.sin(tt * 0.18) * 0.18) + sc * 1.4 - mouseY * 0.3;
  const targetZ = camAnchor.z - sc * 2.6;
  camera.position.x += (targetX - camera.position.x) * 0.03;
  camera.position.y += (targetY - camera.position.y) * 0.04;
  camera.position.z += (targetZ - camera.position.z) * 0.04;
  camera.lookAt(0, sc * 0.6, 0);

  // Light drift for live reflections
  if (!reduce) {
    key.position.x = -6 + Math.sin(tt * 0.3) * 2.0;
    key.position.y = 5 + Math.cos(tt * 0.25) * 0.8;
    back.position.x = Math.cos(tt * 0.22) * 3;
  }

  composer.render();
}
animate();
`;
  document.body.appendChild(m);
})();
