/* ============================================================
   AK BORU PROFIL — 3D Hero
   Cold-formed RECTANGULAR hollow section (RHS)
   Finish: lightly polished steel · Movement: calm & precise
   ============================================================ */
(function(){
  const canvas = document.getElementById('hero3d');
  if(!canvas) return;
  if(!window.THREE){ canvas.style.display='none'; return; }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try{
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'});
  }catch(err){ canvas.style.display='none'; return; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, innerWidth/innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7.6);

  function resize(){
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);

  /* Procedural environment — gives polished steel believable reflections */
  try{
    const c = document.createElement('canvas'); c.width=16; c.height=128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0,0,0,128);
    grad.addColorStop(0,'#454e52'); grad.addColorStop(.42,'#1b1f21');
    grad.addColorStop(.58,'#0b0d0e'); grad.addColorStop(1,'#02060a');
    g.fillStyle=grad; g.fillRect(0,0,16,128);
    // a faint cool band = window-like highlight for the polish to catch
    g.fillStyle='rgba(207,227,242,.5)'; g.fillRect(0,40,16,5);
    const envTex = new THREE.CanvasTexture(c); envTex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    envTex.dispose();
  }catch(e){ /* lights still carry it */ }

  /* Rounded-rectangle path helper */
  function roundedRect(s, w, h, r){
    const x=-w/2, y=-h/2;
    s.moveTo(x+r, y);
    s.lineTo(x+w-r, y); s.quadraticCurveTo(x+w, y, x+w, y+r);
    s.lineTo(x+w, y+h-r); s.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    s.lineTo(x+r, y+h); s.quadraticCurveTo(x, y+h, x, y+h-r);
    s.lineTo(x, y+r); s.quadraticCurveTo(x, y, x+r, y);
  }

  /* RHS cross-section: rectangular (W != H) hollow profile */
  const W=2.2, H=1.65, T=0.3;            // width, height, wall thickness — a bit narrower than original
  const shape = new THREE.Shape(); roundedRect(shape, W, H, 0.30);
  const hole  = new THREE.Path();  roundedRect(hole,  W-2*T, H-2*T, 0.16);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth:4.8, bevelEnabled:true, bevelThickness:0.045, bevelSize:0.045, bevelSegments:3, curveSegments:24
  });
  geo.center();

  /* Lightly polished steel: higher metalness, lower roughness than before */
  const mat = new THREE.MeshStandardMaterial({color:0x9aa2a5, metalness:0.96, roughness:0.22});
  const profile = new THREE.Mesh(geo, mat);

  const group = new THREE.Group(); group.add(profile);
  group.rotation.set(-0.42, 0.66, 0.14);
  scene.add(group);

  /* Lighting: cool key + dim fill + surgical hot ember rim + cool ice kick */
  scene.add(new THREE.HemisphereLight(0x9fb4c0, 0x06080a, 0.42));
  const key  = new THREE.DirectionalLight(0xeaf2f6, 1.75); key.position.set(4,6,5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x6b7a82, 0.38); fill.position.set(-6,-2,2); scene.add(fill);
  const ember = new THREE.PointLight(0xff6a2b, 3.1, 24, 2); ember.position.set(-3.4,-1.2,3.2); scene.add(ember);
  const ember2= new THREE.PointLight(0xff7a3a, 1.5, 20, 2); ember2.position.set(3.0,2.6,2.2); scene.add(ember2);
  const ice  = new THREE.PointLight(0xcfe3f2, 1.1, 24, 2); ice.position.set(5,2,-3); scene.add(ice);

  /* Movement: CALM & PRECISE — slow constant spin, gentle parallax, smooth drag */
  let auto = reduceMotion?0:0.0014;          // slow
  let vx=0, vy=0, dragging=false, lastX=0, lastY=0, mpx=0, mpy=0;
  let scrollProg=0, t=0;
  addEventListener('scroll', ()=>{ scrollProg = Math.min(1, (scrollY||0)/Math.max(1,innerHeight)); }, {passive:true});

  function down(e){ dragging=true; lastX=(e.touches?e.touches[0].clientX:e.clientX); lastY=(e.touches?e.touches[0].clientY:e.clientY); }
  function move(e){
    const cx=(e.touches?e.touches[0].clientX:e.clientX), cy=(e.touches?e.touches[0].clientY:e.clientY);
    if(dragging){ vy=(cx-lastX)*0.004; vx=(cy-lastY)*0.004; group.rotation.y+=vy; group.rotation.x+=vx; lastX=cx; lastY=cy; }
    mpx=(cx/innerWidth-0.5); mpy=(cy/innerHeight-0.5);
  }
  function up(){ dragging=false; }
  canvas.addEventListener('mousedown',down); addEventListener('mousemove',move); addEventListener('mouseup',up);
  canvas.addEventListener('touchstart',down,{passive:true}); addEventListener('touchmove',move,{passive:true}); addEventListener('touchend',up);

  function loop(){
    requestAnimationFrame(loop);
    t+=0.016;
    if(!dragging){
      group.rotation.y += auto + vy; group.rotation.x += vx;
      vx*=0.95; vy*=0.95;                    // smooth settle
      if(reduceMotion){ vx=0; vy=0; }
    }
    if(!reduceMotion){
      group.position.y = Math.sin(t)*0.06;                            // gentle cinematic float
      camera.position.x += (mpx*0.45 - camera.position.x)*0.035;       // gentle parallax
      camera.position.y += (-mpy*0.3 - camera.position.y)*0.035;
      camera.position.z += ((7.6 - scrollProg*1.6) - camera.position.z)*0.06; // dolly in on scroll
      camera.lookAt(0,0,0);
    }
    renderer.render(scene, camera);
  }
  loop();
})();
