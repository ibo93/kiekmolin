// Durchlauf durch die komplette Kette mit einer realistischen 2-Seiten-Karte,
// die in 4 Bildhälften zerlegt wurde. Nutzt den ECHTEN Server-Code und die
// ECHTE Client-Logik, aus den Dateien geschnitten.
var fs=require('fs'), sse=require('./lib/sse').sseAntwort, n=0, ok=0;
function t(l,c,x){n++;var g=c===true;if(g)ok++;console.log((g?'OK  ':'FAIL')+' | '+l+(g?'':'  -> '+x));}
var html=fs.readFileSync('/home/user/kiekmolin/index.html','utf8');
var P='/home/user/kiekmolin/netlify/functions/menu-scan.js';

// Was das Modell pro Bildhälfte liefert. Hälfte 2 und 4 ohne Überschrift --
// genau der Fall, in dem früher erfunden wurde.
var HAELFTEN = [
 {items:[{name:'Bruschetta',description:'',price:6.5,category:'Vorspeisen',dish_number:'1',allergens:['A'],additives:['1']},
         {name:'Carpaccio', description:'',price:9.9,category:'Vorspeisen',dish_number:'2',allergens:[],additives:[]}]},
 {items:[{name:'Vitello Tonnato',description:'',price:12.5,category:'',dish_number:'3',allergens:['D'],additives:[]}]},
 {items:[{name:'Rumpsteak',description:'',price:26.0,category:'Vom Grill',dish_number:'20',allergens:[],additives:['2','3']},
         {name:'Rumpsteak',description:'',price:26.0,category:'Vom Grill',dish_number:'20',allergens:[],additives:['2','3']}]}, // Ueberlappung
 {items:[{name:'Lammkoteletts',description:'',price:24.0,category:'',dish_number:'21',allergens:[],additives:[]}]}
];

(async function(){
  process.env.ANTHROPIC_API_KEY='a'; delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_VISION_API_KEY;
  var idx=0;
  global.fetch = async function(url){
    if(String(url).indexOf('vision')>=0) return {ok:false,status:403,text:async()=>'aus'};
    var payload = HAELFTEN[idx++];
    return sse(JSON.stringify(payload));
  };
  delete require.cache[require.resolve(P)];
  delete require.cache[require.resolve('/home/user/kiekmolin/netlify/functions/lib/scan-kern.js')];
  var handler = require(P).handler;

  // 1) Jede Hälfte einzeln durch die echte Server-Function
  var proSeite=[];
  for (var i=0;i<HAELFTEN.length;i++){
    var r = await handler({httpMethod:'POST', body:JSON.stringify({
      images:['data:image/jpeg;base64,QUJD'], categories:['Vorspeisen','Pizzen']})});
    var b = JSON.parse(r.body);
    proSeite.push(b.ok ? b.items : []);
  }
  t('Server liefert alle 4 Haelften', proSeite.filter(function(x){return x.length;}).length===4,
    proSeite.map(function(x){return x.length;}).join(','));
  t('Server bewahrt die leere Kategorie (raet nicht)',
    proSeite[1][0].category==='' && proSeite[3][0].category==='',
    JSON.stringify([proSeite[1][0].category, proSeite[3][0].category]));
  t('Server uebersetzt Allergen-Buchstaben',
    JSON.stringify(proSeite[0][0].allergens)==='["gluten"]', JSON.stringify(proSeite[0][0].allergens));
  t('Server erkennt Zusatzstoff-Ziffern',
    JSON.stringify(proSeite[2][0].additives)==='["2","3"]', JSON.stringify(proSeite[2][0].additives));
  t('Server entfernt Duplikat innerhalb einer Haelfte', proSeite[2].length===1, proSeite[2].length);

  // 2) Client: exakt der Code aus index.html
  var aiItems=[]; proSeite.forEach(function(p){ aiItems=aiItems.concat(p); });
  var m = html.match(/var _letzteKat = '';[\s\S]*?_seenScan\[k\] = 1; return true;\n\s*\}\);/)[0];
  aiItems = new Function('aiItems', m + '; return aiItems;')(aiItems);

  var kats = aiItems.map(function(x){return x.category;});
  t('Fortsetzung erbt "Vorspeisen"', kats[2]==='Vorspeisen', JSON.stringify(kats));
  t('Fortsetzung erbt "Vom Grill"', kats[4]==='Vom Grill', JSON.stringify(kats));
  t('Ueberschrift der Karte bleibt woertlich ("Vom Grill")',
    kats.indexOf('Vom Grill')>=0 && kats.indexOf('Fleischgerichte')<0, JSON.stringify(kats));
  t('keine erfundene Kategorie dabei',
    kats.every(function(k){return ['Vorspeisen','Vom Grill'].indexOf(k)>=0;}), JSON.stringify(kats));
  t('alle 5 echten Gerichte da, Ueberlappung raus', aiItems.length===5, aiItems.length);
  t('Reihenfolge bleibt erhalten',
    aiItems.map(function(x){return x.name;}).join(',')==='Bruschetta,Carpaccio,Vitello Tonnato,Rumpsteak,Lammkoteletts',
    aiItems.map(function(x){return x.name;}).join(','));

  // 3) Import: Kategorie-Zuordnung auf das Ergebnis
  function schneide(src,name){var i=src.indexOf('function '+name+'(');var j=src.indexOf('{',i),d=0;
    for(var k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
  var fm=new Function(schneide(html,'_editDistance')+';'+schneide(html,'katSchluessel')+';'+
    schneide(html,'findeKategorie')+';return {k:katSchluessel,f:findeKategorie};')();
  var vorhanden={}; ['Vorspeisen','Pizzen'].forEach(function(x){vorhanden[fm.k(x)]='ID_'+x;});
  t('"Vorspeisen" findet die vorhandene Kategorie', fm.f('Vorspeisen',vorhanden)==='ID_Vorspeisen');
  t('"Vom Grill" wird korrekt als NEU erkannt', fm.f('Vom Grill',vorhanden)===null, fm.f('Vom Grill',vorhanden));

  console.log('\n'+(ok===n?`Alle ${n} Tests bestanden.`:`${n-ok} von ${n} FEHLGESCHLAGEN.`));
  process.exit(ok===n?0:1);
})();
