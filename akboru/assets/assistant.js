/* ============================================================
   AK BORU PROFIL — Guided Assistant (AK Asistan)
   Client-side only · no backend · TR / EN / DE
   Answers from a curated knowledge base and routes to
   WhatsApp / Quote / Products. Never invents data.
   ============================================================ */
(function(){
  const WA = "https://wa.me/905426607829";
  const HREF = { products:"./products.html", quote:"./contact.html", contact:"./contact.html", wa:WA };

  const ASSIST = {
    tr:{
      title:"AK Asistan", status:"Çevrimiçi", launch:"Yardım",
      greet:"Merhaba! 👋 Size nasıl yardımcı olabilirim? Aşağıdan bir konu seçin veya sorunuzu yazın.",
      ph:"Sorunuzu yazın…",
      fallback:"Bunu en iyi ekibimiz yanıtlar. WhatsApp'tan yazın ya da teklif isteyin — hızlıca dönüş yaparız.",
      labels:{ products:"Ürünler", quote:"Teklif Al", wa:"WhatsApp", contact:"İletişim" },
      topics:[
        {id:"products", label:"Ürünler", a:"RHS, SHS, CHS ve özel profiller üretiyoruz — hepsi EN 10219'a göre. Tüm yelpazeyi Ürünler sayfasında bulabilirsiniz.", act:["products","quote"]},
        {id:"specs", label:"Ölçüler & Standartlar", a:"Ölçüler 20×20'den 400×200 mm'ye, et kalınlığı 1,5–12 mm. Kaliteler S235–S355J2H, tolerans ±0,05 mm. Standartlar: EN 10219, ISO 9001:2015.", act:["products","quote"]},
        {id:"delivery", label:"Teslimat & İhracat", a:"40+ ülkeye liman ve karayoluyla sevk ediyoruz. Standart boylar 6 m / 12 m, boy kesim mümkün.", act:["quote","wa"]},
        {id:"quote", label:"Teklif Al", a:"Profil tipi, ölçüler, kalite ve miktarı belirtin — size hızlıca teklif hazırlayalım.", act:["quote","wa"]},
        {id:"certs", label:"Sertifikalar", a:"EN 10219, ISO 9001:2015 ve CE uygunluğu. Çelik kaliteleri S235–S355J2H, sertifikalı mekanik özelliklerle.", act:["contact"]},
        {id:"contact", label:"İletişim", a:"Akçataş OSB, Viranşehir / Şanlıurfa, Türkiye. Pzt–Cmt 08:00–18:00 (GMT+3). En hızlısı WhatsApp.", act:["wa","contact"]}
      ]
    },
    en:{
      title:"AK Assistant", status:"Online", launch:"Help",
      greet:"Hi! 👋 How can I help you today? Pick a topic below or type your question.",
      ph:"Type your question…",
      fallback:"Our team can best answer that. Message us on WhatsApp or request a quote — we reply fast.",
      labels:{ products:"Products", quote:"Get a Quote", wa:"WhatsApp", contact:"Contact" },
      topics:[
        {id:"products", label:"Products", a:"We manufacture RHS, SHS, CHS and custom profiles — all to EN 10219. See the full range on the Products page.", act:["products","quote"]},
        {id:"specs", label:"Dimensions & Standards", a:"Sizes from 20×20 to 400×200 mm, wall 1.5–12 mm. Grades S235–S355J2H, tolerance ±0.05 mm. Standards: EN 10219, ISO 9001:2015.", act:["products","quote"]},
        {id:"delivery", label:"Delivery & Export", a:"We ship to 40+ countries by port and road. Standard lengths 6 m / 12 m, cut-to-length available.", act:["quote","wa"]},
        {id:"quote", label:"Get a Quote", a:"Tell us profile type, dimensions, grade and quantity — we'll prepare a quote fast.", act:["quote","wa"]},
        {id:"certs", label:"Certifications", a:"EN 10219, ISO 9001:2015 and CE conformity. Steel grades S235–S355J2H with certified mechanical properties.", act:["contact"]},
        {id:"contact", label:"Contact", a:"Akçataş OSB, Viranşehir / Şanlıurfa, Türkiye. Mon–Sat 08:00–18:00 (GMT+3). Fastest is WhatsApp.", act:["wa","contact"]}
      ]
    },
    de:{
      title:"AK Assistent", status:"Online", launch:"Hilfe",
      greet:"Hallo! 👋 Wie kann ich helfen? Wählen Sie unten ein Thema oder schreiben Sie Ihre Frage.",
      ph:"Schreiben Sie Ihre Frage…",
      fallback:"Das beantwortet unser Team am besten. Schreiben Sie uns auf WhatsApp oder fordern Sie ein Angebot an — wir antworten schnell.",
      labels:{ products:"Produkte", quote:"Angebot", wa:"WhatsApp", contact:"Kontakt" },
      topics:[
        {id:"products", label:"Produkte", a:"Wir fertigen RHS, SHS, CHS und Sonderprofile — alle nach EN 10219. Das ganze Sortiment auf der Produkte-Seite.", act:["products","quote"]},
        {id:"specs", label:"Maße & Normen", a:"Maße von 20×20 bis 400×200 mm, Wandstärke 1,5–12 mm. Güten S235–S355J2H, Toleranz ±0,05 mm. Normen: EN 10219, ISO 9001:2015.", act:["products","quote"]},
        {id:"delivery", label:"Lieferung & Export", a:"Wir liefern in 40+ Länder per Hafen und Straße. Standardlängen 6 m / 12 m, Ablängen möglich.", act:["quote","wa"]},
        {id:"quote", label:"Angebot", a:"Nennen Sie Profiltyp, Maße, Güte und Menge — wir erstellen schnell ein Angebot.", act:["quote","wa"]},
        {id:"certs", label:"Zertifikate", a:"EN 10219, ISO 9001:2015 und CE-Konformität. Stahlgüten S235–S355J2H mit zertifizierten mechanischen Eigenschaften.", act:["contact"]},
        {id:"contact", label:"Kontakt", a:"Akçataş OSB, Viranşehir / Şanlıurfa, Türkei. Mo–Sa 08:00–18:00 (GMT+3). Am schnellsten per WhatsApp.", act:["wa","contact"]}
      ]
    }
  };

  // keyword → topic id (combined across languages, lowercase)
  const KW = {
    products:["ürün","urun","profil","rhs","shs","chs","boru","product","produkt","rohr","hollow","kutu"],
    specs:["ölçü","olcu","mm","tolerans","toleranz","tolerance","standart","standard","norm","en 10219","iso","kalite","grade","güte","gute","maß","mass","dimension","wall","wandstärke","wandstarke","et kalınlığı"],
    delivery:["teslimat","sevk","ihracat","delivery","export","ship","versand","liefer","boy","length","länge","lange","lieferzeit","sevkiyat"],
    quote:["teklif","fiyat","quote","price","preis","angebot","kosten","cost","offer"],
    certs:["sertifika","cert","zertifikat","ce","iso 9001","belge"],
    contact:["iletişim","iletisim","adres","address","adresse","telefon","phone","kontakt","contact","nerede","where","wo","whatsapp","saat","hours","öffnungszeiten"]
  };

  function getLang(){ const l=document.documentElement.lang; return ASSIST[l]?l:'tr'; }

  // ---- build DOM ----
  const launcher = document.createElement('button');
  launcher.className='ak-launcher'; launcher.setAttribute('aria-label','AK Assistant');
  launcher.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 01-8 8H7l-4 3 1-5a8 8 0 1117-6z"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r="1" fill="currentColor" stroke="none"/></svg>';

  const panel = document.createElement('div');
  panel.className='ak-panel';
  panel.innerHTML =
    '<div class="ak-head">'+
      '<img src="./assets/logo-mark.png" alt="AK" class="ak-logo"/>'+
      '<div class="ak-titles"><div class="ak-title"></div><div class="ak-status"><span class="ak-dot"></span><span class="ak-status-t"></span></div></div>'+
      '<button class="ak-close" aria-label="Close">&times;</button>'+
    '</div>'+
    '<div class="ak-body" id="akBody"></div>'+
    '<div class="ak-chips" id="akChips"></div>'+
    '<form class="ak-input" id="akForm"><input id="akText" type="text" autocomplete="off"/><button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></button></form>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const body = panel.querySelector('#akBody');
  const chipsEl = panel.querySelector('#akChips');
  const form = panel.querySelector('#akForm');
  const text = panel.querySelector('#akText');

  function L(){ return ASSIST[getLang()]; }

  function scrollDown(){ body.scrollTop = body.scrollHeight; }

  function addMsg(html, who){
    const m=document.createElement('div'); m.className='ak-msg '+who; m.innerHTML=html; body.appendChild(m); scrollDown(); return m;
  }
  function actionButtons(acts){
    const d=L().labels;
    return '<div class="ak-acts">'+acts.map(k=>{
      const ext = k==='wa' ? ' target="_blank" rel="noopener"' : '';
      return '<a class="ak-act'+(k==='wa'?' wa':'')+'" href="'+HREF[k]+'"'+ext+'>'+d[k]+'</a>';
    }).join('')+'</div>';
  }
  function answerTopic(tp){
    addMsg(tp.label,'user');
    setTimeout(()=>{ addMsg(tp.a + (tp.act&&tp.act.length?actionButtons(tp.act):''),'bot'); }, 220);
  }
  function fallback(q){
    addMsg(q,'user');
    setTimeout(()=>{ addMsg(L().fallback+actionButtons(['wa','quote']),'bot'); }, 220);
  }
  function matchTopic(q){
    const s=q.toLowerCase();
    for(const t of L().topics){ const kws=KW[t.id]||[]; if(kws.some(k=> s.indexOf(k)>-1)) return t; }
    return null;
  }

  function renderChips(){
    chipsEl.innerHTML = L().topics.map(t=>'<button class="ak-chip" data-id="'+t.id+'">'+t.label+'</button>').join('');
    chipsEl.querySelectorAll('.ak-chip').forEach(c=> c.addEventListener('click',()=>{
      const tp = L().topics.find(x=>x.id===c.dataset.id); if(tp) answerTopic(tp);
    }));
  }
  function renderStatic(){
    panel.querySelector('.ak-title').textContent = L().title;
    panel.querySelector('.ak-status-t').textContent = L().status;
    text.placeholder = L().ph;
  }
  function greet(){ body.innerHTML=''; addMsg(L().greet,'bot'); }

  let opened=false;
  function rebuild(){ renderStatic(); renderChips(); greet(); }

  function open(){ panel.classList.add('open'); launcher.classList.add('hidden'); if(!opened){ rebuild(); opened=true; } scrollDown(); setTimeout(()=>text.focus(),300); }
  function close(){ panel.classList.remove('open'); launcher.classList.remove('hidden'); }

  launcher.addEventListener('click', open);
  panel.querySelector('.ak-close').addEventListener('click', close);
  form.addEventListener('submit', e=>{ e.preventDefault(); const q=text.value.trim(); if(!q) return; text.value='';
    const tp=matchTopic(q); if(tp) answerTopic(tp); else fallback(q); });

  // re-render on language change (event dispatched by i18n.js)
  document.addEventListener('langchange', ()=>{ renderStatic(); renderChips(); if(opened){ greet(); } });
})();
