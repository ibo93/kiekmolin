// App-weiter Zustand: Daten-Schnittstelle, Sitzung, kurze Meldungen.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Api, Sitzung } from '../daten/api.ts';
import { DatenFehler } from '../daten/api.ts';
import type { Betrieb, Nutzer } from '../../supabase/functions/_shared/logik/typen.ts';
import { useT } from '../i18n/i18n.tsx';

type App = {
  api: Api;
  sitzung: Sitzung | null;
  neuLaden(): Promise<void>;
  toast(text: string): void;
  /** Zähler, der nach jeder Änderung steigt – Seiten laden damit neu. */
  stand: number;
  geaendert(): void;
};

const K = createContext<App | null>(null);

export function AppRahmen({ api, sitzung, neuLaden, children }: { api: Api; sitzung: Sitzung | null; neuLaden(): Promise<void>; children: ReactNode }) {
  const [toastText, setToast] = useState<string | null>(null);
  const [stand, setStand] = useState(0);
  const timer = useRef<number>();
  const toast = useCallback((t: string) => {
    setToast(t);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  const geaendert = useCallback(() => setStand((s) => s + 1), []);
  return (
    <K.Provider value={{ api, sitzung, neuLaden, toast, stand, geaendert }}>
      {children}
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </K.Provider>
  );
}

export function useApp(): App {
  const k = useContext(K);
  if (!k) throw new Error('useApp außerhalb von AppRahmen');
  return k;
}

/** Nur innerhalb angemeldeter Seiten. */
export function useIch(): { nutzer: Nutzer; betrieb: Betrieb } {
  const { sitzung } = useApp();
  if (sitzung?.art !== 'fertig') throw new Error('nicht angemeldet');
  return sitzung;
}

/** Fehler in lesbaren Text – mit Detail, nie verschluckt. */
export function useFehlerText() {
  const { t } = useT();
  return (e: unknown) => {
    if (e instanceof DatenFehler) {
      const s = t(e.schluessel);
      return e.detail ? `${s} (${e.detail})` : s;
    }
    const m = String((e as Error)?.message ?? e);
    const bekannt = t(`fehler.${m}`);
    return bekannt.startsWith('fehler.') ? `${t('fehler.unbekannt')} (${m})` : bekannt;
  };
}

/** Daten laden mit Ladezustand und Fehler. Lädt neu, wenn sich etwas geändert hat. */
export function useLaden<T>(fn: (api: Api) => Promise<T>, abh: unknown[] = []) {
  const { api, stand } = useApp();
  const [daten, setDaten] = useState<T | null>(null);
  const [fehler, setFehler] = useState<unknown>(null);
  const [laedt, setLaedt] = useState(true);
  const [nr, setNr] = useState(0);
  useEffect(() => {
    let aus = false;
    setLaedt(true);
    fn(api)
      .then((d) => { if (!aus) { setDaten(d); setFehler(null); } })
      .catch((e) => { if (!aus) setFehler(e); })
      .finally(() => { if (!aus) setLaedt(false); });
    return () => { aus = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, stand, nr, ...abh]);
  return { daten, fehler, laedt, nochmal: () => setNr((n) => n + 1) };
}
