// Wiederverwendbare Bausteine.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Kategorie, Produkt } from '../../supabase/functions/_shared/logik/typen.ts';
import { zahlLesen } from '../../supabase/functions/_shared/logik/zahlen.ts';
import { useApp, useFehlerText } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { aufnehmen, type Aufnahme } from '../lib/mikrofon.ts';
import { haptik } from '../lib/geraet.ts';
import { geheZu, zurueck } from '../lib/router.ts';
import { Icon } from './Icon.tsx';

// ─────────────────────────────── Produktbild

const EMOJI: Record<Kategorie, string> = {
  fleisch: '🍗', fisch: '🐟', gemuese: '🥬', obst: '🍎', milch: '🥛', brot: '🫓', tiefkuehl: '🧊', trocken: '🌾', getraenke: '🥤', sonstiges: '📦',
};
const EMOJI_NAME: Array<[RegExp, string]> = [
  [/tomat|domates/i, '🍅'], [/pommes|fries|patates/i, '🍟'], [/döner|doner|şiş/i, '🥙'], [/joghurt|yoğurt|yogh/i, '🥛'],
  [/salat|marul|lettuce/i, '🥬'], [/hähnchen|tavuk|chicken/i, '🍗'], [/käse|peynir|cheese/i, '🧀'], [/zwiebel|soğan|onion/i, '🧅'],
];
export function produktEmoji(p: Pick<Produkt, 'kategorie' | 'namen'>) {
  const n = p.namen.de ?? p.namen.en ?? '';
  return EMOJI_NAME.find(([r]) => r.test(n))?.[1] ?? EMOJI[p.kategorie] ?? '📦';
}

/** Katalogfoto, sonst Symbol der Kategorie. Mit Ausschnitt (box) aus einem Scan-Foto. */
export function ProduktBild({ produkt, groesse = '', url, box }: {
  produkt: Pick<Produkt, 'kategorie' | 'namen' | 'referenzfoto_pfad'>; groesse?: '' | 'mittel' | 'gross'; url?: string | null;
  box?: { x: number; y: number; b: number; h: number } | null;
}) {
  const { api } = useApp();
  const [katalog, setKatalog] = useState<string | null>(null);
  useEffect(() => {
    let aus = false;
    if (!url && produkt.referenzfoto_pfad) api.bildUrl(produkt.referenzfoto_pfad).then((u) => !aus && setKatalog(u)).catch(() => {});
    return () => { aus = true; };
  }, [api, url, produkt.referenzfoto_pfad]);
  const quelle = url ?? katalog;
  if (quelle && box) {
    // Ausschnitt: das Foto so skalieren und verschieben, dass nur die Box zu sehen ist
    const sx = 100 / Math.max(box.b, 0.05), sy = 100 / Math.max(box.h, 0.05);
    const px = box.b >= 1 ? 0 : (box.x / (1 - box.b)) * 100, py = box.h >= 1 ? 0 : (box.y / (1 - box.h)) * 100;
    return <span className={`produktbild ${groesse}`} style={{ backgroundImage: `url("${quelle}")`, backgroundSize: `${sx}% ${sy}%`, backgroundPosition: `${px}% ${py}%` }} />;
  }
  if (quelle) return <span className={`produktbild ${groesse}`} style={{ backgroundImage: `url("${quelle}")` }} />;
  return <span className={`produktbild ${groesse}`} aria-hidden="true">{produktEmoji(produkt)}</span>;
}

// ─────────────────────────────── Kopf

export function ZurueckKnopf({ ziel }: { ziel: string }) {
  const { t } = useT();
  return (
    <button className="glas glas-knopf" aria-label={t('allg.zurueck')} onClick={() => zurueck(ziel)}>
      <Icon name="zurueck" strich={2.4} spiegeln />
    </button>
  );
}

export function KopfMitte({ titel, ziel, rechts }: { titel: string; ziel: string; rechts?: ReactNode }) {
  return (
    <div className="kopf-mitte einblenden">
      <ZurueckKnopf ziel={ziel} />
      <div className="mitte">{titel}</div>
      {rechts ?? <span />}
    </div>
  );
}

// ─────────────────────────────── Zustände

export function Laden({ text }: { text?: string }) {
  return <div className="laden-voll" aria-busy="true"><div className="laden" />{text}</div>;
}

