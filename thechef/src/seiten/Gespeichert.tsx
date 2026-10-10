// Gespeichert.dc.html – Erfolgsmoment: "Gespeichert. Danke, Halil." + nächster offener Bereich.
import { tagIn } from '../../supabase/functions/_shared/logik/lager.ts';
import { useIch, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { Icon } from '../ui/Icon.tsx';

export function Gespeichert({ scanId, anzahl }: { scanId: string; anzahl: number }) {
  const { t, name, uhrzeit } = useT();
  const { nutzer, betrieb } = useIch();
  const heute = tagIn(betrieb.zeitzone);
  const { daten } = useLaden(async (a) => {
    const [bereiche, scans] = await Promise.all([a.bereiche(), a.scansSeit(new Date(Date.now() - 36 * 3600e3).toISOString())]);
    const diese = scans.find((s) => s.id === scanId);
    const erledigt = new Set(scans.filter((s) => s.status === 'bestaetigt' && tagIn(betrieb.zeitzone, new Date(s.zeitpunkt)) === heute).map((s) => s.bereich_id));
    return { bereich: bereiche.find((b) => b.id === diese?.bereich_id), zeit: diese?.bestaetigt_am ?? null, naechster: bereiche.find((b) => !erledigt.has(b.id)) ?? null };
  }, [scanId]);

  return (
    <main className="seite ohne-nav" style={{ justifyContent: 'space-between' }}>
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, textAlign: 'center', padding: '0 12px' }}>
        <div className="erfolg-kreis"><Icon name="haken" groesse={64} strich={3} /></div>
        <div className="einblenden" style={{ display: 'flex', flexDirection: 'column', gap: 8, animationDelay: '.35s' }}>
          <h1 className="zahl" style={{ margin: 0, fontSize: 40, letterSpacing: '-1.2px' }}>{t('gespeichert.titel')}</h1>
          <div className="leise" style={{ fontSize: 18, lineHeight: 1.4 }}>{t('gespeichert.danke', { name: nutzer.name })}</div>
        </div>
        {daten?.bereich && (
          <div className="glas glas-pille einblenden" style={{ alignSelf: 'center', animationDelay: '.45s' }}>
            {t('gespeichert.zusammenfassung', { n: anzahl, bereich: name(daten.bereich.namen), zeit: daten.zeit ? uhrzeit(daten.zeit) : '' })}
          </div>
        )}
      </div>
      <div className="stapel einblenden" style={{ gap: 8, animationDelay: '.55s' }}>
        {daten?.naechster ? (
          <>
            <div className="leise" style={{ textAlign: 'center', fontSize: 15, fontWeight: 600 }}>{t('gespeichert.als_naechstes', { bereich: name(daten.naechster.namen) })}</div>
            <a className="knopf-haupt" href={`#/scan/${daten.naechster.id}`}><Icon name="kamera" groesse={24} /> {t('gespeichert.weiter_scannen')}</a>
            <a className="knopf leise" style={{ fontSize: 17 }} href="#/m">{t('gespeichert.fertig_heute')}</a>
          </>
        ) : (
          <>
            <div className="meldung ok" style={{ justifyContent: 'center' }}><Icon name="haken" />{t('gespeichert.alles_fertig')}</div>
            <a className="knopf-haupt" href={nutzer.rolle === 'chef' ? '#/c' : '#/m'}>{t('allg.fertig')}</a>
          </>
        )}
      </div>
    </main>
  );
}
