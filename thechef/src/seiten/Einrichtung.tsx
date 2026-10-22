// Geführte Einrichtung (einmalig): Bereiche & Positionen → Produkte → Team → iPhone.
// Sprache und Betrieb kommen davor (Sprachwahl, BetriebAnlegen).
import { useT } from '../i18n/i18n.tsx';
import { geheZu } from '../lib/router.ts';
import { BereicheBearbeiten, ProdukteBearbeiten } from './Katalog.tsx';
import { TeamInhalt } from './Team.tsx';
import { InstallierenInhalt } from './Installieren.tsx';

const SCHRITTE = ['bereiche', 'produkte', 'team', 'iphone'] as const;

export function Einrichtung({ schritt = 'bereiche' }: { schritt?: string }) {
  const { t } = useT();
  const i = Math.max(0, SCHRITTE.indexOf(schritt as (typeof SCHRITTE)[number]));
  const naechster = SCHRITTE[i + 1];
  const weiter = () => geheZu(naechster ? `/einrichtung/${naechster}` : '/c', true);
  return (
    <main className="seite ohne-nav" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)' }}>
      <div className="stapel einblenden" style={{ gap: 6 }}>
        <div className="etikett" style={{ color: 'var(--akzent)' }}>{t('einrichtung.schritt', { n: i + 2, von: SCHRITTE.length + 1 })}</div>
        <h1 className="titel">{t(`einrichtung.${SCHRITTE[i]}_titel`)}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SCHRITTE.length + 1}, 1fr)`, gap: 6 }} aria-hidden="true">
          {Array.from({ length: SCHRITTE.length + 1 }, (_, k) => <div key={k} style={{ height: 6, borderRadius: 3, background: k <= i + 1 ? 'var(--akzent)' : 'var(--leer)' }} />)}
        </div>
      </div>
      {SCHRITTE[i] === 'bereiche' && <BereicheBearbeiten />}
      {SCHRITTE[i] === 'produkte' && <ProdukteBearbeiten />}
      {SCHRITTE[i] === 'team' && <TeamInhalt />}
      {SCHRITTE[i] === 'iphone' && <InstallierenInhalt />}
      <div className="unten-fix">
        <button className="knopf-haupt" onClick={weiter}>{naechster ? t('allg.weiter') : t('einrichtung.fertig')}</button>
        <button className="knopf leise" onClick={weiter}>{t('allg.spaeter')}</button>
      </div>
    </main>
  );
}