export function Fehler({ fehler, nochmal }: { fehler: unknown; nochmal?: () => void }) {
  const text = useFehlerText();
  const { t } = useT();
  return (
    <div className="meldung fehler" role="alert">
      <Icon name="warnung" />
      <div style={{ flex: 1 }}>
        {text(fehler)}
        {nochmal && <div><button className="knopf klein" style={{ marginTop: 8 }} onClick={nochmal}>{t('allg.nochmal')}</button></div>}
      </div>
    </div>
  );
}

// ─────────────────────────────── Sheet

export function Sheet({ offen, zu, children, titel }: { offen: boolean; zu(): void; children: ReactNode; titel?: string }) {
  useEffect(() => {
    if (!offen) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && zu();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [offen, zu]);
  if (!offen) return null;
  return (
    <div className="sheet-hinter" onClick={(e) => e.target === e.currentTarget && zu()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={titel}>
        <div className="griff" />
        {titel && <h3>{titel}</h3>}
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────── Mikrofon

/**
 * Großer Mikrofon-Knopf: antippen = aufnehmen, nochmal = fertig.
 * Die Umwandlung passiert auf dem Server; das Ergebnis geht an onText.
 */
export function MikroKnopf({ onText, gross, label }: { onText(text: string): void; gross?: boolean; label?: string }) {
  const { api, toast } = useApp();
  const { t, sprache } = useT();
  const fehlerText = useFehlerText();
  const [zustand, setZustand] = useState<'bereit' | 'aufnahme' | 'wandelt'>('bereit');
  const rec = useRef<Aufnahme | null>(null);
  const start = useRef(0);
  useEffect(() => () => rec.current?.abbrechen(), []);

  async function tippen() {
    if (zustand === 'wandelt') return;
    if (zustand === 'aufnahme') {
      setZustand('wandelt');
      try {
        const blob = await rec.current!.stopp();
        const r = await api.spracheZuText(blob, sprache, (Date.now() - start.current) / 1000);
        if (!r.text.trim()) toast(t('sprache.nichts_verstanden'));
        else onText(r.text);
      } catch (e) {
        toast(fehlerText(e));
      } finally {
        rec.current = null;
        setZustand('bereit');
      }
      return;
    }
    try {
      rec.current = await aufnehmen();
      start.current = Date.now();
      haptik();
      setZustand('aufnahme');
    } catch (e) {
      toast(fehlerText(e));
    }
  }
  const text = zustand === 'aufnahme' ? t('sprache.fertig') : zustand === 'wandelt' ? t('sprache.wandelt') : (label ?? t('sprache.sprechen'));
  return (
    <button type="button" className={`mikro ${gross ? 'gross' : ''} ${zustand === 'aufnahme' ? 'aufnahme' : ''}`} aria-label={text} title={text} onClick={tippen}>
      {zustand === 'wandelt' ? <span className="laden" style={{ width: 22, height: 22, borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> : zustand === 'aufnahme' ? <Icon name="haken" groesse={gross ? 32 : 26} strich={2.6} /> : <Icon name="mikro" groesse={gross ? 32 : 26} />}
    </button>
  );
}

// ─────────────────────────────── Zahl eingeben (+/−, tippen, sagen)

export function ZahlEingabe({ wert, setWert, einheit, schritt = 1, vorschlaege }: {
  wert: number; setWert(n: number): void; einheit: string; schritt?: number; vorschlaege?: number[];
}) {
  const { t, zahl } = useT();
  const [gehoert, setGehoert] = useState<{ text: string; zahl: number | null } | null>(null);
  const [tippt, setTippt] = useState(false);
  const runden = (x: number) => Math.max(0, Math.round(x * 100) / 100);
  return (
    <div className="stapel">
      <div className="karte" style={{ padding: 14, borderRadius: 28 }}>
        <div className="stepper">
          <button type="button" aria-label={t('allg.weniger')} onClick={() => { setWert(runden(wert - schritt)); haptik(8); }}>−</button>
          <div className="wert">
            {tippt ? (
              <input autoFocus inputMode="decimal" aria-label={einheit} defaultValue={String(wert)}
                onBlur={(e) => { const n = zahlLesen(e.target.value); if (n != null) setWert(runden(n)); setTippt(false); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            ) : (
              <button type="button" style={{ background: 'none', border: 'none', height: 'auto', width: '100%', padding: 0 }} aria-label={t('zahl.tippen')} onClick={() => setTippt(true)}>
                <span className="zahl">{zahl(wert)}</span>
              </button>
            )}
            <span className="einheit">{einheit}</span>
          </div>
          <button type="button" aria-label={t('allg.mehr')} onClick={() => { setWert(runden(wert + schritt)); haptik(8); }}>+</button>
        </div>
      </div>
      {vorschlaege && vorschlaege.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${vorschlaege.length}, minmax(0,1fr))`, gap: 8 }}>
          {vorschlaege.map((v) => (
            <button type="button" key={v} className="chip" style={{ justifyContent: 'center', minHeight: 52, borderRadius: 26, fontSize: 18, fontWeight: 700 }}
              aria-pressed={v === wert} onClick={() => setWert(v)}>{zahl(v)}</button>
          ))}
        </div>
      )}
      <div className="reihe" style={{ justifyContent: 'center' }}>
        <MikroKnopf label={t('zahl.sagen')} onText={(text) => { const n = zahlLesen(text); setGehoert({ text, zahl: n }); if (n != null) setWert(runden(n)); }} />
        <span className="leise" style={{ fontSize: 15, fontWeight: 600 }}>{t('zahl.oder_sagen')}</span>
      </div>
      {gehoert && (
        // Das Erkannte IMMER zeigen – gerade bei Kurmancî ist die Erkennung unsicher.
        <div className={`meldung ${gehoert.zahl == null ? 'warnung' : 'info'}`} role="status">
          <Icon name={gehoert.zahl == null ? 'warnung' : 'haken'} />
          <span>{gehoert.zahl == null ? t('zahl.nicht_verstanden', { text: gehoert.text }) : t('zahl.verstanden', { text: gehoert.text, zahl: zahl(gehoert.zahl) })}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────── Schalter / Umschalter

export function Schalter({ an, setAn, label }: { an: boolean; setAn(b: boolean): void; label: string }) {
  return <button type="button" role="switch" aria-checked={an} aria-label={label} className="schalter" onClick={() => setAn(!an)} />;
}

export function Umschalter<T extends string>({ wert, setWert, optionen, label }: { wert: T; setWert(v: T): void; optionen: Array<{ id: T; text: string }>; label: string }) {
  return (
    <div className="umschalter glas" role="group" aria-label={label}>
      {optionen.map((o) => <button type="button" key={o.id} aria-pressed={o.id === wert} onClick={() => setWert(o.id)}>{o.text}</button>)}
    </div>
  );
}

// ─────────────────────────────── Navigation Chef

export function ChefNavigation({ aktiv }: { aktiv: 'assistent' | 'bestand' | 'einkauf' | null }) {
  const { t } = useT();
  const [klein, setKlein] = useState(false);
  useEffect(() => {
    // Runter scrollen: Leiste schrumpft. Hoch: kommt zurück.
    let letzte = scrollY;
    const f = () => {
      const y = scrollY;
      if (Math.abs(y - letzte) > 8) { setKlein(y > letzte && y > 60); letzte = y; }
    };
    addEventListener('scroll', f, { passive: true });
    return () => removeEventListener('scroll', f);
  }, []);
  const tab = (id: 'assistent' | 'bestand' | 'einkauf', ziel: string, icon: string) => (
    <a href={`#${ziel}`} aria-current={aktiv === id ? 'page' : undefined}>
      <Icon name={icon} />
      {t(`nav.${id}`)}
    </a>
  );
  return (
    <>
      <nav className={`nav-leiste glas ${klein ? 'klein' : ''}`} aria-label={t('nav.titel')}>
        {tab('assistent', '/c', 'funkeln')}
        {tab('bestand', '/c/bestand', 'bestand')}
        {tab('einkauf', '/c/einkauf', 'einkauf')}
      </nav>
      <a className="scan-fab" href="#/m" aria-label={t('nav.scannen')} onClick={(e) => { e.preventDefault(); geheZu('/m'); }}>
        <Icon name="kamera" groesse={28} />
      </a>
    </>
  );
}

// ─────────────────────────────── MHD-Plakette

export function MhdPlakette({ tage, fehlt }: { tage: number | null; fehlt?: boolean }) {
  const { t, mhdText } = useT();
  if (tage != null && tage <= 0) return <span className="plakette rot">⚠ {mhdText(tage)}</span>;
  if (tage != null && tage <= 2) return <span className="plakette gelb">◷ {mhdText(tage)}</span>;
  if (fehlt) return <span className="plakette gelb">↓ {t('ampel.knapp_kurz')}</span>;
  if (tage != null && tage <= 5) return <span className="plakette grau">{mhdText(tage)}</span>;
  return null;
}
