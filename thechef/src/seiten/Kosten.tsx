// KI-Kosten pro Scan und pro Betrieb (der Plattform-Admin sieht alle Betriebe).
import { useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { Fehler, KopfMitte, Laden } from '../ui/bausteine.tsx';

export function KostenSeite() {
  const { t, geldGenau, zahl } = useT();
  const { daten, fehler, laedt, nochmal } = useLaden((a) => a.kosten(new Date(Date.now() - 30 * 864e5).toISOString()));
  if (laedt && !daten) return <Laden />;
  const arten = new Map<string, { n: number; eur: number; ein: number; aus: number }>();
  const betriebe = new Map<string, number>();
  for (const k of daten ?? []) {
    const x = arten.get(k.art) ?? { n: 0, eur: 0, ein: 0, aus: 0 };
    x.n++; x.eur += k.kosten_eur; x.ein += k.tokens_ein; x.aus += k.tokens_aus;
    arten.set(k.art, x);
    betriebe.set(k.betrieb_id ?? '—', (betriebe.get(k.betrieb_id ?? '—') ?? 0) + k.kosten_eur);
  }
  const summe = [...arten.values()].reduce((s, x) => s + x.eur, 0);
  return (
    <main className="seite ohne-nav">
      <KopfMitte titel={t('kosten.titel')} ziel="/c/einstellungen" />
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <div className="wert-kachel gross"><span className="klein">{t('kosten.letzte_30')}</span><span className="zahl">{geldGenau(summe)}</span></div>
      <section className="karte" style={{ gap: 0, paddingTop: 6, paddingBottom: 6 }}>
        {[...arten.entries()].map(([art, x]) => (
          <div key={art} className="zeile">
            <span className="mitte"><span className="name">{t(`kosten.${art}`)}</span>
              <span className="klein">{t('kosten.zeile', { n: x.n, je: geldGenau(x.eur / x.n), tokens: zahl(Math.round((x.ein + x.aus) / x.n)) })}</span></span>
            <span className="menge">{geldGenau(x.eur)}</span>
          </div>
        ))}
        {arten.size === 0 && <p className="leise">{t('kosten.keine')}</p>}
      </section>
      {betriebe.size > 1 && (
        <section className="karte" style={{ gap: 0 }}>
          <strong>{t('kosten.je_betrieb')}</strong>
          {[...betriebe.entries()].map(([b, eur]) => <div key={b} className="zeile"><span className="mitte"><span className="klein">{b}</span></span><span className="menge">{geldGenau(eur)}</span></div>)}
        </section>
      )}
      <p className="leise" style={{ fontSize: 13, margin: 0 }}>{t('kosten.hinweis')}</p>
    </main>
  );
}
