/* AK BORU PROFIL — WebGL 3D hero (Three.js)
   Photoreal chrome rectangular hollow section with PMREM environment,
   physically-based clearcoat material, mouse parallax + idle float.
*/
(function () {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;

  // Skip on devices that explicitly opt-out of motion
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const importmap = document.createElement('script');
  importmap.type = 'importmap';
  importmap.textContent = JSON.stringify({
    imports: {
      'three': 'https://unpkg.com/three@0.160.0/build/three.module.js',
      'three/addons/': 'https://unpkg.com/three@0.160.0/examples/jsm/'
    }
  });
  document.head.appendChild(importmap);

  const loader = document.createElement('script');
  loader.type = 'module';
  loader.textContent = `
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('hero3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(0, 0, 7.2);

// HDRI-like environment from procedural room
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.035);
scene.environment = env.texture;

// Build a hollow rectangular section (RHS)
function buildTube() {
  const w = 1.55, h = 0.95, r = 0.09;
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

  const t = 0.18, ri = 0.05;
  const inner = new THREE.Path();
  const iw = w - t, ih = h - t;
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
    depth: 4.4,
    bevelEnabled: true,
    bevelSegments: 8,
    steps: 2,
    bevelSize: 0.05,
    bevelThickness: 0.05,
    curveSegments: 18
  });
  geo.center();

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xcacccf,
    metalness: 1.0,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    reflectivity: 1.0,
    envMapIntensity: 1.55
  });
  return new THREE.Mesh(geo, mat);
}

const tube = buildTube();
tube.rotation.set(-0.18, 0.55, 0);
scene.add(tube);

// Subtle ice-blue rim light
const rim = new THREE.PointLight(0xE8F4FF, 14, 32, 2);
rim.position.set(-4.5, 3.2, 4.5);
scene.add(rim);
const fill = new THREE.PointLight(0xffffff, 6, 28, 2);
fill.position.set(5.5, -2.0, 3.5);
scene.add(fill);
const back = new THREE.PointLight(0xc8c6c7, 4, 30, 2);
back.position.set(0, 0, -5);
scene.add(back);

// Post-processing: subtle bloom on chrome highlights
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.6, 0.85);
composer.addPass(bloom);

// Sizing
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
new ResizeObserver(resize).observe(canvas);

// Interaction: mouse parallax + pointer drag to rotate
let targetRotY = 0.55, targetRotX = -0.18;
let dragging = false, lastX = 0, lastY = 0;
const reduce = ${reduce ? 'true' : 'false'};

canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup',   () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (dragging) {
    targetRotY += (e.clientX - lastX) * 0.006;
    targetRotX += (e.clientY - lastY) * 0.005;
    lastX = e.clientX; lastY = e.clientY;
  } else {
    const r = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top)  / r.height - 0.5;
    targetRotY = 0.55 + nx * 0.6;
    targetRotX = -0.18 - ny * 0.35;
  }
});

let t = 0, running = true;
const io = new IntersectionObserver(([e]) => running = e.isIntersecting, { threshold: 0 });
io.observe(canvas);

function animate() {
  requestAnimationFrame(animate);
  if (!running) return;
  if (!reduce) t += 0.0085;
  // Smooth interpolation
  tube.rotation.y += (targetRotY - tube.rotation.y) * 0.06;
  tube.rotation.x += (targetRotX - tube.rotation.x) * 0.06;
  if (!dragging && !reduce) {
    tube.rotation.y += Math.sin(t * 0.55) * 0.0009;
    tube.position.y = Math.sin(t * 0.6) * 0.18;
    tube.position.x = Math.cos(t * 0.4) * 0.07;
  }
  composer.render();
}
animate();

window.addEventListener('beforeunload', () => { renderer.dispose(); env.dispose(); pmrem.dispose(); });
`;
  document.body.appendChild(loader);
})();
