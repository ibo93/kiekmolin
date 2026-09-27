// Main.dc.html – die Bereiche des Tages als große Karten.
// Der nächste offene Bereich ist hervorgehoben und startet mit EINEM Tipp den Scan.
import { useEffect, useState } from 'react';
import { tagIn } from '../../supabase/functions/_shared/logik/lager.ts';
import type { Bereich, Scan } from '../../supabase/functions/_shared/logik/typen.ts';
import { useApp, useIch, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { abonnieren, abgleichen } from '../lib/abgleich.ts';
import { geheZu } from '../lib/router.ts';
import type { WarteScan } from '../lib/warteschlange.ts';
import { Fehler, Laden } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

type Zustand = { art: 'fertig'; zeit: string } | { art: 'bestaetigen'; scanId: string } | { art: 'wartet' } | { art: 'fehler'; lokal: WarteScan } | { art: 'offen' };

export function MitarbeiterStart() {
  const { t, name, uhrzeit, sprache } = useT();
  const { nutzer, betrieb } = useIch();
  const { api } = useApp();
  const [warte, setWarte] = useState<WarteScan[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => abonnieren(setWarte), []);
  useEffect(() => {
    const an = () => setOnline(true), aus = () => setOnline(false);
    addEventListener('online', an); addEventListener('offline', aus);
    return () => { removeEventListener('online', an); removeEventListener('offline', aus); };
  }, []);

  const heute = tagIn(betrieb.zeitzone);
  const gestern = new Date(Date.now() - 36 * 3600e3).toISOString();
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => ({
    bereiche: await a.bereiche(),
    scans: await a.scansSeit(gestern),
  }), [warte.length]);

  if (laedt && !daten) return <Laden />;

  function zustand(b: Bereich, scans: Scan[]): Zustand {
    const heuteScans = scans.filter((s) => s.bereich_id === b.id && tagIn(betrieb.zeitzone, new Date(s.zeitpunkt)) === heute);
    const fertig = heuteScans.find((s) => s.status === 'bestaetigt');
    if (fertig) return { art: 'fertig', zeit: uhrzeit(fertig.bestaetigt_am ?? fertig.zeitpunkt) };
    const erkannt = heuteScans.find((s) => s.status === 'erkannt');
    if (erkannt) return { art: 'bestaetigen', scanId: erkannt.id };
    const lokal = warte.find((w) => w.bereich_id === b.id && w.status !== 'erkannt');
    if (lokal?.status === 'fehler') return { art: 'fehler', lokal };
    if (lokal) return { art: 'wartet' };
    return { art: 'offen' };
  }

  const bereiche = daten?.bereiche ?? [];
  const zustaende = bereiche.map((b) => ({ b, z: zustand(b, daten?.scans ?? []) }));
  const erledigt = zustaende.filter((x) => x.z.art === 'fertig').length;
  const naechster = zustaende.find((x) => x.z.art === 'offen');
  const code = sprache.toUpperCase();

  return (
    <main className="seite ohne-nav">
      <div className="kopf einblenden" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div className="etikett leise" style={{ letterSpacing: 1.2 }}>{betrieb.name}</div>
          <h1>{t('mitarbeiter.hallo', { name: nutzer.name })}</h1>
        </div>
        <div className="reihe" style={{ gap: 8 }}>
          {nutzer.rolle === 'chef' && (
            <a className="glas glas-knopf" href="#/c" aria-label={t('nav.assistent')}><Icon name="funkeln" /></a>
          )}
          <a className="glas glas-knopf breit" href="#/sprache" aria-label={t('mitarbeiter.sprache_waehlen')}><Icon name="globus" groesse={18} /> {code}</a>
        </div>
      </div>

      {!online && <div className="meldung warnung" role="status"><Icon name="offline" />{t('offline.kein_netz')}</div>}
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}

      {bereiche.length === 0 && !fehler && (
        <div className="karte"><strong>{t('mitarbeiter.keine_bereiche')}</strong><span className="leise">{t('mitarbeiter.keine_bereiche_unter')}</span></div>
      )}

      {bereiche.length > 0 && (
        <div className="stapel einblenden" style={{ gap: 10, padding: '0 4px', animationDelay: '.05s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{t('mitarbeiter.heute')}</span>
            <span className="leise" style={{ fontSize: 15, fontWeight: 700 }}>{t('mitarbeiter.fortschritt', { n: erledigt, von: bereiche.length })}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bereiche.length}, minmax(0,1fr))`, gap: 6 }} aria-hidden="true">
            {zustaende.map(({ b, z }) => <div key={b.id} style={{ height: 8, borderRadius: 4, background: z.art === 'fertig' ? 'var(--gruen)' : 'var(--leer)' }} />)}
          </div>
        </div>
      )}

      <div className="stapel">
        {zustaende.map(({ b, z }, i) => {
          const istNaechster = naechster?.b.id === b.id;
          if (istNaechster) {
            return (
              <button key={b.id} className="bereich-jetzt einblenden" style={{ animationDelay: `${0.08 + i * 0.04}s` }} onClick={() => geheZu(`/scan/${b.id}`)}>
                <span className="icon-rund" style={{ width: 60, height: 60, borderRadius: 30, background: 'rgba(255,255,255,.2)', color: '#fff' }}><Icon name={b.art} groesse={30} /></span>
                <span className="mitte">
                  <span className="etikett" style={{ opacity: 0.9 }}>{t('mitarbeiter.jetzt_dran')}</span>
                  <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.3 }}>{name(b.namen)}</span>
                </span>
                <span className="kamera-puls"><Icon name="kamera" groesse={34} /></span>
              </button>
            );
          }
          return (
            <BereichKarte key={b.id} b={b} z={z} verzoegerung={0.08 + i * 0.04}
              nochmal={() => z.art === 'fehler' && abgleichen(api, z.lokal.lokal_id).catch(() => {})} />
          );
        })}
      </div>

      <a href="#/weggeworfen" className="glas knopf einblenden" style={{ alignSelf: 'center', minHeight: 52, borderRadius: 26, padding: '0 22px', fontSize: 17, background: 'var(--glas-bg)', animationDelay: '.2s' }}>
        <Icon name="muell" /> {t('mitarbeiter.weggeworfen')}
      </a>
    </main>
  );
}

function BereichKarte({ b, z, verzoegerung, nochmal }: { b: Bereich; z: Zustand; verzoegerung: number; nochmal(): void }) {
  const { t, name } = useT();
  const fertig = z.art === 'fertig';
  let unter: JSX.Element;
  let rechts: JSX.Element;
  let klick: (() => void) | undefined;
  if (z.art === 'fertig') {
    unter = <span style={{ color: 'var(--gruen-text)' }}>{t('mitarbeiter.erledigt', { zeit: z.zeit })}</span>;
    rechts = <span className="status-kreis gruen"><Icon name="haken" groesse={24} strich={3} /></span>;
  } else if (z.art === 'bestaetigen') {
    unter = <span style={{ color: 'var(--akzent)' }}>{t('mitarbeiter.bitte_bestaetigen')}</span>;
    rechts = <span className="status-kreis akzent"><Icon name="weiter" groesse={24} strich={3} spiegeln /></span>;
    klick = () => geheZu(`/bestaetigen/${z.scanId}`);
  } else if (z.art === 'wartet') {
    // Klare Anzeige, wenn im Kühlhaus kein Netz war
    unter = <span style={{ color: 'var(--gelb-text)' }}>{t('offline.wird_hochgeladen')}</span>;
    rechts = <span className="status-kreis gelb"><Icon name="hochladen" groesse={22} /></span>;
  } else if (z.art === 'fehler') {
    unter = <span style={{ color: 'var(--rot-text)' }}>{t('offline.fehler')}</span>;
    rechts = <span className="status-kreis rot"><Icon name="warnung" groesse={22} /></span>;
    klick = nochmal;
  } else {
    unter = <span className="leise">{t('mitarbeiter.offen')}</span>;
    rechts = <span className="status-kreis leer" />;
    klick = () => geheZu(`/scan/${b.id}`);
  }
  return (
    <button className={`bereich-karte einblenden ${fertig ? 'fertig' : 'glas'}`} style={{ animationDelay: `${verzoegerung}s` }} onClick={klick} disabled={!klick && !fertig} aria-disabled={!klick}>
      <span className="icon-rund gross" style={{ background: fertig ? 'var(--flaeche)' : 'rgba(255,255,255,.7)', color: fertig ? 'var(--text2)' : 'var(--text3)' }}><Icon name={b.art} groesse={28} /></span>
      <span className="mitte"><span style={{ fontSize: 20, fontWeight: 700 }}>{name(b.namen)}</span><span style={{ fontSize: 15, fontWeight: 600 }}>{unter}</span></span>
      {rechts}
    </button>
  );
}
