/* ==========================================================
   Kurani CRM – Utils
   Datum, Geld, Fristen, IDs, kleine Helfer
   ========================================================== */
const U = (() => {

  /* ---------- IDs ---------- */
  const uid = (p='id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

  /* ---------- Geld ---------- */
  const eur = n => (Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
  const eur0 = n => Math.round(Number(n)||0).toLocaleString('de-DE') + ' €';
  const num = n => (Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  // "1.250,50" oder "1250.50" -> 1250.5
  const parseNum = v => {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    let s = String(v).replace(/[^\d,.-]/g,'').trim();
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',','.');
    else if (s.includes(',')) s = s.replace(',','.');
    return parseFloat(s) || 0;
  };

  /* ---------- Datum ---------- */
  const today = () => new Date().toISOString().slice(0,10);
  const iso = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0,10);
  const de = d => { if(!d) return '–'; const x = new Date(d); return isNaN(x) ? '–' :
    String(x.getDate()).padStart(2,'0')+'.'+String(x.getMonth()+1).padStart(2,'0')+'.'+x.getFullYear(); };
  const deShort = d => { if(!d) return '–'; const x = new Date(d); return isNaN(x) ? '–' :
    String(x.getDate()).padStart(2,'0')+'.'+String(x.getMonth()+1).padStart(2,'0')+'.'; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return iso(x); };
  const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth()+n); return iso(x); };
  // Tage zwischen zwei Daten (b - a)
  const daysBetween = (a, b=today()) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const daysAgo = d => daysBetween(d, today());
  const daysUntil = d => daysBetween(today(), d);
  // Frist nie auf Sa/So -> nächster Montag (Regel aus kurani-docs)
  const workday = d => { const x = new Date(d); const w = x.getDay();
    if (w===6) x.setDate(x.getDate()+2); if (w===0) x.setDate(x.getDate()+1); return iso(x); };
  const dueDate = (from, days) => workday(addDays(from, days));
  const monthKey = d => String(d).slice(0,7);            // 2026-08
  const yearOf = d => Number(String(d).slice(0,4));
  const MONTHS = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const MONATE_LANG = ['Januar','Februar','März','April','Mai','Juni',
                       'Juli','August','September','Oktober','November','Dezember'];
  const monthName = k => MONTHS[Number(String(k).slice(5,7))-1] + ' ' + String(k).slice(2,4);
  /* Monat ausgeschrieben, für Überschriften: monatLang('2026-08') → 'August 2026' */
  const monatLang = k => MONATE_LANG[Number(String(k).slice(5,7))-1] + ' ' + String(k).slice(0,4);
  const relative = d => {
    const n = daysAgo(d);
    if (n === 0) return 'heute'; if (n === 1) return 'gestern'; if (n === -1) return 'morgen';
    if (n > 0) return 'vor ' + n + ' Tagen';
    return 'in ' + Math.abs(n) + ' Tagen';
  };
  // Kalenderwoche (ISO)
  const kw = d => { const x=new Date(d); x.setHours(0,0,0,0);
    x.setDate(x.getDate()+3-((x.getDay()+6)%7));
    const w1=new Date(x.getFullYear(),0,4);
    return 1+Math.round(((x-w1)/86400000-3+((w1.getDay()+6)%7))/7); };
  const weekKey = d => { const x=new Date(d); return yearOf(iso(x)) + '-KW' + String(kw(d)).padStart(2,'0'); };
  const startOfWeek = d => { const x=new Date(d); const diff=(x.getDay()+6)%7; x.setDate(x.getDate()-diff); return iso(x); };

  /* ---------- Text ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const cut = (s, n=90) => { s = String(s||''); return s.length > n ? s.slice(0,n).trim()+'…' : s; };
  const nl2br = s => esc(s).replace(/\n/g,'<br>');
  const initials = s => String(s||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();

  /* ---------- Sonstiges ---------- */
  const sum = (arr, f=(x=>x)) => arr.reduce((a,b)=>a + (Number(f(b))||0), 0);
  const groupBy = (arr, f) => arr.reduce((m,x)=>{ const k=f(x); (m[k]=m[k]||[]).push(x); return m; },{});
  const sortBy = (arr, f, dir='asc') => [...arr].sort((a,b)=>{
    const x=f(a), y=f(b); if(x===y) return 0;
    return (x>y?1:-1) * (dir==='desc'?-1:1);
  });
  const clamp = (n,a,b) => Math.max(a, Math.min(b, n));
  const download = (filename, content, type='application/json') => {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };
  const csv = rows => rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(';')).join('\n');
  const copy = async txt => { try { await navigator.clipboard.writeText(txt); return true; }
    catch(e){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta); return true; } };

  /* ---------- Links raus (Mail / WhatsApp) ---------- */
  const mailto = (to, subject, body) =>
    'mailto:' + encodeURIComponent(to||'') + '?subject=' + encodeURIComponent(subject||'') + '&body=' + encodeURIComponent(body||'');
  const waLink = (phone, text) => {
    let p = String(phone||'').replace(/[^\d+]/g,'');
    if (p.startsWith('+')) p = p.slice(1);
    else if (p.startsWith('00')) p = p.slice(2);
    else if (p.startsWith('0')) p = '49' + p.slice(1);
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text||'');
  };

  return { uid, eur, eur0, num, parseNum, today, iso, de, deShort, addDays, addMonths,
    daysBetween, daysAgo, daysUntil, workday, dueDate, monthKey, yearOf, MONTHS, monthName,
    MONATE_LANG, monatLang,
    relative, kw, weekKey, startOfWeek, esc, slug, cut, nl2br, initials, sum, groupBy, sortBy,
    clamp, download, csv, copy, mailto, waLink };
})();
