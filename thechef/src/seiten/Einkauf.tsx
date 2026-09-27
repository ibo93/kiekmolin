// Einkauf.dc.html – Einkaufsliste für morgen: Produktbild, "+13 kg", "Noch da / Mindestens", abhaken, teilen.
import { useApp, useFehlerText } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { mailLink, whatsappLink } from '../lib/geraet.ts';
import { ChefNavigation, Fehler, Laden, ProduktBild } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';
import { mengeText, useLager } from './lager.ts';

export function EinkaufSeite() {
  const tt = useT();
  const { t, name, wann } = tt;
  const { api, toast, geaendert } = useApp();
  const fehlerText = useFehlerText();
  const { daten: d, fehler, laedt, nochmal } = useLager();
  if (laedt && !d) return <><Laden /><ChefNavigation aktiv="einkauf" /></>;
  const liste = d?.einkauf ?? [];
  const offen = liste.filter((e) => !e.abgehakt);

  async function abhaken(produktId: string, an: boolean) {
    const e = d!.eintraege.find((x) => x.produkt_id === produktId);
    try {
      await api.einkaufSetzen({ datum: d!.heute, produkt_id: produktId, menge_extra: e?.menge_extra ?? 0, abgehakt: an, quelle: e?.quelle ?? 'auto' });
      geaendert();
    } catch (err) { toast(fehlerText(err)); }
  }

  const text = [
    t('einkauf.teilen_titel', { datum: new Date(Date.now() + 864e5).toLocaleDateString(tt.locale) }),
    ...offen.map((e) => `• ${name(e.produkt.namen)}: +${mengeText(tt, e.produkt, e.menge)}`),
  ].join('\n');

  return (
    <main className="seite" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 200px)' }}>
      <div className="stapel einblenden" style={{ gap: 6, padding: '0 4px' }}>
        <h1 className="titel">{t('einkauf.titel')}</h1>
        <div className="leise" style={{ fontSize: 15, fontWeight: 600 }}><Icon name="funkeln" groesse={15} style={{ verticalAlign: '-2px' }} /> {t('einkauf.erstellt', { wann: wann(d?.letzterScan) })}</div>
      </div>
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <div className="karte einblenden" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, animationDelay: '.05s' }}>
        <span className="zahl" style={{ fontSize: 56, lineHeight: 1, color: offen.length ? 'var(--akzent)' : 'var(--gruen-text)' }}>{offen.length}</span>
        <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{offen.length ? t('einkauf.muessen', { n: offen.length }) : t('einkauf.nichts')}</span>
      </div>
      {liste.length > 0 && (
        <section className="karte einblenden" style={{ gap: 0, paddingTop: 6, paddingBottom: 6, animationDelay: '.1s' }}>
          {liste.map((e) => (
            <div key={e.produkt.id} className="zeile" style={{ opacity: e.abgehakt ? 0.5 : 1 }}>
              <ProduktBild produkt={e.produkt} />
              <span className="mitte">
                <span className="name" style={{ textDecoration: e.abgehakt ? 'line-through' : 'none' }}>{name(e.produkt.namen)}</span>
                <span className="klein">
                  {e.laeuft_ab ? t('einkauf.laeuft_ab') : t('einkauf.noch_da', { menge: mengeText(tt, e.produkt, e.noch_da) })}
                  {' · '}{t('bestand.mindestens', { menge: mengeText(tt, e.produkt, e.mindestens) })}
                </span>
              </span>
              <span className="menge zahl" style={{ color: 'var(--akzent)' }}>+{mengeText(tt, e.produkt, e.menge)}</span>
              <button className={`abhaken ${e.abgehakt ? 'an' : ''}`} role="checkbox" aria-checked={e.abgehakt} aria-label={name(e.produkt.namen)} onClick={() => abhaken(e.produkt.id, !e.abgehakt)}>
                {e.abgehakt && <Icon name="haken" groesse={18} strich={3} />}
              </button>
            </div>
          ))}
        </section>
      )}
      {offen.length > 0 && (
        <div className="raster-2" style={{ position: 'fixed', zIndex: 20, left: 16, right: 16, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)', maxWidth: 528, margin: '0 auto' }}>
          <a className="knopf-haupt gruen" style={{ minHeight: 56, fontSize: 17 }} href={whatsappLink(text)} target="_blank" rel="noopener"><Icon name="whatsapp" /> WhatsApp</a>
          <a className="knopf-haupt" style={{ minHeight: 56, fontSize: 17 }} href={mailLink(t('einkauf.titel'), text)}><Icon name="mail" /> {t('einkauf.email')}</a>
        </div>
      )}
      <ChefNavigation aktiv="einkauf" />
    </main>
  );
}
