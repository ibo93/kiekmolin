// Start-Animation (Splash.dc.html): beim allerersten Start ~3 s, danach max. 1 s.
// Antippen überspringt. "Bewegung reduzieren" → sofort weiter.
import { useEffect } from 'react';
import { useT } from '../i18n/i18n.tsx';

const SCHLUESSEL = 'thechef-splash';
export function splashGesehen() {
  try { return localStorage.getItem(SCHLUESSEL) === '1'; } catch { return true; }
}

export function Splash({ ersterStart, fertig }: { ersterStart: boolean; fertig(): void }) {
  useEffect(() => {
    try { localStorage.setItem(SCHLUESSEL, '1'); } catch { /* egal */ }
    const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(fertig, ruhig ? 0 : ersterStart ? 3300 : 900);
    return () => clearTimeout(t);
  }, [ersterStart, fertig]);
  return (
    <button className={`splash ${ersterStart ? '' : 'kurz'}`} onClick={fertig} aria-label="The Chef">
      <div className="splash-symbol">
        <i className="ecke tl" /><i className="ecke tr" /><i className="ecke bl" /><i className="ecke br" />
        <div className="splash-glas">
          <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path className="zeichnen" d="M7 14a4 4 0 0 1-1.6-7.7A4.6 4.6 0 0 1 12 3.6a4.6 4.6 0 0 1 6.6 2.7A4 4 0 0 1 17 14v5.5H7z" pathLength={100} strokeDasharray="100" />
            <path className="zeichnen z2" d="M7 16.8h10" pathLength={100} strokeDasharray="100" />
          </svg>
        </div>
        <div className="scanlinie" />
        <div className="splash-haken">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
      </div>
      <div className="splash-wort">
        <div className="the">THE</div>
        <div className="chef">Chef</div>
        <SloganText />
      </div>
    </button>
  );
}

function SloganText() {
  const { t } = useT();
  return <div className="slogan">{t('splash.slogan')}</div>;
}
