// Main.dc.html – die Bereiche des Tages als große Karten.
// Der nächste offene Bereich ist hervorgehoben und startet mit EINEM Tipp den Scan.
import { useEffect, useState } from 'react';
import { tagIn } from '../../supabase/functions/_shared/logik/lager.ts';
import type { Bereich, Scan } from '../../supabase/functions/_shared/logik/typen.ts';
import { useApp, useIch, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { abonnieren, abgleichen, wegAbgleichen, wegAbonnieren, wegMelden } from '../lib/abgleich.ts';
import { geheZu } from '../lib/router.ts';
import { wegEntfernen, wegAktualisieren, type WarteScan, type WarteWeg } from '../lib/warteschlange.ts';
import { Fehler, Laden } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

type Zustand = { art: 'fertig'; zeit: string } | { art: 'bestaetigen'; scanId: string } | { art: 'wartet' } | { art: 'fehler'; lokal: WarteScan } | { art: 'offen' };

export function MitarbeiterStart() {
  const { t, name, uhrzeit, sprache } = useT();
  const { nutzer, betrieb } = useIch();
  const { api } = useApp();
  const [warte, setWarte] = useState<WarteScan[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [wegWarte, setWegWarte] = useState<WarteWeg[]>([]);
  useEffect(() => abonnieren(setWarte), []);
  useEffect(() => wegAbonnieren(setWegWarte), []);
  useEffect(() => {
    const an = () => setOnline(true), aus = () => setOnline(false);
    addEventListener('online', an); addEventListener('offline', aus);
    return () => { removeEventListener('online', an); removeEventListener('offline', aus); };
  }, []);

  const heute = tagIn(betrieb.zeitzone);
  const gestern = new Date(Date.now() - 36 * 3600e3).toISOString();
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => ({
    bereiche: await a.bereiche(),
    positionen: await a.positionen(),
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
  const stellen = (id: string) => (daten?.positionen ?? []).filter((p) => p.bereich_id === id).length;
  const wochentag = t(`tag.${new Date(`${heute}T12:00:00Z`).getUTCDay()}`);

  return (
    <main className="seite ohne-nav">
      <div className="kopf einblenden" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div className="etikett leise" style={{ letterSpacing: 1.2 }}>{betrieb.name} · {wochentag}</div>
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
      <WegWartet liste={wegWarte} />

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
            {zustaende.map(({ b, z }) => <div key={b.id} className={`fortschritt-teil ${z.art === 'fertig' ? 'fertig' : naechster?.b.id === b.id ? 'dran' : ''}`} />)}
          </div>
        </div>
      )}

      <div className="stapel">
        {zustaende.map(({ b, z }, i) => {
          const istNaechster = naechster?.b.id === b.id;
          if (istNaechster) {
            const n = stellen(b.id);
            return (
              // Main.dc.html: Kopf mit Name + Umfang, darunter EIN großer weißer Knopf.
              <button key={b.id} className="bereich-jetzt einblenden" style={{ animationDelay: `${0.08 + i * 0.04}s` }} onClick={() => geheZu(`/scan/${b.id}`)}>
                <span className="reihe" style={{ alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                  <span className="mitte">
                    <span className="etikett" style={{ opacity: 0.9 }}>{t('mitarbeiter.jetzt_dran')}</span>
                    <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.4 }}>{name(b.namen)}</span>
                    {n > 0 && <span style={{ fontSize: 15, opacity: 0.88 }}>{t('mitarbeiter.stellen', { n })} · {t('mitarbeiter.dauer', { n })}</span>}
                  </span>
                  <span className="icon-rund" style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,.18)', color: '#fff' }}><Icon name={b.art} groesse={22} /></span>
                </span>
                <span className="scan-starten"><Icon name="kamera" groesse={22} /> {t('mitarbeiter.scan_starten')}</span>
              </button>
            );
          }
          return (
            <BereichKarte key={b.id} b={b} z={z} stellen={stellen(b.id)} verzoegerung={0.08 + i * 0.04}
              nochmal={() => z.art === 'fehler' && abgleichen(api, z.lokal.lokal_id).catch(() => {})} />
          );
        })}
      </div>

      <a href="#/weggeworfen" className="knopf weg-knopf einblenden" style={{ animationDelay: '.2s' }}>
        <Icon name="muell" /> {t('mitarbeiter.etwas_weg')}
      </a>
    </main>
  );
}

function BereichKarte({ b, z, stellen, verzoegerung, nochmal }: { b: Bereich; z: Zustand; stellen: number; verzoegerung: number; nochmal(): void }) {
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
    unter = <span className="leise">{t('mitarbeiter.offen')}{stellen > 0 && ` · ${t('mitarbeiter.stellen', { n: stellen })}`}</span>;
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

/** Weggeworfen-Meldungen, die noch auf dem Handy liegen – nie still. */
function WegWartet({ liste }: { liste: WarteWeg[] }) {
  const { t, name, einheit } = useT();
  const { api } = useApp();
  const { daten: produkte } = useLaden((a) => a.produkte(), [liste.length > 0]);
  const wartet = liste.filter((w) => !w.fehler);
  const kaputt = liste.filter((w) => w.fehler);
  if (!liste.length) return null;
  const wer = (w: WarteWeg) => produkte?.find((p) => p.id === w.produkt_id);
  return (
    <>
      {wartet.length > 0 && <div className="meldung warnung" role="status"><Icon name="hochladen" />{t('weg.warten', { n: wartet.length })}</div>}
      {kaputt.map((w) => (
        <div key={w.lokal_id} className="meldung fehler" role="alert" style={{ flexWrap: 'wrap' }}>
          <Icon name="warnung" />
          <span style={{ flex: 1, minWidth: 0 }}>{t('weg.fehler', { produkt: name(wer(w)?.namen), menge: `${w.menge} ${einheit(wer(w)?.zaehleinheit ?? 'stueck', w.menge)}` })} <span style={{ opacity: 0.75 }}>({w.fehler})</span></span>
          <span className="reihe" style={{ gap: 6 }}>
            <button className="knopf klein" onClick={async () => { await wegAktualisieren(w.lokal_id, { fehler: undefined }); await wegAbgleichen(api).catch(() => {}); }}>{t('allg.nochmal')}</button>
            <button className="knopf klein" onClick={async () => { await wegEntfernen(w.lokal_id); await wegMelden(); }}>{t('weg.verwerfen')}</button>
          </span>
        </div>
      ))}
    </>
  );
}
