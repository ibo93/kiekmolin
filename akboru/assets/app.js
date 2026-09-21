/* ============================================================
   AK BORU PROFIL — shared interactions
   ============================================================ */
(function(){
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Nav scroll state */
  const nav = document.getElementById('nav');
  if(nav){
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
    onScroll(); window.addEventListener('scroll', onScroll, {passive:true});
  }

  /* Mobile menu */
  const mm = document.getElementById('mobileMenu');
  const burger = document.getElementById('burger');
  const closeMenu = document.getElementById('closeMenu');
  if(mm && burger){
    burger.addEventListener('click', ()=> mm.classList.add('open'));
    if(closeMenu) closeMenu.addEventListener('click', ()=> mm.classList.remove('open'));
    mm.querySelectorAll('a').forEach(a=> a.addEventListener('click', ()=> mm.classList.remove('open')));
  }

  /* Hero load-in stagger */
  window.addEventListener('load', ()=>{
    document.querySelectorAll('.hero .reveal').forEach(el=>{
      const d = parseInt(el.dataset.d||0,10);
      setTimeout(()=> el.classList.add('in'), 120 + d*90);
    });
  });

  /* Scroll reveal with stagger */
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const d = parseInt(e.target.dataset.d||0,10);
        e.target.style.transitionDelay = (d*70)+'ms';
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  },{threshold:.14, rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('.reveal').forEach(el=>{ if(!el.closest('.hero')) io.observe(el); });

  /* Count-up */
  function countUp(el){
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix||'';
    const comma = el.dataset.format==='comma';
    const dur = reduceMotion?0:1400; const start = performance.now();
    function tick(now){
      const p = dur?Math.min((now-start)/dur,1):1;
      const eased = 1-Math.pow(1-p,3);
      let val = Math.round(target*eased);
      el.textContent = (comma?val.toLocaleString('en-US'):val)+suffix;
      if(p<1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const ioCount = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ countUp(e.target); ioCount.unobserve(e.target); }});
  },{threshold:.5});
  document.querySelectorAll('[data-count]').forEach(el=> ioCount.observe(el));

  /* Contact form -> compose mailto (no backend required for demo) */
  const form = document.getElementById('contactForm');
  if(form){
    form.addEventListener('submit', (ev)=>{
      ev.preventDefault();
      const f = new FormData(form);
      const name=(f.get('name')||'').toString();
      const company=(f.get('company')||'').toString();
      const email=(f.get('email')||'').toString();
      const country=(f.get('country')||'').toString();
      const msg=(f.get('message')||'').toString();
      const subject=encodeURIComponent('Quote request — '+(company||name||'Website'));
      const body=encodeURIComponent(
        'Name: '+name+'\nCompany: '+company+'\nEmail: '+email+'\nCountry: '+country+'\n\n'+msg
      );
      // TODO: replace with the real company inbox before launch
      window.location.href='mailto:info@akboruprofil.com?subject='+subject+'&body='+body;
    });
  }
})();
