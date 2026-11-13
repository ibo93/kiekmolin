// Sprache.dc.html – Sprachen in eigener Schrift, darunter klein der deutsche Name.
// Die Begrüßung wechselt sofort in die gewählte Sprache (auch die Richtung).
import { useEffect, useState } from 'react';
import type { Sprache } from '../../supabase/functions/_shared/logik/typen.ts';
import { SPRACHEN, texteFuer, useT, type T } from '../i18n/i18n.tsx';
import { Icon } from '../ui/Icon.tsx';

export function SpracheWaehlen({ weiter }: { weiter(s: Sprache): void }) {
  const aktuell = useT();
  const [wahl, setWahl] = useState<Sprache>(aktuell.sprache);
  const [t, setT] = useState<T>(aktuell);
  useEffect(() => { texteFuer(wahl).then(setT).catch(() => {}); }, [wahl]);
  const dir = SPRACHEN.find((s) => s.code === wahl)?.dir ?? 'ltr';

  return (
    <main className="seite ohne-nav" dir={dir} lang={wahl} style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 90px)', gap: 18 }}>
      <h1 className="zahl einblenden" key={wahl} style={{ margin: 0, fontSize: 46, lineHeight: 1.05, letterSpacing: '-1.4px', color: 'var(--akzent)' }}>{t.t('sprache.willkommen')}</h1>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45, color: 'var(--text2)' }}>{t.t('sprache.frage')}</p>
      <div className="stapel" style={{ gap: 10 }} role="radiogroup" aria-label={t.t('sprache.frage')}>
        {SPRACHEN.filter((s) => s.fertig).map((s) => {
          const sel = s.code === wahl;
          return (
            <button key={s.code} role="radio" aria-checked={sel} dir={s.dir} lang={s.code} onClick={() => setWahl(s.code)}
              className="sprach-knopf" data-gewaehlt={sel}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                <span style={{ fontSize: 19, fontWeight: 700 }}>{s.eigen}</span>
                <span lang="de" style={{ fontSize: 13, color: 'var(--text2)' }}>{s.de}</span>
              </span>
              <span className="radio">{sel && <Icon name="haken" groesse={15} strich={3.2} />}</span>
            </button>
          );
        })}
      </div>
      <div className="fuss-knoepfe">
        <button className="knopf-haupt" onClick={() => weiter(wahl)}>{t.t('allg.weiter')}</button>
      </div>
    </main>
  );
}
