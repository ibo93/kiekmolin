// Einstellungen.dc.html – Darstellung (Hell/Dunkel/Automatisch, Akzent, Glas, Bewegungen) + Betrieb + Einrichtung.
import type { Darstellung } from '../../supabase/functions/_shared/logik/typen.ts';
import { useApp, useFehlerText, useIch } from '../app/kontext.tsx';
import { demoZuruecksetzen } from '../daten/demo.ts';
import { SPRACHEN, useT } from '../i18n/i18n.tsx';
import { AKZENTE } from '../lib/darstellung.ts';
import { istNativ } from '../lib/geraet.ts';
import { KopfMitte, Schalter, Umschalter } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';
import { usePush } from '../ui/push.tsx';

export function Einstellungen() {
  const { t, geld, sprache } = useT();
  const { api, neuLaden, toast } = useApp();
  const { nutzer, betrieb } = useIch();
  const fehlerText = useFehlerText();
  const d = nutzer.darstellung;
  const push = usePush();

  async function darstellung(p: Partial<Darstellung>) {
    try { await api.profilAendern({ darstellung: { ...d, ...p } }); await neuLaden(); } catch (e) { toast(fehlerText(e)); }
  }
  async function betriebSetzen(p: Parameters<typeof api.betriebAendern>[0]) {
    try { await api.betriebAendern(p); await neuLaden(); toast(t('allg.gespeichert')); } catch (e) { toast(fehlerText(e)); }
  }
  return (
    <main className="seite ohne-nav">
      <KopfMitte titel={t('einstellungen.titel')} ziel="/c" />

      {/* Vorschau wie im Mockup */}
      <div className="wert-kachel gross einblenden" style={{ alignSelf: 'center', minWidth: 220, textAlign: 'center' }}>
        <span className="klein">{t('bestand.ware_im_lager')}</span>
        <span className="zahl" style={{ color: 'var(--akzent)' }}>{geld(1240)}</span>
      </div>

      <section className="karte">
        <span className="etikett leise">{t('einstellungen.modus')}</span>
        <Umschalter label={t('einstellungen.modus')} wert={d.modus ?? 'auto'} setWert={(m) => darstellung({ modus: m })}
          optionen={[{ id: 'hell', text: t('einstellungen.hell') }, { id: 'dunkel', text: t('einstellungen.dunkel') }, { id: 'auto', text: t('einstellungen.auto') }]} />
        <span className="etikett leise">{t('einstellungen.akzent')}</span>
        <div className="reihe" role="radiogroup" aria-label={t('einstellungen.akzent')}>
          {Object.entries(AKZENTE).map(([id, f]) => (
            <button key={id} role="radio" aria-checked={(d.akzent ?? 'blau') === id} aria-label={t(`akzent.${id}`)} className="akzent-punkt"
              style={{ background: f.hell }} onClick={() => darstellung({ akzent: id })}>
              {(d.akzent ?? 'blau') === id && <Icon name="haken" groesse={18} strich={3} />}
            </button>
          ))}
        </div>
        <span className="leise" style={{ fontSize: 13 }}>{t('einstellungen.akzent_warum')}</span>
        <span className="etikett leise">{t('einstellungen.glas')}</span>
        <Umschalter label={t('einstellungen.glas')} wert={d.glas ?? 'klar'} setWert={(g) => darstellung({ glas: g })}
          optionen={[{ id: 'klar', text: t('einstellungen.klar') }, { id: 'getoent', text: t('einstellungen.getoent') }]} />
        <div className="reihe" style={{ justifyContent: 'space-between' }}>
          <span><strong style={{ display: 'block' }}>{t('einstellungen.bewegung')}</strong><span className="leise" style={{ fontSize: 14 }}>{t('einstellungen.bewegung_unter')}</span></span>
          <Schalter an={d.bewegung !== false} setAn={(b) => darstellung({ bewegung: b })} label={t('einstellungen.bewegung')} />
        </div>
      </section>

      <section className="karte" style={{ gap: 0, paddingTop: 6, paddingBottom: 6 }}>
        <a className="zeile" href="#/sprache"><Icon name="globus" /><span className="mitte"><span className="name">{t('einstellungen.sprache')}</span></span><span className="leise">{SPRACHEN.find((s) => s.code === sprache)?.eigen}</span></a>
        <div className="zeile">
          <Icon name="vorlesen" />
          <span className="mitte"><span className="name">{t('einstellungen.push')}</span><span className="klein">{t('einstellungen.push_unter')}</span></span>
          {push.laedt || !push.geprueft ? <span className="laden" /> : <Schalter an={push.aktiv} setAn={push.setzen} label={t('einstellungen.push')} />}
        </div>
        {!istNativ() && <a className="zeile" href="#/installieren"><Icon name="telefon" /><span className="mitte"><span className="name">{t('installieren.titel')}</span></span><Icon name="weiter" spiegeln /></a>}
      </section>

      <h2 className="abschnitt">{t('einstellungen.betrieb')}</h2>
      <section className="karte">
        <label className="feld"><span>{t('einstellungen.erinnerung')}</span>
          <input className="eingabe" type="time" defaultValue={betrieb.scan_erinnerung_uhrzeit.slice(0, 5)}
            onBlur={(e) => e.target.value && betriebSetzen({ scan_erinnerung_uhrzeit: e.target.value })} /></label>
        <label className="feld"><span>{t('einstellungen.loeschfrist')}</span>
          <select className="eingabe" defaultValue={betrieb.foto_loeschfrist_tage} onChange={(e) => betriebSetzen({ foto_loeschfrist_tage: Number(e.target.value) })}>
            {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{t('einstellungen.tage', { n })}</option>)}
          </select></label>
        <span className="leise" style={{ fontSize: 13 }}>{t('einstellungen.loeschfrist_warum')}</span>
        <div className="reihe" style={{ justifyContent: 'space-between' }}>
          <span><strong style={{ display: 'block' }}>{t('einstellungen.test')}</strong><span className="leise" style={{ fontSize: 14 }}>{t('einstellungen.test_unter')}</span></span>
          <Schalter an={betrieb.genauigkeitstest} setAn={(b) => betriebSetzen({ genauigkeitstest: b })} label={t('einstellungen.test')} />
        </div>
      </section>

      <section className="karte" style={{ gap: 0, paddingTop: 6, paddingBottom: 6 }}>
        {[
          ['#/c/katalog/bereiche', 'kuehlhaus', 'katalog.bereiche'],
          ['#/c/katalog/produkte', 'bestand', 'katalog.produkte'],
          ['#/c/team', 'team', 'team.titel'],
          ['#/c/genauigkeit', 'ziel', 'genauigkeit.titel'],
          ['#/c/kosten', 'euro', 'kosten.titel'],
        ].map(([ziel, icon, key]) => (
          <a key={ziel} className="zeile" href={ziel}><Icon name={icon} /><span className="mitte"><span className="name">{t(key)}</span></span><Icon name="weiter" spiegeln /></a>
        ))}
      </section>

      <button className="knopf gefahr" onClick={async () => { await api.abmelden(); location.hash = ''; await neuLaden(); }}><Icon name="abmelden" spiegeln /> {t('einstellungen.abmelden')}</button>
      {api.demo && <button className="knopf leise" onClick={() => { demoZuruecksetzen(); location.hash = ''; location.reload(); }}>{t('einstellungen.demo_reset')}</button>}
    </main>
  );
}
