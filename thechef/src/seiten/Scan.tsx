// Scan.dc.html – Kamera, Position für Position.
//
// GEISTERBILD: das letzte Foto dieser Position liegt halb durchsichtig über
// der Kamera. Gleicher Winkel → genauere Erkennung, Vergleich möglich.
// Jedes Foto landet SOFORT auf dem Gerät (IndexedDB) – erst dann im Netz.
import { useEffect, useRef, useState } from 'react';
import type { Position } from '../../supabase/functions/_shared/logik/typen.ts';
import { useApp, useFehlerText, useIch, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { abgleichen } from '../lib/abgleich.ts';
import { SCAN_KANTE, verkleinern } from '../lib/bild.ts';
import { bildHelligkeit, blobHelligkeit, zuDunkel } from '../lib/bildpruefung.ts';
import { haptik } from '../lib/geraet.ts';
import { kameraStarten, type Kamera } from '../lib/kamera.ts';
import { geheZu } from '../lib/router.ts';
import { fotoLoeschen, fotoSpeichern, geisterbild, scanAnlegen, scanAktualisieren } from '../lib/warteschlange.ts';
import { Laden } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

type Foto = { id: string; position_id: string | null; url: string };

export function ScanSeite({ bereichId }: { bereichId: string }) {
  const { t, name } = useT();
  const { api } = useApp();
  const { betrieb } = useIch();
  const fehlerText = useFehlerText();
  const video = useRef<HTMLVideoElement>(null);
  const kamera = useRef<Kamera | null>(null);
  const lokalId = useRef(`${bereichId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const angelegt = useRef(false);
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [lampe, setLampe] = useState(false);
  const [kannLampe, setKannLampe] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [posIndex, setPosIndex] = useState(0);
  const [geist, setGeist] = useState<string | null>(null);
  const [geistAn, setGeistAn] = useState(true);
  const [blitz, setBlitz] = useState(false);
  const [phase, setPhase] = useState<'kamera' | 'erkennt' | 'offline'>('kamera');
  const [erkennFehler, setErkennFehler] = useState<string | null>(null);
  // Letztes Foto zu dunkel? Sofort sagen – nicht erst nach dem Hochladen.
  const [dunkel, setDunkel] = useState(false);
  // Ausweichweg, wenn die Live-Kamera nicht geht: die Kamera-App des Handys.
  const kameraApp = useRef<HTMLInputElement>(null);

  const { daten } = useLaden(async (a) => {
    const [bereiche, positionen] = await Promise.all([a.bereiche(), a.positionen()]);
    return { bereich: bereiche.find((b) => b.id === bereichId) ?? null, positionen: positionen.filter((p) => p.bereich_id === bereichId) };
  }, [bereichId]);
  const positionen: Position[] = daten?.positionen ?? [];
  const position = positionen[posIndex] ?? null;

  // Kamera an
  useEffect(() => {
    let aus = false;
    if (!video.current) return;
    kameraStarten(video.current)
      .then((k) => { if (aus) { k.stopp(); return; } kamera.current = k; setKannLampe(k.taschenlampe); })
      .catch((e) => setKameraFehler(e?.name === 'NotAllowedError' ? t('scan.kamera_verweigert') : t('scan.kamera_fehler')));
    return () => { aus = true; kamera.current?.stopp(); kamera.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geisterbild: eigenes letztes Foto (offline) → letztes Foto im Netz → Referenzfoto
  useEffect(() => {
    let aus = false;
    let objektUrl: string | null = null;
    setGeist(null);
    if (!position) return;
    (async () => {
      const lokal = await geisterbild(position.id, betrieb.foto_loeschfrist_tage).catch(() => null);
      if (lokal) { objektUrl = URL.createObjectURL(lokal); if (!aus) setGeist(objektUrl); return; }
      const netz = await api.letztesFotoUrl(position.id).catch(() => null);
      if (netz) { if (!aus) setGeist(netz); return; }
      if (position.referenzfoto_pfad) { const r = await api.bildUrl(position.referenzfoto_pfad).catch(() => null); if (!aus) setGeist(r); }
    })();
    return () => { aus = true; if (objektUrl) URL.revokeObjectURL(objektUrl); };
  }, [api, position, betrieb.foto_loeschfrist_tage]);

  async function ausloesen() {
    const k = kamera.current;
    // Live-Kamera geht nicht → Kamera-App des Handys; startet sie noch → warten.
    if (!k) { if (kameraFehler) kameraApp.current?.click(); return; }
    haptik(15);
    setBlitz(true);
    setTimeout(() => setBlitz(false), 180);
    const roh = k.foto();
    setDunkel(zuDunkel(bildHelligkeit(roh)));
    await fotoAufnehmen(roh);
  }

  async function ausKameraApp(datei: File | undefined) {
    if (!datei) return;
    setDunkel(zuDunkel(await blobHelligkeit(datei).catch(() => 255)));
    await fotoAufnehmen(datei);
  }

  async function fotoAufnehmen(quelle: HTMLCanvasElement | Blob) {
    const { blob, breite, hoehe } = await verkleinern(quelle, SCAN_KANTE);
    const id = crypto.randomUUID();
    if (!angelegt.current) {
      await scanAnlegen({ lokal_id: lokalId.current, bereich_id: bereichId, aufgenommen_am: new Date().toISOString() });
      angelegt.current = true;
    }
    await fotoSpeichern(lokalId.current, { id, position_id: position?.id ?? null, blob, breite, hoehe, aufgenommen_am: new Date().toISOString() });
    setFotos((f) => [...f, { id, position_id: position?.id ?? null, url: URL.createObjectURL(blob) }]);
  }

  async function letztesWeg() {
    const f = fotos.at(-1);
    if (!f) return;
    await fotoLoeschen(f.id);
    setFotos((l) => l.slice(0, -1));
  }

  async function fertig() {
    // Noch Positionen offen? → zur nächsten
    if (posIndex < positionen.length - 1) { setPosIndex((i) => i + 1); return; }
    await scanAktualisieren(lokalId.current, { status: 'lokal' });
    kamera.current?.stopp();
    if (!navigator.onLine) { setPhase('offline'); return; }
    setPhase('erkennt');
    try {
      const scanId = await abgleichen(api, lokalId.current);
      if (scanId) geheZu(`/bestaetigen/${scanId}`, true);
    } catch (e) {
      // Nicht verloren: der Scan liegt auf dem Gerät und wird später erneut versucht.
      setErkennFehler(fehlerText(e));
    }
  }

  if (phase === 'erkennt') {
    return (
      <main className="seite ohne-nav">
        {erkennFehler ? (
          <>
            <div className="meldung fehler" role="alert"><Icon name="warnung" /><div>{t('scan.erkennen_fehler')}<br /><small>{erkennFehler}</small></div></div>
            <div className="meldung info"><Icon name="hochladen" />{t('scan.liegt_auf_geraet')}</div>
            <div className="fuss-knoepfe">
              <button className="knopf-haupt" onClick={() => { setErkennFehler(null); fertig(); }}>{t('allg.nochmal')}</button>
              <a className="knopf leise" href="#/m">{t('allg.spaeter')}</a>
            </div>
          </>
        ) : <Laden text={t('scan.schaue_an')} />}
      </main>
    );
  }
  if (phase === 'offline') {
    return (
      <main className="seite ohne-nav" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div className="status-kreis gelb" style={{ width: 96, height: 96, borderRadius: 48, alignSelf: 'center' }}><Icon name="offline" groesse={44} /></div>
        <h1 className="titel">{t('offline.titel')}</h1>
        <p className="leise" style={{ fontSize: 18, margin: 0 }}>{t('offline.wird_hochgeladen_lang')}</p>
        <div className="fuss-knoepfe"><a className="knopf-haupt" href="#/m">{t('allg.weiter')}</a></div>
      </main>
    );
  }

  const fotosHier = fotos.filter((f) => f.position_id === (position?.id ?? null)).length;
  return (
    <main className="scan">
      <video ref={video} className="scan-video" playsInline muted />
      {geist && geistAn && <img className="geisterbild" src={geist} alt="" aria-hidden="true" />}
      {blitz && <div className="scan-blitz" />}

      <div className="scan-oben">
        <a className="scan-glas scan-rund" href="#/m" aria-label={t('allg.schliessen')}><Icon name="x" strich={2.4} /></a>
        <div className="scan-glas scan-pille">
          {name(daten?.bereich?.namen)}{position && <> · {name(position.namen)}</>}
          {positionen.length > 1 && <span style={{ opacity: 0.7 }}>&nbsp;{posIndex + 1}/{positionen.length}</span>}
        </div>
        {kannLampe ? (
          <button className={`scan-glas scan-rund ${lampe ? 'an' : ''}`} aria-pressed={lampe} aria-label={t('scan.lampe')}
            onClick={async () => { const ok = await kamera.current?.lampe(!lampe); if (ok) setLampe(!lampe); }}>
            <Icon name="blitz" />
          </button>
        ) : <span style={{ width: 44 }} />}
      </div>

      <input ref={kameraApp} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { ausKameraApp(e.target.files?.[0]); e.target.value = ''; }} />
      {kameraFehler ? (
        <div className="scan-hinweis">
          <div className="meldung fehler" role="alert"><Icon name="warnung" /><div>{kameraFehler}<br /><small>{t('scan.kamera_app')}</small></div></div>
          {dunkel && <div className="meldung warnung" role="status" style={{ marginTop: 8 }}><Icon name="warnung" />{t('scan.zu_dunkel')}</div>}
        </div>
      ) : dunkel ? (
        <div className="scan-hinweis"><div className="meldung warnung" role="status"><Icon name="warnung" />{kannLampe && !lampe ? t('scan.zu_dunkel_lampe') : t('scan.zu_dunkel')}</div></div>
      ) : (
        <div className="scan-hinweis">
          {geist ? t('scan.geist_hinweis') : t('scan.hinweis')}
          {geist && (
            <button className="scan-glas" style={{ marginTop: 10, minHeight: 36, padding: '0 14px', borderRadius: 18, color: '#fff', fontSize: 14, fontWeight: 700 }}
              aria-pressed={geistAn} onClick={() => setGeistAn(!geistAn)}>
              {geistAn ? t('scan.geist_aus') : t('scan.geist_an')}
            </button>
          )}
        </div>
      )}

      <div className="scan-glas scan-leiste">
        <button className="scan-vorschau" onClick={letztesWeg} disabled={!fotos.length} aria-label={t('scan.letztes_weg')}>
          {fotos.at(-1) ? <img src={fotos.at(-1)!.url} alt="" /> : <span />}
          <span>{t('scan.fotos', { n: fotosHier })}</span>
        </button>
        <button className="scan-ausloeser" aria-label={t('scan.foto')} onClick={ausloesen}><span /></button>
        <button className="scan-fertig" onClick={fertig} disabled={fotosHier === 0}>
          {posIndex < positionen.length - 1 ? t('scan.naechste') : t('scan.fertig')}
        </button>
      </div>
      {!daten && <div style={{ position: 'absolute', inset: 0 }}><Laden /></div>}
    </main>
  );
}
