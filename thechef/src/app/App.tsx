// Einstieg: Daten-Schnittstelle wählen, Sitzung laden, Sprache, Darstellung, Seiten.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Sprache } from '../../supabase/functions/_shared/logik/typen.ts';
import { demoApi } from '../daten/demo.ts';
import { supabaseApi } from '../daten/supabase.ts';
import type { Api, Sitzung } from '../daten/api.ts';
import { SprachRahmen } from '../i18n/i18n.tsx';
import { abgleichStarten } from '../lib/abgleich.ts';
import { darstellungAnwenden } from '../lib/darstellung.ts';
import { geheZu, usePfad } from '../lib/router.ts';
import { speicherSichern } from '../lib/warteschlange.ts';
import { AppRahmen } from './kontext.tsx';
import { Splash, splashGesehen } from '../seiten/Splash.tsx';
import { SpracheWaehlen } from '../seiten/SpracheWaehlen.tsx';
import { Anmelden } from '../seiten/Anmelden.tsx';
import { Einrichtung } from '../seiten/Einrichtung.tsx';
import { MitarbeiterStart } from '../seiten/MitarbeiterStart.tsx';
import { ScanSeite } from '../seiten/Scan.tsx';
import { Bestaetigen } from '../seiten/Bestaetigen.tsx';
import { Gespeichert } from '../seiten/Gespeichert.tsx';
import { WeggeworfenSeite } from '../seiten/Weggeworfen.tsx';
import { AssistentStart } from '../seiten/Assistent.tsx';
import { Gespraech } from '../seiten/Gespraech.tsx';
import { BestandSeite } from '../seiten/Bestand.tsx';
import { EinkaufSeite } from '../seiten/Einkauf.tsx';
import { VerlustSeite } from '../seiten/Verlust.tsx';
import { Einstellungen } from '../seiten/Einstellungen.tsx';
import { Katalog } from '../seiten/Katalog.tsx';
import { Team } from '../seiten/Team.tsx';
import { Genauigkeit } from '../seiten/Genauigkeit.tsx';
import { KostenSeite } from '../seiten/Kosten.tsx';
import { Installieren } from '../seiten/Installieren.tsx';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function lokaleSprache(): Sprache | null {
  try { return (localStorage.getItem('thechef-sprache') as Sprache) || null; } catch { return null; }
}

export function App() {
  const api: Api = useMemo(() => (URL_ && KEY ? supabaseApi(URL_, KEY) : demoApi()), []);
  const [sitzung, setSitzung] = useState<Sitzung | null | undefined>(undefined);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [splash, setSplash] = useState(true);
  // Einmal beim Laden festhalten – der Splash setzt den Merker sofort, sonst würde er sich selbst verkürzen.
  const [ersterStart] = useState(() => !splashGesehen());
  const [sprache, setSprache] = useState<Sprache | null>(lokaleSprache);
  const pfad = usePfad();

  const splashFertig = useCallback(() => setSplash(false), []);
  const neuLaden = useCallback(async () => {
    try {
      setSitzung(await api.sitzung());
      setLadeFehler(null);
    } catch (e) {
      setLadeFehler(String((e as Error).message ?? e));
      setSitzung(null);
    }
  }, [api]);

  useEffect(() => { neuLaden(); }, [neuLaden]);
  useEffect(() => { speicherSichern(); return abgleichStarten(api); }, [api]);

  const nutzer = sitzung?.art === 'fertig' ? sitzung.nutzer : null;
  const aktiveSprache: Sprache = nutzer?.sprache ?? sprache ?? 'de';

  useEffect(() => {
    // Mitarbeiter-Ansicht standardmäßig hell (helle Küche), Chef folgt dem System.
    darstellungAnwenden(nutzer?.darstellung ?? {}, nutzer?.rolle === 'chef' ? 'auto' : 'hell');
  }, [nutzer?.darstellung, nutzer?.rolle]);

  function spracheGewaehlt(s: Sprache) {
    try { localStorage.setItem('thechef-sprache', s); } catch { /* egal */ }
    setSprache(s);
    if (nutzer) api.profilAendern({ sprache: s }).then(neuLaden);
  }

  let inhalt: JSX.Element;
  if (splash) inhalt = <Splash ersterStart={ersterStart} fertig={splashFertig} />;
  else if (sitzung === undefined) inhalt = <div className="laden-voll"><div className="laden" /></div>;
  else if (!sprache && !nutzer) inhalt = <SpracheWaehlen weiter={spracheGewaehlt} />;
  else if (pfad[0] === 'sprache') inhalt = <SpracheWaehlen weiter={(s) => { spracheGewaehlt(s); geheZu(nutzer?.rolle === 'chef' ? '/c/einstellungen' : '/m', true); }} />;
  else if (!sitzung || sitzung.art !== 'fertig') inhalt = <Anmelden sitzung={sitzung} fehler={ladeFehler} />;
  else inhalt = <Seiten rolle={sitzung.nutzer.rolle} pfad={pfad} />;

  return (
    <SprachRahmen sprache={aktiveSprache}>
      <AppRahmen api={api} sitzung={sitzung ?? null} neuLaden={neuLaden}>
        {api.demo && <DemoBand />}
        {inhalt}
      </AppRahmen>
    </SprachRahmen>
  );
}

function DemoBand() {
  useEffect(() => { document.documentElement.dataset.demo = '1'; }, []);
  return <div className="demo-band" role="note">DEMO · KEINE ECHTE KI · DATEN NUR AUF DIESEM GERÄT</div>;
}

function Seiten({ rolle, pfad }: { rolle: 'chef' | 'mitarbeiter'; pfad: string[] }) {
  const [a, b, c] = pfad;
  const chef = rolle === 'chef';

  // Mitarbeiter-Wege (auch der Chef kann scannen)
  if (a === 'm' || (!a && !chef)) return <MitarbeiterStart />;
  if (a === 'scan' && b) return <ScanSeite bereichId={b} />;
  if (a === 'bestaetigen' && b) return <Bestaetigen scanId={b} />;
  if (a === 'gespeichert' && b) return <Gespeichert scanId={b} anzahl={Number(c ?? 0)} />;
  if (a === 'weggeworfen') return <WeggeworfenSeite />;
  if (a === 'installieren') return <Installieren />;

  if (!chef) return <MitarbeiterStart />;
  if (a === 'einrichtung') return <Einrichtung schritt={b} />;
  if (!a) return <AssistentStart />;
  if (a === 'c') {
    switch (b) {
      case undefined: return <AssistentStart />;
      case 'frage': return <Gespraech />;
      case 'bestand': return <BestandSeite />;
      case 'einkauf': return <EinkaufSeite />;
      case 'verlust': return <VerlustSeite />;
      case 'einstellungen': return <Einstellungen />;
      case 'katalog': return <Katalog teil={c} />;
      case 'team': return <Team />;
      case 'genauigkeit': return <Genauigkeit />;
      case 'kosten': return <KostenSeite />;
    }
  }
  return <AssistentStart />;
}
