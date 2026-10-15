// Genauigkeit der Erkennung: erkannt vs. tatsächlich (vom Mitarbeiter bestätigt/gezählt).
// Das ist die Messung für den Test im ÖZ KEBAB – je Produkt und gesamt.
//
// Ehrlich: "bestätigt" ist nur dann "tatsächlich", wenn wirklich gezählt wurde.
// Deshalb der Genauigkeits-Test in den Einstellungen (blind zählen).
import { useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { Fehler, KopfMitte, Laden, ProduktBild } from '../ui/bausteine.tsx';

export function Genauigkeit() {
  const { t, name, zahl } = useT();
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => {
    const [zeilen, produkte] = await Promise.all([a.genauigkeit(new Date(Date.now() - 30 * 864e5).toISOString()), a.produkte()]);
    // je Scan & Produkt zusammenfassen (mehrere Fotos)
    const m = new Map<string, { produkt_id: string; erkannt: number; bestaetigt: number }>();
    for (const z of zeilen) {
      const k = `${z.scan_id}|${z.produkt_id}`;
      const x = m.get(k) ?? { produkt_id: z.produkt_id, erkannt: 0, bestaetigt: z.bestaetigt };
      x.erkannt += z.erkannt;
      m.set(k, x);
    }
    const faelle = [...m.values()];
    const je = new Map<string, { n: number; genau: number; fehler: number; summe: number }>();
    for (const f of faelle) {
      const x = je.get(f.produkt_id) ?? { n: 0, genau: 0, fehler: 0, summe: 0 };
      x.n++; x.summe += f.bestaetigt;
      if (Math.abs(f.erkannt - f.bestaetigt) < 0.01) x.genau++;
      x.fehler += Math.abs(f.erkannt - f.bestaetigt);
      je.set(f.produkt_id, x);
    }
    return {
      faelle: faelle.length,
      genau: faelle.filter((f) => Math.abs(f.erkannt - f.bestaetigt) < 0.01).length,
      uebersehen: faelle.filter((f) => f.erkannt === 0 && f.bestaetigt > 0).length,
      zeilen: [...je.entries()].map(([id, x]) => ({ p: produkte.find((p) => p.id === id), ...x })).filter((x) => x.p).sort((a, b) => a.genau / a.n - b.genau / b.n),
    };
  });
  if (laedt && !daten) return <Laden />;
  const quote = daten && daten.faelle ? Math.round((daten.genau / daten.faelle) * 100) : null;
  return (
    <main className="seite ohne-nav">
      <KopfMitte titel={t('genauigkeit.titel')} ziel="/c/einstellungen" />
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <p className="leise" style={{ margin: 0 }}>{t('genauigkeit.erklaerung')}</p>
      {daten && daten.faelle === 0 && <div className="meldung info">{t('genauigkeit.keine_daten')}</div>}
      {quote != null && (
        <div className="raster-3">
          <div className="wert-kachel"><span className="klein">{t('genauigkeit.genau')}</span><span className="zahl">{quote} %</span></div>
          <div className="wert-kachel"><span className="klein">{t('genauigkeit.gezaehlt')}</span><span className="zahl">{daten!.faelle}</span></div>
          <div className="wert-kachel"><span className="klein">{t('genauigkeit.uebersehen')}</span><span className="zahl">{daten!.uebersehen}</span></div>
        </div>
      )}
      {daten && daten.zeilen.length > 0 && (
        <section className="karte" style={{ gap: 0, paddingTop: 6, paddingBottom: 6 }}>
          {daten.zeilen.map((z) => (
            <div key={z.p!.id} className="zeile">
              <ProduktBild produkt={z.p!} />
              <span className="mitte"><span className="name">{name(z.p!.namen)}</span>
                <span className="klein">{t('genauigkeit.zeile', { genau: z.genau, n: z.n, abw: zahl(z.fehler / z.n) })}</span></span>
              <span className="menge zahl" style={{ color: z.genau / z.n >= 0.9 ? 'var(--gruen-text)' : z.genau / z.n >= 0.7 ? 'var(--gelb-text)' : 'var(--rot-text)' }}>{Math.round((z.genau / z.n) * 100)} %</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
